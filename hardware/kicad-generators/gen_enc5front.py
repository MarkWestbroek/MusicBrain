"""MusicBrain ENC5-FRONT: slim front - 5x EC11E (verticaal, met drukknop) +
2 drukknopjes + MCP23017 (QFN) op de GENERIEKE riser.

Route-2/optie-A-model (Mark 2026-07-11): plat front aan het paneel, chip erop;
koppeling = 2x10 female op de ACHTERZIJDE die op de generieke musicbrain-riser
prikt (J2-x-matching per riser-README: front-pin q = slotpin (20-q) oneven /
(22-q) even). Assen op de hartlijn 8,0 mm; steek 14,2 mm (EC11-courtyard).
Drukknopjes zitten OOST van de socket (passen niet op de hartlijn-kolom).

MCP23017 in QFN-28 (SSOP/SOIC past niet in de 20mm-kolom); QFN-pinvolgorde
per datasheet DS20001952 (pin 1 = GPB1; EP = VSS). Encoder-drukschakelaars
(S1/S2) zijn NIET bedraad (12 GPIO-budget: 5x A/B + 2 knoppen).
"""
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, box_symbol, C_SYM, FLAG_SYM, power_symbol)
from cardlib import Board
import os
import re

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-enc5front"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-11"

HART = 108.0
PITCH = 14.2
SHAFT_Y = [108.2 + PITCH * k for k in range(5)]   # as-y per encoder

# riser-J2-x-matching: front-socketpin q draagt slotfunctie (20-q)odd/(22-q)even
SLOT = {1: 'GND', 2: '+12V', 3: 'GND', 4: '-12V', 5: 'GND', 6: '+3V3',
        7: '/SCLK', 8: 'GND', 9: '/MOSI', 10: 'GND', 11: '/MISO', 12: 'GND',
        13: '/CS', 14: 'GND', 15: '/LDAC', 16: '/IRQ', 17: '/SDA', 18: '/SCL',
        19: '/SPARE1', 20: '/SPARE2'}
FRONTPIN = {q: SLOT[(20 - q) if q % 2 else (22 - q)] for q in range(1, 21)}
USED = {'GND', '+3V3', '/SDA', '/SCL', '/IRQ'}

# ================= SCHEMA =================
s = Sch("d0720000-0000-4000-8000-000000000000", "musicbrain-enc5front",
        "MusicBrain ENC5-FRONT - 5x encoder op de generieke riser", "1.0", DATE,
        ("Slim front: MCP23017 (QFN, 0x20) erop; 2x10-socket achterop -> musicbrain-riser",
         "Assen op hartlijn 8,0 mm; steek 14,2; S1/S2 (drukas) niet bedraad"))
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
         ("22", "INTA", "output"), ("23", "INTB", "output"),
         ("24", "~{RESET}", "input"), ("25", "A2", "input"),
         ("26", "A1", "input"), ("27", "A0", "input")]
ENC_SYM = box_symbol("EC11E_SW",
                     [("A", "A", "passive"), ("C", "C", "passive"), ("B", "B", "passive")],
                     [("S1", "S1", "passive"), ("S2", "S2", "passive")], width=12.7)
BTN_SYM = box_symbol("SW_PUSH", [("1", "1", "passive")], [("2", "2", "passive")], width=10.16)
s.libs += [C_SYM, FLAG_SYM, conn_symbol("Conn_02x10", 10),
           box_symbol("MCP23017Q", MCP_L, MCP_R, width=20.32),
           ENC_SYM, BTN_SYM,
           power_symbol("GND", False), power_symbol("+3V3", True)]

# J1: socket naar de riser
JX, JY = 50, 120
s.component("Custom:Conn_02x10", "J1", "NAAR RISER (achterzijde)", JX, JY, 0,
            "MusicBrain:Socket_2x10_backside")
for q in range(1, 21):
    row = (q - 1) // 2
    y = JY - 11.43 + 2.54 * row
    west = (q % 2 == 1)
    px = JX - 7.62 if west else JX + 7.62
    xe = JX - 12.7 if west else JX + 12.7
    net = FRONTPIN[q]
    if net not in USED:
        s.nc(px, y)
    elif net in ('GND', '+3V3'):
        s.wire(px, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe, vy=(y - 3.302 if net == '+3V3' else y + 3.81))
    else:
        s.wire(px, y, xe, y)
        s.label(net.lstrip('/'), xe, y)

