"""DSN-prep voor gswitch-loop8 freerouting (recept uit WERKWIJZE.md):
- (plane ...)-blokken en netblokken van GND/AGND/CHASSIS strippen
  (zones doen die netten; freerouting moet er vanaf blijven)
- alle bestaande wiring op (type protect) zetten (handroutes zijn heilig)
- boundary 0,6 mm inkrimpen (copper_edge_clearance)
"""
import re
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    r"d:\Git\Muziek\MusicBrain\hardware\schematics\gswitch-loop8\gswitch-loop8.dsn"
KEEPOUT = '--no-keepout' not in sys.argv
CLR150 = '--clearance-150' in sys.argv   # bij krappe handroutes: DSN-clearance
# hybride narun (WERKWIJZE): --narun=/NET1,/NET2 -> wiring van díé netten
# strippen (router legt ze vers), al het andere protect.
NARUN = set()
for _a in sys.argv:
    if _a.startswith('--narun='):
        NARUN = set(_a.split('=', 1)[1].split(','))
DST = SRC.replace('.dsn', '-fr.dsn')     # klemmen + Default-netclass 0,15!
STRIP_NETS = {'GND', '/AGND', '"/AGND"', '/CHASSIS', '"/CHASSIS"'}


def blocks(s, key):
    """Vind gebalanceerde (key ...)-blokken; yield (start, eind-exclusief)."""
    i = 0
    while True:
        j = s.find('(' + key, i)
        if j < 0:
            return
        # alleen hele woorden
        k = j + 1 + len(key)
        if s[k] not in ' \t\r\n"(':
            i = j + 1
            continue
        depth = 0
        k = j
        while True:
            if s[k] == '(':
                depth += 1
            elif s[k] == ')':
                depth -= 1
            if depth == 0:
                break
            k += 1
        yield j, k + 1
        i = k + 1


def net_of(block):
    m = re.search(r'\(net\s+("?[^\s")]+"?)', block)
    return m.group(1).strip('"') if m else None


txt = open(SRC, encoding='utf-8').read()

# 1. planes strippen
out, pos = [], 0
for a, bnd in blocks(txt, 'plane'):
    out.append(txt[pos:a])
    pos = bnd
out.append(txt[pos:])
txt = ''.join(out)

# 2. netblokken in network-sectie strippen + uit class-regels
out, pos = [], 0
for a, bnd in blocks(txt, 'net'):
    blk = txt[a:bnd]
    m = re.match(r'\(net\s+("?[^\s")]+"?)', blk)
    if m and m.group(1).strip('"') in ('GND', '/AGND', '/CHASSIS') \
            and '(pins' in blk:
        out.append(txt[pos:a])
        pos = bnd
out.append(txt[pos:])
txt = ''.join(out)
# class-lijsten: losse netnamen verwijderen (quoted en unquoted)
for nm in ('"/AGND"', '"/CHASSIS"', '/AGND', '/CHASSIS', 'GND'):
    txt = re.sub(r'(\(class\s[^(]*?)\s' + re.escape(nm) + r'(?=[\s(])',
                 r'\1', txt)

# 3. wiring: GND/AGND/CHASSIS-wires weg, rest protect
out, pos = [], 0
for a, bnd in blocks(txt, 'wire'):
    blk = txt[a:bnd]
    nm = net_of(blk)
    out.append(txt[pos:a])
    if nm in ('GND', '/AGND', '/CHASSIS') or nm in NARUN:
        pass  # weg
    else:
        if '(type ' in blk:
            blk = re.sub(r'\(type\s+\w+\)', '(type protect)', blk)
        else:
            blk = blk[:-1] + '(type protect))'
        out.append(blk)
    pos = bnd
out.append(txt[pos:])
txt = ''.join(out)

out, pos = [], 0
for a, bnd in blocks(txt, 'via '):
    blk = txt[a:bnd]
    nm = net_of(blk)
    if '(net' not in blk:      # via-padstack-definitie, niet een geplaatste via
        pos_keep = True
        out.append(txt[pos:bnd]); pos = bnd
        continue
    out.append(txt[pos:a])
    if nm in ('GND', '/AGND', '/CHASSIS') or nm in NARUN:
        pass
    else:
        if '(type ' in blk:
            blk = re.sub(r'\(type\s+\w+\)', '(type protect)', blk)
        else:
            blk = blk[:-1] + '(type protect))'
        out.append(blk)
    pos = bnd
out.append(txt[pos:])
txt = ''.join(out)

# 3b. clearance klemmen op 150 um (WERKWIJZE: freerouting keurt anders
#     krappe-maar-legale handroutes af -> eeuwige violations; .kicad_pro
#     Default-netclass moet dan ook op 0,15 staan!)
if CLR150:
    def _clamp(m):
        v = float(m.group(1))
        return f'(clearance {150 if v > 150 else m.group(1)}'
    txt = re.sub(r'\(clearance\s+([\d.]+)', _clamp, txt)

# 4. boundary inkrimpen (0,6 mm; KiCad-DSN: unit um -> 1 mm = 1000 eenheden)
mres = re.search(r'\(resolution\s+(\w+)\s+(\d+)\)', txt)
unit, res = mres.group(1), int(mres.group(2))
assert unit == 'um', unit
inset = 600

def shrink_boundary(m):
    head, coords = m.group(1), m.group(2)
    vals = [float(v) for v in coords.split()]
    xs, ys = vals[0::2], vals[1::2]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    x0 += inset; x1 -= inset; y0 += inset; y1 -= inset
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    return head + '  '.join(f'{x:.0f} {y:.0f}' for x, y in pts) + ')'

txt = re.sub(r'(\(path\s+pcb\s+\d+\s+)([\d\s.eE+-]+)\)', shrink_boundary,
             txt, count=1)

# 5. keepout over het audiogebied (freerouting-netten horen in de zuidstrook;
#    zonder keepout gaat hij door de AGND-zone of de zone-spleet zwerven)
if not KEEPOUT:
    open(DST, 'w', encoding='utf-8', newline='\n').write(txt)
    print('written', DST, '(zonder keepout)')
    sys.exit(0)
KO_Y = -131600   # tot net boven de relais-COM-pads
ko = ''
for layer in ('F.Cu', 'B.Cu'):
    ko += (f'\n    (keepout "ko_audio_{layer}" (polygon {layer} 0'
           f'  100600 -100600  299400 -100600  299400 {KO_Y}'
           f'  100600 {KO_Y}  100600 -100600))')
txt = txt.replace('(plane ', ko + '\n    (plane ', 1) if '(plane ' in txt else txt
if 'ko_audio' not in txt:
    # planes zijn al gestript: hang de keepouts achter de boundary
    i = txt.find('(boundary')
    depth = 0; j = i
    while True:
        if txt[j] == '(':
            depth += 1
        elif txt[j] == ')':
            depth -= 1
        if depth == 0:
            break
        j += 1
    txt = txt[:j + 1] + ko + txt[j + 1:]

open(DST, 'w', encoding='utf-8', newline='\n').write(txt)
print('written', DST, 'inset-eenheden:', inset, 'unit:', unit, 'res:', res)
