// main.js — Emberfall Heat: boot, the game loop, and every system wired
// together.
//
// The city (city.js) is generated once from a seed; the traffic (cars.js),
// the citizens (people.js), the police (police.js), the story (missions.js),
// the sound (audio.js) and the dressing (fx.js, hud.js) all meet here. This
// file owns the state machine — title, play, pause, map, mission select,
// busted, wasted — the camera, the crime ledger that turns witnessed
// misdeeds into stars, and the ?shot= scenes the screenshots are taken from.

import { generateCity, buildCityTiles, drawCityTiles, drawNightDetails, districtAt, DISTRICT_INFO, WORLD_W, WORLD_H, circleHitsSolid } from './city.js';
import { makeCar, spawnParkedCars, spawnTrafficCar, updatePlayerCar, updateTrafficCar, drawCar } from './cars.js';
import { makePedestrian, updatePedestrian, drawPedestrian, makePlayer, updatePlayerOnFoot, playerAttack, drawPlayer, scarePedestrian } from './people.js';
import { WantedSystem, PoliceForce } from './police.js';
import { STORY_MISSIONS, MissionRunner, RaceManager, RACE_COURSES, makeDelivery, placeOf } from './missions.js';
import { ParticleField, ScreenShake, SkidTrails, DayCycle } from './fx.js';
import { SoundEngine } from './audio.js';
import { loadSave, storeSave, wipeSave, defaultSave, respectTitle } from './save.js';
import { drawHUD, drawMinimap, drawDialogue, drawToasts, drawTitleScreen, drawMapScreen, drawMenuList, drawEndScreen, drawObjectiveBeacon } from './hud.js';
import { makeRng, clamp, distance } from './rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') ?? 20261119) || 20261119;

const city = generateCity(seed);
const tiles = buildCityTiles(city);
const rng = makeRng((Date.now() % 90000) + 7);
const fx = new ParticleField();
const shake = new ScreenShake();
const skids = new SkidTrails();
const day = new DayCycle(10 * 60 + 20);
const sound = new SoundEngine();
const wanted = new WantedSystem();
const police = new PoliceForce();
const runner = new MissionRunner();
const race = new RaceManager();

let save = loadSave();
sound.setMuted(save.muted);
const player = makePlayer(city.landmarks.loft.x + 40, city.landmarks.loft.y + 30);
let cars = spawnParkedCars(city, makeRng(seed + 5));
let peds = [];
let playerCar = null;
let markedCar = null;

let state = shotMode === 'map' ? 'map' : 'title';
let titleSelection = 0;
let pauseSelection = 0;
let missionSelection = 0;
let helpFrom = 'title';
let dialogueQueue = [];
let dialogueAfter = null;
let lastCrashHurtAt = 0;
let toasts = [];
let damageFlash = 0;
let timeSinceDamage = 99;
let endTimer = 0;
let camera = { x: player.x - VIEW_W / 2, y: player.y - VIEW_H / 2 };
let mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };
let keys = {};
let titlePan = 0;

// ---------------------------------------------------------------------------
// The world object the system modules share.
// ---------------------------------------------------------------------------

const world = {
  city,
  get cars() { return cars; },
  get peds() { return peds; },
  fx,
  sound,
  wanted,
  police,
  player,
  get playerCar() { return playerCar; },
  get playerPos() { return playerCar ?? player; },
  get playerVel() { return playerCar ? { x: playerCar.vx, y: playerCar.vy } : { x: 0, y: 0 }; },
  get playerSpeed() { return playerCar ? Math.abs(playerCar.speed) : player.speed; },
  get playerAngle() { return playerCar ? playerCar.angle : player.angle; },
  marker: null,
  onCrime(kind, x, y) {
    // A crime only becomes heat when somebody sees it: a citizen close by,
    // a cop in range, or the helicopter's light.
    let witnessed = !!police.helicopter;
    if (!witnessed) {
      for (const ped of peds) {
        if (ped.state !== 'down' && distance(ped.x, ped.y, x, y) < 230) { witnessed = true; break; }
      }
    }
    if (!witnessed) {
      for (const cop of police.cops) {
        if (distance(cop.x, cop.y, x, y) < 430) { witnessed = true; break; }
      }
    }
    if (witnessed) {
      const before = wanted.level;
      wanted.addCrime(kind);
      if (wanted.level > before) toast('Witnessed — the heat is rising!', '#ff8a7a');
    }
  },
  onCarCrash(car, severity, x, y) {
    sound.crash(severity);
    shake.add(severity * 0.5);
    fx.burstSparks(x, y, severity);
    if (car.driver === 'cop') world.onCrime('cop-hit', x, y);
    // The car takes the beating, not the driver: only a truly big hit gets
    // through to the player's health, and never twice in the same moment.
    const now = performance.now();
    if (car === playerCar && severity > 0.8 && now - lastCrashHurtAt > 650) {
      lastCrashHurtAt = now;
      hurtPlayer(severity * 3.5);
    }
  },
  onTrafficHit(car, byCar) {
    // The driver bails out and runs; the car is yours if you want it.
    const ped = makePedestrian(car.x + 24, car.y + 10, rng);
    scarePedestrian(ped, car.x, car.y, 6);
    peds.push(ped);
    car.driver = 'parked';
    car.vx = 0;
    car.vy = 0;
    if (byCar === playerCar) world.onCrime('hit-and-run', car.x, car.y);
  },
  onPedDown(ped, byCar) {
    fx.spawn(ped.x, ped.y, { count: 6, color: '#b03a3a', speed: 50, ttl: 0.5, size: 2.6 });
    if (byCar && byCar === playerCar) {
      shake.add(0.3);
      sound.crash(0.4);
      world.onCrime('hit-and-run', ped.x, ped.y);
    }
  },
  onCopShot(dist) {
    sound.gunshot();
    damageFlash = Math.max(damageFlash, 0.35);
    if (playerCar) {
      playerCar.health -= 1.5;
      if (Math.random() < 0.3) hurtPlayer(1.2);
    } else {
      hurtPlayer(4 + Math.random() * 3);
    }
    void dist;
  },
  onCopRam(speed) {
    shake.add(clamp(speed / 380, 0.1, 0.6));
    sound.crash(0.5);
  },
};

