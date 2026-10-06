/* Habiba — a birthday film. 1080x1920 @ 60 fps; every frame is a pure function of time t (seconds).
 * Editorial look: off-black, ivory, champagne; Anton + Instrument Serif; mask reveals, real motion blur,
 * film halation and grain. Cuts follow the score's clock: 120 BPM, beat 0.5 s, bar 2 s. */
'use strict';

const W = 1080, H = 1920;
const TOTAL = 66.0;
const ASSET = '../private/build/';
const BG = '#0b0a0c', IVORY = '#f3eee6', CHAMP = '#d8bc8f';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// ------------------------------------------------------------------ math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const eInCubic = (t) => t * t * t;
const eOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const eInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const eInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ------------------------------------------------------------------ assets
const PHOTOS = {
  hug: { src: '01_hug', face: [0.50, 0.42] },
  elevator: { src: '02_elevator', face: [0.47, 0.42] },
  bridge: { src: '03_bridge', face: [0.33, 0.44] },
  family: { src: '04_family', face: [0.58, 0.48] },
  dino: { src: '05_dino', face: [0.62, 0.55] },
  squad: { src: '06_squad', face: [0.45, 0.55] },
  selfie: { src: '07_selfie', face: [0.30, 0.42] },
  neon: { src: '08_neon', face: [0.49, 0.32] },
  aquarium: { src: '09_aquarium', face: [0.46, 0.56] },
  silly1: { src: '10_silly1', face: [0.35, 0.45] },
  silly2: { src: '11_silly2', face: [0.40, 0.40] },
  santa: { src: '12_santa', face: [0.55, 0.45] },
};
let TL = null;
const IMG = {};
let GRAIN = [], VIGNETTE = null;
let bufA, bufB, acc, maskCv, photoCv;
let ctxA, ctxB, accC, maskC, photoC;

const F = {
  display: (s) => `${s}px Anton`,
  wide: (s) => `900 ${s}px Archivo`,
  italic: (s) => `italic ${s}px InstrumentSerif`,
};

function mk(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('failed ' + src)); im.src = src; });
}

async function load() {
  const fonts = [
    new FontFace('Anton', 'url(../assets/fonts/Anton.ttf)'),
    new FontFace('Archivo', 'url(../assets/fonts/Archivo.ttf)', { weight: '100 900', stretch: '62% 125%' }),
    new FontFace('InstrumentSerif', 'url(../assets/fonts/InstrumentSerif.ttf)'),
    new FontFace('InstrumentSerif', 'url(../assets/fonts/InstrumentSerif-Italic.ttf)', { style: 'italic' }),
  ];
  await Promise.all(fonts.map(async (f) => document.fonts.add(await f.load())));
  TL = await (await fetch(ASSET + 'timeline.json')).json();
  await Promise.all(Object.entries(PHOTOS).map(async ([k, p]) => {
    IMG[k] = await loadImage(`${ASSET}img/${p.src}.jpg`);
    IMG[k + '_blur'] = await loadImage(`${ASSET}img/${p.src}_blur.jpg`);
    IMG[k + '_hal'] = await loadImage(`${ASSET}img/${p.src}_bloom.jpg`);
  }));
  bufA = mk(W, H); bufB = mk(W, H); acc = mk(W, H); maskCv = mk(W, H); photoCv = mk(W, H);
  ctxA = bufA.getContext('2d'); ctxB = bufB.getContext('2d'); accC = acc.getContext('2d');
  maskC = maskCv.getContext('2d'); photoC = photoCv.getContext('2d');
  buildPlates();
  return true;
}

function buildPlates() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 8; k++) {
    const cv = mk(540, 960), c = cv.getContext('2d'), id = c.createImageData(540, 960);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 110;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    c.putImageData(id, 0, 0);
    GRAIN.push(cv);
  }
  VIGNETTE = mk(W, H);
  const vc = VIGNETTE.getContext('2d');
  const g = vc.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
  vc.fillStyle = g; vc.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ primitives
