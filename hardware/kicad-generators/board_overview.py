"""Aansluitoverzicht-SVG rond een 3D-render van een bord (programmatisch,
geen KiCad-GUI nodig).

    python board_overview.py <bord.kicad_pcb> <overzicht.json> [uit.svg]

De render komt uit `kicad-cli pcb render` (top-view). Het bord wordt in de
PNG teruggevonden (achtergrond = uniforme rand-kleur), zodat callouts in
BORD-mm kunnen worden opgegeven; het script rekent mm -> pixels zelf uit.

overzicht.json:
{
  "titel": "musicbrain-busboard rev 2.0 — aansluitoverzicht",
  "voetnoot": "H2..H5 = M3 · JP1 = CAN-terminator",
  "bbox_mm": [15, 10, 215, 125],          // Edge.Cuts x0 y0 x1 y1
  "render": {"w": 1600, "h": 1000, "zoom": 1.0},   // optioneel
  "callouts": [
     {"label": "Teensy 4.1", "mm": [37, 70], "kant": "links"},
     {"label": "slot 1..6",  "mm": [120, 52], "kant": "boven"},
     ...
  ]
}
kant: links | rechts | boven | onder — waar het label komt te staan;
labels per kant worden automatisch gespreid zodat ze niet overlappen.
"""
import base64
import json
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardlib import parse as sexpr_parse


def auto_spec(pcb_path):
    """Skelet-overzicht.json uit het bord zelf: bbox uit Edge.Cuts (gr_rect),
    titel uit het title_block, callouts = alle J*-connectors (label = ref +
    value, kant = dichtstbijzijnde rand)."""
    tree = sexpr_parse(open(pcb_path, encoding='utf-8').read())
    bbox = None
    titel = os.path.splitext(os.path.basename(pcb_path))[0]
    rev = ''
    for node in tree:
        if isinstance(node, list) and node[0] == 'gr_rect':
            lay = [s for s in node if isinstance(s, list) and s[0] == 'layer']
            if lay and lay[0][1].strip('"') == 'Edge.Cuts':
                st = next(s for s in node if isinstance(s, list) and s[0] == 'start')
                en = next(s for s in node if isinstance(s, list) and s[0] == 'end')
                bbox = [float(st[1]), float(st[2]), float(en[1]), float(en[2])]
        if isinstance(node, list) and node[0] == 'title_block':
            for s in node:
                if isinstance(s, list) and s[0] == 'rev':
                    rev = s[1].strip('"')
    if not bbox:
        raise SystemExit('geen Edge.Cuts gr_rect gevonden — geef zelf een json op')
    x0, y0, x1, y1 = min(bbox[0], bbox[2]), min(bbox[1], bbox[3]), \
        max(bbox[0], bbox[2]), max(bbox[1], bbox[3])
    callouts = []
    for node in tree:
        if not (isinstance(node, list) and node[0] == 'footprint'):
            continue
        ref = val = None
        fx = fy = rot = 0.0
        pads = []
        for sub in node:
            if isinstance(sub, list) and sub[0] == 'property':
                if sub[1] == '"Reference"':
                    ref = sub[2].strip('"')
                if sub[1] == '"Value"':
                    val = sub[2].strip('"')
            if isinstance(sub, list) and sub[0] == 'at':
                fx, fy = float(sub[1]), float(sub[2])
                rot = float(sub[3]) if len(sub) > 3 else 0.0
            if isinstance(sub, list) and sub[0] == 'pad':
                at = next(s for s in sub if isinstance(s, list) and s[0] == 'at')
                pads.append((float(at[1]), float(at[2])))
        if not ref or not re.fullmatch(r'J\d+', ref) or not pads:
            continue
        import math
        c = math.cos(math.radians(rot))
        s_ = math.sin(math.radians(rot))
        mx = sum(fx + px * c + py * s_ for px, py in pads) / len(pads)
        my = sum(fy - px * s_ + py * c for px, py in pads) / len(pads)
        afst = {'links': mx - x0, 'rechts': x1 - mx,
                'boven': my - y0, 'onder': y1 - my}
        kant = min(afst, key=afst.get)
        lbl = ref if not val or val == ref else f'{val} ({ref})'
        callouts.append({'label': lbl, 'mm': [round(mx, 1), round(my, 1)],
                         'kant': kant})
    return {'titel': f'{titel}' + (f' rev {rev}' if rev else '')
                     + ' — aansluitoverzicht',
            'bbox_mm': [x0, y0, x1, y1],
            'callouts': callouts}

