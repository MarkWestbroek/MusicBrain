"""MusicBrain DAC8 - 8x CV out (2x AD5754 daisy-chain + ADR421), sch + PCB."""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-dac8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-08"

AD_L = [("1", "AVSS", "power_in"), ("2", "NC", "no_connect"),
        ("3", "VOUTA", "output"), ("4", "VOUTB", "output"),
        ("5", "BIN/2sC", "input"), ("6", "NC", "no_connect"),
        ("7", "~{SYNC}", "input"), ("8", "SCLK", "input"),
        ("9", "SDIN", "input"), ("10", "~{LDAC}", "input"),
        ("11", "~{CLR}", "input"), ("12", "NC", "no_connect"),
        ("25", "EP", "passive")]
AD_R = [("24", "AVDD", "power_in"), ("23", "VOUTC", "output"),
        ("22", "VOUTD", "output"), ("21", "SGND", "power_in"),
        ("20", "SGND", "power_in"), ("19", "SGND", "power_in"),
        ("18", "SGND", "power_in"), ("17", "REFIN", "input"),
        ("16", "SDO", "output"), ("15", "DGND", "power_in"),
        ("14", "DVCC", "power_in"), ("13", "NC", "no_connect")]

# ================= SCHEMA =================
s = Sch("d0900000-0000-4000-8000-000000000000", "musicbrain-dac8",
        "MusicBrain DAC8 - 8x CV out slot card", "1.0", DATE,
        ("2x AD5754BREZ in daisy-chain (48-bit frames) + ADR421 2.5V-ref",
         "LDAC = buslijn (sample-synchrone updates); offset binary (BIN->DVCC)"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x10", 10), conn1_symbol("Conn_01x10", 10),
           box_symbol("AD5754", AD_L, AD_R, width=20.32),
           box_symbol("ADR421",
                      [("2", "VIN", "power_in"), ("4", "GND", "power_in")],
                      [("8", "VOUT", "output")]),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False)]

JX, JY = 45, 120
s.component("Custom:Conn_02x10", "J1", "BUS", JX, JY, 0,
            "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal")
J1_L = ["GND", "GND", "GND", "SCLK", "MOSI", "MISO", "CS", "LDAC", None, None]
J1_R = ["+12V", "-12V", "+3V3", "GND", "GND", "GND", "GND", None, None, None]
for k in range(10):
    y = JY - 11.43 + 2.54 * k
    for nm, xw, xe in ((J1_L[k], JX - 7.62, JX - 12.7), (J1_R[k], JX + 7.62, JX + 12.7)):
        if nm is None:
            s.nc(xw, y)
        elif nm in ("GND", "+3V3", "+12V", "-12V"):
            s.wire(xw, y, xe, y)
            s.power(f"power:{nm}", xe, y, 0,
                    vx=xe, vy=(y + 3.81 if nm in ("GND", "-12V") else y - 3.302))
        else:
            s.wire(xw, y, xe, y); s.label(nm, xe, y)

s.component("Custom:Conn_01x10", "J2", "CV OUT", 45, 170, 0,
            "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal")
J2_P = ["GND"] + [f"CV{k}" for k in range(1, 9)] + ["GND"]
for k in range(10):
    y = 170 - 11.43 + 2.54 * k
    s.wire(45 - 7.62, y, 45 - 12.7, y)
    if J2_P[k] == "GND":
        s.power("power:GND", 45 - 12.7, y)
    else:
        s.label(J2_P[k], 45 - 12.7, y)

