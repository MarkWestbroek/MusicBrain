"""Generate musicbrain-adc8.kicad_pcb â€” placed (unrouted) AD7606 slot card."""
import re
import sys

import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-adc8\musicbrain-adc8.kicad_pcb"
SCH_FILE = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-adc8\musicbrain-adc8.kicad_sch"

def tokenize(text):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ' \t\r\n':
            i += 1
        elif c in '()':
            yield c; i += 1
        elif c == '"':
            j = i + 1; buf = []
            while text[j] != '"':
                if text[j] == '\\':
                    buf.append(text[j:j+2]); j += 2
                else:
                    buf.append(text[j]); j += 1
            yield '"' + ''.join(buf) + '"'; i = j + 1
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n()':
                j += 1
            yield text[i:j]; i = j

def parse(text):
    stack = [[]]
    for tok in tokenize(text):
        if tok == '(':
            stack.append([])
        elif tok == ')':
            done = stack.pop(); stack[-1].append(done)
        else:
            stack[-1].append(tok)
    return stack[0][0]

def serialize(node, indent=0):
    pad = '  ' * indent
    if not isinstance(node, list):
        return pad + node
    if all(not isinstance(x, list) for x in node):
        return pad + '(' + ' '.join(node) + ')'
    line = pad + '(' + str(node[0])
    i = 1
    while i < len(node) and not isinstance(node[i], list):
        line += ' ' + node[i]; i += 1
    out = [line]
    for child in node[i:]:
        out.append(serialize(child, indent + 1))
    out.append(pad + ')')
    return '\n'.join(out)

STRIP_HEADS = {'version', 'generator', 'generator_version',
               'duplicate_pad_numbers_are_jumpers', 'embedded_fonts'}

def fmt(v):
    s = f'{v:.6f}'.rstrip('0').rstrip('.')
    return s if s else '0'

_u = [0]
def uid():
    _u[0] += 1
    return f'f1000000-0000-4000-8000-{_u[0]:012d}'

def load_footprint(relpath, lib_id, ref, value, x, y, path_uuid, netmap, rot=0):
    tree = parse(open(FP_DIR + '\\' + relpath, encoding='utf-8').read())
    tree[1] = f'"{lib_id}"'
    body = []
    for node in tree[2:]:
        if isinstance(node, list):
            if node[0] in STRIP_HEADS:
                continue
            if node[0] == 'property' and node[1] == '"KiLib_Generator"':
                continue
            if node[0] == 'property' and node[1] == '"Reference"':
                node[2] = f'"{ref}"'
            if node[0] == 'property' and node[1] == '"Value"':
                node[2] = f'"{value}"'
            if node[0] == 'pad':
                num = node[1].strip('"')
                if num in netmap:
                    idx, name = netmap[num]
                    node.append(['net', str(idx), f'"{name}"'])
        body.append(node)
    at = ['at', fmt(x), fmt(y), str(rot)] if rot else ['at', fmt(x), fmt(y)]
    tree[2:] = [['uuid', f'"{uid()}"'], at, ['path', f'"/{path_uuid}"']] + body
    return tree

NETS = (['', '+3V3', '+5V', '+12V', 'GND',
         '/SCLK', '/MISO', '/CS', '/IRQ', '/CONVST', '/RESET', '/RANGE',
         'Net-(U1-REFCAPA)', 'Net-(U1-REFIN{slash}REFOUT)',
         'Net-(U1-REGCAP1)', 'Net-(U1-REGCAP2)']
        + [f'/IN{k}' for k in range(1, 9)]
        + [f'Net-(U1-V{k})' for k in range(1, 9)])
NI = {n: i for i, n in enumerate(NETS)}
def nm(m): return {p: (NI[n], n) for p, n in m.items()}
def rc(a, b): return nm({'1': a, '2': b})

U1_MAP = {'23': '+3V3', '6': '+3V3', '7': '+3V3', '34': '+3V3',
          '8': '/RANGE', '9': '/CONVST', '10': '/CONVST', '11': '/RESET',
          '12': '/SCLK', '13': '/CS', '24': '/MISO', '14': '/IRQ',
          '36': 'Net-(U1-REGCAP1)', '39': 'Net-(U1-REGCAP2)',
          '42': 'Net-(U1-REFIN{slash}REFOUT)',
          '44': 'Net-(U1-REFCAPA)', '45': 'Net-(U1-REFCAPA)'}
for p in ('1', '37', '38', '48'):
    U1_MAP[p] = '+5V'
for p in ('2', '3', '4', '5', '16', '17', '18', '19', '20', '21', '22',
          '26', '27', '28', '29', '30', '31', '32', '33', '35', '40', '41',
          '43', '46', '47'):
    U1_MAP[p] = 'GND'
