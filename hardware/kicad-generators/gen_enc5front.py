"""MusicBrain ENC5-FRONT rev 2.0: slim front - 5x EC11E (verticaal, drukas
bedraad) + 2 drukknopjes + 2x MCP23017 (QFN) + expansieheader voor het
display-deel (2 encoders + 4 knoppen) -> 32 GPIO-bits totaal.

Herontwerp (Mark 2026-07-11 middag): de 2x10-riser-socket midden op het bord
kon mechanisch niet (riser prikt in het midden, front-standaard is zijkant).
Nu: 1x10-socket op de FRONT-KOPPEL-STANDAARD (x=116,5 / pin 1 op y=143,57,
achterzijde) - zelfde plek als pot8front/jack8/jack4. Contract ENC-front:
pin 1 = GND, 2 = SDA, 3 = SCL, 4 = /IRQ, 5..9 = nc, 10 = +3V3.
Eronder: musicbrain-i2criser (domme riser, gen_i2criser.py).

Bord 30 x 110 (x 100..130): dit front zit uiterst links of rechts in het
paneel en mag daarom breder dan de 20mm-kolom (besluit Mark). Encoders 90
graden gedraaid (pinnenrij horizontaal): breedte 14,2 op de hartlijn 8,0 ->
de socketkolom blijft over de hele lengte vrij. Steek 17,6 mm
(paneelknoppen tot ~17 mm). Drukassen S1/S2 nu WEL bedraad.

U1 (0x20): GPA0-7 = E1A..E4B, GPB0/1 = E5A/B, GPB2-6 = E1S..E5S, GPB7 vrij.
U2 (0x21): GPA0-7 = X_E6A,B,S / X_E7A,B,S / X_K1,K2; GPB0/1 = X_K3/K4,
GPB2/3 = K1/K2 (knopjes op het bord), GPB4/5 = X_SP1/2, GPB6/7 vrij.
INTA van beide chips -> /IRQ (open-drain + mirror in fw!). GPPU aan in fw.
J2-expansie (2x8, achterzijde): 1=GND 2=+3V3 3..8=E6A,E6B,E6S,E7A,E7B,E7S
9..12=K1..K4 13/14=SP1/2 15/16=GND.

QFN-pinvolgorde per DS20001952 (pin 1 = GPB1, EP = VSS) - voor assemblage
nogmaals tegen de datasheet houden (openstaande check).
"""
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, C_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-enc5front"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-11"
REV = "2.0"

HART = 108.0
PITCH = 17.6                                     # EC11-courtyard gedraaid = 17,5
SHAFT_Y = [109.6 + PITCH * k for k in range(5)]  # 109,6 .. 180,0
BTN_Y = [194.0, 203.0]                           # knopjes-centra op de hartlijn
JX, JY0 = 116.5, 143.57                          # front-koppel-standaard (= pot8front)

XSIG = ['X_E6A', 'X_E6B', 'X_E6S', 'X_E7A', 'X_E7B', 'X_E7S',
        'X_K1', 'X_K2', 'X_K3', 'X_K4', 'X_SP1', 'X_SP2']
# J2-expansie pin -> net
J2PIN = {1: 'GND', 2: '+3V3', 15: 'GND', 16: 'GND'}
for i, nm in enumerate(XSIG):
    J2PIN[3 + i] = nm

# ================= SCHEMA =================
s = Sch("d0720000-0000-4000-8000-000000000000", "musicbrain-enc5front",
        "MusicBrain ENC5-FRONT - 5x encoder + 2 knoppen + display-expansie", REV, DATE,
        ("Slim front: 2x MCP23017 (0x20/0x21); 1x10-socket achterop op de i2criser",
         "Front-koppel-standaard x=116,5 / pin1 y=143,57; hartlijn 8,0; steek 17,6"))
MCP_L = [("28", "GPB0", "bidirectional"), ("1", "GPB1", "bidirectional"),
         ("2", "GPB2", "bidirectional"), ("3", "GPB3", "bidirectional"),
         ("4", "GPB4", "bidirectional"), ("5", "GPB5", "bidirectional"),
         ("6", "GPB6", "bidirectional"), ("7", "GPB7", "bidirectional"),
         ("8", "VDD", "power_in"), ("9", "VSS", "power_in"),
         ("11", "SCL", "input"), ("12", "SDA", "bidirectional"),
         ("29", "EP", "power_in")]
