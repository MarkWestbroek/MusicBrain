"""Zet een firmwareversie op de releasepagina van de site (musicbrain.nl/releases).

    python tools/site_release_item.py 0.5.108            # tonen wat het zou posten
    python tools/site_release_item.py 0.5.108 --post     # posten (IMPRINT_BASE, INGEST_TOKEN)

Draait in de workflow firmware-release.yml na de GitHub-release, zodat de site
bij elke tag fw-X.Y.Z vanzelf meekomt (de releasepagina leest niet zelf van
GitHub; 2026-10-12 stond hij nog op 0.5.78). Een item dat er al staat wordt
niet overschreven (dat kan met de hand verfijnd zijn), tenzij --force.

De site is Engels, de release-log Nederlands. Engelse regels komen uit de
release-log: onder een firmwarekop (die "fw X.Y.Z" noemt) een commentaar

    <!-- EN: Our own Moog-style ladder filter replaces the library one -->

Elke EN-regel wordt een highlight. Zonder EN-regels alleen de standaardtekst
met een verwijzing naar de Nederlandse notes op GitHub.
"""
import argparse
import datetime
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GH = 'https://github.com/MarkWestbroek/MusicBrain'


def highlights(version):
    """EN-regels onder de koppen van de release-log die deze versie noemen."""
    log = open(os.path.join(ROOT, 'doc', 'RELEASE-LOG.md'), encoding='utf-8').read()
    kop = re.compile(rf'^### .*\bfw {re.escape(version)}(?!\d)', re.M)
    out = []
    for blok in re.split(r'(?m)^(?=### )', log):
        if kop.match(blok):
            out += [m.strip() for m in re.findall(r'<!--\s*EN:\s*(.*?)\s*-->', blok)]
    return out


def module_count():
    p = os.path.join(ROOT, 'firmware', 'app-modular-brain', 'contract', 'module-types.json')
    return len(json.load(open(p, encoding='utf-8'))['modules'])


def item(version):
    hl = highlights(version) + [f'{module_count()} modules in the firmware/editor contract']
    return {
        'project': 'firmware', 'version': version,
        # UTC: een datum in de toekomst toont Imprint nog niet
        'date': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
        'channel': 'stable', 'access': 'public', 'product': 'cortex', 'components': [],
        'highlights': hl,
        'body': (f'Firmware for **Teensy 4.1 with PSRAM**. Flash `mmb-fw-{version}.hex` with '
                 '[PJRC Teensy Loader](https://www.pjrc.com/teensy/loader.html), or from the editor '
                 '(**Teensy → Firmware**). Full release notes (NL) on GitHub.'),
        'sourceUrl': f'{GH}/releases/tag/fw-{version}',
        'downloads': [{'label': f'mmb-fw-{version}.hex',
                       'url': f'{GH}/releases/download/fw-{version}/mmb-fw-{version}.hex'}],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('version')
    ap.add_argument('--post', action='store_true')
    ap.add_argument('--force', action='store_true', help='ook een bestaand item overschrijven')
    a = ap.parse_args()
    rel = item(a.version)
    print(json.dumps(rel, indent=1, ensure_ascii=False))
    if not a.post:
        return
    base = os.environ.get('IMPRINT_BASE', 'https://musicbrain.nl').rstrip('/')
    token = os.environ.get('INGEST_TOKEN', '')
    if not token:
        print('Geen INGEST_TOKEN: niets gepost.')
        return
    with urllib.request.urlopen(f'{base}/api/content/releases') as r:
        bestaand = json.loads(r.read().decode('utf-8'))
    if not a.force and any(x.get('project') == 'firmware' and x.get('version') == a.version for x in bestaand):
        print(f'firmware {a.version} staat al op {base}: niet overschreven (--force om wel).')
        return
    req = urllib.request.Request(
        f'{base}/api/content/release/firmware-{a.version}', method='POST',
        data=json.dumps(rel).encode('utf-8'),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        print(f'{r.status} {r.read().decode("utf-8")[:200]}')


if __name__ == '__main__':
    sys.exit(main())