function reset(c) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.shadowBlur = 0; c.shadowColor = 'transparent'; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  c.letterSpacing = '0px'; c.fontStretch = 'normal'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}
function fillBG(c, col = BG) { c.fillStyle = col; c.fillRect(0, 0, W, H); }

// cover-fit `im` into the box (x,y,w,h) around focus (fx,fy) with zoom z; extra pixel offset (ox,oy)
function cover(c, im, x, y, w, h, fx, fy, z = 1, ox = 0, oy = 0, alpha = 1, op = 'source-over') {
  const S = Math.max(w / im.width, h / im.height) * z;
  const dw = im.width * S, dh = im.height * S;
  const px = clamp(x + w / 2 - fx * dw, x + w - dw, x) + ox;
  const py = clamp(y + h / 2 - fy * dh, y + h - dh, y) + oy;
  c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = op;
  c.drawImage(im, px, py, dw, dh);
  c.restore();
}

function kickPulse(t, from, to, amt) {
  if (!TL || t < from || t >= to) return 0;
  let k = -1;
  for (const kt of TL.kicks) { if (kt <= t && kt >= from) k = kt; else if (kt > t) break; }
  return k < 0 ? 0 : amt * Math.exp(-(t - k) / 0.13);
}

// full-bleed photo with a slow move and film halation
function fullBleed(c, t, key, o) {
  const u = eInOutSine(inv(o.t0, o.t1, t));
  const z = lerp(o.z[0], o.z[1], u) + (o.punch ? lerp(o.punch, 0, eOutExpo(inv(o.t0, o.t0 + 0.9, t))) : 0) + (o.pulse ? kickPulse(t, o.t0, o.t1, o.pulse) : 0);
  const fx = lerp(o.f[0][0], o.f[1][0], u), fy = lerp(o.f[0][1], o.f[1][1], u);
  fillBG(c, '#000');
  cover(c, IMG[key], 0, 0, W, H, fx, fy, z);
  const hal = typeof o.hal === 'function' ? o.hal(t) : (o.hal ?? 0.22);
  if (hal > 0) cover(c, IMG[key + '_hal'], 0, 0, W, H, fx, fy, z, 0, 0, hal, 'screen');
}

// editorial panel with a directional mask reveal and inner parallax
function panel(c, t, key, x, y, w, h, o) {
  const e = eOutExpo(inv(o.at, o.at + (o.dur ?? 1.0), t));
  if (e <= 0) return;
  let rx = x, ry = y, rw = w, rh = h;
  const from = o.from;
  if (from === 'left') rw = w * e;
  else if (from === 'right') { rx = x + w * (1 - e); rw = w * e; }
  else if (from === 'top') rh = h * e;
  else if (from === 'bottom') { ry = y + h * (1 - e); rh = h * e; }
  else if (from === 'midv') { ry = y + (h * (1 - e)) / 2; rh = h * e; }
  const dir = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1], midv: [0, 0] }[from];
  const drift = eInOutSine(inv(o.at, o.t1 ?? o.at + 4, t));
  const z = lerp(1.14, 1.0, e) + 0.04 * drift + (o.pulse ? kickPulse(t, o.at, o.t1 ?? o.at + 4, o.pulse) : 0);
  const ox = dir[0] * (1 - e) * 140 + (o.pan ?? 0) * (drift - 0.5);
  const oy = dir[1] * (1 - e) * 140;
  const [fx, fy] = o.focus ?? PHOTOS[key].face;
  c.save();
  c.beginPath(); c.rect(rx, ry, rw, rh); c.clip();
  cover(c, IMG[key], x, y, w, h, fx, fy, z, ox, oy);
  cover(c, IMG[key + '_hal'], x, y, w, h, fx, fy, z, ox, oy, o.hal ?? 0.2, 'screen');
  c.restore();
}

