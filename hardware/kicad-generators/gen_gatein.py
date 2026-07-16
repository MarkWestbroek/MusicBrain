"""MusicBrain GATEIN8 (gen 2) - 8x gate/trigger-ingang (74HC165 + LVC1G125).

Gen 2 (spi-bus-spec v2.0): slot 2x12, kaart 50x45.
Onder: haakse male 2x12 in het slot (alleen GND/3V3/SCLK/MISO/CS gebruikt).
Boven: haakse male 1x10 naar het jack-front, gecentreerd op het kaarthart.
Signaalroutes via freerouting (SES naast dit script); GND via de vlakken +
hechtvia's (gnd_stitch.json).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board, fmt
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-gatein8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

GEBRUIKT = {'GND', '+3V3', '/SCLK', '/MISO', '/CS'}

# mapping kanaal -> 165-ingang (vast contract met de firmware sinds gen 1)
D_OF_IN = {1: 'D3', 2: 'D2', 3: 'D4', 4: 'D5', 5: 'D6', 6: 'D7', 7: 'D1', 8: 'D0'}

# ================= SCHEMA =================
s = Sch("d0800000-0000-4000-8000-000000000000", "musicbrain-gatein8",
        "MusicBrain GATEIN8 - 8x gate in slot card", REV, DATE,
        ("Gen 2: slot 2x12 (spi-bus-spec v2.0), kaart 50x45",
         "74HC165 + 74LVC1G125 (tri-state MISO); RC-latchpuls op ~PL vanaf CS",
         "per kanaal: 100k serie, 100k pulldown, BAT54S-clamp naar 3V3"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("74HC165",
                      [("1", "~{PL}", "input"), ("2", "CP", "input"),
                       ("3", "D4", "input"), ("4", "D5", "input"),
                       ("5", "D6", "input"), ("6", "D7", "input"),
                       ("7", "~{Q7}", "output"), ("8", "GND", "power_in")],
                      [("16", "VCC", "power_in"), ("15", "~{CE}", "input"),
                       ("14", "D3", "input"), ("13", "D2", "input"),
                       ("12", "D1", "input"), ("11", "D0", "input"),
                       ("10", "DS", "input"), ("9", "Q7", "output")]),
           box_symbol("74LVC1G125",
                      [("1", "~{OE}", "input"), ("2", "A", "input"),
                       ("3", "GND", "power_in")],
                      [("5", "VCC", "power_in"), ("4", "Y", "tri_state")]),
           box_symbol("BAT54S",
                      [("1", "A1", "passive"), ("3", "K1A2", "passive")],
                      [("2", "K2", "passive")]),
           power_symbol("GND", False), power_symbol("+3V3", True)]

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
    elif net in ('GND', '+3V3'):
        s.wire(x, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe,
                vy=(y - 3.302 if net == '+3V3' else y + 3.81))
    else:
        s.wire(x, y, xe, y); s.label(net.lstrip('/'), xe, y)

s.component("Custom:Conn_01x10", "J2", "GATES IN", 50, 170, 0,
            bus.HDR_PANEEL[1])
J2_P = ["GND"] + [f"IN{k}" for k in range(1, 9)] + ["GND"]
for k in range(10):
    y = 170 - 11.43 + 2.54 * k
    s.wire(50 - 7.62, y, 50 - 12.7, y)
    if J2_P[k] == "GND":
        s.power("power:GND", 50 - 12.7, y)
    else:
        s.label(J2_P[k], 50 - 12.7, y)

# conditionering per kanaal (steek 30 zodat power-symbolen nergens aan
# buurkanaal-draden plakken)
for k in range(1, 9):
    x = 85 + 30 * (k - 1)
    s.component("Device:R", f"R{k}", "100k", x, 165, 90,
                "Resistor_SMD:R_0805_2012Metric")
    s.wire(x - 3.81, 165, x - 7.62, 165); s.label(f"IN{k}", x - 7.62, 165)
    s.wire(x + 3.81, 165, x + 7.62, 165); s.label(f"N{k}", x + 7.62, 165)
    s.component("Device:R", f"R{k+10}", "100k", x, 175, 0,
                "Resistor_SMD:R_0805_2012Metric")
    s.wire(x, 171.19, x, 169.5); s.label(f"N{k}", x, 169.5)
    s.wire(x, 178.81, x, 181.17); s.power("power:GND", x, 181.17)
    # BAT54S-box: linkerpins 1 (A1, y=184.73) en 3 (K1A2, y=187.27) op
    # x-11.43; rechterpin 2 (K2, y=184.73) op x+11.43
    dx_ = x + 10
    s.component("Custom:BAT54S", f"D{k}", "BAT54S", dx_, 186, 0,
                "Package_TO_SOT_SMD:SOT-23")
    s.wire(dx_ - 11.43, 184.73, dx_ - 14.43, 184.73)
    s.power("power:GND", dx_ - 14.43, 184.73)
    s.wire(dx_ - 11.43, 187.27, dx_ - 14.43, 187.27)
    s.label(f"N{k}", dx_ - 14.43, 187.27)
    s.wire(dx_ + 11.43, 184.73, dx_ + 13.43, 184.73)
    s.power("power:+3V3", dx_ + 13.43, 184.73,
            vx=dx_ + 13.43, vy=184.73 - 3.302)

# 74HC165
UX, UY = 120, 120
s.component("Custom:74HC165", "U1", "74HC165", UX, UY, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
L165 = ["PL", "SCLK", "N3", "N4", "N5", "N6", None, "GND"]
R165 = ["+3V3", "GND", "N1", "N2", "N7", "N8", "GND", "Q7"]
for k in range(8):
    y = UY - 8.89 + 2.54 * k
    nm = L165[k]
    if nm is None:
        s.nc(UX - 11.43, y)
    elif nm == "GND":
        s.wire(UX - 11.43, y, UX - 15.24, y); s.power("power:GND", UX - 15.24, y)
    else:
        s.wire(UX - 11.43, y, UX - 15.24, y); s.label(nm, UX - 15.24, y)
    nm = R165[k]
    if nm in ("GND", "+3V3"):
        s.wire(UX + 11.43, y, UX + 15.24, y)
        s.power(f"power:{nm}", UX + 15.24, y, 0,
                vx=UX + 15.24, vy=(y - 3.302 if nm == "+3V3" else y + 3.81))
    else:
        s.wire(UX + 11.43, y, UX + 15.24, y); s.label(nm, UX + 15.24, y)

# LVC1G125 buffer
BX, BY = 175, 120
s.component("Custom:74LVC1G125", "U2", "74LVC1G125", BX, BY, 0,
            "Package_TO_SOT_SMD:SOT-23-5")
s.wire(BX - 11.43, BY - 2.54 + 2.54, BX - 15.24, BY)  # pin2 A (rij 2)
s.label("Q7", BX - 15.24, BY)
s.wire(BX - 11.43, BY - 2.54, BX - 15.24, BY - 2.54); s.label("CS", BX - 15.24, BY - 2.54)
s.wire(BX - 11.43, BY + 2.54, BX - 15.24, BY + 2.54)
s.power("power:GND", BX - 15.24, BY + 2.54)
s.wire(BX + 11.43, BY - 2.54, BX + 15.24, BY - 2.54)
s.power("power:+3V3", BX + 15.24, BY - 2.54, vx=BX + 15.24, vy=BY - 2.54 - 3.302)
s.wire(BX + 11.43, BY, BX + 15.24, BY); s.label("MISO", BX + 15.24, BY)

# PL-RC: R9 10k naar 3V3, C3 220p vanaf CS
s.component("Device:R", "R9", "10k", 210, 115, 0, "Resistor_SMD:R_0805_2012Metric")
s.wire(210, 111.19, 210, 108.83); s.power("power:+3V3", 210, 108.83)
s.wire(210, 118.81, 210, 121.5); s.label("PL", 210, 121.5)
s.component("Device:C", "C3", "220p", 210, 128, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(210, 124.19, 210, 121.5)
s.wire(210, 131.81, 210, 134.5); s.label("CS", 210, 134.5)
# ontkoppeling + flags
s.component("Device:C", "C1", "100n", 230, 115, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(230, 111.19, 230, 108.83); s.power("power:+3V3", 230, 108.83)
s.wire(230, 118.81, 230, 121.17); s.power("power:GND", 230, 121.17)
s.component("Device:C_Polarized", "C2", "10u", 242, 115, 0, "Capacitor_SMD:CP_Elec_4x5.3")
s.wire(242, 111.19, 242, 108.83); s.power("power:+3V3", 242, 108.83)
s.wire(242, 118.81, 242, 121.17); s.power("power:GND", 242, 121.17)
s.wire(255, 100, 260.08, 100); s.power("power:+3V3", 255, 100); s.flag(260.08, 100)
s.wire(255, 110, 260.08, 110); s.power("power:GND", 255, 110); s.flag(260.08, 110)
s.text("GATEIN8 gen 2: CS-flank geeft via C3/R9 een korte ~PL-puls (latch),\\n"
       "daarna 8 bits klokken; firmware wacht >=5us na CS-laag.\\n"
       "Bitvolgorde (Q7 eerst): IN6 IN5 IN4 IN3 IN1 IN2 IN7 IN8.", 20, 30)
s.write(OUT_DIR + r"\musicbrain-gatein8.kicad_sch")

# ================= PCB =================
NETS = (['', '+3V3', 'GND', '/SCLK', '/MISO', '/CS', '/PL', '/Q7']
        + [f'/IN{k}' for k in range(1, 9)] + [f'/N{k}' for k in range(1, 9)])
BX0, BX1 = 115.0, 165.0                   # 50 mm (afslank-ronde)
CX = (BX0 + BX1) / 2                      # 140.0
b = Board("MusicBrain GATEIN8 - 8x gate in slot card", REV,
          (118.5, 122, 90), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'gatein8'
P = b.P

J1_MAP = bus.j1_map(b, GEBRUIKT)
J2_MAP = b.nm({'1': 'GND', '10': 'GND', **{str(k+1): f'/IN{k}' for k in range(1, 9)}})
U1_MAP = b.nm({'1': '/PL', '2': '/SCLK', '3': '/N3', '4': '/N4', '5': '/N5',
               '6': '/N6', '8': 'GND', '9': '/Q7', '10': 'GND', '11': '/N8',
               '12': '/N7', '13': '/N2', '14': '/N1', '15': 'GND', '16': '+3V3'})
U2_MAP = b.nm({'1': '/CS', '2': '/Q7', '3': 'GND', '4': '/MISO', '5': '+3V3'})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'GATES IN',
     CX - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90, J2_MAP)

# kanaalkolommen recht onder hun J2-pin (pin 2..9)
INX = [P['J2']['1'][0] + 2.54 * k for k in range(1, 9)]
for k in range(1, 9):
    x = INX[k - 1]
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k}', '100k', x, 108.3, 270,
         b.rc(f'/IN{k}', f'/N{k}'))
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k+10}', '100k', x + 1.27, 112.3, 270,
         b.rc(f'/N{k}', 'GND'))
    yd = 116.8 if k % 2 == 1 else 121.0    # verspringend: SOT-23 breder dan 2,54
    b.fp('Package_TO_SOT_SMD.pretty\\SOT-23.kicad_mod',
         'Package_TO_SOT_SMD:SOT-23', f'D{k}', 'BAT54S', x, yd, 90,
         b.nm({'1': 'GND', '2': '+3V3', '3': f'/N{k}'}))

# 165 in het hart van de band; ingangen bereikbaar van noord, SPI zuid naar J1
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', '74HC165', CX, 128.0, 90, U1_MAP)
b.fp('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod',
     'Package_TO_SOT_SMD:SOT-23-5', 'U2', '74LVC1G125', 152.0, 130.5, 0, U2_MAP)
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R9', '10k', 130.0, 130.5, 0,
     b.rc('+3V3', '/PL'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '220p', 130.0, 133.0, 0,
     b.rc('/PL', '/CS'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 132.0, 124.5, 0,
     b.rc('+3V3', 'GND'))
b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 158.5, 126.5, 90,
     b.rc('+3V3', 'GND'))

# signalen via freerouting (SES); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-gatein8.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")

# GND-hechtvia's: hoeken/randen + eiland-via's uit gnd_stitch.json
for x, y in ((BX0 + 2, bus.BY0 + 2), (BX1 - 2, bus.BY0 + 2), (BX0 + 2, bus.BY1 - 2),
             (BX1 - 2, bus.BY1 - 2), (BX0 + 2, 122), (BX1 - 2, 122),
             (BX0 + 6, bus.BY1 - 10), (BX1 - 6, bus.BY1 - 10)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

b.write(OUT_DIR + r"\musicbrain-gatein8.kicad_pcb")
print("written musicbrain-gatein8 (gen 2)")
