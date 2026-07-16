"""Guitar Effect Switcher LOOP8-SH - 8x relaisloop, compact, schroefklemmen.

Klantvariant (Sander van Herk): zo klein en laag mogelijk. De 8 dubbele
stapeljacks zijn vervangen door 3-polige 3,5mm-schroefklemmen (Phoenix
PT 1,5/3-3,5-H: SEND / AGND / RETURN per loop, kabels zelf solderen);
audio-IN/UIT blijven echte jacks (ACJS-MH), RJ45-keten en de audio/chain-
doorlinks blijven. 150 x 44 mm i.p.v. 200 x 58.

LET OP t.o.v. loop8: geen jack-verbreekcontacten meer -> geen normalling
van een lege loop (relais-NC vangt alles zolang de loop uit staat) en
geen JP2-mute op de loops (JP2 blijft wel op de IN-jack).

Handroutes: audio, +12V-rail, CHASSIS. Rest: freerouting
(gswitch_dsn_prep.py --keepout-box) -> seslib.apply_ses.
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, box_symbol, R_SYM, C_SYM, CP_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board, fmt, rotxy
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\gswitch-loop8sh"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-16"
REV = "0.1"
NAME = "gswitch-loop8sh"
TITLE = "GSwitch LOOP8-SH - 8x relaisloop compact (schroefklemmen)"
SES_FILE = os.path.join(OUT_DIR, NAME + ".ses")   # via freerouting; mag ontbreken

# ---------- geometrie (PCB) ----------
BX0, BY0, BX1, BY1 = 100.0, 100.0, 250.0, 144.0
TX = [131.5 + 12.0 * k for k in range(8)]          # klem-ankers (pin 1)
TY = 103.75                                        # klem-anker y (draad naar noord)
RY = 119.5                                         # relais-anker y (courtyard 15,5!)
BLEED_Y = 110.15                                   # 1M-bleeders tussen klem en relais
Z_AGND_S = 127.8                                   # zuidrand AGND-zones
Z_GND_N = 128.6                                    # noordrand GND-zones
RAIL12 = 128.2                                     # +12V B-rail y (in de zone-spleet)
OUTPIN = {1: '11', 2: '12', 3: '13', 4: '14', 5: '15', 6: '18', 7: '17', 8: '16'}
TERM_FP = ('TerminalBlock_Phoenix:'
           'TerminalBlock_Phoenix_PT-1,5-3-3.5-H_1x03_P3.50mm_Horizontal')
TERM_MOD = ('TerminalBlock_Phoenix.pretty\\'
            'TerminalBlock_Phoenix_PT-1,5-3-3.5-H_1x03_P3.50mm_Horizontal'
            '.kicad_mod')

# ---------- schema ----------
s = Sch("6510f000-0000-4000-8000-00000000005a", NAME, TITLE, REV, DATE,
        ("Loop-cel: DPDT-relais, bypass op NC; klem = SEND/AGND/RETURN",
         "GEEN normalling: lege loop niet activeren (of in firmware uitvinken)",
         "AGND/GND gescheiden; EN-failsafe; TERM-jumper op laatste bord",
         "spec: doc/guitar-switcher-spec.md"))

KLEM_L = [("1", "SEND", "passive"), ("2", "AGND", "passive"),
          ("3", "RET", "passive")]
JACKS_L = [("T", "T", "passive"), ("R", "R", "passive"), ("S", "S", "passive")]
JACKS_R = [("TN", "TN", "passive"), ("RN", "RN", "passive"), ("SN", "SN", "passive")]
RELAY_L = [("1", "COIL+", "passive"), ("12", "COIL-", "passive"),
           ("9", "COM2", "passive"), ("10", "NC2", "passive"),
           ("8", "NO2", "passive")]
RELAY_R = [("4", "COM1", "passive"), ("3", "NC1", "passive"),
           ("5", "NO1", "passive")]
RJ45_L = [(str(p), f"P{p}", "passive") for p in range(1, 9)]
RJ45_R = [("SH", "SHIELD", "passive")]
HC14_L = [("1", "1A", "input"), ("2", "1Y", "output"), ("3", "2A", "input"),
          ("4", "2Y", "output"), ("5", "3A", "input"), ("6", "3Y", "output"),
          ("7", "GND", "power_in")]
HC14_R = [("14", "VCC", "power_in"), ("13", "6A", "input"), ("12", "6Y", "output"),
          ("11", "5A", "input"), ("10", "5Y", "output"), ("9", "4A", "input"),
          ("8", "4Y", "output")]
HC595_L = [("14", "DS", "input"), ("11", "SHCP", "input"), ("12", "STCP", "input"),
           ("13", "~{OE}", "input"), ("10", "~{MR}", "input"), ("8", "GND", "power_in")]
HC595_R = [("16", "VCC", "power_in"), ("15", "Q0", "output"), ("1", "Q1", "output"),
           ("2", "Q2", "output"), ("3", "Q3", "output"), ("4", "Q4", "output"),
           ("5", "Q5", "output"), ("6", "Q6", "output"), ("7", "Q7", "output"),
           ("9", "Q7S", "output")]
ULN_L = [(str(p), f"I{p}", "input") for p in range(1, 9)] + [("9", "GND", "power_in")]
ULN_R = [("10", "COM", "passive")] + [(str(p), f"O{p-10}", "output")
                                      for p in range(18, 10, -1)]
AMS_L = [("3", "VIN", "power_in"), ("1", "GND", "power_in")]
AMS_R = [("2", "VOUT", "power_out")]
TVS_L = [("1", "K", "passive")]
TVS_R = [("2", "A", "passive")]
LED_L = [("1", "K", "passive")]
LED_R = [("2", "A", "passive")]

SJ_SYM = '''    (symbol "Custom:SolderJumper"
      (pin_names (offset 0) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "JP" (at 0 3.81 0) (effects (font (size 1.27 1.27))))
      (property "Value" "SJ" (at 0 -3.81 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "SolderJumper_0_1"
        (polyline (pts (xy -1.905 0) (xy -0.635 0.889) (xy -0.635 -0.889) (xy -1.905 0))
          (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 1.905 0) (xy 0.635 0.889) (xy 0.635 -0.889) (xy 1.905 0))
          (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "SolderJumper_1_1"
        (pin passive line (at -3.81 0 0) (length 1.905)
          (name "1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 3.81 0 180) (length 1.905)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )'''
MHOLE_SYM = '''    (symbol "Custom:MHole"
      (pin_names (offset 0) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "H" (at 0 2.54 0) (effects (font (size 1.27 1.27))))
      (property "Value" "M3" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "MHole_0_1"
        (circle (center 0 0) (radius 1.27) (stroke (width 0.254) (type default)) (fill (type none)))
      )
    )'''

s.libs += [R_SYM, C_SYM, CP_SYM, FLAG_SYM, SJ_SYM, MHOLE_SYM,
           conn_symbol("Conn_02x04", 4),
           box_symbol("KLEM3", KLEM_L, []),
           box_symbol("ACJS_MH", JACKS_L, JACKS_R),
           box_symbol("RELAY_DPDT", RELAY_L, RELAY_R),
           box_symbol("RJ45_S", RJ45_L, RJ45_R),
           box_symbol("74HC14", HC14_L, HC14_R),
           box_symbol("74HC595", HC595_L, HC595_R),
           box_symbol("ULN2803A", ULN_L, ULN_R),
           box_symbol("AMS1117-50", AMS_L, AMS_R),
           box_symbol("TVS", TVS_L, TVS_R),
           box_symbol("LED", LED_L, LED_R),
           power_symbol("GND", False), power_symbol("+12V", True),
           power_symbol("+5V", True),
           '''    (symbol "Custom:Conn_01x02"
      (pin_names (offset 1.016) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "J" (at 0 5.08 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Conn" (at 0 -5.08 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "Conn_01x02_0_1"
        (rectangle (start -1.27 2.54) (end 0 -2.54)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "Conn_01x02_1_1"
        (pin passive line (at -3.81 1.27 0) (length 2.54)
          (name "Pin_1" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at -3.81 -1.27 0) (length 2.54)
          (name "Pin_2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )''']

PWR = ("GND", "+12V", "+5V")

def sbox(ref, sym, x, y, left, right, fp, width=17.78):
    """Plaats box-symbool + bedraad alle pinnen (net-label / power / NC)."""
    s.component(f"Custom:{sym}", ref, sym, x, y, 0, fp)
    rows = max(len(left), len(right)) if (left or right) else 0
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
    """Verticale R/C: pin1 boven (n1), pin2 onder (n2)."""
    s.component(lib, ref, val, x, y, 0, fp)
    top = 3.81
    for nm, yy, ye in ((n1, y - top, y - top - 2.54), (n2, y + top, y + top + 2.54)):
        if nm in PWR:
            s.wire(x, yy, x, ye)
            s.power(f"power:{nm}", x, ye, 0,
                    vx=x, vy=(ye + 3.81 if nm == "GND" else ye - 3.302))
        else:
            s.wire(x, yy, x, ye)
            s.label(nm, x, ye)

# --- loop-cellen ---
for k in range(1, 9):
    col, row = (k - 1) % 4, (k - 1) // 4
    cx, cy = 48 + 56 * col, 50 + 100 * row
    sbox(f"J{10+k}", "KLEM3", cx, cy,
         [f"SEND{k}", "AGND", f"RET{k}"], [], TERM_FP)
    sbox(f"K{k}", "RELAY_DPDT", cx, cy + 42,
         ["+12V", f"RLY{k}", f"N{k-1}", f"BYP{k}", f"SEND{k}"],
         [f"N{k}", f"BYP{k}", f"RET{k}"],
         "Relay_SMD:Relay_DPDT_Kemet_EE2_NU")
    sR(f"R{2*k-1}", "1M", cx - 5, cy + 64, f"SEND{k}", "AGND")
    sR(f"R{2*k}", "1M", cx + 5, cy + 64, f"RET{k}", "AGND")

# --- besturing ---
CTL_Y = 252
sbox("J1", "RJ45_S", 30, CTL_Y,
     ["CLK_J", "GND", "DATA_J", "+12V", "GND", "DRET_J", "LATCH_J", "EN_J"],
     ["CHASSIS"], "GSwitch:RJ45_shielded")
sbox("J2", "RJ45_S", 372, CTL_Y,
     ["CLK_T", "GND", "SER_T", "+12V", "GND", "DRETT_J", "LATCH_T", "EN_T"],
     ["CHASSIS"], "GSwitch:RJ45_shielded")
sbox("U2", "74HC14", 130, CTL_Y,
     ["CLK_A", "CLK_N", "CLK_N", "CLK_O", "LATCH_A", "LATCH_N", "GND"],
     ["+5V", "OE_N", "EN_O", "EN_A", "OE_N", "LATCH_N", "LATCH_O"],
     "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
sbox("U3", "74HC14", 175, CTL_Y,
     ["DATA_A", "DATA_N", "DATA_N", "DATA_O", "DRET_A", "DRET_N", "GND"],
     ["+5V", "GND", None, "GND", None, "DRET_N", "DRET_O"],
     "Package_SO:SOIC-14_3.9x8.7mm_P1.27mm")
sbox("U1", "74HC595", 222, CTL_Y,
     ["DATA_O", "CLK_O", "LATCH_O", "OE_N", "+5V", "GND"],
     ["+5V", "D8", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "SER"],
     "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm")
sbox("U4", "ULN2803A", 268, CTL_Y,
     ["D6", "D7", "D8", "D5", "D4", "D3", "D2", "D1", "GND"],
     ["+12V", "RLY6", "RLY7", "RLY8", "RLY5", "RLY4", "RLY3", "RLY2", "RLY1"],
     "Package_SO:SOIC-18W_7.5x11.6mm_P1.27mm")
sbox("U5", "AMS1117-50", 315, CTL_Y - 8,
     ["+12V", "GND"], ["+5V"], "Package_TO_SOT_SMD:SOT-223-3_TabPin2")
sbox("D1", "TVS", 315, CTL_Y + 8, ["+12V"], ["GND"], "Diode_SMD:D_SMA")
sbox("D2", "LED", 345, CTL_Y + 8, ["GND"], ["LEDA"], "LED_SMD:LED_0805_2012Metric")

# serie-R's (100R) + pulldowns (100k)
SERIES = [("R17", "CLK_J", "CLK_A"), ("R18", "DATA_J", "DATA_A"),
          ("R19", "LATCH_J", "LATCH_A"), ("R20", "EN_J", "EN_A"),
          ("R21", "DRET_O", "DRET_J"), ("R22", "CLK_O", "CLK_T"),
          ("R23", "SER", "SER_T"), ("R24", "LATCH_O", "LATCH_T"),
          ("R25", "EN_O", "EN_T"), ("R26", "DRETT_J", "DRET_A")]
for j, (ref, n1, n2) in enumerate(SERIES):
    sR(ref, "100R", 55 + 11 * j, CTL_Y + 33, n1, n2)
PULL = [("R27", "CLK_A"), ("R28", "DATA_A"), ("R29", "LATCH_A"),
        ("R30", "EN_A"), ("R31", "DRET_A")]
for j, (ref, n1) in enumerate(PULL):
    sR(ref, "100k", 165 + 11 * j, CTL_Y + 33, n1, "GND")
sR("R32", "4k7", 345, CTL_Y - 8, "+5V", "LEDA")
sR("R33", "1M", 220, CTL_Y + 33, "GND", "CHASSIS")

# condensatoren
sR("C1", "100u/25V", 242, CTL_Y + 33, "+12V", "GND",
   fp="Capacitor_SMD:CP_Elec_6.3x7.7", lib="Device:C_Polarized")
sR("C2", "100n", 253, CTL_Y + 33, "+12V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C3", "10u", 264, CTL_Y + 33, "+5V", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
for j, ref in enumerate(("C4", "C5", "C6")):
    sR(ref, "100n", 275 + 11 * j, CTL_Y + 33, "+5V", "GND",
       fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")
sR("C7", "100n", 231, CTL_Y + 33, "GND", "CHASSIS",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")

# jumpers
def sj(ref, val, x, y, n1, n2):
    s.component("Custom:SolderJumper", ref, val, x, y, 0,
                "Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm")
    s.wire(x - 3.81, y, x - 7.62, y); s.label(n1, x - 7.62, y)
    s.wire(x + 3.81, y, x + 7.62, y); s.label(n2, x + 7.62, y)

sj("JP1", "TERM (laatste bord)", 315, CTL_Y + 22, "SER", "DRET_A")
sj("JP2", "IN-TN=AGND", 345, CTL_Y + 22, "AGND", "INTN")
sj("JP3", "AGND=CHASSIS", 375, CTL_Y + 22, "CHASSIS", "AGND")

# audio in/uit + doorlink
sbox("J7", "ACJS_MH", 372, 50, ["N0", "AGND", "AGND"], ["INTN", "AGND", "AGND"],
     "GSwitch:ACJS_MH")
sbox("J8", "ACJS_MH", 372, 85, ["N8", "AGND", "AGND"], [None, "AGND", "AGND"],
     "GSwitch:ACJS_MH")

def s1x2(ref, val, x, y, n1, n2):
    s.component("Custom:Conn_01x02", ref, val, x, y, 0,
                "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical")
    s.wire(x - 3.81, y + 1.27, x - 7.62, y + 1.27); s.label(n1, x - 7.62, y + 1.27)
    s.wire(x - 3.81, y - 1.27, x - 7.62, y - 1.27); s.label(n2, x - 7.62, y - 1.27)

s1x2("J5", "AUDIO-LINK-IN", 372, 115, "AGND", "N0")
s1x2("J6", "AUDIO-LINK-UIT", 372, 130, "AGND", "N8")

# chain-doorlink headers (2x4, parallel aan RJ45)
def hdr8(ref, val, x, y, nets):
    s.component("Custom:Conn_02x04", ref, val, x, y, 0,
                "Connector_PinHeader_2.54mm:PinHeader_2x04_P2.54mm_Vertical")
    for k in range(4):
        yy = y - 3.81 + 2.54 * k
        for nm, xw, xe in ((nets[2 * k], x - 7.62, x - 11.43),
                           (nets[2 * k + 1], x + 7.62, x + 11.43)):
            s.wire(xw, yy, xe, yy)
            if nm in PWR:
                s.power(f"power:{nm}", xe, yy, 0,
                        vx=xe, vy=(yy + 3.81 if nm == "GND" else yy - 3.302))
            else:
                s.label(nm, xe, yy)

hdr8("J3", "CHAIN-LINK-IN", 82, CTL_Y, ["CLK_J", "GND", "DATA_J", "+12V",
                                        "GND", "DRET_J", "LATCH_J", "EN_J"])
hdr8("J4", "CHAIN-LINK-UIT", 330, CTL_Y, ["CLK_T", "GND", "SER_T", "+12V",
                                          "GND", "DRETT_J", "LATCH_T", "EN_T"])

# montagegaten (NPTH, geen net)
s.component("Custom:MHole", "H1", "M3", 372, 150, 0, "GSwitch:MH32")
s.component("Custom:MHole", "H2", "M3", 380, 150, 0, "GSwitch:MH32")

# PWR_FLAGs
s.wire(25, 205, 30.08, 205); s.power("power:+12V", 25, 205); s.flag(30.08, 205)
s.wire(65, 205, 70.08, 205); s.power("power:GND", 65, 205); s.flag(70.08, 205)

s.text("LOOP8-SH: bit0(=D1)=loop 1 ... bit7(=D8)=loop 8 (595 Q0=D8!).\\n"
       "Klem per loop: 1=SEND 2=AGND 3=RETURN. GEEN normalling: lege loop\\n"
       "niet activeren (firmware). JP1 (TERM) alleen op het LAATSTE bord.\\n"
       "JP2 dicht = lege IN-jack gemute (open bij audio-doorlink J5).", 20, 20)
s.write(os.path.join(OUT_DIR, NAME + ".kicad_sch"))

# ================= PCB =================
NETS = (['', '+12V', '+5V', 'GND', '/AGND', '/CHASSIS']
        + [f'/N{k}' for k in range(9)]
        + [f'/SEND{k}' for k in range(1, 9)] + [f'/RET{k}' for k in range(1, 9)]
        + [f'/BYP{k}' for k in range(1, 9)] + [f'/RLY{k}' for k in range(1, 9)]
        + [f'/D{k}' for k in range(1, 9)]
        + ['/CLK_J', '/DATA_J', '/LATCH_J', '/EN_J', '/DRET_J',
           '/CLK_A', '/DATA_A', '/LATCH_A', '/EN_A', '/DRET_A',
           '/CLK_N', '/DATA_N', '/LATCH_N', '/OE_N', '/DRET_N',
           '/CLK_O', '/DATA_O', '/LATCH_O', '/EN_O', '/DRET_O',
           '/SER', '/CLK_T', '/SER_T', '/LATCH_T', '/EN_T', '/DRETT_J',
           '/LEDA', '/INTN'])

class GBoard(Board):
    """Board met gescheiden AGND/GND-zones i.p.v. een bordvullende GND-zone."""
    def write(self, out):
        bx0, by0, bx1, by1 = self.b
        def zone(net, layer, y0, y1):
            return f'''
  (zone (net {self.NI[net]}) (net_name "{net}") (layer "{layer}")
    (uuid "{self.uid()}")
    (hatch edge 0.5)
    (connect_pads yes (clearance 0.3))
    (min_thickness 0.2) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts
      (xy {bx0+0.5} {y0}) (xy {bx1-0.5} {y0})
      (xy {bx1-0.5} {y1}) (xy {bx0+0.5} {y1})
    ))
  )'''
        for layer in ('F.Cu', 'B.Cu'):
            self.extra.append(zone('/AGND', layer, by0 + 0.5, Z_AGND_S))
            self.extra.append(zone('GND', layer, Z_GND_N, by1 - 0.5))
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
        _texts = getattr(self, 'silk_texts', None) or \
            [(self.silk_text, sx, sy, srot)]
        silk_block = '\n'.join(
            f'  (gr_text "{_t}" (at {fmt(_x)} {fmt(_y)} {_r}) '
            f'(layer "F.SilkS")\n    (uuid "{self.uid()}")\n'
            f'    (effects (font (size 1 1) (thickness 0.15))))'
            for _t, _x, _y, _r in _texts)
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

b = GBoard(TITLE, REV, (176, 142.55, 0), BX0, BY0, BX1, BY1, NETS, DATE)
b.paper = "A3"
b.silk_text = f"GSWITCH LOOP8-SH rev {REV} - doc/guitar-switcher-spec.md"
# silk vrij van componenten: titel rechtsonder, URL in de spoelenband
b.silk_texts = [
    (f"GSWITCH LOOP8-SH rev {REV}", 200.6, 142.6, 0),
    ("doc/guitar-switcher-spec.md", 175, 127.15, 0),
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

def acjs_mh(ref, x, y, rot, netmap):
    """Amphenol ACJS-MH enkele 6,35mm jack (paneelvlak = lokale x=0, draad -x)."""
    pads = [('T', 16.5, -8.15), ('R', 10.25, -8.15), ('S', 4.0, -8.15),
            ('TN', 16.5, 8.15), ('RN', 10.25, 8.15), ('SN', 4.0, 8.15)]
    raw_pads(ref, x, y, rot, pads, netmap)
    pt = []
    for num, px, py in pads:
        nm = netmap.get(num)
        nn = f' (net {nm[0]} "{nm[1]}")' if nm else ''
        pt.append(f'    (pad "{num}" thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 2.5 2.5) (drill 1.5) (layers "*.Cu" "*.Mask"){nn})')
    pt.append('    (model "${KIPRJMOD}/../3dshapes/ACJS_MH.wrl"\n'
              '      (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) '
              '(rotate (xyz 0 0 0)))')
    b.raw_fp(f'''  (footprint "GSwitch:ACJS_MH"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)} {rot})
    (path "/")
    (descr "Amphenol ACJS-MH enkele 6,35mm stereo jack, horizontaal PCB")
    (property "Reference" "{ref}" (at 12 -11.5 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "ACJS-MH" (at 12 0 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole exclude_from_pos_files)
    (fp_rect (start 0 -9.95) (end 24.6 9.95)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start 0 -9.95) (end 24.6 9.95)
      (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
    (fp_rect (start 0.05 -10.1) (end 24.75 10.1)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pt)}
  )''')

def rj45(ref, x, y, rot, netmap):
    """Ninigi GE / '56'-klasse afgeschermde 8P8C, THT (kabelopening = lokale +y)."""
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
    pt.append('    (model "${KICAD10_3DMODEL_DIR}/Connector_RJ.3dshapes/'
              'RJ45_Amphenol_RJHSE538X.step"\n'
              '      (offset (xyz 7.99 -2.61 0)) (scale (xyz 1 1 1)) '
              '(rotate (xyz 0 0 180)))')
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

# --- footprint-plaatsing ---
for k in range(1, 9):
    tx = TX[k - 1]
    rx = tx + 3.5
    b.fp(TERM_MOD, TERM_FP, f'J{10+k}', f'LOOP{k}', tx, TY, 0,
         b.nm({'1': f'/SEND{k}', '2': '/AGND', '3': f'/RET{k}'}))
    b.fp('Relay_SMD.pretty\\Relay_DPDT_Kemet_EE2_NU.kicad_mod',
         'Relay_SMD:Relay_DPDT_Kemet_EE2_NU', f'K{k}', 'EE2-12NU/TQ2SA-12V',
         rx, RY, 180, b.nm({
             '1': '+12V', '12': f'/RLY{k}', '9': f'/N{k-1}', '10': f'/BYP{k}',
             '8': f'/SEND{k}', '4': f'/N{k}', '3': f'/BYP{k}', '5': f'/RET{k}'}))
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{2*k-1}', '1M',
         tx + 0.95, BLEED_Y, 0, b.rc(f'/SEND{k}', '/AGND'))
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{2*k}', '1M',
         tx + 7.95, BLEED_Y, 0, b.rc(f'/RET{k}', '/AGND'))

acjs_mh('J7', BX0, 110.5, 0, b.nm({'T': '/N0', 'TN': '/INTN', 'R': '/AGND',
                                   'S': '/AGND', 'RN': '/AGND', 'SN': '/AGND'}))
acjs_mh('J8', BX1, 110.5, 180, b.nm({'T': '/N8', 'R': '/AGND', 'S': '/AGND',
                                     'RN': '/AGND', 'SN': '/AGND'}))
rj45('J1', 114.8, 129.6, 270, b.nm({'1': '/CLK_J', '2': 'GND', '3': '/DATA_J',
                                    '4': '+12V', '5': 'GND', '6': '/DRET_J',
                                    '7': '/LATCH_J', '8': '/EN_J',
                                    'SH': '/CHASSIS'}))
rj45('J2', 235.2, 138.4, 90, b.nm({'1': '/CLK_T', '2': 'GND', '3': '/SER_T',
                                   '4': '+12V', '5': 'GND', '6': '/DRETT_J',
                                   '7': '/LATCH_T', '8': '/EN_T',
                                   'SH': '/CHASSIS'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x04_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x04_P2.54mm_Vertical', 'J3',
     'CHAIN-LINK-IN', 123.4, 129.6, 0, b.nm({
         '1': '/CLK_J', '2': 'GND', '3': '/DATA_J', '4': '+12V',
         '5': 'GND', '6': '/DRET_J', '7': '/LATCH_J', '8': '/EN_J'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x04_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x04_P2.54mm_Vertical', 'J4',
     'CHAIN-LINK-UIT', 225.4, 129.6, 0, b.nm({
         '1': '/CLK_T', '2': 'GND', '3': '/SER_T', '4': '+12V',
         '5': 'GND', '6': '/DRETT_J', '7': '/LATCH_T', '8': '/EN_T'}))
def link2(ref, val, x, y, netmap):
    """Twee soldeerpads (2,54-steek, horizontaal) met krappe courtyard."""
    raw_pads(ref, x, y, 0, [('1', 0, 0), ('2', 2.54, 0)], netmap)
    pt = []
    for num, px in (('1', 0), ('2', 2.54)):
        nm = netmap.get(num)
        nn = f' (net {nm[0]} "{nm[1]}")' if nm else ''
        pt.append(f'    (pad "{num}" thru_hole circle (at {px} 0) '
                  f'(size 1.7 1.7) (drill 0.9) (layers "*.Cu" "*.Mask"){nn})')
    b.raw_fp(f"""  (footprint "GSwitch:LINK2"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)})
    (path "/")
    (descr "audio-doorlink soldeerpads")
    (property "Reference" "{ref}" (at 1.27 -2.6 0) (layer "F.SilkS")
      (effects (font (size 0.9 0.9) (thickness 0.15))))
    (property "Value" "{val}" (at 1.27 2.6 0) (layer "F.Fab")
      (effects (font (size 0.9 0.9) (thickness 0.15))))
    (attr through_hole exclude_from_pos_files exclude_from_bom)
    (fp_rect (start -1.45 -1.45) (end 3.99 1.45)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pt)}
  )""")

link2('J5', 'LINK-IN', 121.6, 122.3, b.nm({'1': '/N0', '2': '/AGND'}))
link2('J6', 'LINK-UIT', 241.9, 122.25, b.nm({'1': '/N8', '2': '/AGND'}))

# --- besturingsstrook (y 129,5 .. 142) ---
b.fp('Package_SO.pretty\\SOIC-14_3.9x8.7mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm', 'U2', '74HC14', 140.6, 138.1, 0,
     b.nm({'1': '/CLK_A', '2': '/CLK_N', '3': '/CLK_N', '4': '/CLK_O',
           '5': '/LATCH_A', '6': '/LATCH_N', '7': 'GND', '14': '+5V',
           '13': '/OE_N', '12': '/EN_O', '11': '/EN_A', '10': '/OE_N',
           '9': '/LATCH_N', '8': '/LATCH_O'}))
b.fp('Package_SO.pretty\\SOIC-14_3.9x8.7mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm', 'U3', '74HC14', 151.4, 138.1, 0,
     b.nm({'1': '/DATA_A', '2': '/DATA_N', '3': '/DATA_N', '4': '/DATA_O',
           '5': '/DRET_A', '6': '/DRET_N', '7': 'GND', '14': '+5V',
           '13': 'GND', '11': 'GND', '9': '/DRET_N', '8': '/DRET_O'}))
b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', '74HC595', 162.6, 138.1, 0,
     b.nm({'14': '/DATA_O', '11': '/CLK_O', '12': '/LATCH_O', '13': '/OE_N',
           '10': '+5V', '8': 'GND', '16': '+5V', '15': '/D8', '1': '/D1',
           '2': '/D2', '3': '/D3', '4': '/D4', '5': '/D5', '6': '/D6',
           '7': '/D7', '9': '/SER'}))
b.fp('Package_SO.pretty\\SOIC-18W_7.5x11.6mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-18W_7.5x11.6mm_P1.27mm', 'U4', 'ULN2803A', 177.5, 137.3, 0,
     b.nm({'1': '/D6', '2': '/D7', '3': '/D8', '4': '/D5', '5': '/D4',
           '6': '/D3', '7': '/D2', '8': '/D1', '9': 'GND', '10': '+12V',
           '11': '/RLY1', '12': '/RLY2', '13': '/RLY3', '14': '/RLY4',
           '15': '/RLY5', '16': '/RLY8', '17': '/RLY7', '18': '/RLY6'}))
b.fp('Capacitor_SMD.pretty\\CP_Elec_6.3x7.7.kicad_mod',
     'Capacitor_SMD:CP_Elec_6.3x7.7', 'C1', '100u/25V', 189.4, 137.7, 0,
     b.rc('+12V', 'GND'))
b.fp('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U5', 'AMS1117-5.0',
     199.4, 137.7, 180, b.nm({'3': '+12V', '1': 'GND', '2': '+5V'}))
b.fp('Diode_SMD.pretty\\D_SMA.kicad_mod', 'Diode_SMD:D_SMA', 'D1', 'SMAJ15A',
     189.4, 131.2, 0, b.rc('+12V', 'GND'))
b.fp('LED_SMD.pretty\\LED_0805_2012Metric.kicad_mod',
     'LED_SMD:LED_0805_2012Metric', 'D2', 'LED-GN', 162.6, 131.2, 0,
     b.rc('GND', '/LEDA'))
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R32', '4k7', 166.2, 131.2, 0,
     b.rc('+5V', '/LEDA'))

# serie-R's west (in) / oost (thru): verticale kolommen naast de RJ45's
for j, (ref, n1, n2) in enumerate(SERIES[:5]):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', ref, '100R',
         131.4, 129.6 + 2.0 * j, 0, b.rc(f'/{n1}', f'/{n2}'))
for j, (ref, n1, n2) in enumerate(SERIES[5:]):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', ref, '100R',
         216.4, 129.6 + 2.0 * j, 0, b.rc(f'/{n1}', f'/{n2}'))
for j, (ref, n1) in enumerate(PULL):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', ref, '100k',
         135.4 + 3.0 * j, 131.0, 90, b.rc(f'/{n1}', 'GND'))

b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C2', '100n', 169.8, 131.2, 0,
     b.rc('+12V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '10u', 195.8, 131.2, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C4', '100n', 158.1, 131.2, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C5', '100n', 150.9, 131.2, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C6', '100n', 154.5, 131.2, 0,
     b.rc('+5V', 'GND'))
# hybride RC (CHASSIS<->GND) + JP3 west, JP1 oost
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C7', '100n', 133.5, 140.6, 270,
     b.rc('GND', '/CHASSIS'))
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R33', '1M', 135.7, 140.6, 270,
     b.rc('GND', '/CHASSIS'))
b.fp('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm', 'JP1',
     'TERM', 206.5, 131.4, 0, b.rc('/SER', '/DRET_A'))
b.fp('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm', 'JP2',
     'IN-TN=AGND', 113.6, 122.3, 0, b.rc('/AGND', '/INTN'))
b.fp('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm', 'JP3',
     'AGND=CHASSIS', 108.9, 122.3, 0, b.rc('/CHASSIS', '/AGND'))

# montagegaten
def mhole(ref, x, y):
    b.raw_fp(f'''  (footprint "GSwitch:MH32"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)})
    (path "/")
    (descr "M3-montagegat, NPTH 3,2mm, krappe courtyard")
    (property "Reference" "{ref}" (at 0 -2.8 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "M3" (at 0 2.8 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr exclude_from_pos_files exclude_from_bom)
    (fp_circle (center 0 0) (end 2.1 0)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
    (pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2)
      (layers "*.Cu" "*.Mask"))
  )''')

mhole('H1', 128.8, 141.25)
mhole('H2', 220.8, 141.2)

# ---------- sanity-checks ----------
assert P['K1']['9'] == (131.355, 118.23), P['K1']['9']    # COM2 west
assert P['K1']['8'] == (131.355, 115.69), P['K1']['8']    # NO2 west
assert P['K1']['4'] == (138.645, 118.23), P['K1']['4']    # COM1 oost
assert P['K1']['1'] == (138.645, 125.85), P['K1']['1']    # spoel+ oost
assert P['J11']['1'] == (131.5, 103.75), P['J11']['1']
assert P['J11']['3'] == (138.5, 103.75), P['J11']['3']
assert P['J7']['T'] == (116.5, 102.35), P['J7']['T']
assert P['J8']['T'] == (233.5, 118.65), P['J8']['T']

# ---------- handroutes ----------
SW = 0.25   # signaal
AW = 0.3    # audio
PW = 0.4    # voeding
NO_Y, COM_Y, NC_Y, COIL_Y = RY - 3.81, RY - 1.27, RY + 1.27, RY + 6.35

for k in range(1, 9):
    tx = TX[k - 1]
    rxw, rxe = tx + 3.5 - 3.645, tx + 3.5 + 3.645
    # SEND: klem 1 recht omlaag (door bleed-pad 1) -> jog -> NO2
    b.T(f'/SEND{k}', 'F.Cu', AW, (tx, TY), (tx, 113.2), (rxw, 113.2),
        (rxw, NO_Y))
    # RET: klem 3 recht omlaag (door bleed-pad 1) -> jog -> NO1
    b.T(f'/RET{k}', 'F.Cu', AW, (tx + 7, TY), (tx + 7, 113.2), (rxe, 113.2),
        (rxe, NO_Y))
    # BYP: NC2 <-> NC1 (onder het relaislijf door)
    b.T(f'/BYP{k}', 'F.Cu', AW, (rxw, NC_Y), (rxe, NC_Y))
    # N-keten: COM1 (oost) -> COM2 volgende relais (west)
    if k < 8:
        b.T(f'/N{k}', 'F.Cu', AW, (rxe, COM_Y), (TX[k] + 3.5 - 3.645, COM_Y))
    # spoel +12V stub -> via -> B-rail
    b.T('+12V', 'F.Cu', PW, (rxe, COIL_Y), (rxe, RAIL12))
    b.V('+12V', rxe, RAIL12)

# +12V B-rail + aanvoer
b.T('+12V', 'B.Cu', PW, (119.3, RAIL12), (230.9, RAIL12))
b.V('+12V', 119.3, RAIL12)
b.T('+12V', 'B.Cu', PW, P['J1']['4'], (119.3, P['J1']['4'][1]), (119.3, RAIL12))
b.V('+12V', 230.9, RAIL12)
b.T('+12V', 'B.Cu', PW, P['J2']['4'], (230.9, P['J2']['4'][1]), (230.9, RAIL12))
# ULN COM (pin 10) -> korte stub -> rail
com = P['U4']['10']
b.T('+12V', 'F.Cu', PW, com, (184.3, com[1]), (184.3, 129.4))
b.V('+12V', 184.3, 129.4)
b.T('+12V', 'B.Cu', PW, (184.3, 129.4), (184.3, RAIL12))
# U5 VIN (rot 180: noordpin) -> via -> rail
b.T('+12V', 'F.Cu', PW, P['U5']['3'], (P['U5']['3'][0], 130.6))
b.V('+12V', P['U5']['3'][0], 130.6)
b.T('+12V', 'B.Cu', PW, (P['U5']['3'][0], 130.6), (P['U5']['3'][0], RAIL12))
# C1/C2/D1 -> via's op de rail
b.V('+12V', P['C1']['1'][0], RAIL12)
b.T('+12V', 'F.Cu', PW, P['C1']['1'], (P['C1']['1'][0], RAIL12))
b.V('+12V', P['D1']['1'][0], RAIL12)
b.T('+12V', 'F.Cu', PW, P['D1']['1'], (P['D1']['1'][0], RAIL12))
b.V('+12V', P['C2']['1'][0], RAIL12)
b.T('+12V', 'F.Cu', PW, P['C2']['1'], (P['C2']['1'][0], RAIL12))
# J3/J4 pin 4 -> korte B-stub -> rail
b.T('+12V', 'B.Cu', SW, P['J3']['4'], (127.6, P['J3']['4'][1]),
    (127.6, RAIL12))
b.V('+12V', 127.6, RAIL12)
b.T('+12V', 'B.Cu', SW, P['J4']['4'], (229.4, P['J4']['4'][1]),
    (229.4, RAIL12))
b.V('+12V', 229.4, RAIL12)

# N0: relais1 COM2 -> west -> IN-jack T + J5-link
b.T('/N0', 'F.Cu', AW, (131.355, COM_Y), (119, COM_Y), (119, 102.35),
    (116.5, 102.35))
b.V('/N0', 119, 120.5)
b.T('/N0', 'F.Cu', AW, (119, COM_Y), (119, 120.5))
b.T('/N0', 'B.Cu', AW, (119, 120.5), (121.6, 120.5), P['J5']['1'])
# N8: relais8 COM1 -> oost -> UIT-jack T + J6-link
rx8e = TX[7] + 3.5 + 3.645
b.T('/N8', 'F.Cu', AW, (rx8e, COM_Y), (231.5, COM_Y), (231.5, 118.65),
    (233.5, 118.65))
b.V('/N8', 231.5, 120.3)
b.T('/N8', 'F.Cu', AW, (231.5, 118.65), (231.5, 120.3))
b.T('/N8', 'B.Cu', AW, (231.5, 120.3), (241.9, 120.3), P['J6']['1'])
# IN-jack TN -> JP2; JP2-2 -> AGND-via
b.T('/INTN', 'F.Cu', AW, (116.5, 118.65), (116.5, 122.3), P['JP2']['2'])
b.V('/AGND', 110.9, 122.3)
b.T('/AGND', 'F.Cu', SW, P['JP2']['1'], (110.9, 122.3))
b.T('/AGND', 'F.Cu', SW, P['JP3']['2'], (110.9, 122.3))
# JP3: CHASSIS-kant om J5 heen naar J1-SH
b.T('/CHASSIS', 'F.Cu', SW, P['JP3']['1'], (106.9, 122.3), (106.9, 124.0),
    (105.4, 124.0), (105.4, 126.275))

# CHASSIS: SH-pennen + zuidrandspoor + hybride RC
sh1n, sh1s = P['J1']['SH'], P['J1']['SHb']
sh2a, sh2b = P['J2']['SH'], P['J2']['SHb']
b.T('/CHASSIS', 'F.Cu', SW, sh1n, sh1s)
b.T('/CHASSIS', 'F.Cu', SW, sh1s, (105.4, 143.3), (244.6, 143.3), sh2a)
b.T('/CHASSIS', 'F.Cu', SW, sh2a, sh2b)
b.T('/CHASSIS', 'F.Cu', SW, (133.5, 143.3), P['C7']['2'])
b.T('/CHASSIS', 'F.Cu', SW, (135.7, 143.3), P['R33']['2'])
# hybride GND-kant: stubs naar zone-via's
b.V('GND', 133.5, 138.6)
b.T('GND', 'F.Cu', SW, P['C7']['1'], (133.5, 138.6))
b.V('GND', 135.7, 139.5)
b.T('GND', 'F.Cu', SW, P['R33']['1'], (135.7, 139.5))

# GND-stitching (seed; gnd_stitch.py vult aan)
for x, y in ((101.5, 101.5), (248.5, 101.5), (126.5, 106.5), (222.5, 106.5),
             (101.5, 124.5), (248.5, 121.5), (175, 101.5)):
    b.V('/AGND', x, y)
for x, y in ((122.5, 142.5), (228.5, 142.5), (200, 142.2),
             (175, 130.2)):
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
    n = seslib.apply_ses(b, SES_FILE)
    print('SES applied:', n)
    print('snap_stubs:', b.snap_stubs())

b.write(os.path.join(OUT_DIR, NAME + ".kicad_pcb"))

open(os.path.join(OUT_DIR, NAME + ".kicad_pro"), "w", encoding="utf-8",
     newline="\n").write(
    '{\n  "meta": {"filename": "%s.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "%s"},\n'
    '  "schematic": {"file": "%s.kicad_sch"},\n'
    '  "pcb": {"file": "%s.kicad_pcb"}\n}\n' % (NAME, NAME, NAME, NAME))
print('klaar:', OUT_DIR)
