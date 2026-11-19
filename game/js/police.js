// police.js — the Emberfall Bay Police Department: a five-star wanted
// system and everyone it sends after you.
//
// Stars are earned by witnessed crime and lost by staying unseen. One star
// is a patrol car having a look; two is a chase; three brings numbers and
// gunfire; four sets roadblocks across the road ahead; five puts a
// helicopter's spotlight on you, and under that light you are always seen.
// Cops steer for the player's predicted position, rubber-band just enough
// to stay a threat, and arrest by proximity: stop the player, stay close,
// fill the bust meter.

import { AVENUES, STREETS, slideMove, circleHitsSolid } from './city.js';
import { makeCar, carForwardSpeed, drawCar } from './cars.js';
import { clamp, distance, angleDelta } from './rng.js';

export const CRIME_HEAT = {
  'car-theft': 1,
  'assault': 1,
  'hit-and-run': 2,
  'shots-fired': 1,
  'shooting': 2,
  'cop-hit': 2,
  'mission-heat': 1,
};

export class WantedSystem {
  constructor() {
    this.level = 0;
    this.heat = 0; // 0..3, three points of heat raise a star
    this.unseenFor = 0;
    this.seen = false;
  }

  addCrime(kind) {
    const heat = CRIME_HEAT[kind] ?? 1;
    this.heat += heat;
    while (this.heat >= 3 && this.level < 5) {
      this.level++;
      this.heat -= 3;
    }
    if (this.level === 5) this.heat = Math.min(this.heat, 2);
    this.unseenFor = 0;
  }

  forceLevel(level) {
    this.level = clamp(level, 0, 5);
    this.heat = 0;
    this.unseenFor = 0;
  }

  update(dt, seen) {
    this.seen = seen;
    if (this.level === 0) return;
    if (seen) {
      this.unseenFor = 0;
      return;
    }
    this.unseenFor += dt;
    const grace = 7 + this.level * 1.6;
    if (this.unseenFor > grace) {
      this.level--;
      this.unseenFor = 0;
      this.heat = 0;
    }
  }
}

const COPS_BY_LEVEL = [0, 2, 3, 5, 7, 9];

export class PoliceForce {
  constructor() {
    this.cops = [];
    this.helicopter = null;
    this.roadblock = null;
    this.roadblockCooldown = 0;
    this.bustProgress = 0;
    this.lastSeenX = 0;
    this.lastSeenY = 0;
    this.shotTimer = 0;
  }

  desiredCops(wanted) {
    return COPS_BY_LEVEL[wanted.level] ?? 0;
  }

  spawnCop(world, rng, player) {
    // Come from a road just out of sight, never from thin air beside you.
    for (let tries = 0; tries < 10; tries++) {
      const avenue = AVENUES[rng.int(0, AVENUES.length - 1)];
      const street = STREETS[rng.int(0, STREETS.length - 1)];
      const onAvenue = rng.chance(0.5);
      const x = onAvenue ? avenue : clamp(player.x + rng.range(-780, 780), 60, 5060);
      const y = onAvenue ? clamp(player.y + rng.range(-780, 780), 60, 3480) : street;
      const d = distance(x, y, player.x, player.y);
      if (d < 430 || d > 980) continue;
      const cop = makeCar('interceptor', x, y, Math.atan2(player.y - y, player.x - x), rng);
      cop.driver = 'cop';
      cop.searchFor = 0;
      this.cops.push(cop);
      world.cars.push(cop);
      return cop;
    }
    return null;
  }

