"""MusicBrain COMP-KAART (concept, rev 0.1) - hybride compressor: analoog
gain-element, digitale detector op een sub-brain.

Conceptschema (geen PCB): hardware/schematics/concept/musicbrain-compkaart/.
Plan: doc/plans/analoge-fx-verkenning.md par. 4 (route C). Digitale
tegenhangers: mmb_dsp/{bus,fet,opto,diode}_comp.h.

Het audiopad is analoog: J2 IN -> buffer -> [gain-element] -> I/V -> buffer
-> J2 UIT. De detector is de mmb_dsp-kernel op een SUB-BRAIN-module (J4:
MCU met FPU, RP2350 of STM32G4 - keuze open, daarom een module-header met
benoemde signalen en geen chip-pinout). De module bemonstert het audio
(ADC, 12 bit volstaat voor een detector), rekent attack/release/knie en
stuurt het gain-element via zijn eigen DAC: de lus blijft op de kaart
(microseconden), de Brain praat alleen parameters + status over CS2 (= IRQ-
lijn, poly-analog-spec B2/B4). MISO tri-state via 74LVC1G125 (gatein8).

Gain-element = dochterprint op J5 (1x8): variant A (THAT2181-VCA) staat
hier uitgetekend; FET en opto zijn dezelfde socket met een ander printje
(zie README). CV-contract J5: 0..3V3 uit de module -> op de dochterprint
geschaald naar wat het element wil.

Front: J2 audio (1 GND, 2 IN, 3 UIT, 4 GR-CV uit = de `gr`-poort, 10 GND),
J3 vier potmeters (wipers 0..3V3 naar de module-ADC: threshold, ratio,
attack, release) - touch; de module meldt ze aan de Brain (B9).
"""
import os
import sys
import subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from kicadcli import KICAD_CLI
import bus

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\concept\musicbrain-compkaart"
os.makedirs(OUT_DIR, exist_ok=True)
NAME = "musicbrain-compkaart"
DATE = "2026-09-24"
REV = "0.1c"

# CS blijft vrij (geen 'dom' DAC-snelpad in deze rev; B2-optie voor later)
GEBRUIKT = {'GND', '+12V', '-12V', '+3V3', '/SCLK', '/MOSI', '/MISO', '/IRQ'}

TL_L = [("1", "OUT1", "output"), ("2", "IN1-", "input"), ("3", "IN1+", "input"),
        ("4", "V+", "power_in"), ("5", "IN2+", "input"), ("6", "IN2-", "input"),
        ("7", "OUT2", "output")]
TL_R = [("14", "OUT4", "output"), ("13", "IN4-", "input"), ("12", "IN4+", "input"),
        ("11", "V-", "power_in"), ("10", "IN3+", "input"), ("9", "IN3-", "input"),
        ("8", "OUT3", "output")]
VCA_L = [("1", "Ec+", "input"), ("2", "Ec-", "input"), ("3", "GND", "power_in"),
         ("4", "SYM", "input")]
VCA_R = [("8", "IN", "input"), ("7", "V+", "power_in"), ("6", "OUT", "output"),
         ("5", "V-", "power_in")]
# 74LVC1G125 SOT-23-5: 1 OE 2 A 3 GND 4 Y 5 VCC
BUF_L = [("1", "~{OE}", "input"), ("2", "A", "input"), ("3", "GND", "power_in")]
BUF_R = [("5", "VCC", "power_in"), ("4", "Y", "tri_state")]
# Sub-brain-module (2x10 socket): benoemde signalen, MCU-keuze open
SUB_L = [("1", "GND", "power_in"), ("3", "SCK", "input"), ("5", "MOSI", "input"),
         ("7", "DAC_CV", "output"), ("9", "ADC_AUDIO", "input"), ("11", "ADC_P2", "input"),
         ("13", "ADC_P4", "input"), ("15", "UART_TX", "output"), ("17", "SWDIO", "bidirectional"),
         ("19", "NRST", "input")]
SUB_R = [("2", "+3V3", "power_in"), ("4", "MISO", "output"), ("6", "CS2", "input"),
         ("8", "DAC_GR", "output"), ("10", "ADC_P1", "input"), ("12", "ADC_P3", "input"),
         ("14", "GPIO_LED", "output"), ("16", "UART_RX", "input"), ("18", "SWCLK", "input"),
         ("20", "GND", "power_in")]
