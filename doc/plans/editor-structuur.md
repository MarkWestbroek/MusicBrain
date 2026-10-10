# Editor-structuur: patchbronnen, transport, module-editors en patchcontrole

**Datum:** 2026-10-10. **Status:** in uitvoering. Stap 0a en 0b gebouwd (2026-10-10, zie §9); besluit 5 genomen (§8).
**Aanleiding:** Mark (2026-10-10): de nieuwe onderdelen van de speelmodus (≣ Sporen, ♩ TAP, Page 4) zitten niet in Binnenkijken of de Simulatie-tab; voorbeelden, Poly ▾, Solo ▾ en de pool lopen uit elkaar; de voorbeelden zijn niet te laden in de volledige modus. "Het is nu een beetje een rommeltje, zowel UI-technisch als qua code-achtergrond." Daarna: patches moeten bij elke import gecontroleerd en zo nodig gerepareerd worden, niet alleen de seeds in de testsuite.
**Verhouding tot Astra's plan:** [editor-ux-aanbevelingen.md](editor-ux-aanbevelingen.md) (2026-09-30) blijft geldig voor UX-01, UX-03, UX-04, UX-05 en UX-07. UX-02 en UX-06 worden door dit plan grotendeels vervangen; zie §7.

## 1. Wat er nu door elkaar staat

Drie soorten dingen, elk op meerdere plekken:

| Soort | Wat | Waar het nu zit |
|---|---|---|
| **Waar een patch vandaan komt** | 25 opstart-patches, Poly ▾ (23 items), Solo ▾ (42), Stress ▾, de knoppen Voorbeelden, Internals, Test-patch, FM-test en CV-bridge, 📚 Pool, takes met een patch | `demoSeeds.ts`; ongeveer 470 regels menu's direct in `ModularMbApp.tsx`; `sim/PoolWindows.tsx`; `sim/TakeLibraryPanel.tsx` |
| **Spelen en opnemen** | ▶ Sim, ⏺, ♩ TAP, ≣ Sporen, A =, MIDI | `sim/SimQuickBar.tsx` alleen bij Binnenkijken; ♩ TAP en ≣ Sporen alleen in de werkbalk van het toetsenbord in de speelmodus (`FrontKeys.tsx`, `record={!expert}`); de Simulatie-tab heeft een eigen opnameknop en geen TAP of Sporen |
| **Editor van één instrument** | Page 4, DX7, Wave, Sample, Multisample, Zang | Page 4 als knop in de Front-tab (`FrontTab.tsx`), de rest als knoppen in de bovenbalk |

Bijkomend:

- Opstart-patches en Solo-items beschrijven soms hetzelfde instrument, elk met eigen knopwaarden in code.
- De knop "Voorbeelden" voegt voorbeeld*modules* toe (`seedExampleModules`), geen patches.
- De keuzelijst in de speelmodus heeft 25 voorbeelden in één optgroup; de Poly- en Solo-menu's (65 items) zijn daar niet bereikbaar.
- In Binnenkijken staan de voorbeelden alleen in de patchkeuze van de Front-tab.

## 2. Patchcontrole: elke patch, bij elke binnenkomst

### 2.1 Wat er nu gecontroleerd wordt

| Controle | Seeds | Eigen patches, import, SysEx, pool, take |
|---|---|---|
| Kabel naar een poort die niet meer bestaat | contracttest faalt | niet; de kabel doet stil niets |
| Control die niet meer bestaat, of waarde buiten bereik | contracttest | niet; `sanitizeControls` (`recipe/compile.ts`) bestaat, maar alleen voor recepten |
| Moduletype dat de editor niet kent | n.v.t. | alleen bij de pool (`missingTypes`), als melding |
| Front-item naar een verdwenen module of control | n.v.t. | ja, `pruneFronts` snoeit stil |
| Oude projectvorm, verweesde poly-groepen | n.v.t. | ja, `migrateProject` / `pruneOrphanGroups` |

