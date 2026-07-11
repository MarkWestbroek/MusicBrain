"""MusicBrain POT8 - 8x RK097N + MCP3208 slotkaart (sch + geroute PCB)."""
import sys
sys.path.insert(0, r'C:\Users\User\AppData\Local\Temp\claude\d--Git-Muziek-MusicBrain\99e404c8-b02c-48a1-b346-1e9bb9c444c9\scratchpad')
from schlib import (Sch, conn_symbol, box_symbol, POT_SYM, R_SYM, C_SYM, CP_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board, netcheck, fmt
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-pot8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-08"

# ================= SCHEMA =================
s = Sch("d0700000-0000-4000-8000-000000000000", "musicbrain-pot8",
        "MusicBrain POT8 - 8x potmeter slot card", "1.0", DATE,
        ("8x RK097N (haaks, as door de bovenplaat) -> MCP3208 (SPI)",
         "Leidende spec: doc/spi-bus-spec.md"))
s.libs += [R_SYM, C_SYM, CP_SYM, POT_SYM, FLAG_SYM,
           conn_symbol("Conn_02x10", 10),
           box_symbol("MCP3208",
                      [(str(k+1), f"CH{k}", "input") for k in range(8)],
                      [("16", "VDD", "power_in"), ("15", "VREF", "power_in"),
                       ("14", "AGND", "power_in"), ("13", "CLK", "input"),
                       ("12", "DOUT", "tri_state"), ("11", "DIN", "input"),
                       ("10", "~{CS}", "input"), ("9", "DGND", "power_in")]),
           power_symbol("GND", False), power_symbol("+3V3", True)]

# J1 (bus)
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

# MCP3208
UX, UY = 150, 120
s.component("Custom:MCP3208", "U1", "MCP3208", UX, UY, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
for k in range(8):
    y = UY - 8.89 + 2.54 * k
    s.wire(UX - 11.43, y, UX - 16.51, y); s.label(f"POT{k+1}", UX - 16.51, y)
RSIG = ["+3V3", "+3V3", "GND", "SCLK", "MISO", "MOSI", "CS", "GND"]
for k, nm in enumerate(RSIG):
    y = UY - 8.89 + 2.54 * k
    if nm in ("GND", "+3V3"):
        s.wire(UX + 11.43, y, UX + 16.51, y)
        s.power(f"power:{nm}", UX + 16.51, y, 0,
                vx=UX + 16.51, vy=(y - 3.302 if nm == "+3V3" else y + 3.81))
    else:
        s.wire(UX + 11.43, y, UX + 16.51, y); s.label(nm, UX + 16.51, y)

# 8 potmeters + filtercaps
for k in range(8):
    x = 50 + 20 * k
    s.component("Device:R_Potentiometer", f"RV{k+1}", "10k RK097N", x, 170, 0,
                "MusicBrain:RK097N_Horizontal")
    s.wire(x, 166.19, x, 163.83); s.power("power:+3V3", x, 163.83)
    s.wire(x, 173.81, x, 176.17); s.power("power:GND", x, 176.17)
    s.wire(x + 3.81, 170, x + 7.62, 170); s.label(f"POT{k+1}", x + 7.62, 170)
    s.component("Device:C", f"C{k+1}", "100n", x + 5.08, 180, 0,
                "Capacitor_SMD:C_0805_2012Metric")
    s.wire(x + 5.08, 176.19, x + 5.08, 174.5); s.label(f"POT{k+1}", x + 5.08, 174.5)
    s.wire(x + 5.08, 183.81, x + 5.08, 186.17); s.power("power:GND", x + 5.08, 186.17)
# ontkoppeling
s.component("Device:C", "C9", "100n", 220, 120, 0, "Capacitor_SMD:C_0805_2012Metric")
s.wire(220, 116.19, 220, 113.83); s.power("power:+3V3", 220, 113.83)
s.wire(220, 123.81, 220, 126.17); s.power("power:GND", 220, 126.17)
s.component("Device:C_Polarized", "C10", "10u", 232, 120, 0,
            "Capacitor_SMD:CP_Elec_4x5.3")
s.wire(232, 116.19, 232, 113.83); s.power("power:+3V3", 232, 113.83)
s.wire(232, 123.81, 232, 126.17); s.power("power:GND", 232, 126.17)
# PWR_FLAGs
s.wire(250, 100, 255.08, 100); s.power("power:+3V3", 250, 100); s.flag(255.08, 100)
s.wire(250, 110, 255.08, 110); s.power("power:GND", 250, 110); s.flag(255.08, 110)
s.text("POT8: 8x RK097N (10k lin) als spanningsdeler 0..3V3 -> MCP3208.\\n"
       "SPI mode 0, tri-state DOUT; geografische CS. Alleen +3V3 van de bus.", 20, 30)
s.write(OUT_DIR + r"\musicbrain-pot8.kicad_sch")

# ================= PCB =================
NETS = (['', '+3V3', 'GND', '/SCLK', '/MOSI', '/MISO', '/CS']
        + [f'/POT{k}' for k in range(1, 9)])
b = Board("MusicBrain POT8 - 8x pot slot card", "1.0", (122, 178.4, 0),
          100, 100, 210, 180, NETS, DATE)
b.silk_name = 'pot8'
P = b.P

J1_MAP = b.nm({'1': 'GND', '3': 'GND', '5': 'GND', '6': '+3V3', '7': '/SCLK',
               '8': 'GND', '9': '/MOSI', '10': 'GND', '11': '/MISO',
               '12': 'GND', '13': '/CS', '14': 'GND'})
U1_MAP = b.nm({**{str(k+1): f'/POT{k+1}' for k in range(8)},
               '9': 'GND', '10': '/CS', '11': '/MOSI', '12': '/MISO',
               '13': '/SCLK', '14': 'GND', '15': '+3V3', '16': '+3V3'})

CX = 155.0
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal',
     'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm',
     'U1', 'MCP3208', 155, 130, 90, U1_MAP)

# custom RK097N-footprint (pinnen onder, beugels + as richting bovenrand)
def rk097(ref, val, x, y, netmap):
    pads = []
    for n, px in (('1', -2.5), ('2', 0.0), ('3', 2.5)):
        net = ''
        if n in netmap:
            idx, name = netmap[n]
            net = f' (net {idx} "{name}")'
        pads.append(f'    (pad "{n}" thru_hole circle (at {fmt(px)} 0) '
                    f'(size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask"){net})')
    for sx_ in (-5.6, 5.6):
        pads.append(f'    (pad "MP" thru_hole oval (at {fmt(sx_)} -7.5) '
                    f'(size 1.8 2.1) (drill oval 1.2 1.5) (layers "*.Cu" "*.Mask"))')
    b.P[ref] = {'1': (x - 2.5, y), '2': (x, y), '3': (x + 2.5, y)}
    b.raw_fp(f'''  (footprint "MusicBrain:RK097N_Horizontal"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)})
    (path "/")
    (descr "RK097N 9mm haakse potmeter, as langs het kaartvlak omhoog")
    (property "Reference" "{ref}" (at 0 3.2 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "{val}" (at 0 5.4 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -6.05 -9.3) (end 6.05 1.1)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -6.09 -9.4) (end 6.09 1.2)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pads)}
  )''')

POTX = [107.75 + 13.5 * k for k in range(8)]
for k, x in enumerate(POTX):
    rk097(f'RV{k+1}', '10k', x, 109.3, b.rc('GND', f'/POT{k+1}') | b.nm({'3': '+3V3'}))
    b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
         'Capacitor_SMD:C_0805_2012Metric', f'C{k+1}', '100n',
         x + 1.8, 112.9, 270, b.rc(f'/POT{k+1}', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C9', '100n', 150.555, 124.3, 90,
     b.rc('+3V3', 'GND'))
b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
     'Capacitor_SMD:CP_Elec_4x5.3', 'C10', '10u', 203.8, 160, 90,
     b.rc('+3V3', 'GND'))

