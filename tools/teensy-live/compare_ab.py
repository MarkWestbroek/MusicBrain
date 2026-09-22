"""
Vergelijk twee opnames van dezelfde noten (A = bypass, B = met effect) venster
voor venster, na uitlijnen op de omhullende (de opname start niet elke keer
even snel). Geeft de helling uit/in (1 = geen compressie, < 1 = compressie) en
hoeveel luide en zachte stukken veranderen.

  .venv/Scripts/python tools/teensy-live/compare_ab.py bypass.wav effect.wav
"""
import sys, wave
import numpy as np


def load(p):
    w = wave.open(p)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels())[:, 0] / 32768.0


def env_db(x, win):
    n = len(x) // win
    r = np.sqrt((x[:n * win].reshape(n, win) ** 2).mean(axis=1))
    return 20 * np.log10(np.maximum(r, 1e-9))


def main(a_path, b_path):
    a, b = load(a_path), load(b_path)
    # uitlijnen op een omhullende van 10 ms
    ea, eb = env_db(a, 441), env_db(b, 441)
    ea0, eb0 = ea - ea.mean(), eb - eb.mean()
    best, lag = -1e18, 0
    for d in range(-60, 61):
        x, y = (ea0[d:], eb0) if d >= 0 else (ea0, eb0[-d:])
        n = min(len(x), len(y))
        c = float(np.dot(x[:n], y[:n]))
        if c > best:
            best, lag = c, d
    s = lag * 441
    a, b = (a[s:], b) if s >= 0 else (a, b[-s:])
    n = min(len(a), len(b))
    A, B = env_db(a[:n], 4410), env_db(b[:n], 4410)
    sel = A > A.max() - 30
    k = np.polyfit(A[sel], B[sel], 1)[0]
    loud = A > A.max() - 6
    quiet = (A > A.max() - 30) & (A < A.max() - 18)
    print(f"uitgelijnd {lag * 10} ms; helling uit/in {k:.2f} (1 = geen compressie); "
          f"luid {np.mean(B[loud] - A[loud]):+.1f} dB, zacht {np.mean(B[quiet] - A[quiet]):+.1f} dB")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
