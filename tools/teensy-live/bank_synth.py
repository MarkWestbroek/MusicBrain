"""
Synthetische testbank voor het streamen: elk sample is een deterministische
ruisreeks (eigen seed), dus van elke noot is precies te berekenen wat er uit
de Teensy hoort te komen. Drie stappen:

  gen  <mmbs> [--slots N] [--secs S]   bank maken (N samples van S s stereo)
  put  <mmbs> <bank>                    naar de Teensy sturen (bank_put.py)
  test <bank> [--secs T] [--poly P]     P noten tegelijk spelen, opnemen via
                                        USB-audio, per noot de verwachte reeks
                                        terugvinden en aftrekken: residu in dB
                                        + underruns uit de status

Zones: slot k op MIDI-noot 4+k met root = die noot (unity pitch), geen loop,
amplitude 0,09 (8 stemmen samen < 0,8, onder de limiter). De vergelijking
begint 100 ms na de aanslag (attack) en stopt bij note-off.
Vereist .venv met numpy, sounddevice, pyserial. Editor-link dicht.
"""
import argparse
import json
import os
import struct
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

AMP = 0.09
FIRST_NOTE = 4


def slot_signal(seed, frames, ch=2):
    rng = np.random.default_rng(seed)
    x = (rng.random((frames, ch), dtype=np.float32) * 2 - 1) * (AMP * 32767)
    return x.astype(np.int16)


def gen(path, slots, secs, rate=44100):
    frames = int(secs * rate)
    with open(path, 'wb') as f:
        name = f'synth {slots}x{secs}s'.encode()[:27].ljust(28, b'\0')
        f.write(b'MMBS' + struct.pack('<III', 2, slots, slots) + name)
        for k in range(slots):
            f.write(struct.pack('<IIHHf', k * frames, frames, 2, 0, float(rate)))
        for k in range(slots):
            note = FIRST_NOTE + k
            # slot, lowKey, highKey, lowVel, highVel, loopMode, velTrack, root, tune, gain, pan,
            # loopStart, loopEnd, decay, release, attack
            f.write(struct.pack('<HBBBBBBffffIIfff', k, note, note, 1, 127, 0, 0,
                                float(note), 0.0, 1.0, 0.0, 0, 0, 0.0, 0.08, 0.0))
        t0 = time.time()
        for k in range(slots):
            f.write(slot_signal(k, frames).tobytes())
            if k % 16 == 15:
                print(f'  {k + 1}/{slots} samples, {f.tell() // (1 << 20)} MB', flush=True)
    print(f'{path}: {os.path.getsize(path) / (1 << 20):.0f} MB, {slots} samples van {secs} s in {time.time() - t0:.0f} s')


def put(path, bank):
    import bank_put
    sys.argv = ['bank_put', path, str(bank)]
    bank_put.main()


