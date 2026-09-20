# Simulator ↔ Teensy: wat verschilt er nog, en in welke volgorde lossen we dat op

Status: levend plan. Aangemaakt 2026-09-20.
Zie ook: [tools/mmb-wasm/README.md](../tools/mmb-wasm/README.md) (het recept),
[doc/uml/11-simulation-wasm.md](uml/11-simulation-wasm.md) (de twee poly-constructen).

## Waarom

De browser-simulator moet klinken als de Teensy, niet *ongeveer* als de Teensy.
Voor vijftien modules is dat al zo: die draaien dezelfde C++ als de firmware,
naar WebAssembly gecompileerd. De rest is Tone.js-benadering (een biquad waar
de hardware een Huovilainen-ladder heeft) of stilte. Dit plan zet op een rij
wat er nog tussen zit en in welke volgorde het weg te werken is.

## Waar we staan

Gemeten met `simSupportOf` over de 52 interne moduletypes (2026-09-20):

| bak | n | modules |
|---|---|---|
| **wasm** — zelfde DSP als de Teensy | 15 | elements, rings, plaits, clouds, tides, marbles, stages, peaks, warps, dx7, sampler, morph_wt, tape_echo, env_follower(+mono) |
| **tone** — benadering | 18 | vco, vcf, ladder, ms20, vca, ahdsr, echo, phaser, noise, fm_vco, lfo, cvmath, mixer(+8/16), seq8, midiin, out |
| **none** — stil in de sim | 19 | comb, comp, cr78, resonator, string, stk_sound, chord, quant, sh, grids, draw_vco, wt_vco, octa_vco/vcf/vca, quad_vco_shared, quad_mixer_shared, stereo_vca, elements_reverb |

Van de "tone"-bak is een deel infrastructuur waar sample-exactheid niet toe
doet (midiin, out, mixer, cvmath, seq8). Het gaat om de klankbepalende
modules: vco, vcf, ladder, ms20, vca, ahdsr, echo, phaser, noise, fm_vco.

## De strategie: kernels naar `mmb-dsp`, niet de Teensy-lib naar de browser

Er lagen drie wegen open.

1. **Firmware-DSP zelf schrijven**, zodat de simulator hem kan compileren.
2. **De Teensy Audio Library naar wasm porten.**
3. **Het middenpad: de kernel uit de Teensy-klasse lichten en in `mmb-dsp`
   zetten, de `AudioStream`-schil in de firmware laten.** ← dit doen we.

Weg 2 valt af: dan shim je `AudioStream`, de blokpool, de update-keten en de
CMSIS-intrinsics, en onderhoud je een vreemde bibliotheek in je eigen build —
voor een handvol klassen die je echt gebruikt.

Weg 1 in de vorm van "opnieuw bedenken" valt ook af: de klank van bestaande
hardware ligt vast in die code. Maar de klassen die we gebruiken zijn MIT en
porteerbaar; de kernel *eruit tillen* kost geen klank en geen risico.

Die lijn loopt al: `VcfModule` ruilde in september Teensy's int16
`AudioFilterStateVariable` in voor `mmb_dsp::Svf`, en `Ms20Module` draait op
`mmb_dsp::Korg35`. Beide kernels zijn puur C++ (`<cmath>`, `<cstdint>`) en
worden al meegecompileerd in `sampler.wasm` — ze staan dus klaar.

Vuistregel voor een module: **zit de DSP in `mmb-dsp` of in een gevendorde
lib, dan is er geen besluit nodig — alleen bouwwerk.** Zit hij in een
Teensy-klasse, til de kernel er dan eerst uit.

## Stappen

### 1. `tp_mmb_vcf` + `tp_mmb_ms20` naar wasm — **klaar** (2026-09-20)

De kernels bestaan al; dit is puur het recept uit de README toepassen.
Semantiek exact overnemen uit de firmware:

- **VCF** (`VcfModule.h`): cutoff = `base · 2^(cv_amt · clamp(cv, −1, 1))`;
  resonantie = `clamp(q + q_cv_amt · q_cv, 0.7, 5.0)`, lineair naar 0…1 via
  `(q − 0.7) / 4.3` (de catalogus draagt nog de oude
  `AudioFilterStateVariable`-eenheid); `type` 0/1/2 = LP/HP/BP, live.
