"""MusicBrain MATRIX (rev 0.1) - 8-stemmige audio-patchmatrix, 8x MT8816.

Poly-patchmatrix (doc/plans/analog-patch-matrix.md + poly-analog-spec B12):
8 parallelle MT8816-vlakken, plane k = stem k van alle bussen. ALLES
parallel (adres, data, strobe en CS aan VDD): elke schrijfactie is een
broadcast naar de 8 stemmen. Logische matrix: 8 IN-bussen (Y0-Y7) x
16 UIT-bussen (X0-X15), elk 8 stemmen breed (jack8-contract 1x10).

Pinout MT8816 DIP-40 GEVERIFIEERD uit Mitel/Zarlink-datasheet Fig. 2
(futurlec MT8816AE.pdf; de Gemini-tabel in het plan-doc was fout):
  1=Y3 2=AY2 3=RESET 4=AX3 5=AX0 6=X14 7=X15 8-13=X6-X11 14=NC 15=Y7
  16=VSS 17=Y6 18=STROBE 19=Y5 20=VEE 21=Y4 22=AX1 23=AX2 24=AY0 25=AY1
  26=X13 27=X12 28=X5 29=X4 30=X3 31=X2 32=X1 33=X0 34=NC 35=Y0 36=CS
  37=Y1 38=DATA 39=Y2 40=VDD
Strobe-timing: adres stabiel voor STROBE-hoog; data stabiel op STROBE-laag
-> firmware schrijft 3 frames per kruispunt (adr+data, +STB, -STB).

Voeding: VDD=+6V (L7806), VEE=-6V (L7906) -> analoog venster +-6V, audio
+-5V nominaal met 1V marge; totaal 12V < 13,2V-limiet. Logic: 74AHCT595
op lokale +5V (78L05): TTL-in accepteert 3V3-bus-SPI, 5V-out > VIH
(0,7x6=4,2V) van de MT8816's. Besturing = gate8-patroon: 2x AHCT595 daisy
aan slot-SPI (RCLK = CS-flank), 10 uitgangen: AX0-3, AY0-2, DATA, STROBE,
RESET. Aansluiting bus: PinSocket 2x12 (slotcontract, 24-aderige kabel).

v0.1 = DIP-40 (voorraad Mark) in sockets; geen per-lijn buffers (gesloten
systeem: bronnen zijn opamp-uitgangen, lasten >=10k, Ron 45R).
Connectoren: JIN1-8 en JUIT1-16, male 1x10 verticaal (1=GND, 2-9=stem 1-8,
10=GND).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-matrix"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-20"
REV = "0.1"

GEBRUIKT = {'GND', '+12V', '-12V', '/SCLK', '/MOSI', '/CS'}

# MT8816 DIP-40 (geverifieerd, zie docstring). L = pins 1..20, R = 40..21.
MT_L = [("1", "Y3", "passive"), ("2", "AY2", "input"), ("3", "RESET", "input"),
        ("4", "AX3", "input"), ("5", "AX0", "input"), ("6", "X14", "passive"),
        ("7", "X15", "passive"), ("8", "X6", "passive"), ("9", "X7", "passive"),
        ("10", "X8", "passive"), ("11", "X9", "passive"),
        ("12", "X10", "passive"), ("13", "X11", "passive"),
        ("14", "NC", "no_connect"), ("15", "Y7", "passive"),
        ("16", "VSS", "power_in"), ("17", "Y6", "passive"),
        ("18", "STROBE", "input"), ("19", "Y5", "passive"),
        ("20", "VEE", "power_in")]
MT_R = [("40", "VDD", "power_in"), ("39", "Y2", "passive"),
        ("38", "DATA", "input"), ("37", "Y1", "passive"),
        ("36", "CS", "input"), ("35", "Y0", "passive"),
        ("34", "NC", "no_connect"), ("33", "X0", "passive"),
        ("32", "X1", "passive"), ("31", "X2", "passive"),
        ("30", "X3", "passive"), ("29", "X4", "passive"),
        ("28", "X5", "passive"), ("27", "X12", "passive"),
        ("26", "X13", "passive"), ("25", "AY1", "input"),
        ("24", "AY0", "input"), ("23", "AX2", "input"),
        ("22", "AX1", "input"), ("21", "Y4", "passive")]
SR_L = [("15", "QA", "output"), ("1", "QB", "output"), ("2", "QC", "output"),
        ("3", "QD", "output"), ("4", "QE", "output"), ("5", "QF", "output"),
        ("6", "QG", "output"), ("7", "QH", "output")]
SR_R = [("16", "VCC", "power_in"), ("14", "SER", "input"),
        ("11", "SRCLK", "input"), ("12", "RCLK", "input"),
        ("10", "~{SRCLR}", "input"), ("13", "~{OE}", "input"),
        ("9", "QH'", "output"), ("8", "GND", "power_in")]
REG78_L = [("1", "IN", "power_in"), ("2", "GND", "power_in")]
REG78_R = [("3", "OUT", "power_out")]
REG79_L = [("2", "IN", "power_in"), ("1", "GND", "power_in")]
REG79_R = [("3", "OUT", "power_out")]
REG78L_L = [("3", "IN", "power_in"), ("2", "GND", "power_in")]
REG78L_R = [("1", "OUT", "power_out")]

# ================= SCHEMA =================
s = Sch("aa160000-0000-4000-8000-000000000000", "musicbrain-matrix",
        "MusicBrain MATRIX - 8-stemmige audio-patchmatrix (8x MT8816)", REV,
        DATE,
        ("8 planes MT8816, alles parallel: schrijven = broadcast over 8 stemmen",
         "8 IN-bussen (Y) x 16 UIT-bussen (X), jack8-contract 1x10 per bus",
         "VDD +6V / VEE -6V (audio +-5V nom.); 2x 74AHCT595 op slot-SPI"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("MT8816", MT_L, MT_R, width=20.32),
           box_symbol("74AHCT595", SR_L, SR_R),
           box_symbol("L7806", REG78_L, REG78_R),
           box_symbol("L7906", REG79_L, REG79_R),
           box_symbol("78L05", REG78L_L, REG78L_R),
           power_symbol("GND", False), power_symbol("+12V", True),
           power_symbol("-12V", False)]

# J1 = buskabel (slotcontract 2x12; alleen GND/12V/SPI gebruikt)
JX, JY = 45, 60
s.component("Custom:Conn_02x12", "J1", "BUS (kabel, 2x12)", JX, JY, 0,
            "Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical")
for q in range(1, bus.SLOT_PINS + 1):
    row = (q - 1) // 2
    west = (q % 2 == 1)
    y = JY - 13.97 + 2.54 * row
    x = JX + (-7.62 if west else 7.62)
    xe = JX + (-12.7 if west else 12.7)
    net = bus.SLOT[q]
    if net not in GEBRUIKT:
        s.nc(x, y)
    elif net in ('GND', '+12V', '-12V'):
        s.wire(x, y, xe, y)
        s.power(f"power:{net}", xe, y, 0, vx=xe,
                vy=(y + 3.81 if net in ('GND', '-12V') else y - 3.302))
    else:
        s.wire(x, y, xe, y); s.label(net.lstrip('/'), xe, y)

# 2x 74AHCT595 (SPI -> parallelle matrixbesturing; RCLK = CS-flank)
for un, uy, L in (("U9", 130,
                   ["AX0", "AX1", "AX2", "AX3", "AY0", "AY1", "AY2", "DATA"]),
                  ("U10", 185,
                   ["STB", "RST", None, None, None, None, None, None])):
    s.component("Custom:74AHCT595", un, "74AHCT595", 45, uy, 0,
                "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
    off = 7 * 1.27
    for k, nm in enumerate(L):
        y = uy - off + 2.54 * k
        xp, xe = 45 - 11.43, 45 - 13.97
        if nm is None:
            s.nc(xp, y)
        else:
            s.wire(xp, y, xe, y); s.label(nm, xe, y)
    R = ["V5!", "SER_" + un, "SCLK", "CS", "V5!", "GND!", "QH_" + un, "GND!"]
    for k, nm in enumerate(R):
        y = uy - off + 2.54 * k
        xp, xe = 45 + 11.43, 45 + 13.97
        if nm == "SER_U9":
            s.wire(xp, y, xe, y); s.label("MOSI", xe, y)
        elif nm == "SER_U10":
            s.wire(xp, y, xe, y); s.label("S1", xe, y)
        elif nm == "QH_U9":
            s.wire(xp, y, xe, y); s.label("S1", xe, y)
        elif nm == "QH_U10":
            s.nc(xp, y)
        elif nm.endswith("!"):
            r = nm[:-1]
            if r == "V5":
                s.wire(xp, y, xe, y); s.label("V5", xe, y)
            else:
                s.wire(xp, y, xe, y)
                s.power("power:GND", xe, y, 0, vx=xe, vy=y + 3.81)
        else:
            s.wire(xp, y, xe, y); s.label(nm, xe, y)

# regelaars: +6 (VDD6), -6 (VEE6), +5 logic
s.component("Custom:L7806", "U11", "L7806", 45, 235, 0,
            "Package_TO_SOT_THT:TO-220-3_Vertical")
s.wire(45 - 11.43, 233.73, 45 - 16.51, 233.73)
s.power("power:+12V", 45 - 16.51, 233.73, vx=45 - 16.51, vy=233.73 - 3.302)
s.wire(45 - 11.43, 236.27, 45 - 16.51, 236.27)
s.power("power:GND", 45 - 16.51, 236.27)
s.wire(45 + 11.43, 233.73, 45 + 16.51, 233.73); s.label("VDD6", 45 + 16.51, 233.73)
s.component("Custom:L7906", "U12", "L7906", 45, 260, 0,
            "Package_TO_SOT_THT:TO-220-3_Vertical")
s.wire(45 - 11.43, 258.73, 45 - 16.51, 258.73)
s.power("power:-12V", 45 - 16.51, 258.73, vx=45 - 16.51, vy=258.73 + 3.81)
s.wire(45 - 11.43, 261.27, 45 - 16.51, 261.27)
s.power("power:GND", 45 - 16.51, 261.27)
s.wire(45 + 11.43, 258.73, 45 + 16.51, 258.73); s.label("VEE6", 45 + 16.51, 258.73)
s.component("Custom:78L05", "U13", "78L05", 45, 285, 0,
            "Package_TO_SOT_THT:TO-92_Inline")
s.wire(45 - 11.43, 283.73, 45 - 16.51, 283.73)
s.power("power:+12V", 45 - 16.51, 283.73, vx=45 - 16.51, vy=283.73 - 3.302)
s.wire(45 - 11.43, 286.27, 45 - 16.51, 286.27)
s.power("power:GND", 45 - 16.51, 286.27)
s.wire(45 + 11.43, 285 - 1.27, 45 + 16.51, 285 - 1.27)
s.label("V5", 45 + 16.51, 285 - 1.27)

# 8x MT8816 (U1..U8 = stem 1..8); kolommen x=140/230, rijen y=60..240
for k in range(1, 9):
    ux = 140 if k <= 4 else 230
    uy = 60 + 60 * ((k - 1) % 4)
    s.component("Custom:MT8816", f"U{k}", "MT8816AE", ux, uy, 0,
                "Package_DIP:DIP-40_W15.24mm")
    off = 19 * 1.27
    hw = 10.16
    L = ["IN4", "AY2", "RST", "AX3", "AX0", "UIT15", "UIT16", "UIT7", "UIT8",
         "UIT9", "UIT10", "UIT11", "UIT12", None, "IN8", "GND!", "IN7",
         "STB", "IN6", "VEE6"]
    R = ["VDD6", "IN3", "DATA", "IN2", "VDD6", "IN1", None, "UIT1", "UIT2",
         "UIT3", "UIT4", "UIT5", "UIT6", "UIT13", "UIT14", "AY1", "AY0",
         "AX2", "AX1", "IN5"]
    for side, spec in (("L", L), ("R", R)):
        for j, nm in enumerate(spec):
            y = uy - off + 2.54 * j
            xp = ux - (hw + 2.54) if side == "L" else ux + (hw + 2.54)
            xe = xp - 2.54 if side == "L" else xp + 2.54
            if nm is None:
                s.nc(xp, y)
            elif nm == "GND!":
                s.wire(xp, y, xe, y)
                s.power("power:GND", xe, y, 0, vx=xe, vy=y + 3.81)
            elif nm.startswith(("IN", "UIT")):
                s.wire(xp, y, xe, y); s.label(f"{nm}V{k}", xe, y)
            else:
                s.wire(xp, y, xe, y); s.label(nm, xe, y)

# 24x 1x10-busconnector (1=GND, 2-9=stem, 10=GND)
CONNS = ([(f"JIN{b}", f"IN{b}") for b in range(1, 9)]
         + [(f"JUIT{u}", f"UIT{u}") for u in range(1, 17)])
for i, (ref, pfx) in enumerate(CONNS):
    cx = 320 + 45 * (i // 8)
    cy = 45 + 33 * (i % 8)
    s.component("Custom:Conn_01x10", ref, pfx, cx, cy, 0,
                "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical")
    for p in range(10):
        y = cy - 11.43 + 2.54 * p
        s.wire(cx - 7.62, y, cx - 12.7, y)
        if p in (0, 9):
            s.power("power:GND", cx - 12.7, y)
        else:
            s.label(f"{pfx}V{p}", cx - 12.7, y)

# ontkoppeling: 100n VDD+VEE per chip, 595's, reg-elco's
CAPS = ([(f"C{k}", "100n", "VDD6") for k in range(1, 9)]
        + [(f"C{10+k}", "100n", "VEE6") for k in range(1, 9)]
        + [("C21", "100n", "V5"), ("C22", "100n", "V5"),
           ("C31", "10u", "+12V"), ("C32", "10u", "VDD6"),
           ("C33", "10u", "-12V"), ("C34", "10u", "VEE6"),
           ("C35", "10u", "V5")])
for i, (ref, val, rail) in enumerate(CAPS):
    x = 90 + 13 * i
    lib = "Device:C_Polarized" if val == "10u" else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if val == "10u"
          else "Capacitor_SMD:C_0805_2012Metric")
    s.component(lib, ref, val, x, 300, 0, fp)
    if rail in ("+12V", "-12V"):
        s.wire(x, 296.19, x, 293.83)
        s.power(f"power:{rail}", x, 293.83, vx=x,
                vy=(293.83 + 3.81 if rail == "-12V" else 293.83 - 3.302))
    else:
        s.wire(x, 296.19, x, 294.5); s.label(rail, x, 294.5)
    s.wire(x, 303.81, x, 306.17); s.power("power:GND", x, 306.17)

# flags
for k, rail in enumerate(("+12V", "-12V", "GND")):
    x1 = 90 + 14 * k
    s.wire(x1, 30, x1 + 5.08, 30)
    s.power(f"power:{rail}", x1, 30,
            vx=x1, vy=(30 + 3.81 if rail in ("GND", "-12V") else 30 - 3.302))
    s.flag(x1 + 5.08, 30)

s.text("MATRIX: 8x MT8816 volledig parallel (plane k = stem k; CS -> VDD6 = altijd\\n"
       "luisteren, schrijven = broadcast). Y0-7 = IN-bus 1-8, X0-15 = UIT-bus 1-16.\\n"
       "Besturing: U9 (AX0-3/AY0-2/DATA) + U10 (STROBE/RESET) = AHCT595-daisy aan\\n"
       "slot-SPI; RCLK = CS-flank; fw: 3 frames per kruispunt (adr+data / +STB / -STB).\\n"
       "VDD6 = +6V, VEE6 = -6V (audio +-5V nom, 1V marge); V5 = logic.\\n"
       "Connectorcontract: 1 = GND, 2-9 = stem 1-8, 10 = GND (jack8).", 150, 22)
s.write(OUT_DIR + r"\musicbrain-matrix.kicad_sch")

# ================= PCB =================
NETS = ['', '+12V', '-12V', 'GND', '/SCLK', '/MOSI', '/CS',
        '/VDD6', '/VEE6', '/V5', '/S1',
        '/AX0', '/AX1', '/AX2', '/AX3', '/AY0', '/AY1', '/AY2',
        '/DATA', '/STB', '/RST']
for b in range(1, 9):
    NETS += [f'/IN{b}V{v}' for v in range(1, 9)]
for u in range(1, 17):
    NETS += [f'/UIT{u}V{v}' for v in range(1, 9)]

BX0, BY0, BX1, BY1 = 40.0, 40.0, 155.0, 180.0    # 115 x 140
b = Board("MusicBrain MATRIX - 8-stemmige audio-patchmatrix", REV,
          (42.5, 110, 90), BX0, BY0, BX1, BY1, NETS, DATE)
b.silk_name = 'matrix'
b.paper = "A3"
P = b.P

def mtmap(k):
    m = {'1': f'/IN4V{k}', '2': '/AY2', '3': '/RST', '4': '/AX3',
         '5': '/AX0', '6': f'/UIT15V{k}', '7': f'/UIT16V{k}',
         '8': f'/UIT7V{k}', '9': f'/UIT8V{k}', '10': f'/UIT9V{k}',
         '11': f'/UIT10V{k}', '12': f'/UIT11V{k}', '13': f'/UIT12V{k}',
         '15': f'/IN8V{k}', '16': 'GND', '17': f'/IN7V{k}', '18': '/STB',
         '19': f'/IN6V{k}', '20': '/VEE6', '21': f'/IN5V{k}', '22': '/AX1',
         '23': '/AX2', '24': '/AY0', '25': '/AY1', '26': f'/UIT13V{k}',
         '27': f'/UIT12V{k}', '28': f'/UIT6V{k}', '29': f'/UIT5V{k}',
         '30': f'/UIT4V{k}', '31': f'/UIT3V{k}', '32': f'/UIT2V{k}',
         '33': f'/UIT1V{k}', '35': f'/IN1V{k}', '36': '/VDD6',
         '37': f'/IN2V{k}', '38': '/DATA', '39': f'/IN3V{k}', '40': '/VDD6'}
    # let op: 26=X13, 27=X12 -> UIT14/UIT13
    m['26'] = f'/UIT14V{k}'
    m['27'] = f'/UIT13V{k}'
    return b.nm(m)

def srmap(which):
    if which == 1:   # U9: adres + data
        q = {'15': '/AX0', '1': '/AX1', '2': '/AX2', '3': '/AX3',
             '4': '/AY0', '5': '/AY1', '6': '/AY2', '7': '/DATA',
             '9': '/S1', '14': '/MOSI'}
    else:            # U10: strobe + reset
        q = {'15': '/STB', '1': '/RST', '9': None, '14': '/S1'}
        q = {k: v for k, v in q.items() if v}
    q.update({'16': '/V5', '10': '/V5', '11': '/SCLK', '12': '/CS',
              '13': 'GND', '8': 'GND'})
    return b.nm(q)

J1_MAP = bus.j1_map(b, GEBRUIKT)
def busmap(pfx):
    return b.nm({'1': 'GND', '10': 'GND',
                 **{str(v + 1): f'/{pfx}V{v}' for v in range(1, 9)}})

DIP40 = ('Package_DIP.pretty\\DIP-40_W15.24mm.kicad_mod',
         'Package_DIP:DIP-40_W15.24mm')
SOIC16 = ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
          'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm')
HDR10 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Vertical.kicad_mod',
         'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical')
SOCK12 = ('Connector_PinSocket_2.54mm.pretty\\PinSocket_2x12_P2.54mm_Vertical.kicad_mod',
          'Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical')
TO220 = ('Package_TO_SOT_THT.pretty\\TO-220-3_Vertical.kicad_mod',
         'Package_TO_SOT_THT:TO-220-3_Vertical')
TO92 = ('Package_TO_SOT_THT.pretty\\TO-92_Inline.kicad_mod',
        'Package_TO_SOT_THT:TO-92_Inline')
C0805 = ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
         'Capacitor_SMD:C_0805_2012Metric')
CPEL = ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
        'Capacitor_SMD:CP_Elec_4x5.3')

# UIT-veld noord: 4 kolommen x 4 rijen; rot 90 = pinrij in +x vanaf anker
for u in range(1, 17):
    col, row = (u - 1) % 4, (u - 1) // 4
    x = 53.5 + 26.5 * col - 11.43     # anker = pin 1, rij loopt oostwaarts
    y = 46.0 + 6.5 * row
    b.fp(*HDR10, f'JUIT{u}', f'UIT{u}', x, y, 90, busmap(f'UIT{u}'))

# chipveld: 2 kolommen x 4 rijen, DIP-40 rot 270 (lange as in x;
# gemeten: hart = anker + (-24.13, +7.62) bij rot 270)
for k in range(1, 9):
    col = 0 if k <= 4 else 1
    row = (k - 1) % 4
    x = 68.0 + 56.0 * col
    y = 79.0 + 21.0 * row
    b.fp(*DIP40, f'U{k}', 'MT8816AE', x + 24.13, y - 7.62, 270, mtmap(k))
    # 100n VDD (oost, bij pin 40) + VEE (west, bij pin 20) in de rij-gap
    b.fp(*C0805, f'C{k}', '100n', x + 20.0, y - 10.1, 0, b.rc('/VDD6', 'GND'))
    b.fp(*C0805, f'C{10+k}', '100n', x - 20.0, y - 10.1, 0,
         b.rc('/VEE6', 'GND'))

# zuidstrook: IN-veld west (2 kol x 4 rijen), rot 90
for bnr in range(1, 9):
    col, row = (bnr - 1) % 2, (bnr - 1) // 2
    x = 53.5 + 26.5 * col - 11.43
    y = 155.0 + 6.5 * row
    b.fp(*HDR10, f'JIN{bnr}', f'IN{bnr}', x, y, 90, busmap(f'IN{bnr}'))

# zuidoost: besturing + voeding
b.fp(*SOIC16, 'U9', '74AHCT595', 100.0, 157.0, 0, srmap(1))
b.fp(*SOIC16, 'U10', '74AHCT595', 110.0, 157.0, 0, srmap(2))
b.fp(*C0805, 'C21', '100n', 104.9, 157.0, 270, b.rc('/V5', 'GND'))
b.fp(*C0805, 'C22', '100n', 114.9, 157.0, 270, b.rc('/V5', 'GND'))
b.fp(*SOCK12, 'J1', 'BUS', 121.0, 157.5, 90, J1_MAP)
b.fp(*TO220, 'U11', 'L7806', 98.0, 171.0, 0,
     b.nm({'1': '+12V', '2': 'GND', '3': '/VDD6'}))
b.fp(*TO220, 'U12', 'L7906', 110.0, 171.0, 0,
     b.nm({'1': 'GND', '2': '-12V', '3': '/VEE6'}))
b.fp(*TO92, 'U13', '78L05', 122.0, 171.0, 0,
     b.nm({'1': '/V5', '2': 'GND', '3': '+12V'}))
CBULK = [('C31', '+12V', 130.0), ('C32', '/VDD6', 137.0),
         ('C33', '-12V', 144.0), ('C34', '/VEE6', 151.0)]
for ref, rail, x in CBULK:
    b.fp(*CPEL, ref, '10u', x, 171.0, 0, b.rc(rail, 'GND'))
b.fp(*CPEL, 'C35', '10u', 144.0, 164.5, 0, b.rc('/V5', 'GND'))

# signalen via freerouting (SES); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-matrix.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")

for x, y in ((BX0 + 2, BY0 + 2), (BX1 - 2, BY0 + 2), (BX0 + 2, BY1 - 2),
             (BX1 - 2, BY1 - 2), (BX0 + 2, 110), (BX1 - 2, 110),
             ((BX0 + BX1) / 2, BY0 + 2), ((BX0 + BX1) / 2, BY1 - 2)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

b.write(OUT_DIR + r"\musicbrain-matrix.kicad_pcb")
print("written musicbrain-matrix (rev 0.1)")
