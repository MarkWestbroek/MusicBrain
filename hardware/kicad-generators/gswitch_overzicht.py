"""Grafisch aansluitoverzicht voor gswitch-borden (SVG met callouts).

Werkwijze: kicad-cli exporteert de topview als vector-SVG met de bordbbox
als viewBox (mm!), dit script hangt er buitenom pijlen + labels aan op
exacte bordcoordinaten. Uitvoer rendert in GitHub/VSCode.

Gebruik:  python gswitch_overzicht.py            (gswitch-brain)
"""
import os
import re
import subprocess

BOARD_DIR = os.path.join(os.path.dirname(__file__), '..', 'schematics',
                         'gswitch-brain')
PCB = os.path.join(BOARD_DIR, 'gswitch-brain.kicad_pcb')
TOP_SVG = os.path.join(BOARD_DIR, 'board-top.svg')
OUT = os.path.join(BOARD_DIR, 'gswitch-brain-overzicht.svg')
BX, BY = 100.0, 100.0          # bord-oorsprong (bordcoord - dit = svg-coord)

# (label, doelpunt-x, doelpunt-y (bordcoord), label-x, label-y (svg-coord),
#  anchor)  -- label-y is de basislijn van de tekst
CALLOUTS = [
    ("12V DC in (center-negatief!)", 106, 120,   -4, 20.8, 'end'),
    ("voeding: 12V → 5V (buck) → 3,3V", 116, 110, -4, 10.8, 'end'),
    ("debug-UART", 104, 140.5,                   -4, 40.8, 'end'),
    ("USB-C: eerste flash / debug", 102, 152,    -4, 52.8, 'end'),
    ("MIDI IN", 137, 104,                        30, -4.5, 'middle'),
    ("MIDI UIT", 166, 104,                       66, -4.5, 'middle'),
    ("ESP32-S3-WROOM-1U (antenne → U.FL)", 186, 114, 118, -4.5, 'middle'),
    ("OLED-display (I²C)", 198, 105,        104, 5.8, 'start'),
    ("knoppen 1-4", 198, 118,                    104, 18.8, 'start'),
    ("encoder", 198, 132,                        104, 32.8, 'start'),
    ("spare-GPIO's", 198, 149,                   104, 49.8, 'start'),
    ("chain A → loop8-kastjes", 125, 168,   25, 79.5, 'middle'),
    ("chain B → loop8-kastjes", 165, 168,   65, 79.5, 'middle'),
]
LEGENDE = ("SW1 = RESET · SW2 = BOOT · U2 = chain-buffer (74HCT541) "
           "· U4 = MIDI-in-opto · U3 = MIDI-uit-buffer")


def main():
    subprocess.run(['kicad-cli', 'pcb', 'export', 'svg',
                    '--layers', 'F.Cu,F.SilkS,F.Mask,Edge.Cuts',
                    '--page-size-mode', '2', '--exclude-drawing-sheet',
                    '-o', TOP_SVG, PCB], check=True)
    t = open(TOP_SVG, encoding='utf-8').read()
    m = re.search(r'<svg[^>]*viewBox="([\d. \-]+)"[^>]*>', t, re.S)
    vb = m.group(1)
    inner = t[m.end():t.rfind('</svg>')]
    # titel/desc eruit (verwarrend in de geneste svg)
    inner = re.sub(r'<title>.*?</title>|<desc>.*?</desc>', '', inner,
                   flags=re.S)

    parts = []
    parts.append('<svg xmlns="http://www.w3.org/2000/svg" '
                 'viewBox="-62 -12 232 102" font-family="sans-serif" '
                 'font-size="3.2">')
    parts.append('<rect x="-62" y="-12" width="232" height="102" '
                 'fill="white"/>')
    parts.append(f'<svg x="0" y="0" width="100" height="70" '
                 f'viewBox="{vb}">{inner}</svg>')
    for label, tx, ty, lx, ly, anchor in CALLOUTS:
        px, py = tx - BX, ty - BY
        # lijn-eindpunt iets bij de tekst vandaan
        ex = lx + (1.2 if anchor == 'end' else -1.2 if anchor == 'start' else 0)
        ey = ly - 1.1 if anchor in ('start', 'end') else \
            (ly + 1.2 if ly < py else ly - 4.2)
        if anchor == 'middle':
            ex = lx
        parts.append(f'<line x1="{ex}" y1="{ey}" x2="{px}" y2="{py}" '
                     f'stroke="#c47b00" stroke-width="0.45"/>')
        parts.append(f'<circle cx="{px}" cy="{py}" r="0.9" fill="#c47b00"/>')
        parts.append(f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" '
                     f'fill="#1a1a1a">{label}</text>')
    parts.append(f'<text x="-58" y="87.5" fill="#555" font-size="2.7">'
                 f'{LEGENDE}</text>')
    parts.append(f'<text x="-58" y="-8" fill="#1a1a1a" font-size="4.2" '
                 f'font-weight="bold">gswitch-brain rev 0.1 — '
                 f'aansluitoverzicht</text>')
    parts.append('</svg>')
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(parts))
    print('geschreven:', OUT)


if __name__ == '__main__':
    main()