# 2x AD5754
for un, ux, sfx, sdin, sdo in (("U1", 120, "1", "MOSI", "DAISY"),
                               ("U2", 190, "2", "DAISY", "MISO")):
    s.component("Custom:AD5754", un, "AD5754BREZ", ux, 120, 0,
                "Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm")
    L = ["-12V!", None, f"VA{sfx}", f"VB{sfx}", "+3V3!", None, "CS", "SCLK",
         sdin, "LDAC", "CLR", None, "-12V!"]
    R = ["+12V!", f"VC{sfx}", f"VD{sfx}", "GND!", "GND!", "GND!", "GND!",
         "VREF", sdo, "GND!", "+3V3!", None]
    for k, nm in enumerate(L):
        y = ux and 120 - (len(AD_L) - 1) * 1.27 + 2.54 * k
        y = 120 - 15.24 + 2.54 * k
        x = ux - 12.7 - 2.54
        if nm is None:
            s.nc(x + 2.54, y)
        elif nm.endswith("!"):
            r = nm[:-1]
            s.wire(x + 2.54, y, x - 1.27, y)
            s.power(f"power:{r}", x - 1.27, y, 0,
                    vx=x - 1.27, vy=(y + 3.81 if r in ("GND", "-12V") else y - 3.302))
        else:
            s.wire(x + 2.54, y, x - 1.27, y); s.label(nm, x - 1.27, y)
    for k, nm in enumerate(R):
        y = 120 - 15.24 + 2.54 * k
        x = ux + 12.7 + 2.54
        if nm is None:
            s.nc(x - 2.54, y)
        elif nm.endswith("!"):
            r = nm[:-1]
            s.wire(x - 2.54, y, x + 1.27, y)
            s.power(f"power:{r}", x + 1.27, y, 0,
                    vx=x + 1.27, vy=(y + 3.81 if r in ("GND", "-12V") else y - 3.302))
        else:
            s.wire(x - 2.54, y, x + 1.27, y); s.label(nm, x + 1.27, y)

# ADR421
s.component("Custom:ADR421", "U3", "ADR421", 250, 120, 0,
            "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm")
s.wire(250 - 11.43, 118.73, 250 - 16.51, 118.73)
s.power("power:+12V", 250 - 16.51, 118.73, vx=250 - 16.51, vy=118.73 - 3.302)
s.wire(250 - 11.43, 121.27, 250 - 16.51, 121.27)
s.power("power:GND", 250 - 16.51, 121.27)
s.wire(250 + 11.43, 118.73, 250 + 16.51, 118.73)
s.label("VREF", 250 + 16.51, 118.73)

# CLR-pullup + serie-R's
s.component("Device:R", "R1", "10k", 250, 145, 0, "Resistor_SMD:R_0805_2012Metric")
s.wire(250, 141.19, 250, 138.83); s.label("CLR", 250, 138.83)
s.wire(250, 148.81, 250, 151.17)
s.power("power:+3V3", 250, 151.17, vx=250, vy=151.17 + 3.81)
CVSRC = ["VBDAISY", "VADAISY", "VCDAISY", "VDDAISY",
         "VAMISO", "VBMISO", "VCMISO", "VDMISO"]
# LET OP: srcnamen hierboven per daisy-suffix: U1 -> *DAISY?? nee:
# U1 kreeg suffix "DAISY"? -- suffixen: U1: VA1.. via sfx; herstel hieronder.
CVSRC = ["VB1", "VA1", "VC1", "VD1", "VA2", "VB2", "VC2", "VD2"]
for k in range(8):
    x = 90 + 22 * k
    s.component("Device:R", f"R{k+2}", "100R", x, 165, 90,
                "Resistor_SMD:R_0805_2012Metric")
    s.wire(x - 3.81, 165, x - 7.62, 165); s.label(f"CV{k+1}", x - 7.62, 165)
    s.wire(x + 3.81, 165, x + 7.62, 165); s.label(CVSRC[k], x + 7.62, 165)

# caps
CAPS = [("C1", "10u", "+12V"), ("C2", "100n", "+12V"), ("C3", "10u", "-12V"),
        ("C4", "100n", "-12V"), ("C5", "100n", "+3V3"), ("C6", "100n", "VREF"),
        ("C7", "100n", "+12V"), ("C8", "10u", "+12V"), ("C10", "100n", "+12V"),
        ("C12", "100n", "-12V"), ("C13", "100n", "+3V3"),
        ("C14", "10u", "VREF")]
for k, (ref, val, rail) in enumerate(CAPS):
    x = 90 + 16 * k
    lib = "Device:C_Polarized" if val == "10u" else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if val == "10u"
          else "Capacitor_SMD:C_0805_2012Metric")
    s.component(lib, ref, val, x, 190, 0, fp)
    if rail == "VREF":
        s.wire(x, 186.19, x, 184.5); s.label("VREF", x, 184.5)
    elif rail == "-12V":
        s.wire(x, 186.19, x, 183.83)
        s.power("power:-12V", x, 183.83, vx=x, vy=183.83 + 3.81)
    else:
        s.wire(x, 186.19, x, 183.83)
        s.power(f"power:{rail}", x, 183.83, vx=x, vy=183.83 - 3.302)
    s.wire(x, 193.81, x, 196.17); s.power("power:GND", x, 196.17)

