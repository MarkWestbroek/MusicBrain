# Overdracht: de plugins op de Mac bouwen (recept, 2026-10-15)

Voor Mark op zijn MacBook Pro (2016, macOS tot Monterey), of voor een
Claude-sessie daar. Doel: **MMB HALL** en **MMB SID** als AU en VST3
bouwen, laden in Reaper en Logic, en vastleggen wat werkt. Dit is de eerste
keer op een Mac én de eerste keer in een echte DAW; op Windows is alles
zonder DAW bewezen (zie [plugin.md](plugin.md) §2–2b).

Lees eerst: [plugin.md](plugin.md) (wat er is en waarom) en
[tools/plugin/README.md](../../tools/plugin/README.md) (de bouwstappen op
Windows; de Mac-stappen hieronder zijn de vertaling daarvan). De
werkafspraken van [CLAUDE.md](../../CLAUDE.md) gelden ook op de Mac:
alleen eigen hunks stagen, release-log bijwerken.

## 1. Wat je bouwt

| Doel | Bestand na het bouwen | Waar het hoort |
|---|---|---|
| HALL als AU (voor Logic) | `MmbHall_artefacts/Release/AU/MMB HALL.component` | `~/Library/Audio/Plug-Ins/Components/` |
| HALL als VST3 (Reaper, Live) | `MmbHall_artefacts/Release/VST3/MMB HALL.vst3` | `~/Library/Audio/Plug-Ins/VST3/` |
| HALL los | `MmbHall_artefacts/Release/Standalone/MMB HALL.app` | waar je wilt |
| SID: idem | `MmbSid_artefacts/…` | idem |
| controleprogramma | `MmbPluginCheck_artefacts/Release/mmb-plugin-check` | waar je wilt |

De plugins bevatten de **bediening** (het editorpaneel uit de editor, als
webpagina in een webview) en de **parameterlijsten** (uit datzelfde paneel).
Beide worden uit de editor gegenereerd vóór het bouwen (stap 4).

## 2. Eén keer klaarzetten

1. **Xcode** uit de App Store (voor de AU het veiligst; alleen de Command
   Line Tools volstaat voor VST3 en Standalone, dan met Ninja i.p.v. Xcode
   als generator). Daarna één keer `sudo xcodebuild -license accept`.
2. **Homebrew**, dan `brew install cmake node` (en `ninja` als je zonder
   Xcode bouwt).
3. **De repo**: `git clone <MusicBrain>` en in `editor/`: `npm install`.
4. **JUCE 8.0.4**, naast de repo (niet erin):
   ```
   git clone --depth 1 --branch 8.0.4 https://github.com/juce-framework/JUCE ~/src/JUCE
   ```
   Geen WebView2-stap: op de Mac is de webview WebKit, die zit in macOS.

## 3. Bouwen

Vanuit de repo-map:

```
cd editor
MMB_JUCE_DIR=~/src/JUCE npm run build:plugin-ui      # → tools/plugin/generated/ en web/
cd ..
cmake -S tools/plugin -B build-mac -G Xcode -DMMB_JUCE_DIR=~/src/JUCE -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0
cmake --build build-mac --config Release --target MmbHall_All MmbSid_All MmbPluginCheck
```

(`_All` bouwt AU + VST3 + Standalone van die module. Zonder Xcode:
`-G Ninja -DCMAKE_BUILD_TYPE=Release` en de doelen `MmbHall_VST3
MmbHall_Standalone …`; de AU slaat je dan over.) De eerste bouw duurt een
paar minuten (JUCE zelf); daarna seconden.

Dan kopiëren:

```
cp -R "build-mac/MmbHall_artefacts/Release/AU/MMB HALL.component" "build-mac/MmbSid_artefacts/Release/AU/MMB SID.component" ~/Library/Audio/Plug-Ins/Components/
cp -R "build-mac/MmbHall_artefacts/Release/VST3/MMB HALL.vst3" "build-mac/MmbSid_artefacts/Release/VST3/MMB SID.vst3" ~/Library/Audio/Plug-Ins/VST3/
```

Lokaal gebouwd heeft geen handtekening of notarisatie nodig: Gatekeeper let
alleen op wat van internet komt.

## 4. Controleren, in deze volgorde