# U1 MCP23017 (QFN)
UX, UY = 150, 120
s.component("Custom:MCP23017Q", "U1", "MCP23017-E/ML", UX, UY, 0,
            "Package_DFN_QFN:QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm")
GPA = ["E1A", "E1B", "E2A", "E2B", "E3A", "E3B", "E4A", "E4B"]
GPB = ["E5A", "E5B", None, None, None, None, None, None]
rows_r = MCP_R
for k, (num, nm, _t) in enumerate(MCP_R):
    y = UY - (len(MCP_R) - 1) * 1.27 + 2.54 * k
for k in range(8):   # GPA0-7 rechts (pins 14-21)
    y = UY - 16.51 + 2.54 * k
    s.wire(UX + 12.7, y, UX + 17.78, y); s.label(GPA[k], UX + 17.78, y)
# INTA/INTB/RESET/A2/A1/A0 (pins 22-27)
for k, act in enumerate(("IRQ", None, "+3V3", "GND", "GND", "GND")):
    y = UY - 16.51 + 2.54 * (8 + k)
    if act is None:
        s.nc(UX + 12.7, y)
    elif act in ("GND", "+3V3"):
        s.wire(UX + 12.7, y, UX + 17.78, y)
        s.power(f"power:{act}", UX + 17.78, y, 0,
                vx=UX + 17.78, vy=(y - 3.302 if act == '+3V3' else y + 3.81))
    else:
        s.wire(UX + 12.7, y, UX + 17.78, y); s.label(act, UX + 17.78, y)
# links: GPB0-7 (28,1..7), VDD(8), VSS(9), SCL(11), SDA(12), EP(29)
LSPEC = GPB + ["+3V3", "GND", "SCL", "SDA", "GND"]
for k, act in enumerate(LSPEC):
    y = UY - 16.51 + 2.54 * k
    if act is None:
        s.nc(UX - 12.7, y)
    elif act in ("GND", "+3V3"):
        s.wire(UX - 12.7, y, UX - 17.78, y)
        s.power(f"power:{act}", UX - 17.78, y, 0,
                vx=UX - 17.78, vy=(y - 3.302 if act == '+3V3' else y + 3.81))
    else:
        s.wire(UX - 12.7, y, UX - 17.78, y); s.label(act, UX - 17.78, y)

