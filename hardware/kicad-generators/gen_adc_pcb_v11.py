"""Generate musicbrain-adc8.kicad_pcb v1.2 - H=80, haakse connectoren, volledig geroute.

Kaartmodel: x = B-richting (40mm: 100..140), y = H (80mm: 100..180).
J1 haaks 2x10 onder (rot 270), J2 haaks 1x10 boven (rot 90), zelfde midden x=120.

Routing-strategie:
- V-omkering (V1 oost..V8 west -> IN1 west..IN8 oost): Manhattan - F.Cu enkel
  verticalen (escape onder chip-pad, drop boven R-pad1), B.Cu horizontale lanes
  y 118.4..124.0 (0.8 steek). Bijna-collineaire escape/drop-paren ontvlochten
  door lane-volgorde: y4<y6<y1, y5<y3<y8.
- Westkolom-entries (RANGE/CONVST/RESET/SCLK/CS/BUSY): F-verticalen west van de
  chip, regel 'diepste entry -> oostelijkste verticaal' (kruisingsvrij).
- Zuidaanvoer van J1 via B-lanes y 169.4..171.4 (SCLK/CS/BUSY/RESET).
"""
import re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-adc8\musicbrain-adc8.kicad_pcb"
SCH_FILE = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-adc8\musicbrain-adc8.kicad_sch"

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

PADS = {}

_u = [0]
def uid():
    _u[0] += 1
    return f'a1100000-0000-4000-8000-{_u[0]:012d}'

