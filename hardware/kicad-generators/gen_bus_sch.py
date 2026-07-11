"""Generate musicbrain-busboard.kicad_sch — Teensy 4.1 backplane per doc/spi-bus-spec.md."""
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-busboard"
OUT = OUT_DIR + r"\musicbrain-busboard.kicad_sch"
ROOT = "c0000000-0000-4000-8000-000000000000"
PROJ = "musicbrain-busboard"

_uid = [0]
def uid():
    _uid[0] += 1
    return f"c0000001-0000-4000-8000-{_uid[0]:012d}"

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

# ============ Teensy 4.1 ============
TX, TY = 80, 110
TEENSY_PINS = {}  # n -> (abs_x, abs_y, side)
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
# signals
tpin_label(4, "LDAC")
for i, n in enumerate((12, 11, 10, 9, 8, 7, 6, 5)):   # CS1..CS8
    tpin_label(n, f"CS{i+1}")
for i, n in enumerate((20, 21, 22, 23, 24)):           # IRQ1..5 left
    tpin_label(n, f"IRQ{i+1}")
tpin_label(25, "IRQ6")
tpin_label(14, "MISO")
tpin_label(40, "SDA")
tpin_label(41, "SCL")
tpin_label(32, "SPARE1")
tpin_label(33, "SPARE2")
# series R: MOSI (pin13, left) and SCLK (pin35, right)
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
# v1.1: display (SPI1) + EXP-header in gebruik; alleen pins 1 en 34-39 blijven vrij
tpin_label(2, "DISP_CS")     # Teensy pin 0
tpin_label(16, "DISP_DC")    # pin 24
tpin_label(17, "DISP_RST")   # pin 25
tpin_label(18, "MOSI1")      # pin 26
tpin_label(19, "SCK1")       # pin 27
for pad, nm in ((36, "D14"), (37, "D15"), (38, "D16"), (39, "D17"),
                (42, "D20"), (43, "D21"), (44, "D22"), (45, "D23")):
    tpin_label(pad, nm)
# vrij gebleven: pin 1 (MISO1) en pins 34-39
for n in (3, 26, 27, 28, 29, 30, 31):
    nc(*TEENSY_PINS[n][:2])

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
J9_RAILS_L = ["-12V", "GND", "GND", "GND", "+12V"]   # pins 1,3,5,7,9
J9_RAILS_R = ["-12V", "GND", "GND", "GND", "+12V"]   # pins 2,4,6,8,10
for k in range(5):
    y = J9Y - 5.08 + 2.54 * k
    stub = 17.78 if k % 2 == 0 else 12.7
    xl = J9X - 7.62
    wire(xl, y, J9X - stub, y)
    rail = J9_RAILS_L[k]
    power(f"power:{rail}", J9X - stub, y, 0 if rail != "GND" else 0)
    xr = J9X + 7.62
    wire(xr, y, J9X + stub, y)
    power(f"power:{J9_RAILS_R[k]}", J9X + stub, y)

