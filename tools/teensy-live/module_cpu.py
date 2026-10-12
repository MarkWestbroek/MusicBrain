"""Rekentijd per module op de Teensy 4.1, gemeten (doc/plans/software-modules-op-de-site.md §3b).

    python tools/teensy-live/module_cpu.py tp_mmb_ladder tp_mmb_tube
    python tools/teensy-live/module_cpu.py --site            # alle modules uit site-modules.json
    python tools/teensy-live/module_cpu.py --site --write    # en de uitkomst daar invullen

Per type twee configs naar de Teensy, met één noot (MIDI, C4) erop:
  basis   MIDI → VCO → OUT L
  test    de basis plus de module: de MIDI-noot op wat er een ingang voor
          heeft (pitch/voct, gate/trig, vel); zonder toonhoogte-ingang (een
          effect) de VCO op de audio-ingang(en); de uitgang naar OUT R.
cpu(test) − cpu(basis), gemiddeld over een paar getStatus-metingen, is de
rekentijd van één exemplaar met één spelende noot. Knoppen op hun
standaardstand (uit de editordefinitie, via editor/scripts/modulePorts.ts).

Vóór elke module een herstart ({"type":"reboot"}, fw 0.5.108): de firmware
parkeert modules van een vorige patch voor hergebruik (FW-13), en na twintig
modules is het geheugen op (Clouds en de Elements-reverb kregen hun buffers
niet en draaiden niet mee). Zonder reboot-commando (oudere firmware): --no-reboot.

Teensy op COM5, de editor los (die houdt de poort anders vast). Let op: als
iemand tegelijk speelt, kloppen de getallen niet.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import serial  # noqa: E402
from winmidi import Out  # noqa: E402

SITE_JSON = os.path.join(ROOT, 'editor', 'site', 'modules', 'site-modules.json')
NOTE = 60


def port_info(types):
    npx = 'npx.cmd' if os.name == 'nt' else 'npx'
    r = subprocess.run([npx, 'tsx', 'scripts/modulePorts.ts', *types], cwd=os.path.join(ROOT, 'editor'),
                       capture_output=True, text=True, encoding='utf-8', check=True)
    return json.loads(r.stdout)


class Teensy:
    def __init__(self, port):
        self.port = port
        self.open()

    def open(self, wait=15.0):
        t = time.time()
        while True:
            try:
                self.ser = serial.Serial(self.port, 115200, timeout=0.2)
                break
            except serial.SerialException:
                if time.time() - t > wait:
                    raise
                time.sleep(0.5)
        time.sleep(0.4)
        self.ser.reset_input_buffer()

    def reboot(self):
        try:
            self.ser.write(b'{"type":"reboot"}' + bytes([10]))
            time.sleep(0.3)
        except serial.SerialException:
            pass
        try:
            self.ser.close()
        except serial.SerialException:
            pass
        time.sleep(2.5)
        self.open()
        time.sleep(1.0)

    def cmd(self, obj, want, tmo=5.0):
        self.ser.write((json.dumps(obj) + '\n').encode())
        t, buf = time.time(), b''
        while time.time() - t < tmo:
            buf += self.ser.read(8192)
            *lines, buf = buf.split(b'\n')
            for l in lines:
                if l.startswith(b'{') and want.encode() in l:
                    return json.loads(l)
        return None

    def cpu(self, n=6, gap=0.4):
        vals = []
        for _ in range(n):
            s = self.cmd({'type': 'getStatus'}, '"type":"status"', 3) or {}
            if isinstance(s.get('cpu'), (int, float)):
                vals.append(float(s['cpu']))
            time.sleep(gap)
        return sum(vals) / len(vals) if vals else None


def config(info, x=None):
    """De meetconfig: basis, of basis plus module x."""
    mods = [('m_midi', 'tp_mmb_midiin'), ('m_vco', 'tp_mmb_vco'), ('m_out', 'tp_mmb_out')]
    con = [(('m_midi', 'pitch'), ('m_vco', 'voct')), (('m_vco', 'out'), ('m_out', 'l'))]
    notes = []
    if x:
        mods.append(('m_x', x))
        ins = [p for p in info[x]['ports'] if p[1] == 'in']
        outs = [p for p in info[x]['ports'] if p[1] == 'out']
        # De noot erop (eerste stem), voor wat er een ingang voor heeft.
        for src, pat in (('pitch', r'^(voct|pitch)(_?1)?$'), ('gate', r'^(gate|trig)(_?1)?$'), ('vel', r'^vel(_?1)?$')):
            hit = next((p[0] for p in ins if re.match(pat, p[0])), None)
            if hit:
                con.append((('m_midi', src), ('m_x', hit)))
                notes.append(f'{src}->{hit}')
        # Audio-ingangen alleen bij een effect (geen toonhoogte-ingang): een
        # klankbron met EXT IN (SID) speelt zijn eigen noot.
        has_pitch = any(re.match(r'^(voct|pitch)(_?1)?$', p[0]) for p in ins)
        audio_in = [] if has_pitch else [p[0] for p in ins if p[2] == 'audio']
        for pid in audio_in[:2]:
            con.append((('m_vco', 'out'), ('m_x', pid)))
        audio_out = [p[0] for p in outs if p[2] == 'audio']
        first_out = audio_out[0] if audio_out else (outs[0][0] if outs else None)
        if first_out:
            con.append((('m_x', first_out), ('m_out', 'r')))
        notes.append(f'audio in: {",".join(audio_in) or "-"}; uit: {first_out}')
    used = {t: info[t]['defaults'] for _, t in mods}
    project = {
        'version': 2, 'name': 'module_cpu', 'activePatchId': 'p_cpu',
        'modules': [{'id': i, 'typeId': t} for i, t in mods],
        'patches': [{
            'id': 'p_cpu', 'name': f'cpu {x or "basis"}', 'voiceCount': 1, 'rackIds': [],
            'connections': [{'from': {'moduleId': a[0], 'portId': a[1]}, 'to': {'moduleId': b[0], 'portId': b[1]}} for a, b in con],
            'controlState': {i: dict(used[t]) for i, t in mods},
        }],
    }
    project['patches'][0]['controlState']['m_out']['level'] = 0.3   # zacht: er klinkt wel wat
    return {'type': 'config', 'project': project}, '; '.join(notes)


def measure(t, midi, cfg):
    ok = t.cmd(cfg, '"applied":"config"', 10)
    if not ok or ok.get('ok') is False:
        return None
    time.sleep(1.0)
    midi.on(NOTE, 100)
    time.sleep(1.5)
    v = t.cpu()
    midi.off(NOTE)
    time.sleep(0.5)
    return v


def fw_version():
    s = open(os.path.join(ROOT, 'firmware', 'app-modular-brain', 'src', 'FwVersion.h'), encoding='utf-8').read()
    return re.search(r'FW_VERSION "([^"]+)"', s).group(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('types', nargs='*')
    ap.add_argument('--site', action='store_true', help='alle modules uit site-modules.json')
    ap.add_argument('--write', action='store_true', help='cpu invullen in site-modules.json')
    ap.add_argument('--port', default='COM5')
    ap.add_argument('--no-reboot', action='store_true', help='niet herstarten tussen modules')
    a = ap.parse_args()
    site = json.load(open(SITE_JSON, encoding='utf-8'))
    types = a.types or (list(site['modules']) if a.site else [])
    if not types:
        ap.error('geef moduletypes of --site')
    info = port_info(['tp_mmb_midiin', 'tp_mmb_vco', 'tp_mmb_out', *types])
    t = Teensy(a.port)
    fw = fw_version()
    results = {}

    def fresh():
        # Na een herstart is ook de MIDI-poort opnieuw aangemeld.
        midi_ref[0].close()
        if not a.no_reboot:
            t.reboot()
        for _ in range(20):
            try:
                midi_ref[0] = Out()
                return
            except (StopIteration, RuntimeError):
                time.sleep(0.5)
        raise RuntimeError('MIDI-poort van de Teensy komt niet terug')

    midi_ref = [Out()]
    try:
        if not a.no_reboot:
            fresh()
        base0 = measure(t, midi_ref[0], config(info)[0])
        print(f'basis (MIDI -> VCO -> OUT): {base0:.1f} %', flush=True)
        for x in types:
            if x not in info:
                print(f'{x}: onbekend type, overgeslagen')
                continue
            cfg, how = config(info, x)
            try:
                if not a.no_reboot:
                    fresh()
                v = measure(t, midi_ref[0], cfg)
            except Exception as e:   # Teensy weg (overbelast?): opnieuw openen en door
                print(f'{x}: FOUT {e}', flush=True)
                try:
                    t.open(30.0)
                except Exception:
                    print('Teensy komt niet terug: gestopt.')
                    break
                continue
            if v is None:
                print(f'{x}: config niet toegepast')
                continue
            d = round(max(0.0, v - base0), 1)
            results[x] = (d, how)
            print(f'{x:28s} {v:5.1f} % - basis = {d:4.1f} %   ({how})', flush=True)
    finally:
        try:
            midi_ref[0].close()
        except Exception:
            pass
    if a.write:
        for x, (d, how) in results.items():
            if x in site['modules']:
                site['modules'][x]['cpu'] = {'percent': d, 'fw': fw,
                                             'how': f'module_cpu.py: one instance, one note held, default settings ({how})'}
        with open(SITE_JSON, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(site, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'site-modules.json bijgewerkt ({len(results)} modules, fw {fw})')


if __name__ == '__main__':
    main()
