"""Hierarchische (multi-sheet) schema-generator voor MusicBrain-kernkaarten.

Root-sheet + sub-sheets, verbonden via GLOBALE labels (vlakke netnamen die
1-op-1 met de PCB-netten matchen). Power via power-symbolen (ook globaal).
Bedoeld voor leesbare, per-stem gepagineerde schema's met echte draadjes.

Netnaam-conventie: globale labels geven VLAKKE namen (geen sheet-prefix),
dus de PCB moet KALE netnamen gebruiken (geen '/'). Power = symboolnaam.
"""
import schlib as _sl

g = _sl.g
POWER = {'GND', '+12V', '-12V', '+3V3'}


class Doc:
    """Eén .kicad_sch-bestand (root of sub-sheet)."""

    def __init__(self, uuid, proj, title, rev, date, page, comments=(),
                 root_uuid=None, sheet_uuid=None):
        self.uuid, self.proj = uuid, proj
        self.title, self.rev, self.date, self.page = title, rev, date, page
        self.comments = comments
        self.items, self.libs = [], []
        self._u = 0
        self._pwr = 0
        if sheet_uuid:                       # sub-sheet
            self._rootpath = f"{root_uuid}/{sheet_uuid}"
            self._spath = f"/{sheet_uuid}"
        else:                                # root
            self._rootpath = uuid
            self._spath = "/"

    def uid(self):
        self._u += 1
        return f"{self.uuid[:8]}-0007-4000-8000-{self._u:012d}"

    # -- primitieven --
    def wire(self, x1, y1, x2, y2):
        self.items.append(
            f'  (wire (pts (xy {g(x1)} {g(y1)}) (xy {g(x2)} {g(y2)})) '
            f'(stroke (width 0) (type default)) (uuid "{self.uid()}"))')

    def junction(self, x, y):
        self.items.append(
            f'  (junction (at {g(x)} {g(y)}) (diameter 0) (color 0 0 0 0) '
            f'(uuid "{self.uid()}"))')

    def glabel(self, name, x, y, rot=0, shape='bidirectional'):
        self.items.append(
            f'  (global_label "{name}" (shape {shape}) (at {g(x)} {g(y)} {rot}) '
            f'(fields_autoplaced yes) (effects (font (size 1.27 1.27)) '
            f'(justify left)) (uuid "{self.uid()}"))')

    def nc(self, x, y):
        self.items.append(f'  (no_connect (at {g(x)} {g(y)}) (uuid "{self.uid()}"))')

    def text(self, s, x, y, size=1.27):
        self.items.append(
            f'  (text "{s}" (exclude_from_sim no) (at {g(x)} {g(y)} 0) '
            f'(effects (font (size {size} {size})) (justify left)))')

    def power(self, name, x, y, rot=0):
        self._pwr += 1
        ref = f"#PWR{self.page:02d}{self._pwr:04d}"   # page-uniek
        up = name.startswith('+')
        vy = y - 3.302 if (up and rot == 0) else y + 3.81
        self.items.append(f'''  (symbol (lib_id "power:{name}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{self.uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "{name}" (at {g(x)} {g(vy)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{self.proj}" (path "/{self.rootpath()}" (reference "{ref}") (unit 1))))
  )''')

    def rootpath(self):
        return self._rootpath

    def pin_term(self, x, y, net, rot=0):
        """Eindpunt: power-symbool of globaal label op net."""
        if net in POWER:
            self.power(net, x, y, rot)
        else:
            self.glabel(net, x, y, rot)

    # -- componenten --
    def comp(self, lib_id, ref, value, x, y, rot, footprint):
        self.items.append(f'''  (symbol (lib_id "{lib_id}") (at {g(x)} {g(y)} {rot})
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{self.uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(y - 3.2)} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "{value}" (at {g(x)} {g(y + 3.2)} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "{footprint}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{self.proj}" (path "/{self.rootpath()}" (reference "{ref}") (unit 1))))
  )''')

    def flag(self, x, y):
        self.items.append(f'''  (symbol (lib_id "power:PWR_FLAG") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{self.uid()}")
    (property "Reference" "#FLG{self._u:03d}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "PWR_FLAG" (at {g(x)} {g(y - 2.5)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{self.proj}" (path "/{self.rootpath()}" (reference "#FLG{self._u:03d}") (unit 1))))
  )''')

    def sheet(self, name, filename, x, y, w, h, root_uuid, sheet_uuid, page):
        self.items.append(f'''  (sheet (at {g(x)} {g(y)}) (size {g(w)} {g(h)})
    (stroke (width 0.1524) (type solid)) (fill (color 0 0 0 0.0000))
    (uuid "{sheet_uuid}")
    (property "Sheetname" "{name}" (at {g(x)} {g(y - 0.7)} 0) (effects (font (size 1.27 1.27)) (justify left bottom)))
    (property "Sheetfile" "{filename}" (at {g(x)} {g(y + h + 0.7)} 0) (effects (font (size 1.27 1.27)) (justify left top)))
    (instances (project "{self.proj}" (path "/{root_uuid}" (page "{page}"))))
  )''')

    # -- georiënteerde 2-pin passief met draad naar beide kanten --
    def res_h(self, ref, val, x, y, wnet, enet, lib="Device:R",
              fp="Resistor_SMD:R_0603_1608Metric"):
        """Horizontale R (rot 90): west-pin -> wnet, oost-pin -> enet."""
        self.comp(lib, ref, val, x, y, 90, fp)
        self.wire(x - 3.81, y, x - 6.35, y); self.pin_term(x - 6.35, y, wnet)
        self.wire(x + 3.81, y, x + 6.35, y); self.pin_term(x + 6.35, y, enet, rot=180)

    def res_v(self, ref, val, x, y, tnet, bnet, lib="Device:R",
              fp="Resistor_SMD:R_0603_1608Metric"):
        """Verticale R (rot 0): top-pin -> tnet, bottom-pin -> bnet."""
        self.comp(lib, ref, val, x, y, 0, fp)
        self.wire(x, y - 3.81, x, y - 6.35); self.pin_term(x, y - 6.35, tnet, rot=90)
        self.wire(x, y + 3.81, x, y + 6.35); self.pin_term(x, y + 6.35, bnet, rot=270)

    def cap_v(self, ref, val, x, y, tnet, bnet):
        self.comp("Device:C", ref, val, x, y, 0, "Capacitor_SMD:C_0603_1608Metric")
        self.wire(x, y - 3.81, x, y - 6.35); self.pin_term(x, y - 6.35, tnet, rot=90)
        self.wire(x, y + 3.81, x, y + 6.35); self.pin_term(x, y + 6.35, bnet, rot=270)

    # -- bedradings-primitieven (TD-12-stijl) --
    def R2(self, ref, val, x, y, rot=90, lib="Device:R",
           fp="Resistor_SMD:R_0603_1608Metric"):
        """Horizontale R. rot 90 -> pin1 west; rot 270 -> pin1 oost.
        Retourneert (pin1, pin2)."""
        self.comp(lib, ref, val, x, y, rot, fp)
        if rot == 270:
            return (x + 3.81, y), (x - 3.81, y)
        return (x - 3.81, y), (x + 3.81, y)

    def C2(self, ref, val, x, y, rot=90):
        self.comp("Device:C", ref, val, x, y, rot,
                  "Capacitor_SMD:C_0603_1608Metric")
        if rot == 270:
            return (x + 3.81, y), (x - 3.81, y)
        return (x - 3.81, y), (x + 3.81, y)

    def wjog(self, p1, p2, jx=None):
        """H-V-H-jog tussen twee punten (gedeelde hoek-eindpunten)."""
        (x1, y1), (x2, y2) = p1, p2
        if abs(y1 - y2) < 0.01:
            self.wire(x1, y1, x2, y2); return
        if abs(x1 - x2) < 0.01:
            self.wire(x1, y1, x2, y2); return
        jx = jx if jx is not None else (x1 + x2) / 2
        self.wire(x1, y1, jx, y1)
        self.wire(jx, y1, jx, y2)
        self.wire(jx, y2, x2, y2)

    def rail(self, pts, railx, net, up=False):
        """Bundel gelijke pinnen op een verticale rail + 1 (power)symbool."""
        for px, py in pts:
            self.wire(px, py, railx, py)
            self.junction(railx, py)
        ys = [p[1] for p in pts]
        self.wire(railx, min(ys), railx, max(ys))
        self.pin_term(railx, (min(ys) if up else max(ys)), net,
                      rot=(90 if up else 270))

    def write(self, path):
        libs = "\n".join(self.libs)
        cmts = "\n".join(f'    (comment {i+1} "{c}")'
                         for i, c in enumerate(self.comments))
        doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{self.uuid}")
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
  (sheet_instances (path "{self._spath}" (page "{self.page}")))
)
'''
        open(path, "w", encoding="utf-8", newline="\n").write(doc)
        print("written", path)


def box_pins(left, right, ux, uy, width=17.78):
    """Geef per pinnummer de (x, y, side) van de aansluitpunten van een box."""
    rows = max(len(left), len(right))
    hw = width / 2.0
    out = {}
    for i, (num, _n, _t) in enumerate(left):
        out[num] = (ux - (hw + 2.54), uy - (rows - 1) * 1.27 + 2.54 * i, 'L')
    for i, (num, _n, _t) in enumerate(right):
        out[num] = (ux + (hw + 2.54), uy - (rows - 1) * 1.27 + 2.54 * i, 'R')
    return out
