"""Generate musicbrain-adc8.kicad_sch — 8x CV-in slot card (AD7606, serial mode)."""
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-adc8"
OUT = OUT_DIR + r"\musicbrain-adc8.kicad_sch"
ROOT = "f0000000-0000-4000-8000-000000000000"
PROJ = "musicbrain-adc8"

_uid = [0]
def uid():
    _uid[0] += 1
    return f"f0000001-0000-4000-8000-{_uid[0]:012d}"

items = []

def g(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"

def wire(x1, y1, x2, y2):
    items.append(f'  (wire (pts (xy {g(x1)} {g(y1)}) (xy {g(x2)} {g(y2)})) '
                 f'(stroke (width 0) (type default)) (uuid "{uid()}"))')

def label(name, x, y):
    items.append(f'  (label "{name}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) '
                 f'(justify left bottom)) (uuid "{uid()}"))')

def nc(x, y):
    items.append(f'  (no_connect (at {g(x)} {g(y)}) (uuid "{uid()}"))')

def junction(x, y):
    items.append(f'  (junction (at {g(x)} {g(y)}) (diameter 0) (color 0 0 0 0) (uuid "{uid()}"))')

_pwr = [0]
def power(sym, x, y, rot=0):
    _pwr[0] += 1
    ref = f"#PWR{_pwr[0]:03d}"
    val = sym.split(":")[1]
    vy = y - 3.302 if val in ("+12V", "+5V", "+3V3") and rot == 0 else y + 3.81
    items.append(f'''  (symbol (lib_id "{sym}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "{val}" (at {g(x)} {g(vy)} 0) (effects (font (size 1.016 1.016))))
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

def component(lib_id, ref, value, x, y, rot, footprint, rx, ry, vx, vy, fs=1.27):
    items.append(f'''  (symbol (lib_id "{lib_id}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "{ref}" (at {g(rx)} {g(ry)} 0) (effects (font (size {fs} {fs}))))
    (property "Value" "{value}" (at {g(vx)} {g(vy)} 0) (effects (font (size {fs} {fs}))))
    (property "Footprint" "{footprint}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{PROJ}" (path "/{ROOT}" (reference "{ref}") (unit 1))))
  )''')

# ================= AD7606 pin tables =================
# (name, number, type); left column top->bottom, right column top->bottom
LEFT = [
    ("VDRIVE", "23", "power_in"), ("~{PAR}/SER", "6", "input"),
    ("~{STBY}", "7", "input"), ("REF_SELECT", "34", "input"),
    ("RANGE", "8", "input"),
    ("OS0", "3", "input"), ("OS1", "4", "input"), ("OS2", "5", "input"),
    ("CONVST_A", "9", "input"), ("CONVST_B", "10", "input"),
    ("RESET", "11", "input"),
    ("~{RD}/SCLK", "12", "input"), ("~{CS}", "13", "input"),
    ("DOUTA", "24", "output"), ("DOUTB", "25", "output"),
    ("BUSY", "14", "output"), ("FRSTDATA", "15", "output"),
    ("DB0", "16", "input"), ("DB1", "17", "input"), ("DB2", "18", "input"),
    ("DB3", "19", "input"), ("DB4", "20", "input"), ("DB5", "21", "input"),
    ("DB6", "22", "input"), ("DB9", "27", "input"), ("DB10", "28", "input"),
    ("DB11", "29", "input"), ("DB12", "30", "input"), ("DB13", "31", "input"),
    ("DB14/HBEN", "32", "input"), ("DB15/BYTE_SEL", "33", "input"),
]
RIGHT = [
    ("AVCC", "1", "power_in"), ("AVCC", "37", "power_in"),
    ("AVCC", "38", "power_in"), ("AVCC", "48", "power_in"),
    ("REGCAP1", "36", "passive"), ("REGCAP2", "39", "passive"),
    ("REFIN/REFOUT", "42", "passive"),
    ("REFCAPA", "44", "passive"), ("REFCAPB", "45", "passive"),
    ("REFGND", "43", "power_in"), ("REFGND", "46", "power_in"),
    ("AGND", "2", "power_in"), ("AGND", "26", "power_in"),
    ("AGND", "35", "power_in"), ("AGND", "40", "power_in"),
    ("AGND", "41", "power_in"), ("AGND", "47", "power_in"),
]
for ch in range(1, 9):
    RIGHT.append((f"V{ch}", str(48 + 2 * ch - 1), "input"))
    RIGHT.append((f"V{ch}GND", str(48 + 2 * ch), "passive"))

# ================= U1 placement & wiring =================
UX, UY = 140, 120
component("Custom:AD7606BSTZ", "U1", "AD7606BSTZ", UX, UY, 0,
          "Package_QFP:LQFP-64_10x10mm_P0.5mm", UX, UY - 46.99, UX, UY + 46.99)

XL = UX - 17.78
for k, (name, num, typ) in enumerate(LEFT):
    y = UY - 38.1 + 2.54 * k
    if name in ("DOUTB", "FRSTDATA"):
        nc(XL, y)
        continue
    wire(XL, y, XL - 5.08, y)
    xe = XL - 5.08
    if name in ("VDRIVE", "~{PAR}/SER", "~{STBY}", "REF_SELECT"):
        power("power:+3V3", xe, y)
    elif name.startswith("OS") or name.startswith("DB"):
        power("power:GND", xe, y)
    elif name.startswith("CONVST"):
        label("CONVST", xe, y)
    elif name == "RESET":
        label("RESET", xe, y)
    elif name == "RANGE":
        label("RANGE", xe, y)
    elif name == "~{RD}/SCLK":
        label("SCLK", xe, y)
    elif name == "~{CS}":
        label("CS", xe, y)
    elif name == "DOUTA":
        label("MISO", xe, y)
    elif name == "BUSY":
        label("IRQ", xe, y)

XR = UX + 17.78
ry = {}
for k, (name, num, typ) in enumerate(RIGHT):
    y = UY - 40.64 + 2.54 * k
    ry[num] = y
    if name == "AVCC":
        wire(XR, y, XR + 5.08, y)
        power("power:+5V", XR + 5.08, y)
    elif name in ("REFGND", "AGND") or name.endswith("GND"):
        wire(XR, y, XR + 5.08, y)
        power("power:GND", XR + 5.08, y)
    elif name in ("REGCAP1", "REGCAP2", "REFIN/REFOUT"):
        val = "1u" if name.startswith("REGCAP") else "10u"
        ref = {"REGCAP1": "C6", "REGCAP2": "C7", "REFIN/REFOUT": "C8"}[name]
        wire(XR, y, XR + 5.08, y)
        component("Device:C", ref, val, XR + 8.89, y, 90,
                  "Capacitor_SMD:C_0805_2012Metric",
                  XR + 8.89, y - 1.45, XR + 15.5, y - 1.45, fs=1.0)
        wire(XR + 12.7, y, XR + 15.24, y)
        power("power:GND", XR + 15.24, y)
    elif name == "REFCAPA":
        wire(XR, y, XR + 2.54, y)          # join to REFCAPB below
    elif name == "REFCAPB":
        wire(XR, y, XR + 2.54, y)
        wire(XR + 2.54, y - 2.54, XR + 2.54, y)   # vertical tie A-B
        junction(XR + 2.54, y)
        component("Device:C", "C9", "10u", XR + 6.35, y, 90,
                  "Capacitor_SMD:C_0805_2012Metric",
                  XR + 6.35, y - 1.45, XR + 13, y - 1.45, fs=1.0)
        wire(XR + 10.16, y, XR + 12.7, y)
        power("power:GND", XR + 12.7, y)
    elif name.startswith("V") and not name.endswith("GND"):
        ch = int(name[1:])
        wire(XR, y, XR + 2.54, y)
        component("Device:R", f"R{ch}", "1k", XR + 6.35, y, 90,
                  "Resistor_SMD:R_0805_2012Metric",
                  XR + 6.35, y - 1.45, XR + 13, y - 1.45, fs=1.0)
        wire(XR + 10.16, y, XR + 15.24, y)
        # v1.2: recht-toe-bedrading - paneeljack j = V(9-j); remap in MbAdc8
        label(f"IN{9-ch}", XR + 15.24, y)

# ================= J1: bus connector =================
BX, BY = 60, 110
component("Custom:Conn_02x10", "J1", "BUS", BX, BY, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Vertical",
          BX, BY - 16.51, BX, BY + 16.51)
ROWS = [("GND", "+12V"), ("GND", None), ("GND", "+3V3"),
        ("SCLK", "GND"), (None, "GND"), ("MISO", "GND"), ("CS", "GND"),
        (None, "IRQ"), (None, None), ("CONVST", "RESET")]
L_STUB = [12.7, 17.78, 17.78, 12.7, 0, 12.7, 12.7, 0, 0, 12.7]
R_STUB = [12.7, 0, 12.7, 17.78, 12.7, 17.78, 12.7, 12.7, 0, 12.7]
for k, (lf, rf) in enumerate(ROWS):
    y = BY - 11.43 + 2.54 * k
    if lf is None:
        nc(BX - 7.62, y)
    else:
        xe = BX - L_STUB[k]
        wire(BX - 7.62, y, xe, y)
        if lf == "GND":
            power("power:GND", xe, y)
        else:
            label(lf, xe, y)
    if rf is None:
        nc(BX + 7.62, y)
    else:
        xe = BX + R_STUB[k]
        wire(BX + 7.62, y, xe, y)
        if rf in ("GND", "+12V", "+3V3"):
            power(f"power:{rf}", xe, y)
        else:
            label(rf, xe, y)

# ================= J2: input header =================
JX, JY = 215, 120
component("Custom:Conn_01x10", "J2", "CV IN", JX, JY, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical",
          JX, JY - 13.97, JX, JY + 16.51)
for k in range(10):
    y = JY - 11.43 + 2.54 * k
    x = JX - 2.54
    wire(x, y, x - 5.08, y)
    if k in (0, 9):
        power("power:GND", x - 5.08, y)
    else:
        label(f"IN{k}", x - 5.08, y)

# ================= RANGE jumper JP1 =================
component("Custom:Conn_01x03", "JP1", "RANGE", 100, 60, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
          100, 53.34, 100, 66.04)
# pins at (97.46, 57.46/60/62.54)
wire(97.46, 57.46, 92.38, 57.46); power("power:+3V3", 92.38, 57.46)
wire(97.46, 60, 92.38, 60); label("RANGE", 92.38, 60)
wire(97.46, 62.54, 92.38, 62.54); power("power:GND", 92.38, 62.54)

# ================= RESET pull-down =================
component("Device:R", "R9", "100k", 123.81, 60, 90,
          "Resistor_SMD:R_0805_2012Metric", 123.81, 57.5, 123.81, 62.5, fs=1.0)
wire(117.46, 60, 120, 60)
label("RESET", 117.46, 60)
wire(127.62, 60, 130.16, 60)
power("power:GND", 130.16, 60)

# ================= regulator +12V -> +5V =================
component("Custom:AMS1117-5.0", "U2", "AMS1117-5.0", 70, 50, 0,
          "Package_TO_SOT_SMD:SOT-223-3_TabPin2", 70, 41.5, 70, 44)
wire(57.3, 50, 52.22, 50); power("power:+12V", 52.22, 50)
wire(82.7, 50, 87.78, 50); power("power:+5V", 87.78, 50)
power("power:GND", 70, 60.16)
CAPS = [("C1", "100n", False, "+12V", 41.12), ("C2", "10u", True, "+5V", 141),
        ("C3", "100n", False, "+5V", 149.89), ("C4", "100n", False, "+5V", 158.78),
        ("C5", "100n", False, "+3V3", 167.67)]
for ref, val, pol, rail, cx in CAPS:
    lib = "Device:C_Polarized" if pol else "Device:C"
    fp = "Capacitor_SMD:CP_Elec_4x5.3" if pol else "Capacitor_SMD:C_0805_2012Metric"
    component(lib, ref, val, cx, 55.88, 0, fp, cx + 2.29, 54.61, cx + 2.29, 57.15, fs=1.0)
    power(f"power:{rail}", cx, 52.07)
    power("power:GND", cx, 59.69)
# PWR flags: +12V, GND, +3V3
for k, rail in enumerate(("+12V", "GND", "+3V3")):
    x1 = 41.12 + 12.7 * k
    wire(x1, 70, x1 + 5.08, 70)
    power(f"power:{rail}", x1, 70)
    flag(x1 + 5.08, 70)

# ================= texts =================
items.append('''  (text "MusicBrain ADC8 - 8x CV in (slot card, AD7606 serial mode)" (exclude_from_sim no) (at 20.32 20.32 0)
    (effects (font (size 2.54 2.54) bold) (justify left)))''')
items.append('''  (text "AD7606: 16-bit, 8-ch simultaneous, +/-10V or +/-5V direct in (1 Mohm, clamps)\\nSerial mode: PAR/SER=high, DB0-6/DB9-15=GND, DOUTA=MISO, DOUTB=nc\\nInternal 2.5V ref (REF_SELECT=high); REGCAP 2x1u, REFCAP 10u, REFIN 10u\\nCONVST=SPARE1 (bus-wide sample strobe), RESET=SPARE2 (+100k pulldown)\\nBUSY -> IRQ (falling edge = data ready); RANGE via JP1: +3V3=+/-10V, GND=+/-5V\\nAVCC=5V local (AMS1117-5.0), VDRIVE=+3V3 bus\\nSpec: doc/spi-bus-spec.md" (exclude_from_sim no) (at 20.32 180 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "J2: 1=GND, 2-9=IN1..8, 10=GND (zelfde contract als GATE8 J2)\\nfirmware: CONVST-puls -> wacht IRQ (BUSY laag) -> 8x16 bit via MISO" (exclude_from_sim no) (at 150 180 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')

# ================= lib symbols =================
def ad7606_symbol():
    pins = []
    for k, (name, num, typ) in enumerate(LEFT):
        yy = 38.1 - 2.54 * k
        pins.append(f'''        (pin {typ} line (at -17.78 {g(yy)} 0) (length 2.54)
          (name "{name}" (effects (font (size 1.27 1.27))))
          (number "{num}" (effects (font (size 1.0 1.0)))))''')
    for k, (name, num, typ) in enumerate(RIGHT):
        yy = 40.64 - 2.54 * k
        pins.append(f'''        (pin {typ} line (at 17.78 {g(yy)} 180) (length 2.54)
          (name "{name}" (effects (font (size 1.27 1.27))))
          (number "{num}" (effects (font (size 1.0 1.0)))))''')
    return f'''    (symbol "Custom:AD7606BSTZ"
      (pin_names (offset 1.016))
      (property "Reference" "U" (at -15.24 44.45 0) (effects (font (size 1.27 1.27)) (justify left)))
      (property "Value" "AD7606BSTZ" (at 0 -44.45 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "Package_QFP:LQFP-64_10x10mm_P0.5mm" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "https://www.analog.com/media/en/technical-documentation/data-sheets/AD7606_7606-6_7606-4.pdf" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "AD7606BSTZ_0_1"
        (rectangle (start -15.24 43.18) (end 15.24 -43.18)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "AD7606BSTZ_1_1"
{chr(10).join(pins)}
      )
    )'''

def conn_symbol_2xN(name, rows):
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

def conn_symbol_1xN(name, rows):
    top = rows * 1.27 + 1.27
    pins = []
    for k in range(rows):
        yy = (rows - 1) * 1.27 - 2.54 * k
        pins.append(f'''        (pin passive line (at -2.54 {g(yy)} 0) (length 1.27)
          (name "Pin_{k+1}" (effects (font (size 1.27 1.27))))
          (number "{k+1}" (effects (font (size 1.0 1.0)))))''')
    return f'''    (symbol "Custom:{name}"
      (pin_names (offset 1.016) (hide yes))
      (pin_numbers (hide yes))
      (property "Reference" "J" (at 0 {g(top + 1.27)} 0) (effects (font (size 1.27 1.27))))
      (property "Value" "{name}" (at 0 -{g(top + 1.27)} 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "{name}_0_1"
        (rectangle (start -1.27 {g(top)}) (end 0 -{g(top)})
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "{name}_1_1"
{chr(10).join(pins)}
      )
    )'''

REG = '''    (symbol "Custom:AMS1117-5.0"
      (pin_names (offset 1.016))
      (property "Reference" "U" (at 0 7.62 0) (effects (font (size 1.27 1.27))))
      (property "Value" "AMS1117-5.0" (at 0 -10.16 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "AMS1117-5.0_0_1"
        (rectangle (start -10.16 5.08) (end 10.16 -7.62)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "AMS1117-5.0_1_1"
        (pin power_in line (at -12.7 0 0) (length 2.54)
          (name "VI" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.0 1.0)))))
        (pin power_in line (at 0 -10.16 90) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin power_out line (at 12.7 0 180) (length 2.54)
          (name "VO" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
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
      (property "Value" "{name}" (at 0 {d}3.302 0) (effects (font (size 1.27 1.27))))
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
    R_SYM, C_SYM, CP_SYM, ad7606_symbol(), REG,
    conn_symbol_2xN("Conn_02x10", 10),
    conn_symbol_1xN("Conn_01x10", 10),
    conn_symbol_1xN("Conn_01x03", 3),
    power_symbol("GND", False),
    power_symbol("+12V", True),
    power_symbol("+5V", True),
    power_symbol("+3V3", True),
    FLAG_SYM,
])

doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{ROOT}")
  (paper "A3")
  (title_block
    (title "MusicBrain ADC8 - 8x CV input slot card")
    (date "2026-07-07")
    (rev "1.2")
    (company "MusicBrain project")
    (comment 1 "AD7606 16-bit 8-ch simultaneous SAR, +/-10V direct, serial mode")
    (comment 2 "Bus slot card per doc/spi-bus-spec.md; CONVST=SPARE1, RESET=SPARE2")
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
print("written", OUT, f"({len(doc.splitlines())} lines)")