# Gain-element-socket J5 (1x8): 1 GND 2 +12V 3 -12V 4 AUD_IN 5 AUD_OUT 6 CV 7 SPARE 8 GND
GE_L = [("1", "GND", "power_in"), ("2", "+12V", "power_in"), ("3", "-12V", "power_in"),
        ("4", "AUD_IN", "input"), ("5", "AUD_OUT", "output"), ("6", "CV", "input"),
        ("7", "SPARE", "passive"), ("8", "GND", "power_in")]
# Dochter-header (op de dochterprint): alle pinnen passief, want daar zijn de
# richtingen omgekeerd t.o.v. de moeder-socket (ERC).
GE_P = [(n, nm, "passive") for (n, nm, _) in GE_L]
LED_L = [("1", "K", "passive")]
LED_R = [("2", "A", "passive")]

s = Sch("c0e40000-0000-4000-8000-000000000002", NAME,
        "MusicBrain COMP-KAART - hybride compressor: analoog gain-element, digitale detector (concept)",
        REV, DATE,
        ("CONCEPT: schema zonder PCB. Slot 2x12, busvoeding; audio analoog J2 IN->UIT",
         "Detector = mmb_dsp-kernel op SUB-BRAIN-module J4 (RP2350/STM32G4, keuze open); Brain: parameters over CS2=IRQ",
         "Gain-element op dochter-socket J5: variant A = THAT2181-VCA (getekend), B = FET, C = opto"))
s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
           conn_symbol("Conn_02x12", 12), conn1_symbol("Conn_01x10", 10),
           box_symbol("TL074", TL_L, TL_R),
           box_symbol("THAT2181", VCA_L, VCA_R, width=15.24),
           box_symbol("74LVC1G125", BUF_L, BUF_R, width=15.24),
           box_symbol("SUBBRAIN_2x10", SUB_L, SUB_R, width=25.4),
           box_symbol("GAINELEMENT_1x8", GE_L, [], width=20.32),
           box_symbol("GAINELEMENT_1x8_D", GE_P, [], width=20.32),
           box_symbol("LED", LED_L, LED_R, width=7.62),
           power_symbol("GND", False), power_symbol("+3V3", True),
           power_symbol("+12V", True), power_symbol("-12V", False)]


def rail(net, x, y):
    s.power(f"power:{net}", x, y, 0, vx=x,
            vy=(y + 3.81 if net in ("GND", "-12V") else y - 3.302))


def wire_box(ux, uy, rows, L, R, hw=8.89):
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
    s.component(lib, ref, val, x, y, 90, fp)
    for side, nm in ((-1, west), (1, oost)):
        xp, xe = x + side * 3.81, x + side * 7.62
        s.wire(xp, y, xe, y)
        rail(nm[:-1], xe, y) if nm.endswith("!") else s.label(nm, xe, y)


def hc(ref, val, x, y, west, oost):
    hr(ref, val, x, y, west, oost, "Device:C", "Capacitor_SMD:C_0805_2012Metric")


def vc_gnd(ref, val, x, y, top):
    s.component("Device:C", ref, val, x, y, 0, "Capacitor_SMD:C_0805_2012Metric")
    s.wire(x, y - 3.81, x, y - 6.17); s.label(top, x, y - 6.17)
    s.wire(x, y + 3.81, x, y + 6.17); rail("GND", x, y + 6.17)


def conn10(ref, name, x, y, pins):
    s.component("Custom:Conn_01x10", ref, name, x, y, 0, bus.HDR_PANEEL[1])
    for k, nm in enumerate(pins):
        yy = y - 11.43 + 2.54 * k
        xp, xe = x - 7.62, x - 12.7
        if nm is None:
            s.nc(xp, yy)
        else:
            s.wire(xp, yy, xe, yy)
            rail(nm[:-1], xe, yy) if nm.endswith("!") else s.label(nm, xe, yy)


# ================= J1 bus =================
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

# J2 audio-front, J3 pot-front
conn10("J2", "AUDIO (front)", 40, 110,
       ["GND!", "AIN", "AOUT", "GRCV", None, None, None, None, None, "GND!"])
conn10("J3", "POTS (front)", 40, 150,
       ["GND!", "P1", "P2", "P3", "P4", "+3V3!", None, None, None, "GND!"])

# ================= SUB-BRAIN-module J4 =================
s.component("Custom:SUBBRAIN_2x10", "J4", "SUB-BRAIN (RP2350 / STM32G4-module)", 130, 70, 0,
            "Connector_PinSocket_2.54mm:PinSocket_2x10_P2.54mm_Vertical")