# flags
for k, rail in enumerate(("+12V", "-12V", "+3V3", "GND")):
    x1 = 300 + 14 * k
    s.wire(x1, 150, x1 + 5.08, 150)
    s.power(f"power:{rail}", x1, 150,
            vx=x1, vy=(150 + 3.81 if rail in ("GND", "-12V") else 150 - 3.302))
    s.flag(x1 + 5.08, 150)
s.text("DAC8: 2x AD5754 in daisy-chain: MOSI -> U1.SDIN, U1.SDO -> U2.SDIN,\\n"
       "U2.SDO -> MISO (48-bit frames, 1x CS). LDAC = busijn -> beide chips.\\n"
       "Offset binary (BIN->DVCC); ADR421 2.5V ref; uit = +-10V range.\\n"
       "Kanaal->DAC: CV1=U1.B CV2=U1.A CV3=U1.C CV4=U1.D CV5=U2.A ... CV8=U2.D", 20, 30)
s.write(OUT_DIR + r"\musicbrain-dac8.kicad_sch")

# ================= PCB =================
NETS = (['', '+12V', '-12V', '+3V3', 'GND', '/SCLK', '/MOSI', '/MISO', '/CS',
         '/LDAC', '/CLR', '/DAISY', '/VREF']
        + [f'/CV{k}' for k in range(1, 9)]
        + ['/VA1', '/VB1', '/VC1', '/VD1', '/VA2', '/VB2', '/VC2', '/VD2'])
b = Board("MusicBrain DAC8 - 8x CV out slot card", "1.0", (129, 161, 0),
          100, 100, 150, 180, NETS, DATE)
b.silk_name = 'dac8'
P = b.P

def admap(sfx, sdin, sdo):
    m = {'1': '-12V', '3': f'/VA{sfx}', '4': f'/VB{sfx}', '5': '+3V3',
         '7': '/CS', '8': '/SCLK', '9': sdin, '10': '/LDAC', '11': '/CLR',
         '14': '+3V3', '15': 'GND', '16': sdo, '17': '/VREF',
         '18': 'GND', '19': 'GND', '20': 'GND', '21': 'GND',
         '22': f'/VD{sfx}', '23': f'/VC{sfx}', '24': '+12V', '25': '-12V'}
    return b.nm(m)

J1_MAP = b.nm({'1': 'GND', '2': '+12V', '3': 'GND', '4': '-12V', '5': 'GND',
               '6': '+3V3', '7': '/SCLK', '8': 'GND', '9': '/MOSI',
               '10': 'GND', '11': '/MISO', '12': 'GND', '13': '/CS',
               '14': 'GND', '15': '/LDAC'})
J2_MAP = b.nm({'1': 'GND', '10': 'GND', **{str(k+1): f'/CV{k}' for k in range(1, 9)}})
U3_MAP = b.nm({'2': '+12V', '4': 'GND', '8': '/VREF'})

CX = 125.0
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Horizontal',
     'J1', 'BUS', CX + 11.43, 173.42, 270, J1_MAP)
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Horizontal.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Horizontal',
     'J2', 'CV OUT', CX - 11.43, 106.58, 90, J2_MAP)
b.fp('Package_SO.pretty\\HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm.kicad_mod',
     'Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm',
     'U1', 'AD5754BREZ', 113.5, 131, 0, admap('1', '/MOSI', '/DAISY'))
b.fp('Package_SO.pretty\\HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm.kicad_mod',
     'Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm',
     'U2', 'AD5754BREZ', 127.5, 131, 0, admap('2', '/DAISY', '/MISO'))
b.fp('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm', 'U3', 'ADR421', 126.8, 150, 0, U3_MAP)
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R1', '10k', 114.8, 160.4, 90,
     b.rc('/CLR', '+3V3'))
CVX = [116.11 + 2.54 * k for k in range(8)]
CVSRC_N = ['/VB1', '/VA1', '/VC1', '/VD1', '/VA2', '/VB2', '/VC2', '/VD2']
for k in range(8):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k+2}', '100R',
         CVX[k], 111.8, 270, b.rc(f'/CV{k+1}', CVSRC_N[k]))
