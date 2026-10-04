"""Фоновый трек сайта: низкий медленный гул, синтез с нуля (numpy), без сэмплов.

Бесшовная петля устроена математически:
  * длина петли T = 150 с ровно (6 615 000 отсчётов при 44,1 кГц);
  * частота каждого синусоидального тона округлена до кратной 1/T, поэтому
    за петлю укладывается целое число периодов;
  * медленные модуляции громкости (LFO) тоже имеют целое число периодов;
  * шум и реверберация обрабатываются через FFT по всей петле (циркулярно).
Значит, последний отсчёт переходит в первый так же гладко, как любые два соседних.

(копия для пробы; дрон оставлен как в оригинале)
Запуск:  python3 tools/ambient.py [выход.wav]   (по умолчанию ambient.wav в текущей папке)
Затем:   python3 tools/encode_ambient.py ambient.wav audio/ambient.mp3   (кодирует с мягкими краями файла, см. там)
Уровень подобран под -18,4 LUFS (как у прежнего трека).
"""
import os, sys, wave
import numpy as np

SR = 44100
T = 150.0
N = int(round(T * SR))
rng = np.random.default_rng(11)
t = np.arange(N) / SR
TWO_PI = 2 * np.pi


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def snap(f):
    """Частота, кратная 1/T: целое число периодов на петлю."""
    return max(1, round(f * T)) / T


def lfo(cycles, phase=0.0):
    """Целое число периодов за петлю, значения 0..1."""
    return 0.5 + 0.5 * np.sin(TWO_PI * cycles * t / T + phase)


def tone(f, phase=None):
    phase = rng.uniform(0, TWO_PI) if phase is None else phase
    return np.sin(TWO_PI * snap(f) * t + phase)


def voice(midi, partials, detune_cents, mod_cycles, pan, gain):
    """Низкий тон: несколько гармоник, лёгкий разнос по частоте, медленная «дышащая» огибающая."""
    L = np.zeros(N); R = np.zeros(N)
    for k, a in partials:
        for side, dc in ((0, -detune_cents), (1, detune_cents)):
            f = mtof(midi) * k * 2 ** (dc / 1200.0)
            # у каждой гармоники своя медленная огибающая (целое число периодов)
            c = mod_cycles + (k % 3)
            env = 0.55 + 0.45 * lfo(c, rng.uniform(0, TWO_PI))
            s = a * env * tone(f)
            if side == 0:
                L += s * (1 - pan) ; R += s * pan * 0.6
            else:
                R += s * (1 + pan); L += s * (-pan) * 0.6 if pan < 0 else s * 0
    return L * gain, R * gain


def circ_noise(lo, hi, seed):
    """Шум с полосой lo..hi Гц, отфильтрованный по спектру целиком (циркулярный)."""
    r = np.random.default_rng(seed)
    X = np.fft.rfft(r.standard_normal(N))
    fr = np.fft.rfftfreq(N, 1 / SR)
    X *= 1 / (1 + (lo / np.maximum(fr, 1e-3)) ** 4) / (1 + (fr / hi) ** 4)
    x = np.fft.irfft(X, N)
    return x / x.std()


L = np.zeros(N); R = np.zeros(N)

# Основа: ре-дорийский лад, всё очень низко. Аккорд не меняется,
# движение — только в медленном дыхании громкости и тембра (без мелодии и ритма).
D1, D2, A2, D3, F3, A3, C4 = 26, 38, 45, 50, 53, 57, 60
layers = [
    # midi, [(гармоника, амплитуда)], разнос cents, циклов LFO, pan, gain
    (D1, [(1, 1.0), (2, 0.35), (3, 0.12)], 4, 3, 0.0, 0.9),
    (D2, [(1, 1.0), (2, 0.50), (3, 0.28), (4, 0.10)], 6, 5, -0.2, 0.7),
    (A2, [(1, 1.0), (2, 0.40), (3, 0.15)], 7, 7, 0.25, 0.45),
    (D3, [(1, 1.0), (2, 0.35), (3, 0.20), (5, 0.06)], 9, 4, -0.35, 0.28),
    (A3, [(1, 1.0), (2, 0.30), (3, 0.10)], 8, 6, 0.35, 0.16),
    (F3, [(1, 1.0), (2, 0.25)], 8, 9, -0.1, 0.10),   # терция лада, очень тихо
    (C4, [(1, 1.0), (2, 0.20)], 10, 11, 0.1, 0.07),  # септима, едва слышна
]
for midi, parts, dc, mc, pan, g in layers:
    a, b = voice(midi, parts, dc, mc, pan, g)
    L += a; R += b

