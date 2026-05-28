# Project 3 — Polyphonic modular synth controller / router / patch saver

See [doc/Requirements.md §3](../../doc/Requirements.md), [doc/Plan.md §4](../../doc/Plan.md), and ADRs [0004](../../doc/adr/0004-dac-resolution.md), [0006](../../doc/adr/0006-multi-case-transport.md), [0008](../../doc/adr/0008-latency-and-interpolation.md).

## Plan
- Target: Teensy 4.1.
- Inputs: MIDI (DIN + USB-MIDI), keybed, pots/encoders/buttons, optional CV-in via SPI breakouts.
- Outputs: SPI bus to breakouts (CV out, gates, triggers, CV in, envelope engines). Optional CAN-FD bridge for multi-case setups.
- 1 kHz control tick; breakouts interpolate to DAC rate.
- Tuner / oscillator calibration via Teensy ADC + PJRC autocorrelation.

## Patch schema (sketch)
```
SynthPatch {
  voiceAssignment      // MIDI note -> oscillator bank
  cvMatrix: list<Edge> // (srcModule, srcPort) -> (dstModule, dstPort) [amount, offset]
  envelopes[], lfos[]  // brain-generated modulator params
  modWheelMap, velocityMap, aftertouchMap
  audioMatrixHint      // optional pictorial routing for the analog side
  calibration: per-oscillator pitch table
}
```

To be implemented in roadmap stages 5–7.

## DEVLOG

### 2026-05-28 — B-phase step 0 + step 1 (toolchain + 1 audible voice)

**Step 0 — toolchain & USB pipeline.**
- PlatformIO 6.1.19 installed into `.venv` (Python 3.14, `pip install platformio`). Project at this directory; `platformio.ini` targets `teensy41`, framework `arduino`, upload via `teensy-gui` (Windows package ships `teensy.exe` GUI loader + `teensy_post_compile/_reboot.exe`; the `teensy-cli` protocol expects `teensy_loader_cli` which is not bundled).
- First-time build pulled `framework-arduinoteensy 1.160`, `toolchain-gccarmnoneeabi-teensy 11.3.1`, `tool-teensy 1.160`. Build cold ≈ 25 s, warm ≈ 4 s.
- After upload the Teensy enumerates as USB composite device (PJRC VID 16C0, PID `0489` for Serial+MIDI, `0488` for Serial+MIDI+Audio after step 1) → COMx serial port + "Teensy MIDI" endpoint.
- MIDI-roundtrip validated by `scripts/pipeline_test.py`: every incoming note is echoed back +12 semitones, on and off. Script uses pure `ctypes` against `winmm.dll` (Win32 MIDI API) because `python-rtmidi` and `pygame` have no Python 3.14 wheels yet.

**Step 1 — first audible voice.**
- USB Type bumped to `USB_MIDI_AUDIO_SERIAL`: device now also enumerates as USB-audio output on the host (Windows shows "Teensy MIDI/Audio").
- Audio graph (`src/main.cpp`):
  ```
  AudioSynthWaveform osc (saw)
        |
        v
  AudioEffectMultiply vca <-- AudioSynthWaveformDc eg (ramped DC = AR envelope)
        |
        v (mono → L + R)
  AudioOutputUSB
  ```
- `noteOn` sets `osc.frequency(440·2^((note-69)/12))`, `osc.amplitude(0.8)`, `eg.amplitude(vel/127, 5ms)`. `noteOff` (or `noteOn` with velocity 0 — running-status) does `eg.amplitude(0, 50ms)`.
- Heartbeat LED + `Serial.printf` boot-banner + per-note log retained from step 0. MIDI-echo also retained so the existing pipeline test keeps passing.

**Commands.**
```powershell
cd firmware\app-modular-brain
..\..\.venv\Scripts\pio.exe run                       # build
..\..\.venv\Scripts\pio.exe run -t upload             # build + flash
..\..\.venv\Scripts\python.exe scripts\pipeline_test.py  # MIDI roundtrip test
..\..\.venv\Scripts\pio.exe device monitor            # serial debug
```

**Open / deferred for B-phase step 2+.**
- 4 voices in parallel (replicate `osc/eg/vca` ×4, mix into one stereo sum).
- Voice-allocator (port `core/MidiInModule` allocator over usbMIDI handler).
- VCF (AudioFilterStateVariable) + per-voice CV-rate envelope/LFO scheduling separated from audio block-rate.
- Voice-stealing test: send a 5th simultaneous note from `pipeline_test.py` and assert the oldest voice is replaced.
- After B: DIN-merge, BO-board SPI, CC + pitchbend.

### 2026-05-28 — B-phase step 2 (4-voice polyphony via shared `MidiInModule`)

