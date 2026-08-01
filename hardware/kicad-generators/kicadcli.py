"""Cross-platform locatie van kicad-cli (macOS + Windows/Linux).

Zelfde geest als de footprintpad-detectie in cardlib.py: de scripts moeten
op zowel macOS als Windows draaien. Gebruik:

    from kicadcli import KICAD_CLI
    subprocess.run([KICAD_CLI, 'pcb', 'render', ...])

i.p.v. de letterlijke string 'kicad-cli' (die op macOS niet in PATH staat).
Een expliciete override kan via de omgevingsvariabele KICAD_CLI.
"""
import os
import shutil


def _vind_kicad_cli():
    # 1) expliciete override
    env = os.environ.get('KICAD_CLI')
    if env:
        return env
    # 2) in PATH (Windows/Linux, of macOS met symlink)
    gevonden = shutil.which('kicad-cli')
    if gevonden:
        return gevonden
    # 3) standaard macOS-installatie
    mac = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
    if os.path.exists(mac):
        return mac
    # 4) val terug op de kale naam; de foutmelding komt dan van subprocess
    return 'kicad-cli'


KICAD_CLI = _vind_kicad_cli()
