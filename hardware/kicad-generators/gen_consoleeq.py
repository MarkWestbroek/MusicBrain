"""MusicBrain CONSOLE EQ (concept, rev 0.1) - analoge 1073-stijl kanaal-EQ met dCV.

Conceptschema (geen PCB): hardware/schematics/concept/musicbrain-consoleeq/.
Plan: doc/plans/analoge-fx-verkenning.md par. 1. Digitale tegenhanger:
firmware/lib/mmb-dsp/mmb_dsp/console_eq.h (tp_mmb_console_eq).

Idee: het audiopad is analoog van J2-IN tot J2-UIT; de Brain stuurt alleen
CV's (gains) en logica (frequentiekeuze, boost/cut, HPF-bypass). Zonder MCU
op de kaart ("dom", poly-analog-spec B1): CS -> DAC128S085 (3 gains),
CS2 = IRQ-lijn (B4) -> 2x 74HC595 daisy (16 logicabits).

Signaalpad (mono, 1 kanaal per kaart):
  J2 IN -> buffer -> HPF (3e orde, 4 freq + bypass) -> LOW-cel -> MID-cel
       -> HIGH-cel -> buffer -> J2 UIT
Elke cel = inverterende opamp (Rin=Rf=10k, unity) met een bandfilter dat
via een THAT2181-VCA stroom in het sommeerknooppunt stuurt:
  boost: filter gevoed vanuit de cel-INGANG  -> out = -(in + a.F(in))
  cut:   filter gevoed vanuit de cel-UITGANG -> out = -in / (1 + a.F)
De SPDT (ADG409-helft) kiest de bron: reciproque curves zoals een console.
a = (Rf/Rb).g, g = VCA-gain 0..1 (Ec- 0..+0,3 V uit DAC/divider): 0..+16 dB.
Drie cellen inverteren samen 3x + buffers: netto fase = zie README.

Filters:
  HPF : Sallen-Key 2e orde (Q=1) + RC 1e orde = 3e orde 18 dB/oct;
        R's geschakeld via ADG409 (dual 4:1) + ADG409 (half): 50/80/160/300
  LOW : Sallen-Key LP 2e orde Q=1 (de "inductorbult") als shelf-bron,
        R's via ADG409: 35/60/110/220 Hz
  MID : MFB-bandpass, R vast (Q 0,9, gain 1), C's geschakeld via 2x ADG408:
        360/700/1600/3200/4800/7200 Hz
  HIGH: 1e-orde HP 12 kHz vast als shelf-bron
Boost/cut x3 + HPF-bypass = 4 SPDT's = 2x ADG409 (A-helft schakelt op A1,
B-helft op A0: S1A=S2A=bron1/S3A=S4A=bron2 resp. S1B=S3B/S2B=S4B).

Bitmap 74HC595 #1 (QA..QH): HPF_A0 HPF_A1 HPF_BYP LOW_A0 LOW_A1 MID_A0
MID_A1 MID_A2; #2: LOW_BC MID_BC HI_BC (1 = cut) + 5 reserve (CLR_BYP...).
DAC128S085 A/B/C = gain LOW/MID/HIGH (0 V = vol, 3V3 = uit), D-H reserve.

Pinouts ADG408/ADG409/THAT2181 uit het geheugen opgetekend: VERIFIEREN tegen
de datasheets voor er een PCB komt (zie README, status concept).
"""
import os
import sys
import subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from kicadcli import KICAD_CLI
import bus

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\concept\musicbrain-consoleeq"
os.makedirs(OUT_DIR, exist_ok=True)
NAME = "musicbrain-consoleeq"
DATE = "2026-09-24"
REV = "0.1c"   # c = concept, geen PCB

GEBRUIKT = {'GND', '+12V', '-12V', '+3V3', '/SCLK', '/MOSI', '/MISO', '/CS', '/IRQ'}

# ---- symbolen (box) ----
TL_L = [("1", "OUT1", "output"), ("2", "IN1-", "input"), ("3", "IN1+", "input"),
        ("4", "V+", "power_in"), ("5", "IN2+", "input"), ("6", "IN2-", "input"),
        ("7", "OUT2", "output")]
