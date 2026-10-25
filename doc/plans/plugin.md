# Modules als audioplugin (proef 2026-10-15)

Mark kreeg de tip om modules als "Ableton-plugin" te verkopen. Live laadt
gewone VST3/AU-plugins (die in elke DAW werken); daarnaast is er Max for
Live (alleen Live Suite). De vraag was: is dat moeilijk? Antwoord na een
proef van één avond: de klank niet, de rest wel.

> **Proef gebouwd (2026-10-15):** `tools/plugin/`: HALL als VST3 en als
> Standalone-programma (JUCE 8.0.4, Windows). Bewezen zonder DAW:
> `mmb-plugin-check` laadt de VST3 zoals een DAW en rendert impulsresponsen;
> die zijn tot op twee decimalen gelijk aan de simulator (§2). **Bediening:
> ons eigen paneel (ModulePanel) in de webview van JUCE 8**, in beide
> richtingen gekoppeld aan de parameters (§2a). Kosten: € 0.

## 1. Wat er is

- `tools/plugin/CMakeLists.txt`: JUCE-project met twee doelen: **MmbHall**
  (VST3 + Standalone) en **MmbPluginCheck** (consoleprogramma, host).
- `src/HallPlugin.cpp`: `mmb_dsp::Hall` (dezelfde header als de Teensy en
  de wasm) achter een `juce::AudioProcessor`. Parameters met dezelfde
  bereiken als het paneel; alleen gewijzigde waarden gaan naar de kern.
  Bediening: `GenericAudioProcessorEditor` (een lijst schuiven; genoeg voor
  de proef).
- `src/PluginCheck.cpp`: laadt een `.vst3`, zet parameters op naam (door de
  VST3-grens ziet een host alleen namen en tekst), stuurt er een impuls door
  en schrijft een wav. `check_ir.py` meet RT60 per band, L/R-correlatie en
  de vertraging, met dezelfde rekenwijze als `hallMeasure.ts`.
- JUCE staat niet in de repo (clone bij het bouwen, zie de CMakeLists); de
  bouwmap ook niet.

## 2. De meting: plugin tegen simulator

Zelfde instellingen, impuls erin, Mix 1, Early 0:

| | start | RT60 midden | laag | hoog | L/R |
|---|---|---|---|---|---|
| Hall, Decay 3 — **VST3** | 28,34 ms | 2,74 s | 3,01 s | 2,01 s | 0,00 |
| Hall, Decay 3 — **wasm** | 28,34 ms | 2,74 s | 3,01 s | 2,01 s | 0,00 |
| Random Hall, Decay 1, Hi damp 1, Lo × 2, Pre 20 — **VST3** | 48,34 ms | 1,25 s | 1,90 s | 0,60 s | 0,01 |
| idem — **wasm** | 48,34 ms | 1,25 s | 1,90 s | 0,60 s | 0,01 |

Eén kern, drie gastheren (Teensy, wasm, plugin): dezelfde klank. De
Standalone start en draait (venster "MMB HALL"). Nog niet in een DAW
gedraaid: op deze pc staat geen Live of Reaper.

## 2a. De bediening: het editorpaneel in de plugin (gebouwd, 2026-10-15)

Open vraag 1 is beantwoord: **de webview werkt**, en het paneel uit de
editor is de bediening van de plugin.

- `editor/src/plugin-ui/`: een kleine React-app die `ModulePanel` toont
  voor één moduletype (`?type=`), met `juceBridge.ts` tussen de knoppen en
  JUCE's relays (`WebSliderRelay` enz.). `npm run build:plugin-ui` (met
  `MMB_JUCE_DIR`) bundelt hem naar `tools/plugin/web/` (één pagina, vaste
  namen; niet in git); de plugin neemt die op als binary data en serveert
  hem via een `ResourceProvider`. Op Windows is WebView2 statisch gelinkt
  (NuGet-pakket, zie README).
- **Bewezen met `mmb-plugin-check … editor=<s> poke=decay:20`:** de
  bediening gaat open zoals in een DAW; een muissleep op Size in het paneel
  zet de parameter (0,6 → 1,0); een parameter die de gastheer zet
  (decay=7 vooraf, 20 halverwege) staat in het paneel; alle twaalf
  beginstanden komen binnen. De pagina meldt wat hij ontvangt via een
  native functie `mmbLog` (stdout van de gastheer).
