"""Genereer <bord>-overzicht.json uit het bordbestand zelf.

    python make_overzicht.py <bord.kicad_pcb> [-o uit.json]

Callouts = alle J*-footprints (label = "VALUE (REF)", positie = het
footprint-anker, kant = de dichtstbijzijnde bordrand). bbox komt uit de
Edge.Cuts. Draait onder de gewone python (leest het bord als sexpr-tekst,
geen pcbnew nodig). board_overview.py rendert er daarna de SVG omheen.
"""
import argparse
import json
import os
import re
import sys

ap = argparse.ArgumentParser()
ap.add_argument('pcb')
ap.add_argument('-o', '--out')
args = ap.parse_args()

src = open(args.pcb, encoding='utf-8').read()

# bordrand (gr_rect op Edge.Cuts — onze generators schrijven er precies één)
m = re.search(r'\(gr_rect \(start ([\d.]+) ([\d.]+)\) \(end ([\d.]+) ([\d.]+)\)'
              r'[\s\S]{0,200}?\(layer "Edge\.Cuts"\)', src)
assert m, "geen Edge.Cuts-rechthoek gevonden"
bx0, by0, bx1, by1 = (float(v) for v in m.groups())

# titel uit het titelblok
tm = re.search(r'\(title "([^"]+)"\)', src)
rm = re.search(r'\(rev "([^"]+)"\)', src)
naam = os.path.basename(args.pcb).replace('.kicad_pcb', '')
titel = f"{naam} rev {rm.group(1) if rm else '?'} — aansluitoverzicht"

# footprints: ref/value/at
callouts = []
for fm in re.finditer(r'\(footprint "[^"]+"[\s\S]*?\n  \)', src):
    blok = fm.group(0)
    ref = re.search(r'\(property "Reference" "([^"]+)"', blok)
    val = re.search(r'\(property "Value" "([^"]+)"', blok)
    at = re.search(r'\(at ([\d.-]+) ([\d.-]+)', blok)
    if not (ref and val and at):
        continue
    r = ref.group(1)
    if not r.startswith('J'):
        continue
    x, y = float(at.group(1)), float(at.group(2))
    # kant = dichtstbijzijnde rand
    afst = {'links': x - bx0, 'rechts': bx1 - x, 'boven': y - by0, 'onder': by1 - y}
    kant = min(afst, key=afst.get)
    callouts.append({'label': f"{val.group(1)} ({r})", 'mm': [round(x, 2), round(y, 2)],
                     'kant': kant})

callouts.sort(key=lambda c: (c['kant'], c['mm']))
doc = {'titel': titel, 'bbox_mm': [bx0, by0, bx1, by1], 'callouts': callouts}
out = args.out or args.pcb.replace('.kicad_pcb', '-overzicht.json')
open(out, 'w', encoding='utf-8', newline='\n').write(
    json.dumps(doc, indent=1, ensure_ascii=False) + '\n')
print(f"{out}: {len(callouts)} callouts, bbox {bx0},{by0}..{bx1},{by1}")