Een persoonlijke patch van een maand geleden kan dus een kabel hebben naar een poort die hernoemd is, en dan hoor je niets, zonder melding.

### 2.2 Wat het wordt

Eén **patchcontrole** die op elke patch draait, ongeacht de bron: seed, project laden, ↑ Importeer, SysEx, pool, take, MCP. Drie lagen:

1. **Controleren.** Een pure functie `checkPatch(patch, project) → Finding[]` tegen de huidige moduletypes. Bevindingen: onbekend type, verdwenen poort, verdwenen control, waarde buiten bereik of geen geldige schakelstand, signaaltype dat niet past (audio op gate), front-item zonder doel, bank uit `simBanks` die niet op de server staat. Dezelfde functie draait in de contracttest voor de seeds: één definitie van "klopt".
2. **Deterministisch repareren.** Wat zeker is, gebeurt vanzelf: een waarde terug in het bereik, een kabel weg naar een poort die niet meer bestaat. Hernoemen kan alleen zeker als de module het zelf vastlegt: een moduletype krijgt een lijst **hernoemingen** (`poort out → out_l`, `control q → res`), bijgehouden in de firmware naast de poorten en controls en meegenomen door `tools/contract_dump.py`. Dan wordt een oude kabel omgezet in plaats van weggegooid.
3. **AI voor de rest.** Wat niet zeker is (een module die is opgesplitst, een control met een andere betekenis) wordt een voorstel. De receptlaag heeft de werkwoorden al (`connect_ports`, `set_controls`, `replace_module`). Het model krijgt de bevindingen en de oude en nieuwe moduledefinitie; jij keurt goed; het landt als gewone bewerking, met undo.

**Nooit stil.** Bij laden of import een melding: "3 dingen hersteld, 1 vraagt je oordeel", met de lijst. Het bestaande stille snoeien (`pruneFronts`) gaat via dezelfde melding.

### 2.3 Gevolg voor de basisset

Als elke patch bij binnenkomst gecontroleerd en zo nodig gerepareerd wordt, is een momentopname in de pool niet meer kwetsbaar. Dan kan de pool `centraal` de bron van de basisset zijn, zoals [patch-pool.md](patch-pool.md) §6 al wilde. De seeds in code blijven nodig om patches te *maken* en te *testen*; bewaren doet de pool. Zie besluit 1 in §8.

## 3. Eén patchcatalogus

Alle ingebouwde patches komen in één register als gegevens (`catalog/builtin.ts` of vergelijkbaar):

```ts
interface CatalogEntry {
  id: string;                 // stabiel, voor links en de pool
  name: string; title: string; // naam en één zin uitleg (NL/EN via contentEn)
  folder: string;             // map, dezelfde families als recipe/classify.ts
  tags: ('basisset' | 'poly' | 'solo' | 'zelfspelend' | 'zwaar' | 'diagnose')[];
  build: (p: ModularProject) => ModularProject;
}
```

- Poly ▾, Solo ▾, Stress ▾, de opstartset en de diagnose-seeds lezen uit dit register. Een instrument staat er één keer in, met één set knopwaarden.
- De Solo-items die nu als gegevensrij in `ModularMbApp.tsx` staan (`{ t, n, l, r, c, fx }`) worden entries met `build: soloVoice(...)`.
- `seedExampleModules` heet voortaan wat het doet ("voorbeeldmodules toevoegen") en verhuist naar Diagnose.
- De patch-library (`tools/patch-library/build-library.ts`) en de MCP-server lezen hetzelfde register in plaats van een eigen lijst.

### 3.1 Eén patchkiezer

Eén venster, in beide modi hetzelfde, met vier tabbladen:

