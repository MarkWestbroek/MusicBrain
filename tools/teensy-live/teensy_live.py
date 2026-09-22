"""
Speel noten op de Teensy en neem hem op, zonder handen — om tikken, dropouts
en niveaus te meten zonder dat iemand hoeft te spelen of te luisteren.

Wat het doet:
  1. (optioneel) een config pushen: --cfg <payload.json> (zoals de editor hem
     stuurt, zie doc/teensy-aan-de-pc.md §4), en controls zetten: --poke q=0.9
  2. de noten uit een Teensy-log van de editor naspelen, met hun timing
     (--log; standaard het nieuwste teensy-log-*.txt in Downloads)
  3. tegelijk de USB-audio van de Teensy opnemen (44,1 kHz, WASAPI)
  4. rapporteren: status (cpu, usbQ-wachtrij), piek, breuken in de golfvorm
     en korte gaten van exacte nullen midden in geluid.

Vereist: .venv met pyserial, numpy, sounddevice (pip install sounddevice numpy).
MIDI gaat via winmm (winmidi.py), dus alleen Windows. De editor-link moet
dicht zijn (de COM-poort is exclusief).

Voorbeeld:
  .venv/Scripts/python tools/teensy-live/teensy_live.py --cfg cfg.json \
      --poke filter=2 --poke q=0.55 --secs 14 --wav uit.wav
"""
import argparse, glob, json, os, re, sys, threading, time, wave

import numpy as np
import serial
import sounddevice as sd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from winmidi import Out  # noqa: E402


def newest_log():
    logs = sorted(glob.glob(os.path.expanduser('~/Downloads/teensy-log-*.txt')), key=os.path.getmtime)
    return logs[-1] if logs else None


def read_notes(path, secs):
    ev = []
    for line in open(path, encoding='utf-8', errors='replace'):
        m = re.match(r'(\d+):(\d+):(\d+)\.(\d+) rx \[midi\] (noteOn|noteOff)\s+ch=\d+ note=(\d+) vel=(\d+)', line)
        if m:
            t = int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3]) + int(m[4]) / 1000
            ev.append((t, m[5] == 'noteOn', int(m[6]), int(m[7])))
    if not ev:
        return []
    t0 = ev[0][0]
    return [(t - t0, on, n, v) for t, on, n, v in ev if t - t0 < secs - 2]


def breaks_sigma(y):
    """Tweede afgeleide t.o.v. zijn lopend kwadratisch gemiddelde (als BreakCounter in sampler_selftest.h)."""
    d2 = y[2:] - 2 * y[1:-1] + y[:-2]
    a2 = d2 * d2
    ms = np.empty_like(a2)
    acc = 1e-12
    for i in range(len(a2)):
        ms[i] = acc
        acc += 0.002 * (a2[i] - acc)
    s = np.sqrt(a2 / np.maximum(ms, 1e-14))
    s[:2000] = 0
    return s


def zero_gaps(x):
    """Korte reeksen exacte nullen met geluid ervoor en erna: de USB-wachtrij liep leeg."""
    gaps, i, n = [], 0, len(x)
    while i < n:
        if x[i] == 0:
            j = i
            while j < n and x[j] == 0:
                j += 1
            if 2 <= j - i <= 300 and np.abs(x[max(0, i - 100):i]).mean() > 300 and np.abs(x[j:j + 100]).mean() > 300:
                gaps.append((i, j - i))
            i = j
        else:
            i += 1
    return gaps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', default='COM5')
    ap.add_argument('--cfg', help='config-payload (JSON) om eerst te pushen')
    ap.add_argument('--mod', help='module-id voor --poke (standaard: de sampler uit --cfg)')
    ap.add_argument('--poke', action='append', default=[], help='control=waarde, meermaals')
    ap.add_argument('--log', default=None, help='Teensy-log met de noten (standaard: nieuwste in Downloads)')
    ap.add_argument('--secs', type=float, default=14)
    ap.add_argument('--api', default='WASAPI')
    ap.add_argument('--wav', help='opname bewaren')
    a = ap.parse_args()

    ser = serial.Serial(a.port, 115200, timeout=0.2)
    time.sleep(0.2)
    ser.reset_input_buffer()
    rx, stop = [], [False]

    def reader():
        buf = b''
        while not stop[0]:
            buf += ser.read(8192)
            *lines, buf = buf.split(b'\n')
            rx.extend(l.decode(errors='replace') for l in lines)
    threading.Thread(target=reader, daemon=True).start()

    def send(obj):
        ser.write((json.dumps(obj, separators=(',', ':')) + '\n').encode())

    mod = a.mod
    if a.cfg:
        cfg = json.load(open(a.cfg))
        send(cfg)
        time.sleep(1.5)
        print('config:', [l.strip()[:160] for l in rx if '"ack"' in l][-1:])
        mod = mod or next((m['id'] for m in cfg['project']['modules'] if m['typeId'] == 'tp_mmb_sampler'), None)
    for p in a.poke:
        k, v = p.split('=')
        send({'type': 'controlPoke', 'mod': mod, 'ctrl': k, 'v': float(v)})
        time.sleep(0.05)

    log = a.log or newest_log()
    ev = read_notes(log, a.secs) if log else []
    dev = next(i for i, d in enumerate(sd.query_devices())
               if 'Teensy' in d['name'] and d['max_input_channels'] > 0
               and a.api in sd.query_hostapis(d['hostapi'])['name'])
    print(f"opname: {sd.query_devices(dev)['name']} ({a.api}); {len(ev)} noot-events uit {log}")

    send({'type': 'getStatus'})            # tellers op nul
    time.sleep(0.3)
    midi = Out()
    rec = sd.rec(int(a.secs * 44100), samplerate=44100, channels=2, dtype='int16', device=dev)
    time.sleep(0.5)
    start = time.perf_counter()
    for t, on, n, v in ev:
        while time.perf_counter() - start < t:
            time.sleep(0.0005)
        if on and v > 0:
            midi.on(n, v)
        else:
            midi.off(n)
    sd.wait()
    midi.close()
    send({'type': 'getStatus'})
    time.sleep(0.5)
    stop[0] = True

    st = [l for l in rx if '"status"' in l]
    if st:
        s = json.loads(st[-1])
        print(f"cpu {s['cpu']:.1f}% (max {s['cpuMax']:.1f}%)  mem {s['mem']}/{s['memMax']}  outPeak {s.get('outPeak')}")
        print('usbQ', s.get('usbQ'))
    if a.wav:
        w = wave.open(a.wav, 'wb')
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes(rec.tobytes()); w.close()
    x = rec[:, 0].astype(np.int32)
    s = breaks_sigma(x / 32768.0)
    br = np.where(s > 8)[0]
    events = 0
    last = -10**9
    for b in br:
        if b - last > 64:
            events += 1
        last = b
    gaps = zero_gaps(x)
    print(f"L: piek {np.abs(x).max() / 32768:.3f}  breuken {events} ({events / a.secs:.1f}/s, ergste {s.max():.0f} sigma)"
          f"  nul-gaten {len(gaps)}")


if __name__ == '__main__':
    main()