function hurtPlayer(amount) {
  if (state !== 'play') return;
  player.health -= amount;
  timeSinceDamage = 0;
  damageFlash = Math.max(damageFlash, 0.3);
  if (player.health <= 0) {
    player.health = 0;
    enterEndScreen('wasted');
  }
}

function toast(text, color = '#ffffff', seconds = 3.2) {
  toasts.push({ text, color, ttl: seconds });
  if (toasts.length > 4) toasts.shift();
}

// ---------------------------------------------------------------------------
// Mission events: what the runner asks the world to do.
// ---------------------------------------------------------------------------

const missionEvents = {
  say(lines) {
    dialogueQueue = lines.map(([speaker, text]) => ({ speaker, text }));
  },
  toast,
  setWanted(level) { wanted.forceLevel(level); },
  setTime(minutes) { day.minutes = minutes; },
  spawnMarkedCar(type, x, y) {
    markedCar = makeCar(type, x, y, -Math.PI / 2, rng);
    markedCar.driver = 'parked';
    markedCar.marked = true;
    cars.push(markedCar);
    return markedCar;
  },
  crime(kind) { wanted.addCrime(kind); },
  pickup(point) {
    sound.pickupChime();
    fx.burstPickupGlow(point.x, point.y);
    toast(`Collected: ${point.name}`, '#ffd76a');
  },
  missionComplete(mission, replay) {
    const cashPay = mission.isDelivery ? mission.deliveryPay : Math.round(mission.reward.cash * (replay ? 0.4 : 1));
    const respectPay = Math.round(mission.reward.respect * (replay ? 0.5 : 1));
    save.cash += cashPay;
    save.respect += respectPay;
    if (mission.isDelivery) save.deliveriesDone++;
    if (!replay && !mission.isDelivery) {
      if (!save.missionsDone.includes(mission.id)) save.missionsDone.push(mission.id);
      save.storyStage = Math.max(save.storyStage, STORY_MISSIONS.findIndex((m) => m.id === mission.id) + 1);
      if (mission.id === 'cannery-run' && !player.armed) {
        player.armed = true;
        player.ammo += 48;
        toast('Pistol unlocked — aim with the mouse, click to shoot', '#ffd76a', 4.5);
      }
    }
    sound.cashRegister();
    toast(`Mission complete: ${mission.title}  +${cashPay} · +${respectPay} respect`, '#7be495', 4.5);
    storeSave(save);
    if (markedCar) markedCar.marked = false;
    markedCar = null;
  },
  missionFailed(mission, reason) {
    toast(`Mission failed: ${reason}`, '#ff8a7a', 4);
    sound.blip(160, 0.25, 0.14, 'sawtooth');
    if (markedCar) {
      cars = cars.filter((c) => c !== markedCar);
      markedCar = null;
    }
  },
  checkpoint(n, total) {
    sound.blip(740 + n * 40, 0.08, 0.12);
    toast(`Checkpoint ${n}/${total}`, '#9fd8ff');
  },
  raceFinished(course, time) {
    const best = save.raceBests[course.id];
    const isBest = !best || time < best;
    if (isBest) save.raceBests[course.id] = time;
    const prize = isBest ? 300 : 150;
    save.cash += prize;
    save.respect += 10;
    storeSave(save);
    sound.cashRegister();
    toast(`${course.name}: ${time.toFixed(1)}s ${isBest ? '— new best!' : ''} +$${prize}`, '#7be495', 4.5);
  },
};

function nextStoryMission() {
  return STORY_MISSIONS[save.storyStage] ?? null;
}

function missionStartPlace(mission) {
  if (mission.giver === 'Dez') return city.landmarks.customs;
  if (mission.giver === 'Pia') return city.landmarks.diner;
  return city.landmarks.ashpit;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'handbrake',
};

