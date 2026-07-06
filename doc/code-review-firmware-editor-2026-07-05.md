# Code review — firmware (app-modular-brain) ↔ editor (modular-mb)

*Datum: 2026-07-05 · Reviewer: Claude (Fable 5) · Scope: `firmware/core`, `firmware/app-modular-brain`, `editor/src/modular-mb`, en het serieële koppelvlak (mmb-config.v1)*

**Reviewvragen:** (1) correct en maximaal gebruik van object-oriëntatie, (2) hergebruik, (3) logische architectuur — niet te veel lagen, niet te plat, (4) klopt de aansluiting editor ↔ firmware, geen gaten of mismatches.

---

## TL;DR

De architectuur van beide kanten is goed: heldere lagen, sterke OO in de firmware, bewuste spiegeling tussen C++ en TypeScript. De koppeling heeft één echte bug (poly werkt niet op hardware omdat `voiceCount` uit de config-payload wordt gestript) en een aantal losse draadjes (wavetable-push zonder aanroeper, `attenuation`/`invert` die nergens worden toegepast, modules die maar aan één kant bestaan). Grootste structurele risico: het typeId/portId/controlId-contract bestaat twee keer (seedModules.ts en de C++ headers) en wordt alleen door documentatie-discipline synchroon gehouden.

---

## 1. Aansluiting firmware ↔ editor

### 1.1 Wat klopt

- **Protocol matcht 1-op-1.** `hello` / `config` / `selectPatch` / `setStatic` / `midi` / `bend` / `cc` / `controlPoke` / `wavetable` in `editor/src/modular-mb/teensyLink.ts` tegenover exact dezelfde handlers in `firmware/app-modular-brain/src/TeensyLink.h`. Conventies (14-bit pitch-bend → signed offset, 0-based kanaal) zijn aan beide kanten identiek gedocumenteerd.
- **Port- en control-ids van de kernmodules matchen exact** (VCO, VCA, VCF, AHDSR, LFO, MidiIn, Seq, CvMath, mixers). Firmware-headers verwijzen expliciet naar de editor-seedfunctie ("Editor mirror: …") en vice versa. De alias-acceptatie in firmware (`rate`/`freq`, `retrig`/`reset`, `voiceCount`/`voices`) is een verstandig compat-mechanisme.
- **Per-voice poortnaamgeving klopt.** `polyExpand.ts` genereert `pitch1`…`pitchN` / `gate1`… / `vel1`…; `MidiInModule::parseVoicePort()` (MidiIn.h) parseert exact dat formaat, 1-based, met bounds-guard.
- **Onbekende typeIds worden firmware-zijdig netjes geteld en geskipt**; JSON-waardetypes (bool/int/float) worden aan beide kanten coulant geconverteerd.

### 1.2 Bug: poly-patches zijn op hardware effectief mono

**Symptoom:** een patch met N>1 stemmen klinkt op de Teensy monofoon; alleen voice 1 speelt.

**Keten:**

1. De firmware heeft twee werelden. Het *statische fallback-graph* (main.cpp) heeft een globale `MidiInModule` die in `setup()` op 4 stemmen wordt gezet — vandaar dat losse USB-MIDI zonder gepushte patch gewoon 4-stemmig polyfoon klinkt.
2. Zodra een patch wordt geactiveerd, wordt het statische graph auto-gemuted en neemt de dynamische runtime het over. De `tp_mmb_midiin`-instantie dáárin start in zijn constructor op **1 stem** (MidiIn.cpp: `alloc_.configure(1)`).
3. `applyPatchVoiceCount()` (main.cpp) is gebouwd om bij patch-activatie `patch["voiceCount"]` in elke MidiIn-instantie te pushen — het commentaar zegt letterlijk *"raise voiceCount in the editor, push, and watch the audio-block peak"*.
4. Maar `sendConfig()` (teensyLink.ts) reduceert elke patch tot `{id, name, rackIds, connections, controlState}` — **zonder `voiceCount`**. `applyPatchVoiceCount` leest dus altijd 0 en doet niets.
5. polyExpand heeft de kabels wél per stem uitgevouwen (`pitch2 → voct` van voice-VCO 2, enz.), maar de allocator wijst nooit een tweede stem toe: `pitch2`/`gate2` blijven dood.

**Oordeel:** oversight, geen besluit — de ontvangende kant is er duidelijk voor gebouwd.

**Fix (1 regel), in `sendConfig` patches-map:**

```ts
patches: flat.patches.map((p) => ({
  id:      p.id,
  name:    p.name,
  voiceCount: p.voiceCount,   // ← ontbreekt nu
  rackIds: p.rackIds,
  ...
```

