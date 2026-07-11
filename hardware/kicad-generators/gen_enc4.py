"""MusicBrain ENC4 - 4x encoder (PEC12R haaks) + MCP23017 (I2C), sch + PCB."""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, box_symbol, R_SYM, C_SYM, CP_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-enc4"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-08"

# ================= SCHEMA =================
s = Sch("d0a00000-0000-4000-8000-000000000000", "musicbrain-enc4",
        "MusicBrain ENC4 - 4x encoder slot card", "1.0", DATE,
        ("4x Bourns PEC12R (haaks, as door de bovenplaat) -> MCP23017 (I2C)",
         "INT -> IRQ (slotpin 16); interne pull-ups via GPPU; adres 0x20"))
MCP_L = [(str(k), f"GPB{k-1}", "bidirectional") for k in range(1, 9)] + [
    ("9", "VDD", "power_in"), ("10", "VSS", "power_in"),
    ("11", "NC", "no_connect"), ("12", "SCL", "input"),
    ("13", "SDA", "bidirectional"), ("14", "NC", "no_connect")]
MCP_R = [("28", "GPA7", "bidirectional"), ("27", "GPA6", "bidirectional"),
         ("26", "GPA5", "bidirectional"), ("25", "GPA4", "bidirectional"),
         ("24", "GPA3", "bidirectional"), ("23", "GPA2", "bidirectional"),
         ("22", "GPA1", "bidirectional"), ("21", "GPA0", "bidirectional"),
         ("20", "INTA", "output"), ("19", "INTB", "output"),
         ("18", "~{RESET}", "input"), ("17", "A2", "input"),
         ("16", "A1", "input"), ("15", "A0", "input")]
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x10", 10),
           box_symbol("MCP23017", MCP_L, MCP_R, width=20.32),
           box_symbol("PEC12R",
                      [("A", "A", "passive"), ("C", "C", "passive"),
                       ("B", "B", "passive")],
                      [("S1", "S1", "passive"), ("S2", "S2", "passive")]),
           power_symbol("GND", False), power_symbol("+3V3", True)]

JX, JY = 45, 120
s.component("Custom:Conn_02x10", "J1", "BUS", JX, JY, 0,
            "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal")
J1_L = ["GND", "GND", "GND", None, None, None, None, None, "SDA", None]
J1_R = [None, None, "+3V3", "GND", "GND", "GND", "GND", "IRQ", "SCL", None]
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

# MCP23017
UX, UY = 130, 120
s.component("Custom:MCP23017", "U1", "MCP23017", UX, UY, 0,
            "Package_SO:SOIC-28W_7.5x17.9mm_P1.27mm")
LNETS = ["E4A", "E4S", "E4B", "E3A", None, None, None, None,
         "+3V3!", "GND!", None, "SCL", "SDA", None]
RNETS = ["E1B", "E1S", "E1A", "E2B", "E2S", "E2A", "E3B", "E3S",
         "IRQ", None, "+3V3!", "GND!", "GND!", "GND!"]
for k, nm in enumerate(LNETS):
    y = UY - 16.51 + 2.54 * k
    if nm is None:
        s.nc(UX - 12.7, y)
    elif nm.endswith("!"):
        r = nm[:-1]
        s.wire(UX - 12.7, y, UX - 16.51, y)
        s.power(f"power:{r}", UX - 16.51, y, 0,
                vx=UX - 16.51, vy=(y - 3.302 if r == "+3V3" else y + 3.81))
    else:
        s.wire(UX - 12.7, y, UX - 16.51, y); s.label(nm, UX - 16.51, y)
for k, nm in enumerate(RNETS):
    y = UY - 16.51 + 2.54 * k
    if nm is None:
        s.nc(UX + 12.7, y)
    elif nm.endswith("!"):
        r = nm[:-1]
        s.wire(UX + 12.7, y, UX + 16.51, y)
        s.power(f"power:{r}", UX + 16.51, y, 0,
                vx=UX + 16.51, vy=(y - 3.302 if r == "+3V3" else y + 3.81))
    else:
        s.wire(UX + 12.7, y, UX + 16.51, y); s.label(nm, UX + 16.51, y)

# encoders + ontdenderingscaps
for k in range(1, 5):
    x = 60 + 40 * (k - 1)
    s.component("Custom:PEC12R", f"SW{k}", "PEC12R", x, 165, 0,
                "Rotary_Encoder:RotaryEncoder_Bourns_Horizontal_PEC12R-2x17F-Sxxxx")
    s.wire(x - 11.43, 162.46, x - 16.51, 162.46); s.label(f"E{k}A", x - 16.51, 162.46)
    s.wire(x - 11.43, 165.0, x - 16.51, 165.0)
    s.power("power:GND", x - 16.51, 165.0)
    s.wire(x - 11.43, 167.54, x - 16.51, 167.54); s.label(f"E{k}B", x - 16.51, 167.54)
    s.wire(x + 11.43, 162.46, x + 16.51, 162.46); s.label(f"E{k}S", x + 16.51, 162.46)
    s.wire(x + 11.43, 165.0, x + 16.51, 165.0)
    s.power("power:GND", x + 16.51, 165.0)