def test(bank, secs, poly, rate=44100):
    import serial, sounddevice as sd
    from winmidi import Out
    ser = serial.Serial('COM5', 115200, timeout=0.2); time.sleep(0.2); ser.reset_input_buffer()

    def cmd(obj, want=None, tmo=10):
        ser.write((json.dumps(obj) + '\n').encode())
        if not want:
            return None
        t = time.time(); buf = b''
        while time.time() - t < tmo:
            buf += ser.read(8192)
            for l in buf.split(b'\n')[:-1]:
                if l.startswith(b'{') and want.encode() in l:
                    return json.loads(l)
            buf = buf.split(b'\n')[-1]
        return None

    # patch: sampler op deze bank, geen filter, level 1, out 1
    from bank_synth_cfg import make_cfg
    cfg, smp_id = make_cfg(bank)
    cmd(cfg, '"applied":"config"', 5)
    time.sleep(2.0)                                     # bank laden (koppen lezen)
    cmd({'type': 'getStatus'}, '"status"', 5)           # tellers op nul
    st = cmd({'type': 'getStatus'}, '"status"', 5)
    print('bank:', st.get('smp'))

    dev = next(i for i, d in enumerate(sd.query_devices())
               if 'Teensy' in d['name'] and d['max_input_channels'] > 0
               and 'WASAPI' in sd.query_hostapis(d['hostapi'])['name'])
    midi = Out()
    t_rec = time.perf_counter()
    rec = sd.rec(int(secs * rate), samplerate=rate, channels=2, dtype='int16', device=dev)
    time.sleep(0.4)
    t0 = time.perf_counter()
    off = t0 - t_rec                                     # noot-tijden -> opname-tijden
    # akkoorden van `poly` willekeurige noten, elke 2 s wisselen; laatste 1 s stil
    rng = np.random.default_rng(7)
    events = []                                          # (t_on, t_off, note)
    t = 0.0
    while t + 2.0 < secs - 1.0:
        notes = rng.choice(np.arange(FIRST_NOTE, FIRST_NOTE + 120), size=poly, replace=False)
        for n in notes:
            events.append((t, t + 1.9, int(n)))
        t += 2.0
    # aan en uit in één tijdlijn (uit vóór aan op hetzelfde moment)
    timeline = sorted([(ton, 1, n) for (ton, toff, n) in events] + [(toff, 0, n) for (ton, toff, n) in events])
    for (tt, on, n) in timeline:
        while time.perf_counter() - t0 < tt:
            time.sleep(0.0005)
        midi.on(n, 100) if on else midi.off(n)
    sd.wait(); midi.close()
    st = cmd({'type': 'getStatus'}, '"status"', 5)
    print('na het spelen:', st.get('smp'))
    import wave
    w = wave.open(f'bank_synth_{bank}.wav', 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(rate)
    w.writeframes(rec.tobytes()); w.close()
    events = [(ton + off, toff + off, n) for (ton, toff, n) in events]

    # ── analyse: per noot de verwachte reeks terugvinden (kruiscorrelatie op
    #    een venster) en aftrekken; residu = wat er niet klopt.
    x = rec.astype(np.float64)
    resid = x.copy()
    frames_per_slot = None
    found = 0; missed = []
    for (ton, toff, n) in events:
        k = n - FIRST_NOTE
        start = int((ton + 0.1) * rate)            # na de attack
        stop = int(toff * rate)
        expect = slot_signal(k, stop - start + 8192 + 4410 + int(0.6 * rate))
        # zoekvenster: de aanslag valt tussen ton-0.05 en ton+0.5 (MIDI/USB-latentie)
        w0 = start - int(0.05 * rate)
        win = x[w0: start + int(0.5 * rate), 0]
        probe = expect[int(0.1 * rate): int(0.1 * rate) + 4096, 0].astype(np.float64)
        c = np.correlate(win, probe, mode='valid')
        i = int(np.argmax(c)); peak = c[i] / (np.linalg.norm(probe) * np.linalg.norm(win[i:i + 4096]) + 1e-9)
        # Bij P gelijke ruisstemmen is de correlatie van één stem met de som 1/sqrt(P).
        if peak < 0.6 / np.sqrt(poly):
            missed.append((round(ton, 2), n, round(float(peak), 2))); continue
        found += 1
        onset = w0 + i - int(0.1 * rate)             # sample waar de noot begon
        a = onset + int(0.1 * rate); b = min(stop, len(x))
        seg = expect[int(0.1 * rate): int(0.1 * rate) + (b - a)].astype(np.float64)
        resid[a:b] -= seg
    sig = x[int(0.5 * rate):]
    res = resid[int(0.5 * rate):]
    # alleen daar waar noten klinken (buiten aanslag/release-vensters)
    mask = np.ones(len(res), dtype=bool)
    for (ton, toff, n) in events:
        mask[int(ton * rate) - int(0.5 * rate): int((ton + 0.12) * rate) - int(0.5 * rate)] = False
        mask[int(toff * rate) - int(0.5 * rate): int((toff + 0.2) * rate) - int(0.5 * rate)] = False
    mask[:0] = False
    rs = np.sqrt((res[mask] ** 2).mean()); ss = np.sqrt((sig[mask] ** 2).mean())
    print(f'noten gevonden: {found}/{len(events)}' + (f'  gemist: {missed[:5]}' if missed else ''))
    print(f'signaal {20 * np.log10(ss + 1e-9):.1f} dBFS, residu {20 * np.log10(rs + 1e-9):.1f} dBFS '
          f'({20 * np.log10(rs / (ss + 1e-9) + 1e-12):.1f} dB t.o.v. signaal), '
          f'max |residu| {int(np.abs(res[mask]).max())} LSB')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('path'); g.add_argument('--slots', type=int, default=120); g.add_argument('--secs', type=float, default=47)
    p = sub.add_parser('put'); p.add_argument('path'); p.add_argument('bank', type=int)
    t = sub.add_parser('test'); t.add_argument('bank', type=int); t.add_argument('--secs', type=float, default=30); t.add_argument('--poly', type=int, default=8)
    a = ap.parse_args()
    if a.cmd == 'gen': gen(a.path, a.slots, a.secs)
    elif a.cmd == 'put': put(a.path, a.bank)
    else: test(a.bank, a.secs, a.poly)


if __name__ == '__main__':
    main()
