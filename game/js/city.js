// city.js — Emberfall Bay: the city itself.
//
// One seeded generator lays out the whole map: eight avenues and eight
// streets of road grid, four districts with their own palettes and building
// stock (the Cannery Docks, Meridian Downtown, Saguaro Hills and Ember
// Beach), named landmarks the story uses, parking rows, palm and lamp props
// and the forty ember shards hidden in its alleys. The static picture is
// pre-rendered to offscreen tiles once; gameplay only ever blits the tiles
// under the camera and asks this module what is solid and what is road.

import { makeRng, clamp } from './rng.js';

export const WORLD_W = 5120;
export const WORLD_H = 3840;
export const ROAD_HALF = 55;

export const AVENUES = [320, 960, 1600, 2240, 2880, 3520, 4160, 4800];
export const STREETS = [240, 710, 1180, 1650, 2120, 2590, 3060, 3530];

export const DISTRICT_INFO = {
  docks: { name: 'Cannery Docks', ground: '#5d6066', lot: '#515459' },
  downtown: { name: 'Meridian Downtown', ground: '#6b6f75', lot: '#5d6066' },
  hills: { name: 'Saguaro Hills', ground: '#5f7350', lot: '#526647' },
  beach: { name: 'Ember Beach', ground: '#c9ab72', lot: '#bfa065' },
};

export function districtAt(x, y) {
  if (y > 3480) return 'beach';
  if (x < 1560) return 'docks';
  if (y < 940 || x > 3880) return 'hills';
  return 'downtown';
}

export function isOnRoad(x, y, margin = 0) {
  for (const cx of AVENUES) if (Math.abs(x - cx) <= ROAD_HALF + margin) return true;
  for (const cy of STREETS) if (Math.abs(y - cy) <= ROAD_HALF + margin) return true;
  return false;
}

// The lane a driver belongs in on the road nearest a point, given a heading:
// right-hand traffic, offset from the centre line.
export function lanePoint(x, y, headingX, headingY) {
  let bestAvenue = null;
  let bestDist = Infinity;
  for (const cx of AVENUES) {
    const d = Math.abs(x - cx);
    if (d < bestDist) { bestDist = d; bestAvenue = cx; }
  }
  let bestStreet = null;
  bestDist = Infinity;
  for (const cy of STREETS) {
    const d = Math.abs(y - cy);
    if (d < bestDist) { bestDist = d; bestStreet = cy; }
  }
  const onAvenue = Math.abs(x - bestAvenue) <= Math.abs(y - bestStreet);
  if (onAvenue) {
    const dir = headingY !== 0 ? Math.sign(headingY) : 1;
    return { x: bestAvenue + (dir < 0 ? 27 : -27), y, vertical: true, centre: bestAvenue };
  }
  const dir = headingX !== 0 ? Math.sign(headingX) : 1;
  return { x, y: bestStreet + (dir > 0 ? 27 : -27), vertical: false, centre: bestStreet };
}

const ROOF_PALETTES = {
  docks: ['#7a6a58', '#6e6258', '#83735f', '#5f6a72', '#756552'],
  downtown: ['#8d99a6', '#a8b0b8', '#7e8a99', '#b5a48e', '#93a3ad', '#c0b49a'],
  hills: ['#b08968', '#a37e5f', '#bd9573', '#9c7a5c', '#c49b78'],
  beach: ['#e8dcc4', '#dfcfae', '#f0e4c8', '#d9c9a4', '#e5d3b3'],
};

