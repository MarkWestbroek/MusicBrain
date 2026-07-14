"""Publiceer een bord als board-spec naar de Imprint-site (ingest-API).

    python publish_board.py <bord.kicad_pcb> --component <slug> --version <vX.Y>
        [--base http://localhost:3000] [--token <INGEST_TOKEN>] [--dry]

Doet, in de door de ingest-gids voorgeschreven volgorde:
  1) POST /api/content/component/<slug>   (read-modify-post; behoudt bestaande velden)
  2) POST /api/ingest/board-spec          (multipart: doc-JSON + assets)

Connector-data (D2) komt uit het .kicad_pcb via pinout_svg.lees_connector();
assets = de al gegenereerde render + aansluitoverzicht + pinout-SVG's.
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests
from PIL import Image
from pinout_svg import lees_connector

RAND = 24   # px marge bij bijsnijden — MOET gelijk zijn aan widget_export.RAND,
            # anders matchen de point-x/y uit de widget-json niet met deze render


def render_top(pcb):
    """Render transparant en snijd bij tot bord+RAND (identiek aan
    widget_export), zodat de hotspot-x/y uit de widget-json kloppen."""
    fd, tmp = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    subprocess.run(['kicad-cli', 'pcb', 'render', '--side', 'top', '-w', '1600',
                    '-h', '1000', '--quality', 'high', '--background', 'transparent',
                    '-o', tmp, pcb], check=True, capture_output=True)
    img = Image.open(tmp).convert('RGBA')
    os.remove(tmp)
    bb = img.split()[-1].getbbox()
    img = img.crop((max(0, bb[0] - RAND), max(0, bb[1] - RAND),
                    min(img.size[0], bb[2] + RAND), min(img.size[1], bb[3] + RAND)))
    fd, out = tempfile.mkstemp(suffix='.png')
    os.close(fd)
    img.save(out)
    return out


def widget_points(widget_json, pinouts):
    """Zet de hotspots uit de widget-json om naar board-spec-points:
    connector-punten linken hun pinout-SVG (D10), de rest houdt z'n label."""
    if not os.path.exists(widget_json):
        return []
    pts = json.load(open(widget_json, encoding='utf-8')).get('points', [])
    out = []
    for p in pts:
        pt = {'x': p['x'], 'y': p['y']}
        if p.get('label'):
            pt['label'] = p['label']
        m = re.search(r'\bJ\d+\b', p.get('label', ''))
        if m and m.group(0) in pinouts:
            pt['connector'] = m.group(0)   # site linkt assets.pinouts[ref]
        elif p.get('label'):
            pt['markdown'] = f'**{p["label"]}**'
        out.append(pt)
    return out


def connectors(pcb, refs, labels):
    out = []
    for ref in refs:
        try:
            _fp, val, pads = lees_connector(pcb, ref)
        except SystemExit:
            continue
        if len(pads) < 2:
            continue
        xs = {round(p[1], 2) for p in pads}
        ys = {round(p[2], 2) for p in pads}
        # schema: 1 of 2 (enkel- of dubbelrijige header). Alles met >=2 op de
        # korte as telt als dubbelrij; een 1D-rij als enkelrij.
        rows = 1 if min(len(xs), len(ys)) <= 1 else 2
        pins = [{'pin': n, 'net': (net or '').lstrip('/')}
                for n, _x, _y, net in sorted(pads, key=lambda p: int(p[0]) if p[0].isdigit() else 0)]
        out.append({'ref': ref, 'label': labels.get(ref, val), 'rows': rows, 'pins': pins})
    return out


