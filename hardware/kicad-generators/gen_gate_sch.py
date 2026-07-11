"""Generate musicbrain-gate8.kicad_sch â€” 8x gate output slot card (74HCT595)."""
import os

OUT_DIR = r"d:\Git\Muziek\MusicBrain\Images\schematics\musicbrain-gate8"
OUT = OUT_DIR + r"\musicbrain-gate8.kicad_sch"
ROOT = "d0000000-0000-4000-8000-000000000000"
PROJ = "musicbrain-gate8"

_uid = [0]
def uid():
    _uid[0] += 1
    return f"d0000001-0000-4000-8000-{_uid[0]:012d}"

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

_pwr = [0]
def power(sym, x, y, rot=0, vx=None, vy=None):
    _pwr[0] += 1
    ref = f"#PWR{_pwr[0]:03d}"
    val = sym.split(":")[1]
    if vx is None:
        vx, vy = x, (y - 3.302 if val in ("+12V", "+5V") and rot == 0 else y + 3.81)
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

# ============ J1: bus connector (2x10) ============
BX, BY = 55, 100
component("Custom:Conn_02x10", "J1", "BUS", BX, BY, 0,
          "Connector_PinHeader_2.54mm:PinHeader_2x10_P2.54mm_Vertical",
          BX, BY - 16.51, BX, BY + 16.51)
# rows: (left function, right function); None = nc
ROWS = [("GND", "+12V"), ("GND", None), ("GND", None),
        ("SCLK", "GND"), ("MOSI", "GND"), (None, "GND"), ("CS", "GND"),
        (None, None), (None, None), (None, None)]
L_STUB = [12.7, 17.78, 17.78, 12.7, 12.7, 0, 12.7, 0, 0, 0]
R_STUB = [12.7, 0, 0, 12.7, 17.78, 12.7, 17.78, 0, 0, 0]
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
        if rf in ("GND", "+12V"):
            power(f"power:{rf}", xe, y)
        else:
            label(rf, xe, y)

# ============ U1: 74HCT595 ============
UX, UY = 120, 95
component("Custom:74HCT595", "U1", "74HCT595", UX, UY, 0,
          "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm",
          UX, UY - 16.51, UX, UY + 18.5)
# VCC / GND
wire(UX, UY - 15.24, UX, UY - 17.78); power("power:+5V", UX, UY - 17.78)
wire(UX, UY + 15.24, UX, UY + 17.78); power("power:GND", UX, UY + 17.78)
# left inputs: SER(14) +7.62, SRCLK(11) +5.08, RCLK(12) +2.54, ~OE(13) 0, ~SRCLR(10) -2.54
xl = UX - 12.7
for dy, name in ((7.62, "MOSI"), (5.08, "SCLK"), (2.54, "CS")):
    wire(xl, UY - dy, xl - 5.08, UY - dy)
    label(name, xl - 5.08, UY - dy)
wire(xl, UY, xl - 5.08, UY); power("power:GND", xl - 5.08, UY)          # ~OE
wire(xl, UY + 2.54, xl - 7.62, UY + 2.54); power("power:+5V", xl - 7.62, UY + 2.54)  # ~SRCLR
# right outputs QA..QH at +8.89 .. -8.89 -> R -> GATEn
xr = UX + 12.7
for k in range(8):
    y = UY - 8.89 + 2.54 * k
    wire(xr, y, xr + 1.92, y)
    component("Device:R", f"R{k+1}", "1k", xr + 5.73, y, 90,
              "Resistor_SMD:R_0805_2012Metric",
              xr + 5.73, y - 1.45, xr + 12.5, y - 1.45, fs=1.0)
    wire(xr + 9.54, y, xr + 14.62, y)
    label(f"GATE{k+1}", xr + 14.62, y)
nc(xr, UY + 11.43)  # QH' (pin 9)

# ============ J2: output header (1x10) ============
JX, JY = 165, 95
component("Custom:Conn_01x10", "J2", "GATES OUT", JX, JY, 0,
          "Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical",
          JX, JY - 13.97, JX, JY + 16.51)
for k in range(10):
    y = JY - 11.43 + 2.54 * k
    x = JX - 2.54
    wire(x, y, x - 5.08, y)
    if k in (0, 9):
        power("power:GND", x - 5.08, y)
    else:
        label(f"GATE{k}", x - 5.08, y)

# ============ regulator +12V -> +5V ============
component("Custom:AMS1117-5.0", "U2", "AMS1117-5.0", 100, 50, 0,
          "Package_TO_SOT_SMD:SOT-223-3_TabPin2", 100, 41.5, 100, 44)
wire(87.3, 50, 82.22, 50); power("power:+12V", 82.22, 50)
wire(112.7, 50, 117.78, 50); power("power:+5V", 117.78, 50)
power("power:GND", 100, 60.16)
CAPS = [("C1", "100n", False, "+12V", 71.12), ("C2", "10u", True, "+5V", 127),
        ("C3", "100n", False, "+5V", 135.89)]
for ref, val, pol, rail, cx in CAPS:
    lib = "Device:C_Polarized" if pol else "Device:C"
    fp = "Capacitor_SMD:CP_Elec_4x5.3" if pol else "Capacitor_SMD:C_0805_2012Metric"
    component(lib, ref, val, cx, 55.88, 0, fp, cx + 2.29, 54.61, cx + 2.29, 57.15, fs=1.0)
    power(f"power:{rail}", cx, 52.07)
    power("power:GND", cx, 59.69)
