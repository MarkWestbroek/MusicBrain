#!/usr/bin/env python3
"""MMB-moduletypemodel als Omnium V3-model, plus de SVG via de render-sidecar.

Bron van het model: dezelfde data als tools/uml_xmi_gen.py (CLASSES,
GENERALIZATIONS, ASSOCIATIONS, REALIZATIONS), dus puml, XMI en V3 lopen
gelijk zolang je ze alle drie uit die data maakt. Na wijzigen:

    python tools/uml_xmi_gen.py       # XMI
    python tools/mmb_model_v3.py      # V3-json + SVG

Schrijft doc/architecture/mmb-moduletype-panel.v3.json en, als de
Omnium-render-sidecar draait (render-svc/server.mjs, standaard
http://127.0.0.1:8095), doc/architecture/mmb-moduletype-panel.svg.
Zonder sidecar: alleen de json, met een melding.

V3 kent entiteiten met velden, `erft` (generalisatie) en `relaties`
(associaties met kardinaliteit). Compositie en realisatie bestaan niet als
aparte lijnsoort; die staan in de relatienaam ("bevat", "realiseert").
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from uml_xmi_gen import ASSOCIATIONS, CLASSES, GENERALIZATIONS, REALIZATIONS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, "doc", "architecture", "mmb-moduletype-panel.v3.json")
OUT_SVG = os.path.join(ROOT, "doc", "architecture", "mmb-moduletype-panel.svg")
RENDER_URL = os.environ.get("RENDER_SVC_URL", "http://127.0.0.1:8095") + "/render/svg"

# Eén domein: de render-API tekent het hele model alleen als er precies één
# domein is. De pakketten uit de puml komen terug als kleur en in de uitleg.
KLEUR = {"Contract": "#bfdbfe", "View": "#bbf7d0", "Realisaties": "#e5e7eb"}
UITLEG = {
    "Contract": "Contract (het midden: ModuleType-data)",
    "View": "View (paneel, front, apparaat)",
    "Realisaties": "Realisatie (firmware, wasm, instantie)",
}


def veld(attr: str) -> dict:
    """"naam : type" -> V3-veld. Als afgeleid veld: V3 kent geen velden op een
    entiteit zelf (die horen bij gegevenselementen), maar afgeleide velden
    tekent Omnium wel op de kaart. Zo staan de attributen toch in de SVG
    (cursief, met een schuine streep). Afspraak met Mark, 2026-10-07."""
    naam, _, typ = attr.partition(" : ")
    return {"naam": naam.strip(), "goType": (typ.strip() or "bewerking").replace(" ", "_"),
            "afleidingsregelTaal": "cel", "afleidingsregel": ""}


def main() -> int:
    parent = dict(GENERALIZATIONS)
    entiteiten = []
    for naam, abstract, attrs, pkg in CLASSES:
        rels = []
        for van, naar, relnaam, aggr, m_van, m_naar in ASSOCIATIONS:
            if van != naam:
                continue
            rels.append({
                "naam": f"{van}_{relnaam.split(' ')[0]}_{naar}",
                "doelEntiteit": naar,
                "doelKardinaliteit": m_naar,
                "bronKardinaliteit": m_van,
                "naamLabelHeen": ("bevat: " if aggr == "composite" else "") + relnaam,
                "momentvoorkomen": "meervoudig" if "*" in m_naar else "enkelvoudig",
                "velden": [],
            })
        for real, contract in REALIZATIONS:
            if real == naam:
                rels.append({
                    "naam": f"{real}_realiseert_{contract}", "doelEntiteit": contract,
                    "doelKardinaliteit": "1", "bronKardinaliteit": "0..*",
                    "naamLabelHeen": "realiseert", "directioneel": True, "velden": [],
                })
        ent = {
            "typenaam": naam,
            "description": UITLEG[pkg],
            "domein": "mmb",
            "kleur": KLEUR[pkg],
            "isAbstract": abstract,
            "meervoud": naam.lower() + "s",
            "velden": [],
            "afgeleideVelden": [veld(a) for a in attrs],
            "relaties": rels,
        }
        if naam in parent:
            ent["erft"] = parent[naam]
        entiteiten.append(ent)

    model = {
        "versie": "v3",
        "naam": "MMB moduletype, paneel en realisaties",
        "beschrijving": "ModuleType (contract) met poorten, controls, readouts en celgroepen; het paneel als view; "
                        "firmware en wasm als realisaties. Zelfde data als mmb-moduletype-panel.puml. "
                        "Readout, DeviceDisplay en de readout-kant van Indicator zijn voorstel "
                        "(doc/plans/module-meldwaarden.md).",
        "datatypes": [], "enums": [], "referentielijstInstanties": [],
        "domeinen": [{"naam": "mmb", "kleur": "#bfdbfe", "description": "Modular Music Brain: moduletypes"}],
        "entiteiten": entiteiten,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"v3: {len(entiteiten)} entiteiten -> {os.path.relpath(OUT_JSON, ROOT)}")

    body = json.dumps({"taal": "v3", "model": model, "richting": "TB", "theme": "light",
                       "velden": True, "idPrefix": "mmb"}).encode("utf-8")
    req = urllib.request.Request(RENDER_URL, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            svg = r.read()
    except urllib.error.HTTPError as e:
        print(f"render-svc: HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:600]}")
        return 1
    except urllib.error.URLError as e:
        print(f"render-svc niet bereikbaar ({e.reason}); alleen de json geschreven. "
              f"Start in bitemp_register_v06: node render-svc/server.mjs")
        return 0
    with open(OUT_SVG, "wb") as f:
        f.write(svg)
    print(f"svg: {len(svg)} bytes -> {os.path.relpath(OUT_SVG, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
