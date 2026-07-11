"""Generate musicbrain-busboard.kicad_pcb â€” placed backplane with custom Teensy 4.1 footprint."""
import re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard\musicbrain-busboard.kicad_pcb"
SCH_FILE = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard\musicbrain-busboard.kicad_sch"

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
    return f'c1000000-0000-4000-8000-{_u[0]:012d}'

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

# ---------- nets ----------
NETS = (['', '+3V3', '+5V', '+12V', '-12V', 'GND',
         '/SCLK', '/MOSI', '/MISO', '/LDAC', '/SDA', '/SCL', '/SPARE1', '/SPARE2',
         'Net-(U1-11{slash}MOSI)', 'Net-(U1-13{slash}SCK)']
        + [f'/CS{i}' for i in range(1, 9)] + [f'/IRQ{i}' for i in range(1, 7)]
        + ['/D14', '/D15', '/D16', '/D17', '/D20', '/D21', '/D22', '/D23',
           '/DISP_CS', '/DISP_RST', '/DISP_DC', '/MOSI1', '/SCK1'])
NI = {n: i for i, n in enumerate(NETS)}
def nm(m): return {p: (NI[n], n) for p, n in m.items()}

TEENSY_MAP = {'1': 'GND', '4': '/LDAC', '5': '/CS8', '6': '/CS7', '7': '/CS6',
              '8': '/CS5', '9': '/CS4', '10': '/CS3', '11': '/CS2', '12': '/CS1',
              '13': 'Net-(U1-11{slash}MOSI)', '14': '/MISO',
              '20': '/IRQ1', '21': '/IRQ2', '22': '/IRQ3', '23': '/IRQ4',
              '24': '/IRQ5', '25': '/IRQ6', '32': '/SPARE1', '33': '/SPARE2',
              '34': 'GND', '35': 'Net-(U1-13{slash}SCK)', '40': '/SDA',
              '41': '/SCL', '47': 'GND', '48': '+5V',
              # v1.1: display (SPI1) + EXP
              '2': '/DISP_CS', '16': '/DISP_DC', '17': '/DISP_RST',
              '18': '/MOSI1', '19': '/SCK1',
              '36': '/D14', '37': '/D15', '38': '/D16', '39': '/D17',
              '42': '/D20', '43': '/D21', '44': '/D22', '45': '/D23'}
TEENSY_MAP = nm(TEENSY_MAP)
J10_MAP = nm({'1': '+3V3', '2': 'GND', '3': '+5V', '4': 'GND',
              '5': '/D15', '6': '/D14', '7': '/D17', '8': '/D16',
              '9': '/D21', '10': '/D20', '11': 'GND', '12': '/D22',
              '13': '/D23', '14': 'GND'})
J11_MAP = nm({'1': '+3V3', '2': 'GND', '3': '/DISP_CS', '4': '/DISP_RST',
              '5': '/DISP_DC', '6': '/MOSI1', '7': '/SCK1', '8': '+3V3'})
J12_MAP = nm({'1': 'GND', '2': '+3V3', '3': '/SDA', '4': '/SCL'})

def slot_map(i):
    return nm({'1': 'GND', '2': '+12V', '3': 'GND', '4': '-12V', '5': 'GND',
               '6': '+3V3', '7': '/SCLK', '8': 'GND', '9': '/MOSI', '10': 'GND',
               '11': '/MISO', '12': 'GND', '13': f'/CS{i}', '14': 'GND',
               '15': '/LDAC', '16': f'/IRQ{i}', '17': '/SDA', '18': '/SCL',
               '19': '/SPARE1', '20': '/SPARE2'})

def hub_map(cs):
    return nm({'1': 'GND', '2': cs, '3': '/MISO', '4': '/MOSI', '5': '/SCLK',
               '6': 'GND', '7': '+3V3', '8': 'GND', '9': '-12V', '10': '+12V'})

J9_MAP = nm({'1': '-12V', '2': '-12V', '3': 'GND', '4': 'GND', '5': 'GND',
             '6': 'GND', '7': 'GND', '8': 'GND', '9': '+12V', '10': '+12V'})
U2_MAP = nm({'1': '+12V', '2': 'GND', '3': '+5V'})
U3_MAP = nm({'1': 'GND', '2': '+3V3', '3': '+5V'})
def rc(a, b): return nm({'1': a, '2': b})

