"""MusicBrain POT-RISER: smalle riser met MCP3208 voor het POT8-FRONT.

Vervangt de generieke riser voor het pot-spoor (besluit Mark 2026-07-11: de
pot8-slotkaart kan geen drager zijn - pots erop, geen frontconnector, te breed).
28 x 80 mm. Onder: haakse male 2x10 in het slot (slotpinout, alleen SPI/3V3/GND
gebruikt). Boven: haakse male 1x10 naar het POT8-FRONT
(contract: 1 = GND, 2..9 = W1..W8, 10 = +3V3). Per loper 100n reservoir.
"""
import sys
import os as _os
sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-potriser"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-11"

# ================= SCHEMA =================
s = Sch("d0710000-0000-4000-8000-000000000000", "musicbrain-potriser",
        "MusicBrain POT-RISER - MCP3208-riser voor POT8-FRONT", "1.0", DATE,
        ("Onder: slot (2x10). Boven: POT8-FRONT (1x10: 1=GND, 2..9=W1..8, 10=+3V3)",
         "Leidende spec: doc/spi-bus-spec.md; front-standaard: hartlijn 8,0 mm"))
s.libs += [C_SYM, FLAG_SYM,
           conn_symbol("Conn_02x10", 10),
           conn1_symbol("Conn_01x10", 10),
           box_symbol("MCP3208",
                      [(str(k+1), f"CH{k}", "input") for k in range(8)],
                      [("16", "VDD", "power_in"), ("15", "VREF", "power_in"),
                       ("14", "AGND", "power_in"), ("13", "CLK", "input"),
                       ("12", "DOUT", "tri_state"), ("11", "DIN", "input"),
                       ("10", "~{CS}", "input"), ("9", "DGND", "power_in")]),
           power_symbol("GND", False), power_symbol("+3V3", True)]

# J1 (bus, 2x10)
JX, JY = 60, 120
s.component("Custom:Conn_02x10", "J1", "BUS",
            JX, JY, 0, "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal")
J1_L = ["GND", "GND", "GND", "SCLK", "MOSI", "MISO", "CS", None, None, None]
J1_R = [None, None, "+3V3", "GND", "GND", "GND", "GND", None, None, None]
for k in range(10):
    y = JY - 11.43 + 2.54 * k
    nmL, nmR = J1_L[k], J1_R[k]
    if nmL is None:
        s.nc(JX - 7.62, y)
    elif nmL == "GND":
        s.wire(JX - 7.62, y, JX - 12.7, y); s.power("power:GND", JX - 12.7, y)
    else:
        s.wire(JX - 7.62, y, JX - 12.7, y); s.label(nmL, JX - 12.7, y)
    if nmR is None:
        s.nc(JX + 7.62, y)
    elif nmR in ("GND", "+3V3"):
        s.wire(JX + 7.62, y, JX + 12.7, y)
        s.power(f"power:{nmR}", JX + 12.7, y, 0,
                vx=JX + 12.7, vy=(y - 3.302 if nmR == "+3V3" else y + 3.81))
    else:
        s.wire(JX + 7.62, y, JX + 12.7, y); s.label(nmR, JX + 12.7, y)

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
s.component("Custom:Conn_01x10", "J2", "NAAR POT8-FRONT", FX, FY, 0,
            "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal")
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
    s.component("Device:C", f"C{k+1}", "100n", x, 170, 0,
                "Capacitor_SMD:C_0805_2012Metric")
    s.wire(x, 166.19, x, 163.65); s.label(f"W{k+1}", x, 163.65)
    s.wire(x, 173.81, x, 176.35); s.power("power:GND", x, 176.35)
