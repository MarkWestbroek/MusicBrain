"""POT8-FRONT: dom horizontaal front-bord, 8x RK097N verticaal + 1x10 socket achterop.

Route-2-model (besluit Mark 2026-07-11): het front ligt plat aan het paneel in een
20 mm-kolom; de assen op de HARTLIJN 8,0 mm van de westrand (= jack8-standaard);
de koppeling (1x10 female, achterzijde) in de ooststrook. Contract:
pin 1 = GND, 2..9 = W1..W8 (lopers), 10 = +3V3.

RK097N-verticaal, maten uit doc/data-sheets/RK097N/ (AliExpress RongLan):
3 pinnen 2,5 mm steek (span 5,0; gat 1,0), 2 beugelsleuven 1,2x1,5 op span 11,2,
7,5 mm achter de pinnenrij. SHAFT_OFFSET = afstand pinnenrij -> as-hart:
AANNAME 4,5 mm (uit de tekening: 6,5 - 2,0) - MEET DIT AAN DE FYSIEKE POT
en regenereer als het afwijkt (bepaalt of de as echt op de hartlijn valt).
"""
import os

BASE = r"d:\Git\Muziek\MusicBrain\Images\schematics"
NAME = "pot8front"
N = 8
PITCH = 13.75            # 110 / 8
SHAFT_OFFSET = 4.5       # pinnenrij -> as (VERIFIEREN aan fysieke pot!)
HART = 108.0             # as-hartlijn: 8,0 mm van de westrand (bord x 100..120)