### 1.3 Overige gaten en mismatches

| # | Bevinding | Locatie | Ernst |
|---|---|---|---|
| 1 | `attenuation` / `invert` worden meegestuurd maar door níets toegepast — niet door AudioGraph, niet door CvGraph, niet door de browser-sim. UI suggereert werking. | teensyLink.ts:224; CvGraph.cpp; AudioEngine.ts | Middel |
| 2 | `sendWaveform()` (wavetable, FW-AU-6) heeft **geen enkele aanroeper** in de editor. Firmware-pad is compleet; de teken-UI ontbreekt. | teensyLink.ts:302; DrawVcoModule.h | Middel |
| 3 | `tp_mmb_elements_reverb` is alleen in firmware geregistreerd; geen editor-type → onbereikbaar. | ElementsReverbModule.h | Laag |
| 4 | `tp_mmb_noise` bestaat alleen in de editor, maar wordt in de **simulator wél gebouwd** → patch klinkt in browser, is stil op Teensy, zonder waarschuwing. (`tp_mmb_sh`, quads: idem editor-only, maar gedocumenteerd als "hardware bestaat nog niet".) | AudioEngine.ts:659 | Middel |
| 5 | Simulator dekt de nieuwere firmware-modules niet (string, elements, comp, stereo_vca, fm_vco, comb, wt_vco, draw_vco, stk_sound, octa_vco) → stil in sim, klinkt op hardware. | AudioEngine.ts makeNode | Laag |
| 6 | Editor-AHDSR heeft `eoc`-uitgang die firmware niet kent (PortKind::None → stil geskipt). | seedModules.ts; Ahdsr.h | Laag |
| 7 | Editor-LFO heeft geen `gate`-jack terwijl firmware `Gated`/`OneShot` via poort `gate` ondersteunt → die run-modes zijn vanuit een patch niet aanstuurbaar. | seedModules.ts mmbLfo; Lfo.h | Laag |
| 8 | Default-verschillen zonder controlState: AHDSR release 400 ms (editor) vs 300 ms (fw); curve default Exp (editor `defaultIndex: 1`) vs Linear (fw). | seedModules.ts; Ahdsr.h | Laag |
| 9 | VCA `gain`/`resp` doen op firmware bewust (gedocumenteerd) niets; sim gedraagt zich mogelijk anders. | VcaModule.h | Laag |

### 1.4 Structurele aanbeveling: contract-borging

Het typeId/portId/controlId-contract leeft dubbel: in `seedModules.ts` en in ~25 C++ headers, gesynchroniseerd via doc-comments. Elk gat hierboven is precies dít mechanisme dat faalt. Aanbeveling: één gegenereerde catalogus (JSON met typeId → ports/kinds/controls) waar beide kanten uit lezen of tegen testen. Een host-side firmwaretest die het editor-contract inleest en per type `outputPortKind` / `inputPortKind` / `setControl`-ids afloopt, had `voiceCount`, `eoc`, `elements_reverb` en `noise` allemaal gevangen. Het testharnas in `firmware/core/tests/` is er al — dit past daar naadloos in.

---

## 2. Firmware — OO, hergebruik, architectuur

### 2.1 Sterk

- **Heldere hiërarchie:** `Module` → `CvModule` / `AudioModule` → concrete modules. Lagen: transport (TeensyLink) → state (ProjectRuntime) → graph-builders (AudioGraph/CvGraph, symmetrische API) → modules. Niet te diep, niet te plat.
- **RTTI-vrije dispatch** (`supportsAudioPorts()`, `asCvModule()`) netjes opgelost en uitstekend gedocumenteerd.
- **Registry met zelfregistrerende factories**: nieuwe module = 1 header + 1 regel in RegisterAllModules.h.
- **Reconcile-in-plaats-van-clear** in `applyConfig()` met retired-pool voor het AudioStream-lifetime-probleem: voorbeeldig gedocumenteerde pragmatische keuze.
- Doxygen-kwaliteit ver boven gemiddeld, incl. kruisverwijzingen naar de editor.

### 2.2 Verbeterpunten (volgorde van winst)

