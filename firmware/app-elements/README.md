# app-elements — Mutable Instruments *Elements* port (spike)

Dedicated Teensy 4.1 app for porting the open-source (MIT) **Elements** modal /
physical-modelling voice into MusicBrain as a `tp_mmb_elements` AudioModule.

## Why a separate target

Elements runs on an STM32F4 (Cortex-M4 @ 168 MHz). The Teensy 4.1
(Cortex-M7 @ 600 MHz + FPU) is far faster, so CPU is not the bottleneck — but
we still want a **measured** per-voice cost before adding it to
`app-modular-brain`. This target isolates one voice and prints
`AudioProcessorUsageMax()` so we can estimate how many voices fit.

## Status: skeleton only

The real Mutable DSP is **not vendored yet**. `ElementsCore` in
[src/ElementsModule.h](src/ElementsModule.h) is a placeholder modal stub (a bank
of decaying inharmonic sine partials struck on note-on) so the target builds,
makes a plausible struck/metallic sound, and exercises the FPU + audio plumbing.

## Finishing the port

1. Vendor `elements/dsp/` from `mutable-instruments/eurorack` (MIT) into a
   `lib/elements/` folder (`part.cc`, `voice.cc`, `exciter.cc`, `resonator.cc`,
   `tube.cc`, `string.cc`, `multistage_envelope.cc`, plus `stmlib` deps).
2. Replace `ElementsCore` with `elements::Part`; map controls (`exciter`,
   `geometry`, `brightness`, `damping`, `position`, `space`) onto its
   `Patch`/`PerformanceState`.
3. Add the **32 kHz → 44.1 kHz** resampler in `ElementsVoice::update()`
   (currently the stub runs at the Teensy rate — see `TODO(resample)` and
   `kElementsRate`). Elements processes blocks of 16 @ 32 kHz; the Teensy gives
   blocks of 128 @ 44.1 kHz.
4. Swap `stmlib` fixed-point / CMSIS-DSP intrinsics for plain float math.

## Port map (target)

| Direction | portId       | Domain | Meaning                              |
|-----------|--------------|--------|--------------------------------------|
| input     | `voct`       | Cv     | pitch (V/Oct, MIDI 60 = 0 V)         |
| input     | `gate`       | Gate   | rising edge → strike / note-on       |
| input     | `strength`   | Cv     | exciter strength / contour           |
| input     | `blow_in`    | Audio  | external blow excitation (optional)  |
| input     | `strike_in`  | Audio  | external strike excitation (optional)|
| output    | `out`        | Audio  | main voice output                    |

## Build / flash

```powershell
# from repo root
.\.venv\Scripts\pio.exe run -d firmware\app-elements
# flash (disconnect editor serial first):
.\.venv\Scripts\pio.exe run -d firmware\app-elements -t upload
```

Then play MIDI notes into the Teensy and watch the `[cpu] audio peak=…%` line
on the serial monitor (115200) to read the per-voice load.
