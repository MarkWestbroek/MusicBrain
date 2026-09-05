# DX7 in de browser — msfa-kern voor de editor-simulator

De editor-simulator speelt `tp_mmb_dx7` met **dezelfde DSP als de Teensy**:
de gevendorde msfa-kern (`firmware/lib/msfa`, Apache-2.0, de Dexed/MicroDexed-
engine). Er zijn twee backends met één interface, gekozen in
`editor/public/dx7/dx7-worklet.js`:

| Backend | Bestand | Hoe |
|---|---|---|
| **JS-port** (default) | `editor/public/dx7/dx7-core.js` | Regel-voor-regel port van msfa naar JavaScript (int32-DSP, één BigInt-shift per blok). Geen toolchain nodig. |
| **wasm** (default zodra aanwezig) | `editor/public/dx7/dx7.wasm` | `dx7_wasm.cc` + msfa gecompileerd met wasi-sdk (`build.sh`). Wordt gebruikt zodra het bestand bestaat. |

Beide renderen op 44,1 kHz (zoals `Dx7Module.h`) in een AudioWorklet die
lineair naar de contextfrequentie resamplet, met 16-stemmige polyfonie en
dezelfde allocator (`dx7_wasm.cc` ≙ `Dx7Core` in `dx7-core.js`).

## Correctheid: JS-port vs native

`ref.cc` compileert `dx7_wasm.cc` + msfa met de systeem-clang tot een
harnas dat een vaste sequentie naar float32 schrijft; `test-core.mjs`
rendert dezelfde sequentie met de JS-port en vergelijkt sample-voor-sample.

```sh
tools/dx7-wasm/ref-build.sh /tmp/dx7ref
/tmp/dx7ref editor/public/dx7/roms.bin /tmp/dx7ref-epiano.f32  0 10 60 100 44096 44096
/tmp/dx7ref editor/public/dx7/roms.bin /tmp/dx7ref-brass.f32   0 0  48 127 44096 44096
/tmp/dx7ref editor/public/dx7/roms.bin /tmp/dx7ref-strings.f32 0 3  64 90  44096 44096
node tools/dx7-wasm/test-core.mjs
```

Resultaat (2026-09-05): max verschil 1,5·10⁻⁸ = float32-afronding van de
laatste vermenigvuldiging; de integer-DSP is identiek (SNR ≈ 148 dB,
0,00 LSB op 16 bit). 8 stemmen ≈ 2,7 % CPU in node.

## Banken

`editor/public/dx7/roms.bin` = de 8 Yamaha factory-ROMs (rom1a..rom4b,
8 × 4096 bytes packed, sysex-framing gestript) uit `sounds/DX7/ROMs`.
Bank 8 (USR) is een 32-voice .syx die via `Dx7.setUserBank()` aan alle
instanties wordt gegeven.

## Afwijking van de firmware

Op de Teensy is één `Dx7Module` één stem (poly via `polyExpand`). De
simulator is monofoon; daarom is de browser-DX7 intern 16-stemmig en
krijgt hij van de engine élke note-on/off. Niet-master-leden van een
PolyGroup krijgen in de simulator geen DX7-node (anders unisono).
