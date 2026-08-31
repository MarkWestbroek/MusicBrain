#!/usr/bin/env python3
"""
Two final sheets:

MIX / VCA / OUTPUT (simplified but faithful in signal path):
  voice bus -> R643 1k / C603 .47u -> Q512 buffer (sound-killer controlled)
  -> C559 1u -> R649 56k -> IC502 BA662 VCA (accent/fade CV on pin 5 side,
  VR69 50k trims) -> opamp buffer (the 4558 half drawn as the second
  triangle) -> R655/R657 -> High out (220k) and Low out (10k) networks.
  Drawn with the BA662 and 4558 as generic blocks; the sound-killer
  transistors (Q512 clamp, Q534/Q535 power-off clamp) are included as the
  clamps they are, without the supply-sensing RC chains.

TOP SHEET: hierarchical sheet blocks referencing all voice pages, with the
trigger inputs as global labels on the left and the mix bus collecting all
voice outputs.
"""
import sys, re, uuid
sys.path.insert(0, '/home/claude/cr78')
import sch_gen
from sch_gen import build, pin_xy, grab, DONOR_SRC, LIBS, PINS, DIODE_ROT

for lib, src in [('Transistor_BJT:BC549', grab(DONOR_SRC, 'Transistor_BJT:BC549')),
                 ('power:+15V', grab(DONOR_SRC, 'power:+12V').replace('+12V', '+15V')),
                 ('power:-15V', grab(DONOR_SRC, 'power:-12V').replace('-12V', '-15V'))]:
    LIBS[lib] = src
    PINS[lib] = [(m[3], float(m[0]), float(m[1])) for m in
                 re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                            r'[\s\S]*?\(number "([^"]*)"', src)]

# simple 3-pin VCA block symbol (in, cv, out) standing in for the BA662
BA662 = '''(symbol "CR78:BA662" (pin_names (offset 0.254)) (in_bom yes) (on_board yes)
      (property "Reference" "U" (id 0) (at 0 6.35 0) (effects (font (size 1.27 1.27))))
      (property "Value" "BA662" (id 1) (at 0 -6.35 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (id 2) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (property "Datasheet" "~" (id 3) (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (symbol "BA662_0_1"
        (polyline (pts (xy -3.81 5.08) (xy -3.81 -5.08) (xy 3.81 0) (xy -3.81 5.08))
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "BA662_1_1"
        (pin input line (at -6.35 2.54 0) (length 2.54) (name "IN" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin input line (at 0 -7.62 90) (length 5.08) (name "CV" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
        (pin output line (at 6.35 0 180) (length 2.54) (name "OUT" (effects (font (size 1.27 1.27)))) (number "3" (effects (font (size 1.27 1.27)))))
      )
    )'''
OPAMP = BA662.replace('BA662', 'OPAMP').replace('"OPAMP" (id 1)', '"uPC4558" (id 1)')
LIBS['CR78:BA662'] = BA662
LIBS['CR78:OPAMP'] = OPAMP
for lib in ['CR78:BA662', 'CR78:OPAMP']:
    PINS[lib] = [(m[3], float(m[0]), float(m[1])) for m in
                 re.findall(r'\(pin \w+ \w+ \(at ([-\d.]+) ([-\d.]+) (\d+)\)'
                            r'[\s\S]*?\(number "([^"]*)"', LIBS[lib])]

DX = 12.0
S = {'parts': [], 'wires': [], 'labels': [], 'g': [1]}
parts, wires, labels, g = S['parts'], S['wires'], S['labels'], S['g']

def add(r, v, lib, x, y, rot=0):
    parts.append((r, v, lib, x, y, rot)); return r
def P(ref, num):
    for r, v, lib, px, py, rt in parts:
        if r == ref: return pin_xy(lib, px, py, rt, num)
    raise KeyError(ref)
def w(a, b): wires.append((a, b))
def rail(sym, x, y):
    r = '#PWR%02d' % g[0]; g[0] += 1
    lib = 'power:GND' if sym == 'GND' else 'power:%s' % sym
    add(r, sym, lib, x, y); return P(r, '1')
