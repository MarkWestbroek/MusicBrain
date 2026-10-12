"""Publiceer de software-modulepagina's naar de site (doc/plans/software-modules-op-de-site.md).

    python publish_modules.py <base> <token> [--version v0.5.107] [sw-ladder sw-tube …] [--dry]

Eerst de pagina's maken (editor: `npx tsx scripts/moduleSite.ts <typen>`),
dan dit: per map editor/site/modules/sw-*/ één component (kind software) met
module.md, beschrijving.txt en panel.svg, via publish_software.py, met familie
en tags uit site-modules.json (de familienaam letterlijk zoals in de lijst
van Imprint, anders komt hij als losse groep achteraan op /modules). Zonder
slugs: alle mappen. Naam uit site-modules.json. Versie = de firmware waarop
de tekst en de metingen kloppen (standaard: FW_VERSION uit FwVersion.h).
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MODS = os.path.join(ROOT, 'editor', 'site', 'modules')


def fw_version():
    s = open(os.path.join(ROOT, 'firmware', 'app-modular-brain', 'src', 'FwVersion.h'), encoding='utf-8').read()
    return 'v' + re.search(r'FW_VERSION "([^"]+)"', s).group(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base')
    ap.add_argument('token')
    ap.add_argument('slugs', nargs='*')
    ap.add_argument('--version', default=fw_version())
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    site = json.load(open(os.path.join(MODS, 'site-modules.json'), encoding='utf-8'))['modules']
    names = {m['slug']: m['name'] for m in site.values()}
    meta = {m['slug']: m for m in site.values()}
    slugs = a.slugs or sorted(d for d in os.listdir(MODS) if d.startswith('sw-') and os.path.isdir(os.path.join(MODS, d)))
    fouten = []
    for slug in slugs:
        d = os.path.join(MODS, slug)
        if slug not in names or not os.path.exists(os.path.join(d, 'module.md')):
            fouten.append(f'{slug}: geen naam in site-modules.json of geen module.md')
            continue
        cmd = [sys.executable, os.path.join(HERE, 'publish_software.py'), '--component', slug, '--version', a.version,
               '--name', names[slug], '--doc', os.path.join(d, 'module.md'), '--desc', os.path.join(d, 'beschrijving.txt'),
               '--hero', os.path.join(d, 'panel.svg'), '--base', a.base, '--token', a.token] + (['--dry'] if a.dry else [])
        # Ordening op /modules (Imprint 577a4a2): familie en tags op de component.
        if meta[slug].get('family'):
            cmd += ['--family', meta[slug]['family']]
        if 'tags' in meta[slug]:
            cmd += ['--tags', ','.join(meta[slug]['tags'])]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        last = (r.stdout.strip().splitlines() or [''])[-1]
        print(f'{slug}: {"ok" if r.returncode == 0 else "FOUT"} {last[:100]}')
        if r.returncode != 0:
            fouten.append(f'{slug}: {r.stderr.strip()[-300:]}')
    if fouten:
        print('\n'.join(fouten))
        sys.exit(1)


if __name__ == '__main__':
    main()
