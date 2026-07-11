"""Generate jack8 + jack4 panel-carrier boards (sch + routed pcb each)."""
import os

BASE = r"d:\Git\Muziek\MusicBrain\Images\schematics"

def g(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"


def make_sch(name, n, root):
    _u = [0]
    def uid():
        _u[0] += 1
        return f"{root}-{_u[0]:012d}"
    items = []
    def wire(x1, y1, x2, y2):
        items.append(f'  (wire (pts (xy {g(x1)} {g(y1)}) (xy {g(x2)} {g(y2)})) '
                     f'(stroke (width 0) (type default)) (uuid "{uid()}"))')
    def label(nm, x, y):
        items.append(f'  (label "{nm}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) '
                     f'(justify left bottom)) (uuid "{uid()}"))')
    _p = [0]
    def power_gnd(x, y):
        _p[0] += 1
        items.append(f'''  (symbol (lib_id "power:GND") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "#PWR{_p[0]:03d}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "GND" (at {g(x)} {g(y+3.81)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{name}" (path "/{root}0" (reference "#PWR{_p[0]:03d}") (unit 1))))
  )''')
    def component(lib, ref, val, x, y, fp, ry, vy):
        items.append(f'''  (symbol (lib_id "{lib}") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(ry)} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "{val}" (at {g(x)} {g(vy)} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "{fp}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{name}" (path "/{root}0" (reference "{ref}") (unit 1))))
  )''')

    # header J1
    rows = n + 2
    hx, hy = 50, 100
    component("Custom:Conn_01x%02d" % rows, "J1", "NAAR KAART", hx, hy,
              f"Connector_PinSocket_2.54mm:PinSocket_1x{rows:02d}_P2.54mm_Vertical",
              hy - (rows * 1.27 + 2.54), hy + (rows * 1.27 + 2.54))
    top = (rows - 1) * 1.27
    for k in range(rows):
        y = hy - top + 2.54 * k
        x = hx - 2.54
        wire(x, y, x - 5.08, y)
        if k == 0 or k == rows - 1:
            power_gnd(x - 5.08, y)
        else:
            label(f"CH{k}", x - 5.08, y)
    # jacks
    for j in range(1, n + 1):
        jx, jy = 100 + 35 * ((j - 1) % 4), 60 + 45 * ((j - 1) // 4)
        component("Custom:Jack_TSN", f"J{j+1}", "PJ398SM", jx, jy,
                  "MusicBrain:Jack_3.5mm_PJ398SM_Thonkiconn", jy - 7.62, jy + 7.62)
        # pins: 1 T at (-5.08, 2.54->left?), our symbol: T left top, S left mid, TN left bottom
        wire(jx - 7.62, jy - 2.54, jx - 12.7, jy - 2.54)
        label(f"CH{j}", jx - 12.7, jy - 2.54)
        wire(jx - 7.62, jy, jx - 10.16, jy)
        power_gnd(jx - 10.16, jy)
        wire(jx - 7.62, jy + 2.54, jx - 12.7, jy + 2.54)
        label("NORM", jx - 12.7, jy + 2.54)
    # solder jumper NORM -> GND
    component("Custom:SolderJumper", "JP1", "NORM=GND (dicht voor inputs)", 60, 170,
              "Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm", 162.38, 176.62)
    wire(56.19, 170, 51.11, 170)
    label("NORM", 51.11, 170)
    wire(63.81, 170, 66.35, 170)
    power_gnd(66.35, 170)
    # PWR_FLAG op GND (alles-passief bord)
    wire(40, 175, 45.08, 175)
    power_gnd(40, 175)
    items.append(f'''  (symbol (lib_id "power:PWR_FLAG") (at 45.08 175 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "#FLG01" (at 45.08 175 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "PWR_FLAG" (at 45.08 170.5 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at 45.08 175 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at 45.08 175 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "{name}" (path "/{root}0" (reference "#FLG01") (unit 1))))
  )''')

    conn_pins = "\n".join(f'''        (pin passive line (at -2.54 {g(top - 2.54 * k)} 0) (length 1.27)
          (name "Pin_{k+1}" (effects (font (size 1.27 1.27))))
          (number "{k+1}" (effects (font (size 1.0 1.0)))))''' for k in range(rows))
    libs = f'''    (symbol "Custom:Conn_01x{rows:02d}"
      (pin_names (offset 1.016) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "J" (at 0 {g(top + 3.81)} 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Conn" (at 0 -{g(top + 3.81)} 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "Conn_01x{rows:02d}_0_1"
        (rectangle (start -1.27 {g(top + 1.27)}) (end 0 -{g(top + 1.27)})
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "Conn_01x{rows:02d}_1_1"
{conn_pins}
      )
    )
    (symbol "Custom:Jack_TSN"
      (pin_names (offset 1.016))
      (property "Reference" "J" (at 0 6.35 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Jack" (at 0 -6.35 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "Jack_TSN_0_1"
        (rectangle (start -5.08 5.08) (end 5.08 -5.08)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "Jack_TSN_1_1"
        (pin passive line (at -7.62 2.54 0) (length 2.54)
          (name "T" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
        (pin passive line (at -7.62 0 0) (length 2.54)
          (name "S" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
        (pin passive line (at -7.62 -2.54 0) (length 2.54)
          (name "TN" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.0 1.0)))))
      )
    )
    (symbol "Custom:SolderJumper"
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
    )
    (symbol "power:PWR_FLAG"
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
    )
    (symbol "power:GND"
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

    doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{root}0")
  (paper "A4")
  (title_block
    (title "MusicBrain {name} - Thonkiconn paneeldrager ({n} jacks)")
    (date "2026-07-08")
    (rev "1.0")
    (company "MusicBrain project")
    (comment 1 "Prikt op frontconnector van GATE8/ADC8 ({name} contract: 1=GND, 2..{n+1}=CH, {n+2}=GND)")
    (comment 2 "JP1 dicht = schakelcontacten (TN) aan GND: alleen voor INPUT-kaarten")
  )
  (lib_symbols
{libs}
  )
  (text "JP1 OPEN laten bij gate/CV-uitgangen!\\n(anders wordt een ongepatchte uitgang via het\\nschakelcontact naar GND kortgesloten)" (exclude_from_sim no) (at 20.32 180 0)
    (effects (font (size 1.27 1.27)) (justify left)))
{chr(10).join(items)}
  (sheet_instances (path "/" (page "1")))
)
'''
    d = os.path.join(BASE, f"musicbrain-{name}")
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, f"musicbrain-{name}.kicad_sch"), "w", encoding="utf-8", newline="\n").write(doc)
    return d


