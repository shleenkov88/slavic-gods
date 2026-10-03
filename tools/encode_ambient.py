"""Кодирует ambient.wav (ровно одна петля) в audio/ambient.mp3 с мягкими краями файла.

Что выяснилось измерением в Chrome (петля <audio loop> = перемотка на начало по концу файла):
  * между концом и началом браузер всегда делает «мёртвое» время ~30 мс тишины (mp3: ~1380 отсчётов;
    даже для WAV ~250 отсчётов) — это не лечится содержимым файла;
  * если файл при этом обрывается на полной громкости, получается щелчок (скачок до 0,2–0,3 от полной шкалы).

Поэтому файл = [R отсчётов хвоста петли, плавно нарастающих] + [петля целиком] + [R отсчётов начала
петли, плавно затухающих]. Края файла стартуют и заканчиваются нулём (cos²-огибающая), так что
тишина на стыке начинается и заканчивается без щелчка. Середина (ровно N отсчётов между
LOOP_START и LOOP_END) — точная периодическая петля: для зацикливания через Web Audio
API можно задать loopStart = R/44100, loopEnd = (R+N)/44100 — без всяких швов.

Запуск: python3 tools/encode_ambient.py ambient.wav audio/ambient.mp3
"""
import sys, wave, subprocess, tempfile, os
import numpy as np

R = 882                           # 20 мс при 44,1 кГц

src, dst = sys.argv[1], sys.argv[2]
w = wave.open(src)
x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2).astype(np.float64)
N = len(x)
k = np.arange(R) / R
up = np.sin(0.5 * np.pi * k) ** 2          # 0 -> 1
down = up[::-1]                            # 1 -> 0
pre = x[-R:] * up[:, None]
post = x[:R] * down[:, None]
ext = np.concatenate([pre, x, post])
ext = np.round(ext).astype(np.int16)
tmp = tempfile.mkdtemp()
wav = os.path.join(tmp, 'ext.wav')
with wave.open(wav, 'wb') as o:
    o.setnchannels(2); o.setsampwidth(2); o.setframerate(44100); o.writeframes(ext.tobytes())
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame',
                '-b:a', '192k', '-ar', '44100', '-ac', '2', dst], check=True)
print('петля', N, 'отсчётов, край', R, ', всего в файле', len(ext), 'отсчётов =', len(ext) / 44100, 'с')
