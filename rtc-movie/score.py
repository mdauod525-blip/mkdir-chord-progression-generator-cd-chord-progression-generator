"""Synthesized score and sound design for the teaser. Cue times match film.js."""
import sys, wave
import numpy as np

SR = 44100
DUR = 118.0
N = int(SR * DUR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(4117)


def tt(d):
    return np.arange(int(d * SR)) / SR


def band(x, lo=0.0, hi=20000.0):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo > 0:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    lg = gain * np.sqrt((1 - pan) / 2) * 1.414
    rg = gain * np.sqrt((1 + pan) / 2) * 1.414
    L[i : i + len(sig)] += sig * lg
    R[i : i + len(sig)] += sig * rg


def fade(sig, a=0.01, b=0.05):
    n = len(sig)
    e = np.ones(n)
    na, nb = max(1, int(a * SR)), max(1, int(b * SR))
    e[:na] = np.linspace(0, 1, na)[: n]
    e[-nb:] = np.minimum(e[-nb:], np.linspace(1, 0, nb))
    return sig * e


def noise(d):
    return rng.standard_normal(int(d * SR))


def scratch(d=0.25, gain=0.5, pan=0.0, t0=0.0):
    x = band(noise(d), 1800, 6500)
    t = tt(d)
    grit = 0.5 + 0.5 * np.abs(band(noise(d), 0, 40)) * 4
    e = np.sin(np.pi * t / d) ** 0.6 * grit
    add(x * e, t0, gain, pan)


def thump(t0, f=52, d=0.45, gain=1.0):
    t = tt(d)
    ph = 2 * np.pi * np.cumsum(f * (1 + 1.2 * np.exp(-t * 30))) / SR
    add(np.sin(ph) * np.exp(-t * 9), t0, gain)


def heartbeat(t0, gain=0.9):
    thump(t0, 50, 0.4, gain)
    thump(t0 + 0.25, 46, 0.4, gain * 0.7)


def boom(t0, d=5.0, gain=1.0, low=180):
    t = tt(d)
    n = band(noise(d), 0, low) * np.exp(-t * 1.2) * 3
    f = 70 * np.exp(-t * 0.8) + 28
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 0.9)
    crack = band(noise(0.25), 300, 5000) * np.exp(-tt(0.25) * 18)
    add(fade(n + s * 1.2, 0.003, 0.5), t0, gain)
    add(crack, t0, gain * 0.6)


def braam(t0, root=36.7, d=3.5, gain=0.8):
    t = tt(d)
    x = np.zeros_like(t)
    for k, mul in enumerate([1, 2, 3, 1.5, 4]):
        f = root * mul * (1 + 0.003 * k)
        x += (2 * ((f * t) % 1) - 1) / (k + 1)
    x = band(x, 0, 600 + 1400 * 0.5)
    e = np.minimum(1, t / 0.04) * np.exp(-t * 0.9)
    add(fade(x * e, 0.002, 0.6), t0, gain)
    add(band(noise(0.6), 0, 900) * np.exp(-tt(0.6) * 6), t0, gain * 0.5)


def kick(t0, gain=0.9):
    d = 0.5
    t = tt(d)
    f = 45 + 110 * np.exp(-t * 28)
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7), t0, gain)


def drone(t0, t1, freqs, gain=0.2, lfo=0.13, bright=500, fi=1.5, fo=1.5):
    d = t1 - t0
    t = tt(d)
    x = np.zeros_like(t)
    for i, f in enumerate(freqs):
        x += np.sin(2 * np.pi * f * t + i) + 0.35 * np.sin(2 * np.pi * f * 2.003 * t)
    x *= 0.75 + 0.25 * np.sin(2 * np.pi * lfo * t)
    x += band(noise(d), 0, bright) * 0.6
    add(fade(x / len(freqs), fi, fo), t0, gain)


def beep(t0, f=988, d=0.13, gain=0.25):
    t = tt(d)
    add(fade(np.sin(2 * np.pi * f * t), 0.004, 0.03), t0, gain)


def bell(t0, f, d=3.5, gain=0.3, pan=0.0):
    t = tt(d)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dk) for m, a, dk in [(1, 1, 1.2), (2.01, 0.5, 2.0), (3.0, 0.25, 3.0), (4.2, 0.12, 4.5)])
    add(fade(x, 0.003, 0.3), t0, gain, pan)


