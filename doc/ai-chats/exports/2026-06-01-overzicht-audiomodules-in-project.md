# Chat: Overzicht audiomodules in project

- **Datum**: 2026-06-01 19:31
- **Sessie-ID**: `59123c17-ee8b-43e9-9d79-7a84ed4b0220`
- **Berichten**: 6

---

## 🧑 User

Zou je een overzicht kunnen maken van alle audiomodules die in het project gemaakt zijn, en die dus (direct of indirect) overerven van AudioModule?

---

## 🤖 Assistant



*Searched for text `AudioModule` (`**/firmware/**`), 20 results · Searched for text `: public AudioModule` (`**/firmware/**`), 18 results · Searched for text `outputPort|inputPort` (`**/firmware/**`), 20 results*

Ik heb 18 klassen gevonden die overerven van `AudioModule`. Laat me de headers kort inlezen om per module de audio ports te documenteren.

<details>
<summary><em>Read VcoModule.h, lines 1 to 60</em> (+17 meer)</summary>

- Read VcoModule.h, lines 1 to 60
- Read FmVcoModule.h, lines 1 to 80
- Read WtVcoModule.h, lines 1 to 85
- Read DrawVcoModule.h, lines 1 to 75
- Read OctaVcoModule.h, lines 1 to 80
- Read VcfModule.h, lines 1 to 90
- Read VcaModule.h, lines 1 to 80
- Read StereoVcaModule.h, lines 1 to 80
- Read OutModule.h, lines 1 to 65
- Read MixerModule.h, lines 1 to 85
- Read Mixer8Module.h, lines 1 to 85
- Read Mixer16Module.h, lines 1 to 85
- Read EchoModule.h, lines 1 to 85
- Read CombModule.h, lines 1 to 80
- Read PhaserModule.h, lines 1 to 135
- Read CompDriveModule.h, lines 1 to 160
- Read StringModule.h, lines 1 to 75
- Read ElementsModule.h, lines 170 to 220
</details>

Hier is een volledig overzicht van alle audiomodules die **direct of indirect** overerven van `AudioModule`.

---

## Overzicht: alle `AudioModule`-subklassen

| # | Klasse | Bestand | `typeId` | Categorie |
|---|--------|---------|----------|-----------|
| 1 | `VcoModule` | `app-modular-brain/src/VcoModule.h` | `tp_mmb_vco` | 🎵 **Oscillator** |
| 2 | `FmVcoModule` | `app-modular-brain/src/FmVcoModule.h` | `tp_mmb_fm_vco` | 🎵 **Oscillator** (FM) |
| 3 | `WtVcoModule` | `app-modular-brain/src/WtVcoModule.h` | `tp_mmb_wt_vco` | 🎵 **Oscillator** (wavetable) |
| 4 | `DrawVcoModule` | `app-modular-brain/src/DrawVcoModule.h` | `tp_mmb_draw_vco` | 🎵 **Oscillator** (draw-waveshape) |
| 5 | `OctaVcoModule` | `app-modular-brain/src/OctaVcoModule.h` | `tp_mmb_octa_vco` | 🎵 **Oscillator** (8-voice bank) |
| 6 | `StringModule` | `app-modular-brain/src/StringModule.h` | `tp_mmb_string` | 🎵 **Oscillator** (Karplus-Strong) |
| 7 | `VcfModule` | `app-modular-brain/src/VcfModule.h` | `tp_mmb_vcf` | 🔧 **Filter** |
| 8 | `VcaModule` | `app-modular-brain/src/VcaModule.h` | `tp_mmb_vca` | ⚡ **VCA/Gain** |
| 9 | `StereoVcaModule` | `app-modular-brain/src/StereoVcaModule.h` | `tp_mmb_stereo_vca` | ⚡ **VCA/Gain** (stereo + pan) |
| 10 | `EchoModule` | `app-modular-brain/src/EchoModule.h` | `tp_mmb_echo` | 🌊 **Effect** (delay) |
| 11 | `CombModule` | `app-modular-brain/src/CombModule.h` | `tp_mmb_comb` | 🌊 **Effect** (comb-filter/resonator) |
| 12 | `PhaserModule` | `app-modular-brain/src/PhaserModule.h` | `tp_mmb_phaser` | 🌊 **Effect** (phaser) |
| 13 | `CompDriveModule` | `app-modular-brain/src/CompDriveModule.h` | `tp_mmb_comp` | 🌊 **Effect** (compressor + overdrive) |
| 14 | `MixerModule` | `app-modular-brain/src/MixerModule.h` | `tp_mmb_mixer` | 🔀 **Mixer** (4-kanaals stereo) |
| 15 | `Mixer8Module` | `app-modular-brain/src/Mixer8Module.h` | `tp_mmb_mixer8` | 🔀 **Mixer** (8-kanaals stereo) |
| 16 | `Mixer16Module` | `app-modular-brain/src/Mixer16Module.h` | `tp_mmb_mixer16` | 🔀 **Mixer** (16-kanaals stereo) |
| 17 | `OutModule` | `app-modular-brain/src/OutModule.h` | `tp_mmb_out` | 🔊 **Output** (USB audio) |
| 18 | `ElementsModule` | `app-elements/src/ElementsModule.h` | `tp_mmb_elements` | 🎹 **Physical modelling** (Mutable Instruments Elements port) |