CAPS_P = [
    ('C1', 'CP', 145.8, 130.0, 0, b.rc('+12V', 'GND')),
    ('C2', 'C', 118.2, 124.0, 90, b.rc('+12V', 'GND')),
    ('C3', 'CP', 144.4, 166.5, 270, b.rc('-12V', 'GND')),
    ('C4', 'C', 107.3, 124.0, 90, b.rc('-12V', 'GND')),
    ('C5', 'C', 104.4, 129.1, 90, b.rc('+3V3', 'GND')),
    ('C6', 'C', 126.8, 145.2, 0, b.rc('/VREF', 'GND')),
    ('C7', 'C', 133.5, 151.9, 270, b.rc('+12V', 'GND')),
    ('C8', 'CP', 139.2, 152.5, 270, b.rc('+12V', 'GND')),
    ('C10', 'C', 132.2, 124.0, 90, b.rc('+12V', 'GND')),
    ('C12', 'C', 122.4, 124.0, 90, b.rc('-12V', 'GND')),
    ('C13', 'C', 120.2, 128.4, 90, b.rc('+3V3', 'GND')),
    ('C14', 'CP', 145.5, 141.0, 90, b.rc('/VREF', 'GND')),
]
for ref, kind, x, y, rot, m in CAPS_P:
    if kind == 'CP':
        b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
             'Capacitor_SMD:CP_Elec_4x5.3', ref, '10u', x, y, rot, m)
    else:
        b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
             'Capacitor_SMD:C_0805_2012Metric', ref, '100n', x, y, rot, m)

print('U1 1/24/25:', P['U1']['1'], P['U1']['24'], P['U1']['25'])
print('U2 9/16:', P['U2']['9'], P['U2']['16'])
print('J1 7/9/11/13/15:', [P['J1'][n][0] for n in ('7', '9', '11', '13', '15')])
print('U3:', {k: P['U3'][k] for k in ('2', '4', '8')})

W1, E1 = 110.625, 116.375
W2, E2 = 124.625, 130.375
def row(n):
    return 127.425 + 0.65 * (n - 1) if n <= 12 else 134.575 - 0.65 * (n - 13)

SW = 0.25
T, V = b.T, b.V
# ---- CV-uitgangen: escape -> via -> B-pad -> via -> F-stub naar R pad2 ----
# (net, keten van punten; 'F'/'B' wisselt bij elke via)
def route(net, *segs):
    """segs: lijst (layer, [pts]); vias op naadloze overgangen."""
    prev_end = None
    for layer, pts in segs:
        T(net, layer, SW, *pts)
        if prev_end is not None:
            V(net, *pts[0])
        prev_end = pts[-1]

Y3, Y4, Y22, Y23 = row(3), row(4), row(22), row(23)
# U1.A -> CV2 (118.65), lane 115.1
route('/VA1', ('F.Cu', [(W1, Y3), (109.4, Y3)]),
      ('B.Cu', [(109.4, Y3), (109.4, 115.1), (118.65, 115.1)]),
      ('F.Cu', [(118.65, 115.1), (118.65, 112.7125)]))
# U1.B -> CV1 (116.11), lane 114.3
route('/VB1', ('F.Cu', [(W1, Y4), (108.4, Y4)]),
      ('B.Cu', [(108.4, Y4), (108.4, 114.3), (116.11, 114.3)]),
      ('F.Cu', [(116.11, 114.3), (116.11, 112.7125)]))
# U1.C -> CV3 (121.19), lane 115.9
route('/VC1', ('F.Cu', [(E1, Y23), (117.7, Y23)]),
      ('B.Cu', [(117.7, Y23), (117.7, 115.9), (121.19, 115.9)]),
      ('F.Cu', [(121.19, 115.9), (121.19, 112.7125)]))
# U1.D -> CV4 (123.73), lane 116.7
route('/VD1', ('F.Cu', [(E1, Y22), (118.9, Y22)]),
      ('B.Cu', [(118.9, Y22), (118.9, 116.7), (123.73, 116.7)]),
      ('F.Cu', [(123.73, 116.7), (123.73, 112.7125)]))
# U2.A -> CV5 (126.27), lane 118.3
route('/VA2', ('F.Cu', [(W2, Y3), (122.9, Y3)]),
      ('B.Cu', [(122.9, Y3), (122.9, 118.3), (126.27, 118.3)]),
      ('F.Cu', [(126.27, 118.3), (126.27, 112.7125)]))
