"""Кодирует ambient.wav (ровно одна петля) в audio/ambient.mp3 без стыка на границе.

Проблема: если закодировать петлю «как есть», кодек видит тишину до начала и после конца,
и на самых краях появляются артефакты (скачок ~0,08 при обычном шаге ~0,002) — слышимый щелчок на стыке.
Решение: кодируем петлю с периодическим «довеском» (хвост петли перед началом, начало петли
после конца), а в заголовок Info (LAME) записываем увеличенные delay/padding, чтобы
декодер с поддержкой gapless (Chrome, Firefox, Safari, ffmpeg) отбросил довески
и отдал ровно одну петлю, у которой края закодированы с правильным окружением.

Запуск: python3 tools/encode_ambient.py ambient.wav audio/ambient.mp3
"""
import sys, wave, subprocess, tempfile, os
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
w = wave.open(src)
x = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2)
N = len(x)
P = Q = 2304                      # две mp3-кадра по 1152 отсчёта
ext = np.concatenate([x[-P:], x, x[:Q]])
tmp = tempfile.mkdtemp()
wav, mp3 = os.path.join(tmp, 'ext.wav'), os.path.join(tmp, 'ext.mp3')
with wave.open(wav, 'wb') as o:
    o.setnchannels(2); o.setsampwidth(2); o.setframerate(44100); o.writeframes(ext.tobytes())
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame',
                '-b:a', '192k', '-ar', '44100', '-ac', '2', mp3], check=True)
b = bytearray(open(mp3, 'rb').read())
i = b.find(b'Info')
fs = i - 36                          # начало кадра с тегом
l = i + 120 + 21                     # delay/padding: 3 байта (12+12 бит)
delay, pad = (b[l] << 4) | (b[l + 1] >> 4), ((b[l + 1] & 15) << 8) | b[l + 2]
print('исходные delay/padding', delay, pad)
delay, pad = delay + P, pad + Q
assert delay < 4096 and pad < 4096
b[l], b[l + 1], b[l + 2] = delay >> 4, ((delay & 15) << 4) | (pad >> 8), pad & 255
c = 0
for v in b[fs:fs + 190]:
    c ^= v
    for _ in range(8):
        c = (c >> 1) ^ 0xA001 if c & 1 else c >> 1
b[fs + 190], b[fs + 191] = c >> 8, c & 255
open(dst, 'wb').write(b)
print('новые delay/padding', delay, pad, 'размер', len(b))
