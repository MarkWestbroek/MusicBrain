"""Exporteer een bord als Imprint 'board'-widget-config: een 3D-render +
hotspots met relatieve (0..1) coördinaten en per connector een pin-tabel als
hover-markdown. Sluit aan op het widget-contract in Imprint
(sites/musicbrain/src/widgets/registry.ts -> BoardConfig).

    python widget_export.py <bord.kicad_pcb> [--public <dir>] [--out <json>]

- Render (transparant, bijgesneden) landt als PNG in <public>/boards/.
- Callouts komen uit <bord>-overzicht.json (board_overview.py --auto); elke
  callout-mm wordt naar een relatieve positie op de PNG gerekend.
- markdown per punt = label + pin->net-tabel (uit het bordbestand gelezen,
  dus altijd in sync). Config-json landt naast het bord (of --out).
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from pinout_svg import lees_connector

RENDER_W, RENDER_H = 1600, 1000
RAND = 24          # px marge rond het bord bij bijsnijden


def render_transparant(pcb):
    fd, tmp = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    subprocess.run(['kicad-cli', 'pcb', 'render', '--side', 'top',
                    '-w', str(RENDER_W), '-h', str(RENDER_H), '--quality', 'high',
                    '--background', 'transparent', '-o', tmp, pcb],
                   check=True, capture_output=True)
    return tmp


def board_bbox_alpha(img):
    """bounding box van niet-transparante pixels (het bord)."""
    a = img.split()[-1]
    return a.getbbox()   # (x0, y0, x1, y1)


def pin_tabel_md(pcb, ref):
    try:
        _fp, val, pads = lees_connector(pcb, ref)
    except SystemExit:
        return ''
    if len(pads) < 2:
        return ''
    rijen = ['| pin | net |', '|--|--|']
    for num, _x, _y, net in sorted(pads, key=lambda p: int(p[0]) if p[0].isdigit() else 0):
        rijen.append(f'| {num} | {(net or "—").lstrip("/")} |')
    return '\n'.join(rijen)


def main():
    pcb = sys.argv[1]
    args = sys.argv[2:]
    public = args[args.index('--public') + 1] if '--public' in args else \
        r'D:\Git\Web\Imprint-engine\sites\musicbrain\public'
    base = os.path.splitext(os.path.basename(pcb))[0]
    outjson = args[args.index('--out') + 1] if '--out' in args else \
        os.path.join(os.path.dirname(pcb), f'{base}-widget.json')

    ovj = os.path.join(os.path.dirname(pcb), f'{base}-overzicht.json')
    if not os.path.exists(ovj):
        raise SystemExit(f'geen {base}-overzicht.json — draai eerst '
                         f'board_overview.py <pcb> --auto')
    spec = json.load(open(ovj, encoding='utf-8'))
    mx0, my0, mx1, my1 = spec['bbox_mm']

    png = render_transparant(pcb)
    img = Image.open(png).convert('RGBA')
    os.remove(png)
    bb = board_bbox_alpha(img)
    x0, y0, x1, y1 = max(0, bb[0] - RAND), max(0, bb[1] - RAND), \
        min(img.size[0], bb[2] + RAND), min(img.size[1], bb[3] + RAND)
    img = img.crop((x0, y0, x1, y1))
    W, H = img.size
    # bord-bbox binnen de bijgesneden afbeelding
    bx0, by0 = bb[0] - x0, bb[1] - y0
    bx1, by1 = bb[2] - x0, bb[3] - y0
    sx = (bx1 - bx0) / (mx1 - mx0)
    sy = (by1 - by0) / (my1 - my0)

    boards_dir = os.path.join(public, 'boards')
    os.makedirs(boards_dir, exist_ok=True)
    imgname = f'{base}.png'
    img.save(os.path.join(boards_dir, imgname))

    points = []
    for c in spec['callouts']:
        cmx, cmy = c['mm']
        px = bx0 + (cmx - mx0) * sx
        py = by0 + (cmy - my0) * sy
        # label staat al als kop in de tooltip; markdown = alleen de pin-tabel
        m = re.search(r'\bJ\d+\b', c['label'])
        md = pin_tabel_md(pcb, m.group(0)) if m else ''
        points.append({'x': round(px / W, 4), 'y': round(py / H, 4),
                       'label': c['label'], 'markdown': md})

    cfg = {'title': spec.get('titel', base),
           'image': f'/boards/{imgname}',
           'alt': f'3D-render van {base}',
           'points': points}
    buf = io.StringIO()
    json.dump(cfg, buf, indent=1, ensure_ascii=False)
    open(outjson, 'w', encoding='utf-8', newline='\n').write(buf.getvalue())
    print('PNG :', os.path.join(boards_dir, imgname))
    print('JSON:', outjson, f'({len(points)} hotspots)')


if __name__ == '__main__':
    main()
