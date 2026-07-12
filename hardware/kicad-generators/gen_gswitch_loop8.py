"""Guitar Effect Switcher LOOP8 - 8x true-bypass relaisloop (sch + PCB).

Spec: doc/guitar-switcher-spec.md. Loop-cel: 1x DPDT-signaalrelais
(EE2/TQ2SA/HFD4-S-footprint), SEND boven / RETURN onder in een Amphenol
ACJS-MHD stapeljack; bypass op NC; RETURN-TN genormaliseerd naar SEND-T.
AGND en GND zijn gescheiden zones (relaiscontacten galvanisch vrij).
Keten: RJ45 in/thru, 74HC14-herbuffering, 74HC595 + ULN2803A, EN-failsafe,
DATA_RET-verificatielus (TERM-jumper op het laatste bord).

Handroutes: audio, spoel-lanes, +12V-rail, CHASSIS. Rest: freerouting
(gswitch_dsn_prep.py) -> seslib.apply_ses (SES_FILE hieronder).
"""
import sys
import os as _os; sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, box_symbol, R_SYM, C_SYM, CP_SYM,
                    FLAG_SYM, power_symbol)
from cardlib import Board, fmt, rotxy
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\gswitch-loop8"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-12"
REV = "0.1"
NAME = "gswitch-loop8"
TITLE = "GSwitch LOOP8 - 8x true-bypass relaisloop"
SES_FILE = os.path.join(OUT_DIR, NAME + ".ses")   # via freerouting; mag ontbreken

# ---------- geometrie (PCB) ----------
BX0, BY0, BX1, BY1 = 100.0, 100.0, 300.0, 158.0
AX = [139.2 + 19.0 * k for k in range(8)]          # dual-jack ankers (pad 1)
JY = 104.25                                        # jack-anker y (body raakt noordrand)
RY = 132.0                                         # relais-anker y (EE2-courtyard 15,5 hoog!)
RXOF = -5.7                                        # relais-anker t.o.v. jack-anker
Z_AGND_S = 132.2                                   # zuidrand AGND-zones
Z_GND_N = 134.4                                    # noordrand GND-zones
RAIL12 = 137.2                                     # +12V B-rail y
VIA_COIL_Y = 139.4                                 # spoel-via onder pad 12
# ULN hoog (lanes 139,4-148,3 direct onder de rail) zodat de B-laag ten
# zuiden van y~148,5 vrij blijft voor freerouting van de besturing.
# ULN-uitgangspad per relais: oostgroep gespiegeld zodat B-lanes kruisingsvrij
# blijven (west: westelijker relais = diepere lane; oost: oostelijker = dieper)
OUTPIN = {1: '11', 2: '12', 3: '13', 4: '14', 5: '15', 6: '18', 7: '17', 8: '16'}

# ---------- schema ----------
s = Sch("6510f000-0000-4000-8000-000000000000", NAME, TITLE, REV, DATE,
        ("Loop-cel: DPDT-relais, bypass op NC; RETURN-TN -> SEND-T (normalling)",
         "AGND/GND gescheiden; EN-failsafe; TERM-jumper sluit DATA_RET op laatste bord",
         "spec: doc/guitar-switcher-spec.md"))

JACKD_L = [("12", "T_TOP", "passive"), ("9", "TN_TOP", "passive"),
           ("11", "R_TOP", "passive"), ("8", "RN_TOP", "passive"),
           ("10", "S_TOP", "passive"), ("7", "SN_TOP", "passive")]
JACKD_R = [("6", "T_BOT", "passive"), ("3", "TN_BOT", "passive"),
           ("5", "R_BOT", "passive"), ("2", "RN_BOT", "passive"),
           ("4", "S_BOT", "passive"), ("1", "SN_BOT", "passive")]
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
           box_symbol("ACJS_MHD", JACKD_L, JACKD_R),
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
    """Verticale R/C: pin1 boven (n1), pin2 onder (n2)."""
    s.component(lib, ref, val, x, y, 0, fp)
    top = 3.81 if lib != "Device:C_Polarized" else 3.81
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
    sbox(f"J{10+k}", "ACJS_MHD", cx, cy,
         [f"SEND{k}", None, "AGND", "AGND", "AGND", "AGND"],
         [f"RET{k}", f"SEND{k}", "AGND", "AGND", "AGND", "AGND"],
         "GSwitch:ACJS_MHD")
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
sR("R33", "1M", 220, CTL_Y + 33, "CHASSIS", "GND")

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
sR("C7", "100n", 231, CTL_Y + 33, "CHASSIS", "GND",
   fp="Capacitor_SMD:C_0805_2012Metric", lib="Device:C")