def load_footprint(relpath, lib_id, ref, value, x, y, rot, netmap):
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
    at = ['at', fmt(x), fmt(y), str(rot)] if rot else ['at', fmt(x), fmt(y)]
    tree[2:] = [['uuid', f'"{uid()}"'], at, ['path', '"/PATH"']] + body
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
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal',
     'J1', 'BUS', 131.43, 173.42, 270, J1_MAP),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal',
     'J2', 'CV IN', 108.57, 106.58, 90, J2_MAP),
    ('Package_QFP.pretty\\LQFP-64_10x10mm_P0.5mm.kicad_mod',
     'Package_QFP:LQFP-64_10x10mm_P0.5mm',
     'U1', 'AD7606BSTZ', 120, 135, 0, U1_MAP),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x03_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical',
     'JP1', 'RANGE', 104.5, 160, 0, JP1_MAP),
    ('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
     'U2', 'AMS1117-5.0', 133, 160, 0, U2_MAP),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R9', '100k', 105.4, 172.5, 90,
     rc('/RESET', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 135.2, 168, 90, rc('+12V', 'GND')),
    ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 134, 148, 180, rc('+5V', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '100n', 114.25, 127.9, 90, rc('+5V', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C4', '100n', 129.5, 129.4, 90, rc('+5V', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C5', '100n', 129.1, 144.5, 0, rc('+3V3', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C6', '1u', 130.4, 137.25, 0,
     rc('Net-(U1-REGCAP1)', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C7', '1u', 134.3, 135.75, 0,
     rc('Net-(U1-REGCAP2)', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C8', '10u', 130.4, 134.25, 0,
     rc('Net-(U1-REFIN{slash}REFOUT)', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C9', '10u', 134.3, 133.0, 0,
     rc('Net-(U1-REFCAPA)', 'GND')),
]
for k in range(8):
    FPS.append(('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
                'Resistor_SMD:R_0805_2012Metric', f'R{k+1}', '1k',
                111.11 + 2.54 * (7 - k), 111.8, 90,
                rc(f'Net-(U1-V{k+1})', f'/IN{8-k}')))

fp_texts = []
for f, lib, ref, val, x, y, rot, netmap in FPS:
    tree = load_footprint(f, lib, ref, val, x, y, rot, netmap)
    txt = serialize(tree, 1).replace('"/PATH"', f'"/{sym_uuid.get(ref, "")}"')
    fp_texts.append(txt)

P = PADS
print('J1.1', P['J1']['1'], 'J1.2', P['J1']['2'], 'J1.19', P['J1']['19'], 'J1.20', P['J1']['20'])
print('J2.1', P['J2']['1'], 'J2.10', P['J2']['10'])
print('U1.1', P['U1']['1'], 'U1.8', P['U1']['8'], 'U1.14', P['U1']['14'])
print('U1.17', P['U1']['17'], 'U1.23', P['U1']['23'], 'U1.24', P['U1']['24'])
print('U1.33', P['U1']['33'], 'U1.34', P['U1']['34'], 'U1.48', P['U1']['48'])
print('U1.49', P['U1']['49'], 'U1.63', P['U1']['63'], 'U1.64', P['U1']['64'])
print('U2', P['U2'])
print('JP1', P['JP1'])
print('R1', P['R1'], 'R9', P['R9'])
print('C-pads', {c: P[c] for c in ('C1','C2','C3','C4','C5','C6','C7','C8','C9')})

# verwachte geometrie (falen = plan herzien)
assert P['J1']['1'] == (131.43, 173.42) and P['J1']['20'] == (108.57, 175.96), P['J1']
assert P['J2']['1'] == (108.57, 106.58) and P['J2']['10'] == (131.43, 106.58), P['J2']

# ---------- routing ----------
tracks, vias = [], []
def T(net, layer, w, *pts):
    tracks.append((NI[net], layer, w, pts))
def V(net, x, y):
    vias.append((NI[net], x, y))
SW = 0.25
PW = 0.5

XW = P['U1']['1'][0]           # westkolom x (verwacht ~114.25)
XE = P['U1']['33'][0]          # oostkolom x (~125.75)
YN = P['U1']['49'][1]          # noordrij y (~129.25)
YS = P['U1']['17'][1]          # zuidrij y (~140.75)

def urow(pin):                 # y van west/oost-kolompin
    return P['U1'][str(pin)][1]
def ucol(pin):                 # x van noord/zuid-rijpin
    return P['U1'][str(pin)][0]

# --- v1.2 recht-toe: ordebehoudende F-waaier (geen B-lanes/vias) ---
JOG = {1: 120.3, 2: 119.6, 3: 118.9, 4: 118.2, 5: 118.2, 6: 118.9, 7: 119.6, 8: 120.3}
for k in range(1, 9):
    xs = ucol(48 + 2 * k - 1)                 # chip-pin x (V_k)
    xt = P[f'R{k}']['1'][0]                   # doelkolom (= IN(9-k))
    yj = JOG[k]
    T(f'Net-(U1-V{k})', 'F.Cu', SW, (xs, YN), (xs, yj), (xt, yj), P[f'R{k}']['1'])
# IN-stubs: R pad2 recht omhoog naar J2
for k in range(1, 9):
    xt = P[f'R{k}']['2'][0]
    T(f'/IN{k}', 'F.Cu', SW, P[f'R{k}']['2'], (xt, 106.58))

# --- westkolom-entries (diepste entry -> oostelijkste verticaal) ---
XV = {'BUSY': 112.9, 'CS': 112.3, 'SCLK': 111.7, 'RESET': 111.1,
      'CONVST': 110.5, 'RANGE': 109.9}
# entries het pad in (oostwaarts tot pad-centrum)
T('/RANGE',  'F.Cu', SW, (XV['RANGE'], urow(8)),  P['U1']['8'])
T('/CONVST', 'F.Cu', SW, (XV['CONVST'], urow(9)), P['U1']['9'])
T('/CONVST', 'F.Cu', SW, (XV['CONVST'], urow(10)), P['U1']['10'])
T('/RESET',  'F.Cu', SW, (XV['RESET'], urow(11)), P['U1']['11'])
T('/SCLK',   'F.Cu', SW, (XV['SCLK'], urow(12)),  P['U1']['12'])
T('/CS',     'F.Cu', SW, (XV['CS'], urow(13)),    P['U1']['13'])
T('/IRQ',    'F.Cu', SW, (XV['BUSY'], urow(14)),  P['U1']['14'])
# verticalen (van entry-rij naar zuid)
T('/RANGE',  'F.Cu', SW, (XV['RANGE'], urow(8)),  (XV['RANGE'], 162.54))
T('/CONVST', 'F.Cu', SW, (XV['CONVST'], urow(9)), (XV['CONVST'], 172.0))
T('/RESET',  'F.Cu', SW, (XV['RESET'], urow(11)), (XV['RESET'], 171.4))
T('/SCLK',   'F.Cu', SW, (XV['SCLK'], urow(12)),  (XV['SCLK'], 170.9))
T('/CS',     'F.Cu', SW, (XV['CS'], urow(13)),    (XV['CS'], 170.2))
T('/IRQ',    'F.Cu', SW, (XV['BUSY'], urow(14)),  (XV['BUSY'], 169.4))

# --- zuidaanvoer vanaf J1 ---
# RANGE komt van JP1.2 (niet van J1)
T('/RANGE', 'F.Cu', SW, P['JP1']['2'], (XV['RANGE'], P['JP1']['2'][1]),
  (XV['RANGE'], 162.54))
# CONVST: J1.19 (westelijkste oneven pin) -> band 172.0 -> verticaal
T('/CONVST', 'F.Cu', SW, P['J1']['19'], (108.57, 172.0), (XV['CONVST'], 172.0))
# RESET: J1.20 (even) -> weststub -> F-noord -> via -> B-lane -> via -> verticaal
T('/RESET', 'F.Cu', SW, P['J1']['20'], (106.9, 175.96), (106.9, 171.4))
V('/RESET', 106.9, 171.4)
T('/RESET', 'B.Cu', SW, (106.9, 171.4), (XV['RESET'], 171.4))
V('/RESET', XV['RESET'], 171.4)
# R9 (100k pulldown) hangt aan het F-noordbeen
T('/RESET', 'F.Cu', SW, (106.9, P['R9']['1'][1]), P['R9']['1'])
# SCLK: J1.7 -> via -> B-lane 170.9 -> via -> verticaal
T('/SCLK', 'F.Cu', SW, P['J1']['7'], (P['J1']['7'][0], 170.9))
V('/SCLK', P['J1']['7'][0], 170.9)
T('/SCLK', 'B.Cu', SW, (P['J1']['7'][0], 170.9), (XV['SCLK'], 170.9))
V('/SCLK', XV['SCLK'], 170.9)
# CS: J1.13 -> via -> B-lane 170.2 -> via -> verticaal
T('/CS', 'F.Cu', SW, P['J1']['13'], (P['J1']['13'][0], 170.2))
V('/CS', P['J1']['13'][0], 170.2)
T('/CS', 'B.Cu', SW, (P['J1']['13'][0], 170.2), (XV['CS'], 170.2))
V('/CS', XV['CS'], 170.2)
# IRQ/BUSY: J1.16 (even) -> oostjog -> F-noord -> via -> B-lane 169.4 -> verticaal
T('/IRQ', 'F.Cu', SW, P['J1']['16'], (114.92, 175.96), (114.92, 169.4))
V('/IRQ', 114.92, 169.4)
T('/IRQ', 'B.Cu', SW, (114.92, 169.4), (XV['BUSY'], 169.4))
V('/IRQ', XV['BUSY'], 169.4)

# --- MISO: pin24 (zuidrij) -> oostjog -> F-verticaal x=120.9 -> J1.11 ---
x24 = ucol(24)
T('/MISO', 'F.Cu', SW, P['U1']['24'], (x24, 141.85), (120.9, 141.85),
  (120.9, 171.9), (P['J1']['11'][0], 171.9), P['J1']['11'])

# --- +3V3: J1.6 -> oostjog -> F-verticaal x=127.62 met aftakken ---
T('+3V3', 'F.Cu', SW, P['J1']['6'], (127.62, 175.96), (127.62, urow(34)))
T('+3V3', 'F.Cu', SW, (127.62, urow(34)), P['U1']['34'])            # REF_SELECT
T('+3V3', 'F.Cu', SW, (127.62, 144.5), P['C5']['1'])                # C5
# VDRIVE pin23: rij y=142.6 met B-hop over de MISO-verticaal
x23 = ucol(23)
T('+3V3', 'F.Cu', SW, (127.62, 142.6), (122.0, 142.6))
V('+3V3', 122.0, 142.6)
T('+3V3', 'B.Cu', SW, (122.0, 142.6), (120.2, 142.6))
V('+3V3', 120.2, 142.6)
T('+3V3', 'F.Cu', SW, (120.2, 142.6), (x23, 142.6), P['U1']['23'])
# JP1 pin 1: B-run y=160 rechtstreeks het THT-pad in
V('+3V3', 127.62, 160)
T('+3V3', 'B.Cu', SW, (127.62, 160), P['JP1']['1'])

# --- +12V: J1.2 -> oost -> U2 pin3; C1-aftak ---
T('+12V', 'F.Cu', PW, P['J1']['2'], (133.5, 175.96), (133.5, P['U2']['3'][1]),
  P['U2']['3'])
T('+12V', 'F.Cu', SW, (133.5, P['C1']['1'][1]), P['C1']['1'])

# --- +5V: U2 -> trunk oost -> pin48+pin1-rij; B-hop naar 37/38; C2/C3/C4 ---
p_tab = P['U2']['2b']; p_pin2 = P['U2']['2']
assert p_tab[0] > p_pin2[0], P['U2']
T('+5V', 'F.Cu', PW, p_pin2, p_tab)
T('+5V', 'F.Cu', PW, p_tab, (136.15, 146), (137.8, 146), (137.8, 130.5),
  (126.9, 130.5), (126.2, 130.5), (126.2, 131.1))
T('+5V', 'F.Cu', SW, (136.15, P['C2']['1'][1]), P['C2']['1'])       # C2 elco
# pin48 -> pin1: rij op y=131.1 (binnen de padhoogte, vrij van GND-buren 47/2)
T('+5V', 'F.Cu', SW, (126.2, 131.1), (XW, 131.1))
# C3 bij AVCC pin1
T('+5V', 'F.Cu', SW, (XW, 131.1), (XW, P['C3']['1'][1]), P['C3']['1'])
# C4 op de westrun
T('+5V', 'F.Cu', SW, (P['C4']['1'][0], 130.5), P['C4']['1'])
# pins 37/38 via B-hop op y=136.5
V('+5V', 137.8, 136.5)
T('+5V', 'B.Cu', SW, (137.8, 136.5), (127.4, 136.5))
V('+5V', 127.4, 136.5)
T('+5V', 'F.Cu', SW, (127.4, urow(38)), (127.4, urow(37)))
T('+5V', 'F.Cu', SW, (127.4, urow(37)), P['U1']['37'])
T('+5V', 'F.Cu', SW, (127.4, urow(38)), P['U1']['38'])

# --- steuncondensatoren oost ---
T('Net-(U1-REGCAP1)', 'F.Cu', SW, P['U1']['36'], (P['C6']['1'][0], urow(36)))
T('Net-(U1-REGCAP2)', 'F.Cu', SW, P['U1']['39'], (P['C7']['1'][0], urow(39)))
T('Net-(U1-REFIN{slash}REFOUT)', 'F.Cu', SW, P['U1']['42'],
  (P['C8']['1'][0], urow(42)))
T('Net-(U1-REFCAPA)', 'F.Cu', SW, P['U1']['44'], (126.9, urow(44)))
T('Net-(U1-REFCAPA)', 'F.Cu', SW, P['U1']['45'], (126.9, urow(45)))
T('Net-(U1-REFCAPA)', 'F.Cu', SW, (126.9, urow(45)), (126.9, urow(44)))
T('Net-(U1-REFCAPA)', 'F.Cu', SW, (126.9, 133.0), (P['C9']['1'][0], 133.0))

# --- +3V3 naar OS-pinnen 6/7 (westkolom): via op de B-run, F-verticaal x=109.3 ---
V('+3V3', 109.3, 160)
T('+3V3', 'F.Cu', SW, (109.3, 160), (109.3, urow(6)))
T('+3V3', 'F.Cu', SW, (109.3, urow(6)), P['U1']['6'])
T('+3V3', 'F.Cu', SW, (109.3, urow(7)), P['U1']['7'])

# --- GND-verzamelrail voor de noordrij-pads (zone kan niet tussen escapes vullen) ---
for pin in range(50, 65, 2):
    xg = ucol(pin)
    T('GND', 'F.Cu', SW, P['U1'][str(pin)], (xg, 130.5))
T('GND', 'F.Cu', SW, (115.5, 130.5), (124.6, 130.5))
V('GND', 115.5, 130.5)
V('GND', 124.6, 130.5)
# oostkolom-GND-reddingen (pads tussen de C-rijen)
T('GND', 'F.Cu', SW, P['U1']['40'], (126.5, urow(40)))
T('GND', 'F.Cu', SW, P['U1']['41'], (126.5, urow(41)))
T('GND', 'F.Cu', SW, (126.5, urow(41)), (126.5, urow(40)))
T('GND', 'F.Cu', SW, (126.5, 135.0), (127.9, 135.0))
V('GND', 127.9, 135.0)
T('GND', 'F.Cu', SW, P['U1']['46'], (126.5, urow(46)))
T('GND', 'F.Cu', SW, P['U1']['47'], (126.5, urow(47)))
T('GND', 'F.Cu', SW, (126.5, urow(47)), (126.5, urow(46)))
T('GND', 'F.Cu', SW, (126.5, 132.0), (127.9, 132.0))
V('GND', 127.9, 132.0)
T('GND', 'F.Cu', SW, P['U1']['43'], (128.4, urow(43)), (128.4, 133.625))
V('GND', 128.4, 133.625)
T('GND', 'F.Cu', SW, P['U1']['35'], (128.3, urow(35)), (128.3, 138.05))
V('GND', 128.3, 138.05)

# --- GND stitching ---
for x, y in ((102, 102), (138, 102), (102, 178), (138, 178), (102, 130),
             (139, 126), (120, 103), (107, 145), (138.6, 152), (105, 120),
             (107, 131), (133, 124), (120, 155), (110, 178), (102, 152)):
    V('GND', x, y)

BX0, BY0, BX1, BY1 = 100, 100, 140, 180

header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (title_block
    (title "MusicBrain ADC8 - 8x CV input slot card")
    (date "2026-07-08")
    (rev "1.2")
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
        if tuple(a) == tuple(b):
            continue
        track_txt.append(f'  (segment (start {fmt(a[0])} {fmt(a[1])}) (end {fmt(b[0])} {fmt(b[1])}) '
                         f'(width {w}) (layer "{layer}") (net {net}) (uuid "{uid()}"))')
for net, x, y in vias:
    track_txt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                     f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{uid()}"))')

extras = f'''
  (gr_rect (start {BX0} {BY0}) (end {BX1} {BY1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "musicbrain.nl/hw/adc8 rev 1.2" (at 102.5 140 90) (layer "F.SilkS")
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

out = (header + nets_block + '\n' + '\n'.join(fp_texts) + '\n'
       + '\n'.join(track_txt) + extras + zone('F.Cu') + zone('B.Cu') + '\n)\n')
open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('written', OUT, f'({len(track_txt)} routed items)')