# sch uuids by reference
sch_txt = open(SCH_FILE, encoding='utf-8').read()
sym_uuid = {}
for m in re.finditer(r'\(uuid "([0-9a-f-]+)"\)\s*\n\s*\(property "Reference" "([A-Z][A-Z0-9]*)"', sch_txt):
    sym_uuid[m.group(2)] = m.group(1)

# ---------- custom Teensy 4.1 footprint ----------
def teensy_fp(x0, y0, netmap, path_uuid):
    pads = []
    for n in range(1, 25):        # left col, top->bottom
        px, py = 0.0, 2.54 * (n - 1)
        pads.append((n, px, py))
    for n in range(25, 49):       # right col, bottom->top
        px, py = 15.24, 2.54 * (48 - n)
        pads.append((n, px, py))
    pad_txt = []
    for n, px, py in pads:
        shape = 'rect' if n == 1 else 'oval'
        net = ''
        if str(n) in netmap:
            idx, name = netmap[str(n)]
            net = f' (net {idx} "{name}")'
        pad_txt.append(f'    (pad "{n}" thru_hole {shape} (at {fmt(px)} {fmt(py)}) '
                       f'(size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask"){net})')
    return f'''  (footprint "MusicBrain:Teensy41_THT"
    (layer "F.Cu")
    (uuid "{uid()}")
    (at {fmt(x0)} {fmt(y0)})
    (path "/{path_uuid}")
    (descr "Teensy 4.1 on two 1x24 socket strips, 0.6in row spacing")
    (property "Reference" "U1" (at 7.62 -2.8 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "Teensy 4.1" (at 7.62 61.2 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -1.27 -1.6) (end 16.51 60.02)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -2.5 -2.5) (end 17.74 61.02)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (fp_text user "USB" (at 7.62 0 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
{chr(10).join(pad_txt)}
  )'''

# ---------- footprints ----------
FPS = [
    ('Connector_IDC.pretty\\IDC-Header_2x05_P2.54mm_Vertical.kicad_mod',
     'Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical', 'J9', 'PWR IN', 22, 108, J9_MAP, 0),
    ('Converter_DCDC.pretty\\Converter_DCDC_RECOM_R-78E-0.5_THT.kicad_mod',
     'Converter_DCDC:Converter_DCDC_RECOM_R-78E-0.5_THT', 'U2', 'R-78E5.0-0.5', 62, 108, U2_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U3', 'AMS1117-3.3', 80, 104, U3_MAP, 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R1', '33R', 53, 73.02,
     rc('Net-(U1-13{slash}SCK)', '/SCLK'), 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R2', '33R', 49.5, 71.75,
     rc('/MOSI', 'Net-(U1-11{slash}MOSI)'), 180),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R3', '2k2', 92, 104, rc('+3V3', '/SDA'), 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R4', '2k2', 92, 107, rc('+3V3', '/SCL'), 0),
]
CAPS = [('C1', 'CP', '10u', 95, '+12V'), ('C2', 'C', '100n', 100.2, '+12V'),
        ('C3', 'CP', '10u', 107.4, None), ('C4', 'C', '100n', 112.6, None),
        ('C5', 'CP', '10u', 119.8, '+5V'), ('C6', 'C', '100n', 125, '+5V'),
        ('C7', 'CP', '10u', 132.2, '+3V3'), ('C8', 'C', '100n', 137.4, '+3V3')]
for ref, kind, val, cx, rail in CAPS:
    if kind == 'CP':
        f, lib = 'Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod', 'Capacitor_SMD:CP_Elec_4x5.3'
    else:
        f, lib = 'Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric'
    netmap = rc(rail, 'GND') if rail else rc('GND', '-12V')
    FPS.append((f, lib, ref, val, cx, 112, netmap, 0))
for i in range(1, 7):
    FPS.append(('Connector_PinSocket_2.54mm.pretty\\PinSocket_2x10_P2.54mm_Vertical.kicad_mod',
                'Connector_PinSocket_2.54mm:PinSocket_2x10_P2.54mm_Vertical',
                f'J{i}', f'SLOT {i}', 50 + 20 * i, 40, slot_map(i), 0))
for h, cs, hy in ((7, '/CS7', 42), (8, '/CS8', 104)):
    FPS.append(('Connector_IDC.pretty\\IDC-Header_2x05_P2.54mm_Vertical.kicad_mod',
                'Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical',
                f'J{h}', f'HUB {h-6}', 193, hy, hub_map(cs), 0))