def readme_sections(readme_path):
    """## headings -> [{heading, markdown}]; sla de Aansluitoverzicht-sectie
    over (de board-spec rendert die zelf) en de titel-regel."""
    if not os.path.exists(readme_path):
        return []
    txt = open(readme_path, encoding='utf-8').read()
    parts = re.split(r'(?m)^## +', txt)
    secs = []
    intro = parts[0]
    # intro = alles vóór het eerste ##; pak de eerste alinea's (na de #-titel)
    intro_body = re.sub(r'(?m)^#[^#].*\n', '', intro).strip()
    if intro_body:
        secs.append({'heading': 'Overzicht', 'markdown': intro_body})
    for p in parts[1:]:
        nl = p.find('\n')
        heading = p[:nl].strip()
        body = p[nl + 1:].strip()
        if heading.lower().startswith('aansluitoverzicht'):
            continue
        if body:
            secs.append({'heading': heading, 'markdown': body})
    return secs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pcb')
    ap.add_argument('--component', required=True)
    ap.add_argument('--version', required=True)
    ap.add_argument('--name')
    ap.add_argument('--base', default=os.environ.get('IMPRINT_BASE', 'http://localhost:3000'))
    ap.add_argument('--token', default=os.environ.get('INGEST_TOKEN', 'test-ingest-token-123'))
    ap.add_argument('--dry', action='store_true', help='alleen doc tonen, niet posten')
    a = ap.parse_args()

    pcb = a.pcb
    d = os.path.dirname(pcb)
    base_name = os.path.splitext(os.path.basename(pcb))[0]
    slug = f'{a.component}@{a.version}'
    H = {'Authorization': f'Bearer {a.token}'}

    # labels + bbox uit het overzicht-json (rijkere labels dan de footprint-Value)
    labels = {}
    ovj = os.path.join(d, f'{base_name}-overzicht.json')
    if os.path.exists(ovj):
        for c in json.load(open(ovj, encoding='utf-8'))['callouts']:
            m = re.search(r'\bJ\d+\b', c['label'])
            if m:
                labels[m.group(0)] = c['label']

    # connectors uit het bord
    from cardlib import parse
    tree = parse(open(pcb, encoding='utf-8').read())
    refs = []
    for node in tree:
        if isinstance(node, list) and node[0] == 'footprint':
            for sub in node:
                if isinstance(sub, list) and sub[0] == 'property' and sub[1] == '"Reference"':
                    r = sub[2].strip('"')
                    if re.fullmatch(r'J\d+', r):
                        refs.append(r)
    refs.sort(key=lambda r: int(r[1:]))
    conns = connectors(pcb, refs, labels)

    # assets: render + overzicht + pinouts (bestandsnamen zoals in doc.assets)
    files = {}   # bestandsnaam -> pad
    rt = render_top(pcb)
    files['render-top.png'] = rt
    ov = os.path.join(d, f'{base_name}-overzicht.svg')
    if os.path.exists(ov):
        files['overview.svg'] = ov
    pinouts = {}
    pdir = os.path.join(d, 'pinouts')
    for c in conns:
        p = os.path.join(pdir, f'{c["ref"]}.svg')
        if os.path.exists(p):
            fn = f'pinout-{c["ref"]}.svg'
            files[fn] = p
            pinouts[c['ref']] = fn

    points = widget_points(os.path.join(d, f'{base_name}-widget.json'), pinouts)
    doc = {
        'slug': slug,
        'component': a.component,
        'version': a.version,
        'connectors': conns,
        'assets': {'renderTop': 'render-top.png',
                   'overview': 'overview.svg' if 'overview.svg' in files else None,
                   'pinouts': pinouts},
        'points': points,
        'sections': readme_sections(os.path.join(d, 'README.md')),
    }

    if a.dry:
        print(json.dumps(doc.get('points', []), indent=1, ensure_ascii=False))
        print(f'\n[{len(files)} assets, {len(conns)} connectors, {len(points)} points]'
              ' — dry-run, niets gepost')
        os.remove(rt)
        return

    # 1) component (read-modify-post: behoud bestaande velden)
    cur = requests.get(f'{a.base}/api/content/components/{a.component}')
    comp = cur.json() if cur.status_code == 200 and cur.text.strip() not in ('', 'null') else {}
    if not isinstance(comp, dict):
        comp = {}
    comp.setdefault('slug', a.component)
    comp.setdefault('name', a.name or a.component)
    comp.setdefault('description', '')
    comp.setdefault('children', [])
    versions = comp.get('versions') or []
    if not any(v.get('number') == a.version for v in versions):
        versions.append({'number': a.version, 'spec': slug})
    else:
        for v in versions:
            if v.get('number') == a.version:
                v['spec'] = slug
    comp['versions'] = versions
    r1 = requests.post(f'{a.base}/api/content/component/{a.component}', headers=H, json=comp)
    print('component:', r1.status_code, r1.text[:200])
    if r1.status_code >= 300:
        sys.exit('component-post faalde')

    # 2) board-spec multipart
    multipart = [('doc', (None, json.dumps(doc, ensure_ascii=False), 'application/json'))]
    for i, (fn, path) in enumerate(files.items()):
        ct = 'image/png' if fn.endswith('.png') else 'image/svg+xml'
        multipart.append((f'f{i}', (fn, open(path, 'rb').read(), ct)))
    r2 = requests.post(f'{a.base}/api/ingest/board-spec', headers=H, files=multipart)
    print('board-spec:', r2.status_code, r2.text[:400])
    os.remove(rt)
    if r2.status_code >= 300:
        sys.exit('board-spec-post faalde')
    print('GEPUBLICEERD:', slug)


if __name__ == '__main__':
    main()