def jack_footprint(ref, x, y, uid, path, tnet, snet, nnet):
    pads = [
        ('1', 0, -4.92, 'roundrect', 2.6, 2.6, tnet),
        ('2', 0, 6.48, 'oval', 3.1, 2.3, snet),
        ('3', 0, 3.38, 'roundrect', 2.6, 2.6, nnet),
    ]
    pt = []
    for num, px, py, shape, w, h, net in pads:
        rr = ' (roundrect_rratio 0.25)' if shape == 'roundrect' else ''
        pt.append(f'    (pad "{num}" thru_hole {shape} (at {g(px)} {g(py)}) (size {w} {h}) '
                  f'(drill oval 1.6 0.6) (layers "*.Cu" "*.Mask"){rr} (net {net[0]} "{net[1]}"))')
    return f'''  (footprint "MusicBrain:Jack_3.5mm_PJ398SM_Thonkiconn"
    (layer "F.Cu")
    (uuid "{uid}")
    (at {g(x)} {g(y)})
    (path "/{path}")
    (descr "Thonkiconn PJ398SM / PJ301M-12 / WQP518MA, verticale 3.5mm jack")
    (property "Reference" "{ref}" (at 6.3 0 90) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "PJ398SM" (at 0 0 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -4.5 -5.75) (end 4.5 6.08)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_circle (center 0 0) (end 3 0)
      (stroke (width 0.12) (type solid)) (fill no) (layer "F.Fab"))
    (fp_rect (start -5 -7.25) (end 5 7.58)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pt)}
    (model "${{KIPRJMOD}}/../3d/PJ301M-12_Thonkiconn.stp"
      (offset (xyz 0 0.75 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
  )'''


