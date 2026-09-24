"""
Een `.mmbs`-bank naar de SD-kaart van de Teensy sturen via de seriële link,
zonder de kaart eruit te halen — hetzelfde protocol als de ⤒-knop in de
editor (zie TeensyLink.h, pollRaw):

  .venv/Scripts/python tools/teensy-live/bank_put.py <bestand.mmbs> <bank 0-15>
  .venv/Scripts/python tools/teensy-live/bank_put.py --delete <bank>
  .venv/Scripts/python tools/teensy-live/bank_put.py --list

De editor-link moet dicht zijn (de COM-poort is exclusief).
"""
import json
import sys
import time

import serial

PORT = 'COM5'


def open_port():
    for _ in range(40):
        try:
            s = serial.Serial(PORT, 115200, timeout=0.2)
            time.sleep(0.2)
            s.reset_input_buffer()
            return s
        except Exception:
            time.sleep(0.5)
    raise SystemExit('COM-poort niet beschikbaar (editor-link open?)')


def wait_for(s, pred, timeout, buf=b''):
    """Wacht op een JSON-regel waarvoor pred(obj) waar is; geeft (obj, rest)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        buf += s.read(4096)
        lines = buf.split(b'\n')
        buf = lines[-1]
        for l in lines[:-1]:
            if not l.startswith(b'{'):
                if b'[sampler]' in l:
                    print('   ', l.decode(errors='replace').strip())
                continue
            try:
                obj = json.loads(l)
            except ValueError:
                continue
            if pred(obj):
                return obj, buf
            if obj.get('type') == 'bankProgress':
                print(f"    {obj['bytes'] // 1024} van {obj['size'] // 1024} KB")
    raise SystemExit('geen antwoord van de Teensy')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    s = open_port()
    if sys.argv[1] == '--list':
        s.write(b'{"type":"getStatus"}\n')
        st, _ = wait_for(s, lambda o: o.get('type') == 'status', 10)
        names = st.get('sdBankNames') or []
        for i in range(16):
            if st.get('sdBanks', 0) & (1 << i):
                print(f'{i:02d}  {names[i] if i < len(names) else ""}')
        return
    if sys.argv[1] == '--delete':
        bank = int(sys.argv[2])
        s.write(json.dumps({'type': 'bankDelete', 'bank': bank}).encode() + b'\n')
        ack, _ = wait_for(s, lambda o: o.get('type') == 'ack' and (o.get('applied') == 'bankDelete' or not o.get('ok')), 15)
        print('ok' if ack.get('ok') else f"mislukt: {ack.get('err')}")
        return
    path, bank = sys.argv[1], int(sys.argv[2])
    data = open(path, 'rb').read()
    if data[:4] != b'MMBS':
        raise SystemExit('geen .mmbs (magic MMBS ontbreekt)')
    print(f'{path}: {len(data) // 1024} KB naar bank {bank:02d}')
    s.write(json.dumps({'type': 'bankPut', 'bank': bank, 'size': len(data)}).encode() + b'\n')
    ack, rest = wait_for(s, lambda o: o.get('type') == 'ack' and (o.get('phase') == 'begin' or not o.get('ok')), 10)
    if not ack.get('ok'):
        raise SystemExit(f"geweigerd: {ack.get('err')}")
    t0 = time.time()
    CHUNK = 16 * 1024
    for off in range(0, len(data), CHUNK):
        s.write(data[off:off + CHUNK])
    s.flush()
    ack, _ = wait_for(s, lambda o: o.get('type') == 'ack' and (o.get('phase') == 'done' or not o.get('ok')), 30 + len(data) / 100_000, rest)
    dt = time.time() - t0
    if ack.get('ok'):
        print(f"klaar: bank {bank:02d}, {ack.get('bytes', 0) // 1024} KB in {dt:.1f} s ({len(data) / dt / 1024:.0f} KB/s)")
    else:
        raise SystemExit(f"mislukt: {ack.get('err')}")


if __name__ == '__main__':
    main()