# U2.B -> CV6 (128.81), lane 117.5
route('/VB2', ('F.Cu', [(W2, Y4), (121.9, Y4)]),
      ('B.Cu', [(121.9, Y4), (121.9, 117.5), (128.81, 117.5)]),
      ('F.Cu', [(128.81, 117.5), (128.81, 112.7125)]))
# U2.C -> CV7 (131.35): oost-escape (134.6), B-zuidjog, west, noord
route('/VC2', ('F.Cu', [(E2, Y23), (134.6, Y23)]),
      ('B.Cu', [(134.6, Y23), (134.6, 129.7), (131.35, 129.7),
                (131.35, 115.9)]),
      ('F.Cu', [(131.35, 115.9), (131.35, 112.7125)]))
# U2.D -> CV8 (133.89): escape recht naar de doelkolom
route('/VD2', ('F.Cu', [(E2, Y22), (133.89, Y22)]),
      ('B.Cu', [(133.89, Y22), (133.89, 116.5)]),
      ('F.Cu', [(133.89, 116.5), (133.89, 112.7125)]))
# CV: R pad1 -> J2
for k in range(8):
    T(f'/CV{k+1}', 'F.Cu', SW, (CVX[k], 110.8875), (CVX[k], 106.58))

# ---- signalen: J1 -> banden -> verticalen -> entries ----
xSCLK = P['J1']['7'][0]; xMOSI = P['J1']['9'][0]; xMISO = P['J1']['11'][0]
xCS = P['J1']['13'][0]; xLDAC = P['J1']['15'][0]
# B-rijen: CS 168.6 / SCLK 169.4 / MOSI 170.2; LDAC = F-band 167.3
T('/SCLK', 'F.Cu', SW, (xSCLK, 173.42), (xSCLK, 169.4))
V('/SCLK', xSCLK, 169.4)
T('/SCLK', 'B.Cu', SW, (107.1, 169.4), (xSCLK, 169.4))
V('/SCLK', 107.1, 169.4)
T('/SCLK', 'F.Cu', SW, (107.1, 169.4), (107.1, row(8)), (W1, row(8)))
V('/SCLK', 123.0, 169.4)
T('/SCLK', 'B.Cu', SW, (123.0, 169.4), (123.0, 163.0), (120.7, 163.0))
V('/SCLK', 120.7, 163.0)
T('/SCLK', 'F.Cu', SW, (120.7, 163.0), (120.7, row(8)), (W2, row(8)))
T('/MOSI', 'F.Cu', SW, (xMOSI, 173.42), (xMOSI, 170.2))
V('/MOSI', xMOSI, 170.2)
T('/MOSI', 'B.Cu', SW, (107.7, 170.2), (xMOSI, 170.2))
V('/MOSI', 107.7, 170.2)
T('/MOSI', 'F.Cu', SW, (107.7, 170.2), (107.7, row(9)), (W1, row(9)))
# LDAC (pin 10 = echte ~LDAC, buslijn): trap net als CLR, staging op CLR's
# oude x (108.3=U1 / 121.4=U2), B-cross-hop op de vrije rij 166.5. De
# F-verticalen kruisen SCLK/CS-B-hops alleen op de andere laag (toegestaan).
T('/LDAC', 'F.Cu', SW, (xLDAC, 173.42), (xLDAC, 166.5))
V('/LDAC', xLDAC, 166.5)
T('/LDAC', 'B.Cu', SW, (108.3, 166.5), (xLDAC, 166.5))
V('/LDAC', 108.3, 166.5)
T('/LDAC', 'F.Cu', SW, (108.3, 166.5), (108.3, row(10)), (W1, row(10)))
# U2-tak op F.Cu oostwaarts (kruist CS/SCLK alleen noordelijk = geen contact)
T('/LDAC', 'F.Cu', SW, (xLDAC, 166.5), (121.4, 166.5), (121.4, row(10)), (W2, row(10)))
# CS via B-rij 168.6 naar beide SYNC-verticalen
T('/CS', 'F.Cu', SW, (xCS, 173.42), (xCS, 168.6))
V('/CS', xCS, 168.6)
T('/CS', 'B.Cu', SW, (106.5, 168.6), (xCS, 168.6))
V('/CS', 106.5, 168.6)
T('/CS', 'F.Cu', SW, (106.5, 168.6), (106.5, row(7)), (W1, row(7)))
V('/CS', 120.0, 168.6)
T('/CS', 'B.Cu', SW, (120.0, 168.6), (120.0, 163.8))
V('/CS', 120.0, 163.8)
T('/CS', 'F.Cu', SW, (120.0, 163.8), (120.0, row(7)), (W2, row(7)))
# CLR: B-rij y=162.4 tussen beide CLR-verticalen + R1
T('/CLR', 'F.Cu', SW, (108.9, 162.4), (108.9, row(11)), (W1, row(11)))
V('/CLR', 108.9, 162.4)
T('/CLR', 'B.Cu', SW, (108.9, 162.4), (122.0, 162.4))
V('/CLR', 122.0, 162.4)
T('/CLR', 'F.Cu', SW, (122.0, 162.4), (122.0, row(11)), (W2, row(11)))
V('/CLR', 114.8, 162.4)
T('/CLR', 'F.Cu', SW, (114.8, 162.4), P['R1']['1'])
# daisy: U1.16 -> U2.9 (B-hop door de tussenruimte)
T('/DAISY', 'F.Cu', SW, (E1, row(16)), (118.0, row(16)))
V('/DAISY', 118.0, row(16))
T('/DAISY', 'B.Cu', SW, (118.0, row(16)), (123.3, row(16)))
V('/DAISY', 123.3, row(16))
T('/DAISY', 'F.Cu', SW, (123.3, row(16)), (W2, row(9)))
# MISO: U2.16 -> oostvert 137.0 -> B onder J1 door
T('/MISO', 'F.Cu', SW, (E2, row(16)), (137.0, row(16)), (137.0, 171.3))
V('/MISO', 137.0, 171.3)
T('/MISO', 'B.Cu', SW, (137.0, 171.3), (xMISO, 171.3), (xMISO, 173.42))

