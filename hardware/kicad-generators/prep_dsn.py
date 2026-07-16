"""DSN prepareren voor freerouting: GND-net/-planes eruit, rand 0,6 mm krimpen.

Gebruik: python prep_dsn.py <bord.dsn>   (overschrijft het bestand in situ)

GND gaat via de koperzones + hechtvia's (gnd_stitch.py), niet via freerouting;
de randkrimp voorkomt rand-clearance-fouten (zie WERKWIJZE.md). Vaste
GND-koper uit de generator (reddings-sporen + via's) wordt als keepout
achtergelaten, anders routeert freerouting er blind doorheen.
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


# vaste GND-wiring (reddings-sporen/via's uit de generator) -> keepouts,
# vóór het strippen. Via's: cirkel ring 250 + clearance 200 = straal 450.
# LET OP: alleen met --keepout; freerouting v2.1 raakt door keepouts van
# slag (meldt 0 incompleet terwijl netten aantoonbaar gebroken zijn,
# gemeten dac8 2026-07-16). Zonder keepouts is de router blind voor het
# vaste GND-koper - DRC vangt eventuele botsingen achteraf.
keepouts = []
if '--keepout' not in sys.argv:
    keepouts = None
for m in (re.finditer(r'\(via\s+"[^"]*?(\d+):(\d+)[^"]*"\s+([-\d.]+)\s+([-\d.]+)'
                      r'\s*\(net "?GND"?\)', src)
          if keepouts is not None else ()):
    r = float(m.group(1)) / 2 + 200
    x, y = m.group(3), m.group(4)
    for lay in ('F.Cu', 'B.Cu'):
        keepouts.append(f'    (keepout "" (circle {lay} {2*r:.0f} {x} {y}))')
for m in (re.finditer(r'\(wire\s*\(path\s+(\S+)\s+([\d.]+)((?:\s+[-\d.]+)+)\s*\)'
                      r'\s*\(net "?GND"?\)', src)
          if keepouts is not None else ()):
    lay, w = m.group(1), float(m.group(2))
    pts = [float(v) for v in m.group(3).split()]
    r = w / 2 + 200
    seg = [(pts[k], pts[k + 1]) for k in range(0, len(pts) - 1, 2)]
    for (x1, y1), (x2, y2) in zip(seg, seg[1:]):
        n = max(1, int(((x2 - x1) ** 2 + (y2 - y1) ** 2) ** .5 / 800))
        for t in range(n + 1):
            x, y = x1 + (x2 - x1) * t / n, y1 + (y2 - y1) * t / n
            keepouts.append(
                f'    (keepout "" (circle {lay} {2*r:.0f} {x:.1f} {y:.1f}))')

for op in ('(plane GND', '(plane "GND"', '(net GND', '(net "GND"'):
    src = strip_block(src, op)
src = re.sub(r'(?<=[\s(])"?GND"?(?=[\s)])', '', src)

if keepouts:
    src = src.replace('(boundary', '\n'.join(keepouts) + '\n    (boundary', 1)
    print(f"keepouts voor vaste GND-koper: {len(keepouts)}")


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
