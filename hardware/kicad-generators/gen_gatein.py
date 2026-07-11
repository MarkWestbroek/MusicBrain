"""MusicBrain GATEIN8 - 8x gate/trigger-ingang (74HC165 + LVC1G125), sch + PCB."""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board, fmt
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-gatein8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-08"

# mapping kanaal -> 165-ingang (routinggedreven; firmware hertelt)
D_OF_IN = {1: 'D3', 2: 'D2', 3: 'D4', 4: 'D5', 5: 'D6', 6: 'D7', 7: 'D1', 8: 'D0'}

# ================= SCHEMA =================
s = Sch("d0800000-0000-4000-8000-000000000000", "musicbrain-gatein8",
        "MusicBrain GATEIN8 - 8x gate in slot card", "1.0", DATE,
        ("74HC165 + 74LVC1G125 (tri-state MISO); RC-latchpuls op ~PL vanaf CS",
         "per kanaal: 100k serie, 100k pulldown, BAT54S-clamp naar 3V3"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x10", 10), conn1_symbol("Conn_01x10", 10),
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

JX, JY = 50, 120
s.component("Custom:Conn_02x10", "J1", "BUS", JX, JY, 0,
            "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal")
J1_L = ["GND", "GND", "GND", "SCLK", None, "MISO", "CS", None, None, None]
J1_R = [None, None, "+3V3", "GND", "GND", "GND", "GND", None, None, None]
for k in range(10):
    y = JY - 11.43 + 2.54 * k
    for nm, xw, xe in ((J1_L[k], JX - 7.62, JX - 12.7), (J1_R[k], JX + 7.62, JX + 12.7)):
        if nm is None:
            s.nc(xw, y)
        elif nm in ("GND", "+3V3"):
            s.wire(xw, y, xe, y)
            s.power(f"power:{nm}", xe, y, 0,
                    vx=xe, vy=(y - 3.302 if nm == "+3V3" else y + 3.81))
        else:
            s.wire(xw, y, xe, y); s.label(nm, xe, y)

s.component("Custom:Conn_01x10", "J2", "GATES IN", 50, 170, 0,
            "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal")
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
s.text("GATEIN8: CS-flank geeft via C3/R9 een korte ~PL-puls (latch),\\n"
       "daarna 8 bits klokken; firmware wacht >=5us na CS-laag.\\n"
       "Bitvolgorde (Q7 eerst): IN6 IN5 IN4 IN3 IN1 IN2 IN7 IN8.", 20, 30)
s.write(OUT_DIR + r"\musicbrain-gatein8.kicad_sch")

# ================= PCB =================
NETS = (['', '+3V3', 'GND', '/SCLK', '/MISO', '/CS', '/PL', '/Q7']
        + [f'/IN{k}' for k in range(1, 9)] + [f'/N{k}' for k in range(1, 9)])
b = Board("MusicBrain GATEIN8 - 8x gate in slot card", "1.0", (108, 178.4, 0),
          100, 100, 140, 180, NETS, DATE)
b.silk_name = 'gatein8'
P = b.P

J1_MAP = b.nm({'1': 'GND', '3': 'GND', '5': 'GND', '6': '+3V3', '7': '/SCLK',
               '8': 'GND', '10': 'GND', '11': '/MISO', '12': 'GND',
               '13': '/CS', '14': 'GND'})
J2_MAP = b.nm({'1': 'GND', '10': 'GND', **{str(k+1): f'/IN{k}' for k in range(1, 9)}})
U1_MAP = b.nm({'1': '/PL', '2': '/SCLK', '3': '/N3', '4': '/N4', '5': '/N5',
               '6': '/N6', '8': 'GND', '9': '/Q7', '10': 'GND', '11': '/N8',
               '12': '/N7', '13': '/N2', '14': '/N1', '15': 'GND', '16': '+3V3'})
U2_MAP = b.nm({'1': '/CS', '2': '/Q7', '3': 'GND', '4': '/MISO', '5': '+3V3'})

CX = 120.0
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal',
     'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal',
     'J2', 'GATES IN', CX - 11.43, 106.58, 90, J2_MAP)
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', '74HC165', 120, 138, 90, U1_MAP)
b.fp('Package_TO_SOT_SMD.pretty\\SOT-23-5.kicad_mod',
     'Package_TO_SOT_SMD:SOT-23-5', 'U2', '74LVC1G125', 133.5, 141.5, 0, U2_MAP)

INX = [111.11 + 2.54 * k for k in range(8)]        # kanaalkolommen (J2 pin 2..9)
for k in range(1, 9):
    x = INX[k - 1]
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k}', '100k', x, 111.5, 270,
         b.rc(f'/IN{k}', f'/N{k}'))
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k+10}', '100k', x + 1.27, 115.5, 270,
         b.rc(f'/N{k}', 'GND'))
    yd = 120.6 if k % 2 == 1 else 125.0
    # rot 90: pad 3 (K1A2) noord op de kolom, pad 1 (A1/GND) zw, pad 2 (K2) zo
    b.fp('Package_TO_SOT_SMD.pretty\\SOT-23.kicad_mod',
         'Package_TO_SOT_SMD:SOT-23', f'D{k}', 'BAT54S', x, yd, 90,
         b.nm({'1': 'GND', '2': '+3V3', '3': f'/N{k}'}))
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R9', '10k', 112.9, 145.4, 0,
     b.rc('+3V3', '/PL'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '220p', 110.8, 150.5, 270,
     b.rc('/PL', '/CS'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 113.6, 132.9, 180,
     b.rc('+3V3', 'GND'))
b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 135, 117.2, 90,
     b.rc('+3V3', 'GND'))