| Tabblad | Inhoud |
|---|---|
| Mijn patches | de patches van het project, per map (zoals het Patches-tab nu groepeert) |
| Voorbeelden | het register zonder `diagnose`, per map, met zoeken; `basisset` bovenaan |
| Pool | wat nu 📚 Pool is: experimenteel, centraal, vraag, prive |
| Diagnose | Internals, Test-patch, FM-test, CV-bridge, Stress, voorbeeldmodules (zie besluit 2) |

In de speelmodus blijft de keuzelijst klein: eigen patches, de basisset, en onderaan "Meer…" dat de kiezer opent (op de telefoon als volledig scherm, besluit 3). In Binnenkijken vervangt de kiezer Poly ▾, Solo ▾, Stress ▾, de vier seedknoppen en 📚 Pool.

## 4. Eén transportbalk

▶ Sim, ⏺ opname, ♩ tempo (TAP en menu), ≣ Sporen, A = en MIDI worden één onderdeel, in beide modi op dezelfde plek: rechtsboven. Dat vervangt `SimQuickBar` en de transportknoppen in de werkbalk van het toetsenbord. De werkbalk van het toetsenbord houdt alleen wat bij het klavier hoort (octaaf, schuifstand, lange toetsen, volledig scherm, panic); op volledig scherm, waar de bovenbalk buiten beeld is, toont het podium de transportbalk compact.

Gevolg: ♩ TAP en ≣ Sporen werken ook na Binnenkijken.

### 4.1 Simulatie-tab in twee kolommen

Er is rechts ruimte (screenshot Mark, 2026-10-10). Links blijft: patch en engine, samplerbank, MIDI-bron, telefoon als bedieningsvlak, wat er speelt. Rechts komt: Sporen (hetzelfde `OverdubPanel`), takes en library, tempo. De eigen opnameknop van het paneel vervalt; de transportbalk is de enige.

## 5. Editor bij een moduletype

Een klein register koppelt een moduletype aan zijn editor:

| Moduletype | Editor |
|---|---|
| `tp_mmb_cmi` | Page 4 |
| `tp_mmb_dx7` | DX7-editor |
| `tp_mmb_draw_vco`, `tp_mmb_wt_vco`, `tp_mmb_morph_wt` | Wave |
| `tp_mmb_sampler`, `tp_mmb_tapestrip`, `tp_mmb_percuter` | Sample / Multisample |
| `tp_mmb_zang` | Zang |

Je opent zo'n editor vanaf de module: een knopje op het paneel (rack, patcher), rechtsklik, en op het front als de module erop staat. Page 4 is dan geen uitzondering in `FrontTab.tsx` meer, maar het eerste voorbeeld van de regel. De knoppen in de bovenbalk blijven voorlopig als snelkoppeling.

## 5b. Weergaven: telefoon, tablet, desktop

De speelmodus op de telefoon is compacter, kleiner en beperkter, en knoppen verhuizen er soms. Dat is nu geen ontwerp maar een uitkomst:

- één breedtemeting in de hele editor: `FrontPanel.tsx` (`innerWidth < 640`, letters ×1,5);
- balken die doorlopen op een tweede of derde regel (`flexWrap` in de werkbalk van de speelmodus);
- losse `compact`-standen per knop (`RecordButton`, `TeensyStatusBar`);
- volledig scherm in twee standen (front + toetsen, alleen toetsen), elk met eigen knoppen in eigen balken;
- de opnameknop staat daardoor op drie plekken, afhankelijk van modus en schermstand.

Wat het wordt:

1. **Eén weergave-hook**, `useWeergave()`: `telefoon` (smal, onder ongeveer 640 px), `tablet` of `desktop`, plus staand of liggend en wel of niet volledig scherm. Overal waar nu zelf gemeten of `compact` doorgegeven wordt, leest het deze hook.
2. **Eén plaatsingstabel** voor de speelmodus: per onderdeel waar het staat in elke weergave. Een onderdeel bestaat één keer en verhuist alleen volgens de tabel; geen tweede variant met eigen gedrag.
3. **De telefoon is een eerste ontwerpdoel van de speelmodus**, geen terugval. Binnenkijken op de telefoon blijft "het werkt, het is niet mooi"; daar is de telefoon niet voor.

