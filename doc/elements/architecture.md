# Elements Spike Architecture

A port of the Mutable Instruments **Elements** (MIT, © Emilie Gillet) modal /
physical-modelling synth voice to the **Teensy 4.1** (Cortex-M7 @ 600 MHz + FPU),
wrapped as a MusicBrain `tp_mmb_elements` AudioModule.

---

## Layer Diagram

```mermaid
graph TD
    subgraph Host["🖥 Host (PC / DAW)"]
        MIDI_IN["USB-MIDI (noteOn/off, CC)"]
        AUDIO_OUT["USB-Audio In (monitor)"]
        SERIAL["Serial Monitor (COM5)"]
    end

    subgraph Teensy["⚙ Teensy 4.1 (Cortex-M7 @ 600 MHz)"]
        subgraph App["src/main.cpp"]
            SETUP["setup(): AudioMemory, ElementsModule.begin(), MIDI handlers"]
            LOOP["loop(): usbMIDI.read(), AudioProcessorUsageMax()"]
            MIDI_HANDLERS["noteOn → elementsVoice.noteOn()<br/>noteOff → elementsVoice.noteOff()<br/>CC#1,16-21 → elementsModule.setControl()"]
        end

        subgraph Wrapper["src/ElementsModule.h"]
            EVOICE["ElementsVoice : AudioStream<br/>32→44.1 kHz resampler"]
            EMOD["ElementsModule : AudioModule<br/>control map, port map, factory"]
        end

        subgraph DSP["lib/mi-elements (vendored MI DSP, byte-exact)"]
            PART["elements::Part — top-level voice grouper"]
            VOICE["elements::Voice — exciter + resonator pipeline"]
            EXCITER["Exciter (bow/blow/strike)"]
            RESONATOR["Resonator (64-mode filter bank)"]
            REVERB["Reverb (FxEngine 16-bit, 32k delay)"]
            RESOURCES["Lookup tables (~380 kB, FLASHMEM)"]
            STMLIB["stmlib (dsp, filter, random — float only)"]
        end

        subgraph TeensyCore["Teensy Core"]
            AUDIOLIB["AudioStream → AudioOutputUSB<br/>44.1 kHz, 128-sample blocks"]
            USBMIDI["usb_midi (USB-MIDI class)"]
        end
    end

    MIDI_IN --> USBMIDI
    USBMIDI --> MIDI_HANDLERS
    MIDI_HANDLERS --> EVOICE
    MIDI_HANDLERS --> EMOD
    EMOD --> EVOICE
    EVOICE --> PART
    PART --> VOICE
    VOICE --> EXCITER
    VOICE --> RESONATOR
    VOICE --> REVERB
    RESOURCES -.-> PART
    RESOURCES -.-> VOICE
    STMLIB -.-> EXCITER
    STMLIB -.-> RESONATOR
    STMLIB -.-> REVERB
    EVOICE --> AUDIOLIB
    AUDIOLIB --> AUDIO_OUT
    SETUP --> EVOICE
    LOOP --> SERIAL
```

---

## Original Elements DSP (vendored)

All files live under `lib/mi-elements/`. Only the subset reachable from
`elements::Part` was copied; the STM32 HAL/CMSIS `third_party/` tree was
excluded. See `VENDORED.md` for provenance and licensing.

### DSP Class Diagram