# v1.1: EXP (noordwest), DISPLAY (noordstrook), QWIIC (zuid, tussen slot 5/6)
FPS.append(('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x07_P2.54mm_Vertical.kicad_mod',
            'Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical',
            'J10', 'EXP', 16.6, 27.5, J10_MAP, 90))
FPS.append(('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x09_P2.54mm_Vertical.kicad_mod',
            'Connector_PinHeader_2.54mm:PinHeader_1x09_P2.54mm_Vertical',
            'J11', 'DISPLAY', 33, 20, J11_MAP, 90))
FPS.append(('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x04_P2.54mm_Vertical.kicad_mod',
            'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical',
            'J12', 'QWIIC', 165.76, 121.5, J12_MAP, 90))
for hn, (hx, hy) in enumerate(((18, 13), (115, 13), (212, 13),
                               (60, 122), (140, 122)), start=1):
    FPS.append(('MountingHole.pretty\\MountingHole_3.2mm_M3.kicad_mod',
                'MountingHole:MountingHole_3.2mm_M3',
                f'H{hn}', 'M3', hx, hy, {}, 0))

fp_texts = [teensy_fp(30, 40, TEENSY_MAP, sym_uuid.get('U1', ''))]
for f, lib, ref, val, x, y, netmap, rot in FPS:
    tree = load_footprint(f, lib, ref, val, x, y, sym_uuid.get(ref, ''), netmap, rot)
    fp_texts.append(serialize(tree, 1))

BX0, BY0, BX1, BY1 = 15, 10, 215, 125

