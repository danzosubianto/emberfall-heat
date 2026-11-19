// fx.js — the juice: particles, screen shake, skid marks and the day/night cycle.
//
// Nothing in here decides gameplay; everything in here decides how the game
// feels. Dust when a tyre breaks loose, sparks on a scrape, smoke from a
// dying engine, a flash when a shot is fired, and a sun that crosses the sky
// and drags the whole palette from dawn gold to neon night.

import { clamp, lerp } from './rng.js';

export class ParticleField {
  constructor() {
    this.particles = [];
  }

  spawn(x, y, options) {
    const count = options.count ?? 1;
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 900) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = (options.speed ?? 40) * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed + (options.vx ?? 0),
        vy: Math.sin(angle) * speed + (options.vy ?? 0),
        life: 0,
        ttl: (options.ttl ?? 0.6) * (0.6 + Math.random() * 0.8),
        size: (options.size ?? 3) * (0.6 + Math.random() * 0.8),
        color: options.color ?? '#ffb347',
        drag: options.drag ?? 2.2,
        grow: options.grow ?? 0,
        gravity: options.gravity ?? 0,
      });
    }
  }

  burstDust(x, y, strength = 1) {
    this.spawn(x, y, {
      count: Math.round(7 * strength),
      color: '#c9b18a',
      speed: 55,
      ttl: 0.7,
      size: 4,
      grow: 7,
    });
  }

  burstSparks(x, y, strength = 1) {
    this.spawn(x, y, {
      count: Math.round(10 * strength),
      color: '#ffd76a',
      speed: 190,
      ttl: 0.32,
      size: 2,
      gravity: 260,
    });
  }

  burstSmoke(x, y, strength = 1) {
    this.spawn(x, y, {
      count: Math.round(3 * strength),
      color: '#3a3f46',
      speed: 22,
      ttl: 1.4,
      size: 6,
      grow: 11,
      vy: -18,
    });
  }

  burstPickupGlow(x, y) {
    this.spawn(x, y, { count: 14, color: '#ff9a3c', speed: 80, ttl: 0.5, size: 3 });
    this.spawn(x, y, { count: 8, color: '#ffe9b0', speed: 46, ttl: 0.7, size: 2 });
  }

  update(dt) {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        list.splice(i, 1);
        continue;
      }
      const dragK = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragK;
      p.vy = p.vy * dragK + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const t = p.life / p.ttl;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export class ScreenShake {
  constructor() {
    this.trauma = 0;
    this.x = 0;
    this.y = 0;
  }

  add(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 14;
    this.x = (Math.random() * 2 - 1) * s;
    this.y = (Math.random() * 2 - 1) * s;
  }
}

// Skid marks live in world space and fade slowly; a capped ring buffer keeps
// the memory flat on long sessions.
export class SkidTrails {
  constructor(capacity = 700) {
    this.capacity = capacity;
    this.marks = [];
  }

  add(x, y, angle, strength) {
    if (this.marks.length >= this.capacity) this.marks.shift();
    this.marks.push({ x, y, angle, strength, age: 0 });
  }

  update(dt) {
    for (const m of this.marks) m.age += dt;
    while (this.marks.length && this.marks[0].age > 26) this.marks.shift();
  }

  draw(ctx) {
    ctx.fillStyle = '#14161a';
    for (const m of this.marks) {
      ctx.globalAlpha = clamp(0.5 * m.strength * (1 - m.age / 26), 0, 0.5);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillRect(-2.4, -5, 4.8, 10);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// The day/night cycle: minutes since midnight, advanced by the main loop.
// daylightAt() shapes every tint the renderer applies.
export class DayCycle {
  constructor(startMinutes = 9 * 60 + 30) {
    this.minutes = startMinutes;
    this.minutesPerSecond = 2.4; // a full day in ten minutes of play
  }

  update(dt) {
    this.minutes = (this.minutes + dt * this.minutesPerSecond) % (24 * 60);
  }

  // 0 at deep night, 1 at midday.
  daylight() {
    const h = this.minutes / 60;
    if (h < 5) return 0.06;
    if (h < 7.5) return lerp(0.06, 1, (h - 5) / 2.5);
    if (h < 17.5) return 1;
    if (h < 20) return lerp(1, 0.06, (h - 17.5) / 2.5);
    return 0.06;
  }

  isNight() {
    return this.daylight() < 0.45;
  }

  // Colour the darkness is painted with: blue-black at night, warm at dusk.
  nightTint() {
    const h = this.minutes / 60;
    if ((h >= 17.5 && h < 20.5) || (h >= 4.5 && h < 7)) return 'rgba(38, 20, 44, ';
    return 'rgba(8, 12, 34, ';
  }

  overlayAlpha() {
    return clamp((1 - this.daylight()) * 0.62, 0, 0.62);
  }
}