MCP_R = [("14", "GPA0", "bidirectional"), ("15", "GPA1", "bidirectional"),
         ("16", "GPA2", "bidirectional"), ("17", "GPA3", "bidirectional"),
         ("18", "GPA4", "bidirectional"), ("19", "GPA5", "bidirectional"),
         ("20", "GPA6", "bidirectional"), ("21", "GPA7", "bidirectional"),
         ("22", "INTA", "open_collector"), ("23", "INTB", "open_collector"),
         ("24", "~{RESET}", "input"), ("25", "A2", "input"),
         ("26", "A1", "input"), ("27", "A0", "input")]
ENC_SYM = box_symbol("EC11E_SW",
                     [("A", "A", "passive"), ("C", "C", "passive"), ("B", "B", "passive")],
                     [("S1", "S1", "passive"), ("S2", "S2", "passive")], width=12.7)
BTN_SYM = box_symbol("SW_PUSH", [("1", "1", "passive")], [("2", "2", "passive")], width=10.16)
s.libs += [C_SYM, FLAG_SYM, conn1_symbol("Conn_01x10", 10), conn_symbol("Conn_02x08", 8),
           box_symbol("MCP23017Q", MCP_L, MCP_R, width=20.32),
           ENC_SYM, BTN_SYM,
           power_symbol("GND", False), power_symbol("+3V3", True)]


def _term(x, y, act, west):
    """wire + label/power/nc op een pin-uiteinde"""
    xe = x + (-5.08 if west else 5.08)
    if act is None:
        s.nc(x, y)
    elif act in ("GND", "+3V3"):
        s.wire(x, y, xe, y)
        s.power(f"power:{act}", xe, y, 0, vx=xe, vy=(y - 3.302 if act == '+3V3' else y + 3.81))
    else:
        s.wire(x, y, xe, y)
        s.label(act, xe, y)


# J1: socket naar de i2criser (1x10)
J1X, J1Y = 45, 60
s.component("Custom:Conn_01x10", "J1", "NAAR I2C-RISER (achterzijde)", J1X, J1Y, 0,
            "MusicBrain:Socket_1x10_backside")
J1SPEC = ['GND', 'SDA', 'SCL', 'IRQ', None, None, None, None, None, '+3V3']
for k in range(10):
    y = J1Y - 11.43 + 2.54 * k
    _term(J1X - 7.62, y, J1SPEC[k], True)

# U1/U2 MCP23017 (QFN) - verdeling volgt de geografie (U1 noord: E1-E4;
# U2 zuid: E5 + knopjes + expansie) zodat de routing kort blijft
U1L = ['E1S', 'E2S', 'E3S', 'E4S', 'X_SP1', 'X_SP2', None, None, '+3V3', 'GND', 'SCL', 'SDA', 'GND']
U1R = ['E1A', 'E1B', 'E2A', 'E2B', 'E3A', 'E3B', 'E4A', 'E4B',
       'IRQ', None, '+3V3', 'GND', 'GND', 'GND']
U2L = ['X_K3', 'X_K4', 'K1', 'K2', 'E5A', 'E5B', 'E5S', None, '+3V3', 'GND', 'SCL', 'SDA', 'GND']
U2R = ['X_E6A', 'X_E6B', 'X_E6S', 'X_E7A', 'X_E7B', 'X_E7S', 'X_K1', 'X_K2',
       'IRQ', None, '+3V3', 'GND', 'GND', '+3V3']    # A0=+3V3 -> 0x21
for ref, ux, uy, L, R, addr in (("U1", 150, 55, U1L, U1R, "0x20"),
                                ("U2", 150, 120, U2L, U2R, "0x21")):
    s.component("Custom:MCP23017Q", ref, f"MCP23017-E/ML ({addr})", ux, uy, 0,
                "Package_DFN_QFN:QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm")
    for k, act in enumerate(L):
        _term(ux - 12.7, uy - 16.51 + 2.54 * k, act, True)
    for k, act in enumerate(R):
        _term(ux + 12.7, uy - 16.51 + 2.54 * k, act, False)