```mermaid
classDiagram
    class Part {
        -Patch patch_
        -Voice voice_[1]
        -OminousVoice ominous_voice_[1]
        -Reverb reverb_
        -float note_[1]
        -bool previous_gate_
        +Init(uint16_t* reverb_buffer)
        +Process(PerformanceState, blow_in, strike_in, main, aux, n)
        +mutable_patch() Patch*
        +Panic()
        +Seed(uint32_t*, size)
    }

    class PerformanceState {
        +bool gate
        +float note
        +float modulation
        +float strength
    }

    class Patch {
        +float exciter_envelope_shape
        +float exciter_bow_level
        +float exciter_bow_timbre
        +float exciter_blow_level
        +float exciter_blow_meta
        +float exciter_blow_timbre
        +float exciter_strike_level
        +float exciter_strike_meta
        +float exciter_strike_timbre
        +float exciter_signature
        +float resonator_geometry
        +float resonator_brightness
        +float resonator_damping
        +float resonator_position
        +float resonator_modulation_frequency
        +float resonator_modulation_offset
        +float reverb_diffusion
        +float reverb_lp
        +float space
    }

    class Voice {
        -Exciter bow_
        -Exciter blow_
        -Exciter strike_
        -Resonator resonator_
        -String string_[5]
        -MultistageEnvelope envelope_
        -Diffuser diffuser_
        -Tube tube_
        +Init()
        +Process(Patch, frequency, strength, gate, blow_in, strike_in, raw, center, sides, n)
    }

    class Exciter {
        -ExciterModel model_
        -float parameter_
        -float signature_
        +Init()
        +set_model(ExciterModel)
        +set_parameter(float)
        +Process(gate_flags, out, n)
    }

    class Resonator {
        -float frequency_
        -float geometry_
        -float brightness_
        -float damping_
        -float position_
        +Init()
        +Process(bow_strength, in, center, sides, n)
        +set_frequency(float)
        +set_geometry(float)
        +set_brightness(float)
        +set_damping(float)
        +set_position(float)
    }

    class Reverb {
        -FxEngine~32768, FORMAT_16_BIT~ engine_
        -float amount_
        -float diffusion_
        +Init(uint16_t* buffer)
        +Process(left, right, n)
        +set_amount(float)
        +set_diffusion(float)
    }

    class OminousVoice {
        +Init()
        +Process(...)
    }

    Part "1" *-- "1" Patch
    Part "1" *-- "kNumVoices" Voice
    Part "1" *-- "kNumVoices" OminousVoice
    Part "1" *-- "1" Reverb
    Part --> PerformanceState : consumes
    Voice "1" *-- "3" Exciter
    Voice "1" *-- "1" Resonator
    Voice "1" *-- "5" String
    Voice "1" *-- "1" MultistageEnvelope
```

### Native Sample Rate & Block Size

The upstream DSP renders **32 kHz** in blocks of **16 samples** (`kMaxBlockSize`).
All timing, envelope rates, LFO frequencies, and filter coefficients are expressed
in terms of `elements::kSampleRate = 32000.0f`.

```mermaid
sequenceDiagram
    participant Caller as Caller
    participant Part
    participant Voice
    participant Exciter
    participant Resonator
    participant Reverb

    Note over Caller, Reverb: 32 kHz, 16-sample blocks

    Caller->>Part: Process PerformanceState, blow, strike, main, aux, 16
    Part->>Part: gate rising-edge detection, cycle active voice
    loop
        Part->>Voice: Process Patch, freq, strength, gate, blow, strike, raw, center, sides, 16
        Voice->>Exciter: Process gate_flags, bow/flow_buffer, 16
        Voice->>Exciter: Process gate_flags, blow_buffer, 16
        Voice->>Exciter: Process gate_flags, strike_buffer, 16
        Voice->>Resonator: Process bow_strength, combined_excitation, center, sides, 16
        Voice->>Voice: mixdown center +/- side x spread
    end
    Part->>Part: SoftLimit pre-clipping
    Part->>Part: metering exciter_level, resonator_level, panic detection
    Part->>Reverb: Process main, aux, 16
```

---

## Wrapper Layer (Teensy Audio Adapter)

Our integration layer lives in `src/ElementsModule.h`.

```mermaid
classDiagram
    class AudioStream {
        <<Teensy Core>>
        +update()* : called every 128-sample audio block
        +receiveReadOnly(ch) audio_block_t*
        +allocate() audio_block_t*
        +transmit(block, ch)
        +release(block)
    }

    class ElementsVoice {
        -elements::Part part_
        -PerformanceState ps_
        -float srcBuf_[16]
        -float phase_, s0_, s1_
        -int srcAvail_, srcRead_
        +begin(uint16_t* reverbBuffer)
        +noteOn(hz, strength)
        +noteOff()
        +setGate(bool)
        +setNote(midiNote)
        +setStrength(float)
        +part() Part&
        +update()
        -nextSourceSample() float
        -generateBlock()
    }

    class AudioModule {
        <<mmb_link>>
        -std::string_view typeId_
        -std::string_view id_
        +outputPort(portId) AudioPort
        +inputPort(portId) AudioPort
        +writeCvPort(portId, value)
        +setControl(controlId, value)
    }

    class ElementsModule {
        -ElementsVoice voice_
        -float voct_, strength_
        -bool lastGateHigh_
        +voice() ElementsVoice&
        +begin(uint16_t*)
        +outputPort, inputPort, writeCvPort
        +setControl(controlId, value)
        +registerFactory()$ static
    }

    AudioStream <|-- ElementsVoice
    AudioModule <|-- ElementsModule
    ElementsModule *-- ElementsVoice
    ElementsVoice *-- "elements::"Part : wraps
```

### Resampler: 32 kHz → 44.1 kHz

