"""Pinout-diagram (SVG) van een connector, rechtstreeks uit het bordbestand —
kan dus nooit uit de pas lopen met het ontwerp.

    python pinout_svg.py <bord.kicad_pcb> <ref> [-o uit.svg] [-t "titel"]
    python pinout_svg.py <bord.kicad_pcb> --alle          # alle J*-refs
                                                          # -> <bordmap>/pinouts/

Weergave: bovenaanzicht van het bord (kijkend op de pinnen). Pin 1 = vierkant.
Bij IDC-headers wordt de shroud met nok getekend (nok = oneven-pinnen-zijde,
conform de KiCad-footprints). Kleuren: GND grijs, voeding rood/blauw, nc licht.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardlib import parse

STAP = 34          # px per 2,54 mm
R = 9              # pin-straal


def kleur(net):
    if net is None:
        return '#ddd', '#999'
    if net == 'GND' or net.endswith('GND'):
        return '#9aa0a6', '#5f6368'
    if net in ('+3V3', '+5V', '+12V') or net.startswith('+'):
        return '#e06666', '#990000'
    if net.startswith('-'):
        return '#6fa8dc', '#1155cc'
    return '#ffd966', '#7f6000'


def lees_connector(pcb_path, ref):
    tree = parse(open(pcb_path, encoding='utf-8').read())
    for node in tree:
        if not (isinstance(node, list) and node[0] == 'footprint'):
            continue
        fpname = node[1].strip('"')
        r = None
        for sub in node:
            if (isinstance(sub, list) and sub[0] == 'property'
                    and sub[1] == '"Reference"'):
                r = sub[2].strip('"')
        if r != ref:
            continue
        pads = []
        val = ''
        for sub in node:
            if isinstance(sub, list) and sub[0] == 'property' and sub[1] == '"Value"':
                val = sub[2].strip('"')
            if isinstance(sub, list) and sub[0] == 'pad':
                num = sub[1].strip('"')
                at = next(s for s in sub if isinstance(s, list) and s[0] == 'at')
                net = None
                for s in sub:
                    # generator: (net <idx> "naam"); pcbnew-hersave: (net "naam")
                    if isinstance(s, list) and s[0] == 'net':
                        qs = [q for q in s[1:] if isinstance(q, str)
                              and q.startswith('"')]
                        if qs:
                            net = qs[-1].strip('"')
                if num:
                    pads.append((num, float(at[1]), float(at[2]), net))
        return fpname, val, pads
    raise SystemExit(f'ref {ref} niet gevonden in {pcb_path}')


def maak_svg(fpname, ref, val, pads, titel=None):
    # normaliseer: lange as horizontaal (lokale coords; bovenaanzicht)
    xs = [p[1] for p in pads]
    ys = [p[2] for p in pads]
    if (max(ys) - min(ys)) > (max(xs) - min(xs)):
        pads = [(n, y, x, net) for n, x, y, net in pads]   # 90 graden kantelen
        xs, ys = [p[1] for p in pads], [p[2] for p in pads]
    x0, y0 = min(xs), min(ys)
    rijen = sorted({round(p[2] - y0, 2) for p in pads})
    tweerij = len(rijen) == 2
    kols = sorted({round(p[1] - x0, 2) for p in pads})
    nk = len(kols)

    W = int(nk * STAP + 150)
    LBL = 120          # ruimte voor schuine netlabels
    BODY_H = STAP * (len(rijen) - 1) + 44 if tweerij else 44
    H = 66 + LBL + BODY_H + (LBL if tweerij else 26) + 30
    ox = 75
    oy = 66 + LBL

    def px(mmx):
        return ox + (mmx - x0) / 2.54 * STAP

    def py(mmy):
        return oy + 22 + (mmy - y0) / 2.54 * STAP

    idc = 'IDC' in fpname
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
           f'viewBox="0 0 {W} {H}" font-family="sans-serif">',
           f'<rect width="{W}" height="{H}" fill="white"/>',
           f'<text x="12" y="26" font-size="17" font-weight="bold">'
           f'{titel or f"{ref} — {val}"}</text>',
           f'<text x="12" y="46" font-size="12" fill="#666">bovenaanzicht bord '
           f'(kijkend op de pinnen); pin 1 = vierkant'
           f'{"; nok aan de oneven-pinnen-zijde" if idc else ""}</text>']

    bx0, bx1 = px(x0) - 26, px(x0 + kols[-1]) + 26
    by0, by1 = py(y0) - 22, py(y0 + rijen[-1]) + 22
    # body / shroud
    out.append(f'<rect x="{bx0}" y="{by0}" width="{bx1-bx0}" height="{by1-by0}" '
               f'rx="4" fill="#2b2b2b"/>')
    out.append(f'<rect x="{bx0+7}" y="{by0+7}" width="{bx1-bx0-14}" '
               f'height="{by1-by0-14}" rx="2" fill="#3d3d3d"/>')
    if idc:
        # nok in de wand aan de oneven-pinnen-rij (na normalisatie: de rij
        # van pin 1). Teken hem gecentreerd in de betreffende lange zijde.
        p1 = next(p for p in pads if p[0] == '1')
        nok_boven = abs(p1[2] - y0) < 0.01
        ny = by0 - 1 if nok_boven else by1 - 7
        out.append(f'<rect x="{(bx0+bx1)/2-16}" y="{ny}" width="32" height="8" '
                   f'fill="#3d3d3d"/>')

    for num, mx, my, net in pads:
        cx, cy = px(mx), py(my)
        vul, rand = kleur(net)
        if num == '1':
            out.append(f'<rect x="{cx-R}" y="{cy-R}" width="{2*R}" height="{2*R}" '
                       f'fill="{vul}" stroke="{rand}" stroke-width="1.5"/>')
        else:
            out.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{vul}" '
                       f'stroke="{rand}" stroke-width="1.5"/>')
        out.append(f'<text x="{cx}" y="{cy+4}" font-size="10" text-anchor="middle" '
                   f'fill="#222">{num}</text>')
        # netlabel schuin boven (rij 1) of onder (rij 2)
        lbl = (net or 'nc').lstrip('/')
        boven = abs(my - y0) < 0.01 or not tweerij
        if boven:
            lx, ly = cx + 4, by0 - 10
            out.append(f'<text x="{lx}" y="{ly}" font-size="12" '
                       f'transform="rotate(-55 {lx} {ly})">{lbl}</text>')
        else:
            lx, ly = cx + 4, by1 + 16
            out.append(f'<text x="{lx}" y="{ly}" font-size="12" text-anchor="end" '
                       f'transform="rotate(-55 {lx} {ly})">{lbl}</text>')
    out.append('</svg>')
    return '\n'.join(out)


def main():
    pcb = sys.argv[1]
    args = sys.argv[2:]
    titel = None
    if '-t' in args:
        i = args.index('-t')
        titel = args[i + 1]
        del args[i:i + 2]
    if args and args[0] == '--alle':
        tree = parse(open(pcb, encoding='utf-8').read())
        refs = []
        for node in tree:
            if isinstance(node, list) and node[0] == 'footprint':
                for sub in node:
                    if (isinstance(sub, list) and sub[0] == 'property'
                            and sub[1] == '"Reference"'):
                        r = sub[2].strip('"')
                        if re.fullmatch(r'J\d+', r):
                            refs.append(r)
        outdir = os.path.join(os.path.dirname(pcb), 'pinouts')
        os.makedirs(outdir, exist_ok=True)
        for ref in sorted(refs, key=lambda r: int(r[1:])):
            fpname, val, pads = lees_connector(pcb, ref)
            if len(pads) < 4:      # jacks/kleine parts overslaan
                continue
            svg = maak_svg(fpname, ref, val, pads)
            uit = os.path.join(outdir, f'{ref}.svg')
            open(uit, 'w', encoding='utf-8', newline='\n').write(svg)
            print('geschreven:', uit)
        return
    ref = args[0]
    uit = None
    if '-o' in args:
        uit = args[args.index('-o') + 1]
    fpname, val, pads = lees_connector(pcb, ref)
    svg = maak_svg(fpname, ref, val, pads, titel)
    uit = uit or os.path.join(os.path.dirname(pcb), 'pinouts', f'{ref}.svg')
    os.makedirs(os.path.dirname(uit), exist_ok=True)
    open(uit, 'w', encoding='utf-8', newline='\n').write(svg)
    print('geschreven:', uit)


if __name__ == '__main__':
    main()
