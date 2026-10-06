/* Habiba — a birthday film. 1080x1920, every pixel is a pure function of time t (seconds).
 * Music is a 3/4 waltz at 100 BPM (beat 0.6 s, bar 1.8 s); every cut lands on a bar line. */
'use strict';

const W = 1080, H = 1920;
const BEAT = 0.6, BAR = 1.8;
const TOTAL = 68.0;
const ASSET = '../private/build/';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// ------------------------------------------------------------------ math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const smooth = (t) => t * t * (3 - 2 * t);
const eOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const eInCubic = (t) => t * t * t;
const eInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const eOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const eOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const eInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const bump = (t) => Math.sin(Math.PI * clamp(t)); // 0 -> 1 -> 0
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fadeInOut = (t, tin, tout, din = 0.5, dout = 0.45) => smooth(inv(tin, tin + din, t)) * (1 - smooth(inv(tout, tout + dout, t)));

// ------------------------------------------------------------------ assets
const PHOTOS = {
  hug: { src: '01_hug', face: [0.47, 0.37] },
  elevator: { src: '02_elevator', face: [0.33, 0.37] },
  bridge: { src: '03_bridge', face: [0.32, 0.43] },
  family: { src: '04_family', face: [0.68, 0.44] },
  dino: { src: '05_dino', face: [0.70, 0.68] },
  squad: { src: '06_squad', face: [0.37, 0.85] },
  selfie: { src: '07_selfie', face: [0.18, 0.34] },
  neon: { src: '08_neon', face: [0.49, 0.29] },
  aquarium: { src: '09_aquarium', face: [0.41, 0.55] },
  silly1: { src: '10_silly1', face: [0.24, 0.40] },
  silly2: { src: '11_silly2', face: [0.27, 0.38] },
  santa: { src: '12_santa', face: [0.555, 0.41] },
};
let TL = null;
const IMG = {};
const SPR = {};
const CARD = {};
const POLA = {};
let GRAIN = [], VIGNETTE = null, WORLD = null;
let bufA, bufB, bufC, ctxA, ctxB, ctxC, txt, txtC;

const F = {
  serif: (s, w = 500) => `italic ${w} ${s}px Playfair`,
  caps: (s, w = 800) => `${w} ${s}px Playfair`,
  script: (s) => `${s}px GreatVibes`,
  neon: (s) => `${s}px Sacramento`,
  sans: (s, w = 600) => `${w} ${s}px Montserrat`,
  hand: (s, w = 600) => `${w} ${s}px Caveat`,
};

function mk(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('failed ' + src));
    im.src = src;
  });
}

async function load() {
  const fonts = [
    new FontFace('Playfair', 'url(../assets/fonts/PlayfairDisplay.ttf)', { weight: '400 900' }),
    new FontFace('Playfair', 'url(../assets/fonts/PlayfairDisplay-Italic.ttf)', { weight: '400 900', style: 'italic' }),
    new FontFace('GreatVibes', 'url(../assets/fonts/GreatVibes.ttf)'),
    new FontFace('Sacramento', 'url(../assets/fonts/Sacramento.ttf)'),
    new FontFace('Montserrat', 'url(../assets/fonts/Montserrat.ttf)', { weight: '100 900' }),
    new FontFace('Caveat', 'url(../assets/fonts/Caveat.ttf)', { weight: '400 700' }),
  ];
  await Promise.all(fonts.map(async (f) => document.fonts.add(await f.load())));
  TL = await (await fetch(ASSET + 'timeline.json')).json();
  await Promise.all(Object.entries(PHOTOS).map(async ([k, p]) => {
    IMG[k] = await loadImage(`${ASSET}img/${p.src}.jpg`);
    IMG[k + '_blur'] = await loadImage(`${ASSET}img/${p.src}_blur.jpg`);
    IMG[k + '_bloom'] = await loadImage(`${ASSET}img/${p.src}_bloom.jpg`);
  }));
  bufA = mk(W, H); bufB = mk(W, H); bufC = mk(W, H); txt = mk(W, 700);
  ctxA = bufA.getContext('2d'); ctxB = bufB.getContext('2d'); ctxC = bufC.getContext('2d'); txtC = txt.getContext('2d');
  buildSprites();
  buildWorld();
  buildCards();
  buildPolaroids();
  return true;
}

// ------------------------------------------------------------------ sprites & plates
const COLORS = { gold: '255,206,120', pink: '255,92,190', white: '255,255,255', blue: '150,210,255', violet: '180,150,255', rose: '255,170,200' };

