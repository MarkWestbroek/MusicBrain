#!/usr/bin/env python3
"""Vergelijkt FOF-lettergrepen met de Piper-referentie uit render-fof-syllables.mjs.

    python tools/mmb-wasm/formant-compare.py [map]       (standaard %TEMP%/mmb-fof-syllables)

Per lettergreep (manifest.json):
  - formantsporen F1-F3 via LPC (orde 12 bij 11 kHz, Hann 25 ms, stap 5 ms) op
    beide opnames; de Piper-fonemen leveren de grenzen (medeklinker, klinkerkern);
  - F0 via autocorrelatie (alleen stemhebbende frames);
  - de klinkerkern: gemiddelde F1/F2/F3 over het middelste derde van de klinker;
  - de medeklinker-klinkerovergang: F1/F2 op 10, 30 en 50 ms na het begin van
    de klinker;
  - bij Piper de duur van elk foneem; bij FOF alleen het spoor.

Schrijft report.md en report.json in de map. Alleen numpy; geen scipy.
Het is een meetinstrument, geen oordeel: formantschatting op synthetische
spraak is ruw (±50-100 Hz), en Piper spreekt, FOF zingt op één toon.
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys
import tempfile

import numpy as np

IPA_VOWELS = set('aeiouyøœɛɔɑɪʏəɵæɐʊɒʌɜɨʉɯɤɘɞɶ')


def read_wav(path: str) -> tuple[np.ndarray, int]:
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE', path
    pos = 12
    rate = 0
    samples = None
    while pos + 8 <= len(data):
        tag = data[pos:pos + 4]
        size = struct.unpack('<I', data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if tag == b'fmt ':
            channels = struct.unpack('<H', body[2:4])[0]
            rate = struct.unpack('<I', body[4:8])[0]
            bits = struct.unpack('<H', body[14:16])[0]
            assert channels == 1 and bits == 16, (channels, bits)
        elif tag == b'data':
            samples = np.frombuffer(body, dtype='<i2').astype(np.float64) / 32768.0
        pos += 8 + size + (size & 1)
    assert samples is not None and rate > 0
    return samples, rate


def resample(x: np.ndarray, rate: int, target: int) -> np.ndarray:
    if rate == target:
        return x
    n = int(len(x) * target / rate)
    t_old = np.arange(len(x)) / rate
    t_new = np.arange(n) / target
    return np.interp(t_new, t_old, x)


def lpc(frame: np.ndarray, order: int) -> np.ndarray:
    """Autocorrelatie + Levinson-Durbin; geeft a[0..order] met a[0] = 1."""
    r = np.correlate(frame, frame, 'full')[len(frame) - 1:len(frame) + order]
    if r[0] <= 1e-12:
        return np.zeros(order + 1)
    a = np.zeros(order + 1)
    a[0] = 1.0
    err = r[0]
    for i in range(1, order + 1):
        acc = r[i] + np.dot(a[1:i], r[i - 1:0:-1])
        k = -acc / err
        a_new = a.copy()
        a_new[1:i] = a[1:i] + k * a[i - 1:0:-1]
        a_new[i] = k
        a = a_new
        err *= (1 - k * k)
        if err <= 1e-12:
            break
    return a


def formants_of_frame(frame: np.ndarray, rate: int, order: int) -> list[float]:
    a = lpc(frame * np.hanning(len(frame)), order)
    if not np.any(a[1:]):
        return []
    roots = np.roots(a)
    roots = roots[np.imag(roots) > 0.01]
    freqs = np.angle(roots) * rate / (2 * math.pi)
    bws = -0.5 * rate / (2 * math.pi) * np.log(np.abs(roots))
    cand = sorted((f, b) for f, b in zip(freqs, bws) if 150 < f < rate / 2 - 200 and b < 500)
    return [f for f, _ in cand]


def track(x: np.ndarray, rate: int, step_ms: float = 5.0, win_ms: float = 25.0):
    """Formantsporen (tot 3) en F0 per frame, op 11 kHz voor de LPC."""
    lp_rate = 11025
    y = resample(x, rate, lp_rate)
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])   # pre-emphasis
    win = int(win_ms * lp_rate / 1000)
    step = int(step_ms * lp_rate / 1000)
    frames = []
    for start in range(0, max(1, len(y) - win), step):
        seg = y[start:start + win]
        fr = formants_of_frame(seg, lp_rate, 12)
        # F0 op het originele signaal
        s0 = int(start * rate / lp_rate)
        chunk = x[s0:s0 + int(0.04 * rate)]
        f0, voiced = pitch(chunk, rate)
        energy = float(np.sqrt(np.mean(seg * seg)))
        frames.append({'t': start / lp_rate, 'f': fr[:3] + [None] * (3 - len(fr[:3])), 'f0': f0 if voiced else None, 'e': energy})
    return frames


def pitch(chunk: np.ndarray, rate: int) -> tuple[float, bool]:
    if len(chunk) < int(0.02 * rate):
        return 0.0, False
    chunk = chunk - np.mean(chunk)
    energy = np.dot(chunk, chunk)
    if energy < 1e-6:
        return 0.0, False
    lo, hi = int(rate / 500), int(rate / 70)
    ac = np.correlate(chunk, chunk, 'full')[len(chunk) - 1:]
    ac = ac / (ac[0] + 1e-12)
    seg = ac[lo:hi]
    if len(seg) == 0:
        return 0.0, False
    i = int(np.argmax(seg))
    best = seg[i]
    lag = lo + i
    return rate / lag, bool(best > 0.5)


def mean_formants(frames, t0: float, t1: float) -> list[float | None]:
    sel = [f for f in frames if t0 <= f['t'] < t1 and f['f0'] is not None]
    out = []
    for k in range(3):
        vals = [f['f'][k] for f in sel if f['f'][k] is not None]
        out.append(float(np.median(vals)) if len(vals) >= 2 else None)
    return out


def at(frames, t: float) -> list[float | None]:
    best = min(frames, key=lambda f: abs(f['t'] - t)) if frames else None
    return best['f'] if best else [None, None, None]


def fmt(v) -> str:
    return '–' if v is None else f'{v:.0f}'


def analyse_piper(entry, folder):
    x, rate = read_wav(os.path.join(folder, entry['piper']))
    frames = track(x, rate)
    phonemes = [p for p in entry['phonemes'] if p['p'] not in ('^', '$', ' ', 'ˈ', 'ˌ', 'ː')]
    vowels = [p for p in phonemes if p['p'][0] in IPA_VOWELS]
    result = {'rate': rate, 'phonemes': [(p['p'], round(p['seconds'] * 1000)) for p in phonemes]}
    if vowels:
        v = vowels[0]
        vs, ve = v['start'], v['start'] + v['seconds']
        # lengte-markering (ː) telt bij de klinker
        for p in entry['phonemes']:
            if p['p'] == 'ː' and abs(p['start'] - ve) < 0.002:
                ve += p['seconds']
        result['vowelStart'] = vs
        result['vowelSeconds'] = ve - vs
        third = (ve - vs) / 3
        result['vowel'] = mean_formants(frames, vs + third, ve - third)
        result['transition'] = {ms: at(frames, vs + ms / 1000) for ms in (10, 30, 50)}
        f0s = [f['f0'] for f in frames if vs <= f['t'] < ve and f['f0']]
        result['f0'] = float(np.median(f0s)) if f0s else None
        f0on = [f['f0'] for f in frames if vs <= f['t'] < vs + 0.04 and f['f0']]
        result['f0Onset'] = float(np.median(f0on)) if f0on else None
        cons = [p for p in phonemes if p['start'] < vs and p['p'][0] not in IPA_VOWELS]
        result['onsetMs'] = round(sum(p['seconds'] for p in cons) * 1000)
    return result, frames


def analyse_fof(entry, folder, f0_nominal):
    x, rate = read_wav(os.path.join(folder, entry['fof']))
    frames = track(x, rate)
    # klinkerkern: 150-300 ms na de gate (de aanzet is dan voorbij)
    result = {'rate': rate, 'vowel': mean_formants(frames, 0.15, 0.30)}
    # overgang: vanaf het eerste stemhebbende frame met energie boven 30 % van het maximum
    emax = max(f['e'] for f in frames) or 1.0
    onset = next((f['t'] for f in frames if f['f0'] and f['e'] > 0.3 * emax), 0.0)
    result['voicedOnset'] = onset
    result['transition'] = {ms: at(frames, onset + ms / 1000) for ms in (10, 30, 50)}
    f0s = [f['f0'] for f in frames if 0.15 <= f['t'] < 0.30 and f['f0']]
    result['f0'] = float(np.median(f0s)) if f0s else None
    f0on = [f['f0'] for f in frames if onset <= f['t'] < onset + 0.04 and f['f0']]
    result['f0Onset'] = float(np.median(f0on)) if f0on else None
    return result, frames


def main() -> None:
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'mmb-fof-syllables')
    manifest = json.load(open(os.path.join(folder, 'manifest.json'), encoding='utf-8'))
    rows = []
    lines = ['# FOF tegenover Piper: formanten per lettergreep', '',
             f"Piper-stem: `{manifest.get('voice')}`, FOF op {manifest['f0']} Hz. Formanten via LPC (ruw, ±50-100 Hz). "
             'Klinker = mediaan over het middelste derde van de klinker (Piper) of 150-300 ms na de gate (FOF). '
             'Overgang = F1/F2 op 10/30/50 ms na het begin van de stemhebbende klinker.', '',
             '| # | lettergreep | bron | F1 | F2 | F3 | F0 | F0 aanzet | F1/F2 @10 ms | @30 ms | @50 ms | fonemen (ms) |',
             '|--:|---|---|--:|--:|--:|--:|--:|---|---|---|---|']
    for entry in manifest['syllables']:
        fof, _ = analyse_fof(entry, folder, manifest['f0'])
        row = {'index': entry['index'], 'name': entry['name'], 'fof': fof}
        tr = fof['transition']
        lines.append(f"| {entry['index']} | {entry['name']} | FOF | {fmt(fof['vowel'][0])} | {fmt(fof['vowel'][1])} | {fmt(fof['vowel'][2])} | "
                     f"{fmt(fof['f0'])} | {fmt(fof['f0Onset'])} | {fmt(tr[10][0])}/{fmt(tr[10][1])} | {fmt(tr[30][0])}/{fmt(tr[30][1])} | {fmt(tr[50][0])}/{fmt(tr[50][1])} | |")
        if entry.get('piper'):
            piper, _ = analyse_piper(entry, folder)
            row['piper'] = piper
            if 'vowel' in piper:
                tr = piper['transition']
                ph = ' '.join(f'{p}{d}' for p, d in piper['phonemes'])
                lines.append(f"| | | Piper | {fmt(piper['vowel'][0])} | {fmt(piper['vowel'][1])} | {fmt(piper['vowel'][2])} | "
                             f"{fmt(piper['f0'])} | {fmt(piper['f0Onset'])} | {fmt(tr[10][0])}/{fmt(tr[10][1])} | {fmt(tr[30][0])}/{fmt(tr[30][1])} | {fmt(tr[50][0])}/{fmt(tr[50][1])} | {ph} |")
        rows.append(row)
    lines += ['', 'Lezing: vergelijk per lettergreep de klinkerkern (F1/F2) en de richting van de overgang; '
              'een verschil van meer dan ~150 Hz in F1 of ~250 Hz in F2 is een kandidaat voor de tabel. '
              'De foneemduren van Piper geven de maat voor sluiting, burst en nasaal.']
    with open(os.path.join(folder, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    with open(os.path.join(folder, 'report.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
