"""MusicBrain POT-RISER (gen 2): MCP3208-riser voor het POT8-FRONT.

Gen 2 (spi-bus-spec v2.0): slot 2x12, H=50. Bord 80x50 (was 28x80): de 2x12
spant 27,94 mm en de vrije kernband tussen de connector-courtyards is 33,3 mm
- ruim genoeg voor de MCP3208 + 9 caps (137 mm2 = 5% dichtheid).

Onder: haakse male 2x12 in het slot (gebruikt alleen SPI/3V3/GND).
Boven: haakse male 1x10 naar het POT8-FRONT (contract ongewijzigd:
1 = GND, 2..9 = W1..W8, 10 = +3V3). Per loper een 100n reservoir.

Koper komt van freerouting (SES native ingelezen); GND via de vlakken.
"""
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, C_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-potriser"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

GEBRUIKT = {'GND', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS'}

# ================= SCHEMA =================
s = Sch("d0710000-0000-4000-8000-000000000000", "musicbrain-potriser",
        "MusicBrain POT-RISER - MCP3208-riser voor POT8-FRONT", REV, DATE,
        ("Gen 2: slot 2x12 (spi-bus-spec v2.0), H=50, bord 80x50",
         "Boven: POT8-FRONT (1x10: 1=GND, 2..9=W1..8, 10=+3V3)"))
s.libs += [C_SYM, FLAG_SYM, conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("MCP3208",
                      [(str(k + 1), f"CH{k}", "input") for k in range(8)],
                      [("16", "VDD", "power_in"), ("15", "VREF", "power_in"),
                       ("14", "AGND", "power_in"), ("13", "CLK", "input"),
                       ("12", "DOUT", "tri_state"), ("11", "DIN", "input"),
                       ("10", "~{CS}", "input"), ("9", "DGND", "power_in")]),
           power_symbol("GND", False), power_symbol("+3V3", True)]

# J1 (slot, 2x12)
JX, JY = 60, 120
s.component("Custom:Conn_02x12", "J1", "BUS (slot, 2x12)", JX, JY, 0, bus.HDR_BUS[1])
for q in range(1, bus.SLOT_PINS + 1):
    row = (q - 1) // 2
    west = (q % 2 == 1)
    y = JY - 13.97 + 2.54 * row
    x = JX + (-7.62 if west else 7.62)
    xe = JX + (-12.7 if west else 12.7)
    net = bus.SLOT[q]
    if net not in GEBRUIKT:
        s.nc(x, y)
    elif net in ('GND', '+3V3'):
        s.wire(x, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe,
                vy=(y - 3.302 if net == '+3V3' else y + 3.81))
    else:
        s.wire(x, y, xe, y); s.label(net.lstrip('/'), xe, y)

# U1 MCP3208
UX, UY = 150, 120
s.component("Custom:MCP3208", "U1", "MCP3208", UX, UY, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
for k in range(8):
    y = UY - 8.89 + 2.54 * k
    s.wire(UX - 11.43, y, UX - 16.51, y); s.label(f"W{k+1}", UX - 16.51, y)
RSIG = ["+3V3", "+3V3", "GND", "SCLK", "MISO", "MOSI", "CS", "GND"]
for k, nm in enumerate(RSIG):
    y = UY - 8.89 + 2.54 * k
    if nm in ("+3V3", "GND"):
        s.wire(UX + 11.43, y, UX + 16.51, y)
        s.power(f"power:{nm}", UX + 16.51, y, 0,
                vx=UX + 16.51, vy=(y - 3.302 if nm == "+3V3" else y + 3.81))
    else:
        s.wire(UX + 11.43, y, UX + 16.51, y); s.label(nm, UX + 16.51, y)

# J2 (naar front, 1x10)
FX, FY = 220, 120
s.component("Custom:Conn_01x10", "J2", "NAAR POT8-FRONT", FX, FY, 0, bus.HDR_PANEEL[1])
for k in range(10):
    y = FY - 11.43 + 2.54 * k
    s.wire(FX - 7.62, y, FX - 12.7, y)
    if k == 0:
        s.power("power:GND", FX - 12.7, y)
    elif k == 9:
        s.power("power:+3V3", FX - 12.7, y, 0, vx=FX - 12.7, vy=y - 3.302)
    else:
        s.label(f"W{k}", FX - 12.7, y)

# reservoirs per loper + ontkoppeling
for k in range(8):
    x = 60 + 20 * k
    s.component("Device:C", f"C{k+1}", "100n", x, 170, 0, "Capacitor_SMD:C_0805_2012Metric")
    s.wire(x, 166.19, x, 163.65); s.label(f"W{k+1}", x, 163.65)
    s.wire(x, 173.81, x, 176.35); s.power("power:GND", x, 176.35)
s.component("Device:C", "C9", "100n", 230, 165, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(230, 161.19, 230, 158.65); s.power("power:+3V3", 230, 158.65, 0, vx=230, vy=155.35)
s.wire(230, 168.81, 230, 171.35); s.power("power:GND", 230, 171.35)
s.wire(20, 185, 25.08, 185); s.power("power:GND", 20, 185); s.flag(25.08, 185)
s.wire(20, 175, 25.08, 175); s.power("power:+3V3", 20, 175); s.flag(25.08, 175)

s.text("POT-RISER gen 2: lopers van het POT8-FRONT -> 100n-reservoir -> MCP3208\\n"
       "(SPI mode 0, ratiometrisch VREF=VDD=3V3). CH0..7 = W1..W8 = paneel boven->onder.\\n"
       "De audio-lijnen (21-24) van de bus lopen hier niet mee.", 20, 196)
s.write(os.path.join(OUT_DIR, "musicbrain-potriser.kicad_sch"))

# ================= PCB (placement; koper via freerouting) =================
NETS = ['', 'GND', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS'] + [f'/W{k}' for k in range(1, 9)]
BX0, BX1 = 100.0, 180.0            # 80 mm (= bus.KAART_B)
CX = (BX0 + BX1) / 2               # 140.0
b = Board("MusicBrain POT-RISER - MCP3208-riser", REV,
          (CX, 137.0, 0), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'potriser'

J1_MAP = bus.j1_map(b, GEBRUIKT)
J2_MAP = b.nm(dict([('1', 'GND')] + [(str(k + 1), f'/W{k}') for k in range(1, 9)]
                   + [('10', '+3V3')]))
U1_MAP = b.nm({'1': '/W1', '2': '/W2', '3': '/W3', '4': '/W4', '5': '/W5',
               '6': '/W6', '7': '/W7', '8': '/W8',
               '9': 'GND', '10': '/CS', '11': '/MOSI', '12': '/MISO',
               '13': '/SCLK', '14': 'GND', '15': '+3V3', '16': '+3V3'})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'NAAR FRONT',
     CX - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET, 90, J2_MAP)
# U1 midden in de vrije band (108,35 .. 141,65)
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', 'MCP3208', CX, 126.0, 90, U1_MAP)
# reservoirs: staand, recht onder hun J2-loperpin (korte route)
for k in range(1, 9):
    x = b.P['J2'][str(k + 1)][0]
    b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
         'Capacitor_SMD:C_0805_2012Metric', f'C{k}', '100n', x, 113.5, 270,
         b.rc(f'/W{k}', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C9', '100n', 122.0, 126.0, 90,
     b.rc('+3V3', 'GND'))

from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-potriser.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")
for x, y in ((102, 102), (178, 102), (102, 148), (178, 148),
             (102, 125), (178, 125), (112, 140), (168, 140)):
    b.V('GND', x, y)

b.write(os.path.join(OUT_DIR, "musicbrain-potriser.kicad_pcb"))
open(os.path.join(OUT_DIR, "musicbrain-potriser.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-potriser.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "MusicBrain potriser"},\n'
    '  "schematic": {"file": "musicbrain-potriser.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-potriser.kicad_pcb"}\n}\n')
print("written musicbrain-potriser (gen 2)")
