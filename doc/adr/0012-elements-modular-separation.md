# ADR 0012 – Elements modular separation: Reverb and OminousVoice as standalone modules

## Status
Accepted (2026-06-05)

## Context

The Mutable Instruments *Elements* DSP (MIT, © Emilie Gillet) was vendored into
`firmware/app-elements/` as a monophonic spike. In that spike `ElementsVoice`
wraps `elements::Part`, and `Part` contains everything: voice rendering,
mixdown, stereo imaging, reverb, and an easter-egg voice (`OminousVoice`).

This worked for a single voice, but it creates three problems for integration
into `app-modular-brain`:

1. **Memory:** `elements::Part` with `kNumVoices = 1` is ~113 KB (DTCM).  The
   bulk comes from `Voice` (exciter + resonator + 5× string delay lines + tube).
   With `kNumVoices = 4` the Part overflows DTCM (~452 KB).  Each Part also
   embeds a `Reverb` whose 32 768-sample delay line is another ~64 KB.

2. **Architecture:** In MusicBrain an effect (reverb) is a separate, routable
   `AudioModule`, not a baked-in sub-component of a voice.  A polyphonic rack
   should mix N dry voices first, then send the mix to one reverb — not run N
   reverbs in parallel.

3. **Easter egg:** `OminousVoice` (a dark 2-op FM synth) is an entirely
   different instrument hidden behind a boolean flag.  It shares no sonic DNA
   with the modal-physical voice and deserves its own module type.

Emilie Gillet confirmed (private correspondence) that polyphony on a faster
processor is feasible.  The MIT license permits modification provided the
original copyright notice is preserved, which we already do in every vendored
file header and in `VENDORED.md`.

## Decision

### 1. Extract `Reverb` into a standalone `AudioModule`

`elements::Reverb` will be removed from `elements::Part` and wrapped as its own
`tp_mmb_elements_reverb` module.

- `Reverb` is already a self-contained class: `Init(uint16_t* buffer)` + stereo
  `Process(float* left, float* right, size_t size)`.
- The delay-line buffer (`uint16_t[32768]`) will be allocated by the module host
  (in OCRAM / `DMAMEM`) and passed to `Init()`, just as the spike already does
  for the voice Part.
- Controls exposed: `amount`, `time`, `diffusion`, `lp`.
- Port map: stereo in (`in_l`, `in_r`) → stereo out (`out_l`, `out_r`).

The upstream `Reverb` code stays vendored in `lib/mi-elements/`; only the call
site in `Part::Process()` is removed.

### 2. Extract `OminousVoice` into a standalone `AudioModule`

`elements::OminousVoice` will be removed from `elements::Part` and wrapped as
`tp_mmb_ominous`.

- It is only reached via the `easter_egg_` branch in `Part::Process()`.
- It has its own `Init()` / `Process()` / envelope and does not depend on the
   modal resonator pipeline.
- The module will run at Elements' native 32 kHz with the same resampler pattern
  already proven in `ElementsVoice`.

### 3. `Part` becomes a pure voice renderer

After the two extractions `elements::Part` contains only:

- `Patch patch_` — shared patch parameters
- `Voice voice_[kNumVoices]` — the modal/exciter pipeline
- Mixdown buffers (`raw_`, `center_`, `sides_`)  
- `PerformanceState` gate / note bookkeeping
- Soft-limit and metering

`Part::Init(uint16_t* reverb_buffer)` will lose the `reverb_buffer` parameter
(and the `reverb_.Init()` call).  `Part::Process()` will stop at the
soft-limit step and return `main` / `aux` without calling `reverb_.Process()`.

The `Patch` struct will keep the reverb-related fields (`reverb_diffusion`,
`reverb_lp`, `space`) for backward compatibility with existing patches, but the
voice module will ignore them; the standalone Reverb module will read them
instead when driven by the same control values.

### 4. Polyphony is realised by the existing `PolyGroup` mechanism

We do **not** increase `kNumVoices` inside `Part`.  Each polyphonic voice is a
separate `ElementsModule` instance created by the editor's
`flattenProjectForFirmware()` / PolyGroup expansion (see [ADR 0010](0010-midi-in-and-polyphony.md)).

- `MidiInModule` (already in `app-modular-brain`) fans note/gate/pitch out to
  per-voice `ElementsModule` instances.
- A `Mixer` module (or `Mixer8`) sums the dry voice outputs.
- The summed mix is routed to the standalone `Reverb` module (or to any other
  effect the patch chooses).

This is the same pattern already used for analog-style polyphony with `Vco`,
`Vcf`, `Vca`, and `Ahdsr` modules.

## Consequences

**Pro:**
- **Memory per voice drops by ~68 KB** (Reverb 64 KB + OminousVoice ~3.6 KB).
  A 4-voice Elements rack now costs ~4 × 113 KB = 452 KB — still large, but
  now fits in DTCM (512 KB) with the Reverb living once in OCRAM.
- **Modular routing:** users can place reverb on a bus, use a different reverb,
  or send the dry mix to external effects.
- **Code clarity:** the easter-egg path is gone from the voice module; the
  Ominous voice gets its own panel in the editor.
- **No vendored-code fork needed:** we only delete call sites and member
  declarations inside `Part`; `Reverb.h` and `OminousVoice.h` stay untouched.

**Con:**
- `Part::Process()` must be modified (remove reverb call, remove easter-egg
  branch, change `Init()` signature).  This deviates from "byte-exact vendored"
  but is explicitly allowed by MIT and by the author's intent.
- `ElementsVoice::update()` must be upgraded to stereo (output both `main` and
  `aux` as L+R), or the mixer must accept mono inputs.  The mixer already does.
- The editor's `mmbElements()` seed function must gain a `space` control that
  now routes to the *separate* Reverb module, not to the voice's embedded one.

**Neutral:**
- The `Patch` struct still carries `reverb_diffusion`, `reverb_lp`, and `space`
  fields.  They are harmless dead weight in the voice module but convenient for
  the standalone Reverb module if it reads the same struct.
- `kNumVoices` stays `1` in `Part.h`.  Polyphony is handled at the MusicBrain
  module-graph level, not inside the upstream DSP.

## Decisions on open questions
### Stereo output
`ElementsVoice` outputs **stereo** (`main` + `aux` as L/R).  
`space` controls `spread` (0–0.7) which pans `center_buffer_` ± `sides_buffer_` into
`main`/`aux` *before* the reverb stage. Removing the embedded reverb does **not**
remove the stereo imaging — it only removes the late-field reflections.  
`resonator_position` (Patch field) controls excitation point on the resonator
and is unrelated to output panning.

### Reverb sample rate
The standalone `Reverb` module runs at **44.1 kHz natively** (option B).  
Delay-line lengths and LFO coefficients in the vendored `FxEngine` will be scaled
by the ratio `44100 / 32000 ≈ 1.378`. This preserves the original decay times and
modulation rates while avoiding an extra resampler stage.