// ------------------------------------------------------------------ shots
function intro(c, t) {
  fillBG(c, '#000');
  // a hairline draws across the frame, then opens into a slit onto the neon sign from her party
  const line = eOutExpo(inv(0.35, 1.4, t));
  const open = eInOutCubic(inv(1.05, 3.5, t));
  const sh = 600 * open, cy = 960;
  if (open > 0) {
    c.save();
    c.beginPath(); c.rect(0, cy - sh / 2, W, sh); c.clip();
    const im = IMG.neon, S = 0.80 + 0.05 * inv(0, 4, t);
    const dw = im.width * S, dh = im.height * S;
    const x0 = 540 - 0.565 * dw + 26 * inv(0, 4, t), y0 = cy - 0.205 * dh;
    c.drawImage(im, x0, y0, dw, dh);
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.75;
    c.drawImage(IMG.neon_hal, x0, y0, dw, dh);
    // rack focus: starts soft, resolves sharp
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1 - smooth(inv(1.4, 3.0, t));
    c.drawImage(IMG.neon_blur, x0, y0, dw, dh);
    c.restore();
  }
  const la = 0.85 * (1 - 0.6 * open);
  if (line > 0) {
    c.fillStyle = `rgba(243,238,230,${la})`;
    const lw = W * line;
    c.fillRect(W / 2 - lw / 2, cy - sh / 2 - 1, lw, 1.5);
    if (open > 0) c.fillRect(W / 2 - lw / 2, cy + sh / 2 - 0.5, lw, 1.5);
  }
}

