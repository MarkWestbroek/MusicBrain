"""Koppel het product en maak/ververs een release (stap 3+4 van de ingest-keten).

    python publish_release.py <base> <token>

publish_board.py post componenten + board-specs (stap 1+2), maar de site
toont wat de RELEASE vastpint - zonder deze stap verschijnt er niets
nieuws (les 2026-07-16). Pas PINS/versie hieronder aan per release.
"""
import json
import sys

import requests

base, token = sys.argv[1], sys.argv[2]
H = {'Authorization': f'Bearer {token}'}

PINS = [('busboard', 'v3.0'), ('adc8', 'v2.0'), ('dac8', 'v2.0'),
        ('gate8', 'v2.0'), ('gatein8', 'v2.0'), ('jack8', 'v2.0'),
        ('jack4', 'v2.0'), ('riser', 'v2.0'), ('potriser', 'v2.0'),
        ('i2criser', 'v2.0'), ('pot8front', 'v1.1'), ('enc5front', 'v2.0'),
        ('ad5754r-breakout', 'v1.0')]

# 1) product: busboard-v2 -> busboard (read-modify-post)
p = requests.get(f'{base}/api/content/products').json()
prod = next(x for x in p if x.get('slug') == 'cortex')
comps = [c for c in (prod.get('components') or []) if c != 'busboard-v2']
if 'busboard' not in comps:
    comps.append('busboard')
prod['components'] = comps
r1 = requests.post(f'{base}/api/content/product/cortex', headers=H, json=prod)
print('product:', r1.status_code, r1.text[:150])
assert r1.status_code < 300

# 2) release cortex-v0.2
rel = {
    'project': 'cortex', 'version': 'v0.2', 'date': '2026-07-16',
    'channel': 'stable', 'product': 'cortex',
    'components': [{'component': c, 'version': v} for c, v in PINS],
    'highlights': [
        'Gen 2: slots 2x12 met audio-lijnen (MCLK/BCLK/LRCLK + I2S-data per slot)',
        'Busboard rev 3.0: 40 HP, slots gecentreerd op 4 HP-steek, MIDI 2x2, USB-host, J24-audiohub',
        'Kaarten H=45 en op maat (40-65 mm breed); jack8 past nu tussen de rails',
    ],
    'body': '',
}
r2 = requests.post(f'{base}/api/content/release/cortex-v0.2', headers=H, json=rel)
print('release:', r2.status_code, r2.text[:200])
assert r2.status_code < 300
body = r2.json() if r2.text.strip().startswith('{') else {}
assert not body.get('error'), body
print('RELEASE cortex-v0.2 staat op', base)