# jumpers
def sj(ref, val, x, y, n1, n2):
    s.component("Custom:SolderJumper", ref, val, x, y, 0,
                "Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm")
    s.wire(x - 3.81, y, x - 7.62, y); s.label(n1, x - 7.62, y)
    s.wire(x + 3.81, y, x + 7.62, y); s.label(n2, x + 7.62, y)

sj("JP1", "TERM (laatste bord)", 315, CTL_Y + 22, "SER", "DRET_A")
sj("JP2", "IN-TN=AGND", 345, CTL_Y + 22, "INTN", "AGND")
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

# PWR_FLAGs: +12V komt van J1/J3 (passief), GND idem; +5V heeft U5 (power_out)
s.wire(25, 205, 30.08, 205); s.power("power:+12V", 25, 205); s.flag(30.08, 205)
s.wire(65, 205, 70.08, 205); s.power("power:GND", 65, 205); s.flag(70.08, 205)

s.text("LOOP8: bit0(=D1)=loop 1 ... bit7(=D8)=loop 8 (595 Q0=D8!).\\n"
       "Keten: CLK/DATA/LATCH/EN 5V, herbuffered per bord; EN laag/los = alles bypass.\\n"
       "JP1 (TERM) alleen dicht op het LAATSTE bord in de keten.\\n"
       "JP2 dicht = lege IN-jack gemute (open laten bij audio-doorlink J5).", 20, 20)
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
        # Board.write's eigen GND-zones omzeilen: tijdelijk leeg net...
        # eenvoudiger: eigen kopie van de staart hieronder.
        header_done = super(GBoard, self)
        # -- kopie van Board.write zonder de standaardzones --
        import io
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
        extras = f'''
  (gr_rect (start {bx0} {by0}) (end {bx1} {by1})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{self.uid()}"))
  (gr_text "{self.silk_text}" (at {fmt(sx)} {fmt(sy)} {srot}) (layer "F.SilkS")
    (uuid "{self.uid()}")
    (effects (font (size 1 1) (thickness 0.15))))
'''
        out_txt = (header + nets_block + '\n' + '\n'.join(self.fp_texts) + '\n'
                   + '\n'.join(tt) + extras + '\n'.join(self.extra) + '\n)\n')
        open(out, 'w', encoding='utf-8', newline='\n').write(out_txt)
        print('written', out, f'({len(tt)} routed items)')

b = GBoard(TITLE, REV, (228, 157.2, 0), BX0, BY0, BX1, BY1, NETS, DATE)
b.paper = "A3"
b.silk_text = f"GSWITCH LOOP8 rev {REV} - doc/guitar-switcher-spec.md"
P = b.P

def net(nm):
    return (b.NI[nm], nm)

def raw_pads(ref, x, y, rot, pads, netmap):
    """Registreer padposities (zoals fp() dat doet) voor raw footprints."""
    b.P[ref] = {}
    for num, px, py in pads:
        dx, dy = rotxy(px, py, rot)
        key = num
        while key in b.P[ref]:
            key += 'b'
        b.P[ref][key] = (round(x + dx, 4), round(y + dy, 4))
        if num in netmap:
            b.PNET.setdefault(ref, {})[key] = netmap[num][0]

