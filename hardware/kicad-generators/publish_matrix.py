"""Publiceer de patchmatrix (beide plaatsingsvarianten) naar een Imprint-site.

    python publish_matrix.py [base] [token]

    lokaal:  python publish_matrix.py http://localhost:3000 test-ingest-token-123
    live:    python publish_matrix.py https://musicbrain.nl

Token/base zonder argument: uit `.env` naast dit script (GITIGNORED —
INGEST_TOKEN + IMPRINT_BASE; zelfde conventie als publish_product.mjs).

Doet de keten uit de ingest-gids voor component `matrix`:
  1+2) publish_board.py voor v0.2 (edge, musicbrain-matrix) en v0.3c
       (center, musicbrain-matrix-c) — component + board-spec + assets;
  3)   product-koppeling: voegt `matrix` toe aan cortex.components.
Idempotent (bitemporaal): opnieuw draaien overschrijft geen historie.
Vereist dat de assets al gegenereerd zijn (overzicht/pinouts/widget-json —
zie WERKWIJZE 'Documentatie-graphics'); 2026-07-21 is dat gebeurd.
"""
import os
import subprocess
import sys

import requests

_envp = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_envp):
    for _ln in open(_envp, encoding='utf-8'):
        _ln = _ln.strip()
        if _ln and not _ln.startswith('#') and '=' in _ln:
            _k, _v = _ln.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip())

base = sys.argv[1] if len(sys.argv) > 1 else \
    os.environ.get('IMPRINT_BASE') or 'http://localhost:3000'
token = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('INGEST_TOKEN')
assert token, 'geen token: geef als argument of zet INGEST_TOKEN in .env'
HERE = os.path.dirname(os.path.abspath(__file__))
SCH = os.path.join(HERE, '..', 'schematics')

for pcb, ver, extra in (
        (os.path.join(SCH, 'musicbrain-matrix', 'musicbrain-matrix.kicad_pcb'),
         'v0.2', ['--name', 'Matrix']),
        (os.path.join(SCH, 'musicbrain-matrix-c', 'musicbrain-matrix-c.kicad_pcb'),
         'v0.3c', [])):
    r = subprocess.run([sys.executable, os.path.join(HERE, 'publish_board.py'),
                        pcb, '--component', 'matrix', '--version', ver,
                        '--base', base, '--token', token] + extra)
    assert r.returncode == 0, f'publish_board {ver} faalde'

H = {'Authorization': f'Bearer {token}'}
p = requests.get(f'{base}/api/content/products').json()
prod = next(x for x in p if x.get('slug') == 'cortex')
comps = prod.get('components') or []
if 'matrix' not in comps:
    comps.append('matrix')
    prod['components'] = comps
    r = requests.post(f'{base}/api/content/product/cortex', headers=H, json=prod)
    print('product-koppeling:', r.status_code, r.text[:120])
    assert r.status_code < 300
else:
    print('matrix stond al in cortex.components')
print(f'KLAAR: matrix v0.2 + v0.3c op {base}')