TL_R = [("14", "OUT4", "output"), ("13", "IN4-", "input"), ("12", "IN4+", "input"),
        ("11", "V-", "power_in"), ("10", "IN3+", "input"), ("9", "IN3-", "input"),
        ("8", "OUT3", "output")]
DAC_L = [("1", "DIN", "input"), ("2", "DOUT", "output"), ("3", "VOUTA", "output"),
         ("4", "VOUTB", "output"), ("5", "VOUTC", "output"), ("6", "VOUTD", "output"),
         ("7", "VA", "power_in"), ("8", "VREF1", "input")]
DAC_R = [("16", "SCLK", "input"), ("15", "~{SYNC}", "input"), ("14", "VOUTE", "output"),
         ("13", "VOUTF", "output"), ("12", "VOUTG", "output"), ("11", "VOUTH", "output"),
         ("10", "GND", "power_in"), ("9", "VREF2", "input")]
SR_L = [("1", "QB", "output"), ("2", "QC", "output"), ("3", "QD", "output"),
        ("4", "QE", "output"), ("5", "QF", "output"), ("6", "QG", "output"),
        ("7", "QH", "output"), ("8", "GND", "power_in")]
SR_R = [("16", "VCC", "power_in"), ("15", "QA", "output"), ("14", "SER", "input"),
        ("13", "~{OE}", "input"), ("12", "RCLK", "input"), ("11", "SRCLK", "input"),
        ("10", "~{SRCLR}", "input"), ("9", "QH'", "output")]
# ADG409 dual 4:1 (DG409-pinout): 1 A0 2 EN 3 V- 4 S1A 5 S2A 6 S3A 7 S4A 8 DA
#                                 9 DB 10 S4B 11 S3B 12 S2B 13 S1B 14 V+ 15 GND 16 A1
M409_L = [("1", "A0", "input"), ("2", "EN", "input"), ("3", "V-", "power_in"),
          ("4", "S1A", "passive"), ("5", "S2A", "passive"), ("6", "S3A", "passive"),
          ("7", "S4A", "passive"), ("8", "DA", "passive")]
M409_R = [("16", "A1", "input"), ("15", "GND", "power_in"), ("14", "V+", "power_in"),
          ("13", "S1B", "passive"), ("12", "S2B", "passive"), ("11", "S3B", "passive"),
          ("10", "S4B", "passive"), ("9", "DB", "passive")]
# ADG408 8:1 (DG408-pinout): 1 A0 2 EN 3 V- 4 S1 5 S2 6 S3 7 S4 8 D
#                            9 S8 10 S7 11 S6 12 S5 13 V+ 14 GND 15 A2 16 A1
M408_L = [("1", "A0", "input"), ("2", "EN", "input"), ("3", "V-", "power_in"),
          ("4", "S1", "passive"), ("5", "S2", "passive"), ("6", "S3", "passive"),
          ("7", "S4", "passive"), ("8", "D", "passive")]
M408_R = [("16", "A1", "input"), ("15", "A2", "input"), ("14", "GND", "power_in"),
          ("13", "V+", "power_in"), ("12", "S5", "passive"), ("11", "S6", "passive"),
          ("10", "S7", "passive"), ("9", "S8", "passive")]
# THAT2181 SIP-8: 1 Ec+ 2 Ec- 3 GND 4 SYM 5 V- 6 OUT 7 V+ 8 IN
VCA_L = [("1", "Ec+", "input"), ("2", "Ec-", "input"), ("3", "GND", "power_in"),
         ("4", "SYM", "input")]
VCA_R = [("8", "IN", "input"), ("7", "V+", "power_in"), ("6", "OUT", "output"),
         ("5", "V-", "power_in")]

