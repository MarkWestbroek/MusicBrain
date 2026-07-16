"""MusicBrain I2C-RISER (gen 2) — domme riser voor I2C-fronts (ENC5-FRONT).

Gen 2 (spi-bus-spec v2.0): slot 2x12, H=50. Bord 40x50: de 2x12 spant
27,94 mm, dus de oude 28 mm-riser was te smal (pads op de bordrand).
Onder: haakse male 2x12 in het slot. Boven: haakse male 1x10 naar het front
(front-contract: 1 = GND, 2 = SDA, 3 = SCL, 4 = /IRQ, 5..9 = nc, 10 = +3V3).
Geen elektronica; pull-ups zitten aan de busmaster-kant (Qwiic-keten).
"""
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import Sch, conn_symbol, conn1_symbol, FLAG_SYM, power_symbol
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-i2criser"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

GEBRUIKT = {'GND', '+3V3', '/SDA', '/SCL', '/IRQ'}
# front-contract (1x10) — ongewijzigd t.o.v. gen 1
J2SPEC = ['GND', '/SDA', '/SCL', '/IRQ', None, None, None, None, None, '+3V3']

# ================= SCHEMA =================
s = Sch("d0730000-0000-4000-8000-000000000000", "musicbrain-i2criser",
        "MusicBrain I2C-RISER - domme riser voor I2C-fronts", REV, DATE,
        ("Gen 2: slot 2x12 (spi-bus-spec v2.0), H=50",
         "Boven: front 1x10 (1=GND, 2=SDA, 3=SCL, 4=IRQ, 10=+3V3)"))
s.libs += [FLAG_SYM, conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           power_symbol("GND", False), power_symbol("+3V3", True)]

JX, JY = 60, 120
s.component("Custom:Conn_02x12", "J1", "BUS (slot, 2x12)", JX, JY, 0,
            bus.HDR_BUS[1])
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

FX, FY = 160, 120
s.component("Custom:Conn_01x10", "J2", "NAAR FRONT", FX, FY, 0, bus.HDR_PANEEL[1])
for k in range(10):
    y = FY - 11.43 + 2.54 * k
    nm = J2SPEC[k]
    if nm is None:
        s.nc(FX - 7.62, y); continue
    s.wire(FX - 7.62, y, FX - 12.7, y)
    if nm == 'GND':
        s.power("power:GND", FX - 12.7, y)
    elif nm == '+3V3':
        s.power("power:+3V3", FX - 12.7, y, 0, vx=FX - 12.7, vy=y - 3.302)
    else:
        s.label(nm.lstrip('/'), FX - 12.7, y)

s.wire(20, 175, 25.08, 175); s.power("power:GND", 20, 175); s.flag(25.08, 175)
s.wire(20, 165, 25.08, 165); s.power("power:+3V3", 20, 165); s.flag(25.08, 165)
s.text("I2C-RISER gen 2: domme doorlus slot -> I2C-front (ENC5). De audio-lijnen\\n"
       "(21-24) en SPI lopen hier niet mee; alleen GND/3V3/SDA/SCL/IRQ.", 20, 190)
s.write(os.path.join(OUT_DIR, "musicbrain-i2criser.kicad_sch"))

# ================= PCB =================
NETS = ['', 'GND', '+3V3', '/SDA', '/SCL', '/IRQ']
BX0, BX1 = 100.0, 140.0           # 40 mm breed (2x12 = 27,94 + marge)
CX = (BX0 + BX1) / 2              # 120.0
b = Board("MusicBrain I2C-RISER - domme riser voor I2C-fronts", REV,
          (CX, (bus.BY0 + bus.BY1) / 2, 0), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'i2criser'

J1_MAP = bus.j1_map(b, GEBRUIKT)
J2_MAP = b.nm({str(k + 1): n for k, n in enumerate(J2SPEC) if n})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'NAAR FRONT',
     CX - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90, J2_MAP)

P = b.P
SW = 0.25
# J1 (rot 270): ONEVEN pinnen op de noordrij (richting J2), EVEN op de zuidrij.
# Een even pin moet dus langs zijn oneven buurman heen: via de rijcorridor naar
# een gap-kolom (halve steek naast de pads), en dan noordwaarts.
ROWMID = (P['J1']['1'][1] + P['J1']['2'][1]) / 2      # corridor tussen de rijen
GAP = 1.27

# Volgorde is kritisch: /SDA komt van x=113,65 maar moet naar J2-2 (x=111,11),
# terwijl /SCL juist naar x=113,65 moet. /SDA jogt daarom METEEN westwaarts
# (laan vlak bij J1), zodat de kolom 113,65 vrij komt voor /SCL.
sda, scl, irq = P['J1']['17'], P['J1']['18'], P['J1']['16']
f2, f3, f4 = P['J2']['2'], P['J2']['3'], P['J2']['4']

# /SDA: noordrij -> vroege jog naar de doelkolom -> recht noord
b.T('/SDA', 'B.Cu', SW, sda, (sda[0], 140.0), (f2[0], 140.0), f2)
# /SCL: zuidrij -> corridor -> gap-kolom -> laan 112 -> doelkolom
b.T('/SCL', 'B.Cu', SW, scl, (scl[0], ROWMID), (scl[0] + GAP, ROWMID),
    (scl[0] + GAP, 112.0), (f3[0], 112.0), f3)
# /IRQ: zuidrij -> corridor -> gap-kolom -> laan 112,5 -> doelkolom
b.T('/IRQ', 'B.Cu', SW, irq, (irq[0], ROWMID), (irq[0] + GAP, ROWMID),
    (irq[0] + GAP, 112.5), (f4[0], 112.5), f4)

# +3V3: J1-6 zuidwaarts de vrije strook in (bij H=50 is er 4 mm onder J1),
# dan oostrand-rail noordwaarts naar J2-10. Breed (0,4) mag hier: geen corridor.
p6, j2_10 = P['J1']['6'], P['J2']['10']
ZUID = bus.BY1 - 2.0          # 148.0
RAIL = BX1 - 2.2              # 137.8
b.T('+3V3', 'F.Cu', .4, p6, (p6[0], ZUID), (RAIL, ZUID), (RAIL, 109.0),
    (j2_10[0], 109.0), j2_10)
# GND-hechtvia's
for x, y in ((102, 101.5), (138, 101.5), (102, 148.5), (124, 148.8),
             (102, 125), (135.5, 125), (120, 118), (126, 118)):
    b.V('GND', x, y)

b.write(os.path.join(OUT_DIR, "musicbrain-i2criser.kicad_pcb"))
open(os.path.join(OUT_DIR, "musicbrain-i2criser.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-i2criser.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "MusicBrain i2criser"},\n'
    '  "schematic": {"file": "musicbrain-i2criser.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-i2criser.kicad_pcb"}\n}\n')
print("written musicbrain-i2criser (gen 2)")
