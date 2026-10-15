# Modules als audioplugin (proef)

HALL als VST3 en Standalone, met JUCE, op dezelfde kern als de Teensy en de
simulator (`firmware/lib/mmb-dsp`). Achtergrond en meting:
[doc/plans/plugin.md](../../doc/plans/plugin.md).

## Bouwen (Windows)

JUCE staat niet in de repo. Eén keer:

```
git clone --depth 1 --branch 8.0.4 https://github.com/juce-framework/JUCE <ergens>/JUCE
```

(Als de checkout halverwege stopt op lange paden: `git config core.longpaths
true` en `git reset --hard HEAD` in die map.) Eén keer het WebView2-pakket
voor de bediening (PowerShell; JUCE zoekt het in de NuGet-map van de
gebruiker):

```
Register-PackageSource -provider NuGet -name nugetRepository -location https://www.nuget.org/api/v2
Install-Package Microsoft.Web.WebView2 -Scope CurrentUser -RequiredVersion 1.0.1901.177 -Source nugetRepository
```

Dan de bediening bundelen (in `editor/`, na `npm install`):

```
MMB_JUCE_DIR=<ergens>/JUCE npm run build:plugin-ui      # → tools/plugin/web/
```

en de plugin, vanuit een "x64 Native Tools"-prompt (`vcvars64.bat` van de
Build Tools 2022):

```
cmake -S tools/plugin -B <bouwmap> -G Ninja -DCMAKE_BUILD_TYPE=Release -DMMB_JUCE_DIR=<ergens>/JUCE
cmake --build <bouwmap> --target MmbHall_VST3 MmbHall_Standalone MmbPluginCheck
```

De bediening is het editorpaneel (`editor/src/plugin-ui/`, ModulePanel in
een webview); na een wijziging daar: opnieuw bundelen én de plugin opnieuw
bouwen (de pagina zit als binary data in de plugin).

De bouwsels staan in `<bouwmap>/MmbHall_artefacts/Release/` (VST3 en
Standalone) en `<bouwmap>/MmbPluginCheck_artefacts/Release/`. De VST3 hoort
in `%LOCALAPPDATA%\Programs\Common\VST3` (gebruikersmap, geen beheerder
nodig); elke DAW zoekt daar.

## Controle zonder DAW

```
mmb-plugin-check "<pad>\MMB HALL.vst3" ir.wav 7 mix=1 early=0 predelay=0 decay=3
python tools/plugin/check_ir.py ir.wav
```

Parameters op naam (zonder spaties, kleine letters: `hidamp`, `lomult`,
`predelay`); een keuze met zijn naam (`"algorithm=Random Hall"`). De meting
hoort overeen te komen met `editor/src/modular-mb/sim/wasmHall.test.ts`.

Een eigen opname door de plugin (de staart komt erachteraan), om in VLC te
beluisteren:

```
mmb-plugin-check "<pad>\MMB HALL.vst3" uit.wav 4 "in=<opname>.wav" decay=3.2 predelay=30 mix=0.4
```

De bediening testen zonder DAW:

```
mmb-plugin-check "<pad>\MMB HALL.vst3" x.wav 1 decay=7 editor=12 poke=decay:20
```

opent het paneel 12 s (zoals een DAW), zet halverwege Decay op 20 vanuit de
gastheer, en print de parameters ervoor en erna. Wat de pagina ontvangt staat
als `[ui] …`-regels in de uitvoer (native functie `mmbLog`). Draai aan een
knop in het paneel en zie de parameter erna veranderd.
