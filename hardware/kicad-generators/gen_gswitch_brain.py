"""Guitar Effect Switcher BRAIN - ESP32-S3-hoofdbord (sch + PCB).

Spec: doc/guitar-switcher-spec.md. ESP32-S3-WROOM-1U (U.FL -> SMA-pigtail),
12V center-negatief in (omkeer-P-FET + polyfuse + TVS), buck 12->5V
(TPS563201), AMS1117-3.3, USB-C (native USB, dev-voeding via SS34),
MIDI-DIN in (H11L1) + uit (HCT14-buffer), 2x chain-poort (74HCT541 -> RJ45,
DRET terug via spanningsdeler), headers voor 2,42" OLED / 4 knoppen /
encoder / spare-GPIO / debug-UART.

Handroutes: 12V-pad, buck-cel, 5V/3V3-spines. Rest: freerouting
(gswitch_dsn_prep.py, zonder keepout) -> seslib.apply_ses (SES_FILE).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, box_symbol, R_SYM, C_SYM, CP_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board, fmt, rotxy
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\gswitch-brain"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-12"
REV = "0.1"
NAME = "gswitch-brain"
TITLE = "GSwitch BRAIN - ESP32-S3 hoofdbord"
SES_FILE = os.path.join(OUT_DIR, NAME + ".ses")

BX0, BY0, BX1, BY1 = 100.0, 100.0, 200.0, 170.0

# ---------- schema ----------
s = Sch("6b0a1000-0000-4000-8000-000000000000", NAME, TITLE, REV, DATE,
        ("ESP32-S3-WROOM-1U (U.FL!) - antenne via SMA-bulkhead op de kast",
         "12V center-NEGATIEF (pedaalconventie); USB-C alleen dev/flash",
         "spec: doc/guitar-switcher-spec.md"))

# ESP32-S3-WROOM-1U pinnen (module-pinout, EP=41)
ESP_L = [("1", "GND", "power_in"), ("2", "3V3", "power_in"),
         ("3", "EN", "input"), ("4", "IO4", "bidirectional"),
         ("5", "IO5", "bidirectional"), ("6", "IO6", "bidirectional"),
         ("7", "IO7", "bidirectional"), ("8", "IO15", "bidirectional"),
         ("9", "IO16", "bidirectional"), ("10", "IO17", "bidirectional"),
         ("11", "IO18", "bidirectional"), ("12", "IO8", "bidirectional"),
         ("13", "IO19_D-", "bidirectional"), ("14", "IO20_D+", "bidirectional"),
         ("15", "IO3", "bidirectional"), ("16", "IO46", "bidirectional"),
         ("17", "IO9", "bidirectional"), ("18", "IO10", "bidirectional"),
         ("19", "IO11", "bidirectional"), ("20", "IO12", "bidirectional"),
         ("21", "IO13", "bidirectional")]
ESP_R = [("41", "EP", "power_in"), ("40", "GND", "power_in"),
         ("39", "IO1", "bidirectional"), ("38", "IO2", "bidirectional"),
         ("37", "RXD0", "bidirectional"), ("36", "TXD0", "bidirectional"),
         ("35", "IO42", "bidirectional"), ("34", "IO41", "bidirectional"),
         ("33", "IO40", "bidirectional"), ("32", "IO39", "bidirectional"),
         ("31", "IO38", "bidirectional"), ("30", "IO37", "bidirectional"),
         ("29", "IO36", "bidirectional"), ("28", "IO35", "bidirectional"),
         ("27", "IO0", "bidirectional"), ("26", "IO45", "bidirectional"),
         ("25", "IO48", "bidirectional"), ("24", "IO47", "bidirectional"),
         ("23", "IO21", "bidirectional"), ("22", "IO14", "bidirectional")]
HCT541_L = [("1", "~{OE1}", "input"), ("2", "A1", "input"), ("3", "A2", "input"),
            ("4", "A3", "input"), ("5", "A4", "input"), ("6", "A5", "input"),
            ("7", "A6", "input"), ("8", "A7", "input"), ("9", "A8", "input"),
            ("10", "GND", "power_in")]
HCT541_R = [("20", "VCC", "power_in"), ("19", "~{OE2}", "input"),
            ("18", "Y1", "tri_state"), ("17", "Y2", "tri_state"),
            ("16", "Y3", "tri_state"), ("15", "Y4", "tri_state"),
            ("14", "Y5", "tri_state"), ("13", "Y6", "tri_state"),
            ("12", "Y7", "tri_state"), ("11", "Y8", "tri_state")]
HC14_L = [("1", "1A", "input"), ("2", "1Y", "output"), ("3", "2A", "input"),
          ("4", "2Y", "output"), ("5", "3A", "input"), ("6", "3Y", "output"),
          ("7", "GND", "power_in")]
HC14_R = [("14", "VCC", "power_in"), ("13", "6A", "input"), ("12", "6Y", "output"),
          ("11", "5A", "input"), ("10", "5Y", "output"), ("9", "4A", "input"),
          ("8", "4Y", "output")]
H11L1_L = [("1", "A", "passive"), ("2", "K", "passive"), ("3", "NC", "passive")]
H11L1_R = [("6", "VCC", "power_in"), ("5", "GND", "power_in"),
           ("4", "VO", "output")]
TPS_L = [("3", "VIN", "power_in"), ("5", "EN", "input"), ("1", "GND", "power_in")]
TPS_R = [("6", "VBST", "passive"), ("2", "SW", "passive"), ("4", "VFB", "input")]
AMS_L = [("3", "VIN", "power_in"), ("1", "GND", "power_in")]
AMS_R = [("2", "VOUT", "power_out")]
PFET_L = [("1", "G", "input"), ("2", "S", "passive")]
PFET_R = [("3", "D", "passive")]
DIODE_L = [("1", "K", "passive")]
DIODE_R = [("2", "A", "passive")]
FUSE_L = [("1", "1", "passive")]
FUSE_R = [("2", "2", "passive")]
DIN5_L = [("4", "P4", "passive"), ("5", "P5", "passive"), ("2", "P2", "passive")]
DIN5_R = [("1", "P1", "passive"), ("3", "P3", "passive"), ("E", "EARTH", "passive")]
RJ45_L = [(str(p), f"P{p}", "passive") for p in range(1, 9)]
RJ45_R = [("SH", "SHIELD", "passive")]
USBC_L = [("A1", "GND", "passive"), ("A12", "GND", "passive"),
          ("A4", "VBUS", "passive"), ("A9", "VBUS", "passive"),
          ("A5", "CC1", "passive"), ("A6", "D+", "passive"),
          ("A7", "D-", "passive"), ("A8", "SBU1", "passive")]
USBC_R = [("B1", "GND", "passive"), ("B12", "GND", "passive"),
          ("B4", "VBUS", "passive"), ("B9", "VBUS", "passive"),
          ("B5", "CC2", "passive"), ("B6", "D+", "passive"),
          ("B7", "D-", "passive"), ("B8", "SBU2", "passive"),
          ("SH", "SHIELD", "passive")]
L_SYM = '''    (symbol "Device:L"
      (pin_names (offset 0)) (pin_numbers (hide yes))
      (property "Reference" "L" (at 1.016 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "L" (at -1.016 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "L_0_1"
        (arc (start 0 -2.54) (mid 0.635 -1.905) (end 0 -1.27) (stroke (width 0) (type default)) (fill (type none)))
        (arc (start 0 -1.27) (mid 0.635 -0.635) (end 0 0) (stroke (width 0) (type default)) (fill (type none)))
        (arc (start 0 0) (mid 0.635 0.635) (end 0 1.27) (stroke (width 0) (type default)) (fill (type none)))
        (arc (start 0 1.27) (mid 0.635 1.905) (end 0 2.54) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "L_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 0 -3.81 90) (length 1.27)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )'''
BARREL_L = [("1", "CENTER", "passive")]
BARREL_R = [("2", "SLEEVE", "passive"), ("3", "SWITCH", "passive")]
SW_L = [("1", "1", "passive")]
SW_R = [("2", "2", "passive")]
LED_L = [("1", "K", "passive")]
LED_R = [("2", "A", "passive")]
MHOLE_SYM = '''    (symbol "Custom:MHole"
      (pin_names (offset 0) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "H" (at 0 2.54 0) (effects (font (size 1.27 1.27))))
      (property "Value" "M3" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "MHole_0_1"
        (circle (center 0 0) (radius 1.27) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "MHole_1_1"
        (pin passive line (at -2.54 0 0) (length 2.54)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''

s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM, MHOLE_SYM, L_SYM,
           box_symbol("ESP32-S3-WROOM-1U", ESP_L, ESP_R, width=25.4),
           box_symbol("74HCT541", HCT541_L, HCT541_R),
           box_symbol("74HCT14", HC14_L, HC14_R),
           box_symbol("H11L1", H11L1_L, H11L1_R),
           box_symbol("TPS563201", TPS_L, TPS_R),
           box_symbol("AMS1117-33", AMS_L, AMS_R),
           box_symbol("PFET", PFET_L, PFET_R),
           box_symbol("DIODE", DIODE_L, DIODE_R),
           box_symbol("FUSE", FUSE_L, FUSE_R),
           box_symbol("DIN5", DIN5_L, DIN5_R),
           box_symbol("RJ45_S", RJ45_L, RJ45_R),
           box_symbol("USBC16", USBC_L, USBC_R),
           box_symbol("BARREL", BARREL_L, BARREL_R),
           box_symbol("SW_TACT", SW_L, SW_R),
           box_symbol("LED", LED_L, LED_R),
           conn_symbol("Conn_02x04", 4),
           power_symbol("GND", False), power_symbol("+12V", True),
           power_symbol("+5V", True), power_symbol("+3V3", True)]

PWR = ("GND", "+12V", "+5V", "+3V3")

def sbox(ref, sym, x, y, left, right, fp, width=17.78):
    s.component(f"Custom:{sym}", ref, sym, x, y, 0, fp)
    rows = max(len(left), len(right))
    hw = width / 2
    for side, ent in (("L", left), ("R", right)):
        for k, nm in enumerate(ent):
            y_p = y - (rows - 1) * 1.27 + 2.54 * k
            if side == "L":
                x_p, x_e = x - (hw + 2.54), x - (hw + 2.54) - 3.81
            else:
                x_p, x_e = x + (hw + 2.54), x + (hw + 2.54) + 3.81
            if nm is None:
                s.nc(x_p, y_p)
            elif nm in PWR:
                s.wire(x_p, y_p, x_e, y_p)
                s.power(f"power:{nm}", x_e, y_p, 0,
                        vx=x_e, vy=(y_p + 3.81 if nm == "GND" else y_p - 3.302))
            else:
                s.wire(x_p, y_p, x_e, y_p)
                s.label(nm, x_e, y_p)

def sR(ref, val, x, y, n1, n2, fp="Resistor_SMD:R_0805_2012Metric",
       lib="Device:R"):
    s.component(lib, ref, val, x, y, 0, fp)
    for nm, yy, ye in ((n1, y - 3.81, y - 6.35), (n2, y + 3.81, y + 6.35)):
        s.wire(x, yy, x, ye)
        if nm in PWR:
            s.power(f"power:{nm}", x, ye, 0,
                    vx=x, vy=(ye + 3.81 if nm == "GND" else ye - 3.302))
        else:
            s.label(nm, x, ye)

# --- ESP32-module (midden) ---
sbox("U1", "ESP32-S3-WROOM-1U", 60, 120,
     ["GND", "+3V3", "ESP_EN", "A_CLK", "A_DATA", "A_LATCH", "A_EN",
      "B_CLK", "B_DATA", "B_LATCH", "B_EN", "DRET_A", "USB_DM", "USB_DP",
      None, None, "DRET_B", "SDA", "MIDI_RX", "MIDI_TX", "SCL"],
     ["GND", "GND", "SPARE6", "SPARE5", "DBG_RX", "DBG_TX", "LEDK_A",
      "ENC_SW", "ENC_B", "ENC_A", "BTN4", "BTN3", "BTN2", "BTN1",
      "BOOT", None, "SPARE4", "SPARE3", "SPARE2", "SPARE1"],
     "RF_Module:ESP32-S3-WROOM-1U", width=25.4)

# --- voeding ---
sbox("J1", "BARREL", 150, 55, ["GND"], ["+12VRAW", None],
     "Connector_BarrelJack:BarrelJack_CUI_PJ-102AH_Horizontal")
sbox("F1", "FUSE", 150, 70, ["+12VRAW"], ["RAWF"],
     "Fuse:Fuse_1206_3216Metric")
sbox("Q1", "PFET", 150, 85, ["GND", "+12V"], ["RAWF"],
     "Package_TO_SOT_SMD:SOT-23")
sbox("D1", "DIODE", 150, 100, ["+12V"], ["GND"], "Diode_SMD:D_SMA")
sbox("U6", "TPS563201", 195, 60, ["+12V", "BCK_EN", "GND"],
     ["BST", "SW", "FB"], "Package_TO_SOT_SMD:SOT-23-6")
s.component("Device:C", "C3", "100n", 222, 53, 0,
            "Capacitor_SMD:C_0805_2012Metric")
s.wire(222, 49.19, 222, 46.5); s.label("BST", 222, 46.5)
s.wire(222, 56.81, 222, 59.5); s.label("SW", 222, 59.5)
s.component("Device:L", "L1", "4u7", 232, 63, 0,
            "Inductor_SMD:L_Bourns-SRN4018")
s.wire(232, 59.19, 232, 56.5); s.label("SW", 232, 56.5)
s.wire(232, 66.81, 232, 69.5); s.power("power:+5V", 232, 69.5, 0,
                                        vx=232, vy=69.5 - 3.302)
sR("R1", "56k", 243, 60, "+5V", "FB")
sR("R2", "10k", 243, 76, "FB", "GND")
sR("R3", "100k", 254, 60, "+12V", "BCK_EN")
sR("R4", "33k", 254, 76, "BCK_EN", "GND")
sR("C1", "10u", 265, 60, "+12V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C2", "100n", 276, 60, "+12V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C4", "22u", 265, 76, "+5V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C5", "22u", 276, 76, "+5V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sbox("U5", "AMS1117-33", 195, 82, ["+5V", "GND"], ["+3V3"],
     "Package_TO_SOT_SMD:SOT-223-3_TabPin2")
sR("C6", "22u", 287, 60, "+3V3", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C7", "100n", 287, 76, "+3V3", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C8", "22u", 298, 60, "+3V3", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C9", "100n", 298, 76, "+3V3", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")

# --- USB-C ---
sbox("J2", "USBC16", 150, 125,
     ["GND", "GND", "VBUS", "VBUS", "CC1", "USB_DP", "USB_DM", None],
     ["GND", "GND", "VBUS", "VBUS", "CC2", "USB_DP", "USB_DM", None, "GND"],
     "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12")
sbox("D2", "DIODE", 150, 145, ["+5V"], ["VBUS"], "Diode_SMD:D_SMA")
sR("R25", "5k1", 175, 145, "CC1", "GND")
sR("R26", "5k1", 186, 145, "CC2", "GND")

# --- module-randspul: EN-RC, knoppen, LED ---
sR("R5", "10k", 20, 55, "+3V3", "ESP_EN")
sR("C10", "1u", 31, 55, "ESP_EN", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sbox("SW1", "SW_TACT", 20, 72, ["ESP_EN"], ["GND"],
     "Button_Switch_SMD:SW_SPST_SKQG_WithStem")
sbox("SW2", "SW_TACT", 20, 85, ["BOOT"], ["GND"],
     "Button_Switch_SMD:SW_SPST_SKQG_WithStem")
sR("R6", "1k", 45, 55, "LEDK_A", "LEDK")
sbox("D4", "LED", 45, 72, ["GND"], ["LEDK"],
     "LED_SMD:LED_0805_2012Metric")
sR("R7", "4k7", 100, 55, "+3V3", "SDA")
sR("R8", "4k7", 111, 55, "+3V3", "SCL")

# --- MIDI ---
sbox("J4", "DIN5", 240, 110, ["MIN4", "MIN5", None], [None, None, "GND"],
     "GSwitch:DIN5_SDS50J")
sR("R11", "220R", 265, 105, "MIN4", "MINA")
sbox("D3", "DIODE", 265, 122, ["MINA"], ["MIN5"], "Diode_SMD:D_SOD-123")
sbox("U4", "H11L1", 292, 110, ["MINA", "MIN5", None],
     ["+3V3", "GND", "MIDI_RX"], "Package_DIP:DIP-6_W7.62mm")
sR("R12", "1k", 315, 105, "+3V3", "MIDI_RX")
sR("C11", "100n", 326, 105, "+3V3", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sbox("U3", "74HCT14", 240, 145, ["MIDI_TX", "MTXN", "MTXN", "MTX5",
                                 "GND", None, "GND"],
     ["+5V", "GND", None, "GND", None, "GND", None],
     "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
sR("R9", "220R", 268, 140, "MTX5", "MOUT5")
sR("R10", "220R", 279, 140, "+5V", "MOUT4")
sbox("J3", "DIN5", 300, 145, ["MOUT4", "MOUT5", "GND"], [None, None, "GND"],
     "GSwitch:DIN5_SDS50J")
sR("C13", "100n", 326, 140, "+5V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")

# --- chain-poorten ---
sbox("U2", "74HCT541", 60, 190,
     ["GND", "A_CLK", "A_DATA", "A_LATCH", "A_EN", "B_CLK", "B_DATA",
      "B_LATCH", "B_EN", "GND"],
     ["+5V", "GND", "A_CLK5", "A_DATA5", "A_LATCH5", "A_EN5", "B_CLK5",
      "B_DATA5", "B_LATCH5", "B_EN5"],
     "Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm")
sR("C12", "100n", 95, 180, "+5V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
SER8 = [("R13", "A_CLK5", "A_CLKJ"), ("R14", "A_DATA5", "A_DATAJ"),
        ("R15", "A_LATCH5", "A_LATCHJ"), ("R16", "A_EN5", "A_ENJ"),
        ("R17", "B_CLK5", "B_CLKJ"), ("R18", "B_DATA5", "B_DATAJ"),
        ("R19", "B_LATCH5", "B_LATCHJ"), ("R20", "B_EN5", "B_ENJ")]
for j, (ref, n1, n2) in enumerate(SER8):
    sR(ref, "100R", 20 + 11 * j, 220, n1, n2)
sR("R21", "10k", 130, 220, "A_DRETJ", "DRET_A")
sR("R23", "15k", 141, 220, "DRET_A", "GND")
sR("R22", "10k", 158, 220, "B_DRETJ", "DRET_B")
sR("R24", "15k", 169, 220, "DRET_B", "GND")
sbox("J10", "RJ45_S", 105, 190,
     ["A_CLKJ", "GND", "A_DATAJ", "+12V", "GND", "A_DRETJ", "A_LATCHJ",
      "A_ENJ"], ["GND"], "GSwitch:RJ45_shielded")
sbox("J11", "RJ45_S", 150, 190,
     ["B_CLKJ", "GND", "B_DATAJ", "+12V", "GND", "B_DRETJ", "B_LATCHJ",
      "B_ENJ"], ["GND"], "GSwitch:RJ45_shielded")

# --- headers ---
def hdr1xn(ref, val, x, y, nets):
    n = len(nets)
    name = f"Conn_01x{n:02d}"
    if name not in hdr1xn.done:
        hdr1xn.done.add(name)
        s.libs.append(_conn1(name, n))
    s.component(f"Custom:{name}", ref, val, x, y, 0,
                f"Connector_PinHeader_2.54mm:PinHeader_1x{n:02d}_P2.54mm_Vertical")
    top = (n - 1) * 1.27
    for k, nm in enumerate(nets):
        yy = y - top + 2.54 * k
        s.wire(x - 2.54, yy, x - 6.35, yy)
        if nm in PWR:
            s.power(f"power:{nm}", x - 6.35, yy, 0,
                    vx=x - 6.35, vy=(yy + 3.81 if nm == "GND" else yy - 3.302))
        else:
            s.label(nm, x - 6.35, yy)
hdr1xn.done = set()

def _conn1(name, rows):
    top = (rows - 1) * 1.27
    pins = "\n".join(f'''        (pin passive line (at -2.54 {fmt(top - 2.54 * k)} 0) (length 1.27)
          (name "Pin_{k+1}" (effects (font (size 1.27 1.27))))
          (number "{k+1}" (effects (font (size 1.0 1.0)))))''' for k in range(rows))
    return f'''    (symbol "Custom:{name}"
      (pin_names (offset 1.016) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "J" (at 0 {fmt(top + 3.81)} 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Conn" (at 0 -{fmt(top + 3.81)} 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "{name}_0_1"
        (rectangle (start -1.27 {fmt(top + 1.27)}) (end 0 -{fmt(top + 1.27)})
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "{name}_1_1"
{pins}
      )
    )'''

hdr1xn("J5", "OLED-I2C", 330, 55, ["GND", "+3V3", "SCL", "SDA"])
hdr1xn("J6", "KNOPPEN", 330, 75, ["BTN1", "BTN2", "BTN3", "BTN4", "GND"])
hdr1xn("J7", "ENCODER", 330, 95, ["ENC_A", "GND", "ENC_B", "ENC_SW", "GND"])
hdr1xn("J8", "SPARE", 355, 60, ["+3V3", "GND", "SPARE1", "SPARE2", "SPARE3",
                                "SPARE4", "SPARE5", "SPARE6"])
hdr1xn("J9", "DEBUG", 355, 85, ["DBG_TX", "DBG_RX", "GND"])

# montagegaten (GND-pad = chassis op de brain)
for k, ref in enumerate(("H1", "H2", "H3", "H4")):
    s.component("Custom:MHole", ref, "M3", 375 + 8 * k, 110, 0,
                "MountingHole:MountingHole_3.2mm_M3_Pad")
    s.wire(375 + 8 * k - 2.54, 110, 375 + 8 * k - 5.08, 110)
    s.power("power:GND", 375 + 8 * k - 5.08, 110)

# PWR_FLAGs: +12VRAW/+12V/+5V passief gevoed; +3V3 heeft U5 (power_out)
s.wire(20, 240, 25.08, 240); s.power("power:+12V", 20, 240); s.flag(25.08, 240)
s.wire(40, 240, 45.08, 240); s.power("power:+5V", 40, 240); s.flag(45.08, 240)
s.wire(60, 240, 65.08, 240); s.power("power:GND", 60, 240); s.flag(65.08, 240)
s.wire(80, 240, 85.08, 240); s.label("+12VRAW", 80, 240); s.flag(85.08, 240)
s.wire(100, 240, 105.08, 240); s.label("VBUS", 100, 240); s.flag(105.08, 240)

s.text("BRAIN: chain A=IO4-8, B=IO15-18+IO9; MIDI RX=IO11 TX=IO12; I2C IO10/13.\\n"
       "Strapping IO0/IO3/IO45/IO46 vrijgehouden; BOOT+RESET tactschakelaars.\\n"
       "12V center-NEGATIEF! USB-C alleen voor flash/debug (SS34 naar 5V).\\n"
       "Antenne: U.FL-pigtail naar SMA-bulkhead (module = -1U!).", 20, 20)
s.write(os.path.join(OUT_DIR, NAME + ".kicad_sch"))

# ================= PCB =================
NETS = (['', '+12V', '+5V', '+3V3', 'GND', '/+12VRAW', '/RAWF', '/VBUS',
         '/BCK_EN', '/BST', '/SW', '/FB', '/ESP_EN', '/BOOT', '/USB_DP',
         '/USB_DM', '/CC1', '/CC2', '/SDA', '/SCL', '/LEDK', '/LEDK_A',
         '/MIDI_RX', '/MIDI_TX', '/MTXN', '/MTX5',
         '/MOUT4', '/MOUT5', '/MIN4', '/MIN5', '/MINA',
         '/DRET_A', '/DRET_B', '/A_DRETJ', '/B_DRETJ',
         '/DBG_TX', '/DBG_RX']
        + [f'/{p}{n}' for p in 'AB' for n in ('_CLK', '_DATA', '_LATCH', '_EN')]
        + [f'/{p}{n}5' for p in 'AB' for n in ('_CLK', '_DATA', '_LATCH', '_EN')]
        + [f'/{p}{n}J' for p in 'AB' for n in ('_CLK', '_DATA', '_LATCH', '_EN')]
        + [f'/BTN{k}' for k in range(1, 5)]
        + ['/ENC_A', '/ENC_B', '/ENC_SW']
        + [f'/SPARE{k}' for k in range(1, 7)])

class BBoard(Board):
    def write(self, out):
        bx0, by0, bx1, by1 = self.b
        for layer in ('F.Cu', 'B.Cu'):
            self.extra.append(f'''
  (zone (net {self.NI['GND']}) (net_name "GND") (layer "{layer}")
    (uuid "{self.uid()}")
    (hatch edge 0.5)
    (connect_pads yes (clearance 0.3))
    (min_thickness 0.2) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts
      (xy {bx0+0.5} {by0+0.5}) (xy {bx1-0.5} {by0+0.5})
      (xy {bx1-0.5} {by1-0.5}) (xy {bx0+0.5} {by1-0.5})
    ))
  )''')
        tt = []
        for net, layer, w, pts in self.tracks:
            for a, bb in zip(pts, pts[1:]):
                if tuple(a) == tuple(bb):
                    continue
                tt.append(f'  (segment (start {fmt(a[0])} {fmt(a[1])}) (end {fmt(bb[0])} {fmt(bb[1])}) '
                          f'(width {w}) (layer "{layer}") (net {net}) (uuid "{self.uid()}"))')
        for net, x, y in self.vias:
            tt.append(f'  (via (at {fmt(x)} {fmt(y)}) (size 0.5) (drill 0.3) '
                      f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{self.uid()}"))')
        sx, sy, srot = self.silk
        _texts = getattr(self, 'silk_texts', None) or \
            [(self.silk_text, sx, sy, srot)]
        silk_block = '\n'.join(
            f'  (gr_text "{_t}" (at {fmt(_x)} {fmt(_y)} {_r}) '
            f'(layer "F.SilkS")\n    (uuid "{self.uid()}")\n'
            f'    (effects (font (size 1 1) (thickness 0.15))))'
            for _t, _x, _y, _r in _texts)
        header = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "{self.paper}")
  (title_block
    (title "{self.title}")
    (date "{self.date}")
    (rev "{self.rev}")
    (company "Guitar Effect Switcher project")
  )
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1")
    (43 "Eco2.User" user "User.Eco2")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user)
    (49 "F.Fab" user)
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (aux_axis_origin {bx0} {by0})
    (grid_origin {bx0} {by0})
  )
'''
        nets_block = '\n'.join(f'  (net {i} "{n}")' for i, n in enumerate(self.NETS))
        extras = f'''
  (gr_rect (start {bx0} {by0}) (end {bx1} {by1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{self.uid()}"))
{silk_block}
'''
        out_txt = (header + nets_block + '\n' + '\n'.join(self.fp_texts) + '\n'
                   + '\n'.join(tt) + extras + '\n'.join(self.extra) + '\n)\n')
        open(out, 'w', encoding='utf-8', newline='\n').write(out_txt)
        print('written', out, f'({len(tt)} routed items)')

b = BBoard(TITLE, REV, (150, 167.3, 0), BX0, BY0, BX1, BY1, NETS, DATE)
b.paper = "A3"
# Silk-teksten op verzoek van Mark tussen de RJ45's + verticaal langs de
# oostrand (de oude één-regel op y=167,3 verdween onder J11/H4).
b.silk_texts = [
    (f"GSWITCH BRAIN rev {REV}", 148.5, 153.9, 0),
    ("12V center-negatief", 148.5, 157.0, 0),
    ("doc/guitar-switcher-spec.md", 184.6, 156.5, 90),
]
P = b.P

def raw_pads(ref, x, y, rot, pads, netmap):
    b.P[ref] = {}
    for num, px, py in pads:
        dx, dy = rotxy(px, py, rot)
        key = num
        while key in b.P[ref]:
            key += 'b'
        b.P[ref][key] = (round(x + dx, 4), round(y + dy, 4))
        if num in netmap:
            b.PNET.setdefault(ref, {})[key] = netmap[num][0]

def rj45(ref, x, y, rot, netmap):
    pads = [(str(p), 1.27 * (p - 1), (0 if p % 2 else -2.54)) for p in range(1, 9)]
    shp = [('SH', -3.325, 9.4), ('SH', 12.215, 9.4)]
    raw_pads(ref, x, y, rot, pads + shp, netmap)
    pt = []
    for num, px, py in pads:
        nm = netmap.get(num)
        nn = f' (net {nm[0]} "{nm[1]}")' if nm else ''
        pt.append(f'    (pad "{num}" thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 1.5 1.5) (drill 0.9) (layers "*.Cu" "*.Mask"){nn})')
    for num, px, py in shp:
        nm = netmap.get(num)
        nn = f' (net {nm[0]} "{nm[1]}")' if nm else ''
        pt.append(f'    (pad "{num}" thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 2.5 2.5) (drill 1.6) (layers "*.Cu" "*.Mask"){nn})')
    for px, py in ((-1.27, 6.35), (10.16, 6.35)):
        pt.append(f'    (pad "" np_thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 3.25 3.25) (drill 3.25) (layers "*.Cu" "*.Mask"))')
    # render-model: Amphenol RJHSE (ander pinraster, zelfde behuizing)
    pt.append('    (model "${KICAD10_3DMODEL_DIR}/Connector_RJ.3dshapes/'
              'RJ45_Amphenol_RJHSE538X.step"\n'
              '      (offset (xyz 0.9 -7.7 0)) (scale (xyz 1 1 1)) '
              '(rotate (xyz 0 0 0)))')
    b.raw_fp(f'''  (footprint "GSwitch:RJ45_shielded"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)} {rot})
    (path "/")
    (descr "RJ45 8P8C afgeschermd THT (56-klasse / Ninigi GE)")
    (property "Reference" "{ref}" (at 4.4 -4 {(360-rot) % 360}) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "RJ45-S" (at 4.4 6 {(360-rot) % 360}) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole exclude_from_pos_files)
    (fp_rect (start -5.33 -4.67) (end 14.22 14.98)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -5.33 -4.67) (end 14.22 14.98)
      (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
    (fp_rect (start -5.58 -4.92) (end 14.47 15.23)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pt)}
  )''')

def din5(ref, x, y, rot, netmap):
    """CUI SDS-50J 180gr DIN-5, THT. Lokaal: pin 2 = (0,0), paneel = +y."""
    pads = [('2', 0, 0), ('3', -7.5, 0), ('1', 7.5, 0),
            ('5', -5.0, -2.5), ('4', 5.0, -2.5),
            ('E', -2.5, 10.0), ('E', 2.5, 10.0)]
    raw_pads(ref, x, y, rot, pads, netmap)
    pt = []
    for num, px, py in pads:
        nm = netmap.get(num)
        nn = f' (net {nm[0]} "{nm[1]}")' if nm else ''
        pt.append(f'    (pad "{num}" thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 2.2 2.2) (drill 1.4) (layers "*.Cu" "*.Mask"){nn})')
    for px, py in ((-7.5, 5.0), (7.5, 5.0)):
        pt.append(f'    (pad "" np_thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 2.4 2.4) (drill 2.4) (layers "*.Cu" "*.Mask"))')
    pt.append('    (model "${KIPRJMOD}/../3dshapes/DIN5_SDS50J.wrl"\n'
              '      (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) '
              '(rotate (xyz 0 0 0)))')
    b.raw_fp(f'''  (footprint "GSwitch:DIN5_SDS50J"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)} {rot})
    (path "/")
    (descr "DIN-5 180gr PCB (CUI SDS-50J), paneel aan +y, body 20x15.8")
    (property "Reference" "{ref}" (at 0 -6.5 {(360-rot) % 360}) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "SDS-50J" (at 0 -4 {(360-rot) % 360}) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole exclude_from_pos_files)
    (fp_rect (start -10 -3.3) (end 10 12.5)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -10 -3.3) (end 10 12.5)
      (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
    (fp_rect (start -10.25 -3.55) (end 10.25 12.75)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pt)}
  )''')

# ---------- plaatsing (v2-floorplan, 100x70) ----------
# west: DC + USB + debug; noord: 2x DIN + buck-NW; zuid: 2x RJ45; oost: module + headers
b.fp('Connector_BarrelJack.pretty\\BarrelJack_CUI_PJ-102AH_Horizontal.kicad_mod',
     'Connector_BarrelJack:BarrelJack_CUI_PJ-102AH_Horizontal', 'J1', 'DC-12V',
     111, 120, 270, b.nm({'1': 'GND', '2': '/+12VRAW'}))
b.fp('Connector_USB.pretty\\USB_C_Receptacle_HRO_TYPE-C-31-M-12.kicad_mod',
     'Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12', 'J2', 'USB-C',
     105.55, 152, 90, b.nm({'A1': 'GND', 'B12': 'GND', 'A12': 'GND',
                           'B1': 'GND', 'A4': '/VBUS', 'B9': '/VBUS',
                           'A9': '/VBUS', 'B4': '/VBUS', 'A5': '/CC1',
                           'B5': '/CC2', 'A6': '/USB_DP', 'B6': '/USB_DP',
                           'A7': '/USB_DM', 'B7': '/USB_DM', 'SH': 'GND'}))
din5('J3', 137, 112.7, 180, b.nm({'4': '/MOUT4', '5': '/MOUT5', '2': 'GND',
                                  'E': 'GND'}))
din5('J4', 166, 112.7, 180, b.nm({'4': '/MIN4', '5': '/MIN5', 'E': 'GND'}))
rj45('J10', 125, 155, 0, b.nm({'1': '/A_CLKJ', '2': 'GND', '3': '/A_DATAJ',
                               '4': '+12V', '5': 'GND', '6': '/A_DRETJ',
                               '7': '/A_LATCHJ', '8': '/A_ENJ', 'SH': 'GND'}))
rj45('J11', 165, 155, 0, b.nm({'1': '/B_CLKJ', '2': 'GND', '3': '/B_DATAJ',
                               '4': '+12V', '5': 'GND', '6': '/B_DRETJ',
                               '7': '/B_LATCHJ', '8': '/B_ENJ', 'SH': 'GND'}))
b.fp('RF_Module.pretty\\ESP32-S3-WROOM-1U.kicad_mod',
     'RF_Module:ESP32-S3-WROOM-1U', 'U1', 'ESP32-S3-WROOM-1U-N8R2',
     184, 127, 0, b.nm({
         '1': 'GND', '2': '+3V3', '3': '/ESP_EN', '4': '/A_CLK',
         '5': '/A_DATA', '6': '/A_LATCH', '7': '/A_EN', '8': '/B_CLK',
         '9': '/B_DATA', '10': '/B_LATCH', '11': '/B_EN', '12': '/DRET_A',
         '13': '/USB_DM', '14': '/USB_DP', '17': '/DRET_B', '18': '/SDA',
         '19': '/MIDI_RX', '20': '/MIDI_TX', '21': '/SCL', '22': '/SPARE1',
         '23': '/SPARE2', '24': '/SPARE3', '25': '/SPARE4',
         '27': '/BOOT', '28': '/BTN1', '29': '/BTN2', '30': '/BTN3',
         '31': '/BTN4', '32': '/ENC_A', '33': '/ENC_B', '34': '/ENC_SW',
         '35': '/LEDK_A', '36': '/DBG_TX', '37': '/DBG_RX', '38': '/SPARE5',
         '39': '/SPARE6', '40': 'GND', '41': 'GND'}), skip_pad_drill=0.2)
# de KiCad-lib heeft geen -1U-STEP; het -1-model is visueel gelijk genoeg
b.fp_texts[-1] = b.fp_texts[-1].replace('ESP32-S3-WROOM-1U.step',
                                        'ESP32-S3-WROOM-1.step')
b.fp('Package_SO.pretty\\SOIC-20W_7.5x12.8mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm', 'U2', '74HCT541', 147.5, 142, 90,
     b.nm({'1': 'GND', '2': '/A_CLK', '3': '/A_DATA', '4': '/A_LATCH',
           '5': '/A_EN', '6': '/B_CLK', '7': '/B_DATA', '8': '/B_LATCH',
           '9': '/B_EN', '10': 'GND', '11': '/B_EN5', '12': '/B_LATCH5',
           '13': '/B_DATA5', '14': '/B_CLK5', '15': '/A_EN5',
           '16': '/A_LATCH5', '17': '/A_DATA5', '18': '/A_CLK5',
           '19': 'GND', '20': '+5V'}))
b.fp('Package_SO.pretty\\SOIC-14_3.9x8.7mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm', 'U3', '74HCT14', 136, 124, 0,
     b.nm({'1': '/MIDI_TX', '2': '/MTXN', '3': '/MTXN', '4': '/MTX5',
           '5': 'GND', '7': 'GND', '14': '+5V', '13': 'GND', '11': 'GND',
           '9': 'GND'}))
b.fp('Package_DIP.pretty\\DIP-6_W7.62mm.kicad_mod',
     'Package_DIP:DIP-6_W7.62mm', 'U4', 'H11L1', 150, 127, 90,
     b.nm({'1': '/MINA', '2': '/MIN5', '4': '/MIDI_RX', '5': 'GND',
           '6': '+3V3'}))
b.fp('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U5', 'AMS1117-3.3',
     119.5, 125.5, 180, b.nm({'3': '+5V', '1': 'GND', '2': '+3V3'}))
b.fp('Package_TO_SOT_SMD.pretty\\SOT-23-6.kicad_mod',
     'Package_TO_SOT_SMD:SOT-23-6', 'U6', 'TPS563201', 119.5, 109.5, 270,
     b.nm({'1': 'GND', '2': '/SW', '3': '+12V', '4': '/FB', '5': '/BCK_EN',
           '6': '/BST'}))
b.fp('Package_TO_SOT_SMD.pretty\\SOT-23.kicad_mod',
     'Package_TO_SOT_SMD:SOT-23', 'Q1', 'AO3401', 108.5, 104, 180,
     b.nm({'1': 'GND', '2': '+12V', '3': '/RAWF'}))
b.fp('Fuse.pretty\\Fuse_1206_3216Metric.kicad_mod',
     'Fuse:Fuse_1206_3216Metric', 'F1', '1.1A', 103, 104, 0,
     b.rc('/+12VRAW', '/RAWF'))
b.fp('Diode_SMD.pretty\\D_SMA.kicad_mod', 'Diode_SMD:D_SMA', 'D1', 'SMAJ15A',
     114, 104.2, 0, b.rc('+12V', 'GND'))
b.fp('Diode_SMD.pretty\\D_SMA.kicad_mod', 'Diode_SMD:D_SMA', 'D2', 'SS34',
     109, 134.5, 0, b.rc('+5V', '/VBUS'))
b.fp('Diode_SMD.pretty\\D_SOD-123.kicad_mod', 'Diode_SMD:D_SOD-123', 'D3',
     '1N4148W', 144.5, 122.2, 0, b.rc('/MINA', '/MIN5'))
b.fp('LED_SMD.pretty\\LED_0805_2012Metric.kicad_mod',
     'LED_SMD:LED_0805_2012Metric', 'D4', 'LED-GN', 134, 131.5, 0,
     b.rc('GND', '/LEDK'))
b.fp('Inductor_SMD.pretty\\L_Bourns-SRN4018.kicad_mod',
     'Inductor_SMD:L_Bourns-SRN4018', 'L1', '4u7', 124, 110.2, 0,
     b.rc('/SW', '+5V'))
b.fp('Button_Switch_SMD.pretty\\SW_SPST_SKQG_WithStem.kicad_mod',
     'Button_Switch_SMD:SW_SPST_SKQG_WithStem', 'SW1', 'RESET', 155, 133, 0,
     b.nm({'1': '/ESP_EN', '2': 'GND'}))
b.fp('Button_Switch_SMD.pretty\\SW_SPST_SKQG_WithStem.kicad_mod',
     'Button_Switch_SMD:SW_SPST_SKQG_WithStem', 'SW2', 'BOOT', 164, 133, 0,
     b.nm({'1': '/BOOT', '2': 'GND'}))

# headers oost (verticale kolommen) + debug west
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x04_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical', 'J5',
     'OLED-I2C', 196.5, 101.5, 0, b.nm({'1': 'GND', '2': '+3V3', '3': '/SCL',
                                        '4': '/SDA'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x05_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical', 'J6',
     'KNOPPEN', 196.5, 113, 0, b.nm({'1': '/BTN1', '2': '/BTN2',
                                     '3': '/BTN3', '4': '/BTN4', '5': 'GND'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x05_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical', 'J7',
     'ENCODER', 196.5, 127, 0, b.nm({'1': '/ENC_A', '2': 'GND',
                                     '3': '/ENC_B', '4': '/ENC_SW',
                                     '5': 'GND'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x08_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical', 'J8',
     'SPARE', 196.5, 141, 0, b.nm({'1': '+3V3', '2': 'GND',
                                   '3': '/SPARE1', '4': '/SPARE2',
                                   '5': '/SPARE3', '6': '/SPARE4',
                                   '7': '/SPARE5', '8': '/SPARE6'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x03_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical', 'J9',
     'DEBUG', 105.5, 140.5, 90, b.nm({'1': '/DBG_TX', '2': '/DBG_RX',
                                      '3': 'GND'}))

# R/C-strooigoed
RC = [
    ('C1', '10u', 104, 109.2, 0, b.rc('+12V', 'GND')),
    ('C2', '100n', 107.5, 109.2, 0, b.rc('+12V', 'GND')),
    ('R3', '100k', 103.4, 112.6, 270, b.rc('+12V', '/BCK_EN')),
    ('R4', '33k', 105.9, 112.6, 90, b.rc('/BCK_EN', 'GND')),
    ('R1', '56k', 110.9, 112.6, 90, b.rc('+5V', '/FB')),
    ('R2', '10k', 108.4, 112.6, 270, b.rc('/FB', 'GND')),
    ('C3', '100n', 120.45, 113.4, 270, b.rc('/BST', '/SW')),
    ('C4', '22u', 115.9, 117.35, 270, b.rc('+5V', 'GND')),
    ('C5', '22u', 118.8, 117.35, 270, b.rc('+5V', 'GND')),
    ('C6', '22u', 125.6, 121.4, 270, b.rc('+3V3', 'GND')),
    ('C7', '100n', 125.6, 125.4, 270, b.rc('+3V3', 'GND')),
    ('C8', '22u', 177, 143.5, 0, b.rc('+3V3', 'GND')),
    ('C9', '100n', 180.5, 143.5, 0, b.rc('+3V3', 'GND')),
    ('R5', '10k', 170, 143.5, 0, b.rc('+3V3', '/ESP_EN')),
    ('C10', '1u', 173.5, 143.5, 0, b.rc('/ESP_EN', 'GND')),
    ('R6', '1k', 137.5, 131.5, 0, b.rc('/LEDK_A', '/LEDK')),
    ('R7', '4k7', 191.5, 108, 90, b.rc('+3V3', '/SDA')),
    ('R8', '4k7', 193.5, 108, 90, b.rc('+3V3', '/SCL')),
    ('R9', '220R', 142.5, 118.6, 90, b.rc('/MTX5', '/MOUT5')),
    ('R10', '220R', 145, 118.6, 90, b.rc('+5V', '/MOUT4')),
    ('R11', '220R', 150, 115.9, 0, b.rc('/MIN4', '/MINA')),
    ('R12', '1k', 144.5, 124.8, 0, b.rc('+3V3', '/MIDI_RX')),
    ('C11', '100n', 144.5, 127.4, 0, b.rc('+3V3', 'GND')),
    ('C12', '100n', 141, 132.5, 0, b.rc('+5V', 'GND')),
    ('C13', '100n', 130.5, 122.8, 90, b.rc('+5V', 'GND')),
    ('R25', '5k1', 114.3, 158.5, 0, b.rc('/CC1', 'GND')),
    ('R26', '5k1', 114.3, 161, 0, b.rc('/CC2', 'GND')),
    ('R13', '100R', 121.5, 146.8, 90, b.rc('/A_CLK5', '/A_CLKJ')),
    ('R14', '100R', 124, 146.8, 90, b.rc('/A_DATA5', '/A_DATAJ')),
    ('R15', '100R', 126.5, 146.8, 90, b.rc('/A_LATCH5', '/A_LATCHJ')),
    ('R16', '100R', 129, 146.8, 90, b.rc('/A_EN5', '/A_ENJ')),
    ('R17', '100R', 161.5, 146.8, 90, b.rc('/B_CLK5', '/B_CLKJ')),
    ('R18', '100R', 164, 146.8, 90, b.rc('/B_DATA5', '/B_DATAJ')),
    ('R19', '100R', 166.5, 146.8, 90, b.rc('/B_LATCH5', '/B_LATCHJ')),
    ('R20', '100R', 169, 146.8, 90, b.rc('/B_EN5', '/B_ENJ')),
    ('R21', '10k', 133.5, 146.8, 90, b.rc('/A_DRETJ', '/DRET_A')),
    ('R23', '15k', 136, 146.8, 90, b.rc('/DRET_A', 'GND')),
    ('R22', '10k', 173.5, 146.8, 90, b.rc('/B_DRETJ', '/DRET_B')),
    ('R24', '15k', 176, 146.8, 90, b.rc('/DRET_B', 'GND')),
]
for ref, val, x, y, rot, nm in RC:
    fp = ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
          'Capacitor_SMD:C_0805_2012Metric') if ref.startswith('C') else \
         ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
          'Resistor_SMD:R_0805_2012Metric')
    b.fp(fp[0], fp[1], ref, val, x, y, rot, nm)

# montagegaten
for ref, x, y in (('H1', 196, 164.5), ('H2', 104.2, 164.5),
                  ('H3', 151.5, 104), ('H4', 154, 166)):
    b.fp('MountingHole.pretty\\MountingHole_3.2mm_M3_Pad.kicad_mod',
         'MountingHole:MountingHole_3.2mm_M3_Pad', ref, 'M3', x, y, 0,
         b.nm({'1': 'GND'}))

# ---------- handroutes: voedingspaden ----------
SW_, PW_, HW_ = 0.25, 0.5, 0.8
SPINE, RAIL5 = 106.6, 116.4
# 12V-raw: zuidwestom de DC-jack heen naar de zekering (jack rot 270)
b.T('/+12VRAW', 'F.Cu', HW_, P['J1']['2'], (105, 127.2), (101.3, 127.2),
    (101.3, 104), P['F1']['1'])
# RAWF: zekering -> P-FET drain (recht, zelfde rij)
b.T('/RAWF', 'F.Cu', HW_, P['F1']['2'], P['Q1']['3'])
# +12V-spine + kolom-stubs
b.T('+12V', 'F.Cu', HW_, P['Q1']['2'], (111.3, P['Q1']['2'][1]),
    (111.3, SPINE))
b.T('+12V', 'F.Cu', HW_, (103.04, SPINE), (122.7, SPINE))
b.T('+12V', 'F.Cu', PW_, P['D1']['1'], (P['D1']['1'][0], SPINE))
b.T('+12V', 'F.Cu', PW_, P['C1']['1'], (P['C1']['1'][0], SPINE))
b.T('+12V', 'F.Cu', PW_, P['C2']['1'], (P['C2']['1'][0], SPINE))
b.T('+12V', 'F.Cu', SW_, P['R3']['1'], (P['R3']['1'][0], SPINE))
# VIN p3 (noordrij bij rot 270): eigen kolom recht omhoog
b.T('+12V', 'F.Cu', HW_, P['U6']['3'], (P['U6']['3'][0], SPINE))
# 12V naar de RJ45's: B-run langs x=114,6 + F-hop over de 3V3-verticaal
b.V('+12V', 114.6, SPINE)
b.T('+12V', 'B.Cu', PW_, (114.6, SPINE), (114.6, 143.9), (121.6, 143.9))
b.V('+12V', 121.6, 143.9)
b.T('+12V', 'F.Cu', PW_, (121.6, 143.9), (126.6, 143.9))
b.V('+12V', 126.6, 143.9)
b.T('+12V', 'B.Cu', PW_, (126.6, 143.9), (P['J11']['4'][0], 143.9),
    P['J11']['4'])
b.T('+12V', 'B.Cu', PW_, (P['J10']['4'][0], 143.9), P['J10']['4'])
# SW: p2 (noordrij midden) -> korte B-hop oostwaarts -> L pad 1
b.V('/SW', P['U6']['2'][0], 107.9)
b.T('/SW', 'F.Cu', PW_, P['U6']['2'], (P['U6']['2'][0], 107.9))
b.V('/SW', 121.6, 110.2)
b.T('/SW', 'B.Cu', PW_, (P['U6']['2'][0], 107.9), (121.6, 107.9),
    (121.6, 110.2))
b.T('/SW', 'F.Cu', PW_, (121.6, 110.2), P['L1']['1'])
# BST-cap: pad 1 recht onder p6; pad 2 (SW) -> jog naar L pad 1
b.T('/BST', 'F.Cu', SW_, P['U6']['6'], P['C3']['1'])
b.T('/SW', 'F.Cu', SW_, P['C3']['2'], (P['C3']['2'][0], 114.9),
    (122.3, 114.9), (122.3, 110.2), P['L1']['1'])
# FB: p4 -> rij y=111,9 -> R1.2/R2.1
b.T('/FB', 'F.Cu', SW_, P['U6']['4'], (P['U6']['4'][0], 111.9),
    (P['R2']['1'][0], 111.9), P['R2']['1'])
b.T('/FB', 'F.Cu', SW_, (P['R1']['2'][0], 111.9), P['R1']['2'])
# +5V-rail (y=116,4) + taps
b.T('+5V', 'F.Cu', HW_, P['L1']['2'], (P['L1']['2'][0], RAIL5))
b.T('+5V', 'F.Cu', HW_, (P['R1']['1'][0], RAIL5), (P['L1']['2'][0], RAIL5))
b.T('+5V', 'F.Cu', SW_, P['R1']['1'], (P['R1']['1'][0], RAIL5))
b.T('+5V', 'F.Cu', PW_, P['C4']['1'], (P['C4']['1'][0], RAIL5))
b.T('+5V', 'F.Cu', PW_, P['C5']['1'], (P['C5']['1'][0], RAIL5))
# +5V -> AMS1117 VIN (p3 noordoost bij rot 180)
b.T('+5V', 'F.Cu', PW_, (P['U5']['3'][0], RAIL5), P['U5']['3'])
# 3V3: U5 p2 -> C6/C7-kolom -> via -> B-highway -> module pin 2
b.T('+3V3', 'F.Cu', PW_, P['U5']['2'], (124.25, P['U5']['2'][1]))
b.T('+3V3', 'F.Cu', PW_, (124.25, P['C6']['1'][1]), (124.25, 128.2))
b.T('+3V3', 'F.Cu', PW_, (124.25, P['C6']['1'][1]), P['C6']['1'])
b.T('+3V3', 'F.Cu', PW_, (124.25, P['C7']['1'][1]), P['C7']['1'])
b.V('+3V3', 124.25, 128.2)
p2 = P['U1']['2']
b.V('+3V3', p2[0] + 2.5, p2[1])
# B-highway langs de zuidrand (r5-SES is hieromheen gerouteerd);
# de 12V-run hopt er verderop overheen op F
b.T('+3V3', 'B.Cu', PW_, (124.25, 128.2), (123.3, 128.2), (123.3, 158.9),
    (183, 158.9), (183, p2[1]), (p2[0] + 2.5, p2[1]))
b.T('+3V3', 'F.Cu', PW_, (p2[0] + 2.5, p2[1]), p2)

# GND-stitching
for x, y in ((102, 102), (198, 102), (102, 168), (198, 168), (145, 101.5),
             (128, 103), (104, 114.8), (133, 138), (185, 144.5), (192, 118),
             (155, 149.8), (113.5, 136.5), (170, 138), (142, 157),
             (163.78, 123.43)):   # brug: B-noordflard -> F-hoofdvlak
    b.V('GND', x, y)
# eiland-hechtvia's van gnd_stitch.py/gnd_bridge.py (clearance-gecheckt)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

# eventuele freerouting-SES inbakken
import seslib
if os.path.exists(SES_FILE):
    # Vast skippen: volledig hand-geroute netten (SES bevat verouderde
    # echo's / freerouting-junk daarvan).
    # Alleen netten die VOLLEDIG met de hand liggen (SES-echo is dan
    # redundant). Netten met SES-takken (+3V3!) hier nooit in zetten.
    SKIP = {'/USB_DP', '/USB_DM', '/VBUS', '/B_EN', '+12V', '/CC2',
            '/B_LATCH', '/B_DATA'}
    # Pre-pass: skip ook elk SES-net waarvan koper de hand-corridors raakt
    # (die netten routeert de volgende freerouting-ronde opnieuw). Marges
    # ruim: corridor + 0,35. AUTO_SKIP alleen aanzetten voor een SES die
    # OUDER is dan de corridors (verse rondes respecteren ze al als
    # protected wiring; de box-marges vangen dan valse treffers).
    AUTO_SKIP = False
    BOXES = [] if not AUTO_SKIP else [
        ('F.Cu', 102.6, 149.9, 172.8, 151.3),    # DP-laan
        ('F.Cu', 171.2, 144.2, 174.3, 151.3),    # DP-jog om R22
        ('F.Cu', 172.7, 134.4, 174.3, 145.7),    # DP-kolom
        ('F.Cu', 172.7, 134.4, 176.1, 135.8),    # DP west-run
        ('B.Cu', 102.5, 151.2, 104.9, 158.6),    # DM-bond-jog
        ('B.Cu', 103.5, 157.2, 175.8, 158.6),    # DM-zuidlaan
        ('F.Cu', 121.2, 157.2, 125.3, 158.6),    # DM-F-hop
        ('B.Cu', 174.2, 133.1, 175.8, 158.6),    # DM-B-kolom
        ('F.Cu', 174.2, 133.1, 176.1, 134.6),    # DM-pad-stub
        ('B.Cu', 113.9, 143.2, 169.6, 144.6),    # 12V-laan
        ('F.Cu', 120.9, 143.2, 127.3, 144.6),    # 12V-F-hop
        ('B.Cu', 128.1, 143.2, 129.6, 153.2),    # 12V-stub J10
        ('B.Cu', 168.1, 143.2, 169.6, 153.2),    # 12V-stub J11
        ('F.Cu', 151.2, 128.6, 174.7, 147.4),    # B_EN-pad (ruim kader)
        ('F.Cu', 104.6, 136.9, 110.0, 150.2),    # VBUS-tap + kolom
        ('F.Cu', 108.6, 133.9, 111.7, 138.2),    # VBUS D2-aanloop
        ('B.Cu', 104.5, 149.3, 105.9, 154.7),    # VBUS-bondloop-B
        ('B.Cu', 122.4, 127.5, 124.1, 159.2),    # 3V3-afdaling x=123,3
    ]
    _tracks, _vias = seslib.load_ses(SES_FILE)
    auto_skip = set()
    import math as _math
    for _nm, _layer, _w, _pts in _tracks:
        if _nm in SKIP or _nm == 'GND' or _nm in auto_skip:
            continue
        hit = False
        for (_xa, _ya), (_xb, _yb) in zip(_pts, _pts[1:]):
            n_s = max(2, int(_math.hypot(_xb - _xa, _yb - _ya) / 0.4) + 1)
            for k_ in range(n_s + 1):
                _x = _xa + (_xb - _xa) * k_ / n_s
                _y = _ya + (_yb - _ya) * k_ / n_s
                if any(l == _layer and x0 <= _x <= x1 and y0 <= _y <= y1
                       for l, x0, y0, x1, y1 in BOXES):
                    hit = True
                    break
            if hit:
                break
        if hit:
            auto_skip.add(_nm)
    for _nm, _x, _y in _vias:
        if _nm in SKIP or _nm in auto_skip:
            continue
        if any(x0 - 0.3 <= _x <= x1 + 0.3 and y0 - 0.3 <= _y <= y1 + 0.3
               for _l, x0, y0, x1, y1 in BOXES):
            auto_skip.add(_nm)
    print('auto-skip (herroute in volgende ronde):', sorted(auto_skip))
    # Hybride narun: 7 netten die ronde 6 niet haalde, apart nageroutet
    # (alles protected, alleen deze uit de DSN gestript — WERKWIJZE).
    NARUN_NETS = ('/CC1', '/MIDI_TX', '/DBG_TX', '/B_LATCH5', '/A_CLKJ',
                  '/BOOT', '/B_CLK', '/ESP_EN', '/A_CLK', '/A_EN', '/B_EN5')
    NARUN_SES = SES_FILE.replace('.ses', '-narun.ses')
    if os.path.exists(NARUN_SES):
        n = seslib.apply_ses(b, SES_FILE,
                             skip=tuple(SKIP | auto_skip | set(NARUN_NETS)))
        print('SES applied:', n)
        n = seslib.apply_ses(b, NARUN_SES, only=NARUN_NETS)
        print('narun-SES applied:', n)
    else:
        n = seslib.apply_ses(b, SES_FILE, skip=tuple(SKIP | auto_skip))
        print('SES applied:', n)
    print('snap_stubs:', b.snap_stubs())

# USB-C 16-pins paar-bonds (A6+B6 / A7+B7 / A4B9+A9B4 zijn verweven —
# freerouting maakt hier brokken van). NA snap_stubs: die "repareert"
# losse pad-eindpunten anders met kortsluitstubs naar de buurpaden.
A6, B6 = P['J2']['A6'], P['J2']['B6']
A7, B7 = P['J2']['A7'], P['J2']['B7']
# USB-netten in eigen netclass (0,15/0,1 - JLC kan 0,127): pas dan passen
# de bond-lussen tussen de 0,5mm-pitch padgroepen
b.T('/USB_DP', 'F.Cu', 0.15, B6, (104.0, B6[1]), (104.0, A6[1]), A6)
b.V('/USB_DM', 103.1, A7[1])
b.V('/USB_DM', 103.1, B7[1])
b.T('/USB_DM', 'F.Cu', 0.15, A7, (103.1, A7[1]))
b.T('/USB_DM', 'B.Cu', 0.15, (103.1, A7[1]), (103.1, B7[1]))
b.T('/USB_DM', 'F.Cu', 0.15, (103.1, B7[1]), B7)
# VBUS-bond: diagonalen langs de NPTH-paspennen (102,95, 149,11/154,89)
A4, A9 = P['J2']['A4'], P['J2']['A9']
b.V('/VBUS', 105.2, 153.98)
b.V('/VBUS', 105.2, 150.02)
b.T('/VBUS', 'F.Cu', SW_, A4, (103.5, 153.98), (105.2, 153.98))
b.T('/VBUS', 'B.Cu', SW_, (105.2, 153.98), (105.2, 150.02))
b.T('/VBUS', 'F.Cu', SW_, (105.2, 150.02), (103.5, 150.02), A9)

# ---- de vier netten die freerouting structureel niet haalt: handwerk ----
p13, p14, p11 = P['U1']['13'], P['U1']['14'], P['U1']['11']
# USB_DP: bond-hoek -> F-laan y=150,55 -> jog om R22 heen -> F-kolom
# x=173,5 (C10-padgat) -> van west in p14 (onderrij begint op x=177!)
b.T('/USB_DP', 'F.Cu', 0.15, (104.0, B6[1]), (104.0, 150.55), (172.0, 150.55),
    (172.0, 144.9), (173.5, 144.9), (173.5, p14[1]), p14)
# USB_DM: bond-via -> B zuidlaan y=157,9 (F-hop over de 3V3-afdaling) ->
# B-kolom x=170,5 -> via -> F west-run y=133,83 -> p13
b.V('/USB_DM', 121.9, 157.9)
b.V('/USB_DM', 124.6, 157.9)
b.V('/USB_DM', 175.0, p13[1])
b.T('/USB_DM', 'B.Cu', 0.15, (103.1, B7[1]), (104.2, B7[1]), (104.2, 157.9),
    (121.9, 157.9))
b.T('/USB_DM', 'F.Cu', 0.15, (121.9, 157.9), (124.6, 157.9))
b.T('/USB_DM', 'B.Cu', 0.15, (124.6, 157.9), (175.0, 157.9), (175.0, p13[1]))
b.T('/USB_DM', 'F.Cu', 0.15, (175.0, p13[1]), p13)
# VBUS: tap op bondloop-bovenvia -> laan y=149,55 (noord van de DP-laan,
# tussen de shield-poten door) -> D2 pad 2
b.T('/VBUS', 'F.Cu', SW_, (105.2, 150.02), (105.2, 149.55), (109.3, 149.55),
    (109.3, 137.5), (P['D2']['2'][0], 137.5), P['D2']['2'])
# B_DATA/B_LATCH/B_EN: geneste F-bus U2.7/8/9 -> module p9/p10/p11.
# Drie L-vormen: hoe noordelijker het modulepad, hoe westelijker de
# verticaal en hoe zuidelijker de body-horizontaal — dan kruist niets.
u2p9 = P['U2']['9']
# Lanen liggen NOORD van de SW1/SW2-padrand (y=130,6) en duiken pas bij
# de module schuin hun pad in — de pads zelf liggen op 128,75/130,02/131,29.
b.T('/B_EN', 'F.Cu', 0.15, u2p9, (u2p9[0], 143.4), (156.0, 143.4),
    (156.0, 130.2), (173.5, 130.2), p11)
b.T('/B_LATCH', 'F.Cu', 0.15, P['U2']['8'], (150.675, 142.8), (155.2, 142.8),
    (155.2, 129.55), (174.3, 129.55), P['U1']['10'])
b.T('/B_DATA', 'F.Cu', 0.15, P['U2']['7'], (149.405, 142.2), (154.4, 142.2),
    (154.4, 128.75), P['U1']['9'])
# CC2: J2 pad B5 zit ingesloten (CC1 op F, VBUS-exit noord, DM-jog op B)
# -> B-duik zuid van de VBUS-exit, B-kolom in het venster tussen DM-jog
# (x=104,2) en VBUS-bondloop-B (x=105,2), F-hopje over de DM-zuidlaan,
# dan B-laan y=159,5 en bij R26 omhoog naar F.
b.V('/CC2', 103.45, 150.6)
b.V('/CC2', 104.85, 157.3)
b.V('/CC2', 104.85, 158.5)
b.V('/CC2', 112.2, 159.5)
b.T('/CC2', 'F.Cu', 0.15, P['J2']['B5'], (102.5, 150.25), (103.45, 150.6))
b.T('/CC2', 'B.Cu', 0.2, (103.45, 150.6), (104.65, 150.6), (104.65, 157.0),
    (104.85, 157.0), (104.85, 157.3))
b.T('/CC2', 'F.Cu', 0.2, (104.85, 157.3), (104.85, 158.5))
b.T('/CC2', 'B.Cu', 0.2, (104.85, 158.5), (104.85, 159.5), (112.2, 159.5))
b.T('/CC2', 'F.Cu', 0.2, (112.2, 159.5), (112.2, 161.0), P['R26']['1'])

b.write(os.path.join(OUT_DIR, NAME + ".kicad_pcb"))
open(os.path.join(OUT_DIR, NAME + ".kicad_pro"), "w", encoding="utf-8",
     newline="\n").write(
    '{\n  "meta": {"filename": "%s.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "%s"},\n'
    '  "board": {"design_settings": {"rules": {"min_track_width": 0.127,\n'
    '    "min_clearance": 0.0}}},\n'
    '  "net_settings": {"classes": [{"name": "Default", "clearance": 0.15,\n'
    '    "track_width": 0.2, "via_diameter": 0.5, "via_drill": 0.3,\n'
    '    "priority": -1},\n'
    '   {"name": "usb", "clearance": 0.1, "track_width": 0.15,\n'
    '    "via_diameter": 0.5, "via_drill": 0.3, "priority": 0}],\n'
    '   "netclass_patterns": [{"netclass": "usb", "pattern": "/USB_D*"}],\n'
    '   "meta": {"version": 5}},\n'
    '  "schematic": {"file": "%s.kicad_sch"},\n'
    '  "pcb": {"file": "%s.kicad_pcb"}\n}\n' % (NAME, NAME, NAME, NAME))
for ext in (".kicad_sch",):
    p = os.path.join(OUT_DIR, NAME + ext)
    t = open(p, encoding="utf-8").read().replace(
        '(company "MusicBrain project")', '(company "Guitar Effect Switcher project")')
    open(p, "w", encoding="utf-8", newline="\n").write(t)
print("klaar:", OUT_DIR)