# encoders (drukas S1 -> EkS, S2 -> GND)
for k in range(5):
    x, y = 45 + 40 * k, 170
    s.component("Custom:EC11E_SW", f"SW{k+1}", "EC11E (switch)", x, y, 0,
                "Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm")
    _term(x - 8.89, y - 2.54, f"E{k+1}A", True)
    s.wire(x - 8.89, y, x - 11.43, y); s.power("power:GND", x - 11.43, y)
    _term(x - 8.89, y + 2.54, f"E{k+1}B", True)
    _term(x + 8.89, y - 2.54, f"E{k+1}S", False)
    s.wire(x + 8.89, y, x + 11.43, y); s.power("power:GND", x + 11.43, y)

# knopjes op het bord
for k in range(2):
    x, y = 235, 55 + 15 * k
    s.component("Custom:SW_PUSH", f"SW{6+k}", "6mm tact", x, y, 0,
                "Button_Switch_THT:SW_PUSH_6mm")
    _term(x - 7.62, y, f"K{k+1}", True)
    s.wire(x + 7.62, y, x + 10.16, y); s.power("power:GND", x + 10.16, y)

# J2: expansie naar het display-deel (2x8, achterzijde)
J2X, J2Y = 250, 120
s.component("Custom:Conn_02x08", "J2", "DISPLAY-EXPANSIE (achterzijde)", J2X, J2Y, 0,
            "MusicBrain:Header_2x08_backside")
for q in range(1, 17):
    row = (q - 1) // 2
    west = (q % 2 == 1)
    y = J2Y - 8.89 + 2.54 * row
    _term(J2X + (-7.62 if west else 7.62), y, J2PIN[q], west)

# ontkoppeling
for ref, x in (("C10", 100), ("C11", 112)):
    s.component("Device:C", ref, "100n", x, 195, 0, "Capacitor_SMD:C_0805_2012Metric")
    s.wire(x, 191.19, x, 188.65); s.power("power:+3V3", x, 188.65, 0, vx=x, vy=185.35)
    s.wire(x, 198.81, x, 201.35); s.power("power:GND", x, 201.35)
# PWR_FLAGs
s.wire(20, 190, 25.08, 190); s.power("power:GND", 20, 190); s.flag(25.08, 190)
s.wire(20, 182, 25.08, 182); s.power("power:+3V3", 20, 182); s.flag(25.08, 182)

s.text("ENC5-FRONT 2.0: U1 (0x20, noord) = E1-E4 A/B + drukas + J2-spares; U2 (0x21,\\n"
       "zuid) = E5 A/B/S + knopjes K1/K2 + display-expansie (2 enc + 4 knoppen via J2).\\n"
       "INTA beide chips -> /IRQ: open-drain (IOCON.ODR) + mirror + GPPU aan in de fw!", 20, 200)
s.write(os.path.join(OUT_DIR, "musicbrain-enc5front.kicad_sch"))

# ================= PCB (placement + netten; koper via freerouting) =================
NETS = (['', 'GND', '+3V3', '/SDA', '/SCL', '/IRQ']
        + [f'/E{k}{p}' for k in range(1, 6) for p in 'AB']
        + [f'/E{k}S' for k in range(1, 6)]
        + ['/K1', '/K2'] + [f'/{nm}' for nm in XSIG])
b = Board("MusicBrain ENC5-FRONT", REV, (128.9, 155, 90), 100, 100, 130, 210, NETS, DATE)
b.silk_name = 'enc5front'
b.paper = "A3"

U1_MAP = b.nm({'28': '/E1S', '1': '/E2S', '2': '/E3S', '3': '/E4S',
               '4': '/X_SP1', '5': '/X_SP2',
               '8': '+3V3', '9': 'GND', '11': '/SCL', '12': '/SDA',
               '14': '/E1A', '15': '/E1B', '16': '/E2A', '17': '/E2B',
               '18': '/E3A', '19': '/E3B', '20': '/E4A', '21': '/E4B',
               '22': '/IRQ', '24': '+3V3', '25': 'GND', '26': 'GND',
               '27': 'GND', '29': 'GND'})
