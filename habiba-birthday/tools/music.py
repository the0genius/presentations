"""Original score for the film: modern melodic house, 120 BPM, D major, synthesized from scratch.

bar = 2.0 s (4 beats of 0.5 s). Every cut in the film lands on a bar or beat of this clock.
Chord loop (one per bar): F#m7 - Bm9 - Gmaj9 - A6, resolving to Dmaj9 under the end title.

  0-4   intro      felt piano, air, swell                     (neon sign through a slit)
  4-8   title      impact on Gmaj9, plucks enter              (HA/BI/BA text mask)
  8-16  verse      piano + pluck arp + light percussion
  16-32 groove     four-on-the-floor, sidechained pads, bass, hook
  32-36 breakdown  drums out, grid ticks, riser + snare build
  36-52 drop       full
  52-56 post       drums out, pads + piano
  56-66 outro      Dmaj9 resolution under the end title

writes build/music.wav and build/timeline.json
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BEAT = 0.5
BAR = 2.0
TOTAL = 66.0
rng = np.random.default_rng(11)
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "build")
OUT.mkdir(parents=True, exist_ok=True)

N = int(TOTAL * SR) + SR * 4
BUSES = ["piano", "pad", "pluck", "bass", "drums", "fx", "air"]
buses = {b: np.zeros((2, N)) for b in BUSES}
GAIN = {"piano": 0.72, "pad": 3.4, "pluck": 0.8, "bass": 0.48, "drums": 0.85, "fx": 0.7, "air": 0.8}
SEND = {"piano": 0.38, "pad": 0.3, "pluck": 0.35, "bass": 0.0, "drums": 0.06, "fx": 0.45, "air": 0.5}


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tarr(d):
    return np.arange(int(d * SR)) / SR


def pan2(y, p=0.0):
    a = (p + 1) * np.pi / 4
    return np.vstack([y * np.cos(a), y * np.sin(a)])


def add(bus, t0, sig):
    if sig.ndim == 1:
        sig = pan2(sig)
    i = int(round(t0 * SR))
    if i < 0:
        sig, i = sig[:, -i:], 0
    j = min(N, i + sig.shape[1])
    buses[bus][:, i:j] += sig[:, : j - i]


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output="sos"), x)


# ---------------------------------------------------------------- instruments
def piano(m, vel=0.6, dur=2.0):
    """Soft felt piano: two slightly detuned strings, stretched partials, darker at lower velocity."""
    f = mtof(m)
    t = tarr(dur + 1.6)
    Bi = 0.00028
    out = np.zeros((2, len(t)))
    for ch, cents in ((0, -0.7), (1, 0.7)):
        fs = f * 2 ** (cents / 1200)
        for k in range(1, 28):
            fk = fs * k * np.sqrt(1 + Bi * k * k)
            if fk > 7500:
                break
            a = (1 / k ** 1.25) * np.exp(-k * (0.42 - 0.22 * vel))
            dec = 3.2 * (261.6 / f) ** 0.45 / (1 + 0.22 * k)
            out[ch] += a * np.exp(-t / dec) * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
    env = np.minimum(1, t / 0.004) * np.where(t > dur, np.exp(-(t - dur) / 0.22), 1.0)
    thump = filt(rng.standard_normal(len(t)), "low", 600) * np.exp(-t / 0.012) * 0.04
    return (out * env + thump) * vel


def pluck(m, vel=0.6, ring=0.9):
    f = mtof(m)
    t = tarr(ring)
    out = np.zeros((2, len(t)))
    for ch, cents in ((0, -7), (1, 7)):
        fs = f * 2 ** (cents / 1200)
        for k in range(1, 40):
            if fs * k > 11000:
                break
            out[ch] += (1 / k) * np.exp(-t * (4.0 + 1.5 * k)) * np.sin(2 * np.pi * fs * k * t + rng.uniform(0, 6.28))
    out *= np.minimum(1, t / 0.002)
    return out * vel


def blep_saw(f, n, ph0):
    dt = f / SR
    ph = (ph0 + dt * np.arange(n)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt
    y[m] -= x * x + x + x + 1
    return y


def supersaw(notes, dur, att=0.05, rel=0.4, cutoff=2500, amp=0.05, voices=7, spread=22):
    T = dur + rel
    n = int(T * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    for m in notes:
        for v in range(voices):
            d = spread * (2 * v / (voices - 1) - 1)
            y = blep_saw(mtof(m) * 2 ** (d / 1200), n, rng.uniform())
            out[v % 2] += y * (1.0 if v == voices // 2 else 0.8)
    out = np.vstack([filt(filt(out[c], "low", cutoff), "high", 140) for c in range(2)])
    env = np.where(t < att, (t / att) ** 1.5, 1.0) * np.where(t > dur, np.exp(-(t - dur) / (rel / 3.5)), 1.0)
    return out * env * amp / voices


def sub_bass(m, dur, vel=1.0):
    f = mtof(m)
    t = tarr(dur + 0.08)
    sub = np.sin(2 * np.pi * f * t)
    mid = filt(blep_saw(f * 2, len(t), 0.0), "low", 700) * 0.28  # harmonics so it reads on phone speakers
    env = np.minimum(1, t / 0.006) * np.where(t > dur, np.exp(-(t - dur) / 0.02), 1.0)
    return np.tanh(1.3 * (sub + mid) * env) * vel


def kick(vel=1.0):
    t = tarr(0.55)
    f = 47 + 120 * np.exp(-t / 0.028) + 300 * np.exp(-t / 0.002)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    click = filt(rng.standard_normal(len(t)), "high", 2500) * np.exp(-t / 0.0025) * 0.22
    return np.tanh(2.0 * (body + click)) / np.tanh(2.0) * vel


def clap(vel=1.0):
    t = tarr(0.5)
    n = filt(rng.standard_normal(len(t)), "band", [1000, 5000])
    env = sum(np.where(t >= d, np.exp(-(t - d) / 0.0045), 0) for d in (0.0, 0.009, 0.019))
    env = env + np.where(t >= 0.027, 0.6 * np.exp(-(t - 0.027) / 0.09), 0)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03) * 0.25
    return (n * env + body) * vel


def hat(vel=1.0, open_=False):
    t = tarr(0.35 if open_ else 0.08)
    n = filt(rng.standard_normal(len(t)), "high", 7500)
    for fr in (5400, 7300, 8900):
        n += 0.12 * np.sign(np.sin(2 * np.pi * fr * t))
    n = filt(n, "high", 6500)
    return n * np.exp(-t / (0.11 if open_ else 0.018)) * np.minimum(1, t / 0.001) * vel


def snare(vel=1.0, hp=150):
    t = tarr(0.25)
    n = filt(rng.standard_normal(len(t)), "high", hp) * np.exp(-t / 0.06)
    tone = np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.04) * 0.5
    return (n * 0.6 + tone) * vel


def impact(vel=1.0):
    t = tarr(3.5)
    f = 32 + 60 * np.exp(-t / 0.18)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.0)
    hit = filt(rng.standard_normal(len(t)), "band", [120, 3200]) * np.exp(-t / 0.12) * 0.55
    y = np.tanh(1.4 * (boom + hit))
    return np.vstack([y, filt(y, "low", 9000)]) * vel


def riser(length, vel=1.0, f0=300, f1=7000):
    t = tarr(length)
    x = t / length
    noise = rng.standard_normal(len(t))
    centers = np.geomspace(f0, f1, 9)
    pos = x * (len(centers) - 1)
    y = np.zeros_like(t)
    for i, c in enumerate(centers):
        y += filt(noise, "band", [c / 1.4, min(c * 1.4, 22000)]) * np.clip(1 - np.abs(pos - i), 0, 1)
    y *= x ** 2.4
    return np.vstack([y, np.roll(y, 300)]) * vel


def reverse_swell(length, vel=1.0):
    t = tarr(length)
    n = filt(rng.standard_normal(len(t)), "high", 2500) * np.exp(-t / 0.8)
    n = n[::-1] * (t / length) ** 1.2
    return np.vstack([n, np.roll(n, 200)]) * vel


def whoosh(length=0.6, vel=1.0, direction=1):
    t = tarr(length)
    x = t / length
    noise = rng.standard_normal(len(t))
    y = (filt(noise, "band", [250, 1100]) * (1 - x) + filt(noise, "band", [1200, 5500]) * x) * np.sin(np.pi * x) ** 2.4
    p = (2 * x - 1) * 0.6 * direction
    a = (p + 1) * np.pi / 4
    return np.vstack([y * np.cos(a), y * np.sin(a)]) * vel


def tick(vel=1.0, f=2600):
    t = tarr(0.06)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.008) + filt(rng.standard_normal(len(t)), "high", 5000) * np.exp(-t / 0.002) * 0.3
    return y * vel


def air(length, vel=1.0):
    """slow-moving filtered noise bed for space"""
    t = tarr(length)
    n = filt(rng.standard_normal(len(t)), "band", [2500, 9000])
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.15 * t)
    env = np.minimum(1, t / 1.5) * np.minimum(1, (length - t) / 1.5)
    return np.vstack([n, np.roll(n, 911)]) * lfo * env * vel


# ---------------------------------------------------------------- harmony
CH = {  # (voicing, bass root)
    "F#m7": ([57, 61, 64, 66], 30),
    "Bm9": ([62, 66, 69, 73], 35),
    "Gmaj9": ([59, 62, 66, 69], 31),
    "A6": ([61, 64, 66, 71], 33),
    "Dmaj9": ([54, 61, 64, 69], 38),
}
LOOP = ["F#m7", "Bm9", "Gmaj9", "A6"]


def chord_at(bar):
    return "Dmaj9" if bar >= 28 else LOOP[bar % 4]


HOOK = {  # eighth-note hook per chord (0 = rest)
    "F#m7": [76, 0, 73, 0, 69, 71, 73, 0],
    "Bm9": [74, 0, 73, 0, 71, 0, 69, 66],
    "Gmaj9": [71, 0, 74, 0, 78, 0, 76, 74],
    "A6": [73, 0, 76, 0, 73, 71, 69, 0],
}

tl = {"bpm": 120, "beat": BEAT, "bar": BAR, "total": TOTAL}

# ---------------------------------------------------------------- arrangement
for bar in range(0, 29):
    t0 = bar * BAR
    name = chord_at(bar)
    voicing, root = CH[name]
    final = bar == 28
    hold = 8.0 if final else BAR
    # piano everywhere except the drop, where the pads carry the harmony
    if not (18 <= bar < 26):
        v = 0.42 if bar < 2 else 0.5 if bar < 8 or bar >= 26 else 0.36
        for i, n in enumerate(voicing):
            w = 0.2 * (i - 1.5) / 1.5
            add("piano", t0 + i * 0.018, piano(n, v * (0.9 if i else 1.0), hold * 0.98) * np.array([[1 - w], [1 + w]]))
        add("piano", t0, piano(root + 12, v * 0.8, hold * 0.98))
        if (4 <= bar < 18 or bar >= 26) and not final:  # gentle top-note figure
            for beat, idx in ((1.5, 3), (2.5, 2), (3.0, 3)):
                add("piano", t0 + beat * BEAT, piano(voicing[idx] + 12, 0.26, 0.6))
    # pads
    if bar >= 2:
        amp = 0.05 if bar < 8 else 0.075 if bar < 16 else 0.06 if bar < 18 else 0.15 if bar < 26 else 0.07
        cut = 1400 if bar < 8 else 2200 if bar < 16 else 900 if bar < 18 else 3600 if bar < 26 else 1500
        add("pad", t0, supersaw(voicing, hold, att=0.25 if bar < 16 or final else 0.03, rel=0.6 if not final else 3.0, cutoff=cut, amp=amp))
    else:
        add("pad", t0, supersaw(voicing, BAR, att=1.2, rel=1.2, cutoff=700, amp=0.04))
    # bass
    if 8 <= bar < 16 or 18 <= bar < 26:
        for b in range(4):
            add("bass", t0 + b * BEAT, sub_bass(root + 12, BEAT * 0.92, 0.85))
    elif 4 <= bar < 8 or bar >= 26:
        add("bass", t0, sub_bass(root + 12, hold * 0.95, 0.55 if not final else 0.5))
    # plucks: arp from the title on, hook in the groove and drop
    if 2 <= bar < 16 or 18 <= bar < 26:
        if bar >= 8:
            for k, n in enumerate(HOOK[name]):
                if n:
                    add("pluck", t0 + k * 0.25, pluck(n, 0.5 if bar < 16 else 0.72, 0.8) * np.array([[1.0], [0.9]]))
        arp = voicing + [voicing[1] + 12]
        for k in range(8):
            n = arp[[0, 2, 1, 3, 4, 3, 2, 1][k]] + 12
            add("pluck", t0 + k * 0.25, pluck(n, 0.2 if bar < 8 else 0.16, 0.6) * np.array([[0.7], [1.0]]))

# drums
kicks = []
for bar in range(8, 26):
    if 16 <= bar < 18:
        continue
    t0 = bar * BAR
    drop = bar >= 18
    for b in range(4):
        add("drums", t0 + b * BEAT, pan2(kick(0.85)))
        kicks.append(t0 + b * BEAT)
        add("drums", t0 + b * BEAT + 0.25, pan2(hat(0.26 if drop else 0.2, open_=True), 0.2))
        for s in (0.125, 0.375):
            add("drums", t0 + b * BEAT + s + rng.uniform(-0.003, 0.003), pan2(hat(0.11), -0.3))
    for b in (1, 3):
        add("drums", t0 + b * BEAT, pan2(clap(0.42 if drop else 0.34), 0.05))
# verse percussion (no kick yet): rim on 2 & 4, shaker 16ths
for bar in range(4, 8):
    t0 = bar * BAR
    for b in (1, 3):
        add("drums", t0 + b * BEAT, pan2(snare(0.12, 900), 0.15))
    for k in range(16):
        add("drums", t0 + k * 0.125, pan2(hat(0.05 if k % 2 else 0.03), 0.4))
# snare builds into the groove (16) and the drop (36)
for start, length, vel in ((34.0, 2.0, 0.22), (15.0, 1.0, 0.12)):
    tt = start
    while tt < start + length - 1e-6:
        x = (tt - start) / length
        add("drums", tt, pan2(snare(vel * (0.25 + 0.75 * x), 150 + 3000 * x)))
        tt += 0.25 if x < 0.5 else 0.125 if x < 0.85 else 0.0625

# sidechain pumping
duck = np.ones(N)
for t0 in kicks:
    i = int(t0 * SR)
    L = int(0.45 * SR)
    seg = 1 - 0.62 * np.exp(-np.arange(L) / (0.085 * SR))
    j = min(N, i + L)
    duck[i:j] = np.minimum(duck[i:j], seg[: j - i])
buses["pad"] *= duck
buses["bass"] *= 0.35 + 0.65 * duck
buses["pluck"] *= 0.6 + 0.4 * duck

# sound design
add("air", 0.0, air(14.0, 0.05))
add("air", 32.0, air(4.5, 0.06))
add("air", 52.0, air(14.0, 0.05))
add("fx", 0.2, riser(3.8, 0.10, 200, 3000))
add("fx", 4.0 - 1.6, reverse_swell(1.6, 0.16))
add("fx", 4.0, impact(0.9))
add("fx", 8.0 - 0.9, riser(0.9, 0.16, 500, 9000))
add("fx", 8.0 - 0.45, whoosh(0.6, 0.12))
for t0, d in ((12.0, 1), (24.0, -1), (40.0, 1), (44.0, -1)):
    add("fx", t0 - 0.35, whoosh(0.6, 0.10, d))
for t0 in (16.0, 20.0, 28.0):
    add("fx", t0 - 0.2, whoosh(0.5, 0.07, 1))
add("fx", 16.0, impact(0.35))
grid = [round(32.5 + 0.25 * i, 3) for i in range(12)]
for i, t0 in enumerate(grid):
    add("fx", t0, pan2(tick(0.10, 2400 + 60 * (i % 4)), (-0.5, 0.0, 0.5)[i % 3]))
tl["grid"] = grid
add("fx", 32.0, riser(4.0, 0.2))
add("fx", 36.0 - 1.4, reverse_swell(1.4, 0.2))
add("fx", 36.0, impact(1.0))
add("fx", 48.0 - 1.8, reverse_swell(1.8, 0.12))
add("fx", 52.0, impact(0.35))
add("fx", 56.0 - 2.0, reverse_swell(2.0, 0.12))
add("fx", 56.0, impact(0.55))
tl["impacts"] = [4.0, 16.0, 36.0, 52.0, 56.0]
tl["kicks"] = sorted(round(k, 3) for k in kicks)


# ---------------------------------------------------------------- mix
def make_ir(rt60=2.6, length=4.0, pre=0.03):
    n = int(length * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        noise = rng.standard_normal(n)
        ir = filt(noise, "low", 3500) * 10 ** (-3 * t / rt60) + 0.4 * filt(noise, "high", 3500) * 10 ** (-3 * t / (rt60 * 0.35))
        ir *= np.minimum(1, t / 0.02)
        ir = np.concatenate([np.zeros(int(pre * SR)), ir])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


def pingpong(x, d=0.375, fb=0.38, taps=6):
    out = np.zeros_like(x)
    D = int(d * SR)
    for k in range(1, taps + 1):
        src = filt(x[(k + 1) % 2], "low", 5000 - 500 * k) * fb ** k
        out[k % 2, k * D:] += src[: N - k * D]
    return out


buses["pluck"] += pingpong(buses["pluck"]) * 0.8
ir = make_ir()
dry = np.zeros((2, N))
send = np.zeros((2, N))
for name in BUSES:
    s = buses[name] * GAIN[name]
    dry += s
    send += s * SEND[name]
    print(f"  {name:6s} rms={np.sqrt(np.mean(s ** 2)):.4f} peak={np.max(np.abs(s)):.3f}")
wet = np.vstack([fftconvolve(filt(send[c], "high", 200), ir[c])[:N] for c in range(2)])
mix = dry + wet * 0.3
mix = np.vstack([filt(mix[c], "high", 30) for c in range(2)])
mix = mix + 0.4 * np.vstack([filt(mix[c], "high", 4500) for c in range(2)])  # air shelf
mid, side = (mix[0] + mix[1]) / 2, (mix[0] - mix[1]) / 2
side = filt(side, "high", 300) * 1.25  # widen above 300 Hz, keep the low end mono
mix = np.vstack([mid + side, mid - side])
t = np.arange(N) / SR
mix *= np.clip(t / 0.05, 0, 1) * np.clip((TOTAL - 0.2 - t) / 2.5, 0, 1)
mix = mix[:, : int(TOTAL * SR)]
pk = np.percentile(np.abs(mix), 99.97)
mix = np.tanh(mix / pk * 0.95) * 0.95
print(f"p99.97 {pk:.3f}")
wavfile.write(OUT / "music.wav", SR, mix.T.astype(np.float32))
(OUT / "timeline.json").write_text(json.dumps(tl, indent=1))
print("wrote", OUT / "music.wav")