Voorstel voor de tabel (te bevestigen, besluit 5):

| Onderdeel | Desktop | Telefoon staand | Volledig scherm, front + toetsen | Volledig scherm, alleen toetsen |
|---|---|---|---|---|
| Patchkeuze | werkbalk links | werkbalk regel 1 | bovenin het podium | bovenin het podium |
| Bewaar, Bewaar als | werkbalk | in een ⋯-menu | weg | weg |
| Binnenkijken, rondleiding | werkbalk | in het ⋯-menu | weg | weg |
| Transportbalk (▶, ⏺, ♩, ≣, A =, MIDI) | rechtsboven | regel 2, alleen tekens; A = en MIDI in het ⋯-menu | bovenin het podium, rechts | werkbalk toetsenbord |
| ⓘ Uitleg, PAGE 4 | boven het front | boven het front, klein | boven het front | weg |
| Sporen-paneel | onder het toetsenbord | onder het toetsenbord, ingeklapt | onder het toetsenbord | weg |
| Werkbalk toetsenbord | onder het front | onder het front | onder het front | boven de toetsen |

Testen: de tabel wordt een Playwright-test op drie viewports (1280 breed, Pixel 7 staand en liggend) die per onderdeel controleert dat het zichtbaar is waar de tabel zegt, en nergens anders. Touch-gedrag blijft op een echt toestel bevestigd worden.

## 6. Code

- `ModularMbApp.tsx` (1100 regels) verliest de inline menu's (ongeveer 450 regels) aan het register en de patchkiezer.
- Nieuwe onderdelen: `catalog/` (register + `checkPatch` + reparaties), `PatchBrowser.tsx`, `Transport.tsx`, `moduleEditors.ts`.
- `PatchSelect.tsx` blijft het enige keuzelijstje; het leest uit het register.
- `useWeergave()` vervangt de losse breedtemeting en de `compact`-props; de plaatsingstabel van §5b staat als gegevens naast de transportbalk.
- Eén schrijfpad blijft `setPatchControl`; reparaties en AI-voorstellen gaan via de bestaande receptbewerkingen (undo, bewaarcyclus).

## 7. Wat dit betekent voor Astra's plan

- Het plan dateert van 30 september. Speelmodus, fronts, pool, telefoon, Sporen, tempo en Page 4 bestonden toen niet; het kijkt alleen naar Binnenkijken.
- **UX-02** groepeert de bovenbalk, inclusief "Voorbeelden & tests" als één groep. Na §3 en §5 verdwijnen ongeveer tien van de ruim twintig knoppen uit de bovenbalk; wat overblijft is Project (export, import, SysEx, Panels, Nieuw), Recept, Presets, Teensy en ?. Muziek voor bezoekers en diagnose voor Mark zijn verschillende dingen en komen in verschillende tabbladen. Het besluit van 2026-10-01 (vast menu plus configureerbaar snelmenu) blijft gelden voor wat er overblijft.
- **UX-06** (vaste contextbalk met simulatiebediening) valt samen met de transportbalk van §4.
- **UX-01, UX-03, UX-04, UX-05, UX-07** staan hier los van en blijven zoals ze zijn.

## 8. Besluiten voor Mark

1. **Bron van de basisset:** de pool `centraal` (met de patchcontrole van §2 als vangnet), of het register in code dat bij elke release naar de pool gepubliceerd wordt?
2. **Diagnose-seeds** (Stress, FM-test, CV-bridge, Internals): voor iedereen zichtbaar in het tabblad Diagnose, of alleen in een dev-build of na een instelling?
3. **Patchkiezer op de telefoon:** volledig scherm, of de keuzelijst met "Meer…" die naar de kiezer gaat?
4. **Hernoemingen in de firmware** (§2.2, laag 2): akkoord dat een moduletype voortaan een lijst oude namen bijhoudt?
5. **Plaatsingstabel** (§5b): klopt de voorgestelde indeling per weergave, en mag Bewaar op de telefoon in een ⋯-menu? **Besloten 2026-10-10 (Mark): ja, eens met het voorstel.**

