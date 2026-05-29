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

### 2026-06 — MIDI feedback fix, pure CV/audio split, LFO rate-CV/inv, stereo mixer (fw 0.5.1)

Follow-up batch addressing a "ring-modulation / hoarse" sound and tightening the
signal-domain architecture ahead of polyphony.

**MIDI feedback loop (the hoarse/ring-mod bug).** Symptom: a played note caused
an octave cascade in the log (60, 72, 84, 96, …) and a beating, hoarse tone.
Two compounding causes: (1) the firmware echoed every note **+12** back over
USB-MIDI (a leftover from `pipeline_test.py`); (2) the editor's `WebMidiSource`
subscribed to **all** Web-MIDI inputs, including the Teensy's own USB-MIDI port.
So editor → Teensy note 60 → Teensy echoes 72 → browser hears 72 from the
Teensy port → forwards it → echoes 84 → runaway. Two oscillators a near-octave
apart = beating/comb-filter = hoarse. Fix: (a) removed the `+12` echo from
`handleNoteOn/Off` entirely; (b) `WebMidiSource` now skips its own device ports
(name/manufacturer contains "teensy"/"musicbrain") and dedupes held notes via a
`Set<number>` so multi-port controllers (e.g. KeyStep Pro) can't double-trigger.

**Pure CV vs audio signal split.** Each `portId` now lives in exactly **one**
domain so `CvGraph` and `AudioGraph` can't both claim the same input. The old
DC-proxy (`AudioSynthWaveformDc`) that doubled as an *exposed audio port* is
gone from the exposed surface:
- `AhdsrAudioModule` no longer exposes `dc_` as an audio output — it is pure CV
  (`cv_out` → `env_.value()`, `gate`/`trig` → Gate). No audio ports.
- `VcaModule.cv` is CV-only; the internal `cvDc_` stays **permanently**
  connected to `mult_` ch 1 (no more lazy-connect race).
- `VcfModule.cv` is CV-only; a permanent internal `cvDc_` drives the filter's
  cutoff-modulation input (`octaveControl(cv_amt)`), so the envelope (0..1) lifts
  cutoff by up to `cv_amt` octaves.
The audio-rate DC objects survive only as **internal implementation details**
where a Teensy DSP node needs an audio-rate signal; they are never exposed as
audio ports. **Rule:** a CV-bridge sink overrides `inputPortKind`+`writeCvPort`
and exposes that port in CV only; a source overrides `outputPortKind`+`readCvPort`.

**LFO rate-CV + inverse out + reset (`tp_mmb_lfo`).** Core `Lfo` gained
`rate_cv` (exponential, ±4 octaves around the knob rate, clamped 0.001–5000 Hz),
an `out_inv` output (`-value_`), and rising-edge `reset`. The editor module
already exposed these ports; firmware now handles them — reset **is** wired.

**Stereo mixer (`tp_mmb_mixer`).** Rewrote the mono `AudioMixer4` mixer into a
4-channel **stereo** mixer: each input fans out (unity `AudioAmplifier`) into a
left + right `AudioMixer4`, with per-channel `volN` (0..1) and `panN` (-1..+1)
applied via an equal-power pan law (`L=vol·cos θ`, `R=vol·sin θ`,
`θ=(pan+1)·π/4`). Ports `in1..in4` → `out_l`/`out_r`. Editor `mmbMixer()`
relaid out as one row per channel (`[in] Vol Pan`) at 8 HP.

**Rack port labels.** Internal MMB modules carry their jack names only in data
(no printed faceplate art), so the rack grid now passes `showPortLabels` =
the module type's `internal` flag — internal modules show their port labels,
Eurorack faceplates stay clean.

```
FLASH: code 138 512 B, data 17 852 B
RAM1:  free local 288 480 B
RAM2:  free malloc 495 712 B
[SUCCESS] — built; flash needs editor serial disconnected or PROGRAM button
```

### 2026-06 — CV-bridge sink fix, MIDI-bridge, Test/Keystep, Mixer + LFO (fw 0.5.0)A batch of editor + firmware work to close the "no sound" gap on the CV-bridge
patch and shorten the test loop.

**VcaModule CV-bridge sink (fw 0.4.5).** The CV-bridge patch
(`CvMath.out → VCA.cv`) produced no sound because `VcaModule` reported its `cv`
port as `PortKind::None`, so `CvGraph` skipped the route. The old working
test-patch only ever drove `VCA.cv` from an AHDSR *audio* DC-proxy, handled by
`AudioGraph`. Fix: gave `VcaModule` a real CV-bridge path — an internal
lazy-connected `AudioSynthWaveformDc cvDc_` proxy, `inputPortKind("cv") → Cv`,
and `writeCvPort("cv", v)` that connects the proxy on first use then sets its
amplitude. The audio-DC-proxy pattern and the CV-bridge pattern now coexist;
lazy-connect prevents two sources colliding on `mult_` channel 1.
**Rule of thumb:** any module that can be a CV-bridge *sink* must override
`inputPortKind` + `writeCvPort`; any CV-bridge *source* must override
`outputPortKind` + `readCvPort`.

**MIDI-bridge (editor → Teensy over serial).** New serial `{"type":"midi",
on,note,vel,ch}` command in `TeensyLink::handleLine()` (no ack — hot path).
`begin()` gained a 4th `MidiNoteHandler onMidiNote` callback that routes into
`handleNoteOn/handleNoteOff`. Editor `teensyLink.ts` gained
`sendMidi(on,note,velocity,channel)` (quiet — no log spam) + `isConnected()`.
Lets the editor forward a hardware Keystep through the browser straight to the
Teensy with no VMPK / manual mapping.