s = Sch("c0e40000-0000-4000-8000-000000000001", NAME,
        "MusicBrain CONSOLE EQ - analoge 1073-stijl kanaal-EQ met dCV (concept)",
        REV, DATE,
        ("CONCEPT: schema zonder PCB. Slot 2x12 (spi-bus-spec v2.0), busvoeding +/-12V, 3V3",
         "Audio analoog J2 IN->UIT; Brain stuurt gains (DAC128S085) en logica (2x 74HC595 op CS2=IRQ)",
         "Mux-pinouts (ADG408/409) en THAT2181 VERIFIEREN tegen datasheet voor een PCB"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("TL074", TL_L, TL_R),
           box_symbol("DAC128S085", DAC_L, DAC_R),
           box_symbol("74HC595", SR_L, SR_R),
           box_symbol("ADG409", M409_L, M409_R),
           box_symbol("ADG408", M408_L, M408_R),
           box_symbol("THAT2181", VCA_L, VCA_R, width=15.24),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False)]


def rail(net, x, y):
    s.power(f"power:{net}", x, y, 0, vx=x,
            vy=(y + 3.81 if net in ("GND", "-12V") else y - 3.302))


def wire_box(ux, uy, rows, L, R, hw=8.89):
    """L/R: netnamen ('RAIL!' = powersymbool, None = nc) in pinvolgorde."""
    off = (rows - 1) * 1.27
    for side, spec in (("L", L), ("R", R)):
        for k, nm in enumerate(spec):
            y = uy - off + 2.54 * k
            xp = ux - (hw + 2.54) if side == "L" else ux + (hw + 2.54)
            xe = xp - 2.54 if side == "L" else xp + 2.54
            if nm is None:
                s.nc(xp, y)
            elif nm.endswith("!"):
                s.wire(xp, y, xe, y); rail(nm[:-1], xe, y)
            else:
                s.wire(xp, y, xe, y); s.label(nm, xe, y)


def hr(ref, val, x, y, west, oost, lib="Device:R", fp="Resistor_SMD:R_0805_2012Metric"):
    """Horizontaal 2-pins onderdeel op (x,y), netten west/oost ('GND!' = rail)."""
    s.component(lib, ref, val, x, y, 90, fp)
    for side, nm in ((-1, west), (1, oost)):
        xp, xe = x + side * 3.81, x + side * 7.62
        s.wire(xp, y, xe, y)
        if nm.endswith("!"):
            rail(nm[:-1], xe, y)
        else:
            s.label(nm, xe, y)


def hc(ref, val, x, y, west, oost):
    hr(ref, val, x, y, west, oost, "Device:C", "Capacitor_SMD:C_0805_2012Metric")


def vc_gnd(ref, val, x, y, top):
    s.component("Device:C", ref, val, x, y, 0, "Capacitor_SMD:C_0805_2012Metric")
    s.wire(x, y - 3.81, x, y - 6.17); s.label(top, x, y - 6.17)
    s.wire(x, y + 3.81, x, y + 6.17); rail("GND", x, y + 6.17)


# ================= J1 bus, J2 audio =================
JX, JY = 40, 60
s.component("Custom:Conn_02x12", "J1", "BUS (slot, 2x12)", JX, JY, 0, bus.HDR_BUS[1])
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
        s.wire(x, y, xe, y); rail(net, xe, y)
    else:
        s.wire(x, y, xe, y)
        s.label("CS2" if net == '/IRQ' else net.lstrip('/'), xe, y)

# J2 = front 1x10 (jack8-contract): 1 GND, 2 IN, 3 UIT, 4-9 nc, 10 GND
s.component("Custom:Conn_01x10", "J2", "AUDIO (front)", 40, 110, 0, bus.HDR_PANEEL[1])
J2 = ["GND!", "AIN", "AOUT", None, None, None, None, None, None, "GND!"]
for k, nm in enumerate(J2):
    y = 110 - 11.43 + 2.54 * k
    xp, xe = 40 - 7.62, 40 - 12.7
    if nm is None:
        s.nc(xp, y)
    else:
        s.wire(xp, y, xe, y)
        rail("GND", xe, y) if nm.endswith("!") else s.label(nm, xe, y)