# ontkoppeling + flags
s.component("Device:C", "C1", "100n", 225, 120, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(225, 116.19, 225, 113.83); s.power("power:+3V3", 225, 113.83)
s.wire(225, 123.81, 225, 126.17); s.power("power:GND", 225, 126.17)
s.component("Device:C_Polarized", "C2", "10u", 237, 120, 0,
            "Capacitor_SMD:CP_Elec_4x5.3")
s.wire(237, 116.19, 237, 113.83); s.power("power:+3V3", 237, 113.83)
s.wire(237, 123.81, 237, 126.17); s.power("power:GND", 237, 126.17)
s.wire(255, 100, 260.08, 100); s.power("power:+3V3", 255, 100); s.flag(260.08, 100)
s.wire(255, 110, 260.08, 110); s.power("power:GND", 255, 110); s.flag(260.08, 110)
s.text("ENC4: 4x PEC12R (24 det., met drukknop) op MCP23017, adres 0x20.\\n"
       "Interne pull-ups aanzetten (GPPU); INTA=INTB mirror -> IRQ.\\n"
       "GPA0-7 = E1B E1S E1A E2B E2S E2A E3B E3S; GPB0-3 = E4A E4S E4B E3A.",
       20, 30)
s.write(OUT_DIR + r"\musicbrain-enc4.kicad_sch")

# ================= PCB =================
NETS = (['', '+3V3', 'GND', '/SDA', '/SCL', '/IRQ']
        + [f'/E{k}{p}' for k in range(1, 5) for p in ('A', 'B', 'S')])
b = Board("MusicBrain ENC4 - 4x encoder slot card", "1.0", (122, 178.4, 0),
          100, 100, 170, 180, NETS, DATE)
b.silk_name = 'enc4'
P = b.P

J1_MAP = b.nm({'1': 'GND', '3': 'GND', '5': 'GND', '6': '+3V3', '8': 'GND',
               '10': 'GND', '12': 'GND', '14': 'GND', '16': '/IRQ',
               '17': '/SDA', '18': '/SCL'})
U1_MAP = b.nm({'1': '/E4A', '2': '/E4S', '3': '/E4B', '4': '/E3A',
               '9': '+3V3', '10': 'GND', '12': '/SCL', '13': '/SDA',
               '15': 'GND', '16': 'GND', '17': 'GND', '18': '+3V3',
               '20': '/IRQ',
               '21': '/E3S', '22': '/E3B', '23': '/E2A', '24': '/E2S',
               '25': '/E2B', '26': '/E1A', '27': '/E1S', '28': '/E1B'})

CX = 135.0
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal',
     'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)
b.fp('Package_SO.pretty\\SOIC-28W_7.5x17.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-28W_7.5x17.9mm_P1.27mm', 'U1', 'MCP23017',
     135, 135, 90, U1_MAP)
ENCX = [111, 127.7, 144.4, 161.1]
for k, x in enumerate(ENCX, start=1):
    b.fp('Rotary_Encoder.pretty\\RotaryEncoder_Bourns_Horizontal_PEC12R-2x17F-Sxxxx.kicad_mod',
         'Rotary_Encoder:RotaryEncoder_Bourns_Horizontal_PEC12R-2x17F-Sxxxx',
         f'SW{k}', 'PEC12R', x, 109, 270,
         b.nm({'A': f'/E{k}A', 'B': f'/E{k}B', 'C': 'GND',
               'S1': f'/E{k}S', 'S2': 'GND'}))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C1', '100n', 135.1, 143.4, 180,
     b.rc('+3V3', 'GND'))
b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C2', '10u', 147.0, 155.5, 90,
     b.rc('+3V3', 'GND'))

print('SW1:', P['SW1'])
print('U1 1/14/15/28:', P['U1']['1'], P['U1']['14'], P['U1']['15'], P['U1']['28'])
print('C1:', P['C1'], 'C2:', P['C2'])

SW = 0.25
T, V = b.T, b.V
def spin(n):        # zuidrij pin x (1-14)
    return 126.745 + 1.27 * (n - 1)
def npin(n):        # noordrij pin x (15-28)
    return 143.255 - 1.27 * (n - 15)
YS, YN = 139.65, 130.35

# lanes (B) per net
LANE = {'/E2A': 115.3, '/E2S': 116.1, '/E2B': 116.9, '/E1A': 117.7,
        '/E1S': 118.5, '/E1B': 119.3, '/E3B': 120.1, '/E3S': 120.9,
        '/E3A': 121.7, '/E4B': 122.5, '/E4S': 123.3}
GPA = {'/E1B': 28, '/E1S': 27, '/E1A': 26, '/E2B': 25, '/E2S': 24,
       '/E2A': 23, '/E3B': 22, '/E3S': 21}
