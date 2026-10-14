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
true` en `git reset --hard HEAD` in die map.) Dan, vanuit een "x64 Native
Tools"-prompt (`vcvars64.bat` van de Build Tools 2022):

```
cmake -S tools/plugin -B <bouwmap> -G Ninja -DCMAKE_BUILD_TYPE=Release -DMMB_JUCE_DIR=<ergens>/JUCE
cmake --build <bouwmap> --target MmbHall_VST3 MmbHall_Standalone MmbPluginCheck
```

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