**OO design.** The MIDI-in side is now driven by `mb::runtime::MidiInModule` — the same module the editor and host-tests already use. It owns a `mb::VoiceAllocator` (last-note priority, round-robin steal, kMaxAllocVoices = 16) and exposes `onNoteOn/Off` + `voicePitchV(i)/voiceGate(i)/voiceVelocity(i)` queries. The Teensy sketch instantiates one `MidiInModule midiIn{"midi1"}`, configures it via `setControl("voiceCount", 4)`, and mirrors its state into 4 audio voices after every event. No allocator logic lives in `main.cpp`.

**PIO wiring.** `platformio.ini`:
- `build_flags = -D USB_MIDI_AUDIO_SERIAL -D TEENSY_OPT_FASTER -I ../core/include`
- `lib_extra_dirs = ..` + `lib_deps = core`
PIO compiles `firmware/core/src/**/*.cpp` as a Teensy library (`lib056/core/...`). This worked after fixing a few `std::clamp(int32_t, int, int)` call sites in `MidiIn.cpp`, `Lfo.cpp`, `CvBreakout.cpp`, `Ahdsr.cpp` — on ARM `int32_t` is `long int`, so template-arg deduction fails. Switched to explicit `std::clamp<std::int32_t>(...)`. Host tests still pass (76/76).

**Audio graph.** 4× saw → multiply (VCA) ← DC envelope, all 4 VCAs into one stereo `AudioMixer4` (gain 0.25 per channel) → `AudioOutputUSB`. `AudioMemory(40)`. `AudioConnection` has no default ctor, so wires are constructed via placement-new into raw storage. `syncVoicesFromModel()` reads `midiIn` after every note event under `AudioNoInterrupts()` and sets `osc.frequency(voltsToHz(voicePitchV))` + `eg.amplitude(vel*0.7, 5ms)` on / `eg.amplitude(0, 60ms)` off.

**Validation.** `pipeline_test.py` extended with 3 sub-tests:
1. single-note echo (regression from step 1)
2. 4-note chord — all voices allocated, all 4 echoes received
3. 5-note "voice stealing" — 5th simultaneous note doesn't deadlock; firmware still echoes all 5
   All three PASS. Stealing semantics themselves are covered by host tests (`test_midiin.cpp`).
   Audible: holding 5 notes on the KeyStep Pro yields 4 voices; the 5th replaces the oldest (visible in the serial `[voices on]` table).

**Listening on Windows.** `AudioOutputUSB` is a *recording* device on Windows. Enable: Sound → Recording → "Digital Audio Interface (Teensy MIDI/Audio)" → Properties → Listen → "Listen to this device" → Speakers.

### 2026-05-28 — Editor ↔ Teensy link (mmb-config.v1, USB Serial)

End-to-end transport between the React editor and the Teensy is live. Newline-terminated JSON over USB-Serial (115200 8N1), Web Serial in the browser, ArduinoJson 7 on the device. Protocol spec lives in [doc/sketches/polyphony-rack-patcher-ui.md §6.5](../../doc/sketches/polyphony-rack-patcher-ui.md).

- **Device side** ([src/TeensyLink.h](src/TeensyLink.h)): single header class, line-buffer up to 32 KB, `JsonDocument` (auto-sized). Sends `{"type":"hello","fw":"mmb-teensy-1","step":2}` at boot; handles `hello` / `config` / `selectPatch`; replies with `ack` (ok or err) and structured `log` lines. Co-exists with the 4-voice MIDI path on the same `Serial`: raw `Serial.printf` lines from `handleNoteOn/Off` interleave fine because the editor only parses lines that start with `{`.
- **Editor side** ([editor/src/modular-mb/teensyLink.ts](../../editor/src/modular-mb/teensyLink.ts) + [TeensyLinkModal.tsx](../../editor/src/modular-mb/TeensyLinkModal.tsx)): Web Serial wrapper as a `useSyncExternalStore` singleton (state survives re-renders, connection stays open across tab switches). Modal in the project bar (🔌 Teensy) shows status, ack-summary, and a live tx/rx log. Push-buttons: "Push config" (whole `ModularProject`) and "Select active patch".
- **PIO config.** Added `bblanchon/ArduinoJson@^7.1.0` to `lib_deps`. PIO's LDF didn't resolve the include path automatically (likely the `lib_extra_dirs = ..` interaction with `core/`); fixed by adding `-I .pio/libdeps/teensy41/ArduinoJson/src` to `build_flags`. FLASH +20 KB, RAM unchanged (auto-sized `JsonDocument` allocates on demand).
- **Validation.** MIDI pipeline test still green (all 3 sub-tests PASS) — Serial-link traffic doesn't disturb the audio path.
- **Next (B-step 3).** Replace the hardcoded 4-voice setup with a `ModuleRegistry` that instantiates `MidiInModule` / `VcoModule` / `AdsrModule` / `VcaModule` from the incoming `project.modules` + `patch.connections`. First mapped types: MIDI-IN → existing `mb::runtime::MidiInModule`, VCO → `AudioSynthWaveform` wrap, ADSR → `AudioSynthWaveformDc` ramp wrap, VCA → `AudioEffectMultiply` wrap, AUDIO-OUT → `AudioOutputUSB`.