def make_pcb(name, n, root, silk):
    _u = [0]
    def uid():
        _u[0] += 1
        return f"{root}-b{_u[0]:011d}"
    rows = n + 2
    NETS = ['', 'GND', 'NORM'] + [f'/CH{k}' for k in range(1, n + 1)]
    NI = {nm: i for i, nm in enumerate(NETS)}
    BY1 = 100 + 15 * n + 5   # board bottom
    JY = [108 + 15 * k for k in range(n)]           # jack centers
    HY0 = (100 + BY1) / 2 - 1.27 * (rows - 1)       # header gecentreerd op de strip
    fps, tracks, vias = [], [], []
    def T(net, layer, w, *pts):
        tracks.append((NI[net], layer, w, pts))
    # jacks
    for k in range(n):
        fps.append(jack_footprint(f'J{k+2}', 108, JY[k], uid(), '',
                                  (NI[f'/CH{k+1}'], f'/CH{k+1}'),
                                  (NI['GND'], 'GND'), (NI['NORM'], 'NORM')))
    # header (holes; socket op achterzijde monteren)
    hp = []
    for k in range(rows):
        y = HY0 + 2.54 * k
        net = ('GND' if k in (0, rows - 1) else f'/CH{k}')
        shape = 'rect' if k == 0 else 'oval'
        hp.append(f'    (pad "{k+1}" thru_hole {shape} (at 0 {g(y - HY0)}) (size 1.7 1.7) '
                  f'(drill 1.0) (layers "*.Cu" "*.Mask") (net {NI[net]} "{net}"))')
    fps.append(f'''  (footprint "MusicBrain:Header_1x{rows:02d}_backside"
    (layer "F.Cu")
    (uuid "{uid()}")
    (at 115 {g(HY0)})
    (path "/")
    (descr "1x{rows} female socket - OP ACHTERZIJDE monteren (opening naar de kaart)")
    (property "Reference" "J1" (at 2.8 -2.2 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "SOCKET-BACK" (at 0 {g(2.54 * (rows - 1) + 3)} 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_rect (start -1.6 -1.6) (end 1.6 {g(2.54 * (rows - 1) + 1.6)})
      (stroke (width 0.12) (type solid)) (fill no) (layer "B.SilkS"))
    (fp_rect (start -1.8 -1.8) (end 1.8 {g(2.54 * (rows - 1) + 1.8)})
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(hp)}
    (model "${{KICAD10_3DMODEL_DIR}}/Connector_PinSocket_2.54mm.3dshapes/PinSocket_1x{rows:02d}_P2.54mm_Vertical.step"
      (offset (xyz 0 {g(2.54*(rows-1)/2)} 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
  )''')
    # solder jumper (SMD, on back? keep front) near bottom
    sj_y = BY1 - 3
    fps.append(f'''  (footprint "Jumper:SolderJumper-2_P1.3mm_Open_TrianglePad1.0x1.5mm"
    (layer "F.Cu")
    (uuid "{uid()}")
    (at 103.5 {g(sj_y)})
    (path "/")
    (property "Reference" "JP1" (at 0 -2.2 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "NORM=GND" (at 0 2.3 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr exclude_from_pos_files exclude_from_bom)
    (pad "1" smd custom (at -0.65 0) (size 1 1.5) (layers "F.Cu" "F.Mask")
      (options (clearance outline) (anchor rect))
      (primitives (gr_poly (pts (xy 0.5 0.75) (xy 0.5 -0.75) (xy -0.5 0) ) (width 0) (fill yes)))
      (net {NI['NORM']} "NORM"))
    (pad "2" smd custom (at 0.65 0) (size 1 1.5) (layers "F.Cu" "F.Mask")
      (options (clearance outline) (anchor rect))
      (primitives (gr_poly (pts (xy -0.5 0.75) (xy -0.5 -0.75) (xy 0.5 0) ) (width 0) (fill yes)))
      (net {NI['GND']} "GND"))
  )''')
    # --- routing: CH lanes ---
    up = [k for k in range(1, n + 1) if JY[k-1] - 4.92 < HY0 + 2.54 * k]
    dn = [k for k in range(1, n + 1) if k not in up]
    lanes = {}
    xw = 110.05
    for k in sorted(up, key=lambda q: -(JY[q-1] - 4.92)):   # shallow (grote y) eerst = west
        lanes[k] = xw; xw += 0.5
    for k in sorted(dn, key=lambda q: (JY[q-1] - 4.92)):     # ondiep eerst = west
        lanes[k] = xw; xw += 0.5
    for k in range(1, n + 1):
        tip_y = JY[k-1] - 4.92
        pin_y = HY0 + 2.54 * k
        lx = lanes[k]
        T(f'/CH{k}', 'F.Cu', 0.25, (115, pin_y), (lx, pin_y), (lx, tip_y), (108, tip_y))
    # NORM rail
    pts = [(103.5, JY[0] + 3.38)]
    for k in range(1, n):
        pass
    T('NORM', 'F.Cu', 0.3, (108, JY[0] + 3.38), (103.5, JY[0] + 3.38),
      (103.5, sj_y - 3), (102.85, sj_y - 3), (102.85, sj_y))
    for k in range(1, n):
        T('NORM', 'F.Cu', 0.3, (108, JY[k] + 3.38), (103.5, JY[k] + 3.38))
    # GND stitching
    for sx, sy in ((102, 102), (118, 102), (102, BY1 - 1.8), (118, BY1 - 2),
                   (118, (100 + BY1) / 2)):
        vias.append((NI['GND'], sx, sy))

    tt = []
    for net, layer, w, pts2 in tracks:
        for a, b in zip(pts2, pts2[1:]):
            tt.append(f'  (segment (start {g(a[0])} {g(a[1])}) (end {g(b[0])} {g(b[1])}) '
                      f'(width {w}) (layer "{layer}") (net {net}) (uuid "{uid()}"))')
    for net, x, y in vias:
        tt.append(f'  (via (at {g(x)} {g(y)}) (size 0.5) (drill 0.3) '
                  f'(layers "F.Cu" "B.Cu") (net {net}) (uuid "{uid()}"))')
    nets_block = '\n'.join(f'  (net {i} "{nm}")' for i, nm in enumerate(NETS))
    zones = ''
    for layer in ('F.Cu', 'B.Cu'):
        zones += f'''
  (zone (net {NI['GND']}) (net_name "GND") (layer "{layer}")
    (uuid "{uid()}")
    (hatch edge 0.5)
    (connect_pads yes (clearance 0.3))
    (min_thickness 0.2) (filled_areas_thickness no)
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts (xy 100.5 100.5) (xy 119.5 100.5) (xy 119.5 {g(BY1-0.5)}) (xy 100.5 {g(BY1-0.5)})))
  )'''
    doc = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (title_block
    (title "MusicBrain {name}")
    (date "2026-07-08")
    (rev "1.0")
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
    (aux_axis_origin 100 100)
    (grid_origin 100 100)
  )
{nets_block}
{chr(10).join(fps)}
{chr(10).join(tt)}
  (gr_rect (start 100 100) (end 120 {g(BY1)})
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "{silk}" (at 101.3 {g(BY1 - 2)} 90) (layer "F.SilkS")
    (uuid "{uid()}")
    (effects (font (size 1 1) (thickness 0.15))))
{zones}
)
'''
    d = os.path.join(BASE, f"musicbrain-{name}")
    open(os.path.join(d, f"musicbrain-{name}.kicad_pcb"), "w", encoding="utf-8", newline="\n").write(doc)
    open(os.path.join(d, f"musicbrain-{name}.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
        '{\n  "meta": {"filename": "musicbrain-%s.kicad_pro", "version": 3},\n'
        '  "general": {"project_name": "MusicBrain %s"},\n'
        '  "schematic": {"file": "musicbrain-%s.kicad_sch"},\n'
        '  "pcb": {"file": "musicbrain-%s.kicad_pcb"}\n}\n' % (name, name, name, name))


d8 = make_sch("jack8", 8, "e8000001-0000-4000-8000")
make_pcb("jack8", 8, "e8000002-0000-4000-8000", "musicbrain.nl/hw/jack8 rev 1.0")
d4 = make_sch("jack4", 4, "e4000001-0000-4000-8000")
make_pcb("jack4", 4, "e4000002-0000-4000-8000", "musicbrain.nl/hw/jack4 rev 1.0")
print("written", d8, "and", d4)
