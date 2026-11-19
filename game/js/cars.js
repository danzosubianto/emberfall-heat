// cars.js — everything with wheels: the car catalogue, arcade driving
// physics, the traffic that fills Emberfall Bay's roads, parked cars waiting
// to be stolen, and the top-down renderer that draws them all.
//
// Traffic drives the road graph properly: each car holds a lane on an avenue
// or a street, aims at the next intersection, and chooses where to turn when
// it gets there. The player's car is the same body with a wilder driver —
// throttle, brake, handbrake drifts, building scrapes and all.

import { AVENUES, STREETS, ROAD_HALF, isOnRoad, slideMove } from './city.js';
import { clamp, angleDelta, distance } from './rng.js';

export const CAR_TYPES = {
  pigeon: { name: 'Pigeon Compact', topSpeed: 305, accel: 200, reverse: 110, grip: 6.2, turn: 2.6, health: 90, colors: ['#b8543f', '#4f7fa8', '#c7c9cc', '#5d8a5a', '#c9a53f'] },
  meridian: { name: 'Meridian Sedan', topSpeed: 345, accel: 215, reverse: 120, grip: 6.6, turn: 2.4, health: 110, colors: ['#3c4b5c', '#7a8894', '#28303a', '#8a4a52', '#4a5d23'] },
  taxi: { name: 'Ember Cab', topSpeed: 335, accel: 210, reverse: 120, grip: 6.4, turn: 2.4, health: 110, colors: ['#e0a91c'] },
  vantara: { name: 'Vantara GT', topSpeed: 460, accel: 300, reverse: 140, grip: 7.4, turn: 2.9, health: 95, colors: ['#c22e3e', '#e86a17', '#20303e', '#e8e4da', '#5b2a86'] },
  hauler: { name: 'Hauler Van', topSpeed: 280, accel: 165, reverse: 100, grip: 5.4, turn: 2.0, health: 160, colors: ['#9aa0a3', '#6b7c8c', '#b0a58e', '#7a4a3a'] },
  interceptor: { name: 'EBPD Interceptor', topSpeed: 430, accel: 285, reverse: 140, grip: 7.2, turn: 2.9, health: 150, colors: ['#e8ecf0'] },
};

let nextCarId = 1;

export function makeCar(type, x, y, angle, rng) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    type,
    spec,
    x, y,
    r: type === 'hauler' ? 21 : 17,
    angle,
    vx: 0, vy: 0,
    speed: 0,
    color: rng ? rng.pick(spec.colors) : spec.colors[0],
    health: spec.health,
    maxHealth: spec.health,
    driver: 'parked',
    // traffic brain
    roadKind: null, roadIndex: 0, dir: 1, targetX: x, targetY: y, stuckFor: 0,
    honkAt: 0,
  };
}

export function carForwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}

export function spawnParkedCars(city, rng) {
  const cars = [];
  const types = ['pigeon', 'meridian', 'meridian', 'taxi', 'vantara', 'hauler'];
  for (const spot of city.parkingSpots) {
    if (rng.chance(0.28)) continue;
    cars.push(makeCar(rng.pick(types), spot.x, spot.y, spot.angle + rng.range(-0.06, 0.06), rng));
  }
  // A few kerbside cars along the avenues, doors ready to be yanked open.
  for (let i = 0; i < 46; i++) {
    const avenue = rng.pick(AVENUES);
    const x = avenue + (rng.chance(0.5) ? -1 : 1) * (ROAD_HALF - 13);
    const y = rng.range(80, 3440);
    if (city.buildings.some((b) => Math.abs(b.x + b.w / 2 - x) < 30 && Math.abs(b.y + b.h / 2 - y) < 30)) continue;
    cars.push(makeCar(rng.pick(types), x, y, rng.chance(0.5) ? -Math.PI / 2 : Math.PI / 2, rng));
  }
  return cars;
}