s.component("Device:C", "C9", "100n", 230, 165, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(230, 161.19, 230, 158.65); s.power("power:+3V3", 230, 158.65, 0, vx=230, vy=155.35)
s.wire(230, 168.81, 230, 171.35); s.power("power:GND", 230, 171.35)
# PWR_FLAGs (voeding komt via J1)
s.wire(20, 185, 25.08, 185); s.power("power:GND", 20, 185); s.flag(25.08, 185)
s.wire(20, 175, 25.08, 175); s.power("power:+3V3", 20, 175); s.flag(25.08, 175)

s.text("POT-RISER: lopers van het POT8-FRONT -> 100n-reservoir -> MCP3208 (SPI, mode 0,\\n"
       "ratiometrisch VREF=VDD=3V3). Kanaal CH0..7 = W1..W8 = paneel boven->onder.", 20, 196)
s.write(os.path.join(OUT_DIR, "musicbrain-potriser.kicad_sch"))

# ================= PCB =================
NETS = ['', 'GND', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS'] + [f'/W{k}' for k in range(1, 9)]
b = Board("MusicBrain POT-RISER - MCP3208-riser", "1.0", (116, 178.4, 0),
          102, 100, 130, 180, NETS, DATE)
b.silk_name = 'potriser'
CX = 116.0
HDR2 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
        'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal')
HDR1 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
        'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal')

J1_MAP = b.nm({'1': 'GND', '3': 'GND', '5': 'GND', '6': '+3V3', '7': '/SCLK',
               '8': 'GND', '9': '/MOSI', '10': 'GND', '11': '/MISO', '12': 'GND',
               '13': '/CS', '14': 'GND'})
J2_MAP = b.nm(dict([('1', 'GND')] + [(str(k+1), f'/W{k}') for k in range(1, 9)] + [('10', '+3V3')]))
U1_MAP = b.nm({'1': '/W1', '2': '/W2', '3': '/W3', '4': '/W4', '5': '/W5',
               '6': '/W6', '7': '/W7', '8': '/W8',
               '9': 'GND', '10': '/CS', '11': '/MOSI', '12': '/MISO',
               '13': '/SCLK', '14': 'GND', '15': '+3V3', '16': '+3V3'})

