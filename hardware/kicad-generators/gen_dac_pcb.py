"""Generate ad5754r-breakout.kicad_pcb from KiCad library footprints + verified netlist."""
import re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\hardware\schematics\ad5754r-breakout\ad5754r-breakout.kicad_pcb"

# ---------- minimal s-expression parser / serializer ----------

def tokenize(text):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ' \t\r\n':
            i += 1
        elif c in '()':
            yield c
            i += 1
        elif c == '"':
            j = i + 1
            buf = []
            while text[j] != '"':
                if text[j] == '\\':
                    buf.append(text[j:j+2]); j += 2
                else:
                    buf.append(text[j]); j += 1
            yield '"' + ''.join(buf) + '"'
            i = j + 1
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n()':
                j += 1
            yield text[i:j]
            i = j

def parse(text):
    stack = [[]]
    for tok in tokenize(text):
        if tok == '(':
            stack.append([])
        elif tok == ')':
            done = stack.pop()
            stack[-1].append(done)
        else:
            stack[-1].append(tok)
    return stack[0][0]

def serialize(node, indent=0):
    pad = '  ' * indent
    if not isinstance(node, list):
        return pad + node
    # short nodes on one line
    if all(not isinstance(x, list) for x in node):
        return pad + '(' + ' '.join(node) + ')'
    parts = [pad + '(' + str(node[0])]
    line = parts[0]
    out = []
    # emit leading atoms on same line as head
    i = 1
    while i < len(node) and not isinstance(node[i], list):
        line += ' ' + node[i]
        i += 1
    out.append(line)
    for child in node[i:]:
        out.append(serialize(child, indent + 1))
    out.append(pad + ')')
    return '\n'.join(out)

# ---------- footprint transformation ----------

STRIP_HEADS = {'version', 'generator', 'generator_version',
               'duplicate_pad_numbers_are_jumpers', 'embedded_fonts'}

def load_footprint(relpath, lib_id, ref, value, x, y, path_uuid, netmap, uuid, rot=0):
    tree = parse(open(FP_DIR + '\\' + relpath, encoding='utf-8').read())
    assert tree[0] == 'footprint'
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
    header = [['uuid', f'"{uuid}"'], at,
              ['path', f'"/{path_uuid}"']]
    tree[2:] = header + body
    return tree

def fmt(v):
    s = f'{v:.6f}'.rstrip('0').rstrip('.')
    return s if s else '0'

# ---------- nets ----------

NETS = ['', '+12V', '-12V', '+3V3', 'GND', '/SCLK', '/SDIN', '/SDO', '/SYNC',
        '/VOUTA', '/VOUTB', '/VOUTC', '/VOUTD', '/VREF',
        'Net-(J2-Pin_2)', 'Net-(J2-Pin_3)', 'Net-(J2-Pin_4)', 'Net-(J2-Pin_5)',
        'Net-(U1-~{CLR})']
NI = {name: i for i, name in enumerate(NETS)}

def nm(mapping):
    return {pin: (NI[net], net) for pin, net in mapping.items()}

U1_MAP = nm({'1': '-12V', '3': '/VOUTA', '4': '/VOUTB', '5': '+3V3',
             '7': '/SYNC', '8': '/SCLK', '9': '/SDIN', '10': 'GND',
             '11': 'Net-(U1-~{CLR})', '14': '+3V3', '15': 'GND', '16': '/SDO',
             '17': '/VREF', '18': 'GND', '19': 'GND', '20': 'GND', '21': 'GND',
             '22': '/VOUTD', '23': '/VOUTC', '24': '+12V', '25': '-12V'})
U2_MAP = nm({'2': '+12V', '4': 'GND', '8': '/VREF'})
J1_MAP = nm({'1': 'GND', '2': '/SYNC', '3': '/SDO', '4': '/SDIN', '5': '/SCLK',
             '6': 'GND', '7': '+3V3', '8': 'GND', '9': '-12V', '10': '+12V'})
J2_MAP = nm({'1': 'GND', '2': 'Net-(J2-Pin_2)', '3': 'Net-(J2-Pin_3)', '4': 'Net-(J2-Pin_4)', '5': 'Net-(J2-Pin_5)'})

def rc(p1, p2):
    return nm({'1': p1, '2': p2})

