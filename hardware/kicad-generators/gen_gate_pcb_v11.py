"""Generate musicbrain-gate8.kicad_pcb v1.1 - H=80mm, haakse connectoren.

Kaartmodel (spec 'Mechanica-standaard kaarten'):
  x = B-richting (kaartbreedte 35mm: 100..135)
  y = H-richting (80mm: 100..180); busrand ONDER (y=180), paneelrand BOVEN (y=100)
  J1 = PinHeader_2x10_Horizontal, rot 270 (pennen omlaag de slot-socket in)
  J2 = PinHeader_1x10_Horizontal, rot 90 (pennen omhoog het jack-printje in),
       gecentreerd boven de slot-pinrij (zelfde middelpunt x=117.5 als J1)
"""
import math, re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-gate8\musicbrain-gate8.kicad_pcb"

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
               'duplicate_pad_numbers_are_jumpers', 'embedded_fonts',
               'tenting', 'zone_layer_connections'}

def fmt(v):
    s = f'{v:.6f}'.rstrip('0').rstrip('.')
    return s if s else '0'

def rotxy(px, py, rot):
    c = {0: 1, 90: 0, 180: -1, 270: 0}[rot]
    s = {0: 0, 90: 1, 180: 0, 270: -1}[rot]
    return (px * c + py * s, -px * s + py * c)

PADS = {}   # ref -> {num: (gx, gy)}

def load_footprint(relpath, lib_id, ref, value, x, y, rot, path_uuid, netmap, uuid):
    tree = parse(open(FP_DIR + '\\' + relpath, encoding='utf-8').read())
    tree[1] = f'"{lib_id}"'
    body = []
    PADS[ref] = {}
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
                for sub in node:
                    if isinstance(sub, list) and sub[0] == 'at':
                        px, py = float(sub[1]), float(sub[2])
                        dx, dy = rotxy(px, py, rot)
                        key = num if num not in PADS[ref] else num + 'b'
                        PADS[ref][key] = (round(x + dx, 4), round(y + dy, 4))
                if num in netmap:
                    idx, name = netmap[num]
                    node.append(['net', str(idx), f'"{name}"'])
        body.append(node)
    header = [['uuid', f'"{uuid}"'],
              ['at', fmt(x), fmt(y), str(rot)] if rot else ['at', fmt(x), fmt(y)],
              ['path', f'"/{path_uuid}"']]
    tree[2:] = header + body
    return tree

# ---------- nets ----------
NETS = ['', '+12V', '+5V', 'GND', '/SCLK', '/MOSI', '/CS',
        '/GATE1', '/GATE2', '/GATE3', '/GATE4', '/GATE5', '/GATE6', '/GATE7', '/GATE8',
        'Net-(U1-QA)', 'Net-(U1-QB)', 'Net-(U1-QC)', 'Net-(U1-QD)',
        'Net-(U1-QE)', 'Net-(U1-QF)', 'Net-(U1-QG)', 'Net-(U1-QH)']
NI = {n: i for i, n in enumerate(NETS)}
def nm(m): return {p: (NI[n], n) for p, n in m.items()}

J1_MAP = nm({'1': 'GND', '2': '+12V', '3': 'GND', '5': 'GND', '7': '/SCLK', '8': 'GND',
             '9': '/MOSI', '10': 'GND', '12': 'GND', '13': '/CS', '14': 'GND'})
U1_MAP = nm({'1': 'Net-(U1-QB)', '2': 'Net-(U1-QC)', '3': 'Net-(U1-QD)', '4': 'Net-(U1-QE)',
             '5': 'Net-(U1-QF)', '6': 'Net-(U1-QG)', '7': 'Net-(U1-QH)', '8': 'GND',
             '10': '+5V', '11': '/SCLK', '12': '/CS', '13': 'GND', '14': '/MOSI',
             '15': 'Net-(U1-QA)', '16': '+5V'})
U2_MAP = nm({'1': 'GND', '2': '+5V', '3': '+12V'})
J2_MAP = nm({'1': 'GND', '10': 'GND', **{str(k+1): f'/GATE{k}' for k in range(1, 9)}})
def rc(a, b): return nm({'1': a, '2': b})

sch_txt = open(r'd:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-gate8\musicbrain-gate8.kicad_sch', encoding='utf-8').read()
sym_uuid = {}
for m in re.finditer(r'\(uuid "([0-9a-f-]+)"\)\s*\n\s*\(property "Reference" "([A-Z][A-Z0-9]*)"', sch_txt):
    sym_uuid[m.group(2)] = m.group(1)

FPS = [
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal',
     'J1', 'BUS', 128.93, 173.42, 270, J1_MAP),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal',
     'J2', 'GATES OUT', 106.07, 106.58, 90, J2_MAP),
    ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
     'U1', '74HCT595', 110.5, 150, 0, U1_MAP),
    ('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
     'U2', 'AMS1117-5.0', 126, 163, 0, U2_MAP),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 133.3, 171, 90, rc('+12V', 'GND')),
    ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 109.5, 160, 180, rc('+5V', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '100n', 109.5, 164.6, 180, rc('+5V', 'GND')),
]
for k in range(8):
    FPS.append(('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
                'Resistor_SMD:R_0805_2012Metric', f'R{k+1}', '1k',
                108.61 + 2.54 * k, 112, 90,
                rc(NETS[15 + k], f'/GATE{k+1}')))