def ser(ref, val, lib, x, y, diode=False):
    rot = DIODE_ROT if diode else 90
    add(ref, val, lib, x + DX / 2, y, rot)
    lo, hi = ('1', '2') if (not diode or DIODE_ROT == 0) else ('2', '1')
    w((x, y), P(ref, lo)); w(P(ref, hi), (x + DX, y)); return x + DX
def shunt(ref, val, lib, x, y):
    add(ref, val, lib, x, y + 8)
    w((x, y), P(ref, '1')); w(P(ref, '2'), rail('GND', x, y + 18))
    w((x, y), (x + DX, y)); return x + DX

Y = 80.0
x = 40.0
w((32.0, Y), (x, Y))
labels.append(('MIX_BUS', 32.0, Y, 180))
x = ser('R643', '1k', 'Device:R', x, Y)
x = ser('C603', '0.47u', 'Device:C', x, Y)
xB = x
# Q512 buffer; its base is yanked down by the power-on sound killer
add('R644', '560k', 'Device:R', xB, Y - 10)
w((xB, Y), P('R644', '2')); w(P('R644', '1'), rail('+15V', xB, Y - 22))
add('Q512', '2SC1815-GR', 'Transistor_BJT:BC549', xB + 16, Y)
w((xB, Y), P('Q512', '2'))
xc, yc = P('Q512', '1')
add('R647', '22k', 'Device:R', xc, yc - 12)
w((xc, yc), P('R647', '2')); w(P('R647', '1'), rail('+15V', xc, yc - 24))
ex, ey = P('Q512', '3')
add('R645', '100k', 'Device:R', ex + 8, ey + 6)
w((ex, ey), (ex + 8, ey)); w((ex + 8, ey), P('R645', '1'))
w(P('R645', '2'), rail('GND', ex + 8, ey + 18))
# emitter follows to the VCA through C559 / R649
x = ex + 16
w((ex + 8, ey), (x, ey))
x = ser('C559', '1u', 'Device:C', x, ey)
x = ser('R649', '56k', 'Device:R', x, ey)
x = shunt('R652', '10k', 'Device:R', x, ey)
add('U502', 'BA662', 'CR78:BA662', x + 10, ey - 2.54)
w((x, ey), P('U502', '1'))
# CV side: accent/fade arrives via R650 1k, VR69 50k trim against ground
cvx, cvy = P('U502', '2')
add('R650', '1k', 'Device:R', cvx, cvy + 12)
w((cvx, cvy), P('R650', '2'))
w(P('R650', '1'), (cvx, cvy + 22))
labels.append(('ACCENT_CV', cvx, cvy + 22, 270))
add('VR69', '50k', 'Device:R', cvx + 10, cvy + 12)
w((cvx, cvy), (cvx + 10, cvy)); w((cvx + 10, cvy), P('VR69', '1'))
w(P('VR69', '2'), rail('GND', cvx + 10, cvy + 24))
# opamp buffer and the two output networks
ox, oy = P('U502', '3')
add('R651', '1k', 'Device:R', ox + 6, oy, 90)
w((ox, oy), P('R651', '1'))
w(P('R651', '2'), (ox + 14, oy))
add('U503', 'uPC4558', 'CR78:OPAMP', ox + 22, oy - 2.54)
w((ox + 14, oy), P('U503', '1'))
w(P('U503', '2'), rail('GND', P('U503', '2')[0], P('U503', '2')[1] + 8))
bx, by = P('U503', '3')
x = bx
w((bx, by), (x, by))
x = ser('R655', '220k', 'Device:R', x, by)
x2 = ser('R657', '3.5k', 'Device:R', x, by + 0)   # low-out tap follows
# High out: from R655
w((x, by), (x, by - 14))
add('R950', '220k', 'Device:R', x, by - 20)
w((x, by - 14), P('R950', '2'))
w(P('R950', '1'), (x, by - 30))
labels.append(('HIGH_OUT', x, by - 30, 90))
# Low out: through R657/R658
x3 = shunt('R658', '220', 'Device:R', x2, by)
labels.append(('LOW_OUT', x3, by, 0))
w((x3 - DX, by), (x3, by))