wire_box(130, 70, 10,
         ["GND!", "SCLK", "MOSI", "DACCV", "ADCA", "P2F", "P4F", None, "SWDIO", "NRST"],
         ["+3V3!", "MISOM", "CS2", "DACGR", "P1F", "P3F", "LEDG", None, "SWCLK", "GND!"],
         hw=12.7)
# MISO tri-state: module-MISO -> 1G125 (OE = CS2, actief laag) -> bus-MISO
s.component("Custom:74LVC1G125", "U3", "74LVC1G125", 130, 125, 0,
            "Package_TO_SOT_SMD:SOT-23-5")
wire_box(130, 125, 3, ["CS2", "MISOM", "GND!"], ["+3V3!", "MISO"], hw=7.62)
# SWD/NRST-header (1x4: SWDIO SWCLK NRST GND) - debug
s.component("Custom:Conn_01x10", "J6", "SWD (1x4 gebruikt)", 40, 200, 0,
            "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical")
conn10_pins = ["SWDIO", "SWCLK", "NRST", "GND!", None, None, None, None, None, None]
for k, nm in enumerate(conn10_pins):
    yy = 200 - 11.43 + 2.54 * k
    xp, xe = 40 - 7.62, 40 - 12.7
    if nm is None:
        s.nc(xp, yy)
    else:
        s.wire(xp, yy, xe, yy)
        rail(nm[:-1], xe, yy) if nm.endswith("!") else s.label(nm, xe, yy)
hr("R1", "10k", 95, 200, "NRST", "+3V3!")           # pull-up reset
# pots: RC naar de ADC (1k + 100n), wipers 0..3V3 van het front
for k in range(1, 5):
    y = 150 + 10 * (k - 1)
    hr(f"R{1+k}", "1k", 95, y, f"P{k}", f"P{k}F")
    vc_gnd(f"C{k}", "100n", 110, y + 5, f"P{k}F")
# LED: GPIO -> 1k -> LED -> GND (gain-reduction-indicatie)
hr("R6", "1k", 95, 195, "LEDG", "LEDA")
s.component("Custom:LED", "D1", "LED groen", 115, 195, 0, "LED_SMD:LED_0805_2012Metric")
s.wire(115 - 6.35, 195, 115 - 8.89, 195); rail("GND", 115 - 8.89, 195)
s.wire(115 + 6.35, 195, 115 + 8.89, 195); s.label("LEDA", 115 + 8.89, 195)