b.fp(HDR2[0], HDR2[1], 'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)       # onder, slot in
b.fp(HDR1[0], HDR1[1], 'J2', 'NAAR FRONT', CX - 11.43, 106.58, 90, J2_MAP)  # boven, front in
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', 'MCP3208', CX, 130, 90, U1_MAP)
# reservoirs onder J2 (op de loper-verticalen), C9 west van U1
for k in range(1, 9):
    b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
         'Capacitor_SMD:C_0805_2012Metric', f'C{k}', '100n',
         104.57 + 2.54 * k + 1.27, 110.6, 270, b.rc(f'/W{k}', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C9', '100n', 108.6, 123.2, 90,
     b.rc('+3V3', 'GND'))

P = b.P
SW = 0.25
# ---- lopers: J2-vert -> rij -> gap-mid-kolom door de zuidrij-gaps -> jog -> CH-pad ----
ROW = {1: 118.9, 2: 118.1, 3: 117.3, 4: 116.5, 5: 113.3, 6: 114.1, 7: 114.9, 8: 115.7}
for k in range(1, 9):
    j2 = P['J2'][str(k + 1)]
    ch = P['U1'][str(k)]
    gx = ch[0] + 0.635
    b.T(f'/W{k}', 'F.Cu', SW, j2, (j2[0], ROW[k]), (gx, ROW[k]), (gx, 131.0),
        (ch[0], 131.0), ch)
    # reservoir-stub (cap-pad1 op j2x+1.27)
    c1 = P[f'C{k}']['1']
    b.T(f'/W{k}', 'F.Cu', SW, (j2[0], c1[1]), c1)
# ---- SPI via B.Cu (vlak is leeg): J1-pad (THT) -> B-vert -> B-laan -> via -> F-stub ----
SPI = [('/SCLK', '7', '13'), ('/MISO', '11', '12'), ('/MOSI', '9', '11'), ('/CS', '13', '10')]
LANES_Y = [123.55, 124.2, 124.85, 125.5]
import itertools as _it
def _crossings(perm):
    n = 0
    seg = [(P['J1'][jp][0], ly, P['U1'][up][0])
           for (nm_, jp, up), ly in zip(SPI, perm)]
    for a in range(len(seg)):
        for c in range(len(seg)):
            if a == c:
                continue
            vx, vy, px = seg[a]
            lx1, ly2, lx2 = min(seg[c][0], seg[c][2]), seg[c][1], max(seg[c][0], seg[c][2])
            if ly2 > vy and lx1 < vx < lx2:      # B-vert (laan->J1) kruist diepere laan c
                n += 1
            if ly2 < vy and lx1 < px < lx2:      # F-stub? nee: via zit op laan; check B-stub niet nodig
                n += 0
    return n
_best = min(_it.permutations(LANES_Y), key=_crossings)
assert _crossings(_best) == 0, f'lanetoewijzing kruist: {_crossings(_best)}'
for (net, jp, up), ly in zip(SPI, _best):
    j1 = P['J1'][jp]
    u = P['U1'][up]
    b.T(net, 'B.Cu', SW, j1, (j1[0], ly), (u[0], ly))
    b.V(net, u[0], ly)
    b.T(net, 'F.Cu', SW, (u[0], ly), u)
# ---- +3V3: oost- en noordrand + westafdaling naar VDD; VREF via padbrug ----
p6 = P['J1']['6']
j2_10 = P['J2']['10']
b.T('+3V3', 'F.Cu', .4, p6, (p6[0], 177.4), (128.8, 177.4), (128.8, 102.3),
    (105.84, 102.3), (105.84, 125.65))
b.T('+3V3', 'F.Cu', .4, (128.8, 107.5), (j2_10[0], 107.5), j2_10)
p16 = P['U1']['16']
p15 = P['U1']['15']
b.T('+3V3', 'F.Cu', SW, (105.84, 125.0), (p16[0], 125.0), p16)
# VREF (p15) via B.Cu BOVEN de SPI-lanes langs (het W1-kanaal en de
# CS-afdaling blokkeren alle F- en zuid-B-paden tussen p15 en p16)
b.V('+3V3', p15[0], 122.9)
b.T('+3V3', 'F.Cu', SW, (p15[0], 122.9), p15)
b.T('+3V3', 'B.Cu', SW, (p15[0], 122.9), (106.4, 122.9))
b.V('+3V3', 106.4, 122.9)
b.T('+3V3', 'F.Cu', SW, (106.4, 122.9), (105.84, 123.46))
c9 = P['C9']['1']
b.T('+3V3', 'F.Cu', SW, c9, (c9[0], 125.0))
# ---- GND-hechtvia's ----
for x, y in ((104, 102), (126.5, 104.0), (104, 178), (110, 150), (122, 150),
             (104, 130), (126.5, 150), (116, 103.6),
             (124.2, 112.5), (104, 112), (108, 101.3), (122, 101.3), (107.2, 120.7),
             (106.51, 116.5)):
    b.V('GND', x, y)
# hechtvia naast elke reservoir-GND-pad (fragment hangt anders los aan de pad)
for k in range(1, 9):
    b.V('GND', 104.57 + 2.54 * k + 1.27, 112.55)
for x, y in ():
    b.V('GND', x, y)

# AGND (14) en DGND (9) expliciet aan het B-vlak (de sliver-keepouts
# hieronder halen hun toevallige zone-verbinding weg)
for gp in ('9', '14'):
    gx, gy = P['U1'][gp]
    b.T('GND', 'F.Cu', SW, (gx, gy), (gx, 122.6))
    b.V('GND', gx, 122.6)
# twee 0,5mm-slivers tussen de loper-kolommen kunnen niet aan het vlak
# hechten (te smal voor een via): pour daar uitsluiten i.p.v. los koper
for x0, x1 in ((113.6, 114.6), (119.95, 120.95)):
    b.extra.append(f"""
  (zone (net 0) (net_name "") (layers "F.Cu") (name "geen-pour-sliver")
    (uuid "{b.uid()}")
    (hatch edge 0.5)
    (connect_pads (clearance 0))
    (min_thickness 0.2) (filled_areas_thickness no)
    (keepout (tracks allowed) (vias allowed) (pads allowed) (copperpour not_allowed) (footprints allowed))
    (fill (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts (xy {x0} 114.8) (xy {x1} 114.8) (xy {x1} 131.2) (xy {x0} 131.2)))
  )""")

b.write(os.path.join(OUT_DIR, "musicbrain-potriser.kicad_pcb"))
open(os.path.join(OUT_DIR, "musicbrain-potriser.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-potriser.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "MusicBrain potriser"},\n'
    '  "schematic": {"file": "musicbrain-potriser.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-potriser.kicad_pcb"}\n}\n')
print("written musicbrain-potriser")