- **Eigenaardigheid van JUCE 8.0.4:** de beginstand die de JS-bibliotheek
  zelf opvraagt bij het aanmaken van een state komt tijdens het laden van de
  pagina niet aan; latere updates wel. Oplossing in `main.tsx`: na het
  koppelen nog eens opvragen (150/500/1500/4000 ms) tot de eerste waarde er
  is.
- Nog niet: schalen (het paneel is 285 × 514 px, 4 px/mm, vast), het
  schermtoetsenbord en de helpteksten van de editor, een Mac-webview.

## 2b. Instrument: de SID als plugin, en parameters uit het paneel (2026-10-15)

Open vraag 2 is beantwoord: **een instrument werkt**, met een kleine
stemverdeler in de plugin.

- `tools/plugin/src/MmbPluginBase.h`: de romp voor elke module (parameters,
  toestand, webview-editor). Een module is nog ~60 regels: `applyControl`
  (de vertaling uit de wasm-gastheer), `prepare`, `render`.
- **Parameters komen uit het paneel**: `editor/scripts/pluginParams.ts`
  leest de knoppen, schakelaars en toggles van een moduletype uit
  `seedModules.ts` en schrijft `generated/<typeId>_params.h` (id, naam,
  soort, bereik, standaard, stap, log-taper, standen). Eén bron voor editor,
  simulator en plugin; de relay in de webview heet als de knop. HALL: 12
  parameters, SID: 26.
- **SID** (`SidPlugin.cpp`): `mmb_dsp::SidMulti` (dezelfde header als de
  Teensy en de wasm); de noten van de DAW gaan naar cellen (chips × 3
  stemmen): dezelfde noot opnieuw → die cel, anders de langst vrije, anders
  de oudste stelen; pitchbend ±2 halve tonen; V/oct met MIDI 60 = 0 V zoals
  overal in MMB. In de editor doet MIDI-IN dit; de core-runtime hoefde niet
  mee.
- Gemeten met `mmb-plugin-check … notes=60,64,67`: C4, E4 en G4 even sterk
  aanwezig, D4 niet, stilte na het loslaten. Het SID-paneel (20 HP, 408 px
  breed) verschijnt in de Standalone.
- JUCE maakt voor een instrument standaard 2080 extra "MIDI CC"-parameters
  (16 kanalen × 130); uitgezet (`JUCE_VST3_EMULATE_MIDI_CC_WITH_PARAMETERS=0`),
  anders staat de parameterlijst in de DAW vol.
- Een nieuwe module is nu: typeId in `build:plugin-ui`, één `…Plugin.cpp`,
  één regel in de CMakeLists (README).

## 2c. Elf modules erbij, gegenereerd (2026-10-15)

Alles op de uniforme kern-interface (`Init/setControl/setCv/cvOut/Process`,
zoals `KernelStream.h` op de Teensy en `kernel_host.h` in de wasm) is nu
automatisch een plugin: `pluginParams.ts` leest naast het paneel ook de
wasm-gastheer (`tools/mmb-wasm/<naam>_wasm.cc`: kernklasse, in/uit,
knopvolgorde) en schrijft per module `<typeId>_kernel.h`,
`<typeId>_plugin.cpp` en een regel in `generated/modules.cmake`;
`KernelPlugin.h` is de generieke processor. Een mono-kern draait twee keer
(links en rechts), een stereo-kern één keer; CV-ingangen staan op 0.

Gebouwd en met `mmb-plugin-check` geladen en gerenderd: **CONV** (hier wél
4 s), **LADDER**, **SEM**, **DRIVE**, **TUBE**, **FOLDER**, **FREQSHIFT**,
**WAH**, **LPG**, **ENSEMBLE**, **DIFFUSEUR** — plus HALL en SID: 13
plugins. Let op: de LPG staat zonder trigger of CV dicht (Offset omhoog om
hem te openen); dat soort modules heeft in een DAW een andere bediening
nodig (Offset als hoofdknop, of een trigger uit MIDI).