# ================= audio =================
# U1: 1 in-buffer, 2 detector-conditionering, 3 I/V na gain-element, 4 uit-buffer
s.component("Custom:TL074", "U1", "TL074", 220, 60, 0, "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
wire_box(220, 60, 7,
         ["BUFI", "BUFI", "AIN", "+12V!", "VBIAS", "DETN", "DETO"],
         ["BUFO", "BUFO", "GOUT", "-12V!", "GND!", "IVN", "GOUT"])
hr("R7", "100k", 270, 40, "AIN", "GND!")             # ingangsreferentie
hr("R8", "220R", 270, 48, "BUFO", "AOUT")            # serie-uit
# detector-conditionering: Vout = 1,65 - 0,3.Vin (+/-5 V -> 0,15..3,15 V)
#   inverterend Rf/R1 = 10k/33k met IN+ op 1,27 V (16k/10k van 3V3)
hr("R9", "33k", 270, 60, "BUFI", "DETN")
hr("R10", "10k", 270, 68, "DETN", "DETO")
hr("R11", "16k", 270, 76, "+3V3!", "VBIAS")
hr("R12", "10k", 270, 84, "VBIAS", "GND!")
vc_gnd("C5", "1u", 300, 79, "VBIAS")
hr("R13", "1k", 270, 92, "DETO", "ADCA")             # serie + clamp op de ADC-pin
vc_gnd("C6", "1n", 300, 95, "ADCA")
# I/V na het gain-element: J5 AUD_OUT (stroom) -> IVN (virtuele massa), 20k || 100p
hr("R14", "20k", 270, 104, "IVN", "GOUT")
hc("C7", "100p", 270, 112, "IVN", "GOUT")
# gain-element-socket J5: AUD_IN krijgt BUFI via 20k (stroomingang voor de VCA)
s.component("Custom:GAINELEMENT_1x8", "J5", "GAIN-ELEMENT (dochter 1x8)", 220, 140, 0,
            "Connector_PinSocket_2.54mm:PinSocket_1x08_P2.54mm_Vertical")
wire_box(220, 140, 8, ["GND!", "+12V!", "-12V!", "GEIN", "IVN", "GECV", None, "GND!"], [], hw=10.16)
hr("R15", "20k", 270, 128, "BUFI", "GEIN")
# CV naar het element: module-DAC 0..3V3 -> RC-slew (100R/1u) -> J5 CV
hr("R16", "100R", 270, 136, "DACCV", "GECV")
vc_gnd("C8", "1u", 300, 139, "GECV")
# GR-meter-CV naar het front (de `gr`-poort): DAC_GR -> buffer U2a -> 1k -> J2 pin 4
s.component("Custom:TL074", "U2", "TL074", 220, 200, 0, "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
wire_box(220, 200, 7,
         ["GRB", "GRB", "DACGR", "+12V!", "GND!", "U2B", "U2B"],
         ["U2D", "U2D", "GND!", "-12V!", "GND!", "U2C", "U2C"])
hr("R17", "1k", 270, 180, "GRB", "GRCV")

# ================= dochter variant A: THAT2181 (op J5 gestoken) =================
# Getekend als los blok met eigen labels (GE_*), niet verbonden met J5:
# het is een aparte print. CV-contract: 0..3V3 -> 10k/1k -> Ec- 0..0,3 V.
s.component("Custom:THAT2181", "U4", "THAT2181LC (dochter A)", 360, 60, 0, "Package_SIP:SIP8_Custom")
wire_box(360, 60, 4, ["GND!", "GE_EC", "GND!", "GE_SYM"], ["GE_AUDIN", "+12V!", "GE_AUDOUT", "-12V!"], hw=7.62)
hr("R18", "10k", 400, 40, "GE_CV", "GE_EC")
hr("R19", "1k", 400, 48, "GE_EC", "GND!")
vc_gnd("C9", "100n", 425, 51, "GE_EC")
hr("R20", "100k", 400, 56, "GE_SYM", "GND!")
s.component("Custom:GAINELEMENT_1x8_D", "J7", "dochter A: pinheader 1x8", 360, 120, 0,
            "Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical")
wire_box(360, 120, 8, ["GND!", "+12V!", "-12V!", "GE_AUDIN", "GE_AUDOUT", "GE_CV", None, "GND!"], [], hw=10.16)
s.text("Dochter B (FET): 2N5457 als regelbare weerstand in een spanningsdeler + lokale feedback-trim,\\n"
       "CV via opamp geschaald naar de pinch-off (kalibratietabel in de module).\\n"
       "Dochter C (opto): LED + NSL-32 (of Vactrol) als verzwakker; CV via V->I naar de LED.\\n"
       "Zelfde 1x8-contract: GND +12 -12 AUD_IN AUD_OUT CV SPARE GND.", 330, 150)

# ================= ontkoppeling + flags =================
CAPS = [("C10", "100n", "+12V"), ("C11", "100n", "-12V"), ("C12", "100n", "+12V"),
        ("C13", "100n", "-12V"), ("C14", "100n", "+3V3"), ("C15", "100n", "+3V3"),
        ("C16", "10u", "+12V"), ("C17", "10u", "-12V"), ("C18", "10u", "+3V3")]
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

s.text("COMP-KAART (concept 0.1c): audio analoog J2 IN -> buffer -> gain-element (dochter J5) -> I/V\\n"
       "-> buffer -> J2 UIT. Detector = mmb_dsp-kernel op de SUB-BRAIN-module (J4): ADC_AUDIO meet het\\n"
       "ingangssignaal (1,65 V - 0,3.Vin), DAC_CV stuurt het element, DAC_GR levert de gr-CV (J2 pin 4).\\n"
       "Brain: parameters/status over CS2 (= IRQ-lijn, B2/B4); MISO tri-state (1G125). Pots P1-P4 op\\n"
       "J3 -> module-ADC (touch, B9). CS/LDAC ongebruikt in deze rev. MCU-keuze open (RP2350/STM32G4):\\n"
       "daarom een module-header met benoemde signalen. THAT2181-pinout verifieren voor een PCB.", 20, 20)
s.write(os.path.join(OUT_DIR, NAME + ".kicad_sch"))

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