print('U1 hoeken:', P['U1']['1'], P['U1']['8'], P['U1']['9'], P['U1']['16'])
print('C1', P['C1'], 'C9', P['C9'], 'C10', P['C10'])
assert P['U1']['1'] == (150.555, 132.475), P['U1']['1']
assert P['U1']['16'] == (150.555, 127.525), P['U1']['16']
assert P['U1']['9'] == (159.445, 127.525), P['U1']['9']

SW = 0.25
# --- wipers: pot pin2 -> F-verticaal -> rij -> pad-entry (planair, monotone) ---
# wipers: F-verticaal omlaag -> via -> B-lane -> via -> F-stub het pad in
# (Manhattan: L-vormen op een laag kruisen elkaar bij deze fan-in)
for k in range(8):
    x = POTX[k]
    padx = 150.555 + 1.27 * k
    lane = 134.6 + 0.8 * k
    net = f'/POT{k+1}'
    b.T(net, 'F.Cu', SW, (x, 109.3), (x, lane))
    b.V(net, x, lane)
    b.T(net, 'B.Cu', SW, (x, lane), (padx, lane))
    b.V(net, padx, lane)
    b.T(net, 'F.Cu', SW, (padx, lane), (padx, 132.475))
    # filtercap-tap
    b.T(net, 'F.Cu', SW, (x, 111.9875), (x + 1.8, 111.9875))

