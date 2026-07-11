"""Generate musicbrain-busboard-v2.kicad_pcb — v2-floorplan per doc/busboard-v2-plan.md.

Gebaseerd op het bewezen v1-layout (Teensy west, 6 slots, hubs oost, voeding
zuidwest, B.Cu-lanebundel y 65..105) met de v2-clusters:
- U4 74HC154 (rot 180) in de oude SDA/SCL-waaierzone (53,57); CS1-8 oost-waaier,
  CS9-11 noordoost-kolommen, CS12-14 + codec-kwartet noordkolommen x 46.4-51.2.
- IRQ-keten zuidwest: U5 (40,101) op de IRQ-lanes, U7 1G125 (59,84) naar MISO.
- Expansie noord: J21 (108,22.5 rot 90), U6 (146,15.5 rot 90), U8 245 (95,31
  rot 90) met lane-taps door de inter-slot-kolommen.
- MIDI/CAN/EXP/DLG zuidrand; codec-header J17 + TUNE noordwest.
- Teensy-courtyard = twee socketstroken (SMD eronder toegestaan, sockets!).
"""
import math, re

FP_DIR = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"
OUT = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard-v2\musicbrain-busboard-v2.kicad_pcb"
SCH_FILE = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard-v2\musicbrain-busboard-v2.kicad_sch"

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

_u = [0]
def uid():
    _u[0] += 1
    return f'c3000000-0000-4000-8000-{_u[0]:012d}'

def rotxy(px, py, rot):
    c = math.cos(math.radians(rot)); s = math.sin(math.radians(rot))
    return (px * c + py * s, -px * s + py * c)

P = {}  # ref -> pad -> (x, y)

# Reference-labelpositie per ref (lokale coords; teksthoek blijft 0 =
# horizontaal). Zuidrand-headers (rot 90) kregen hun lib-label ONDER de body;
# rot 90: global = anker + (ly, -lx) -> lx = 3.9 zet het label 3,9 mm noord
# van de pinnenrij, ly = halve rijlengte centreert het boven de connector.
REF_AT = {
    'J10': (3.9, 7.62),                                          # EXP 2x7
    'J19': (3.9, 3.81), 'J20': (3.9, 3.81),                      # DLG 1x4
    'J13': (3.9, 2.54), 'J14': (3.9, 2.54), 'J15': (3.9, 2.54),  # MIDI 1x3
    'J16': (3.9, 3.81), 'J12': (3.9, 3.81),                      # CAN / QWIIC
}

def load_footprint(relpath, lib_id, ref, value, x, y, path_uuid, netmap, rot=0):
    tree = parse(open(FP_DIR + '\\' + relpath, encoding='utf-8').read())
    tree[1] = f'"{lib_id}"'
    body = []
    P[ref] = {}
    for node in tree[2:]:
        if isinstance(node, list):
            if node[0] in STRIP_HEADS:
                continue
            if node[0] == 'property' and node[1] == '"KiLib_Generator"':
                continue
            if node[0] == 'property' and node[1] == '"Reference"':
                node[2] = f'"{ref}"'
                if ref in REF_AT:
                    _lx, _ly = REF_AT[ref]
                    for _sub in node:
                        if isinstance(_sub, list) and _sub[0] == 'at':
                            _sub[1], _sub[2] = fmt(_lx), fmt(_ly)
                            if len(_sub) > 3:
                                _sub[3] = '0'
            if node[0] == 'property' and node[1] == '"Value"':
                node[2] = f'"{value}"'
            if node[0] == 'pad':
                num = node[1].strip('"')
                for sub in node:
                    if isinstance(sub, list) and sub[0] == 'at':
                        px, py = float(sub[1]), float(sub[2])
                        dx, dy = rotxy(px, py, rot)
                        key = num
                        while key in P[ref]:
                            key += 'b'
                        P[ref][key] = (round(x + dx, 4), round(y + dy, 4))
                        if rot:
                            if len(sub) == 3:
                                sub.append(fmt(rot))
                            else:
                                sub[3] = fmt((float(sub[3]) + rot) % 360)
                if num in netmap:
                    idx, name = netmap[num]
                    node.append(['net', str(idx), f'"{name}"'])
            body.append(node)
        else:
            body.append(node)
    at = ['at', fmt(x), fmt(y), str(rot)] if rot else ['at', fmt(x), fmt(y)]
    tree[2:] = [['uuid', f'"{uid()}"'], at, ['path', f'"/{path_uuid}"']] + body
    return tree

# ---------- nets ----------
NETS = (['', '+3V3', '+5V', '+12V', '-12V', 'GND',
         '/SCLK', '/MOSI', '/MISO', '/LDAC', '/SDA', '/SCL', '/SPARE1', '/SPARE2',
         'Net-(U1-11{slash}MOSI)', 'Net-(U1-13{slash}SCK)']
        + [f'/CS{i}' for i in range(1, 15)] + [f'/IRQ{i}' for i in range(1, 13)]
        + ['/CSA0', '/CSA1', '/CSA2', '/CSA3', '/CS_EN', '/IRQSTAT', '/PL', '/PL2',
           '/CHAIN', '/Q7A',
           '/XSCLK0', '/XMOSI0', '/XLDAC0', '/XCONVST0', '/XRST0',
           '/XSCLK', '/XMOSI', '/XLDAC', '/XCONVST', '/XRST',
           '/I2S_OUT', '/I2S_IN', '/MCLK1', '/BCLK1', '/LRCLK1', '/CODEC_RST',
           '/MIDI_RX1', '/MIDI_RX2', '/MIDI_TX', '/MOUT_Y', '/MOUT4', '/MOUT5',
           '/MIN1_4', '/MIN1_5', '/MIN1_A', '/MIN2_4', '/MIN2_5', '/MIN2_A',
           '/CAN_TX', '/CAN_RX', '/CAN_RS', '/CANH', '/CANL', '/CAN_TRM',
           '/TUNE_J', '/TUNE_N', '/TUNE_T',
           '/DLG1_TX', '/DLG1_RX', '/DLG2_TX', '/DLG2_RX',
           '/D10', '/D29', '/D32', '/D33', '/D36', '/D37', '/D38', '/D39',
           '/DISP_CS', '/DISP_RST', '/DISP_DC', '/MOSI1', '/SCK1'])
NI = {n: i for i, n in enumerate(NETS)}
def nm(m): return {p: (NI[n], n) for p, n in m.items()}
def rc(a, b): return nm({'1': a, '2': b})

TEENSY_MAP = nm({'1': 'GND', '2': '/DISP_CS', '3': '/TUNE_T', '4': '/LDAC',
                 '5': '/CSA0', '6': '/CSA1', '7': '/CSA2', '8': '/CSA3',
                 '9': '/I2S_OUT', '10': '/I2S_IN', '11': '/CS_EN', '12': '/D10',
                 '13': 'Net-(U1-11{slash}MOSI)', '14': '/MISO',
                 '16': '/DISP_DC', '17': '/DISP_RST', '18': '/MOSI1', '19': '/SCK1',
                 '20': '/MIDI_RX2', '21': '/D29', '22': '/CAN_RX', '23': '/CAN_TX',
                 '24': '/D32', '25': '/D33', '26': '/MIDI_RX1', '27': '/MIDI_TX',
                 '28': '/D36', '29': '/D37', '30': '/D38', '31': '/D39',
                 '32': '/SPARE1', '33': '/SPARE2', '34': 'GND',
                 '35': 'Net-(U1-13{slash}SCK)',
                 '36': '/DLG1_TX', '37': '/DLG1_RX', '38': '/DLG2_TX', '39': '/DLG2_RX',
                 '40': '/SDA', '41': '/SCL', '42': '/LRCLK1', '43': '/BCLK1',
                 '44': '/CODEC_RST', '45': '/MCLK1', '47': 'GND', '48': '+5V'})

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
J10_MAP = nm({'1': '+3V3', '2': 'GND', '3': '+5V', '4': 'GND',
              '5': '/D10', '6': '/D33', '7': '/D29', '8': '/D32',
              '9': '/D36', '10': '/D37', '11': '/D38', '12': '/D39',
              '13': 'GND', '14': 'GND'})
J11_MAP = nm({'1': '+3V3', '2': 'GND', '3': '/DISP_CS', '4': '/DISP_RST',
              '5': '/DISP_DC', '6': '/MOSI1', '7': '/SCK1', '8': '+3V3'})
J12_MAP = nm({'1': 'GND', '2': '+3V3', '3': '/SDA', '4': '/SCL'})
U4_MAP = nm({'1': '/CS1', '2': '/CS2', '3': '/CS3', '4': '/CS4', '5': '/CS5',
             '6': '/CS6', '7': '/CS7', '8': '/CS8', '9': '/CS9', '10': '/CS10',
             '11': '/CS11', '12': 'GND', '13': '/CS12', '14': '/CS13',
             '15': '/CS14', '16': '/IRQSTAT', '18': '/CS_EN', '19': 'GND',
             '20': '/CSA3', '21': '/CSA2', '22': '/CSA1', '23': '/CSA0',
             '24': '+3V3'})
U5_MAP = nm({'1': '/PL', '2': '/SCLK', '3': 'GND', '4': 'GND', '5': '/IRQ6',
             '6': '/IRQ5', '8': 'GND', '9': '/Q7A', '10': '/CHAIN',
             '11': '/IRQ4', '12': '/IRQ3', '13': '/IRQ2', '14': '/IRQ1',
             '15': 'GND', '16': '+3V3'})