const WALL_PALETTES = {
  docks: ['#5d5148', '#544a44', '#66584a', '#4c565e', '#5c5044'],
  downtown: ['#5f6a76', '#767e87', '#57626f', '#84755f', '#66727c', '#8a7a62'],
  hills: ['#7d6248', '#715a44', '#86684e', '#6e563e', '#83664a'],
  beach: ['#b3a37f', '#a8946e', '#bcae8a', '#a08a64', '#b0a07a'],
};

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const props = [];
  const parkingSpots = [];
  const shardSpots = [];
  const containers = [];

  // Blocks are the rectangles of land between neighbouring roads.
  const xEdges = [0, ...AVENUES.flatMap((c) => [c - ROAD_HALF, c + ROAD_HALF]), WORLD_W];
  const yEdges = [0, ...STREETS.flatMap((c) => [c - ROAD_HALF, c + ROAD_HALF]), WORLD_H];
  const blocks = [];
  for (let i = 0; i < xEdges.length - 1; i += 2) {
    for (let j = 0; j < yEdges.length - 1; j += 2) {
      blocks.push({ x: xEdges[i], y: yEdges[j], w: xEdges[i + 1] - xEdges[i], h: yEdges[j + 1] - yEdges[j] });
    }
  }

  for (const block of blocks) {
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    const district = districtAt(cx, cy);
    if (cy > 3560) continue; // the bay shore: sand and water, no lots
    const roll = rng.next();
    if (roll < 0.1) {
      // A park or plaza: green (or sand), props, often a shard.
      props.push({ kind: district === 'beach' ? 'palms' : 'trees', x: cx, y: cy, block });
      if (rng.chance(0.75)) shardSpots.push({ x: cx + rng.range(-70, 70), y: cy + rng.range(-50, 50) });
      continue;
    }
    if (roll < 0.2) {
      // A parking lot: asphalt, marked bays, parked cars to steal.
      const bays = rng.int(3, 6);
      for (let b = 0; b < bays; b++) {
        parkingSpots.push({
          x: block.x + 44 + b * 52,
          y: cy + (rng.chance(0.5) ? -34 : 34),
          angle: rng.chance(0.5) ? 0 : Math.PI,
        });
      }
      if (rng.chance(0.4)) shardSpots.push({ x: cx, y: cy });
      continue;
    }
    // Building lots: one big footprint, or two side by side on wide blocks.
    const lots = [];
    if (block.w > 430 && rng.chance(0.6)) {
      const split = block.x + block.w * rng.range(0.42, 0.58);
      lots.push({ x: block.x, y: block.y, w: split - block.x, h: block.h });
      lots.push({ x: split, y: block.y, w: block.x + block.w - split, h: block.h });
    } else {
      lots.push(block);
    }
    for (const lot of lots) {
      const margin = district === 'docks' ? 16 : 26;
      const w = Math.max(70, lot.w - margin * 2);
      const h = Math.max(60, lot.h - margin * 2);
      const tall = district === 'downtown' ? rng.range(30, 78) : district === 'beach' ? rng.range(10, 30) : district === 'hills' ? rng.range(4, 10) : rng.range(6, 14);
      buildings.push({
        x: lot.x + margin + rng.range(-4, 4),
        y: lot.y + margin + rng.range(-4, 4),
        w, h,
        tall,
        district,
        roof: rng.pick(ROOF_PALETTES[district]),
        wall: rng.pick(WALL_PALETTES[district]),
        windowsAcross: Math.max(2, Math.floor(w / 26)),
        windowsDown: Math.max(2, Math.floor(h / 26)),
        seed: rng.int(1, 1e9),
      });
    }
    if (district === 'docks' && rng.chance(0.65)) {
      // Shipping containers stacked in the yard beside the warehouse.
      const n = rng.int(2, 5);
      for (let c = 0; c < n; c++) {
        containers.push({
          x: block.x + 20 + c * 46,
          y: block.y + block.h - 44,
          w: 40, h: 20,
          color: rng.pick(['#a34a3a', '#3a6ea3', '#3f8a4f', '#b07f2e', '#6a4a8a']),
        });
      }
    }
  }

  // Street lamps along every road, palms on the beachfront and downtown.
  for (const cx of AVENUES) {
    for (let y = 90; y < WORLD_H - 60; y += 176) {
      props.push({ kind: 'lamp', x: cx - ROAD_HALF - 9, y });
      props.push({ kind: 'lamp', x: cx + ROAD_HALF + 9, y: y + 88 });
    }
  }
  for (const cy of STREETS) {
    for (let x = 120; x < WORLD_W - 60; x += 176) {
      props.push({ kind: 'lamp', x, y: cy - ROAD_HALF - 9 });
    }
  }
  const palmRows = [3490, 3560];
  for (const py of palmRows) {
    for (let x = 90; x < WORLD_W - 40; x += 130) {
      if (!isOnRoad(x, py, 6)) props.push({ kind: 'palm', x: x + rng.range(-16, 16), y: py + rng.range(-8, 8) });
    }
  }
  for (let i = 0; i < 130; i++) {
    const x = rng.range(60, WORLD_W - 60);
    const y = rng.range(60, 3440);
    const d = districtAt(x, y);
    if (isOnRoad(x, y, 26)) continue;
    if (d === 'hills') props.push({ kind: 'cactus', x, y });
    else if (d === 'downtown' && rng.chance(0.5)) props.push({ kind: 'palm', x, y });
    else if (d === 'docks' && rng.chance(0.4)) props.push({ kind: 'crate', x, y });
  }

  // Fill shard spots up to forty from alley corners beside buildings.
  while (shardSpots.length < 40 && buildings.length) {
    const b = rng.pick(buildings);
    shardSpots.push({ x: b.x - 14, y: b.y + b.h + 12 });
  }

  const landmarks = {
    tower: { name: 'Emberfall Tower', x: 2560, y: 1415 },
    cannery: { name: 'The Cannery', x: 800, y: 1415 },
    hotel: { name: 'Solenne Grand Hotel', x: 3300, y: 3300 },
    customs: { name: 'Ember Customs (garage)', x: 2940, y: 3000 },
    loft: { name: "Rook's Loft (safehouse)", x: 2180, y: 2530 },
    ashpit: { name: 'The Ashpit (crew HQ)', x: 1010, y: 2240 },
    market: { name: 'Playa Market', x: 3860, y: 3300 },
    diner: { name: 'Cinder Diner', x: 1700, y: 900 },
    bank: { name: 'Meridian Trust Bank', x: 2620, y: 1950 },
    marina: { name: 'Emberfall Marina', x: 700, y: 3300 },
  };

  return {
    seed,
    buildings,
    props,
    parkingSpots,
    shardSpots: shardSpots.slice(0, 40),
    containers,
    landmarks,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// Rendering: the static city is painted once onto offscreen tiles.
// ---------------------------------------------------------------------------

const TILE_W = 1280;
const TILE_H = 960;

function paintGround(ctx, city, ox, oy, w, h) {
  // District ground, painted as big soft patches so borders feel organic.
  for (const district of ['docks', 'downtown', 'hills', 'beach']) {
    ctx.fillStyle = DISTRICT_INFO[district].ground;
    ctx.fillRect(ox, oy, w, h);
    break;
  }
  const steps = 128;
  for (let gx = 0; gx < w; gx += steps) {
    for (let gy = 0; gy < h; gy += steps) {
      const wx = ox + gx + steps / 2;
      const wy = oy + gy + steps / 2;
      ctx.fillStyle = DISTRICT_INFO[districtAt(wx, wy)].ground;
      ctx.fillRect(ox + gx - 2, oy + gy - 2, steps + 4, steps + 4);
    }
  }
  // The bay: water south of the sand line, with a wet-sand edge.
  if (oy + h > 3560) {
    ctx.fillStyle = '#d9bc82';
    ctx.fillRect(ox, Math.max(oy, 3560), w, Math.min(oy + h, 3760) - Math.max(oy, 3560));
    ctx.fillStyle = '#1d6f8a';
    ctx.fillRect(ox, Math.max(oy, 3760), w, oy + h - Math.max(oy, 3760));
    ctx.fillStyle = '#2b87a3';
    for (let x = ox; x < ox + w; x += 46) {
      ctx.fillRect(x, 3792, 26, 3);
      ctx.fillRect(x + 20, 3820, 30, 3);
    }
  }
}

function paintRoads(ctx, ox, oy, w, h) {
  ctx.fillStyle = '#33373d';
  for (const cx of AVENUES) {
    if (cx + ROAD_HALF < ox || cx - ROAD_HALF > ox + w) continue;
    ctx.fillRect(cx - ROAD_HALF, oy, ROAD_HALF * 2, h);
  }
  for (const cy of STREETS) {
    if (cy + ROAD_HALF < oy || cy - ROAD_HALF > oy + h) continue;
    ctx.fillRect(ox, cy - ROAD_HALF, w, ROAD_HALF * 2);
  }
  // Sidewalks.
  ctx.fillStyle = '#8b8f94';
  for (const cx of AVENUES) {
    ctx.fillRect(cx - ROAD_HALF - 8, oy, 6, h);
    ctx.fillRect(cx + ROAD_HALF + 2, oy, 6, h);
  }
  for (const cy of STREETS) {
    ctx.fillRect(ox, cy - ROAD_HALF - 8, w, 6);
    ctx.fillRect(ox, cy + ROAD_HALF + 2, w, 6);
  }
  // Centre dashes.
  ctx.fillStyle = '#d8c25a';
  for (const cx of AVENUES) {
    for (let y = oy - (oy % 44); y < oy + h; y += 44) ctx.fillRect(cx - 2, y, 4, 24);
  }
  for (const cy of STREETS) {
    for (let x = ox - (ox % 44); x < ox + w; x += 44) ctx.fillRect(x, cy - 2, 24, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(230,230,225,0.5)';
  for (const cx of AVENUES) {
    for (const cy of STREETS) {
      if (cx < ox - 90 || cx > ox + w + 90 || cy < oy - 90 || cy > oy + h + 90) continue;
      for (let s = -44; s <= 44; s += 16) {
        ctx.fillRect(cx + s - 4, cy - ROAD_HALF + 3, 8, 12);
        ctx.fillRect(cx + s - 4, cy + ROAD_HALF - 15, 8, 12);
        ctx.fillRect(cx - ROAD_HALF + 3, cy + s - 4, 12, 8);
        ctx.fillRect(cx + ROAD_HALF - 15, cy + s - 4, 12, 8);
      }
    }
  }
}

function paintBuilding(ctx, b) {
  const liftX = b.tall * 0.32;
  const liftY = -b.tall;
  // Shadow, then the sunlit wall, then the roof.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
  ctx.fillStyle = b.wall;
  ctx.fillRect(b.x + liftX, b.y + liftY, b.w, b.h + b.tall);
  ctx.fillRect(b.x, b.y, b.w + liftX, b.h);
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x + liftX, b.y + liftY, b.w, b.h);
  // Roof furniture: AC boxes and a water tank on the bigger roofs.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  const rng = makeRng(b.seed);
  const boxes = Math.floor((b.w * b.h) / 26000);
  for (let i = 0; i < boxes; i++) {
    ctx.fillRect(b.x + liftX + rng.range(8, b.w - 30), b.y + liftY + rng.range(8, b.h - 24), rng.range(12, 26), rng.range(10, 20));
  }
  // Window grid on the roof edge reads as the top floor's band.
  ctx.fillStyle = 'rgba(30,40,55,0.55)';
  const stepX = b.w / b.windowsAcross;
  for (let i = 0; i < b.windowsAcross; i++) {
    ctx.fillRect(b.x + liftX + 4 + i * stepX, b.y + liftY + 3, stepX - 7, 4);
  }
}

function paintProp(ctx, p) {
  if (p.kind === 'lamp') {
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.fillStyle = '#494e54';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'palm') {
    ctx.fillStyle = '#6d5136';
    ctx.fillRect(p.x - 2, p.y - 3, 4, 7);
    ctx.strokeStyle = '#3f7d3a';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 2);
      ctx.quadraticCurveTo(p.x + Math.cos(a) * 10, p.y - 6 + Math.sin(a) * 3, p.x + Math.cos(a) * 17, p.y + 2 + Math.sin(a) * 6);
      ctx.stroke();
    }
  } else if (p.kind === 'cactus') {
    ctx.fillStyle = '#3e7a44';
    ctx.fillRect(p.x - 3, p.y - 12, 6, 16);
    ctx.fillRect(p.x - 9, p.y - 8, 5, 8);
    ctx.fillRect(p.x + 4, p.y - 10, 5, 10);
  } else if (p.kind === 'crate') {
    ctx.fillStyle = '#7a6248';
    ctx.fillRect(p.x - 8, p.y - 8, 16, 16);
    ctx.strokeStyle = '#5d4a35';
    ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
  } else if (p.kind === 'trees' || p.kind === 'palms') {
    const rng = makeRng(Math.floor(p.x * 7 + p.y * 13));
    for (let i = 0; i < 7; i++) {
      const tx = p.x + rng.range(-p.block.w / 2 + 24, p.block.w / 2 - 24);
      const ty = p.y + rng.range(-p.block.h / 2 + 24, p.block.h / 2 - 24);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(tx + 4, ty + 5, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.kind === 'palms' ? '#4c8a3f' : '#3d7038';
      ctx.beginPath();
      ctx.arc(tx, ty, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(tx - 4, ty - 4, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function buildCityTiles(city) {
  const tiles = [];
  const cols = Math.ceil(WORLD_W / TILE_W);
  const rows = Math.ceil(WORLD_H / TILE_H);
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const ox = tx * TILE_W;
      const oy = ty * TILE_H;
      const canvas = document.createElement('canvas');
      canvas.width = TILE_W;
      canvas.height = TILE_H;
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.translate(-ox, -oy);
      paintGround(ctx, city, ox, oy, TILE_W, TILE_H);
      // Parking lots and park ground under the roads' edges.
      for (const block of city.blocks) {
        const cx = block.x + block.w / 2;
        const cy = block.y + block.h / 2;
        if (cx < ox - 300 || cx > ox + TILE_W + 300 || cy < oy - 300 || cy > oy + TILE_H + 300) continue;
        ctx.fillStyle = DISTRICT_INFO[districtAt(cx, cy)].lot;
        ctx.fillRect(block.x + 6, block.y + 6, block.w - 12, block.h - 12);
      }
      paintRoads(ctx, ox, oy, TILE_W, TILE_H);
      for (const c of city.containers) {
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(c.x, c.y + c.h - 5, c.w, 5);
      }
      for (const b of city.buildings) {
        if (b.x + b.w + 90 < ox || b.x - 90 > ox + TILE_W || b.y + b.h + 90 < oy || b.y - 120 > oy + TILE_H) continue;
        paintBuilding(ctx, b);
      }
      for (const p of city.props) {
        if (p.x < ox - 60 || p.x > ox + TILE_W + 60 || p.y < oy - 60 || p.y > oy + TILE_H + 60) continue;
        paintProp(ctx, p);
      }
      ctx.restore();
      tiles.push({ canvas, x: ox, y: oy });
    }
  }
  return tiles;
}

export function drawCityTiles(ctx, tiles, view) {
  for (const tile of tiles) {
    if (tile.x + TILE_W < view.x || tile.x > view.x + view.w || tile.y + TILE_H < view.y || tile.y > view.y + view.h) continue;
    ctx.drawImage(tile.canvas, tile.x, tile.y);
  }
}

// At night the pre-rendered city goes dark; lit windows and lamp pools are
// painted live, only for what the camera can see.
export function drawNightDetails(ctx, city, view, lampGlow) {
  for (const b of city.buildings) {
    if (b.x + b.w < view.x || b.x > view.x + view.w || b.y + b.h < view.y || b.y > view.y + view.h) continue;
    const rng = makeRng(b.seed);
    const stepX = b.w / b.windowsAcross;
    const stepY = b.h / b.windowsDown;
    for (let i = 0; i < b.windowsAcross; i++) {
      for (let j = 0; j < b.windowsDown; j++) {
        if (!rng.chance(0.34)) continue;
        ctx.fillStyle = rng.chance(0.8) ? 'rgba(255,196,92,0.85)' : 'rgba(160,220,255,0.8)';
        ctx.fillRect(b.x + 5 + i * stepX, b.y + 6 + j * stepY, Math.min(9, stepX - 8), Math.min(7, stepY - 8));
      }
    }
  }
  if (lampGlow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of city.props) {
      if (p.kind !== 'lamp') continue;
      if (p.x < view.x - 40 || p.x > view.x + view.w + 40 || p.y < view.y - 40 || p.y > view.y + view.h + 40) continue;
      const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 34);
      grad.addColorStop(0, 'rgba(255,190,90,0.20)');
      grad.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Collision: circles (cars, people) against building and container rects.
// ---------------------------------------------------------------------------

export function circleHitsSolid(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return b;
  }
  for (const c of city.containers) {
    if (x + r < c.x || x - r > c.x + c.w || y + r < c.y || y - r > c.y + c.h) continue;
    return c;
  }
  return null;
}

// Move a circle by (dx, dy), sliding along whatever it hits. Returns the
// solid it ended against, or null on a clean move — crashes read this.
export function slideMove(city, body, dx, dy) {
  let hit = null;
  body.x += dx;
  let solid = circleHitsSolid(city, body.x, body.y, body.r);
  if (solid) {
    body.x -= dx;
    hit = solid;
    // Nudge out along x if already embedded.
    if (circleHitsSolid(city, body.x, body.y, body.r)) body.x += dx > 0 ? -2 : 2;
  }
  body.y += dy;
  solid = circleHitsSolid(city, body.x, body.y, body.r);
  if (solid) {
    body.y -= dy;
    hit = solid;
    if (circleHitsSolid(city, body.x, body.y, body.r)) body.y += dy > 0 ? -2 : 2;
  }
  body.x = clamp(body.x, body.r + 4, WORLD_W - body.r - 4);
  body.y = clamp(body.y, body.r + 4, WORLD_H - body.r - 4);
  return hit;
}