## 9. Stappen

Elke stap kan apart naar live. Stap 1 verandert niets aan wat je ziet.

**Gebouwd in 0a en 0b (2026-10-10):**

- `patchCheck.ts`: `checkPatch` (bevindingen met soort en ernst: `fix`, `ask`, `info`), `repairPatch` (alleen `fix`: kabels naar verdwenen poorten of modules weg, waarden terug in bereik of op een bestaande stand, front-items zonder doel weg), `summarizeFindings`. Eén bevinding per kapotte kabel. MIDI-IN `voiceCount` is een bewust synthetische sleutel en geen bevinding.
- De contracttest gebruikt `checkPatch` voor alle seeds en de standaardset; de oude losse kabelcontrole is vervallen.
- `patchIntake.ts`: `reviewProject` (alle patches) en `admitPatch` (één patch), `staleModuleTypes` (interne types die in het project anders zijn dan in de editor en door een module gebruikt worden), `applyIntake` (herstel als bewerking met undo, dan de melding).
- Waar het draait: bij elke vervanging van het project (opstart, import, Nieuw, preset; de store telt die met `projectReplacedCount`) en na het binnenhalen van één patch uit de pool, een link, SysEx of een take.
- `IntakeNotice.tsx`: de oranje melding boven de werkbalk, in beide modi. "Ongedaan maken" alleen zolang er daarna niets veranderd is. "Modules verversen" doet hetzelfde als de knop Internals en controleert opnieuw. Alleen informatieve bevindingen geven geen melding.
- Bewust niet: de moduletypes van een project vanzelf verversen. Dat vervangt panelen; dat besluit blijft bij de gebruiker.
- Nog niet: `simBanks` tegen de banklijst van de server (asynchroon), hernoemingen (stap 6), AI-reparatie (stap 7).

| # | Wat | Verandert voor de gebruiker | Omvang |
|---|---|---|---|
| 0a ✅ | `checkPatch` en de bevindingen; de contracttest gebruikt hem voor de seeds | niets | klein |
| 0b ✅ | Controle bij elke binnenkomst, deterministische reparatie, melding | melding bij laden of import als er iets hersteld is | middel |
| 1 | Register: alle seeds als gegevens; Poly ▾, Solo ▾, Stress ▾ en de opstartset lezen eruit | niets zichtbaar; ModularMbApp ongeveer 450 regels korter | middel |
| 2 | Transportbalk in beide modi | ♩ TAP en ≣ Sporen ook na Binnenkijken | klein |
| 2b | `useWeergave()` en de plaatsingstabel, met Playwright-test op drie viewports | knoppen staan op de telefoon op een vaste plek | middel |
| 3 | Simulatie-tab in twee kolommen | Sporen en takes naast de engine | klein |
| 4 | Register voor module-editors; openen vanaf paneel en front | Page 4, DX7 en Wave openen bij de module | middel |
| 5 | Patchkiezer met vier tabbladen | vervangt Poly ▾, Solo ▾, Stress ▾, de vier seedknoppen en 📚 Pool | middel |
| 6 | Hernoemingen in het contract (firmware) | oude kabels worden omgezet in plaats van weggehaald | middel, vraagt een firmwarerelease |
| 7 | AI-reparatie van wat niet zeker is | voorstel na de melding, met goedkeuring | middel |
| 8 | Bovenbalk opnieuw indelen, wat er nog over is | kleiner dan Astra's UX-02 | klein |
| 9 | Basisset naar of uit de pool | na besluit 1 | klein |
