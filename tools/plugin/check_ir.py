"""Meet een impulsrespons uit mmb-plugin-check: RT60 (midden, laag, hoog),
L/R-correlatie en de vertraging. Zelfde rekenwijze als
editor/src/modular-mb/sim/hallMeasure.ts, zodat plugin en simulator
vergelijkbaar zijn.

    python tools/plugin/check_ir.py <ir.wav>
"""
import math
import struct
import sys


def read_wav(path):
    # Eigen RIFF-lezer: de wave-module kent geen 32-bit float (formaat 3),
    # en dat is wat JUCE schrijft.
    with open(path, 'rb') as f:
        blob = f.read()
    if blob[:4] != b'RIFF' or blob[8:12] != b'WAVE':
        raise SystemExit('geen wav: %s' % path)
    pos, fmt, data = 12, None, None
    while pos + 8 <= len(blob):
        tag, size = blob[pos:pos + 4], struct.unpack('<I', blob[pos + 4:pos + 8])[0]
        body = blob[pos + 8:pos + 8 + size]
        if tag == b'fmt ':
            fmt = struct.unpack('<HHIIHH', body[:16])
        elif tag == b'data':
            data = body
        pos += 8 + size + (size & 1)
    if fmt is None or data is None:
        raise SystemExit('wav zonder fmt/data: %s' % path)
    kind, ch, rate, _, _, bits = fmt
    if kind == 3 and bits == 32:
        vals = struct.unpack('<%df' % (len(data) // 4), data)
    elif kind == 1 and bits == 16:
        vals = [v / 32768.0 for v in struct.unpack('<%dh' % (len(data) // 2), data)]
    else:
        raise SystemExit('onbekend wav-formaat %d/%d bit' % (kind, bits))
    return [vals[c::ch] for c in range(ch)], rate


def one_pole(x, rate, hz, mode):
    a = 1 - math.exp(-2 * math.pi * hz / rate)
    s = 0.0
    out = []
    for v in x:
        s += (v - s) * a
        out.append(s if mode == 'lp' else v - s)
    return out


def rt60(x, rate):
    e = [0.0] * len(x)
    acc = 0.0
    for i in range(len(x) - 1, -1, -1):
        acc += x[i] * x[i]
        e[i] = acc
    if e[0] <= 0:
        return float('inf')
    i5 = i25 = -1
    for i in range(len(x)):
        db = 10 * math.log10(e[i] / e[0] + 1e-30)
        if i5 < 0 and db <= -5:
            i5 = i
        if db <= -25:
            i25 = i
            break
    if i5 < 0 or i25 < 0:
        return float('inf')
    return (i25 - i5) / rate * 3


def correlation(a, b, start):
    ab = aa = bb = 0.0
    for i in range(start, len(a)):
        ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]
    return ab / math.sqrt(aa * bb + 1e-30)


def main():
    chans, rate = read_wav(sys.argv[1])
    l, r = chans[0], chans[1] if len(chans) > 1 else chans[0]
    onset = next((i for i, v in enumerate(l) if abs(v) > 1e-6), -1)
    band = one_pole(one_pole(l, rate, 500, 'hp'), rate, 2000, 'lp')
    print('eerste sample met signaal: %d (%.2f ms)' % (onset, onset / rate * 1000))
    print('RT60 midden (0,5–2 kHz): %.2f s' % rt60(band, rate))
    print('RT60 laag  (< 150 Hz):   %.2f s' % rt60(one_pole(l, rate, 150, 'lp'), rate))
    print('RT60 hoog  (> 6 kHz):    %.2f s' % rt60(one_pole(l, rate, 6000, 'hp'), rate))
    print('L/R-correlatie na 0,1 s: %.2f' % correlation(l, r, int(0.1 * rate)))
    print('piek: %.3f' % max(abs(v) for v in l))


if __name__ == '__main__':
    main()
