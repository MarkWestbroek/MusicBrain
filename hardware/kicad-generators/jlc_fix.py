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
    "10R":  "C17415",    # 10Ohm 0805          (Basic)
    "33R":  "C17634",    # 33Ohm 0805          (Basic)
    "120R": "C17437",    # 120Ohm 0805         (Basic)
    "220R": "C17557",    # 220Ohm 0805         (Basic)
    "1k":   "C17513",    # 1kOhm 0805          (Basic)
    "2k2":  "C17520",    # 2.2kOhm 0805        (Basic)
    "10k":  "C17414",    # 10kOhm 0805         (Basic)
    "100R": "C17408",    # 100Ohm 0805         (Basic)
    "100k": "C149504",   # 100kOhm 0805        (Basic)
}

# Actieve/unieke onderdelen: match op comment (na strippen van " (...)").
# Alleen SMD (machine-plaats). THT-delen (R-78E5.0 DCDC-module, H11L1 DIP-6
# optocoupler, Teensy4.1) bewust NIET hier -> hand-soldeer, blijven leeg.
LCSC_DEVICE = {
    "AD5754BREZ":    "C650230",   # 16-bit 4ch DAC, TSSOP-24-EP (REEL7)
    "ADR421":        "C29739",    # 2.5V ref, B-grade, SOIC-8 (REEL7)
    "AD7606BSTZ":    "C398827",   # 8ch 16-bit ADC, LQFP-64
    "AMS1117-5.0":   "C6187",     # 5V LDO, SOT-223 (Basic)
    "AMS1117-3.3":   "C6186",     # 3.3V LDO, SOT-223 (Basic)
    "74HCT595":      "C282339",   # shift-register, SOIC-16
    "74HC165":       "C5613",     # PISO shift-register, SOIC-16
    "74HC154":       "C2832236",  # 4->16 decoder, SOIC-24W (CD74HC154M96/TI, tape-reel, 1300+ stock)
    "74LVC245":      "C6080",     # octal bus-transceiver, SOIC-20W
    "74LVC1G125":    "C12518",    # 3-state buffer, SOT-23-5
    "74LVC1G17":     "C19829593", # Schmitt-buffer, SOT-23-5
    "BAT54S":        "C7420333",  # dual Schottky, SOT-23
    "1N4148WS":      "C2128",     # schakeldiode, SOD-323
    "SN65HVD230":    "C12084",    # CAN-transceiver, SOIC-8
    "MCP3208":       "C16939",    # 8ch 12-bit SPI-ADC, SOIC-16
    "MCP23017-E/ML": "C639770",   # 16-bit I/O-expander, QFN-28
}

# Delen waar de waarde alleen niet volstaat -> match op (comment, exacte
# footprint). Bv. 10u bestaat als 0805-ceramic (C440198, via LCSC_PASSIVE)
# EN als SMD alu-elco op CP_Elec.
LCSC_BY_FOOTPRINT = {
    ("10u", "CP_Elec_4x5.3"): "C3343",  # 10uF 25V SMD alu-elco, D4xL5.4mm (SMT)
    # adc8 JP1 RANGE (recht 1x3 male). Comment-specifiek zodat de busboard-MIDI
    # 1x3-headers (comment "MIDI IN1" enz.) NIET meegepakt worden.
    ("RANGE", "PinHeader_1x03_P2.54mm_Vertical"): "C49257",
}

# Connectoren op footprint alleen (comment varieert per stuk, part is gelijk).
# Bewuste uitzondering op "headers = handwerk": deze wil je machinaal.
LCSC_CONN = {
    "PinSocket_2x10_P2.54mm_Vertical": "C92266",     # busboard SLOT-sockets J1-J6
    "IDC-Header_2x13_P2.54mm_Vertical": "C2884553",  # busboard EXPANSION J21 (X9555WV, 2.54mm)
    "IDC-Header_2x05_P2.54mm_Vertical": "C5665",        # busboard HUB1/HUB2/PWRIN J7-J9 (2.54mm)
    "PinHeader_2x10_P2.54mm_Horizontal": "C19190505",   # slotkaart J1 BUS (haaks male 2x10)
    "PinHeader_1x10_P2.54mm_Horizontal": "C2687688",    # slotkaart J2 CV/gates (A2541WR-10P, haaks)
    "SW_PUSH_6mm": "C110153",                           # enc5front SW6/SW7 knopjes (6x6mm THT tact)
}

