#!/usr/bin/env python3
"""Genereert doc/architecture/mmb-moduletype-panel.xmi (XMI 2.1, EA-import).

Het model staat hieronder als data en hoort inhoudelijk gelijk te lopen met
doc/architecture/mmb-moduletype-panel.puml (de leesbare bron). Na wijzigen:

    python tools/uml_xmi_gen.py

EA: Import Native/XMI -> XMI File... -> dit bestand.
"""
from __future__ import annotations

import io
import os
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "doc", "architecture", "mmb-moduletype-panel.xmi")

# (naam, abstract, [attributen], package)
CLASSES = [
    ("ModuleType", False, ["id : string", "categoryId : string", "variant : string",
                           "role : ModuleRole", "internal : bool"], "Contract"),
    ("Port", False, ["id : string", "signalType : cv|gate|trigger|audio|midi",
                     "direction : in|out", "range : CvRange",
                     "cvFormat : analog|dcv12|dcv16", "eventKind : voice|global"], "Contract"),
    ("Control", True, ["id : string", "label : string"], "Contract"),
    ("Knob", False, ["min : float", "max : float", "defaultValue : float",
                     "step : float", "taper : lin|log|exp", "style : KnobStyle"], "Contract"),
    ("Slider", False, [], "Contract"),
    ("Toggle", False, [], "Contract"),
    ("Switch", False, ["positions : string[]", "defaultIndex : int"], "Contract"),
    ("Button", False, [], "Contract"),
    ("Joystick", False, [], "Contract"),
    ("Exotic", False, [], "Contract"),
    ("Indicator", True, ["bindTo : Control.id"], "Contract"),
    ("Display", False, ["digits : int", "format : int|float1|float2|midi|onoff",
                        "style : led|oled"], "Contract"),
    ("Led", False, ["color : string", "bindMatch : float"], "Contract"),
    ("CellGroup", False, ["id : string", "label : string", "count : int"], "Contract"),
    ("Panel", False, ["hpWidth : HP", "heightMm : float", "texture : PanelTexture",
                      "baseColor : string", "minFirmwareVersion : semver (voorstel)"], "View"),
    ("ControlPlacement", False, ["x : mm", "y : mm", "rotation : deg",
                                 "sizeOverride : ControlSize"], "View"),
    ("PortPlacement", False, ["x : mm", "y : mm",
                              "labelPos : above|below|left|right|none"], "View"),
    ("PanelDecoration", False, ["kind : rect|line|text|tubeSlot|ledMarker|jackBlock"], "View"),
    ("ModuleInstance", False, ["id : string"], "Realisaties"),
    ("FirmwareModule", False, ["kTypeId : const char*", "inputPortKind(portId)",
                               "writeCvPort(portId, v)", "setControl(controlId, v)"],
     "Realisaties"),
    ("SimModule", False, [], "Realisaties"),
]

# (child, parent)
GENERALIZATIONS = [
    ("Knob", "Control"), ("Slider", "Control"), ("Toggle", "Control"),
    ("Switch", "Control"), ("Button", "Control"), ("Joystick", "Control"),
    ("Exotic", "Control"), ("Indicator", "Control"),
    ("Display", "Indicator"), ("Led", "Indicator"),
]

# (van, naar, naam, aggregatie-op-van-kant: none|composite, mult_van, mult_naar)
ASSOCIATIONS = [
    ("ModuleType", "Port", "ports", "composite", "1", "1..*"),
    ("ModuleType", "Control", "controls", "composite", "1", "0..*"),
    ("ModuleType", "CellGroup", "cellGroups", "composite", "1", "0..*"),
    ("CellGroup", "Port", "portIds (per cel)", "none", "0..*", "0..*"),
    ("CellGroup", "Control", "controlIds (per cel)", "none", "0..*", "0..*"),
    ("Panel", "ModuleType", "visualiseert", "none", "0..*", "1"),
    ("Panel", "ControlPlacement", "controlPlacements", "composite", "1", "0..*"),
    ("Panel", "PortPlacement", "portPlacements", "composite", "1", "0..*"),
    ("Panel", "PanelDecoration", "decorations", "composite", "1", "0..*"),
    ("ControlPlacement", "Control", "per id", "none", "0..*", "1"),
    ("PortPlacement", "Port", "per id", "none", "0..*", "1"),
    ("ModuleInstance", "ModuleType", "typeId", "none", "0..*", "1"),
    ("ModuleInstance", "Panel", "visual", "composite", "1", "1"),
]

