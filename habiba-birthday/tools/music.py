"""Original arrangement of "Happy Birthday to You" (public domain melody), synthesized from scratch.

3/4 waltz at 100 BPM -> beat = 0.6 s, bar = 1.8 s. Every visual cut in the film lands on a bar line,
so this file is the clock for the whole piece. It writes:
  - build/music.wav      (48 kHz stereo float)
  - build/timeline.json  (event times the renderer syncs sparkles / flickers / landings to)
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BEAT = 0.6
BAR = 1.8
TOTAL = 68.0
rng = np.random.default_rng(7)

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "build")
OUT.mkdir(parents=True, exist_ok=True)

N = int(TOTAL * SR) + SR * 4
buses = {name: np.zeros((2, N)) for name in ["pad", "keys", "box", "bass", "drums", "fx", "strings"]}
SEND = {"pad": 0.45, "keys": 0.30, "box": 0.55, "bass": 0.0, "drums": 0.10, "fx": 0.55, "strings": 0.45}
GAIN = {"pad": 0.95, "keys": 0.75, "box": 0.85, "bass": 0.58, "drums": 0.8, "fx": 0.75, "strings": 0.6}


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tarr(d):
    return np.arange(int(d * SR)) / SR


def pan2(y, p):
    a = (p + 1) * np.pi / 4
    return np.vstack([y * np.cos(a), y * np.sin(a)])


def add(bus, t0, sig):
    if sig.ndim == 1:
        sig = pan2(sig, 0.0)
    i = int(round(t0 * SR))
    if i < 0:
        sig = sig[:, -i:]
        i = 0
    j = min(N, i + sig.shape[1])
    buses[bus][:, i:j] += sig[:, : j - i]


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


# ---------------------------------------------------------------- instruments
def music_box(m, vel=1.0, ring=3.0):
    f = mtof(m)
    t = tarr(ring)
    k = (440 / f) ** 0.35
    parts = [(1.0, 1.0, 1.9), (2.0, 0.22, 0.8), (3.0, 0.08, 0.45), (4.07, 0.06, 0.25), (6.27, 0.045, 0.12)]
    y = np.zeros_like(t)
    for r, a, d in parts:
        if f * r > 16000:
            continue
        y += a * np.exp(-t / (d * k)) * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6.28))
    y *= np.minimum(1, t / 0.002)
    click = hp(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.0025) * 0.03
    return (y + click) * vel


def ep(m, vel=1.0, dur=1.0, rel=0.35):
    """FM electric piano (1:1 carrier/modulator with a decaying index)."""
    f = mtof(m)
    t = tarr(dur + rel)
    idx = (1.1 * vel + 0.35) * np.exp(-t / 0.4) + 0.18
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    y += 0.08 * vel * np.exp(-t / 0.03) * np.sin(2 * np.pi * f * 7.0 * t)
    amp = np.exp(-t / (2.4 * (261.6 / f) ** 0.45)) * np.minimum(1, t / 0.003)
    off = np.where(t > dur, np.exp(-(t - dur) / (rel / 3)), 1.0)
    y = y * amp * off * vel
    trem = 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return np.vstack([y * (1 + trem), y * (1 - trem)])


def saw_stack(notes, dur, att, rel, cutoff=1400.0, amp=0.05, vib=0.0, detune=(-8, 0, 7)):
    T = dur + rel
    t = tarr(T)
    env = np.where(t < att, np.sin(np.pi / 2 * np.clip(t / att, 0, 1)) ** 2, 1.0)
    env = env * np.where(t > dur, np.exp(-(t - dur) / (rel / 3.5)), 1.0)
    out = np.zeros((2, len(t)))
    for m in notes:
        for ch in range(2):
            for c in detune:
                fc = mtof(m) * 2 ** ((c + (3 if ch else -3)) / 1200)
                ph = 2 * np.pi * fc * t
                if vib:
                    ph = ph - (2 * np.pi * fc * vib / (2 * np.pi * 5.3)) * np.cos(2 * np.pi * 5.3 * t + ch)
                k = 1
                while fc * k < min(cutoff * 3.2, 9000):
                    a = (1 / k) * np.exp(-((fc * k) / cutoff) ** 1.4)
                    out[ch] += a * np.sin(k * ph + rng.uniform(0, 6.28))
                    k += 1
    return out * env * amp / len(detune)


def bass(m, dur, vel=1.0):
    f = mtof(m)
    t = tarr(dur + 0.15)
    y = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t) + 0.06 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.008) * (0.62 + 0.38 * np.exp(-t / 0.35))
    env *= np.where(t > dur, np.exp(-(t - dur) / 0.04), 1.0)
    y = np.tanh(1.4 * y * env) / np.tanh(1.4)
    return y * vel


def kick(vel=1.0):
    t = tarr(0.7)
    f = 44 + 85 * np.exp(-t / 0.04)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    y += lp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.004) * 0.12
    return np.tanh(1.5 * y) * vel


def snap(vel=1.0):
    t = tarr(0.35)
    n = bp(rng.standard_normal(len(t)), 1500, 6500)
    y = n * (np.exp(-t / 0.018) + 0.25 * np.exp(-t / 0.09))
    y += 0.25 * np.sin(2 * np.pi * 1850 * t) * np.exp(-t / 0.006)
    return y * vel * 0.9


def clap(vel=1.0):
    t = tarr(0.6)
    n = bp(rng.standard_normal(len(t)), 900, 4200)
    env = np.zeros_like(t)
    for d in (0.0, 0.010, 0.021):
        env += np.where(t >= d, np.exp(-(t - d) / 0.0045), 0)
    env += np.where(t >= 0.03, 0.55 * np.exp(-(t - 0.03) / 0.12), 0)
    return n * env * vel


def shaker(vel=1.0):
    t = tarr(0.12)
    n = hp(rng.standard_normal(len(t)), 6000)
    return n * np.minimum(1, t / 0.006) * np.exp(-t / 0.035) * vel


def crash(vel=1.0, length=3.2):
    t = tarr(length)
    out = []
    for _ in range(2):
        n = hp(rng.standard_normal(len(t)), 3500) * np.exp(-t / 0.9)
        for _k in range(7):
            fr = rng.uniform(3000, 9500)
            n += 0.05 * np.sin(2 * np.pi * fr * t + rng.uniform(0, 6)) * np.exp(-t / 0.6)
        out.append(n * np.minimum(1, t / 0.002))
    return np.vstack(out) * vel


def impact(vel=1.0):
    t = tarr(3.0)
    f = 30 + 55 * np.exp(-t / 0.25)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    thud = lp(rng.standard_normal(len(t)), 400) * np.exp(-t / 0.08) * 0.6
    y = np.tanh(1.3 * (boom + thud))
    return pan2(y, 0) * vel


def riser(length, vel=1.0):
    t = tarr(length)
    x = t / length
    noise = rng.standard_normal(len(t))
    bands = [250, 450, 800, 1400, 2400, 4000, 6500, 9500]
    y = np.zeros_like(t)
    pos = x * (len(bands) - 1)
    for i, c in enumerate(bands):
        w = np.clip(1 - np.abs(pos - i), 0, 1)
        y += bp(noise, c / 1.5, min(c * 1.5, 23000)) * w
    f = 220 * 2 ** (x * 2.3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15 * (1 + 0.5 * np.sin(2 * np.pi * (4 + 10 * x) * t))
    env = x ** 2.2
    y = (y * 0.8 + tone) * env
    return np.vstack([y, np.roll(y, 240)]) * vel


def whoosh(length=0.8, vel=1.0, direction=1):
    t = tarr(length)
    x = t / length
    noise = rng.standard_normal(len(t))
    lo = bp(noise, 300, 1200)
    hi = bp(noise, 1500, 6000)
    w = np.sin(np.pi * x)
    y = (lo * (1 - x) + hi * x) * w ** 2.2
    p = (x * 2 - 1) * 0.7 * direction
    a = (p + 1) * np.pi / 4
    return np.vstack([y * np.cos(a), y * np.sin(a)]) * vel


def reverse_cymbal(length=1.6, vel=1.0):
    c = crash(1.0, length)
    return c[:, ::-1] * np.linspace(0, 1, c.shape[1]) ** 1.5 * vel


PENTA = [0, 2, 4, 7, 9]


def glitter(t0, count=10, spread=0.7, vel=0.5, base=84, key=0):
    times = []
    for i in range(count):
        dt = spread * (i / count) ** 1.3 + rng.uniform(0, 0.03)
        m = base + key + PENTA[rng.integers(0, 5)] + 12 * rng.integers(0, 2)
        add("fx", t0 + dt, pan2(music_box(m, vel * (1 - 0.6 * i / count), 1.6), rng.uniform(-0.8, 0.8)))
        times.append(round(t0 + dt, 3))
    return times


def neon_buzz(segments):
    for a, b in segments:
        t = tarr(b - a + 0.01)
        hum = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.5 + np.sin(2 * np.pi * 240 * t) * 0.3
        hum = hp(hum, 180) * np.minimum(1, t / 0.003)
        tick = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.004)
        add("fx", a, pan2((hum * 0.05 + tick * 0.12), 0.1))


def thwip(t0, p=0.0, vel=1.0):
    t = tarr(0.25)
    n = bp(rng.standard_normal(len(t)), 1200, 5200) * np.exp(-t / 0.02)
    thump = np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.035) * 0.5
    add("fx", t0, pan2((n * 0.5 + thump) * vel, p))


# ---------------------------------------------------------------- harmony
# pad voicings (MIDI) + bass root, written in C; pass 3 and outro are transposed +2 (D major)
CH = {
    "Cmaj7": ([52, 55, 59, 64], 36),
    "Cadd9": ([52, 55, 60, 62], 36),
    "C": ([52, 55, 60, 64], 36),
    "C7": ([52, 55, 58, 64], 36),
    "C/G": ([52, 55, 60, 64], 43),
    "Am7": ([52, 55, 60, 64], 45),
    "Fmaj7": ([53, 57, 60, 64], 41),
    "Gsus4": ([50, 55, 60, 62], 43),
    "G": ([50, 55, 59, 62], 43),
    "G7": ([53, 55, 59, 62], 43),
    "Em7": ([50, 55, 59, 62], 40),
    "Dm7": ([53, 57, 60, 62], 38),
}
# (chord, beats) per bar
SONG = [[("Cadd9", 3)], [("Em7", 3)], [("Dm7", 2), ("G7", 1)], [("C", 2), ("C7", 1)],
        [("Fmaj7", 3)], [("Dm7", 2), ("G7", 1)], [("C/G", 2), ("G7", 1)], [("Cadd9", 3)]]
INTRO = [[("Cmaj7", 3)], [("Am7", 3)], [("Fmaj7", 3)], [("Gsus4", 2), ("G", 1)]]
TITLE = [[("Cadd9", 3)], [("Am7", 3)], [("Fmaj7", 3)], [("Gsus4", 2), ("G7", 1)]]
OUTRO = [[("Fmaj7", 3)], [("Em7", 3)], [("Dm7", 2), ("Gsus4", 1)], [("Cadd9", 3)]]

# melody: (beat offset from pass start, midi in C, beats)
MEL = [(-1, 67, .75), (-.25, 67, .25),
       (0, 69, 1), (1, 67, 1), (2, 72, 1),
       (3, 71, 2), (5, 67, .75), (5.75, 67, .25),
       (6, 69, 1), (7, 67, 1), (8, 74, 1),
       (9, 72, 2), (11, 67, .75), (11.75, 67, .25),
       (12, 79, 1), (13, 76, 1), (14, 72, 1),
       (15, 71, 1), (16, 69, 1), (17, 77, .75), (17.75, 77, .25),
       (18, 76, 1), (19, 72, 1), (20, 74, 1),
       (21, 72, 3)]


def chord_events(prog, start_bar, key=0):
    ev = []
    t = start_bar * BAR
    for bar in prog:
        for name, beats in bar:
            ev.append((t, beats * BEAT, name, key))
            t += beats * BEAT
    return ev


def play_pad(events, att=0.35, rel=1.2, amp=0.05, cutoff=1400, bus="pad", vib=0.0):
    for t0, d, name, key in events:
        notes = [n + key for n in CH[name][0]]
        add(bus, t0, saw_stack(notes, d + 0.05, att, rel, cutoff=cutoff, amp=amp, vib=vib))


def play_bass(events, pattern="hold", vel=1.0):
    for t0, d, name, key in events:
        root = CH[name][1] + key
        if pattern == "hold":
            add("bass", t0, pan2(bass(root, d * 0.96, vel), 0))
        else:  # pulse: root on beat 1, octave pickup on the last beat of a full bar
            if d >= 3 * BEAT - 1e-6:
                add("bass", t0, pan2(bass(root, 1.8 * BEAT, vel), 0))
                add("bass", t0 + 2 * BEAT, pan2(bass(root + 12 if root < 40 else root, 0.9 * BEAT, vel * 0.7), 0))
            else:
                add("bass", t0, pan2(bass(root, d * 0.95, vel), 0))


def play_keys(events, vel=0.45, oct=0):
    for t0, d, name, key in events:
        for i, n in enumerate(CH[name][0]):
            add("keys", t0 + i * 0.012, pan2(ep(n + key + oct, vel, d * 0.95)[0], -0.3 + 0.2 * i))


def arpeggio(events, step=0.3, vel=0.32, oct=12, pattern=(0, 1, 2, 3, 2, 1), sparse=False):
    times = []
    for t0, d, name, key in events:
        notes = [n + key + oct for n in CH[name][0]]
        k = 0
        tt = t0
        while tt < t0 + d - 1e-6:
            if not sparse or k % 2 == 0:
                n = notes[pattern[k % len(pattern)]]
                add("box", tt, pan2(music_box(n, vel * (1.0 if k % 2 == 0 else 0.72), 2.4), -0.4 + 0.8 * ((k % 6) / 5)))
                times.append(round(tt, 3))
            tt += step
            k += 1
    return times


def play_melody(pass_bar, key, inst, vel=0.6, oct=0, pan=0.0):
    times = []
    t_start = pass_bar * BAR
    for b, m, d in MEL:
        t0 = t_start + b * BEAT
        n = m + key + oct
        if inst == "box":
            add("box", t0, pan2(music_box(n, vel, 3.0), pan))
        elif inst == "ep":
            add("keys", t0, ep(n, vel, d * BEAT * 0.97, 0.4) * np.array([[1 - pan * 0.5], [1 + pan * 0.5]]))
        elif inst == "strings":
            add("strings", t0, saw_stack([n], d * BEAT * 0.98, 0.08, 0.5, cutoff=2600, amp=0.14, vib=0.004))
        times.append(round(t0, 3))
    return times


tl = {"bpm": 100, "beat": BEAT, "bar": BAR, "total": TOTAL}

# ---------------------------------------------------------------- INTRO (bars 0-3)
ev_intro = chord_events(INTRO, 0)
play_pad(ev_intro, att=1.6, rel=2.0, amp=0.12, cutoff=1000)
play_bass(ev_intro[1:], "hold", 0.35)
tl["introArp"] = arpeggio(chord_events(INTRO[1:], 1), step=0.6, vel=0.34, pattern=(0, 2, 3))
twinkles = [0.9, 1.6, 2.5, 3.2, 3.9, 4.5]
for i, t0 in enumerate(twinkles):
    add("fx", t0, pan2(music_box(96 + PENTA[i % 5], 0.24, 2.0), rng.uniform(-0.7, 0.7)))
tl["twinkles"] = twinkles
add("fx", 7.2 - 2.4, riser(2.4, 0.22))
add("fx", 7.2 - 1.6, reverse_cymbal(1.6, 0.08))

# ---------------------------------------------------------------- TITLE (bars 4-7)
add("fx", 7.2, impact(0.95))
add("drums", 7.2, crash(0.10))
tl["titleGlitter"] = glitter(7.22, 14, 1.1, 0.4)
ev_title = chord_events(TITLE, 4)
play_pad(ev_title, att=0.6, rel=1.6, amp=0.055, cutoff=1300)
play_bass(ev_title, "hold", 0.55)
tl["titleArp"] = arpeggio(ev_title, step=0.3, vel=0.26)
flicker = [[8.00, 8.05], [8.11, 8.14], [8.21, 8.36], [8.42, 8.9]]
neon_buzz(flicker)
tl["neonFlicker"] = flicker
add("fx", 14.4 - 0.55, whoosh(0.8, 0.10))

# ---------------------------------------------------------------- PASS 1 (bars 8-15) music box, gentle
ev1 = chord_events(SONG, 8)
play_pad(ev1, att=0.3, rel=1.2, amp=0.05, cutoff=1300)
play_bass(ev1, "hold", 0.6)
play_keys(ev1, vel=0.22, oct=0)
tl["mel1"] = play_melody(8, 0, "box", vel=0.62)
play_melody(8, 0, "box", vel=0.15, oct=12, pan=0.35)
play_melody(8, 0, "ep", vel=0.18, oct=-12, pan=-0.2)

# ---------------------------------------------------------------- PASS 2 (bars 16-23) groove enters
ev2 = chord_events(SONG, 16)
play_pad(ev2, att=0.25, rel=1.0, amp=0.05, cutoff=1500)
play_bass(ev2, "pulse", 0.85)
tl["mel2"] = play_melody(16, 0, "ep", vel=0.62)
play_melody(16, 0, "box", vel=0.24, oct=12, pan=0.25)
kicks = []
for bar in range(16, 24):
    t0 = bar * BAR
    if bar == 23:
        add("drums", t0, pan2(kick(0.9), 0))
        kicks.append(t0)
        for i in range(8):  # clap build on beats 2-3
            add("drums", t0 + BEAT + i * 0.15, pan2(clap(0.08 + 0.04 * i), 0.1))
        continue
    add("drums", t0, pan2(kick(0.9), 0))
    kicks.append(t0)
    if bar % 2 == 1:
        add("drums", t0 + 1.5 * BEAT, pan2(kick(0.55), 0))
        kicks.append(t0 + 1.5 * BEAT)
    add("drums", t0 + BEAT, pan2(snap(0.42), 0.15))
    add("drums", t0 + 2 * BEAT, pan2(snap(0.26), -0.15))
    for e in range(6):
        add("drums", t0 + e * 0.3 + rng.uniform(-0.004, 0.004), pan2(shaker(0.09 if e % 2 else 0.05), 0.35))
add("fx", 43.2 - 2.4, riser(2.4, 0.26))
add("fx", 43.2 - 1.8, reverse_cymbal(1.8, 0.12))
for t0 in (28.8, 32.4, 36.0, 39.6):
    add("fx", t0 - 0.5, whoosh(0.75, 0.11, 1 if t0 != 36.0 else -1))

# ---------------------------------------------------------------- PASS 3 (bars 24-31) key change up to D
K3 = 2
add("fx", 43.2, impact(0.7))
add("drums", 43.2, crash(0.16))
ev3 = chord_events(SONG, 24, K3)
play_pad(ev3, att=0.2, rel=1.2, amp=0.055, cutoff=1700)
play_pad(ev3, att=0.5, rel=1.4, amp=0.035, cutoff=2400, bus="strings", vib=0.003)
play_bass(ev3, "pulse", 0.95)
tl["mel3"] = play_melody(24, K3, "ep", vel=0.66)
play_melody(24, K3, "box", vel=0.36, oct=12, pan=0.2)
play_melody(24, K3, "strings", oct=0)
for bar in range(24, 31):
    t0 = bar * BAR
    add("drums", t0, pan2(kick(1.0), 0))
    kicks.append(t0)
    add("drums", t0 + 1.5 * BEAT, pan2(kick(0.6), 0))
    kicks.append(t0 + 1.5 * BEAT)
    add("drums", t0 + BEAT, pan2(clap(0.34), 0.05))
    add("drums", t0 + 2 * BEAT, pan2(snap(0.3), -0.15))
    for e in range(6):
        add("drums", t0 + e * 0.3 + rng.uniform(-0.004, 0.004), pan2(shaker(0.11 if e % 2 else 0.06), 0.35))
    if bar == 28:
        add("drums", t0, crash(0.12))
add("drums", 31 * BAR, crash(0.13))
add("drums", 31 * BAR, pan2(kick(0.9), 0))
# polaroid wall: 12 landings on a 16th grid through bar 26
lands = [round(26 * BAR + 0.15 + 0.15 * i, 3) for i in range(12)]
for i, t0 in enumerate(lands):
    thwip(t0, p=(-0.6, 0.0, 0.6)[i % 3], vel=0.32)
tl["polaroidLands"] = lands
for t0 in (46.8, 50.4):
    add("fx", t0 - 0.5, whoosh(0.75, 0.12))
tl["nameGlitter"] = glitter(52.2, 16, 1.0, 0.42, base=86, key=K3)

# ---------------------------------------------------------------- OUTRO (bars 32-35 + ring out)
ev_out = chord_events(OUTRO, 32, K3)
ev_out[-1] = (ev_out[-1][0], 5.2, ev_out[-1][2], K3)
play_pad(ev_out, att=0.6, rel=3.0, amp=0.05, cutoff=1100)
play_bass(ev_out, "hold", 0.5)
tl["outroArp"] = arpeggio(ev_out[:-1], step=0.6, vel=0.24, pattern=(3, 2, 1))
for i, n in enumerate(CH["Cadd9"][0]):
    add("keys", 63.0 + i * 0.05, pan2(ep(n + K3 + 12, 0.32, 3.5, 1.5)[0], -0.4 + 0.25 * i))
add("fx", 63.0, pan2(music_box(86 + K3, 0.4, 4.0), 0.0))
tl["finalChime"] = 63.0
tl["finalGlitter"] = glitter(63.05, 12, 1.4, 0.3, base=86, key=K3)

# ---------------------------------------------------------------- mix
# gentle kick sidechain on pads so the groove breathes in passes 2-3
duck = np.ones(N)
for t0 in kicks:
    i = int(t0 * SR)
    L = int(0.35 * SR)
    seg = 1 - 0.28 * np.exp(-np.arange(L) / (0.09 * SR))
    j = min(N, i + L)
    duck[i:j] = np.minimum(duck[i:j], seg[: j - i])
for b in ("pad", "strings"):
    buses[b] *= duck


def make_ir(rt60=2.8, length=4.0, pre=0.025):
    n = int(length * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        noise = rng.standard_normal(n)
        low = lp(noise, 2500) * 10 ** (-3 * t / rt60)
        high = hp(noise, 2500) * 10 ** (-3 * t / (rt60 * 0.4))
        ir = (low + 0.6 * high) * np.minimum(1, t / 0.012)
        for _k in range(14):  # early reflections
            d = int(rng.uniform(0.006, 0.08) * SR)
            ir[d] += rng.uniform(-0.6, 0.6) * 12
        ir = np.concatenate([np.zeros(int(pre * SR)), ir])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


ir = make_ir()
dry = np.zeros((2, N))
send = np.zeros((2, N))
for name, sig in buses.items():
    s = sig * GAIN[name]
    dry += s
    send += s * SEND[name]
    rms = np.sqrt(np.mean(sig ** 2)) * GAIN[name]
    print(f"  {name:8s} rms={rms:.4f} peak={np.max(np.abs(sig)) * GAIN[name]:.3f}")
wet = np.vstack([fftconvolve(hp(send[c], 180), ir[c])[:N] for c in range(2)])
mix = dry + wet * 0.32
mix = np.vstack([hp(mix[c], 28) for c in range(2)])
# fade in / out
t = np.arange(N) / SR
mix *= np.clip(t / 0.25, 0, 1)
mix *= np.clip((TOTAL - t) / 1.6, 0, 1)
mix = mix[:, : int(TOTAL * SR)]
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.15) / np.tanh(1.15) * 0.89
print(f"pre-norm peak {peak:.3f}")

from scipy.io import wavfile  # noqa: E402

wavfile.write(OUT / "music.wav", SR, mix.T.astype(np.float32))
(OUT / "timeline.json").write_text(json.dumps(tl, indent=1))
print("wrote", OUT / "music.wav", OUT / "timeline.json")