def acjs_mhd(ref, x, y, netmap):
    """Amphenol ACJS-MHD dubbele stapeljack, THT, draad naar noord (rot 90)."""
    rot = 90
    pads = [('1', 0, 0), ('2', -6.35, 0), ('3', -12.7, 0),
            ('4', 0, -11.4), ('5', -6.35, -11.4), ('6', -12.7, -11.4),
            ('7', -3.25, 0.55), ('8', -9.6, 0.55), ('9', -15.95, 0.55),
            ('10', -3.25, -11.95), ('11', -9.6, -11.95), ('12', -15.95, -11.95)]
    raw_pads(ref, x, y, rot, pads, netmap)
    pt = []
    for num, px, py in pads:
        nm = netmap.get(num)
        nn = f' (net {nm[0]} "{nm[1]}")' if nm else ''
        pt.append(f'    (pad "{num}" thru_hole circle (at {fmt(px)} {fmt(py)}) '
                  f'(size 2.4 2.4) (drill 1.4) (layers "*.Cu" "*.Mask"){nn})')
    pt.append('    (pad "" np_thru_hole circle (at -17.33 -5.7) (size 2.05 2.05) '
              '(drill 2.05) (layers "*.Cu" "*.Mask"))')
    pt.append('    (model "${KIPRJMOD}/../3dshapes/ACJS_MHD.wrl"\n'
              '      (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) '
              '(rotate (xyz 0 0 0)))')
    b.raw_fp(f'''  (footprint "GSwitch:ACJS_MHD"
    (layer "F.Cu")
    (uuid "{b.uid()}")
    (at {fmt(x)} {fmt(y)} {rot})
    (path "/")
    (descr "Amphenol ACJS-MHD dubbele 6,35mm stereo stapeljack (draad door noordwand)")
    (property "Reference" "{ref}" (at -17.5 -8.5 {360-rot}) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "ACJS-MHD" (at -9 -5.7 {360-rot}) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole exclude_from_pos_files)
    (fp_rect (start -19.7 -14) (end 4.25 2.6)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_rect (start -19.7 -14) (end 4.25 2.6)
      (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
    (fp_rect (start -19.85 -14.15) (end 4.4 2.75)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pt)}
  )''')

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
    (descr "RJ45 8P8C afgeschermd THT (56-klasse / Ninigi GE / HanRun HR911105-zonder-mag)")
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
    ax = AX[k - 1]
    acjs_mhd(f'J{10+k}', ax, JY, b.nm({
        '12': f'/SEND{k}', '11': '/AGND', '10': '/AGND', '8': '/AGND',
        '7': '/AGND', '6': f'/RET{k}', '3': f'/SEND{k}', '5': '/AGND',
        '2': '/AGND', '4': '/AGND', '1': '/AGND'}))
    b.fp('Relay_SMD.pretty\\Relay_DPDT_Kemet_EE2_NU.kicad_mod',
         'Relay_SMD:Relay_DPDT_Kemet_EE2_NU', f'K{k}', 'EE2-12NU/TQ2SA-12V',
         ax + RXOF, RY, 180, b.nm({
             '1': '+12V', '12': f'/RLY{k}', '9': f'/N{k-1}', '10': f'/BYP{k}',
             '8': f'/SEND{k}', '4': f'/N{k}', '3': f'/BYP{k}', '5': f'/RET{k}'}))
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{2*k-1}', '1M',
         ax - 13.5, 126.3, 270, b.rc(f'/SEND{k}', '/AGND'))
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', f'R{2*k}', '1M',
         ax + 2.2, 126.3, 270, b.rc(f'/RET{k}', '/AGND'))

acjs_mh('J7', BX0, 110.5, 0, b.nm({'T': '/N0', 'TN': '/INTN', 'R': '/AGND',
                                   'S': '/AGND', 'RN': '/AGND', 'SN': '/AGND'}))
acjs_mh('J8', BX1, 110.5, 180, b.nm({'T': '/N8', 'R': '/AGND', 'S': '/AGND',
                                     'RN': '/AGND', 'SN': '/AGND'}))
rj45('J1', 115, 142.5, 270, b.nm({'1': '/CLK_J', '2': 'GND', '3': '/DATA_J',
                                  '4': '+12V', '5': 'GND', '6': '/DRET_J',
                                  '7': '/LATCH_J', '8': '/EN_J', 'SH': '/CHASSIS'}))