U6_MAP = nm({'1': '/PL2', '2': '/SCLK', '3': '/IRQ10', '4': '/IRQ9', '5': '/IRQ8',
             '6': '/IRQ7', '8': 'GND', '9': '/CHAIN', '10': 'GND',
             '11': 'GND', '12': 'GND', '13': '/IRQ12', '14': '/IRQ11',
             '15': 'GND', '16': '+3V3'})
U7_MAP = nm({'1': '/IRQSTAT', '2': '/Q7A', '3': 'GND', '4': '/MISO', '5': '+3V3'})
U8_MAP = nm({'1': '+3V3', '2': '/SCLK', '3': '/MOSI', '4': '/LDAC',
             '5': '/SPARE1', '6': '/SPARE2', '7': 'GND', '8': 'GND', '9': 'GND',
             '10': 'GND', '14': '/XRST0', '15': '/XCONVST0', '16': '/XLDAC0',
             '17': '/XMOSI0', '18': '/XSCLK0', '19': 'GND', '20': '+3V3'})
J21_MAP = nm({'1': '/CS9', '3': '/CS10', '5': '/CS11', '7': '/CS12',
              '9': '/CS13', '11': '/CS14', '13': '/MISO', '15': '/XSCLK',
              '17': '/XMOSI', '19': '/XLDAC', '21': '/XCONVST', '23': '/XRST',
              '25': 'GND', '2': '/IRQ7', '4': '/IRQ8', '6': '/IRQ9',
              '8': '/IRQ10', '10': '/IRQ11', '12': '/IRQ12', '14': 'GND',
              '16': 'GND', '18': 'GND', '20': 'GND', '22': '/SDA',
              '24': '/SCL', '26': 'GND'})
U9_MAP = nm({'1': '/MIN1_A', '2': '/MIN1_5', '4': '/MIDI_RX1', '5': 'GND', '6': '+3V3'})
U10_MAP = nm({'1': '/MIN2_A', '2': '/MIN2_5', '4': '/MIDI_RX2', '5': 'GND', '6': '+3V3'})
U11_MAP = nm({'2': '/MIDI_TX', '3': 'GND', '4': '/MOUT_Y', '5': '+3V3'})
U12_MAP = nm({'1': '/CAN_TX', '2': 'GND', '3': '+3V3', '4': '/CAN_RX',
              '6': '/CANL', '7': '/CANH', '8': '/CAN_RS'})
U13_MAP = nm({'2': '/TUNE_N', '3': 'GND', '4': '/TUNE_T', '5': '+3V3'})
D3_MAP = nm({'1': 'GND', '2': '+3V3', '3': '/TUNE_N'})
J13_MAP = nm({'1': '/MIN1_4', '2': '/MIN1_5'})
J14_MAP = nm({'1': '/MIN2_4', '2': '/MIN2_5'})
J15_MAP = nm({'1': '/MOUT5', '2': '/MOUT4', '3': 'GND'})
J16_MAP = nm({'1': '+12V', '2': '/CANH', '3': '/CANL', '4': 'GND'})
J17_MAP = nm({'1': '+3V3', '3': '+5V', '5': 'GND', '7': 'GND', '9': 'GND',
              '11': '+12V', '13': '-12V',
              '2': '/CODEC_RST', '4': '/MCLK1', '6': '/BCLK1', '8': '/LRCLK1',
              '10': '/I2S_OUT', '12': '/I2S_IN', '14': 'GND'})
J18_MAP = nm({'1': '/TUNE_J', '2': 'GND'})
J19_MAP = nm({'1': 'GND', '2': '/DLG1_TX', '3': '/DLG1_RX', '4': 'GND'})
J20_MAP = nm({'1': 'GND', '2': '/DLG2_TX', '3': '/DLG2_RX', '4': 'GND'})
JP1_MAP = nm({'1': '/CAN_TRM', '2': '/CANL'})

# sch uuids by reference
sch_txt = open(SCH_FILE, encoding='utf-8').read()
sym_uuid = {}
for m in re.finditer(r'\(uuid "([0-9a-f-]+)"\)\s*\n\s*\(property "Reference" "([A-Z][A-Z0-9]*)"', sch_txt):
    sym_uuid[m.group(2)] = m.group(1)

