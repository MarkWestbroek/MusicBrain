#!/usr/bin/env python3
"""Genereert de ingebouwde DX7-factory-banken uit .syx-bestanden.

Invoer:  8 × 32-voice bulk dump (4104 bytes met sysex-framing of 4096 kaal),
         volgorde rom1a..rom4b (Yamaha factory-ROMs).
Uitvoer: firmware/app-modular-brain/src/Dx7FactoryBanks.h  (PROGMEM, 32 KB)
         editor/src/modular-mb/dx7BankNames.ts              (bank+voice-namen)

Gebruik:  python tools/dx7_banks_gen.py <map-met-syx>
De voice-namen (10 tekens, offset 118 in elke packed voice) komen uit de
data zelf — er is geen losse namenlijst nodig.
"""
from __future__ import annotations

import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANKS = ["rom1a", "rom1b", "rom2a", "rom2b", "rom3a", "rom3b", "rom4a", "rom4b"]
LABELS = ["ROM1A Master", "ROM1B Keyboard&Plucked", "ROM2A Orchestral&Perc",
          "ROM2B Synth&FX", "ROM3A Master (US)", "ROM3B Keyboard&Plucked",
          "ROM4A Orchestral&Perc", "ROM4B Synth&FX"]
SHORT = ["1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B"]


def load_bank(path: str) -> bytes:
    raw = io.open(path, "rb").read()
    if len(raw) == 4104 and raw[0] == 0xF0:
        raw = raw[6:6 + 4096]
    if len(raw) != 4096:
        raise SystemExit(f"{path}: verwacht 4096/4104 bytes, kreeg {len(raw)}")
    return raw


def voice_name(bank: bytes, prog: int) -> str:
    b = bank[prog * 128 + 118: prog * 128 + 128]
    return "".join(chr(c) if 32 <= c < 127 else "?" for c in b).rstrip()


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else "."
    banks = [load_bank(os.path.join(src, b + ".syx")) for b in BANKS]

    # ── firmware header ──
    h = io.StringIO()
    h.write("#pragma once\n")
    h.write("// GEGENEREERD door tools/dx7_banks_gen.py — niet met de hand bewerken.\n")
    h.write("// De 8 Yamaha DX7 factory-ROM-banken (32 voices elk, packed formaat),\n")
    h.write("// in flash (PROGMEM is memory-mapped op Teensy 4.x). 8 x 4096 = 32 KB.\n")
    h.write("#include <Arduino.h>\n#include <cstdint>\n\n")
    h.write("namespace mmb_link {\n\n")
    h.write("constexpr int kDx7FactoryBankCount = 8;\n\n")
    h.write("inline const char* const kDx7FactoryBankNames[kDx7FactoryBankCount] = {\n")
    for lab in LABELS:
        h.write(f'    "{lab}",\n')
    h.write("};\n\n")
    h.write("PROGMEM inline const uint8_t kDx7FactoryBanks"
            "[kDx7FactoryBankCount][4096] = {\n")
    for name, data in zip(BANKS, banks):
        h.write(f"    {{ // {name}\n")
        for off in range(0, 4096, 16):
            row = ", ".join(str(b) for b in data[off:off + 16])
            h.write(f"        {row},\n")
        h.write("    },\n")
    h.write("};\n\n}  // namespace mmb_link\n")
    out_h = os.path.join(ROOT, "firmware", "app-modular-brain", "src",
                         "Dx7FactoryBanks.h")
    io.open(out_h, "w", encoding="utf-8", newline="\n").write(h.getvalue())

    # ── editor namen ──
    t = io.StringIO()
    t.write("// GEGENEREERD door tools/dx7_banks_gen.py — niet met de hand bewerken.\n")
    t.write("// Bank- en voice-namen van de 8 ingebouwde DX7 factory-ROMs\n")
    t.write("// (firmware Dx7FactoryBanks.h). Bank 8 = USER (.syx-upload).\n\n")
    t.write("export const DX7_BANK_SHORT = [")
    t.write(", ".join(f"'{s}'" for s in SHORT))
    t.write(", 'USR'] as const;\n\n")
    t.write("export const DX7_BANK_LABELS: string[] = [\n")
    for lab in LABELS:
        t.write(f"  '{lab}',\n")
    t.write("  'USER (.syx-upload via Teensy-modal)',\n];\n\n")
    t.write("/** 8 banken x 32 voice-namen, direct uit de packed data (offset 118). */\n")
    t.write("export const DX7_VOICE_NAMES: string[][] = [\n")
    for name, data in zip(BANKS, banks):
        names = ", ".join(f"'{voice_name(data, p)}'" for p in range(32))
        t.write(f"  [{names}],\n")
    t.write("];\n")
    out_t = os.path.join(ROOT, "editor", "src", "modular-mb", "dx7BankNames.ts")
    io.open(out_t, "w", encoding="utf-8", newline="\n").write(t.getvalue())

    print(f"{out_h}: {sum(len(b) for b in banks)} bytes bankdata")
    print(f"{out_t}: namen (bank 0 voice 0 = \"{voice_name(banks[0], 0)}\")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
