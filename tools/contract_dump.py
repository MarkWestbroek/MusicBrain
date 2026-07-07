#!/usr/bin/env python3
"""Contract-dump: firmware -> module-types.json (firmware is leidend).

Leest per firmware-module (app-modular-brain/src/*.h en core-runtime-headers
plus hun .cpp's) welke poort- en control-ids de code accepteert, en schrijft
dat als JSON-contract naar firmware/app-modular-brain/contract/.

De editor-CI (editor: `npm test`, zie contract.test.ts) valideert panelen en
seed-patches tegen dit bestand. Regenereer + commit dit bestand bij elke
firmware-wijziging aan poorten of controls:

    python tools/contract_dump.py

Herkenning is tekstueel maar op vaste idiomen:
  - `kTypeId = "tp_..."`
  - `portId == "x"`             (in/outputPortKind, audioPort-lookups)
  - `cvPortIs(portId, "x")`     (accepteert x en x_cv)
  - `controlId == "x"`
Modules met een genegeerde controlId-parameter (één-control-modules) staan in
OVERRIDES. Houd die lijst bij als zo'n module echt gaat dispatchen.
"""
from __future__ import annotations

import glob
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "firmware", "app-modular-brain")
CORE_INC = os.path.join(ROOT, "firmware", "core", "include", "mb", "runtime")
CORE_SRC = os.path.join(ROOT, "firmware", "core", "src", "runtime")
OUT_PATH = os.path.join(APP, "contract", "module-types.json")

# setControl negeert de controlId (één-control-modules), of parseert
# genummerde ids via char-indexing ("volN", "sN", "voct_N") die de
# tekstherkenning niet ziet: vul het contract hier met de hand aan.
#   implemented: control-ids die de firmware echt toepast
#   ignored:     control-ids die het paneel kent maar de firmware (nog) negeert
#   ports:       extra geaccepteerde poort-ids (genummerde reeksen)
def _rng(prefix: str, n: int, sep: str = "") -> list[str]:
    return [f"{prefix}{sep}{i}" for i in range(1, n + 1)]

OVERRIDES: dict[str, dict[str, list[str]]] = {
    "tp_mmb_out":    {"implemented": ["level"], "ignored": []},
    "tp_mmb_vca":    {"implemented": [], "ignored": ["gain", "resp"]},
    "tp_mmb_echo":   {"implemented": [], "ignored": ["tempo_sync"]},
    "tp_mmb_vco":    {"implemented": [], "ignored": ["fm_amt"]},     # FM-diepte: stored, not yet applied
    "tp_mmb_midiin": {"implemented": [], "ignored": ["priority"]},   # FW-1: accepted, not yet acted on
    "tp_mmb_seq8":   {"implemented": _rng("s", 16), "ignored": []},  # Seq16.cpp substr(1)-parsing
    "tp_mmb_mixer":   {"implemented": _rng("vol", 4) + _rng("pan", 4), "ignored": []},
    "tp_mmb_mixer8":  {"implemented": _rng("vol", 8) + _rng("pan", 8), "ignored": [],
                       "ports": _rng("in", 8)},
    "tp_mmb_mixer16": {"implemented": _rng("vol", 16) + _rng("pan", 16), "ignored": [],
                       "ports": _rng("in", 16)},
    "tp_mmb_octa_vco": {"implemented": [], "ignored": [],
                        "ports": _rng("voct_", 8) + _rng("out_", 8)},
    "tp_mmb_octa_vcf": {"implemented": [], "ignored": [],
                        "ports": _rng("in_", 8) + _rng("cv_", 8) + _rng("out_", 8)},
    "tp_mmb_octa_vca": {"implemented": [], "ignored": [],
                        "ports": _rng("in_", 8) + _rng("cv_", 8) + _rng("out_", 8)},
    "tp_mmb_stages": {"implemented": _rng("t", 6) + _rng("s", 6) + _rng("type", 6), "ignored": []},
}


def parse_module(header: str, extra_sources: list[str]) -> dict | None:
    text = io.open(header, encoding="utf-8", errors="replace").read()
    m = re.search(r'kTypeId\s*=\s*"([^"]+)"', text)
    if not m:
        return None
    for src in extra_sources:
        text += io.open(src, encoding="utf-8", errors="replace").read()

    ports: set[str] = set()
    for x in re.findall(r'portId\s*==\s*"([^"]+)"', text):
        ports.add(x)
    for x in re.findall(r'cvPortIs\w*\(\s*portId\s*,\s*"([^"]+)"', text):
        ports.add(x)
        ports.add(x + "_cv")
    controls = sorted(set(re.findall(r'controlId\s*==\s*"([^"]+)"', text)))

    return {
        "typeId": m.group(1),
        "source": os.path.relpath(header, ROOT).replace(os.sep, "/"),
        "ports": sorted(ports),
        "controls": controls,
    }


def main() -> int:
    fw_version = "unknown"
    ver_h = os.path.join(APP, "src", "FwVersion.h")
    vm = re.search(r'"([\d.]+)"', io.open(ver_h, encoding="utf-8").read())
    if vm:
        fw_version = vm.group(1)

    modules: dict[str, dict] = {}
    headers = sorted(glob.glob(os.path.join(APP, "src", "*.h")))
    headers += sorted(glob.glob(os.path.join(CORE_INC, "*.h")))
    for h in headers:
        stem = os.path.splitext(os.path.basename(h))[0]
        extra = [p for p in (os.path.join(CORE_SRC, stem + ".cpp"),) if os.path.exists(p)]
        mod = parse_module(h, extra)
        if not mod:
            continue
        tid = mod["typeId"]
        if ov := OVERRIDES.get(tid):
            mod["controls"] = sorted(set(mod["controls"]) | set(ov["implemented"]))
            mod["controlsIgnored"] = sorted(ov["ignored"])
            mod["ports"] = sorted(set(mod["ports"]) | set(ov.get("ports", [])))
        if tid in modules:
            # Zelfde typeId in meerdere headers (hoort niet): eerste wint, meld het.
            print(f"  waarschuwing: {tid} dubbel ({modules[tid]['source']} en {mod['source']})",
                  file=sys.stderr)
            continue
        modules[tid] = mod

    contract = {
        "$comment": "GEGENEREERD door tools/contract_dump.py — niet met de hand bewerken. "
                    "Poort-ids zijn letterlijk wat de firmware accepteert (aliassen als "
                    "out/out_l en naam/naam_cv staan er dus allebei in).",
        "firmwareVersion": fw_version,
        "modules": {tid: modules[tid] for tid in sorted(modules)},
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with io.open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(contract, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"contract: {len(modules)} modules -> {os.path.relpath(OUT_PATH, ROOT)} "
          f"(fw {fw_version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