// title: HA / BI / BA stacked, photos inside the letters, then a zoom through the "I" into the first shot
const STACK = { lines: ['HA', 'BI', 'BA'], size: 0, capH: 0, gap: 0, y: [], x: [], iCx: 0, iCy: 0 };
function layoutStack(c) {
  if (STACK.size) return;
  c.save();
  c.font = F.wide(100); c.fontStretch = 'ultra-expanded';
  const capPer100 = c.measureText('H').actualBoundingBoxAscent;
  const widest = Math.max(...STACK.lines.map((l) => c.measureText(l).width));
  STACK.size = (100 * 940) / widest;
  STACK.capH = (capPer100 * STACK.size) / 100;
  STACK.gap = STACK.capH * 0.12;
  const ls = 0;
  c.font = F.wide(STACK.size); c.letterSpacing = '0px';
  const top = (H - (3 * STACK.capH + 2 * STACK.gap)) / 2;
  STACK.lines.forEach((ln, i) => {
    STACK.x[i] = W / 2 - (c.measureText(ln).width - ls) / 2;
    STACK.y[i] = top + STACK.capH * (i + 1) + STACK.gap * i;
  });
  const wB = c.measureText('B').width, wI = c.measureText('I').width;
  STACK.iCx = STACK.x[1] + wB + wI / 2;
  STACK.iCy = STACK.y[1] - STACK.capH / 2;
  c.restore();
}
const bridgeMove = (t) => {
  const u = eInOutSine(inv(7.0, 12.0, t));
  return { z: lerp(1.0, 1.07, u), fx: lerp(0.42, 0.36, u), fy: lerp(0.48, 0.45, u) };
};
function title(c, t) {
  layoutStack(c);
  fillBG(c, BG);
  const zoom = Math.exp(Math.log(70) * eInCubic(inv(7.2, 8.0, t)));
  // the photo inside the letters, hard-cut on every second beat
  const seq = [['hug', 4.0], ['elevator', 5.0], ['family', 6.0], ['bridge', 7.0]];
  let key = seq[0][0], at = 4.0;
  for (const [k, a] of seq) if (t >= a) { key = k; at = a; }
  reset(photoC);
  if (key === 'bridge') {
    const m = bridgeMove(t);
    cover(photoC, IMG.bridge, 0, 0, W, H, m.fx, m.fy, m.z);
    cover(photoC, IMG.bridge_hal, 0, 0, W, H, m.fx, m.fy, m.z, 0, 0, 0.22, 'screen');
  } else {
    const [fx, fy] = PHOTOS[key].face;
    cover(photoC, IMG[key], 0, 0, W, H, fx, fy, 1.12 - 0.05 * inv(at, at + 1, t));
  }
  // letter mask
  reset(maskC);
  maskC.clearRect(0, 0, W, H);
  maskC.translate(STACK.iCx, STACK.iCy); maskC.scale(zoom, zoom); maskC.translate(-STACK.iCx, -STACK.iCy);
  const breathe = 1 + 0.025 * eInOutSine(inv(4.0, 7.2, t));
  maskC.translate(W / 2, H / 2); maskC.scale(breathe, breathe); maskC.translate(-W / 2, -H / 2);
  maskC.font = F.wide(STACK.size); maskC.fontStretch = 'ultra-expanded'; maskC.fillStyle = '#fff';
  STACK.lines.forEach((ln, i) => {
    const e = eOutExpo(inv(4.0 + i * 0.09, 4.0 + i * 0.09 + 1.0, t));
    maskC.save();
    maskC.beginPath(); maskC.rect(0, STACK.y[i] - STACK.capH - 6, W, STACK.capH + 12); maskC.clip();
    maskC.fillText(ln, STACK.x[i], STACK.y[i] + (1 - e) * (STACK.capH + 20));
    maskC.restore();
  });
  photoC.globalCompositeOperation = 'destination-in';
  photoC.drawImage(maskCv, 0, 0);
  c.drawImage(photoCv, 0, 0);
  // "Happy Birthday" in italic serif across the stack
  const ta = smooth(inv(4.55, 5.3, t)) * (1 - smooth(inv(7.05, 7.35, t)));
  if (ta > 0) {
    c.save();
    c.font = F.italic(150);
    const words = ['Happy', 'Birthday'];
    const ws = words.map((w) => c.measureText(w).width), sp = 34;
    let x = W / 2 - (ws[0] + ws[1] + sp) / 2;
    words.forEach((w, i) => {
      const e = eOutExpo(inv(4.55 + i * 0.16, 5.6 + i * 0.16, t));
      c.save();
      c.beginPath(); c.rect(x - 20, 820, ws[i] + 40, 200); c.clip();
      c.globalAlpha = ta;
      c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 40;
      c.fillStyle = IVORY;
      c.fillText(w, x, 1000 + (1 - e) * 170);
      c.restore();
      x += ws[i] + sp;
    });
    c.restore();
  }
}

function bridge(c, t) {
  const m = bridgeMove(t);
  fillBG(c, '#000');
  cover(c, IMG.bridge, 0, 0, W, H, m.fx, m.fy, m.z);
  cover(c, IMG.bridge_hal, 0, 0, W, H, m.fx, m.fy, m.z, 0, 0, 0.22, 'screen');
}
const hug = (c, t) => fullBleed(c, t, 'hug', { t0: 11.9, t1: 16.0, z: [1.02, 1.09], f: [[0.55, 0.50], [0.50, 0.44]] });
function duoA(c, t) { // selfie + santa
  fillBG(c, BG);
  panel(c, t, 'selfie', 0, 305, 980, 735, { at: 16.0, from: 'left', t1: 20.0, pan: 30, pulse: 0.008 });
  panel(c, t, 'santa', 100, 1064, 980, 551, { at: 16.5, from: 'right', t1: 20.0, pan: -30, pulse: 0.008 });
}
const elevator = (c, t) => fullBleed(c, t, 'elevator', { t0: 20.0, t1: 24.0, z: [1.0, 1.06], f: [[0.53, 0.50], [0.50, 0.46]], punch: 0.12, pulse: 0.006 });
const family = (c, t) => fullBleed(c, t, 'family', { t0: 23.9, t1: 28.0, z: [1.03, 1.09], f: [[0.55, 0.50], [0.60, 0.46]], pulse: 0.006 });
function duoB(c, t) { // dino + squad, edge to edge
  fillBG(c, BG);
  panel(c, t, 'dino', 0, 340, W, 608, { at: 28.0, from: 'midv', t1: 32.0, pan: 40, pulse: 0.008, hal: 0.3 });
  panel(c, t, 'squad', 0, 972, W, 608, { at: 28.5, from: 'midv', t1: 32.0, pan: -40, pulse: 0.008, hal: 0.3 });
}