**Test + Keystep buttons** (`TeensyLinkModal.tsx`). "▶️ Test patch" pushes the
config, selects the active patch, waits, then plays a C-major arpeggio.
"🎹 Keystep → Teensy" subscribes a `WebMidiSource` and forwards live note
on/off via `sendMidi`.

**MixerModule (`tp_mmb_mixer`).** 4-input summing audio mixer (`AudioMixer4`):
inputs `in1..in4` (audio ch 0-3), output `out`, controls `gain1..gain4`
(default 0.8). Polyphony building block. Editor counterpart `mmbMixer()` seeded
in `seedModules.ts`.

**LFO as a real CV module (`tp_mmb_lfo`).** The core `Lfo` already had the
waveform / run-mode / depth state machine but was **missing the CV-bridge
methods**, so it never routed. Added `inputPortKind` (`gate`/`reset` → Gate),
`outputPortKind("out") → Cv`, `writeCvPort` (`gate` → `setGate`, `reset` →
rising-edge `reset()`), `readCvPort("out")`. `main.cpp`'s `tickCvModules()` now
also ticks `Lfo` instances every CV tick.
Known editor/firmware port mismatch (low prio): editor `mmbLfo` exposes
`rate_cv` + `out_inv` (not yet handled by firmware) and lacks a `gate` port.

**Cleanup.** Removed the dead `syncDynamicModules()` (unused since the dynamic
graph drives voices via `MidiInModule` + per-module ticks). Clean build, no
warnings. Bumped `FwVersion.h` → **0.5.0**, flashed OK.

```
FLASH: code 137 680 B, data 17 852 B
RAM1:  free local 288 480 B
RAM2:  free malloc 495 712 B
[SUCCESS] — uploaded to Teensy 4.1 (COM4)
```

## Module backlog & status

Firmware module wrappers and their state. "Editor" = seeded module type exists
in `seedModules.ts`; "Firmware" = runtime wrapper + factory registered.

| Module | typeId | Editor | Firmware | Notes |
|---|---|:--:|:--:|---|
| MIDI-IN | `tp_mmb_midiin` | ✅ | ✅ | voice allocator, pitch/gate/vel ports |
| VCO | `tp_mmb_vco` | ✅ | ✅ | V/Oct → Hz; `wave`/`level` |
| VCF | `tp_mmb_vcf` | ✅ | ✅ | LP/HP/BP; `cv` pure-CV cutoff mod via internal DC (0.5.1); `cv_amt` = octaves |
| VCA | `tp_mmb_vca` | ✅ | ✅ | pure-CV sink, permanent internal DC (0.5.1); `gain`/`resp` unused |
| AHDSR | `tp_mmb_ahdsr` | ✅ | ✅ | tick-driven; pure CV `cv_out` (DC-proxy removed, 0.5.1) |
| CvMath | `tp_mmb_cvmath` | ✅ | ✅ | sum / mult modes |
| Mixer | `tp_mmb_mixer` | ✅ | ✅ | stereo 4-in, per-ch vol+pan, `out_l`/`out_r` (0.5.1) |
| LFO | `tp_mmb_lfo` | ✅ | ✅ | CV-bridge + `rate_cv`/`out_inv`/`reset` handled (0.5.1) |
| Seq8 | `tp_mmb_seq8` | ✅ | ⬜ | editor only |
| Noise | — | ⬜ | ⬜ | needs wrapper |
| S&H | — | ⬜ | ⬜ | needs wrapper |
| Echo / Phaser | — | ⬜ | ⬜ | needs wrapper |

### Backlog — Envelope variants (per UML §Envelope)

The UML models an abstract `Envelope` with three concrete subtypes. Only AHDSR
exists today.

- **AHDSR** ✅ — Attack/Hold/Decay/Sustain/Release. Implemented
  (`AhdsrAudioModule` + core `Ahdsr`).
- **Multifase Envelope** ⬜ — N-segment piecewise envelope
  (`(target, duration, curve)` list). Maps cleanly onto the planned
  `CV_SEGMENT` bus opcode (ADR 0008) so the breakout interpolates each segment.
  Needs: core segment list + tick engine, editor segment editor UI.
- **Sampled Envelope** ⬜ — envelope shape read from a stored sample/table
  (wavetable-style). Needs: table storage + phase/rate playback, loop/one-shot
  mode, editor curve import.

### Backlog — Breakouts (D/A out, A/D in)

Scaffolding seams already pinned by ADR 0009 / 0010; not yet wrapped as runtime
modules in this app.

- **CV break-out (D/A)** ⬜ — gate/trigger, 12-bit (`CvOut12`) and 16-bit pitch
  (`CvOut16` / DAC8568) variants. CV-range options 0..5V / 0..10V / 0..12V /
  −12..12V live on the breakout class (ADR 0004), source always sends
  normalised float. SPI frame format per `doc/protocols/spi-frame.md`.
- **Gate break-out** ⬜ — N-channel digital gate/trigger (`GateOut`).
- **CV break-in (A/D)** ⬜ — external CV sampled back into the CvGraph as a Cv
  source (`outputPortKind`/`readCvPort`).
- **Controller break-in** ⬜ — knobs/pots/buttons as CV/event sources.