# ---- VREF ----
T('/VREF', 'F.Cu', SW, (E1, row(17)), (117.3, row(17)))
V('/VREF', 117.3, row(17))
T('/VREF', 'B.Cu', SW, (117.3, row(17)), (117.3, 146.5), (131.3, 146.5))
V('/VREF', 131.3, row(17))
T('/VREF', 'B.Cu', SW, (131.3, 146.5), (131.3, row(17)))
T('/VREF', 'F.Cu', SW, (131.3, row(17)), (E2, row(17)))
V('/VREF', 128.3, 146.5)
T('/VREF', 'F.Cu', SW, (128.3, 146.5), (128.3, 148.095), P['U3']['8'])
V('/VREF', 125.8875, 146.5)
T('/VREF', 'F.Cu', SW, (125.8875, 146.5), P['C6']['1'])
# C14: 10uF bulk op VREF (ADR421-ontkoppeling, datasheet-samenvatting sec.4).
# Oostrand tussen de +12V-spine (x=143) en C1; VREF-run oostwaarts verlengd.
cx14 = P['C14']['1'][0]
T('/VREF', 'B.Cu', SW, (131.3, 146.5), (cx14, 146.5))
V('/VREF', cx14, 146.5)
T('/VREF', 'F.Cu', SW, (cx14, 146.5), P['C14']['1'])
T('GND', 'F.Cu', SW, P['C14']['2'], (P['C14']['2'][0], P['C14']['2'][1] - 2.0))
V('GND', P['C14']['2'][0], P['C14']['2'][1] - 2.0)

# ---- +3V3: escape -> B-band 161.4 -> westleg/midleg + BIN/DVCC ----
p6 = P['J1']['6']
T('+3V3', 'F.Cu', 0.4, p6, (p6[0] + 1.27, p6[1]), (p6[0] + 1.27, 160.8))
V('+3V3', p6[0] + 1.27, 160.8)
T('+3V3', 'B.Cu', 0.4, (102.6, 160.8), (p6[0] + 1.27, 160.8))
V('+3V3', 102.6, 160.8)
T('+3V3', 'F.Cu', 0.4, (102.6, 160.8), (102.6, 130.025), (110.0, 130.025),
  (W1, 130.025))
V('+3V3', 119.0, 160.8)
T('+3V3', 'F.Cu', 0.4, (119.0, 160.8), (119.0, 130.025), (124.0, 130.025),
  (W2, 130.025))
