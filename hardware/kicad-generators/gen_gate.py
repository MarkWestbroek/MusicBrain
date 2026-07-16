"""MusicBrain GATE8 (gen 2) - 8x gate-uitgang (74HCT595 @ +5V), sch + PCB.

Gen 2 (spi-bus-spec v2.0): slot 2x12, kaart 80x45 (bus.KAART_B x bus.H).
Onder: haakse male 2x12 in het slot (GND/+12V/SCLK/MOSI/CS gebruikt; +5V is
lokaal via AMS1117-5.0). Boven: haakse male 1x10 naar het jack-front,
gecentreerd op het kaarthart. U1 rot 270: uitgangen (QA-QH) noordwaarts naar
de serieweerstanden, SPI+GND zuidwaarts naar J1 (potriser-les). Signaalroutes
via freerouting (SES naast dit script); GND via de vlakken + gnd_stitch.json.

Vervangt gen_gate_sch.py + gen_gate_pcb_v11.py (gen 1, 35x80, handroutes).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-gate8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

GEBRUIKT = {'GND', '+12V', '/SCLK', '/MOSI', '/CS'}
Q = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH']   # QA=GATE1 .. QH=GATE8

# ================= SCHEMA =================
s = Sch("d0000000-0000-4000-8000-000000000000", "musicbrain-gate8",
        "MusicBrain GATE8 - 8x gate output slot card", REV, DATE,
        ("Gen 2: slot 2x12 (spi-bus-spec v2.0), kaart 80x45",
         "74HCT595 @ +5V (AMS1117 vanaf +12V); SPI mode 0, latch op CS-flank",
         "gates 0-5V via 1k serie; bit0=QA=GATE1 .. bit7=QH=GATE8"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("74HCT595",
                      [("14", "SER", "input"), ("11", "SRCLK", "input"),
                       ("12", "RCLK", "input"), ("13", "~{OE}", "input"),
                       ("10", "~{SRCLR}", "input"), ("8", "GND", "power_in")],
                      [("16", "VCC", "power_in"), ("15", "QA", "output"),
                       ("1", "QB", "output"), ("2", "QC", "output"),
                       ("3", "QD", "output"), ("4", "QE", "output"),
                       ("5", "QF", "output"), ("6", "QG", "output"),
                       ("7", "QH", "output"), ("9", "QH'", "output")]),
           box_symbol("AMS1117-5.0",
                      [("3", "VI", "power_in"), ("1", "GND", "power_in")],
                      [("2", "VO", "power_out")]),
           power_symbol("GND", False), power_symbol("+12V", True),
           power_symbol("+5V", True)]

# J1 = slot 2x12 (gen-2-pinout uit bus.py; ongebruikte pinnen nc)
JX, JY = 50, 120
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
    elif net in ('GND', '+12V'):
        s.wire(x, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe,
                vy=(y - 3.302 if net == '+12V' else y + 3.81))
    else:
        s.wire(x, y, xe, y); s.label(net.lstrip('/'), xe, y)

# 74HCT595 (10 rijen: eerste pin op UY-11.43)
UX, UY = 120, 120
s.component("Custom:74HCT595", "U1", "74HCT595", UX, UY, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
LPIN = ["MOSI", "SCLK", "CS", "GND", "+5V", "GND"]     # SER SRCLK RCLK ~OE ~SRCLR GND
for k, nm in enumerate(LPIN):
    y = UY - 11.43 + 2.54 * k
    s.wire(UX - 11.43, y, UX - 15.24, y)
    if nm in ("GND", "+5V"):
        s.power(f"power:{nm}", UX - 15.24, y, 0, vx=UX - 15.24,
                vy=(y - 3.302 if nm == "+5V" else y + 3.81))
    else:
        s.label(nm, UX - 15.24, y)
RPIN = ["+5V"] + Q + [None]                            # VCC QA..QH QH'
for k, nm in enumerate(RPIN):
    y = UY - 11.43 + 2.54 * k
    if nm is None:
        s.nc(UX + 11.43, y); continue
    s.wire(UX + 11.43, y, UX + 15.24, y)
    if nm == "+5V":
        s.power("power:+5V", UX + 15.24, y, 0, vx=UX + 15.24, vy=y - 3.302)
    else:
        s.label(nm, UX + 15.24, y)

# serieweerstanden Q -> GATE (steek 20: labels vrij van de buurdraad)
for k in range(8):
    x = 150 + 20 * (k % 4)
    yr = 115 if k < 4 else 130
    s.component("Device:R", f"R{k+1}", "1k", x, yr, 90,
                "Resistor_SMD:R_0805_2012Metric")
    s.wire(x - 3.81, yr, x - 6.35, yr); s.label(Q[k], x - 6.35, yr)
    s.wire(x + 3.81, yr, x + 6.35, yr); s.label(f"GATE{k+1}", x + 6.35, yr)

# J2 = front 1x10
FX, FY = 50, 172
s.component("Custom:Conn_01x10", "J2", "GATES OUT", FX, FY, 0,
            bus.HDR_PANEEL[1])
J2_P = ["GND"] + [f"GATE{k}" for k in range(1, 9)] + ["GND"]
for k in range(10):
    y = FY - 11.43 + 2.54 * k
    s.wire(FX - 7.62, y, FX - 12.7, y)
    if J2_P[k] == "GND":
        s.power("power:GND", FX - 12.7, y)
    else:
        s.label(J2_P[k], FX - 12.7, y)

# +12V -> +5V regelaar + ontkoppeling
RX, RY = 120, 170
s.component("Custom:AMS1117-5.0", "U2", "AMS1117-5.0", RX, RY, 0,
            "Package_TO_SOT_SMD:SOT-223-3_TabPin2")
s.wire(RX - 11.43, RY - 1.27, RX - 15.24, RY - 1.27)
s.power("power:+12V", RX - 15.24, RY - 1.27, 0, vx=RX - 15.24, vy=RY - 1.27 - 3.302)
s.wire(RX - 11.43, RY + 1.27, RX - 15.24, RY + 1.27)
s.power("power:GND", RX - 15.24, RY + 1.27)
s.wire(RX + 11.43, RY - 1.27, RX + 15.24, RY - 1.27)
s.power("power:+5V", RX + 15.24, RY - 1.27, 0, vx=RX + 15.24, vy=RY - 1.27 - 3.302)
CAPS = [("C1", "100n", False, "+12V", 150), ("C2", "10u", True, "+5V", 162),
        ("C3", "100n", False, "+5V", 174)]
for ref, val, pol, rail, cx in CAPS:
    lib = "Device:C_Polarized" if pol else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if pol
          else "Capacitor_SMD:C_0805_2012Metric")
    s.component(lib, ref, val, cx, 170, 0, fp)
    s.wire(cx, 166.19, cx, 163.83); s.power(f"power:{rail}", cx, 163.83,
                                            0, vx=cx, vy=163.83 - 3.302)
    s.wire(cx, 173.81, cx, 176.17); s.power("power:GND", cx, 176.17)
# PWR-flags op de bus-gevoede rails
s.wire(215, 100, 220.08, 100); s.power("power:+12V", 215, 100, 0,
                                       vx=215, vy=100 - 3.302); s.flag(220.08, 100)
s.wire(215, 110, 220.08, 110); s.power("power:GND", 215, 110); s.flag(220.08, 110)
s.text("GATE8 gen 2: 74HCT595 @ +5V = SPI-slave zonder MCU.\\n"
       "SER=MOSI, SRCLK=SCLK, RCLK=CS; latch op stijgende CS-flank (mode 0).\\n"
       "J2: 1=GND, 2-9=GATE1..8, 10=GND; bit0=QA=GATE1 .. bit7=QH=GATE8.", 20, 30)
s.write(OUT_DIR + r"\musicbrain-gate8.kicad_sch")

# ================= PCB =================
NETS = (['', '+12V', '+5V', 'GND', '/SCLK', '/MOSI', '/CS']
        + [f'/GATE{k}' for k in range(1, 9)] + [f'/{q}' for q in Q])
BX0, BX1 = 100.0, bus.KAART_B + 100.0     # 80 mm
CX = (BX0 + BX1) / 2                      # 140.0
b = Board("MusicBrain GATE8 - 8x gate out slot card", REV,
          (114, 128, 0), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'gate8'
P = b.P

J1_MAP = bus.j1_map(b, GEBRUIKT)
J2_MAP = b.nm({'1': 'GND', '10': 'GND',
               **{str(k+1): f'/GATE{k}' for k in range(1, 9)}})
U1_MAP = b.nm({'15': '/QA', '1': '/QB', '2': '/QC', '3': '/QD', '4': '/QE',
               '5': '/QF', '6': '/QG', '7': '/QH', '8': 'GND', '10': '+5V',
               '11': '/SCLK', '12': '/CS', '13': 'GND', '14': '/MOSI',
               '16': '+5V'})
U2_MAP = b.nm({'1': 'GND', '2': '+5V', '3': '+12V'})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'GATES OUT',
     CX - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90, J2_MAP)

# serieweerstanden recht onder hun J2-pin (pin 2..9)
INX = [P['J2']['1'][0] + 2.54 * k for k in range(1, 9)]
for k in range(8):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k+1}', '1k', INX[k], 108.3, 90,
         b.rc(f'/{Q[k]}', f'/GATE{k+1}'))

# 595 rot 270: Q-uitgangen (pins 1-7 + 15) noordwaarts, SPI/GND zuidwaarts
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', '74HCT595',
     CX, 118.5, 270, U1_MAP)
# regelaar + ontkoppeling in de oosthelft (J1-courtyard begint op y=134,1)
b.fp('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U2', 'AMS1117-5.0',
     162.0, 126.0, 0, U2_MAP)
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 170.5, 126.0, 90,
     b.rc('+12V', 'GND'))
b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 153.0, 126.0, 90,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '100n', 148.0, 122.0, 90,
     b.rc('+5V', 'GND'))

# signalen via freerouting (SES); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-gate8.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")

# GND-hechtvia's: hoeken/randen + eiland-via's uit gnd_stitch.json
for x, y in ((102, bus.BY0 + 2), (178, bus.BY0 + 2), (102, bus.BY1 - 2),
             (178, bus.BY1 - 2), (102, 122), (178, 122),
             (112, bus.BY1 - 10), (168, bus.BY1 - 10)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

b.write(OUT_DIR + r"\musicbrain-gate8.kicad_pcb")
print("written musicbrain-gate8 (gen 2)")
