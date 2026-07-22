"""VCF8-kern - LOGISCH schema van EEN stem (leesbaar/didactisch).

Doel: de topologie van 1 stem in een schoon, ruim schema (opamps als
driehoekjes, SSI2140 als concrete chip maar logisch gerangschikt). Dit is een
DOCUMENTATIE-tekening (niet in de netlist-keten); de 8 stemmen zijn identiek.

Signaalpad: audio-in -> ingangsbuffer -> AINB -> SSI2140 4-pole cascade
(4 gm-trappen, elk 15k-serie/15k-feedback/200R-shunt/1nF-cap; Q-stroom terug
op de 1e knoop) -> taps OUT1..OUT4 + AINB -> pole-mix-som-ster -> 4051(MODE)
-> uitgangsbuffer -> audio-uit. Cutoff/Q/FM als CV-ingangen onderaan.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import schlib_hier as SH
from schlib import box_symbol, R_SYM, C_SYM, power_symbol

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-vcf8kern"
DATE, REV = "2026-07-21", "0.1"

# --- opamp-driehoek-symbool (+ = pin3, - = pin2, uit = pin1) ---
OPAMP = '''    (symbol "Custom:OpAmp"
      (pin_names (offset 0.762) (hide yes))
      (property "Reference" "U" (at 0 6.5 0) (effects (font (size 1.27 1.27))))
      (property "Value" "OpAmp" (at 0 -8 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "OpAmp_0_1"
        (polyline (pts (xy -5.08 6.35) (xy -5.08 -6.35) (xy 6.35 0) (xy -5.08 6.35))
          (stroke (width 0.254) (type default)) (fill (type background)))
        (polyline (pts (xy -3.6 3.2) (xy -2.2 3.2)) (stroke (width 0.2) (type default)) (fill (type none)))
        (polyline (pts (xy -2.9 2.5) (xy -2.9 3.9)) (stroke (width 0.2) (type default)) (fill (type none)))
        (polyline (pts (xy -3.6 -3.2) (xy -2.2 -3.2)) (stroke (width 0.2) (type default)) (fill (type none)))
      )
      (symbol "OpAmp_1_1"
        (pin input line (at -10.16 2.54 0) (length 5.08)
          (name "+" (effects (font (size 1.27 1.27)))) (number "3" (effects (font (size 1.0 1.0)))))
        (pin input line (at -10.16 -2.54 0) (length 5.08)
          (name "-" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.0 1.0)))))
        (pin output line (at 11.43 0 180) (length 5.08)
          (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.0 1.0)))))
      )
    )'''

# SSI2140 - LOGISCH gerangschikt (in links, uit rechts) i.p.v. fysieke pinvolgorde
SSI_DL = [("6", "IN1", "input"), ("3", "IN2", "input"), ("19", "IN3", "input"),
          ("16", "IN4", "input"), ("7", "EXPO", "input"), ("12", "Q CTRL", "input"),
          ("13", "Q VCA IN", "input"), ("20", "V+", "power_in"),
          ("8", "TEMPCO", "passive"), ("10", "GND", "power_in")]
SSI_DR = [("4", "OUT1", "output"), ("1", "OUT2", "output"), ("17", "OUT3", "output"),
          ("14", "OUT4", "output"), ("9", "Q VCA OUT", "output"),
          ("5", "CAP1", "passive"), ("2", "CAP2", "passive"), ("18", "CAP3", "passive"),
          ("15", "CAP4", "passive"), ("11", "V-", "power_in")]
MUX_DL = [("13", "Y0", "passive"), ("14", "Y1", "passive"), ("15", "Y2", "passive"),
          ("12", "Y3", "passive"), ("1", "Y4", "passive"), ("5", "Y5", "passive"),
          ("2", "Y6", "passive"), ("4", "Y7", "passive")]
MUX_DR = [("3", "Z", "output"), ("11", "A", "input"), ("10", "B", "input"),
          ("9", "C", "input"), ("6", "~{INH}", "input"), ("16", "VDD", "power_in"),
          ("7", "VEE", "power_in"), ("8", "VSS", "power_in")]

d = SH.Doc("efd00000-0000-4000-8000-000000000000", "musicbrain-vcf8kern-voicedoc",
           "VCF8-kern - LOGISCH schema van 1 stem (opamps = driehoek, SSI = chip)",
           REV, DATE, 1)
d.libs = [OPAMP, box_symbol("SSI2140", SSI_DL, SSI_DR, width=25.4),
          box_symbol("HC4051", MUX_DL, MUX_DR), R_SYM, C_SYM,
          power_symbol("GND", False), power_symbol("+3V3", True),
          power_symbol("+12V", True), power_symbol("-12V", False)]


def opamp(ref, x, y):
    d.comp("Custom:OpAmp", ref, "TL074 (¼)", x, y, 0, "")
    return (x - 10.16, y + 2.54), (x - 10.16, y - 2.54), (x + 11.43, y)  # +,-,out


def lab(name, x, y, rot=0, shape='bidirectional'):
    d.glabel(name, x, y, rot, shape)


# ===== INGANGSBUFFER (driehoek, follower met in-deler) =====
d.text("VCF8-KERN - LOGISCH SCHEMA VAN 1 STEM (van 8 identieke)", 30, 24, 2.0)
d.text("audio in -> ingangsbuffer -> SSI2140 4-pole cascade -> pole-mixing (4051) -> uitgangsbuffer -> audio uit", 30, 30)
lab("AUDIO_IN", 32, 70, 0, 'input')
# in-deler 75k / 18.7k -> ~1/5 (± 5V chain -> SSI-niveau)
rp1, rp2 = d.R2("R19", "75k", 46, 70)
d.wire(38, 70, rp1[0], 70)
d.wire(rp2[0], 70, 60, 70); d.junction(60, 70)
rv1, rv2 = d.R2("R20", "18.7k", 60, 80, rot=270)   # naar GND
d.wire(60, 70, 60, 80 - 3.81)
d.wire(rv2[0], rv2[1], 60, 88); d.power("GND", 60, 88, 270)
ip, im, io = opamp("U:in", 78, 70)
d.wire(60, 70, ip[0], ip[1])                        # deler -> +in
d.wire(io[0], io[1], io[0] + 4, io[1]); d.junction(io[0] + 4, io[1])
d.wire(io[0] + 4, io[1], io[0] + 4, im[1]); d.wire(io[0] + 4, im[1], im[0], im[1])  # follower
d.wire(io[0], io[1], 100, io[1]); lab("AINB", 100, io[1], 180, 'output')
d.text("ingangsbuffer (unity, /5)", 66, 60, 1.0)

# ===== SSI2140 + cascade =====
UX, UY = 182, 92
d.comp("Custom:SSI2140", "U1", "SSI2140", UX, UY, 0, "Package_SO:SSOP-20_3.9x8.7mm_P0.635mm")
Pn = SH.box_pins(SSI_DL, SSI_DR, UX, UY, width=25.4)
d.text("SSI2140 - 4-pole OTA-cascade (Fig 3). Elke trap: 15k serie + 15k", 120, 55, 1.0)
d.text("feedback + 200R shunt + 1nF C0G; Q-stroom (pin9) terug op knoop 1.", 120, 58, 1.0)


def pin(n):
    return Pn[n][0], Pn[n][1]


# power
for pnum, rail, ry in (("20", "+12V", 0), ("11", "-12V", 0), ("10", "GND", 0)):
    px, py = pin(pnum)
    side = -1 if Pn[pnum][2] == 'L' else 1
    d.wire(px, py, px + side * 4, py); d.pin_term(px + side * 4, py, rail, rot=(0 if side < 0 else 180))
d.nc(*pin("8"))   # TEMPCO open

# de 4 gm-trappen, elk in een eigen brede baan (17 mm uit elkaar):
# tap -[15k serie]-> knoop(=INx) <-[15k feedback]- eigen OUT ; knoop -[200R]-> GND
STAGES = [("6", "AINB", "OUT1", "R01", "R05", "R09", 1),
          ("3", "OUT1", "OUT2", "R02", "R06", "R10", 2),
          ("19", "OUT2", "OUT3", "R03", "R07", "R11", 3),
          ("16", "OUT3", "OUT4", "R04", "R08", "R12", 4)]
for si, (ipin, stap, otap, Rser, Rfb, Rsh, st) in enumerate(STAGES):
    px, py = pin(ipin)                     # IN-pin (links op de chip)
    ny = 60 + si * 17                      # gespreide baan
    jx = px - 6 - si * 1.6                 # eigen jog-kolom per trap
    d.wire(px, py, jx, py); d.wire(jx, py, jx, ny); d.wire(jx, ny, jx - 4, ny)
    nx = jx - 4
    d.junction(nx, ny)
    d.text(f"trap {st}  ({stap} in)", nx - 34, ny - 9, 1.1)
    # series R (van vorige tap)
    p1, p2 = d.R2(Rser, "15k", nx - 14, ny)
    d.wire(p2[0], p2[1], nx, ny)
    d.wire(p1[0], p1[1], nx - 26, ny); lab(stap, nx - 26, ny, 0, 'input')
    # feedback R (van eigen OUT) - een baanhelft omhoog
    f1, f2 = d.R2(Rfb, "15k", nx - 14, ny - 6)
    d.wire(f2[0], f2[1], nx, ny - 6); d.wire(nx, ny - 6, nx, ny)
    d.wire(f1[0], f1[1], nx - 26, ny - 6); lab(otap, nx - 26, ny - 6, 0, 'input')
    # shunt 200R -> GND (omlaag)
    s1, s2 = d.R2(Rsh, "200R", nx, ny + 6, rot=270)
    d.wire(s1[0], s1[1], nx, ny); d.wire(s2[0], s2[1], nx - 6, ny + 6)
    d.power("GND", nx - 6, ny + 6, 180)

# Q-stroom terug (pin9 QVCAOUT -> knoop 1 = IN1)
qx, qy = pin("9")
d.wire(qx, qy, qx + 6, qy); lab("QFB", qx + 6, qy, 180, 'output')
n1x = pin("6")[0] - 8
lab("QFB", n1x, pin("6")[1] + 3, 0, 'input')
d.wire(n1x, pin("6")[1], n1x, pin("6")[1] + 3)

# OUT-taps -> labels (pole-mix-bus)
for opin, tap in (("4", "OUT1"), ("1", "OUT2"), ("17", "OUT3"), ("14", "OUT4")):
    px, py = pin(opin)
    d.wire(px, py, px + 6, py); lab(tap, px + 6, py, 180, 'output')
# CAPs -> 1nF -> GND (rechts)
for cpin, cref in (("5", "C01"), ("2", "C02"), ("18", "C03"), ("15", "C04")):
    px, py = pin(cpin)
    c1, c2 = d.C2(cref, "1n", px + 8, py)
    d.wire(px, py, c1[0], py); d.wire(c2[0], c2[1], px + 16, py)
    d.power("GND", px + 16, py, 180)

# ===== CV-ingangen (onderaan) =====
d.text("CV (cutoff = AD5754 16-bit precisie; Q = DAC128S085 12-bit; FM = frontjack):", 30, 150, 1.2)
# EXPO: cutoff -[54.9k]- EXPO ; 1k EXPO->GND ; FM -[100k]- EXPO
ex, ey = pin("7")
enx = ex - 10
d.wire(ex, ey, enx, ey); d.junction(enx, ey)
c1, c2 = d.R2("R13", "54.9k", enx - 16, ey)
d.wire(c2[0], c2[1], enx, ey); d.wire(c1[0], c1[1], enx - 28, ey)
lab("CUTOFF_CV", enx - 28, ey, 0, 'input')
f1, f2 = d.R2("R15", "100k", enx - 16, ey - 5)
d.wire(f2[0], f2[1], enx, ey - 5); d.wire(enx, ey - 5, enx, ey)
d.wire(f1[0], f1[1], enx - 28, ey - 5); lab("FM_CV", enx - 28, ey - 5, 0, 'input')
g1, g2 = d.R2("R14", "1k", enx, ey + 6, rot=270)
d.wire(g1[0], g1[1], enx, ey); d.wire(g2[0], g2[1], enx - 6, ey + 6)
d.power("GND", enx - 6, ey + 6, 180)
d.text("EXPO (pin7): 54.9k -> -18mV/oct; 1k naar GND; pin8 open (tempco uit)", 96, 132, 1.0)
# Q CTRL: Q -[13k]- QCTRL
qx2, qy2 = pin("12")
d.wire(qx2, qy2, qx2 - 8, qy2)
q1, q2 = d.R2("R16", "13k", qx2 - 18, qy2)
d.wire(q2[0], q2[1], qx2 - 8, qy2); d.wire(q1[0], q1[1], qx2 - 30, qy2)
lab("Q_CV", qx2 - 30, qy2, 0, 'input')
# Q VCA IN (comp): AINB -[16.2k]- QVCAIN ; 1k -> GND
qvx, qvy = pin("13")
d.wire(qvx, qvy, qvx - 8, qvy); d.junction(qvx - 8, qvy)
qc1, qc2 = d.R2("R17", "16.2k", qvx - 18, qvy)
d.wire(qc2[0], qc2[1], qvx - 8, qvy); d.wire(qc1[0], qc1[1], qvx - 30, qvy)
lab("AINB", qvx - 30, qvy, 0, 'input')
qg1, qg2 = d.R2("R18", "1k", qvx - 8, qvy + 6, rot=270)
d.wire(qg1[0], qg1[1], qvx - 8, qvy); d.wire(qg2[0], qg2[1], qvx - 14, qvy + 6)
d.power("GND", qvx - 14, qvy + 6, 180)
d.text("Q-comp (Fig 14): 16.2k/1k -> constante passband", 96, 138, 1.0)

# ===== POLE-MIX + 4051 + UITGANGSBUFFER =====
d.text("POLE-MIXING (Fig 20/AN701): gewogen som van de 5 taps -> 8 modes -> 4051 kiest de mode.", 210, 55, 1.2)
MX, MY = 300, 95
d.comp("Custom:HC4051", "U11", "74HC4051", MX, MY, 0, "")
Mp = SH.box_pins(MUX_DL, MUX_DR, MX, MY)
MODES = [("4LP", {4: 1}), ("3LP", {3: 1}), ("2LP", {2: 1}), ("1LP", {1: 1}),
         ("2HP", {0: 1, 1: 2, 2: 1}), ("BP2", {1: 1, 2: 1}),
         ("BP4", {2: 1, 3: 2, 4: 1}), ("NOTCH", {0: 1, 1: 2, 2: 2})]
W2R = {1: "75k", 2: "37.4k", 4: "18.7k", 6: "12.4k"}
TAP = {0: "AINB", 1: "OUT1", 2: "OUT2", 3: "OUT3", 4: "OUT4"}
ri = 30
for m, (nm, wts) in enumerate(MODES):
    ypx, ypy, _s = Mp[str([13, 14, 15, 12, 1, 5, 2, 4][m])]   # Y0..Y7 links
    d.wire(ypx, ypy, ypx - 4, ypy); d.junction(ypx - 4, ypy)
    d.text(nm, ypx - 3, ypy - 1.2, 0.9)
    for tap, w in wts.items():
        rr = 236
        pp1, pp2 = d.R2(f"R{ri}", W2R[w], rr, ypy)
        d.wire(pp2[0], pp2[1], ypx - 4, ypy)
        d.wire(pp1[0], pp1[1], 226, ypy); lab(TAP[tap], 226, ypy, 0, 'input')
        ri += 1
        rr -= 0
# mux select + power
for pnum, nm2 in (("11", "MODE0"), ("10", "MODE1"), ("9", "MODE2"), ("6", "GND"),
                  ("16", "+3V3"), ("7", "-12V"), ("8", "GND")):
    px, py, _s = Mp[pnum]
    d.wire(px, py, px + 4, py); d.pin_term(px + 4, py, nm2, 180)
# Z -> uitgangsbuffer (gain ~5)
zx, zy, _s = Mp["3"]
op, om, oo = opamp("U:out", zx + 24, zy)
d.wire(zx, zy, op[0], zy)                             # Z -> +in
og1, og2 = d.R2("R21", "15k", oo[0] - 4, zy + 12, rot=270)
d.wire(oo[0], oo[1], oo[0] + 4, oo[1]); d.junction(oo[0] + 4, oo[1])
d.wire(oo[0] + 4, oo[1], oo[0] + 4, om[1]); d.junction(oo[0] + 4, om[1])
d.wire(oo[0] + 4, om[1], om[0], om[1])                # -in
d.wire(oo[0] + 4, om[1], oo[0] + 4, zy + 12 - 3.81)   # -in -> Rg
d.wire(og1[0], og1[1], oo[0] + 4, zy + 12 - 3.81)
d.wire(og2[0], og2[1], oo[0] + 4, zy + 20); d.power("GND", oo[0] + 4, zy + 20, 270)
of1, of2 = d.R2("R22", "60.4k", oo[0] + 14, om[1] - 8)   # RF: uit -> -in
d.wire(oo[0], oo[1], oo[0] + 20, oo[1]); d.junction(oo[0] + 20, oo[1])
lab("AUDIO_UIT", oo[0] + 20, oo[1], 180, 'output')
d.text("uitgangsbuffer (x5) + pole-mix-som", 300, 78, 1.0)
d.text("(passieve som-ster normaliseert de modeniveaus)", 214, 128, 1.0)

d.write(OUT_DIR + r"\musicbrain-vcf8kern-voicedoc.kicad_sch")
print("logisch stem-schema geschreven")