open('/mnt/user-data/outputs/cr78_mix_output.kicad_sch', 'w').write(
    build('CR-78 Mix / VCA / Output', parts, wires, labels, page='A3'))
print('mix/output: %d componenten, %d draden' % (len(parts), len(wires)))

# ==================================================================
# TOP SHEET with hierarchical sheet blocks
# ==================================================================
U = lambda: str(uuid.uuid4())
SHEETS = [
    ('voices twin-T: BD',      'cr78_bd.kicad_sch'),
    ('voices twin-T: HB',      'cr78_hb.kicad_sch'),
    ('voices twin-T: LB',      'cr78_lb.kicad_sch'),
    ('voices twin-T: LC',      'cr78_lc.kicad_sch'),
    ('LC ping: rim shot',      'cr78_rimshot.kicad_sch'),
    ('LC ping: claves',        'cr78_claves.kicad_sch'),
    ('noise group CY/HH/M',    'cr78_noise_group.kicad_sch'),
    ('snare drum',             'cr78_snare.kicad_sch'),
    ('cowbell',                'cr78_cowbell.kicad_sch'),
    ('guiro',                  'cr78_guiro.kicad_sch'),
    ('metallic beat',          'cr78_metallic_beat.kicad_sch'),
    ('tambourine',             'cr78_tambourine.kicad_sch'),
    ('mix / VCA / output',     'cr78_mix_output.kicad_sch'),
]
out = ['(kicad_sch (version 20211123) (generator sch_gen)', '',
       '  (uuid %s)' % U(), '', '  (paper "A3")', '',
       '  (title_block (title "Roland CR-78 voice board VG-11A, reconstructed")',
       '    (company "CR-78 reconstruction") (comment 1 "All 14 voices; logic board GL-9 not included")',
       '  )', '']
sheet_insts = []
for i, (name, fn) in enumerate(SHEETS):
    col, row = i % 4, i // 4
    x, y = 30 + col * 95, 30 + row * 55
    u = U()
    out += ['  (sheet (at %s %s) (size 80 40) (fields_autoplaced)' % (x, y),
            '    (stroke (width 0.1524) (type solid) (color 0 0 0 0))',
            '    (fill (color 0 0 0 0.0000))',
            '    (uuid %s)' % u,
            '    (property "Sheet name" "%s" (id 0) (at %s %s 0)' % (name, x, y - 2),
            '      (effects (font (size 1.27 1.27)) (justify left bottom)))',
            '    (property "Sheet file" "%s" (id 1) (at %s %s 0)' % (fn, x, y + 42),
            '      (effects (font (size 1.27 1.27)) (justify left top)))',
            '  )']
    sheet_insts.append((u, i + 2))
out += ['', '  (sheet_instances', '    (path "/" (page "1"))']
for u, pg in sheet_insts:
    out.append('    (path "/%s" (page "%d"))' % (u, pg))
out += ['  )', ')']
open('/mnt/user-data/outputs/cr78_top.kicad_sch', 'w').write('\n'.join(out) + '\n')

PRO = '''{
  "board": {}, "boards": [], "cvpcb": {}, "erc": {},
  "libraries": {"pinned_footprint_libs": [], "pinned_symbol_libs": []},
  "meta": {"filename": "cr78_top.kicad_pro", "version": 1},
  "net_settings": {"classes": []},
  "pcbnew": {},
  "schematic": {"drawing": {}, "legacy_lib_dir": "", "legacy_lib_list": []},
  "sheets": [], "text_variables": {}
}'''
open('/mnt/user-data/outputs/cr78_top.kicad_pro', 'w').write(PRO)
print('top sheet + project file written')