print('U1:', {p: P['U1'][p] for p in ('1', '8', '9', '16')})
print('U2:', P['U2'])
print('D1:', P['D1'], 'R1:', P['R1'], 'R11:', P['R11'])
assert P['U1']['1'] == (115.555, 140.475), P['U1']['1']
assert P['U1']['16'] == (115.555, 135.525), P['U1']['16']

SW = 0.25
# --- kanalen: J2 -> R serie -> knoop-kolom (diode + pulldown) -> lanes -> 165 ---
LANE_N = {1: 129.0, 2: 129.8, 7: 130.6, 8: 131.4}    # noordgroep
LANE_S = {3: 145.0, 4: 145.8, 5: 146.6, 6: 147.4}    # zuidgroep (door de chip heen)
TGT = {1: 118.095, 2: 119.365, 7: 120.635, 8: 121.905,   # D3 D2 D1 D0 (noordrij)
       3: 118.095, 4: 119.365, 5: 120.635, 6: 121.905}   # D4 D5 D6 D7 (zuidrij)
for k in range(1, 9):
    x = INX[k - 1]
    net = f'/N{k}'
    b.T(f'/IN{k}', 'F.Cu', SW, (x, 106.58), (x, 110.5875))
    yd = 120.6 if k % 2 == 1 else 125.0
    lane = LANE_N.get(k) or LANE_S[k]
    b.T(net, 'F.Cu', SW, (x, 112.4125), (x, lane))     # knoopkolom (door diode pad3)
    b.T(net, 'F.Cu', SW, (x, 114.5875), (x + 1.27, 114.5875))  # pulldown-tap
    b.V(net, x, lane)
    b.T(net, 'B.Cu', SW, (x, lane), (TGT[k], lane))
    b.V(net, TGT[k], lane)
    if k in LANE_N:
        b.T(net, 'F.Cu', SW, (TGT[k], lane), (TGT[k], 135.525))
    else:
        b.T(net, 'F.Cu', SW, (TGT[k], lane), (TGT[k], 140.475))
# diode +3V3-pads (rot 90: pad2 zo op (x+0.95, yd+0.9375)) -> via -> B-rij
for k in range(1, 9):
    x = INX[k - 1]
    yd = 120.6 if k % 2 == 1 else 125.0
    row = 122.9 if k % 2 == 1 else 127.3
    b.T('+3V3', 'F.Cu', SW, (x + 0.95, yd + 0.9375), (x + 0.95, row))
    b.V('+3V3', x + 0.95, row)
b.T('+3V3', 'B.Cu', 0.4, (111.5, 122.9), (138, 122.9))
b.T('+3V3', 'B.Cu', 0.4, (111.5, 127.3), (138, 127.3))
for x, y in ((138, 122.9), (138, 127.3), (138, 132.9), (138, 148.9)):
    b.V('+3V3', x, y)