window.addEventListener('keydown', (event) => {
  sound.ensure();
  const action = KEYMAP[event.code];
  if (action) {
    keys[action] = true;
    event.preventDefault();
  }
  if (event.code === 'KeyM') toggleMap();
  if (event.code === 'Escape' || event.code === 'KeyP') togglePause();
  if (event.code === 'KeyE' || event.code === 'Enter') interact();
  if (state === 'title') menuKeys(event, titleMenu(), titleSelection, (i) => { titleSelection = i; }, activateTitle);
  else if (state === 'pause') menuKeys(event, pauseMenu(), pauseSelection, (i) => { pauseSelection = i; }, activatePause);
  else if (state === 'missions') menuKeys(event, missionMenu(), missionSelection, (i) => { missionSelection = i; }, activateMissionMenu);
});

window.addEventListener('keyup', (event) => {
  const action = KEYMAP[event.code];
  if (action) keys[action] = false;
});

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * VIEW_W;
  mouse.y = ((event.clientY - rect.top) / rect.height) * VIEW_H;
});

canvas.addEventListener('mousedown', () => {
  sound.ensure();
  mouse.down = true;
  if (state === 'play' && !playerCar && !dialogueQueue.length) {
    playerAttack(player, world);
  }
});
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('click', () => canvas.focus());