# encoders + knoppen
for k in range(5):
    x, y = 60 + 40 * (k % 3), 170 + 30 * (k // 3)
    s.component("Custom:EC11E_SW", f"SW{k+1}", "EC11E (switch)", x, y, 0,
                "Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm")
    s.wire(x - 8.89, y - 2.54, x - 13.97, y - 2.54); s.label(f"E{k+1}A", x - 13.97, y - 2.54)
    s.wire(x - 8.89, y, x - 11.43, y); s.power("power:GND", x - 11.43, y)
    s.wire(x - 8.89, y + 2.54, x - 13.97, y + 2.54); s.label(f"E{k+1}B", x - 13.97, y + 2.54)
    s.nc(x + 8.89, y - 2.54); s.nc(x + 8.89, y)
# C10 ontkoppeling
s.component("Device:C", "C10", "100n", 230, 165, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(230, 161.19, 230, 158.65); s.power("power:+3V3", 230, 158.65, 0, vx=230, vy=155.35)
s.wire(230, 168.81, 230, 171.35); s.power("power:GND", 230, 171.35)
# PWR_FLAGs
s.wire(20, 185, 25.08, 185); s.power("power:GND", 20, 185); s.flag(25.08, 185)
s.wire(20, 175, 25.08, 175); s.power("power:+3V3", 20, 175); s.flag(25.08, 175)

s.text("ENC5-FRONT: 5x EC11E + 2 knoppen -> MCP23017 (0x20, GPPU aan in fw).\\n"
       "GPA0-7 = E1A..E4B, GPB0/1 = E5A/B, GPB2/3 = BTN1/2, GPB4-7 vrij.\\n"
       "INTA->IRQ (mirror in fw); encoder-drukschakelaars (S1/S2) niet bedraad.", 20, 196)
s.write(os.path.join(OUT_DIR, "musicbrain-enc5front.kicad_sch"))

# ================= PCB (placement + netten; koper via freerouting) =================
NETS = (['', 'GND', '+3V3', '/SDA', '/SCL', '/IRQ']
        + [f'/E{k}{p}' for k in range(1, 6) for p in 'AB'])
b = Board("MusicBrain ENC5-FRONT", "1.0", (101.3, 206, 90), 100, 100, 120, 210, NETS, DATE)
b.silk_name = 'enc5front'

U1_MAP = b.nm({'28': '/E5A', '1': '/E5B',
               '8': '+3V3', '9': 'GND', '11': '/SCL', '12': '/SDA',
               '14': '/E1A', '15': '/E1B', '16': '/E2A', '17': '/E2B',
               '18': '/E3A', '19': '/E3B', '20': '/E4A', '21': '/E4B',
               '22': '/IRQ', '24': '+3V3', '25': 'GND', '26': 'GND',
               '27': 'GND', '29': 'GND'})
# encoders: rot 180 -> as (anchor_x - 7.5) op de hartlijn; pinnen-kolom oost
for k in range(5):
    sy = SHAFT_Y[k]
    b.fp('Rotary_Encoder.pretty\\RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm.kicad_mod',
         'Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm',
         f'SW{k+1}', 'EC11E', HART + 7.5, sy + 2.5, 180,
         b.nm({'A': f'/E{k+1}A', 'C': 'GND', 'B': f'/E{k+1}B'}))
    # S-pads (drukas, onbedraad) liggen op x 101: koper trimmen tot rand-regel
    b.fp_texts[-1] = re.sub(r'(\(pad "S[12]" thru_hole \w+\s*\(at [\d.-]+ [\d.-]+[^)]*\)\s*\(size) [\d.]+ [\d.]+',
                            r'\1 1.5 1.5', b.fp_texts[-1])
# MCP QFN op de VOORZIJDE (past onder het paneel; ~7mm lucht)
b.fp('Package_DFN_QFN.pretty\\QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm.kicad_mod',
     'Package_DFN_QFN:QFN-28-1EP_6x6mm_P0.65mm_EP4.25x4.25mm',
     'U1', 'MCP23017-E/ML', HART, 179.0, 0, U1_MAP)
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C10', '100n', 114.6, 179.0, 270,
     b.rc('+3V3', 'GND'))
# socket 2x10 op de ACHTERZIJDE (zuid, in-lijn)
hp = []
for q in range(1, 21):
    row = (q - 1) // 2
    col = 0 if q % 2 else 1
    x = -1.27 + 2.54 * col
    y = 2.54 * row
    net = FRONTPIN[q]
    entry = ''
    if net in USED:
        entry = f' (net {b.NI[net]} "{net}")'
    shape = 'rect' if q == 1 else 'oval'
    hp.append(f'    (pad "{q}" thru_hole {shape} (at {x} {y}) (size 1.7 1.7) '
              f'(drill 1.0) (layers "*.Cu" "*.Mask"){entry})')
b.raw_fp(f'''  (footprint "MusicBrain:Socket_2x10_backside"
    (layer "B.Cu")
    (uuid "{b.uid()}")
    (at 108 186.0)
    (path "/")
    (descr "2x10 female socket op de achterzijde; prikt op riser-J2 (x-matching)")
    (property "Reference" "J1" (at 3.6 -2.4 0) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "SOCKET-BACK" (at 0 25.9 0) (layer "B.Fab")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (attr through_hole)
    (fp_rect (start -4.4 -1.6) (end 4.4 24.46)
      (stroke (width 0.12) (type solid)) (fill no) (layer "B.SilkS"))
    (fp_rect (start -4.6 -1.8) (end 4.6 24.66)
      (stroke (width 0.05) (type solid)) (fill no) (layer "B.CrtYd"))
{chr(10).join(hp)}
    (model "${{KICAD10_3DMODEL_DIR}}/Connector_PinSocket_2.54mm.3dshapes/PinSocket_2x10_P2.54mm_Vertical.step"
      (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
  )''')
# koper komt van freerouting (SES native ingelezen); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-enc5front.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
for x, y in ((102, 102), (118, 102), (102, 208), (118, 208), (102, 155), (118, 155),
             (105.9, 183.2), (115.2, 170.5), (113.4, 136.2), (115.6, 141.5)):
    b.V('GND', x, y)
b.write(os.path.join(OUT_DIR, "musicbrain-enc5front.kicad_pcb"))
open(os.path.join(OUT_DIR, "musicbrain-enc5front.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-enc5front.kicad_pro", "version": 3},\n'
    '  "board": {"design_settings": {"rules": {"min_copper_edge_clearance": 0.25}}},\n'
    '  "general": {"project_name": "MusicBrain enc5front"},\n'
    '  "schematic": {"file": "musicbrain-enc5front.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-enc5front.kicad_pcb"}\n}\n')
print("written musicbrain-enc5front")