# ============ regulators ============
component("Custom:R-78E5.0-0.5", "U2", "R-78E5.0-0.5", 300, 50.8, 0,
          "Converter_DCDC:Converter_DCDC_RECOM_R-78E-0.5_THT",
          extra_props=rprop("U2", "R-78E5.0-0.5", 300, 50.8, 300, 42.5, 300, 45.0))
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
CAPS = [  # (ref, value, polarized, top_rail, top_rot, bottom_rail)
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

# ============ slots J1..J6 ============
SLOT_L = ["GND", "GND", "GND", "SCLK", "MOSI", "MISO", "CS{i}", "LDAC", "SDA", "SPARE1"]
SLOT_R = ["+12V", "-12V", "+3V3", "GND", "GND", "GND", "GND", "IRQ{i}", "SCL", "SPARE2"]
RAILS = {"GND", "+12V", "-12V", "+3V3", "+5V"}
L_STUB = [12.7, 17.78, 17.78] + [12.7] * 7
R_STUB = [12.7, 17.78, 12.7, 17.78, 12.7, 17.78, 17.78, 12.7, 12.7, 12.7]
SLOT_POS = [(170, 185.42), (225, 185.42), (280, 185.42),
            (170, 241.3), (225, 241.3), (280, 241.3)]
for i, (sx, sy) in enumerate(SLOT_POS, start=1):
    component("Custom:Conn_02x10", f"J{i}", f"SLOT {i}", sx, sy, 0,
              "Connector_PinSocket_2.54mm:PinSocket_2x10_P2.54mm_Vertical",
              extra_props=rprop(f"J{i}", f"SLOT {i}", sx, sy, sx, sy - 16.51, sx, sy + 16.51))
    for k in range(10):
        y = sy - 11.43 + 2.54 * k
        # left (odd pins)
        name = SLOT_L[k].format(i=i)
        xe = sx - L_STUB[k]
        wire(sx - 7.62, y, xe, y)
        if name in RAILS:
            power(f"power:{name}", xe, y)
        else:
            label(name, xe, y)
        # right (even pins)
        name = SLOT_R[k].format(i=i)
        xe = sx + R_STUB[k]
        wire(sx + 7.62, y, xe, y)
        if name in RAILS:
            rot = 0
            vy = y - 3.302 if name in ("+12V", "+3V3") else y + 3.81
            power(f"power:{name}", xe, y, rot, vx=xe, vy=vy)
        else:
            label(name, xe, y)

# ============ hubs J7..J8 (2x5 IDC, breakout-compatible) ============
HUB_L = ["GND", "MISO", "SCLK", "+3V3", "-12V"]     # pins 1,3,5,7,9
HUB_R = ["CS{n}", "MOSI", "GND", "GND", "+12V"]     # pins 2,4,6,8,10
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
            rot = 0
            vy = y - 3.302 if name == "+3V3" else y + 3.81
            power(f"power:{name}", xe, y, rot, vx=xe, vy=vy)
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

# ============ v1.1: EXP / DISPLAY / QWIIC ============
# J10: EXP 2x7 - 8 vrije GPIO + voeding
J10X, J10Y = 150, 278
component("Custom:Conn_02x07", "J10", "EXP", J10X, J10Y, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x07_P2.54mm_Vertical",
          extra_props=rprop("J10", "EXP", J10X, J10Y, J10X, J10Y - 12.7, J10X, J10Y + 12.7))
J10_L = ["+3V3", "+5V", "D15", "D17", "D21", "GND", "D23"]     # pins 1,3,5,7,9,11,13
J10_R = ["GND", "GND", "D14", "D16", "D20", "D22", "GND"]      # pins 2,4,...,14
for k in range(7):
    y = J10Y - 7.62 + 2.54 * k
    nmL = J10_L[k]
    wire(J10X - 7.62, y, J10X - 12.7, y)
    if nmL in RAILS:
        power(f"power:{nmL}", J10X - 12.7, y, 0,
              vx=J10X - 12.7, vy=(y - 3.302 if nmL != "GND" else y + 3.81))
    else:
        label(nmL, J10X - 12.7, y)
    nmR = J10_R[k]
    wire(J10X + 7.62, y, J10X + 12.7, y)
    if nmR in RAILS:
        power(f"power:{nmR}", J10X + 12.7, y)
    else:
        label(nmR, J10X + 12.7, y)

# J11: display-header 1x9 in ILI9341-modulevolgorde (SDO = nc)
J11X, J11Y = 225, 278
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

# J12: Qwiic/I2C 1x4 (GND, 3V3, SDA, SCL)
J12X, J12Y = 280, 275.5
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

# ============ texts ============
items.append('''  (text "MusicBrain SPI-busboard - Teensy 4.1 backplane" (exclude_from_sim no) (at 20.32 25.4 0)
    (effects (font (size 2.54 2.54) bold) (justify left)))''')
items.append('''  (text "Spec: doc/spi-bus-spec.md (leading document)\\n\\nSlot pinout (2x10):\\n  1 GND      2 +12V\\n  3 GND      4 -12V\\n  5 GND      6 +3V3\\n  7 SCLK     8 GND\\n  9 MOSI    10 GND\\n 11 MISO    12 GND\\n 13 CS*     14 GND\\n 15 LDAC    16 IRQ*\\n 17 SDA     18 SCL\\n 19 SPARE1  20 SPARE2\\n  (* = geographic per slot)" (exclude_from_sim no) (at 20.32 200.66 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "Rules:\\n - 33R series in SCLK/MOSI at Teensy (R1/R2)\\n - I2C pull-ups 2k2 (R3/R4)\\n - +3V3 bus from AMS1117, NOT from Teensy\\n - Teensy VIN = +5V rail; cut VUSB bridge when\\n   USB and bus power are used simultaneously\\n - backplane <= 20 cm, GND plane under bus" (exclude_from_sim no) (at 20.32 160.02 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "Hub headers = same pinout as AD5754 breakout J1\\n(2x5 IDC ribbon): CS7 -> HUB1, CS8 -> HUB2" (exclude_from_sim no) (at 320.04 162.56 0)
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

def conn1_symbol(name, rows):
    top = rows * 1.27 + 1.27
    pins = []
    for k in range(rows):
        yy = (rows - 1) * 1.27 - 2.54 * k
        pins.append(f'''        (pin passive line (at -7.62 {g(yy)} 0) (length 2.54)
          (name "Pin_{k+1}" (effects (font (size 1.27 1.27))))
          (number "{k+1}" (effects (font (size 1.0 1.0)))))''')
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
    R_SYM, C_SYM, CP_SYM,
    teensy_symbol(),
    conn_symbol("Conn_02x10", 10),
    conn_symbol("Conn_02x05", 5),
    conn_symbol("Conn_02x07", 7),
    conn1_symbol("Conn_01x09", 9),
    conn1_symbol("Conn_01x04", 4),
    reg_symbol("R-78E5.0-0.5", 1, 2, 3),
    reg_symbol("AMS1117-3.3", 3, 1, 2),
    power_symbol("GND", False),
    power_symbol("+12V", True),
    power_symbol("-12V", False),
    power_symbol("+3V3", True),
    power_symbol("+5V", True),
    FLAG_SYM,
])

doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{ROOT}")
  (paper "A3")
  (title_block
    (title "MusicBrain SPI-busboard")
    (date "2026-07-08")
    (rev "1.1")
    (company "MusicBrain project")
    (comment 1 "Teensy 4.1 backplane: 6 slots (2x10) + 2 IDC hubs (2x5) + EXP/DISPLAY/QWIIC")
    (comment 2 "Leading spec: doc/spi-bus-spec.md")
    (comment 3 "Geographic CS/IRQ per slot; shared SCLK/MOSI/MISO/LDAC/I2C")
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
print("written", OUT, f"({len(doc.splitlines())} lines, {_pwr[0]} power syms, {_flg[0]} flags)")