rj45('J2', 285.02, 152, 90, b.nm({'1': '/CLK_T', '2': 'GND', '3': '/SER_T',
                                  '4': '+12V', '5': 'GND', '6': '/DRETT_J',
                                  '7': '/LATCH_T', '8': '/EN_T', 'SH': '/CHASSIS'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x04_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x04_P2.54mm_Vertical', 'J3',
     'CHAIN-LINK-IN', 125.4, 146.5, 0, b.nm({
         '1': '/CLK_J', '2': 'GND', '3': '/DATA_J', '4': '+12V',
         '5': 'GND', '6': '/DRET_J', '7': '/LATCH_J', '8': '/EN_J'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x04_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_2x04_P2.54mm_Vertical', 'J4',
     'CHAIN-LINK-UIT', 271.8, 146.5, 0, b.nm({
         '1': '/CLK_T', '2': 'GND', '3': '/SER_T', '4': '+12V',
         '5': 'GND', '6': '/DRETT_J', '7': '/LATCH_T', '8': '/EN_T'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x02_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical', 'J5',
     'AUDIO-LINK-IN', 103, 123.23, 0, b.nm({'1': '/N0', '2': '/AGND'}))
b.fp('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x02_P2.54mm_Vertical.kicad_mod',
     'Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical', 'J6',
     'AUDIO-LINK-UIT', 297, 123.23, 0, b.nm({'1': '/N8', '2': '/AGND'}))

b.fp('Package_SO.pretty\\SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-16_3.9x9.9mm_P1.27mm', 'U1', '74HC595', 177, 149.8, 90,
     b.nm({'14': '/DATA_O', '11': '/CLK_O', '12': '/LATCH_O', '13': '/OE_N',
           '10': '+5V', '8': 'GND', '16': '+5V', '15': '/D8', '1': '/D1',
           '2': '/D2', '3': '/D3', '4': '/D4', '5': '/D5', '6': '/D6',
           '7': '/D7', '9': '/SER'}))
b.fp('Package_SO.pretty\\SOIC-14_3.9x8.7mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm', 'U2', '74HC14', 134.6, 149.5, 90,
     b.nm({'1': '/CLK_A', '2': '/CLK_N', '3': '/CLK_N', '4': '/CLK_O',
           '5': '/LATCH_A', '6': '/LATCH_N', '7': 'GND', '14': '+5V',
           '13': '/OE_N', '12': '/EN_O', '11': '/EN_A', '10': '/OE_N',
           '9': '/LATCH_N', '8': '/LATCH_O'}))
b.fp('Package_SO.pretty\\SOIC-14_3.9x8.7mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-14_3.9x8.7mm_P1.27mm', 'U3', '74HC14', 151.5, 149.5, 90,
     b.nm({'1': '/DATA_A', '2': '/DATA_N', '3': '/DATA_N', '4': '/DATA_O',
           '5': '/DRET_A', '6': '/DRET_N', '7': 'GND', '14': '+5V',
           '13': 'GND', '11': 'GND', '9': '/DRET_N', '8': '/DRET_O'}))
b.fp('Package_SO.pretty\\SOIC-18W_7.5x11.6mm_P1.27mm.kicad_mod',
     'Package_SO:SOIC-18W_7.5x11.6mm_P1.27mm', 'U4', 'ULN2803A', 214, 145.9, 0,
     b.nm({'1': '/D6', '2': '/D7', '3': '/D8', '4': '/D5', '5': '/D4',
           '6': '/D3', '7': '/D2', '8': '/D1', '9': 'GND', '10': '+12V',
           '11': '/RLY1', '12': '/RLY2', '13': '/RLY3', '14': '/RLY4',
           '15': '/RLY5', '16': '/RLY8', '17': '/RLY7', '18': '/RLY6'}))
b.fp('Package_TO_SOT_SMD.pretty\\SOT-223-3_TabPin2.kicad_mod',
     'Package_TO_SOT_SMD:SOT-223-3_TabPin2', 'U5', 'AMS1117-5.0',
     199.5, 143.5, 180, b.nm({'3': '+12V', '1': 'GND', '2': '+5V'}))
b.fp('Diode_SMD.pretty\\D_SMA.kicad_mod', 'Diode_SMD:D_SMA', 'D1', 'SMAJ15A',
     219, 135.6, 0, b.rc('+12V', 'GND'))
b.fp('LED_SMD.pretty\\LED_0805_2012Metric.kicad_mod',
     'LED_SMD:LED_0805_2012Metric', 'D2', 'LED-GN', 166, 144.2, 0,
     b.rc('GND', '/LEDA'))
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R32', '4k7', 169.8, 144.2, 0,
     b.rc('+5V', '/LEDA'))

# serie-R's west (in): CLK/DATA/LATCH/EN + DRET_O; oost (thru)
for j, (ref, n1, n2) in enumerate(SERIES[:5]):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', ref, '100R',
         121.75, 141.9 + 2.0 * j, 0, b.rc(f'/{n1}', f'/{n2}'))
for j, (ref, n1, n2) in enumerate(SERIES[5:]):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', ref, '100R',
         277.9, 141.9 + 2.0 * j, 0, b.rc(f'/{n1}', f'/{n2}'))
for j, (ref, n1) in enumerate(PULL):
    b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
         'Resistor_SMD:R_0805_2012Metric', ref, '100k',
         132.5 + 3.0 * j, 141.8, 90, b.rc(f'/{n1}', 'GND'))

b.fp('Capacitor_SMD.pretty\\CP_Elec_6.3x7.7.kicad_mod',
     'Capacitor_SMD:CP_Elec_6.3x7.7', 'C1', '100u/25V', 162, 137.6, 90,
     b.rc('+12V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C2', '100n', 162, 144.3, 270,
     b.rc('+12V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C3', '10u', 181, 136.8, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C4', '100n', 177, 144.9, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C5', '100n', 134, 155.6, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C6', '100n', 151, 155.6, 0,
     b.rc('+5V', 'GND'))
b.fp('Capacitor_SMD.pretty\\C_0805_2012Metric.kicad_mod',
     'Capacitor_SMD:C_0805_2012Metric', 'C7', '100n', 107.5, 133.3, 270,
     b.rc('/CHASSIS', 'GND'))
b.fp('Resistor_SMD.pretty\\R_0805_2012Metric.kicad_mod',
     'Resistor_SMD:R_0805_2012Metric', 'R33', '1M', 110.5, 133.3, 270,
     b.rc('/CHASSIS', 'GND'))

# jumpers
b.fp('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm', 'JP1',
     'TERM', 228, 155.0, 0, b.rc('/SER', '/DRET_A'))
b.fp('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm', 'JP2',
     'IN-TN=AGND', 114, 122.3, 0, b.rc('/INTN', '/AGND'))
b.fp('Jumper.pretty\\SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm.kicad_mod',
     'Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm', 'JP3',
     'AGND=CHASSIS', 113.5, 133.3, 90, b.rc('/CHASSIS', '/AGND'))

# montagegaten: eigen footprint met krappe courtyard (lib-M3 heeft r=3,45!)
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

mhole('H1', 143, 133.4)
mhole('H2', 238, 133.4)

# ---------- sanity-checks op padposities ----------
assert P['K1']['1'] == (137.145, 138.35), P['K1']['1']    # spoel+ oost
assert P['K1']['12'] == (129.855, 138.35), P['K1']['12']  # spoel- west
assert P['K1']['9'] == (129.855, 130.73), P['K1']['9']    # COM2 west
assert P['K1']['8'] == (129.855, 128.19), P['K1']['8']    # NO2 west
assert P['K1']['4'] == (137.145, 130.73), P['K1']['4']    # COM1 oost
assert P['J11']['12'] == (127.25, 120.2), P['J11']['12']  # send-tip
assert P['J11']['6'] == (127.8, 116.95), P['J11']['6']    # ret-tip
assert P['J11']['3'] == (139.2, 116.95), P['J11']['3']    # ret-TN
assert P['U4']['11'][1] == 149.71, P['U4']['11']          # RLY1-uitgang zuidelijkst
assert P['U4']['18'][1] == 140.82, P['U4']['18']          # RLY6 (oostgroep) noordelijkst
assert P['J7']['T'] == (116.5, 102.35), P['J7']['T']
assert P['J8']['T'] == (283.5, 118.65), P['J8']['T']

# ---------- handroutes ----------
SW = 0.25   # signaal
AW = 0.3    # audio
PW = 0.4    # voeding
NO_Y, COM_Y, NC_Y, COIL_Y = RY - 3.81, RY - 1.27, RY + 1.27, RY + 6.35

for k in range(1, 9):
    ax = AX[k - 1]
    rxw, rxe = ax + RXOF - 3.645, ax + RXOF + 3.645   # relais west/oost padkolom
    # SEND: jack12 -> (west-jog) bleed + NO2; normalling naar jack3 via B
    b.T(f'/SEND{k}', 'F.Cu', AW, (ax - 11.95, 120.2), (ax - 11.95, 123.3),
        (ax - 13.5, 123.3), P[f'R{2*k-1}']['1'])
    b.T(f'/SEND{k}', 'F.Cu', AW, (ax - 11.95, 123.3), (rxw, 123.3), (rxw, NO_Y))
    b.V(f'/SEND{k}', ax - 11.95, 121.9)
    b.T(f'/SEND{k}', 'F.Cu', AW, (ax - 11.95, 120.2), (ax - 11.95, 121.9))
    b.T(f'/SEND{k}', 'B.Cu', AW, (ax - 11.95, 121.9), (ax - 11.95, 118.55),
        (ax, 118.55), (ax, 116.95))
    # RET: jack6 -> oost-jog -> bleed + NO1
    b.T(f'/RET{k}', 'F.Cu', AW, (ax - 11.4, 116.95), (ax - 8.0, 116.95),
        (ax - 8.0, 123.6), (ax + 2.2, 123.6), P[f'R{2*k}']['1'])
    b.T(f'/RET{k}', 'F.Cu', AW, (ax + 2.2, 123.6), (rxe, 123.6), (rxe, NO_Y))
    # BYP: NC2 <-> NC1 (onder het relaislijf door)
    b.T(f'/BYP{k}', 'F.Cu', AW, (rxw, NC_Y), (rxe, NC_Y))
    # N-keten: COM1 (oost) -> COM2 volgende relais (west)
    if k < 8:
        b.T(f'/N{k}', 'F.Cu', AW, (rxe, COM_Y), (AX[k] + RXOF - 3.645, COM_Y))
    # spoel- (RLY-net): freerouting legt de route naar de ULN-uitgang
    # +12V spoel+ stub -> via -> B-rail
    b.T('+12V', 'F.Cu', PW, (rxe, COIL_Y), (rxe, RAIL12))
    b.V('+12V', rxe, RAIL12)

# +12V B-rail + aanvoer
b.T('+12V', 'B.Cu', PW, (119.8, RAIL12), (286.5, RAIL12))
b.V('+12V', 119.8, RAIL12)
b.T('+12V', 'B.Cu', PW, P['J1']['4'], (119.8, P['J1']['4'][1]), (119.8, RAIL12))
b.V('+12V', 286.5, RAIL12)
b.T('+12V', 'B.Cu', PW, (286.5, RAIL12), (286.5, P['J2']['4'][1]), P['J2']['4'])
# ULN COM -> oostelijke omweg -> rail (pin 10 zit onderaan de uitgangskolom)
com = P['U4']['10']
b.T('+12V', 'F.Cu', PW, com, (222.6, com[1]), (222.6, RAIL12))
b.V('+12V', 222.6, RAIL12)
# U5 VIN (rot 180: noordpin): recht omhoog, via, kort B-stukje naar de rail
b.T('+12V', 'F.Cu', PW, P['U5']['3'], (P['U5']['3'][0], 138.6))
b.V('+12V', P['U5']['3'][0], 138.6)
b.T('+12V', 'B.Cu', PW, (P['U5']['3'][0], 138.6), (P['U5']['3'][0], RAIL12))
# C1 -> C2-keten + D1
b.V('+12V', 162, RAIL12)
b.T('+12V', 'F.Cu', PW, (162, RAIL12), P['C1']['1'], P['C2']['1'])
b.V('+12V', P['D1']['1'][0], RAIL12)
b.T('+12V', 'F.Cu', PW, P['D1']['1'], (P['D1']['1'][0], RAIL12))
# J3/J4 pin4 (+12V): smal B-slalommetje om de eigen headerpads heen naar de rail
b.T('+12V', 'B.Cu', SW, P['J3']['4'], (129.4, P['J3']['4'][1]), (129.4, RAIL12))
b.V('+12V', 129.4, RAIL12)
b.T('+12V', 'B.Cu', SW, P['J4']['4'], (276.5, P['J4']['4'][1]), (276.5, RAIL12))
b.V('+12V', 276.5, RAIL12)

# N0: relais1 COM2 -> B -> IN-jack T + J5-link
b.V('/N0', 119.5, COM_Y)
b.T('/N0', 'F.Cu', AW, (AX[0] + RXOF - 3.645, COM_Y), (119.5, COM_Y))
b.T('/N0', 'B.Cu', AW, (119.5, COM_Y), (119.5, 102.35), (116.5, 102.35))
b.T('/N0', 'B.Cu', AW, (119.5, 123.23), (103, 123.23))
# N8: relais8 COM1 -> OUT-jack T + J6-link
rx8e = AX[7] + RXOF + 3.645
b.T('/N8', 'F.Cu', AW, (rx8e, COM_Y), (283.5, COM_Y), (283.5, 118.65))
b.T('/N8', 'F.Cu', AW, (283.5, 123.23), (297, 123.23))
# IN-jack TN -> JP2
b.T('/INTN', 'F.Cu', AW, (116.5, 118.65), (116.5, 120.5), (113.35, 120.5),
    P['JP2']['1'])

# CHASSIS: SH-pennen, hybride RC, JP3, zuidrand-link
sh1n, sh1s = P['J1']['SH'], P['J1']['SHb']
sh2s, sh2n = P['J2']['SH'], P['J2']['SHb']
b.T('/CHASSIS', 'F.Cu', SW, sh1n, (105.6, 131.9), (107.5, 131.9), P['C7']['1'])
b.T('/CHASSIS', 'F.Cu', SW, (107.5, 131.9), (110.5, 131.9), P['R33']['1'])
b.T('/CHASSIS', 'F.Cu', SW, (110.5, 131.9), (112.3, 131.9), (112.3, 133.95),
    P['JP3']['1'])
b.T('/CHASSIS', 'F.Cu', SW, sh1n, sh1s)
b.T('/CHASSIS', 'F.Cu', SW, sh1s, (105.6, 157.2), (294.42, 157.2), sh2s)
b.T('/CHASSIS', 'F.Cu', SW, sh2s, sh2n)
# hybride GND-kant: stubs naar zone-via's
b.V('GND', 107.5, 135.0)
b.T('GND', 'F.Cu', SW, P['C7']['2'], (107.5, 135.0))
b.V('GND', 110.5, 135.0)
b.T('GND', 'F.Cu', SW, P['R33']['2'], (110.5, 135.0))
# JP3 AGND-kant: stub de AGND-zone in + via
b.V('/AGND', 113.5, 131.4)
b.T('/AGND', 'F.Cu', SW, P['JP3']['2'], (113.5, 131.4))
# JP2 AGND-pad: stub + via in AGND-zone
b.V('/AGND', 116.2, 122.3)
b.T('/AGND', 'F.Cu', SW, P['JP2']['2'], (116.2, 122.3))

# GND-stitching
for x, y in ((102, 102), (298, 102), (102, 128), (298, 128), (150.7, 102),
             (200, 102), (250, 102), (162, 108), (238, 108), (122.5, 112)):
    b.V('/AGND', x, y)
for x, y in ((125, 156.3), (160, 156.3), (250, 156.3), (198, 155.4),
             (156.5, 139.9), (270, 139.9), (232, 155.4), (189.2, 139.9)):
    b.V('GND', x, y)
# handmatige bruggen voor de twee F+B-eilandgroepen zonder auto-brugplek
# (B-fragment onder F-hoofdvlak — gnd_bridge zoekt alleen andersom)
b.V('GND', 262, 152.5)
b.V('GND', 228.5, 150.0)
b.T('GND', 'F.Cu', SW, P['J1']['5'], (113.2, P['J1']['5'][1]), (113.2, 136.2))
b.V('GND', 113.2, 136.2)
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

# huisstijl-postprocessing (dit is geen MusicBrain-modulebord)
for ext in (".kicad_sch",):
    p = os.path.join(OUT_DIR, NAME + ext)
    t = open(p, encoding="utf-8").read().replace(
        '(company "MusicBrain project")', '(company "Guitar Effect Switcher project")')
    open(p, "w", encoding="utf-8", newline="\n").write(t)
print("klaar:", OUT_DIR)
