// missions.js — the story of Emberfall Heat and the work between its chapters.
//
// Mara Voss runs a small crew out of a dockside bar called the Ashpit, and
// Rook — the player — is her new wheelman. Seven story missions climb from
// a first errand to the Meridian Trust job: drive, deliver, steal, escape,
// collect, run the coast, and finally hit the bank and vanish into the
// hills. Between chapters the city itself offers work: Ember Eats
// deliveries against the clock and three checkpoint street races.
//
// A mission is data — a list of steps the runner walks: go somewhere, steal
// a marked car, visit every point, lose the police, beat the clock. The
// runner owns the marker, the objective line, the timer and the fail state;
// main.js owns the world the steps happen in.

import { distance } from './rng.js';

export const STORY_MISSIONS = [
  {
    id: 'first-embers',
    title: 'First Embers',
    giver: 'Mara Voss',
    reward: { cash: 400, respect: 20 },
    intro: [
      ['Mara Voss', 'So you are the driver Dez keeps bragging about. Rook, right?'],
      ['Rook', 'I drive. I do not ask what is in the trunk.'],
      ['Mara Voss', 'Good answer. A package is waiting at the Cannery. Bring it to my loft — quiet, clean, no stars.'],
    ],
    steps: [
      { kind: 'goto', at: 'cannery', label: 'Pick up the package at the Cannery' },
      { kind: 'goto', at: 'loft', label: 'Deliver the package to Rook\u2019s Loft' },
    ],
    outro: [
      ['Mara Voss', 'Clean and quick. The Ashpit crew might have room for you after all.'],
    ],
  },
  {
    id: 'cannery-run',
    title: 'The Cannery Run',
    giver: 'Mara Voss',
    reward: { cash: 650, respect: 30 },
    intro: [
      ['Mara Voss', 'The dock crews are moving money through the Cannery tonight. Ours leaves in a freezer truck\u2019s shadow — you just drive the decoy.'],
      ['Rook', 'A decoy with a timer, I am guessing.'],
      ['Mara Voss', 'Bank steps, downtown, before the ink dries. And Rook — Dez left you a pistol in the glovebox from now on.'],
    ],
    steps: [
      { kind: 'goto', at: 'cannery', label: 'Reach the Cannery' },
      { kind: 'goto', at: 'bank', label: 'Race the package to Meridian Trust', timer: 150 },
    ],
    outro: [
      ['Mara Voss', 'The truck got through clean while every badge in the bay watched you. Beautiful.'],
    ],
  },
  {
    id: 'hot-metal',
    title: 'Hot Metal',
    giver: 'Dez',
    reward: { cash: 900, respect: 40 },
    intro: [
      ['Dez', 'A Vantara GT, ember red, parked at the Solenne Grand. Some tourist\u2019s midlife crisis.'],
      ['Dez', 'My buyer wants it by sundown, and Ember Customs wants it quiet. Steal it, bring it to the garage.'],
    ],
    steps: [
      { kind: 'steal', carType: 'vantara', at: 'hotel', label: 'Steal the Vantara GT at the Solenne Grand' },
      { kind: 'goto', at: 'customs', label: 'Deliver the GT to Ember Customs', inStolenCar: true },
    ],
    outro: [
      ['Dez', 'Not a scratch. You drive stolen like you were born in the seat.'],
    ],
  },
  {
    id: 'long-arm',
    title: 'The Long Arm',
    giver: 'Pia',
    reward: { cash: 800, respect: 50 },
    intro: [
      ['Pia', 'It went wrong, Rook. The diner meet was a setup — uniforms everywhere.'],
      ['Rook', 'Then I am gone. Watch the map and keep the channel clear.'],
      ['Pia', 'Lose them. All of them. Then we talk.'],
    ],
    steps: [
      { kind: 'goto', at: 'diner', label: 'Reach the Cinder Diner' },
      { kind: 'heat', level: 3, label: 'The meet was a setup —' },
      { kind: 'escape', label: 'Lose the heat' },
    ],
    outro: [
      ['Pia', 'Gone like smoke. Whoever sold us out just made you a legend, Rook.'],
    ],
  },
  {
    id: 'night-ledger',
    title: 'Night Ledger',
    giver: 'Mara Voss',
    reward: { cash: 1200, respect: 60 },
    intro: [
      ['Mara Voss', 'Three names owe the Ashpit money, and tonight the ledger closes.'],
      ['Mara Voss', 'The Playa Market stall, the bank steps, and a big house up in the hills. Collect politely. Drive home in the dark.'],
    ],
    steps: [
      { kind: 'setTime', minutes: 21 * 60 + 15, label: 'Night falls over Emberfall Bay' },
      { kind: 'collect', points: ['market', 'bank', 'hillhouse'], label: 'Collect the three debts' },
    ],
    outro: [
      ['Mara Voss', 'Every name crossed out. The bay is learning what the Ashpit already knew.'],
    ],
  },
  {
    id: 'harbor-lights',
    title: 'Harbor Lights',
    giver: 'Dez',
    reward: { cash: 1400, respect: 70 },
    intro: [
      ['Dez', 'A buyer is watching the coast road tonight, timing every fast car that passes the harbor lights.'],
      ['Dez', 'Hit every light from the Marina to the east pier, fast and loud. The badges will come — that is the point. Sell the legend.'],
    ],
    steps: [
      { kind: 'heat', level: 2, label: 'The bay is watching —' },
      { kind: 'collect', points: ['marina', 'pier1', 'pier2', 'pier3', 'eastpier'], label: 'Hit every harbor light', timer: 170 },
      { kind: 'escape', label: 'Now lose the heat' },
    ],
    outro: [
      ['Dez', 'Five lights, one legend, zero arrests. The buyer just doubled his offer.'],
    ],
  },
  {
    id: 'emberfall',
    title: 'Emberfall',
    giver: 'Mara Voss',
    reward: { cash: 3000, respect: 120 },
    intro: [
      ['Mara Voss', 'Tonight we stop being errand runners. Meridian Trust moves its reserve at midnight — and we are the ones moving it.'],
      ['Rook', 'The bank, the whole bay watching, five stars by the second corner.'],
      ['Mara Voss', 'Then we vanish into the hills and Emberfall is ours. Pick me up at the Ashpit after the vault. Drive like the city is already yours.'],
    ],
    steps: [
      { kind: 'goto', at: 'bank', label: 'Hit Meridian Trust Bank' },
      { kind: 'goto', at: 'ashpit', label: 'Pick up Mara at the Ashpit' },
      { kind: 'heat', level: 5, label: 'Every badge in the bay —' },
      { kind: 'goto', at: 'hillhouse', label: 'Reach the hill house' },
      { kind: 'escape', label: 'Vanish: lose the heat for good' },
    ],
    outro: [
      ['Mara Voss', 'Look at it, Rook. Every light down there, and not one of them knows our names.'],
      ['Rook', 'Emberfall is ours.'],
    ],
  },
];

