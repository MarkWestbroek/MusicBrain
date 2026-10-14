# Modules als audioplugin (proef 2026-10-15)

Mark kreeg de tip om modules als "Ableton-plugin" te verkopen. Live laadt
gewone VST3/AU-plugins (die in elke DAW werken); daarnaast is er Max for
Live (alleen Live Suite). De vraag was: is dat moeilijk? Antwoord na een
proef van één avond: de klank niet, de rest wel.

> **Proef gebouwd (2026-10-15):** `tools/plugin/`: HALL als VST3 en als
> Standalone-programma (JUCE 8.0.4, Windows), met kale knoppen. Bewezen
> zonder DAW: `mmb-plugin-check` laadt de VST3 zoals een DAW en rendert
> impulsresponsen; die zijn tot op twee decimalen gelijk aan de simulator
> (zie §2). Kosten: € 0.

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

## 3. Wat het kostte en wat het zou kosten

- De proef: een avond, € 0. JUCE heeft een gratis tier; een lokaal gebouwde
  plugin heeft geen handtekening nodig (Windows laadt elke DLL; op de Mac
  blokkeert Gatekeeper alleen wat van internet komt).
- Een **verkoopbare** versie per module, schatting:
  - bediening: een echte GUI in plaats van de lijst (§4), dagen tot een week
    de eerste keer;
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

1. **Bediening.** Onze panelen zijn React/SVG. JUCE 8 kan een webview als
   GUI gebruiken (`WebBrowserComponent` met een JS-brug); dan kan
   `ModulePanel` misschien mee, in dezelfde stijl als de editor. Proberen
   voor we het beloven: webviews op Windows (WebView2) en Linux hebben
   eigenaardigheden. Anders: opnieuw tekenen in JUCE.
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
2. GUI-proef: webview met `ModulePanel`, of JUCE-tekenwerk; besluit.
3. Tweede module (CONV, 4 s) en een instrument (SID) om de noten-vraag te
   beantwoorden.
4. Licentie-sweep en naamgeving.
5. Dan pas: signeren, installers, winkel.
