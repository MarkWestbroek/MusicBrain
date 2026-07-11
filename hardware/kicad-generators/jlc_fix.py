"""Maak kicad-cli BOM/CPL-exports JLCPCB-compatibel (in place).

- BOM: reeksen in Designator uitvouwen ("C4-C7" -> "C4,C5,C6,C7"),
  Qty-kolom weglaten (JLC berekent zelf), kolommen: Comment,Designator,
  Footprint,LCSC Part #. Footprint zonder libnaam-prefix.
- CPL: headers hernoemen naar Designator,Val,Package,Mid X,Mid Y,Rotation,Layer.

Gebruik: python jlc_fix.py <bord-fab-dir> [...]  (of zonder args: alle borden)
"""
import csv, io, os, re, sys

ROOT = r"d:\Git\Muziek\MusicBrain\hardware\schematics"

# --- Gedeelde JLCPCB parts-library --------------------------------------
# Vult de "LCSC Part #"-kolom automatisch, zodat JLCPCB niet meer op
# comment+footprint hoeft te raden (dat veroorzaakte false matches als
# "RANGE"->SS8050-transistor en "100n"->4,7uF, en handmatig bijmatchen).
#
# Alleen parts die JLCPCB machinaal plaatst staan hier. Handgesoldeerde
# delen (elco's, pinheaders/jumpers, encoders, tact-switches) blijven
# LEEG -> JLCPCB laat ze "unmatched"/DNP, precies wat we willen.
#
# Nieuwe standaard-part? Voeg 'm hier toe met een GEVERIFIEERD LCSC-nummer.
# Een expliciet "LCSC"-veld op het schema-symbool overschrijft deze library.

_SMD_0805 = ("C_0805_2012Metric", "R_0805_2012Metric")

# Passieven: alleen geldig op een 0805 ceramic/resistor-footprint.
# (10u bestaat OOK als CP_Elec-elco -> die matcht niet en blijft leeg.)
LCSC_PASSIVE = {
    "100n": "C49678",    # 100nF 50V X7R 0805  (Basic)
    "220p": "C107145",   # 220pF 50V X7R 0805  (Basic)
    "1u":   "C5137478",  # 1uF 50V X7R 0805    (Extended)
    "10u":  "C440198",   # 10uF 50V X5R 0805 ceramic (Basic)
    "1k":   "C17513",    # 1kOhm 0805          (Basic)
    "10k":  "C17414",    # 10kOhm 0805         (Basic)
    "100R": "C17408",    # 100Ohm 0805         (Basic)
    "100k": "C149504",   # 100kOhm 0805        (Basic)
}

# Actieve/unieke onderdelen: match op comment (na strippen van " (...)").
LCSC_DEVICE = {
    "AD5754BREZ":    "C650230",  # 16-bit 4ch DAC, TSSOP-24-EP (REEL7)
    "ADR421":        "C29739",   # 2.5V ref, B-grade, SOIC-8 (REEL7)
    "AD7606BSTZ":    "C398827",  # 8ch 16-bit ADC, LQFP-64
    "AMS1117-5.0":   "C6187",    # 5V LDO, SOT-223 (Basic)
    "74HCT595":      "C282339",  # shift-register, SOIC-16
    "74HC165":       "C5613",    # PISO shift-register, SOIC-16
    "74LVC1G125":    "C12518",   # 3-state buffer, SOT-23-5
    "BAT54S":        "C7420333", # dual Schottky, SOT-23
    "MCP3208":       "C16939",   # 8ch 12-bit SPI-ADC, SOIC-16
    "MCP23017-E/ML": "C639770",  # 16-bit I/O-expander, QFN-28
}

def lookup_lcsc(comment, footprint):
    """Geef het LCSC-nummer voor (comment, footprint), of "" als handwerk."""
    c = re.sub(r"\s*\([^)]*\)\s*$", "", (comment or "").strip())
    if footprint in _SMD_0805 and c in LCSC_PASSIVE:
        return LCSC_PASSIVE[c]
    return LCSC_DEVICE.get(c, "")

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
            comment = r.get("Comment", "")
            # Expliciet symbool-veld wint; anders vult de parts-library aan.
            lcsc = r.get("LCSC Part #", "").strip() or lookup_lcsc(comment, fp)
            w.writerow([comment, expand_refs(r.get("Designator", "")), fp, lcsc])

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