U2_MAP = b.nm({'28': '/X_K3', '1': '/X_K4', '2': '/K1', '3': '/K2', '4': '/E5A',
               '5': '/E5B', '6': '/E5S',
               '8': '+3V3', '9': 'GND', '11': '/SCL', '12': '/SDA',
               '14': '/X_E6A', '15': '/X_E6B', '16': '/X_E6S', '17': '/X_E7A',
               '18': '/X_E7B', '19': '/X_E7S', '20': '/X_K1', '21': '/X_K2',
               '22': '/IRQ', '24': '+3V3', '25': 'GND', '26': 'GND',
               '27': '+3V3', '29': 'GND'})

# encoders: rot 90 -> as (anchor_x + 2.5, anchor_y - 7.5) op de hartlijn;
# pinnenrij A/C/B zuid-horizontaal, S1/S2 noord-horizontaal, socketkolom vrij
for k in range(5):
    sy = SHAFT_Y[k]
    b.fp('Rotary_Encoder.pretty\\RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm.kicad_mod',
         'Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm',
         f'SW{k+1}', 'EC11E', HART - 2.5, sy + 7.5, 90,
         b.nm({'A': f'/E{k+1}A', 'C': 'GND', 'B': f'/E{k+1}B',
               'S1': f'/E{k+1}S', 'S2': 'GND'}))
# knopjes op de hartlijn (pads 1,1,2,2; centrum = anchor + (3.25, 2.25))
for k in range(2):
    b.fp('Button_Switch_THT.pretty\\SW_PUSH_6mm.kicad_mod',
         'Button_Switch_THT:SW_PUSH_6mm', f'SW{6+k}', '6mm tact',
         HART - 3.25, BTN_Y[k] - 2.25, 0, b.rc(f'/K{k+1}', 'GND'))
# MCP's + ontkoppeling in de ooststrook (voorzijde)
b.fp('Package_DFN_QFN.pretty\\QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm.kicad_mod',
     'Package_DFN_QFN:QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm',
     'U1', 'MCP23017-E/ML', 124, 122, 0, U1_MAP)
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C10', '100n', 124, 114.6, 0,
     b.rc('+3V3', 'GND'))    # noord van U1: zuidzijde vrijhouden voor routing
b.fp('Package_DFN_QFN.pretty\\QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm.kicad_mod',
     'Package_DFN_QFN:QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm',
     'U2', 'MCP23017-E/ML', 124, 176, 0, U2_MAP)
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C11', '100n', 124, 169.8, 0,
     b.rc('+3V3', 'GND'))    # noord van U2: zuidzijde vrijhouden voor J2-routes


def _backside_conn(name, ref, anchor_x, anchor_y, cols, rows, pinnet, model, descr):
    """THT-connector op de ACHTERZIJDE in KiCads canonieke geflipte vorm
    (rot 180 + lokale y genegeerd): absolute padposities = anchor + (col*2.54
    oost, row*2.54 zuid). Het 3D-model valt met offset 0 NAAST de gaten (pads
    in neg. kwadrant, model in pos.); model-offset (-W, +0.1) centreert het.
    W = kolomspan = 2.54*(cols-1): X = -kolomspan (loodrecht op de pin-rijen),
    Y = +0.1 (tikkie langs de rij). Empirisch op J1 1x10 + J2 2x8 (2026-07-14).
    Render-cosmetiek, raakt de fab niet. Zie WERKWIJZE.md."""
    L = 2.54 * (rows - 1)
    W = 2.54 * (cols - 1)
    hp = []
    for q in range(1, cols * rows + 1):
        row, col = (q - 1) // cols, (q - 1) % cols
        net = pinnet.get(q)
        entry = f' (net {b.NI[net]} "{net}")' if net else ''
        shape = 'rect' if q == 1 else 'oval'
        hp.append(f'    (pad "{q}" thru_hole {shape} (at {-2.54 * col} {-2.54 * row} 180) '
                  f'(size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask"){entry})')
    b.raw_fp(f'''  (footprint "MusicBrain:{name}"
    (layer "B.Cu")
    (uuid "{b.uid()}")
    (at {anchor_x} {anchor_y} 180)
    (path "/")
    (descr "{descr}")
    (property "Reference" "{ref}" (at {-(W + 2.8)} 2.2 0) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "{name}" (at {-W / 2} {-(L + 3)} 0) (layer "B.Fab")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (attr through_hole)
    (fp_rect (start {-(W + 1.35)} {-(L + 1.35)}) (end 1.35 1.35)
      (stroke (width 0.12) (type solid)) (fill no) (layer "B.SilkS"))
    (fp_rect (start {-(W + 1.35)} {-(L + 1.35)}) (end 1.35 1.35)
      (stroke (width 0.05) (type solid)) (fill no) (layer "B.CrtYd"))
{chr(10).join(hp)}
    (model "${{KICAD10_3DMODEL_DIR}}/{model}"
      (offset (xyz {-W} 0.1 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
  )''')


