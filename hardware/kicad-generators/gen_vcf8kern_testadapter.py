"""VCF8-kern test-adapter (rev 0.1) - passief kaartje: buskabel-2x12 -> kernslot.

Laat een losse musicbrain-vcf8kern (kernslot-contract v1.1) direct op de
hoofd-SPI-bus testen, ZONDER de VCF8-backbone/RP2040. Volledig passief:
draadbruggen + MODE/TSEL-jumpers + TOUT-pullup.

Mapping (bus-slot gen 2 -> kernslot):
  MOSI  -> SDIN  + SDIN2   (AD5754-daisy EN DAC128S085 delen de MOSI-lijn)
  SCLK  -> SCLK  + SCLK2
  CS    -> CS (SYNC)
  LDAC  -> LDAC
  IRQ   -> CS2              (poly-spec B4: CS2 via de IRQ-lijn)
  MISO  <- SDO              (AD5754-daisy readback; SDO2 -> testpad)
  MODE0..2 / TSEL0..2 / TEN = jumpers (+3V3 / signaal / GND)
  FMCV  = jumper naar GND (geen FM op de bench; los = injecteren)
  TOUT  = open-drain -> 4k7 pullup naar +3V3 + testpad (scope voor tuning)

Doel: ERC 0 + netcheck OK + 0 courtyard-overlappen (net als de kern).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlib import Sch, conn_symbol, conn1_symbol, R_SYM, FLAG_SYM, power_symbol
from cardlib import Board
import bus

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-vcf8kern-testadapter"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-21"
REV = "0.1"
POWER = {'GND', '+12V', '-12V', '+3V3'}

KERNSLOT = {1: 'GND', 2: '+12V', 3: 'GND', 4: '-12V', 5: 'FMCV', 6: '+3V3',
            7: 'SCLK', 8: 'GND', 9: 'SDIN', 10: 'SDO', 11: 'CS', 12: 'LDAC',
            13: 'SCLK2', 14: 'SDIN2', 15: 'SDO2', 16: 'CS2', 17: 'MODE0',
            18: 'MODE1', 19: 'MODE2', 20: 'TSEL0', 21: 'TSEL1', 22: 'TSEL2',
            23: 'TEN', 24: 'TOUT'}

# bus-pin -> adapternet (alleen gebruikte pinnen; rest NC)
J1NET = {1: 'GND', 3: 'GND', 5: 'GND', 8: 'GND', 10: 'GND', 12: 'GND',
         14: 'GND', 20: 'GND', 2: '+12V', 4: '-12V', 6: '+3V3',
         7: 'SCLK', 9: 'MOSI', 11: 'MISO', 13: 'CS', 15: 'LDAC', 16: 'IRQ'}
# kernslot-pin -> adapternet (de mapping)
J2NET = {1: 'GND', 2: '+12V', 3: 'GND', 4: '-12V', 5: 'FMCV', 6: '+3V3',
         7: 'SCLK', 8: 'GND', 9: 'MOSI', 10: 'MISO', 11: 'CS', 12: 'LDAC',
         13: 'SCLK', 14: 'MOSI', 15: 'SDO2', 16: 'IRQ', 17: 'MODE0',
         18: 'MODE1', 19: 'MODE2', 20: 'TSEL0', 21: 'TSEL1', 22: 'TSEL2',
         23: 'TEN', 24: 'TOUT'}
JUMPERS = ['MODE0', 'MODE1', 'MODE2', 'TSEL0', 'TSEL1', 'TSEL2', 'TEN']

# ================= SCHEMA =================
s = Sch("adc80000-0000-4000-8000-000000000000", "musicbrain-vcf8kern-testadapter",
        "VCF8-kern test-adapter - buskabel 2x12 -> kernslot", REV, DATE,
        ("Passief: MOSI->SDIN+SDIN2, SCLK->SCLK+SCLK2, IRQ->CS2, MISO<-SDO",
         "MODE0..2/TSEL0..2/TEN = jumpers; FMCV->GND-jumper; TOUT 4k7-pullup",
         "Test een losse vcf8kern direct op de bus, zonder VCF8-backbone"))
s.libs += [R_SYM, FLAG_SYM, conn_symbol("Conn_02x12", 12),
           conn1_symbol("Conn_01x03", 3), conn1_symbol("Conn_01x01", 1),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False)]


def sterm(x, y, net):
    if net is None:
        s.nc(x, y)
    elif net in POWER:
        s.power(f"power:{net}", x, y, 0, vx=x,
                vy=(y + 3.81 if net in ('GND', '-12V') else y - 3.302))
    else:
        s.label(net, x, y)


def conn2x12(ref, name, jx, jy, netfn):
    s.component("Custom:Conn_02x12", ref, name, jx, jy, 0, "")
    for q in range(1, 25):
        row = (q - 1) // 2
        west = (q % 2 == 1)
        y = jy - 13.97 + 2.54 * row
        x = jx + (-7.62 if west else 7.62)
        xe = jx + (-12.7 if west else 12.7)
        net = netfn(q)
        if net is None:
            s.nc(x, y)
        else:
            s.wire(x, y, xe, y); sterm(xe, y, net)


conn2x12("J1", "BUS (2x12)", 40, 80, lambda q: J1NET.get(q))
conn2x12("J2", "KERNSLOT (socket)", 40, 150, lambda q: J2NET[q])

# jumpers 1x3: pin1=+3V3, pin2=signaal, pin3=GND
for i, sig in enumerate(JUMPERS):
    jx, jy = 90, 55 + i * 14
    s.component("Custom:Conn_01x03", f"JP{i+1}", sig, jx, jy, 0, "")
    for p, net in ((1, '+3V3'), (2, sig), (3, 'GND')):
        y = jy - 2.54 + 2.54 * (p - 1)
        s.wire(jx - 7.62, y, jx - 12.7, y); sterm(jx - 12.7, y, net)

# FMCV-jumper 1x3 (pin2=FMCV, pin1/3=GND -> shunt gronden; los = injecteren)
s.component("Custom:Conn_01x03", "JP8", "FMCV", 90, 153, 0, "")
for p, net in ((1, 'GND'), (2, 'FMCV'), (3, 'GND')):
    y = 153 - 2.54 + 2.54 * (p - 1)
    s.wire(90 - 7.62, y, 90 - 12.7, y); sterm(90 - 12.7, y, net)

# TOUT 4k7-pullup + testpad; SDO2-testpad
s.component("Device:R", "R1", "4k7", 130, 60, 0, "Resistor_SMD:R_0603_1608Metric")
s.wire(130, 60 - 3.81, 130, 60 - 7.62); s.power("power:+3V3", 130, 60 - 7.62,
                                                vx=130, vy=60 - 7.62 - 3.302)
s.wire(130, 60 + 3.81, 130, 60 + 7.62); s.label("TOUT", 130, 60 + 7.62)
for ref, sig, ty in (("TP1", "TOUT", 90), ("TP2", "SDO2", 105)):
    s.component("Custom:Conn_01x01", ref, sig, 130, ty, 0, "")
    s.wire(130 - 7.62, ty, 130 - 12.7, ty); s.label(sig, 130 - 12.7, ty)

for i, rail in enumerate(("+12V", "-12V", "+3V3", "GND")):
    x1 = 150 + 14 * i
    s.wire(x1, 60, x1 + 5.08, 60)
    s.power(f"power:{rail}", x1, 60,
            vx=x1, vy=(60 + 3.81 if rail in ('GND', '-12V') else 60 - 3.302))
    s.flag(x1 + 5.08, 60)

s.text("VCF8-kern test-adapter: buskabel-2x12 (J1) -> kernslot-socket (J2). Passieve\\n"
       "mapping MOSI->SDIN+SDIN2, SCLK->SCLK+SCLK2, IRQ->CS2, MISO<-SDO. MODE/TSEL/TEN\\n"
       "via jumpers (+3V3/GND); FMCV->GND-jumper; TOUT 4k7-pullup + testpad (scope).", 20, 25)
s.write(OUT_DIR + r"\musicbrain-vcf8kern-testadapter.kicad_sch")

# ================= PCB =================
NETS = ['', '+12V', '-12V', '+3V3', 'GND'] + ['/' + n for n in
        ('SCLK', 'MOSI', 'MISO', 'CS', 'LDAC', 'IRQ', 'SDO2', 'FMCV', 'TOUT',
         'MODE0', 'MODE1', 'MODE2', 'TSEL0', 'TSEL1', 'TSEL2', 'TEN')]
BX0, BY0, BX1, BY1 = 100.0, 100.0, 168.0, 158.0    # 68 x 58
CX = (BX0 + BX1) / 2                                # 134
b = Board("MusicBrain VCF8-kern test-adapter", REV,
          (CX, 129.0, 0), BX0, BY0, BX1, BY1, NETS, DATE)
b.silk_name = 'vcf8kern-testadapter'


def bn(net):
    return net if net in POWER else '/' + net


HDR2x12 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x12_P2.54mm_Vertical.kicad_mod',
           'Connector_PinHeader_2.54mm:PinHeader_2x12_P2.54mm_Vertical')
SOCK2x12 = ('Connector_PinSocket_2.54mm.pretty\\PinSocket_2x12_P2.54mm_Vertical.kicad_mod',
            'Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical')
HDR1x3 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x03_P2.54mm_Vertical.kicad_mod',
          'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical')
HDR1x1 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x01_P2.54mm_Vertical.kicad_mod',
          'Connector_PinHeader_2.54mm:PinHeader_1x01_P2.54mm_Vertical')
R0603 = ('Resistor_SMD.pretty\\R_0603_1608Metric.kicad_mod',
         'Resistor_SMD:R_0603_1608Metric')

# 2x12-connectoren horizontaal (rot 90 -> 30.48 breed): boven bus, onder kernslot
J1_MAP = b.nm({str(q): bn(net) for q, net in J1NET.items()})
J2_MAP = b.nm({str(q): bn(net) for q, net in J2NET.items()})
b.fp(*HDR2x12, 'J1', 'BUS', CX - 15.24, BY0 + 6.0, 90, J1_MAP)
b.fp(*SOCK2x12, 'J2', 'KERNSLOT', CX - 15.24, BY1 - 6.0, 90, J2_MAP)

# jumpers 1x3 (rot 90 -> 5.08 breed) in het midden, 2 rijen
for i, sig in enumerate(JUMPERS + ['FMCV']):
    col = i % 4
    row = i // 4
    x = 110.0 + col * 13.0
    y = 122.0 + row * 9.0
    if sig == 'FMCV':
        m = b.nm({'1': 'GND', '2': '/FMCV', '3': 'GND'})
        ref = 'JP8'
    else:
        m = b.nm({'1': '+3V3', '2': '/' + sig, '3': 'GND'})
        ref = f'JP{i+1}'
    b.fp(*HDR1x3, ref, sig, x, y, 90, m)

# TOUT-pullup + testpads (rechterrand)
b.fp(*R0603, 'R1', '4k7', 158.0, 122.0, 0, b.rc('+3V3', '/TOUT'))
b.fp(*HDR1x1, 'TP1', 'TOUT', 158.0, 128.0, 0, b.nm({'1': '/TOUT'}))
b.fp(*HDR1x1, 'TP2', 'SDO2', 158.0, 134.0, 0, b.nm({'1': '/SDO2'}))

b.write(OUT_DIR + r"\musicbrain-vcf8kern-testadapter.kicad_pcb")
print("written musicbrain-vcf8kern-testadapter (rev 0.1)")
