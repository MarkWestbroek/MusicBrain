# Signaalstroom per module: het blokschema in het contract

Datum: 2026-10-03. Status: **voorstel, nog niets gebouwd.** Aanleiding: bij
het lezen van [patch-front.md](patch-front.md) concludeerde Mark dat een
front de signaalstroom moet kunnen laten zien, en dat die kennis nu nergens
staat: een module is voor de editor een black box met poorten en controls.
Voorstel: elk moduletype krijgt een klein, declaratief blokschema, zoals het
blokdiagram vooraan in de datasheet van een signaalverwerkende chip.

## 1. Wat het is, en wat het niet is

Een **flow** is een graaf van **units** (verwerkingseenheden) met gerichte
**edges** ertussen. Elke poort en elke control van de module hangt aan één
unit. Splitsen en samenvoegen zijn zelf units (`split`, `merge`), zoals fork
en join in een activity diagram, zodat edges altijd simpel zijn.

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
| `units[].kind` | kleine vaste woordenlijst: `input`, `output`, `osc`, `filter`, `gain`, `env`, `lfo`, `delay`, `nonlinear`, `mix`, `split`, `merge`, `mod`, `logic`, `other` |
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

## 5. Open

- Naam: `flow` met `units`, of `processing units` zoals Mark het noemde? In
  SysML-termen is het het internal block diagram van de module; `flow` is
  korter in code en in de DSL.
- Hoe grof: mag een unit `other` heten als de kernel iets doet dat geen
  naam heeft (de Material Bridge, GENDYN)? Voorstel: ja, met een label.
- Een flow is een belofte over de kernel die niemand controleert. Volstaat
  de review bij het schrijven, of willen we een rooktest (unit `filter` met
  `cutoff` moet het spectrum veranderen)? Voorstel: alleen review; de
  luistertests dekken de rest.
