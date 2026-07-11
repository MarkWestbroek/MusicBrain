"""Maak kicad-cli BOM/CPL-exports JLCPCB-compatibel (in place).

- BOM: reeksen in Designator uitvouwen ("C4-C7" -> "C4,C5,C6,C7"),
  Qty-kolom weglaten (JLC berekent zelf), kolommen: Comment,Designator,
  Footprint,LCSC Part #. Footprint zonder libnaam-prefix.
- CPL: headers hernoemen naar Designator,Val,Package,Mid X,Mid Y,Rotation,Layer.

Gebruik: python jlc_fix.py <bord-fab-dir> [...]  (of zonder args: alle borden)
"""
import csv, io, os, re, sys

ROOT = r"d:\Git\Muziek\MusicBrain\hardware\schematics"

def expand_refs(field):
    out = []
    for part in field.split(","):
        part = part.strip()
        m = re.fullmatch(r"([A-Za-z]+)(\d+)-\1?(\d+)", part)
        if m:
            pfx, a, b = m.group(1), int(m.group(2)), int(m.group(3))
            out += [f"{pfx}{n}" for n in range(a, b + 1)]
        else:
            out.append(part)
    return ",".join(out)

def fix_bom(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for r in rows:
            fp = r.get("Footprint", "").split(":")[-1]
            w.writerow([r.get("Comment", ""), expand_refs(r.get("Designator", "")),
                        fp, r.get("LCSC Part #", "")])

CPL_HDR = {"Ref": "Designator", "Val": "Val", "Package": "Package",
           "PosX": "Mid X", "PosY": "Mid Y", "Rot": "Rotation", "Side": "Layer"}

def fix_cpl(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rdr = csv.reader(f)
        rows = list(rdr)
    if not rows:
        return
    hdr = [CPL_HDR.get(h, h) for h in rows[0]]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(hdr)
        for r in rows[1:]:
            w.writerow(r)

def fix_dir(fabdir):
    for fn in os.listdir(fabdir):
        p = os.path.join(fabdir, fn)
        if fn.endswith("-bom.csv"):
            fix_bom(p); print("BOM :", p)
        elif fn.endswith("-cpl.csv"):
            fix_cpl(p); print("CPL :", p)

if __name__ == "__main__":
    dirs = sys.argv[1:]
    if not dirs:
        dirs = [os.path.join(ROOT, d, "fab") for d in os.listdir(ROOT)
                if os.path.isdir(os.path.join(ROOT, d, "fab"))]
    for d in dirs:
        fix_dir(d)
