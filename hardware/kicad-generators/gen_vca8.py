"""MusicBrain VCA8 (gen 2) - 8x VCA slot card (2x SSI2164 + 2x DAC80004 daisy).

Eerste bord van het poly-analog-spoor (doc/poly-analog-spec.md, VCA8):
8 exponentiele VCA's met per-stem dCV-level = digitale envelopes op analoge
stemmen. Slot 2x12, kaart 80x45, busvoeding (< 50 mA per rail).

Architectuur:
  bus -> 1x DAC128S085 (OCTALE 12-bit, TSSOP-16, VA=VREF=+3V3, out 0..3V3)
  -> RC-slew (100R/4u7, anti-zipper) -> VC-poorten SSI2164 (-33 mV/dB;
  0 V = unity, 3V3 = -100 dB - dus 0..3V3 = het volle regelbereik).
  audio: J2 (IN 1x10, jack8-contract) -> 20k -> SSI2164 -> TL074 I/V
  (20k || 100p) -> 220R -> J3 (UIT 1x10). Fase inverteert (datasheet fig 1).
  MODE open = Class AB.

DAC-keuze (2026-07-20): DAC128S085 octaal 12-bit i.p.v. 2x DAC80004
(die kost EUR14; 16-bit is overkill voor VCA-level). GEEN hardware-LDAC:
sync = software (WRM + gelijktijdige update-opdracht) - voor VCA-level
niet sample-kritisch. DIN<-MOSI, DOUT->MISO (daisy voor VCA16), SYNC<-CS.
POR = 0V = unity = kort vol volume bij power-up: firmware schrijft als
eerste actie alle kanalen naar -100 dB.

Kanaalmap: CH k: DAC VOUTA-D=1-4, VOUTE-H=5-8; SSI U1(1-4)=1-4,
U2(1-4)=5-8; TL074 U3(1-4)=1-4, U4(1-4)=5-8. J2/J3: 1=GND, 2-9=CH1-8, 10=GND.
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board
import bus
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-vca8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-20"
REV = "0.1"

# LDAC ongebruikt: DAC128S085 heeft geen hardware-LDAC (sync = software)
GEBRUIKT = {'GND', '+12V', '-12V', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS'}

# ---- symbolen ----
SSI_L = [("1", "MODE", "input"), ("2", "IIN1", "input"), ("3", "VC1", "input"),
         ("4", "IOUT1", "output"), ("5", "IOUT2", "output"),
         ("6", "VC2", "input"), ("7", "IIN2", "input"), ("8", "GND", "power_in")]
SSI_R = [("16", "V+", "power_in"), ("15", "IIN4", "input"),
         ("14", "VC4", "input"), ("13", "IOUT4", "output"),
         ("12", "IOUT3", "output"), ("11", "VC3", "input"),
         ("10", "IIN3", "input"), ("9", "V-", "power_in")]
TL_L = [("1", "OUT1", "output"), ("2", "IN1-", "input"), ("3", "IN1+", "input"),
        ("4", "V+", "power_in"), ("5", "IN2+", "input"), ("6", "IN2-", "input"),
        ("7", "OUT2", "output")]
TL_R = [("14", "OUT4", "output"), ("13", "IN4-", "input"),
        ("12", "IN4+", "input"), ("11", "V-", "power_in"),
        ("10", "IN3+", "input"), ("9", "IN3-", "input"), ("8", "OUT3", "output")]
DAC_L = [("1", "DIN", "input"), ("2", "DOUT", "output"),
         ("3", "VOUTA", "output"), ("4", "VOUTB", "output"),
         ("5", "VOUTC", "output"), ("6", "VOUTD", "output"),
         ("7", "VA", "power_in"), ("8", "VREF1", "input")]
DAC_R = [("16", "SCLK", "input"), ("15", "~{SYNC}", "input"),
         ("14", "VOUTE", "output"), ("13", "VOUTF", "output"),
         ("12", "VOUTG", "output"), ("11", "VOUTH", "output"),
         ("10", "GND", "power_in"), ("9", "VREF2", "input")]

# ================= SCHEMA =================
s = Sch("dca80000-0000-4000-8000-000000000000", "musicbrain-vca8",
        "MusicBrain VCA8 - 8x VCA slot card", REV, DATE,
        ("Gen 2: slot 2x12 (spi-bus-spec v2.0), kaart 80x45, busvoeding",
         "2x SSI2164 (Class AB) + 1x DAC128S085 octaal 12-bit (VA=VREF=3V3)",
         "VC: 0V=unity, 3V3=-100dB (-33mV/dB); geen LDAC (sw-sync); DIN<-MOSI"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("SSI2164", SSI_L, SSI_R),
           box_symbol("TL074", TL_L, TL_R),
           box_symbol("DAC128S085", DAC_L, DAC_R),
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

# J2 = audio in, J3 = audio uit (jack8-contract: 1=GND, 2-9=CH, 10=GND)
for jref, jname, pfx, jy in (("J2", "AUDIO IN", "AIN", 175),
                             ("J3", "AUDIO UIT", "AOUT", 215)):
    s.component("Custom:Conn_01x10", jref, jname, 45, jy, 0,
                bus.HDR_PANEEL[1])
    pins = ["GND"] + [f"{pfx}{k}" for k in range(1, 9)] + ["GND"]
    for k in range(10):
        y = jy - 11.43 + 2.54 * k
        s.wire(45 - 7.62, y, 45 - 12.7, y)
        if pins[k] == "GND":
            s.power("power:GND", 45 - 12.7, y)
        else:
            s.label(pins[k], 45 - 12.7, y)


def wire_box(ux, uy, rows, L, R):
    """L/R: lijst netnamen ('RAIL!' = powersymbool, None = nc) in pinvolgorde."""
    off = (rows - 1) * 1.27
    hw = 8.89  # box_symbol default width 17.78
    for side, spec in (("L", L), ("R", R)):
        for k, nm in enumerate(spec):
            y = uy - off + 2.54 * k
            xp = ux - (hw + 2.54) if side == "L" else ux + (hw + 2.54)
            xe = xp - 2.54 if side == "L" else xp + 2.54
            if nm is None:
                s.nc(xp, y)
            elif nm.endswith("!"):
                r = nm[:-1]
                s.wire(xp, y, xe, y)
                s.power(f"power:{r}", xe, y, 0, vx=xe,
                        vy=(y + 3.81 if r in ("GND", "-12V") else y - 3.302))
            else:
                s.wire(xp, y, xe, y); s.label(nm, xe, y)


# 2x SSI2164 (U1: CH1-4, U2: CH5-8)
for un, uy, b0 in (("U1", 105, 1), ("U2", 155, 5)):
    s.component("Custom:SSI2164", un, "SSI2164", 125, uy, 0,
                "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
    wire_box(125, uy, 8,
             [None, f"IIN{b0}", f"VC{b0}", f"IOUT{b0}", f"IOUT{b0+1}",
              f"VC{b0+1}", f"IIN{b0+1}", "GND!"],
             ["+12V!", f"IIN{b0+3}", f"VC{b0+3}", f"IOUT{b0+3}",
              f"IOUT{b0+2}", f"VC{b0+2}", f"IIN{b0+2}", "-12V!"])

# 2x TL074 I/V (U3: CH1-4, U4: CH5-8)
for un, uy, b0 in (("U3", 105, 1), ("U4", 155, 5)):
    s.component("Custom:TL074", un, "TL074", 185, uy, 0,
                "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
    wire_box(185, uy, 7,
             [f"OUT{b0}", f"IOUT{b0}", "GND!", "+12V!", "GND!",
              f"IOUT{b0+1}", f"OUT{b0+1}"],
             [f"OUT{b0+3}", f"IOUT{b0+3}", "GND!", "-12V!", "GND!",
              f"IOUT{b0+2}", f"OUT{b0+2}"])

# 1x DAC128S085 octaal (VOUTA-D = CV1-4, VOUTE-H = CV5-8)
s.component("Custom:DAC128S085", "U5", "DAC128S085CIMTX", 245, 130, 0,
            "Package_SO:TSSOP-16_4.4x5mm_P0.65mm")
wire_box(245, 130, 8,
         ["MOSI", "MISO", "CV1", "CV2", "CV3", "CV4", "+3V3!", "+3V3!"],
         ["SCLK", "CS", "CV5", "CV6", "CV7", "CV8", "GND!", "+3V3!"])

# per-kanaal passieven (8 kolommen, labels west/oost)
for k in range(1, 9):
    x = 95 + 24 * (k - 1)

    def hr(ref, val, y, west, oost):
        s.component("Device:R", ref, val, x, y, 90,
                    "Resistor_SMD:R_0805_2012Metric")
        s.wire(x - 3.81, y, x - 7.62, y); s.label(west, x - 7.62, y)
        s.wire(x + 3.81, y, x + 7.62, y); s.label(oost, x + 7.62, y)

    def hc(ref, val, y, west, oost):
        s.component("Device:C", ref, val, x, y, 90,
                    "Capacitor_SMD:C_0805_2012Metric")
        s.wire(x - 3.81, y, x - 7.62, y); s.label(west, x - 7.62, y)
        s.wire(x + 3.81, y, x + 7.62, y); s.label(oost, x + 7.62, y)

    def vc_gnd(ref, val, y, top):
        s.component("Device:C", ref, val, x, y, 0,
                    "Capacitor_SMD:C_0805_2012Metric")
        s.wire(x, y - 3.81, x, y - 6.17); s.label(top, x, y - 6.17)
        s.wire(x, y + 3.81, x, y + 6.17); s.power("power:GND", x, y + 6.17)

    hr(f"R{k}", "20k", 190, f"AIN{k}", f"IIN{k}")          # RIN
    hr(f"R{10+k}", "220R", 200, f"IIN{k}", f"ST{k}")       # stabiliteits-RC
    vc_gnd(f"C{10+k}", "1n2", 212, f"ST{k}")
    hr(f"R{20+k}", "20k", 224, f"IOUT{k}", f"OUT{k}")      # I/V-feedback
    hc(f"C{20+k}", "100p", 232, f"IOUT{k}", f"OUT{k}")
    hr(f"R{30+k}", "220R", 242, f"OUT{k}", f"AOUT{k}")     # serie-uit
    hr(f"R{40+k}", "100R", 252, f"CV{k}", f"VC{k}")        # slew (anti-zipper)
    vc_gnd(f"C{30+k}", "4u7", 264, f"VC{k}")

# ontkoppeling (VA/VREF1/VREF2 delen +3V3 met lokale 100n + 10u bulk)
CAPS = [("C41", "100n", "+12V"), ("C42", "100n", "-12V"),
        ("C43", "100n", "+12V"), ("C44", "100n", "-12V"),
        ("C45", "100n", "+12V"), ("C46", "100n", "-12V"),
        ("C47", "100n", "+12V"), ("C48", "100n", "-12V"),
        ("C49", "100n", "+3V3"), ("C50", "100n", "+3V3"),
        ("C61", "10u", "+12V"), ("C62", "10u", "-12V"),
        ("C63", "10u", "+3V3")]
for k, (ref, val, rail) in enumerate(CAPS):
    x = 90 + 16 * k
    lib = "Device:C_Polarized" if val == "10u" else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if val == "10u"
          else "Capacitor_SMD:C_0805_2012Metric")
    s.component(lib, ref, val, x, 285, 0, fp)
    if rail == "-12V":
        s.wire(x, 281.19, x, 278.83)
        s.power("power:-12V", x, 278.83, vx=x, vy=278.83 + 3.81)
    else:
        s.wire(x, 281.19, x, 278.83)
        s.power(f"power:{rail}", x, 278.83, vx=x, vy=278.83 - 3.302)
    s.wire(x, 288.81, x, 291.17); s.power("power:GND", x, 291.17)

# flags
for k, rail in enumerate(("+12V", "-12V", "+3V3", "GND")):
    x1 = 300 + 14 * k
    s.wire(x1, 160, x1 + 5.08, 160)
    s.power(f"power:{rail}", x1, 160,
            vx=x1, vy=(160 + 3.81 if rail in ("GND", "-12V") else 160 - 3.302))
    s.flag(x1 + 5.08, 160)

s.text("VCA8: 1x DAC128S085 octaal 12-bit (DIN <- MOSI, DOUT -> MISO daisy, SYNC <- CS,\\n"
       "VA = VREF1 = VREF2 = +3V3 -> out 0..3V3). GEEN hardware-LDAC: sync via software\\n"
       "(WRM + gelijktijdige update). VC: 0V = unity, 3V3 = -100dB (-33mV/dB).\\n"
       "POR = 0V = unity = kort vol volume bij power-up; fw schrijft eerst alles op -100dB.\\n"
       "MODE open = Class AB; audio inverteert (SSI2164 fig 1).\\n"
       "CH k: DAC VOUTA-D=1-4 VOUTE-H=5-8; J2/J3: 1=GND, 2-9=CH1-8, 10=GND.", 20, 30)
s.write(OUT_DIR + r"\musicbrain-vca8.kicad_sch")

# ================= PCB =================
NETS = ['', '+12V', '-12V', '+3V3', 'GND', '/SCLK', '/MOSI', '/MISO', '/CS']
for k in range(1, 9):
    NETS += [f'/AIN{k}', f'/IIN{k}', f'/ST{k}', f'/IOUT{k}', f'/OUT{k}',
             f'/AOUT{k}', f'/CV{k}', f'/VC{k}']

BX0, BX1 = 100.0, 180.0                   # 80 mm (standaard kaartbreedte)
CX = (BX0 + BX1) / 2                      # 140.0
b = Board("MusicBrain VCA8 - 8x VCA slot card", REV,
          (102.3, 120, 90), BX0, bus.BY0, BX1, bus.BY1, NETS, DATE)
b.silk_name = 'vca8'
P = b.P

def ssimap(b0):
    m = {'2': f'/IIN{b0}', '3': f'/VC{b0}', '4': f'/IOUT{b0}',
         '5': f'/IOUT{b0+1}', '6': f'/VC{b0+1}', '7': f'/IIN{b0+1}',
         '8': 'GND', '9': '-12V',
         '10': f'/IIN{b0+2}', '11': f'/VC{b0+2}', '12': f'/IOUT{b0+2}',
         '13': f'/IOUT{b0+3}', '14': f'/VC{b0+3}', '15': f'/IIN{b0+3}',
         '16': '+12V'}
    return b.nm(m)

def tlmap(b0):
    m = {'1': f'/OUT{b0}', '2': f'/IOUT{b0}', '3': 'GND', '4': '+12V',
         '5': 'GND', '6': f'/IOUT{b0+1}', '7': f'/OUT{b0+1}',
         '8': f'/OUT{b0+2}', '9': f'/IOUT{b0+2}', '10': 'GND', '11': '-12V',
         '12': 'GND', '13': f'/IOUT{b0+3}', '14': f'/OUT{b0+3}'}
    return b.nm(m)

def dacmap():
    # TSSOP-16: 1=DIN 2=DOUT 3=A 4=B 5=C 6=D 7=VA 8=VREF1
    #          16=SCLK 15=SYNC 14=E 13=F 12=G 11=H 10=GND 9=VREF2
    m = {'1': '/MOSI', '2': '/MISO', '3': '/CV1', '4': '/CV2', '5': '/CV3',
         '6': '/CV4', '7': '+3V3', '8': '+3V3', '9': '+3V3', '10': 'GND',
         '11': '/CV8', '12': '/CV7', '13': '/CV6', '14': '/CV5',
         '15': '/CS', '16': '/SCLK'}
    return b.nm(m)

J1_MAP = bus.j1_map(b, GEBRUIKT)
def jmap(pfx):
    return b.nm({'1': 'GND', '10': 'GND',
                 **{str(k + 1): f'/{pfx}{k}' for k in range(1, 9)}})

b.fp(bus.HDR_BUS[0], bus.HDR_BUS[1], 'J1', 'BUS',
     CX + bus.BUS_HALF, bus.BY1 - bus.CONN_INSET, 270, J1_MAP)
# courtyard 1x10-header = 26,4 breed -> harten minstens 26,5 uit elkaar
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J2', 'IN',
     CX - 13.6 - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90,
     jmap('AIN'))
b.fp(bus.HDR_PANEEL[0], bus.HDR_PANEEL[1], 'J3', 'UIT',
     CX + 13.6 - bus.PANEEL_HALF, bus.BY0 + bus.CONN_INSET_PANEEL, 90,
     jmap('AOUT'))

SOIC16 = ('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
          'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm')
SOIC14 = ('Package_SO.pretty\\SOIC-14_3.9x8.7mm_P1.27mm.kicad_mod',
          'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm')
TSSOP16 = ('Package_SO.pretty\\TSSOP-16_4.4x5mm_P0.65mm.kicad_mod',
           'Package_SO:TSSOP-16_4.4x5mm_P0.65mm')
R0805 = ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric')
C0805 = ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
         'Capacitor_SMD:C_0805_2012Metric')
CPEL = ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
        'Capacitor_SMD:CP_Elec_4x5.3')

# chips in stroken: SSI's west, opamps midden, DAC oost (courtyards gemeten:
# SOIC16 7.40x10.40, SOIC14 7.40x9.16, TSSOP16 7.70x5.10, 0805 1.96x3.40)
b.fp(*SOIC16, 'U1', 'SSI2164', 117.3, 112.5, 0, ssimap(1))
b.fp(*SOIC16, 'U2', 'SSI2164', 117.3, 127.0, 0, ssimap(5))
b.fp(*SOIC14, 'U3', 'TL074', 133.3, 112.5, 0, tlmap(1))
b.fp(*SOIC14, 'U4', 'TL074', 133.3, 126.5, 0, tlmap(5))
b.fp(*TSSOP16, 'U5', 'DAC128S085CIMTX', 147.5, 119.7, 0, dacmap())

# passieven in 8-rij-kolommen, y-pitch 3.55 (0805-courtyard is 3.40 lang):
# west: RIN | RST | CST; midden: RFB | CFB; oost: RSL | CSL | ROUT
for k in range(1, 9):
    y = 109.2 + 3.55 * (k - 1)
    b.fp(*R0805, f'R{k}', '20k', 106.0, y, 270, b.rc(f'/AIN{k}', f'/IIN{k}'))
    b.fp(*R0805, f'R{10+k}', '220R', 108.8, y, 270, b.rc(f'/IIN{k}', f'/ST{k}'))
    b.fp(*C0805, f'C{10+k}', '1n2', 111.6, y, 270, b.rc(f'/ST{k}', 'GND'))
    b.fp(*R0805, f'R{20+k}', '20k', 123.9, y, 270,
         b.rc(f'/IOUT{k}', f'/OUT{k}'))
    b.fp(*C0805, f'C{20+k}', '100p', 126.7, y, 270,
         b.rc(f'/IOUT{k}', f'/OUT{k}'))
    b.fp(*R0805, f'R{40+k}', '100R', 153.3, y, 270, b.rc(f'/CV{k}', f'/VC{k}'))
    b.fp(*C0805, f'C{30+k}', '4u7', 156.1, y, 270, b.rc(f'/VC{k}', 'GND'))
    b.fp(*R0805, f'R{30+k}', '220R', 158.9, y, 270,
         b.rc(f'/OUT{k}', f'/AOUT{k}'))

# ontkoppeling (100n per rail-pin bij de chips + 10u bulk per rail oost;
# C49/C50 = +3V3 bij de DAC, dekt ook VA/VREF1/VREF2)
DECO = [('C41', C0805, '100n', 115.3, 119.7, 0, b.rc('+12V', 'GND')),
        ('C42', C0805, '100n', 119.3, 119.7, 0, b.rc('-12V', 'GND')),
        ('C43', C0805, '100n', 115.3, 134.2, 0, b.rc('+12V', 'GND')),
        ('C44', C0805, '100n', 119.3, 134.2, 0, b.rc('-12V', 'GND')),
        ('C45', C0805, '100n', 139.7, 111.0, 270, b.rc('+12V', 'GND')),
        ('C46', C0805, '100n', 139.7, 114.55, 270, b.rc('-12V', 'GND')),
        ('C47', C0805, '100n', 139.7, 118.1, 270, b.rc('+12V', 'GND')),
        ('C48', C0805, '100n', 139.7, 121.65, 270, b.rc('-12V', 'GND')),
        ('C49', C0805, '100n', 142.2, 116.15, 270, b.rc('+3V3', 'GND')),
        ('C50', C0805, '100n', 142.2, 123.25, 270, b.rc('+3V3', 'GND')),
        ('C61', CPEL, '10u', 170.0, 110.0, 0, b.rc('+12V', 'GND')),
        ('C62', CPEL, '10u', 170.0, 117.5, 0, b.rc('-12V', 'GND')),
        ('C63', CPEL, '10u', 170.0, 125.0, 0, b.rc('+3V3', 'GND'))]
for ref, fpp, val, x, y, rot, m in DECO:
    b.fp(*fpp, ref, val, x, y, rot, m)

# signalen via freerouting (SES); GND via de vlakken
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-vca8.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")

# GND-hechtvia's: hoeken/randen + eiland-via's uit gnd_stitch.json
for x, y in ((BX0 + 2, bus.BY0 + 2), (BX1 - 2, bus.BY0 + 2),
             (BX0 + 2, bus.BY1 - 2), (BX1 - 2, bus.BY1 - 2),
             (BX0 + 2, 122), (BX1 - 2, 122),
             (BX0 + 6, bus.BY1 - 8), (BX1 - 4, bus.BY1 - 10)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

b.write(OUT_DIR + r"\musicbrain-vca8.kicad_pcb")
print("written musicbrain-vca8 (gen 2, rev 0.1)")