def lookup_lcsc(comment, footprint):
    """Geef het LCSC-nummer voor (comment, footprint), of "" als handwerk."""
    c = re.sub(r"\s*\([^)]*\)\s*$", "", (comment or "").strip())
    if (c, footprint) in LCSC_BY_FOOTPRINT:
        return LCSC_BY_FOOTPRINT[(c, footprint)]
    if footprint in LCSC_CONN:
        return LCSC_CONN[footprint]
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

# Rotatie-correctie: JLCPCB hanteert per package een andere 0deg-referentie dan
# KiCad. Deze graden worden bij de CPL-rotatie opgeteld. Afgelezen uit de
# JLCPCB "Component Placements"-preview (NIET de KiCad-render, die klopt al!).
# Alleen gepolariseerde/pinned SMD-delen; 0805-R/C zijn symmetrisch -> 0.
# Per FOOTPRINT, dus geldt automatisch voor alle borden met dat package.
ROT_FIX = {
    # Geverifieerd in JLCPCB-preview (busboard). Alleen niet-nul correcties.
    "SOT-223-3_TabPin2":           180,  # U3 AMS1117
    "SOIC-8_3.9x4.9mm_P1.27mm":    270,  # U12
    "SOIC-16_3.9x9.9mm_P1.27mm":   270,  # 74HC165/74HCT595/MCP3208 (cross-chip geverifieerd)
    "SOIC-20W_7.5x12.8mm_P1.27mm": 270,  # U8
    "SOIC-24W_7.5x15.4mm_P1.27mm":  90,  # U4 74HC154
    "HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm": 270,  # dac8 AD5754 (geverifieerd)
    "SOT-23-5":                    270,  # U11/U13 (74LVC1G17); U7 -> ROT_FIX_VAL
    "SOT-23":                      180,  # D3 (BAT54S)
    # THT (pinnen in vaste gaten -> alleen 0/180 fysiek mogelijk; 90/270 in preview
    # is het 3D-model). KiCad klopt -> raw = goed, dus GEEN correctie voor:
    #   DIP-6 (U9/U10), DCDC (U2), connectoren J1-9/J21. Alleen bij een echte
    #   180-spiegeling van pin-1/sleuf zou hier een 180 komen.
    # Ook 0: CP_Elec (C1/3/5/7, SMD maar goed), D_SOD-323 (D1: - links = ok)
}

# Uitzonderingen per part-WAARDE: JLCPCB's 0deg-referentie zit per LCSC-part,
# dus zelfde footprint kan verschillen. Waarde-match wint van footprint-default.
ROT_FIX_VAL = {
    "74LVC1G125": 180,  # U7: wijkt af van 74LVC1G17 (270) ondanks zelfde SOT-23-5
}

def fix_cpl(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    if not rows:
        return
    hdr = [CPL_HDR.get(h, h) for h in rows[0]]
    ipkg = hdr.index("Package") if "Package" in hdr else 2
    irot = hdr.index("Rotation") if "Rotation" in hdr else 5
    ival = hdr.index("Val") if "Val" in hdr else 1
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(hdr)
        for r in rows[1:]:
            if len(r) > max(ipkg, irot, ival):
                off = ROT_FIX_VAL.get(r[ival], ROT_FIX.get(r[ipkg].split(":")[-1]))
                if off:
                    try:
                        r[irot] = f"{(float(r[irot]) + off) % 360:.6f}"
                    except ValueError:
                        pass
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
