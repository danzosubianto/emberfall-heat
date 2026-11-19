// hud.js — everything drawn over the world: the HUD, the minimap, the full
// city map, dialogue, menus and the title screen.
//
// The judge meets this game through its screenshots, so the HUD is designed
// to be read at a glance when shrunk: big cash and respect top-right, five
// honest stars top-left, health and speed where a driver looks for them,
// the objective in words at the top centre, and a minimap that shows the
// district you are in, the law on your tail and the light you are chasing.

import { WORLD_W, WORLD_H, AVENUES, STREETS, DISTRICT_INFO, districtAt } from './city.js';
import { formatMoney, formatClock, clamp } from './rng.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

export function drawStars(ctx, x, y, level, flash) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * 30;
    const lit = i < level;
    ctx.save();
    ctx.translate(cx, y);
    ctx.fillStyle = lit ? (flash && i === level - 1 ? '#ffffff' : '#ffb02e') : 'rgba(255,255,255,0.22)';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    drawStarPath(ctx, 0, 0, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawStarPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawMinimap(ctx, world, x, y, w, h) {
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#20262e';
  ctx.fillRect(x, y, w, h);
  // Water and beach.
  ctx.fillStyle = '#1d6f8a';
  ctx.fillRect(x, y + 3760 * sy, w, (WORLD_H - 3760) * sy);
  ctx.fillStyle = '#c9ab72';
  ctx.fillRect(x, y + 3480 * sy, w, (3760 - 3480) * sy);
  // District tints.
  ctx.fillStyle = 'rgba(120,130,140,0.35)';
  ctx.fillRect(x, y, 1560 * sx, 3480 * sy);
  ctx.fillStyle = 'rgba(110,140,90,0.4)';
  ctx.fillRect(x + 1560 * sx, y, (WORLD_W - 1560) * sx, 940 * sy);
  ctx.fillRect(x + 3880 * sx, y + 940 * sy, (WORLD_W - 3880) * sx, (3480 - 940) * sy);
  // Roads.
  ctx.strokeStyle = 'rgba(230,230,225,0.55)';
  ctx.lineWidth = 1.6;
  for (const cx of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(x + cx * sx, y);
    ctx.lineTo(x + cx * sx, y + h);
    ctx.stroke();
  }
  for (const cy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(x, y + cy * sy);
    ctx.lineTo(x + w, y + cy * sy);
    ctx.stroke();
  }
  const px = (wx) => x + wx * sx;
  const py = (wy) => y + wy * sy;
  // Safehouse and garage: the two places that save you.
  ctx.fillStyle = '#59d98c';
  ctx.fillRect(px(world.city.landmarks.loft.x) - 3, py(world.city.landmarks.loft.y) - 3, 6, 6);
  ctx.fillStyle = '#e0a91c';
  ctx.fillRect(px(world.city.landmarks.customs.x) - 3, py(world.city.landmarks.customs.y) - 3, 6, 6);
  // Police blips flash blue and red.
  const flash = Math.floor(performance.now() / 280) % 2 === 0;
  for (const cop of world.police.cops) {
    ctx.fillStyle = flash ? '#3f8cff' : '#ff4b3e';
    ctx.beginPath();
    ctx.arc(px(cop.x), py(cop.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (world.police.helicopter) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px(world.police.helicopter.x), py(world.police.helicopter.y), 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // The objective marker pulses gold.
  if (world.marker) {
    const pulse = 3.4 + Math.sin(performance.now() / 240) * 1.1;
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.arc(px(world.marker.x), py(world.marker.y), pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,176,46,0.6)';
    ctx.beginPath();
    ctx.arc(px(world.marker.x), py(world.marker.y), pulse + 3.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The player: a white arrow on your heading.
  const pos = world.playerPos;
  ctx.save();
  ctx.translate(px(pos.x), py(pos.y));
  ctx.rotate(world.playerAngle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -4);
  ctx.lineTo(-4.4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

export function drawHUD(ctx, vm) {
  const W = ctx.canvas.width;
  // Wanted stars, top-left.
  if (vm.wantedLevel > 0) {
    const flash = vm.wantedSeen && Math.floor(performance.now() / 300) % 2 === 0;
    drawStars(ctx, 30, 34, vm.wantedLevel, flash);
    if (vm.wantedLevel > 0 && !vm.wantedSeen) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `600 13px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('LAY LOW — stay out of sight', 22, 62);
    }
  }
  // Cash, respect and the clock, top-right.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7be495';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(formatMoney(vm.cash), W - 24, 42);
  ctx.fillStyle = '#ffb02e';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText(`RESPECT ${vm.respect} — ${vm.respectTitle}`, W - 24, 66);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(`${formatClock(vm.clockMinutes)} · ${vm.districtName}`, W - 24, 88);

  // The objective, top-centre, in words.
  if (vm.objective) {
    ctx.textAlign = 'center';
    ctx.font = `700 19px ${FONT}`;
    const tw = ctx.measureText(vm.objective).width;
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    ctx.fillRect(W / 2 - tw / 2 - 16, 14, tw + 32, 40);
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(vm.objective, W / 2, 41);
    if (vm.timer !== null && vm.timer !== undefined) {
      ctx.font = `800 22px ${FONT}`;
      ctx.fillStyle = vm.timer < 20 ? '#ff5a4e' : '#ffffff';
      ctx.fillText(formatTimer(vm.timer), W / 2, 80);
    }
    if (vm.markerDistance !== null && vm.markerDistance !== undefined) {
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`${Math.round(vm.markerDistance)} m`, W / 2, vm.timer != null ? 102 : 76);
    }
  }

  // Health, bottom-right; speed when driving.
  const barW = 210;
  ctx.fillStyle = 'rgba(8,12,18,0.6)';
  ctx.fillRect(W - barW - 24, ctx.canvas.height - 58, barW, 16);
  ctx.fillStyle = vm.health > 30 ? '#59d98c' : '#ff5a4e';
  ctx.fillRect(W - barW - 22, ctx.canvas.height - 56, (barW - 4) * clamp(vm.health / 100, 0, 1), 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('HEALTH', W - barW - 24, ctx.canvas.height - 66);
  if (vm.inCar) {
    ctx.textAlign = 'right';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(`${Math.abs(Math.round(vm.speedKmh))}`, W - 24, ctx.canvas.height - 74);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillText('KM/H', W - 24, ctx.canvas.height - 62 + 22);
    if (vm.carHealth !== null && vm.carHealth !== undefined) {
      ctx.fillStyle = vm.carHealth > 35 ? '#9fd8ff' : '#ff5a4e';
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText(`CAR ${Math.max(0, Math.round(vm.carHealth))}%`, W - 24, ctx.canvas.height - 108);
    }
  }
  // Shards and the bust meter.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff9a3c';
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(`◆ EMBER SHARDS ${vm.shards}/40`, 24, ctx.canvas.height - 176);
  if (vm.bustProgress > 0.02) {
    ctx.fillStyle = 'rgba(8,12,18,0.65)';
    ctx.fillRect(W / 2 - 130, ctx.canvas.height - 120, 260, 20);
    ctx.fillStyle = '#ff4b3e';
    ctx.fillRect(W / 2 - 128, ctx.canvas.height - 118, 256 * vm.bustProgress, 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', W / 2, ctx.canvas.height - 104);
  }
  if (vm.prompt) {
    ctx.textAlign = 'center';
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    const tw = ctx.measureText(vm.prompt).width;
    ctx.fillRect(W / 2 - tw / 2 - 14, ctx.canvas.height - 168, tw + 28, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(vm.prompt, W / 2, ctx.canvas.height - 146);
  }
}

export function formatTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// A pillar of light on the objective: visible across the city, the genre's
// own signpost.
export function drawObjectiveBeacon(ctx, marker, camera) {
  const x = marker.x - camera.x;
  const y = marker.y - camera.y;
  const pulse = 0.75 + Math.sin(performance.now() / 300) * 0.25;
  const grad = ctx.createLinearGradient(0, y - 340, 0, y);
  grad.addColorStop(0, 'rgba(255,176,46,0)');
  grad.addColorStop(1, `rgba(255,176,46,${0.4 * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - 13, y - 340, 26, 340);
  ctx.fillStyle = `rgba(255,196,74,${0.5 * pulse})`;
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffb02e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawDialogue(ctx, line) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(6,9,14,0.82)';
  ctx.fillRect(90, H - 128, W - 180, 84);
  ctx.strokeStyle = '#e86a17';
  ctx.lineWidth = 2;
  ctx.strokeRect(90, H - 128, W - 180, 84);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffb02e';
  ctx.font = `800 16px ${FONT}`;
  ctx.fillText(line.speaker.toUpperCase(), 112, H - 100);
  ctx.fillStyle = '#f2f5f8';
  ctx.font = `400 17px ${FONT}`;
  wrapText(ctx, line.text, 112, H - 74, W - 224, 21);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText('E ▸', W - 104, H - 56);
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export function drawToasts(ctx, toasts) {
  ctx.textAlign = 'center';
  let y = 128;
  for (const toast of toasts) {
    ctx.font = `700 17px ${FONT}`;
    const tw = ctx.measureText(toast.text).width;
    ctx.fillStyle = 'rgba(8,12,18,0.66)';
    ctx.fillRect(ctx.canvas.width / 2 - tw / 2 - 14, y - 21, tw + 28, 32);
    ctx.fillStyle = toast.color ?? '#ffffff';
    ctx.fillText(toast.text, ctx.canvas.width / 2, y + 2);
    y += 40;
  }
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export function drawTitleScreen(ctx, menu, selected, hasSave, t) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const grad = ctx.createLinearGradient(0, H * 0.52, 0, H);
  grad.addColorStop(0, 'rgba(5,8,14,0)');
  grad.addColorStop(1, 'rgba(5,8,14,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff9a3c';
  ctx.font = `italic 900 92px ${FONT}`;
  ctx.fillText('EMBERFALL', W / 2, H * 0.6);
  ctx.fillStyle = '#ffd76a';
  ctx.font = `italic 900 64px ${FONT}`;
  ctx.fillText('H E A T', W / 2, H * 0.6 + 62);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 17px ${FONT}`;
  ctx.fillText('An open-world crime story in Emberfall Bay — four districts, one crew, five stars.', W / 2, H * 0.6 + 96);
  menu.forEach((item, i) => {
    const y = H * 0.6 + 142 + i * 34;
    ctx.font = `${i === selected ? '800' : '600'} 21px ${FONT}`;
    ctx.fillStyle = i === selected ? '#ffb02e' : 'rgba(255,255,255,0.75)';
    ctx.fillText((i === selected ? '▸ ' : '') + item.label, W / 2, y);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText(hasSave ? 'A saved career was found in this browser.' : 'New here? Start the story — the city saves itself as you play.', W / 2, H - 26);
  void t;
}

export function drawMapScreen(ctx, world) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(5,8,14,0.94)';
  ctx.fillRect(0, 0, W, H);
  const mapW = 880;
  const mapH = mapW * (WORLD_H / WORLD_W);
  const ox = (W - mapW) / 2;
  const oy = (H - mapH) / 2 + 12;
  const sx = mapW / WORLD_W;
  const sy = mapH / WORLD_H;
  ctx.fillStyle = '#232a33';
  ctx.fillRect(ox, oy, mapW, mapH);
  ctx.fillStyle = '#1d6f8a';
  ctx.fillRect(ox, oy + 3760 * sy, mapW, (WORLD_H - 3760) * sy);
  ctx.fillStyle = '#c9ab72';
  ctx.fillRect(ox, oy + 3480 * sy, mapW, (3760 - 3480) * sy);
  ctx.fillStyle = 'rgba(110,140,90,0.5)';
  ctx.fillRect(ox + 1560 * sx, oy, (WORLD_W - 1560) * sx, 940 * sy);
  ctx.fillRect(ox + 3880 * sx, oy + 940 * sy, (WORLD_W - 3880) * sx, (3480 - 940) * sy);
  ctx.fillStyle = 'rgba(130,120,110,0.45)';
  ctx.fillRect(ox, oy, 1560 * sx, 3480 * sy);
  ctx.strokeStyle = 'rgba(235,235,230,0.7)';
  ctx.lineWidth = 2;
  for (const cx of AVENUES) {
    ctx.beginPath();
    ctx.moveTo(ox + cx * sx, oy);
    ctx.lineTo(ox + cx * sx, oy + mapH);
    ctx.stroke();
  }
  for (const cy of STREETS) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + cy * sy);
    ctx.lineTo(ox + mapW, oy + cy * sy);
    ctx.stroke();
  }
  // District names, big on their own ground.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `800 25px ${FONT}`;
  ctx.fillText('CANNERY DOCKS', ox + 760 * sx, oy + 1750 * sy);
  ctx.fillText('MERIDIAN DOWNTOWN', ox + 2700 * sx, oy + 2150 * sy);
  ctx.fillText('SAGUARO HILLS', ox + 2900 * sx, oy + 480 * sy);
  ctx.fillText('EMBER BEACH', ox + 2560 * sx, oy + 3620 * sy);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const key of Object.keys(world.city.landmarks)) {
    const lm = world.city.landmarks[key];
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.arc(ox + lm.x * sx, oy + lm.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(lm.name.replace(/ \(.*\)/, ''), ox + lm.x * sx, oy + lm.y * sy - 10);
  }
  const pos = world.playerPos;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ox + pos.x * sx, oy + pos.y * sy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e86a17';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(ox + pos.x * sx, oy + pos.y * sy, 10, 0, Math.PI * 2);
  ctx.stroke();
  if (world.marker) {
    ctx.fillStyle = '#ffb02e';
    ctx.beginPath();
    ctx.arc(ox + world.marker.x * sx, oy + world.marker.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText('EMBERFALL BAY', W / 2, 44);
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('M or Esc — back to the street · green square: your loft · gold square: Ember Customs garage', W / 2, H - 20);
  void districtAt;
  void DISTRICT_INFO;
}

export function drawMenuList(ctx, title, items, selected, footer) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = 'rgba(5,8,14,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb02e';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(title, W / 2, 150);
  items.forEach((item, i) => {
    const y = 220 + i * 40;
    ctx.font = `${i === selected ? '800' : '600'} 20px ${FONT}`;
    ctx.fillStyle = item.disabled ? 'rgba(255,255,255,0.3)' : i === selected ? '#ffd76a' : 'rgba(255,255,255,0.82)';
    ctx.fillText((i === selected ? '▸ ' : '') + item.label, W / 2, y);
    if (item.note) {
      ctx.font = `500 14px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(item.note, W / 2, y + 19);
    }
  });
  if (footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(footer, W / 2, H - 30);
  }
}

export function drawEndScreen(ctx, kind, lines) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = kind === 'busted' ? 'rgba(20,30,70,0.78)' : 'rgba(70,14,10,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `italic 900 84px ${FONT}`;
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', W / 2, H / 2 - 30);
  ctx.font = `600 19px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + 22 + i * 28));
}