# J1: 1x10-socket op de front-koppel-standaard
_backside_conn('Socket_1x10_backside', 'J1', JX, JY0, 1, 10,
               {1: 'GND', 2: '/SDA', 3: '/SCL', 4: '/IRQ', 10: '+3V3'},
               'Connector_PinSocket_2.54mm.3dshapes/PinSocket_1x10_P2.54mm_Vertical.step',
               '1x10 female socket op de achterzijde; prikt op de i2criser')
# J2: 2x8-expansieheader (male) voor het display-deel
J2PIN_PCB = {q: (nm if nm in ('GND', '+3V3') else '/' + nm) for q, nm in J2PIN.items()}
_backside_conn('Header_2x08_backside', 'J2', 122.77, 189.8, 2, 8, J2PIN_PCB,
               'Connector_PinHeader_2.54mm.3dshapes/PinHeader_2x08_P2.54mm_Vertical.step',
               '2x8 male header op de achterzijde; kabel naar display-encoders/-knoppen')

# ---- SEEDS: handroutes die freerouting structureel niet vond ----
# (deze staan al in de PCB voor de DSN-export en gaan als (type protect) mee)
SEEDS = {'/X_E7S'}
# X_E7S: oostcorridor op B; J2-pad 8 -> U2-pad 19
b.T('/X_E7S', 'B.Cu', 0.25, (125.31, 197.42), (128.7, 197.42), (128.7, 175.35),
    (128.05, 175.35))
b.V('/X_E7S', 128.05, 175.35)
b.T('/X_E7S', 'F.Cu', 0.25, (128.05, 175.35), (126.8375, 175.35))

# ---- overige koper komt van freerouting (SES native ingelezen) ----
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-enc5front.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses, skip=SEEDS)
    print(f"SES: {nt} sporen, {nv} vias overgenomen (seeds overgeslagen)")
    # freerouting eindigt soms vlak voor een QFN-pad (padbenadering): dichtsnappen
    sn = b.snap_stubs()
    print(f"snap_stubs: {sn} stubs aangevuld")
for x, y in ((101.5, 101.5), (128.5, 101.5), (101.5, 208.5), (128.5, 208.5),
             (102, 155), (119.3, 115), (119.3, 135), (119.3, 155), (119.3, 175),
             (119.3, 195), (102, 190.5)):
    b.V('GND', x, y)
b.write(os.path.join(OUT_DIR, "musicbrain-enc5front.kicad_pcb"))
open(os.path.join(OUT_DIR, "musicbrain-enc5front.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-enc5front.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "MusicBrain enc5front"},\n'
    # 0,15 mm clearance (JLC kan 0,127): freerouting draait op 0,16 in de DSN
    '  "net_settings": {\n'
    '    "classes": [\n'
    '      {"name": "Default", "clearance": 0.15, "track_width": 0.2,\n'
    '       "via_diameter": 0.6, "via_drill": 0.3, "bus_width": 12,\n'
    '       "diff_pair_gap": 0.25, "diff_pair_via_gap": 0.25, "diff_pair_width": 0.2,\n'
    '       "line_style": 0, "microvia_diameter": 0.3, "microvia_drill": 0.1,\n'
    '       "wire_width": 6}\n'
    '    ],\n'
    '    "meta": {"version": 4}\n'
    '  },\n'
    '  "schematic": {"file": "musicbrain-enc5front.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-enc5front.kicad_pcb"}\n}\n')
print("written musicbrain-enc5front")