### 2026-05-29 — B-phase step 3 (dynamic audio graph from patch JSON)

The editor can now push a patch and the Teensy re-wires its audio graph at runtime without a reflash.

**Architecture.**

| New file | Role |
|---|---|
| `src/AudioPortModule.h` | Interface mixin; declares `outputPort()` / `inputPort()` returning `AudioPort{stream*, channel, valid}`. Overrides `Module::supportsAudioPorts()` → `true`; provides `AudioPortModule::from(Module*)` static cast helper. |
| `src/AudioGraph.h/.cpp` | `build(patch, instances)` iterates the `connections` array in the patch JSON, resolves both endpoints via `AudioPortModule::from()`, creates `unique_ptr<AudioConnection>`. `tearDown()` destroys all connections under `AudioNoInterrupts/Interrupts`. Logs wired/skipped counts. |
| `src/VcoModule.h` | `tp_mmb_vco`, wraps `AudioSynthWaveform`. `updatePitch(volts)` converts V/Oct to Hz (`261.6 · 2^v`). Ports: out `"out"`. |
| `src/VcaModule.h` | `tp_mmb_vca`, wraps `AudioEffectMultiply`. Port `"in"` → ch 0, `"cv"` → ch 1, `"out"` → ch 0. |
| `src/AhdsrAudioModule.h` | `tp_mmb_ahdsr`, composes `mb::runtime::Ahdsr env_` + `mutable AudioSynthWaveformDc dc_`. `tick()` calls `env_.tick()` then `dc_.amplitude(env_.value())`. Overwrites the core Ahdsr factory so that `ProjectRuntime::applyConfig` now instantiates this richer type. |
| `src/VcfModule.h` | `tp_mmb_vcf`, wraps `AudioFilterStateVariable`. Output channel: LP=0, HP=2, BP=1. |
| `src/OutModule.h` | `tp_mmb_out`, routes `"l"` / `"r"` to a shared `AudioOutputUSB*` singleton set in `setup()`. |

**Key design decisions.**

- **No RTTI.** Teensy builds compile with `-fno-rtti`. `dynamic_cast` is forbidden. Solution: `Module::supportsAudioPorts()` virtual bool (default `false`; `AudioPortModule` overrides to `true`) plus `static_cast` where the virtual tag guarantees safety. Similarly, `tickCvModules()` and `syncDynamicModules()` in `main.cpp` use `mod->typeId()` comparison + `static_cast`.
- **`insert_or_assign` in Registry.** `Ahdsr.cpp` auto-registers `tp_mmb_ahdsr` at static-init time. Changed `Registry::register_()` from `emplace` (first-wins) to `insert_or_assign` (last-wins) so `AhdsrAudioModule::registerFactory()` — called last in `registerAllRuntimeModules()` — can overwrite it.
- **`AudioOutputUSB` singleton.** Multiple `AudioOutputUSB` instances conflict on USB. `OutModule::sharedOutput` is an `inline static` pointer set in `setup()` to the single global `usbOut`.
- **Composition, not inheritance, for `AhdsrAudioModule`.** Inheriting both `Ahdsr` and `AudioPortModule` would create a diamond through `Module`. Instead `AhdsrAudioModule` owns an `mb::runtime::Ahdsr env_` member and delegates all envelope logic to it.
- **Backward compatibility.** The static 4-voice graph from B-step 2 is still present and runs concurrently with the dynamic graph. MIDI notes drive both chains simultaneously. Disabling the static graph when a dynamic patch is active is deferred to B-step 4.

**CV tick.** `loop()` fires `tickCvModules()` every ≥ 1 ms (guarded by `millis()` delta), which calls `env->tick()` on every `AhdsrAudioModule` instance so the AHDSR state machine advances independent of the audio block callback.

**Mono limitation.** `syncDynamicModules()` drives all VCO/AHDSR instances from voice-0 only. Polyphonic dynamic patches are a future step.

**Build result.**
```
FLASH: 125 560 B code (+10 KB vs step 2)
RAM1:  free local 322 304 B
RAM2:  free malloc 495 712 B
[SUCCESS]
```

