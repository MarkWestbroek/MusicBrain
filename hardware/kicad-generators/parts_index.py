"""Genereer hardware/schematics/PARTS.md: index gebruikte onderdelen -> LCSC.

Leest alle <bord>/fab/<bord>-bom.csv (dus: draai eerst make_fab.sh voor
actuele BOMs) en groepeert op LCSC-nummer. Onderaan: bewust ongematchte
regels (handwerk/eigen voorraad) per bord. Bron van de matching zelf is en
blijft jlc_fix.py (LCSC_PASSIVE/DEVICE/BY_FOOTPRINT/CONN).

Gebruik: python parts_index.py
"""
import csv, glob, os, datetime
from collections import defaultdict

ROOT = r"d:\Git\Muziek\MusicBrain\hardware\schematics"
OUT = os.path.join(ROOT, "PARTS.md")

matched = defaultdict(lambda: {"comments": set(), "fps": set(), "boards": set(),
                               "count": 0})
unmatched = defaultdict(set)   # (footprint, comment) -> {boards}

for f in sorted(glob.glob(os.path.join(ROOT, "*", "fab", "*-bom.csv"))):
    board = os.path.basename(os.path.dirname(os.path.dirname(f)))
    if board.startswith("deprecated") or "-v2" in board:
        continue
    with open(f, newline="", encoding="utf-8-sig") as fh:
        for r in csv.DictReader(fh):
            lcsc = (r.get("LCSC Part #") or "").strip()
            fp = (r.get("Footprint") or "").strip()
            cm = (r.get("Comment") or "").strip()
            n = len([d for d in (r.get("Designator") or "").split(",") if d.strip()])
            if lcsc:
                m = matched[lcsc]
                m["comments"].add(cm)
                m["fps"].add(fp)
                m["boards"].add(board)
                m["count"] += n
            else:
                unmatched[(fp, cm)].add(board)

with open(OUT, "w", encoding="utf-8") as fh:
    w = fh.write
    w("# Onderdeel-index — gebruikte parts → JLCPCB (LCSC)\n\n")
    w(f"*Gegenereerd {datetime.date.today()} door `kicad-generators/parts_index.py` "
      "uit de fab-BOMs — draai eerst `make_fab.sh` voor een actuele stand. "
      "De matching zelf staat in `kicad-generators/jlc_fix.py`.*\n\n")
    w("| LCSC | Comment(s) | Footprint(s) | Borden | Stuks tot. |\n")
    w("|---|---|---|---|---|\n")
    for lcsc in sorted(matched, key=lambda c: sorted(matched[c]["comments"])):
        m = matched[lcsc]
        w(f"| {lcsc} | {', '.join(sorted(m['comments'])[:5])} | "
          f"{', '.join(sorted(m['fps']))} | "
          f"{', '.join(sorted(b.replace('musicbrain-', '') for b in m['boards']))} | "
          f"{m['count']} |\n")
    w("\n## Bewust niet gematcht (handwerk / eigen voorraad / koper-only)\n\n")
    w("| Footprint | Comment | Borden |\n|---|---|---|\n")
    for (fp, cm), boards in sorted(unmatched.items()):
        w(f"| {fp} | {cm} | "
          f"{', '.join(sorted(b.replace('musicbrain-', '') for b in boards))} |\n")
print("geschreven:", OUT,
      f"({len(matched)} LCSC-parts, {len(unmatched)} ongematchte regels)")
