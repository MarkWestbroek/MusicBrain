"""Release-recept voor het Reflex-product (zie publish_release.py voor uitleg).

    python publish_release_reflex.py <base> <token> [--withdraw <release-slug>]

Zelfde keten als publish_release.py maar met het Reflex-recept; het
cortex-script blijft het cortex-recept. Borden komen uit de Reflex-chat
(gswitch-*); de editor-pin (editor-reflex) is van 2026-07-17.
"""
import argparse

import requests

# ---- het release-recept ----------------------------------------------------
PROJECT = 'reflex'
VERSIE = 'v0.1'
DATUM = '2026-07-14'
KANAAL = 'beta'
PINS = [('gswitch-brain', 'v0.1'), ('gswitch-loop8', 'v0.1'),
        ('editor-reflex', 'v0.2.0')]   # software x.y.z
HIGHLIGHTS = [
    'Eerste gitaar-effectswitcher (brain + loop8)',
    'Reflex editor 0.2.0: chain-editor + end-to-end MIDI-simulatie in de browser',
]
# -----------------------------------------------------------------------------

ap = argparse.ArgumentParser()
ap.add_argument('base')
ap.add_argument('token')
ap.add_argument('--withdraw', help='release-slug om eerst terug te trekken (tombstone)')
a = ap.parse_args()
H = {'Authorization': f'Bearer {a.token}'}


def check(naam, r):
    print(f'{naam}: {r.status_code} {r.text[:200]}')
    assert r.status_code < 300, f'{naam} faalde'
    body = r.json() if r.text.strip().startswith('{') else {}
    assert not body.get('error'), body
    return body


if a.withdraw:
    r = requests.delete(f'{a.base}/api/content/release/{a.withdraw}', headers=H)
    print(f'withdraw {a.withdraw}: {r.status_code} {r.text[:150]}')
    assert r.status_code in (200, 404), 'terugtrekken faalde'

# 1) product koppelen: de productpagina toont product.components, dus de
# editor moet daar ook in (de bord-slugs zet de Reflex-bordenflow er al in)
p = requests.get(f'{a.base}/api/content/products').json()
prod = next(x for x in p if x.get('slug') == PROJECT)
comps = prod.get('components') or []
if 'editor-reflex' not in comps:
    comps.append('editor-reflex')
    prod['components'] = comps
    check('product', requests.post(f'{a.base}/api/content/product/{PROJECT}',
                                   headers=H, json=prod))

# 2) release (read-modify: bestaande velden zoals downloads/body behouden)
cur = requests.get(f'{a.base}/api/content/releases').json()
rel = next((x for x in cur if x.get('project') == PROJECT
            and x.get('version') == VERSIE), {})
rel.update({
    'project': PROJECT, 'version': VERSIE, 'date': DATUM, 'channel': KANAAL,
    'product': PROJECT,
    'components': [{'component': c, 'version': v} for c, v in PINS],
    'highlights': HIGHLIGHTS,
})
rel.setdefault('body', '')
check('release', requests.post(f'{a.base}/api/content/release/{PROJECT}-{VERSIE}',
                               headers=H, json=rel))
print(f'RELEASE {PROJECT}-{VERSIE} staat op {a.base}'
      + (f' ({a.withdraw} teruggetrokken)' if a.withdraw else ''))