# ================= besturing: DAC + 2x 595 =================
s.component("Custom:DAC128S085", "U1", "DAC128S085CIMTX", 110, 45, 0,
            "Package_SO:TSSOP-16_4.4x5mm_P0.65mm")
wire_box(110, 45, 8,
         ["MOSI", None, "CVL", "CVM", "CVH", None, "+3V3!", "+3V3!"],
         ["SCLK", "CS", None, None, None, None, "GND!", "+3V3!"])
# 595 #1 op CS2 (RCLK <- CS2 stijgende flank, zoals gate8); daisy naar #2
s.component("Custom:74HC595", "U2", "74HC595", 110, 95, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(110, 95, 8,
         ["HPF_A1", "HPF_BYP", "LOW_A0", "LOW_A1", "MID_A0", "MID_A1", "MID_A2", "GND!"],
         ["+3V3!", "HPF_A0", "MOSI", "GND!", "CS2", "SCLK", "+3V3!", "SRQ"])
s.component("Custom:74HC595", "U3", "74HC595", 110, 140, 0,
            "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(110, 140, 8,
         ["MID_BC", "HI_BC", None, None, None, None, None, "GND!"],
         ["+3V3!", "LOW_BC", "SRQ", "GND!", "CS2", "SCLK", "+3V3!", None])
# gain-CV: DAC 0..3V3 -> 10k/1k -> 0..0,3 V op Ec- (0 V = vol, +0,3 V ~ -49 dB)
for k, (cv, ec) in enumerate((("CVL", "ECL"), ("CVM", "ECM"), ("CVH", "ECH"))):
    y = 175 + 12 * k
    hr(f"R{1+k}", "10k", 95, y, cv, ec)
    hr(f"R{4+k}", "1k", 115, y, ec, "GND!")
    vc_gnd(f"C{1+k}", "100n", 130, y + 5, ec)

# ================= opamps =================
# U4: 1 in-buffer, 2 HPF SK, 3 LOW-cel, 4 LOW SK-LP
s.component("Custom:TL074", "U4", "TL074", 200, 45, 0, "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
wire_box(200, 45, 7,
         ["BUF1", "BUF1", "AIN", "+12V!", "HPFP", "HPFN", "HPFO"],
         ["LPO", "LPN", "LPP", "-12V!", "GND!", "N_L", "CELL_L"])
# U5: 1 MID-cel, 2 MID MFB, 3 HIGH-cel, 4 uit-buffer
s.component("Custom:TL074", "U5", "TL074", 200, 100, 0, "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
wire_box(200, 100, 7,
         ["CELL_M", "N_M", "GND!", "+12V!", "GND!", "BPN", "BPO"],
         ["BUF2", "BUF2", "CELL_H", "-12V!", "GND!", "N_H", "CELL_H"])
# in-buffer volger: AIN->IN1+, uit=BUF1 (U4 pin 1/2 al aan elkaar via label)
# uit-buffer: CELL_H -> IN4+, OUT4 = BUF2 -> 220R -> AOUT
hr("R7", "220R", 260, 100, "BUF2", "AOUT")
hr("R8", "100k", 260, 108, "AIN", "GND!")           # ingangsreferentie

# ================= HPF (3e orde) =================
# BUF1 -> [SPDT bypass] -> HPFI -> C10 -> a -> C11 -> HPFP(+) ; R via mux
#   SK: C10=C11=100n; RA (a->uit/HPFO feedback) en RB (HPFP->GND)
#   1e orde: HPFO -> C12 100n -> HPF1 -> RC (mux) -> GND
# freq 50/80/160/300: R = 1/(2 pi f C) = 31k8 / 19k9 / 9k95 / 5k3 (Q=1 via K=2)
hc("C10", "100n", 250, 130, "HPFI", "HPFA")
hc("C11", "100n", 270, 130, "HPFA", "HPFP")
hr("R9", "10k", 250, 138, "HPFO", "HPFN")           # K = 2: Rf = Rg
hr("R10", "10k", 270, 138, "HPFN", "GND!")
hc("C12", "100n", 250, 146, "HPFO", "HPF1")
HPF_R = ("31k8", "19k9", "9k95", "5k3")
# U6 ADG409: A = RA-set (HPFA -> HPFO), B = RB-set (HPFP -> GND)
s.component("Custom:ADG409", "U6", "ADG409", 330, 45, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(330, 45, 8,
         ["HPF_A0", "+3V3!", "-12V!", "RA1", "RA2", "RA3", "RA4", "HPFO"],
         ["HPF_A1", "GND!", "+12V!", "RB1", "RB2", "RB3", "RB4", "GND!"])
for k, v in enumerate(HPF_R):
    hr(f"R{11+k}", v, 375, 32 + 8 * k, "HPFA", f"RA{k+1}")
    hr(f"R{15+k}", v, 395, 32 + 8 * k, "HPFP", f"RB{k+1}")
# U7 ADG409: A = RC-set (HPF1 -> GND, 1e orde); B deelt A0/A1 met de RC-keuze
#   en blijft reserve (de HPF-bypass zit op U15-B).
s.component("Custom:ADG409", "U7", "ADG409", 330, 95, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(330, 95, 8,
         ["HPF_A0", "+3V3!", "-12V!", "RC1", "RC2", "RC3", "RC4", "GND!"],
         ["HPF_A1", "GND!", "+12V!", None, None, None, None, None])
for k, v in enumerate(HPF_R):
    hr(f"R{19+k}", v, 375, 82 + 8 * k, "HPF1", f"RC{k+1}")

# ================= LOW-cel =================
# cel: bron (SPDT) -> LPI -> SK-LP (Q=1, K=2) -> LPO -> Rb 2k -> VCA1 IN
#      VCA1 OUT -> N_L (sommeerknoop). Rin/Rf 10k. CELL_L = -(HPF1 + a.LP)
hr("R23", "10k", 250, 160, "HPFS", "N_L")           # Rin (celingang = HPF of bypass)
hr("R24", "10k", 270, 160, "N_L", "CELL_L")         # Rf
hr("R25", "2k", 250, 168, "LPO", "VCA1I")           # Rb -> VCA (stroomingang)
hr("R26", "10k", 250, 176, "LPO", "LPN")            # K = 2
hr("R27", "10k", 270, 176, "LPN", "GND!")
hc("C14", "100n", 250, 184, "LPA", "LPO")           # SK: C van a naar uit
# SK-LP: LPI -> R1(mux) -> LPA -> R2(mux) -> LPP(+); C14 a->uit, C15 +->GND
vc_gnd("C15", "100n", 290, 184, "LPP")
LOW_R = ("45k3", "26k7", "14k3", "7k15")            # 35/60/110/220 Hz, C=100n
s.component("Custom:ADG409", "U8", "ADG409", 330, 145, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(330, 145, 8,
         ["LOW_A0", "+3V3!", "-12V!", "RL1", "RL2", "RL3", "RL4", "LPA"],
         ["LOW_A1", "GND!", "+12V!", "RM1", "RM2", "RM3", "RM4", "LPP"])
for k, v in enumerate(LOW_R):
    hr(f"R{28+k}", v, 375, 132 + 8 * k, "LPI", f"RL{k+1}")
    hr(f"R{32+k}", v, 395, 132 + 8 * k, "LPA", f"RM{k+1}")
s.component("Custom:THAT2181", "U11", "THAT2181LC", 200, 160, 0, "Package_SIP:SIP8_Custom")
wire_box(200, 160, 4, ["GND!", "ECL", "GND!", "SYM1"], ["VCA1I", "+12V!", "N_L", "-12V!"], hw=7.62)
hr("R36", "100k", 230, 175, "SYM1", "GND!")         # symmetrie: trim-optie

# ================= MID-cel =================
# MFB-bandpass, R vast: R1=10k (in), R2=16k1 (naar GND), R3=20k (fb);
# C's geschakeld (2x ADG408, 6 van 8): 39n 20n 9n1 4n7 3n0 2n0
hr("R37", "10k", 250, 200, "CELL_L", "N_M")         # Rin
hr("R38", "10k", 270, 200, "N_M", "CELL_M")         # Rf
hr("R39", "2k", 250, 208, "BPO", "VCA2I")           # Rb
hr("R40", "10k", 250, 216, "BPI", "BPX")            # R1
hr("R41", "16k1", 270, 216, "BPX", "GND!")          # R2
hr("R42", "20k", 250, 224, "BPN", "BPO")            # R3 (feedback)
MID_C = ("39n", "20n", "9n1", "4n7", "3n0", "2n0")
s.component("Custom:ADG408", "U9", "ADG408", 330, 195, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(330, 195, 8,
         ["MID_A0", "+3V3!", "-12V!", "CA1", "CA2", "CA3", "CA4", "BPN"],
         ["MID_A1", "MID_A2", "GND!", "+12V!", "CA5", "CA6", None, None])
s.component("Custom:ADG408", "U10", "ADG408", 330, 245, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(330, 245, 8,
         ["MID_A0", "+3V3!", "-12V!", "CB1", "CB2", "CB3", "CB4", "BPO"],
         ["MID_A1", "MID_A2", "GND!", "+12V!", "CB5", "CB6", None, None])
for k, v in enumerate(MID_C):
    hc(f"C{16+k}", v, 375, 182 + 8 * k, "BPX", f"CA{k+1}")   # C1: knoop -> IN-
    hc(f"C{22+k}", v, 395, 182 + 8 * k, "BPX", f"CB{k+1}")   # C2: knoop -> uit
s.component("Custom:THAT2181", "U12", "THAT2181LC", 200, 200, 0, "Package_SIP:SIP8_Custom")
wire_box(200, 200, 4, ["GND!", "ECM", "GND!", "SYM2"], ["VCA2I", "+12V!", "N_M", "-12V!"], hw=7.62)
hr("R43", "100k", 230, 215, "SYM2", "GND!")

# ================= HIGH-cel =================
# 1e-orde HP 12 kHz vast: bron -> C28 1n -> HPI -> R44 13k3 -> GND; HPI -> Rb -> VCA3
hr("R45", "10k", 250, 240, "CELL_M", "N_H")         # Rin
hr("R46", "10k", 270, 240, "N_H", "CELL_H")         # Rf
hc("C28", "1n", 250, 248, "HII", "HPI")
hr("R44", "13k3", 270, 248, "HPI", "GND!")
hr("R47", "2k", 250, 256, "HPI", "VCA3I")           # Rb
s.component("Custom:THAT2181", "U13", "THAT2181LC", 200, 240, 0, "Package_SIP:SIP8_Custom")
wire_box(200, 240, 4, ["GND!", "ECH", "GND!", "SYM3"], ["VCA3I", "+12V!", "N_H", "-12V!"], hw=7.62)
hr("R48", "100k", 230, 255, "SYM3", "GND!")

# ================= SPDT's: boost/cut + HPF-bypass (2x ADG409) =================
# U14: A-helft (schakelt op A1=LOW_BC): S1A=S2A=celingang, S3A=S4A=celuitgang -> DA = LPI
#      B-helft (schakelt op A0=HI_BC ): S1B=S3B=celingang, S2B=S4B=celuitgang -> DB = HII
s.component("Custom:ADG409", "U14", "ADG409", 110, 230, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(110, 230, 8,
         ["HI_BC", "+3V3!", "-12V!", "HPFS", "HPFS", "CELL_L", "CELL_L", "LPI"],
         ["LOW_BC", "GND!", "+12V!", "CELL_M", "CELL_H", "CELL_M", "CELL_H", "HII"])
# U15: A-helft (A1=MID_BC): S1A=S2A=CELL_L (celingang), S3A=S4A=CELL_M -> DA = BPI
#      B-helft (A0=HPF_BYP): S1B=S3B=HPF1 (gefilterd), S2B=S4B=BUF1 (bypass) -> DB = HPFS
s.component("Custom:ADG409", "U15", "ADG409", 110, 280, 0, "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
wire_box(110, 280, 8,
         ["HPF_BYP", "+3V3!", "-12V!", "CELL_L", "CELL_L", "CELL_M", "CELL_M", "BPI"],
         ["MID_BC", "GND!", "+12V!", "HPF1", "BUF1", "HPF1", "BUF1", "HPFS"])
# HPF-ingang: BUF1 -> HPFI (altijd door het filter); de bypass-SPDT (U15-B)
# kiest de bron van de LOW-cel: HPFS = HPF1 (gefilterd) of BUF1 (rechtstreeks).
hr("R49", "0R", 260, 268, "BUF1", "HPFI")

# ================= ontkoppeling + flags =================
CAPS = [("C30", "100n", "+12V"), ("C31", "100n", "-12V"), ("C32", "100n", "+12V"),
        ("C33", "100n", "-12V"), ("C34", "100n", "+3V3"), ("C35", "100n", "+3V3"),
        ("C36", "100n", "+3V3"), ("C37", "10u", "+12V"), ("C38", "10u", "-12V"),
        ("C39", "10u", "+3V3")]
for k, (ref, val, r) in enumerate(CAPS):
    x = 40 + 16 * k
    lib = "Device:C_Polarized" if val == "10u" else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if val == "10u" else "Capacitor_SMD:C_0805_2012Metric")
    s.component(lib, ref, val, x, 250, 0, fp)
    s.wire(x, 246.19, x, 243.83); rail(r, x, 243.83)
    s.wire(x, 253.81, x, 256.17); rail("GND", x, 256.17)
for k, r in enumerate(("+12V", "-12V", "+3V3", "GND")):
    x1 = 40 + 14 * k
    s.wire(x1, 275, x1 + 5.08, 275); rail(r, x1, 275); s.flag(x1 + 5.08, 275)

s.text("CONSOLE EQ (concept 0.1c): mono kanaal-EQ, 1073-stijl. Audio analoog J2 IN -> UIT;\\n"
       "Brain: DAC128S085 (CS) = 3 gains, 2x 74HC595 (CS2 = IRQ-lijn, B4) = frequentiekeuze,\\n"
       "boost/cut per band en HPF-bypass. Cel = inverterende opamp + bandfilter via THAT2181 in\\n"
       "het sommeerknooppunt; SPDT kiest filterbron = celingang (boost) of celuitgang (cut).\\n"
       "Bitmap 595#1 QA..QH: HPF_A0 HPF_A1 HPF_BYP LOW_A0 LOW_A1 MID_A0 MID_A1 MID_A2;\\n"
       "595#2: LOW_BC MID_BC HI_BC + reserve. Front-knoppen: via pot8front/potriser (aparte slot),\\n"
       "de Brain sommeert. Mux/VCA-pinouts VERIFIEREN voor een PCB. Zie README.", 20, 20)
s.write(os.path.join(OUT_DIR, NAME + ".kicad_sch"))

# .kicad_pro (minimaal) + ERC + PDF
pro = os.path.join(OUT_DIR, NAME + ".kicad_pro")
if not os.path.exists(pro):
    open(pro, "w", encoding="utf-8").write('{"meta": {"filename": "%s.kicad_pro", "version": 1}, '
                                           '"schematic": {"legacy_lib_dir": "", "legacy_lib_list": []}}\n' % NAME)
sch = os.path.join(OUT_DIR, NAME + ".kicad_sch")
r = subprocess.run([KICAD_CLI, "sch", "erc", "--severity-error", "--exit-code-violations",
                    "-o", os.path.join(OUT_DIR, "erc.rpt"), sch], capture_output=True, text=True)
print("ERC exit", r.returncode, (r.stdout + r.stderr).strip()[-400:])
subprocess.run([KICAD_CLI, "sch", "export", "pdf", "-o", os.path.join(OUT_DIR, NAME + ".pdf"), sch],
               capture_output=True, text=True)
print("PDF", os.path.join(OUT_DIR, NAME + ".pdf"))