def whoosh(t0, d=1.2, gain=0.4, rise=True):
    t = tt(d)
    e = (t / d) ** 2 if rise else np.exp(-t * 3)
    add(fade(band(noise(d), 300, 3000) * e, 0.01, 0.05), t0, gain)


def gun(t0, gain=0.45, pan=0.0):
    d = 0.18
    add(band(noise(d), 80, 4000) * np.exp(-tt(d) * 28), t0, gain, pan)


# 0-9: scratches in the dark, low drone
drone(0, 9.2, [41.2, 61.7], 0.12, bright=120)
for k in range(12):
    scratch(0.2, 0.55, (k % 3 - 1) * 0.2, 1.0 + k * 0.45)

# 9-18: Ashgrove — warm pad
drone(9, 18.4, [110, 164.8, 220, 277.2], 0.09, lfo=0.2, bright=900, fi=1.2, fo=1.0)
drone(9, 18.4, [55], 0.12, bright=200)
bell(9.9, 440, 4, 0.12, -0.3)
bell(13.8, 329.6, 4.5, 0.12, 0.3)

# 18-25: hospital monitor
drone(18, 25.2, [73.4, 110], 0.07, bright=200, fi=0.6, fo=0.6)
for n in range(9):
    t0 = 18 + 0.27 + 0.9 * n
    if t0 < 25:
        beep(t0)

# 25-32: descent
drone(25, 32.2, [36.7, 55], 0.22, bright=300, fi=0.5, fo=0.4)
t = tt(7)
riser = np.sin(2 * np.pi * np.cumsum(80 + 160 * (t / 7) ** 2) / SR) * (t / 7)
add(fade(riser, 0.5, 0.3), 25, 0.08)
add(fade(band(noise(7), 50, 900) * (0.3 + t / 7), 0.4, 0.3), 25, 0.25)

# 32-37.6: alarm and criticality
t = tt(3.2)
alarm = np.sign(np.sin(2 * np.pi * np.where((t * 2.5) % 1 < 0.5, 660, 520) * t))
add(fade(band(alarm, 200, 2500), 0.05, 0.05), 32, 0.06)
drone(32, 35.3, [36.7, 38.9], 0.25, bright=250, fi=0.3, fo=0.1)
boom(35.2, 3.2, 1.2)
braam(35.2, 36.7, 2.4, 0.6)

# 37.6-40: silence and heartbeat
for bt in (38.4, 39.3):
    heartbeat(bt, 0.8)

# 40-53.4: the tally — accelerating scratches
drone(40, 53.6, [36.7, 43.65, 55], 0.14, bright=200, fi=1.0, fo=1.0)


def deaths_at(x):
    u = min(max((x - 40.3) / 10, 0), 1)
    return int(1 + 4116 * (np.exp(5 * u) - 1) / (np.exp(5) - 1))


prev = 0
x = 40.3
while x < 50.4:
    n = deaths_at(x)
    if n != prev:
        scratch(0.07 if n > 300 else 0.14, 0.25 if n > 300 else 0.4, rng.uniform(-0.6, 0.6), x)
        prev = n
    x += 0.02 if n > 200 else 0.005
for k in range(40):
    thump(40.3 + k * 0.25, 40 + k * 0.6, 0.3, 0.15 + 0.012 * k)
add(fade(band(noise(10), 3000, 9000), 3, 0.2) * np.linspace(0, 1, int(10 * SR)), 40.4, 0.14)
scratch(1.2, 0.8, 0, 51.0)
braam(51.0, 36.7, 3.0, 0.55)

# 53.4-61: the mountain opens
drone(53.4, 61.0, [32.7, 49], 0.18, bright=150, fi=0.4, fo=0.4)
t = tt(4)
add(fade(band(noise(4), 20, 160) * (t / 4) ** 2 * 3, 0.1, 0.05), 53.5, 0.6)
boom(57.5, 4.0, 1.1)
whoosh(58.0, 1.8, 0.25)
add(fade(band(noise(3), 1000, 4000) * 0.4, 0.2, 1), 58.0, 0.06)