`ElementsVoice::update()` performs **linear interpolation** between consecutive
32 kHz source samples to produce 44.1 kHz output. The resampler is fully
contained in the `update()` loop:

```mermaid
flowchart LR
    subgraph AudioISR["Audio ISR -- every 2.9 ms"]
        direction TB
        A["allocate output block, 128 samples"] --> B
        B["for i = 0..127"] --> C
        C["y = s0 + s1-s0 x phase, phase += 0.7256"] --> D
        D{"phase >= 1.0 ?"} -->|yes| E["phase-=1, s0=s1, s1=nextSourceSample"]
        D -->|no| F["clamp + int16_t convert"]
        E --> F
        F --> G["transmit out, 0"]
    end

    subgraph SourceGen["Source Generation, on demand"]
        direction TB
        H["generateBlock"] --> I["part_.Process(ps, silence, silence, main, aux, 16)"]
        I --> J["copy main 0..15 to srcBuf_ 0..15"]
    end

    E --> H
    J -.->|fills srcBuf_| E
```

The source block (16 samples @ 32 kHz) lasts **0.5 ms**. At 44.1 kHz output, the
resampler calls `generateBlock()` roughly every **23 output samples**
($128 \times 0.7256 \approx 93$ source samples consumed per `update()`, or
$\lfloor 93/16 \rfloor = 5$–$6$ Part calls per block).

---

## Memory Map

```mermaid
pie title Memory Allocation (Teensy 4.1)
    "RAM1 (DTCM, 512 kB): vars 135 kB" : 135
    "RAM1: stack + code 131 kB" : 131
    "RAM1: free 246 kB" : 246
    "RAM2 (OCRAM, 512 kB): reverb buffer 64 kB" : 64
    "RAM2: audio blocks + other 35 kB" : 35
    "RAM2: free 413 kB" : 413
    "FLASH (7.75 MB): lookup tables 380 kB" : 0
    "FLASH: code + other 105 kB" : 0
    "FLASH: free 7.27 MB" : 0
```

| Region | Used | Free | Notes |
|--------|------|------|-------|
| **RAM1 (DTCM)** | ~267 kB | ~245 kB | Fast core-coupled RAM. Audio processing, stack. |
| **RAM2 (OCRAM)** | ~99 kB | ~425 kB | Slower. Reverb buffer (`DMAMEM uint16_t[32768]`), audio block pool. |
| **FLASH** | ~485 kB | ~7.6 MB | Code + `FLASHMEM` lookup tables (~380 kB). |

**The reverb delay line (64 kB) is too large for DTCM.** It lives in OCRAM,
initialised via `Part::Init(reverbBuffer)` in `setup()`. The ~380 kB lookup
tables (`resources.cc`) are tagged `FLASHMEM` so they stay in flash instead of
being copied to DTCM.

---

## Control Flow (MIDI → DSP)

```mermaid
sequenceDiagram
    participant KSP as Keystep Pro / DAW
    participant USB as USB-MIDI Host
    participant Loop as loop
    participant EM as ElementsModule
    participant EV as ElementsVoice
    participant Part as Part
    participant Voice as Voice
    participant Resonator as Resonator
    participant Exciter as Exciter

    Note over KSP, Voice: Note + gate
    KSP->>USB: NoteOn
    Loop->>EM: handleNoteOn
    EM->>EV: noteOn
    EV->>EV: set note, strength, gate
    Note over EV: next genBlock triggers Part.Process

    Note over KSP, Voice: Parameter change
    KSP->>USB: ControlChange
    Loop->>EM: handleControlChange
    EM->>Part: update patch values

    Note over Part, Voice: real-time vs next-note
    Part->>Resonator: set_brightness immediately
    Part->>Exciter: store geometry/position for next strike

```

### Parameter Categories

| Parameter | CC | Takes effect | Notes |
|-----------|----|-------------|-------|
| **envelope** | 1 | real-time | Exciter envelope shape (mod wheel) |
| **exciter** | 16 | next note | 0=bow, 1=blow, 2=strike |
| **geometry** | 17 | next note | Resonator shape → mode frequency ratios |
| **brightness** | 18 | real-time | Modal filter cutoff |
| **damping** | 19 | real-time | Mode decay time |
| **position** | 20 | next note | Excitation position on resonator |
| **space** | 21 | real-time | Reverb amount + stereo spread |

---

## Boot & Runtime Sequence

