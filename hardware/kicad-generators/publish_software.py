"""Publiceer een software-component (bv. de editor) naar de Imprint-site.

    python publish_software.py --component editor-reflex --version v0.2.0 \
        --name "Reflex editor" --doc ../../editor/site/reflex.md \
        --desc ../../editor/site/reflex.beschrijving.txt \
        --hero <hero.png> --overview <tweede.png> \
        [--base ...] [--token ...] [--dry]

Zelfde keten als publish_board.py (component + board-spec-ingest), maar
zonder bordbestand: connectors/points blijven leeg en de assets zijn
screenshots — renderTop = hero-afbeelding, overview = tweede afbeelding.
Staat hier (en niet in editor/) omdat alle site-publicatietooling en het
.env met tokens hier leven; zie doc/site-publicatie-werkwijze.md.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests


def doc_sections(md_path):
    """## headings -> [{heading, markdown}]; intro vóór het eerste ## wordt
    'Overview' (zelfde vorm als publish_board.readme_sections, EN-kop)."""
    txt = open(md_path, encoding='utf-8').read()
    parts = re.split(r'(?m)^## +', txt)
    secs = []
    intro_body = re.sub(r'(?m)^#[^#].*\n', '', parts[0]).strip()
    if intro_body:
        secs.append({'heading': 'Overview', 'markdown': intro_body})
    for p in parts[1:]:
        nl = p.find('\n')
        heading = p[:nl].strip()
        body = p[nl + 1:].strip()
        if body:
            secs.append({'heading': heading, 'markdown': body})
    return secs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--component', required=True)
    ap.add_argument('--version', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--doc', required=True, help='markdown met ## secties')
    ap.add_argument('--desc', help='beschrijving.txt (component-description)')
    ap.add_argument('--hero', required=True, help='hoofd-screenshot (renderTop)')
    ap.add_argument('--overview', help='tweede screenshot (overview)')
    ap.add_argument('--base', default=os.environ.get('IMPRINT_BASE', 'http://localhost:3000'))
    ap.add_argument('--token', default=os.environ.get('INGEST_TOKEN', 'test-ingest-token-123'))
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    slug = f'{a.component}@{a.version}'
    H = {'Authorization': f'Bearer {a.token}'}

    ext = os.path.splitext(a.hero)[1].lower() or '.png'
    files = {f'render-top{ext}': a.hero}
    if a.overview:
        oext = os.path.splitext(a.overview)[1].lower() or '.png'
        files[f'overview{oext}'] = a.overview
    doc = {
        'slug': slug,
        'component': a.component,
        'version': a.version,
        'kind': 'software',   # FR doc/imprint-fr-component-kind.md; default = board
        'connectors': [],
        'assets': {'renderTop': f'render-top{ext}',
                   'overview': f'overview{oext}' if a.overview else None,
                   'pinouts': {}},
        'points': [],
        'sections': doc_sections(a.doc),
    }

    if a.dry:
        print(json.dumps(doc, indent=1, ensure_ascii=False))
        print(f'\n[{len(files)} assets] — dry-run, niets gepost')
        return

    # 1) component (read-modify-post; bestand in git wint van de site)
    cur = requests.get(f'{a.base}/api/content/components/{a.component}')
    comp = cur.json() if cur.status_code == 200 and cur.text.strip() not in ('', 'null') else {}
    if not isinstance(comp, dict):
        comp = {}
    comp.setdefault('slug', a.component)
    comp['name'] = a.name
    comp['kind'] = 'software'   # FR doc/imprint-fr-component-kind.md
    if a.desc and os.path.exists(a.desc):
        comp['description'] = open(a.desc, encoding='utf-8').read().strip()
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

    # 2) spec-ingest (zelfde endpoint als borden)
    CT = {'.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml',
          '.webp': 'image/webp'}
    multipart = [('doc', (None, json.dumps(doc, ensure_ascii=False), 'application/json'))]
    for i, (fn, path) in enumerate(files.items()):
        ct = CT.get(os.path.splitext(fn)[1], 'application/octet-stream')
        multipart.append((f'f{i}', (fn, open(path, 'rb').read(), ct)))
    r2 = requests.post(f'{a.base}/api/ingest/board-spec', headers=H, files=multipart)
    print('board-spec:', r2.status_code, r2.text[:400])
    if r2.status_code >= 300:
        sys.exit('board-spec-post faalde')
    print('GEPUBLICEERD:', slug)


if __name__ == '__main__':
    main()
