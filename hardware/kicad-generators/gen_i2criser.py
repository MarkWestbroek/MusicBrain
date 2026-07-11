"""MusicBrain I2C-RISER: domme riser voor slimme I2C-fronts (ENC5-FRONT).

Zelfde mechanica als de potriser (28 x 80): onder een haakse male 2x10 in het
slot, boven een haakse male 1x10 naar het front op de FRONT-KOPPEL-STANDAARD.
Geen elektronica - lust alleen GND/+3V3/SDA/SCL/IRQ door.
Front-contract (1x10): 1 = GND, 2 = SDA, 3 = SCL, 4 = /IRQ, 5..9 = nc, 10 = +3V3.
"""
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import Sch, conn_symbol, conn1_symbol, FLAG_SYM, power_symbol
from cardlib import Board
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-i2criser"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-11"
REV = "1.0"

# ================= SCHEMA =================
s = Sch("d0730000-0000-4000-8000-000000000000", "musicbrain-i2criser",
        "MusicBrain I2C-RISER - domme riser voor I2C-fronts", REV, DATE,
        ("Onder: slot (2x10). Boven: front (1x10: 1=GND, 2=SDA, 3=SCL, 4=IRQ, 10=+3V3)",
         "Leidende spec: doc/spi-bus-spec.md; front-standaard x=116,5 / pin1 y=143,57"))
s.libs += [FLAG_SYM, conn_symbol("Conn_02x10", 10), conn1_symbol("Conn_01x10", 10),
           power_symbol("GND", False), power_symbol("+3V3", True)]

# J1 (bus, 2x10) - alleen GND/3V3/I2C/IRQ gebruikt
JX, JY = 60, 120
s.component("Custom:Conn_02x10", "J1", "BUS",
            JX, JY, 0, "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal")
J1_L = ["GND", "GND", "GND", None, None, None, None, None, "SDA", None]
J1_R = [None, None, "+3V3", "GND", "GND", "GND", "GND", "IRQ", "SCL", None]
for k in range(10):
    y = JY - 11.43 + 2.54 * k
    for nm, west in ((J1_L[k], True), (J1_R[k], False)):
        x = JX + (-7.62 if west else 7.62)
        xe = JX + (-12.7 if west else 12.7)
        if nm is None:
            s.nc(x, y)
        elif nm in ("GND", "+3V3"):
            s.wire(x, y, xe, y)
            s.power(f"power:{nm}", xe, y, 0, vx=xe, vy=(y - 3.302 if nm == "+3V3" else y + 3.81))
        else:
            s.wire(x, y, xe, y); s.label(nm, xe, y)

# J2 (naar front, 1x10)
FX, FY = 160, 120
s.component("Custom:Conn_01x10", "J2", "NAAR FRONT", FX, FY, 0,
            "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal")
J2SPEC = ["GND", "SDA", "SCL", "IRQ", None, None, None, None, None, "+3V3"]
for k in range(10):
    y = FY - 11.43 + 2.54 * k
    nm = J2SPEC[k]
    if nm is None:
        s.nc(FX - 7.62, y)
        continue
    s.wire(FX - 7.62, y, FX - 12.7, y)
    if nm == "GND":
        s.power("power:GND", FX - 12.7, y)
    elif nm == "+3V3":
        s.power("power:+3V3", FX - 12.7, y, 0, vx=FX - 12.7, vy=y - 3.302)
    else:
        s.label(nm, FX - 12.7, y)

# PWR_FLAGs (voeding komt via J1)
s.wire(20, 175, 25.08, 175); s.power("power:GND", 20, 175); s.flag(25.08, 175)
s.wire(20, 165, 25.08, 165); s.power("power:+3V3", 20, 165); s.flag(25.08, 165)
s.text("I2C-RISER: domme doorlus slot -> I2C-front (ENC5). Pull-ups zitten op de\\n"
       "busmaster-kant (Qwiic-keten); hier niets actiefs.", 20, 190)
s.write(os.path.join(OUT_DIR, "musicbrain-i2criser.kicad_sch"))

# ================= PCB =================
NETS = ['', 'GND', '+3V3', '/SDA', '/SCL', '/IRQ']
b = Board("MusicBrain I2C-RISER - domme riser voor I2C-fronts", REV, (116, 145, 0),
          102, 100, 130, 180, NETS, DATE)
b.silk_name = 'i2criser'
CX = 116.0
HDR2 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
        'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal')
HDR1 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
        'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal')

J1_MAP = b.nm({'1': 'GND', '3': 'GND', '5': 'GND', '6': '+3V3',
               '8': 'GND', '10': 'GND', '12': 'GND', '14': 'GND',
               '16': '/IRQ', '17': '/SDA', '18': '/SCL'})
J2_MAP = b.nm({'1': 'GND', '2': '/SDA', '3': '/SCL', '4': '/IRQ', '10': '+3V3'})

b.fp(HDR2[0], HDR2[1], 'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)         # onder, slot in
b.fp(HDR1[0], HDR1[1], 'J2', 'NAAR FRONT', CX - 11.43, 106.58, 90, J2_MAP)   # boven, front in

P = b.P
SW = 0.25


def _pad_x(ref, pin):
    return P[ref][pin][0]


# signalen op B.Cu (vlak op F blijft dicht op de +3V3-rail na).
# J1: oneven pinnen = noordrij y173,42, even = zuidrij y175,96; vrije
# corridors: tussen de rijen y=174,69 en tussen de kolommen op gap-mid.
ROWMID = 174.69
# SDA: J1-17 (noordrij, x107,11) en J2-2 delen de kolom -> gap-mid west
sda_j, sda_f = P['J1']['17'], P['J2']['2']
b.T('/SDA', 'B.Cu', SW, sda_j, (105.84, sda_j[1]), (105.84, 109.5),
    (sda_f[0], 109.5), sda_f)
# SCL: J1-18 (zuidrij, onder pad 17!) -> rijcorridor -> kolom-gap oost ->
# laan y110,3 -> J2-3
scl_j, scl_f = P['J1']['18'], P['J2']['3']
b.T('/SCL', 'B.Cu', SW, scl_j, (scl_j[0], ROWMID), (108.38, ROWMID),
    (108.38, 110.3), (scl_f[0], 110.3), scl_f)
# IRQ: J1-16 (zuidrij, onder pad 15) -> rijcorridor -> kolom-gap oost ->
# laan y111,1 -> J2-4
irq_j, irq_f = P['J1']['16'], P['J2']['4']
b.T('/IRQ', 'B.Cu', SW, irq_j, (irq_j[0], ROWMID), (110.92, ROWMID),
    (110.92, 111.1), (irq_f[0], 111.1), irq_f)
# +3V3: oostrand-rail op F.Cu (potriser-recept)
p6 = P['J1']['6']
j2_10 = P['J2']['10']
b.T('+3V3', 'F.Cu', .4, p6, (p6[0], 177.4), (128.8, 177.4), (128.8, 107.5),
    (j2_10[0], 107.5), j2_10)
# GND-hechtvia's
for x, y in ((103.5, 101.5), (128.5, 101.5), (103.5, 178.5), (126, 178.5),
             (103.5, 140), (127, 140), (116, 120), (116, 160)):
    b.V('GND', x, y)

b.write(os.path.join(OUT_DIR, "musicbrain-i2criser.kicad_pcb"))
open(os.path.join(OUT_DIR, "musicbrain-i2criser.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-i2criser.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "MusicBrain i2criser"},\n'
    '  "schematic": {"file": "musicbrain-i2criser.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-i2criser.kicad_pcb"}\n}\n')
print("written musicbrain-i2criser")