  update(dt, world, rng) {
    const { wanted, player } = world;
    const px = world.playerPos.x;
    const py = world.playerPos.y;

    // Sight: any cop (or the helicopter) close enough keeps the heat on.
    let seen = false;
    let nearestCopDist = Infinity;
    for (const cop of this.cops) {
      const d = distance(cop.x, cop.y, px, py);
      nearestCopDist = Math.min(nearestCopDist, d);
      const sightRange = player.inCar ? 430 : 265;
      if (d < sightRange) seen = true;
    }
    if (this.helicopter) seen = true;
    if (seen) {
      this.lastSeenX = px;
      this.lastSeenY = py;
    }
    wanted.update(dt, seen);

    // Manpower follows the stars.
    const want = this.desiredCops(wanted);
    while (this.cops.length < want) {
      if (!this.spawnCop(world, rng, world.playerPos)) break;
    }
    if (this.cops.length > want + 2) {
      // Extras peel off and despawn once far away.
      for (let i = this.cops.length - 1; i >= 0 && this.cops.length > want; i--) {
        const cop = this.cops[i];
        if (distance(cop.x, cop.y, px, py) > 700) this.removeCop(world, i);
      }
    }
    if (wanted.level === 0) {
      for (let i = this.cops.length - 1; i >= 0; i--) this.removeCop(world, i);
      this.helicopter = null;
      this.roadblock = null;
      this.bustProgress = 0;
    }

    for (const cop of this.cops) this.driveCop(cop, dt, world, seen);

    // Roadblocks at four stars and up: three cars across the road ahead.
    this.roadblockCooldown -= dt;
    if (wanted.level >= 4 && player.inCar && this.roadblockCooldown <= 0) {
      this.setRoadblock(world, rng);
      this.roadblockCooldown = 22;
    }
    if (this.roadblock) {
      if (distance(this.roadblock.x, this.roadblock.y, px, py) > 900) this.clearRoadblock(world);
    }

    // The helicopter at five stars.
    if (wanted.level >= 5) {
      if (!this.helicopter) this.helicopter = { x: px + 300, y: py - 300, angle: 0 };
      const heli = this.helicopter;
      const desired = Math.atan2(py - heli.y, px - heli.x);
      heli.angle = desired;
      const d = distance(heli.x, heli.y, px, py);
      const speed = d > 60 ? 330 : 120;
      heli.x += Math.cos(desired) * Math.min(speed * dt, d);
      heli.y += Math.sin(desired) * Math.min(speed * dt, d);
    } else {
      this.helicopter = null;
    }

    // Gunfire at three stars and up, when the player is exposed.
    this.shotTimer -= dt;
    if (wanted.level >= 3 && seen && nearestCopDist < 300 && this.shotTimer <= 0) {
      this.shotTimer = 0.85;
      world.onCopShot?.(nearestCopDist);
    }

    // The bust meter: stopped and surrounded means arrested.
    const playerSpeed = world.playerSpeed;
    if (wanted.level > 0 && nearestCopDist < 64 && playerSpeed < 26) {
      this.bustProgress = clamp(this.bustProgress + dt / 2.6, 0, 1);
    } else {
      this.bustProgress = clamp(this.bustProgress - dt / 1.4, 0, 1);
    }
    world.sound.setSiren(wanted.level > 0 && nearestCopDist < 620, clamp(nearestCopDist / 620, 0, 1));
    return { seen, nearestCopDist };
  }

