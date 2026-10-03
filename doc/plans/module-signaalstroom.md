# Signaalstroom per module: het blokschema in het contract

Datum: 2026-10-03. Status: **voorstel, nog niets gebouwd.** Aanleiding: bij
het lezen van [patch-front.md](patch-front.md) concludeerde Mark dat een
front de signaalstroom moet kunnen laten zien, en dat die kennis nu nergens
staat: een module is voor de editor een black box met poorten en controls.
Voorstel: elk moduletype krijgt een klein, declaratief blokschema, zoals het
blokdiagram vooraan in de datasheet van een signaalverwerkende chip.

## 1. Wat het is, en wat het niet is

Een **flow** is een graaf van **units** met gerichte **edges** ertussen.
Elke poort en elke control van de module hangt aan één unit.

**Splitsen en samenvoegen.** In een signaalgraaf is splitsen gratis: één
uitgang mag meerdere edges voeden (fan-out), daar hoort geen knoop bij.
Samenvoegen is nooit neutraal: het is óf **optellen** (een `mix`-unit, met
eventueel een niveau per ingang) óf **kiezen** (een `switch`-unit, één van N,
meestal aan een mode-control). Beide hebben betekenis, dus beide zijn units,
geen kale merge-knopen. Een fork/join zoals in een activity diagram
(parallel starten en wachten) bestaat voor doorlopende signalen niet.

**SysML.** Zo past de flow één-op-één op een internal block diagram (ibd)
van de module: units zijn parts met `kind` als stereotype, de poorten van
de module zijn de boundary ports, edges zijn connectors, en fan-out is
gewoon meerdere connectors uit één port. Wie de flow als SysML wil tonen,
kan dat uit dezelfde JSON genereren, net als de mermaid in de catalogus.

Het is een **beschrijving**, geen DSP. De kernel rekent; de flow vertelt in
welke volgorde en waar de knoppen zitten. Grofkorrelig, op datasheet-niveau:
"HPF → SVF (cutoff, res) → VCA (level)", niet elke biquad. Een module zonder
flow gedraagt zich als nu: één unit met alles erin.

Dit is géén geneste graaf en géén sub-patch. `doc/uml/11-simulation-wasm.md`
§3b sluit modules-in-modules bewust uit; de flow verandert daar niets aan.
De runtime ziet hem niet.

## 2. Vorm

In het contract (`module-types.json`), per moduletype, optioneel:

```json
"flow": {
  "units": [
    { "id": "hpf",  "kind": "filter",   "label": "HPF" },
    { "id": "svf",  "kind": "filter",   "label": "SVF",  "controls": ["cutoff", "res", "mode"], "ports": ["cutoff_cv"] },
    { "id": "vca",  "kind": "gain",     "label": "VCA",  "controls": ["level"] },
    { "id": "in",   "kind": "input",    "ports": ["in"] },
    { "id": "out",  "kind": "output",   "ports": ["out"] }
  ],
  "edges": [
    { "from": "in",  "to": "hpf" }, { "from": "hpf", "to": "svf" },
    { "from": "svf", "to": "vca" }, { "from": "vca", "to": "out" }
  ]
}
```

| Veld | Betekenis |
|---|---|
| `units[].kind` | kleine vaste woordenlijst: `input`, `output`, `osc`, `filter`, `gain`, `env`, `lfo`, `delay`, `nonlinear`, `mix`, `switch`, `mod`, `logic`, `other` (met verplicht label) |
| `units[].controls`, `units[].ports` | de controls en poorten van de module die bij deze unit horen; elk hoogstens één keer |
| `edges[].signal` | optioneel: `audio`, `cv`, `gate`; weggelaten = audio |
| cel-modules (`role: multi`) | één flow per cel, met de kale poort-id's; de editor plakt `_<n>` erachter zoals `polyExpand.ts` dat al doet |

**Waar de kennis vandaan komt.** De firmware is leidend, dus de flow hoort
bij de firmware-module. Voorstel: een commentaarblok in `*Module.h` in een
regel-DSL die `tools/contract_dump.py` naast de bestaande idiomen parseert:

```cpp
// flow: in -> hpf:filter -> svf:filter[cutoff,res,mode](cutoff_cv) -> vca:gain[level] -> out
// flow: env_cv -> svf.cutoff
```

Eén regel per pad, `naam:kind[controls](poorten)`, een tweede regel voor een
zijtak. Dat is leesbaar in de header, test- en diff-baar, en het dwingt
niemand tot JSON. `contract_dump.py` zet het om; `contract.test.ts` toetst
dat elke control en poort in de flow bestaat en dat geen control twee keer
voorkomt. Automatisch afleiden uit de kernel-code is niet haalbaar: de
samenstelling van sub-kernels is uit de headers te lezen, de volgorde zit in
`Process()`.

## 3. Wat je ermee kunt

1. **Catalogus.** `npm run catalog` tekent per module een mermaid-blokschema
   in `module-catalogus.md`. De eerste zichtbare opbrengst, zonder editor-
   werk.
2. **Inspector** (UX-03): het blokschema naast poorten en controls in de
   rack-inspector; klik op een unit markeert zijn knoppen op het paneel.
3. **Patch-front** ([patch-front.md](patch-front.md) §6): de afgeleide
   signaalgraaf. Kabels van de patch plus flows van de modules geven één
   graaf over de hele patch; units zonder front-control worden tot een lijn
   samengevouwen; wat overblijft zijn de front-knoppen met lijntjes ertussen,
   zoals op een eenvoudige synth. De flow geeft ook het materiaal voor een
   automatisch of door AI voorgesteld front: "de cutoff van het filter ná de
   oscillator" is een betere kandidaat dan een trim diep in een unit.
4. **Signaalpad-view** (ED-PT-2): dezelfde graaf, maar met alle modules
   open.
5. **Externe modules** (Eurorack): flow optioneel, uit de handleiding; dan
   is een extern paneel in de inspector net zo leesbaar als een intern.

## 4. Omvang en volgorde

Het contract telt 108 interne modules; de meeste hebben twee tot zes units.
Dat is handwerk, maar begrensd, en het hoeft niet in één keer: de flow is
optioneel en ontbreken betekent "één unit".

| Stap | Waar | Wat | Grootte |
|---|---|---|---|
| 1 | tools + contract | DSL-parser in `contract_dump.py`, `flow` in `module-types.json`, toets in `contract.test.ts` | klein |
| 2 | firmware headers | flow-regels voor de modules uit de Solo ▾/Poly ▾-demo's en de effectenbatch (~30) | middel, handwerk |
| 3 | editor scripts | mermaid in de catalogus | klein |
| 4 | editor | blokschema in de rack-inspector | klein |
| 5 | editor | afgeleide patchgraaf (kabels + flows, samenvouwen) als functie met tests; eerst gebruikt door het front, daarna door ED-PT-2 | middel |
| 6 | firmware headers | de overige modules | handwerk, verspreid |

## 5. Besluiten (Mark, 2026-10-03)

- **Naam**: `flow` voor de functionele graaf, `units` voor de knopen.
  "Processing unit" was bedoeld als intern blok en vervalt als term.
- **Splitsen en samenvoegen**: fan-out op edges, `mix` en `switch` als
  units (§1). Tonen als SysML-ibd kan uit dezelfde JSON.
- **Grofheid**: `other` mag, met verplicht label.
- **Flows zijn documentatie, geen code**: je test code en je reviewt
  documentatie. Dus review bij het schrijven, geen rooktest. De
  contract-test toetst alleen dat de verwijzingen (controls, poorten)
  bestaan, net als bij panelen.
