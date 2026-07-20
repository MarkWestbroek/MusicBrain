"""Generate musicbrain-busboard.kicad_sch — v3 per doc/busboard-v3-plan.md.

v3 t.o.v. v2 (gen 2): slots 2x12 (audio-lijnen MCLK/BCLK/LRCLK gedeeld +
I2SD1-6 per slot, CONVST=pin 19), audiohub J24 (2x7), MIDI 2xIN/2xUIT (J22 =
TX7), USB-host-doorvoer J23 (2x5, volgorde-ongevoelig 1-op-1), R-78E5.0-1.0.
Verder v2-architectuur: 74HC154-CS-decoder, 74HC165-IRQ-keten, expansie J21,
CAN3, codec-header J17, TUNE-IN, delegate-UARTs.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlib import box_symbol

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-busboard"
OUT = OUT_DIR + r"\musicbrain-busboard.kicad_sch"
ROOT = "c3000000-0000-4000-8000-000000000000"
PROJ = "musicbrain-busboard"

_uid = [0]
def uid():
    _uid[0] += 1
    return f"c3000001-0000-4000-8000-{_uid[0]:012d}"

items = []

def wire(x1, y1, x2, y2):
    items.append(f'  (wire (pts (xy {g(x1)} {g(y1)}) (xy {g(x2)} {g(y2)})) '
                 f'(stroke (width 0) (type default)) (uuid "{uid()}"))')

def label(name, x, y):
    items.append(f'  (label "{name}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) '
                 f'(justify left bottom)) (uuid "{uid()}"))')

def nc(x, y):
    items.append(f'  (no_connect (at {g(x)} {g(y)}) (uuid "{uid()}"))')

def g(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"

_pwr = [0]
def power(sym, x, y, rot=0, vx=None, vy=None):
    _pwr[0] += 1
    ref = f"#PWR{_pwr[0]:03d}"
    val = sym.split(":")[1]
    if vx is None:
        vx, vy = x, (y - 3.302 if val in ("+12V", "+3V3", "+5V") and rot == 0
                     else y + 3.81)
    items.append(f'''  (symbol (lib_id "{sym}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "{val}" (at {g(vx)} {g(vy)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{PROJ}" (path "/{ROOT}" (reference "{ref}") (unit 1))))
  )''')

_flg = [0]
def flag(x, y):
    _flg[0] += 1
    ref = f"#FLG{_flg[0]:02d}"
    items.append(f'''  (symbol (lib_id "power:PWR_FLAG") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "PWR_FLAG" (at {g(x)} {g(y-4.5)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{PROJ}" (path "/{ROOT}" (reference "{ref}") (unit 1))))
  )''')

def component(lib_id, ref, value, x, y, rot, footprint, sfx="", extra_props=()):
    props = "\n".join(
        f'    (property "{k}" "{v}" (at {g(px)} {g(py)} 0) (effects (font (size 1.27 1.27)){jst}))'
        for k, v, px, py, jst in extra_props)
    items.append(f'''  (symbol (lib_id "{lib_id}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
{props}
    (property "Footprint" "{footprint}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{PROJ}" (path "/{ROOT}" (reference "{ref}") (unit 1))))
  )''')

def rprop(ref, value, x, y, rx, ry, vx, vy):
    return (("Reference", ref, rx, ry, ""), ("Value", value, vx, vy, ""))

# ---- helper: box-symbool plaatsen + pinnen bedraden ---------------------
# box_symbol(name, left, right, width): rows = max(len(l),len(r));
# pin-eindpunt links op x=-(w/2+2.54), rechts +(w/2+2.54);
# lokale y = (rows-1)*1.27 - 2.54*k ; absoluut y = SY - lokale_y.
BOXES = {}   # name -> (left,right,width)

def boxdef(name, left, right, width=17.78):
    BOXES[name] = (left, right, width)
    return box_symbol(name, left, right, width)

def place_box(name, ref, value, x, y, footprint, conns):
    """conns: pinnummer -> ('label',naam) | ('power',sym) | ('nc',) | ('wire',)
    'wire' = alleen stub, aansluiten doet de caller (zelden nodig)."""
    left, right, width = BOXES[name]
    rows = max(len(left), len(right))
    hw = width / 2
    top = rows * 1.27 + 2.54
    component(f"Custom:{name}", ref, value, x, y, 0, footprint,
              extra_props=rprop(ref, value, x, y, x, y - top - 2.54, x, y + top + 2.54))
    pos = {}
    for k, (num, _n, _t) in enumerate(left):
        pos[num] = (x - (hw + 2.54), y - ((rows - 1) * 1.27 - 2.54 * k), "L")
    for k, (num, _n, _t) in enumerate(right):
        pos[num] = (x + (hw + 2.54), y - ((rows - 1) * 1.27 - 2.54 * k), "R")
    for num, act in conns.items():
        px, py, side = pos[num]
        s = -1 if side == "L" else 1
        if act[0] == "label":
            wire(px, py, px + s * 5.08, py)
            label(act[1], px + s * 5.08, py)
        elif act[0] == "power":
            wire(px, py, px + s * 3.81, py)
            vy = py - 3.302 if act[1] != "power:GND" else py + 3.81
            power(act[1], px + s * 3.81, py, 0, vx=px + s * 3.81, vy=vy)
        elif act[0] == "nc":
            nc(px, py)
    return pos

def rcomp(ref, value, x, y, rot=90):
    """R/C horizontaal (rot 90): pin1 links (x-3.81), pin2 rechts (x+3.81).
    Verticaal (rot 0): pin1 boven (y-3.81), pin2 onder (y+3.81)."""
    lib = "Device:C" if ref.startswith("C") else "Device:R"
    fp = "Capacitor_SMD:C_0805_2012Metric" if ref.startswith("C") else "Resistor_SMD:R_0805_2012Metric"
    component(lib, ref, value, x, y, rot, fp,
              extra_props=rprop(ref, value, x, y, x, y - 2.54, x, y + 2.54))
    if rot == 90:
        return (x - 3.81, y), (x + 3.81, y)
    return (x, y - 3.81), (x, y + 3.81)

def cap100n(ref, x, y):
    """100n ontkoppel: verticaal, +3V3 boven, GND onder."""
    (tx, ty), (bx, by) = rcomp(ref, "100n", x, y, 0)
    power("power:+3V3", tx, ty)
    power("power:GND", bx, by)

# ============ Teensy 4.1 ============
TX, TY = 80, 110
TEENSY_PINS = {}
for n in range(1, 25):
    TEENSY_PINS[n] = (TX - 17.78, TY - 30.48 + 2.54 * (n - 1), "L")
for n in range(25, 49):
    TEENSY_PINS[n] = (TX + 17.78, TY + 27.94 - 2.54 * (n - 25), "R")

component("Custom:Teensy41", "U1", "Teensy 4.1", TX, TY, 0, "",
          extra_props=rprop("U1", "Teensy 4.1", TX, TY, TX, TY - 35.56, TX, TY + 35.56))

def tpin_label(n, name, stub=6.35):
    x, y, side = TEENSY_PINS[n]
    if side == "L":
        wire(x, y, x - stub, y)
        label(name, x - stub, y)
    else:
        wire(x, y, x + stub, y)
        label(name, x + stub, y)

# GND / VIN / 3V3
for n in (1,):
    x, y, _ = TEENSY_PINS[n]; wire(x, y, x - 6.35, y); power("power:GND", x - 6.35, y)
for n in (34, 47):
    x, y, _ = TEENSY_PINS[n]; wire(x, y, x + 3.81, y); power("power:GND", x + 3.81, y)
x, y, _ = TEENSY_PINS[48]; wire(x, y, x + 11.43, y); power("power:+5V", x + 11.43, y)
for n in (15, 46):
    nc(*TEENSY_PINS[n][:2])

# ---- v2-pintoewijzing (zie doc/busboard-v2-plan.md) ----
# links: symboolpin 2..24 = D0..D12? (2=D0,3=D1,4=D2,...,14=D12,16=D24..24=D32)
tpin_label(2, "DISP_CS")    # D0
tpin_label(3, "TUNE_T")     # D1  <- schmitt-uitgang TUNE
tpin_label(4, "LDAC")       # D2
tpin_label(5, "CSA0")       # D3
tpin_label(6, "CSA1")       # D4
tpin_label(7, "CSA2")       # D5
tpin_label(8, "CSA3")       # D6
tpin_label(9, "I2S_OUT")    # D7  OUT1A -> codec DIN
tpin_label(10, "I2S_IN")    # D8  IN1  <- codec DOUT
tpin_label(11, "CS_EN")     # D9  /E0 decoder
tpin_label(12, "D10")       # D10 vrij -> EXP
# 13 = MOSI via R2 (onder), 14 = MISO
tpin_label(14, "MISO")
tpin_label(16, "DISP_DC")   # D24
tpin_label(17, "DISP_RST")  # D25
tpin_label(18, "MOSI1")     # D26
tpin_label(19, "SCK1")      # D27
tpin_label(20, "MIDI_RX2")  # D28 RX7
tpin_label(21, "MIDI_TX2")  # D29 TX7 -> MIDI OUT2 (v3)
tpin_label(22, "CAN_RX")    # D30 CRX3
tpin_label(23, "CAN_TX")    # D31 CTX3
tpin_label(24, "D32")       # D32 vrij -> EXP
# rechts: 25=D33 ... 33=D41, 35=D13, 36..45=D14..D23
tpin_label(25, "D33")       # D33 vrij -> EXP
tpin_label(26, "MIDI_RX1")  # D34 RX8
tpin_label(27, "MIDI_TX")   # D35 TX8
tpin_label(28, "D36")
tpin_label(29, "D37")
tpin_label(30, "D38")
tpin_label(31, "D39")
tpin_label(32, "CONVST")    # D40 CONVST (busbrede sample-strobe, slotpin 19)
tpin_label(33, "SPARE2")    # D41 ADC_RESET
tpin_label(36, "DLG1_TX")   # D14 TX3
tpin_label(37, "DLG1_RX")   # D15 RX3
tpin_label(38, "DLG2_TX")   # D16 TX4
tpin_label(39, "DLG2_RX")   # D17 RX4
tpin_label(40, "SDA")       # D18
tpin_label(41, "SCL")       # D19
tpin_label(42, "LRCLK")     # D20 (busnet, slotpin 23)
tpin_label(43, "BCLK")      # D21 (busnet, slotpin 22)
tpin_label(44, "CODEC_RST") # D22 -> codec-header (bovenaan kolom)
tpin_label(45, "MCLK")      # D23 (busnet, slotpin 21)

# series R: MOSI (pin13, links) en SCLK (pin35, rechts)
x, y, _ = TEENSY_PINS[13]
wire(x, y, 58.42, y)
component("Device:R", "R2", "33R", 54.61, y, 90, "Resistor_SMD:R_0805_2012Metric",
          extra_props=rprop("R2", "33R", 54.61, y, 54.61, y - 2.54, 54.61, y + 2.54))
wire(50.8, y, 45.72, y)
label("MOSI", 45.72, y)
x, y, _ = TEENSY_PINS[35]
wire(x, y, 101.6, y)
component("Device:R", "R1", "33R", 105.41, y, 90, "Resistor_SMD:R_0805_2012Metric",
          extra_props=rprop("R1", "33R", 105.41, y, 105.41, y - 2.54, 105.41, y + 2.54))
wire(109.22, y, 114.3, y)
label("SCLK", 114.3, y)

# ============ I2C pull-ups ============
for xr, net, ref in ((124.46, "SDA", "R3"), (134.62, "SCL", "R4")):
    component("Device:R", ref, "2k2", xr, 72, 0, "Resistor_SMD:R_0805_2012Metric",
              extra_props=rprop(ref, "2k2", xr, 72, xr + 2.54, 71.12, xr + 2.54, 73.66))
    power("power:+3V3", xr, 72 - 3.81)
    wire(xr, 72 + 3.81, xr, 78.74)
    label(net, xr, 78.74)

# ============ power entry J9 (Eurorack 10-pin) ============
J9X, J9Y = 260.35, 50.8
component("Custom:Conn_02x05", "J9", "PWR IN (Eurorack)", J9X, J9Y, 0,
          "Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical",
          extra_props=rprop("J9", "PWR IN", J9X, J9Y, J9X, J9Y - 10.16, J9X, J9Y + 10.16))
J9_RAILS = ["-12V", "GND", "GND", "GND", "+12V"]
for k in range(5):
    y = J9Y - 5.08 + 2.54 * k
    stub = 17.78 if k % 2 == 0 else 12.7
    wire(J9X - 7.62, y, J9X - stub, y)
    power(f"power:{J9_RAILS[k]}", J9X - stub, y)
    wire(J9X + 7.62, y, J9X + stub, y)
    power(f"power:{J9_RAILS[k]}", J9X + stub, y)

# ============ regulators ============
component("Custom:R-78E5.0-1.0", "U2", "R-78E5.0-1.0", 300, 50.8, 0,
          "Converter_DCDC:Converter_DCDC_RECOM_R-78E-0.5_THT",
          extra_props=rprop("U2", "R-78E5.0-1.0", 300, 50.8, 300, 42.5, 300, 45.0))
wire(287.3, 50.8, 282.22, 50.8); power("power:+12V", 282.22, 50.8)
wire(312.7, 50.8, 317.78, 50.8); power("power:+5V", 317.78, 50.8)
power("power:GND", 300, 60.96)

component("Custom:AMS1117-3.3", "U3", "AMS1117-3.3", 345, 50.8, 0,
          "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
          extra_props=rprop("U3", "AMS1117-3.3", 345, 50.8, 345, 42.5, 345, 45.0))
wire(332.3, 50.8, 327.22, 50.8); power("power:+5V", 327.22, 50.8)
wire(357.7, 50.8, 362.78, 50.8); power("power:+3V3", 362.78, 50.8)
power("power:GND", 345, 60.96)

# ============ bulk / HF caps ============
CAPS = [
    ("C1", "10u", True,  "+12V", 0,   "GND"),
    ("C2", "100n", False, "+12V", 0,  "GND"),
    ("C3", "10u", True,  "GND", 180,  "-12V"),
    ("C4", "100n", False, "GND", 180, "-12V"),
    ("C5", "10u", True,  "+5V", 0,    "GND"),
    ("C6", "100n", False, "+5V", 0,   "GND"),
    ("C7", "10u", True,  "+3V3", 0,   "GND"),
    ("C8", "100n", False, "+3V3", 0,  "GND"),
]
for k, (ref, val, pol, top, toprot, bot) in enumerate(CAPS):
    cx = 251.46 + 8.89 * k
    lib = "Device:C_Polarized" if pol else "Device:C"
    fp = ("Capacitor_SMD:CP_Elec_4x5.3" if pol
          else "Capacitor_SMD:C_0805_2012Metric")
    component(lib, ref, val, cx, 73.66, 0, fp,
              extra_props=rprop(ref, val, cx, 73.66, cx + 2.29, 72.39, cx + 2.29, 74.93))
    power(f"power:{top}", cx, 69.85, toprot,
          vx=cx, vy=(69.85 - 3.302 if toprot == 0 else 69.85 - 3.81))
    power(f"power:{bot}", cx, 77.47)

# ============ PWR_FLAG stubs ============
for k, rail in enumerate(("+12V", "-12V", "GND")):
    x1 = 243.84 + 12.7 * k
    wire(x1, 88.9, x1 + 5.08, 88.9)
    power(f"power:{rail}", x1, 88.9,
          vx=x1, vy=88.9 - 3.302 if rail != "GND" else 92.71)
    flag(x1 + 5.08, 88.9)

# ============ slots J1..J6 (gen 2: 2x12, spi-bus-spec v2.0) ============
SLOT_L = ["GND", "GND", "GND", "SCLK", "MOSI", "MISO", "CS{i}", "LDAC", "SDA",
          "CONVST", "MCLK", "LRCLK"]
SLOT_R = ["+12V", "-12V", "+3V3", "GND", "GND", "GND", "GND", "IRQ{i}", "SCL",
          "GND", "BCLK", "I2SD{i}"]
RAILS = {"GND", "+12V", "-12V", "+3V3", "+5V"}
L_STUB = [12.7, 17.78, 17.78] + [12.7] * 9
R_STUB = [12.7, 17.78, 12.7, 17.78, 12.7, 17.78, 17.78, 12.7, 12.7, 17.78,
          12.7, 12.7]
SLOT_POS = [(170, 185.42), (225, 185.42), (280, 185.42),
            (170, 241.3), (225, 241.3), (280, 241.3)]
for i, (sx, sy) in enumerate(SLOT_POS, start=1):
    component("Custom:Conn_02x12", f"J{i}", f"SLOT {i}", sx, sy, 0,
              "Connector_PinSocket_2.54mm:PinSocket_2x12_P2.54mm_Vertical",
              extra_props=rprop(f"J{i}", f"SLOT {i}", sx, sy, sx, sy - 19.05, sx, sy + 19.05))
    for k in range(12):
        y = sy - 13.97 + 2.54 * k
        name = SLOT_L[k].format(i=i)
        xe = sx - L_STUB[k]
        wire(sx - 7.62, y, xe, y)
        if name in RAILS:
            power(f"power:{name}", xe, y)
        else:
            label(name, xe, y)
        name = SLOT_R[k].format(i=i)
        xe = sx + R_STUB[k]
        wire(sx + 7.62, y, xe, y)
        if name in RAILS:
            vy = y - 3.302 if name in ("+12V", "+3V3") else y + 3.81
            power(f"power:{name}", xe, y, 0, vx=xe, vy=vy)
        else:
            label(name, xe, y)

# ============ hubs J7..J8 (ONGEWIJZIGD; CS7/CS8 komen uit de decoder) ======
HUB_L = ["GND", "MISO", "SCLK", "+3V3", "-12V"]
HUB_R = ["CS{n}", "MOSI", "GND", "GND", "+12V"]
HL_STUB = [17.78, 12.7, 12.7, 17.78, 12.7]
HR_STUB = [12.7, 12.7, 17.78, 12.7, 17.78]
for h, (sx, sy) in enumerate(((350, 185.42), (350, 241.3)), start=7):
    component("Custom:Conn_02x05", f"J{h}", f"HUB {h-6} (IDC)", sx, sy, 0,
              "Connector_IDC:IDC-Header_2x05_P2.54mm_Vertical",
              extra_props=rprop(f"J{h}", f"HUB {h-6}", sx, sy, sx, sy - 10.16, sx, sy + 10.16))
    for k in range(5):
        y = sy - 5.08 + 2.54 * k
        name = HUB_L[k]
        xe = sx - HL_STUB[k]
        wire(sx - 7.62, y, xe, y)
        if name in RAILS:
            vy = y - 3.302 if name == "+3V3" else y + 3.81
            power(f"power:{name}", xe, y, 0, vx=xe, vy=vy)
        else:
            label(name, xe, y)
        name = HUB_R[k].format(n=h)
        xe = sx + HR_STUB[k]
        wire(sx + 7.62, y, xe, y)
        if name in RAILS:
            vy = y - 3.302 if name == "+12V" else y + 3.81
            power(f"power:{name}", xe, y, 0, vx=xe, vy=vy)
        else:
            label(name, xe, y)

# ============ v2: CS-decoder 74HC154 ============
libs_extra = []
libs_extra.append(boxdef("74HC154",
    [("23", "A0", "input"), ("22", "A1", "input"), ("21", "A2", "input"),
     ("20", "A3", "input"), ("18", "~{E0}", "input"), ("19", "~{E1}", "input"),
     ("24", "VCC", "power_in"), ("12", "GND", "power_in")],
    [("1", "Y0", "output"), ("2", "Y1", "output"), ("3", "Y2", "output"),
     ("4", "Y3", "output"), ("5", "Y4", "output"), ("6", "Y5", "output"),
     ("7", "Y6", "output"), ("8", "Y7", "output"), ("9", "Y8", "output"),
     ("10", "Y9", "output"), ("11", "Y10", "output"), ("13", "Y11", "output"),
     ("14", "Y12", "output"), ("15", "Y13", "output"), ("16", "Y14", "output"),
     ("17", "Y15", "output")]))
place_box("74HC154", "U4", "74HC154", 155, 62,
          "Package_SO:SOIC-24W_7.5x15.4mm_P1.27mm",
          {"23": ("label", "CSA0"), "22": ("label", "CSA1"),
           "21": ("label", "CSA2"), "20": ("label", "CSA3"),
           "18": ("label", "CS_EN"), "19": ("power", "power:GND"),
           "24": ("power", "power:+3V3"), "12": ("power", "power:GND"),
           "1": ("label", "CS1"), "2": ("label", "CS2"), "3": ("label", "CS3"),
           "4": ("label", "CS4"), "5": ("label", "CS5"), "6": ("label", "CS6"),
           "7": ("label", "CS7"), "8": ("label", "CS8"), "9": ("label", "CS9"),
           "10": ("label", "CS10"), "11": ("label", "CS11"), "13": ("label", "CS12"),
           "14": ("label", "CS13"), "15": ("label", "CS14"),
           "16": ("label", "IRQSTAT"), "17": ("nc",)})
cap100n("C10", 128, 62)

# ============ v2: IRQ-keten 2x 74HC165 + 1G125 ============
libs_extra.append(boxdef("74HC165",
    [("1", "~{PL}", "input"), ("2", "CP", "input"), ("15", "~{CE}", "input"),
     ("10", "DS", "input"), ("16", "VCC", "power_in"), ("8", "GND", "power_in")],
    [("6", "D7", "input"), ("5", "D6", "input"), ("4", "D5", "input"),
     ("3", "D4", "input"), ("14", "D3", "input"), ("13", "D2", "input"),
     ("12", "D1", "input"), ("11", "D0", "input"),
     ("9", "Q7", "output"), ("7", "~{Q7}", "output")]))
# U5 = eerste byte (bit15..8 van het statuswoord): IRQ1..IRQ6 op D7..D2
# D-toewijzing volgt de bordgeometrie (noordrij = IRQ1-4, D7/D6 = IRQ5/6);
# firmware-bitvolgorde: eerste byte = [IRQ5,IRQ6,x,x,IRQ1,IRQ2,IRQ3,IRQ4] (D7..D0).
place_box("74HC165", "U5", "74HC165", 200, 62,
          "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm",
          {"1": ("label", "PL"), "2": ("label", "SCLK"),
           "15": ("power", "power:GND"), "10": ("label", "CHAIN"),
           "16": ("power", "power:+3V3"), "8": ("power", "power:GND"),
           "6": ("label", "IRQ5"), "5": ("label", "IRQ6"), "4": ("power", "power:GND"),
           "3": ("power", "power:GND"), "14": ("label", "IRQ1"), "13": ("label", "IRQ2"),
           "12": ("label", "IRQ3"), "11": ("label", "IRQ4"),
           "9": ("label", "Q7A"), "7": ("nc",)})
# U6 = tweede byte: IRQ7..IRQ12 (expansie) op D7..D2 — eigen ~PL-RC (PL2),
# zodat de puls lokaal bij U6 (noordstrook) wordt opgewekt i.p.v. het halve
# bord over te reizen; beide RC's hangen aan dezelfde IRQSTAT-flank.
place_box("74HC165", "U6", "74HC165", 200, 120,
          "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm",
          {"1": ("label", "PL2"), "2": ("label", "SCLK"),
           "15": ("power", "power:GND"), "10": ("power", "power:GND"),
           "16": ("power", "power:+3V3"), "8": ("power", "power:GND"),
           "6": ("label", "IRQ7"), "5": ("label", "IRQ8"), "4": ("label", "IRQ9"),
           "3": ("label", "IRQ10"), "14": ("label", "IRQ11"), "13": ("label", "IRQ12"),
           "12": ("power", "power:GND"), "11": ("power", "power:GND"),
           "9": ("label", "CHAIN"), "7": ("nc",)})
libs_extra.append(boxdef("74LVC1G125",
    [("1", "~{OE}", "input"), ("2", "A", "input"),
     ("5", "VCC", "power_in"), ("3", "GND", "power_in")],
    [("4", "Y", "tri_state")], width=12.7))
place_box("74LVC1G125", "U7", "74LVC1G125", 155, 120,
          "Package_TO_SOT_SMD:SOT-23-5",
          {"1": ("label", "IRQSTAT"), "2": ("label", "Q7A"),
           "5": ("power", "power:+3V3"), "3": ("power", "power:GND"),
           "4": ("label", "MISO")})
cap100n("C15", 178, 62)   # U5
cap100n("C16", 178, 120)  # U6
cap100n("C17", 140, 120)  # U7/1G17's
# PL-RC (gatein8-recept): C9 220p vanaf IRQSTAT, R5 10k pull-up naar 3V3
(c9a, c9b) = rcomp("C9", "220p", 128, 138, 90)
wire(*c9a, c9a[0] - 3.81, c9a[1]); label("IRQSTAT", c9a[0] - 3.81, c9a[1])
wire(*c9b, c9b[0] + 3.81, c9b[1]); label("PL", c9b[0] + 3.81, c9b[1])
(r5t, r5b) = rcomp("R5", "10k", 128, 122, 0)
power("power:+3V3", *r5t)
wire(*r5b, r5b[0], r5b[1] + 2.54); label("PL", r5b[0], r5b[1] + 2.54)
# tweede PL-RC voor U6 (PL2)
(c18a, c18b) = rcomp("C18", "220p", 155, 138, 90)
wire(*c18a, c18a[0] - 3.81, c18a[1]); label("IRQSTAT", c18a[0] - 3.81, c18a[1])
wire(*c18b, c18b[0] + 3.81, c18b[1]); label("PL2", c18b[0] + 3.81, c18b[1])
(r33t, r33b) = rcomp("R33", "10k", 155, 122, 0)
power("power:+3V3", *r33t)
wire(*r33b, r33b[0], r33b[1] + 2.54); label("PL2", r33b[0], r33b[1] + 2.54)
# IRQ-pulldowns (12x 100k): gedefinieerd niveau voor lege slots/expansie
for k in range(12):
    xr = 88 + 5.08 * k
    (t, b) = rcomp(f"R{21+k}", "100k", xr, 155, 0)
    wire(t[0], t[1], t[0], t[1] - 1.27); label(f"IRQ{k+1}", t[0], t[1] - 1.27)
    power("power:GND", *b)

# ============ v2: expansie-buffer 74LVC245 + serie-R ============
libs_extra.append(boxdef("74LVC245",
    [("1", "DIR", "input"), ("19", "~{OE}", "input"),
     ("20", "VCC", "power_in"), ("10", "GND", "power_in"),
     ("2", "A1", "input"), ("3", "A2", "input"), ("4", "A3", "input"),
     ("5", "A4", "input"), ("6", "A5", "input"), ("7", "A6", "input"),
     ("8", "A7", "input"), ("9", "A8", "input")],
    [("18", "B1", "tri_state"), ("17", "B2", "tri_state"), ("16", "B3", "tri_state"),
     ("15", "B4", "tri_state"), ("14", "B5", "tri_state"), ("13", "B6", "tri_state"),
     ("12", "B7", "tri_state"), ("11", "B8", "tri_state")]))
place_box("74LVC245", "U8", "74LVC245", 245, 120,
          "Package_SO:SOIC-20W_7.5x12.8mm_P1.27mm",
          {"1": ("power", "power:+3V3"), "19": ("power", "power:GND"),
           "20": ("power", "power:+3V3"), "10": ("power", "power:GND"),
           "2": ("label", "SCLK"), "3": ("label", "MOSI"), "4": ("label", "LDAC"),
           "5": ("label", "CONVST"), "6": ("label", "SPARE2"),
           "7": ("power", "power:GND"), "8": ("power", "power:GND"),
           "9": ("power", "power:GND"),
           "18": ("label", "XSCLK0"), "17": ("label", "XMOSI0"),
           "16": ("label", "XLDAC0"), "15": ("label", "XCONVST0"),
           "14": ("label", "XRST0"), "13": ("nc",), "12": ("nc",), "11": ("nc",)})
cap100n("C11", 222, 100)
# 33R serie in de gebufferde lijnen naar de expansieheader
for k, (a, b) in enumerate((("XSCLK0", "XSCLK"), ("XMOSI0", "XMOSI"),
                            ("XLDAC0", "XLDAC"), ("XCONVST0", "XCONVST"),
                            ("XRST0", "XRST"))):
    (l, r) = rcomp(f"R{16+k}", "33R", 285, 108 + 5.08 * k, 90)
    wire(*l, l[0] - 2.54, l[1]); label(a, l[0] - 2.54, l[1])
    wire(*r, r[0] + 2.54, r[1]); label(b, r[0] + 2.54, r[1])

# ============ v2: expansieheader J21 (2x13) ============
# Pinvolgorde volgt de bordgeometrie (rot 90: oneven = zuidrij, even = noordrij,
# paren west->oost): CS'en + X-lijnen zuid, IRQ's + I2C noord. MISO zit er niet
# in als aparte pin: het 2e segment prikt MISO... wel dus: pin 13.
J21_L = ["CS9", "CS10", "CS11", "CS12", "CS13", "CS14", "MISO",
         "XSCLK", "XMOSI", "XLDAC", "XCONVST", "XRST", "GND"]
J21_R = ["IRQ7", "IRQ8", "IRQ9", "IRQ10", "IRQ11", "IRQ12", "GND",
         "GND", "GND", "GND", "SDA", "SCL", "GND"]
J21X, J21Y = 55, 45
component("Custom:Conn_02x13", "J21", "EXPANSION (2e segment)", J21X, J21Y, 0,
          "Connector_IDC:IDC-Header_2x13_P2.54mm_Vertical",
          extra_props=rprop("J21", "EXPANSION", J21X, J21Y, J21X, J21Y - 19.05, J21X, J21Y + 19.05))
for k in range(13):
    y = J21Y - 15.24 + 2.54 * k
    for name, xe, s in ((J21_L[k], J21X - 12.7, -1), (J21_R[k], J21X + 12.7, 1)):
        wire(J21X + s * 7.62, y, xe, y)
        if name in RAILS:
            power(f"power:{name}", xe, y, 0,
                  vx=xe, vy=(y - 3.302 if name != "GND" else y + 3.81))
        else:
            label(name, xe, y)

# ============ v2: MIDI 2x IN (H11L1) + 1x UIT (1G17) ============
libs_extra.append(boxdef("H11L1",
    [("1", "A", "passive"), ("2", "K", "passive")],
    [("6", "VCC", "power_in"), ("4", "VO", "open_collector"),
     ("5", "GND", "power_in"), ("3", "NC", "passive")], width=12.7))
libs_extra.append(boxdef("74LVC1G17",
    [("2", "A", "input"), ("5", "VCC", "power_in"), ("3", "GND", "power_in")],
    [("4", "Y", "output"), ("1", "NC", "passive")], width=12.7))
D_SYM = '''    (symbol "Device:D"
      (pin_names (offset 0) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "D" (at 0 2.54 0) (effects (font (size 1.27 1.27))))
      (property "Value" "D" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "D_0_1"
        (polyline (pts (xy -1.27 1.27) (xy -1.27 -1.27)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 1.27 1.27) (xy 1.27 -1.27) (xy -1.27 0) (xy 1.27 1.27)) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "D_1_1"
        (pin passive line (at -3.81 0 0) (length 2.54)
          (name "K" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 3.81 0 180) (length 2.54)
          (name "A" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )'''
libs_extra.append(boxdef("BAT54S",
    [("1", "A1", "passive"), ("3", "K1A2", "passive")],
    [("2", "K2", "passive")], width=12.7))

for k, (uref, jref, rser, rpu, dref, rxnet) in enumerate((
        ("U9", "J13", "R6", "R8", "D1", "MIDI_RX1"),
        ("U10", "J14", "R7", "R9", "D2", "MIDI_RX2"))):
    yb = 95 + 32 * k
    # DIN-header: 1 = DIN-4 (+), 2 = DIN-5 (-), 3 = afscherming (nc op IN)
    component("Custom:Conn_01x03", jref, f"MIDI IN{k+1}", 438, yb, 0,
              "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
              extra_props=rprop(jref, f"MIDI IN{k+1}", 438, yb, 438, yb - 6.35, 438, yb + 6.35))
    wire(430.38, yb - 2.54, 425.3, yb - 2.54); label(f"MIN{k+1}_4", 425.3, yb - 2.54)
    wire(430.38, yb, 425.3, yb); label(f"MIN{k+1}_5", 425.3, yb)
    nc(430.38, yb + 2.54)
    # 220R serie
    (l, r) = rcomp(rser, "220R", 370, yb - 6, 90)
    wire(*l, l[0] - 2.54, l[1]); label(f"MIN{k+1}_4", l[0] - 2.54, l[1])
    wire(*r, r[0] + 2.54, r[1]); label(f"MIN{k+1}_A", r[0] + 2.54, r[1])
    # opto
    place_box("H11L1", uref, "H11L1", 392, yb, "Package_DIP:DIP-6_W7.62mm",
              {"1": ("label", f"MIN{k+1}_A"), "2": ("label", f"MIN{k+1}_5"),
               "6": ("power", "power:+3V3"), "4": ("label", rxnet),
               "5": ("power", "power:GND"), "3": ("nc",)})
    # 1N4148 antiparallel over de LED (K aan anode-net, A aan kathode-net)
    component("Device:D", dref, "1N4148WS", 374, yb + 6, 0, "Diode_SMD:D_SOD-323",
              extra_props=rprop(dref, "1N4148WS", 374, yb + 6, 374, yb + 3.5, 374, yb + 8.6))
    wire(370.19, yb + 6, 367.66, yb + 6); label(f"MIN{k+1}_A", 367.66, yb + 6)
    wire(377.81, yb + 6, 380.34, yb + 6); label(f"MIN{k+1}_5", 380.34, yb + 6)
    # pull-up op de open-collector-uitgang
    (t, b) = rcomp(rpu, "1k", 411, yb - 8, 0)
    power("power:+3V3", *t)
    wire(*b, b[0], b[1] + 1.27); label(rxnet, b[0], b[1] + 1.27)
cap100n("C12", 362, 90)

# MIDI OUT: 1G17-buffer + 10R/33R per 3V3-MIDI-spec
place_box("74LVC1G17", "U11", "74LVC1G17", 392, 158, "Package_TO_SOT_SMD:SOT-23-5",
          {"2": ("label", "MIDI_TX"), "5": ("power", "power:+3V3"),
           "3": ("power", "power:GND"), "4": ("label", "MOUT_Y"), "1": ("nc",)})
(l, r) = rcomp("R10", "10R", 414, 152, 90)
wire(*l, l[0] - 2.54, l[1]); label("MOUT_Y", l[0] - 2.54, l[1])
wire(*r, r[0] + 2.54, r[1]); label("MOUT5", r[0] + 2.54, r[1])
(l, r) = rcomp("R11", "33R", 414, 160, 90)
power("power:+3V3", l[0] - 1.27, l[1], vx=l[0] - 1.27, vy=l[1] - 3.302)
wire(*l, l[0] - 1.27, l[1])
wire(*r, r[0] + 2.54, r[1]); label("MOUT4", r[0] + 2.54, r[1])
component("Custom:Conn_01x03", "J15", "MIDI OUT", 438, 160, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
          extra_props=rprop("J15", "MIDI OUT", 438, 160, 438, 160 - 6.35, 438, 160 + 6.35))
wire(430.38, 157.46, 425.3, 157.46); label("MOUT5", 425.3, 157.46)
wire(430.38, 160, 425.3, 160); label("MOUT4", 425.3, 160)
wire(430.38, 162.54, 427.84, 162.54); power("power:GND", 427.84, 162.54)

# ============ v3: MIDI OUT2 (TX7 -> 1G17 -> J22) ============
place_box("74LVC1G17", "U14", "74LVC1G17", 392, 182, "Package_TO_SOT_SMD:SOT-23-5",
          {"2": ("label", "MIDI_TX2"), "5": ("power", "power:+3V3"),
           "3": ("power", "power:GND"), "4": ("label", "MOUT2_Y"), "1": ("nc",)})
(l, r) = rcomp("R34", "10R", 414, 176, 90)
wire(*l, l[0] - 2.54, l[1]); label("MOUT2_Y", l[0] - 2.54, l[1])
wire(*r, r[0] + 2.54, r[1]); label("MOUT2_5", r[0] + 2.54, r[1])
(l, r) = rcomp("R35", "33R", 414, 184, 90)
power("power:+3V3", l[0] - 1.27, l[1], vx=l[0] - 1.27, vy=l[1] - 3.302)
wire(*l, l[0] - 1.27, l[1])
wire(*r, r[0] + 2.54, r[1]); label("MOUT2_4", r[0] + 2.54, r[1])
component("Custom:Conn_01x03", "J22", "MIDI OUT2", 438, 184, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
          extra_props=rprop("J22", "MIDI OUT2", 438, 184, 438, 184 - 6.35, 438, 184 + 6.35))
wire(430.38, 181.46, 425.3, 181.46); label("MOUT2_5", 425.3, 181.46)
wire(430.38, 184, 425.3, 184); label("MOUT2_4", 425.3, 184)
wire(430.38, 186.54, 427.84, 186.54); power("power:GND", 427.84, 186.54)
cap100n("C19", 362, 176)

# ============ v3: USB-host-doorvoer J23 (2x5, 1-op-1) ============
# Rij A (oneven) = kabeltje van de Teensy-hostpads; rij B (even) = kabeltje
# naar de paneel-USB-A. Pin-voor-pin doorverbonden en bewust volgorde-
# ongevoelig (netten USBH_1..5): de volgorde staat op de Teensy-onderzijde.
# VBUS (500 mA) loopt via de Teensy VIN = +5V-rail -> daarom de 1A-regelaar.
J23X, J23Y = 30, 100
component("Custom:Conn_02x05", "J23", "USB HOST (Teensy <-> paneel)", J23X, J23Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x05_P2.54mm_Vertical",
          extra_props=rprop("J23", "USB HOST", J23X, J23Y, J23X, J23Y - 10.16, J23X, J23Y + 10.16))
for k in range(5):
    y = J23Y - 5.08 + 2.54 * k
    wire(J23X - 7.62, y, J23X - 12.7, y); label(f"USBH_{k+1}", J23X - 12.7, y)
    wire(J23X + 7.62, y, J23X + 12.7, y); label(f"USBH_{k+1}", J23X + 12.7, y)

# ============ v3: audiohub J24 (2x7) ============
# Klokken + de zes per-slot datalijnen; het audio-broertje van J7/J8.
# Een toekomstige FPGA-/TDM-mixer prikt hier in (en een expander-segment
# krijgt via zijn eigen J24 de klokken aangeleverd).
J24_L = ["MCLK", "LRCLK", "I2SD1", "I2SD3", "I2SD5", "GND", "GND"]
J24_R = ["BCLK", "GND", "I2SD2", "I2SD4", "I2SD6", "GND", "GND"]
J24X, J24Y = 378, 305
component("Custom:Conn_02x07", "J24", "AUDIOHUB (I2S)", J24X, J24Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical",
          extra_props=rprop("J24", "AUDIOHUB", J24X, J24Y, J24X, J24Y - 12.7, J24X, J24Y + 12.7))
for k in range(7):
    y = J24Y - 7.62 + 2.54 * k
    for name, xe, s in ((J24_L[k], J24X - 12.7, -1), (J24_R[k], J24X + 12.7, 1)):
        wire(J24X + s * 7.62, y, xe, y)
        if name in RAILS:
            power(f"power:{name}", xe, y, 0,
                  vx=xe, vy=(y - 3.302 if name != "GND" else y + 3.81))
        else:
            label(name, xe, y)

# ============ v2: CAN3-transceiver ============
libs_extra.append(boxdef("SN65HVD230",
    [("1", "D", "input"), ("4", "R", "output"), ("8", "RS", "passive"),
     ("5", "VREF", "passive"), ("3", "VCC", "power_in"), ("2", "GND", "power_in")],
    [("7", "CANH", "passive"), ("6", "CANL", "passive")]))
place_box("SN65HVD230", "U12", "SN65HVD230", 320, 227,
          "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
          {"1": ("label", "CAN_TX"), "4": ("label", "CAN_RX"),
           "8": ("label", "CAN_RS"), "5": ("nc",),
           "3": ("power", "power:+3V3"), "2": ("power", "power:GND"),
           "7": ("label", "CANH"), "6": ("label", "CANL")})
(t, b) = rcomp("R13", "10k", 302, 246, 0)
wire(t[0], t[1], t[0], t[1] - 1.27); label("CAN_RS", t[0], t[1] - 1.27)
power("power:GND", *b)
cap100n("C13", 288, 227)
# terminatie: 120R + soldeerjumper JP1 in serie over CANH/CANL
(l, r) = rcomp("R12", "120R", 330, 208, 90)
wire(*l, l[0] - 2.54, l[1]); label("CANH", l[0] - 2.54, l[1])
wire(*r, r[0] + 2.54, r[1]); label("CAN_TRM", r[0] + 2.54, r[1])
component("Custom:Conn_01x02", "JP1", "TERM 120R", 366, 214, 0,
          "Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm",
          extra_props=rprop("JP1", "TERM", 366, 214, 366, 214 - 5.08, 366, 214 + 5.08))
wire(358.38, 212.73, 355.84, 212.73); label("CAN_TRM", 355.84, 212.73)
wire(358.38, 215.27, 355.84, 215.27); label("CANL", 355.84, 215.27)
# header naar de satellieten (+12V mee voor voeding)
component("Custom:Conn_01x04", "J16", "CAN BUS", 390, 214, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
          extra_props=rprop("J16", "CAN", 390, 214, 390, 214 - 8, 390, 214 + 8))
J16_P = ["+12V", "CANH", "CANL", "GND"]
for k in range(4):
    y = 214 - 3.81 + 2.54 * k
    nmP = J16_P[k]
    wire(382.38, y, 377.3, y)
    if nmP in RAILS:
        power(f"power:{nmP}", 377.3, y, 0,
              vx=377.3, vy=(y - 3.302 if nmP != "GND" else y + 3.81))
    else:
        label(nmP, 377.3, y)

# ============ v2: TUNE-IN-conditionering ============
component("Custom:Conn_01x02", "J18", "TUNE IN", 30, 305, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
          extra_props=rprop("J18", "TUNE", 30, 305, 30, 305 - 5.08, 30, 305 + 5.08))
wire(22.38, 303.73, 19.84, 303.73); label("TUNE_J", 19.84, 303.73)
wire(22.38, 306.27, 19.84, 306.27); power("power:GND", 19.84, 306.27)
(l, r) = rcomp("R14", "100k", 46, 303.73, 90)
wire(*l, l[0] - 2.54, l[1]); label("TUNE_J", l[0] - 2.54, l[1])
wire(*r, r[0] + 2.54, r[1]); label("TUNE_N", r[0] + 2.54, r[1])
(t, b) = rcomp("R15", "100k", 60, 318, 0)
wire(t[0], t[1], t[0], t[1] - 1.27); label("TUNE_N", t[0], t[1] - 1.27)
power("power:GND", *b)
place_box("BAT54S", "D3", "BAT54S", 80, 305, "Package_TO_SOT_SMD:SOT-23",
          {"1": ("power", "power:GND"), "3": ("label", "TUNE_N"),
           "2": ("power", "power:+3V3")})
place_box("74LVC1G17", "U13", "74LVC1G17", 108, 305, "Package_TO_SOT_SMD:SOT-23-5",
          {"2": ("label", "TUNE_N"), "5": ("power", "power:+3V3"),
           "3": ("power", "power:GND"), "4": ("label", "TUNE_T"), "1": ("nc",)})
cap100n("C14", 126, 318)

# ============ v2: delegate-UART-poorten ============
for jref, nm, tx, rx, xj in (("J19", "DLG1 (Serial3)", "DLG1_TX", "DLG1_RX", 152),
                             ("J20", "DLG2 (Serial4)", "DLG2_TX", "DLG2_RX", 182)):
    component("Custom:Conn_01x04", jref, nm, xj, 305, 0,
              "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
              extra_props=rprop(jref, nm, xj, 305, xj, 305 - 8, xj, 305 + 8))
    pn = ["GND", tx, rx, "GND"]
    for k in range(4):
        y = 305 - 3.81 + 2.54 * k
        nmP = pn[k]
        wire(xj - 7.62, y, xj - 12.7, y)
        if nmP in RAILS:
            power(f"power:{nmP}", xj - 12.7, y)
        else:
            label(nmP, xj - 12.7, y)

# ============ v3.1: J25 Axon-voeding (+5V/GND, op het bord naast J19) ============
component("Custom:Conn_01x02", "J25", "AXON PWR", 207, 305, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
          extra_props=rprop("J25", "AXON PWR", 207, 305, 207, 305 - 5.08, 207, 305 + 5.08))
wire(199.38, 303.73, 196.84, 303.73); power("power:+5V", 196.84, 303.73)
wire(199.38, 306.27, 196.84, 306.27); power("power:GND", 196.84, 306.27)

# ============ v2: codec-header J17 (I2S1 TDM, CS42448-bord) ============
# oneven (zuidrij) = voeding, even (noordrij) = signalen; I2C loopt via
# de Qwiic-keten (J12), niet over deze header.
J17_L = ["+3V3", "+5V", "GND", "GND", "GND", "+12V", "-12V"]
J17_R = ["CODEC_RST", "MCLK", "BCLK", "LRCLK", "I2S_OUT", "I2S_IN", "GND"]
J17X, J17Y = 315, 127
component("Custom:Conn_02x07", "J17", "AUDIO/CODEC (TDM)", J17X, J17Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical",
          extra_props=rprop("J17", "AUDIO/CODEC", J17X, J17Y, J17X, J17Y - 12.7, J17X, J17Y + 12.7))
for k in range(7):
    y = J17Y - 7.62 + 2.54 * k
    for name, xe, s in ((J17_L[k], J17X - 12.7, -1), (J17_R[k], J17X + 12.7, 1)):
        wire(J17X + s * 7.62, y, xe, y)
        if name in RAILS:
            power(f"power:{name}", xe, y, 0,
                  vx=xe, vy=(y - 3.302 if name not in ("GND", "-12V") else y + 3.81))
        else:
            label(name, xe, y)

# ============ v1.1-headers: EXP (v2-pinset) / DISPLAY / QWIIC ============
J10X, J10Y = 215, 305
component("Custom:Conn_02x07", "J10", "EXP", J10X, J10Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical",
          extra_props=rprop("J10", "EXP", J10X, J10Y, J10X, J10Y - 12.7, J10X, J10Y + 12.7))
J10_L = ["+3V3", "+5V", "D10", None, "D36", "D38", "GND"]  # D29 -> MIDI OUT2 (v3)
J10_R = ["GND", "GND", "D33", "D32", "D37", "D39", "GND"]
for k in range(7):
    y = J10Y - 7.62 + 2.54 * k
    nmL = J10_L[k]
    if nmL is None:
        nc(J10X - 7.62, y)
    elif nmL in RAILS:
        wire(J10X - 7.62, y, J10X - 12.7, y)
        power(f"power:{nmL}", J10X - 12.7, y, 0,
              vx=J10X - 12.7, vy=(y - 3.302 if nmL != "GND" else y + 3.81))
    else:
        wire(J10X - 7.62, y, J10X - 12.7, y)
        label(nmL, J10X - 12.7, y)
    nmR = J10_R[k]
    wire(J10X + 7.62, y, J10X + 12.7, y)
    if nmR in RAILS:
        power(f"power:{nmR}", J10X + 12.7, y)
    else:
        label(nmR, J10X + 12.7, y)

J11X, J11Y = 280, 305
component("Custom:Conn_01x09", "J11", "DISPLAY (SPI1)", J11X, J11Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x09_P2.54mm_Vertical",
          extra_props=rprop("J11", "DISPLAY", J11X, J11Y, J11X, J11Y - 14, J11X, J11Y + 14))
J11_P = ["+3V3", "GND", "DISP_CS", "DISP_RST", "DISP_DC", "MOSI1", "SCK1", "+3V3", None]
for k in range(9):
    y = J11Y - 10.16 + 2.54 * k
    nmP = J11_P[k]
    if nmP is None:
        nc(J11X - 7.62, y)
    elif nmP in RAILS:
        wire(J11X - 7.62, y, J11X - 12.7, y)
        power(f"power:{nmP}", J11X - 12.7, y, 0,
              vx=J11X - 12.7, vy=(y - 3.302 if nmP != "GND" else y + 3.81))
    else:
        wire(J11X - 7.62, y, J11X - 12.7, y)
        label(nmP, J11X - 12.7, y)

J12X, J12Y = 335, 305
component("Custom:Conn_01x04", "J12", "QWIIC/I2C", J12X, J12Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
          extra_props=rprop("J12", "QWIIC", J12X, J12Y, J12X, J12Y - 8, J12X, J12Y + 8))
J12_P = ["GND", "+3V3", "SDA", "SCL"]
for k in range(4):
    y = J12Y - 3.81 + 2.54 * k
    nmP = J12_P[k]
    wire(J12X - 7.62, y, J12X - 12.7, y)
    if nmP in RAILS:
        power(f"power:{nmP}", J12X - 12.7, y, 0,
              vx=J12X - 12.7, vy=(y - 3.302 if nmP != "GND" else y + 3.81))
    else:
        label(nmP, J12X - 12.7, y)

# ============ teksten ============
items.append('''  (text "MusicBrain SPI-busboard v3 - Teensy 4.1 backplane (gen 2)" (exclude_from_sim no) (at 20.32 20.32 0)
    (effects (font (size 2.54 2.54) bold) (justify left)))''')
items.append('''  (text "v3 (gen 2): slots 2x12 met audio (MCLK/BCLK/LRCLK gedeeld, I2SD per slot ->\\naudiohub J24), CONVST = slotpin 19, MIDI 2xIN/2xUIT (J22 = TX7), USB-host-doorvoer\\nJ23, R-78E5.0-1.0. Architectuur v2: 74HC154-CS-decoder (16 CS), 74HC165-IRQ-keten\\n(Y14=IRQSTAT), expansie J21 (CS9-14, IRQ7-12; XRST = reserve), CAN3, codec-I2S1,\\nTUNE-IN. Klokmaster: default de master-Teensy (firmwarekeuze)." (exclude_from_sim no) (at 20.32 240 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "Spec: doc/spi-bus-spec.md v2.0 + doc/busboard-v3-plan.md\\n\\nSlot pinout (2x12, gen 2):\\n  1 GND      2 +12V\\n  3 GND      4 -12V\\n  5 GND      6 +3V3\\n  7 SCLK     8 GND\\n  9 MOSI    10 GND\\n 11 MISO    12 GND\\n 13 CS*     14 GND\\n 15 LDAC    16 IRQ*\\n 17 SDA     18 SCL\\n 19 CONVST  20 GND\\n 21 MCLK    22 BCLK\\n 23 LRCLK   24 I2SD*\\n  (* = geografisch per slot)" (exclude_from_sim no) (at 20.32 200.66 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "Regels:\\n - 33R serie in SCLK/MOSI bij Teensy (R1/R2)\\n - I2C pull-ups 2k2 (R3/R4)\\n - +3V3 bus uit AMS1117, NIET uit Teensy\\n - Teensy VIN = +5V rail; VUSB-brug doorsnijden bij\\n   gelijktijdig USB- en busvoeding\\n - backplane <= 20 cm, GND-vlak onder de bus" (exclude_from_sim no) (at 20.32 160.02 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "Firmware: CS kiezen = CSA0..3 zetten, dan CS_EN laag (Y-uitgang laag).\\nIRQ-status = transactie op CS15 (Y14): 16 bits, eerste byte = IRQ1..6 op bit7..2.\\nCS9..CS14 + IRQ7..12 = expansie (J21). Y15 = parkeerstand." (exclude_from_sim no) (at 130 30 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')

# ============ lib symbols ============
def conn_symbol(name, rows):
    top = rows * 1.27 + 1.27
    pins = []
    for k in range(rows):
        yy = (rows - 1) * 1.27 - 2.54 * k
        odd, even = 2 * k + 1, 2 * k + 2
        pins.append(f'''        (pin passive line (at -7.62 {g(yy)} 0) (length 2.54)
          (name "Pin_{odd}" (effects (font (size 1.27 1.27))))
          (number "{odd}" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 7.62 {g(yy)} 180) (length 2.54)
          (name "Pin_{even}" (effects (font (size 1.27 1.27))))
          (number "{even}" (effects (font (size 1.0 1.0)))))''')
    return _conn_body(name, top, pins)

def conn1_symbol(name, rows):
    top = rows * 1.27 + 1.27
    pins = []
    for k in range(rows):
        yy = (rows - 1) * 1.27 - 2.54 * k
        pins.append(f'''        (pin passive line (at -7.62 {g(yy)} 0) (length 2.54)
          (name "Pin_{k+1}" (effects (font (size 1.27 1.27))))
          (number "{k+1}" (effects (font (size 1.0 1.0)))))''')
    return _conn_body(name, top, pins)

def _conn_body(name, top, pins):
    return f'''    (symbol "Custom:{name}"
      (pin_names (offset 1.016) (hide yes))
      (property "Reference" "J" (at 0 {g(top + 1.27)} 0) (effects (font (size 1.27 1.27))))
      (property "Value" "{name}" (at 0 -{g(top + 1.27)} 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "{name}_0_1"
        (rectangle (start -5.08 {g(top)}) (end 5.08 -{g(top)})
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "{name}_1_1"
{chr(10).join(pins)}
      )
    )'''

def teensy_symbol():
    names_l = ["GND", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
               "11/MOSI", "12/MISO", "3V3", "24", "25", "26", "27", "28", "29",
               "30", "31", "32"]
    names_r = ["33", "34", "35", "36", "37", "38", "39", "40", "41", "GND",
               "13/SCK", "14", "15", "16", "17", "18/SDA", "19/SCL", "20",
               "21", "22", "23", "3V3", "GND", "VIN"]
    def ptype(nm):
        if nm == "GND" or nm == "VIN":
            return "power_in"
        if nm == "3V3":
            return "power_out"
        return "bidirectional"
    pins = []
    for n in range(1, 25):
        yy = 30.48 - 2.54 * (n - 1)
        nm = names_l[n - 1]
        pins.append(f'''        (pin {ptype(nm)} line (at -17.78 {g(yy)} 0) (length 2.54)
          (name "{nm}" (effects (font (size 1.27 1.27))))
          (number "{n}" (effects (font (size 1.0 1.0)))))''')
    for n in range(25, 49):
        yy = -27.94 + 2.54 * (n - 25)
        nm = names_r[n - 25]
        pins.append(f'''        (pin {ptype(nm)} line (at 17.78 {g(yy)} 180) (length 2.54)
          (name "{nm}" (effects (font (size 1.27 1.27))))
          (number "{n}" (effects (font (size 1.0 1.0)))))''')
    return f'''    (symbol "Custom:Teensy41"
      (pin_names (offset 1.016))
      (property "Reference" "U" (at -15.24 34.29 0) (effects (font (size 1.27 1.27)) (justify left)))
      (property "Value" "Teensy 4.1" (at 0 -33.02 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "https://www.pjrc.com/store/teensy41.html" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "Teensy41_0_1"
        (rectangle (start -15.24 33.02) (end 15.24 -30.48)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "Teensy41_1_1"
{chr(10).join(pins)}
      )
    )'''

def reg_symbol(name, vi_num, gnd_num, vo_num):
    return f'''    (symbol "Custom:{name}"
      (pin_names (offset 1.016))
      (property "Reference" "U" (at 0 7.62 0) (effects (font (size 1.27 1.27))))
      (property "Value" "{name}" (at 0 -10.16 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "{name}_0_1"
        (rectangle (start -10.16 5.08) (end 10.16 -7.62)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "{name}_1_1"
        (pin power_in line (at -12.7 0 0) (length 2.54)
          (name "VI" (effects (font (size 1.27 1.27))))
          (number "{vi_num}" (effects (font (size 1.0 1.0)))))
        (pin power_in line (at 0 -10.16 90) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "{gnd_num}" (effects (font (size 1.0 1.0)))))
        (pin power_out line (at 12.7 0 180) (length 2.54)
          (name "VO" (effects (font (size 1.27 1.27))))
          (number "{vo_num}" (effects (font (size 1.0 1.0)))))
      )
    )'''

def power_symbol(name, up):
    if name == "GND":
        return '''    (symbol "power:GND"
      (power)
      (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes))
      (property "Reference" "#PWR" (at 0 -1.27 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Value" "GND" (at 0 -3.81 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "GND_0_1"
        (polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -1.27 -1.27) (xy 1.27 -1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -0.762 -1.778) (xy 0.762 -1.778)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -0.254 -2.286) (xy 0.254 -2.286)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "GND_1_1"
        (pin power_in line (at 0 0 270) (length 0)
          (name "GND" (effects (font (size 1.27 1.27)) (hide yes)))
          (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''
    d = "" if up else "-"
    return f'''    (symbol "power:{name}"
      (power)
      (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes))
      (property "Reference" "#PWR" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Value" "{name}" (at 0 {"" if up else "-"}3.302 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "{name}_0_1"
        (polyline (pts (xy 0 0) (xy 0 {d}1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -0.762 {d}1.27) (xy 0 {d}2.54) (xy 0.762 {d}1.27)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "{name}_1_1"
        (pin power_in line (at 0 0 90) (length 0)
          (name "{name}" (effects (font (size 1.27 1.27)) (hide yes)))
          (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''

R_SYM = '''    (symbol "Device:R"
      (pin_names (offset 0)) (pin_numbers (hide yes))
      (property "Reference" "R" (at 1.016 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at -1.016 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "R_0_1"
        (polyline (pts (xy -1.016 -2.032) (xy 1.016 -2.032) (xy 1.016 2.032) (xy -1.016 2.032) (xy -1.016 -2.032))
          (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "R_1_1"
        (pin passive line (at 0 3.81 270) (length 1.778)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 0 -3.81 90) (length 1.778)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )'''
C_SYM = '''    (symbol "Device:C"
      (pin_names (offset 0.254))
      (property "Reference" "C" (at 1.524 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "C" (at -1.524 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "C_0_1"
        (polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762)) (stroke (width 0.508) (type default)) (fill (type none)))
        (polyline (pts (xy -2.032 0.762) (xy 2.032 0.762)) (stroke (width 0.508) (type default)) (fill (type none)))
      )
      (symbol "C_1_1"
        (pin passive line (at 0 3.81 270) (length 3.048)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 0 -3.81 90) (length 3.048)
          (name "~" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )'''
CP_SYM = '''    (symbol "Device:C_Polarized"
      (pin_names (offset 0.254))
      (property "Reference" "C" (at 1.524 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "C_Polarized" (at -1.524 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "C_Polarized_0_1"
        (rectangle (start -2.032 0.762) (end 2.032 -0.762) (stroke (width 0.508) (type default)) (fill (type none)))
        (polyline (pts (xy -2.032 -1.524) (xy 2.032 -1.524)) (stroke (width 0.508) (type default)) (fill (type none)))
        (polyline (pts (xy -1.27 -0.762) (xy -1.27 0.762)) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "C_Polarized_1_1"
        (pin passive line (at 0 3.81 270) (length 2.286)
          (name "+" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 0 -3.81 90) (length 2.286)
          (name "-" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
      )
    )'''
FLAG_SYM = '''    (symbol "power:PWR_FLAG"
      (power)
      (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes))
      (property "Reference" "#FLG" (at 0 1.905 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Value" "PWR_FLAG" (at 0 3.81 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "PWR_FLAG_0_1"
        (polyline (pts (xy 0 0) (xy 0 1.27) (xy -1.016 1.905) (xy 0 2.54) (xy 1.016 1.905) (xy 0 1.27))
          (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "PWR_FLAG_1_1"
        (pin power_out line (at 0 0 90) (length 0)
          (name "pwr" (effects (font (size 1.27 1.27)) (hide yes)))
          (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''

libs = "\n".join([
    R_SYM, C_SYM, CP_SYM, D_SYM,
    teensy_symbol(),
    conn_symbol("Conn_02x12", 12),
    conn_symbol("Conn_02x05", 5),
    conn_symbol("Conn_02x07", 7),
    conn_symbol("Conn_02x13", 13),
    conn1_symbol("Conn_01x09", 9),
    conn1_symbol("Conn_01x04", 4),
    conn1_symbol("Conn_01x03", 3),
    conn1_symbol("Conn_01x02", 2),
    reg_symbol("R-78E5.0-1.0", 1, 2, 3),
    reg_symbol("AMS1117-3.3", 3, 1, 2),
    power_symbol("GND", False),
    power_symbol("+12V", True),
    power_symbol("-12V", False),
    power_symbol("+3V3", True),
    power_symbol("+5V", True),
    FLAG_SYM,
] + libs_extra)

doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{ROOT}")
  (paper "A2")
  (title_block
    (title "MusicBrain SPI-busboard")
    (date "2026-07-16")
    (rev "3.1")
    (company "MusicBrain project")
    (comment 1 "v3 (gen 2): slots 2x12 + audio, J24-audiohub, MIDI 2x2, USB-host, 1A-regelaar")
    (comment 2 "Leidend: doc/spi-bus-spec.md v2.0 + doc/busboard-v3-plan.md")
    (comment 3 "Architectuur v2 (74HC154 + 74HC165 + J21) ongewijzigd; hub-pinout = v1")
  )
  (lib_symbols
{libs}
  )
{chr(10).join(items)}
  (sheet_instances (path "/" (page "1")))
)
'''
os.makedirs(OUT_DIR, exist_ok=True)
open(OUT, "w", encoding="utf-8", newline="\n").write(doc)
# power-klasse 0,35: v2-les - 0,5 past niet tussen de slotpads, 0,35 wel;
# de DSN-export geeft de klassebreedtes aan freerouting door
open(OUT_DIR + r"\musicbrain-busboard.kicad_pro", "w", encoding="utf-8", newline="\n").write(
    '{\n  "meta": {"filename": "musicbrain-busboard.kicad_pro", "version": 3},\n'
    '  "general": {"project_name": "MusicBrain busboard"},\n'
    '  "net_settings": {\n'
    '    "classes": [\n'
    '      {"name": "Default", "clearance": 0.2, "track_width": 0.25,\n'
    '       "via_diameter": 0.6, "via_drill": 0.3},\n'
    '      {"name": "power", "clearance": 0.2, "track_width": 0.35,\n'
    '       "via_diameter": 0.6, "via_drill": 0.3}\n'
    '    ],\n'
    '    "netclass_patterns": [\n'
    '      {"netclass": "power", "pattern": "+12V"},\n'
    '      {"netclass": "power", "pattern": "-12V"},\n'
    '      {"netclass": "power", "pattern": "+5V"},\n'
    '      {"netclass": "power", "pattern": "+3V3"}\n'
    '    ]\n'
    '  },\n'
    '  "schematic": {"file": "musicbrain-busboard.kicad_sch"},\n'
    '  "pcb": {"file": "musicbrain-busboard.kicad_pcb"}\n}\n')
print("written", OUT, f"({len(doc.splitlines())} lines, {_pwr[0]} power syms, {_flg[0]} flags)")
