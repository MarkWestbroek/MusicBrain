"""Gedeelde schema-generator voor MusicBrain-slotkaarten (v8 sexpr)."""

def g(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"

class Sch:
    def __init__(self, root_uuid, proj, title, rev, date, comments=()):
        self.ROOT, self.PROJ = root_uuid, proj
        self.title, self.rev, self.date = title, rev, date
        self.comments = comments
        self.items, self.libs = [], []
        self._uid = 0
        self._pwr = 0
        self._flg = 0

    def uid(self):
        self._uid += 1
        return f"{self.ROOT[:8]}-0001-4000-8000-{self._uid:012d}"

    def wire(self, x1, y1, x2, y2):
        self.items.append(f'  (wire (pts (xy {g(x1)} {g(y1)}) (xy {g(x2)} {g(y2)})) '
                          f'(stroke (width 0) (type default)) (uuid "{self.uid()}"))')

    def label(self, name, x, y):
        self.items.append(f'  (label "{name}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) '
                          f'(justify left bottom)) (uuid "{self.uid()}"))')

    def nc(self, x, y):
        self.items.append(f'  (no_connect (at {g(x)} {g(y)}) (uuid "{self.uid()}"))')

    def text(self, s, x, y, size=1.27):
        self.items.append(f'''  (text "{s}" (exclude_from_sim no) (at {g(x)} {g(y)} 0)
    (effects (font (size {size} {size})) (justify left)))''')

    def power(self, sym, x, y, rot=0, vx=None, vy=None):
        self._pwr += 1
        ref = f"#PWR{self._pwr:03d}"
        val = sym.split(":")[1]
        if vx is None:
            vx, vy = x, (y - 3.302 if val.startswith("+") and rot == 0 else y + 3.81)
        self.items.append(f'''  (symbol (lib_id "{sym}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{self.uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "{val}" (at {g(vx)} {g(vy)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{self.PROJ}" (path "/{self.ROOT}" (reference "{ref}") (unit 1))))
  )''')

    def flag(self, x, y):
        self._flg += 1
        ref = f"#FLG{self._flg:02d}"
        self.items.append(f'''  (symbol (lib_id "power:PWR_FLAG") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{self.uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "PWR_FLAG" (at {g(x)} {g(y-4.5)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{self.PROJ}" (path "/{self.ROOT}" (reference "{ref}") (unit 1))))
  )''')

    def component(self, lib_id, ref, value, x, y, rot, footprint):
        self.items.append(f'''  (symbol (lib_id "{lib_id}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{self.uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y - 3)} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "{value}" (at {g(x)} {g(y + 3)} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "{footprint}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{self.PROJ}" (path "/{self.ROOT}" (reference "{ref}") (unit 1))))
  )''')

    def write(self, out):
        libs = "\n".join(self.libs)
        cmts = "\n".join(f'    (comment {i+1} "{c}")' for i, c in enumerate(self.comments))
        doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{self.ROOT}")
  (paper "A3")
  (title_block
    (title "{self.title}")
    (date "{self.date}")
    (rev "{self.rev}")
    (company "MusicBrain project")
{cmts}
  )
  (lib_symbols
{libs}
  )
{chr(10).join(self.items)}
  (sheet_instances (path "/" (page "1")))
)
'''
        open(out, "w", encoding="utf-8", newline="\n").write(doc)
        print("written", out)


# ---------- herbruikbare symbolen ----------
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

def box_symbol(name, left, right, width=17.78):
    """left/right: lijst (pinnummer, naam, elektype). Pins op 2.54-raster."""
    rows = max(len(left), len(right))
    top = rows * 1.27 + 2.54
    hw = width / 2
    pins = []
    for k, (num, nm, et) in enumerate(left):
        yy = (rows - 1) * 1.27 - 2.54 * k
        pins.append(f'''        (pin {et} line (at -{g(hw + 2.54)} {g(yy)} 0) (length 2.54)
          (name "{nm}" (effects (font (size 1.27 1.27))))
          (number "{num}" (effects (font (size 1.0 1.0)))))''')
    for k, (num, nm, et) in enumerate(right):
        yy = (rows - 1) * 1.27 - 2.54 * k
        pins.append(f'''        (pin {et} line (at {g(hw + 2.54)} {g(yy)} 180) (length 2.54)
          (name "{nm}" (effects (font (size 1.27 1.27))))
          (number "{num}" (effects (font (size 1.0 1.0)))))''')
    return f'''    (symbol "Custom:{name}"
      (pin_names (offset 1.016))
      (property "Reference" "U" (at 0 {g(top + 1.27)} 0) (effects (font (size 1.27 1.27))))
      (property "Value" "{name}" (at 0 -{g(top + 1.27)} 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "{name}_0_1"
        (rectangle (start -{g(hw)} {g(top)}) (end {g(hw)} -{g(top)})
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "{name}_1_1"
{chr(10).join(pins)}
      )
    )'''

POT_SYM = '''    (symbol "Device:R_Potentiometer"
      (pin_names (offset 0) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "RV" (at 2.54 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "R_Potentiometer" (at -2.54 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "R_Potentiometer_0_1"
        (polyline (pts (xy -1.016 -2.54) (xy 1.016 -2.54) (xy 1.016 2.54) (xy -1.016 2.54) (xy -1.016 -2.54))
          (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 2.54 0) (xy 1.524 0)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "R_Potentiometer_1_1"
        (pin passive line (at 0 3.81 270) (length 1.27)
          (name "3" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 3.81 0 180) (length 1.27)
          (name "2" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 0 -3.81 90) (length 1.27)
          (name "1" (effects (font (size 1.27 1.27))))
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
