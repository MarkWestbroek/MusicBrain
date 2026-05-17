# MusicBrain – Plan & Trade‑off Analysis

This document elaborates on the three subprojects described in [Requirements.md](Requirements.md) and the two SysML overviews (`Overview.pdf`, `MIDI to CV.pdf`). It works out the architectural choices, weighs pros/cons, and ends with a concrete recommendation and a phased roadmap.

The central insight from the SysML diagrams is that all three projects share the same skeleton:

```
[Musician] -> [Control surface(s)] -> [BRAIN] -> [Switch / Route / Convert] -> [Audio or CV world]
                          ^                                                          |
                          +------------------ feedback (screen, tuner) <-------------+
```

Only the *peripherals* on the right side differ: relays for audio, relays for amps/speakers, or a CV/Gate/Trigger fabric for a modular synth.

---

## 1. Cross-cutting architecture (the "common Brain")

### 1.1 Functional layers
Looking at both diagrams, the Brain always has the same internal layers:

1. **Input layer** – MIDI in (DIN + USB), keybed, foot controller, pots, encoders, buttons, touchscreen, optional ADC of CV inputs.
2. **Configuration / model layer** – the current hardware setup (which modules exist, what they are wired to) and a library of *programs / patches*.
3. **Routing / mapping layer** – takes inputs + active patch and decides which outputs to drive (a relay matrix, a CV matrix, MIDI thru, etc.).
4. **Output / driver layer** – SPI to DAC/Gate/Trigger boards, relay drivers, MIDI out, display refresh.
5. **Management layer** – patch editor, persistence, sync to PC/phone, firmware update.

Layers 1, 2, 3 and 5 are *identical in shape* across all three projects. Only layer 4 changes. That is the core argument for a shared "MusicBrain" core.

### 1.2 Controller hardware – options

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Teensy 4.x** (NXP iMXRT1062, 600 MHz Cortex‑M7, FPU, lots of GPIO, hardware MIDI/USB stack, audio library) | Fast, deterministic, excellent audio/MIDI ecosystem, easy SPI, mature C++ toolchain (PlatformIO/Arduino), single‑process → low latency | Closed‑ish ecosystem, no real OS, limited RAM/flash for big patch banks, no WiFi/BT built‑in | **Primary realtime brain** for all 3 projects |
| **RP2040 / RP2350 (Pico/Pico 2)** | Cheap, 2 cores + PIO (great for custom serial protocols), good SDK | Less raw DSP power than Teensy, no native USB‑MIDI class lib as polished as Teensy | Good for the small projects (1 & 2), or as **breakout MCU** in project 3 |
| **ESP32 / ESP32‑S3** | WiFi + BT, dual core, cheap | WiFi/BT stack can cause jitter, less ideal for hard realtime alongside radio | Good as **companion/connectivity chip**, not as the main brain |
| **STM32 (F4/F7/H7)** | Powerful, lots of peripherals, industrial‑grade | Steeper toolchain, no audio/MIDI lib like Teensy | Viable alternative to Teensy if you prefer pure STM32CubeIDE |
| **Raspberry Pi (Linux)** | Huge compute, full OS, networking, big screen | Non‑deterministic without PREEMPT_RT, USB latency, boot time, SD‑card wear | Good as **editor/manager host**, not as realtime brain |
| **PC** | Unlimited compute, easy UI | Not embedded, needs always‑on machine on stage | Only for **patch editor / setup tool** |

**Recommendation:** *Teensy 4.1* as the realtime brain for project 3, *RP2040* (or Teensy LC/4.0) for projects 1 & 2. Optionally an *ESP32* as a "side car" for WiFi/BT to phone/tablet, talking to the main MCU over UART or SPI. A *Linux box* (PC or Pi) only hosts the patch editor.

### 1.3 Programming language

| Language | Pros | Cons |
|---|---|---|
| **C++17/20 (with Arduino/Teensyduino or PlatformIO)** | Native, fast, deterministic, huge embedded ecosystem, same code can target Teensy/STM32/RP2040 via HAL abstraction | More boilerplate than Python; templates can be heavy on small MCUs |
| **C** | Smallest, most predictable | Less expressive; harder to share an abstract "Brain" layer cleanly |
| **MicroPython / CircuitPython** | Fast prototyping | Too slow & non‑deterministic for the CV matrix; GC pauses |
| **Rust (embedded)** | Memory safety, modern | Smaller ecosystem for audio/MIDI on these MCUs, steeper learning curve |
| **Python (on PC/Pi)** | Great for the editor UI | Not for realtime path |