1. **Zonder DAW, de klank** (zelfde getallen als op Windows en in de
   simulator; `check_ir.py` staat in `tools/plugin/`):
   ```
   build-mac/MmbPluginCheck_artefacts/Release/mmb-plugin-check "build-mac/MmbHall_artefacts/Release/VST3/MMB HALL.vst3" ir.wav 7 mix=1 early=0 pre=0 decay=3 hidamp=0 lo=1
   python3 tools/plugin/check_ir.py ir.wav
   ```
   Verwacht: RT60 midden 2,74 s, laag 3,01 s, hoog 2,01 s, start 28,34 ms.
   En de SID: `… "MMB SID.vst3" akkoord.wav 3 notes=60,64,67` → een
   C-majeurakkoord, piek rond 0,95, stilte na 1,5 s.
2. **Zonder DAW, de bediening**: `… "MMB HALL.vst3" x.wav 1 decay=7
   editor=12 poke=decay:20`. Het paneel moet verschijnen; Decay staat op 7;
   halverwege springt hij naar 20; draai zelf aan Size en zie na afloop
   "Size = …" veranderd in de uitvoer. De `[ui] …`-regels laten zien wat de
   pagina ontvangt. **Dit is het spannendste punt op de Mac**: de webview
   is WebKit in plaats van WebView2 (zie §5).
3. **Apple's AU-keuring** (Logic laadt alleen wat hierdoor komt):
   ```
   auval -v aufx Hall Mmbr      # HALL (effect)
   auval -v aumu Sid1 Mmbr      # SID (instrument)
   ```
   Moet eindigen met `AU VALIDATION SUCCEEDED`.
4. **Reaper**: Preferences → Plug-ins → VST → Re-scan; dan op een spoor
   "MMB HALL" (FX) en "MMB SID" (instrument). Speel, automatiseer een knop,
   bewaar het project, heropen: staan de knoppen nog zo?
5. **Logic**: start Logic (die scant nieuwe AU's); Plug-in Manager als hij
   ze niet ziet (Reset & Rescan). Audio Units → MusicBrain → MMB HALL;
   instrument: AU Instruments → MusicBrain → MMB SID.

## 5. Wat er mis kan gaan (en wat dan)

- **De webview toont niets of een wit vlak.** De code kiest op Windows
  WebView2 en laat de Mac op de standaard (WebKit) staan
  (`MmbPluginBase.h`, `#if JUCE_WINDOWS`). Als de pagina niet laadt:
  kijk of `getResourceProviderRoot()` op de Mac `juce://juce.backend/`
  is en of de `index.html?type=…`-URL erachter de ResourceProvider haalt
  (de `[ui]`-regels in `mmb-plugin-check` zijn de eerste aanwijzing). JUCE's
  eigen voorbeeld is `examples/GUI/WebViewPluginDemo.h` in de JUCE-map.
- **De beginstand van de knoppen komt niet aan.** Op Windows beantwoordt
  JUCE 8.0.4 de eerste opvraag niet; de pagina vraagt daarom na 150/500/
  1500/4000 ms opnieuw (`editor/src/plugin-ui/main.tsx`). Kijk of dat op de
  Mac ook nodig is (de `[ui] beginstand opvragen`-regel verschijnt dan).
- **auval faalt.** Lees de regel waarop hij stopt; meestal iets met
  busindeling of state. Onze processor: stereo uit, mono/stereo in
  (effect), geen MIDI-uit. Het SID-instrument heeft geen ingang.
- **Xcode-generator klaagt over handtekeningen.** Voor lokaal bouwen:
  `-DCMAKE_XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY=""` en
  `-DCMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED=NO` erbij.
- **Retina.** Het paneel is 4 px/mm in CSS-pixels; WebKit schaalt zelf.
  Ziet het er wazig uit, dan is dat de eerste plek om te kijken.
- **Audio in de Standalone**: Options → Audio/MIDI Settings, en de gele
  balk "input muted" uitzetten als je er iets in wilt spelen.

## 6. Vastleggen

Wat werkt en wat niet: in [plugin.md](plugin.md) een kopje "2c. Mac"
(zoals 2a en 2b), de release-log, en de README van `tools/plugin` waar de
stappen anders bleken. Commit vanaf de Mac zoals altijd: alleen eigen hunks.
Een schermafbeelding van het paneel in Logic is de mooiste afsluiter.