# 61-64: porch, flicker buzz, riser into the slam
t = tt(2.9)
buzz = np.sin(2 * np.pi * 120 * t) * (rng.random(len(t)) > 0.002)
add(fade(band(buzz, 100, 2000), 0.1, 0.1), 61.0, 0.05)
drone(61, 64, [36.7], 0.18, bright=120, fi=0.3, fo=0.05)
whoosh(62.6, 1.4, 0.5)

# 64-81: montage at 100 bpm
beat = 0.6
for i in range(28):
    tb = 64 + i * beat
    if 74.5 <= tb < 75.4 or tb >= 79:
        continue
    kick(tb, 0.75)
for tb in (64.0, 67.6, 71.0):
    braam(tb, 36.7, 2.6, 0.75)
    boom(tb, 1.5, 0.4, 120)
for j in range(44):
    gun(65.25 + j * 0.054, 0.3, ((j % 2) * 2 - 1) * 0.5)
boom(69.3, 1.2, 0.6, 400)
boom(69.4, 2.4, 0.9)
for k in range(5):
    add(np.sin(2 * np.pi * 1800 * tt(0.03)) * np.exp(-tt(0.03) * 80), 72.3 + k * 0.45, 0.3)
t = tt(2.2)
add(fade(np.sin(2 * np.pi * np.cumsum(2400 - 1700 * (t / 2.2)) / SR), 0.2, 0.05), 72.3, 0.04)
boom(74.5, 6.5, 1.5, 140)
braam(74.5, 27.5, 5.0, 0.9)
braam(77.3, 36.7, 2.0, 0.6)
t = tt(2.0)
add(fade(band(noise(2.0), 150, 1200) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t)), 0.3, 0.2), 79.0, 0.35)

# 81-88: the face — rain and pressure
add(fade(band(noise(7), 2000, 12000), 0.4, 0.5), 81.0, 0.08)
drone(81, 88.2, [36.7, 55.0, 41.2], 0.2, bright=160, fi=0.3, fo=0.4)
whoosh(81.3, 0.9, 0.35)
for t0 in (83.0, 85.5):
    for k in range(6):
        add(band(noise(0.03), 1500, 6000) * np.exp(-tt(0.03) * 120), t0 + k * 0.26, 0.25)
thump(85.4, 40, 0.8, 0.6)

# 88-100: the long view
drone(88, 100.2, [55, 82.4, 110], 0.1, lfo=0.08, bright=300, fi=0.5, fo=1.0)
for t0, f in ((88.3, 220.0), (91.3, 196.0), (94.3, 164.8), (97.3, 130.8)):
    bell(t0, f, 4.0, 0.25)
    bell(t0, f * 1.5, 3.0, 0.08, 0.4)
    thump(t0, 36, 1.2, 0.4)

# 100-104: eyes, I survive
heartbeat(100.0, 0.8)
whoosh(100.6, 1.1, 0.3)
add(fade(np.sin(2 * np.pi * 73.4 * tt(1.5)) * 0.5, 0.8, 0.3), 100.8, 0.3)
braam(102.0, 36.7, 2.2, 1.0)
boom(102.0, 2.0, 0.5, 120)

# 104-112: title stamps
for t0, g in ((104.0, 0.9), (104.9, 0.4), (105.4, 0.6), (106.2, 1.0)):
    boom(t0, 1.4, g * 0.6, 200)
    kick(t0, g)
braam(106.2, 27.5, 5.5, 0.9)
drone(106.2, 112.0, [55, 82.4], 0.12, bright=200, fi=0.5, fo=1.0)
add(fade(band(noise(0.5), 3000, 9000), 0.2, 0.3), 107.0, 0.15)
bell(108.4, 659.3, 3.5, 0.08)

# 112-118: stinger — room tone
add(fade(band(noise(6), 40, 200) * 0.6, 0.5, 0.8), 112.0, 0.2)
add(fade(np.sin(2 * np.pi * 60 * tt(6)) * 0.15, 0.5, 0.8), 112.0, 0.2)
thump(115.95, 60, 0.3, 0.5)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 0.9)
mix /= np.max(np.abs(mix)) / 0.89
out = (mix * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "score.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(out.tobytes())
print("ok", out.shape)