# PWR flags
for k, rail in enumerate(("+12V", "GND")):
    x1 = 71.12 + 12.7 * k
    wire(x1, 70, x1 + 5.08, 70)
    power(f"power:{rail}", x1, 70, vx=x1, vy=70 - 3.302 if rail == "+12V" else 73.81)
    flag(x1 + 5.08, 70)

# ============ texts ============
items.append('''  (text "MusicBrain GATE8 - 8x gate out (slot card)" (exclude_from_sim no) (at 20.32 20.32 0)
    (effects (font (size 2.54 2.54) bold) (justify left)))''')
items.append('''  (text "74HCT595 @ +5V = SPI slave, no MCU:\\n  SER=MOSI, SRCLK=SCLK, RCLK=CS\\n  latch on CS rising edge (end of transfer)\\n  SPI mode 0; gates 0-5V via 1k series\\nBus pins used: GND, +12V, SCLK, MOSI, CS\\nMISO/LDAC/I2C/IRQ/SPARE: not connected\\nSpec: doc/spi-bus-spec.md" (exclude_from_sim no) (at 20.32 130 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')
items.append('''  (text "J2: 1=GND, 2-9=GATE1..8, 10=GND\\nfirmware: SPI.transfer(bits) in CS window\\nbit7=QH=GATE8 ... bit0=QA=GATE1" (exclude_from_sim no) (at 150 130 0)
    (effects (font (size 1.27 1.27)) (justify left)))''')

# ============ lib symbols ============
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

HCT595 = '''    (symbol "Custom:74HCT595"
      (pin_names (offset 1.016))
      (property "Reference" "U" (at -10.16 13.97 0) (effects (font (size 1.27 1.27)) (justify left)))
      (property "Value" "74HCT595" (at 0 -16.51 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "74HCT595_0_1"
        (rectangle (start -10.16 12.7) (end 10.16 -12.7)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "74HCT595_1_1"
        (pin input line (at -12.7 7.62 0) (length 2.54)
          (name "SER" (effects (font (size 1.27 1.27))))
          (number "14" (effects (font (size 1.0 1.0)))))
        (pin input line (at -12.7 5.08 0) (length 2.54)
          (name "SRCLK" (effects (font (size 1.27 1.27))))
          (number "11" (effects (font (size 1.0 1.0)))))
        (pin input line (at -12.7 2.54 0) (length 2.54)
          (name "RCLK" (effects (font (size 1.27 1.27))))
          (number "12" (effects (font (size 1.0 1.0)))))
        (pin input line (at -12.7 0 0) (length 2.54)
          (name "~{OE}" (effects (font (size 1.27 1.27))))
          (number "13" (effects (font (size 1.0 1.0)))))
        (pin input line (at -12.7 -2.54 0) (length 2.54)
          (name "~{SRCLR}" (effects (font (size 1.27 1.27))))
          (number "10" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 8.89 180) (length 2.54)
          (name "QA" (effects (font (size 1.27 1.27))))
          (number "15" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 6.35 180) (length 2.54)
          (name "QB" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 3.81 180) (length 2.54)
          (name "QC" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 1.27 180) (length 2.54)
          (name "QD" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 -1.27 180) (length 2.54)
          (name "QE" (effects (font (size 1.27 1.27))))
          (number "4" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 -3.81 180) (length 2.54)
          (name "QF" (effects (font (size 1.27 1.27))))
          (number "5" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 -6.35 180) (length 2.54)
          (name "QG" (effects (font (size 1.27 1.27))))
          (number "6" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 -8.89 180) (length 2.54)
          (name "QH" (effects (font (size 1.27 1.27))))
          (number "7" (effects (font (size 1.0 1.0)))))
        (pin output line (at 12.7 -11.43 180) (length 2.54)
          (name "QH'" (effects (font (size 1.27 1.27))))
          (number "9" (effects (font (size 1.0 1.0)))))
        (pin power_in line (at 0 15.24 270) (length 2.54)
          (name "VCC" (effects (font (size 1.27 1.27))))
          (number "16" (effects (font (size 1.0 1.0)))))
        (pin power_in line (at 0 -15.24 90) (length 2.54)
          (name "GND" (effects (font (size 1.27 1.27))))
          (number "8" (effects (font (size 1.0 1.0)))))
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
    R_SYM, C_SYM, CP_SYM, HCT595, REG,
    conn_symbol_2xN("Conn_02x10", 10),
    conn_symbol_1xN("Conn_01x10", 10),
    power_symbol("GND", False),
    power_symbol("+12V", True),
    power_symbol("+5V", True),
    FLAG_SYM,
])

doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{ROOT}")
  (paper "A4")
  (title_block
    (title "MusicBrain GATE8 - 8x gate output slot card")
    (date "2026-07-07")
    (rev "1.0")
    (company "MusicBrain project")
    (comment 1 "74HCT595 @ 5V; SPI mode 0; latch on CS rising edge")
    (comment 2 "Bus slot card per doc/spi-bus-spec.md")
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