// contact sheet: all twelve photos land one per eighth note, then the camera dives into the aquarium cell
const GRID = [['bridge', 'hug', 'elevator'], ['family', 'aquarium', 'selfie'], ['santa', 'dino', 'squad'], ['silly1', 'neon', 'silly2']];
const GG = 10, GW = (W - 2 * GG) / 3, GH = (H - 3 * GG) / 4;
function grid(c, t) {
  fillBG(c, BG);
  const tc = [540, GH + GG + GH / 2];
  const settle = 1 + 0.04 * eInOutSine(inv(32.0, 35.3, t));
  const dive = eInCubic(inv(35.25, 36.0, t));
  const S = settle * Math.exp(Math.log(4.6 / settle) * dive);
  const camX = lerp(540, tc[0], smooth(dive)), camY = lerp(960, tc[1], Math.min(1, dive * 1.4));
  c.save();
  c.translate(W / 2, H / 2); c.scale(S, S); c.translate(-camX, -camY);
  const order = [];
  GRID.forEach((row, r) => row.forEach((key, col) => order.push({ key, r, col })));
  order.sort((a, b) => a.r + a.col - (b.r + b.col) || a.r - b.r);
  order.forEach((cell, i) => {
    const at = TL.grid[i];
    const e = eOutExpo(inv(at, at + 0.7, t));
    if (e <= 0) return;
    const x = cell.col * (GW + GG), y = cell.r * (GH + GG);
    const [fx, fy] = PHOTOS[cell.key].face;
    c.save();
    c.beginPath(); c.rect(x, y + GH * (1 - e) * 0.5, GW, GH * e); c.clip();
    cover(c, IMG[cell.key], x, y, GW, GH, fx, fy, lerp(1.25, 1.0, e) + 0.03 * inv(at, 36, t));
    c.restore();
  });
  c.restore();
}
const aquarium = (c, t) => fullBleed(c, t, 'aquarium', { t0: 36.0, t1: 40.0, z: [1.03, 1.08], f: [[0.47, 0.56], [0.45, 0.58]], punch: 0.16, pulse: 0.008, hal: 0.4 });
function duoC(c, t) { // silly1 + silly2
  fillBG(c, BG);
  panel(c, t, 'silly1', 0, 198, 1000, 750, { at: 40.0, from: 'left', t1: 44.0, pan: 30, pulse: 0.01, dur: 0.9 });
  panel(c, t, 'silly2', 80, 972, 1000, 750, { at: 40.25, from: 'right', t1: 44.0, pan: -30, pulse: 0.01, dur: 0.9 });
}
function mosaic(c, t) {
  fillBG(c, BG);
  const g = 8, w = (W - g) / 2, h = (H - g) / 2;
  panel(c, t, 'bridge', 0, 0, w, h, { at: 44.0, from: 'top', t1: 48.0, pulse: 0.01, dur: 0.8 });
  panel(c, t, 'hug', w + g, 0, w, h, { at: 44.5, from: 'right', t1: 48.0, pulse: 0.01, dur: 0.8 });
  panel(c, t, 'family', 0, h + g, w, h, { at: 45.0, from: 'left', t1: 48.0, pulse: 0.01, dur: 0.8, focus: [0.66, 0.47] });
  panel(c, t, 'elevator', w + g, h + g, w, h, { at: 45.5, from: 'bottom', t1: 48.0, pulse: 0.01, dur: 0.8, focus: [0.36, 0.45] });
}
const neon = (c, t) => fullBleed(c, t, 'neon', { t0: 48.0, t1: 56.6, z: [1.0, 1.1], f: [[0.5, 0.48], [0.5, 0.36]], pulse: 0.006, hal: (tt) => 0.5 + kickPulse(tt, 48, 52, 0.25) });
function endTitle(c, t) {
  fillBG(c, '#000');
  cover(c, IMG.neon_blur, 0, 0, W, H, 0.5, 0.42, 1.25 + 0.05 * inv(55.5, 66, t));
  c.fillStyle = 'rgba(8,6,10,0.62)'; c.fillRect(0, 0, W, H);
  const push = 1 + 0.03 * eInOutSine(inv(56, 66, t));
  c.save();
  c.translate(W / 2, 960); c.scale(push, push); c.translate(-W / 2, -960);
  c.font = F.italic(168);
  const words = ['Happy', 'Birthday'], ws = words.map((w) => c.measureText(w).width), sp = 38;
  let x = W / 2 - (ws[0] + ws[1] + sp) / 2;
  words.forEach((w, i) => {
    const e = eOutExpo(inv(56.05 + i * 0.14, 57.4 + i * 0.14, t));
    c.save();
    c.beginPath(); c.rect(x - 20, 760, ws[i] + 40, 230); c.clip();
    c.fillStyle = IVORY;
    c.fillText(w, x, 940 + (1 - e) * 200);
    c.restore();
    x += ws[i] + sp;
  });
  const hl = eOutExpo(inv(56.6, 57.8, t));
  c.fillStyle = 'rgba(216,188,143,0.8)';
  c.fillRect(W / 2 - 60 * hl, 1004, 120 * hl, 1.5);
  c.font = F.display(118); c.letterSpacing = '30px';
  const name = 'HABIBA';
  let nx = W / 2 - (c.measureText(name).width - 30) / 2;
  for (let i = 0; i < name.length; i++) {
    const e = eOutExpo(inv(56.75 + i * 0.06, 57.9 + i * 0.06, t));
    const adv = c.measureText(name.slice(0, i + 1)).width - c.measureText(name.slice(0, i)).width;
    c.save();
    c.beginPath(); c.rect(nx - 4, 1040, adv + 8, 150); c.clip();
    c.fillStyle = CHAMP;
    c.fillText(name[i], nx, 1170 + (1 - e) * 150);
    c.restore();
    nx += adv;
  }
  c.restore();
}

