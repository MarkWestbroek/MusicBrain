# DX7 in de browser — msfa-kern voor de editor-simulator

De editor-simulator speelt `tp_mmb_dx7` met **dezelfde DSP als de Teensy**:
de gevendorde msfa-kern (`firmware/lib/msfa`, Apache-2.0, de Dexed/MicroDexed-
engine). Er zijn twee backends met één interface, gekozen in
`editor/public/dx7/dx7-worklet.js`:

| Backend | Bestand | Hoe |
|---|---|---|
| **JS-port** (fallback) | `editor/public/dx7/dx7-core.js` | Regel-voor-regel port van msfa naar JavaScript (int32-DSP, één BigInt-shift per blok). Geen toolchain nodig. |
| **wasm** (default) | `editor/public/dx7/dx7.wasm` | `dx7_wasm.cc` + msfa gecompileerd met wasi-sdk (`build.sh`). Wordt gebruikt zodra het bestand bestaat. |

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

## Edit-buffer en patch-editor

Naast bank + program kent de kern een **edit-buffer**: 156 bytes uitgepakte
patch die de bank overstemt zolang hij aanstaat. Zo verandert de editor een
patch live zonder de bank aan te raken, en horen alle DX7-modules in de patch
hetzelfde.

| kant | interface |
|---|---|
| wasm | `dx7_edit_ptr()` → 156-byte buffer, `dx7_edit_enable(int)` |
| JS-port | `Dx7Core.setEditPatch(bytes \| null)` |
| worklet | bericht `{t:'edit', data}` (`data === null` → terug naar de bank) |
| editor | `Dx7.setEditPatch()` / `Dx7.getEditPatch()` / `Dx7.getPackedVoice()` |

Het formaat zelf staat in `editor/src/modular-mb/dx7Patch.ts` (packed 128 ↔
unpacked 156, algoritmetabel, routering, ratio's) en de UI in
`Dx7EditorModal.tsx`. **Let op:** in een DX7-bulkdump staan de operators
achterstevoren — patch-index 0 is OP6. msfa houdt die volgorde aan, de UI
draait 'm om (`opIndex = 6 - uiOp`).

## Naast een echte DX7: `compare.mjs`

```sh
node tools/dx7-wasm/compare.mjs opname.wav [bank] [program] [midinote] [velocity]
node tools/dx7-wasm/compare.mjs --selftest
```

Rendert dezelfde voice/noot met onze kern, lijnt uit op de aanslag, trekt het
niveau gelijk en meet dan drie dingen los van elkaar: envelope-tijden in dB,
partiaal-amplitudes (Goertzel), en de ruisvloer *tussen* de partialen als
functie van het signaalniveau.

Die laatste is de "grunge"-detector. Lineaire PCM geeft ruis die niet
meeschaalt met het signaal (helling ≈ 0 dB/dB); de companding DAC van de
originele DX7 geeft ruis die wél meeschaalt (helling → 1). `compand(x,
mantissaBits)` in hetzelfde bestand doet die kwantisatie na, zodat het
karakter ook terug te genereren is.

`--selftest` draait de meting op materiaal met een bekend aangebrachte fout:
gemeten ×0,870 waar ×0,898 voorspeld was, en 0,23 tegen 0,63 dB/dB.

### Opnameprotocol

1. Zet de DX7 op een **enkele voice** en noteer bank + program; speel via MIDI,
   niet met de hand, zodat noot en velocity exact bekend zijn.
2. Neem **line-out** op, niet de koptelefoonuitgang, zonder effecten en zonder
   compressie — de meting gaat juist over de uitgangstrap.
3. Eén noot per bestand, minimaal 3 s, met de note-off erin (envelope-tijden
   zijn alleen op de release goed te meten). Laat de staart uitklinken.
4. Neem hetzelfde op bij **twee sterk verschillende velocities** (bv. 30 en
   120): de ruis-tegen-niveau-helling heeft twee niveaus nodig.
5. Voice-keus: iets met een duidelijke decay (E.PIANO 1) voor de tijden, iets
   met een stabiele toon (BRASS 1) voor het spectrum.
6. 44,1 of 48 kHz, 24-bit. Niet normaliseren tussen de takes door — het
   *relatieve* niveau tussen zacht en hard is meetdata.