# Тёмный «воздух»: два слоя шума, медленно дышат (целое число периодов)
for seed, (lo, hi), cyc, g, pan in ((1, (60, 500), 2, 0.22, -0.3), (2, (60, 500), 3, 0.22, 0.3),
                                    (3, (200, 1800), 5, 0.05, 0.0), (4, (200, 1800), 4, 0.05, 0.0)):
    n = circ_noise(lo, hi, seed) * (0.4 + 0.6 * lfo(cyc, seed)) * g
    if seed % 2: L += n * (1 - pan)
    else: R += n * (1 + pan)

# Общая медленная волна громкости, период — вся петля 2 раза (целое)
swell = 0.8 + 0.2 * np.sin(TWO_PI * 2 * t / T + 1.0)
L *= swell; R *= swell

# Циркулярная реверберация (свёртка через FFT по длине петли)
def make_ir(seed, rt=5.0, length=6.0):
    r = np.random.default_rng(seed); n = int(length * SR)
    x = r.standard_normal(n); fr = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x) / (1 + (fr / 900.0) ** 2)
    x = np.fft.irfft(X, n) * np.exp(-6.9 * np.arange(n) / SR / rt)
    x[:int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))
    return x / np.sqrt((x ** 2).sum())
def crev(x, ir):
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, N), N)
wl, wr = crev(L, make_ir(21)), crev(R, make_ir(22))
L = L * 0.6 + wl * 1.3; R = R * 0.6 + wr * 1.3

# Срез ниже 28 Гц и выше 6 кГц (циркулярно)
def shape(x):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(N, 1 / SR)
    X *= 1 / (1 + (28.0 / np.maximum(fr, 1e-3)) ** 4) / (1 + (fr / 6000.0) ** 4)
    return np.fft.irfft(X, N)
L, R = shape(L), shape(R)


# =====================================================================================
# ПРОБНАЯ МЕЛОДИЧЕСКАЯ ВЕРСИЯ. Выше — прежний дрон (L, R), ниже — тема, арфа, флейта.
# Темп 64 уд/мин: 1 доля = 0,9375 с, петля 150 с = ровно 160 долей = 40 тактов 4/4.
# Ре-дорийский лад (D E F G A B C). Ноты рендерятся целиком и кладутся в буфер по модулю N,
# хвосты переходят через границу петли; затем реверберация — циркулярная свёртка по всей петле.
# =====================================================================================
DRONE_DB = -9.0          # дрон относительно прежнего уровня (-17.6 dB RMS): тише
rngm = np.random.default_rng(2026)
dL, dR = L.copy(), R.copy()
dpk = np.abs(np.stack([dL, dR])).max()
dL /= dpk; dR /= dpk
dk = 10 ** (-17.6 / 20) / np.sqrt(((np.stack([dL, dR])) ** 2).mean()) * 10 ** (DRONE_DB / 20)
dL *= dk; dR *= dk

BPM = 64.0
BEAT = 60.0 / BPM
assert abs(T / BEAT - 160) < 1e-9
OFFSET = 2.0             # сдвиг всей партии на 2 доли: стык попадает в середину последнего такта
SEC = 32                 # секция = 8 тактов = 32 доли

def bsamp(b):
    return int(round((b + OFFSET) * BEAT * SR))

def add(buf, start, sig, gl, gr):
    """Сложить sig в L/R-буфер с позиции start по модулю N (хвост переходит через границу)."""
    start %= N
    n = len(sig)
    k = min(n, N - start)
    for i, g in enumerate((gl, gr)):
        buf[i][start:start + k] += sig[:k] * g
        if k < n:
            buf[i][:n - k] += sig[k:] * g