# (realiserende klasse, contract-klasse)
REALIZATIONS = [
    ("FirmwareModule", "ModuleType"),
    ("SimModule", "ModuleType"),
]


def cid(name: str) -> str:
    return "c_" + name


def main() -> int:
    x: list[str] = []
    x.append('<?xml version="1.0" encoding="UTF-8"?>')
    x.append('<xmi:XMI xmi:version="2.1"'
             ' xmlns:uml="http://schema.omg.org/spec/UML/2.1"'
             ' xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">')
    x.append('  <xmi:Documentation exporter="MusicBrain tools/uml_xmi_gen.py"'
             ' exporterVersion="1.0"/>')
    x.append('  <uml:Model xmi:type="uml:Model" xmi:id="mmb_model"'
             ' name="MMB ModuleType-Panel">')

    packages: dict[str, list[str]] = {"Contract": [], "View": [], "Realisaties": []}
    for name, abstract, attrs, pkg in CLASSES:
        c: list[str] = []
        c.append(f'      <packagedElement xmi:type="uml:Class" xmi:id="{cid(name)}"'
                 f' name="{escape(name)}" isAbstract="{"true" if abstract else "false"}">')
        for child, parent in GENERALIZATIONS:
            if child == name:
                c.append(f'        <generalization xmi:type="uml:Generalization"'
                         f' xmi:id="g_{child}_{parent}" general="{cid(parent)}"/>')
        for i, a in enumerate(attrs):
            c.append(f'        <ownedAttribute xmi:type="uml:Property"'
                     f' xmi:id="p_{name}_{i}" name="{escape(a)}"/>')
        c.append('      </packagedElement>')
        packages[pkg].extend(c)

    for i, (a, b, nm, agg, ma, mb) in enumerate(ASSOCIATIONS):
        aid = f"assoc_{i}"
        lines = [
            f'      <packagedElement xmi:type="uml:Association" xmi:id="{aid}"'
            f' name="{escape(nm)}" memberEnd="{aid}_a {aid}_b">',
            f'        <ownedEnd xmi:type="uml:Property" xmi:id="{aid}_a"'
            f' type="{cid(a)}" association="{aid}"'
            + (f' aggregation="composite"' if agg == "composite" else "") + ">",
            f'          <lowerValue xmi:type="uml:LiteralString" xmi:id="{aid}_al"'
            f' value="{ma}"/>',
            "        </ownedEnd>",
            f'        <ownedEnd xmi:type="uml:Property" xmi:id="{aid}_b"'
            f' type="{cid(b)}" association="{aid}">',
            f'          <lowerValue xmi:type="uml:LiteralString" xmi:id="{aid}_bl"'
            f' value="{mb}"/>',
            "        </ownedEnd>",
            "      </packagedElement>",
        ]
        pkg = next(p for n, _, _, p in CLASSES if n == a)
        packages[pkg].extend(lines)

    for i, (impl, contract) in enumerate(REALIZATIONS):
        packages["Realisaties"].append(
            f'      <packagedElement xmi:type="uml:Realization" xmi:id="real_{i}"'
            f' client="{cid(impl)}" supplier="{cid(contract)}"/>')

    for pkg, body in packages.items():
        x.append(f'    <packagedElement xmi:type="uml:Package" xmi:id="pkg_{pkg}"'
                 f' name="{escape(pkg)}">')
        x.extend(body)
        x.append('    </packagedElement>')

    x.append('  </uml:Model>')
    x.append('</xmi:XMI>')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(x) + "\n")
    print(f"xmi: {len(CLASSES)} klassen, {len(ASSOCIATIONS)} associaties -> "
          f"{os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
