// people.js — the citizens of Emberfall Bay and the player among them.
//
// Pedestrians stroll the sidewalks between the roads, cut across parks, and
// react like people: they dive from speeding cars, scatter at gunfire, run
// from a swinging fist and remember a face long enough to call it in — a
// crime a pedestrian witnesses is a crime the police hear about. The player
// on foot is one more body in the same physics, with fists, a pistol after
// the story arms him, and a bright jacket so the camera never loses him.

import { AVENUES, STREETS, ROAD_HALF, slideMove } from './city.js';
import { clamp, distance } from './rng.js';

const SHIRTS = ['#c75b39', '#3f6fb5', '#59a05a', '#c9a53f', '#8a5fb0', '#d8d3c8', '#40586e', '#b03a5b'];
const PANTS = ['#2e3440', '#4a3b2c', '#5c6650', '#704214', '#333a45'];

export function makePedestrian(x, y, rng) {
  return {
    x, y, r: 8,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    walkSpeed: rng.range(38, 62),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skin: rng.pick(['#e8b98d', '#c68863', '#8a5a3b', '#f0c8a0', '#6e4525']),
    state: 'walk',
    targetX: x, targetY: y,
    waitFor: 0,
    downFor: 0,
    panicFor: 0,
    hasTarget: false,
  };
}

function pickSidewalkTarget(ped, rng) {
  // Stroll: pick a point along a nearby sidewalk or across a park block.
  if (rng.chance(0.5)) {
    const avenue = AVENUES.reduce((best, a) => (Math.abs(a - ped.x) < Math.abs(best - ped.x) ? a : best), AVENUES[0]);
    ped.targetX = avenue + (rng.chance(0.5) ? -1 : 1) * (ROAD_HALF + 14);
    ped.targetY = clamp(ped.y + rng.range(-420, 420), 40, 3500);
  } else {
    const street = STREETS.reduce((best, s) => (Math.abs(s - ped.y) < Math.abs(best - ped.y) ? s : best), STREETS[0]);
    ped.targetY = street + (rng.chance(0.5) ? -1 : 1) * (ROAD_HALF + 14);
    ped.targetX = clamp(ped.x + rng.range(-420, 420), 40, 5080);
  }
  ped.hasTarget = true;
}

export function scarePedestrian(ped, fromX, fromY, seconds = 4) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.panicFor = seconds;
  const away = Math.atan2(ped.y - fromY, ped.x - fromX);
  ped.targetX = ped.x + Math.cos(away) * 260;
  ped.targetY = ped.y + Math.sin(away) * 260;
  ped.hasTarget = true;
}

export function updatePedestrian(ped, dt, world, rng) {
  if (ped.state === 'down') {
    ped.downFor -= dt;
    if (ped.downFor <= 0) {
      ped.state = 'flee';
      ped.panicFor = 3;
    }
    return;
  }
  // Danger sense: a fast car close by is worth diving away from.
  for (const car of world.cars) {
    const speed = Math.hypot(car.vx, car.vy);
    if (speed < 130) continue;
    const d = distance(ped.x, ped.y, car.x, car.y);
    if (d < 74) {
      scarePedestrian(ped, car.x, car.y, 2.5);
      if (d < car.r + ped.r + 4 && speed > 200) {
        knockDownPedestrian(ped, car, world);
        return;
      }
    }
  }

  if (ped.state === 'flee') {
    ped.panicFor -= dt;
    if (ped.panicFor <= 0) ped.state = 'walk';
  }
  if (!ped.hasTarget || distance(ped.x, ped.y, ped.targetX, ped.targetY) < 14) {
    if (ped.waitFor > 0) {
      ped.waitFor -= dt;
      ped.speed = 0;
      return;
    }
    if (ped.state === 'walk' && rng.chance(0.3)) ped.waitFor = rng.range(0.6, 2.4);
    pickSidewalkTarget(ped, rng);
  }
  const desired = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
  let delta = desired - ped.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  ped.angle += clamp(delta, -5.4 * dt, 5.4 * dt);
  const targetSpeed = ped.state === 'flee' ? 148 : ped.walkSpeed;
  ped.speed += clamp(targetSpeed - ped.speed, -300 * dt, 300 * dt);
  slideMove(world.city, ped, Math.cos(ped.angle) * ped.speed * dt, Math.sin(ped.angle) * ped.speed * dt);
}

export function knockDownPedestrian(ped, byCar, world) {
  ped.state = 'down';
  ped.downFor = byCar && Math.hypot(byCar.vx, byCar.vy) > 330 ? 9999 : 5;
  ped.speed = 0;
  world.onPedDown?.(ped, byCar);
}