onsets = []   # (время в с от начала петли, голос)

def pan_gains(p):
    a = (p + 1) * np.pi / 4
    return np.cos(a), np.sin(a)

# ---------- арфа (щипок): аддитивный синтез, у верхних гармоник затухание быстрее ----------
def harp_note(midi, vel, dur=None):
    f = mtof(midi)
    t60 = float(np.clip(5.2 - 0.045 * (midi - 36), 2.2, 5.0))   # низкие звучат дольше
    n = int((min(t60 * 1.15, 6.0)) * SR)
    tt = np.arange(n) / SR
    s = np.zeros(n)
    for k in range(1, 11):
        fk = f * k * np.sqrt(1 + 1.5e-4 * k * k)
        if fk > 7000: break
        a = (1.0 / k ** 1.25) * (1.0 if k > 1 else 1.1)
        dec = 6.9 / (t60 / (1 + 0.55 * (k - 1)))
        s += a * np.sin(2 * np.pi * fk * tt + rngm.uniform(0, 2 * np.pi)) * np.exp(-dec * tt)
    # короткий щипок: лёгкий шум в первые 12 мс, сглаженный
    nn = int(0.012 * SR)
    ck = rngm.standard_normal(nn); ck = np.convolve(ck, np.ones(12) / 12, 'same')
    s[:nn] += 0.25 * ck * np.linspace(1, 0, nn) ** 2 * (1.0 / np.sqrt(2))
    s *= np.minimum(1, tt / 0.002)                    # атака 2 мс
    s *= np.minimum(1, (n - np.arange(n)) / (0.15 * SR))   # страховка на хвост
    return s / 2.2 * vel

# ---------- флейта: тёплый тон, плавная атака, лёгкое вибрато, дыхание ----------
breath = circ_noise(1200, 4500, 77)
def flute_note(midi, dur_beats, vel, vib=1.0):
    f0 = mtof(midi)
    dur = dur_beats * BEAT
    rel = 0.45
    n = int((dur + rel) * SR)
    tt = np.arange(n) / SR
    vdepth = vib * 0.0075 * np.clip((tt - 0.25) / 0.6, 0, 1)        # вибрато нарастает не сразу
    vr = 4.9 + 0.25 * rngm.uniform(-1, 1)
    scoop = 1 - 0.012 * np.exp(-tt / 0.05)                          # лёгкий «подъезд» к ноте
    inst = f0 * scoop * (1 + vdepth * np.sin(2 * np.pi * vr * tt + rngm.uniform(0, 6.28)))
    ph = 2 * np.pi * np.cumsum(inst) / SR
    s = np.sin(ph) + 0.30 * np.sin(2 * ph + 0.4) + 0.11 * np.sin(3 * ph + 1.1) + 0.04 * np.sin(4 * ph)
    a = np.clip(tt / 0.11, 0, 1); a = a * a * (3 - 2 * a)           # атака ~110 мс
    r = np.clip((n - np.arange(n)) / (rel * SR), 0, 1); r = r * r * (3 - 2 * r)
    swell = 1 + 0.08 * np.sin(2 * np.pi * 0.9 * tt)
    env = a * r * swell
    o = int(rngm.integers(0, N))
    idx = (o + np.arange(n)) % N
    chiff = 0.05 + 0.10 * np.exp(-tt / 0.08)
    s = s * env + breath[idx] * env * chiff * 0.6
    return s / 1.6 * vel

# ---------- партитура ----------
D3_, A2_ = 50, 45
CH = {  # аккорд: бас, [арпеджио снизу вверх]
    'Dm': (38, [45, 50, 53, 57, 62]),
    'C':  (36, [43, 48, 52, 55, 60]),
    'G':  (43, [50, 55, 59, 62, 67]),
    'Am': (45, [52, 57, 60, 64, 67]),
}
BARS = ['Dm', 'Dm', 'C', 'C', 'Dm', 'Dm', 'G', 'Am']

