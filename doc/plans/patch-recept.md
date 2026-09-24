# Patch-recept: van vraag naar patch — ontwerpdocument

Datum: 2026-09-24. Ticket-prefix: **ED-RC-x** (editor, recept).

## Samenvatting

Patches bouwen in de editor is in de praktijk handwerk: de gebruiker vraagt
een chat om een seed-functie, of klikt zich door rack, modules en patcher.
De seeds (`seedPolyVoicePatch` en vrienden in `seedModules.ts`) zijn feitelijk
al een kleine patch-compiler met opties (bron, filter, FX per stem, bus-echo,
aantal stemmen), maar die opties zitten verstopt in code.

Dit plan maakt die opties expliciet als een klein datatype, het **patch-recept**,
met daarachter één **compiler** die het recept vertaalt naar een lijst
**bewerkingen** (ops) op het project. Op dat recept komen daarna drie
ingangen: een deterministische commandoregel, een LLM-adapter (DeepSeek of
elke OpenAI-compatibele API) en een wizard. Omdat de compiler ops uitzendt in
plaats van een eindproject, is dezelfde lijst ook de demonstratiemodus voor
nieuwe gebruikers: elke op heeft een korte uitleg en wordt stap voor stap
afgespeeld.

## Twee ontwerpbesluiten