# spine + J1.6-aanvoer + C2 aan de spine-top
p6 = P['J1']['6']
b.T('+3V3', 'F.Cu', 0.4, p6, (p6[0] + 1.27, p6[1]), (p6[0] + 1.27, 171.9),
    (138, 171.9), (138, 119.0))
b.T('+3V3', 'F.Cu', SW, (138, 119.0), P['C2']['1'])
# VCC-rij (B, y=132.9): chip pin16 + C1 + U2 pin5
b.T('+3V3', 'B.Cu', 0.4, (115.555, 132.9), (138, 132.9))
b.V('+3V3', 115.555, 132.9)
b.T('+3V3', 'F.Cu', SW, (115.555, 132.9), P['U1']['16'])
b.T('+3V3', 'F.Cu', SW, (115.555, 132.9), P['C1']['1'])
b.V('+3V3', 134.6375, 132.9)
b.T('+3V3', 'F.Cu', SW, (134.6375, 132.9), P['U2']['5'])
# R9-rij (B, y=148.9)
b.T('+3V3', 'B.Cu', 0.4, (111.9875, 148.9), (138, 148.9))
b.V('+3V3', 111.9875, 148.9)
b.T('+3V3', 'F.Cu', SW, (111.9875, 148.9), P['R9']['1'])

# --- SPI/stuur ---
# SCLK: J1.7 -> west -> CP (pin 2, zuidrij)
x7 = P['J1']['7'][0]
b.T('/SCLK', 'F.Cu', SW, (x7, 173.42), (x7, 152.5), (116.825, 152.5),
    (116.825, P['U1']['2'][1]))
# CS: J1.13 -> via -> B-rij 156.5 (west naar C3, oost naar U2 OE)
x13 = P['J1']['13'][0]
b.T('/CS', 'F.Cu', SW, (x13, 173.42), (x13, 156.5))
b.V('/CS', x13, 156.5)
b.T('/CS', 'B.Cu', SW, (110.8, 156.5), (130.2, 156.5))
b.V('/CS', 110.8, 156.5)
b.T('/CS', 'F.Cu', SW, (110.8, 156.5), (110.8, P['C3']['2'][1]))
b.V('/CS', 130.2, 156.5)
b.T('/CS', 'F.Cu', SW, (130.2, 156.5), (130.2, 140.55), P['U2']['1'])
# PL: C3 pad1 -> noord -> pin 1 (zuidrij) + R9 pad2-tak
b.T('/PL', 'F.Cu', SW, P['C3']['1'], (110.8, 142.3), (115.555, 142.3),
    P['U1']['1'])
b.T('/PL', 'F.Cu', SW, (113.8125, 142.3), P['R9']['2'])
# Q7 -> U2.A: B-hop oostom, F-stub tussen pads 4/5 door
b.V('/Q7', 124.445, 136.9)
b.T('/Q7', 'F.Cu', SW, P['U1']['9'], (124.445, 136.9))
b.T('/Q7', 'B.Cu', SW, (124.445, 136.9), (135.8, 136.9), (135.8, 141.5))
b.V('/Q7', 135.8, 141.5)
b.T('/Q7', 'F.Cu', SW, (135.8, 141.5), P['U2']['2'])
# MISO: U2.Y -> oostvert -> B-run onder J1 door -> J1.11 (THT, B-zijde)
x11 = P['J1']['11'][0]
b.T('/MISO', 'F.Cu', SW, P['U2']['4'], (134.6375, 143.6), (136.4, 143.6),
    (136.4, 170.3))
b.V('/MISO', 136.4, 170.3)
b.T('/MISO', 'B.Cu', SW, (136.4, 170.3), (x11, 170.3), (x11, 173.42))

# GND stitching
for x, y in ((102, 102), (138, 102), (102, 178), (105, 160), (102, 130),
             (126, 160), (104, 118), (120, 165), (139, 158), (102, 144),
             (109.84, 118.5), (127.62, 118.5),
             (117.46, 118.2), (120.0, 118.2), (122.54, 118.2)):
    b.V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-gatein8.kicad_pcb")