# рисунки арфы на такт: (доля в такте, индекс звука арпеджио или 'b' = бас, громкость)
PAT = {
    'calm':   [(0, 'b', 1.0), (1, 2, 0.55), (2, 3, 0.6), (3, 1, 0.5)],
    'flow':   [(0, 'b', 1.0), (1, 1, 0.5), (1.5, 2, 0.5), (2.5, 3, 0.6), (3, 4, 0.55), (3.5, 3, 0.4)],
    'sparse': [(0, 'b', 0.9), (2, 3, 0.5)],
    'end':    [(0, 'b', 0.95), (1, 2, 0.5)],   # последний такт: после 2-й доли тишина, стык в паузе
}
SEC_PAT = ['calm', 'calm', 'flow', 'flow', 'sparse']

# тема (ре-дорийская), доли внутри секции: (нота, начало, длительность)
D4, E4, F4, G4, A4, B4, C5, D5, E5 = 62, 64, 65, 67, 69, 71, 72, 74, 76
G3, A3, B3, C4 = 55, 57, 59, 60
P1 = [(D4, 1, 1), (F4, 2, 1), (A4, 3, 1.5), (G4, 4.5, .5), (F4, 5, 1), (E4, 6, 1), (D4, 7, 2.5)]
P2 = [(A4, 17, 1), (C5, 18, 1.5), (B4, 19.5, .5), (A4, 20, 1), (G4, 21, 1), (A4, 22, 2.5)]
# 1: тема как есть
S1 = [(m, b, d, .9) for m, b, d in P1 + P2]
# 2: вариация с форшлагами и другим окончанием (поднимается к D5)
S2 = [(D4, 1, 1, .9), (E4, 1.9, .1, .5), (F4, 2, 1, .9), (A4, 3, 1, .9), (B4, 4, .5, .8), (A4, 4.5, .5, .8),
      (G4, 5, 1, .8), (F4, 6, .5, .8), (E4, 6.5, .5, .8), (D4, 7, 2.5, .9),
      (A4, 17, 1, .9), (C5, 18, 1, .95), (D5, 19, 1.5, 1.0), (C5, 20.5, .5, .8), (B4, 21, 1, .85), (A4, 22, 2.5, .9)]
# 3: контраст — выше, мелодия по терциям (вторая флейта на терцию ниже)
S3main = [(A4, 1, 1, .95), (B4, 2, 1, .95), (D5, 3, 1.5, 1.0), (C5, 4.5, .5, .85), (B4, 5, 1, .9),
          (A4, 6, 1, .85), (G4, 7, 2.5, .9),
          (F4, 17, 1, .9), (A4, 18, 1, .9), (C5, 19, 1.5, .95), (B4, 20.5, .5, .8), (A4, 21, 1, .85),
          (G4, 22, 1, .85), (F4, 23, 1.5, .85)]
DOR = [0, 2, 3, 5, 7, 9, 10]   # ступени ре-дорийского (от D)
def third_below(m):
    pc = (m - 2) % 12
    deg = DOR.index(pc)
    low = DOR[(deg - 2) % 7]
    shift = pc - low if pc >= low else pc + 12 - low
    return m - shift
S3dup = [(third_below(m), b, d, v * .55) for m, b, d, v in S3main]
# 4: тема снова, ритмически оживлена и с эхом конца фразы
S4 = [(D4, 1, 1, .9), (F4, 2, .5, .85), (G4, 2.5, .5, .8), (A4, 3, 1.5, .95), (G4, 4.5, .5, .8), (F4, 5, 1, .85),
      (E4, 6, 1, .85), (D4, 7, 2.5, .9),
      (A4, 17, 1, .9), (C5, 18, 1.5, .95), (B4, 19.5, .5, .8), (A4, 20, 1, .9), (G4, 21, 1, .85), (A4, 22, 1.5, .9),
      (G4, 24, .75, .35), (A4, 25, 3, .3)]
# 5: затухание — только начало темы и долгое низкое ре, звучащее через стык
S5 = [(D4, 1, 1.5, .8), (F4, 2.5, 1.5, .75), (A4, 4, 2, .8), (G4, 6, 1.5, .7), (F4, 7.5, 1, .7), (E4, 8.5, 1, .65),
      (D4, 10, 6.0, .75)]