  driveCop(cop, dt, world, seen) {
    const targetX = seen || world.wanted.level <= 1 ? world.playerPos.x : this.lastSeenX;
    const targetY = seen || world.wanted.level <= 1 ? world.playerPos.y : this.lastSeenY;
    // Aim where the player will be, not where they are.
    const lead = clamp(distance(cop.x, cop.y, targetX, targetY) / 340, 0, 0.55);
    const aimX = targetX + world.playerVel.x * lead;
    const aimY = targetY + world.playerVel.y * lead;
    let desired = Math.atan2(aimY - cop.y, aimX - cop.x);
    // Feel for walls: if a building blocks the line, swing around it.
    const probeX = cop.x + Math.cos(cop.angle) * 52;
    const probeY = cop.y + Math.sin(cop.angle) * 52;
    if (circleHitsSolid(world.city, probeX, probeY, 10)) {
      desired = cop.angle + (angleDelta(cop.angle, desired) > 0 ? 1.15 : -1.15);
    }
    cop.angle += clamp(angleDelta(cop.angle, desired), -3.1 * dt, 3.1 * dt);
    const d = distance(cop.x, cop.y, targetX, targetY);
    let targetSpeed = cop.spec.topSpeed * (d > 520 ? 1.04 : 0.97);
    if (!seen && d < 60) targetSpeed = 60; // searching the last known spot
    if (d < 40) targetSpeed = 30;
    const forward = carForwardSpeed(cop);
    const accel = targetSpeed > forward ? cop.spec.accel : cop.spec.accel * 1.5;
    const newForward = forward + clamp(targetSpeed - forward, -accel * dt, accel * dt);
    cop.vx = Math.cos(cop.angle) * newForward;
    cop.vy = Math.sin(cop.angle) * newForward;
    cop.speed = newForward;
    const hit = slideMove(world.city, cop, cop.vx * dt, cop.vy * dt);
    if (hit && Math.abs(newForward) > 120) {
      cop.health -= 3;
      world.onCarCrash?.(cop, 0.25, cop.x, cop.y);
      cop.vx *= -0.2;
      cop.vy *= -0.2;
    }
    // Cops shove and get shoved like any car.
    for (const other of world.cars) {
      if (other === cop) continue;
      const dd = distance(cop.x, cop.y, other.x, other.y);
      const min = cop.r + other.r - 4;
      if (dd <= 0.01 || dd >= min) continue;
      const nx = (other.x - cop.x) / dd;
      const ny = (other.y - cop.y) / dd;
      other.x += nx * (min - dd) * 0.6;
      other.y += ny * (min - dd) * 0.6;
      if (other === world.playerCar) world.onCopRam?.(Math.abs(newForward));
    }
  }

  setRoadblock(world, rng) {
    this.clearRoadblock(world);
    const player = world.playerPos;
    const vel = world.playerVel;
    const aheadX = player.x + vel.x * 1.6;
    const aheadY = player.y + vel.y * 1.6;
    const cars = [];
    // A line across whichever road the player is racing along.
    const horizontal = Math.abs(vel.x) > Math.abs(vel.y);
    for (let i = -1; i <= 1; i++) {
      const x = horizontal ? aheadX : aheadX + i * 38;
      const y = horizontal ? aheadY + i * 38 : aheadY;
      const cop = makeCar('interceptor', x, y, horizontal ? Math.PI / 2 : 0, rng);
      cop.driver = 'roadblock';
      cars.push(cop);
      world.cars.push(cop);
    }
    this.roadblock = { x: aheadX, y: aheadY, cars };
  }

  clearRoadblock(world) {
    if (!this.roadblock) return;
    for (const cop of this.roadblock.cars) {
      const idx = world.cars.indexOf(cop);
      if (idx !== -1) world.cars.splice(idx, 1);
    }
    this.roadblock = null;
  }

  removeCop(world, index) {
    const cop = this.cops[index];
    const carIdx = world.cars.indexOf(cop);
    if (carIdx !== -1) world.cars.splice(carIdx, 1);
    this.cops.splice(index, 1);
  }

  drawHelicopter(ctx, night) {
    const heli = this.helicopter;
    if (!heli) return;
    // The spotlight first: a bright pool the player cannot hide from.
    ctx.save();
    const grad = ctx.createRadialGradient(heli.x, heli.y, 10, heli.x, heli.y, 120);
    grad.addColorStop(0, night ? 'rgba(255,246,200,0.34)' : 'rgba(255,246,200,0.16)');
    grad.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(heli.x, heli.y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The aircraft itself, offset up-left as if at altitude.
    ctx.save();
    ctx.translate(heli.x - 46, heli.y - 52);
    ctx.rotate(heli.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(14, 16, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#232a33';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-38, -2.4, 22, 4.8);
    ctx.fillRect(-40, -8, 4, 16);
    ctx.fillStyle = '#39434f';
    ctx.beginPath();
    ctx.arc(6, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    // Rotor blur.
    ctx.strokeStyle = 'rgba(220,228,238,0.5)';
    ctx.lineWidth = 2;
    const sweep = performance.now() / 24;
    ctx.beginPath();
    ctx.moveTo(Math.cos(sweep) * 30, Math.sin(sweep) * 30);
    ctx.lineTo(-Math.cos(sweep) * 30, -Math.sin(sweep) * 30);
    ctx.stroke();
    ctx.restore();
  }
}

export { drawCar };