# --- SPI: J1 -> banden -> westverticalen -> B-rijen -> F-stubs noordrij ---
x7 = P['J1']['7'][0]; x9 = P['J1']['9'][0]
x11 = P['J1']['11'][0]; x13 = P['J1']['13'][0]
SPI = [
    ('/CS',   x13, 170.7, 102.4, 123.6, 158.175),
    ('/MISO', x11, 169.9, 103.2, 124.4, 155.635),
    ('/MOSI', x9, 169.1, 104.0, 125.2, 156.905),
    ('/SCLK', x7, 168.3, 104.8, 126.0, 154.365),
]
for net, xs, band, xv, row, padx in SPI:
    b.T(net, 'F.Cu', SW, (xs, 173.42), (xs, band), (xv, band), (xv, row))
    b.V(net, xv, row)
    b.T(net, 'B.Cu', SW, (xv, row), (padx, row))
    b.V(net, padx, row)
    b.T(net, 'F.Cu', SW, (padx, row), (padx, 127.525))

# --- +3V3: rail y=106.8 + oostlus vanaf J1.6 + west-afdaling naar VDD/VREF ---
p6 = P['J1']['6']
b.T('+3V3', 'F.Cu', 0.4, p6, (p6[0] + 1.27, p6[1]), (p6[0] + 1.27, 171.9),
    (206.3, 171.9), (206.3, 106.8))
b.T('+3V3', 'F.Cu', 0.4, (101.6, 106.8), (206.3, 106.8))          # rail
for k, x in enumerate(POTX):                                       # pin 3-stubs
    b.T('+3V3', 'F.Cu', SW, (x + 2.5, 109.3), (x + 2.5, 106.8))
# west-afdaling -> B-run 130.9 -> VDD (16) + VREF (15)
b.T('+3V3', 'F.Cu', 0.4, (101.6, 106.8), (101.6, 130.9))
b.V('+3V3', 101.6, 130.9)
b.T('+3V3', 'B.Cu', 0.4, (101.6, 130.9), (151.825, 130.9))
b.V('+3V3', 150.555, 130.9)
b.T('+3V3', 'F.Cu', SW, (150.555, 130.9), P['U1']['16'])
b.V('+3V3', 151.825, 130.9)
b.T('+3V3', 'F.Cu', SW, (151.825, 130.9), P['U1']['15'])
# C9 (noord van pin 16) + C10 (aan de oostlus)
b.T('+3V3', 'F.Cu', SW, P['U1']['16'], (150.555, P['C9']['1'][1]))
b.T('+3V3', 'F.Cu', SW, (206.3, P['C10']['1'][1]), P['C10']['1'])

# GND stitching
for x, y in ((102, 178), (207, 178), (128, 104.3), (170.2, 104.3),
             (100.9, 145), (207.5, 145), (120, 155), (188, 150), (140, 120),
             (168, 120), (110, 122), (195, 120)):
    b.V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-pot8.kicad_pcb")