def g(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s else "0"

SY = [100 + PITCH / 2 + PITCH * k for k in range(N)]   # as-y per pot
PIN_X = HART + SHAFT_OFFSET                            # 112.5 (pinnen oost)
JX = 116.5                                             # socket-kolom
JY0 = 155 - 4.5 * 2.54                                 # pad 1 (10 pads gecentreerd rond 155)

# ---------------- schematic ----------------
def make_sch():
    root = "f8000001-0000-4000-8000"
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
    def power(sym, x, y):
        _p[0] += 1
        val = sym.split(":")[1]
        vy = y - 3.302 if val == "+3V3" else y + 3.81
        items.append(f'''  (symbol (lib_id "{sym}") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "#PWR{_p[0]:03d}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "{val}" (at {g(x)} {g(vy)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "musicbrain-{NAME}" (path "/{root}0" (reference "#PWR{_p[0]:03d}") (unit 1))))
  )''')
    _f = [0]
    def flag(x, y):
        _f[0] += 1
        items.append(f'''  (symbol (lib_id "power:PWR_FLAG") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "#FLG{_f[0]:02d}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "PWR_FLAG" (at {g(x)} {g(y-4.5)} 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "musicbrain-{NAME}" (path "/{root}0" (reference "#FLG{_f[0]:02d}") (unit 1))))
  )''')
    def component(lib, ref, val, x, y, fp, ry, vy):
        items.append(f'''  (symbol (lib_id "{lib}") (at {g(x)} {g(y)} 0)
    (unit 1) (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)
    (uuid "{uid()}")
    (property "Reference" "{ref}" (at {g(x)} {g(ry)} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "{val}" (at {g(x)} {g(vy)} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "{fp}" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at {g(x)} {g(y)} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (instances (project "musicbrain-{NAME}" (path "/{root}0" (reference "{ref}") (unit 1))))
  )''')
    # 8 potmeters (pin 3 = CW-eind aan +3V3 boven, pin 1 = CCW aan GND onder, pin 2 = loper)
    for k in range(N):
        px, py = 60 + 45 * (k % 4), 60 + 50 * (k // 4)
        component("Device:R_Potentiometer", f"RV{k+1}", "RK097N 10k lin", px, py,
                  "MusicBrain:RK097N_Vertical", py - 8.89, py + 8.89)
        wire(px, py - 3.81, px, py - 6.35); power("power:+3V3", px, py - 6.35)
        wire(px, py + 3.81, px, py + 6.35); power("power:GND", px, py + 6.35)
        wire(px + 2.54, py, px + 7.62, py); label(f"W{k+1}", px + 7.62, py)
    # socket J1 (1x10)
    hx, hy = 60, 170
    component("Custom:Conn_01x10", "J1", "NAAR RISER (achterzijde)", hx, hy,
              "MusicBrain:Socket_1x10_backside", hy - 16.51, hy + 16.51)
    for k in range(10):
        y = hy - 11.43 + 2.54 * k
        wire(hx - 2.54, y, hx - 7.62, y)
        if k == 0:
            power("power:GND", hx - 7.62, y)
        elif k == 9:
            power("power:+3V3", hx - 7.62, y)
        else:
            label(f"W{k}", hx - 7.62, y)
    # PWR_FLAGs (voeding komt via J1 binnen)
    wire(130, 170, 135.08, 170); power("power:GND", 130, 170); flag(135.08, 170)
    wire(130, 160, 135.08, 160); power("power:+3V3", 130, 160); flag(135.08, 160)

    pot_sym = '''    (symbol "Device:R_Potentiometer"
      (pin_names (offset 0) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "RV" (at 2.54 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "R_Potentiometer" (at -2.54 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "R_Potentiometer_0_1"
        (polyline (pts (xy -1.016 -2.032) (xy 1.016 -2.032) (xy 1.016 2.032) (xy -1.016 2.032) (xy -1.016 -2.032))
          (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.27 0) (xy 2.286 0)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "R_Potentiometer_1_1"
        (pin passive line (at 0 3.81 270) (length 1.778)
          (name "CW" (effects (font (size 1.27 1.27))))
          (number "3" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 2.54 0 180) (length 0.254)
          (name "W" (effects (font (size 1.27 1.27))))
          (number "2" (effects (font (size 1.0 1.0)))))
        (pin passive line (at 0 -3.81 90) (length 1.778)
          (name "CCW" (effects (font (size 1.27 1.27))))
          (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''
    conn_pins = "\n".join(f'''        (pin passive line (at -2.54 {g(11.43 - 2.54 * k)} 0) (length 1.27)
          (name "Pin_{k+1}" (effects (font (size 1.27 1.27))))
          (number "{k+1}" (effects (font (size 1.0 1.0)))))''' for k in range(10))
    conn_sym = f'''    (symbol "Custom:Conn_01x10"
      (pin_names (offset 1.016) (hide yes)) (pin_numbers (hide yes))
      (property "Reference" "J" (at 0 15.24 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Conn" (at 0 -15.24 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "Conn_01x10_0_1"
        (rectangle (start -1.27 12.7) (end 0 -12.7)
          (stroke (width 0.254) (type default)) (fill (type background)))
      )
      (symbol "Conn_01x10_1_1"
{conn_pins}
      )
    )'''
    gnd_sym = '''    (symbol "power:GND"
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
    v33_sym = '''    (symbol "power:+3V3"
      (power)
      (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes))
      (property "Reference" "#PWR" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Value" "+3V3" (at 0 3.302 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "+3V3_0_1"
        (polyline (pts (xy 0 0) (xy 0 1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -0.762 1.27) (xy 0 2.54) (xy 0.762 1.27)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "+3V3_1_1"
        (pin power_in line (at 0 0 90) (length 0)
          (name "+3V3" (effects (font (size 1.27 1.27)) (hide yes)))
          (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''
    flag_sym = '''    (symbol "power:PWR_FLAG"
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
    doc = f'''(kicad_sch
  (version 20231120)
  (generator "eeschema")
  (generator_version "8.0")
  (uuid "{root}0")
  (paper "A4")
  (title_block
    (title "MusicBrain POT8-FRONT - dom front, 8x RK097N verticaal")
    (date "2026-07-11")
    (rev "1.0")
    (company "MusicBrain project")
    (comment 1 "Route 2: plat front aan het paneel; as-hartlijn 8,0 mm; socket 1x10 achterop")
    (comment 2 "Contract J1: 1=GND, 2..9=W1..W8, 10=+3V3 - naar pot-riser of pot8-kaart")
  )
  (lib_symbols
{pot_sym}
{conn_sym}
{gnd_sym}
{v33_sym}
{flag_sym}
  )
  (text "SHAFT_OFFSET-aanname 4,5 mm (pinnenrij->as).\\nMeet aan de fysieke pot; paneelgaten volgen de as-lijn!" (exclude_from_sim no) (at 20.32 190 0)
    (effects (font (size 1.27 1.27)) (justify left)))
{chr(10).join(items)}
  (sheet_instances (path "/" (page "1")))
)
'''
    d = os.path.join(BASE, f"musicbrain-{NAME}")
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, f"musicbrain-{NAME}.kicad_sch"), "w", encoding="utf-8", newline="\n").write(doc)

# ---------------- pcb ----------------
def make_pcb():
    root = "f8000002-0000-4000-8000"
    _u = [0]
    def uid():
        _u[0] += 1
        return f"{root}-b{_u[0]:011d}"
    NETS = ['', 'GND', '+3V3'] + [f'/W{k}' for k in range(1, N + 1)]
    NI = {nm: i for i, nm in enumerate(NETS)}
    fps, tracks, vias = [], [], []
    def T(net, layer, w, *pts):
        tracks.append((NI[net], layer, w, pts))
    # potten (anker = as-hart; pinnen oost op +SHAFT_OFFSET, beugels west)
    for k in range(N):
        sy = SY[k]
        pads = []
        for num, dy, net in (('1', -2.5, 'GND'), ('2', 0.0, f'/W{k+1}'), ('3', 2.5, '+3V3')):
            pads.append(f'    (pad "{num}" thru_hole circle (at {g(SHAFT_OFFSET)} {g(dy)}) '
                        f'(size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask") (net {NI[net]} "{net}"))')
        for dy in (-5.6, 5.6):
            # koperloze montagesleuf: het front hangt aan de M7-moeren; zo geen
            # rand-clearance- of netlijst-gedoe met de beugels
            pads.append(f'    (pad "" np_thru_hole oval (at {g(-(7.5 - SHAFT_OFFSET))} {g(dy)}) '
                        f'(size 1.2 1.5) (drill oval 1.2 1.5) (layers "*.Cu" "*.Mask"))')
        fps.append(f'''  (footprint "MusicBrain:RK097N_Vertical"
    (layer "F.Cu")
    (uuid "{uid()}")
    (at {g(HART)} {g(sy)})
    (path "/")
    (descr "RK097N 9mm verticaal, M7-bus; anker = as-hart (SHAFT_OFFSET {SHAFT_OFFSET})")
    (property "Reference" "RV{k+1}" (at 0 -7.6 0) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (property "Value" "RK097N 10k" (at 0 7.6 0) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (attr through_hole)
    (fp_circle (center 0 0) (end 4.75 0) (stroke (width 0.12) (type solid)) (fill no) (layer "F.SilkS"))
    (fp_circle (center 0 0) (end 3.5 0) (stroke (width 0.1) (type solid)) (fill no) (layer "F.Fab"))
    (fp_rect (start -6.2 -6.05) (end 6.2 6.05)
      (stroke (width 0.05) (type solid)) (fill no) (layer "F.CrtYd"))
{chr(10).join(pads)}
  )''')
    # socket 1x10 op de ACHTERZIJDE (zelfde recept als jack-strips v1.1)
    hp = []
    for k in range(10):
        net = 'GND' if k == 0 else ('+3V3' if k == 9 else f'/W{k}')
        shape = 'rect' if k == 0 else 'oval'
        hp.append(f'    (pad "{k+1}" thru_hole {shape} (at 0 {g(2.54 * k)}) (size 1.7 1.7) '
                  f'(drill 1.0) (layers "*.Cu" "*.Mask") (net {NI[net]} "{net}"))')
    fps.append(f'''  (footprint "MusicBrain:Socket_1x10_backside"
    (layer "B.Cu")
    (uuid "{uid()}")
    (at {g(JX)} {g(JY0)})
    (path "/")
    (descr "1x10 female socket op de achterzijde; opening omlaag naar riser/kaart")
    (property "Reference" "J1" (at 2.8 -2.2 0) (layer "B.SilkS")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (property "Value" "SOCKET-BACK" (at 0 25.9 0) (layer "B.Fab")
      (effects (font (size 1 1) (thickness 0.15)) (justify mirror)))
    (attr through_hole)
    (fp_rect (start -1.6 -1.6) (end 1.6 24.46)
      (stroke (width 0.12) (type solid)) (fill no) (layer "B.SilkS"))
    (fp_rect (start -1.8 -1.8) (end 1.8 24.66)
      (stroke (width 0.05) (type solid)) (fill no) (layer "B.CrtYd"))
{chr(10).join(hp)}
    (model "${{KICAD10_3DMODEL_DIR}}/Connector_PinSocket_2.54mm.3dshapes/PinSocket_1x10_P2.54mm_Vertical.step"
      (offset (xyz 0 11.43 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
  )''')
    # ---- routing ----
    # lopers: noordgroep W1-4 zuidwaarts, zuidgroep W5-8 noordwaarts;
    # nesting: ondiepste doel = oostelijkste laan (jack8-recept, 0,5 mm pitch)
    LANE = {1: 115.2, 2: 114.7, 3: 114.2, 4: 113.7,
            5: 113.7, 6: 114.2, 7: 114.7, 8: 115.2}
    for k in range(1, N + 1):
        wy = SY[k - 1]
        ty = JY0 + 2.54 * k          # pad k+1
        lx = LANE[k]
        T(f'/W{k}', 'F.Cu', 0.25, (PIN_X, wy), (lx, wy), (lx, ty), (JX, ty))
    # +3V3: B.Cu-rail west van de pinnenrij langs alle pin-3's + socket pin 10
    rail_x = 110.5
    T('+3V3', 'B.Cu', 0.3, (rail_x, SY[0] + 2.5), (rail_x, SY[-1] + 2.5))
    for k in range(N):
        T('+3V3', 'B.Cu', 0.3, (PIN_X, SY[k] + 2.5), (rail_x, SY[k] + 2.5))
    p10y = JY0 + 2.54 * 9
    T('+3V3', 'B.Cu', 0.3, (rail_x, p10y - 1.2), (JX - 1.2, p10y - 1.2), (JX, p10y))
    # GND-hechtvia's
    for sx, sy in ((102, 102), (118, 102), (102, 208), (118, 208), (102, 155),
                   (118, 128), (118, 186)):
        vias.append((NI['GND'], sx, sy))

    tt = []
    for net, layer, w, pts in tracks:
        for a, b in zip(pts, pts[1:]):
            if tuple(a) == tuple(b):
                continue
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
    (fill yes (thermal_gap 0.5) (thermal_bridge_width 0.5) (island_removal_mode 1) (island_area_min 10))
    (polygon (pts (xy 100.5 100.5) (xy 119.5 100.5) (xy 119.5 209.5) (xy 100.5 209.5)))
  )'''
    doc = f'''(kicad_pcb
  (version 20240108)
  (generator "pcbnew")
  (generator_version "8.0")
  (general (thickness 1.6) (legacy_teardrops no))
  (paper "A4")
  (title_block
    (title "MusicBrain POT8-FRONT")
    (date "2026-07-11")
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
  (gr_rect (start 100 100) (end 120 210)
    (stroke (width 0.1) (type default)) (fill none)
    (layer "Edge.Cuts") (uuid "{uid()}"))
  (gr_text "musicbrain.nl/hw/pot8front rev 1.0" (at 101.3 206 90) (layer "F.SilkS")
    (uuid "{uid()}")
    (effects (font (size 1 1) (thickness 0.15))))
  (gr_text "as-hartlijn 8.0" (at 108 101.2 0) (layer "F.Fab")
    (uuid "{uid()}")
    (effects (font (size 0.8 0.8) (thickness 0.12))))
{zones}
)
'''
    d = os.path.join(BASE, f"musicbrain-{NAME}")
    open(os.path.join(d, f"musicbrain-{NAME}.kicad_pcb"), "w", encoding="utf-8", newline="\n").write(doc)
    open(os.path.join(d, f"musicbrain-{NAME}.kicad_pro"), "w", encoding="utf-8", newline="\n").write(
        '{\n  "meta": {"filename": "musicbrain-%s.kicad_pro", "version": 3},\n'
        '  "general": {"project_name": "MusicBrain %s"},\n'
        '  "schematic": {"file": "musicbrain-%s.kicad_sch"},\n'
        '  "pcb": {"file": "musicbrain-%s.kicad_pcb"}\n}\n' % (NAME, NAME, NAME, NAME))

make_sch()
make_pcb()
print("written musicbrain-" + NAME)