```mermaid
sequenceDiagram
    participant Setup as setup
    participant AM as AudioMemory 60
    participant EV as ElementsVoice
    participant Part as elements::Part
    participant Loop as loop

    Setup->>AM: allocate 60 x 128-sample blocks
    Setup->>EV: begin elementsReverbBuffer
    EV->>Part: Init reverbBuffer
    Note over Part: patch defaults, voice init, reverb init

    Setup->>Setup: usbMIDI.setHandleNoteOn/Off/CC
    Setup->>Setup: ElementsModule.registerFactory
    Note over Setup: Audio engine starts - ISR fires

    loop
        Note over EV: AudioStream.update called by ISR
        EV->>Part: genBlock - Part.Process ps, silence, silence, main, aux
        Part->>Part: gate rising-edge, cycle active voice
        Part->>Part: Voice.Process patch, freq, strength, gate
    end

    loop
        Loop->>Loop: while usbMIDI.read - drain MIDI events
    end

    loop
        Loop->>Loop: AudioProcessorUsageMax + AudioMemoryUsageMax
    end
```

---

## Files

| Path | Role |
|------|------|
| `src/main.cpp` | Entry point, MIDI handlers, CPU/audio monitoring |
| `src/ElementsModule.h` | `ElementsVoice` (Teensy AudioStream + resampler), `ElementsModule` (AudioModule + control map) |
| `src/FwVersion.h` | Firmware version (`0.1.0`) |
| `src/AudioModule.h` | Local copy of `mmb_link::AudioModule` mixin (delete when merged) |
| `lib/mi-elements/elements/dsp/part.{h,cc}` | Upstream: `elements::Part` — top-level voice grouper |
| `lib/mi-elements/elements/dsp/voice.{h,cc}` | Upstream: `elements::Voice` — exciter + resonator pipeline |
| `lib/mi-elements/elements/dsp/exciter.{h,cc}` | Upstream: bow / blow / strike physical models |
| `lib/mi-elements/elements/dsp/resonator.{h,cc}` | Upstream: modal filter bank (64 modes) |
| `lib/mi-elements/elements/dsp/string.{h,cc}` | Upstream: Karplus-Strong string model |
| `lib/mi-elements/elements/dsp/tube.{h,cc}` | Upstream: tube / wind model |
| `lib/mi-elements/elements/dsp/multistage_envelope.{h,cc}` | Upstream: DAHDSR envelope |
| `lib/mi-elements/elements/dsp/ominous_voice.{h,cc}` | Upstream: Easter egg voice |
| `lib/mi-elements/elements/dsp/fx/reverb.h` | Upstream: header-only reverb (Griesinger/Dattorro) |
| `lib/mi-elements/elements/dsp/fx/diffuser.h` | Upstream: all-pass diffuser |
| `lib/mi-elements/elements/dsp/fx/fx_engine.h` | Upstream: delay-line engine |
| `lib/mi-elements/elements/resources.{h,cc}` | Upstream: 380 kB lookup tables (FLASHMEM adapted) |
| `lib/mi-elements/stmlib/` | Upstream `stmlib` subset (dsp, filter, random — no STM HAL/CMSIS) |
| `lib/mi-elements/elements/drivers/debug_pin.h` | Stub: no-op TIC/TOC (replaces STM GPIO driver) |
| `lib/mi-elements/VENDORED.md` | Provenance, license, Teensy adaptations |
| `lib/mi-elements/library.json` | PlatformIO library manifest |
| `platformio.ini` | Build config (teensy41 target, `-I lib/mi-elements`) |
| `README.md` | Spike overview + flash instructions |

---

## Build

```powershell
.\.venv\Scripts\pio.exe run -d firmware\app-elements         # build
.\.venv\Scripts\pio.exe run -d firmware\app-elements -t upload  # flash
.\.venv\Scripts\pio.exe device monitor -p COM5 -b 115200     # serial log
```

### CPU Budget

One Elements voice consumes **~22%** of the 600 MHz Cortex-M7 budget at peak.
This suggests ~4 monophonic voices fit, or ~2 stereo.

---

## Future Integration (app-modular-brain)

When `tp_mmb_elements` is merged into `app-modular-brain`:

1. Delete the local `AudioModule.h` copy; use the shared `mmb_link::AudioModule`.
2. `ElementsVoice` audio inputs (`blow_in`, `strike_in`) need 44.1→32 kHz
   down-sampling (currently silence is fed).
3. The port map (`voct`, `gate`, `strength`, `blow_in`, `strike_in`, `out`)
   integrates with AudioGraph and CvGraph.
4. `setControl` integrates with the editor's module panel.
5. `ElementsModule::registerFactory()` is called from `registerAllRuntimeModules()`.