// Named places beyond the city's landmarks: piers and the hill house.
export const EXTRA_PLACES = {
  hillhouse: { name: 'The Hill House', x: 4520, y: 620 },
  pier1: { name: 'Harbor Light 2', x: 1560, y: 3300 },
  pier2: { name: 'Harbor Light 3', x: 2560, y: 3380 },
  pier3: { name: 'Harbor Light 4', x: 3560, y: 3300 },
  eastpier: { name: 'East Pier', x: 4780, y: 3300 },
};

export function placeOf(city, key) {
  if (EXTRA_PLACES[key]) return EXTRA_PLACES[key];
  return city.landmarks[key];
}

export class MissionRunner {
  constructor() {
    this.mission = null;
    this.stepIndex = 0;
    this.state = 'idle'; // idle | intro | active | outro | done | failed
    this.dialogue = [];
    this.timer = null;
    this.collectRemaining = [];
    this.stolenCar = null;
    this.replay = false;
    this.failedReason = '';
  }

  get step() {
    return this.mission ? this.mission.steps[this.stepIndex] : null;
  }

  start(mission, events, replay = false) {
    this.mission = mission;
    this.stepIndex = 0;
    this.state = 'intro';
    this.replay = replay;
    this.dialogue = [...mission.intro];
    this.stolenCar = null;
    events.say(this.dialogue);
  }