- **MS-20** (`Ms20Module.h`): `cv_amt` 0…7 octaven op de cutoff,
  `q_cv · q_cv_amt` telt op bij de resonantie, `drive_cv · drive_cv_amt`
  schaalt de drive exponentieel (±1 = ×4…÷4), `type` 0/1 = LP 12 dB /
  HP 6 dB.

Poorten en control-ids zijn gelijk aan de moduledefinitie in `seedModules.ts`
— de worklet koppelt op naam.

Gedaan: `tools/mmb-wasm/vcf_wasm.cc` en `ms20_wasm.cc`, blok 32 met de
parameter-smoothing op de Teensy-cadans (`kPrepareEvery`). De Tone-klassen `Vcf` en `Ms20` zijn hun `registry.register` kwijt —
de registry weigert een tweede factory op hetzelfde typeId. Doorgemeten in
`editor/src/modular-mb/sim/wasmFilter.test.ts` (LP/HP/BP, CV in octaven,
resonantie, Q-CV, MS-20-drive) — die test laadt de `.wasm` gewoon in node, dus
dit is zonder oren te controleren. CPU: 0,2 % (VCF) en 0,4 % (MS-20).

### 2. MIDI CC + pitch-bend in het simulatiepaneel — **klaar** (2026-09-20)

`MidiSource` zond `cc` en `pitchBend` al; `SimulationPanel` luisterde alleen
naar noteOn/noteOff, dus mod-wiel en bend deden niets terwijl de kabels in de
patch lagen.

Opgelost door de MOD-uitgangen van MIDI-In (`cv_mod`, `cv_bend`, `cv_cc1`,
`cv_cc2`) echte `Tone.Signal`s te maken. Daarmee neemt alle bestaande
CV-bedrading ze aan zoals die van een LFO, en hoefde alleen de dispatcher
narrow gezet te worden op de NOTE-poorten (pitch/gate/vel). `engine.controlChange`
en `engine.pitchBend` zetten de waarden; bend is V/Oct met `bendRange` als
volle uitslag.

Daarbij bleek `cv → VCO.tune` helemaal niet bedraad te zijn: ook een
LFO-vibrato kwam nooit bij de VCO aan. Nu wel — volt × 1200 op `osc.detune`,
zodat het optelt bij de noot van de dispatcher.

### 3. Bestaande C++ die alleen nog niet gebouwd is

`string` en `stk_sound` (STK staat in `firmware/lib/stk`), `comb`,
`resonator`, `comp`, `cr78` — DSP zit in de module-header zelf. Per module:
kernel eruit naar `mmb-dsp` waar hij nog in de header zit, dan het recept.

### 4. Kernels uit de Teensy-klassen tillen

`vco` (`AudioSynthWaveform`), `ladder` (`AudioFilterLadder`, Huovilainen van
Richard van Hoesel), `ahdsr` (envelope), `echo` (`AudioEffectDelay`),
`string` (`AudioSynthKarplusStrong`). Kopiëren naar `mmb-dsp`, de
`AudioStream`-schil in de firmware laten, firmware laten draaien op de
kernel, daarna het recept. Elke module is los af te ronden.

### 5. Stemgedrag van MIDI-In — **deels** (2026-09-20)

Gedaan:

- **STEAL** (old/low/high) stuurt nu beide toewijzers. Het beleid zit in
  `pickVoiceIndex()` in `polySim.ts`; de Tone-toewijzer en de wasm-toewijzer
  roepen hetzelfde aan, zodat ze niet uit elkaar kunnen lopen.
- **voiceCount** knipt de PolyGroups af op het aantal stemmen dat de knop
  aangeeft — de firmware bouwt er ook niet meer dan dat. Eén stem = geen
  groep: de kabels blijven op de master staan.
- **GLIDE** (ms per octaaf) is de glijtijd van de VCO geworden. Daarbij bleek
  dat de MIDI-dispatcher `baseMidi` van een VCO nooit bijwerkte, waardoor de
  Coarse-knop tijdens het spelen naar een oude noot sprong.

Blijft over: **PRIO** (mono note-priority last/low/high — vraagt een lijstje
ingedrukte toetsen in de toewijzer), **LEG** (legato: geen envelope-hertrigger
zolang er nog een toets ligt) en **UNI/SPRD** (unison met detune-spreiding).
Glide werkt alleen voor Tone-VCO's; een wasm-stem krijgt zijn `voct` als
stapwaarde, dus daar hoort het in de wrapper thuis.

### Onderweg gevonden: de worklet liep vooruit op zijn invoer

