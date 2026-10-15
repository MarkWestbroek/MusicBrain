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
2. **Instrumenten.** HALL is een effect. Een instrument (SID, de Ladder-
   stem, Elements) heeft noten nodig: MIDI → gate/toonhoogte/stemverdeling
   zit nu in de core-runtime (MidiIn), niet in de kern. Voor een plugin moet
   een klein stuk daarvan mee, of de plugin host de core.
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
6. **Plaats in het verhaal:** de plugin als software-tweeling van de Brain
   (bij de hardware, of als opstap ernaartoe).

## 5. Stappen (als Mark door wil)

1. Mark laadt `MMB HALL.vst3` in Live (gebruikersmap
   `%LOCALAPPDATA%\Programs\Common\VST3`, daar staat hij) en luistert.
2. ~~GUI-proef~~ gedaan: webview met `ModulePanel` (§2a).
3. Tweede module (CONV, 4 s) en een instrument (SID) om de noten-vraag te
   beantwoorden.
4. Licentie-sweep en naamgeving.
5. Dan pas: signeren, installers, winkel.