_u = [0]
def uid():
    _u[0] += 1
    return f'e0000000-0000-4000-8000-{_u[0]:012d}'

fp_texts = []
for f, lib, ref, val, x, y, rot, netmap in FPS:
    tree = load_footprint(f, lib, ref, val, x, y, rot, 'x', netmap, uid())
    for node in tree:
        if isinstance(node, list) and node[0] == 'path':
            node[1] = f'"/{sym_uuid.get(ref, "")}"'
    fp_texts.append(serialize(tree, 1))

P = PADS
print('J1.1', P['J1']['1'], 'J1.2', P['J1']['2'], 'J1.19', P['J1']['19'], 'J1.20', P['J1']['20'])
print('J2.1', P['J2']['1'], 'J2.10', P['J2']['10'])
print('U1.1', P['U1']['1'], 'U1.8', P['U1']['8'], 'U1.9', P['U1']['9'], 'U1.16', P['U1']['16'])
print('U2 pads', P['U2'])
print('C1', P['C1'], 'C2', P['C2'], 'C3', P['C3'])
print('R1', P['R1'], 'R8', P['R8'])

# sanity asserts (fail loudly if lib geometry differs from plan)
assert P['J1']['1'] == (128.93, 173.42) and P['J1']['2'] == (128.93, 175.96), P['J1']
assert P['J1']['19'] == (106.07, 173.42), P['J1']['19']
assert P['J2']['1'] == (106.07, 106.58) and P['J2']['10'] == (128.93, 106.58), P['J2']
assert P['U1']['1'] == (108.025, 145.555), P['U1']['1']
assert P['U1']['11'] == (112.975, 151.905), P['U1']['11']
assert abs(P['R1']['1'][1] - 112.9125) < 0.01 and abs(P['R1']['2'][1] - 111.0875) < 0.01, P['R1']

# ---------- tracks & vias ----------
tracks = []
vias = []
def T(net, layer, w, *pts):
    tracks.append((NI[net], layer, w, pts))
def V(net, x, y):
    vias.append((NI[net], x, y))

PW = 0.5
SW = 0.25

u2p = P['U2']
p_in = u2p['3']          # +12V in
p_gndU2 = u2p['1']
# tab: pad '2' occurs twice; PADS keeps the last -> check which is which
p_out_pin = u2p['2']     # laatste pad '2' in file (pin of tab)

# SPI-trio van J1 naar U1-oostkolom
x7 = P['J1']['7'][0];  y_odd = 173.42
x9 = P['J1']['9'][0]
x13 = P['J1']['13'][0]
# SCLK: oost -> B-hop over MOSI-kolom -> F-verticaal x=117.9 -> pin 11
T('/SCLK', 'F.Cu', SW, (x7, y_odd), (x7, 172.15), (120.3, 172.15))
V('/SCLK', 120.3, 172.15)
T('/SCLK', 'B.Cu', SW, (120.3, 172.15), (117.9, 172.15))
V('/SCLK', 117.9, 172.15)
T('/SCLK', 'F.Cu', SW, (117.9, 172.15), (117.9, 151.905), P['U1']['11'])
# MOSI: eigen kolom -> verticaal x=119.5 -> pin 14
T('/MOSI', 'F.Cu', SW, (x9, y_odd), (x9, 171.4), (119.5, 171.4), (119.5, 148.095), P['U1']['14'])
# CS: west -> B-hop onder SCLK-verticaal -> x=118.7 -> pin 12
T('/CS', 'F.Cu', SW, (x13, y_odd), (x13, 170.6), (116.5, 170.6))
V('/CS', 116.5, 170.6)
T('/CS', 'B.Cu', SW, (116.5, 170.6), (118.7, 170.6))
V('/CS', 118.7, 170.6)
T('/CS', 'F.Cu', SW, (118.7, 170.6), (118.7, 150.635), P['U1']['12'])

# Q-netten QB..QH: westkolom -> via -> B oost -> B noord -> via -> R pad1
for k in range(1, 8):           # pins 1..7 = QB..QH
    net = NETS[16 + k - 1]      # QB=16
    pe = P['U1'][str(k)]
    xt = 111.15 + 2.54 * (k - 1)
    T(net, 'F.Cu', SW, pe, (106.6, pe[1]))
    V(net, 106.6, pe[1])
    T(net, 'B.Cu', SW, (106.6, pe[1]), (xt, pe[1]), (xt, 113.9))
    V(net, xt, 113.9)
    T(net, 'F.Cu', SW, (xt, 113.9), P[f'R{k+1}']['1'])
