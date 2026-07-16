"""Generate musicbrain-busboard.kicad_pcb (v3) — v2-floorplan per doc/busboard-v2-plan.md.

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
    'J7': (1.27, -6.5), 'J8': (2, -6.5), 'J9': (1.27, -6.5),     # HUB1/HUB2/PWRIN IDC 2x5
    'J10': (5.5, 9),                                             # EXP 2x7
    'J11': (-1, -3.5),                                           # DISPLAY 1x9
    'J12': (3.9, 3.81), 'J16': (3.9, 3.81),                      # QWIIC / CAN
    'J13': (3.9, 2.54), 'J14': (3.9, 2.54), 'J15': (3.9, 2.54),  # MIDI 1x3
    'J17': (2.5, -6.15),                                         # AUDIO/CODEC 2x7
    'J18': (-3.5, -1),                                           # TUNE 1x2
    'J19': (3.9, 3.81), 'J20': (3.9, 3.81),                      # DLG 1x4
    'J21': (2.5, -7.5),                                          # EXPANSION IDC 2x13
    'J22': (3.9, 2.54),                                          # MIDI OUT2 1x3
    'J23': (1.27, -6.5),                                         # USB HOST 2x5
    'J24': (2.5, -6.15),                                         # AUDIOHUB 2x7
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

# ---------- nets (v3) ----------
NETS = (['', '+3V3', '+5V', '+12V', '-12V', 'GND',
         '/SCLK', '/MOSI', '/MISO', '/LDAC', '/SDA', '/SCL', '/CONVST', '/SPARE2',
         'Net-(U1-11{slash}MOSI)', 'Net-(U1-13{slash}SCK)']
        + [f'/CS{i}' for i in range(1, 15)] + [f'/IRQ{i}' for i in range(1, 13)]
        + [f'/I2SD{i}' for i in range(1, 7)]
        + ['/CSA0', '/CSA1', '/CSA2', '/CSA3', '/CS_EN', '/IRQSTAT', '/PL', '/PL2',
           '/CHAIN', '/Q7A',
           '/XSCLK0', '/XMOSI0', '/XLDAC0', '/XCONVST0', '/XRST0',
           '/XSCLK', '/XMOSI', '/XLDAC', '/XCONVST', '/XRST',
           '/I2S_OUT', '/I2S_IN', '/MCLK', '/BCLK', '/LRCLK', '/CODEC_RST',
           '/MIDI_RX1', '/MIDI_RX2', '/MIDI_TX', '/MIDI_TX2',
           '/MOUT_Y', '/MOUT4', '/MOUT5', '/MOUT2_Y', '/MOUT2_4', '/MOUT2_5',
           '/MIN1_4', '/MIN1_5', '/MIN1_A', '/MIN2_4', '/MIN2_5', '/MIN2_A',
           '/CAN_TX', '/CAN_RX', '/CAN_RS', '/CANH', '/CANL', '/CAN_TRM',
           '/TUNE_J', '/TUNE_N', '/TUNE_T',
           '/DLG1_TX', '/DLG1_RX', '/DLG2_TX', '/DLG2_RX',
           '/D10', '/D32', '/D33', '/D36', '/D37', '/D38', '/D39',
           '/USBH_1', '/USBH_2', '/USBH_3', '/USBH_4', '/USBH_5',
           '/DISP_CS', '/DISP_RST', '/DISP_DC', '/MOSI1', '/SCK1'])
NI = {n: i for i, n in enumerate(NETS)}
def nm(m): return {p: (NI[n], n) for p, n in m.items()}
def rc(a, b): return nm({'1': a, '2': b})

TEENSY_MAP = nm({'1': 'GND', '2': '/DISP_CS', '3': '/TUNE_T', '4': '/LDAC',
                 '5': '/CSA0', '6': '/CSA1', '7': '/CSA2', '8': '/CSA3',
                 '9': '/I2S_OUT', '10': '/I2S_IN', '11': '/CS_EN', '12': '/D10',
                 '13': 'Net-(U1-11{slash}MOSI)', '14': '/MISO',
                 '16': '/DISP_DC', '17': '/DISP_RST', '18': '/MOSI1', '19': '/SCK1',
                 '20': '/MIDI_RX2', '21': '/MIDI_TX2', '22': '/CAN_RX', '23': '/CAN_TX',
                 '24': '/D32', '25': '/D33', '26': '/MIDI_RX1', '27': '/MIDI_TX',
                 '28': '/D36', '29': '/D37', '30': '/D38', '31': '/D39',
                 '32': '/CONVST', '33': '/SPARE2', '34': 'GND',
                 '35': 'Net-(U1-13{slash}SCK)',
                 '36': '/DLG1_TX', '37': '/DLG1_RX', '38': '/DLG2_TX', '39': '/DLG2_RX',
                 '40': '/SDA', '41': '/SCL', '42': '/LRCLK', '43': '/BCLK',
                 '44': '/CODEC_RST', '45': '/MCLK', '47': 'GND', '48': '+5V'})

def slot_map(i):
    """Gen 2: slot 2x12 per spi-bus-spec v2.0 (CONVST=19, GND-guard=20, audio 21-24)."""
    return nm({'1': 'GND', '2': '+12V', '3': 'GND', '4': '-12V', '5': 'GND',
               '6': '+3V3', '7': '/SCLK', '8': 'GND', '9': '/MOSI', '10': 'GND',
               '11': '/MISO', '12': 'GND', '13': f'/CS{i}', '14': 'GND',
               '15': '/LDAC', '16': f'/IRQ{i}', '17': '/SDA', '18': '/SCL',
               '19': '/CONVST', '20': 'GND', '21': '/MCLK', '22': '/BCLK',
               '23': '/LRCLK', '24': f'/I2SD{i}'})

def hub_map(cs):
    return nm({'1': 'GND', '2': cs, '3': '/MISO', '4': '/MOSI', '5': '/SCLK',
               '6': 'GND', '7': '+3V3', '8': 'GND', '9': '-12V', '10': '+12V'})

J9_MAP = nm({'1': '-12V', '2': '-12V', '3': 'GND', '4': 'GND', '5': 'GND',
             '6': 'GND', '7': 'GND', '8': 'GND', '9': '+12V', '10': '+12V'})
U2_MAP = nm({'1': '+12V', '2': 'GND', '3': '+5V'})
U3_MAP = nm({'1': 'GND', '2': '+3V3', '3': '+5V'})
J10_MAP = nm({'1': '+3V3', '2': 'GND', '3': '+5V', '4': 'GND',
              '5': '/D10', '6': '/D33', '8': '/D32',
              '9': '/D36', '10': '/D37', '11': '/D38', '12': '/D39',
              '13': 'GND', '14': 'GND'})   # pin 7 nc: D29 is MIDI OUT2 geworden
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
             '5': '/CONVST', '6': '/SPARE2', '7': 'GND', '8': 'GND', '9': 'GND',
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
U14_MAP = nm({'2': '/MIDI_TX2', '3': 'GND', '4': '/MOUT2_Y', '5': '+3V3'})
D3_MAP = nm({'1': 'GND', '2': '+3V3', '3': '/TUNE_N'})
J13_MAP = nm({'1': '/MIN1_4', '2': '/MIN1_5'})
J14_MAP = nm({'1': '/MIN2_4', '2': '/MIN2_5'})
J15_MAP = nm({'1': '/MOUT5', '2': '/MOUT4', '3': 'GND'})
J22_MAP = nm({'1': '/MOUT2_5', '2': '/MOUT2_4', '3': 'GND'})
J16_MAP = nm({'1': '+12V', '2': '/CANH', '3': '/CANL', '4': 'GND'})
J17_MAP = nm({'1': '+3V3', '3': '+5V', '5': 'GND', '7': 'GND', '9': 'GND',
              '11': '+12V', '13': '-12V',
              '2': '/CODEC_RST', '4': '/MCLK', '6': '/BCLK', '8': '/LRCLK',
              '10': '/I2S_OUT', '12': '/I2S_IN', '14': 'GND'})
J18_MAP = nm({'1': '/TUNE_J', '2': 'GND'})
J19_MAP = nm({'1': 'GND', '2': '/DLG1_TX', '3': '/DLG1_RX', '4': 'GND'})
J20_MAP = nm({'1': 'GND', '2': '/DLG2_TX', '3': '/DLG2_RX', '4': 'GND'})
JP1_MAP = nm({'1': '/CAN_TRM', '2': '/CANL'})
J23_MAP = nm({'1': '/USBH_1', '2': '/USBH_1', '3': '/USBH_2', '4': '/USBH_2',
              '5': '/USBH_3', '6': '/USBH_3', '7': '/USBH_4', '8': '/USBH_4',
              '9': '/USBH_5', '10': '/USBH_5'})
J24_MAP = nm({'1': '/MCLK', '3': '/LRCLK', '5': '/I2SD1', '7': '/I2SD3',
              '9': '/I2SD5', '11': 'GND', '13': 'GND',
              '2': '/BCLK', '4': 'GND', '6': '/I2SD2', '8': '/I2SD4',
              '10': '/I2SD6', '12': 'GND', '14': 'GND'})

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


# ---------- floorplan v3 ----------
# Bord 203,2 x 128,5 (40 HP x 3U-paneelvlak), origin (15,10) zoals v2.
# Slotveld gecentreerd: hart-x 116,6 / hart-y 74,25; steek 20,32 (4 HP).
# Socket-anker = pin 1 (noordwest); slot-hart = anker + (1,27, 13,97).
BX0, BY0, BX1, BY1 = 15, 10, 218.2, 138.5
SLOTX = [64.53 + 20.32 * k for k in range(6)]   # 64,53 .. 166,13
SLOTY = 60.28                                    # 60,28 .. 88,22 (hart 74,25)

PH = 'Connector_PinHeader_2.54mm.pretty\\PinHeader_'
PHL = 'Connector_PinHeader_2.54mm:PinHeader_'
RSMD = ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
        'Resistor_SMD:R_0805_2012Metric')
CSMD = ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
        'Capacitor_SMD:C_0805_2012Metric')

FPS = [
    # ---- voedingshoek zuidwest: entry + beide regelaars + ontkoppelbank ----
    ('Connector_IDC.pretty\\IDC-Header_2x05_P2.54mm_Vertical.kicad_mod',
     'Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical', 'J9', 'PWR IN', 22, 121.5, J9_MAP, 0),
    ('Converter_DCDC.pretty\\Converter_DCDC_RECOM_R-78E-0.5_THT.kicad_mod',
     'Converter_DCDC:Converter_DCDC_RECOM_R-78E-0.5_THT', 'U2', 'R-78E5.0-1.0', 42, 124, U2_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U3', 'AMS1117-3.3', 60, 124, U3_MAP, 0),
    # 33R serie in SCLK/MOSI bij de Teensy (tussen de socketstroken = ok)
    RSMD + ('R1', '33R', 53, 78.02, rc('Net-(U1-13{slash}SCK)', '/SCLK'), 0),
    RSMD + ('R2', '33R', 49.5, 76.75, rc('/MOSI', 'Net-(U1-11{slash}MOSI)'), 180),
    # I2C pull-ups bij de Qwiic-hoek
    RSMD + ('R3', '2k2', 199, 124, rc('+3V3', '/SDA'), 0),
    RSMD + ('R4', '2k2', 199, 127, rc('+3V3', '/SCL'), 0),
]
# ontkoppelbank op de +-rails (zuid, oost van U3)
CAPS = [('C1', 'CP', '10u', 120, '+12V'), ('C2', 'C', '100n', 128.89, '+12V'),
        ('C3', 'CP', '10u', 137.78, None), ('C4', 'C', '100n', 146.67, None),
        ('C5', 'CP', '10u', 155.56, '+5V'), ('C6', 'C', '100n', 164.45, '+5V'),
        ('C7', 'CP', '10u', 173.34, '+3V3'), ('C8', 'C', '100n', 182.23, '+3V3')]
for ref, kind, val, cx, rail in CAPS:
    if kind == 'CP':
        f, lib = 'Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod', 'Capacitor_SMD:CP_Elec_4x5.3'
    else:
        f, lib = CSMD
    netmap = rc(rail, 'GND') if rail else rc('GND', '-12V')
    FPS.append((f, lib, ref, val, cx, 124, netmap, 0))
# ---- slotveld: 6x 2x12-socket, gecentreerd op het bordhart ----
for i in range(1, 7):
    FPS.append(('Connector_PinSocket_2.54mm.pretty\\PinSocket_2x12_P2.54mm_Vertical.kicad_mod',
                'Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical',
                f'J{i}', f'SLOT {i}', SLOTX[i - 1], SLOTY, slot_map(i), 0))
# ---- hubs oost ----
for h, cs, hy in ((7, '/CS7', 45), (8, '/CS8', 100)):
    FPS.append(('Connector_IDC.pretty\\IDC-Header_2x05_P2.54mm_Vertical.kicad_mod',
                'Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical',
                f'J{h}', f'HUB {h-6}', 196, hy, hub_map(cs), 0))
# ---- zuidrand: EXP, DLG, MIDI (2x2!), CAN, QWIIC ----
FPS += [
    (PH + '2x07_P2.54mm_Vertical.kicad_mod', PHL + '2x07_P2.54mm_Vertical',
     'J10', 'EXP', 41, 135, J10_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J19', 'DLG1', 60, 135, J19_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J20', 'DLG2', 71.5, 135, J20_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J13', 'MIDI IN1', 83, 135, J13_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J14', 'MIDI IN2', 92, 135, J14_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J15', 'MIDI OUT', 101, 135, J15_MAP, 90),
    (PH + '1x03_P2.54mm_Vertical.kicad_mod', PHL + '1x03_P2.54mm_Vertical',
     'J22', 'MIDI OUT2', 110, 135, J22_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J16', 'CAN', 120, 135, J16_MAP, 90),
    (PH + '1x04_P2.54mm_Vertical.kicad_mod', PHL + '1x04_P2.54mm_Vertical',
     'J12', 'QWIIC', 198, 135, J12_MAP, 90),
]
# ---- noordrand: display, codec, TUNE, USB-doorvoer ----
FPS += [
    (PH + '1x09_P2.54mm_Vertical.kicad_mod', PHL + '1x09_P2.54mm_Vertical',
     'J11', 'DISPLAY', 33, 20, J11_MAP, 90),
    (PH + '2x07_P2.54mm_Vertical.kicad_mod', PHL + '2x07_P2.54mm_Vertical',
     'J17', 'AUDIO/CODEC', 39.35, 13.5, J17_MAP, 270),
    (PH + '1x02_P2.54mm_Vertical.kicad_mod', PHL + '1x02_P2.54mm_Vertical',
     'J18', 'TUNE', 43, 13.5, J18_MAP, 90),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U13', '74LVC1G17', 54, 16.5, U13_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-23.kicad_mod', 'Package_TO_SOT_SMD:SOT-23',
     'D3', 'BAT54S', 62, 16.5, D3_MAP, 0),
    RSMD + ('R14', '100k', 48.9, 12.6, rc('/TUNE_J', '/TUNE_N'), 90),
    RSMD + ('R15', '100k', 51.5, 12.2, rc('/TUNE_N', 'GND'), 90),
    CSMD + ('C14', '100n', 59, 16.5, rc('+3V3', 'GND'), 90),
    (PH + '2x05_P2.54mm_Vertical.kicad_mod', PHL + '2x05_P2.54mm_Vertical',
     'J23', 'USB HOST', 22, 33, J23_MAP, 90),
]
# ---- stuurcluster: decoder + IRQ-keten + expansiebuffer ----
FPS += [
    ('Package_SO.pretty\\SOIC-24W_7.5x15.4mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-24W_7.5x15.4mm_P1.27mm', 'U4', '74HC154', 70, 32, U4_MAP, 90),
    ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U5', '74HC165', 37, 112, U5_MAP, 90),
    ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U6', '74HC165', 153, 15.5, U6_MAP, 90),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U7', '74LVC1G125', 55, 95, U7_MAP, 0),
    ('Package_SO.pretty\\SOIC-20W_7.5x12.8mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm', 'U8', '74LVC245', 95, 31, U8_MAP, 90),
    ('Connector_IDC.pretty\\IDC-Header_2x13_P2.54mm_Vertical.kicad_mod',
     'Connector_IDC:IDC-Header_2x13_P2.54mm_Vertical', 'J21', 'EXPANSION', 108, 22.5, J21_MAP, 90),
    # audiohub in de zuidstrook, midden onder het slotveld
    (PH + '2x07_P2.54mm_Vertical.kicad_mod', PHL + '2x07_P2.54mm_Vertical',
     'J24', 'AUDIOHUB', 115, 103, J24_MAP, 90),
    # MIDI/CAN-cluster (v2-indeling, 12 mm zuidwaarts op het diepere bord)
    ('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm', 'U12', 'SN65HVD230', 150, 112, U12_MAP, 0),
    ('Package_DIP.pretty\\DIP-6_W7.62mm.kicad_mod', 'Package_DIP:DIP-6_W7.62mm',
     'U9', 'H11L1', 52, 112, U9_MAP, 0),
    ('Package_DIP.pretty\\DIP-6_W7.62mm.kicad_mod', 'Package_DIP:DIP-6_W7.62mm',
     'U10', 'H11L1', 79, 124.5, U10_MAP, 90),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U11', '74LVC1G17', 88, 128, U11_MAP, 0),
    ('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod', 'Package_TO_SOT_SMD:SOT-23-5',
     'U14', '74LVC1G17', 97, 128, U14_MAP, 0),
]
# RC's / ontkoppeling stuurcluster
FPS += [
    RSMD + ('R5', '10k', 34.3, 101.2, rc('+3V3', '/PL'), 0),
    CSMD + ('C9', '220p', 40.9, 97.5, rc('/IRQSTAT', '/PL'), 0),
    RSMD + ('R33', '10k', 142.5, 12.8, rc('+3V3', '/PL2'), 90),
    CSMD + ('C18', '220p', 145, 12.5, rc('/IRQSTAT', '/PL2'), 90),
    CSMD + ('C10', '100n', 60, 27, rc('+3V3', 'GND'), 0),        # U4 (noordstrook)
    CSMD + ('C15', '100n', 34.6, 104.2, rc('+3V3', 'GND'), 0),   # U5
    CSMD + ('C16', '100n', 152, 22.8, rc('+3V3', 'GND'), 90),    # U6
    CSMD + ('C17', '100n', 59, 91, rc('+3V3', 'GND'), 0),        # U7
    CSMD + ('C11', '100n', 85.8, 24, rc('+3V3', 'GND'), 90),     # U8
    CSMD + ('C12', '100n', 58, 105, rc('+3V3', 'GND'), 0),       # optos
    CSMD + ('C13', '100n', 143, 112, rc('+3V3', 'GND'), 0),      # CAN
    CSMD + ('C19', '100n', 93, 123.5, rc('+3V3', 'GND'), 90),    # U14
]
# IRQ1-6 pulldowns onder hun slot (IRQ-pin = even kolom, rij 8)
for k in range(6):
    FPS.append(RSMD + (f'R{21+k}', '100k', SLOTX[k] + 4, 95,
                       rc(f'/IRQ{k+1}', 'GND'), 270))
# IRQ7-12 pulldowns noordoost (expansie)
for k in range(6):
    FPS.append(RSMD + (f'R{27+k}', '100k', 172 + 2.2 * k, 15.5,
                       rc(f'/IRQ{k+7}', 'GND'), 90))
# 33R serie -> J21
XR = [('R16', '/XSCLK0', '/XSCLK'), ('R17', '/XMOSI0', '/XMOSI'),
      ('R18', '/XLDAC0', '/XLDAC'), ('R19', '/XCONVST0', '/XCONVST'),
      ('R20', '/XRST0', '/XRST')]
for k, (ref, a, b) in enumerate(XR):
    FPS.append(RSMD + (ref, '33R', 103.4 + 2.2 * k, 30.5, nm({'1': a, '2': b}), 270))
# MIDI passief
FPS += [
    RSMD + ('R6', '220R', 50, 106.8, rc('/MIN1_4', '/MIN1_A'), 90),
    RSMD + ('R7', '220R', 79.5, 128.5, rc('/MIN2_4', '/MIN2_A'), 270),
    ('Diode_SMD.pretty\\D_SOD-323.kicad_mod', 'Diode_SMD:D_SOD-323',
     'D1', '1N4148WS', 54, 103.5, rc('/MIN1_A', '/MIN1_5'), 0),
    ('Diode_SMD.pretty\\D_SOD-323.kicad_mod', 'Diode_SMD:D_SOD-323',
     'D2', '1N4148WS', 88.5, 120, rc('/MIN2_A', '/MIN2_5'), 0),
    RSMD + ('R8', '1k', 70, 112.4, rc('+3V3', '/MIDI_RX1'), 180),
    RSMD + ('R9', '1k', 87.5, 117.3, rc('+3V3', '/MIDI_RX2'), 0),
    RSMD + ('R10', '10R', 92.5, 128, rc('/MOUT_Y', '/MOUT5'), 0),
    RSMD + ('R11', '33R', 87.5, 123.5, rc('+3V3', '/MOUT4'), 90),
    RSMD + ('R34', '10R', 102, 128, rc('/MOUT2_Y', '/MOUT2_5'), 0),
    RSMD + ('R35', '33R', 97.5, 123.5, rc('+3V3', '/MOUT2_4'), 90),
]
# CAN passief
FPS += [
    RSMD + ('R13', '10k', 150, 118, rc('/CAN_RS', 'GND'), 180),
    RSMD + ('R12', '120R', 158, 112, rc('/CANH', '/CAN_TRM'), 90),
    ('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm',
     'JP1', 'TERM', 157.5, 117.5, JP1_MAP, 0),
]
# M3-gaten: 4 hoeken + noord/zuid-midden (paneel deelt dit patroon)
for hn, (hx, hy) in enumerate(((18.5, 14), (164, 12.5), (213, 15),
                               (33.7, 133.5), (160, 133.5), (213, 133.5)), start=1):
    FPS.append(('MountingHole.pretty\\MountingHole_3.2mm_M3.kicad_mod',
                'MountingHole:MountingHole_3.2mm_M3',
                f'H{hn}', 'M3', hx, hy, {}, 0))

fp_texts = [teensy_fp(30, 45, TEENSY_MAP, sym_uuid.get('U1', ''))]
for f, lib, ref, val, x, y, netmap, rot in FPS:
    tree = load_footprint(f, lib, ref, val, x, y, sym_uuid.get(ref, ''), netmap, rot)
    fp_texts.append(serialize(tree, 1))

# ================= KOPER =================
# Geen handroutes: signalen komen uit freerouting (SES naast het bord), GND
# via de vlakken + hechtvia's. BUS3_NOROUTE=1 -> kaal placement-bord voor de
# DSN-export.
tracks, vias = [], []
def T(net, layer, w, *pts):
    tracks.append((NI[net], layer, w, pts))
def V(net, x, y):
    vias.append((NI[net], x, y))

# GND-hechtvia's: hoeken/randen + verdeeld raster om het slotveld
for sx_, sy_ in ((20, 22), (213, 20), (20, 116), (213, 130), (28, 90),
                 (45, 30), (90, 12), (116, 12), (180, 12), (200, 30),
                 (60, 50), (116, 50), (170, 50),
                 (60, 92), (186, 92),
                 (40, 110), (70, 118), (110, 110), (150, 124), (190, 118),
                 (70, 132), (130, 132), (180, 132)):
    V('GND', sx_, sy_)
# eiland-hechtvia's: automatisch geplaatst door gnd_stitch.py (clearance-gecheckt)
import json as _json
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
    return f'c5000000-0000-4000-8000-{_tu[0]:012d}'

import os as _os2
_ses_path = _os2.path.join(_os2.path.dirname(OUT), 'musicbrain-busboard.ses')
if not _os2.environ.get('BUS3_NOROUTE') and _os2.path.exists(_ses_path):
    import seslib as _seslib
    _st, _sv = _seslib.load_ses(_ses_path)
    _n = _nv = 0
    for _name, _layer, _width, _pts in _st:
        if _name in NI and _name != 'GND':
            tracks.append((NI[_name], _layer, max(_width, 0.2), _pts))
            _n += 1
    for _name, _x, _y in _sv:
        if _name in NI and _name != 'GND':
            vias.append((NI[_name], _x, _y))
            _nv += 1
    print(f'SES: {_n} sporen, {_nv} vias overgenomen')

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
    (title "MusicBrain SPI-busboard")
    (date "2026-07-16")
    (rev "3.0")
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
  (gr_text "musicbrain.nl/hw/busboard rev 3.0 - gen 2: 6x slot 2x12 + audio, 16xCS/12xIRQ, MIDI 2x2, USB-host" (at 116.6 98.5 0) (layer "F.SilkS")
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
