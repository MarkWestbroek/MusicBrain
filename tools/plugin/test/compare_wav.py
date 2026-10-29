#!/usr/bin/env python3
"""Twee float-wav's (MmbPluginCheck) vergelijken: grootste verschil en SNR.

    compare_wav.py <a.wav> <b.wav>
"""
import math
import struct
import sys


def read(path):
    b = open(path, 'rb').read()
    i = 12
    while i < len(b):
        cid, n = b[i:i + 4], struct.unpack('<I', b[i + 4:i + 8])[0]
        if cid == b'data':
            return struct.unpack('<%df' % (n // 4), b[i + 8:i + 8 + n])
        i += 8 + n + (n & 1)
    raise SystemExit(f'{path}: geen data')


a, b = read(sys.argv[1]), read(sys.argv[2])
n = min(len(a), len(b))
diff = max((abs(a[k] - b[k]) for k in range(n)), default=0.0)
peak = max((abs(x) for x in a[:n]), default=0.0)
ea = sum(x * x for x in a[:n])
ed = sum((a[k] - b[k]) ** 2 for k in range(n))
snr = 10 * math.log10(ea / ed) if ed > 0 and ea > 0 else float('inf')
print(f'maxverschil {diff:.2e} (piek {peak:.3f}), SNR {snr:.0f} dB')