export function drawPedestrian(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-11, 3, 22, 6);
    ctx.fillStyle = ped.pants;
    ctx.fillRect(-10, -2, 9, 5);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-1, -3, 10, 6);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs scissor while moving, then torso, then head.
  const stride = ped.speed > 4 ? Math.sin(performance.now() / 90 + ped.x) * 4 : 0;
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-4, -5 + stride * 0.4, 8, 3.4);
  ctx.fillRect(-4, 2 - stride * 0.4, 8, 3.4);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 6.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(2.4, 0, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The player on foot
// ---------------------------------------------------------------------------

export function makePlayer(x, y) {
  return {
    x, y, r: 9,
    angle: -Math.PI / 2,
    speed: 0,
    health: 100,
    armed: false,
    ammo: 0,
    punchCooldown: 0,
    shotCooldown: 0,
    inCar: null,
  };
}

export function updatePlayerOnFoot(player, input, dt, world) {
  const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const moving = moveX !== 0 || moveY !== 0;
  const sprint = input.sprint ? 1.45 : 1;
  if (moving) {
    player.angle = Math.atan2(moveY, moveX);
    player.speed = 128 * sprint;
    slideMove(world.city, player, moveX * player.speed * dt * (moveX && moveY ? 0.7071 : 1), moveY * player.speed * dt * (moveX && moveY ? 0.7071 : 1));
  } else {
    player.speed = 0;
  }
  // Mouse aim overrides facing while the mouse has moved recently.
  if (input.aimX !== undefined && input.aimY !== undefined) {
    player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  }
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shotCooldown = Math.max(0, player.shotCooldown - dt);
}

// A punch if close and unarmed-clicking; a shot if the pistol is out.
// Returns what happened so the caller can raise the alarm appropriately.
export function playerAttack(player, world) {
  const reach = 30;
  const tx = player.x + Math.cos(player.angle) * reach;
  const ty = player.y + Math.sin(player.angle) * reach;
  if (player.armed && player.ammo > 0) {
    if (player.shotCooldown > 0) return null;
    player.shotCooldown = 0.24;
    player.ammo--;
    world.sound.gunshot();
    world.fx.spawn(player.x + Math.cos(player.angle) * 16, player.y + Math.sin(player.angle) * 16, { count: 3, color: '#ffd76a', speed: 60, ttl: 0.12, size: 3 });
    // Hitscan: nearest pedestrian or car within a 340px line.
    let best = null;
    let bestDist = 340;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d = distance(player.x, player.y, ped.x, ped.y);
      if (d > bestDist) continue;
      const ang = Math.atan2(ped.y - player.y, ped.x - player.x);
      let diff = Math.abs(ang - player.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.09 + Math.atan2(10, d)) { best = ped; bestDist = d; }
    }
    if (best) {
      knockDownPedestrian(best, null, world);
      world.onCrime('shooting', player.x, player.y, 2);
      return 'shot-ped';
    }
    for (const car of world.cars) {
      const d = distance(player.x, player.y, car.x, car.y);
      if (d < 200) {
        car.health -= 6;
        world.fx.burstSparks(car.x, car.y, 0.5);
      }
    }
    world.onCrime('shots-fired', player.x, player.y, 1);
    return 'shot';
  }
  if (player.punchCooldown > 0) return null;
  player.punchCooldown = 0.34;
  world.sound.punch();
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (distance(tx, ty, ped.x, ped.y) < 20) {
      scarePedestrian(ped, player.x, player.y, 5);
      if (Math.random() < 0.4) knockDownPedestrian(ped, null, world);
      world.onCrime('assault', player.x, player.y, 1);
      return 'punch';
    }
  }
  return 'swing';
}

export function drawPlayer(ctx, player) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const stride = player.speed > 4 ? Math.sin(performance.now() / 80) * 4.4 : 0;
  ctx.fillStyle = '#23272e';
  ctx.fillRect(-4, -5 + stride * 0.4, 9, 3.6);
  ctx.fillRect(-4, 2 - stride * 0.4, 9, 3.6);
  // Rook's ember-orange jacket: the one bright coat in the city.
  ctx.fillStyle = '#e86a17';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5c396';
  ctx.beginPath();
  ctx.arc(2.6, 0, 3.8, 0, Math.PI * 2);
  ctx.fill();
  if (player.armed) {
    ctx.fillStyle = '#15181d';
    ctx.fillRect(6, -1.6, 10, 3.2);
  }
  ctx.restore();
}