// ---------------------------------------------------------------------------
// Player driving
// ---------------------------------------------------------------------------

export function updatePlayerCar(car, input, dt, world) {
  const spec = car.spec;
  const forward = carForwardSpeed(car);
  const throttle = input.up ? 1 : 0;
  const braking = input.down ? 1 : 0;

  let engineForce = 0;
  if (throttle) engineForce = spec.accel * (forward < -1 ? 2.2 : 1); // brake-assist feel
  if (braking) engineForce = forward > 12 ? -spec.accel * 1.6 : -spec.accel * 0.7;

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  car.vx += fx * engineForce * dt;
  car.vy += fy * engineForce * dt;

  // Rolling drag and a hard cap at the type's top speed.
  const dragK = Math.exp(-dt * (input.handbrake ? 0.55 : 0.28));
  car.vx *= dragK;
  car.vy *= dragK;
  const speedNow = Math.hypot(car.vx, car.vy);
  const cap = engineForce < 0 && forward < 0 ? spec.reverse : spec.topSpeed;
  if (speedNow > cap) {
    car.vx *= cap / speedNow;
    car.vy *= cap / speedNow;
  }

  // Steering: sharper at town speeds, calmer flat out; drift loosens the rear.
  const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(forward) / 130, 0, 1) * clamp(1.25 - Math.abs(forward) / 620, 0.45, 1);
  car.angle += steerInput * spec.turn * speedFactor * dt * (forward < -1 ? -1 : 1);

  // Grip: velocity swings toward the nose; the handbrake lets it hang out.
  const grip = input.handbrake ? 2.1 : spec.grip;
  const newForward = carForwardSpeed(car);
  const lateralX = car.vx - fx * newForward;
  const lateralY = car.vy - fy * newForward;
  const keep = Math.exp(-grip * dt);
  car.vx = fx * newForward + lateralX * keep;
  car.vy = fy * newForward + lateralY * keep;
  car.speed = carForwardSpeed(car);

  const wasSpeed = Math.hypot(car.vx, car.vy);
  const hit = slideMove(world.city, car, car.vx * dt, car.vy * dt);
  if (hit && wasSpeed > 90) {
    const severity = clamp((wasSpeed - 90) / 260, 0.15, 1);
    car.health -= severity * 16;
    car.vx *= -0.18;
    car.vy *= -0.18;
    world.onCarCrash(car, severity, car.x, car.y);
  }
  collideCars(car, world);
  return Math.abs(lateralX) + Math.abs(lateralY) > 46 && Math.abs(newForward) > 90;
}