const SHOTS = [
  { t0: 0, draw: intro },
  { t0: 4.0, draw: title },
  { t0: 8.0, draw: bridge },
  { t0: 12.0, draw: hug },
  { t0: 16.0, draw: duoA },
  { t0: 20.0, draw: elevator },
  { t0: 24.0, draw: family },
  { t0: 28.0, draw: duoB },
  { t0: 32.0, draw: grid },
  { t0: 36.0, draw: aquarium },
  { t0: 40.0, draw: duoC },
  { t0: 44.0, draw: mosaic },
  { t0: 48.0, draw: neon },
  { t0: 56.0, draw: endTitle },
];
// transitions keyed by the index of the shot they lead into; [pre, post] seconds around the cut
const TRANS = {
  3: { type: 'slide', dir: [0, 1], pre: 0.06, post: 0.7 },
  6: { type: 'slide', dir: [1, 0], pre: 0.06, post: 0.7 },
  9: { type: 'flash', pre: 0, post: 0.25 },
  12: { type: 'bloom', pre: 0.4, post: 0.7 },
  13: { type: 'dissolve', pre: 0.6, post: 0.8 },
};
// windows that get real (multi-sample) motion blur
const BLUR = [[7.15, 8.05], [11.93, 12.75], [15.98, 17.4], [19.98, 20.8], [23.93, 24.75], [27.98, 29.4], [35.1, 36.9], [39.98, 41.2], [43.98, 46.4]];