# QA: pin 15 oost -> via -> B noord + west om de Q-wal heen -> R1 pad1
pa = P['U1']['15']
T('Net-(U1-QA)', 'F.Cu', SW, pa, (114.8, pa[1]))
V('Net-(U1-QA)', 114.8, pa[1])
T('Net-(U1-QA)', 'B.Cu', SW, (114.8, pa[1]), (114.8, 113.25), (108.61, 113.25), (108.61, 113.9))
V('Net-(U1-QA)', 108.61, 113.9)
T('Net-(U1-QA)', 'F.Cu', SW, (108.61, 113.9), P['R1']['1'])

# GATE-netten: R pad2 recht omhoog naar J2
for k in range(8):
    xr = P[f'R{k+1}']['2'][0]
    T(f'/GATE{k+1}', 'F.Cu', SW, P[f'R{k+1}']['2'], (xr, 106.58))

# U2-geometrie: pinnen 1/2/3 in westkolom (160.7/163/165.3), tab oost (129.15,163)
p_pin2 = u2p['2']            # (122.85, 163.0)
p_tab = u2p['2b']            # (129.15, 163.0)
assert p_tab[0] > p_pin2[0], u2p

# +12V: J1.2 -> oost -> noord -> west onder U2 langs -> pin 3 van onderen in
p2 = P['J1']['2']
T('+12V', 'F.Cu', PW, p2, (131.8, p2[1]), (131.8, 169.3), (p_in[0], 169.3), p_in)
T('+12V', 'F.Cu', SW, (131.8, P['C1']['1'][1]), P['C1']['1'])

# +5V: pin2 <-> tab, tab -> via -> B west y=157.5 -> pin16 (noordom) + pin10
T('+5V', 'F.Cu', PW, p_pin2, p_tab)
T('+5V', 'F.Cu', PW, p_tab, (p_tab[0], 157.5))
V('+5V', p_tab[0], 157.5)
T('+5V', 'B.Cu', PW, (p_tab[0], 157.5), (114.9, 157.5), (105.2, 157.5), (105.2, 144.2))
V('+5V', 105.2, 144.2)
T('+5V', 'F.Cu', SW, (105.2, 144.2), (112.975, 144.2), P['U1']['16'])
# aftak pin 10 (~SRCLR hoog): via op de B-run, F omhoog en pad in
V('+5V', 114.9, 157.5)
T('+5V', 'F.Cu', SW, (114.9, 157.5), (114.9, 153.175), P['U1']['10'])
# C2/C3 westelijk van de SPI-corridor, gevoed via een via op de +5V B-run
V('+5V', 111.3, 157.5)
T('+5V', 'F.Cu', PW, (111.3, 157.5), P['C2']['1'])
T('+5V', 'F.Cu', SW, P['C2']['1'], (P['C2']['1'][0], 164.6), P['C3']['1'])

# C1 GND-pad zit klem tegen de bordrand: eigen strap naar een GND-via
T('GND', 'F.Cu', SW, P['C1']['2'], (133.3, 168.3))
V('GND', 133.3, 168.3)

# GND stitching
for x, y in ((102, 102), (133, 102), (102, 178), (133, 178), (102, 140),
             (102, 168), (117, 102.5), (130.5, 150), (120, 120), (110, 170),
             (103, 120), (131, 155)):
    V('GND', x, y)

# ---------- board ----------
BX0, BY0, BX1, BY1 = 100, 100, 135, 180

header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (title_block
    (title "MusicBrain GATE8 - 8x gate out slot card")
    (date "2026-07-08")
    (rev "1.1")
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

track_txt = []
for net, layer, w, pts in tracks:
    for a, b in zip(pts, pts[1:]):
        if a == b:
            continue
        track_txt.append(f'  (segment (start {fmt(a[0])} {fmt(a[1])}) (end {fmt(b[0])} {fmt(b[1])}) '
                         f'(width {w}) (layer "{layer}") (net {net}) (uuid "{uid()}"))')
for net, x, y in vias:
    track_txt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                     f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{uid()}"))')

edge = f'''
  (gr_rect (start {BX0} {BY0}) (end {BX1} {BY1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "musicbrain.nl/hw/gate8 rev 1.1" (at 117.5 132 90) (layer "F.SilkS")
    (uuid "{uid()}")
    (effects (font (size 1 1) (thickness 0.15))))
'''

def zone(layer):
    return f'''
  (zone (net {NI['GND']}) (net_name "GND") (layer "{layer}")
    (uuid "{uid()}")
    (hatch edge 0.5)
    (connect_pads (clearance 0.5))
    (min_thickness 0.25) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts
      (xy {BX0+0.5} {BY0+0.5}) (xy {BX1-0.5} {BY0+0.5})
      (xy {BX1-0.5} {BY1-0.5}) (xy {BX0+0.5} {BY1-0.5})
    ))
  )'''

out = (header + nets_block + '\n' + '\n'.join(fp_texts) + '\n'
       + '\n'.join(track_txt) + edge + zone('F.Cu') + zone('B.Cu') + '\n)\n')
open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('written', OUT)
