"""Фоновый трек сайта: низкий медленный гул, синтез с нуля (numpy), без сэмплов.

Бесшовная петля устроена математически:
  * длина петли T = 150 с ровно (6 615 000 отсчётов при 44,1 кГц);
  * частота каждого синусоидального тона округлена до кратной 1/T, поэтому
    за петлю укладывается целое число периодов;
  * медленные модуляции громкости (LFO) тоже имеют целое число периодов;
  * шум и реверберация обрабатываются через FFT по всей петле (циркулярно).
Значит, последний отсчёт переходит в первый так же гладко, как любые два соседних.

Запуск:  python3 tools/ambient.py [выход.wav]   (по умолчанию ambient.wav в текущей папке)
Затем:   python3 tools/encode_ambient.py ambient.wav audio/ambient.mp3   (кодирует с мягкими краями файла, см. там)
Уровень подобран под -18,4 LUFS (как у прежнего трека).
"""
import sys, wave
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

out = np.stack([L, R], 1)
out /= np.abs(out).max()
TARGET_RMS_DB = -17.6
out *= 10 ** (TARGET_RMS_DB / 20) / np.sqrt((out ** 2).mean())   # грубо; точный LUFS добирается при кодировании
out = np.clip(out, -0.98, 0.98)
dst = sys.argv[1] if len(sys.argv) > 1 else 'ambient.wav'
with wave.open(dst, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print('dur', N / SR, 'peak', np.abs(out).max(), 'rms_db', 20 * np.log10(np.sqrt((out ** 2).mean())))
