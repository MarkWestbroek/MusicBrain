"""MusicBrain DAC8 (gen 2) - 8x CV out (2x AD5754 daisy-chain + ADR421).

Gen 2 (spi-bus-spec v2.0): slot 2x12, kaart 80x45 (bus.KAART_B x bus.H).
Onder: haakse male 2x12 in het slot. Boven: haakse male 1x10 naar het
jack-front, gecentreerd op het kaarthart. Beide AD5754's met de VOUT-pinnen
richting de CV-kolommen; signaalroutes via freerouting (SES naast dit
script); GND via de vlakken + gnd_stitch.json. EP-pad = AVSS = -12V
(zie memory/ad5754-breakout-design + doc/data-sheets).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-dac8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "2.0"

GEBRUIKT = {'GND', '+12V', '-12V', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS',
            '/LDAC'}

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
        "MusicBrain DAC8 - 8x CV out slot card", REV, DATE,
        ("Gen 2: slot 2x12 (spi-bus-spec v2.0), kaart 80x45",
         "2x AD5754BREZ in daisy-chain (48-bit frames) + ADR421 2.5V-ref",
         "LDAC = buslijn (sample-synchrone updates); offset binary (BIN->DVCC)"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("AD5754", AD_L, AD_R, width=20.32),
           box_symbol("ADR421",
                      [("2", "VIN", "power_in"), ("4", "GND", "power_in")],
                      [("8", "VOUT", "output")]),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False)]

# J1 = slot 2x12 (gen-2-pinout uit bus.py; ongebruikte pinnen nc)
JX, JY = 45, 120
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
    elif net in ('GND', '+3V3', '+12V', '-12V'):
        s.wire(x, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe,
                vy=(y + 3.81 if net in ('GND', '-12V') else y - 3.302))
    else:
        s.wire(x, y, xe, y); s.label(net.lstrip('/'), xe, y)

s.component("Custom:Conn_01x10", "J2", "CV OUT", 45, 170, 0,
            bus.HDR_PANEEL[1])
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
s.text("DAC8 gen 2: 2x AD5754 in daisy-chain: MOSI -> U1.SDIN, U1.SDO -> U2.SDIN,\\n"
       "U2.SDO -> MISO (48-bit frames, 1x CS). LDAC = buslijn -> beide chips.\\n"
       "Offset binary (BIN->DVCC); ADR421 2.5V ref; uit = +-10V range.\\n"
       "Kanaal->DAC: CV1=U1.B CV2=U1.A CV3=U1.C CV4=U1.D CV5=U2.A ... CV8=U2.D", 20, 30)
s.write(OUT_DIR + r"\musicbrain-dac8.kicad_sch")

# ================= PCB =================
NETS = (['', '+12V', '-12V', '+3V3', 'GND', '/SCLK', '/MOSI', '/MISO', '/CS',
         '/LDAC', '/CLR', '/DAISY', '/VREF']
        + [f'/CV{k}' for k in range(1, 9)]
        + ['/VA1', '/VB1', '/VC1', '/VD1', '/VA2', '/VB2', '/VC2', '/VD2'])
BX0, BX1 = 100.0, bus.KAART_B + 100.0     # 80 mm
CX = (BX0 + BX1) / 2                      # 140.0
b = Board("MusicBrain DAC8 - 8x CV out slot card", REV,
          (113, 138, 0), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'dac8'
P = b.P

def admap(sfx, sdin, sdo):
    m = {'1': '-12V', '3': f'/VA{sfx}', '4': f'/VB{sfx}', '5': '+3V3',
         '7': '/CS', '8': '/SCLK', '9': sdin, '10': '/LDAC', '11': '/CLR',
         '14': '+3V3', '15': 'GND', '16': sdo, '17': '/VREF',
         '18': 'GND', '19': 'GND', '20': 'GND', '21': 'GND',
         '22': f'/VD{sfx}', '23': f'/VC{sfx}', '24': '+12V', '25': '-12V'}
    return b.nm(m)

J1_MAP = bus.j1_map(b, GEBRUIKT)
J2_MAP = b.nm({'1': 'GND', '10': 'GND', **{str(k+1): f'/CV{k}' for k in range(1, 9)}})
U3_MAP = b.nm({'2': '+12V', '4': 'GND', '8': '/VREF'})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'CV OUT',
     CX - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90, J2_MAP)

# CV-serieweerstanden recht onder hun J2-pin (pin 2..9)
CVX = [P['J2']['1'][0] + 2.54 * k for k in range(1, 9)]
CVSRC_N = ['/VB1', '/VA1', '/VC1', '/VD1', '/VA2', '/VB2', '/VC2', '/VD2']
for k in range(8):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{k+2}', '100R',
         CVX[k], 108.3, 270, b.rc(f'/CV{k+1}', CVSRC_N[k]))

# DACs onder hun CV-kolommen (U1 -> CV1-4 west, U2 -> CV5-8 oost)
b.fp('Package_SO.pretty\\HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm.kicad_mod',
     'Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm',
     'U1', 'AD5754BREZ', 131.0, 122.0, 0, admap('1', '/MOSI', '/DAISY'))
b.fp('Package_SO.pretty\\HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm.kicad_mod',
     'Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm',
     'U2', 'AD5754BREZ', 145.0, 122.0, 0, admap('2', '/DAISY', '/MISO'))
# referentie + CLR-pullup in de oosthoek
b.fp('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm', 'U3', 'ADR421',
     158.5, 116.0, 0, U3_MAP)
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R1', '10k', 155.5, 126.0, 0,
     b.rc('/CLR', '+3V3'))

# ontkoppeling: per chip N-rand (pin 1/24) en Z-rand (DVCC/BIN); VREF bij U3
# (HTSSOP-courtyard gemeten: 8,38 breed x 8,38 hoog, bv. U1 127,06..134,94 /
#  117,81..126,19 - caps ernaast, niet erboven)
CAPS_P = [
    ('C1', 'CP', 158.0, 130.5, 90, b.rc('+12V', 'GND')),     # bulk +12V bij J1
    ('C2', 'C', 136.9, 115.8, 90, b.rc('+12V', 'GND')),      # U1 AVDD (24)
    ('C3', 'CP', 110.0, 128.0, 90, b.rc('-12V', 'GND')),     # bulk -12V west
    ('C4', 'C', 125.2, 115.8, 90, b.rc('-12V', 'GND')),      # U1 AVSS (1)
    ('C5', 'C', 127.0, 128.1, 270, b.rc('+3V3', 'GND')),     # U1 DVCC/BIN (GND-pad zuid, open corridor)
    ('C6', 'C', 158.5, 120.5, 0, b.rc('/VREF', 'GND')),      # U3 uit
    ('C7', 'C', 153.5, 112.0, 90, b.rc('+12V', 'GND')),      # U3 in
    ('C8', 'CP', 165.5, 111.5, 90, b.rc('+12V', 'GND')),     # U3 bulk
    ('C10', 'C', 150.9, 115.8, 90, b.rc('+12V', 'GND')),     # U2 AVDD (24)
    ('C12', 'C', 139.2, 115.8, 90, b.rc('-12V', 'GND')),     # U2 AVSS (1)
    ('C13', 'C', 141.0, 128.1, 270, b.rc('+3V3', 'GND')),    # U2 DVCC/BIN (GND-pad zuid, open corridor)
    ('C14', 'CP', 165.2, 120.5, 90, b.rc('/VREF', 'GND')),   # VREF-bulk
]
for ref, kind, x, y, rot, m in CAPS_P:
    if kind == 'CP':
        b.fp('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
             'Capacitor_SMD:CP_Elec_4x5.3', ref, '10u', x, y, rot, m)
    else:
        b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
             'Capacitor_SMD:C_0805_2012Metric', ref, '100n', x, y, rot, m)

# DGND-redding (gen-1-les): pin 15 zit klem tussen de 0.65-entries en raakt
# anders los van het vlak. Vast spoor + via, vóór freerouting (prep_dsn zet
# er keepouts omheen zodat de router eromheen werkt).
for un in ('U1', 'U2'):
    p15 = P[un]['15']
    b.T('GND', 'F.Cu', 0.25, p15, (p15[0] + 2.2, p15[1]))
    b.V('GND', p15[0] + 2.2, p15[1])

# signalen via freerouting (SES); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-dac8.ses")
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

b.write(OUT_DIR + r"\musicbrain-dac8.kicad_pcb")
print("written musicbrain-dac8 (gen 2)")