function buildSprites() {
  const dot = mk(64, 64), g = dot.getContext('2d');
  let r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  SPR.dot = dot;

  SPR.star = {}; SPR.bokeh = {}; SPR.glow = {};
  for (const [name, rgb] of Object.entries(COLORS)) {
    const s = 256, cv = mk(s, s), c = cv.getContext('2d');
    let gr = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, `rgba(${rgb},0.85)`); gr.addColorStop(0.12, `rgba(${rgb},0.35)`); gr.addColorStop(0.45, `rgba(${rgb},0.06)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = gr; c.fillRect(0, 0, s, s);
    const spike = (len, wid, a) => {
      c.save(); c.translate(128, 128); c.rotate(a);
      const lg = c.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = lg;
      c.beginPath(); c.moveTo(-len, 0); c.quadraticCurveTo(0, -wid, len, 0); c.quadraticCurveTo(0, wid, -len, 0); c.fill();
      c.restore();
    };
    spike(124, 7, 0); spike(124, 7, Math.PI / 2); spike(52, 4, Math.PI / 4); spike(52, 4, -Math.PI / 4);
    gr = c.createRadialGradient(128, 128, 0, 128, 128, 14);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, s, s);
    SPR.star[name] = cv;

    const b = mk(200, 200), bc = b.getContext('2d');
    gr = bc.createRadialGradient(100, 100, 0, 100, 100, 100);
    gr.addColorStop(0, `rgba(${rgb},0.30)`); gr.addColorStop(0.78, `rgba(${rgb},0.42)`); gr.addColorStop(0.9, `rgba(${rgb},0.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    bc.fillStyle = gr; bc.fillRect(0, 0, 200, 200);
    SPR.bokeh[name] = b;

    const gl = mk(128, 128), gc = gl.getContext('2d');
    gr = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.3, `rgba(${rgb},0.5)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    gc.fillStyle = gr; gc.fillRect(0, 0, 128, 128);
    SPR.glow[name] = gl;
  }

  // film grain tiles (seeded)
  const rnd = rngFrom(99);
  for (let k = 0; k < 8; k++) {
    const cv = mk(540, 960), c = cv.getContext('2d');
    const id = c.createImageData(540, 960);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 120;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    c.putImageData(id, 0, 0);
    GRAIN.push(cv);
  }
  VIGNETTE = mk(W, H);
  const vc = VIGNETTE.getContext('2d');
  const vg = vc.createRadialGradient(W / 2, H * 0.48, H * 0.28, W / 2, H * 0.5, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,10,0.62)');
  vc.fillStyle = vg; vc.fillRect(0, 0, W, H);
}

function buildWorld() {
  WORLD = mk(W, H);
  const c = WORLD.getContext('2d');
  const lg = c.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, '#180b2e'); lg.addColorStop(0.45, '#0e0822'); lg.addColorStop(1, '#040309');
  c.fillStyle = lg; c.fillRect(0, 0, W, H);
  const rg = c.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, H * 0.62);
  rg.addColorStop(0, 'rgba(92,34,118,0.55)'); rg.addColorStop(1, 'rgba(92,34,118,0)');
  c.fillStyle = rg; c.fillRect(0, 0, W, H);
}

const STARS = (() => {
  const r = rngFrom(4), a = [];
  for (let i = 0; i < 230; i++) a.push({ x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 2.4, z: r(), tw: 1.5 + r() * 3, ph: r() * 6.3, s: 0.5 + r() * 1.3, col: r() < 0.18 ? 'gold' : r() < 0.3 ? 'rose' : 'white' });
  return a;
})();
const BOKEH = (() => {
  const r = rngFrom(8), a = [], cols = ['gold', 'pink', 'violet', 'rose', 'gold'];
  for (let i = 0; i < 24; i++) a.push({ x: r() * W, y: r() * H, rad: 18 + r() * 80, sp: 6 + r() * 18, ph: r() * 6.3, col: cols[i % cols.length], a: 0.08 + r() * 0.16 });
  return a;
})();
const DUST = (() => {
  const r = rngFrom(21), a = [];
  for (let i = 0; i < 46; i++) a.push({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.7, ph: r() * 6.3, tw: 0.6 + r() * 2 });
  return a;
})();

// ------------------------------------------------------------------ drawing primitives
function reset(c) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.shadowBlur = 0; c.shadowColor = 'transparent'; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
  c.letterSpacing = '0px'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

function sparkle(c, x, y, size, alpha, rot = 0, col = 'gold') {
  if (alpha <= 0.003 || size <= 0.5) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = clamp(alpha);
  c.translate(x, y); c.rotate(rot);
  c.drawImage(SPR.star[col], -size / 2, -size / 2, size, size);
  c.restore();
}
function glow(c, x, y, size, alpha, col = 'gold') {
  if (alpha <= 0.003) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(alpha);
  c.drawImage(SPR.glow[col], x - size / 2, y - size / 2, size, size);
  c.restore();
}

function drawWorld(c, t, o = {}) {
  const fly = o.fly ?? 0.5, aur = o.aurora ?? 1, starA = o.stars ?? 1;
  c.drawImage(WORLD, 0, 0);
  c.save();
  c.globalCompositeOperation = 'screen';
  const blobs = [
    [W * (0.28 + 0.16 * Math.sin(t * 0.13)), H * (0.32 + 0.1 * Math.cos(t * 0.11)), 900, `rgba(255,60,170,${0.20 * aur})`],
    [W * (0.78 + 0.12 * Math.cos(t * 0.09)), H * (0.6 + 0.12 * Math.sin(t * 0.1)), 1000, `rgba(110,60,255,${0.20 * aur})`],
    [W * (0.5 + 0.22 * Math.sin(t * 0.07 + 1)), H * 0.9, 820, `rgba(255,165,80,${0.13 * aur})`],
  ];
  for (const [x, y, r, col] of blobs) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  c.restore();
  // star field drifting slowly toward the viewer
  c.save();
  c.globalCompositeOperation = 'lighter';
  const cx = W / 2, cy = H * 0.47;
  for (const s of STARS) {
    let z = (s.z - t * 0.035 * fly) % 1; if (z < 0) z += 1;
    z = 0.12 + z * 0.88;
    const px = cx + (s.x / z) * 520, py = cy + (s.y / z) * 520;
    if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
    const edge = smooth(inv(1.0, 0.85, z)) * smooth(inv(0.12, 0.22, z));
    const tw = 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
    const size = (s.s / z) * 5.5;
    c.globalAlpha = clamp(edge * tw * starA * 0.9);
    if (size > 9 && s.col !== 'white') c.drawImage(SPR.star[s.col], px - size * 1.5, py - size * 1.5, size * 3, size * 3);
    else c.drawImage(SPR.dot, px - size / 2, py - size / 2, size, size);
  }
  // soft bokeh
  for (const b of BOKEH) {
    const y = ((b.y - t * b.sp) % (H + 200) + H + 200) % (H + 200) - 100;
    const x = b.x + Math.sin(t * 0.3 + b.ph) * 30;
    c.globalAlpha = b.a * (o.bokeh ?? 1) * (0.7 + 0.3 * Math.sin(t * 0.8 + b.ph));
    c.drawImage(SPR.bokeh[b.col], x - b.rad, y - b.rad, b.rad * 2, b.rad * 2);
  }
  c.restore();
}

// cover-fit an image with a focus point (normalized) and zoom
function drawCover(c, im, fx, fy, z, alpha = 1, op = 'source-over') {
  const S = Math.max(W / im.width, H / im.height) * z;
  const dw = im.width * S, dh = im.height * S;
  let x = W / 2 - fx * dw, y = H / 2 - fy * dh;
  x = clamp(x, W - dw, 0); y = clamp(y, H - dh, 0);
  c.save(); c.globalAlpha = alpha; c.globalCompositeOperation = op;
  c.drawImage(im, x, y, dw, dh);
  c.restore();
}

function beatPulse(t, from, to, amt) {
  if (t < from || t >= to) return 0;
  const tb = from + Math.floor((t - from) / BAR) * BAR;
  return amt * Math.exp(-(t - tb) / 0.22);
}

// ------------------------------------------------------------------ typography
function spacedWidth(c, s) { return c.measureText(s).width - parseFloat(c.letterSpacing || '0'); }

// per-character reveal (rise + fade), centered at x
function revealText(c, text, x, y, o) {
  const { font, t, tin, tout = 1e9, stagger = 0.035, dur = 0.8, rise = 26, spacing = 0, fill = '#fff', shadow = true, ease = eOutCubic, wiggle = 0 } = o;
  c.save();
  c.font = font; c.letterSpacing = spacing + 'px'; c.textAlign = 'left'; c.fillStyle = fill;
  if (shadow) { c.shadowColor = 'rgba(8,3,18,0.6)'; c.shadowBlur = 26; c.shadowOffsetY = 4; }
  const total = spacedWidth(c, text);
  const x0 = x - total / 2;
  const outA = 1 - smooth(inv(tout, tout + 0.45, t));
  const outDy = -eInCubic(inv(tout, tout + 0.45, t)) * 18;
  if (outA <= 0) { c.restore(); return; }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const e = ease(clamp((t - tin - i * stagger) / dur));
    if (e <= 0) continue;
    const px = x0 + c.measureText(text.slice(0, i)).width;
    c.globalAlpha = clamp(e) * outA;
    let dy = (1 - e) * rise + outDy;
    if (wiggle) {
      c.save();
      const cw = c.measureText(ch).width;
      c.translate(px + cw / 2, y + dy);
      c.rotate(Math.sin(t * 7 + i * 1.7) * wiggle);
      c.fillText(ch, -cw / 2, Math.sin(t * 5 + i) * 4);
      c.restore();
    } else c.fillText(ch, px, y + dy);
  }
  c.restore();
}

function kicker(c, text, x, y, t, tin, tout, o = {}) {
  const a = fadeInOut(t, tin, tout, 0.6, 0.4);
  if (a <= 0) return;
  const size = o.size ?? 26, sp = o.spacing ?? 10, col = o.color ?? '239,207,138';
  c.save();
  c.font = F.sans(size, 600); c.letterSpacing = sp + 'px';
  const tw = spacedWidth(c, text);
  const prog = eOutCubic(inv(tin, tin + 1.0, t));
  c.globalAlpha = a;
  c.fillStyle = `rgb(${col})`;
  c.shadowColor = 'rgba(8,3,18,0.6)'; c.shadowBlur = 18;
  c.textAlign = 'left';
  c.fillText(text, x - tw / 2, y);
  c.shadowBlur = 0;
  const L = (o.line ?? 70) * prog, gap = 26, ly = y - size * 0.36;
  for (const dir of [-1, 1]) {
    const xa = x + dir * (tw / 2 + gap), xb = xa + dir * L;
    const g = c.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, `rgba(${col},0.9)`); g.addColorStop(1, `rgba(${col},0)`);
    c.strokeStyle = g; c.lineWidth = 2;
    c.beginPath(); c.moveTo(xa, ly); c.lineTo(xb, ly); c.stroke();
  }
  c.restore();
  if (o.stars !== false) {
    const sx = tw / 2 + gap + L + 16;
    sparkle(c, x - sx, y - size * 0.36, 34 * prog, a * 0.9, t * 0.5, 'gold');
    sparkle(c, x + sx, y - size * 0.36, 34 * prog, a * 0.9, -t * 0.5, 'gold');
  }
}

// headline: words rise out of a mask
function headline(c, text, x, y, t, tin, tout, o = {}) {
  revealText(c, text, x, y, { font: F.serif(o.size ?? 92, o.weight ?? 500), t, tin, tout, stagger: o.stagger ?? 0.04, dur: 0.9, rise: 40, ease: eOutQuint, wiggle: o.wiggle ?? 0, fill: o.fill ?? '#fff' });
}

function caption(c, text, y, t, tin, tout, o = {}) {
  const size = o.size ?? 70;
  revealText(c, text, W / 2, y, { font: F.serif(size, 500), t, tin, tout, stagger: 0.03, dur: 0.85, rise: 30, ease: eOutQuint });
  // gold underline that draws from the centre out
  const a = fadeInOut(t, tin + 0.25, tout, 0.4, 0.4);
  if (a > 0) {
    c.save();
    c.font = F.serif(size, 500);
    const tw = c.measureText(text).width;
    const p = eOutCubic(inv(tin + 0.3, tin + 1.3, t));
    const half = tw * 0.32 * p, ly = y + size * 0.42;
    const g = c.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
    g.addColorStop(0, 'rgba(239,207,138,0)'); g.addColorStop(0.5, 'rgba(239,207,138,0.95)'); g.addColorStop(1, 'rgba(239,207,138,0)');
    c.globalAlpha = a; c.strokeStyle = g; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(W / 2 - half, ly); c.lineTo(W / 2 + half, ly); c.stroke();
    c.restore();
    sparkle(c, W / 2, ly, 46 * p, a, t * 0.8, 'gold');
  }
}

// gold-foil text rendered through an offscreen mask, with a travelling shimmer band
function goldLayer(c, drawMask, cy, t, shimmerTimes = [], o = {}) {
  const th = txt.height, top = cy - th / 2;
  reset(txtC);
  txtC.clearRect(0, 0, W, th);
  txtC.translate(0, -top);
  drawMask(txtC);
  reset(txtC);
  txtC.globalCompositeOperation = 'source-in';
  const g = txtC.createLinearGradient(0, th * 0.30, 0, th * 0.70);
  g.addColorStop(0, '#fff4d2'); g.addColorStop(0.35, '#f3cf7f'); g.addColorStop(0.55, '#c38d36'); g.addColorStop(0.75, '#f7dc96'); g.addColorStop(1, '#a8701f');
  txtC.fillStyle = g; txtC.fillRect(0, 0, W, th);
  txtC.globalCompositeOperation = 'source-atop';
  for (const st of shimmerTimes) {
    const p = (t - st) / 1.1;
    if (p < 0 || p > 1) continue;
    const sx = lerp(-300, W + 300, eInOutSine(p));
    const sg = txtC.createLinearGradient(sx - 160, 0, sx + 160, th * 0.25);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    txtC.fillStyle = sg; txtC.fillRect(0, 0, W, th);
  }
  c.save();
  c.globalAlpha = o.alpha ?? 1;
  c.shadowColor = 'rgba(30,8,4,0.7)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
  c.drawImage(txt, 0, top);
  c.shadowColor = `rgba(255,190,100,${o.glow ?? 0.55})`; c.shadowBlur = 40; c.shadowOffsetY = 0;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = (o.alpha ?? 1) * 0.35;
  c.drawImage(txt, 0, top);
  c.restore();
}

function neonText(c, text, x, y, size, a) {
  if (a <= 0.01) return;
  c.save();
  c.font = F.neon(size); c.textAlign = 'center';
  c.globalAlpha = a;
  glow(c, x, y - size * 0.3, size * 6, 0.18 * a, 'pink');
  c.fillStyle = '#ffe9f6';
  c.shadowColor = 'rgba(255,50,170,1)';
  for (const [blur, al] of [[60, 0.9], [26, 1], [8, 1]]) {
    c.shadowBlur = blur; c.globalAlpha = a * al;
    c.fillText(text, x, y);
  }
  c.restore();
}

// ------------------------------------------------------------------ cards & polaroids
function roundRectPath(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

function makeCard(im, w, h, S = 1.2) {
  const cw = Math.round(w * S), ch = Math.round(h * S), r = 26 * S;
  const cv = mk(cw, ch), c = cv.getContext('2d');
  c.save(); roundRectPath(c, 0, 0, cw, ch, r); c.clip();
  const sc = Math.max(cw / im.width, ch / im.height);
  c.drawImage(im, (cw - im.width * sc) / 2, (ch - im.height * sc) / 2, im.width * sc, im.height * sc);
  c.restore();
  const g = c.createLinearGradient(0, 0, cw, ch);
  g.addColorStop(0, '#fff1c9'); g.addColorStop(0.3, '#d9a44c'); g.addColorStop(0.55, '#fbe3a6'); g.addColorStop(0.8, '#b8822f'); g.addColorStop(1, '#f6d58c');
  c.strokeStyle = g; c.lineWidth = 5 * S;
  roundRectPath(c, 2.5 * S, 2.5 * S, cw - 5 * S, ch - 5 * S, r - 2 * S); c.stroke();
  const pad = 90, sh = mk(w + pad * 2, h + pad * 2), sc2 = sh.getContext('2d');
  sc2.filter = 'blur(34px)'; sc2.fillStyle = 'rgba(0,0,0,0.75)';
  roundRectPath(sc2, pad, pad, w, h, 26); sc2.fill();
  return { cv, sh, w, h, pad };
}

function drawCard(c, card, x, y, s, rot, o = {}) {
  c.save();
  c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.globalAlpha = o.alpha ?? 1;
  c.drawImage(card.sh, -card.w / 2 - card.pad, -card.h / 2 - card.pad + 34, card.w + card.pad * 2, card.h + card.pad * 2);
  c.drawImage(card.cv, -card.w / 2, -card.h / 2, card.w, card.h);
  if (o.glare !== undefined && o.glare > 0 && o.glare < 1) {
    roundRectPath(c, -card.w / 2, -card.h / 2, card.w, card.h, 26); c.clip();
    const gx = lerp(-card.w * 1.2, card.w * 1.2, eInOutSine(o.glare));
    const g = c.createLinearGradient(gx - 220, -card.h / 2, gx + 220, card.h / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,248,230,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g; c.fillRect(-card.w / 2, -card.h / 2, card.w, card.h);
  }
  c.restore();
}

function buildCards() {
  CARD.selfie = makeCard(IMG.selfie, 960, 720);
  CARD.family = makeCard(IMG.family, 840, 1120);
  CARD.santa = makeCard(IMG.santa, 980, 551);
  CARD.dino = makeCard(IMG.dino, 940, 529);
  CARD.squad = makeCard(IMG.squad, 940, 529);
  CARD.silly1 = makeCard(IMG.silly1, 820, 615);
  CARD.silly2 = makeCard(IMG.silly2, 820, 615);
}

const PW = 310, PH = 372, PP = 266; // polaroid frame / photo size (display px)
function makePolaroid(key, label, S, zoom = 1.25) {
  const im = IMG[key], [fx, fy] = PHOTOS[key].face;
  const cw = Math.round(PW * S), ch = Math.round(PH * S);
  const pad = Math.round(40 * S);
  const cv = mk(cw + pad * 2, ch + pad * 2), c = cv.getContext('2d');
  c.translate(pad, pad);
  c.save(); c.filter = `blur(${12 * S}px)`; c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(6 * S, 16 * S, cw - 6 * S, ch - 6 * S); c.restore();
  const pg = c.createLinearGradient(0, 0, cw, ch);
  pg.addColorStop(0, '#fffdf8'); pg.addColorStop(1, '#efe8db');
  c.fillStyle = pg; c.fillRect(0, 0, cw, ch);
  const m = (PW - PP) / 2 * S, ps = PP * S;
  // square crop centred on her face, clamped to the image
  const side = Math.min(im.width, im.height) / zoom;
  const sx = clamp(fx * im.width - side / 2, 0, im.width - side), sy = clamp(fy * im.height - side * 0.45, 0, im.height - side);
  c.drawImage(im, sx, sy, side, side, m, m, ps, ps);
  c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1.5 * S; c.strokeRect(m, m, ps, ps);
  c.fillStyle = '#3a3044'; c.font = F.hand(38 * S, 600); c.textAlign = 'center';
  c.fillText(label, cw / 2, m + ps + 62 * S);
  return { cv, pad, S };
}

const WALL = [
  // key, label, col, row, rot(deg), dx, dy
  ['bridge', 'sunshine', 0, 0, -6, 6, 10],
  ['hug', 'best hugs', 1, 0, 4, 0, -12],
  ['elevator', 'lvl 35', 2, 0, -3, -8, 18],
  ['family', 'the fam', 0, 1, 5, 4, -6],
  ['neon', 'birthday girl', 1, 1, -2.5, 0, 6],
  ['aquarium', 'under the sea', 2, 1, 7, -4, -10],
  ['selfie', 'pure joy', 0, 2, -4, 10, 8],
  ['santa', 'nice list!', 1, 2, 3, -6, -4],
  ['dino', 'rawr!', 2, 2, -7, -10, 12],
  ['squad', 'the squad', 0, 3, 6, 8, -14],
  ['silly1', 'silly face #1', 1, 3, -5, 0, 10],
  ['silly2', 'silly face #2', 2, 3, 4, -6, -6],
];
const WALL_ORDER = ['bridge', 'aquarium', 'squad', 'hug', 'silly2', 'family', 'santa', 'elevator', 'dino', 'selfie', 'silly1', 'neon'];
function buildPolaroids() {
  for (const [key, label] of WALL) POLA[key] = makePolaroid(key, label, key === 'neon' ? 4 : 2, key === 'neon' ? 1.05 : 1.25);
}
function wallPos(col, row, dx, dy) { return [190 + col * 350 + dx, 300 + row * 460 + dy]; }

// ------------------------------------------------------------------ particle systems
function burst(c, t, t0, n, seed, ox, oy, o = {}) {
  const age = t - t0;
  const life = o.life ?? 2.4;
  if (age < 0 || age > life + 0.6) return;
  const r = rngFrom(seed), k = o.drag ?? 2.2, cols = o.cols ?? ['gold', 'gold', 'white', 'pink'];
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2, sp = (o.speed ?? 900) * (0.25 + r() * 0.75);
    const lf = life * (0.5 + r() * 0.5), sz = (o.size ?? 40) * (0.4 + r() * 0.9), col = cols[Math.floor(r() * cols.length)];
    const tw = r() * 6.3;
    if (age > lf) continue;
    const d = (sp / k) * (1 - Math.exp(-k * age));
    const x = ox + Math.cos(ang) * d * (o.sx ?? 1), y = oy + Math.sin(ang) * d + (o.grav ?? 60) * age * age;
    const a = (1 - age / lf) * (0.6 + 0.4 * Math.sin(age * 18 + tw));
    sparkle(c, x, y, sz * (1 - 0.4 * age / lf), a, tw + age, col);
  }
}

function popSparkles(c, t, times, seed, region, o = {}) {
  const r = rngFrom(seed);
  for (const t0 of times) {
    const x = region[0] + r() * region[2], y = region[1] + r() * region[3], rot = r() * 2, col = (o.cols ?? ['gold', 'white', 'pink'])[Math.floor(r() * 3)];
    const age = t - t0, life = o.life ?? 1.1;
    if (age < 0 || age > life) continue;
    const p = age / life;
    sparkle(c, x, y, (o.size ?? 90) * Math.sin(Math.PI * Math.min(1, p * 1.6)) * (1 - p * 0.3), 1 - p * p, rot + age * 1.5, col);
  }
}

// ------------------------------------------------------------------ scenes
function intro(c, t) {
  drawWorld(c, t, { fly: 1.6, aurora: 0.4 + 0.6 * smooth(inv(0, 6, t)) });
  // twinkles synced to the high bell notes
  popSparkles(c, t, TL.twinkles, 31, [120, 300, 840, 1300], { size: 110, life: 1.6 });
  popSparkles(c, t, TL.introArp, 32, [80, 200, 920, 1500], { size: 50, life: 0.9, cols: ['white', 'gold', 'rose'] });
  revealText(c, 'Every star has a story.', W / 2, 930, { font: F.serif(78, 500), t, tin: 0.7, tout: 3.15, stagger: 0.045, dur: 1.1, rise: 24 });
  revealText(c, 'This one is called…', W / 2, 930, { font: F.serif(78, 500), t, tin: 3.7, tout: 6.35, stagger: 0.05, dur: 1.1, rise: 24 });
  // the star gathers itself at the centre, then flares into the title
  const og = smooth(inv(5.6, 7.2, t));
  if (og > 0) {
    const cy = 960;
    glow(c, W / 2, cy, 120 + 1300 * og * og, 0.9 * og, 'gold');
    glow(c, W / 2, cy, 60 + 260 * og, og, 'white');
    c.save(); c.globalCompositeOperation = 'lighter';
    const sw = W * (0.2 + 1.2 * og * og), g = c.createLinearGradient(W / 2 - sw / 2, 0, W / 2 + sw / 2, 0);
    g.addColorStop(0, 'rgba(255,200,140,0)'); g.addColorStop(0.5, `rgba(255,236,210,${0.9 * og})`); g.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = g; c.fillRect(W / 2 - sw / 2, cy - 3 - 4 * og, sw, 6 + 8 * og);
    c.restore();
    sparkle(c, W / 2, cy, 140 + 500 * og * og, og, t * 0.6, 'gold');
  }
  const fadeIn = 1 - smooth(inv(0, 1.8, t));
  if (fadeIn > 0) { c.fillStyle = `rgba(0,0,0,${fadeIn})`; c.fillRect(0, 0, W, H); }
}

let NAME_SIZE = 0;
function title(c, t) {
  const t0 = 7.2, u = t - t0;
  drawWorld(c, t, { fly: 0.8, aurora: 1 });
  const cam = 1 + 0.05 * eInOutSine(inv(t0, 14.4, t));
  c.save();
  c.translate(W / 2, 960); c.scale(cam, cam); c.translate(-W / 2, -960);
  // rotating god rays
  c.save(); c.globalCompositeOperation = 'lighter';
  c.translate(W / 2, 930); c.rotate(t * 0.05);
  const ra = 0.07 * smooth(inv(t0, t0 + 1.5, t));
  for (let i = 0; i < 14; i++) {
    c.rotate((Math.PI * 2) / 14);
    const g = c.createLinearGradient(0, 0, 0, -1300);
    g.addColorStop(0, `rgba(255,214,150,${ra * (i % 2 ? 1 : 0.6)})`); g.addColorStop(1, 'rgba(255,214,150,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-70, -1300); c.lineTo(70, -1300); c.closePath(); c.fill();
  }
  c.restore();
  // shockwave ring
  if (u >= 0 && u < 1.3) {
    const p = eOutCubic(u / 1.3);
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,220,160,${0.8 * (1 - p)})`; c.lineWidth = 24 * (1 - p) + 2;
    c.shadowColor = 'rgba(255,160,90,1)'; c.shadowBlur = 40;
    c.beginPath(); c.arc(W / 2, 960, 40 + 1100 * p, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  burst(c, t, t0, 150, 11, W / 2, 960, { speed: 1500, life: 3.0, size: 46, grav: 40 });

  // neon "Happy Birthday" switches on with a flicker (timed to the buzz in the score)
  let neonA = 0;
  for (const [a, b] of TL.neonFlicker) if (t >= a && t < b) neonA = 1;
  const last = TL.neonFlicker[TL.neonFlicker.length - 1];
  if (t >= last[0]) neonA = 0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 7.3);
  neonText(c, 'Happy Birthday', W / 2, 800, 128, neonA * (1 - smooth(inv(14.1, 14.5, t))));

  // HABIBA in gold foil, letters dropping in
  if (!NAME_SIZE) { c.font = F.caps(200); c.letterSpacing = '22px'; NAME_SIZE = Math.min(200, 200 * 900 / spacedWidth(c, 'HABIBA')); c.letterSpacing = '0px'; }
  const track = lerp(14, 30, eOutCubic(inv(t0, 14.4, t)));
  goldLayer(c, (g) => {
    g.font = F.caps(NAME_SIZE); g.letterSpacing = track + 'px'; g.fillStyle = '#fff';
    const name = 'HABIBA', tw = spacedWidth(g, name), x0 = W / 2 - tw / 2;
    for (let i = 0; i < name.length; i++) {
      const e = eOutExpo(clamp((t - t0 - 0.05 - i * 0.075) / 0.9));
      if (e <= 0) continue;
      const px = x0 + g.measureText(name.slice(0, i)).width, cw = g.measureText(name[i]).width;
      g.save();
      g.globalAlpha = clamp(e * 1.4);
      g.translate(px + cw / 2, 1030 - NAME_SIZE * 0.35);
      const s = lerp(1.9, 1, e); g.scale(s, s);
      g.fillText(name[i], -cw / 2, NAME_SIZE * 0.35 - (1 - e) * 30);
      g.restore();
    }
  }, 960, t, [t0 + 1.4, t0 + 4.6]);
  kicker(c, 'THE ONE & ONLY', W / 2, 1150, t, t0 + 1.9, 14.0, { size: 26, spacing: 12 });
  popSparkles(c, t, TL.titleGlitter, 41, [140, 820, 800, 300], { size: 120, life: 1.2 });
  popSparkles(c, t, TL.titleArp, 42, [60, 250, 960, 1450], { size: 46, life: 0.8, cols: ['white', 'gold', 'rose'] });
  c.restore();
  // the flare from the intro resolves into a white-gold flash
  if (u >= 0 && u < 1.2) {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(255,236,205,${Math.exp(-u / 0.16)})`; c.fillRect(0, 0, W, H);
    c.restore();
  }
}

function fullBleed(c, t, key, o) {
  const im = IMG[key];
  const u = eInOutSine(inv(o.t0 - 0.6, o.t1 + 0.6, t));
  const z = lerp(o.z[0], o.z[1], u) + (o.pulse ? beatPulse(t, o.t0, o.t1, o.pulse) : 0);
  const fx = lerp(o.f[0][0], o.f[1][0], u), fy = lerp(o.f[0][1], o.f[1][1], u);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  drawCover(c, im, fx, fy, z);
  const bl = typeof o.bloom === 'function' ? o.bloom(t) : (o.bloom ?? 0.3);
  if (bl > 0) drawCover(c, IMG[key + '_bloom'], fx, fy, z, bl, 'screen');
  // grade toward the film's palette: plum shadows at the bottom, soft top
  const g = c.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, 'rgba(14,6,26,0)'); g.addColorStop(0.55, 'rgba(14,6,26,0.55)'); g.addColorStop(1, 'rgba(10,4,20,0.88)');
  c.fillStyle = g; c.fillRect(0, H * 0.55, W, H * 0.45);
  const g2 = c.createLinearGradient(0, 0, 0, 360);
  g2.addColorStop(0, 'rgba(10,4,20,0.45)'); g2.addColorStop(1, 'rgba(10,4,20,0)');
  c.fillStyle = g2; c.fillRect(0, 0, W, 360);
  if (o.extra) o.extra(c, t);
  if (o.chapter) {
    kicker(c, o.chapter[0], W / 2, 1460, t, o.t0 + 0.4, o.t1 - 0.55);
    headline(c, o.chapter[1], W / 2, 1572, t, o.t0 + 0.6, o.t1 - 0.5);
  }
  if (o.caption) caption(c, o.caption, 1600, t, o.t0 + 0.45, o.t1 - 0.5);
}

function lowerThird(c) {
  const g = c.createLinearGradient(0, 1080, 0, H);
  g.addColorStop(0, 'rgba(12,4,22,0)'); g.addColorStop(0.35, 'rgba(12,4,22,0.62)'); g.addColorStop(1, 'rgba(8,3,16,0.9)');
  c.fillStyle = g; c.fillRect(0, 1080, W, H - 1080);
}

function cardBackdrop(c, t, key, o = {}) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  drawCover(c, IMG[key + '_blur'], 0.5 + 0.04 * Math.sin(t * 0.2), 0.5, 1.25 + 0.03 * Math.sin(t * 0.15));
  c.fillStyle = 'rgba(16,7,30,0.44)'; c.fillRect(0, 0, W, H);
  c.save(); c.globalCompositeOperation = 'soft-light'; c.globalAlpha = 0.5; c.drawImage(WORLD, 0, 0); c.restore();
  c.save(); c.globalAlpha = 0.55; drawWorldOverlay(c, t); c.restore();
}
function drawWorldOverlay(c, t) {
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const b of BOKEH) {
    const y = ((b.y - t * b.sp) % (H + 200) + H + 200) % (H + 200) - 100;
    const x = b.x + Math.sin(t * 0.3 + b.ph) * 30;
    c.globalAlpha = b.a * 0.8;
    c.drawImage(SPR.bokeh[b.col], x - b.rad, y - b.rad, b.rad * 2, b.rad * 2);
  }
  c.restore();
}

function cardScene(c, t, key, o) {
  cardBackdrop(c, t, key);
  const u = inv(o.t0 - 0.6, o.t1 + 0.6, t);
  const enter = eOutCubic(inv(o.t0 - 0.3, o.t0 + 0.9, t));
  const s = lerp(0.94, 1.0, enter) + 0.035 * eInOutSine(u) + (o.pulse ? beatPulse(t, o.t0, o.t1, o.pulse) : 0);
  const rot = (lerp(o.rot[0], o.rot[1], eInOutSine(u)) * Math.PI) / 180;
  const fy = Math.sin(t * 1.1) * 8;
  drawCard(c, CARD[key], o.x, o.y + fy, s, rot, { glare: inv(o.t0 + 0.2, o.t0 + 1.6, t) });
  if (o.extra) o.extra(c, t);
  if (o.caption) caption(c, o.caption, o.capY, t, o.t0 + 0.45, o.t1 - 0.5);
}

function duoScene(c, t, keys, o) {
  cardBackdrop(c, t, keys[0]);
  const u = inv(o.t0 - 0.6, o.t1 + 0.6, t);
  keys.forEach((k, i) => {
    const e = o.enter === 'bounce' ? eOutBack(clamp((t - o.t0 + 0.15 - i * 0.12) / 0.75), 1.2) : eOutCubic(clamp((t - o.t0 + 0.35 - i * 0.12) / 0.95));
    const dir = i === 0 ? -1 : 1;
    const x = o.x + dir * (1 - e) * 1150;
    const rot = ((o.rot[i] + dir * (1 - e) * 14 + Math.sin(t * 0.9 + i) * 0.6) * Math.PI) / 180;
    const s = 1 + 0.03 * eInOutSine(u) + (o.pulse ? beatPulse(t, o.t0, o.t1, o.pulse) : 0);
    drawCard(c, CARD[k], x, o.y[i] + Math.sin(t * 1.2 + i * 2) * 7, s, rot, { glare: inv(o.t0 + 0.4 + i * 0.25, o.t0 + 1.8 + i * 0.25, t) });
  });
  if (o.extra) o.extra(c, t);
}

// scene-specific atmospherics
const BUBBLES = (() => { const r = rngFrom(51), a = []; for (let i = 0; i < 38; i++) a.push({ x: r() * W, y: r() * (H + 200), s: 5 + r() * 18, sp: 60 + r() * 140, ph: r() * 6.3 }); return a; })();
function bubbles(c, t) {
  c.save();
  for (const b of BUBBLES) {
    const y = H + 100 - (((b.y + t * b.sp) % (H + 200)) + H + 200) % (H + 200);
    const x = b.x + Math.sin(t * 1.6 + b.ph) * 16;
    c.globalAlpha = 0.5;
    c.strokeStyle = 'rgba(210,240,255,0.8)'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(x, y, b.s, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 0.7; c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(x - b.s * 0.35, y - b.s * 0.35, b.s * 0.22, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
const SNOW = (() => { const r = rngFrom(61), a = []; for (let i = 0; i < 150; i++) a.push({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.7, ph: r() * 6.3 }); return a; })();
function snow(c, t) {
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const f of SNOW) {
    const y = ((f.y + t * 90 * f.z) % (H + 40) + H + 40) % (H + 40) - 20;
    const x = f.x + Math.sin(t * 0.9 * f.z + f.ph) * 40 * f.z;
    const s = 4 + 14 * f.z * f.z;
    c.globalAlpha = 0.25 + 0.55 * f.z;
    c.drawImage(SPR.dot, x - s / 2, y - s / 2, s, s);
  }
  c.restore();
}
function beatSparkles(c, t, from, to, seed, n = 3) {
  if (t < from - 0.1 || t > to + 1) return;
  const times = [];
  for (let tb = from; tb < to; tb += BEAT) for (let k = 0; k < n; k++) times.push(tb + k * 0.05);
  popSparkles(c, t, times, seed, [40, 180, 1000, 1560], { size: 70, life: 0.7, cols: ['gold', 'white', 'pink'] });
}

const S = {};
S.bridge = (c, t) => fullBleed(c, t, 'bridge', { t0: 14.4, t1: 18.0, z: [1.0, 1.08], f: [[0.45, 0.5], [0.36, 0.46]], bloom: 0.2, chapter: ['CHAPTER ONE', 'The sweetest heart'] });
S.hug = (c, t) => fullBleed(c, t, 'hug', { t0: 18.0, t1: 21.6, z: [1.03, 1.12], f: [[0.56, 0.52], [0.5, 0.44]], bloom: 0.2, caption: 'the best hugs' });
S.selfie = (c, t) => cardScene(c, t, 'selfie', { t0: 21.6, t1: 25.2, x: 540, y: 880, rot: [-2.2, 1.0], caption: 'pure joy', capY: 1440 });
S.family = (c, t) => cardScene(c, t, 'family', { t0: 25.2, t1: 28.8, x: 540, y: 850, rot: [1.6, -1.2], caption: 'surrounded by love', capY: 1600 });
S.elevator = (c, t) => fullBleed(c, t, 'elevator', { t0: 28.8, t1: 32.4, z: [1.0, 1.07], f: [[0.52, 0.5], [0.5, 0.46]], bloom: 0.35, pulse: 0.012, chapter: ['CHAPTER TWO', 'The adventurer'] });
S.aquarium = (c, t) => fullBleed(c, t, 'aquarium', { t0: 32.4, t1: 36.0, z: [1.04, 1.1], f: [[0.5, 0.56], [0.46, 0.58]], bloom: (t) => 0.5 + 0.12 * Math.sin(t * 2), pulse: 0.012, caption: 'under the sea', extra: bubbles });
S.santa = (c, t) => cardScene(c, t, 'santa', { t0: 36.0, t1: 39.6, x: 540, y: 860, rot: [2.0, -1.0], pulse: 0.01, caption: 'officially on the nice list', capY: 1380, extra: snow });
S.night = (c, t) => {
  duoScene(c, t, ['dino', 'squad'], { t0: 39.6, t1: 43.2, x: 540, y: [620, 1180], rot: [-2.5, 2.0], pulse: 0.01 });
  caption(c, 'late-night adventures', 1610, t, 40.05, 42.7);
};
S.silly = (c, t) => {
  duoScene(c, t, ['silly1', 'silly2'], { t0: 43.2, t1: 46.8, x: 540, y: [670, 1270], rot: [-3, 2.5], pulse: 0.014, enter: 'bounce' });
  kicker(c, 'CHAPTER THREE', W / 2, 205, t, 43.5, 46.3);
  headline(c, 'The silly one', W / 2, 310, t, 43.65, 46.3, { size: 88, wiggle: 0.07 });
  beatSparkles(c, t, 43.2, 46.8, 71, 2);
};
S.wall = (c, t) => {
  drawWorld(c, t, { fly: 0.5, aurora: 0.8 });
  const t0 = 46.8;
  const pull = eOutCubic(inv(t0, 49.3, t));
  let sc = lerp(1.12, 0.97, pull), camX = 540, camY = lerp(1040, 990, pull), crot = 0;
  const neon = WALL.find((w) => w[0] === 'neon');
  const [nx, ny] = wallPos(neon[2], neon[3], neon[5], neon[6]);
  const push = eInCubic(inv(49.25, 50.55, t));
  if (push > 0) {
    sc = lerp(sc, 3.4, push);
    camX = lerp(camX, nx, smooth(inv(49.25, 50.2, t)));
    camY = lerp(camY, ny - 22, smooth(inv(49.25, 50.2, t)));
    crot = (-neon[4] * Math.PI) / 180 * smooth(inv(49.25, 50.2, t));
  }
  c.save();
  c.translate(W / 2, H / 2); c.rotate(crot); c.scale(sc, sc); c.translate(-camX, -camY);
  const order = [...WALL].sort((a, b) => WALL_ORDER.indexOf(a[0]) - WALL_ORDER.indexOf(b[0]));
  order.forEach((w, i) => {
    const [key, , col, row, rotD, dx, dy] = w;
    const land = TL.polaroidLands[i], fl = 0.5;
    const p = clamp((t - (land - fl)) / fl);
    if (p <= 0) return;
    const [fx, fy] = wallPos(col, row, dx, dy);
    const r = rngFrom(200 + i);
    const ang = Math.atan2(fy - 960, fx - 540) + (r() - 0.5) * 0.8;
    const e = eOutCubic(p);
    const x = lerp(fx + Math.cos(ang) * 700, fx, e), y = lerp(fy + Math.sin(ang) * 700, fy, e);
    const settle = t > land ? 1 - 0.03 * Math.sin(Math.min(1, (t - land) / 0.18) * Math.PI) : 1;
    const s = lerp(2.1, 1, e) * settle;
    const rot = ((rotD + (1 - e) * (r() > 0.5 ? 30 : -30)) * Math.PI) / 180;
    const P = POLA[key];
    c.save();
    c.translate(x, y); c.rotate(rot); c.scale(s / P.S, s / P.S);
    c.globalAlpha = clamp(p * 3);
    c.drawImage(P.cv, -P.cv.width / 2, -P.cv.height / 2);
    c.restore();
  });
  c.restore();
  order.forEach((w, i) => {
    const [fx, fy] = wallPos(w[2], w[3], w[5], w[6]);
    if (push <= 0) burst(c, t, TL.polaroidLands[i], 8, 300 + i, W / 2 + (fx - camX) * sc, H / 2 + (fy - camY) * sc, { speed: 420, life: 0.8, size: 30, grav: 0 });
  });
};
S.neon = (c, t) => {
  fullBleed(c, t, 'neon', { t0: 50.4, t1: 57.6, z: [1.0, 1.08], f: [[0.5, 0.46], [0.5, 0.40]], bloom: (t) => 0.42 + beatPulse(t, 50.4, 56.4, 0.25), extra: (c2, tt) => { lowerThird(c2); beatSparkles(c2, tt, 50.4, 56.4, 81, 1); } });
  kicker(c, 'HAPPY BIRTHDAY', W / 2, 1440, t, 50.6, 57.3, { size: 28, spacing: 13 });
  revealText(c, 'dear', W / 2, 1522, { font: F.serif(64, 500), t, tin: 51.55, tout: 57.3, stagger: 0.04, dur: 0.6, rise: 20 });
  // "Habiba" written on, left to right, in gold script
  const wp = eInOutSine(inv(52.15, 53.25, t));
  if (wp > 0) {
    goldLayer(c, (g) => {
      g.font = F.script(210); g.textAlign = 'center'; g.fillStyle = '#fff';
      g.save(); g.beginPath(); g.rect(0, 0, 150 + wp * 800, 3000); g.clip();
      g.fillText('Habiba', W / 2, 1715);
      g.restore();
    }, 1620, t, [53.6, 56.0], { alpha: 1 - smooth(inv(57.25, 57.7, t)), glow: 0.7 });
    if (wp < 1) sparkle(c, 150 + wp * 800, 1650 + Math.sin(wp * 9) * 40, 120, 1, t * 2, 'gold');
  }
  popSparkles(c, t, TL.nameGlitter, 91, [180, 1540, 720, 220], { size: 110, life: 1.1 });
};
S.outro = (c, t) => {
  drawWorld(c, t, { fly: 0.7, aurora: 0.9 });
  burst(c, t, 57.6, 60, 501, W / 2, 1200, { speed: 500, life: 3.2, size: 36, grav: -60, cols: ['gold', 'white', 'rose'] });
  revealText(c, 'Keep shining,', W / 2, 820, { font: F.serif(76, 500), t, tin: 58.3, tout: 66.0, stagger: 0.05, dur: 1.1, rise: 26 });
  const wp = eInOutSine(inv(59.3, 60.9, t));
  if (wp > 0) {
    goldLayer(c, (g) => {
      g.font = F.script(150); g.textAlign = 'center'; g.fillStyle = '#fff';
      g.save(); g.beginPath(); g.rect(0, 0, 90 + wp * 900, 3000); g.clip();
      g.fillText('our brightest star', W / 2, 1010);
      g.restore();
    }, 960, t, [61.4, 63.0], { alpha: 1 - smooth(inv(66.0, 66.6, t)), glow: 0.6 });
    if (wp < 1) sparkle(c, 90 + wp * 900, 960, 110, 1, t * 2, 'gold');
  }
  kicker(c, 'HAPPY BIRTHDAY, HABIBA', W / 2, 1190, t, 61.2, 66.0, { size: 27, spacing: 11, line: 50 });
  // the final chime: one star flares
  const fa = t - TL.finalChime;
  if (fa > -0.2) {
    const p = clamp((fa + 0.2) / 0.5);
    const decay = Math.exp(-Math.max(0, fa) / 1.6);
    sparkle(c, W / 2, 1310, (60 + 420 * eOutCubic(p)) * (0.55 + 0.45 * decay), 0.95 * (1 - smooth(inv(66.2, 67.6, t))), fa * 0.3, 'gold');
    glow(c, W / 2, 1310, 700 * eOutCubic(p), 0.35 * decay, 'gold');
    popSparkles(c, t, TL.finalGlitter, 111, [140, 600, 800, 900], { size: 90, life: 1.4 });
  }
};

const CUTS = [
  { t: 7.2, type: 'cut' },
  { t: 14.4, type: 'zoom' },
  { t: 18.0, type: 'leak' },
  { t: 21.6, type: 'iris', cx: 540, cy: 880 },
  { t: 25.2, type: 'wipe' },
  { t: 28.8, type: 'zoom' },
  { t: 32.4, type: 'whip', dx: -1, dy: 0 },
  { t: 36.0, type: 'whip', dx: 0, dy: -1 },
  { t: 39.6, type: 'whip', dx: -1, dy: 0 },
  { t: 43.2, type: 'zoom', big: true },
  { t: 46.8, type: 'leak' },
  { t: 50.4, type: 'flash' },
  { t: 57.6, type: 'dream' },
];
const SCENES = [intro, title, S.bridge, S.hug, S.selfie, S.family, S.elevator, S.aquarium, S.santa, S.night, S.silly, S.wall, S.neon, S.outro];
const TW = { cut: [0, 0], zoom: [0.4, 0.5], leak: [0.5, 0.6], iris: [0.15, 0.75], wipe: [0.42, 0.45], whip: [0.28, 0.32], flash: [0.25, 0.5], dream: [0.3, 1.7] };

// ------------------------------------------------------------------ transitions
function drawScaled(c, img, s, alpha = 1, cx = W / 2, cy = H / 2, op = 'source-over') {
  if (alpha <= 0) return;
  c.save(); c.globalAlpha = clamp(alpha); c.globalCompositeOperation = op;
  c.drawImage(img, cx - cx * s, cy - cy * s, W * s, H * s);
  c.restore();
}
function zoomBlurred(c, img, s, alpha, strength) {
  if (alpha <= 0) return;
  if (strength < 0.01) return drawScaled(c, img, s, alpha);
  reset(ctxC);
  const n = 6;
  for (let i = 0; i < n; i++) { ctxC.globalAlpha = 1 / (i + 1); ctxC.drawImage(img, W / 2 - (W * s * (1 + strength * i / n)) / 2, H / 2 - (H * s * (1 + strength * i / n)) / 2, W * s * (1 + strength * i / n), H * s * (1 + strength * i / n)); }
  drawScaled(c, bufC, 1, alpha);
}
function warmFlash(c, a, cx = W / 2, cy = H / 2) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, H * 0.8);
  g.addColorStop(0, `rgba(255,240,215,${a})`); g.addColorStop(0.6, `rgba(255,190,140,${a * 0.6})`); g.addColorStop(1, `rgba(255,120,160,${a * 0.25})`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
}
function lightLeak(c, a, p) {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'screen';
  const blobs = [[lerp(-200, W + 200, p), H * 0.3, 900, '255,150,70'], [lerp(W + 100, -100, p), H * 0.72, 1000, '255,70,160'], [W * 0.5, lerp(H, 0, p), 700, '255,225,170']];
  for (const [x, y, r, col] of blobs) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  c.restore();
}

const TRANS = {
  zoom(c, A, B, p, cut) {
    const p0 = TW.zoom[0] / (TW.zoom[0] + TW.zoom[1]);
    const pa = inv(0, p0 + 0.12, p), pb = inv(p0 - 0.12, 1, p);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    zoomBlurred(c, A, lerp(1, cut.big ? 1.9 : 1.55, eInCubic(pa)), 1, 0.25 * eInCubic(pa));
    zoomBlurred(c, B, lerp(1.45, 1, eOutCubic(pb)), smooth(inv(p0 - 0.14, p0 + 0.1, p)), 0.22 * (1 - eOutCubic(pb)));
    warmFlash(c, (cut.big ? 0.6 : 0.35) * Math.exp(-Math.pow((p - p0) / 0.12, 2)));
  },
  leak(c, A, B, p) {
    drawScaled(c, A, lerp(1, 1.04, p));
    drawScaled(c, B, lerp(1.04, 1, p), smooth(inv(0.25, 0.75, p)));
    lightLeak(c, 0.62 * bump(p), p);
  },
  iris(c, A, B, p, cut) {
    drawScaled(c, A, lerp(1, 1.1, eInCubic(p)));
    const e = eInOutCubic(p), R = e * 1250;
    c.save(); c.beginPath(); c.arc(cut.cx, cut.cy, Math.max(0.1, R), 0, Math.PI * 2); c.clip();
    drawScaled(c, B, lerp(1.12, 1, e), 1, cut.cx, cut.cy);
    c.restore();
    if (p < 0.98) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(255,214,150,${0.9 * (1 - p)})`; c.lineWidth = 6; c.shadowColor = 'rgba(255,170,90,1)'; c.shadowBlur = 30;
      c.beginPath(); c.arc(cut.cx, cut.cy, R, 0, Math.PI * 2); c.stroke();
      c.restore();
      const r = rngFrom(17);
      for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2 + p * 2; sparkle(c, cut.cx + Math.cos(a) * R, cut.cy + Math.sin(a) * R, 40 + r() * 60, (1 - p) * (0.5 + 0.5 * Math.sin(p * 20 + i)), a, r() > 0.5 ? 'gold' : 'white'); }
    }
  },
  wipe(c, A, B, p) {
    const e = eInOutCubic(p);
    drawScaled(c, A, lerp(1, 1.05, e));
    // diagonal edge travelling from bottom-left to top-right
    const ang = -0.45, len = 3000, pos = lerp(-960, 960, e);
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const cx = W / 2 + nx * pos, cy = H / 2 + ny * pos;
    c.save(); c.beginPath();
    c.moveTo(cx - ny * len, cy + nx * len); c.lineTo(cx + ny * len, cy - nx * len);
    c.lineTo(cx + ny * len - nx * len, cy - nx * len - ny * len); c.lineTo(cx - ny * len - nx * len, cy + nx * len - ny * len);
    c.closePath(); c.clip();
    drawScaled(c, B, lerp(1.06, 1, e));
    c.restore();
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,220,160,${0.95 * bump(p)})`; c.lineWidth = 5; c.shadowColor = 'rgba(255,170,90,1)'; c.shadowBlur = 36;
    c.beginPath(); c.moveTo(cx - ny * len, cy + nx * len); c.lineTo(cx + ny * len, cy - nx * len); c.stroke();
    c.restore();
  },
  whip(c, A, B, p, cut) {
    const e = eInOutCubic(p);
    const vel = p < 0.5 ? 12 * p * p : 12 * Math.pow(1 - p, 2); // derivative of the ease, normalised
    const span = cut.dx ? W : H, blur = vel * 0.07 * span;
    reset(ctxC);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const o = e * span + blur * (i / (n - 1) - 0.5);
      ctxC.globalAlpha = 1 / (i + 1);
      // composite strip: A then B following it
      ctxC.save(); ctxC.globalCompositeOperation = 'source-over';
      if (i === 0) { ctxC.drawImage(A, cut.dx * o, cut.dy * o); ctxC.drawImage(B, cut.dx * (o - span), cut.dy * (o - span)); }
      else {
        ctxC.drawImage(A, cut.dx * o, cut.dy * o);
        ctxC.drawImage(B, cut.dx * (o - span), cut.dy * (o - span));
      }
      ctxC.restore();
    }
    c.drawImage(bufC, 0, 0);
    // light streak at the seam
    const seam = (1 - e) * span;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * bump(p);
    if (cut.dx) { const x = cut.dx < 0 ? seam : W - seam; const g = c.createLinearGradient(x - 160, 0, x + 160, 0); g.addColorStop(0, 'rgba(255,200,160,0)'); g.addColorStop(0.5, 'rgba(255,230,200,0.9)'); g.addColorStop(1, 'rgba(255,200,160,0)'); c.fillStyle = g; c.fillRect(x - 160, 0, 320, H); }
    else { const y = cut.dy < 0 ? seam : H - seam; const g = c.createLinearGradient(0, y - 160, 0, y + 160); g.addColorStop(0, 'rgba(255,200,160,0)'); g.addColorStop(0.5, 'rgba(255,230,200,0.9)'); g.addColorStop(1, 'rgba(255,200,160,0)'); c.fillStyle = g; c.fillRect(0, y - 160, W, 320); }
    c.restore();
  },
  flash(c, A, B, p) {
    const p0 = TW.flash[0] / (TW.flash[0] + TW.flash[1]);
    drawScaled(c, A, 1);
    drawScaled(c, B, lerp(1.06, 1, eOutCubic(p)), smooth(inv(p0 - 0.1, p0 + 0.15, p)));
    warmFlash(c, 0.95 * Math.exp(-Math.pow((p - p0) / 0.16, 2)));
  },
  dream(c, A, B, p) {
    drawScaled(c, B, 1);
    drawScaled(c, A, lerp(1, 1.08, eOutCubic(p)), 1 - smooth(inv(0.1, 0.75, p)));
    lightLeak(c, 0.35 * bump(p), p);
  },
};

// ------------------------------------------------------------------ frame
function post(c, t, frameIdx) {
  // foreground gold dust, drifting up through everything
  c.save(); c.globalCompositeOperation = 'lighter';
  const da = smooth(inv(0.8, 3, t)) * (1 - smooth(inv(66, 67.5, t)));
  for (const d of DUST) {
    const y = ((d.y - t * 26 * d.z) % H + H) % H;
    const x = d.x + Math.sin(t * 0.5 * d.z + d.ph) * 40;
    const s = 3 + 9 * d.z * d.z;
    c.globalAlpha = da * (0.18 + 0.4 * d.z) * (0.55 + 0.45 * Math.sin(t * d.tw + d.ph));
    c.drawImage(SPR.dot, x - s, y - s, s * 2, s * 2);
  }
  c.restore();
  c.drawImage(VIGNETTE, 0, 0);
  c.save();
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.075;
  c.drawImage(GRAIN[frameIdx % GRAIN.length], 0, 0, W, H);
  c.restore();
  const end = smooth(inv(66.3, 67.85, t));
  if (end > 0) { c.fillStyle = `rgba(0,0,0,${end})`; c.fillRect(0, 0, W, H); }
}

function renderFrame(t, frameIdx = 0) {
  reset(ctx);
  let k = 0;
  while (k < CUTS.length && t >= CUTS[k].t) k++;
  let tr = null;
  if (k > 0) { const cu = CUTS[k - 1], w = TW[cu.type]; if (t < cu.t + w[1]) tr = k - 1; }
  if (tr === null && k < CUTS.length) { const cu = CUTS[k], w = TW[cu.type]; if (t >= cu.t - w[0]) tr = k; }
  if (tr !== null && TW[CUTS[tr].type][0] + TW[CUTS[tr].type][1] > 0) {
    const cu = CUTS[tr], w = TW[cu.type];
    const p = (t - (cu.t - w[0])) / (w[0] + w[1]);
    reset(ctxA); SCENES[tr](ctxA, t);
    reset(ctxB); SCENES[tr + 1](ctxB, t);
    reset(ctx);
    TRANS[cu.type](ctx, bufA, bufB, p, cu, t);
  } else {
    SCENES[k](ctx, t);
  }
  reset(ctx);
  post(ctx, t, frameIdx);
}

window.ready = load();
window.TOTAL = TOTAL;
window.grab = (t, frameIdx, q = 0.94) => { renderFrame(t, frameIdx); return canvas.toDataURL('image/jpeg', q); };
window.grabPng = (t, frameIdx) => { renderFrame(t, frameIdx); return canvas.toDataURL('image/png'); };