**Recommendation:** **C++** for all firmware (one shared core library, three thin "application" layers). **Python** (or TypeScript/Electron) for the PC/phone editor.

### 1.4 Shared "MusicBrain core" library
Concretely the shared C++ library would expose roughly:

- `IInput` (MIDI msg, button, encoder delta, pot value, CV sample, touch event)
- `IOutput` (relay set, gate, trigger, CV value, MIDI msg, screen draw)
- `Patch` / `PatchBank` – serialisable (JSON or a compact binary format) routing description
- `Router` – takes an input event + active `Patch` → emits output commands
- `Storage` – flash/SD/EEPROM abstraction
- `Transport` – USB‑serial, MIDI, SPI, (optional) WiFi/BT bridge protocol
- `UI` – abstract screen + button/encoder controller (driver for 16x2 LCD, OLED, touch TFT)

Per project you only write:
- the concrete I/O drivers (relay board, CV board, …)
- the patch *schema* (what fields a patch contains)
- the UI screens

---

## 2. Subproject 1 – Effect‑box switcher

### 2.1 Key choices

**Configuration surface** (how the guitarist defines hardware + patches):

| Option | Pros | Cons |
|---|---|---|
| PC app + sync | Best editing experience, large screen, can store backups | Needs computer; extra software to maintain |
| On‑device 16×2/20×4 LCD + buttons/encoder | Self‑contained, cheap, robust | Tedious for entering names; small screen on stage is fine, for editing not |
| On‑device color touchscreen | Nice UX, on‑stage visualisation | More cost, more code, glare on stage |
| Phone/tablet over BT/WiFi | Modern, big screen, no extra hardware to carry | Adds wireless stack, pairing pain on stage, battery |

**Recommendation:**
- **Edit** mostly via a *PC/phone editor* (offline, then sync).
- **On stage** keep it simple: a *bright OLED/LCD that shows current program number + name*, plus up/down footswitch. Optional: small TFT showing the chain visualisation.
- Use **MIDI Program Change** as the on‑stage control protocol – it is the lingua franca of foot controllers and lets the user bring their own pedalboard.

**Stage‑readability:** use a transflective or high‑brightness OLED (≥ 500 cd/m²) and choose colors with high contrast (white on black, large digits). Avoid pure RGB TFT without backlight control.

**Relay driving:** latching relays (bistable) to avoid coil power & heat, driven through a shift register chain (74HC595 or TPIC6B595 for higher current) over SPI. This scales linearly with pedal count.

**MCU:** RP2040 or Teensy LC/4.0; overkill is fine.

### 2.2 Patch model (project 1)
```
Patch {
  id, name,
  loops: bit[N]   // 1 = engage pedal in loop N, 0 = bypass
  // optional: order, parallel/serial flag per loop pair, mixer levels
}
```

---

## 3. Subproject 2 – Amp/speaker switcher

Architecturally identical to project 1, only the *output stage* differs:

- **Signal level path** (instrument → preamp): low voltage, can use relays *or* high‑quality analog switches (e.g. DG412, DG419, SSM2402). Relays are cleanest.
- **Preamp → power amp**: line‑level, still relays preferred.
- **Power amp → speaker**: *must* be heavy‑duty relays (10A+, audio‑rated, gold contacts) and **break‑before‑make** with a short mute window to protect the amp. Never use solid‑state switches here for tube amps with no load.

**Extra safety requirement:** the firmware must guarantee that no power amp is ever left without a load when switched, and that two amps are never connected to the same speaker. Encode this as a constraint in the `Patch` validator.

**MCU:** same as project 1. Same core library, different `Output` driver and different patch schema:
```
Patch {
  preampIn -> preampOut routing,
  powerAmp -> speaker mapping (1:1),
  mute flag
}
```

This project mostly *validates* the core library: it should be reusable with only a new driver and patch schema. If that turns out to be the case, the core design is proven.

---

## 4. Subproject 3 – Polyphonic modular synth controller

This is where the real architectural decisions live.

### 4.1 Brain hardware
- A **single Teensy 4.1** can handle the routing math for 32+ voices easily (it has 1 MB RAM, FPU, 600 MHz). Its 8 SPI buses, USB host + USB device, native MIDI, and the PJRC audio library (useful for the tuner input) make it the sweet spot.
- If you ever outgrow it: STM32H7 (480 MHz, more RAM) or an RP2350 with PIO for custom buses.
- A Raspberry Pi is **not** recommended as the realtime brain (Linux jitter), but is excellent as the *editor / patch librarian / display* connected over USB.

### 4.2 Brain ↔ breakout transport
This is the most critical choice. Required characteristics:

- ≥ 8 channels × 32 voices × CV updates at, say, 1 kHz = 256 kB/s of CV samples downstream, plus gates/triggers, plus a similar amount upstream for ADC of physical CV ins and audio for tuning.
- Low and predictable latency (< 1 ms per hop).
- Cable lengths up to a few meters inside a Eurorack case.

| Transport | Throughput | Latency | Cabling | Verdict |
|---|---|---|---|---|
| **MIDI DIN** (31.25 kbit) | ~3 kB/s | High, serialised | DIN | Too slow for full CV matrix |
| **MIDI over USB** | ~1 MB/s | Low if host is good | USB | Fine for control, not as bus for many breakouts |
| **SPI** (10–50 MHz) | Very high | Microseconds | Short ribbon/flat cable, ground bounce on long runs | **Best inside one case** |
| **CAN (1 Mbit, CAN‑FD 5–8 Mbit)** | Moderate | Deterministic, prioritised | Robust differential pair, long cable | Good for *control* level data; tight for full CV streaming at 32 voices but CAN‑FD can carry it |
| **RS‑485** | 10 Mbit | Low | Long, robust differential pair | Solid alternative to SPI for multi‑case setups |
| **Ethernet / UTP** (10/100/1000) | Huge | µs–ms | Standard, long | Heavy stack on MCU, overkill but future‑proof |
| **I²C** | 0.1–1 Mbit | High | Short | Not suitable for this volume |

**Recommendation:** use **SPI as the primary in‑case bus** (matches the SysML diagram) with the Teensy as master and breakout boards as slaves. Each breakout has its own chip‑select. Define a small proprietary frame on top of SPI (opcode + addr + payload + CRC). For *future expansion across multiple cases or boxes* add an **RS‑485** or **CAN‑FD** link as a second tier – the SPI master can bridge to it. Don't try to use a single bus type for both jobs; use the right one per distance/criticality.

### 4.3 CV matrix
Three options from Requirements.md, weighed:

| Option | Flexibility | Cost | Signal purity | Latency | Verdict |
|---|---|---|---|---|---|
| 1. Plain cables | None (no save/recall) | Lowest | Best (no extra hops) | None | Keep as *fallback* / for performance‑only patches |
| 2. All‑analog crossbar (DG/MT8816/relay tree) | Medium; chip count explodes with N×M | High | Very good but adds a switch chip in the path | Microseconds | Reasonable for small fixed matrices |
| 3. Digitise everything, brain does the matrix | Total | Moderate (lots of ADC/DAC channels) | Adds one A/D + D/A hop (quality of converters matters) | Sub‑millisecond if SPI bus is tight | **Recommended** for the ambitious goal |

**Recommendation:** go with option **3** for the digital CV matrix, but with two pragmatic notes:
- Use 12‑bit DACs (e.g. MCP4822/MCP4922/MAX5134) initially; move to 16‑bit (AD5754, DAC8568) only where pitch CV requires it (1V/oct needs ≥ 14 bit for cents resolution).
- Per output channel use a **sample‑and‑hold + multiplexer** scheme like the SMP08 / CD4051 shown in `MIDI to CV.pdf` so one DAC can feed 8 outputs. This matches the SysML diagram.

### 4.4 Audio matrix
- Most usefully kept **analog**.
- For small numbers of routings: cables, possibly assisted by a few relays.
- For "scene recall" of audio routing: a small analog crossbar (MT8816 or quality reed relays). Always after careful listening tests – analog switches *can* color the sound.
- Do **not** digitise the audio path just to route it; that defeats the whole modular philosophy.

### 4.5 Tuning / calibration
- Use Teensy's ADC + the PJRC AudioAnalyzeNoteFrequency object (autocorrelation) for the tuner input.
- Calibration table per oscillator stored in flash; the Router applies it before sending pitch CV.

### 4.6 Patch model (project 3)
```
Patch {
  id, name,
  voiceAssignment,        // how MIDI notes map to oscillator banks
  cvMatrix: list<Edge>,   // (sourceModuleId, sourcePort) -> (destModuleId, destPort) [+ amount/offset]
  envelopes[], lfos[],    // parameter sets for brain-generated modulators
  modWheelMap, velocityMap, aftertouchMap, ...
  audioMatrixHint         // optional: pictorial routing for the analog side
}
```

---

## 5. PC / phone / tablet integration