function collideCars(car, world) {
  for (const other of world.cars) {
    if (other === car) continue;
    const d = distance(car.x, car.y, other.x, other.y);
    const min = car.r + other.r - 4;
    if (d <= 0.01 || d >= min) continue;
    const nx = (other.x - car.x) / d;
    const ny = (other.y - car.y) / d;
    const push = (min - d) / 2;
    other.x += nx * push;
    other.y += ny * push;
    car.x -= nx * push;
    car.y -= ny * push;
    const rel = Math.abs(carForwardSpeed(car) - carForwardSpeed(other));
    if (rel > 70) {
      other.health -= rel * 0.05;
      car.health -= rel * 0.035;
      world.onCarCrash(car, clamp(rel / 300, 0.2, 1), (car.x + other.x) / 2, (car.y + other.y) / 2);
      if (other.driver === 'traffic') world.onTrafficHit?.(other, car);
    }
    other.vx += car.vx * 0.22;
    other.vy += car.vy * 0.22;
  }
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

function pickTrafficRoad(car, rng) {
  if (rng.chance(0.5)) {
    car.roadKind = 'avenue';
    car.roadIndex = rng.int(0, AVENUES.length - 1);
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.x = AVENUES[car.roadIndex] + (car.dir < 0 ? 27 : -27);
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.roadKind = 'street';
    car.roadIndex = rng.int(0, STREETS.length - 1);
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.y = STREETS[car.roadIndex] + (car.dir > 0 ? 27 : -27);
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
}

export function spawnTrafficCar(city, rng, nearX, nearY) {
  const types = ['pigeon', 'meridian', 'meridian', 'taxi', 'hauler', 'vantara'];
  const car = makeCar(rng.pick(types), nearX, nearY, 0, rng);
  car.driver = 'traffic';
  // Start on a road within sight of the player but not on top of them.
  for (let tries = 0; tries < 12; tries++) {
    pickTrafficRoad(car, rng);
    if (car.roadKind === 'avenue') car.y = clamp(nearY + rng.range(-700, 700), 70, 3480);
    else car.x = clamp(nearX + rng.range(-700, 700), 70, 5050);
    if (distance(car.x, car.y, nearX, nearY) > 190) break;
  }
  aimTrafficAtNextIntersection(car, rng);
  return car;
}

function aimTrafficAtNextIntersection(car, rng) {
  if (car.roadKind === 'avenue') {
    const cx = AVENUES[car.roadIndex];
    let ahead = STREETS.filter((cy) => (car.dir > 0 ? cy > car.y + 30 : cy < car.y - 30));
    if (!ahead.length) { car.dir *= -1; ahead = STREETS.filter((cy) => (car.dir > 0 ? cy > car.y + 30 : cy < car.y - 30)); }
    const cy = rng.pick(ahead.length ? ahead : STREETS);
    car.targetX = cx + (car.dir < 0 ? 27 : -27);
    car.targetY = cy;
  } else {
    const cy = STREETS[car.roadIndex];
    let ahead = AVENUES.filter((cx) => (car.dir > 0 ? cx > car.x + 30 : cx < car.x - 30));
    if (!ahead.length) { car.dir *= -1; ahead = AVENUES.filter((cx) => (car.dir > 0 ? cx > car.x + 30 : cx < car.x - 30)); }
    const cx = rng.pick(ahead.length ? ahead : AVENUES);
    car.targetX = cx;
    car.targetY = cy + (car.dir > 0 ? 27 : -27);
  }
}

export function updateTrafficCar(car, dt, world, rng) {
  const toTarget = distance(car.x, car.y, car.targetX, car.targetY);
  if (toTarget < 46) {
    // At the intersection: mostly straight on, sometimes a turn.
    if (rng.chance(0.34)) {
      if (car.roadKind === 'avenue') {
        const cy = STREETS.reduce((best, s) => (Math.abs(s - car.y) < Math.abs(best - car.y) ? s : best), STREETS[0]);
        car.roadKind = 'street';
        car.roadIndex = STREETS.indexOf(cy);
        car.dir = rng.chance(0.5) ? 1 : -1;
      } else {
        const cx = AVENUES.reduce((best, a) => (Math.abs(a - car.x) < Math.abs(best - car.x) ? a : best), AVENUES[0]);
        car.roadKind = 'avenue';
        car.roadIndex = AVENUES.indexOf(cx);
        car.dir = rng.chance(0.5) ? 1 : -1;
      }
    }
    aimTrafficAtNextIntersection(car, rng);
  }

  const lookX = car.x + Math.cos(car.angle) * 60 + (car.targetX - car.x) * 0.24;
  const lookY = car.y + Math.sin(car.angle) * 60 + (car.targetY - car.y) * 0.24;
  const desired = Math.atan2(lookY - car.y, lookX - car.x);
  car.angle += clamp(angleDelta(car.angle, desired), -2.4 * dt, 2.4 * dt);

  // Keep a gap: brake for anything slow or stopped ahead.
  let desiredSpeed = car.spec.topSpeed * 0.52;
  for (const other of world.cars) {
    if (other === car) continue;
    const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
    const side = Math.abs((other.x - car.x) * -Math.sin(car.angle) + (other.y - car.y) * Math.cos(car.angle));
    if (ahead > 0 && ahead < 86 && side < 24) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (ahead - 44) * 2.4));
  }
  if (world.playerCar && world.playerCar !== car) {
    const ahead = (world.playerCar.x - car.x) * Math.cos(car.angle) + (world.playerCar.y - car.y) * Math.sin(car.angle);
    const side = Math.abs((world.playerCar.x - car.x) * -Math.sin(car.angle) + (world.playerCar.y - car.y) * Math.cos(car.angle));
    if (ahead > 0 && ahead < 92 && side < 26) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (ahead - 46) * 2.4));
  }

  const forward = carForwardSpeed(car);
  const accel = desiredSpeed > forward ? car.spec.accel * 0.55 : car.spec.accel * 1.4;
  const newForward = forward + clamp(desiredSpeed - forward, -accel * dt, accel * dt);
  car.vx = Math.cos(car.angle) * newForward;
  car.vy = Math.sin(car.angle) * newForward;
  car.speed = newForward;
  const hit = slideMove(world.city, car, car.vx * dt, car.vy * dt);
  if (hit) {
    car.stuckFor += dt;
    if (car.stuckFor > 1.6) {
      car.dir *= -1;
      aimTrafficAtNextIntersection(car, rng);
      car.stuckFor = 0;
    }
  } else {
    car.stuckFor = Math.max(0, car.stuckFor - dt);
  }
  collideCars(car, world);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export function drawCar(ctx, car, night) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.type === 'hauler' ? 52 : 42;
  const W = car.type === 'hauler' ? 24 : 21;
  // Shadow, body, cabin, glass.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  if (car.type === 'interceptor') {
    ctx.fillStyle = '#20262e';
    ctx.fillRect(-L / 2, -W / 2, L * 0.34, W);
    ctx.fillRect(L * 0.22, -W / 2, L * 0.28, W);
    ctx.fillStyle = '#d23b2e';
    ctx.fillRect(-3, -W / 2 + 2, 6, 4);
    ctx.fillStyle = '#2e6fd2';
    ctx.fillRect(-3, W / 2 - 6, 6, 4);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20262e';
    ctx.fillRect(-4, -5, 8, 10);
  }
  ctx.fillStyle = 'rgba(16,24,34,0.92)';
  if (car.type === 'hauler') {
    roundRect(ctx, L * 0.18, -W / 2 + 3, L * 0.24, W - 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-L / 2 + 3, -W / 2 + 3, L * 0.5, W - 6);
  } else {
    roundRect(ctx, -L * 0.08, -W / 2 + 3, L * 0.4, W - 6, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,190,230,0.35)';
    ctx.fillRect(L * 0.24, -W / 2 + 4, 3, W - 8);
  }
  // Wheels.
  ctx.fillStyle = '#101216';
  const wy = W / 2 - 1;
  ctx.fillRect(-L / 2 + 4, -wy - 2, 9, 4);
  ctx.fillRect(-L / 2 + 4, wy - 2, 9, 4);
  ctx.fillRect(L / 2 - 13, -wy - 2, 9, 4);
  ctx.fillRect(L / 2 - 13, wy - 2, 9, 4);
  // Headlights and tail lights.
  ctx.fillStyle = night ? '#ffe9a8' : '#f5eeda';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 5);
  ctx.fillStyle = '#c22e2e';
  ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 3, 5);
  ctx.fillRect(-L / 2 - 1, W / 2 - 7, 3, 5);
  ctx.restore();

  if (night) {
    // Headlight cones spilling ahead of the car.
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const grad = ctx.createRadialGradient(L / 2, 0, 6, L / 2 + 60, 0, 95);
    grad.addColorStop(0, 'rgba(255,232,160,0.20)');
    grad.addColorStop(1, 'rgba(255,232,160,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(L / 2, -8);
    ctx.lineTo(L / 2 + 110, -34);
    ctx.lineTo(L / 2 + 110, 34);
    ctx.lineTo(L / 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