1. **`asFloat`/`asInt`/`asBool`-lambda's gedupliceerd in vrijwel elke module** (VcoModule.h, MidiIn.cpp, Ahdsr.cpp, …). → vrije functies naast `ControlValue` in Module.h: `mb::runtime::asFloat(value, fallback)`. Grootste en makkelijkste dedup (~300 regels).
2. **`registerFactory()` is ±10 regels identieke boilerplate per module.** → template-helper `registerModule<VcaModule>()` die `kTypeId` + constructor afleidt.
3. **CV→audio-proxypatroon** (`cvDc_` + vaste `AudioConnection` + `kCvSlewMs` de-zipper) staat gekopieerd in VcaModule én VcfModule en is nodig voor elke volgende gemoduleerde audiomodule. → klein composiet type `CvToAudioProxy` met `write(float)`.
4. **CvBus is een half aangelegde abstractie**: `CvGraph::build()` registreert slots, maar niemand `publish()`t of `read()`t ooit — `tickBridge()` praat rechtstreeks met de modules. Bewust voorbereid op het ISR-pad, maar nu dode code die de lezer misleidt. Verwijderen tot het ISR-pad er komt, of expliciet markeren.
5. **main.cpp draagt twee werelden** (statisch fallback-graph + eigen globale `midiIn` + dubbele MIDI-dispatch naast de dynamische runtime). Gedocumenteerd als B-fase-overgang, maar dit is de plek waar de volgende bug gaat wonen. → isoleren in een `StaticFallbackGraph`-klasse of verwijderen.
6. Retired-pool groeit onbegrensd bij herhaald her-pushen met wisselende module-sets (bewust lek, power-cycle schoont op). → waarschuwing loggen boven een drempel.

---

## 3. Editor — structuur en hergebruik

### 3.1 Sterk

- `types.ts`: uitstekend gedocumenteerd domeinmodel, nette v1→v2-migratie.
- `store.ts`: klein en passend (useSyncExternalStore + undo/redo met coalescing; geen Redux-overkill).
- `runtime/` met abstracte `Module` + `Registry` spiegelt de firmware bewust — mooie symmetrie.
- `polyExpand.ts`: pure functie met heldere expansieregels en ADR-referenties.
- `teensyLink.ts`: singleton buiten React met hook-brug — het juiste patroon.

### 3.2 Verbeterpunten

1. **AudioEngine.ts (1161 regels) is halverwege de Registry-migratie blijven steken.** Vco/Vcf/Vca/Ahdsr/Lfo lopen via `registry.create()`, maar noise, echo, phaser, cvmath, mixer, sequencer en midiin zijn nog inline typeId-checks met per-kind interfaces en drie grote switches (makeNode / setControl / dispose). Elke nieuwe module raakt drie plekken. → migratie afmaken: per kind een runtime-klasse (zoals `Vca.ts`, 62 regels, al voordoet); de engine wordt dan generiek. **Belangrijkste "meer OO"-winst aan editor-kant.**
2. **Monoliet-componenten:** RackPanel.tsx (1652), PatcherGraphPanel.tsx (1202), ModulePanel.tsx (856), PresetsModal.tsx (716). Geen OO-zonde in React, maar poly-groep-bewerking, kabelrendering en drag-logica zijn duidelijk afsplitsbare hooks/subcomponenten.
3. **seedModules.ts (2073 regels) mixt twee verantwoordelijkheden:** faceplate-cosmetiek (posities, kleuren, teksten) en het typecontract dat de firmware spiegelt (ports/controls). Contract-deel apart zetten maakt het diffbaar/testbaar tegen firmware (zie §1.4).
4. `effect-switcher/` en `modular-mb/` dupliceren het store-patroon en vergelijkbare panels. → `createProjectStore<T>()`. Lage prioriteit.

---

## 4. Prioriteitenlijst

| # | Actie | Impact | Status |
|---|---|---|---|
| 1 | `voiceCount: p.voiceCount` toevoegen in `sendConfig` (teensyLink.ts) | Poly werkt daadwerkelijk op hardware; 1 regel | ✔ gefixt 2026-07-05 |
| 2 | Contract-test firmware ↔ seedModules (host-side, in `firmware/core/tests/`) | Vangt deze hele klasse mismatches blijvend af | open |
| 3 | `attenuation`/`invert`: implementeren in `CvGraph::tickBridge()` of uit de UI | UI liegt nu | open |
| 4 | Editor waarschuwt welke modules "unknown" zijn op de Teensy (fw logt het al) | Sim-klinkt/hardware-zwijgt-verwarring weg | open |
| 5 | `asFloat`/`asInt`/`asBool` + `registerFactory` dedup (firmware) | ~300 regels boilerplate weg | open |
| 6 | AudioEngine-migratie naar Registry afmaken (editor) | Grootste architectuurwinst editor | open |
| 7 | Wavetable-draw-UI bouwen of `sendWaveform` als TODO markeren | Dead end opruimen | open |
| 8 | Gedeelde Elements-wrappers naar één library (zie §5.2) | Voorkomt drift tussen twee identieke kopieën | open |
| 9 | `tp_mmb_ominous` registreren + editor-type, of parkeren tot ADR 0012 af is | Onbereikbare module opruimen | open |