---

### Audio-port mappings per module

**Oscillatoren** — genereren audio, hebben géén audio-ingang (behalve `FmVcoModule`):

| Module | Audio outputs | Audio inputs |
|--------|--------------|--------------|
| `VcoModule` | `out` (`AudioSynthWaveform` ch0) | — |
| `FmVcoModule` | `out` (`AudioSynthWaveformModulated` ch0) | `fm` (modulator, ch0) |
| `WtVcoModule` | `out` (`AudioSynthWaveform` ch0) | — |
| `DrawVcoModule` | `out` (`AudioSynthWaveform` ch0) | — |
| `OctaVcoModule` | `out_1`…`out_8` (8× `AudioSynthWaveform` ch0) | — |
| `StringModule` | `out` (`AudioAmplifier` ch0) | — |

**Filters** — verwerken audio:

| Module | Audio outputs | Audio inputs |
|--------|--------------|--------------|
| `VcfModule` | `out` (`AudioFilterStateVariable` ch0/1/2 afh. type: LP/BP/HP) | `in` (ch0) |

**VCA's** — versterken/verzwakken:

| Module | Audio outputs | Audio inputs |
|--------|--------------|--------------|
| `VcaModule` | `out` (`AudioEffectMultiply` ch0) | `in` (ch0) |
| `StereoVcaModule` | `l`, `r` (2× `AudioAmplifier` ch0) | `in` (`AudioAmplifier` ch0) |

**Effecten** — verwerken audio met CV-gestuurde parameters:

| Module | Audio outputs | Audio inputs |
|--------|--------------|--------------|
| `EchoModule` | `out` (`AudioMixer4` ch0) | `in` (`AudioAmplifier` ch0) |
| `CombModule` | `out` (`AudioMixer4`

---

## 🧑 User

zou je een markdown file (09-modular-brain-audiomodules.md) kunnen maken met deze informatie? Je mag deze in doc/uml zetten. Kun je ook een UML mermaid klasse diagram maken die de hierarchie toont? (Andere md's staan ook in die map, mocht je een voorbeeld nodig hebben)

---

## 🤖 Assistant



<details>
<summary><em>Read 07-modular-brain-runtime.md, lines 1 to 80</em> (+5 meer)</summary>

- Read 07-modular-brain-runtime.md, lines 1 to 80
- Read README.md
- Read 08-core-runtime-hierarchy.md, lines 1 to 80
- Read 08-core-runtime-hierarchy.md, lines 80 to 200
- Read 08-core-runtime-hierarchy.md, lines 200 to 280
- Searched for regex `Registry.*register|registerModule|registerAll` (`**/firmware/app-modular-brain/src/**`), 5 results
</details>



*Read RegisterAllModules.h*



<details>
<summary><em>Read 07-modular-brain-runtime.md, lines 1 to 80</em> (+7 meer)</summary>

- Read 07-modular-brain-runtime.md, lines 1 to 80
- Read README.md
- Read 08-core-runtime-hierarchy.md, lines 1 to 80
- Read 08-core-runtime-hierarchy.md, lines 80 to 200
- Read 08-core-runtime-hierarchy.md, lines 200 to 280
- Searched for regex `Registry.*register|registerModule|registerAll` (`**/firmware/app-modular-brain/src/**`), 5 results
- Read RegisterAllModules.h
- Created 09-modular-brain-audiomodules.md
</details>

En update de `README.md` in dezelfde map zodat de nieuwe file in de tabel verschijnt:
Klaar! Ik heb twee bestanden aangemaakt/bijgewerkt:

1. **`09-modular-brain-audiomodules.md`** — het volledige overzicht met:
   - Een **Mermaid-klassendiagram** dat de hiërarchie toont: `Module → AudioModule → 18 subklassen`, inclusief de `AudioPort`-struct en per klasse de audio-streams en kanalen
   - Een **tabel met alle 18 modules** (typeId, categorie)
   - **Audio-port-mapping per module** (inputs en outputs)
   - **CV/Gate-ports per module** (het domein-onderscheid)
   - **Registratie** (via `RegisterAllModules.h`)
   - **Bijzonderheden** per module

2. **`README.md`** — de bestandstabel aangevuld met entry voor `09-modular-brain-audiomodules.md`.

---

## 🧑 User

zou je hetzelfde kunnen doen voor de CvModule familie? dat mag dan 10-modular-brain-cv-modules.md worden

---

## 🤖 Assistant



<details>
<summary><em>Searched for text `outputPortKind|inputPortKind|PortKind` (`**/firmware/core/include/mb/runtime/CvBreakout.h`), no results</em> (+22 meer)</summary>

- Searched for text `outputPortKind|inputPortKind|PortKind` (`**/firmware/core/include/mb/runtime/CvBreakout.h`), no results
- Searched for text `outputPortKind|inputPortKind|PortKind|outputPort|inputPort` (`**/firmware/core/include/mb/runtime/CvBreakIn.h`), 4 results
- Searched for text `outputPortKind|inputPortKind|PortKind` (`**/firmware/core/include/mb/runtime/MidiIn.h`), 10 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/Seq16.h`), 2 results
- Searched for text `outputPortKind|inputPortKind|outputPort|inputPort` (`**/firmware/core/include/mb/runtime/Ahdsr.h`), 2 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/Lfo.h`), 2 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/CvMath.h`), 2 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/CvOut12.h`), no results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/CvOut16.h`), no results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/GateOut.h`), no results
- Read CvModule.h
- Read Envelope.h
- Read Ahdsr.h, lines 55 to 120
- Read Lfo.h, lines 60 to 145
- Read MidiIn.h, lines 55 to 120
- Read Seq16.h, lines 55 to 120
- Read CvBreakout.h, lines 1 to 100
- Read CvBreakIn.h, lines 1 to 120
- Read CvMath.h, lines 1 to 100
- Read CvOut12.h
- Read CvOut16.h
- Read GateOut.h
- Searched for text `enum.*PortKind|PortKind` (`**/firmware/core/include/mb/runtime/Module.h`), 7 results
</details>



