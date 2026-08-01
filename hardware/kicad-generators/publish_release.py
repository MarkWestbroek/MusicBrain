"""Koppel het product en maak/ververs een release (stap 3+4 van de ingest-keten).

    python publish_release.py <base> <token> [--withdraw <release-slug>]

publish_board.py post componenten + board-specs (stap 1+2), maar de site-
releasepagina toont wat de RELEASE vastpint - zonder deze stap hangt een
nieuwe versie nergens (les 2026-07-16; de ingest-response meldt dit sinds
de pinned_by-update ook zelf).

--withdraw trekt eerst een verkeerd gepost release-item terug (bitemporale
tombstone, ingest-gids par. 6: hernoemen bestaat niet - terugtrekken en
opnieuw posten onder de juiste slug). Historie blijft; herstel kan via de
admin (History -> Restore).

Pas RELEASE/PINS hieronder aan per release; dit bestand in git ís daarmee
het release-recept.
"""
import argparse

import requests

# ---- het release-recept ----------------------------------------------------
PROJECT = 'cortex'
VERSIE = 'v0.3'          # gen 2 (2026-07-16); de hardware-set-reeks volgt
                         # modular-mb@v0.2 (gen 1) - zelfde reeks als tag hw/v0.3
DATUM = '2026-07-16'
KANAAL = 'stable'
PINS = [('busboard', 'v3.1'), ('adc8', 'v2.0'), ('dac8', 'v2.0'),
        ('gate8', 'v2.0'), ('gatein8', 'v2.0'), ('jack8', 'v2.0'),
        ('jack4', 'v2.0'), ('riser', 'v2.0'), ('potriser', 'v2.0'),
        ('i2criser', 'v2.0'), ('pot8front', 'v1.1'), ('enc5front', 'v2.0'),
        ('ad5754r-breakout', 'v1.0'),
        ('matrix', 'v0.3c'),            # poly-analog patchmatrix (center-variant)
        ('vcf8kern', 'v0.1'),           # poly-analog 8x multimode VCF-kernkaart
        ('editor-cortex', 'v0.5.48'),   # software x.y.z; volgt fw-contract
        ('fpga-voice', 'v0.3.0')]       # FPGA-instrument (MS20_synth_voice-repo, tag 0.3-wavetable)
HIGHLIGHTS = [
    'Gen 2: slots 2x12 met audio-lijnen (MCLK/BCLK/LRCLK + I2S-data per slot)',
    'Busboard rev 3.1: 40 HP, slots gecentreerd op 4 HP-steek, MIDI 2x2, USB-host, J24-audiohub, J25 Axon-voeding',
    'Kaarten H=45 en op maat (40-65 mm breed); jack8 past nu tussen de rails',
    'Cortex editor 0.5.48: browser-patcher + polyfone simulatie, contract-gekoppeld aan fw 0.5.48',
    'FPGA voice 0.3.0: 8-stemmige Karplus-Strong + MS-20-filter (Tang Primer 20K) als SPI-instrument aan de CV/gate-bus',
]
PRODUCT_COMPONENTS_WEG = ['busboard-v2']   # uit product.components (vervangen)
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


# 0) optioneel: verkeerd item terugtrekken
if a.withdraw:
    r = requests.delete(f'{a.base}/api/content/release/{a.withdraw}', headers=H)
    print(f'withdraw {a.withdraw}: {r.status_code} {r.text[:150]}')
    assert r.status_code in (200, 404), 'terugtrekken faalde'

# 1) product koppelen (read-modify-post). De productpagina toont
# product.components; de release pint alleen de versies - een component die
# hier ontbreekt is dus onzichtbaar op de productpagina (les 2026-07-17).
p = requests.get(f'{a.base}/api/content/products').json()
prod = next(x for x in p if x.get('slug') == PROJECT)
comps = [c for c in (prod.get('components') or []) if c not in PRODUCT_COMPONENTS_WEG]
for c, _v in PINS:
    if c in ('busboard', 'editor-cortex', 'vcf8kern') and c not in comps:
        comps.append(c)
prod['components'] = comps
check('product', requests.post(f'{a.base}/api/content/product/{PROJECT}',
                               headers=H, json=prod))

# 2) release
rel = {
    'project': PROJECT, 'version': VERSIE, 'date': DATUM, 'channel': KANAAL,
    'product': PROJECT,
    'components': [{'component': c, 'version': v} for c, v in PINS],
    'highlights': HIGHLIGHTS, 'body': '',
}
check('release', requests.post(f'{a.base}/api/content/release/{PROJECT}-{VERSIE}',
                               headers=H, json=rel))
print(f'RELEASE {PROJECT}-{VERSIE} staat op {a.base}'
      + (f' ({a.withdraw} teruggetrokken)' if a.withdraw else ''))