header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A3")
  (title_block
    (title "MusicBrain SPI-busboard")
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

extras = f'''
  (gr_rect (start {BX0} {BY0}) (end {BX1} {BY1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "musicbrain.nl/hw/busboard rev 1.1 - slots 1..6 + hubs + exp/display/qwiic" (at 110 119 0) (layer "F.SilkS")
    (uuid "{uid()}")
    (effects (font (size 1.5 1.5) (thickness 0.25))))
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
LANES = {
    '/LDAC':  (68.0, .25, 65.0, 179.5),
    '/MOSI':  (70.0, .25, 50.5, 201.8),
    '/MISO':  (71.75, .25, 51.5, 201.1),
    '/SCLK':  (73.6, .25, 56.0, 202.5),
    '/SDA':   (75.62, .25, 60.8, 178.0),
    '/SCL':   (76.89, .25, 62.2, 177.0),
    '/SPARE1': (78.16, .25, 55.0, 175.5),
    '/SPARE2': (79.43, .25, 53.5, 174.5),
    '+3V3':   (81.3, .5, 73.5, 203.7),
    '+12V':   (83.2, .8, 48.5, 205.1),
    '-12V':   (85.1, .8, 47.7, 204.4),
    '+5V':    (86.99, .4, 65.7, 116.0),
    '/CS1':   (88.0, .25, 58.0, 80.5),
    '/CS2':   (89.27, .25, 58.7, 100.5),
    '/CS3':   (90.54, .25, 59.4, 120.5),
    '/CS4':   (91.81, .25, 60.1, 140.5),
    '/CS5':   (93.08, .25, 61.5, 160.5),
    '/CS6':   (94.35, .25, 62.9, 180.5),
    '/CS7':   (95.62, .25, 63.6, 205.4),
    '/CS8':   (96.89, .25, 64.3, 200.4),
    '/IRQ1':  (98.16, .25, 52.5, 78.5),
    '/IRQ2':  (99.43, .25, 51.5, 98.5),
    '/IRQ3':  (100.7, .25, 50.5, 118.5),
    '/IRQ4':  (101.97, .25, 49.5, 138.5),
    '/IRQ6':  (103.24, .25, 48.5, 178.5),
    '/IRQ5':  (104.51, .25, 47.5, 158.5),
}
for _net, (_ly, _lw, _x1, _x2) in LANES.items():
    T(_net, 'B.Cu', _lw, (_x1, _ly), (_x2, _ly))

def lane_y(net):
    return LANES[net][0]

SLOT_TAPS = [
    (16.0, 0, 'e', '+12V', .4), (15.0, 1, 'e', '-12V', .4),
    (14.0, 2, 'e', '+3V3', .4), (13.0, 3, 'o', '/SCLK', SW),
    (12.0, 4, 'o', '/MOSI', SW), (11.0, 5, 'o', '/MISO', SW),
    (10.0, 6, 'o', 'CS', SW), (8.0, 7, 'e', 'IRQ', SW),
    (9.0, 7, 'o', '/LDAC', SW), (6.0, 8, 'e', '/SCL', SW),
    (7.0, 8, 'o', '/SDA', SW), (4.0, 9, 'e', '/SPARE2', SW),
    (5.0, 9, 'o', '/SPARE1', SW),
]
for i in range(1, 7):
    xs = 50 + 20 * i
    for off, row, col, net, w in SLOT_TAPS:
        if net == 'CS':
            net = f'/CS{i}'
        elif net == 'IRQ':
            net = f'/IRQ{i}'
        ry = 40 + 2.54 * row
        xch = xs + off
        ly = lane_y(net)
        if col == 'o':
            T(net, 'F.Cu', w, (xs, ry), (xch, ry), (xch, ly))
        else:
            ey = ry + 1.27
            T(net, 'F.Cu', w, (xs - 2.54, ry), (xs - 2.54, ey), (xch, ey), (xch, ly))
        V(net, xch, ly)

def fanv(net, pts, w=SW):
    T(net, 'F.Cu', w, *pts)
    V(net, pts[-1][0], pts[-1][1])

fanv('/LDAC', [(30, 47.62), (30, 48.89), (65.5, 48.89), (65.5, 68.0)])
CS_FAN = [('/CS8', 50.16, 64.8), ('/CS7', 52.7, 64.1), ('/CS6', 55.24, 63.4),
          ('/CS5', 57.78, 62.0), ('/CS4', 60.32, 60.6), ('/CS3', 62.86, 59.9),
          ('/CS2', 65.4, 59.2), ('/CS1', 67.94, 58.5)]
for net, py, fx in CS_FAN:
    fanv(net, [(30, py), (30, py + 1.27), (fx, py + 1.27), (fx, lane_y(net))])
T('Net-(U1-11{slash}MOSI)', 'F.Cu', SW, (30, 70.48), (30, 71.75), (48.5875, 71.75))
fanv('/MOSI', [(50.4125, 71.75), (51.3, 71.75), (51.3, 70.0)])
fanv('/MISO', [(30, 73.02), (30, 74.29), (57.8, 74.29), (57.8, 71.75)])
T('Net-(U1-13{slash}SCK)', 'F.Cu', SW, (45.24, 73.02), (52.0875, 73.02))
fanv('/SCLK', [(53.9125, 73.02), (56.5, 73.02), (56.5, 73.6)])
fanv('/SDA', [(45.24, 60.32), (61.3, 60.32), (61.3, 75.62)])
fanv('/SCL', [(45.24, 57.78), (62.7, 57.78), (62.7, 76.89)])
fanv('/SPARE1', [(45.24, 80.64), (55.5, 80.64), (55.5, 78.16)])
fanv('/SPARE2', [(45.24, 78.1), (54, 78.1), (54, 79.43)])
IRQ_FAN = [('/IRQ1', 88.26, 52.5), ('/IRQ2', 90.8, 51.5), ('/IRQ3', 93.34, 50.5),
           ('/IRQ4', 95.88, 49.5), ('/IRQ5', 98.42, 47.5)]
for net, py, fx in IRQ_FAN:
    fanv(net, [(30, py), (30, py + 1.27), (fx, py + 1.27), (fx, lane_y(net))])
fanv('/IRQ6', [(45.24, 98.42), (48.5, 98.42), (48.5, 103.24)])
fanv('+5V', [(45.24, 40), (66.2, 40), (66.2, 86.99)], .4)

J7_FAN = [('-12V', 53.43, 196.2, 'm', .4), ('+12V', 52.16, 197.0, 'o', .4),
          ('+3V3', 50.89, 198.0, 'm', .4), ('/SCLK', 48.35, 199.0, 'm', SW),
          ('/MISO', 45.81, 200.0, 'm', SW), ('/MOSI', 44.54, 201.0, 'o', SW),
          ('/CS7', 42.0, 205.4, 'o', SW)]
for net, ey, fx, kind, w in J7_FAN:
    if kind == 'o':
        T(net, 'F.Cu', w, (195.54, ey), (fx, ey), (fx, lane_y(net)))
    else:
        T(net, 'F.Cu', w, (193, ey - 1.27), (193, ey), (fx, ey), (fx, lane_y(net)))
    V(net, fx, lane_y(net))
J8_FAN = [('/CS8', 104.0, 200.4, 'o', SW), ('/MISO', 105.27, 201.1, 'm', SW),
          ('/MOSI', 106.54, 201.8, 'o', SW), ('/SCLK', 107.81, 202.5, 'm', SW),
          ('+3V3', 110.35, 203.2, 'm', .4), ('-12V', 112.89, 203.9, 'm', .4),
          ('+12V', 114.16, 204.6, 'o', .4)]
for net, ey, fx, kind, w in J8_FAN:
    if kind == 'o':
        T(net, 'F.Cu', w, (195.54, ey), (fx, ey), (fx, lane_y(net)))
    else:
        T(net, 'F.Cu', w, (193, ey + 1.27), (193, ey), (fx, ey), (fx, lane_y(net)))
    V(net, fx, lane_y(net))

T('+12V', 'F.Cu', .5, (22, 118.16), (27.3, 118.16), (27.3, 79.37))
T('+12V', 'F.Cu', .4, (27.3, 79.37), (49.5, 79.37))
V('+12V', 49.5, 79.37)
T('+12V', 'B.Cu', .4, (49.5, 79.37), (49.5, 83.2))
T('-12V', 'F.Cu', .5, (22, 108), (25.9, 108), (25.9, 84.45))
V('-12V', 25.9, 84.45)
T('-12V', 'B.Cu', .4, (25.9, 84.45), (47.7, 84.45), (47.7, 85.1))
T('+12V', 'F.Cu', .5, (27.3, 116.5), (62, 116.5), (62, 108.6))
T('+5V', 'F.Cu', .4, (67.08, 107.5), (67.08, 86.99))
V('+5V', 67.08, 86.99)
V('+5V', 74.7, 86.99)
T('+5V', 'F.Cu', .4, (74.7, 86.99), (74.7, 106.3), (75.85, 106.3))
V('+3V3', 73.5, 81.3)
T('+3V3', 'F.Cu', .4, (73.5, 81.3), (73.5, 108.5), (83.15, 108.5), (83.15, 105.9))
T('+3V3', 'F.Cu', .5, (76.85, 104), (82.15, 104))
V('+12V', 93.9, 83.2)
T('+12V', 'F.Cu', .4, (93.9, 83.2), (93.9, 111.5))
T('+12V', 'F.Cu', .4, (93.2, 112), (93.2, 114.2), (99.25, 114.2), (99.25, 112.5))
V('-12V', 108.5, 85.1)
T('-12V', 'F.Cu', .4, (108.5, 85.1), (108.5, 111.5))
T('-12V', 'F.Cu', .4, (109.2, 112), (109.2, 114.2), (113.55, 114.2), (113.55, 112.5))
V('+5V', 113.5, 86.99)
T('+5V', 'F.Cu', .4, (113.5, 86.99), (113.5, 109), (118, 109), (118, 111.5))
T('+5V', 'F.Cu', .4, (118, 112.5), (118, 114.2), (124.05, 114.2), (124.05, 112.5))
V('+3V3', 128, 81.3)
T('+3V3', 'F.Cu', .4, (128, 81.3), (128, 109), (130.4, 109), (130.4, 111.5))
T('+3V3', 'F.Cu', .4, (130.4, 112.5), (130.4, 114.2), (136.45, 114.2), (136.45, 112.5))
V('+3V3', 91.0875, 81.3)
T('+3V3', 'F.Cu', SW, (91.0875, 81.3), (91.0875, 107))
V('/SDA', 92.9125, 75.62)
T('/SDA', 'F.Cu', SW, (92.9125, 75.62), (92.9125, 104))
V('/SCL', 90.2, 76.89)
T('/SCL', 'F.Cu', SW, (90.2, 76.89), (90.2, 108.2), (92.9125, 108.2), (92.9125, 107.5))
# ===== v1.1: EXP (J10) - alles op B.Cu via tussenrij-lanes west van de Teensy =====
# (net, teensy-pad-y, B-rij-y, verticaal-x, doelkolom-x, top-rij?)
EXP_ROUTES = [
    ('/D14', 70.48, 69.21, 20.41, 21.68, True),
    ('/D15', 67.94, 66.67, 21.68, 21.68, False),
    ('/D16', 65.4, 64.13, 22.95, 24.22, True),
    ('/D17', 62.86, 61.59, 24.22, 24.22, False),
    ('/D20', 55.24, 53.97, 25.49, 26.76, True),
    ('/D21', 52.7, 51.43, 26.76, 26.76, False),
    ('/D22', 50.16, 48.89, 28.03, 29.3, True),
    ('/D23', 47.62, 46.35, 31.84, 31.84, False),   # kolom 7 (x=29.3 raakt Teensy-pads)
]
for net, py, ry, xv, col, top in EXP_ROUTES:
    if top:
        T(net, 'B.Cu', SW, (45.24, py), (44.3, ry), (xv, ry), (xv, 21.7),
          (col, 21.7), (col, 24.96))
    else:
        T(net, 'B.Cu', SW, (45.24, py), (44.3, ry), (xv, ry), (xv, 27.5))

# ===== v1.1: DISPLAY (J11) =====
# diepe pads (24/25/26/27): B-rij west -> via -> F-verticaal -> oostrun -> pad
DISP_ROUTES = [
    ('/DISP_RST', 80.64, 22.6, 30.6, 40.62),
    ('/DISP_DC', 78.1, 23.4, 31.4, 43.16),
    ('/MOSI1', 83.18, 24.2, 32.2, 45.7),
    ('/SCK1', 85.72, 25.0, 33.0, 48.24),
]
for net, py, xv, runy, col in DISP_ROUTES:
    T(net, 'B.Cu', SW, (30, py), (xv, py))
    V(net, xv, py)
    T(net, 'F.Cu', SW, (xv, py), (xv, runy), (col, runy), (col, 20))
# DISP_CS (pin 0): F-run oostom de Teensy (over de D23-verticaal heen),
# dan via -> B.Cu noordlangs naar J11.3
T('/DISP_CS', 'F.Cu', SW, (30, 42.54), (31, 41.27), (46.9, 41.27))
V('/DISP_CS', 46.9, 41.27)
T('/DISP_CS', 'B.Cu', SW, (46.9, 41.27), (46.9, 17.6), (38.08, 17.6), (38.08, 20))
# +3V3 voor VCC (J11.1): B-hop vanaf de J10-feed om GND-pad J10.2 heen
T('+3V3', 'F.Cu', .4, (16.6, 29.6), (17.87, 29.6))
V('+3V3', 17.87, 29.6)
T('+3V3', 'B.Cu', .4, (17.87, 29.6), (17.87, 18.4), (33, 18.4), (33, 20))
# LED (J11.8) vanaf VCC-pad over F noordlangs
T('+3V3', 'F.Cu', .4, (33, 20), (33, 18.6), (50.78, 18.6), (50.78, 20))

# ===== v1.1: J10-voeding =====
# +3V3: aftak bij U3 -> B-run y=105.8 -> F-verticaal x=16.6 -> J10 pad 1
T('+3V3', 'F.Cu', .4, (81.0, 104), (81.0, 105.3))
V('+3V3', 81.0, 105.3)
T('+3V3', 'B.Cu', .4, (81.0, 105.3), (81.0, 105.8), (16.6, 105.8))
V('+3V3', 16.6, 105.8)
T('+3V3', 'F.Cu', .4, (16.6, 105.8), (16.6, 27.5))
# +5V: lane-verlenging west -> via -> F-verticaal x=19.14 -> J10 pad 3
T('+5V', 'B.Cu', .4, (65.7, 86.99), (19.14, 86.99))
V('+5V', 19.14, 86.99)
T('+5V', 'F.Cu', .4, (19.14, 86.99), (19.14, 27.5))

# ===== v1.1: QWIIC (J12) - via's op de lanes tussen slot 5 en 6 =====
V('+3V3', 168.3, 81.3)
T('+3V3', 'F.Cu', SW, (168.3, 81.3), (168.3, 121.5))
V('/SDA', 170.84, 75.62)
T('/SDA', 'F.Cu', SW, (170.84, 75.62), (170.84, 121.5))
V('/SCL', 173.38, 76.89)
T('/SCL', 'F.Cu', SW, (173.38, 76.89), (173.38, 121.5))

for sx, sy in ((20, 20), (210, 20), (20, 122), (210, 122), (120, 36), (60, 36),
               (180, 36), (70, 122), (120, 122), (185, 122), (209, 80), (35, 103),
               (150, 122), (90, 20), (150, 20)):
    V('GND', sx, sy)

_tu = [0]
def tuid():
    _tu[0] += 1
    return f'c2000000-0000-4000-8000-{_tu[0]:012d}'

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






