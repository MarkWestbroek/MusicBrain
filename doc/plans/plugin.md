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
- **Sidechain** (2026-10-30): een module met een audio-ingang `sc` (PUMP,
  Bus comp) krijgt een tweede ingangsbus "Sidechain" (mono of stereo, de
  som gaat naar `sc`). `sc` telt als aangesloten zodra er eens iets op die
  bus binnenkwam; daarvoor luistert de detector naar de eigen ingang.
  Testen: `MmbPluginCheck <plugin> uit.wav 1 in=pad.wav sc=kick.wav`.
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
- **Zeven modules erbij op de Mac** (2026-10-25): ROTARY (Leslie), ORGAN,
  EPIANO, ACID, TAPE ECHO, CLOUDS en ELEMENTS. Alle elf zijn door auval en
  geven geluid in `MmbPluginCheck`. ROTARY, TAPE ECHO, CLOUDS, ELEMENTS,
  PLAITS en REVERB lopen via de gastheer (één exemplaar per project).
- **Twee fouten gevonden en hersteld (gelden ook op Windows):**
  - *Schuiven werden geen parameter.* `pluginParams.ts` kende alleen knop,
    schakelaar en toggle, dus de negen drawbars van ORGAN zaten niet in de
    plugin (en AHDSR/FADERS niet, maar die zijn geen plugin). Nu is een
    `slider` een Float-parameter: ORGAN gaat van 7 naar 16 parameters.
  - *Een CV-ingang die heet als een knop* (ACID `accent`, CLOUDS `freeze`)
    werd een tweede parameter met hetzelfde id. auval faalde daarop
    ("Parameter values are different since last set"). Erger: de CV-waarde
    kwam bij de knop terecht in plaats van bij de ingang. Nu krijgt zo'n
    ingang het id `<naam>_in`, en de romp roept voor de extra parameters
    `applyCv(poort)` aan in plaats van `applyControl` (`MmbPluginBase.h`,
    `KernelPlugin.h`, `AbiPlugin.h`).
- **Presets voor tien modules** (voorzetten, nog niet beluisterd): HALL 7,
  REVERB 5, ROTARY 5, ORGAN 6 (drawbar-registers als naam), EPIANO 5,
  ACID 4, TAPE ECHO 5, CLOUDS 5, SID 7, PLAITS 7 en ELEMENTS 5.
- **Nog open:** Retina-scherpte op een groter scherm, een liggende
  plugin-indeling (voortbouwend op `frontControls.ts`), presets voor de
  andere modules, presets in de editor zelf, en een universele build.

### Windows-controle van de Mac-wijzigingen (2026-10-25)

Na b08793f op Windows (clang-cl, JUCE 8.0.4) nagelopen:

- **Alle 73 bouwen** met de nieuwe romp (presets, vergroten) en geven
  geluid in `mmb-plugin-check`.
- **Presets:** HALL toont 8 programma's ("Standaard" + 7); `program=3`
  (Concertzaal) zet de knoppen, galmtijd gemeten 2,65 s. Het
  controleprogramma toont nu de programma's en kiest er een met
  `program=<n>`. Een VST3-gastheer ziet er ook een parameter "Program" bij.
- **Vergroten in WebView2:** de sleephoek in de pagina werkt (van 1,5×,
  427 × 771, naar 1×, 284 × 514), verhouding vast, paneel schaalt mee.