`mmb-worklet.js` rendert native samples voor het lopende render-quantum, maar
moest daarvoor invoer hebben die nog niet binnen was. De resampling klemde dan
op de laatst ontvangen sample, waardoor de staart van elk blok bevroor. Dat
gold voor **alle** wasm-modules en klonk als korrel en overstuur; gemeten op
een zuivere toon was er meer vuil dan signaal (SNR 16 dB). De host bouwt nu
eerst één render-quantum voorsprong op — SNR 84 dB, kosten een paar ms
latency. Vastgelegd in `editor/src/modular-mb/sim/wasmWorklet.test.ts`.

Het viel op doordat de nieuwe filters op blok 128 stonden, waar het effect
vier keer zo groot is (SNR −1,5 dB). Vandaar de vuistregel in de README: houd
het blok klein en de smoothing op de Teensy-cadans.

### Onderweg gevonden: de MS-20 klemde niet op de Teensy

`Ms20Module.h` castte zijn uitgang rechtstreeks naar int16. Met de resonantie
op zelf-oscillatie én drive open komt de Korg35-lus boven ±1 uit, en dan wrapt
die cast: harde foldover op de hardware waar de simulator netjes clipt.
Opgelost (2026-09-20) door te klemmen vóór de cast, zoals Elements en de VCF
al deden. Firmware compileert.

Elements is hier juist goed: die klemt al, en de "overdrive" die je bij hoge
`damping` hoort is Mutable's eigen `SoftLimit()` in `part.cc` — de resonator
houdt zijn energie vast en stapelt tot hij tegen die limiter aanloopt. Zelfde
gedrag op de Teensy; geen porteerfout.

## Wat geen wasm-port oplost

- **CV-domein.** De firmware heeft een aparte `CvGraph` op een 1 kHz
  control-tick; de simulator behandelt CV als audio-rate signaal. Andere
  modulatieresolutie, ander gedrag bij snelle envelopes.
- **Wasm-CV → Tone-modules.** Gates uit een wasm-module triggeren geen
  Tone-envelope en wasm-CV stemt geen Tone-VCO: die worden per JS-aanroep
  aangestuurd, niet per signaal. Lost zichzelf op naarmate stap 3 en 4
  vorderen.
- **Sequencer → poly** blijft in de sim monofoon (stem 1).
- **int16 vs float, 44,1 kHz vs contextrate.** De worklet resamplet, maar
  headroom en clipping verschillen.

## Het recept (uit de README, met de valkuilen erbij)

1. `tools/mmb-wasm/<naam>_wasm.cc` — controls en poorten uit `<X>Module.h`,
   zonder `AudioStream`. Poort- en control-ids **gelijk aan
   `seedModules.ts`**, anders koppelt de worklet ze niet.
2. Eén `build`-regel in `tools/mmb-wasm/build.sh`.
3. typeId toevoegen aan `WasmModule.typeIds`
   (`editor/src/modular-mb/runtime/audio/WasmModule.ts`).
4. Controleren: `node tools/mmb-wasm/test.mjs` (poorten, pieken, flanken,
   CPU) en `npm test` in `editor/` (de simSupport-test telt de bakken).

**Let op:** stap 3 zonder een gebouwde `.wasm` maakt de module *stil* in
plaats van benaderd — de runtime valt niet terug op Tone. typeId dus pas
registreren als het binair er staat, en de `.wasm` meecommitten
(`editor/public/wasm/` staat in git).

### Toolchain

wasi-sdk uit <https://github.com/WebAssembly/wasi-sdk/releases>, uitgepakt in
`~/.wasi-sdk/` of via `$WASI_SDK`. `build.sh` zoekt zelf in `~/.wasi-sdk`;
sinds 2026-09-20 ook naar de linux- en windows-builds, niet alleen macos.
Op Windows draait `build.sh` onder Git Bash.

## Voortgang

- [x] Tone-PolyGroups worden uitgevouwen en polyfoon gespeeld
      (`polySim.ts`, 2026-09-20)
- [x] Stap 1 — vcf + ms20 naar wasm (2026-09-20)
- [x] Stap 2 — MIDI CC + bend in de sim, plus cv → VCO.tune (2026-09-20)
- [ ] Stap 3 — string, stk_sound, comb, resonator, comp, cr78
- [ ] Stap 4 — vco, ladder, ahdsr, echo
- [~] Stap 5 — stemgedrag MIDI-In: steal, voiceCount en glide (2026-09-20); prio, legato en unison blijven open