Nog niet op de uniforme interface (eigen gastheer, per stuk een adapter
zoals SidPlugin): REVERB, SHIMMER, de compressors en EQ's, tape/echo/BBD,
ringmod, octaver, harmonizer, tremolo, phaser, vibe, rotary, MS-20, en de
Mutable-ports. Instrumenten op de interface (acid, cmi, complex, e-piano,
martenot, mixtur, organ, synthex) wachten op een generieke notenvertaling
(MIDI → de `voct`/`gate`-CV's van de kern), de volgende stap.

## 2d. De hele bibliotheek: 73 plugins (2026-10-16)

Mark: "wat mij betreft de hele bibliotheek, behalve de CV- en mixdingen".
Gebouwd en met `mmb-plugin-check` geladen en gerenderd: **73 VST3's**, geen
enkele crash.

- **Notenvertaler** `NoteMap.h`: MIDI → voct/gate/vel. Mono met een
  notenstapel (laatste noot wint, legato), poly met cellen (zelfde
  verdeling als de SID), sustainpedaal, pitchbend ±2. Gebruikt door beide
  rompen; de instrumenten op de kern-interface (acid, e-piano, organ,
  synthex, martenot, mixtur, CMI, complex, rungler) spelen daarmee met een
  eigen instantie per exemplaar.
- **CV-ingangen worden parameters**: "<poort> (CV)" −1..1 telt op bij de
  knop (zoals op de Teensy), een gate wordt aan/uit. Zolang de parameter 0
  is geldt de poort als niet aangesloten. Automation, MIDI learn en de
  modulators van Live/Bitwig werken er zo meteen op; audio-rate CV via een
  sidechain-bus is een latere stap.
- **De wasm-gastheer als plugin** (`AbiPlugin.h`): voor alles zonder
  uniforme kern-interface compileert de plugin `tools/mmb-wasm/<naam>_wasm.cc`
  zelf, met de bronnen en include-mappen uit `build.sh` (de generator leest
  dat script). Letterlijk dezelfde code als de simulator, op de eigen
  samplerate van de module (32/44,1/48 kHz) met een Lagrange-resampler
  naar de DAW. Zo kwamen in één keer mee: REVERB, SHIMMER, alle compressors
  en EQ's, tape/echo/BBD, ringmod, octaver, harmonizer, tremolo, phasers,
  vibe, rotary, VCF/MS-20, STK, FOF, de onderzoeksmodules, SID3, CR-78, en
  de Mutable-ports Elements, Rings, Plaits, Clouds, Beads, Warps, Peaks.
- **Bouw op Windows met clang-cl** (LLVM): MSVC struikelt over de
  GCC-extensies in de Mutable- en STK-code (VLA's, `__attribute__`, lege
  arrays). De generator zet `_USE_MATH_DEFINES`; `cstdio` wordt alleen voor
  C++ vooraf ingevoegd (een C-bestand van JUCE brak er anders op).
- **Niet meegenomen**: CV-modules (1 kHz), mixers en VCA-banken, MIDI-IN,
  sampler/ZANG/tapestrip (banken uit de editor), DX7 (licentie
  fabrieksbanken open), pads/percuter/rhythm (triggers, nog geen vertaling).
- **Beperking van de gastheer-route**: globale toestand, dus één exemplaar
  per plugin per DAW-proces (een tweede blijft stil en meldt dat op
  stdout). Voor een product moet elke gastheer een klasse worden; de 22 op
  de kern-interface plus HALL en SID hebben dat al.
- Standaardstand die stil is, geen fout: LPG (Offset omhoog), BEADS en
  WARPS (willen signaal en instelling), RINGMOD (nog bekijken).
  MIDI-gebeurtenissen gelden per DAW-blok, niet per sample.

**Eerste echte gastheer (2026-10-15): Audacity 4.0.1** (open source, Windows)
valideerde beide VST3's bij het scannen: HALL als effect, "realtime
capable" (dus ook live op een spoor); SID als "Unknown", want Audacity
heeft geen MIDI en kent geen instrumenten. Let op: Audacity 4 kijkt alleen
in `C:\Program Files\Common Files\VST3` (beheerder nodig om daar te
kopiëren) en scant bij het opstarten.

Op de Mac bouwen: het recept staat in
[plugin-mac-overdracht.md](plugin-mac-overdracht.md).

## 2e. Mac (2026-10-25)

Eerste keer op een Mac: MacBook Pro 2016, Intel x86_64, macOS 15.6.1.
Recept: [plugin-mac-overdracht.md](plugin-mac-overdracht.md).

- **Bouwen zonder Xcode en Homebrew.** De Command Line Tools (Apple clang
  17) zijn genoeg. CMake 4.4 en Ninja komen uit pip, in een eigen venv
  (`python3 -m venv ~/src/buildtools && ~/src/buildtools/bin/pip install
  cmake ninja`). JUCE bouwt de AU (v2) ook met Ninja. CMake 4 had geen
  `CMAKE_POLICY_VERSION_MINIMUM` nodig. Het levert x86_64 op, zonder fouten
  of waarschuwingen. HALL, SID en het controleprogramma kosten een paar
  minuten, PLAITS en REVERB samen 2,5 min (8 kernen).
- **Klank gelijk aan Windows en de simulator.** HALL-IR: RT60 2,74 / 3,01 /
  2,01 s, start 28,34 ms. Het SID-akkoord C-E-G heeft een piek van 0,952.
  PLAITS (noot 48) en REVERB geven geluid.
- **De webview werkt (WebKit).** Het paneel opent (284 × 514) en de
  beginstand komt aan. Net als op Windows lukt dat pas bij de herhaalde
  opvraag na 150 ms, dus die herhaling blijft nodig. Een poke vanuit de
  gastheer (Decay → 20) bereikt de pagina. Elke waarde komt twee keer
  binnen, via `valueChangedEvent` en `propertiesChangedEvent` in
  `juceBridge.ts`. Dat is onschuldig.
- **auval:** `AU VALIDATION SUCCEEDED` voor HALL (`aufx Hall Mmbr`), SID
  (`aumu Sid1 Mmbr`), PLAITS (`aumu Plai Mmbr`) en REVERB
  (`aufx Reve Mmbr`).
- **Valkuil: lege bundels.** Bij het configureren maakt CMake voor alle 73
  modules al de mappen `.component`, `.vst3` en `.app` aan, zonder binair
  bestand. Tel dus niet met `find`, maar kijk in `Contents/MacOS/`. Een lege
  `.component` in `~/Library/Audio/Plug-Ins/Components` geeft bij auval
  "didn't find the component".
- **Valkuil: naam van het controleprogramma.** Met Ninja heet het
  `build-mac/MmbPluginCheck_artefacts/Release/MmbPluginCheck`, niet
  `mmb-plugin-check`, want `PRODUCT_NAME` geldt niet voor een console-app.
  Het laadt alleen VST3, geen `.component`.
- **Logic (door Mark):** alle vier door Logic's eigen scan
  ("validation result success"). HALL, SID, PLAITS en REVERB staan onder
  Audio Units → MusicBrain (instrumenten onder AU Instruments). Het paneel
  verschijnt en speelt. Reaper laadt de VST3's ook.
- **WebKit selecteerde tekst** bij een klik of sleep naast een knop: alle
  labels werden blauw. Opgelost met `user-select: none` op de pagina
  (`plugin-ui/index.html`); op Windows viel dat niet op.
- **Vergroten.** Het paneel (4 px/mm, HALL 284 × 514) was klein naast de
  Logic-plugins (zo'n 1000 px breed). Logic's eigen "View %" geldt alleen
  voor Apple's plugins. Nu is het venster vergrootbaar met een vaste
  verhouding: het begint op 1,5× en gaat tot 4×, en de pagina tekent op
  `innerHeight / 128,5 mm`. Er is een sleephoek in de pagina (native
  functie `mmbResize`), want de native webview ligt over JUCE's eigen hoek
  heen. De schaal staat als `uiScale` in de toestand en komt dus met het
  project mee.
- **Waardevenster.** De editor toont waarden in de eigenschappenkolom, de
  plugin had die niet. Nu staat tijdens het draaien onderin "Decay 3,20 s".
- **Fabriekspresets.** Bron: `editor/src/modular-mb/modulePresets.ts` (plus
  test). `pluginParams.ts` zet ze in `generated/<typeId>_params.h`, en de
  plugin biedt ze als programma's aan (0 = "Standaard"). In Logic staan ze
  in het presetmenu, en auval meldt "HAS FACTORY PRESETS". HALL heeft er 7,
  waaronder Marks eigen "Chamber". **Bewaren in Logic (Save As…)** schrijft
  `~/Library/Audio/Presets/MusicBrain/MMB <NAAM>/<naam>.aupreset`. Daarin
  staat `jucePluginState`: "VC2!" plus 4 bytes lengte, gevolgd door XML met
  `<PARAM id=… value=…>` op de control-ids. Zo komt een preset van Mark
  terug in `modulePresets.ts`.
- **Klank naast Logic (arpeggio, chamber-instellingen):** Mark vindt HALL
  "vriendelijker, minder metalig" dan Space Designer (2.7s Big Chamber) en
  Quantec QRS (Royal Chamber). Gemeten op de natte staart: in het laag
  gelijk (T60 ~3 s), maar bij HALL zakt 1–3 kHz sneller (1,8 s tegen
  2,7/2,3 s). Het zwaartepunt van de staart ligt na 1 s bij 170 Hz, tegen
  590/720 Hz bij de andere twee. Logic's algoritmische tegenhanger van HALL
  is ChromaVerb. Volgende stap: impulsresponsen (Mark bouncet
  `impuls.wav`) en HALL laten zoeken naar Big Chamber.
- **Nog open:** Retina-scherpte op een groter scherm, een liggende
  plugin-indeling (voortbouwend op `frontControls.ts`), presets voor de
  andere modules, presets in de editor zelf, en een universele build.

## 3. Wat het kostte en wat het zou kosten

- De proef: een avond, € 0. JUCE heeft een gratis tier; een lokaal gebouwde
  plugin heeft geen handtekening nodig (Windows laadt elke DLL; op de Mac
  blokkeert Gatekeeper alleen wat van internet komt).
- Een **verkoopbare** versie per module, schatting:
  - bediening: is er (§2a); nog schalen en afwerken;
  - signeren en installers: Mac notarisatie (Apple Developer ~€ 100/jaar) en
    Windows-certificaat (een paar honderd euro per jaar) of de
    SmartScreen-waarschuwing accepteren; de eerste keer een paar dagen;
  - testen in Live, Logic, Reaper, Cubase, FL (samplerates, blokgroottes,
    automation, state): een week per eerste release;
  - winkel (Gumroad/Lemon Squeezy voor de btw), licentiesleutels, support,
    updates bij elke macOS- en DAW-versie: doorlopend.
- Elke volgende module uit `mmb_dsp` is uren werk voor de audio; de GUI en
  het testen blijven.

## 4. Open vragen

1. **Bediening.** Beantwoord: het editorpaneel in de webview (§2a).
   Open blijft: de Mac (WebKit) en schalen.
2. **Instrumenten.** Beantwoord: de SID speelt, met een stemverdeler in de
   plugin (§2b). Nog open voor andere instrumenten: velocity, aftertouch,
   sustainpedaal, en modules die in de editor via losse envelopes/VCA's
   spelen (die hebben een "stem" nodig, zoals de Ladder-stem).
3. **Welke modules eerst.** Eigen code en opvallend: HALL, CONV (in de
   plugin kan 4 s wél, een pc heeft het geheugen), de SID, de Ladder/MS-20/
   SEM-filters, de compressors en EQ's. De Mutable-ports (MIT) mogen
   commercieel met naamsvermelding, maar niet onder de naam Mutable
   Instruments. DX7: de engine waarschijnlijk wel, de fabrieksbanken niet
   (open). Vóór verkoop een licentie-sweep per module.
4. **Mac.** Zelf bouwen op een Mac (AU + VST3) kan pas als er een Mac is;
   tot die tijd Windows-only testen.
5. **Max for Live** apart: kleinere markt, Max-bediening, onze kernen als
   Max-external. Niet als eerste.
6. **De jacks op het paneel.** In een plugin zijn er geen kabels. Voorstel:
   de audio-jacks L/R blijven staan als de in- en uitgang van de plugin
   (eventueel met signaalindicatie); de CV- en gate-jacks worden grijs of
   verdwijnen, want modulatie komt in een DAW uit automation en MIDI
   (Freeze is al een parameter). Later eventueel: CV-ingangen als
   sidechain-bus voor DAW's die CV kunnen routeren (Bitwig, Reaper).
7. **Plaats in het verhaal:** de plugin als software-tweeling van de Brain
   (bij de hardware, of als opstap ernaartoe).

## 5. Stappen (als Mark door wil)

1. Mark laadt `MMB HALL.vst3` in Live (gebruikersmap
   `%LOCALAPPDATA%\Programs\Common\VST3`, daar staat hij) en luistert.
2. ~~GUI-proef~~ gedaan: webview met `ModulePanel` (§2a).
3. ~~Een instrument (SID)~~ gedaan (§2b). Volgende: CONV (4 s kan in een
   plugin), Mac-bouw (README heeft het recept), velocity/pedaal.
4. Licentie-sweep en naamgeving.
5. Dan pas: signeren, installers, winkel.
