#!/usr/bin/env python3
"""Testsignaal voor effecten: 2 s, vier zaagtandnoten met verval plus wat ruis
(vaste seed), stereo float 44,1 kHz.

    make_test_wav.py <uit.wav>
"""
import math
import random
import struct
import sys

sr, n = 44100, 88200
random.seed(1)
notes = [220, 277.2, 329.6, 440]
data = []
for i in range(n):
    t = i / sr
    f = notes[int(t * 4) % 4]
    env = math.exp(-((t * 4) % 1.0) * 3)
    data.append(0.5 * env * (2 * ((t * f) % 1.0) - 1) + 0.05 * (random.random() * 2 - 1))
body = b''.join(struct.pack('<ff', x, x) for x in data)
with open(sys.argv[1], 'wb') as fh:
    fh.write(b'RIFF' + struct.pack('<I', 36 + len(body)) + b'WAVEfmt ' +
             struct.pack('<IHHIIHH', 16, 3, 2, sr, sr * 8, 8, 32) + b'data' + struct.pack('<I', len(body)) + body)