  beginSteps(events, city) {
    this.state = 'active';
    this.enterStep(events, city);
  }

  enterStep(events, city) {
    const step = this.step;
    if (!step) {
      this.finish(events);
      return;
    }
    this.timer = step.timer ?? null;
    if (step.kind === 'heat') {
      events.setWanted(step.level);
      events.toast(step.label + ' the heat is on!');
      this.advance(events, city);
      return;
    }
    if (step.kind === 'setTime') {
      events.setTime(step.minutes);
      this.advance(events, city);
      return;
    }
    if (step.kind === 'steal') {
      const place = placeOf(city, step.at);
      this.stolenCar = events.spawnMarkedCar(step.carType, place.x + 60, place.y + 40);
    }
    if (step.kind === 'collect') {
      this.collectRemaining = step.points.map((key) => ({ key, ...placeOf(city, key), taken: false }));
    }
  }

  advance(events, city) {
    this.stepIndex++;
    if (this.stepIndex >= this.mission.steps.length) {
      this.finish(events);
      return;
    }
    this.enterStep(events, city);
  }

  finish(events) {
    this.state = 'outro';
    this.dialogue = [...this.mission.outro];
    events.say(this.dialogue);
    events.missionComplete(this.mission, this.replay);
    this.mission = null;
    this.state = 'done';
  }

  fail(events, reason) {
    this.failedReason = reason;
    this.state = 'failed';
    events.missionFailed(this.mission, reason);
    this.mission = null;
  }

  marker(city) {
    const step = this.step;
    if (!step || this.state !== 'active') return null;
    if (step.kind === 'goto' || step.kind === 'steal') {
      if (step.kind === 'steal' && this.stolenCar) {
        return { x: this.stolenCar.x, y: this.stolenCar.y, label: step.label };
      }
      const place = step.at ? placeOf(city, step.at) : step;
      return { x: place.x, y: place.y, label: step.label };
    }
    if (step.kind === 'collect') {
      const next = this.collectRemaining.find((p) => !p.taken);
      return next ? { x: next.x, y: next.y, label: step.label } : null;
    }
    return null;
  }

  objectiveText() {
    const step = this.step;
    if (!step || this.state !== 'active') return '';
    if (step.kind === 'collect') {
      const left = this.collectRemaining.filter((p) => !p.taken).length;
      return `${step.label} (${left} left)`;
    }
    return step.label;
  }