- **Valkuil:** Windows' opslagbeheer ruimde na een update de JUCE-checkout
  in Temp half op (de webbundel faalde op `@juce/index.js`). JUCE en de
  bouwmap staan nu in `C:\Users\User\src\` (JUCE, mmb-plugin-build), zoals
  `~/src/JUCE` op de Mac.

### Mac, tweede ronde: ROTARY schoner, SID-filter aan, presets voor alle (2026-10-27)

Mark speelde de elf in Logic: ROTARY klonk "erg scherp over-driven", en op
de SID "werken een boel knoppen niet".

- **ROTARY: de voorversterker vervormde al bij Drive 0.** De curve
  `v/(1+|v|)` buigt vanaf nul. Een sinus op 0,9 kreeg zo 3,9 %
  vervorming bij Drive 0 en 5,9 % bij de standaard 0,2, bijna allemaal
  de derde harmonische. ORGAN levert zelf pieken van 0,88, dus de editor
  en de Teensy klonken net zo. Nieuw in `mmb_dsp/leslie.h`: tanh (als
  Padé-benadering) met voorversterking `0,3 + 6·drive²` en een
  niveaucorrectie per drive-stand. Gemeten bij 0,9 in: 0,2 % (Drive 0),
  0,7 % (0,2), 8,3 % (0,65), 12 % (1). Het kraken komt nu pas als je
  Drive opendraait, zoals bij een echte Leslie-voorversterker.
  `editor/public/wasm/tp_mmb_rotary.wasm` moet nog opnieuw gebouwd
  worden; op de Mac staat geen emcc.
- **SID: de knoppen werken, maar veel alleen in een bepaalde stand.**
  Gemeten met `MmbPluginCheck`: elke parameter komt aan. Cutoff, Res,
  Curve en LP/BP/HP doen alleen iets als Filt aan staat, en dat stond
  standaard uit. Daarnaast werkt Combo alleen met twee golfvormen aan,
  Ring alleen op Tri, en Spread alleen bij meer dan één SID. Dat klopt
  met de chip, maar in een plugin lijkt het stuk. Nieuw:
  `PLUGIN_DEFAULTS` in `modulePresets.ts` geeft een plugin een eigen
  beginstand. Voor de SID is dat Filt aan; het editorpaneel blijft zoals
  het is.
- **Fabriekspresets voor alle modules** (4–6 per module, nog niet
  beluisterd). De test legt elke waarde langs het paneel, ook
  `PLUGIN_DEFAULTS`. DRAW-VCO had er eerst geen: zijn klank is de
  getekende vorm, en die is geen parameter. Hij heeft nu een
  Vorm-schakelaar (`shape`: Getekend, Sinus, Driehoek, Zaag, Blok, Puls,
  Orgel) en zeven presets. Stap 2 is tekenen in het paneel. In de
  plugin komt de tekening dan in de opgeslagen projectgegevens
  (getStateInformation), en de editor moet hem in de patch gaan bewaren.
- **STK SOUND bouwde niet op de Mac.** Mach-O kent de ELF-sectienaam
  `.progmem.mandolin` niet (`MandolinData.h`, en de generator
  `gen_mandolin_data.py`). Op de Mac valt de sectie nu weg; de Teensy
  blijft gelijk.
- **Alle 73 bouwen op de Mac:** eerst gepauzeerd op Marks verzoek, later
  afgemaakt. Alle 73 zijn gebouwd en geïnstalleerd en slagen voor auval.
  Een korte render geeft bij elke plugin geluid, behalve bij LPG in de
  standaardstand: die is dicht zonder CV. Met het eerste preset meet LPG
  een piek van 0,77.

### Banken in de plugin: SAMPLER en TAPE STRIP (2026-10-27)

Stap 1 van [plugin-patches.md](plugin-patches.md). Mark miste de Mellotron
(TAPE STRIP) tussen de AU's. Die en de SAMPLER stonden in `EXCLUDE`, omdat
ze uit een bank spelen die de editor laadt. Nu laadt de plugin de bank zelf.

- **Bank-knop, zoals op de Teensy.** De knop (0–63, sinds 2026-10-30; was 0–15) kiest een `.mmbs` uit
  de bankmap (`~/Library/Application Support/MusicBrain/banks`, op Windows
  `%APPDATA%\MusicBrain\banks`). Welk bestand bij welke stand hoort, staat
  in de `defaults` van `index.json`, dezelfde als in `editor/public/banks`.
  Die map speelt de rol van de SD-kaart. Installeren: de inhoud van
  `editor/public/banks` daarheen kopiëren (212 MB).
- **Eigen bank.** "Eigen…" in de balk onder het paneel opent een
  bestandskiezer. De gekozen bank gaat mee in de projecttoestand en heeft
  voorrang op de knop; "Knop" zet de knop terug. Toestand met eigen bank:
  `MMBP`, lengte en XML-blok, naam, lengte en de `.mmbs` zelf. Zonder eigen
  bank blijft het gewone JUCE-formaat, dus oude projecten openen gewoon.
- **Knopbank vasthouden (2026-10-30).** Een knopbank wordt bewaard als
  nummer én bestandsnaam (`bankKnob`/`bankFile` in de toestand). Bij het
  openen gaat de naam voor: staat er op dat nummer intussen een andere
  bank, dan laadt de plugin toch het bewaarde bestand, met een gele
  melding op het paneel en in de bankbalk ("bewaard bestand
  gu-warmpad.mmbs; op 03 staat nu gu-harp"). Is het bestand weg, dan het
  nummer, met de melding dat het ontbreekt. Draait de knop daarna, dan
  geldt het nummer weer. Projecten van vóór deze versie hebben alleen het
  nummer. Testen: `MmbPluginCheck ... bank=3 savestate=s.bin`, dan
  `loadstate=s.bin`.
- **Laden op een eigen thread (2026-10-30).** `applyCurrentBank` kiest op
  de message-thread wat er moet komen, zet `BankInfo::loading` en meldt
  dat (paneel, DAW-tekst "— laden…"); lezen en `applyBank` doet
  `bankPool_`, onder de callback-lock alleen het overzetten. `bankGen_`
  laat een oudere lading stoppen. Een afgeleide klasse met `applyBank`
  roept `stopBankLoads()` in zijn destructor.
- **Hoe het laden gaat.** `AbiPlugin.h` (vlag `MMB_PLUGIN_BANK`, door de
  generator gezet voor gastheren met `mmb_zone_set`) leest de `.mmbs` met
  de structs uit `mmb_dsp/sample_bank.h` en roept dezelfde blob- en
  zone-exports aan als de worklet van de simulator. Laden gebeurt op de
  message-thread onder de callback-lock (`MmbPluginBase.h`): het audioblok
  wacht zolang. Een bank die al in de module zit, wordt niet opnieuw
  geladen.
- **Gemeten met `MmbPluginCheck`** (nieuw: `ownbank=<.mmbs>` zet een eigen
  bank in de VST3-toestand, zoals een DAW hem bewaart):
  - SAMPLER: Bank 0 "Tine Electric Piano" (piek 0,08), Bank 1 "Grand
    Piano" (62 MB, piek 0,43), Bank 3 "Warm Pad" (0,49), Bank 9
    "Tonewheel Organ" (0,05).
  - TAPE STRIP: Bank 0 en 3 geven hetzelfde beeld.
  - Eigen bank "Concert Choir": hij komt terug uit de toestand (1,45 MB,
    `MMBP`), klinkt (piek 0,14), en Bank=5 erbovenop laat hem staan.
- **Alle 75 opnieuw gebouwd** (de basisheader veranderde), geïnstalleerd
  en geregistreerd. auval: 75/75 geslaagd. In Logic heten de twee nieuwe
  "MMB SAMPLER" en "MMB TAPESTRIP".
- **Nog niet:** ZANG en DX7 laden andere bankformaten. Slepen naar het
  venster werkt niet: de native webview vangt het slepen af.
- Een tweede exemplaar in hetzelfde proces bleef eerst stil, zoals bij
  alle gastheer-plugins. Opgelost met wasm2c (hieronder): elk exemplaar
  heeft nu zijn eigen bank.
- `AbiPlugin` vraagt nu vóór `mmb_init` om de rate van de DAW
  (`mmb_set_rate`, MODULES, `ac1aef2`). Een gastheer-module met
  `MMB_RATE_FLEX` rekent dan op 48 of 96 kHz. Op dit moment is dat alleen
  LADDER, en die draait in de plugin als kernplugin, al op de rate van de
  DAW.

### Meerdere exemplaren: de gastheer-plugins via wasm2c (2026-10-29)

Stap 2 van [plugin-patches.md](plugin-patches.md). De 53 plugins die via de
wasm-gastheer liepen, konden maar één keer per project draaien: een tweede
exemplaar bleef stil. Nu draaien ze de `.wasm` van de simulator
(`editor/public/wasm`) als C, gemaakt door wasm2c, met een eigen instantie
per exemplaar.

- **Opbouw:**
  - `HostProcessor.h` is de plugin, gelijk voor elke gastheer.
  - `W2cPlugin.h` is de wasm2c-host. Hij heeft per exemplaar een eigen
    geheugen. Een trap in de module maakt alleen die module stil; de DAW
    loopt door.
  - `AbiPlugin.h` blijft als native host (`MMB_PLUGIN_NATIVE=1`), om te
    vergelijken.
  - CMake draait per module `tools/plugin/wasm2c/gen_w2c.py`, die wasm2c
    aanroept en de verbindingscode schrijft: welke optionele exports er
    zijn en lege WASI-functies.
  - Geheugen met expliciete bounds checks: geen signal handler en geen
    gereserveerde gigabytes in de DAW.
- **Gemeten tegen native** (`MmbPluginCheck`, 2 s, effecten met een
  testsignaal en instrumenten met drie noten):
  - 35 van de 53 zijn bit voor bit gelijk, ook SAMPLER met bank.
  - 17 wijken 82–199 dB af. De wasm brengt zijn eigen wiskundebibliotheek
    mee; het verschil is onhoorbaar.
  - STK SOUND wijkt af omdat zijn ruis native met `time(NULL)` gezaaid
    wordt en bij elke start anders klinkt. Via wasm2c is hij voorspelbaar,
    zoals in de simulator. De omhullende is gelijk.
- **Twee exemplaren** (`instances=2`, blok om blok door elkaar gedraaid):
  bij alle 53 is het tweede exemplaar exact gelijk aan het eerste, zonder
  traps. auval: 75/75. Grootte: ~5 MB per AU, zoals voorheen.
- **Bouwen:** wabt (wasm2c) eenmalig, plus `-DMMB_WABT_DIR` bij de
  configure; zie `tools/plugin/README.md`. Wat de plugin draait, is
  daarmee precies de `.wasm` van de simulator: een nieuwe `.wasm` bouwt
  de plugin vanzelf opnieuw.

### Patch-plugins: een hele patch als één AU/VST3 (2026-10-29)

Stap 3 van [plugin-patches.md](plugin-patches.md). Twee seeds zijn nu een
plugin: "MMB Poly 8" (de seed "8-stemmig", 54 modules) en "MMB CS-80
Brass" (51 modules, de acht knoppen van het front als parameters).

- **Drie klassen, elk met één taak:**
  - `PatchEngine.h` draait de patch: de JSON die de Teensy krijgt
    (`buildConfigPayload`), met elke module als wasm2c-instantie en
    MIXER8/OUT native, volgens de firmware.
  - `PatchPlugin.h` (`PatchHost`) laat de patch eruitzien als één module
    voor de plugin-romp. Een parameter gaat naar alle stemmen van zijn
    poly-groep (`polyControlTargets`, zoals `setPatchControl`).
  - `HostProcessor<PatchHost>` is dezelfde romp als die van de losse
    modules: samplerate, toestand, parameters.
- **Timing volgens de firmware** (afgestemd met MODULES):
  - CV tikt op 1 kHz met een fractionele teller.
  - Per tik: eerst MIDI tot die tik, dan alle CV-modules, dan de bridge.
    De bridge schrijft alleen bij een verandering, met een geheugen per
    kabel.
  - Daarna een audioblok van 32 samples. Kabels die audio en CV mengen,
    worden overgeslagen, net als op de Teensy.
- **MIDI** gaat onbewerkt naar de MIDI-IN-wasm (`mmb_midi`). Die doet
  stemtoewijzing, aftertouch (kanaal en per toets), modwheel, pitchbend en
  CC's met de firmwarecode zelf.
  - In VST3 komen CC's, aftertouch en pitchbend als parameters binnen. De
    patch-plugins zetten daarom `JUCE_VST3_EMULATE_MIDI_CC_WITH_PARAMETERS`
    aan (2080 verborgen MIDI-parameters); de losse modules niet.
  - Een AU in Logic krijgt gewoon MIDI.
- **Gemeten** (`MmbPluginCheck`, nieuw: `press=` en `cc=`):
  - Poly 8 met C3, C4, E4, G4: pieken op 131, 262, 330 en 392 Hz. De
    omhullende zakt na de aanslag naar sustain en is 0,5 s na het loslaten
    stil.
  - CS-80: aftertouch vanaf 1 s tilt het spectrale zwaartepunt van ±370
    naar ±1750 Hz (het filter gaat open). Het modwheel verandert de klank.
  - Poly 8 met acht noten: 20 s audio in 1,9 s, inclusief laden.
  - auval 77/77.
- **Het front als bediening (2026-10-29, later):** de patch-plugins openen
  het front van de patch, met de fronts als tabs (CS-80: Spelen,
  Effecten), in dezelfde webweergave als de losse modules
  (`src/plugin-ui/main.tsx`, `?type=patch_…`).
  - Generator en bediening delen één lijst (`patchPlugins.ts`:
    `PATCH_PLUGINS`, `pluginFronts`, `pluginParams`), zodat parameter
    `p<k>` aan beide kanten dezelfde knop is.
  - Elk effect op een front krijgt in de plugin een Bypass-schakelaar na
    zijn laatste knop (`__bypass`; `frontLayout.ts` tekent die als
    schakelaar).
  - Het venster heeft de maat van het grootste front plus de tabbalk
    (`ModuleSpec.widthMm/heightMm`), en opent hooguit ~780 px hoog.
  - Lange envelopeschuiven worden op een front 18 mm (ook in de editor):
    een front is een view.
  - Getest: een parameter vanuit de host komt in de bediening aan
    (`editor=` met `poke=`); schermafdrukken van beide tabs; auval
    voor beide plugins.
- **Expert-tab en alle knoppen als parameter (2026-10-29, later):**
  - Na de fronts staat een tab Expert: per module (per poly-groep één
    keer, in de volgorde van het rack) alle knoppen als eenvoudige schuif,
    keuzelijst of vinkje, plus de displays met een naam (lookup).
    Gegenereerd uit `expertModules()` in `patchPlugins.ts`.
  - Al die knoppen zijn DAW-parameters: Poly 8 heeft er 82, de CS-80 107
    (met de twee bypasses). De knoppen van de fronts staan vooraan, met hun
    frontnaam; de rest heet "<module> <knop>".
  - De id's zijn vast: `<type><n>_<knop>` (`ladder1_cutoff`), niet meer
    `p<k>`. Een ander front verschuift dus geen automatisering meer.
    Automatisering die al met `p<k>` was opgenomen, gaat daardoor één
    keer verloren.
  - Getest: VCO Wave = Sin, een knop die alleen in Expert staat, haalt de
    boventonen weg (2e harmonische −7 → −74 dB); auval voor beide.
- **Fronts en bypass (2026-10-29, later):**
  - De parameters komen uit alle fronts (tabs) van de patch, elke knop één
    keer. Poly 8 kreeg een front (8 parameters). De CS-80 heeft nu twee
    tabs: Spelen (filter, filter-attack, druk op filter en vibrato,
    vibratosnelheid, volume) en Effecten (chorus, galm).
  - Elk effect op een front krijgt een parameter "<naam> bypass" (de
    pseudo-knop `__bypass`). Welke modules en welk droog pad:
    `bypassRoute.ts` (MODULES), alleen categorie `effect`; modules met een
    eigen Bypass-knop (compressors, EQ's) krijgen die. De generator zet de
    routes in de JSON (`"bypass"` naast `"project"`).
  - In `PatchEngine.h`: overgang in 10 ms, met trails: de invoer van het
    effect gaat dicht, zijn staart klinkt uit, het droge signaal komt erbij.
    Een stereo-ingang zonder kabel valt terug op links, zoals de firmware.
  - Gemeten (`MmbPluginCheck`, nieuw: `at=<s>:<param>=<waarde>` zet een
    parameter tijdens het renderen): galm-bypass vanaf het begin haalt de
    staart weg (0,5 s na het loslaten 0,000 tegen 0,059 rms); omschakelen
    midden in een akkoord geeft geen klik (grootste stap rond het
    omschakelen 0,009–0,022, gewone muziek 0,015–0,024).
  - Let op: gebypast klinkt het effect vaak luider, omdat het droge pad het
    volle signaal doorgeeft en de effectmix het droge deels terugneemt
    (CS-80 galm-bypass: piek 0,72 tegen 0,57).
  - Nog niet: de bypass in de speelmodus van de editor, de simulator en de
    firmware.
- **Bouwen:** `npx tsx scripts/pluginPatches.ts` in `editor/` schrijft
  `generated/*_patch_plugin.cpp` en `patches.cmake`. De lijst `PATCHES`
  bepaalt welke seeds een plugin worden. `scripts/exportPatch.ts` schrijft
  de JSON van één seed.
- **Nieuwe opbouw van de wasm2c-route:** `gen_w2c.py` maakt per module een
  functietabel (`W2cRuntime.h`), zodat meerdere modules in één plugin
  passen. Gecontroleerd: alle 53 losse plugins geven dezelfde pieken als
  native, en het tweede exemplaar is overal exact gelijk.
- **Gevonden fout:** de native route (`MMB_PLUGIN_NATIVE=1`) compileerde
  sinds 792b672 niet meer zonder bankvlag. Opgelost. Een afwijking bij
  RINGS bleek een meetfout aan de native kant: daar verstoort een tweede
  exemplaar de gedeelde gastheer. Zonder tweede exemplaar is RINGS
  bit-gelijk.

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