1. **Het recept is de enige koppeling naar buiten.** Een LLM, een parser of
   een formulier levert nooit een `ModularProject` (id's, millimeters, slots),
   alleen een recept van een handvol velden. Het recept wordt gevalideerd
   tegen de modulecatalogus; een verzonnen module-id is een nette fout, geen
   kapotte patch. Alleen het recept en een compacte patch-samenvatting gaan
   ooit naar een externe dienst, nooit het hele project.
2. **De compiler zendt ops uit, geen eindproject.** `compileRecipe()` levert
   `PatchOp[]`; `applyOps()` past ze toe. Dezelfde lijst is de seed, de
   regressietest, de replay en de rondleiding.

## Het recept (ED-RC-1)

```ts
interface PatchRecipe {
  name?: string;
  voices?: number;              // 1 = mono (default), 2..16 = poly
  source: RecipeModule;         // stemkern: vco, wt_vco, string, stk, plaits, dx7, …
  filter?: RecipeModule | null; // per stem; default 'vcf'; null = geen filter
  voiceFx?: RecipeModule[];     // per stem, tussen filter en VCA (mono in/uit)
  bus?: RecipeModule[];         // na de mixer, vóór OUT (mono of stereo)
  ampEnv?: boolean;             // AHDSR → VCA (default true)
  filterEnv?: boolean;          // AHDSR → filter-cv (default true als er een filter is)
  velocity?: boolean;           // velocity × amp-env via CV-math (default true)
  vibrato?: boolean;            // LFO × modwheel + bend → tune (default: als de bron 'tune' heeft)
  voiceLfo?: boolean;           // LFO per stem op de filter-cutoff (default false)
}
type RecipeModule = string | { type: string; controls?: Record<string, ControlValue> };
```

Een `RecipeModule`-string is een type-id (`tp_mmb_wt_vco`), een korte vorm
(`wt_vco`) of een alias uit de catalogus (`wavetable`, `diode compressor`,
`simpele vcf`). De catalogus (`recipe/catalog.ts`) kent per type: korte naam,
aliassen (NL/EN), soort (bron/filter/fx/…) en speelbare startwaarden. Die
alias-tabel is straks ook de zoekfunctie in de modulelijst.

Voorbeeld, de vraag "maak een 8× poly patch met een wavetable osc, een simpele
VCF en een diode compressor op het eind":

```json
{ "voices": 8, "source": "wavetable", "filter": "vcf", "bus": ["diode compressor"] }
```

## De ops (ED-RC-1)

| Op | Betekenis |
|----|-----------|
| `seedInternals` | Zorg dat de MMB-moduletypes in het project staan |
| `addRack` | Nieuw rack (rijen, HP) |
| `addModule` | Plaats een module van een type in een rack op (rij, HP) |
| `addPolyGroup` | Markeer N modules als stemmen van één poly-groep |
| `addPatch` | Nieuwe patch (naam, voiceCount, rackIds) |
| `connect` | Eén kabel (alleen master-kabels; de flatten expandeert per stem) |
| `setControls` | Knopstanden van één module in de patch |
| `activate` | Maak rack en patch actief |

Elke op heeft een optioneel `note` in gewone taal ("MIDI-in is de bron van
toonhoogte en gate"). Fase 1 vult die al; fase 4 speelt ze af. Ops dragen
hun id's mee, dus toepassen is deterministisch en herhaalbaar.

De compiler valideert vóór het uitzenden: elk poort-id bestaat op het type,
elke kabel voldoet aan `canConnect`, en de flatten (`expandPatchConnections`)
levert een geldige per-stem-lijst. Een fout is een `RecipeError` met een
mensleesbare boodschap en, bij een onbekende module, suggesties.

Layout volgt de bestaande poly-seed: rij 0 = MIDI-in, master-keten, mixer,
OUT, globale modulatie en bus-FX; stem v in rij v recht onder de master.

## Fasen

| Fase | Wat | Status |
|------|-----|--------|
| 1 (ED-RC-1) | Recept-type, catalogus met aliassen, compiler → ops, `applyOps`, pariteitstest tegen `seedPolyVoicePatch` | gebouwd 2026-09-24 |
| 2 (ED-RC-2) | Commandoregel (Ctrl+K) met deterministische parser en recept-preview; rechtsklik-werkwoorden: vervang module, maak ×N poly / mono, voeg bus-FX toe, voeg modulatie toe | open |
| 3 (ED-RC-3) | LLM-adapter (OpenAI-compatibele chat-completions met JSON-uitvoer), key-instelling in de editor, tool-calls voor bewerkingen op een bestaande patch | open |
| 4 (ED-RC-4) | Rondleiding (coach-marks op `data-tour`-ankers) en demonstratiemodus die ops afspeelt met uitleg | open |

### Fase 2: deterministische parser

De taal is klein: een aantal stemmen (`8x`, `8 stemmig`, `poly 8`, `mono`),
modulenamen met aliassen, en positiewoorden (`op het eind`, `op de bus`,
`achteraan` → bus; `per stem` → voiceFx; `zonder filter` → filter null).
Keyword-spotting met slots, geen grammatica. Onbekende woorden blijven over
als restlijst: die tonen we als "niet begrepen: …" en zijn de trigger voor
de LLM-ronde in fase 3. Altijd eerst de preview tonen ("8× poly · WT-VCO →
VCF → VCA · bus: Diode comp") en pas op bevestiging bouwen.

De rechtsklik-werkwoorden werken op een bestaande patch en horen bij dezelfde
laag:

- **Vervang module door …** Poorten worden op rol gemapt (pitch, gate, audio
  in/uit, cv). Bij een poly-groep wordt de hele groep vervangen.
- **Maak ×N poly / terug naar mono.** De stemketen is grafisch bepaalbaar:
  alles wat bereikbaar is vanaf de voice-poorten van MIDI-in en vóór de
  mixer ligt. Die keten wordt N keer gekloond en in poly-groepen gezet.
- **Voeg effect toe op de bus** tussen mixer en OUT.
- **Voeg modulatie toe** van LFO of envelope naar een cv-poort.

### Fase 3: LLM-adapter

- Endpoint en key in de editor-instellingen (localStorage), "bring your own
  key". DeepSeek en OpenAI zijn OpenAI-compatibel; één adapter volstaat.
  Als CORS vanuit de browser een probleem blijkt: kleine proxy-worker met
  rate-limit.
- Prompt = recept-schema + catalogus (korte naam, aliassen, soort per type),
  gegenereerd uit dezelfde bron als de contracttest zodat firmware leidend
  blijft. JSON-uitvoer afdwingen; daarna dezelfde validatie als fase 2.
- Bewerkingen op een bestaande patch via tool-calls op de werkwoorden van
  fase 2; het model kiest het werkwoord, de code voert uit.

### Fase 4: rondleiding en demonstratie

- Tour: `data-tour`-attributen op tabs, patcher, simulatie-start; stappen
  wachten op de store ("ga verder zodra er een kabel ligt").
- Demonstratie: ops één voor één toepassen met tab-wissel, highlight van de
  nieuwe module of kabel, en de `note`-tekst als ballon. Uitlegvragen ("hoe
  maak ik vibrato?") matchen op een kleine bibliotheek van recepten met
  commentaar.

## Bestanden

- `editor/src/modular-mb/recipe/types.ts` — `PatchRecipe`, `PatchOp`, `RecipeError`.
- `editor/src/modular-mb/recipe/catalog.ts` — catalogus: korte naam, aliassen, soort, speelbare startwaarden, poortrollen.
- `editor/src/modular-mb/recipe/compile.ts` — `compileRecipe`, `applyOps`, `buildRecipe`.
- `editor/src/modular-mb/recipe/compile.test.ts` — pariteit met `seedPolyVoicePatch`, geldigheid, aliassen.

Bewust niet aangeraakt in fase 1: `seedModules.ts` en de UI. De bestaande
seeds blijven staan als referentie; de pariteitstest bewaakt dat de compiler
dezelfde topologie oplevert. Omzetten van de seeds naar recepten kan later,
als de UI de recepten gebruikt.

## Open punten

- Stereo bronnen (Rings, Elements) in een poly-keten: mixerkanalen zijn
  stem-genummerd, dus alleen L wordt gebruikt en de compiler waarschuwt.
  Mono (1 stem) krijgt L/R netjes op twee kanalen.
- De catalogus is handmatig; een nieuwe firmware-module zonder entry werkt
  wel (poortrollen worden uit de poort-id's afgeleid, startwaarden uit de
  control-defaults) maar heeft geen aliassen.
- Key-opslag en privacy bij fase 3: alleen recept en samenvatting naar
  buiten, nooit het project.