for k in range(1, 9):
    U1_MAP[str(48 + 2 * k - 1)] = f'Net-(U1-V{k})'
    U1_MAP[str(48 + 2 * k)] = 'GND'
U1_MAP = nm(U1_MAP)

J1_MAP = nm({'1': 'GND', '2': '+12V', '3': 'GND', '5': 'GND', '6': '+3V3',
             '7': '/SCLK', '8': 'GND', '10': 'GND', '11': '/MISO', '12': 'GND',
             '13': '/CS', '14': 'GND', '16': '/IRQ', '19': '/CONVST', '20': '/RESET'})
J2_MAP = nm({'1': 'GND', '10': 'GND', **{str(k+1): f'/IN{k}' for k in range(1, 9)}})
JP1_MAP = nm({'1': '+3V3', '2': '/RANGE', '3': 'GND'})
U2_MAP = nm({'1': 'GND', '2': '+5V', '3': '+12V'})

sch_txt = open(SCH_FILE, encoding='utf-8').read()
sym_uuid = {}
for m in re.finditer(r'\(uuid "([0-9a-f-]+)"\)\s*\n\s*\(property "Reference" "([A-Z][A-Z0-9]*)"', sch_txt):
    sym_uuid[m.group(2)] = m.group(1)

FPS = [
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Vertical',
     'J1', 'BUS', 104, 104.5, J1_MAP, 0),
    ('Package_QFP.pretty\\LQFP-64_10x10mm_P0.5mm.kicad_mod',
     'Package_QFP:LQFP-64_10x10mm_P0.5mm',
     'U1', 'AD7606BSTZ', 135, 119, U1_MAP, 0),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical',
     'J2', 'CV IN', 168, 104.5, J2_MAP, 0),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x03_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical',
     'JP1', 'RANGE', 101.8, 129.5, JP1_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
     'U2', 'AMS1117-5.0', 112, 133, U2_MAP, 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R9', '100k', 131, 128.6,
     rc('/RESET', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 104, 138.5, rc('+12V', 'GND'), 0),
    ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 121, 138.5, rc('+5V', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '100n', 127, 138.5, rc('+5V', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C4', '100n', 131.5, 138.5, rc('+5V', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C5', '100n', 136, 138.5, rc('+3V3', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C6', '1u', 148, 121.25,
     rc('Net-(U1-REGCAP1)', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C7', '1u', 152, 119.75,
     rc('Net-(U1-REGCAP2)', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C8', '10u', 148, 118.25,
     rc('Net-(U1-REFIN{slash}REFOUT)', 'GND'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C9', '10u', 152, 116.75,
     rc('Net-(U1-REFCAPA)', 'GND'), 0),
]
for k in range(8):
    FPS.append(('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
                'Resistor_SMD:R_0805_2012Metric', f'R{k+1}', '1k',
                165.5 - 3.5 * k, 106.8,
                rc(f'Net-(U1-V{k+1})', f'/IN{k+1}'), 0))

fp_texts = []
for f, lib, ref, val, x, y, netmap, rot in FPS:
    tree = load_footprint(f, lib, ref, val, x, y, sym_uuid.get(ref, ''), netmap, rot)
    fp_texts.append(serialize(tree, 1))

BX0, BY0, BX1, BY1 = 100, 100, 180, 144

header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (title_block
    (title "MusicBrain ADC8 - 8x CV input slot card")
    (date "2026-07-07")
    (rev "1.0")
    (company "MusicBrain project")
  )
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1")
    (43 "Eco2.User" user "User.Eco2")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user)
    (49 "F.Fab" user)
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (aux_axis_origin {BX0} {BY0})
    (grid_origin {BX0} {BY0})
  )
'''

nets_block = '\n'.join(f'  (net {i} "{n}")' for i, n in enumerate(NETS))

extras = f'''
  (gr_rect (start {BX0} {BY0}) (end {BX1} {BY1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "ADC8 rev 1.0" (at 168 141 0) (layer "F.SilkS")
    (uuid "{uid()}")
    (effects (font (size 1 1) (thickness 0.15))))
'''

def zone(layer):
    return f'''
  (zone (net {NI['GND']}) (net_name "GND") (layer "{layer}")
    (uuid "{uid()}")
    (hatch edge 0.5)
    (connect_pads yes (clearance 0.3))
    (min_thickness 0.2) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts
      (xy {BX0+0.5} {BY0+0.5}) (xy {BX1-0.5} {BY0+0.5})
      (xy {BX1-0.5} {BY1-0.5}) (xy {BX0+0.5} {BY1-0.5})
    ))
  )'''

# ================= ROUTING =================
tracks, vias = [], []
def T(net, layer, w, *pts):
    tracks.append((NI[net], layer, w, pts))
def V(net, x, y):
    vias.append((NI[net], x, y))

SW = 0.25
# --- left fan: J1 -> chip left column ---
T('+3V3', 'F.Cu', .3, (106.54, 109.58), (126.9, 109.58), (126.9, 118.25))
T('+3V3', 'F.Cu', SW, (126.9, 117.75), (128.55, 117.75))
T('+3V3', 'F.Cu', SW, (126.9, 118.25), (128.55, 118.25))
T('/SCLK', 'F.Cu', SW, (104, 112.12), (125.7, 112.12), (125.7, 120.75), (128.55, 120.75))
T('/CS', 'F.Cu', SW, (104, 119.74), (124.5, 119.74), (124.5, 121.25), (128.55, 121.25))
T('/IRQ', 'F.Cu', SW, (106.54, 122.28), (123.3, 122.28), (123.3, 121.75), (128.55, 121.75))
# RESET: J1.20 -> B hop -> pin11; run continues into R9.1
T('/RESET', 'F.Cu', SW, (106.54, 127.36), (106.54, 128.2), (130.0875, 128.2))
V('/RESET', 127.0, 128.2)
T('/RESET', 'B.Cu', SW, (127.0, 128.2), (127.0, 120.25))
V('/RESET', 127.0, 120.25)
T('/RESET', 'F.Cu', SW, (127.0, 120.25), (128.55, 120.25))
# CONVST: J1.19 -> B -> pins 9+10
T('/CONVST', 'F.Cu', SW, (104, 127.36), (104, 129.1), (119.9, 129.1))
V('/CONVST', 119.9, 129.1)
T('/CONVST', 'B.Cu', SW, (119.9, 129.1), (119.9, 120.3), (126.3, 120.3), (126.3, 119.25))
V('/CONVST', 126.3, 119.25)
T('/CONVST', 'F.Cu', SW, (126.3, 119.25), (128.55, 119.25))
T('/CONVST', 'F.Cu', SW, (128.2, 119.25), (128.2, 119.75), (128.55, 119.75))
# RANGE: pin8 -> B -> JP1.2
T('/RANGE', 'F.Cu', SW, (128.55, 118.75), (127.4, 118.75))
V('/RANGE', 127.4, 118.75)
T('/RANGE', 'B.Cu', SW, (127.4, 118.75), (109.5, 118.75), (109.5, 133.2), (103.3, 133.2))
V('/RANGE', 103.3, 133.2)
T('/RANGE', 'F.Cu', SW, (103.3, 133.2), (103.3, 133.74), (102.65, 133.74))
# MISO: J1.11 -> pin24 (DOUTA)
T('/MISO', 'F.Cu', SW, (104, 117.2), (108.5, 117.2), (108.5, 127.15),
  (134.75, 127.15), (134.75, 125.45))
# +3V3 second branch: J1.6 -> tunnel -> JP1.1
T('+3V3', 'F.Cu', SW, (106.54, 109.58), (106.54, 108.3), (105.27, 108.3),
  (105.27, 130.9), (103.4, 130.9), (103.4, 131.2), (102.65, 131.2))
# +12V: J1.2 -> B west column -> U2 VI + C1
T('+12V', 'F.Cu', .5, (106.54, 104.5), (106.54, 103), (102.5, 103))
V('+12V', 102.5, 103)
T('+12V', 'B.Cu', .5, (102.5, 103), (102.5, 135.9))
V('+12V', 102.5, 135.9)
T('+12V', 'F.Cu', .5, (102.5, 135.9), (107.85, 135.9))
T('+12V', 'F.Cu', .4, (105.05, 135.9), (105.05, 137.775))
# +5V: U2 tab -> B ring -> AVCC pins + C2/C3/C4
T('+5V', 'F.Cu', .5, (115.15, 133), (116.5, 133))
V('+5V', 116.5, 133)
T('+5V', 'B.Cu', .5, (116.5, 133), (170.5, 133), (170.5, 103.0), (127.7, 103.0))
V('+5V', 127.7, 103.0)
T('+5V', 'F.Cu', .4, (127.7, 103.0), (127.7, 115.25), (128.55, 115.25))
V('+5V', 142.5, 103.0)
T('+5V', 'B.Cu', .4, (142.5, 103.0), (142.5, 115.25))
V('+5V', 142.5, 115.25)
T('+5V', 'F.Cu', SW, (142.5, 115.25), (141.45, 115.25))
V('+5V', 146.6, 103.0)
T('+5V', 'B.Cu', .4, (146.6, 103.0), (146.6, 120.5))
V('+5V', 146.6, 120.5)
T('+5V', 'F.Cu', SW, (146.6, 120.5), (142.6, 120.5))
T('+5V', 'F.Cu', SW, (142.6, 120.25), (142.6, 120.75))
T('+5V', 'F.Cu', SW, (142.6, 120.25), (141.45, 120.25))
T('+5V', 'F.Cu', SW, (142.6, 120.75), (141.45, 120.75))
T('+5V', 'B.Cu', .4, (119.2, 133), (119.2, 135.8))
V('+5V', 119.2, 135.8)
T('+5V', 'F.Cu', .4, (119.2, 135.8), (119.2, 137.775))
T('+5V', 'F.Cu', .4, (119.2, 135.8), (126.05, 135.8), (126.05, 137.775))
T('+5V', 'F.Cu', .4, (126.05, 135.8), (130.55, 135.8), (130.55, 137.775))
# --- support caps (straight stubs east) ---
T('Net-(U1-REGCAP1)', 'F.Cu', SW, (141.45, 121.25), (147.05, 121.25))
T('Net-(U1-REGCAP2)', 'F.Cu', SW, (141.45, 119.75), (151.05, 119.75))
T('Net-(U1-REFIN{slash}REFOUT)', 'F.Cu', SW, (141.45, 118.25), (147.05, 118.25))
T('Net-(U1-REFCAPA)', 'F.Cu', SW, (141.45, 116.75), (151.05, 116.75))
T('Net-(U1-REFCAPA)', 'F.Cu', SW, (141.45, 117.25), (141.85, 117.25), (141.85, 116.75))
# --- +3V3 pin34 (REF_SELECT) + pin23 (VDRIVE) + C5 ---
T('+3V3', 'F.Cu', SW, (141.45, 122.25), (142.0, 122.25), (142.0, 123.5), (140.3, 123.5))
V('+3V3', 140.3, 123.5)
T('+3V3', 'B.Cu', SW, (140.3, 123.5), (140.3, 131), (135.6, 131))
V('+3V3', 135.6, 131)
T('+3V3', 'F.Cu', SW, (135.6, 131), (134.05, 131))
T('+3V3', 'F.Cu', SW, (134.25, 125.45), (134.05, 125.85), (134.05, 126.5))
V('+3V3', 134.05, 126.5)
T('+3V3', 'B.Cu', SW, (134.05, 126.5), (134.05, 128.9))
V('+3V3', 134.05, 128.9)
T('+3V3', 'F.Cu', .3, (134.05, 128.9), (134.05, 138.5), (135.05, 138.5))
# --- V-fan: top pins -> R row (F.Cu) ---
for k in range(1, 9):
    xk = 139.75 - 1.0 * k
    level = 112.6 - 0.5 * k
    ax = (164.4 - 3.5 * (k - 1)) - 0.9125
    T(f'Net-(U1-V{k})', 'F.Cu', SW, (xk, 112.55), (xk, level), (ax, level), (ax, 107.4))
# --- IN links: R pad2 -> B -> J2 ---
for k in range(1, 9):
    p2 = (164.4 - 3.5 * (k - 1)) + 0.9125
    row = 107.04 + 2.54 * (k - 1)
    V(f'/IN{k}', p2, 107.7)
    T(f'/IN{k}', 'B.Cu', SW, (p2, 107.7), (p2, row), (168, row))
# --- GND: chip centre island bond + stitching ---
for sx, sy in ((134, 119), (136, 119), (102, 102), (178, 102), (102, 142),
               (178, 142), (140, 101.5), (160, 140), (120, 141.5), (111, 120),
               (165, 131)):
    V('GND', sx, sy)

_tu = [0]
def tuid():
    _tu[0] += 1
    return f'f2000000-0000-4000-8000-{_tu[0]:012d}'

track_txt = []
for net, layer, w, pts in tracks:
    for a, b in zip(pts, pts[1:]):
        track_txt.append(f'  (segment (start {fmt(a[0])} {fmt(a[1])}) (end {fmt(b[0])} {fmt(b[1])}) '
                         f'(width {w}) (layer "{layer}") (net {net}) (uuid "{tuid()}"))')
for net, x, y in vias:
    track_txt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                     f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{tuid()}"))')

out = (header + nets_block + '\n' + '\n'.join(fp_texts) + '\n'
       + '\n'.join(track_txt) + extras
       + zone('F.Cu') + zone('B.Cu') + '\n)\n')
open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('written', OUT, f'({len(track_txt)} routed items)')