SCH = 'a0000000-0000-4000-8000-'
FPS = [
    # (file, lib_id, ref, value, x, y, sch-uuid-suffix, netmap)
    ('Package_SO.pretty\\HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm.kicad_mod',
     'Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm',
     'U1', 'AD5754BREZ', 125, 118, '0000000000u1', U1_MAP),
    ('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
     'U2', 'ADR421', 126, 131, '0000000000u2', U2_MAP),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric',
     'R1', '10k', 119, 124.5, '0000000000r1', rc('+3V3', 'Net-(U1-~{CLR})')),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric',
     'R2', '100R', 139.5, 116, '0000000000r2', rc('Net-(J2-Pin_2)', '/VOUTA')),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric',
     'R3', '100R', 139.5, 119, '0000000000r3', rc('Net-(J2-Pin_3)', '/VOUTB')),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric',
     'R4', '100R', 139.5, 122, '0000000000r4', rc('Net-(J2-Pin_4)', '/VOUTC')),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric',
     'R5', '100R', 139.5, 125, '0000000000r5', rc('Net-(J2-Pin_5)', '/VOUTD')),
    ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3',
     'C1', '10uF/25V', 137.2, 111.5, '0000000000c1', rc('+12V', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric',
     'C2', '100nF', 131, 111.5, '0000000000c2', rc('+12V', 'GND')),
    ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3',
     'C3', '10uF/25V', 113.5, 111.5, '0000000000c3', rc('GND', '-12V')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric',
     'C4', '100nF', 119, 111.5, '0000000000c4', rc('GND', '-12V')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric',
     'C5', '100nF', 131.5, 121, '0000000000c5', rc('+3V3', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric',
     'C6', '100nF', 132.5, 131, '0000000000c6', rc('/VREF', 'GND')),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric',
     'C7', '100nF', 120, 131, '0000000000c7', rc('+12V', 'GND')),
    ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3',
     'C8', '10uF/25V', 114.5, 131, '0000000000c8', rc('+12V', 'GND')),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x05_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x05_P2.54mm_Vertical',
     'J1', 'SPI+Power', 105.5, 112, '00000000j001', J1_MAP),
    ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x05_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical',
     'J2', 'GND+DAC A-D', 145.5, 114, '00000000j002', J2_MAP),
]

# ---------- board skeleton ----------

BX0, BY0, BX1, BY1 = 100, 105, 150, 140  # board outline