# BIN-pinnen (14)
T('+3V3', 'F.Cu', SW, (119.0, row(14)), (117.0, row(14)), (E1, row(14)))
T('+3V3', 'F.Cu', SW, (131.9, 160.8), (131.9, row(14)), (E2, row(14)))
V('+3V3', 131.9, 160.8)
# R1 pad2 vanaf de midleg
T('+3V3', 'F.Cu', SW, (119.0, P['R1']['2'][1]), P['R1']['2'])
# C5/C13
T('+3V3', 'F.Cu', SW, (104.4, 130.025), P['C5']['1'])
T('+3V3', 'F.Cu', SW, P['C13']['1'], (120.2, 130.025))

# ---- +12V ----
T('+12V', 'F.Cu', 0.5, P['J1']['2'], (143.0, 175.96), (143.0, 120.3),
  (E1, 120.3))
T('+12V', 'F.Cu', 0.3, (E1, 120.3), (E1, row(24)))
T('+12V', 'F.Cu', 0.3, (E2, 120.3), (E2, row(24)))
T('+12V', 'F.Cu', 0.4, (143.0, 130.0), P['C1']['1'])
T('+12V', 'F.Cu', SW, (E1, 124.9125), P['C2']['1'])
T('+12V', 'F.Cu', SW, (E2, 124.9125), P['C10']['1'])
V('+12V', 143.0, 149.365)
T('+12V', 'B.Cu', 0.4, (123.6, 149.365), (143.0, 149.365))
V('+12V', 123.6, 149.365)
T('+12V', 'F.Cu', SW, (123.6, 149.365), P['U3']['2'])
V('+12V', 133.5, 149.365)
T('+12V', 'F.Cu', SW, (133.5, 149.365), P['C7']['1'])
V('+12V', 139.2, 149.365)
T('+12V', 'F.Cu', SW, (139.2, 149.365), P['C8']['1'])

# ---- -12V ----
p4 = P['J1']['4']
T('-12V', 'F.Cu', 0.4, p4, (p4[0] + 1.27, p4[1]), (p4[0] + 1.27, 161.6))
V('-12V', p4[0] + 1.27, 161.6)
T('-12V', 'B.Cu', 0.4, (101.8, 161.6), (p4[0] + 1.27, 161.6))
V('-12V', 101.8, 161.6)
T('-12V', 'F.Cu', 0.4, (101.8, 161.6), (101.8, 121.1), (115.2, 121.1))
V('-12V', 115.2, 121.1)
T('-12V', 'B.Cu', 0.4, (115.2, 121.1), (117.05, 121.1))
V('-12V', 117.05, 121.1)
T('-12V', 'F.Cu', 0.4, (117.05, 121.1), (127.5, 121.1))
for xd in (W1, W2):
    T('-12V', 'F.Cu', 0.4, (xd, 121.1), (xd, row(1)))
for xe in (113.5, 127.5):
    T('-12V', 'F.Cu', 0.4, (xe, 121.1), (xe, 128.6))
T('-12V', 'F.Cu', SW, (W1, 124.9125), P['C4']['1'])
T('-12V', 'F.Cu', SW, (W2, 124.9125), P['C12']['1'])
T('-12V', 'B.Cu', 0.4, (p4[0] + 1.27, 161.6), (144.4, 161.6))
V('-12V', 144.4, 161.6)
T('-12V', 'F.Cu', 0.4, (144.4, 161.6), P['C3']['1'])

# ---- GND-reddingen (DGND pin 15 tussen de 0.65-entries) ----
T('GND', 'F.Cu', SW, (E1, row(15)), (118.3, row(15)))
V('GND', 118.3, row(15))
T('GND', 'F.Cu', SW, (E2, row(15)), (132.5, row(15)))
V('GND', 132.5, row(15))

# GND stitching
for x, y in ((102, 102), (148, 102), (102, 177), (148, 177), (105, 155),
             (135, 117.5), (104.2, 135), (110, 160), (125, 158), (145, 120),
             (147.8, 143), (112, 118), (120, 104), (135, 143), (105, 144),
             (141.5, 157), (134, 166.5), (140, 140), (118.2, 130.8),
             (104.5, 126.5), (120.6, 124.0)):
    V('GND', x, y)

b.write(OUT_DIR + r"\musicbrain-dac8.kicad_pcb")
