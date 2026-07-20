"""AXON - ESP32-S3-netbridge voor Cortex (sch + PCB).

Plan: doc/axon-plan.md. ESP32-S3-WROOM-1U (U.FL -> paneelantenne),
W5500 SPI-Ethernet (LQFP48, magjack via 2x7-header naar het paneel,
WIZnet-referentie: 49R9-pull-ups, 6n8 serie in RX, 22n op RCT, 10R naar
TCT, 12k4 EXRES, 25MHz+18p), USB-C (native USB, dev-voeding via SS34),
AMS1117-3.3, 1x6-onderrand naar busboard J19+J25 (of straks de verticale
socket op busboard 3.2).

ESP32-S3-GPIO's: FSPI-defaults naar de W5500 (SCLK=IO12 MOSI=IO11
MISO=IO13 CS=IO10), INT=IO9 RST=IO14; UART naar Teensy TX=IO17 RX=IO18;
LED=IO21; strapping IO0/IO3/IO45/IO46 vrijgehouden.

Koper: USB-C-padparen handmatig gebond (gswitch-les), rest freerouting
(prep_dsn.py --route-gnd) -> seslib.apply_ses (SES_FILE).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board, fmt, rotxy
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-axon"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-20"
REV = "0.1"
NAME = "musicbrain-axon"
TITLE = "MusicBrain AXON - ESP32-S3 netbridge"
SES_FILE = os.path.join(OUT_DIR, NAME + ".ses")

BX0, BY0, BX1, BY1 = 100.0, 100.0, 170.0, 145.0

# ---------- schema ----------
s = Sch("a0a10000-0000-4000-8000-000000000000", NAME, TITLE, REV, DATE,
        ("ESP32-S3-WROOM-1U (U.FL!) - antenne naar het paneel",
         "W5500-magjack op het paneel via J3 (kabel kort houden!)",
         "voeding: busboard J25 (+5V) -> J1; USB-C alleen dev/flash"))

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
# W5500 LQFP48 (datasheet v1.0.2 tabel 2)
W5500_L = [("1", "TXN", "passive"), ("2", "TXP", "passive"),
           ("3", "AGND", "power_in"), ("4", "AVDD", "power_in"),
           ("5", "RXN", "passive"), ("6", "RXP", "passive"),
           ("7", "DNC", "passive"), ("8", "AVDD", "power_in"),
           ("9", "AGND", "power_in"), ("10", "EXRES1", "passive"),
           ("11", "AVDD", "power_in"), ("12", "NC", "passive"),
           ("13", "NC", "passive"), ("14", "AGND", "power_in"),
           ("15", "AVDD", "power_in"), ("16", "AGND", "power_in"),
           ("17", "AVDD", "power_in"), ("18", "VBG", "passive"),
           ("19", "AGND", "power_in"), ("20", "TOCAP", "passive"),
           ("21", "AVDD", "power_in"), ("22", "1V2O", "passive"),
           ("23", "RSVD", "input"), ("24", "SPDLED", "output")]
W5500_R = [("48", "AGND", "power_in"), ("47", "NC", "passive"),
           ("46", "NC", "passive"), ("45", "PMODE0", "input"),
           ("44", "PMODE1", "input"), ("43", "PMODE2", "input"),
           ("42", "RSVD", "input"), ("41", "RSVD", "input"),
           ("40", "RSVD", "input"), ("39", "RSVD", "input"),
           ("38", "RSVD", "input"), ("37", "RSTn", "input"),
           ("36", "INTn", "output"), ("35", "MOSI", "input"),
           ("34", "MISO", "output"), ("33", "SCLK", "input"),
           ("32", "SCSn", "input"), ("31", "XO", "passive"),
           ("30", "XI", "passive"), ("29", "GND", "power_in"),
           ("28", "VDD", "power_in"), ("27", "ACTLED", "output"),
           ("26", "DUPLED", "output"), ("25", "LINKLED", "output")]
AMS_L = [("3", "VIN", "power_in"), ("1", "GND", "power_in")]
AMS_R = [("2", "VOUT", "power_out")]
DIODE_L = [("1", "K", "passive")]
DIODE_R = [("2", "A", "passive")]
USBC_L = [("A1", "GND", "passive"), ("A12", "GND", "passive"),
          ("A4", "VBUS", "passive"), ("A9", "VBUS", "passive"),
          ("A5", "CC1", "passive"), ("A6", "D+", "passive"),
          ("A7", "D-", "passive"), ("A8", "SBU1", "passive")]
USBC_R = [("B1", "GND", "passive"), ("B12", "GND", "passive"),
          ("B4", "VBUS", "passive"), ("B9", "VBUS", "passive"),
          ("B5", "CC2", "passive"), ("B6", "D+", "passive"),
          ("B7", "D-", "passive"), ("B8", "SBU2", "passive"),
          ("SH", "SHIELD", "passive")]
SW_L = [("1", "1", "passive")]
SW_R = [("2", "2", "passive")]
LED_L = [("1", "K", "passive")]
LED_R = [("2", "A", "passive")]
XTAL_L = [("1", "IN", "passive"), ("2", "GND", "power_in")]
XTAL_R = [("3", "OUT", "passive"), ("4", "GND", "power_in")]
FB_L = [("1", "1", "passive")]
FB_R = [("2", "2", "passive")]
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

s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM, MHOLE_SYM,
           box_symbol("ESP32-S3-WROOM-1U", ESP_L, ESP_R, width=25.4),
           box_symbol("W5500", W5500_L, W5500_R, width=25.4),
           box_symbol("AMS1117-33", AMS_L, AMS_R),
           box_symbol("DIODE", DIODE_L, DIODE_R),
           box_symbol("USBC16", USBC_L, USBC_R),
           box_symbol("SW_TACT", SW_L, SW_R),
           box_symbol("LED", LED_L, LED_R),
           box_symbol("XTAL4", XTAL_L, XTAL_R),
           box_symbol("FERRIET", FB_L, FB_R),
           conn_symbol("Conn_02x07", 7),
           conn1_symbol("Conn_01x06", 6),
           conn1_symbol("Conn_01x03", 3),
           power_symbol("GND", False), power_symbol("+5V", True),
           power_symbol("+3V3", True), power_symbol("+3V3A", True)]

PWR = ("GND", "+5V", "+3V3", "+3V3A")

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

def sC(ref, val, x, y, n1, n2, fp="Capacitor_SMD:C_0805_2012Metric"):
    sR(ref, val, x, y, n1, n2, fp=fp, lib="Device:C")

# --- ESP32-module (west) ---
sbox("U1", "ESP32-S3-WROOM-1U", 60, 120,
     ["GND", "+3V3", "ESP_EN", None, None, None, None, None, None,
      "AXON_TX", "AXON_RX", None, "USB_DM", "USB_DP", None, None,
      "W_INT", "W_CS", "W_MOSI", "W_SCLK", "W_MISO"],
     ["GND", "GND", None, None, "DBG_RX", "DBG_TX", None, None, None,
      None, None, None, None, None, "BOOT", None, None, None,
      "LEDK_A", "W_RST"],
     "RF_Module:ESP32-S3-WROOM-1U", width=25.4)

# --- W5500 (oost) ---
sbox("U2", "W5500", 170, 120,
     ["TXN", "TXP", "GND", "+3V3A", "RXN", "RXP", None, "+3V3A", "GND",
      "EXRES", "+3V3A", None, None, "GND", "+3V3A", "GND", "+3V3A", None,
      "GND", "TOCAP", "+3V3A", "V12O", "GND", None],
     ["GND", None, None, None, None, None, None, None, None, None, None,
      "W_RST", "W_INT", "W_MOSI", "W_MISO", "W_SCLK", "W_CS", "XO", "XI",
      "GND", "+3V3", "ACTLED", None, "LINKLED"],
     "Package_QFP:LQFP-48_7x7mm_P0.5mm", width=25.4)

# --- voeding: J1 (busboard J25/J19) + AMS1117 + ferriet ---
def hdr1xn(ref, val, x, y, nets):
    n = len(nets)
    name = f"Conn_01x{n:02d}"
    s.component(f"Custom:{name}", ref, val, x, y, 0,
                f"Connector_PinHeader_2.54mm:PinHeader_1x{n:02d}_P2.54mm_Vertical")
    top = (n - 1) * 1.27
    for k, nm in enumerate(nets):
        yy = y - top + 2.54 * k
        if nm is None:
            s.nc(x - 7.62, yy)
            continue
        s.wire(x - 7.62, yy, x - 11.43, yy)
        if nm in PWR:
            s.power(f"power:{nm}", x - 11.43, yy, 0,
                    vx=x - 11.43, vy=(yy + 3.81 if nm == "GND" else yy - 3.302))
        else:
            s.label(nm, x - 11.43, yy)

hdr1xn("J1", "BUSBOARD (J25+J19)", 30, 55,
       ["+5V", "GND", "AXON_TX", "AXON_RX", "GND", None])
hdr1xn("J4", "DEBUG", 30, 80, ["DBG_TX", "DBG_RX", "GND"])
sbox("U3", "AMS1117-33", 70, 55, ["+5V", "GND"], ["+3V3"],
     "Package_TO_SOT_SMD:SOT-223-3_TabPin2")
sC("C1", "22u", 95, 50, "+5V", "GND")
sC("C2", "100n", 104, 50, "+5V", "GND")
sC("C3", "22u", 113, 50, "+3V3", "GND")
sC("C4", "100n", 122, 50, "+3V3", "GND")
sC("C5", "22u", 131, 50, "+3V3", "GND")
sC("C6", "100n", 140, 50, "+3V3", "GND")
sbox("FB1", "FERRIET", 158, 50, ["+3V3"], ["+3V3A"],
     "Inductor_SMD:L_0805_2012Metric")
sC("C7", "10u", 175, 50, "+3V3A", "GND")
sC("C8", "100n", 184, 50, "+3V3A", "GND")
sC("C9", "100n", 193, 50, "+3V3A", "GND")
sC("C11", "100n", 202, 50, "+3V3A", "GND")
sC("C12", "100n", 211, 50, "+3V3", "GND")
sC("C13", "10u", 220, 50, "+3V3", "GND")

# --- USB-C ---
sbox("J2", "USBC16", 60, 165,
     ["GND", "GND", "VBUS", "VBUS", "CC1", "USB_DP", "USB_DM", None],
     ["GND", "GND", "VBUS", "VBUS", "CC2", "USB_DP", "USB_DM", None, "GND"],
     "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12")
sbox("D2", "DIODE", 60, 185, ["+5V"], ["VBUS"], "Diode_SMD:D_SMA")
sR("R25", "5k1", 85, 185, "CC1", "GND")
sR("R26", "5k1", 96, 185, "CC2", "GND")

# --- module-randspul: EN-RC, knoppen, LED ---
sR("R1", "10k", 110, 80, "+3V3", "ESP_EN")
sC("C10", "1u", 121, 80, "ESP_EN", "GND")
sbox("SW1", "SW_TACT", 110, 97, ["ESP_EN"], ["GND"],
     "Button_Switch_SMD:SW_SPST_SKQG_WithStem")
sbox("SW2", "SW_TACT", 110, 110, ["BOOT"], ["GND"],
     "Button_Switch_SMD:SW_SPST_SKQG_WithStem")
sR("R2", "1k", 135, 80, "LEDK_A", "LEDK")
sbox("D4", "LED", 135, 97, ["GND"], ["LEDK"], "LED_SMD:LED_0805_2012Metric")

# --- W5500-randspul: kristal, EXRES/TOCAP/1V2O ---
sbox("Y1", "XTAL4", 205, 100, ["XI", "GND"], ["XO", "GND"],
     "Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm")
sC("C14", "18p", 225, 95, "XI", "GND")
sC("C15", "18p", 234, 95, "XO", "GND")
sR("R10", "12k4", 205, 120, "EXRES", "GND")
sC("C16", "4u7", 214, 120, "TOCAP", "GND")
sC("C17", "10n", 223, 120, "V12O", "GND")

# --- Ethernet-interface (WIZnet-referentie, magjack op het paneel) ---
sR("R11", "49R9", 240, 120, "+3V3A", "TXP")
sR("R12", "49R9", 249, 120, "+3V3A", "TXN")
sR("R13", "10R", 258, 120, "+3V3A", "TCT")
sC("C18", "6n8", 240, 140, "RD_P", "RXP")
sC("C19", "6n8", 249, 140, "RD_N", "RXN")
sR("R14", "49R9", 258, 140, "RXP", "RXTRM")
sR("R15", "49R9", 267, 140, "RXN", "RXTRM")
sC("C20", "10n", 276, 140, "RXTRM", "GND")
sC("C21", "22n", 285, 140, "RCT", "GND")
sR("R16", "330R", 294, 140, "LINK_K", "LINKLED")
sR("R17", "330R", 303, 140, "ACT_K", "ACTLED")
sC("C22", "1n-2kV", 312, 140, "SHLD", "GND",
   fp="Capacitor_SMD:C_1206_3216Metric")
sR("R18", "1M", 321, 140, "SHLD", "GND")

# J3: magjack-header (2x7) -> paneel-RJ45 met geintegreerde magnetics
J3X, J3Y = 350, 100
s.component("Custom:Conn_02x07", "J3", "MAGJACK (paneel)", J3X, J3Y, 0,
            "Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical")
J3_L = ["TXP", "TXN", "RD_P", "RD_N", "+3V3", "+3V3", "SHLD"]
J3_R = ["TCT", "GND", "RCT", "GND", "LINK_K", "ACT_K", "GND"]
for k in range(7):
    # conn_symbol: oneven links (x-7.62), even rechts (x+7.62); rij k=0
    # (pins 1/2) bovenaan = kleinste sch-y (zelfde patroon als gen_bus3 J21)
    yy = J3Y - (7 - 1) * 1.27 + 2.54 * k
    for nm, xe, sgn in ((J3_L[k], J3X - 7.62, -1), (J3_R[k], J3X + 7.62, 1)):
        xw = xe + sgn * 3.81
        s.wire(xe, yy, xw, yy)
        if nm in PWR:
            s.power(f"power:{nm}", xw, yy, 0,
                    vx=xw, vy=(yy + 3.81 if nm == "GND" else yy - 3.302))
        else:
            s.label(nm, xw, yy)

# montagegaten
for k, ref in enumerate(("H1", "H2", "H3", "H4")):
    s.component("Custom:MHole", ref, "M3", 375 + 8 * k, 130, 0,
                "MountingHole:MountingHole_3.2mm_M3_Pad")
    s.wire(375 + 8 * k - 2.54, 130, 375 + 8 * k - 5.08, 130)
    s.power("power:GND", 375 + 8 * k - 5.08, 130)

# PWR_FLAGs: +5V/GND/VBUS/+3V3A passief gevoed; +3V3 heeft U3 (power_out)
s.wire(20, 240, 25.08, 240); s.power("power:+5V", 20, 240); s.flag(25.08, 240)
s.wire(40, 240, 45.08, 240); s.power("power:GND", 40, 240); s.flag(45.08, 240)
s.wire(60, 240, 65.08, 240); s.power("power:+3V3A", 60, 240); s.flag(65.08, 240)
s.wire(80, 240, 85.08, 240); s.label("VBUS", 80, 240); s.flag(85.08, 240)

s.text("AXON: W5500 op FSPI (SCLK=IO12 MOSI=IO11 MISO=IO13 CS=IO10,\\n"
       "INT=IO9 RST=IO14); UART naar Teensy DLG1: TX=IO17 RX=IO18.\\n"
       "PMODE open = all-capable autoneg. RSVD23 aan GND (datasheet).\\n"
       "Magjack-kabel kort (<15 cm) en paren bij elkaar houden!\\n"
       "Voeding: busboard J25 (+5V); USB-C alleen flash/debug (SS34).", 20, 20)
s.write(os.path.join(OUT_DIR, NAME + ".kicad_sch"))

# ================= PCB =================
NETS = ['', 'GND', '+5V', '+3V3', '+3V3A', '/VBUS', '/ESP_EN', '/BOOT',
        '/USB_DP', '/USB_DM', '/CC1', '/CC2', '/LEDK', '/LEDK_A',
        '/DBG_TX', '/DBG_RX', '/AXON_TX', '/AXON_RX',
        '/W_SCLK', '/W_MOSI', '/W_MISO', '/W_CS', '/W_INT', '/W_RST',
        '/XI', '/XO', '/EXRES', '/TOCAP', '/V12O',
        '/TXP', '/TXN', '/RXP', '/RXN', '/RD_P', '/RD_N', '/TCT', '/RCT',
        '/RXTRM', '/LINKLED', '/ACTLED', '/LINK_K', '/ACT_K', '/SHLD']

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
    (company "MusicBrain project")
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

b = BBoard(TITLE, REV, (135, 142.8, 0), BX0, BY0, BX1, BY1, NETS, DATE)
b.paper = "A3"
b.silk_texts = [
    (f"MUSICBRAIN AXON  rev {REV}", 133, 101.2, 0),
    ("musicbrain.nl/hw/axon", 133, 103.2, 0),
    ("5V GND TX RX GND -", 134, 143.6, 0),
]
P = b.P
import re as _re

def ref_off(dx, dy, rot=0):
    """Verschuif de Reference-silk van het laatst geplaatste onderdeel naar
    een offset (dx,dy) in het fp-lokale frame - hoek-onderdelen zetten hun
    ref anders over de bordrand."""
    t = b.fp_texts[-1]
    t = _re.sub(r'(\(property "Reference" "[^"]+"\s*\(at )[-\d.]+ [-\d.]+ ?[-\d.]*(\))',
                lambda m: f'{m.group(1)}{fmt(dx)} {fmt(dy)} {rot}{m.group(2)}',
                t, count=1)
    b.fp_texts[-1] = t

# ---------- plaatsing (70x45) ----------
# west: USB-C + module; zuid: J1 + LDO + debug; oost: W5500 + magjack-header
b.fp('Connector_USB.pretty\\USB_C_Receptacle_HRO_TYPE-C-31-M-12.kicad_mod',
     'Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12', 'J2', 'USB-C',
     105.55, 122, 90, b.nm({'A1': 'GND', 'B12': 'GND', 'A12': 'GND',
                            'B1': 'GND', 'A4': '/VBUS', 'B9': '/VBUS',
                            'A9': '/VBUS', 'B4': '/VBUS', 'A5': '/CC1',
                            'B5': '/CC2', 'A6': '/USB_DP', 'B6': '/USB_DP',
                            'A7': '/USB_DM', 'B7': '/USB_DM', 'SH': 'GND'}))
ref_off(0, 5.5)   # J2-ref oost van de connector (default valt west, buiten)
b.fp('RF_Module.pretty\\ESP32-S3-WROOM-1U.kicad_mod',
     'RF_Module:ESP32-S3-WROOM-1U', 'U1', 'ESP32-S3-WROOM-1U-N8R2',
     123, 116.5, 0, b.nm({
         '1': 'GND', '2': '+3V3', '3': '/ESP_EN',
         '10': '/AXON_TX', '11': '/AXON_RX',
         '13': '/USB_DM', '14': '/USB_DP',
         '17': '/W_INT', '18': '/W_CS', '19': '/W_MOSI', '20': '/W_SCLK',
         '21': '/W_MISO',
         '22': '/W_RST', '23': '/LEDK_A', '27': '/BOOT',
         '36': '/DBG_TX', '37': '/DBG_RX',
         '40': 'GND', '41': 'GND'}), skip_pad_drill=0.2)
b.fp_texts[-1] = b.fp_texts[-1].replace(
    '${KICAD10_3DMODEL_DIR}/RF_Module.3dshapes/ESP32-S3-WROOM-1U.step',
    '${KIPRJMOD}/../3dshapes/ESP32_WROOM1U.wrl')
b.fp('Package_QFP.pretty\\LQFP-48_7x7mm_P0.5mm.kicad_mod',
     'Package_QFP:LQFP-48_7x7mm_P0.5mm', 'U2', 'W5500', 149, 116, 180,
     b.nm({'1': '/TXN', '2': '/TXP', '3': 'GND', '4': '+3V3A', '5': '/RXN',
           '6': '/RXP', '8': '+3V3A', '9': 'GND', '10': '/EXRES',
           '11': '+3V3A', '14': 'GND', '15': '+3V3A', '16': 'GND',
           '17': '+3V3A', '19': 'GND', '20': '/TOCAP', '21': '+3V3A',
           '22': '/V12O', '23': 'GND', '25': '/LINKLED', '27': '/ACTLED',
           '28': '+3V3', '29': 'GND', '30': '/XI', '31': '/XO',
           '32': '/W_CS', '33': '/W_SCLK', '34': '/W_MISO', '35': '/W_MOSI',
           '36': '/W_INT', '37': '/W_RST', '48': 'GND'}))
b.fp('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U3', 'AMS1117-3.3',
     127, 138, 0, b.nm({'3': '+5V', '1': 'GND', '2': '+3V3'}))
b.fp('Diode_SMD.pretty\\D_SMA.kicad_mod', 'Diode_SMD:D_SMA', 'D2', 'SS34',
     111, 137.4, 0, b.rc('+5V', '/VBUS'))
b.fp('LED_SMD.pretty\\LED_0805_2012Metric.kicad_mod',
     'LED_SMD:LED_0805_2012Metric', 'D4', 'LED-GN', 136.3, 124.0, 90,
     b.rc('GND', '/LEDK'))
b.fp('Button_Switch_SMD.pretty\\SW_SPST_SKQG_WithStem.kicad_mod',
     'Button_Switch_SMD:SW_SPST_SKQG_WithStem', 'SW1', 'RESET', 114, 132, 0,
     b.nm({'1': '/ESP_EN', '2': 'GND'}))
b.fp('Button_Switch_SMD.pretty\\SW_SPST_SKQG_WithStem.kicad_mod',
     'Button_Switch_SMD:SW_SPST_SKQG_WithStem', 'SW2', 'BOOT', 122.5, 130.5, 0,
     b.nm({'1': '/BOOT', '2': 'GND'}))
b.fp('Crystal.pretty\\Crystal_SMD_3225-4Pin_3.2x2.5mm.kicad_mod',
     'Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm', 'Y1', '25MHz',
     138.5, 113, 0, b.nm({'1': '/XI', '2': 'GND', '3': '/XO', '4': 'GND'}))

# headers
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x06_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical', 'J1',
     'BUSBOARD', 134, 141.5, 90, b.nm({'1': '+5V', '2': 'GND',
                                       '3': '/AXON_TX', '4': '/AXON_RX',
                                       '5': 'GND'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x07_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical', 'J3',
     'MAGJACK', 164.5, 110.5, 0,
     b.nm({'1': '/TXP', '2': '/TCT', '3': '/TXN', '4': 'GND',
           '5': '/RD_P', '6': '/RCT', '7': '/RD_N', '8': 'GND',
           '9': '+3V3', '10': '/LINK_K', '11': '+3V3', '12': '/ACT_K',
           '13': '/SHLD', '14': 'GND'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x03_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical', 'J4',
     'DEBUG', 153, 141.5, 90, b.nm({'1': '/DBG_TX', '2': '/DBG_RX',
                                    '3': 'GND'}))

# R/C-strooigoed
RC = [
    # voeding
    ('C1', '22u', 131.5, 132.3, 90, b.rc('+5V', 'GND')),
    ('C2', '100n', 133.7, 132.3, 90, b.rc('+5V', 'GND')),
    ('C3', '22u', 117, 140.5, 0, b.rc('+3V3', 'GND')),
    ('C4', '100n', 135.9, 132.3, 90, b.rc('+3V3', 'GND')),
    ('C5', '22u', 108.5, 110, 90, b.rc('+3V3', 'GND')),
    ('C6', '100n', 111, 110, 90, b.rc('+3V3', 'GND')),
    ('FB1', 'FB121', 139, 134, 0, b.rc('+3V3', '+3V3A')),
    ('C7', '10u', 143, 134, 0, b.rc('+3V3A', 'GND')),
    ('C8', '100n', 150.8, 108, 90, b.rc('+3V3A', 'GND')),
    ('C9', '100n', 159, 111, 90, b.rc('+3V3A', 'GND')),
    ('C11', '100n', 153.5, 124, 90, b.rc('+3V3A', 'GND')),
    ('C12', '100n', 142, 110.8, 90, b.rc('+3V3', 'GND')),
    ('C13', '10u', 139.5, 108.5, 90, b.rc('+3V3', 'GND')),
    # ESP-randspul
    ('R1', '10k', 110, 102.8, 0, b.rc('+3V3', '/ESP_EN')),
    ('C10', '1u', 113.5, 102.8, 0, b.rc('/ESP_EN', 'GND')),
    ('R2', '1k', 133.9, 124.0, 90, b.rc('/LEDK_A', '/LEDK')),
    ('R25', '5k1', 102.9, 131, 0, b.rc('/CC1', 'GND')),
    ('R26', '5k1', 102.9, 133.5, 0, b.rc('/CC2', 'GND')),
    # W5500-randspul
    ('C14', '18p', 135.3, 115.9, 90, b.rc('/XI', 'GND')),
    ('C15', '18p', 135.3, 111.5, 90, b.rc('/XO', 'GND')),
    ('R10', '12k4', 161.5, 114, 90, b.rc('/EXRES', 'GND')),
    ('C16', '4u7', 148.3, 108, 90, b.rc('/TOCAP', 'GND')),
    ('C17', '10n', 146, 108, 90, b.rc('/V12O', 'GND')),
    # Ethernet-analoog (tussen U2 en J3)
    ('R11', '49R9', 156.5, 104, 90, b.rc('+3V3A', '/TXP')),
    ('R12', '49R9', 159, 104, 90, b.rc('+3V3A', '/TXN')),
    ('R13', '10R', 156.5, 111, 90, b.rc('+3V3A', '/TCT')),
    ('C18', '6n8', 156.5, 118, 90, b.rc('/RD_P', '/RXP')),
    ('C19', '6n8', 159, 118, 90, b.rc('/RD_N', '/RXN')),
    ('R14', '49R9', 156.5, 125, 90, b.rc('/RXP', '/RXTRM')),
    ('R15', '49R9', 159, 125, 90, b.rc('/RXN', '/RXTRM')),
    ('C20', '10n', 161.5, 129.5, 90, b.rc('/RXTRM', 'GND')),
    ('C21', '22n', 164, 129.5, 90, b.rc('/RCT', 'GND')),
    ('R16', '330R', 152.5, 104.2, 0, b.rc('/LINK_K', '/LINKLED')),
    ('R17', '330R', 152.5, 102.2, 0, b.rc('/ACT_K', '/ACTLED')),
    ('R18', '1M', 152.5, 137.5, 0, b.rc('/SHLD', 'GND')),
]
for ref, val, x, y, rot, nm in RC:
    if ref == 'FB1':
        fp = ('Inductor_SMD.pretty\\L_0805_2012Metric.kicad_mod',
              'Inductor_SMD:L_0805_2012Metric')
    elif ref.startswith('C'):
        fp = ('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
              'Capacitor_SMD:C_0805_2012Metric')
    else:
        fp = ('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
              'Resistor_SMD:R_0805_2012Metric')
    b.fp(fp[0], fp[1], ref, val, x, y, rot, nm)
b.fp('Capacitor_SMD.pretty\\C_1206_3216Metric.kicad_mod',
     'Capacitor_SMD:C_1206_3216Metric', 'C22', '1n-2kV', 156.5, 137.5, 0,
     b.rc('/SHLD', 'GND'))

# montagegaten (ref naar binnen: default valt over de bordrand)
for ref, x, y, rdx, rdy in (('H1', 104, 104, 2.6, 1.8), ('H2', 166, 104, -2.6, 1.8),
                            ('H3', 104, 141, 2.6, -1.8), ('H4', 166, 141, -2.6, -1.8)):
    b.fp('MountingHole.pretty\\MountingHole_3.2mm_M3_Pad.kicad_mod',
         'MountingHole:MountingHole_3.2mm_M3_Pad', ref, 'M3', x, y, 0,
         b.nm({'1': 'GND'}))
    ref_off(rdx, rdy)

# ---------- handwerk: USB-C-padparen (gswitch-les) ----------
YJ = 122.0
A6, B6 = P['J2']['A6'], P['J2']['B6']
A7, B7 = P['J2']['A7'], P['J2']['B7']
A4, A9 = P['J2']['A4'], P['J2']['A9']
b.T('/USB_DP', 'F.Cu', 0.15, B6, (104.0, B6[1]), (104.0, A6[1]), A6)
b.V('/USB_DM', 103.1, A7[1])
b.V('/USB_DM', 103.1, B7[1])
b.T('/USB_DM', 'F.Cu', 0.15, A7, (103.1, A7[1]))
b.T('/USB_DM', 'B.Cu', 0.15, (103.1, A7[1]), (103.1, B7[1]))
b.T('/USB_DM', 'F.Cu', 0.15, (103.1, B7[1]), B7)
b.V('/VBUS', 103.8, YJ + 1.98)
b.V('/VBUS', 103.8, YJ - 1.98)
b.T('/VBUS', 'F.Cu', 0.25, A4, (103.5, YJ + 1.98), (103.8, YJ + 1.98))
b.T('/VBUS', 'B.Cu', 0.25, (103.8, YJ + 1.98), (103.8, YJ - 1.98))
b.T('/VBUS', 'F.Cu', 0.25, (103.8, YJ - 1.98), (103.5, YJ - 1.98), A9)

# ---- volledige handroutes (protected wiring; freerouting routeert eromheen;
# in apply_ses geskipt). Alle coordinaten pad-gebaseerd, dus SES-onafhankelijk.
# USB_DM: bond -> F-laan y=123,25 rechtstreeks naar module-p13
b.T('/USB_DM', 'F.Cu', 0.15, (103.1, 122.75), (103.6, 123.25),
    (113.4, 123.25), (114.25, 123.33))
# USB_DP: bond -> via -> B-laan y=123,2 -> oostwaarts omhoog naar p14
b.V('/USB_DP', 105.35, 122.25)
b.T('/USB_DP', 'F.Cu', 0.15, (104, 122.25), (105.35, 122.25))
b.T('/USB_DP', 'B.Cu', 0.15, (105.35, 122.25), (106.3, 123.2), (113.4, 123.2),
    (114.9, 124.7), (115.05, 125.5))
b.V('/USB_DP', 115.05, 125.5)
b.T('/USB_DP', 'F.Cu', 0.15, (115.05, 125.5), (114.6, 124.85), (114.25, 124.6))
# CC1: A5 -> via -> B-westlaan x=101,07 (venster bordrand/SH-poot) -> R25
b.V('/CC1', 102.75, 123.6)
b.T('/CC1', 'F.Cu', 0.15, (101.505, 123.25), (102.35, 123.25), (102.75, 123.6))
b.T('/CC1', 'B.Cu', 0.15, (102.75, 123.6), (101.07, 125.2), (101.07, 129.9),
    (101.3, 130.4))
b.V('/CC1', 101.3, 130.4)
b.T('/CC1', 'F.Cu', 0.15, (101.3, 130.4), (101.9875, 131.0))
# CC2: B5 -> via -> B-westlaan x=100,72 -> R26
b.V('/CC2', 102.9, 120.7)
b.T('/CC2', 'F.Cu', 0.15, (101.505, 120.25), (102.4, 120.25), (102.9, 120.7))
b.T('/CC2', 'B.Cu', 0.15, (102.9, 120.7), (100.72, 122.85), (100.72, 131.2),
    (100.85, 131.6))
b.V('/CC2', 100.85, 131.6)
b.T('/CC2', 'F.Cu', 0.15, (100.85, 131.6), (101.9875, 132.6), (101.9875, 133.5))
# LEDK_A: module-p23 (binnenpad) -> zuidband onder de module -> om p27 heen ->
# R2-pad1; LEDK: R2-pad2 -> D4-pad2
b.T('/LEDK_A', 'F.Cu', 0.15, (125.25, 120.662), (125.25, 124.5),
    (130.72, 124.5), (130.72, 125.35), (133.2, 125.35), (133.9, 124.95))
b.T('/LEDK', 'F.Cu', 0.25, (133.9, 123.05), (136.3, 123.05))
# binnen- en buitenpad van module-p23 koppelen (KiCad ziet ze los)
b.T('/LEDK_A', 'F.Cu', 0.15, (125.25, 124.5), (126.175, 125.85))

# GND-hechtvia's: hoeken + verdeeld
for x, y in ((102, 102), (168, 102), (102, 143), (168, 143), (135, 101.5),
             (112, 128), (128, 130), (140, 128), (152, 128), (160, 121),
             (135, 112), (145, 102), (155, 138), (118, 141)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

# freerouting-SES inbakken
import seslib
def veilige_stubs(bd, r=1.4, guard=0.45):
    """snap_stubs, maar een stub mag niet binnen `guard` van een pad van
    een ander net komen (fine-pitch-les: LQFP/USB-padrijen)."""
    import math
    from collections import Counter
    pads = []
    for ref, m in bd.PNET.items():
        for pad, ni in m.items():
            px, py = bd.P[ref][pad]
            pads.append((ni, px, py))
    ends = Counter()
    for net, layer, w, pts in bd.tracks:
        ends[(net, round(pts[0][0], 3), round(pts[0][1], 3))] += 1
        ends[(net, round(pts[-1][0], 3), round(pts[-1][1], 3))] += 1
    added = 0
    for net, layer, w, pts in list(bd.tracks):
        for end in (pts[0], pts[-1]):
            if ends[(net, round(end[0], 3), round(end[1], 3))] != 1:
                continue
            best = None
            for ni, px, py in pads:
                if ni != net:
                    continue
                d = math.hypot(end[0] - px, end[1] - py)
                if 0.01 < d <= r and (best is None or d < best[0]):
                    best = (d, px, py)
            if not best:
                continue
            _, px, py = best
            ok = True
            for ni, qx, qy in pads:
                if ni == net:
                    continue
                ax, ay = end
                dx, dy = px - ax, py - ay
                L2 = dx * dx + dy * dy
                t = 0 if L2 == 0 else max(0, min(1, ((qx - ax) * dx + (qy - ay) * dy) / L2))
                if math.hypot(qx - (ax + t * dx), qy - (ay + t * dy)) < guard:
                    ok = False
                    break
            if ok:
                bd.tracks.append((net, layer, w, [tuple(end), (px, py)]))
                added += 1
    return added

if os.path.exists(SES_FILE):
    n = seslib.apply_ses(b, SES_FILE, skip=(
        '/USB_DP', '/USB_DM', '/CC1', '/CC2', '/LEDK', '/LEDK_A'))
    print('SES applied:', n)
    print('veilige stubs:', veilige_stubs(b, r=2.2))






b.write(os.path.join(OUT_DIR, NAME + ".kicad_pcb"))
open(os.path.join(OUT_DIR, NAME + ".kicad_pro"), "w", encoding="utf-8",
     newline="\n").write(
    '{\n  "meta": {"filename": "%s.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "%s"},\n'
    '  "board": {"design_settings": {"rules": {"min_track_width": 0.127,\n'
    '    "min_clearance": 0.0}}},\n'
    '  "net_settings": {"classes": [{"name": "Default", "clearance": 0.15,\n'
    '    "track_width": 0.25, "via_diameter": 0.5, "via_drill": 0.3,\n'
    '    "priority": -1},\n'
    '   {"name": "usb", "clearance": 0.1, "track_width": 0.15,\n'
    '    "via_diameter": 0.6, "via_drill": 0.3, "priority": 0},\n'
    '   {"name": "power", "clearance": 0.15, "track_width": 0.3,\n'
    '    "via_diameter": 0.5, "via_drill": 0.3, "priority": 1}],\n'
    '   "netclass_patterns": [{"netclass": "usb", "pattern": "/USB_D*"},\n'
    '    {"netclass": "power", "pattern": "+5V"},\n'
    '    {"netclass": "power", "pattern": "+3V3"},\n'
    '    {"netclass": "power", "pattern": "+3V3A"}],\n'
    '   "meta": {"version": 5}},\n'
    '  "schematic": {"file": "%s.kicad_sch"},\n'
    '  "pcb": {"file": "%s.kicad_pcb"}\n}\n' % (NAME, NAME, NAME, NAME))
print('KLAAR (sch + pcb + pro)')
