"""DSN prepareren voor freerouting: GND-net/-planes eruit, rand 0,6 mm krimpen.

Gebruik: python prep_dsn.py <bord.dsn>   (overschrijft het bestand in situ)

GND gaat via de koperzones + hechtvia's (gnd_stitch.py), niet via freerouting;
de randkrimp voorkomt rand-clearance-fouten (zie WERKWIJZE.md).
"""
import re
import sys

F = sys.argv[1]
src = open(F, encoding="utf-8").read()


def strip_block(text, opener):
    """Verwijder elk s-expr-blok dat met `opener` begint (haakjes-diepte)."""
    out = []
    i = 0
    while True:
        j = text.find(opener, i)
        if j < 0:
            out.append(text[i:])
            break
        out.append(text[i:j])
        depth = 0
        k = j
        while True:
            if text[k] == '(':
                depth += 1
            elif text[k] == ')':
                depth -= 1
            if depth == 0:
                break
            k += 1
        i = k + 1
    return ''.join(out)


for op in ('(plane GND', '(plane "GND"', '(net GND', '(net "GND"'):
    src = strip_block(src, op)
src = re.sub(r'(?<=[\s(])"?GND"?(?=[\s)])', '', src)


def shrink(m):
    coords = m.group(2).split()
    xs = [float(c) for c in coords[0::2]]
    ys = [float(c) for c in coords[1::2]]
    x0, x1 = min(xs) + 600, max(xs) - 600
    y0, y1 = min(ys) + 600, max(ys) - 600
    pts = f"{x0} {y0}  {x1} {y0}  {x1} {y1}  {x0} {y1}  {x0} {y0}"
    return m.group(1) + pts + ")"


src, n = re.subn(r'(\(path pcb 0\s+)([-\d.\s]+)\)', shrink, src, count=1)
open(F, "w", encoding="utf-8", newline="\n").write(src)
print(f"prep klaar ({F}): GND gestript, boundary gekrompen ({n})")
