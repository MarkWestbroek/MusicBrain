# mmb-wasm — Teensy-modules in de browser-simulator

De editor-simulator speelt de "zware" modules met **dezelfde DSP als de
Teensy**: de gevendorde C++-kernen uit `firmware/lib/mi-*` en
`firmware/app-elements/lib/mi-elements` worden met wasi-sdk naar
WebAssembly gecompileerd en draaien in een AudioWorklet.

| Module | typeId | Kern | Native rate / blok |
|---|---|---|---|
| Elements | `tp_mmb_elements` | mi-elements | 32 kHz / 16 |
| Rings | `tp_mmb_rings` | mi-rings | 48 kHz / 24 |
| Marbles | `tp_mmb_marbles` | mi-marbles | 1 kHz / 1 (CV-tick) |
| Stages | `tp_mmb_stages` | mi-stages | 1 kHz / 1 (CV-tick) |
| Peaks | `tp_mmb_peaks` | mi-peaks | 48 kHz / 32 |
| Morph-WT | `tp_mmb_morph_wt` | eigen (MorphWtModule.h) | 44,1 kHz / 32 |
| Clouds | `tp_mmb_clouds` | mi-clouds | 32 kHz / 32 |
| Plaits | `tp_mmb_plaits` | mi-plaits | 48 kHz / 24 |
| Tides | `tp_mmb_tides` | mi-tides (tides2) | 1 kHz / 1 (CV-tick) |
| Warps | `tp_mmb_warps` | mi-warps | 44,1 kHz / 32 |
| Sampler | `tp_mmb_sampler` | eigen (`mmb_dsp/sample_player.h`; keymap + 1–4 kanalen, samples via `mmb_blob_ptr/commit`, zones via `mmb_zone_set/count`) | 44,1 kHz / 32 |
| Tape echo | `tp_mmb_tape_echo` | eigen (`firmware/lib/mmb-dsp/mmb_dsp/tape_echo.h`, header-only — dezelfde kern als de Teensy-wrapper) | 44,1 kHz / 32 |

Daarmee spelen o.a. de **Krell**- en **808-jam**-seeds in de browser.
(De DX7 heeft zijn eigen worklet, zie `tools/dx7-wasm`.)

## Hoe het werkt

```
tools/mmb-wasm/<naam>_wasm.cc   spiegel van firmware/app-modular-brain/src/<X>Module.h:
                                controls → DSP-struct, cv/gate-poorten, flankdetectie
tools/mmb-wasm/mmb_abi.h        de C-ABI die elke module exporteert (poorten,
                                controls, render) — de host leest alles uit de wasm
editor/public/wasm/<typeId>.wasm  gebouwd door build.sh (wasi-sdk)
editor/public/wasm/mmb-worklet.js generieke AudioWorklet-host: resampling
                                  (audio lineair, cv/gate zero-order-hold),
                                  kabel- en klavierwaarden per ingang
editor/src/modular-mb/runtime/audio/WasmModule.ts  runtime-klasse: één
                                  Tone.Gain per poort, berichten naar de worklet
editor/src/modular-mb/sim/AudioEngine.ts  node-soort 'wasm': audio én cv/gate
                                  zijn signalen; MIDI-In/sequencer/klavier sturen
                                  voct/gate als handmatige waarde
```

Conventies (gelijk aan de firmware-CvGraph): voct in volt rond C4 (MIDI 60
= 0 V), Marbles' X in ±5 V, parameter-CV's 0..1, gate ≥ 0,5 = hoog, audio ±1.
Parameter-CV's overschrijven de knop alleen zolang de poort verbonden is.

Wasm→wasm-kabels lopen via een DelayNode van één render-quantum (~2,7 ms):
Web Audio dempt anders elke lus (Stages.eoc → eigen gate, Marbles ↔ Stages).

## Bouwen en testen

```sh
tools/mmb-wasm/build.sh            # alles → editor/public/wasm/*.wasm
tools/mmb-wasm/build.sh rings      # één module
node tools/mmb-wasm/test.mjs       # rooktest: poorten, pieken, flanken, CPU
node tools/mmb-wasm/test-analysis.mjs   # sample-analyse op een kunstmatige take
node tools/mmb-wasm/test-sampler.mjs    # take → keymap → sampler, end-to-end
node tools/mmb-wasm/render-samples.mjs   # voorbeeldsamples renderen
node tools/mmb-wasm/make-test-bank.mjs   # testopname (Elements) + .mmbs-bank
```

`test-analysis.mjs` en `test-sampler.mjs` bundelen `sampleAnalysis.ts` met
esbuild, zodat de analyse zonder browser te testen is. `make-test-bank.mjs`
rendert met de Elements-wasm een "opname" (C3/G3/C4 × zacht/midden/hard,
stereo, stiltes ertussen) naar `editor/public/samples/elements-take.wav` en
bouwt daar een `.mmbs` van — te openen met de knop **Testopname** in de
Multisample-import.

Let op bij die take: Elements staat op geometry 0,42 en dan liggen de
partialen uitgerekt, waardoor de waargenomen toon 60–95 cent boven de
nominale noot ligt (bij geometry 0,25 klopt Elements exact, tot op 0 cent).
Dat is echt gedrag van het model, geen stemfout — en precies waarom je bij
inharmonisch materiaal de noten van tevoren opgeeft in plaats van ze te
laten detecteren.

wasi-sdk: https://github.com/WebAssembly/wasi-sdk/releases, uitgepakt in
`~/.wasi-sdk/` (of `$WASI_SDK`). De MI-libs dragen elk een stmlib-subset;
wat een lib mist vindt de build in de andere (zoals de firmware-LDF).
`shim/avr/pgmspace.h` maakt `FLASHMEM`/`PROGMEM` leeg.

## Een module toevoegen

1. `tools/mmb-wasm/<naam>_wasm.cc`: kopieer de control- en poortafhandeling
   uit `<X>Module.h` (zonder `AudioStream`); vul `MMB_INPUTS/OUTPUTS/CONTROLS`,
   `mmb_setup/mmb_on_control/mmb_process`.
2. `build.sh`: één `build`-regel met de .cc-bronnen.
3. `WasmModule.typeIds` (editor): typeId toevoegen. Klaar — de engine, de
   worklet en de patcher weten verder niets module-specifieks.

## Afwijkingen van de Teensy

- PolyGroups van wasm-modules spelen polyfoon: de engine bouwt alle leden, vouwt de
  kabels uit zoals `polyExpand` (fan-out, `in1→in1..inN`, stem v → stem v) en verdeelt
  noten met een allocator (zelfde noot → hertrigger, vrije stem, anders oudste stelen).
  Tone-VCO-PolyGroups blijven mono (de Tone-engine kent geen stemmen).
- Gates van wasm-modules kunnen Tone-envelopes (ADSR-module) niet triggeren
  en wasm-CV kan de Tone-VCO's niet stemmen (die worden per JS-aanroep
  aangestuurd, niet per signaal); wasm→wasm, wasm→VCA/VCF-cv en
  LFO/ADSR/sequencer/MIDI-In→wasm werken wel. Marbles → Plaits/Morph-WT/
  Rings/Elements is dus de route voor generatieve patches.
- CPU per instantie (node, -O3 -msimd128): Elements ~33 %, Rings ~23 %, de rest ≤ 2 %.