RUN = {'/E3A': (144.5, 147.8, 4), '/E4S': (146.1, 149.4, 2),
       '/E4B': (145.3, 148.6, 3), '/E4A': (146.9, None, 1)}

for k, x in enumerate(ENCX, start=1):
    a, bb, ss = f'/E{k}A', f'/E{k}B', f'/E{k}S'
    # A: F-jog oost, via, B-verticaal op x+1.7
    T(a, 'F.Cu', SW, (x, 109), (x + 1.7, 109))
    V(a, x + 1.7, 109)
    # B: F-jog naar x-3.75, via
    T(bb, 'F.Cu', SW, (x - 5, 109), (x - 3.75, 109), (x - 3.75, 110.4))
    V(bb, x - 3.75, 110.4)
    # verticalen + lanes (B); S direct vanaf het THT-pad
    for net, vx, vy in ((a, x + 1.7, 109), (bb, x - 3.75, 110.4),
                        (ss, x, 111.5)):
        if net in LANE:
            if net in GPA:
                tx = npin(GPA[net])
                T(net, 'B.Cu', SW, (vx, vy), (vx, LANE[net]), (tx, LANE[net]))
                V(net, tx, LANE[net])
                T(net, 'F.Cu', SW, (tx, LANE[net]), (tx, YN))
            else:
                ry, ex, pnum = RUN[net]
                tx = spin(pnum)
                T(net, 'B.Cu', SW, (vx, vy), (vx, LANE[net]), (ex, LANE[net]),
                  (ex, ry), (tx, ry))
                V(net, tx, ry)
                T(net, 'F.Cu', SW, (tx, ry), (tx, YS))
# E4A: rechtstreeks B-af langs de oostkant
ry, _, pnum = RUN['/E4A']
tx = spin(pnum)
T('/E4A', 'B.Cu', SW, (162.8, 109), (162.8, ry), (tx, ry))
V('/E4A', tx, ry)
T('/E4A', 'F.Cu', SW, (tx, ry), (tx, YS))

# I2C: SDA band 153.3 / SCL band 152.5
xSDA = P['J1']['17'][0]
T('/SDA', 'F.Cu', SW, (xSDA, 173.42), (xSDA, 153.3), (spin(13), 153.3),
  (spin(13), YS))
p18 = P['J1']['18']
T('/SCL', 'F.Cu', SW, p18, (p18[0] - 1.27, p18[1]), (p18[0] - 1.27, 152.5),
  (spin(12), 152.5), (spin(12), YS))
# IRQ: INTA (pin 20) -> B-hop over RESET-vert -> oostvert -> B onder J1 door
p16 = P['J1']['16']
T('/IRQ', 'F.Cu', SW, (npin(20), YN), (npin(20), 128.0), (138.4, 128.0))
V('/IRQ', 138.4, 128.0)
T('/IRQ', 'B.Cu', SW, (138.4, 128.0), (140.6, 128.0))
V('/IRQ', 140.6, 128.0)
T('/IRQ', 'F.Cu', SW, (140.6, 128.0), (148.3, 128.0), (148.3, 171.6))
V('/IRQ', 148.3, 171.6)
T('/IRQ', 'B.Cu', SW, (148.3, 171.6), (127.38, 171.6), (127.38, 175.96),
  p16)
# +3V3: escape -> B-band 158.5 -> westvert -> noordrun 114.2 -> RESET-vert
p6 = P['J1']['6']
T('+3V3', 'F.Cu', 0.4, p6, (p6[0] + 1.27, p6[1]), (p6[0] + 1.27, 141.8))
V('+3V3', p6[0] + 1.27, 158.5)
T('+3V3', 'B.Cu', 0.4, (104.8, 158.5), (p6[0] + 1.27, 158.5))
V('+3V3', 104.8, 158.5)
T('+3V3', 'F.Cu', 0.4, (104.8, 158.5), (104.8, 114.6))
T('+3V3', 'F.Cu', SW, (104.8, 114.6), (npin(18), 114.6), (npin(18), YN))
# VDD pin 9: B-hop over SDA/SCL-verticalen
V('+3V3', p6[0] + 1.27, 141.8)
T('+3V3', 'B.Cu', SW, (139.9, 141.8), (p6[0] + 1.27, 141.8))
V('+3V3', 139.9, 141.8)
T('+3V3', 'F.Cu', SW, (139.9, 141.8), (spin(9), 141.8), (spin(9), YS))
# C1 aan de pin9-stub, C2 aan de escape-vert
T('+3V3', 'F.Cu', SW, (spin(9), 141.8), (spin(9), 143.4), P['C1']['1'])
V('+3V3', p6[0] + 1.27, 157.3)
T('+3V3', 'F.Cu', SW, (p6[0] + 1.27, 157.3), P['C2']['1'])

# GND stitching
for x, y in ((102, 102), (168, 102), (102, 176), (168, 176), (102, 130),
             (168, 130), (110, 150), (120, 160), (157, 160), (168, 155),
             (120, 135), (152.5, 135), (108, 122.6), (152, 120)):
    b.V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-enc4.kicad_pcb")