| Channel | Use |
|---|---|
| **USB serial / USB‑MIDI / USB‑MSC** | Primary sync channel to a PC editor. Works for all three projects. SysEx for bulk patch dump. Or expose a USB mass‑storage device and store patches as JSON files. |
| **WiFi (ESP32 side car)** | Web UI hosted by the device; reachable from any phone/tablet without an app. Good for project 3 patch librarian. Less ideal on stage. |
| **BLE‑MIDI** | Standard, recognised by iOS/macOS/modern Android & Win11. Ideal for casual editing from a phone. |
| **Phone app** | Most polish, but you maintain 2 platforms; only do this once the core is mature. |

**Recommendation:** ship with **USB (serial + MIDI/SysEx)** from day one; add **BLE‑MIDI** for phone editing when convenient; reserve a **WiFi web UI** for project 3.

---

## 6. Software architecture (concrete)

Proposed repository layout:

```
firmware/
  core/                  # shared C++ library (no hardware deps)
    Patch.h, PatchBank.h
    Router.h
    Transport/           # MIDI, SPI frame, USB bridge
    UI/                  # abstract Screen, Menu, Encoder, Button
    Storage/             # KV + bank serialisation
  hal/                   # thin per-MCU HAL (Teensy, RP2040, STM32)
  app-effect-switcher/   # project 1 main + drivers
  app-amp-switcher/      # project 2 main + drivers
  app-modular-brain/     # project 3 main + drivers
  breakouts/             # firmware for SPI slave boards (CV out, gate, trigger, CV in)
editor/
  desktop/               # Python (PySide6) or TypeScript/Electron editor
tools/
  patch-converter/, sysex-dump/, simulator/
docs/
  Requirements.md, Plan.md, protocols/, schemas/
```

Key principles:
- **Hardware abstraction**: `core/` never includes vendor headers; the apps inject HAL objects.
- **Patches are data**, not code. JSON for the editor, compact CBOR/MessagePack for transport and storage.
- **One protocol document** (`docs/protocols/spi-frame.md`) shared by brain firmware + breakout firmware + editor; treat it as a versioned contract.
- **Simulator**: a host‑side build of `core/` so the Router and patches can be tested without hardware (huge productivity win, especially for project 3).

---

## 7. Phased roadmap

A staged plan that always produces something usable:

1. **Bootstrap the core** – set up the C++ library, host simulator, a dummy `Patch` and `Router`, CI build. *Outcome:* `core/` compiles and unit‑tests pass on PC.
2. **Project 1 MVP** – Teensy/RP2040 + 8 relays + 2 footswitches + 16×2 display. Patches edited over USB serial with a tiny Python CLI. *Outcome:* a working pedalboard switcher.
3. **Editor v1** – minimal desktop app (Python + Qt) that lists/edits/uploads patches for project 1.
4. **Project 2 MVP** – same firmware base, new relay driver, new patch schema, safety validator. Confirms the core is truly reusable.
5. **Project 3 – control plane** – Teensy + MIDI keybed + 1 SPI breakout (8 CV out via DAC + S&H + CD4051 mux). Play a single voice via MIDI. *Outcome:* end‑to‑end signal path proven.
6. **Project 3 – scale out** – add nGate, nTrigger, nCV‑in, nEnvelope boards. Extend SPI frame, add a bus arbiter.
7. **Project 3 – CV matrix & polyphony** – implement voice allocator, matrix router, calibration. Editor grows a matrix view.
8. **Optional connectivity** – ESP32 side car for BLE‑MIDI / WiFi web UI.
9. **Audio matrix** – decide cabled vs. relay/analog crossbar based on real usage.

Each stage is shippable; you can stop at any stage and still have working hardware.

---

## 8. Open questions for the user

These are the choices that depend on personal preference and should be confirmed before code is written:

1. **MCU family preference** – Teensy (recommended) vs. STM32 vs. RP2040 vs. ESP32. Any prior experience that should weigh in?
2. **Editor host** – Python+Qt (faster to write, leverages your taste for Python) vs. TypeScript/Electron (nicer UI) vs. Web (served by an ESP32)?
3. **Project 1 on‑device UI** – minimal LCD or full touchscreen?
4. **Project 3 DAC resolution** – 12 bit everywhere (cheap) or 16 bit for pitch CV (accurate intonation)?
5. **Patch storage format** – JSON (debuggable) or compact binary (faster)? Recommendation: JSON in editor, binary on device, with a converter.
6. **Multi‑case future** – will project 3 ever span more than one chassis? If yes, plan CAN‑FD/RS‑485 from the start.
7. **Open source / closed?** – influences license choices for libraries used (e.g. PJRC libs).
8. **Stage requirements** – worst‑case latency you will accept (≤ 5 ms? ≤ 1 ms?). This locks the transport choice.

Once these are answered the next step is a short *architecture decision record* per item and then setting up the `firmware/core` skeleton (step 1 of the roadmap).