SECS = [(S1, []), (S2, []), (S3main, S3dup), (S4, []), (S5, [])]

HL = [np.zeros(N), np.zeros(N)]   # шина арфы
FL = [np.zeros(N), np.zeros(N)]   # шина флейты

# арфа
for si in range(5):
    for bar in range(8):
        chord = CH[BARS[bar]]
        pname = SEC_PAT[si]
        if si == 4 and bar == 7: pname = 'end'
        if si == 4 and bar in (2, 3, 5): pname = 'sparse'
        for pos, idx, v in PAT[pname]:
            m = chord[0] if idx == 'b' else chord[1][idx]
            b = si * SEC + bar * 4 + pos
            jit = rngm.uniform(-0.012, 0.012)
            st = bsamp(b) + int(jit * SR)
            vel = v * (0.85 if si == 4 else 1.0) * rngm.uniform(0.9, 1.05)
            gl, gr = pan_gains(float(np.clip((m - 55) / 40, -0.5, 0.5)))
            add(HL, st, harp_note(m, vel), gl, gr)
            onsets.append((((b + OFFSET) * BEAT) % T, 'harp'))

# флейта
for si, (main, dup) in enumerate(SECS):
    for voice_i, notes in enumerate((main, dup)):
        for m, b0, d, v in notes:
            b = si * SEC + b0
            st = bsamp(b) + int(rngm.uniform(-0.02, 0.02) * SR)
            sig = flute_note(m, d, v * (0.8 if voice_i else 1.0), vib=1.0 if not voice_i else 0.8)
            gl, gr = pan_gains(-0.1 if not voice_i else 0.3)
            add(FL, st, sig, gl, gr)
            if not voice_i: onsets.append((((b + OFFSET) * BEAT) % T, 'flute'))

# реверберация (циркулярная) — обе шины, каждая со своим балансом сухого/мокрого
irs = [make_ir(31, rt=4.2, length=5.5), make_ir(32, rt=4.2, length=5.5)]
def rev_bus(B, dry, wet):
    return [B[i] * dry + crev(B[i], irs[i]) * wet for i in range(2)]
hb = rev_bus(HL, 0.75, 0.9)
fb = rev_bus(FL, 0.55, 1.1)

mL = hb[0] * 1.0 + fb[0] * 1.0
mR = hb[1] * 1.0 + fb[1] * 1.0
mL, mR = shape(mL), shape(mR)
mel = np.stack([mL, mR], 1)
drone = np.stack([dL, dR], 1)


MEL_DB = float(os.environ.get('MEL_DB', -22.0))     # RMS мелодической части до общей подгонки LUFS
mel *= 10 ** (MEL_DB / 20) / np.sqrt((mel ** 2).mean())
mix = mel + drone
GAIN_DB = float(os.environ.get('GAIN_DB', 0.0))     # добор до -18,4 LUFS (подбирается замером)
mix *= 10 ** (GAIN_DB / 20); mel_s = mel * 10 ** (GAIN_DB / 20); drone_s = drone * 10 ** (GAIN_DB / 20)
print('peak', np.abs(mix).max(), 'rms_db', 20 * np.log10(np.sqrt((mix ** 2).mean())))
assert np.abs(mix).max() < 0.98, 'клиппинг'
dst = sys.argv[1] if len(sys.argv) > 1 else 'ambient_melodic_full.wav'
def save(path, a):
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.round(a * 32767).astype(np.int16).tobytes())
save(dst, mix)
np.save('stem_mel.npy', mel_s.astype(np.float32)); np.save('stem_drone.npy', drone_s.astype(np.float32))
ons = sorted(onsets)
import json; json.dump(ons, open('onsets.json', 'w'))
dist = [min(o % T, T - o % T) for o, _ in ons]
print('нот: арфа', sum(1 for _, v in ons if v == 'harp'), 'флейта', sum(1 for _, v in ons if v == 'flute'),
      'ближайшая атака к стыку, с:', round(min(dist), 3))