# ---------- custom Teensy 4.1 footprint (courtyard = 2 socketstroken) ----------
def teensy_fp(x0, y0, netmap, path_uuid):
    pads = []
    for n in range(1, 25):
        pads.append((n, 0.0, 2.54 * (n - 1)))
    for n in range(25, 49):
        pads.append((n, 15.24, 2.54 * (48 - n)))
    P['U1'] = {}
    pad_txt = []
    for n, px, py in pads:
        P['U1'][str(n)] = (round(x0 + px, 4), round(y0 + py, 4))
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
    (descr "Teensy 4.1 op twee 1x24 socketstrips; courtyard = alleen de strips (SMD <=6mm eronder ok)")
    (property "Reference" "U1" (at 7.62 -2.8 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "Teensy 4.1" (at 7.62 61.2 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -1.27 -1.6) (end 16.51 60.02)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -2.5 -2.5) (end 2.5 60.3)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (fp_rect (start 12.74 -2.5) (end 17.74 60.3)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (fp_text user "USB" (at 7.62 0 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_text user "SMD <=6mm onder Teensy (sockets)" (at 7.62 30 90) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
{chr(10).join(pad_txt)}
  )'''

# ---------- footprints ----------
PH = 'Connector_PinHeader_2.54mm.pretty\\PinHeader_'
PHL = 'Connector_PinHeader_2.54mm:PinHeader_'
FPS = [
    ('Connector_IDC.pretty\\IDC-Header_2x05_P2.54mm_Vertical.kicad_mod',
     'Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical', 'J9', 'PWR IN', 22, 108, J9_MAP, 0),
    ('Converter_DCDC.pretty\\Converter_DCDC_RECOM_R-78E-0.5_THT.kicad_mod',
     'Converter_DCDC:Converter_DCDC_RECOM_R-78E-0.5_THT', 'U2', 'R-78E5.0-0.5', 62, 72, U2_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U3', 'AMS1117-3.3', 80, 91, U3_MAP, 0),
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
# zuidrand: EXP, MIDI, CAN, DLG
FPS += [
    (PH + '2x07_P2.54mm_Vertical.kicad_mod', PHL + '2x07_P2.54mm_Vertical',
     'J10', 'EXP', 33, 121.5, J10_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J13', 'MIDI IN1', 75, 121.5, J13_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J14', 'MIDI IN2', 84, 121.5, J14_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J15', 'MIDI OUT', 93, 121.5, J15_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J16', 'CAN', 102, 121.5, J16_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J19', 'DLG1', 52, 121.5, J19_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J20', 'DLG2', 63.5, 121.5, J20_MAP, 90),
]
# display + qwiic
FPS += [
    (PH + '1x09_P2.54mm_Vertical.kicad_mod', PHL + '1x09_P2.54mm_Vertical',
     'J11', 'DISPLAY', 33, 20, J11_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J12', 'QWIIC', 204, 121.5, J12_MAP, 90),
]
# noordwest: codec + TUNE
FPS += [
    (PH + '2x07_P2.54mm_Vertical.kicad_mod', PHL + '2x07_P2.54mm_Vertical',
     'J17', 'AUDIO/CODEC', 39.35, 13.5, J17_MAP, 270),
    (PH + '1x02_P2.54mm_Vertical.kicad_mod', PHL + '1x02_P2.54mm_Vertical',
     'J18', 'TUNE', 43, 13.5, J18_MAP, 90),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U13', '74LVC1G17', 54, 16.5, U13_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-23.kicad_mod', 'Package_TO_SOT_SMD:SOT-23',
     'D3', 'BAT54S', 62, 16.5, D3_MAP, 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R14', '100k', 48.9, 12.6, rc('/TUNE_J', '/TUNE_N'), 90),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R15', '100k', 51.5, 12.2, rc('/TUNE_N', 'GND'), 90),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C14', '100n', 59, 16.5, rc('+3V3', 'GND'), 90),
]
# decoder + IRQ-keten + buffer
FPS += [
    ('Package_SO.pretty\\SOIC-24W_7.5x15.4mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-24W_7.5x15.4mm_P1.27mm', 'U4', '74HC154', 55.5, 57, U4_MAP, 180),
    ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U5', '74HC165', 37, 107, U5_MAP, 90),
    ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U6', '74HC165', 153, 15.5, U6_MAP, 90),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U7', '74LVC1G125', 59, 84, U7_MAP, 0),
    ('Package_SO.pretty\\SOIC-20W_7.5x12.8mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm', 'U8', '74LVC245', 95, 31, U8_MAP, 90),
    ('Connector_IDC.pretty\\IDC-Header_2x13_P2.54mm_Vertical.kicad_mod',
     'Connector_IDC:IDC-Header_2x13_P2.54mm_Vertical', 'J21', 'EXPANSION', 108, 22.5, J21_MAP, 90),
    ('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm', 'U12', 'SN65HVD230', 92, 99, U12_MAP, 0),
    ('Package_DIP.pretty\\DIP-6_W7.62mm.kicad_mod', 'Package_DIP:DIP-6_W7.62mm',
     'U9', 'H11L1', 52, 100, U9_MAP, 0),
    ('Package_DIP.pretty\\DIP-6_W7.62mm.kicad_mod', 'Package_DIP:DIP-6_W7.62mm',
     'U10', 'H11L1', 79, 112.5, U10_MAP, 90),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U11', '74LVC1G17', 88, 116, U11_MAP, 0),
]
# RC's / pulldowns / serie-R's / jumpers
FPS += [
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R5', '10k', 34.3, 96.2, rc('+3V3', '/PL'), 0),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C9', '220p', 40.9, 92.5, rc('/IRQSTAT', '/PL'), 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R33', '10k', 142.5, 12.8, rc('+3V3', '/PL2'), 90),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C18', '220p', 145, 12.5, rc('/IRQSTAT', '/PL2'), 90),
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C10', '100n', 49.5, 66.5, rc('+3V3', 'GND'), 90),   # U4
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C15', '100n', 34.6, 99.2, rc('+3V3', 'GND'), 0),  # U5
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C16', '100n', 152, 22.8, rc('+3V3', 'GND'), 90),  # U6
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C17', '100n', 63, 80, rc('+3V3', 'GND'), 0),        # U7
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C11', '100n', 85.8, 24, rc('+3V3', 'GND'), 90),       # U8
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C12', '100n', 58, 93, rc('+3V3', 'GND'), 0),       # optos
    ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod', 'Capacitor_SMD:C_0805_2012Metric',
     'C13', '100n', 88, 93.5, rc('+3V3', 'GND'), 90),       # CAN
]
PDXY = [(78, 100.16), (98, 101.43), (118, 102.7), (138, 103.97),
        (158, 106.51), (178, 105.24)]
for k in range(6):   # IRQ1-6 pulldowns onder de slot-tap-vias (pad1 noord)
    FPS.append(('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
                'Resistor_SMD:R_0805_2012Metric', f'R{21+k}', '100k',
                PDXY[k][0], PDXY[k][1], rc(f'/IRQ{k+1}', 'GND'), 270))
for k in range(6):   # IRQ7-12 pulldowns oost van het M3-gat (pad1 zuid)
    FPS.append(('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
                'Resistor_SMD:R_0805_2012Metric', f'R{27+k}', '100k',
                168.5 + 2.2 * k, 15.5, rc(f'/IRQ{k+7}', 'GND'), 90))
XR = [('R16', '/XSCLK0', '/XSCLK'), ('R17', '/XMOSI0', '/XMOSI'),
      ('R18', '/XLDAC0', '/XLDAC'), ('R19', '/XCONVST0', '/XCONVST'),
      ('R20', '/XRST0', '/XRST')]
for k, (ref, a, b) in enumerate(XR):   # 33R serie -> J21 (staand, noord van U8)
    FPS.append(('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
                'Resistor_SMD:R_0805_2012Metric', ref, '33R',
                103.4 + 2.2 * k, 30.5, nm({'1': a, '2': b}), 270))
# MIDI passief
FPS += [
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R6', '220R', 50, 94.8, rc('/MIN1_4', '/MIN1_A'), 90),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R7', '220R', 79.5, 116.5, rc('/MIN2_4', '/MIN2_A'), 270),
    ('Diode_SMD.pretty\\D_SOD-323.kicad_mod', 'Diode_SMD:D_SOD-323',
     'D1', '1N4148WS', 54, 91.5, rc('/MIN1_A', '/MIN1_5'), 0),
    ('Diode_SMD.pretty\\D_SOD-323.kicad_mod', 'Diode_SMD:D_SOD-323',
     'D2', '1N4148WS', 88.5, 108, rc('/MIN2_A', '/MIN2_5'), 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R8', '1k', 70, 100.4, rc('+3V3', '/MIDI_RX1'), 180),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R9', '1k', 87.5, 105.3, rc('+3V3', '/MIDI_RX2'), 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R10', '10R', 92.5, 116, rc('/MOUT_Y', '/MOUT5'), 0),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R11', '33R', 87.5, 111.5, rc('+3V3', '/MOUT4'), 90),
]
# CAN passief
FPS += [
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R13', '10k', 91, 93.8, rc('/CAN_RS', 'GND'), 180),
    ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod', 'Resistor_SMD:R_0805_2012Metric',
     'R12', '120R', 102, 104, rc('/CANH', '/CAN_TRM'), 90),
    ('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm',
     'JP1', 'TERM', 98.5, 107, JP1_MAP, 0),
]
for hn, (hx, hy) in enumerate(((18, 13), (163, 13), (212, 13),
                               (125, 122), (140, 122)), start=1):
    FPS.append(('MountingHole.pretty\\MountingHole_3.2mm_M3.kicad_mod',
                'MountingHole:MountingHole_3.2mm_M3',
                f'H{hn}', 'M3', hx, hy, {}, 0))

fp_texts = [teensy_fp(30, 40, TEENSY_MAP, sym_uuid.get('U1', ''))]
for f, lib, ref, val, x, y, netmap, rot in FPS:
    tree = load_footprint(f, lib, ref, val, x, y, sym_uuid.get(ref, ''), netmap, rot)
    fp_texts.append(serialize(tree, 1))

BX0, BY0, BX1, BY1 = 15, 10, 215, 125

# ================= ROUTING =================
tracks, vias = [], []
def T(net, layer, w, *pts):
    tracks.append((NI[net], layer, w, pts))
def V(net, x, y):
    vias.append((NI[net], x, y))

SW = 0.25
CS_ROWY_ = {'/CS9': 24.6, '/CS10': 24.0, '/CS11': 23.4,
            '/CS12': 22.8, '/CS13': 22.2, '/CS14': 21.6}
# ---- B.Cu-lanebundel (SPARE-lanes qua y gewisseld t.o.v. v1; CS-fanx nieuw) ----
LANES = {
    '/LDAC':  (68.0, .25, 65.5, 179.5),
    '/MOSI':  (70.0, .25, 51.3, 201.8),
    '/MISO':  (71.75, .25, 31.2, 201.1),
    '/SCLK':  (73.6, .25, 33.4, 202.5),
    '/SDA':   (75.62, .25, 46.75, 187.4),
    '/SCL':   (76.89, .25, 41.5, 188.2),
    '/SPARE2': (78.16, .25, 46.4, 174.5),
    '/SPARE1': (79.43, .25, 46.0, 175.5),
    '+3V3':   (81.3, .5, 63.5, 204.54),
    '+12V':   (83.2, .8, 48.5, 205.1),
    '-12V':   (85.1, .8, 47.7, 204.4),
    '+5V':    (86.99, .4, 43.5, 116.0),
    '/CS1':   (88.0, .25, 59.4, 80.5),
    '/CS2':   (89.27, .25, 60.2, 100.5),
    '/CS3':   (90.54, .25, 61.0, 120.5),
    '/CS4':   (91.81, .25, 61.8, 140.5),
    '/CS5':   (93.08, .25, 62.6, 160.5),
    '/CS6':   (94.35, .25, 63.4, 180.5),
    '/CS7':   (95.62, .25, 64.2, 205.4),
    '/CS8':   (96.89, .25, 65.0, 200.4),
    '/IRQ1':  (98.16, .25, 38.91, 78.5),
    '/IRQ2':  (99.43, .25, 37.64, 98.5),
    '/IRQ3':  (100.7, .25, 36.37, 118.5),
    '/IRQ4':  (101.97, .25, 35.1, 138.5),
    '/IRQ6':  (103.24, .25, 34.465, 178.5),
    '/IRQ5':  (104.51, .25, 33.2, 158.5),
}
for _net, (_ly, _lw, _x1, _x2) in LANES.items():
    T(_net, 'B.Cu', _lw, (_x1, _ly), (_x2, _ly))

def lane_y(net):
    return LANES[net][0]

# ---- slot-taps (v1-patroon) ----
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

# ---- hub-waaiers (v1) ----
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

# ---- voeding zuidwest (v1-basis) ----
T('+12V', 'F.Cu', .5, (22, 118.16), (27.3, 118.16), (27.3, 79.37))
T('+12V', 'F.Cu', .4, (27.3, 79.37), (48.5, 79.37))
V('+12V', 48.5, 79.37)
T('+12V', 'B.Cu', .4, (48.5, 79.37), (48.5, 83.2))
T('-12V', 'F.Cu', .5, (22, 108), (25.9, 108), (25.9, 84.45))
V('-12V', 25.9, 84.45)
T('-12V', 'B.Cu', .4, (25.9, 84.45), (47.7, 84.45), (47.7, 85.1))
T('+12V', 'F.Cu', .5, (27.3, 116.5), (62, 116.5), (62, 108.6))
T('+5V', 'F.Cu', .4, (67.08, 107.5), (67.08, 86.99))
V('+5V', 67.08, 86.99)
V('+5V', 74.7, 86.99)
T('+5V', 'F.Cu', .4, (74.7, 86.99), (74.7, 106.3), (76.85, 106.3))
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

# ---- Teensy-basisaansluitingen ----
T('Net-(U1-11{slash}MOSI)', 'F.Cu', SW, (30, 70.48), (30, 71.75), (48.5875, 71.75))
T('/MOSI', 'F.Cu', SW, (50.4125, 71.75), (51.3, 71.75), (51.3, 70.6))
V('/MOSI', 51.3, 70.6)
T('/MOSI', 'B.Cu', SW, (51.3, 70.6), (51.3, 70.0))
T('Net-(U1-13{slash}SCK)', 'F.Cu', SW, (45.24, 73.02), (52.0875, 73.02))
T('/SCLK', 'F.Cu', SW, (53.9125, 73.02), (55.2, 73.02), (55.2, 73.6))
V('/SCLK', 55.2, 73.6)
T('/MISO', 'B.Cu', SW, (30, 73.02), (31.2, 71.75))
# LDAC: pad4 -> B-rij y 46.35 -> B-kolom x 65.5 -> lane (alles B)
T('/LDAC', 'B.Cu', SW, (30, 47.62), (31.27, 46.35), (64.23, 46.35), (65.5, 47.62), (65.5, 68.0))
# +5V (VIN pad48): F-jog -> via -> B-rij y 40.8 -> via -> F-kolom x 66.2 -> lane
T('+5V', 'F.Cu', .4, (45.24, 40), (46.04, 40.8), (49.45, 40.8))
V('+5V', 49.7, 40.8)
T('+5V', 'F.Cu', .4, (49.45, 40.8), (49.7, 40.8))
T('+5V', 'B.Cu', .4, (49.7, 40.8), (66.2, 40.8))
V('+5V', 66.2, 40.8)
T('+5V', 'F.Cu', .4, (66.2, 40.8), (66.2, 86.99))
# SDA/SCL
T('/SDA', 'F.Cu', SW, (45.24, 60.32), (46.75, 61.83), (46.75, 75.62))
V('/SDA', 46.75, 75.62)
T('/SCL', 'F.Cu', SW, (45.24, 57.78), (41.5, 57.78))
V('/SCL', 41.5, 57.78)
T('/SCL', 'B.Cu', SW, (41.5, 57.78), (41.5, 76.89))
# SPARE1/2: B-jogs (lanes gewisseld)
T('/SPARE2', 'B.Cu', SW, (45.24, 78.1), (46.4, 78.16))
T('/SPARE1', 'B.Cu', SW, (45.24, 80.64), (46.0, 79.79), (46.0, 79.43))

# ---- display (v1-patroon) ----
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
T('/DISP_CS', 'F.Cu', SW, (30, 42.54), (31, 41.27), (36.81, 41.27), (36.81, 35.2))
V('/DISP_CS', 36.81, 35.2)
T('/DISP_CS', 'B.Cu', SW, (36.81, 35.2), (36.81, 21.2), (38.08, 20))
# J11 +3V3: pin1 vanaf J17-pin1-jog (zelfde net), pin8 (LED) vanaf C14
T('+3V3', 'F.Cu', .4, (39.35, 19.3), (39.35, 21.0), (33, 21.0), (33, 20))
T('+3V3', 'F.Cu', .4, (P['C14']['1'][0], P['C14']['1'][1]), (60, 14.2), (50.78, 14.2), (50.78, 20))

# ---- U4 74HC154 (rot 180) ----
CSA = [('/CSA0', '5', '23', 34.0, 53.97), ('/CSA1', '6', '22', 35.5, 56.51),
       ('/CSA2', '7', '21', 37.0, 59.05), ('/CSA3', '8', '20', 38.5, 61.59),
       ('/CS_EN', '11', '18', 40.0, 64.13)]
for net, tpad, upin, bcol, mid in CSA:
    sx, sy = P['U1'][tpad]
    ux, uy = P['U4'][upin]
    T(net, 'F.Cu', SW, (sx, sy), (bcol + 0.8, sy), (bcol, sy - 0.8))
    V(net, bcol, sy - 0.8)
    T(net, 'B.Cu', SW, (bcol, sy - 0.8), (bcol, uy))
    V(net, bcol, uy)
    T(net, 'F.Cu', SW, (bcol, uy), (ux, uy))
# CS1-8 (rechterkolom, diepste pin -> westelijkste kolom)
CS_FAN = [('/CS1', '1', 59.4), ('/CS2', '2', 60.2), ('/CS3', '3', 61.0),
          ('/CS4', '4', 61.8), ('/CS5', '5', 62.6), ('/CS6', '6', 63.4),
          ('/CS7', '7', 64.2), ('/CS8', '8', 65.0)]
for net, pin, fx in CS_FAN:
    px, py = P['U4'][pin]
    T(net, 'F.Cu', SW, (px, py), (fx, py), (fx, lane_y(net)))
    V(net, fx, lane_y(net))
# CS9-11 (rechterkolom boven): oost-jogs -> noordoost-kolommen -> noordstrook
CS911 = [('/CS9', '9', 63.0), ('/CS10', '10', 61.5), ('/CS11', '11', 60.0)]
for net, pin, fx in CS911:
    px, py = P['U4'][pin]
    T(net, 'F.Cu', SW, (px, py), (fx, py), (fx, CS_ROWY_[net]))
# CS12-14 (linkerkolom boven): oost-jogs over het IC-lijf -> noordkolommen
CS1214 = [('/CS12', '13', 50.4), ('/CS13', '14', 51.2), ('/CS14', '15', 52.0)]
for net, pin, fx in CS1214:
    px, py = P['U4'][pin]
    T(net, 'F.Cu', SW, (px, py), (fx, py), (fx, CS_ROWY_[net]))
# noordstrook-rijen -> J21 zuidrij (oneven pinnen)
for net, colx, jpin in (('/CS9', 63.0, '1'), ('/CS10', 61.5, '3'), ('/CS11', 60.0, '5'),
                        ('/CS12', 50.4, '7'), ('/CS13', 51.2, '9'), ('/CS14', 52.0, '11')):
    jx, jy = P['J21'][jpin]
    ry = CS_ROWY_[net]
    T(net, 'F.Cu', SW, (colx, ry), (jx, ry), (jx, jy))
# IRQSTAT: pin16 -> kanaalkolom x 43.9 (F, met B-hop over de DISP-rijen heen
# voor de noordtak) -> C9 + U7 (zuid) en C18 (noordoost)
px, py = P['U4']['16']
T('/IRQSTAT', 'F.Cu', SW, (px, py), (43.9, py), (43.9, 92.5),
  (P['C9']['1'][0], 92.5), (P['C9']['1'][0], P['C9']['1'][1]))
T('/IRQSTAT', 'F.Cu', SW, (43.9, 84.0), (P['U7']['1'][0], 84.0),
  (P['U7']['1'][0], P['U7']['1'][1]))
T('/IRQSTAT', 'F.Cu', SW, (43.9, py), (43.9, 34.2))
V('/IRQSTAT', 43.9, 34.2)
T('/IRQSTAT', 'B.Cu', SW, (43.9, 34.2), (43.9, 27.4), (136.35, 27.4))
V('/IRQSTAT', 136.35, 27.4)
T('/IRQSTAT', 'F.Cu', SW, (136.35, 27.4), (136.35, P['C18']['1'][1]),
  (P['C18']['1'][0], P['C18']['1'][1]))
# PL: C9.2 + R5.2 -> U5 pin1
T('/PL', 'F.Cu', SW, (P['C9']['2'][0], P['C9']['2'][1]), (P['C9']['2'][0], 94.6),
  (P['R5']['2'][0], 94.6), (P['R5']['2'][0], P['R5']['2'][1]))
T('/PL', 'F.Cu', SW, (P['C9']['2'][0], 94.6), (P['U5']['1'][0], 94.6),
  (P['U5']['1'][0], P['U5']['1'][1]))
# PL2: C18.2 + R33.2 -> U6 pin1
T('/PL2', 'F.Cu', SW, (P['C18']['2'][0], P['C18']['2'][1]),
  (P['R33']['2'][0], P['C18']['2'][1]), (P['R33']['2'][0], P['R33']['2'][1]))
T('/PL2', 'F.Cu', SW, (P['R33']['2'][0], P['R33']['2'][1]),
  (P['U6']['1'][0], P['R33']['2'][1]), (P['U6']['1'][0], P['U6']['1'][1]))

# ---- IRQ-keten zuidwest ----
# IRQ1-4: zuidrij-pinnen (3-6) recht omhoog naar hun lane
for net, pin in (('/IRQ1', '6'), ('/IRQ2', '5'), ('/IRQ3', '4'), ('/IRQ4', '3')):
    px, py = P['U5'][pin]
    T(net, 'F.Cu', SW, (px, py), (px, lane_y(net)))
    V(net, px, lane_y(net))
# IRQ5/6: noordrij-pinnen (14/13) via pad-gap-kolommen x 33.2 / 34.465
T('/IRQ5', 'F.Cu', SW, (P['U5']['14'][0], P['U5']['14'][1]), (P['U5']['14'][0], 97.5),
  (33.2, 97.5), (33.2, lane_y('/IRQ5')))
V('/IRQ5', 33.2, lane_y('/IRQ5'))
T('/IRQ6', 'F.Cu', SW, (P['U5']['13'][0], P['U5']['13'][1]), (P['U5']['13'][0], 97.0),
  (34.465, 97.0), (34.465, lane_y('/IRQ6')))
V('/IRQ6', 34.465, lane_y('/IRQ6'))
# pulldowns: gestaffeld onder U5; tap-kolommen verlengen zuidwaarts
PDN = [('/IRQ1', 'R21', 38.91, 38.4, 114.4), ('/IRQ2', 'R22', 37.64, 37.64, 111.2),
       ('/IRQ3', 'R23', 36.37, 36.2, 114.4), ('/IRQ4', 'R24', 35.1, 35.75, 111.2),
       ('/IRQ5', 'R25', 33.2, 33.2, 111.2), ('/IRQ6', 'R26', 34.465, 34.3, 114.4)]
for net, ref, colx, rx, ry in PDN:
    p1 = P[ref]['1']
    T(net, 'F.Cu', SW, (colx, 103.7 if colx > 34.6 else lane_y(net)),
      (colx, p1[1] - 0.55), (p1[0], p1[1]))
# Q7A: U5 pin9 -> rij y 96.9 -> kolom x 46.6 -> rij y 85 -> U7 pin2
T('/Q7A', 'F.Cu', SW, (P['U5']['9'][0], P['U5']['9'][1]), (P['U5']['9'][0], 96.9),
  (46.6, 96.9), (46.6, 85.0), (P['U7']['2'][0], 85.0), (P['U7']['2'][0], P['U7']['2'][1]))
# CHAIN: U6 pin10 -> F-rij y 18.3 -> kanaal (B/F-hops) -> U5 pin10
T('/CHAIN', 'F.Cu', SW, (P['U6']['10'][0], P['U6']['10'][1]), (P['U6']['10'][0], 18.3),
  (41.89, 18.3), (41.89, 26.0))
V('/CHAIN', 41.89, 26.0)
T('/CHAIN', 'B.Cu', SW, (41.89, 26.0), (42.5, 26.6), (42.5, 44.5))
V('/CHAIN', 42.5, 44.5)
T('/CHAIN', 'F.Cu', SW, (42.5, 44.5), (42.5, 48.5))
V('/CHAIN', 42.5, 48.5)
T('/CHAIN', 'B.Cu', SW, (42.5, 48.5), (42.5, 70.6))
V('/CHAIN', 42.5, 70.6)
T('/CHAIN', 'F.Cu', SW, (42.5, 70.6), (42.5, 96.4), (40.815, 96.4), (40.815, 97.55),
  (P['U5']['10'][0], 97.55), (P['U5']['10'][0], P['U5']['10'][1]))
# U7: Y -> MISO-lane
T('/MISO', 'F.Cu', SW, (P['U7']['4'][0], P['U7']['4'][1]), (58.6, P['U7']['4'][1] - 0.6),
  (58.6, 71.75))
V('/MISO', 58.6, 71.75)
# U5 SCLK (pin2): via gap-kolom west om U5 heen naar de SCLK-lane
T('/SCLK', 'F.Cu', SW, (P['U5']['2'][0], P['U5']['2'][1]), (P['U5']['2'][0], 105.3),
  (32.4, 105.3))
V('/SCLK', 32.4, 105.3)
T('/SCLK', 'B.Cu', SW, (32.4, 105.3), (32.4, 74.6), (33.4, 73.6))
# U6 SCLK (pin2): oostkolom -> SCLK-lane
T('/SCLK', 'F.Cu', SW, (P['U6']['2'][0], P['U6']['2'][1]), (P['U6']['2'][0], 11.4),
  (154.6, 11.4), (154.6, 12.9))
V('/SCLK', 154.6, 12.9)
T('/SCLK', 'B.Cu', SW, (154.6, 12.9), (154.6, 63.9), (155.4, 64.7), (155.4, 72.8))
V('/SCLK', 155.4, 72.8)
T('/SCLK', 'F.Cu', SW, (155.4, 72.8), (155.4, 73.6))
V('/SCLK', 155.4, 73.6)

# ---- expansie: U8-taps + X-serie-R's + J21 ----
U8_TAPS = [('/SCLK', '2'), ('/MOSI', '3'), ('/LDAC', '4')]
for net, pin in U8_TAPS:
    px, py = P['U8'][pin]
    ly = lane_y(net)
    T(net, 'F.Cu', SW, (px, py), (px, ly))
    V(net, px, ly)
U8_TAPS2 = [('/SPARE1', '5', 111.5, 36.2), ('/SPARE2', '6', 112.3, 36.9)]
for net, pin, colx, rowy in U8_TAPS2:
    px, py = P['U8'][pin]
    ly = lane_y(net)
    T(net, 'F.Cu', SW, (colx, ly), (colx, rowy), (px, rowy), (px, py))
    V(net, colx, ly)
XPINS = [('/XSCLK0', '18', 'R16', '/XSCLK', '15'), ('/XMOSI0', '17', 'R17', '/XMOSI', '17'),
         ('/XLDAC0', '16', 'R18', '/XLDAC', '19'), ('/XCONVST0', '15', 'R19', '/XCONVST', '21'),
         ('/XRST0', '14', 'R20', '/XRST', '23')]
for k, (net0, pin, rref, net1, jpin) in enumerate(XPINS):
    px, py = P['U8'][pin]
    r1 = P[rref]['1']; r2 = P[rref]['2']
    T(net0, 'F.Cu', SW, (px, py), (px, py - 1.0), (r1[0], py - 1.0), (r1[0], r1[1]))
    jx, jy = P['J21'][jpin]
    rowy = 25.6 + 0.55 * k
    T(net1, 'F.Cu', SW, (r2[0], r2[1]), (r2[0], rowy), (jx, rowy), (jx, jy))
# MISO -> J21 pin13: noordoost-kolom x 65.8 vanaf de MISO-lane
jx, jy = P['J21']['13']
T('/MISO', 'F.Cu', SW, (65.8, 71.75), (65.8, 64.6), (65.0, 63.8), (65.0, 25.3),
  (jx, 25.3), (jx, jy))
V('/MISO', 65.8, 71.75)
# SDA/SCL -> J21 pinnen 22/24: oost-taps op de lanes
for net, jpin, colx in (('/SDA', '22', 187.4), ('/SCL', '24', 188.2)):
    jx, jy = P['J21'][jpin]
    ly = lane_y(net)
    V(net, colx, ly)
    T(net, 'F.Cu', SW, (colx, ly), (colx, 17.8), (jx + 0.85, 17.8), (jx, 18.6), (jx, jy))
# IRQ7-10: J21 noordrij -> B-rijen -> U6 zuidrij-pinnen (vias bij de pads)
IRQ_NA = [('/IRQ7', '2', '6', 20.3), ('/IRQ8', '4', '5', 20.9),
          ('/IRQ9', '6', '4', 21.5), ('/IRQ10', '8', '3', 23.8)]
for net, jpin, upin, rowy in IRQ_NA:
    jx, jy = P['J21'][jpin]
    ux, uy = P['U6'][upin]
    T(net, 'B.Cu', SW, (jx, jy), (jx, rowy), (ux, rowy))
    V(net, ux, rowy)
    T(net, 'F.Cu', SW, (ux, rowy), (ux, uy))
# IRQ11/12: J21 -> B noordom -> U6 noordrij-pinnen
IRQ_NB = [('/IRQ11', '10', '14', 119.0, 11.3), ('/IRQ12', '12', '13', 121.5, 11.9)]
for net, jpin, upin, jogx, rowy in IRQ_NB:
    jx, jy = P['J21'][jpin]
    ux, uy = P['U6'][upin]
    T(net, 'B.Cu', SW, (jx, jy), (jogx, jy - 0.76), (jogx, rowy), (ux, rowy))
    V(net, ux, rowy)
    T(net, 'F.Cu', SW, (ux, rowy), (ux, uy))
# pulldowns R27-32 (noordstrook, oost van U6): korte taps op de U6-pinnen
PDN2 = [('/IRQ7', 'R27', '6'), ('/IRQ8', 'R28', '5'), ('/IRQ9', 'R29', '4'),
        ('/IRQ10', 'R30', '3'), ('/IRQ11', 'R31', '14'), ('/IRQ12', 'R32', '13')]
for k, (net, ref, upin) in enumerate(PDN2):
    p1 = P[ref]['1']
    ux, uy = P['U6'][upin]
    rowy = 20.3 + 0.6 * k if k < 4 else (11.3 if k == 4 else 11.9)
    T(net, 'F.Cu', SW, (p1[0], p1[1]), (p1[0], rowy))
    V(net, p1[0], rowy)
    T(net, 'B.Cu', SW, (p1[0], rowy), (ux, rowy))

# ---- MIDI ----
# MIDI_RX1: pad26 -> B-hop -> F-rij 96.78 -> R8.2 + U9 VO(4)
sx, sy = P['U1']['26']
T('/MIDI_RX1', 'B.Cu', SW, (sx, sy), (46.14, 96.78), (50.2, 96.78))
V('/MIDI_RX1', 50.2, 96.78)
T('/MIDI_RX1', 'F.Cu', SW, (50.2, 96.78), (68.6, 96.78), (70, 98.2),
  (P['R8']['2'][0], P['R8']['2'][1]))
T('/MIDI_RX1', 'F.Cu', SW, (P['U9']['4'][0], P['U9']['4'][1]),
  (P['U9']['4'][0] + 1.3, P['U9']['4'][1] - 1.3), (60.92, 96.78))
# MIDI_RX2: pad20 -> gap-kolom x 38.275 -> B-rij y 106.45 -> U10 VO(4) + R9.2
sx, sy = P['U1']['20']
T('/MIDI_RX2', 'F.Cu', SW, (sx, sy), (37.375, sy + 0.9), (38.275, sy + 1.8),
  (38.275, 105.55))
V('/MIDI_RX2', 38.275, 105.55)
T('/MIDI_RX2', 'B.Cu', SW, (38.275, 105.55), (39.175, 106.45), (82.7, 106.45))
V('/MIDI_RX2', 82.7, 106.45)
T('/MIDI_RX2', 'F.Cu', SW, (82.7, 106.45), (83.5, 105.7),
  (P['U10']['4'][0], 105.7), (P['U10']['4'][0], P['U10']['4'][1]))
T('/MIDI_RX2', 'F.Cu', SW, (P['U10']['4'][0], 105.7), (89.2, 105.7), (89.2, P['R9']['2'][1]),
  (P['R9']['2'][0], P['R9']['2'][1]))
# MIDI IN 1: J13 -> kolom x 74.2 -> rij y 98.2 -> R6 -> opto/D1
T('/MIN1_4', 'F.Cu', SW, (P['J13']['1'][0], P['J13']['1'][1]),
  (74.2, P['J13']['1'][1] - 1.3), (74.2, 99.0), (73.4, 98.2),
  (P['R6']['1'][0], 98.2), (P['R6']['1'][0], P['R6']['1'][1]))
T('/MIN1_A', 'F.Cu', SW, (P['R6']['2'][0], P['R6']['2'][1]), (55.9, 100.2),
  (52.8, 100.2), (P['U9']['1'][0], P['U9']['1'][1] + 0.0))
T('/MIN1_A', 'F.Cu', SW, (55.9, 100.2), (55.9, 101.6),
  (P['D1']['1'][0], P['D1']['1'][1]))
T('/MIN1_5', 'F.Cu', SW, (P['D1']['2'][0], P['D1']['2'][1]), (57.7, 102.1),
  (57.7, 102.54), (52.9, 102.54), (P['U9']['2'][0], P['U9']['2'][1]))
T('/MIN1_5', 'F.Cu', SW, (57.7, 102.54), (76.6, 102.54))
V('/MIN1_5', 73.6, 102.54)
V('/MIN1_5', 75.8, 102.54)
T('/MIN1_5', 'B.Cu', SW, (73.6, 102.54), (75.8, 102.54))
T('/MIN1_5', 'F.Cu', SW, (76.6, 102.54), (76.6, 120.2), (77.54, 120.2),
  (P['J13']['2'][0], P['J13']['2'][1]))
# MIDI IN 2: J14 -> R7 -> U10/D2
T('/MIN2_4', 'F.Cu', SW, (P['J14']['1'][0], P['J14']['1'][1]),
  (P['J14']['1'][0], 120.3), (P['R7']['1'][0], 120.3),
  (P['R7']['1'][0], P['R7']['1'][1]))
T('/MIN2_A', 'F.Cu', SW, (P['R7']['2'][0], P['R7']['2'][1]),
  (P['R7']['2'][0], 113.9), (78.6, 112.9), (P['U10']['1'][0], P['U10']['1'][1] + 0.6),
  (P['U10']['1'][0], P['U10']['1'][1]))
T('/MIN2_A', 'F.Cu', SW, (P['R7']['2'][0], 113.9), (P['R7']['2'][0] - 0.0, 109.3),
  (P['D2']['1'][0], P['D2']['1'][1] + 0.55), (P['D2']['1'][0], P['D2']['1'][1]))
T('/MIN2_5', 'F.Cu', SW, (P['D2']['2'][0], P['D2']['2'][1]),
  (P['D2']['2'][0] + 0.65, P['D2']['2'][1] + 0.7), (80.3, 111.9),
  (P['U10']['2'][0], 111.9), (P['U10']['2'][0], P['U10']['2'][1]))
T('/MIN2_5', 'F.Cu', SW, (P['U10']['2'][0], P['U10']['2'][1]), (82.9, 113.9),
  (82.9, 118.2), (P['J14']['2'][0], 118.2), (P['J14']['2'][0], P['J14']['2'][1]))
# MIDI OUT: pad27 -> B -> U11 -> R10 -> J15.1; R11 -> J15.2
sx, sy = P['U1']['27']
T('/MIDI_TX', 'F.Cu', SW, (sx, sy), (46.5, sy + 1.2))
V('/MIDI_TX', 46.5, sy + 1.2)
T('/MIDI_TX', 'B.Cu', SW, (46.5, sy + 1.2), (46.5, 96.0), (55.2, 96.0))
V('/MIDI_TX', 55.2, 96.0)
T('/MIDI_TX', 'F.Cu', SW, (55.2, 96.0), (64.4, 96.0))
V('/MIDI_TX', 64.4, 96.0)
T('/MIDI_TX', 'B.Cu', SW, (64.4, 96.0), (85.4, 96.0), (86.6, 97.2), (86.6, 105.0))
V('/MIDI_TX', 86.6, 105.0)
T('/MIDI_TX', 'F.Cu', SW, (86.6, 105.0), (86.6, 113.5),
  (P['U11']['2'][0], 113.5), (P['U11']['2'][0], P['U11']['2'][1]))
T('/MOUT_Y', 'F.Cu', SW, (P['U11']['4'][0], P['U11']['4'][1]),
  (P['U11']['4'][0], 112.3), (P['R10']['1'][0], 112.3),
  (P['R10']['1'][0], P['R10']['1'][1]))
T('/MOUT5', 'F.Cu', SW, (P['R10']['2'][0], P['R10']['2'][1]),
  (P['J15']['1'][0], P['R10']['2'][1]), (P['J15']['1'][0], P['J15']['1'][1]))
T('/MOUT4', 'F.Cu', SW, (P['R11']['2'][0], P['R11']['2'][1]),
  (P['J15']['2'][0], 120.4), (P['J15']['2'][0], P['J15']['2'][1]))

# ---- CAN ----
sx, sy = P['U1']['23']  # CAN_TX (pad 23, y 95.88)
T('/CAN_TX', 'F.Cu', SW, (sx, sy), (31.2, sy + 0.5), (31.2, 123.6), (83.0, 123.6),
  (83.0, 106.0))
V('/CAN_TX', 83.0, 106.0)
T('/CAN_TX', 'B.Cu', SW, (83.0, 106.0), (83.0, P['U12']['1'][1] + 0.9),
  (P['U12']['1'][0] - 0.6, P['U12']['1'][1] + 0.3))
V('/CAN_TX', P['U12']['1'][0] - 0.6, P['U12']['1'][1] + 0.3)
T('/CAN_TX', 'F.Cu', SW, (P['U12']['1'][0] - 0.6, P['U12']['1'][1] + 0.3),
  (P['U12']['1'][0], P['U12']['1'][1]))
sx, sy = P['U1']['22']  # CAN_RX (pad 22, y 93.34)
T('/CAN_RX', 'F.Cu', SW, (sx, sy), (30.5, sy + 0.5), (30.5, 124.1), (83.7, 124.1),
  (83.7, 107.0))
V('/CAN_RX', 83.7, 107.0)
T('/CAN_RX', 'B.Cu', SW, (83.7, 107.0), (83.7, P['U12']['4'][1] + 0.5),
  (P['U12']['4'][0] - 0.6, P['U12']['4'][1]))
V('/CAN_RX', P['U12']['4'][0] - 0.6, P['U12']['4'][1])
T('/CAN_RX', 'F.Cu', SW, (P['U12']['4'][0] - 0.6, P['U12']['4'][1]),
  (P['U12']['4'][0], P['U12']['4'][1]))
# CAN_RS -> R13
T('/CAN_RS', 'F.Cu', SW, (P['U12']['8'][0], P['U12']['8'][1]),
  (P['U12']['8'][0] + 0.8, P['U12']['8'][1] - 0.8), (P['R13']['1'][0], 99.3),
  (P['R13']['1'][0], P['R13']['1'][1]))
# CANH: pin7 -> B-hop over de +12V-kolom -> R12.1; verder -> J16.2
T('/CANH', 'F.Cu', SW, (P['U12']['7'][0], P['U12']['7'][1]), (89.8, P['U12']['7'][1]),
  (89.8, 104.0), (92.775, 104.0))
V('/CANH', 92.9, 104.0)
T('/CANH', 'F.Cu', SW, (92.775, 104.0), (92.9, 104.0))
T('/CANH', 'B.Cu', SW, (92.9, 104.0), (95.0, 104.0))
V('/CANH', 95.0, 104.0)
T('/CANH', 'F.Cu', SW, (95.0, 104.0), (P['R12']['1'][0], 104.0),
  (P['R12']['1'][0], P['R12']['1'][1]))
T('/CANH', 'F.Cu', .4, (P['R12']['1'][0], P['R12']['1'][1]), (110.3, P['R12']['1'][1]),
  (110.3, 119.5), (P['J16']['2'][0], 119.5), (P['J16']['2'][0], P['J16']['2'][1]))
# CAN_TRM: R12.2 -> JP1.1
T('/CAN_TRM', 'F.Cu', SW, (P['R12']['2'][0], P['R12']['2'][1]),
  (P['JP1']['1'][0], P['R12']['2'][1] + 0.0), (P['JP1']['1'][0], P['JP1']['1'][1]))
# CANL: pin6 -> B-hop -> JP1.2 -> J16.3
T('/CANL', 'F.Cu', SW, (P['U12']['6'][0], P['U12']['6'][1]), (90.5, P['U12']['6'][1]),
  (90.5, 105.2), (92.775, 105.2))
V('/CANL', 92.9, 105.2)
T('/CANL', 'F.Cu', SW, (92.775, 105.2), (92.9, 105.2))
T('/CANL', 'B.Cu', SW, (92.9, 105.2), (95.0, 105.2))
V('/CANL', 95.0, 105.2)
T('/CANL', 'F.Cu', SW, (95.0, 105.2), (P['JP1']['2'][0], 105.2),
  (P['JP1']['2'][0], P['JP1']['2'][1]))
T('/CANL', 'F.Cu', .4, (P['JP1']['2'][0], P['JP1']['2'][1]), (111.1, 107.0),
  (111.1, 119.9), (P['J16']['3'][0], 119.9), (P['J16']['3'][0], P['J16']['3'][1]))
# +12V -> J16.1
T('+12V', 'F.Cu', .4, (93.2, 116.7), (101.2, 116.7), (101.2, 120.7),
  (P['J16']['1'][0], 120.7), (P['J16']['1'][0], P['J16']['1'][1]))

# ---- EXP zuid (J10) ----
sx, sy = P['U1']['24']  # D32 -> pin9 (43.16)
T('/D32', 'F.Cu', SW, (sx, sy), (29.9, sy + 0.5), (29.9, 123.3), (43.16, 123.3),
  (P['J10']['9'][0], P['J10']['9'][1]))
sx, sy = P['U1']['21']  # D29 -> pin7 (40.62)
T('/D29', 'F.Cu', SW, (sx, sy), (29.2, sy + 0.5), (29.2, 122.7), (40.62, 122.7),
  (P['J10']['7'][0], P['J10']['7'][1]))
sx, sy = P['U1']['12']  # D10: gap-kolom x 39.545 -> pin5 (38.08)
T('/D10', 'F.Cu', SW, (sx, sy), (31, sy + 0.86), (38.685, sy + 0.86), (39.545, sy + 1.72),
  (39.545, 122.1), (38.08, 122.1), (P['J10']['5'][0], P['J10']['5'][1]))
sx, sy = P['U1']['25']  # D33: geheel B -> pin11 (45.7)
T('/D33', 'B.Cu', SW, (sx, sy), (46.2, sy + 0.96), (46.2, 122.5),
  (45.7, 122.5), (P['J10']['11'][0], P['J10']['11'][1]))
# D36-39: oostkolommen -> noordrijen -> even pinnen 6/8/10/12
D3X = [('/D36', '28', 46.9, '6', 116.3), ('/D37', '29', 47.7, '8', 116.85),
       ('/D38', '30', 48.5, '10', 117.4), ('/D39', '31', 49.3, '12', 117.95)]
for net, tpad, colx, jpin, rowy in D3X:
    sx, sy = P['U1'][tpad]
    jx, jy = P['J10'][jpin]
    T(net, 'F.Cu', SW, (sx, sy), (colx, sy + 0.9), (colx, rowy), (jx, rowy), (jx, jy))

# ---- codec noordwest (J17) ----
# oost-groep: pads 44/45/43/42 -> F-jogs -> F-kolommen -> B-jogs -> B-kolommen
# -> B-rijen -> J17 even pinnen (pinvolgorde: 2=RST? nee: 2=CODEC_RST zit in map)
CODEC_E = [
    # net, teensy-pad, mid_y, fcol, bjog_y, bcol, row_y, j17-pin
    ('/MCLK1', '45', 46.35, 46.6, 44.8, 54.59, 17.15, '4'),
    ('/CODEC_RST', '44', 48.89, 47.4, 45.4, 57.13, 16.65, '2'),
    ('/BCLK1', '43', 51.43, 48.2, 44.2, 52.05, 17.65, '6'),
    ('/LRCLK1', '42', 53.97, 49.0, 43.6, 49.51, 18.15, '8'),
]
for net, tpad, midy, fcol, bjy, bcol, rowy, jpin in CODEC_E:
    sx, sy = P['U1'][tpad]
    jx, jy = P['J17'][jpin]
    T(net, 'F.Cu', SW, (sx, sy), (46.1, midy), (fcol, midy), (fcol, bjy))
    V(net, fcol, bjy)
    T(net, 'B.Cu', SW, (fcol, bjy), (bcol, bjy), (bcol, rowy), (jx, rowy), (jx, jy))
# west-groep: I2S_OUT/IN via westkolommen + B-hop over de DISP-rijen
CODEC_W = [('/I2S_OUT', '9', 28.1, 18.65, '10'), ('/I2S_IN', '10', 27.4, 19.15, '12')]
for net, tpad, colx, rowy, jpin in CODEC_W:
    sx, sy = P['U1'][tpad]
    jx, jy = P['J17'][jpin]
    T(net, 'F.Cu', SW, (sx, sy), (colx + 0.8, sy), (colx, sy - 0.8), (colx, 35.3))
    V(net, colx, 35.3)
    T(net, 'B.Cu', SW, (colx, 35.3), (colx, rowy), (jx, rowy), (jx, jy))
# J17-voeding: westrand-kolommen, genest de oneven rij in
PWR_W = [('-12V', '13', 16.4, 17.5), ('+12V', '11', 17.1, 18.1),
         ('+5V', '3', 17.8, 18.7), ('+3V3', '1', 18.5, 19.3)]
for net, jpin, colx, rowy in PWR_W:
    jx, jy = P['J17'][jpin]
    T(net, 'F.Cu', .4, (colx, rowy), (jx, rowy), (jx, jy))
T('-12V', 'F.Cu', .4, (16.4, 17.5), (16.4, 107.3), (21.3, 107.3), (22, 108))
T('+12V', 'F.Cu', .4, (17.1, 18.1), (17.1, 118.9), (21.2, 118.9), (22, 118.16))
T('+5V', 'F.Cu', .4, (17.8, 18.7), (17.8, 103.4))
V('+5V', 17.8, 103.4)
T('+5V', 'B.Cu', .4, (17.8, 103.4), (65.5, 103.4), (67.08, 101.8), (67.08, 87.75))
V('+5V', 67.08, 87.75)
T('+5V', 'F.Cu', .4, (67.08, 87.75), (67.08, 86.99))
T('+3V3', 'F.Cu', .4, (18.5, 19.3), (18.5, 104.4))
V('+3V3', 18.5, 104.4)
T('+3V3', 'B.Cu', .4, (18.5, 104.4), (28.0, 104.4), (28.6, 103.81), (82.55, 103.81),
  (83.15, 104.41))
V('+3V3', 83.15, 104.41)
T('+3V3', 'F.Cu', .4, (83.15, 104.41), (83.15, 104.0))

# ---- TUNE (noordwest) ----
T('/TUNE_J', 'F.Cu', SW, (P['J18']['1'][0], P['J18']['1'][1]),
  (P['J18']['1'][0], 12.9), (P['R14']['1'][0] - 0.7, 12.2),
  (P['R14']['1'][0], P['R14']['1'][1]))
T('/TUNE_N', 'F.Cu', SW, (P['R14']['2'][0], P['R14']['2'][1]),
  (P['R15']['1'][0], P['R15']['1'][1]))
T('/TUNE_N', 'F.Cu', SW, (48.8, 12.2), (48.8, 13.3), (48, 13.3),
  (P['D3']['3'][0], P['D3']['3'][1]))
T('/TUNE_N', 'F.Cu', SW, (49.6, 12.2), (50.1, 12.7), (50.1, 14.1), (54, 14.1),
  (P['U13']['2'][0], P['U13']['2'][1]))
T('/TUNE_T', 'F.Cu', SW, (P['U13']['4'][0], P['U13']['4'][1]), (55.6, P['U13']['4'][1]),
  (55.6, 11.4), (21.9, 11.4), (21.9, 44.2))
V('/TUNE_T', 21.9, 44.2)
T('/TUNE_T', 'B.Cu', SW, (21.9, 44.2), (29.12, 44.2), (30, 45.08))
T('+3V3', 'F.Cu', .4, (P['D3']['2'][0], P['D3']['2'][1]), (P['D3']['2'][0], 14.6),
  (52.4, 14.6), (52.4, 15.55), (P['U13']['5'][0], P['U13']['5'][1]))
T('+3V3', 'F.Cu', .4, (P['U13']['5'][0], P['U13']['5'][1]), (53.05, 14.2),
  (P['C14']['1'][0], 14.2), (P['C14']['1'][0], P['C14']['1'][1]))

# ---- DLG1/DLG2: B-rijen west -> westrand-kolommen -> zuid-B-rijen -> headers ----
DLG = [('/DLG1_TX', '36', 19.8, 61.59, 'J19', '2', 116.6),
       ('/DLG1_RX', '37', 19.0, 64.13, 'J19', '3', 117.15),
       ('/DLG2_TX', '38', 18.2, 66.67, 'J20', '2', 117.7),
       ('/DLG2_RX', '39', 17.4, 69.21, 'J20', '3', 120.23)]
for net, tpad, colx, rowy, jref, jpin, sry in DLG:
    sx, sy = P['U1'][tpad]
    jx, jy = P[jref][jpin]
    T(net, 'B.Cu', SW, (sx, sy), (sx - 0.9, rowy), (colx, rowy), (colx, sry),
      (jx - 0.9, sry), (jx, sry + 0.9 if sry < 119 else 120.9), (jx, jy))

# ---- voedingstaps nieuwe IC's ----
# U4 VCC (pin24, linksonder): korte kolom -> +3V3-lane
px, py = P['U4']['24']
T('+3V3', 'F.Cu', .4, (px, py), (px - 1.0, py + 1.0), (px - 1.0, 79.9), (px + 0.4, 81.3))
V('+3V3', px + 0.4, 81.3)
T('+3V3', 'F.Cu', .4, (P['C10']['1'][0], P['C10']['1'][1]), (px - 1.0, P['C10']['1'][1]))
# U5/C15/R5: op de +3V3-B-rij y 103.81
T('+3V3', 'F.Cu', .4, (P['U5']['16'][0], P['U5']['16'][1]), (P['U5']['16'][0], 97.3),
  (31.5, 97.3))
T('+3V3', 'F.Cu', .4, (P['R5']['1'][0], P['R5']['1'][1]), (31.5, 97.3))
V('+3V3', 30.8, 102.9)
T('+3V3', 'F.Cu', .4, (31.5, 97.3), (30.8, 98.0), (30.8, 102.9))
T('+3V3', 'B.Cu', .4, (30.8, 102.9), (30.8, 103.81))
T('+3V3', 'F.Cu', .4, (P['C15']['1'][0], P['C15']['1'][1]), (P['C15']['1'][0], 102.9),
  (30.8, 102.9))
# U7/C17
T('+3V3', 'F.Cu', .4, (P['U7']['5'][0], P['U7']['5'][1]), (P['C17']['1'][0], P['U7']['5'][1]),
  (P['C17']['1'][0], P['C17']['1'][1]))
T('+3V3', 'F.Cu', .4, (P['C17']['1'][0], P['C17']['1'][1]), (63.5, 81.3))
V('+3V3', 63.5, 81.3)
# U8/C11: kolom door de slot3-gap naar de +3V3-lane
T('+3V3', 'F.Cu', .4, (P['U8']['1'][0], P['U8']['1'][1]), (P['U8']['1'][0], 33.9),
  (113.1, 33.9), (113.1, 81.3))
V('+3V3', 113.1, 81.3)
T('+3V3', 'F.Cu', .4, (P['U8']['20'][0], P['U8']['20'][1]), (P['U8']['20'][0], 27.0),
  (P['C11']['1'][0], 27.0), (P['C11']['1'][0], P['C11']['1'][1]))
T('+3V3', 'F.Cu', .4, (P['U8']['20'][0], 27.0), (P['U8']['1'][0], 27.0),
  (P['U8']['1'][0], P['U8']['1'][1] - 0.0))
# U6/C16/R33: oostkolom x 153.4 -> +3V3-lane
T('+3V3', 'F.Cu', .4, (P['U6']['16'][0], P['U6']['16'][1]), (P['U6']['16'][0], 12.2),
  (153.4, 12.2))
T('+3V3', 'F.Cu', .4, (153.4, 12.2), (P['C16']['1'][0], 12.2),
  (P['C16']['1'][0], P['C16']['1'][1]))
T('+3V3', 'F.Cu', .4, (P['R33']['1'][0], P['R33']['1'][1]), (P['R33']['1'][0], 10.9),
  (153.4, 10.9), (153.4, 12.2))
T('+3V3', 'F.Cu', .4, (153.4, 12.2), (153.4, 36.6))
V('+3V3', 153.4, 36.6)
T('+3V3', 'B.Cu', .4, (153.4, 36.6), (153.4, 63.9), (154.2, 64.7), (154.2, 80.5),
  (155.0, 81.3))
# optos/R8/C12
T('+3V3', 'F.Cu', .4, (P['R8']['1'][0], P['R8']['1'][1]), (P['R8']['1'][0], 103.0))
V('+3V3', P['R8']['1'][0], 103.0)
T('+3V3', 'B.Cu', .4, (P['R8']['1'][0], 103.0), (70.2, 103.81))
T('+3V3', 'F.Cu', .4, (P['U9']['6'][0], P['U9']['6'][1]), (61.0, P['U9']['6'][1]),
  (61.0, 94.0), (P['C12']['1'][0], 92.4), (P['C12']['1'][0], P['C12']['1'][1]))
V('+3V3', 61.0, 94.0)
T('+3V3', 'B.Cu', .4, (61.0, 94.0), (61.0, 103.81))
T('+3V3', 'F.Cu', .4, (P['U10']['6'][0], P['U10']['6'][1]), (P['U10']['6'][0], 103.5))
V('+3V3', P['U10']['6'][0], 103.5)
T('+3V3', 'B.Cu', .4, (P['U10']['6'][0], 103.5), (P['U10']['6'][0] - 0.3, 103.81))
# U11/R11 +3V3
T('+3V3', 'F.Cu', .4, (P['U11']['5'][0], P['U11']['5'][1]), (P['U11']['5'][0], 118.4),
  (P['R11']['1'][0], 118.4), (P['R11']['1'][0], P['R11']['1'][1]))
V('+3V3', P['U11']['5'][0], 111.7)
T('+3V3', 'F.Cu', .4, (P['U11']['5'][0], P['U11']['5'][1]), (P['U11']['5'][0], 111.7))
T('+3V3', 'B.Cu', .4, (P['U11']['5'][0], 111.7), (89.9, 108.5), (89.9, 104.51),
  (89.2, 103.81))
# U12/C13/R9.1 +3V3
T('+3V3', 'F.Cu', .4, (P['U12']['3'][0], P['U12']['3'][1]), (82.5, P['U12']['3'][1]),
  (82.5, 98.2), (83.4, 97.5), (P['C13']['1'][0], P['C13']['1'][1]))
T('+3V3', 'F.Cu', .4, (P['C13']['1'][0], P['C13']['1'][1]), (84.4, 98.0), (84.4, 99.3),
  (89.9, 99.3), (89.9, 104.9), (P['R9']['1'][0], 105.55),
  (P['R9']['1'][0], P['R9']['1'][1]))

# ---- QWIIC (J12 op 202,121.5) ----
V('+3V3', 204.54, 81.3)
T('+3V3', 'F.Cu', .4, (204.54, 81.3), (204.54, 121.5))
V('/SDA', 207.08, 75.62)
T('/SDA', 'B.Cu', SW, (187.4, 75.62), (207.08, 75.62))
T('/SDA', 'F.Cu', SW, (207.08, 75.62), (207.08, 121.5))
V('/SCL', 209.62, 76.89)
T('/SCL', 'B.Cu', SW, (188.2, 76.89), (209.62, 76.89))
T('/SCL', 'F.Cu', SW, (209.62, 76.89), (209.62, 121.5))
# J12-pads 2..4 zitten op 204.54/207.08/209.62 (pin1=GND=zone)

# ---- GND-hechtvia's ----
for sx_, sy_ in ((20, 22), (210, 20), (20, 122), (210, 118), (120, 36.8), (66, 36.8),
                 (180, 36.8), (120, 124), (185, 121), (209, 80), (28, 90),
                 (150, 124), (90, 12), (150, 20.3), (57, 124), (110, 124),
                 (44, 22), (100, 11), (170, 12), (62, 11)):
    V('GND', sx_, sy_)
# eiland-hechtvia's: automatisch geplaatst door gnd_stitch.py (clearance-gecheckt)
import json as _json
_stitch = _os_path = None
try:
    import os as _os3
    _sf = _os3.path.join(_os3.path.dirname(OUT), 'gnd_stitch.json')
    if _os3.path.exists(_sf):
        for _sx, _sy in _json.load(open(_sf)):
            V('GND', _sx, _sy)
except Exception as _e:
    print('gnd_stitch:', _e)

_tu = [0]
def tuid():
    _tu[0] += 1
    return f'c4000000-0000-4000-8000-{_tu[0]:012d}'

# Koper-modus (2026-07-11): de handrouting hierboven stamt van vóór de
# placement-reparatie en is grotendeels kapot (99 netten met DRC-fouten).
# BUS2_NOROUTE=1 -> alleen GND-hechtvia's emitten (placement-bord voor de
# DSN-export); zonder env-var wordt een aanwezige SES (freerouting) native
# toegepast bovenop de GND-via's.
import os as _os2
_ses_path = _os2.path.join(_os2.path.dirname(OUT), 'musicbrain-busboard-v2.ses')
if _os2.environ.get('BUS2_NOROUTE') or _os2.path.exists(_ses_path):
    tracks = []
    vias = [v for v in vias if v[0] == NI['GND']]
if not _os2.environ.get('BUS2_NOROUTE') and _os2.path.exists(_ses_path):
    import seslib as _seslib
    # /CAN_TX en /IRQ5 komen volledig uit de hybride na-run (bus2-hybrid.ses);
    # hun partiele stukken in de hoofd-SES slaan we over
    _ses2 = _os2.path.join(_os2.path.dirname(OUT), 'bus2-hybrid.ses')
    _HYB = {'/CAN_TX', '/IRQ5'} if _os2.path.exists(_ses2) else set()
    _st, _sv = _seslib.load_ses(_ses_path)
    _n = _nv = 0
    for _name, _layer, _width, _pts in _st:
        if _name in NI and _name != 'GND' and _name not in _HYB:
            tracks.append((NI[_name], _layer, max(_width, 0.2), _pts))
            _n += 1
    for _name, _x, _y in _sv:
        if _name in NI and _name != 'GND' and _name not in _HYB:
            vias.append((NI[_name], _x, _y))
            _nv += 1
    print(f'SES: {_n} sporen, {_nv} vias overgenomen')
    if _HYB:
        _st2, _sv2 = _seslib.load_ses(_ses2)
        _n2 = _nv2 = 0
        for _name, _layer, _width, _pts in _st2:
            if _name in _HYB:
                tracks.append((NI[_name], _layer, max(_width, 0.2), _pts))
                _n2 += 1
        for _name, _x, _y in _sv2:
            if _name in _HYB:
                vias.append((NI[_name], _x, _y))
                _nv2 += 1
        print(f'SES2 (hybride CAN_TX/IRQ5): {_n2} sporen, {_nv2} vias')

track_txt = []
for net, layer, w, pts in tracks:
    for a, b in zip(pts, pts[1:]):
        if tuple(a) == tuple(b):
            continue
        track_txt.append(f'  (segment (start {fmt(a[0])} {fmt(a[1])}) (end {fmt(b[0])} {fmt(b[1])}) '
                         f'(width {w}) (layer "{layer}") (net {net}) (uuid "{tuid()}"))')
for net, x, y in vias:
    track_txt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                     f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{tuid()}"))')

header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A3")
  (title_block
    (title "MusicBrain SPI-busboard v2")
    (date "2026-07-11")
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

extras = f'''
  (gr_rect (start {BX0} {BY0}) (end {BX1} {BY1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "musicbrain.nl/hw/busboard rev 2.0 - 16xCS/12xIRQ + expansie + MIDI/CAN/codec/TUNE" (at 140 86 0) (layer "F.SilkS")
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

out = (header + nets_block + '\n' + '\n'.join(fp_texts) + '\n'
       + '\n'.join(track_txt) + extras
       + zone('F.Cu') + zone('B.Cu') + '\n)\n')
open(OUT, 'w', encoding='utf-8', newline='\n').write(out)
print('written', OUT, f'({len(track_txt)} routed items)')
