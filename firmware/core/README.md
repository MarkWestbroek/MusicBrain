# `core/` – hardware-independent MusicBrain library

Pure C++17, no vendor headers. Compiles on host (for tests and the simulator) and on every supported MCU via `hal/<target>/`.

## Modules

| Header | Purpose |
|---|---|
| `Types.h` | Small value types (channel ids, voltages, durations) used across the library. |
| `Patch.h` | A single program (effect-loop bits, amp routing, or modular CV/voice config). |
| `PatchBank.h` | An indexed collection of `Patch`es with current-program state. |
| `Router.h` | Pure function from `(input event, active patch, hardware model)` to output commands. |
| `Transport/ITransport.h` | Abstract send/receive of `Frame`s (USB-CDC, SPI, CAN-FD bridge, host loopback). |
| `Protocol/SpiFrame.h` | Wire format used between brain and breakouts. See [doc/protocols/spi-frame.md](../../doc/protocols/spi-frame.md). |
| `UI/IDisplay.h`, `UI/IInputs.h` | Abstract display / buttons / encoders / pots / footswitches. |
| `Storage/IStore.h` | Abstract KV/blob store for patch banks (flash, SD, in-memory). |
| `VoiceAllocator.h` | Last-note-priority allocator with oldest-held steal; up to 16 voices (project target: 8). |
| `runtime/Module.h` | ADR 0009 abstract base for every runtime module. Owns `typeId` + instance `id` and the `setControl(...)` hook. |
| `runtime/CvModule.h` | CV-domain module; subclasses implement `tick()` driven at `kCvTickRateHz = 1000` Hz. |
| `runtime/AudioModule.h` | Audio-domain module; subclasses implement `update()` once per 128-sample block at 44.1 kHz. |
| `runtime/ExternalModule.h` | Passive routing handle for Eurorack modules; no DSP on the brain. |
| `runtime/Envelope.h` | Abstract envelope interface (`setGate`, `value`, `active`). |
| `runtime/Registry.h` | Factory registry: `typeId` → `unique_ptr<Module>`. Concrete classes self-register at static-init. |
| `runtime/Ahdsr.h` | AHDSR envelope with `Curve { Linear, Exponential, Logarithmic }` and loop mode. Mirrors Tone-side panel one-to-one. |
| `runtime/Lfo.h` | LFO modelled on Tone.LFO + panel extensions: `Wave { Sin, Tri, Saw, Sqr, S&H }`, `bipolar`, `Run { Always, Gated, OneShot }`, reset trigger. |
| `runtime/CvBreakout.h` | Abstract brain-side breakout. Holds `(caseId, firstSlot)`, owns per-slot float inputs, ships changes via an injectable `BreakoutSink`. |
| `runtime/CvOut12.h` | 8-channel 12-bit modulation breakout (per `doc/tech/dac-sh-mux.md`). |
| `runtime/CvOut16.h` | 16-bit pitch / 1V-oct breakout (DAC8568 reference). |
| `runtime/GateOut.h` | Digital gate/trigger breakout; deduplicates repeated identical states. |

### Runtime layer (ADR 0009)

The `runtime/` subtree is the firmware mirror of `editor/src/modular-mb/runtime/`. Each concrete class:

1. Inherits from `CvModule` or `AudioModule`.
2. Declares a `static constexpr const char* kTypeId` matching the layer-1 catalog id (e.g. `tp_mmb_lfo`).
3. Implements `setControl(controlId, ControlValue)` to accept live edits from layer 2.
4. Self-registers via an anonymous-namespace static initialiser, so adding a module type means dropping in `Foo.h` / `Foo.cpp` with no changes to the patch loader.

Time bookkeeping is in ticks (`kCvTickRateHz`, `kAudioSampleHz`) — never `millis()` — so the same code runs on host (for CTest) and on the Teensy unchanged.

The library **never** allocates after start-up in production code paths; collections use fixed-capacity types (`std::array`, small custom ring buffers).

## Tests

```powershell
cd firmware
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```
