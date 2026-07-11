"""Frontpaneel-concept v1 (Eurorack 3U) -> SVG. Ter discussie.

Wijzigingen t.o.v. v0:
- Links een bredere 'brain-console': display + 4 soft-knoppen + 2 druk-encoders
  (UI rond het scherm) + MIDI (2x IN, 1x UIT) in een rij + USB.
- 6 performance-kaarten op 20mm-steek; ENC nu 5 encoders + 2 knopjes.
- Audio NIET op dit paneel: losse modulaire jack-strips via lintkabel (zie doc).
- Rechts een dunne reserve/uitbreidingsstrook (o.a. TUNE8-ijkkaart).
"""
import os

W, H = 200.0, 128.5
OUT = r"d:\Git\Muziek\MusicBrain\doc\mechanics\frontpanel-v1.svg"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

el = []
def rect(x, y, w, h, cls, rx=0):
    el.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{rx}" class="{cls}"/>')
def circ(x, y, d, cls="hole"):
    el.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{d/2:.2f}" class="{cls}"/>')
def oval(x, y, w, h, cls="mnt"):
    el.append(f'<rect x="{x-w/2:.2f}" y="{y-h/2:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{h/2:.2f}" class="{cls}"/>')
def txt(x, y, s, cls="lbl", anchor="middle", fill=None):
    f = f' fill="{fill}"' if fill else ''
    el.append(f'<text x="{x:.2f}" y="{y:.2f}" text-anchor="{anchor}" class="{cls}"{f}>{s}</text>')

rect(0, 0, W, H, "panel", rx=2)
for hx in (7.5, W - 7.5):
    oval(hx, 3.0, 5.5, 3.2); oval(hx, H - 3.1, 5.5, 3.2)

# ================= LINKS: brain-console (x 4..78) =================
txt(40, 9, "BRAIN-CONSOLE", "zone")
rect(10, 13, 58, 33, "disp", rx=1.5)
txt(39, 27, "DISPLAY", "cap", fill="#fff"); txt(39, 34, "TFT/OLED — menu/opties", "sub", fill="#ccc")
# 4 soft-knoppen onder het display
for i, x in enumerate((16, 32, 48, 64)):
    circ(x, 54, 6.0, "btn")
txt(40, 61, "4 soft-knoppen (menu)", "sub")
# 2 druk-encoders (UI-navigatie)
circ(26, 74, 7.0, "enc"); circ(54, 74, 7.0, "enc")
txt(40, 84, "2 druk-encoders (navigatie)", "sub")
# MIDI 2x IN + 1x UIT in een rij + USB
circ(15, 100, 15.5, "din"); txt(15, 100, "IN 1", "cap")
circ(40, 100, 15.5, "din"); txt(40, 100, "IN 2", "cap")
circ(65, 100, 15.5, "din"); txt(65, 100, "UIT", "cap")
rect(28, 116, 24, 7, "usb", rx=1); txt(40, 119.5, "USB-host", "cap")

# ================= MIDDEN: 6 performance-kaarten =================
YTOP = 13.0
def col_jacks(cx, name, sub):
    for k in range(8): circ(cx, YTOP + 3 + 12.6 * k, 9.0)
    txt(cx, H - 7.5, name, "cardname"); txt(cx, H - 3.5, sub, "sub")
def col_pots(cx, name, sub):
    for k in range(8): circ(cx, YTOP + 3 + 12.6 * k, 7.0, "pot")
    txt(cx, H - 7.5, name, "cardname"); txt(cx, H - 3.5, sub, "sub")
def col_enc(cx, name, sub):
    ys = [24.0 + 18.0 * k for k in range(5)]              # 24..96, midden op 60
    circ(cx, ys[0] - 11, 6.0, "btn")                      # knop boven (11 boven)
    for y in ys: circ(cx, y, 7.0, "enc")
    circ(cx, ys[-1] + 11, 6.0, "btn")                     # knop onder (11 onder)
    txt(cx, H - 7.5, name, "cardname"); txt(cx, H - 3.5, sub, "sub")

x0, pitch = 84.0, 20.0
cx = [x0 + pitch * i for i in range(6)]
col_jacks(cx[0], "ADC8", "8 CV in")
col_jacks(cx[1], "GATEIN8", "8 gate in")
col_pots(cx[2],  "POT8", "8 pots")
col_enc(cx[3],   "ENC5", "5 enc / 2 knop")
col_jacks(cx[4], "DAC8", "8 CV uit")
col_jacks(cx[5], "GATE8", "8 gate uit")

# ================= RECHTS: reserve / uitbreiding =================
rx0 = cx[5] + 11
rect(rx0, 12, W - rx0 - 4, H - 24, "reserve", rx=1.5)
cxr = rx0 + (W - rx0 - 4) / 2
txt(cxr, 58, "RESERVE", "cap")
txt(cxr, 64, "TUNE8-ijk", "sub"); txt(cxr, 69, "of extra", "sub")

txt(W / 2, -6, "MusicBrain frontpaneel — concept v1", "title")
txt(W / 2, H + 9, f"{W:.0f} x {H:.1f} mm (3U, ~{W/5.08:.0f} HP). "
    f"AUDIO = losse strips (2xN lint): audio-in (6 + gat + TUNE-IN) links, audio-uit (8) rechts.", "dim")
txt(2, -6, "jack Ø9 · pot Ø7 · enc Ø7 · knop Ø6 · DIN Ø15,5", "dim", "start")

style = """
.panel{fill:#f4f2ec;stroke:#222;stroke-width:0.4}
.hole{fill:#cfd8dc;stroke:#333;stroke-width:0.3}
.pot{fill:#ffe9b0;stroke:#333;stroke-width:0.3}
.enc{fill:#d6c8f0;stroke:#333;stroke-width:0.3}
.btn{fill:#f0b0b0;stroke:#333;stroke-width:0.3}
.din{fill:#d0e8d0;stroke:#333;stroke-width:0.3}
.usb{fill:#d0e8d0;stroke:#333;stroke-width:0.3}
.mnt{fill:#bbb;stroke:#333;stroke-width:0.3}
.disp{fill:#222;stroke:#000;stroke-width:0.3}
.reserve{fill:none;stroke:#999;stroke-width:0.4;stroke-dasharray:2 1.5}
.lbl{font:2.2px sans-serif;fill:#222}
.cap{font:2.3px sans-serif;fill:#111;font-weight:bold}
.sub{font:1.9px sans-serif;fill:#555}
.zone{font:2.6px sans-serif;fill:#888}
.cardname{font:3px sans-serif;fill:#111;font-weight:bold}
.title{font:5px sans-serif;fill:#111;font-weight:bold}
.dim{font:2.3px sans-serif;fill:#444}
text{dominant-baseline:middle}
"""
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -14 {W+8:.0f} {H+28:.0f}">'
       f'<style>{style}</style>' + "".join(el) + "</svg>")
open(OUT, "w", encoding="utf-8").write(svg)
print("geschreven", OUT, f"({len(el)} elementen)")