<details>
<summary><em>Searched for regex `: public CvModule|public CvModule,` (`**/firmware/**/*.h`), 6 results</em> (+26 meer)</summary>

- Searched for regex `: public CvModule|public CvModule,` (`**/firmware/**/*.h`), 6 results
- Searched for regex `: public Envelope` (`**/firmware/**/*.h`), 1 result
- Searched for regex `: public CvBreakout` (`**/firmware/**/*.h`), 3 results
- Searched for text `outputPortKind|inputPortKind|PortKind` (`**/firmware/core/include/mb/runtime/CvBreakout.h`), no results
- Searched for text `outputPortKind|inputPortKind|PortKind|outputPort|inputPort` (`**/firmware/core/include/mb/runtime/CvBreakIn.h`), 4 results
- Searched for text `outputPortKind|inputPortKind|PortKind` (`**/firmware/core/include/mb/runtime/MidiIn.h`), 10 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/Seq16.h`), 2 results
- Searched for text `outputPortKind|inputPortKind|outputPort|inputPort` (`**/firmware/core/include/mb/runtime/Ahdsr.h`), 2 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/Lfo.h`), 2 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/CvMath.h`), 2 results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/CvOut12.h`), no results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/CvOut16.h`), no results
- Searched for text `outputPortKind|inputPortKind` (`**/firmware/core/include/mb/runtime/GateOut.h`), no results
- Read CvModule.h
- Read Envelope.h
- Read Ahdsr.h, lines 55 to 120
- Read Lfo.h, lines 60 to 145
- Read MidiIn.h, lines 55 to 120
- Read Seq16.h, lines 55 to 120
- Read CvBreakout.h, lines 1 to 100
- Read CvBreakIn.h, lines 1 to 120
- Read CvMath.h, lines 1 to 100
- Read CvOut12.h
- Read CvOut16.h
- Read GateOut.h
- Searched for text `enum.*PortKind|PortKind` (`**/firmware/core/include/mb/runtime/Module.h`), 7 results
- Created 10-modular-brain-cv-modules.md
</details>


Klaar! Twee bestanden aangemaakt/bijgewerkt:

1. **`10-modular-brain-cv-modules.md`** met:
   - **Mermaid-klassendiagram** — de volledige `CvModule`-boom: `Module → CvModule → Envelope/Ahdsr, Lfo, MidiInModule, Seq16, CvBreakout/CvOut12/CvOut16/GateOut, CvBreakIn`, plus `CvMath` (direct van `Module`)
   - **9 klassen** in de tabel, waarvan 8 échte `CvModule`-subklassen en 1 (`CvMath`) die direct van `Module` erft
   - **Abstracte tussenklassen** (`Envelope`, `CvBreakout`)
   - **Port-mapping per module** — CV-outputs, Gate-outputs, CV-/Gate-inputs
   - **Tick-gedrag** — wat elke module doet per 1 ms tick
   - **CV-bridge-architectuur** — hoe `CvGraph` CV-modules aan `AudioModule`s koppelt

2. **`README.md`** — tabel aangevuld met entry voor `10-modular-brain-cv-modules.md`.

---