header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (title_block
    (title "MusicBrain - AD5754 Quad DAC Breakout")
    (date "2026-07-03")
    (rev "2.0")
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

edge = f'''
  (gr_rect (start {BX0} {BY0}) (end {BX1} {BY1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "b0000000-0000-4000-8000-0000000000e1"))
  (gr_text "AD5754 DAC breakout  rev 2.0" (at 125 137.5 0) (layer "F.SilkS")
    (uuid "b0000000-0000-4000-8000-0000000000t1")
    (effects (font (size 1.2 1.2) (thickness 0.2))))
'''

def zone(layer, suffix):
    return f'''
  (zone (net {NI['GND']}) (net_name "GND") (layer "{layer}")
    (uuid "b0000000-0000-4000-8000-000000000{suffix}")
    (hatch edge 0.5)
    (connect_pads yes (clearance 0.3))
    (min_thickness 0.2) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts
      (xy {BX0+0.5} {BY0+0.5}) (xy {BX1-0.5} {BY0+0.5})
      (xy {BX1-0.5} {BY1-0.5}) (xy {BX0+0.5} {BY1-0.5})
    ))
  )'''

ROT180 = {'R2', 'R3', 'R4', 'R5'}
fp_texts = []
for k, (f, lib, ref, val, x, y, sfx, netmap) in enumerate(FPS):
    uuid = f'b0000000-0000-4000-8000-0000000000f{k:x}'
    rot = 180 if ref in ROT180 else 0
    tree = load_footprint(f, lib, ref, val, x, y, SCH + sfx, netmap, uuid, rot)
    fp_texts.append(serialize(tree, 1))

# ---------- routing ----------
tracks, vias = [], []
def T(net, layer, w, *pts):
    tracks.append((NI[net], layer, w, pts))
def V(net, x, y):
    vias.append((NI[net], x, y))

SW, PWR = 0.25, 0.4
# --- SPI: F.Cu fan from J1 to U1 left column ---
T('/SYNC', 'F.Cu', SW, (108.04, 112), (108.04, 112.9), (113.4, 112.9),
  (113.4, 118.325), (122.125, 118.325))
T('/SDIN', 'F.Cu', SW, (108.04, 114.54), (111.6, 114.54), (111.6, 119.625),
  (122.125, 119.625))
# SCLK via B.Cu corridor between J1 pad rows
T('/SCLK', 'B.Cu', SW, (105.5, 117.08), (106.77, 118.35), (119.9, 118.35),
  (119.9, 118.975), (120.3, 118.975))
V('/SCLK', 120.3, 118.975)
T('/SCLK', 'F.Cu', SW, (120.3, 118.975), (122.125, 118.975))
# SDO: west channel on B.Cu, around the bottom, up east of the chip
T('/SDO', 'B.Cu', SW, (105.5, 114.54), (103.4, 115.4), (103.4, 127.6),
  (129.0, 127.6), (129.0, 119.625))
V('/SDO', 129.0, 119.625)
T('/SDO', 'F.Cu', SW, (129.0, 119.625), (127.875, 119.625))
# --- +3V3: trunk under the chip + B.Cu west lane to BIN (pin 5) ---
T('+3V3', 'F.Cu', 0.3, (105.5, 119.62), (106.77, 119.62), (106.77, 120.95),
  (112, 120.95), (112, 122.5), (130.55, 122.5))
T('+3V3', 'F.Cu', 0.3, (129, 122.5), (129, 120.925), (128.65, 120.925))
T('+3V3', 'F.Cu', 0.3, (130.55, 122.5), (130.55, 121.725))
T('+3V3', 'F.Cu', 0.3, (118.0875, 122.5), (118.0875, 124.5))
T('+3V3', 'B.Cu', 0.3, (105.5, 119.62), (104.2, 120.7), (104.2, 115.81),
  (114.6, 115.81))
V('+3V3', 114.6, 115.81)
T('+3V3', 'F.Cu', SW, (114.6, 115.81), (114.6, 117.025), (122.125, 117.025))
# --- CLR: R1.2 -> B.Cu -> pin 11 ---
T('Net-(U1-~{CLR})', 'F.Cu', SW, (119.9125, 124.5), (121, 124.5))
V('Net-(U1-~{CLR})', 121, 124.5)
T('Net-(U1-~{CLR})', 'B.Cu', SW, (121, 124.5), (121, 120.925))
V('Net-(U1-~{CLR})', 121, 120.925)
T('Net-(U1-~{CLR})', 'F.Cu', SW, (121, 120.925), (122.125, 120.925))
# --- -12V: west channel, north lane to C3/C4, east to EP vias; pin1 into EP ---
T('-12V', 'F.Cu', PWR, (105.5, 122.16), (105.5, 124.4), (102.6, 124.4),
  (102.6, 110.15))
V('-12V', 102.6, 110.15)
T('-12V', 'B.Cu', PWR, (102.6, 110.15), (119.95, 110.15))
T('-12V', 'B.Cu', PWR, (105.5, 122.16), (104.6, 126.9))
T('-12V', 'B.Cu', PWR, (104.6, 126.9), (124.2, 126.9), (124.2, 119.5))
T('-12V', 'B.Cu', PWR, (124.2, 119.5), (125.8, 119.5))
V('-12V', 115.3, 110.15)
T('-12V', 'F.Cu', PWR, (115.3, 110.15), (115.3, 110.9))
V('-12V', 119.95, 110.15)
T('-12V', 'F.Cu', PWR, (119.95, 110.15), (119.95, 110.9))
V('-12V', 124.2, 119.5)
V('-12V', 125.8, 119.5)
T('-12V', 'F.Cu', SW, (122.125, 114.425), (122.125, 113.85), (126, 113.85),
  (126, 115.5))
# --- +12V: F.Cu bottom loop + B.Cu east riser to top rail ---
T('+12V', 'F.Cu', PWR, (108.04, 122.16), (108.04, 131), (112.7, 131))
T('+12V', 'F.Cu', PWR, (112.7, 131), (112.7, 133.75), (143, 133.75))
T('+12V', 'F.Cu', PWR, (119.05, 133.75), (119.05, 131))
T('+12V', 'F.Cu', PWR, (119.05, 131), (119.05, 129.3), (121.9, 129.3),
  (121.9, 130.365), (122.55, 130.365))
V('+12V', 143, 133.75)
T('+12V', 'B.Cu', PWR, (143, 133.75), (143, 110.3), (127.875, 110.3))
V('+12V', 135.4, 110.3)
T('+12V', 'F.Cu', PWR, (135.4, 110.3), (135.4, 110.9))
V('+12V', 130.05, 110.3)
T('+12V', 'F.Cu', PWR, (130.05, 110.3), (130.05, 110.9))
T('+12V', 'B.Cu', PWR, (129.2, 110.3), (129.2, 114.425))
V('+12V', 129.2, 114.425)
T('+12V', 'F.Cu', SW, (129.2, 114.425), (128.65, 114.425))
# --- VREF: U2.8 -> C6 -> up east flank -> REFIN (pin 17) ---
T('/VREF', 'F.Cu', SW, (128.475, 129.095), (133.4, 129.095), (133.4, 118.975),
  (128.65, 118.975))
T('/VREF', 'F.Cu', SW, (131.55, 129.095), (131.55, 130.275))
# --- VOUT lanes ---
T('/VOUTA', 'F.Cu', SW, (122.125, 115.725), (120.85, 115.725))
V('/VOUTA', 120.85, 115.725)
T('/VOUTA', 'B.Cu', SW, (120.85, 115.725), (120.85, 112.75))
V('/VOUTA', 120.85, 112.75)
T('/VOUTA', 'F.Cu', SW, (120.85, 112.75), (135.6, 112.75), (135.6, 116),
  (138.075, 116))
T('/VOUTB', 'F.Cu', SW, (122.125, 116.375), (120.2, 116.375), (120.2, 113.35),
  (134.9, 113.35), (134.9, 119), (138.075, 119))
T('/VOUTC', 'F.Cu', SW, (127.875, 115.075), (134.2, 115.075), (134.2, 122),
  (138.075, 122))
T('/VOUTD', 'F.Cu', SW, (127.875, 115.725), (130.1, 115.725))
V('/VOUTD', 130.1, 115.725)
T('/VOUTD', 'B.Cu', SW, (130.1, 115.725), (130.1, 124.6), (136.6, 124.6))
V('/VOUTD', 136.6, 124.6)
T('/VOUTD', 'F.Cu', SW, (136.6, 124.6), (136.6, 125), (138.075, 125))
# --- R -> J2 links ---
T('Net-(J2-Pin_2)', 'F.Cu', SW, (140.4125, 116), (143.6, 116), (143.6, 116.54), (145.5, 116.54))
T('Net-(J2-Pin_3)', 'F.Cu', SW, (140.4125, 119), (143.6, 119), (143.6, 119.08), (145.5, 119.08))
T('Net-(J2-Pin_4)', 'F.Cu', SW, (140.4125, 122), (143.6, 122), (143.6, 121.62), (145.5, 121.62))
T('Net-(J2-Pin_5)', 'F.Cu', SW, (140.4125, 125), (143.6, 125), (143.6, 124.16), (145.5, 124.16))
# --- GND bonds & stitching ---
T('GND', 'F.Cu', SW, (108.04, 117.08), (108.04, 119.62))
for sx, sy in ((101.5, 113), (148.5, 112), (101.5, 133), (148.5, 133),
               (127, 136.5), (110, 136.5), (133, 107), (116.5, 121.8), (127.2, 111.9), (131.5, 117.5), (114, 125.6)):
    V('GND', sx, sy)

_tu = [0]
def _tuid():
    _tu[0] += 1
    return f'b0000001-0000-4000-8000-{_tu[0]:012d}'

track_txt = []
for net, layer, w, pts in tracks:
    for a, b in zip(pts, pts[1:]):
        track_txt.append(f'  (segment (start {fmt(a[0])} {fmt(a[1])}) (end {fmt(b[0])} {fmt(b[1])}) '
                         f'(width {w}) (layer "{layer}") (net {net}) (uuid "{_tuid()}"))')
for net, x, y in vias:
    track_txt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                     f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{_tuid()}"))')

out = (header + nets_block + '\n' + '\n'.join(fp_texts) + '\n'
       + '\n'.join(track_txt) + edge
       + zone('F.Cu', 'z01') + zone('B.Cu', 'z02') + '\n)\n')
open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('written', OUT)