  update(dt, game, events) {
    if (this.state !== 'active' || !this.step) return;
    const step = this.step;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.fail(events, 'Out of time.');
        return;
      }
    }
    const px = game.playerPos.x;
    const py = game.playerPos.y;
    if (step.kind === 'goto') {
      const place = step.at ? placeOf(game.city, step.at) : step;
      const needCar = step.inStolenCar ? game.playerCar === this.stolenCar : true;
      if (distance(px, py, place.x, place.y) < 85 && needCar) {
        events.toast('Made it.');
        this.advance(events, game.city);
      } else if (step.inStolenCar && this.stolenCar && this.stolenCar.health <= 0) {
        this.fail(events, 'The stolen car was wrecked.');
      }
    } else if (step.kind === 'steal') {
      if (this.stolenCar && game.playerCar === this.stolenCar) {
        events.toast('Got the car. Now deliver it.');
        events.crime('car-theft');
        this.advance(events, game.city);
      }
    } else if (step.kind === 'collect') {
      for (const point of this.collectRemaining) {
        if (point.taken) continue;
        if (distance(px, py, point.x, point.y) < 80) {
          point.taken = true;
          events.pickup(point);
        }
      }
      if (this.collectRemaining.every((p) => p.taken)) this.advance(events, game.city);
    } else if (step.kind === 'escape') {
      if (game.wantedLevel === 0) {
        events.toast('Heat lost.');
        this.advance(events, game.city);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ember Eats deliveries: the city's repeatable work.
// ---------------------------------------------------------------------------

export function makeDelivery(city, rng, save) {
  const pickups = ['market', 'diner', 'cannery'];
  const from = placeOf(city, rng.pick(pickups));
  const dropSpots = ['hotel', 'tower', 'loft', 'bank', 'marina', 'hillhouse'];
  let to = placeOf(city, rng.pick(dropSpots));
  if (to === from) to = placeOf(city, 'hotel');
  const dist = distance(from.x, from.y, to.x, to.y);
  return {
    id: 'delivery',
    title: 'Ember Eats Delivery',
    giver: 'Ember Eats',
    reward: { cash: 0, respect: 4 },
    intro: [['Ember Eats', `Hot food at ${from.name}. Drop it at ${to.name} while it is still hot.`]],
    steps: [
      { kind: 'goto', at: null, x: from.x, y: from.y, label: `Pick up the order at ${from.name}` },
      { kind: 'goto', at: null, x: to.x, y: to.y, label: `Deliver to ${to.name}`, timer: Math.round(dist / 16) + 35 },
    ],
    outro: [['Ember Eats', 'Delivered hot. The bay tips its drivers well.']],
    deliveryPay: Math.round(120 + dist / 9),
    isDelivery: true,
  };
}

// ---------------------------------------------------------------------------
// Street races: three checkpoint circuits against your own best time.
// ---------------------------------------------------------------------------

export const RACE_COURSES = [
  {
    id: 'beach-run',
    name: 'Beach Run',
    start: { x: 700, y: 3300 },
    checkpoints: [
      { x: 1600, y: 3300 }, { x: 2560, y: 3380 }, { x: 3520, y: 3300 },
      { x: 4480, y: 3300 }, { x: 3520, y: 3060 }, { x: 2240, y: 3060 }, { x: 700, y: 3300 },
    ],
  },
  {
    id: 'downtown-circuit',
    name: 'Downtown Circuit',
    start: { x: 2240, y: 2590 },
    checkpoints: [
      { x: 3520, y: 2590 }, { x: 3520, y: 1650 }, { x: 2880, y: 1180 },
      { x: 1600, y: 1180 }, { x: 1600, y: 2120 }, { x: 2240, y: 2590 },
    ],
  },
  {
    id: 'hills-climb',
    name: 'Hills Climb',
    start: { x: 2880, y: 1650 },
    checkpoints: [
      { x: 4160, y: 1180 }, { x: 4800, y: 710 }, { x: 4160, y: 240 },
      { x: 2880, y: 240 }, { x: 2240, y: 710 }, { x: 2880, y: 1650 },
    ],
  },
];

export class RaceManager {
  constructor() {
    this.course = null;
    this.nextCheckpoint = 0;
    this.time = 0;
    this.state = 'idle'; // idle | running | done
    this.lastTime = 0;
  }

  start(course) {
    this.course = course;
    this.nextCheckpoint = 0;
    this.time = 0;
    this.state = 'running';
  }

  marker() {
    if (this.state !== 'running') return null;
    const cp = this.course.checkpoints[this.nextCheckpoint];
    return cp ? { x: cp.x, y: cp.y, label: `${this.course.name} — checkpoint ${this.nextCheckpoint + 1}/${this.course.checkpoints.length}` } : null;
  }

  update(dt, game, events) {
    if (this.state !== 'running') return;
    this.time += dt;
    const cp = this.course.checkpoints[this.nextCheckpoint];
    if (!cp) return;
    if (distance(game.playerPos.x, game.playerPos.y, cp.x, cp.y) < 95) {
      this.nextCheckpoint++;
      events.checkpoint(this.nextCheckpoint, this.course.checkpoints.length);
      if (this.nextCheckpoint >= this.course.checkpoints.length) {
        this.state = 'done';
        this.lastTime = this.time;
        events.raceFinished(this.course, this.time);
        this.course = null;
      }
    }
  }
}