function drawShot(i, c, t) { reset(c); SHOTS[i].draw(c, t); reset(c); }

function composite(c, t) {
  let k = 0;
  while (k + 1 < SHOTS.length && t >= SHOTS[k + 1].t0) k++;
  let into = -1;
  if (TRANS[k] && t < SHOTS[k].t0 + TRANS[k].post) into = k;
  else if (TRANS[k + 1] && t >= SHOTS[k + 1].t0 - TRANS[k + 1].pre) into = k + 1;
  if (into < 0) return drawShot(k, c, t);
  const tr = TRANS[into], cut = SHOTS[into].t0;
  drawShot(into - 1, ctxA, t);
  drawShot(into, ctxB, t);
  reset(c);
  if (tr.type === 'slide') {
    const e = eOutExpo(inv(cut - tr.pre, cut + tr.post, t));
    const [dx, dy] = tr.dir;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.drawImage(bufA, -dx * W * 0.35 * e, -dy * H * 0.35 * e);
    c.drawImage(bufB, dx * W * (1 - e), dy * H * (1 - e));
  } else if (tr.type === 'flash') {
    c.drawImage(t < cut ? bufA : bufB, 0, 0);
    const a = t >= cut ? 0.9 * Math.exp(-(t - cut) / 0.06) : 0;
    if (a > 0.004) { c.fillStyle = `rgba(250,246,238,${a})`; c.fillRect(0, 0, W, H); }
  } else if (tr.type === 'bloom') {
    // exposure blooms up on the outgoing shot, then settles on the incoming one
    const a = t < cut ? smooth(inv(cut - tr.pre, cut, t)) : 1 - smooth(inv(cut, cut + tr.post, t));
    c.drawImage(t < cut ? bufA : bufB, 0, 0);
    c.globalCompositeOperation = 'screen';
    c.fillStyle = `rgba(255,244,232,${0.92 * a})`; c.fillRect(0, 0, W, H);
  } else if (tr.type === 'dissolve') {
    c.drawImage(bufA, 0, 0);
    c.globalAlpha = smooth(inv(cut - tr.pre, cut + tr.post, t));
    c.drawImage(bufB, 0, 0);
  }
  reset(c);
}

function post(c, t, frameIdx) {
  c.drawImage(VIGNETTE, 0, 0);
  c.save();
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.07;
  c.drawImage(GRAIN[frameIdx % GRAIN.length], 0, 0, W, H);
  c.restore();
  const end = smooth(inv(64.2, 65.8, t));
  if (end > 0) { c.fillStyle = `rgba(0,0,0,${end})`; c.fillRect(0, 0, W, H); }
}

const SHUTTER = 0.0115; // ~250 degrees at 60 fps
function renderFrame(t, frameIdx = 0) {
  reset(ctx);
  if (!BLUR.some(([a, b]) => t >= a && t <= b)) {
    composite(ctx, t);
  } else {
    const n = 6;
    reset(accC);
    for (let i = 0; i < n; i++) {
      composite(ctx, t + SHUTTER * (i / (n - 1) - 0.5));
      accC.globalAlpha = 1 / (i + 1);
      accC.drawImage(canvas, 0, 0);
    }
    reset(ctx);
    ctx.drawImage(acc, 0, 0);
  }
  reset(ctx);
  post(ctx, t, frameIdx);
}

window.ready = load();
window.TOTAL = TOTAL;
window.grab = (t, frameIdx, q = 0.95) => { renderFrame(t, frameIdx); return canvas.toDataURL('image/jpeg', q); };
window.grabPng = (t, frameIdx) => { renderFrame(t, frameIdx); return canvas.toDataURL('image/png'); };