FONT = 15          # px
PAD = 10           # px marge rond tekst
MARGE = 210        # px annotatiestrook per kant


def render_png(pcb, w, h, zoom, side='top'):
    fd, tmp = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    cmd = ['kicad-cli', 'pcb', 'render', '--side', side, '-w', str(w),
           '-h', str(h), '--quality', 'high', '--background', 'transparent',
           '-o', tmp, pcb]
    if zoom and abs(zoom - 1.0) > 1e-6:
        cmd[8:8] = ['--zoom', str(zoom)]
    subprocess.run(cmd, check=True, capture_output=True)
    return tmp


def board_pixels(img):
    """bounding box van het bord in de render (alles wat niet de
    achtergrondkleur is; achtergrond = kleur van pixel (1,1))."""
    px = img.load()
    bg = px[1, 1]
    W, H = img.size

    def rij_leeg(y):
        return all(abs(px[x, y][0] - bg[0]) + abs(px[x, y][1] - bg[1])
                   + abs(px[x, y][2] - bg[2]) < 24 for x in range(0, W, 4))

    def kol_leeg(x):
        return all(abs(px[x, y][0] - bg[0]) + abs(px[x, y][1] - bg[1])
                   + abs(px[x, y][2] - bg[2]) < 24 for y in range(0, H, 4))

    y0 = next(y for y in range(H) if not rij_leeg(y))
    y1 = next(y for y in range(H - 1, -1, -1) if not rij_leeg(y))
    x0 = next(x for x in range(W) if not kol_leeg(x))
    x1 = next(x for x in range(W - 1, -1, -1) if not kol_leeg(x))
    return x0, y0, x1, y1


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def main():
    pcb = sys.argv[1]
    basis = os.path.join(os.path.dirname(pcb),
                         os.path.splitext(os.path.basename(pcb))[0])
    if len(sys.argv) > 2 and sys.argv[2] == '--auto':
        # skelet-json schrijven als die nog niet bestaat, dan renderen
        jsonpad = basis + '-overzicht.json'
        if not os.path.exists(jsonpad):
            spec = auto_spec(pcb)
            json.dump(spec, open(jsonpad, 'w', encoding='utf-8'),
                      indent=1, ensure_ascii=False)
            print('json-skelet geschreven:', jsonpad)
        spec = json.load(open(jsonpad, encoding='utf-8'))
        uit = basis + '-overzicht.svg'
    else:
        spec = json.load(open(sys.argv[2], encoding='utf-8'))
        uit = sys.argv[3] if len(sys.argv) > 3 else basis + '-overzicht.svg'

    r = spec.get('render', {})
    png = render_png(pcb, r.get('w', 1600), r.get('h', 1000), r.get('zoom'))
    rgba = Image.open(png).convert('RGBA')
    wit = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    img = Image.alpha_composite(wit, rgba).convert('RGB')
    bx0, by0, bx1, by1 = board_pixels(img)
    # strak bijsnijden: bord + kleine marge
    RAND = 30
    cx0, cy0 = max(0, bx0 - RAND), max(0, by0 - RAND)
    img = img.crop((cx0, cy0, min(img.size[0], bx1 + RAND),
                    min(img.size[1], by1 + RAND)))
    bx0, by0, bx1, by1 = bx0 - cx0, by0 - cy0, bx1 - cx0, by1 - cy0
    mx0, my0, mx1, my1 = spec['bbox_mm']
    sx = (bx1 - bx0) / (mx1 - mx0)
    sy = (by1 - by0) / (my1 - my0)

    def mm2px(mx, my):
        return bx0 + (mx - mx0) * sx, by0 + (my - my0) * sy

    W, H = img.size
    TITEL_H = 56
    heeft = {k: any(c.get('kant', 'links') == k for c in spec['callouts'])
             for k in ('boven', 'onder')}
    TOP_H = 44 if heeft['boven'] else 0
    BOT_H = 44 if heeft['onder'] else 0
    VOET_H = 40 if spec.get('voetnoot') else 12
    IMG_Y = TITEL_H + TOP_H
    CW, CH = W + 2 * MARGE, H + TITEL_H + TOP_H + BOT_H + VOET_H

    import io
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    data = base64.b64encode(buf.getvalue()).decode()
    os.remove(png)

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CW}" height="{CH}" '
        f'viewBox="0 0 {CW} {CH}" font-family="sans-serif">',
        f'<rect width="{CW}" height="{CH}" fill="white"/>',
        f'<text x="{MARGE}" y="36" font-size="26" font-weight="bold">'
        f'{esc(spec["titel"])}</text>',
        f'<image x="{MARGE}" y="{IMG_Y}" width="{W}" height="{H}" '
        f'href="data:image/png;base64,{data}"/>',
    ]

    KLEUR = '#b45f04'
    groepen = {'links': [], 'rechts': [], 'boven': [], 'onder': []}
    for c in spec['callouts']:
        groepen[c.get('kant', 'links')].append(c)

    def lijn(x1, y1, x2, y2):
        out.append(f'<polyline points="{x1:.0f},{y1:.0f} {x2:.0f},{y2:.0f}" '
                   f'fill="none" stroke="{KLEUR}" stroke-width="1.6"/>')
        out.append(f'<circle cx="{x2:.0f}" cy="{y2:.0f}" r="3.5" '
                   f'fill="{KLEUR}"/>')

    def tekst(x, y, s, anchor):
        out.append(f'<text x="{x:.0f}" y="{y:.0f}" font-size="{FONT}" '
                   f'text-anchor="{anchor}">{esc(s)}</text>')

    # boven/onder: labels overlapvrij spreiden rond hun doel-x
    def spreid(cs):
        wens = [MARGE + mm2px(*c['mm'])[0] for c in cs]
        br = [len(c['label']) * FONT * 0.56 + 18 for c in cs]
        pos = list(wens)
        for _ in range(60):
            for i in range(len(pos) - 1):
                over = (pos[i] + br[i] / 2) - (pos[i + 1] - br[i + 1] / 2)
                if over > 0:
                    pos[i] -= over / 2
                    pos[i + 1] += over / 2
        return pos

    spreid_x = {}
    for kant, cs in groepen.items():
        if not cs:
            continue
        cs.sort(key=lambda c: c['mm'][1] if kant in ('links', 'rechts')
                else c['mm'][0])
        if kant in ('boven', 'onder'):
            spreid_x[kant] = spreid(cs)
        n = len(cs)
        for i, c in enumerate(cs):
            px, py = mm2px(*c['mm'])
            px += MARGE
            py += IMG_Y
            if kant in ('links', 'rechts'):
                # labels gelijkmatig over de bordhoogte spreiden
                ly = IMG_Y + by0 + (by1 - by0) * (i + 0.5) / n
                if kant == 'links':
                    lx = MARGE - PAD
                    lijn(lx + 4, ly - 5, px, py)
                    tekst(lx, ly, c['label'], 'end')
                else:
                    lx = MARGE + W + PAD
                    lijn(lx - 4, ly - 5, px, py)
                    tekst(lx, ly, c['label'], 'start')
            else:
                lx = spreid_x[kant][i]
                if kant == 'boven':
                    ly = IMG_Y - PAD          # in de witte bovenstrook
                    lijn(lx, ly + 5, px, py)
                    tekst(lx, ly, c['label'], 'middle')
                else:
                    ly = IMG_Y + H + PAD + FONT   # in de witte onderstrook
                    lijn(lx, ly - FONT - 3, px, py)
                    tekst(lx, ly, c['label'], 'middle')

    if spec.get('voetnoot'):
        out.append(f'<text x="{MARGE}" y="{CH - 14}" font-size="{FONT - 1}" '
                   f'fill="#456">{esc(spec["voetnoot"])}</text>')
    out.append('</svg>')
    open(uit, 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
    print('geschreven:', uit)


if __name__ == '__main__':
    main()