function menuKeys(event, items, current, setSelection, activate) {
  if (event.code === 'ArrowUp' || event.code === 'KeyW') {
    let i = current;
    do { i = (i + items.length - 1) % items.length; } while (items[i].disabled);
    setSelection(i);
    sound.blip(520, 0.05, 0.08);
  }
  if (event.code === 'ArrowDown' || event.code === 'KeyS') {
    let i = current;
    do { i = (i + 1) % items.length; } while (items[i].disabled);
    setSelection(i);
    sound.blip(520, 0.05, 0.08);
  }
  if (event.code === 'Enter' || event.code === 'Space') activate();
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

function titleMenu() {
  const items = [];
  if (save.missionsDone.length || save.cash !== 250) items.push({ label: 'CONTINUE', action: 'continue' });
  items.push({ label: 'NEW GAME', action: 'new' });
  items.push({ label: 'MISSION SELECT', action: 'missions' });
  items.push({ label: 'HOW TO PLAY', action: 'help' });
  items.push({ label: save.muted ? 'SOUND: OFF' : 'SOUND: ON', action: 'sound' });
  return items;
}

function activateTitle() {
  const item = titleMenu()[titleSelection];
  if (!item) return;
  sound.blip(700, 0.07, 0.12);
  if (item.action === 'continue') startPlay(false);
  else if (item.action === 'new') { wipeSave(); save = defaultSave(); startPlay(true); }
  else if (item.action === 'missions') { state = 'missions'; missionSelection = 0; }
  else if (item.action === 'help') { helpFrom = 'title'; state = 'help'; }
  else if (item.action === 'sound') toggleSound();
}

function pauseMenu() {
  return [
    { label: 'RESUME', action: 'resume' },
    { label: 'CITY MAP', action: 'map' },
    { label: 'MISSION SELECT', action: 'missions' },
    { label: 'HOW TO PLAY', action: 'help' },
    { label: save.muted ? 'SOUND: OFF' : 'SOUND: ON', action: 'sound' },
    { label: 'QUIT TO TITLE', action: 'title' },
  ];
}

function activatePause() {
  const item = pauseMenu()[pauseSelection];
  if (!item) return;
  sound.blip(700, 0.07, 0.12);
  if (item.action === 'resume') state = 'play';
  else if (item.action === 'map') state = 'map';
  else if (item.action === 'missions') { state = 'missions'; missionSelection = 0; }
  else if (item.action === 'help') { helpFrom = 'pause'; state = 'help'; }
  else if (item.action === 'sound') toggleSound();
  else if (item.action === 'title') state = 'title';
}

function missionMenu() {
  const items = STORY_MISSIONS.map((mission, i) => {
    const done = save.missionsDone.includes(mission.id);
    const isNext = i === save.storyStage;
    return {
      label: `${done ? '✓' : isNext ? '▸' : '·'} ${mission.title}`,
      note: done ? `Replay · $${mission.reward.cash}` : isNext ? `Next · $${mission.reward.cash} · +${mission.reward.respect} respect` : 'Locked — finish the story in order',
      disabled: !done && !isNext,
      mission,
      replay: done,
    };
  });
  items.push({ label: 'BACK', action: 'back' });
  return items;
}

function activateMissionMenu() {
  const item = missionMenu()[missionSelection];
  if (!item || item.disabled) return;
  sound.blip(700, 0.07, 0.12);
  if (item.action === 'back') {
    state = 'title';
    return;
  }
  startPlay(false);
  beginMission(item.mission, item.replay);
}

function toggleSound() {
  save.muted = !save.muted;
  sound.setMuted(save.muted);
  storeSave(save);
}

function toggleMap() {
  if (state === 'play') state = 'map';
  else if (state === 'map') state = 'play';
}

function togglePause() {
  if (state === 'play') { state = 'pause'; pauseSelection = 0; }
  else if (state === 'pause') state = 'play';
  else if (state === 'map') state = 'play';
  else if (state === 'help') state = helpFrom === 'pause' ? 'pause' : 'title';
  else if (state === 'missions') state = 'title';
}

function startPlay(fresh) {
  state = 'play';
  if (fresh) {
    player.x = city.landmarks.loft.x + 40;
    player.y = city.landmarks.loft.y + 30;
    player.health = 100;
    playerCar = null;
  }
  canvas.focus();
}

function beginMission(mission, replay) {
  if (runner.mission) return;
  runner.start(mission, missionEvents, replay);
  dialogueAfter = 'beginSteps';
}

// ---------------------------------------------------------------------------
// The E key: context interaction.
// ---------------------------------------------------------------------------

function interact() {
  if (dialogueQueue.length) {
    dialogueQueue.shift();
    sound.blip(600, 0.04, 0.07);
    if (!dialogueQueue.length && dialogueAfter === 'beginSteps') {
      dialogueAfter = null;
      runner.beginSteps(missionEvents, city);
    }
    return;
  }
  if (state !== 'play') return;

  if (playerCar) {
    // At a race start, E means "run it".
    if (!runner.mission && race.state !== 'running') {
      for (const course of RACE_COURSES) {
        if (distance(playerCar.x, playerCar.y, course.start.x, course.start.y) < 110) {
          race.start(course);
          toast(`${course.name} — go!`, '#ffd76a');
          sound.cashRegister();
          return;
        }
      }
    }
    // At Ember Customs, E means "deal with the garage", not "get out".
    if (garageService()) return;
    // Step out, leaving the car where it stands.
    const side = playerCar.angle + Math.PI / 2;
    player.x = playerCar.x + Math.cos(side) * 30;
    player.y = playerCar.y + Math.sin(side) * 30;
    if (circleHitsSolid(city, player.x, player.y, player.r)) {
      player.x = playerCar.x - Math.cos(side) * 30;
      player.y = playerCar.y - Math.sin(side) * 30;
    }
    playerCar.driver = 'parked';
    playerCar = null;
    sound.stopEngine();
    sound.blip(340, 0.06, 0.1);
    return;
  }

  // Safehouse: save, heal, and lay low if nobody is watching.
  const loft = city.landmarks.loft;
  if (distance(player.x, player.y, loft.x, loft.y) < 95) {
    storeSave(save);
    player.health = 100;
    toast('Saved at Rook\u2019s Loft — health restored', '#7be495');
    if (wanted.level > 0 && !wanted.seen) {
      wanted.forceLevel(0);
      toast('You lay low. The heat dies down.', '#9fd8ff');
    }
    sound.pickupChime();
    return;
  }

  // Garage on foot: take your stored car back out.
  const customs = city.landmarks.customs;
  if (distance(player.x, player.y, customs.x, customs.y) < 95 && save.garageCar && !runner.mission) {
    const stored = makeCar(save.garageCar.type, customs.x + 30, customs.y + 46, Math.PI / 2, rng);
    stored.color = save.garageCar.color;
    stored.health = save.garageCar.health;
    cars.push(stored);
    save.garageCar = null;
    storeSave(save);
    toast(`Your ${stored.spec.name} rolls out of Ember Customs`, '#ffd76a');
    return;
  }

  // Mission start, delivery board, race start — in that order.
  const next = nextStoryMission();
  if (next && !runner.mission && race.state !== 'running') {
    const place = missionStartPlace(next);
    if (distance(player.x, player.y, place.x, place.y) < 110) {
      beginMission(next, false);
      return;
    }
  }
  if (!runner.mission && race.state !== 'running') {
    const market = city.landmarks.market;
    if (distance(player.x, player.y, market.x, market.y) < 100) {
      beginMission(makeDelivery(city, rng, save), false);
      return;
    }
  }

  // Any car with a door you can reach.
  let best = null;
  let bestDist = 52;
  for (const car of cars) {
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  if (best) enterCar(best);
}

function enterCar(car) {
  if (car.driver === 'traffic') {
    world.onTrafficHit(car, null); // the driver bails and runs
    world.onCrime('car-theft', car.x, car.y);
  } else if (car.driver === 'parked') {
    world.onCrime('car-theft', car.x, car.y);
  }
  car.driver = 'player';
  playerCar = car;
  player.inCar = car;
  sound.blip(420, 0.06, 0.1);
  if (car.marked) toast('This is the car. Drive!', '#ffd76a');
}

// In a car, E at the garage repairs and stores it.
function garageService() {
  if (!playerCar) return false;
  const customs = city.landmarks.customs;
  if (distance(playerCar.x, playerCar.y, customs.x, customs.y) > 110) return false;
  const damage = playerCar.maxHealth - playerCar.health;
  const cost = Math.ceil(damage * 1.6);
  if (damage > 2 && save.cash >= cost) {
    save.cash -= cost;
    playerCar.health = playerCar.maxHealth;
    toast(`Repaired at Ember Customs — $${cost}`, '#7be495');
    sound.cashRegister();
  } else if (damage > 2) {
    toast(`Repairs cost $${cost} — you are short`, '#ff8a7a');
    return true;
  }
  save.garageCar = { type: playerCar.type, color: playerCar.color, health: playerCar.health };
  cars = cars.filter((c) => c !== playerCar);
  playerCar.driver = 'parked';
  player.x = customs.x + 10;
  player.y = customs.y + 60;
  playerCar = null;
  sound.stopEngine();
  storeSave(save);
  toast('Car stored at Ember Customs', '#9fd8ff');
  return true;
}

// ---------------------------------------------------------------------------
// Busted and wasted
// ---------------------------------------------------------------------------

let endKind = 'wasted';
let endFine = 0;

function enterEndScreen(kind) {
  endKind = kind;
  endFine = Math.round(save.cash * (kind === 'busted' ? 0.12 : 0.08));
  state = kind;
  endTimer = 3.6;
  sound.stopEngine();
  sound.setSiren(false, 0);
  if (runner.mission) runner.fail(missionEvents, kind === 'busted' ? 'You were arrested.' : 'You were wasted.');
  if (race.state === 'running') race.state = 'idle';
}

function respawnAfterEnd() {
  save.cash = Math.max(0, save.cash - endFine);
  storeSave(save);
  if (playerCar) {
    if (endKind === 'busted') cars = cars.filter((c) => c !== playerCar);
    else playerCar.driver = 'parked';
    playerCar = null;
  }
  for (let i = police.cops.length - 1; i >= 0; i--) police.removeCop(world, i);
  police.clearRoadblock(world);
  police.bustProgress = 0;
  wanted.forceLevel(0);
  player.x = city.landmarks.loft.x + 40;
  player.y = city.landmarks.loft.y + 30;
  player.health = 100;
  state = 'play';
  toast(endKind === 'busted' ? `Released. The EBPD kept $${endFine}.` : `Patched up. The hospital kept $${endFine}.`, '#9fd8ff', 4);
}

// ---------------------------------------------------------------------------
// Ambient population: citizens and traffic, kept full near the camera.
// ---------------------------------------------------------------------------

function maintainPopulation(centerX, centerY) {
  peds = peds.filter((ped) => distance(ped.x, ped.y, centerX, centerY) < 1150 || ped.state === 'down');
  while (peds.length < 24) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(330, 760);
    const x = clamp(centerX + Math.cos(angle) * dist, 40, WORLD_W - 40);
    const y = clamp(centerY + Math.sin(angle) * dist, 40, 3500);
    if (circleHitsSolid(city, x, y, 10)) continue;
    peds.push(makePedestrian(x, y, rng));
  }
  const traffic = cars.filter((c) => c.driver === 'traffic');
  for (const car of traffic) {
    if (distance(car.x, car.y, centerX, centerY) > 1250) {
      car.driver = 'parked';
      car.vx = 0;
      car.vy = 0;
    }
  }
  const active = cars.filter((c) => c.driver === 'traffic').length;
  for (let i = active; i < 11; i++) {
    cars.push(spawnTrafficCar(city, rng, centerX, centerY));
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

let shotObjective = null;
let shotMarker = null;
let engineDeadToastShown = false;

function currentPrompt() {
  if (dialogueQueue.length || state !== 'play') return null;
  const pos = world.playerPos;
  if (playerCar) {
    const customs = city.landmarks.customs;
    if (distance(pos.x, pos.y, customs.x, customs.y) < 110) return 'E — Ember Customs: repair & store car';
    for (const course of RACE_COURSES) {
      if (distance(pos.x, pos.y, course.start.x, course.start.y) < 110 && race.state !== 'running' && !runner.mission) {
        return `E — Race: ${course.name}`;
      }
    }
    return null;
  }
  const loft = city.landmarks.loft;
  if (distance(player.x, player.y, loft.x, loft.y) < 95) return 'E — Rook\u2019s Loft: save & rest';
  const customs = city.landmarks.customs;
  if (distance(player.x, player.y, customs.x, customs.y) < 95 && save.garageCar) return `E — Collect your ${save.garageCar.type} from the garage`;
  const next = nextStoryMission();
  if (next && !runner.mission && race.state !== 'running') {
    const place = missionStartPlace(next);
    if (distance(player.x, player.y, place.x, place.y) < 110) return `E — Start mission: ${next.title}`;
    const market = city.landmarks.market;
    if (distance(player.x, player.y, market.x, market.y) < 100) return 'E — Ember Eats: run a delivery';
  }
  let best = null;
  let bestDist = 52;
  for (const car of cars) {
    const d = distance(player.x, player.y, car.x, car.y);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  if (best) return best.driver === 'traffic' ? `E — Yank the driver out of the ${best.spec.name}` : `E — Take the ${best.spec.name}`;
  return null;
}

function currentMarker() {
  if (shotMarker) return shotMarker;
  const fromRunner = runner.marker(city);
  if (fromRunner) return fromRunner;
  const fromRace = race.marker();
  if (fromRace) return fromRace;
  if (!runner.mission && race.state !== 'running' && state === 'play') {
    const next = nextStoryMission();
    if (next) {
      const place = missionStartPlace(next);
      return { x: place.x, y: place.y, label: `Story: ${next.title}` };
    }
  }
  return null;
}

function currentObjective() {
  if (shotObjective) return shotObjective;
  if (runner.mission) return runner.objectiveText();
  if (race.state === 'running') return race.marker()?.label ?? '';
  const next = nextStoryMission();
  if (next) return `Story: ${next.title} — follow the gold marker`;
  return 'Free roam — the bay is yours. Deliveries at Playa Market.';
}

function update(dt) {
  fx.update(dt);
  shake.update(dt);
  skids.update(dt);
  damageFlash = Math.max(0, damageFlash - dt * 1.4);
  for (const t of toasts) t.ttl -= dt;
  toasts = toasts.filter((t) => t.ttl > 0);

  if (state === 'busted' || state === 'wasted') {
    endTimer -= dt;
    if (endTimer <= 0) respawnAfterEnd();
    return;
  }
  if (state !== 'play' && state !== 'title') return;

  const center = state === 'title'
    ? { x: camera.x + VIEW_W / 2, y: camera.y + VIEW_H / 2 }
    : world.playerPos;
  maintainPopulation(center.x, center.y);
  for (const ped of peds) updatePedestrian(ped, dt, world, rng);
  for (const car of cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, dt, world, rng);
  }

  if (state === 'title') {
    titlePan += dt;
    camera.x = clamp(1500 + Math.sin(titlePan * 0.05) * 900, 0, WORLD_W - VIEW_W);
    camera.y = clamp(2350 + Math.cos(titlePan * 0.037) * 500, 0, WORLD_H - VIEW_H);
    sound.updatePad(dt, day.isNight());
    return;
  }

  // --- play ---------------------------------------------------------------
  if (!shotMode) day.update(dt);
  sound.updatePad(dt, day.isNight());
  timeSinceDamage += dt;
  if (timeSinceDamage > 5 && player.health > 0 && player.health < 100) {
    player.health = Math.min(100, player.health + 2.4 * dt);
  }

  mouse.worldX = mouse.x + camera.x;
  mouse.worldY = mouse.y + camera.y;

  if (!dialogueQueue.length) {
    const input = {
      up: !!keys.up, down: !!keys.down, left: !!keys.left, right: !!keys.right,
      sprint: !!keys.sprint, handbrake: !!keys.handbrake,
      aimX: mouse.worldX, aimY: mouse.worldY,
    };
    if (playerCar) {
      const drifting = updatePlayerCar(playerCar, input, dt, world);
      player.x = playerCar.x;
      player.y = playerCar.y;
      player.angle = playerCar.angle;
      const speedRatio = clamp(Math.abs(playerCar.speed) / playerCar.spec.topSpeed, 0, 1);
      sound.setEngine(speedRatio, input.up ? 1 : 0.25);
      if (drifting) {
        skids.add(playerCar.x - Math.cos(playerCar.angle) * 14, playerCar.y - Math.sin(playerCar.angle) * 14, playerCar.angle, 1);
        fx.burstDust(playerCar.x, playerCar.y, 0.4);
      }
      if (playerCar.health < 45 && Math.random() < dt * 6) fx.burstSmoke(playerCar.x, playerCar.y, 1);
      if (playerCar.health <= 0) {
        playerCar.vx *= Math.exp(-2.6 * dt);
        playerCar.vy *= Math.exp(-2.6 * dt);
        if (!engineDeadToastShown) {
          engineDeadToastShown = true;
          toast('The engine is dead — this car is a coffin. Get out!', '#ff8a7a', 4);
        }
      } else {
        engineDeadToastShown = false;
      }
    } else {
      updatePlayerOnFoot(player, input, dt, world);
      sound.stopEngine();
    }

    const gameView = { city, playerPos: world.playerPos, playerCar, wantedLevel: wanted.level };
    runner.update(dt, gameView, missionEvents);
    race.update(dt, gameView, missionEvents);
    police.update(dt, world, rng);
    if (police.bustProgress >= 1) {
      enterEndScreen('busted');
      return;
    }

    // Ember shards: the city's hidden collectibles.
    for (let i = 0; i < city.shardSpots.length; i++) {
      if (save.shardsFound.includes(i)) continue;
      const spot = city.shardSpots[i];
      if (distance(world.playerPos.x, world.playerPos.y, spot.x, spot.y) < 32) {
        save.shardsFound.push(i);
        save.cash += 25;
        if (save.shardsFound.length % 10 === 0) {
          save.cash += 500;
          toast(`Shard milestone: ${save.shardsFound.length}/40 — +$525`, '#ffd76a', 4);
        } else {
          toast(`Ember shard ${save.shardsFound.length}/40 — +$25`, '#ff9a3c');
        }
        sound.pickupChime();
        fx.burstPickupGlow(spot.x, spot.y);
        storeSave(save);
      }
    }
  }

  // Camera: follow with a velocity lookahead, clamped to the world.
  const pos = world.playerPos;
  const vel = world.playerVel;
  const targetX = pos.x + vel.x * 0.38 - VIEW_W / 2;
  const targetY = pos.y + vel.y * 0.38 - VIEW_H / 2;
  camera.x += clamp(targetX - camera.x, -900 * dt * 3.4, 900 * dt * 3.4);
  camera.y += clamp(targetY - camera.y, -900 * dt * 3.4, 900 * dt * 3.4);
  camera.x = clamp(camera.x, 0, WORLD_W - VIEW_W);
  camera.y = clamp(camera.y, 0, WORLD_H - VIEW_H);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const camX = camera.x + shake.x;
  const camY = camera.y + shake.y;
  const view = { x: camX - 40, y: camY - 40, w: VIEW_W + 80, h: VIEW_H + 80 };
  const night = day.isNight();
  const marker = currentMarker();
  world.marker = marker;

  ctx.save();
  ctx.translate(-camX, -camY);
  drawCityTiles(ctx, tiles, view);
  skids.draw(ctx);
  // Ember shards glow above the streets.
  for (let i = 0; i < city.shardSpots.length; i++) {
    if (save.shardsFound.includes(i)) continue;
    const spot = city.shardSpots[i];
    if (spot.x < view.x || spot.x > view.x + view.w || spot.y < view.y || spot.y > view.y + view.h) continue;
    const pulse = 0.7 + Math.sin(performance.now() / 260 + i) * 0.3;
    ctx.save();
    ctx.translate(spot.x, spot.y - 6);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = `rgba(255,154,60,${0.85 * pulse})`;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  // The night wash, then the lit windows and lamp pools on top of it.
  const darkness = day.overlayAlpha();
  if (darkness > 0.02) {
    ctx.fillStyle = day.nightTint() + darkness + ')';
    ctx.fillRect(view.x, view.y, view.w, view.h);
    drawNightDetails(ctx, city, view, true);
  }
  if (marker && state === 'play') drawObjectiveBeacon(ctx, marker, { x: 0, y: 0 });
  for (const car of cars) drawCar(ctx, car, night);
  if (markedCar && markedCar.marked) {
    const pulse = 15 + Math.sin(performance.now() / 200) * 3;
    ctx.strokeStyle = '#ffb02e';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(markedCar.x, markedCar.y, pulse + 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const ped of peds) drawPedestrian(ctx, ped);
  if (!playerCar && state !== 'title') drawPlayer(ctx, player);
  police.drawHelicopter(ctx, night);
  fx.draw(ctx);
  ctx.restore();

  if (damageFlash > 0.01) {
    ctx.fillStyle = `rgba(200,30,20,${damageFlash * 0.4})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (state === 'title') {
    drawTitleScreen(ctx, titleMenu(), titleSelection, save.missionsDone.length > 0, titlePan);
    return;
  }
  if (state === 'map') {
    drawMapScreen(ctx, world);
    return;
  }
  if (state === 'busted' || state === 'wasted') {
    drawEndScreen(ctx, state, [
      state === 'busted' ? `The EBPD took $${endFine} in fines.` : `Emberfall General took $${endFine} for the patch-up.`,
      'You wake up outside Rook\u2019s Loft.',
    ]);
    return;
  }

  drawMinimap(ctx, world, 22, VIEW_H - 164, 196, 147);
  const pos = world.playerPos;
  drawHUD(ctx, {
    cash: save.cash,
    respect: save.respect,
    respectTitle: respectTitle(save),
    wantedLevel: wanted.level,
    wantedSeen: wanted.seen,
    health: player.health,
    inCar: !!playerCar,
    speedKmh: Math.abs(world.playerSpeed) * 0.36,
    carHealth: playerCar ? (playerCar.health / playerCar.maxHealth) * 100 : null,
    objective: state === 'play' ? currentObjective() : '',
    timer: runner.mission ? runner.timer : null,
    markerDistance: marker ? distance(pos.x, pos.y, marker.x, marker.y) / 4 : null,
    shards: save.shardsFound.length,
    bustProgress: police.bustProgress,
    prompt: currentPrompt(),
    clockMinutes: day.minutes,
    districtName: DISTRICT_INFO[districtAt(pos.x, pos.y)].name,
  });
  drawToasts(ctx, toasts);
  if (dialogueQueue.length) drawDialogue(ctx, dialogueQueue[0]);
  if (state === 'pause') {
    drawMenuList(ctx, 'PAUSED', pauseMenu(), pauseSelection, 'WASD / arrows + Enter · Esc resumes');
  }
  if (state === 'missions') {
    drawMenuList(ctx, 'MISSION SELECT', missionMenu(), missionSelection, 'Story missions unlock in order · replays pay 40%');
  }
  if (state === 'help') drawHelpScreen();
}

function drawHelpScreen() {
  ctx.fillStyle = 'rgba(5,8,14,0.9)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb02e';
  ctx.font = `800 34px ${'"Segoe UI", system-ui, sans-serif'}`;
  ctx.fillText('HOW TO PLAY', VIEW_W / 2, 120);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `500 18px ${'"Segoe UI", system-ui, sans-serif'}`;
  const lines = [
    'WASD / arrows — walk and drive        Shift — sprint / (in menus: navigate)',
    'E — enter & steal cars, talk, save at the loft, use the garage',
    'Space — handbrake: drift the rear out and slide through corners',
    'Mouse — aim on foot · Click — punch, or shoot once Mara arms you',
    'M — full city map        Esc / P — pause',
    '',
    'Follow the gold beacon for the story. Stars mean the EBPD is coming:',
    'lose sight of them and stay hidden to cool off — or lay low at Rook\u2019s Loft.',
    'Ember Customs (gold square on the map) repairs and stores your car.',
    'Side work: Ember Eats deliveries at Playa Market, three street races,',
    'and 40 ember shards hidden in the alleys of Emberfall Bay.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, 240, 190 + i * 32));
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 14px ${'"Segoe UI", system-ui, sans-serif'}`;
  ctx.fillText('Esc — back', VIEW_W / 2, VIEW_H - 30);
}

// ---------------------------------------------------------------------------
// Screenshot scenes: deterministic stagings the ?shot= pages ask for.
// ---------------------------------------------------------------------------

function setupShot(name) {
  if (name === 'start') {
    state = 'title';
    day.minutes = 10 * 60 + 20;
    camera.x = 1500;
    camera.y = 2350;
  } else if (name === 'chase') {
    state = 'play';
    day.minutes = 16 * 60 + 40;
    const car = makeCar('vantara', 2240, 2120, 0, rng);
    car.color = '#c22e3e';
    car.driver = 'player';
    car.vx = 305;
    // The scene car is armoured for the camera: an unpiloted car driving
    // into a roadblock still has to be alive when the shutter falls.
    car.maxHealth = 520;
    car.health = 520;
    cars.push(car);
    playerCar = car;
    player.x = car.x;
    player.y = car.y;
    wanted.forceLevel(4);
    const copSpots = [[1960, 2085], [1880, 2155], [2080, 2185]];
    for (const [x, y] of copSpots) {
      const cop = makeCar('interceptor', x, y, 0, rng);
      cop.driver = 'cop';
      cop.vx = 290;
      police.cops.push(cop);
      cars.push(cop);
    }
    police.setRoadblock(world, rng);
    shotObjective = 'Lose the heat!';
    camera.x = clamp(car.x - VIEW_W / 2 + 120, 0, WORLD_W - VIEW_W);
    camera.y = clamp(car.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  } else if (name === 'mission') {
    state = 'play';
    day.minutes = 21 * 60 + 40;
    player.x = 3760;
    player.y = 3240;
    player.angle = 0.5;
    wanted.forceLevel(2);
    const cop = makeCar('interceptor', 3440, 3030, 2.4, rng);
    cop.driver = 'cop';
    police.cops.push(cop);
    cars.push(cop);
    shotMarker = { x: city.landmarks.market.x, y: city.landmarks.market.y, label: 'Collect the debt at Playa Market' };
    shotObjective = 'Night Ledger — collect the three debts (2 left)';
    dialogueQueue = [{ speaker: 'Mara Voss', text: 'The Playa Market stall first. Collect politely — and Rook, the night is ours.' }];
    camera.x = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    camera.y = clamp(player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  } else if (name === 'map') {
    state = 'map';
    player.x = 2560;
    player.y = 2000;
    shotMarker = { x: city.landmarks.bank.x, y: city.landmarks.bank.y, label: 'Meridian Trust Bank' };
  }
}

if (shotMode) setupShot(shotMode);

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

let lastTime = performance.now();
let framesRendered = 0;

function frame(now) {
  const dt = clamp((now - lastTime) / 1000, 0.001, 0.05);
  lastTime = now;
  update(dt);
  render();
  framesRendered++;
  // A small read-only status hook: the screenshot scenes wait on it, and it
  // is handy in the console for anyone poking at the game.
  window.__emberfall = {
    ready: framesRendered > 90,
    state,
    shot: shotMode,
    player: { x: Math.round(world.playerPos.x), y: Math.round(world.playerPos.y) },
    inCar: !!playerCar,
    wanted: wanted.level,
    cops: police.cops.length,
    mission: runner.mission ? runner.mission.id : null,
    cash: save.cash,
  };
  requestAnimationFrame(frame);
}

canvas.focus();
requestAnimationFrame(frame);
