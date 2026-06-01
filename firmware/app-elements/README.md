# app-elements — Mutable Instruments *Elements* port (spike)

Dedicated Teensy 4.1 app for porting the open-source (MIT) **Elements** modal /
physical-modelling voice into MusicBrain as a `tp_mmb_elements` AudioModule.

## Why a separate target

Elements runs on an STM32F4 (Cortex-M4 @ 168 MHz). The Teensy 4.1
(Cortex-M7 @ 600 MHz + FPU) is far faster, so CPU is not the bottleneck — but
we still want a **measured** per-voice cost before adding it to
`app-modular-brain`. This target isolates one voice and prints
`AudioProcessorUsageMax()` so we can estimate how many voices fit.

## Status: real DSP vendored

The genuine upstream Mutable Instruments **Elements** DSP (MIT, © Emilie Gillet)
is now vendored byte-exact under [lib/mi-elements/](lib/mi-elements/) (see its
`VENDORED.md` for provenance, the copied file list, and the two small Teensy
adaptations). [src/ElementsModule.h](src/ElementsModule.h) drives it through
`elements::Part`:

- `ElementsVoice` renders `Part` at its native **32 kHz** (blocks of 16) and
  **linearly resamples to 44.1 kHz** for the Teensy Audio library.
- The 64 KB reverb delay line lives in OCRAM (`DMAMEM`); the ~380 KB of lookup
  tables stay in flash (`FLASHMEM`) — neither fits in the M7 DTCM fast RAM.
- Controls map onto the Elements `Patch`: `geometry`, `brightness`, `damping`,
  `position`, `space`, and `exciter` (0 = bow, 1 = blow, 2 = strike).
- `voct`/`gate`/`strength` drive `PerformanceState`; USB-MIDI note-on/off in
  `main.cpp` raise/lower the gate.

### Build footprint (teensy41)

| Region | Used | Free |
|--------|------|------|
| FLASH  | ~485 KB (code 476 KB + tables) | ~7.6 MB |
| RAM1 (DTCM) | ~135 KB vars | ~257 KB |
| RAM2 (OCRAM) | ~99 KB (incl. 64 KB reverb + audio blocks) | ~425 KB |

### Remaining work

1. Measure `AudioProcessorUsageMax()` on hardware to estimate polyphony.
2. Down-sample the external `blow_in` / `strike_in` audio inputs into the Part
   (currently silence is fed, so only the internal exciters are active).
3. Integrate `tp_mmb_elements` into `app-modular-brain` (delete the local
   `AudioModule.h` copy and reuse the shared mixin).


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