Daarnaast gefixt op 2026-07-05 (buiten de oorspronkelijke lijst): `seedModules.ts` verwees in `seedCvBridgePatch` naar een niet-bestaande `mixer` (compile-fout); `DeviceConfig` in `api/deviceApi.ts` beschreef een verzonnen draadformaat en is herschreven naar de werkelijke SwitcherProject-subset die de Pico/ESP32 serveert; `EditorSimulationPanel.tsx` is daarop getypeerd (`as any`-cast weg).

---

## 5. Addendum: app-elements (toegevoegd na de hoofdreview)

*Context (bevestigd door Mark): app-elements is bedoeld voor een **eigen Teensy-instantie**, 5-stemmig polyfoon. Binnen de brain draait Elements (via `tp_mmb_elements`) waarschijnlijk alleen monofoon — de brain-wrapper omvat één `elements::Part`.*

### 5.1 Sterk

- **Beste engineering-documentatie in de repo.** De README legt met gemeten cijfers vast waaróm de architectuur zo is: dual-thread patroon (loop() rendert 32 kHz in ringbuffers; PIT-ISR doet alleen resample+mix, 4,2% ISR-CPU) omdat `Part::Process()` te zwaar is voor de audio-ISR; DTCM/OCRAM-hybride layout incl. de DACCVIOL-analyse (vtables crashen in OCRAM); de ontdekking dat `Serial.printf` ~25 ms blokkeert → één-teken-per-loop() drain. Zelfs de mislukte 6-stemmen-poging (v0.6.0) is met reden gedocumenteerd.
- De monolithische low-level stijl van main.cpp (708 regels, globale ringbuffers, handmatige ISR) is hier **gerechtvaardigd**: dit is het harde realtime-pad; extra abstractie zou alleen maar CPU en duidelijkheid kosten.
- `PatchBank` (LittleFS, 128 slots) heeft een geversioneerd bestandsformaat met magic + v1→v2-migratie voor het naamveld.

### 5.2 Bevindingen

1. **Gedupliceerde wrapper-headers — gemiste opruimstap.** `ElementsModule.h` en `ElementsReverbModule.h` zijn byte-identiek aanwezig in app-elements én app-modular-brain; `AudioModule.h` in app-elements is een lokale kopie waarvan het eigen commentaar zegt *"when `tp_mmb_elements` graduates into app-modular-brain, delete this copy"*. De graduatie is gebeurd, de kopieën staan er nog. Omdat Elements bewust op beide targets moet kunnen draaien is verwijderen niet de fix: **verplaats de gedeelde wrappers naar één gedeelde library** (bv. naast `mi-elements` in `app-elements/lib/`), zodat beide apps dezelfde include gebruiken.
2. **Dode code binnen app-elements:** main.cpp gebruikt alleen `ElementsReverbStream` + `PatchBank`; `ElementsModule.h`, `OminousVoiceModule.h` en `AudioModule.h` zijn daar ongebruikt (ze dienen alleen als thuisbasis voor de brain-wrappers).
3. **`tp_mmb_ominous` is overal onbereikbaar:** `OminousVoiceModule::registerFactory()` wordt nergens aangeroepen (ook niet in RegisterAllModules.h van de brain) en de editor heeft geen seed-type. ADR 0012 beloofde Ominous als eigen routeerbare module — de wrapper is er, de registratieregel en het editorpaneel ontbreken.
4. **Hergebruik-mis:** de lokale `VoiceAlloc` + noteOn/noteOff in main.cpp herimplementeert `mb::VoiceAllocator` uit core, simpeler (geen oldest/lowest/highest steal) en zonder de unit-tests die core wél heeft.
5. **Naamverwarring:** twee ongerelateerde `PatchBank`-klassen (app-elements LittleFS-bank vs `mb::PatchBank` voor switcher-patches). Verschillende namespaces, geen conflict, wel verwarrend → `ElementsPatchBank` hernoemen.
6. Klein: in `handleControlChange` zit de sample rate in de CC 28-schaling gebakken (`(v * 2.0f) / 32000.0f`) — named constant waard.

### 5.3 Aansluiting

App-elements spreekt bewust een eigen protocol (MIDI CC's + serial-console `p save`/`p load N`), niet mmb-config.v1 — consistent met "eigen hardware-instantie". Het brain-pad (`tp_mmb_elements`, monofoon) loopt via het reguliere module-contract en is in §1 al gecontroleerd (typeId, ports en controls matchen).
