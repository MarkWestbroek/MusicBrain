# MusicBrain — Updated Plan (v2)

> Successor to [Plan.md](Plan.md). The original plan was written *before* you answered the eight open questions; this version bakes the decisions in (see [doc/adr/](adr/)) and translates them into a concrete, step-by-step engineering plan.

---

## 0. Status snapshot (May 17, 2026)

### What is decided (locked in by ADRs)

| Topic | Decision | ADR |
|---|---|---|
| MCU — brain | Teensy 4.1 (project 3); Teensy 4.0 or RP2040 (projects 1 & 2) | [0001](adr/0001-mcu-choice.md) |
| MCU — breakouts | RP2040 or STM32F1 | [0001](adr/0001-mcu-choice.md) |
| Wireless side car | ESP32-S3 (only when WiFi/BLE is needed) | [0001](adr/0001-mcu-choice.md) |
| Firmware language | C++17 throughout | [0001](adr/0001-mcu-choice.md) |
| Editor stack | TypeScript + React + Vite, hosted externally | [0002](adr/0002-editor-stack.md) |
| Editor ↔ device API | JSON-RPC 2.0 over USB-CDC (NDJSON) or WebSocket | [0002](adr/0002-editor-stack.md) |
| Project 1 UI | Minimal LCD on-stage + remote editor | [0003](adr/0003-project1-ui.md) |
| Pitch DAC | 16-bit (DAC8568) | [0004](adr/0004-dac-resolution.md), [tech/dac-comparison.md](tech/dac-comparison.md) |
| Other CVs | 12-bit (MCP4922) + S&H + CD4051 | [0004](adr/0004-dac-resolution.md), [tech/dac-sh-mux.md](tech/dac-sh-mux.md) |
| Patch format | JSON in git/editor; CBOR on device | [0005](adr/0005-patch-format.md) |
| Inter-case transport | CAN-FD primary, RS-485 fallback | [0006](adr/0006-multi-case-transport.md) |
| In-case transport | SPI with custom 62-byte frame | [protocols/spi-frame.md](protocols/spi-frame.md) |
| License | MIT | [0007](adr/0007-license.md) |
| Latency budget (project 3) | ≤ 5 ms note-on → CV settle | [0008](adr/0008-latency-and-interpolation.md) |
| Interpolation | 20–50 kHz per-breakout interpolator | [0008](adr/0008-latency-and-interpolation.md) |

### What is built (scaffolding only)

```
✅ doc/                      Plan, Requirements, Answers, 8 ADRs, protocols, 20+ tech briefs
✅ firmware/core/            C++17 lib — Patch, PatchBank, Router (NullRouter), Types
✅ firmware/core/Protocol/   SpiFrame encode/decode, CRC-16/CCITT
✅ firmware/core/tests/      4 unit-test files + tiny harness, hooked into CTest
✅ firmware/hal/host/        HostStore (unordered_map), HostLoopback transport
🟡 firmware/hal/{teensy4,rp2040,stm32f1}/   README placeholders only
🟡 firmware/app-*/                          README placeholders only
🟡 firmware/breakouts/                      README placeholders only
✅ tools/simulator/main.cpp  Canned-event simulator, prints router output
🟡 tools/patch-converter/    README placeholder only
✅ editor/                   Vite + React 18 + strict TS scaffold, 2 demo patches
✅ Root: README, LICENSE, .gitignore, CMakeLists chain
```

`✅` = file/code exists and is consistent. `🟡` = directory + README only.

### What is *not* yet built (the work ahead)

- HAL implementations for any real MCU.
- Application `main()` for any of the three projects.
- Breakout firmware.
- Editor connection layer (transport + JSON-RPC client).
- Patch JSON ↔ CBOR converter tool.
- Hardware schematics / KiCad project.
- **A simulation that closes the loop** all the way from MIDI in → router → SPI bytes → virtual DAC → CV-vs-time plot. (Section 6 below.)

---

## 1. Updated roadmap (replaces Plan.md §7)

Eleven stages. Each stage produces something demonstrable; you can stop after any stage and have a working subset.

### Phase A — Core proven on host (no hardware needed)

**Stage 1 — Verify host build & tests** ✅ *Done (May 2026)*
- Toolchain: CMake 4.3.2, clang++ 22.1.5 (LLVM), Ninja 1.12.1, MSVC 14.44 Build Tools (for Windows SDK libs).
- `cd firmware && cmake -S . -B build -G Ninja -DCMAKE_CXX_COMPILER=clang++ && cmake --build build && ctest --test-dir build` — all green.
- 20 tests pass locally on Windows.

**Stage 2 — Expand core: Patch JSON+CBOR I/O** ✅ *Done (May 2026)*
- Hand-rolled zero-dependency `mb::PatchCodec` (JSON + CBOR subset of RFC 8949).
  Decision: stayed dependency-free in `firmware/core/` to keep the device build trivial;
  nlohmann/json can still be added for `tools/patch-converter` later if/when blob
  schemas grow complex.
- Schema documented in [doc/protocols/schemas/patch.md](protocols/schemas/patch.md).
- 11 round-trip tests in `test_patchcodec.cpp` (JSON ↔ struct, CBOR ↔ struct, cross-format, empty/max-size, malformed inputs, unknown-field forward compatibility).
- **Still to do**: `tools/patch-converter` CLI (`pack json→cbor`, `unpack cbor→json`) — small wrapper, can be added when first needed.
- **Deliverable**: patches survive editor ↔ device serialisation losslessly, with a documented wire format.

**Stage 3 — Voice allocator + matrix router (project 3 logic, host-only)** ✅ *Done (May 2026)*
- `mb::MatrixRouter` replaces `NullRouter` for project 3:
  - Parses a `patch.synth.v1` blob (see [protocols/schemas/patch.synth.v1.md](protocols/schemas/patch.synth.v1.md)).
  - `mb::VoiceAllocator` — 1..16 voices, smallest-age-first allocation (true round-robin spread; never-used voices come first), oldest-held steal, last-note priority on `noteOff`.
  - 1V/oct mapping: `(midi-60)/60` clipped to ±1, scaled to int16 (±32767 = ±5V around middle C).
  - Emits `CvSet` + `GateOn` on NoteOn (plus a `GateOff` on the stolen voice if applicable), `GateOff` on NoteOff, `DisplayDirty` on Program Change.
- 16 new tests in `test_matrixrouter.cpp` (SynthPatch round-trip, allocator behaviour, MIDI→CV anchor points, router flows).
- **Deliverable**: given a MIDI score, the router produces the exact stream of SPI frames a real device would receive. ✅

### Phase B — Closed-loop simulator (still no hardware)

**Stage 4 — Virtual breakout chips** ✅ *Done (May 2026)*
- New `firmware/sim/` library:
  - `mb::sim::Clock` — deterministic 64-bit µs counter.
  - `mb::sim::Trace` — NDJSON event log writer (one JSON object per line).
  - `mb::sim::VirtualSpiBus` — accepts encoded `mb::proto` frames and fans them out to attached listeners; logs an `spi` trace event per frame.
  - `mb::sim::Dac8568` — listens for `CvSet` on its even slots, models 16-bit `code → volts` with 5 V full-scale (TI internal reference doubled), writes `cv` trace events.
  - `mb::sim::GateBoard` — listens for `GateSet` on the odd slots between DAC channels, writes `gate` trace events.
  - `mb::sim::RouterBridge` — turns `RouterResult` commands into `VirtualSpiBus` calls.
- `tools/simulator/main.cpp` now wires `MatrixRouter` → `RouterBridge` → bus → DAC + gates → NDJSON on stdout. Built-in demo plays a 1-second C-major triad.
- End-to-end tests in `firmware/sim/tests/test_endtoend.cpp` (4 tests): NoteOn(60) → 0 V on ch 0x0000 + gate high on ch 0x0001; NoteOn(72) → +1.0 V (one octave up on the /60 scale); NoteOff clears gate; trace stream contains `spi`/`cv`/`gate` lines with correct timestamps and channel hex.
- **Deliverable**: `mb_simulator.exe` outputs a CV-vs-time NDJSON trace viewable in any scope tool. (Design in [Simulation.md](Simulation.md).) ✅

**Stage 5 — Waveform viewer in the editor** ✅ *Done (May 2026)*
- `tools/scope-bridge/` — tiny Node + `ws@8` server (`server.mjs`). Spawns `mb_simulator.exe --loop`, pipes NDJSON stdout lines to every connected WebSocket client on port 8765. CLI flags: `--port`, `--exe <path>`, `--replay <file.ndjson>` (re-plays a captured trace instead of spawning the sim), `--loop`.
- `editor/src/scope/TraceBuffer.ts` — typed parser for `cv` / `gate` / `spi` events, rolling buffer per channel (default 2000 points), `bounds()` for autoscaling.
- `editor/src/scope/ScopePanel.tsx` — canvas-based step-line scope with auto-reconnecting WebSocket, per-channel colour palette, point-count legend.
- `editor/src/App.tsx` — top-tab navigation `Patches` / `Scope`.
- `tools/simulator/main.cpp` — added `--loop` flag and `std::cout.setf(std::ios::unitbuf)` so the bridge sees lines immediately. The previous demo body is factored into `playDemo()` and re-run every 2 s of virtual time.
- **Deliverable**: `npm run start` in `tools/scope-bridge`, `npm run dev` in `editor`, switch to the *Scope* tab → live CV-vs-time trace from the simulator. ✅

### Phase C — First real hardware (project 1, lowest-risk)

**Stage 6 — Effect-switcher MVP** ([adr/0003](adr/0003-project1-ui.md)) — *core ✅ done (May 2026), MCU port pending*
- New HAL interfaces (header-only, in `firmware/core/include/mb/`): `IRelayBoard`, `IDisplay`. (`IFootswitch` skipped for now — footswitch events arrive via the existing `InputKind::Footswitch` event so the router stays pure.)
- `patch.switcher.v1` blob — see [protocols/schemas/patch.switcher.v1.md](protocols/schemas/patch.switcher.v1.md). 8 bytes: version, relayCount, relayMask (LE u16), flags, pad, CRC-16/CCITT. `mb::switcher::writeBlob` / `readBlob` round-trip; validation rejects bad CRC, bad version, mask bits above `relayCount`, zero count.
- `mb::SwitcherRouter` (`firmware/core/src/SwitcherRouter.cpp`) — extends the pure `Router`:
  - `MidiProgramChange(data=prog)` → select patch, parse blob, emit one `RelaySet` per relay + `DisplayDirty`.
  - `Footswitch(payload=0, data=1)` = up (PC+1, wraps); `Footswitch(payload=1, data=1)` = down (PC-1, wraps). Footswitch release is ignored. Router also re-emits a synthetic `MidiOut` Program-Change for any downstream consumer.
  - Unknown PC and missing/bad patch are no-ops (no commands).
- `PatchBank` grew two helpers: `at(idx)` and `indexOf(id)` so the router can wrap PC up/down.
- `kMaxOutputsPerEvent` bumped from 16 → 24 so 16 relays + DisplayDirty + MidiOut all fit.
- Host HAL mocks (header-only, `firmware/hal/host/include/mb/host/`): `HostRelayBoard` (records mask + per-call counts) and `HostDisplay` (records last shown id + name). RP2040 will provide the real implementations behind the same interfaces.
- `firmware/app-switcher/` — host harness `mb_switcher.exe`. Built-in demo loads 8 patches and walks through PC + footswitch events, printing the relay state as an ASCII bar (`####............  (mask=0x000F)`) and the OLED text. `--interactive` mode accepts `u`/`d`/`0..7`/`q` from stdin.
- Tests: `firmware/core/tests/test_switcherrouter.cpp` — 10 new tests covering blob round-trip, all 4 rejection paths, PC selecting a patch + emitting the expected mask, unknown-PC no-op, footswitch wrap up & down, footswitch release ignored, `PatchBank::indexOf` / `at`. **All 50 core + sim tests pass.**
- **Still to do for real hardware**: RP2040 HAL (`firmware/hal/rp2040/`) implementing `IRelayBoard` over GPIO + 74HC595 chain and `IDisplay` over SSD1306 I²C, plus a `main.cpp` that wires `PatchBank` (loaded from LittleFS CBOR), `SwitcherRouter`, and a USB-CDC JSON-RPC transport. The pure core does **not** need to change for that step.
- **Deliverable (host)**: `mb_switcher.exe` smoke-tests the whole switcher pipeline on a laptop. ✅

**Stage 6b — Effect-switcher on RP2040 (deferred)**
- Same firmware base; new HAL implementations only.
- LCD 16×2 (I²C) or SSD1306 OLED showing patch # + name.
- 1 footswitch (short = up, long = down).
- USB-CDC: speaks JSON-RPC to the editor.
- 8 patches stored in LittleFS as CBOR.
- **Deliverable**: a working pedalboard switcher you can use on stage.

**Stage 6c — Effect-switcher on ESP32 (network-attached, in progress)**
- Self-contained PlatformIO project at [`firmware/app-effect-switcher/esp32/`](../firmware/app-effect-switcher/esp32/README.md).
- Same JSON schema as the editor (`SwitcherProject` v1) — the device stores
  the file verbatim in LittleFS; no schema translation step.
- Plain HTTP/REST API on port 80 (not JSON-RPC). Endpoints:
  `GET/PUT /api/config`, `GET /api/patch`, `POST /api/patch/<id|next|prev>`,
  `GET /api/status`. CORS wide-open so the React app can hit it directly.
- Relay driver: two daisy-chained 74HC595s on hardware SPI = 16 relays
  (configurable in `relays.cpp` for other boards).
- WiFi STA mode (creds in git-ignored `secrets.h`), mDNS as `musicbrain.local`.
- **Why ESP32 alongside RP2040?** WiFi out of the box means the editor can
  configure a live pedalboard with zero extra cabling — perfect for a
  rehearsal-room rig that doesn't need the lowest possible latency.
- **Next step**: editor-side "Connect to device" panel that mirrors the
  Simulation tab's actions onto the real device (see Stage 7).
- **Deliverable**: ESP32 + relay-test board responding to patch changes
  triggered from the React editor over WiFi.

**Stage 7 — Editor v1 (project 1 only)**
- Connect to device over WebSerial.
- List, edit, upload, download patches.
- Validate against JSON schema before upload.
- **Deliverable**: edit project-1 patches from the browser with no extra software.

### Phase D — Validate reuse (project 2)

**Stage 8 — Amp-switcher MVP**
- Same firmware base; new `IRelayBoard` driver; new `Patch::AmpSchema`.
- Safety validator: never leave a tube amp unloaded; never bridge two amps onto one speaker.
- Reuses 100% of the editor with a different schema view.
- **Deliverable**: working amp/speaker switcher. The fact that this *just works* validates the core abstraction.

### Phase E — Modular synth brain (project 3, the hard part)

**Stage 9 — One voice, one breakout**
- Teensy 4.1 brain + one `cv-out` breakout (RP2040 + DAC8568 + 8 outputs).
- MIDI in (DIN + USB) → router → SPI → breakout → CV out.
- Hardware tuner ADC input → calibration table.
- One physical CV jack producing 1V/oct over 5 octaves, ≤ 5 ms latency.
- **Deliverable**: end-to-end signal path proven on real hardware.

**Stage 10 — Scale out**
- Add gate/trigger breakout, CV-in breakout.
- Voice allocator handles N voices on N SPI breakouts.
- Editor grows a matrix view + scope panel (Stage 5 reused).
- **Deliverable**: a usable polyphonic modular controller.

**Stage 11 — Multi-case (optional, ADR 0006)**
- Add CAN-FD bridge node firmware (STM32G0B0 + TCAN1051).
- Brain transparently routes frames whose high-byte case-ID doesn't match.
- **Deliverable**: two Eurorack cases behaving as one system.

### Phase F — Polish (any time after Stage 7)

- ESP32-S3 side car for WiFi web-UI + mDNS + BLE-MIDI.
- Audio-routing relay matrix (optional).
- OTA firmware update.
- Schematics + PCB layouts published.

---

## 2. What needs to be specified before each stage

You asked: *"What needs to be specified in order to proceed, or can you proceed already?"*

For the next several stages, **the answer is: I can proceed right now with sensible defaults**, but a few choices will pay back early if you settle them now. Listed per stage:

### Can proceed immediately, no input needed
- **Stage 1**: just install the toolchain and run the build. No decisions.
- **Stage 2**: JSON via nlohmann/json (host), tinycbor (device); patch schema lives in [protocols/schemas/](protocols/) (I'll write the first one).
- **Stage 3**: voice-allocation policy *defaults* to last-note priority with round-robin voice-stealing — easy to swap later.
- **Stage 4 + 5**: the simulator design is fully specified in [Simulation.md](Simulation.md) below.

### Decisions confirmed (May 2026)
- **Stage 6 (project 1)**: **16 relays**, **1 footswitch** wired to send Program Change Up + Down (long-press / double-tap convention TBD in firmware), **OLED display** (SSD1306 128×64 I²C). MCU pick deferred — default RP2040 unless explicitly changed.
- **Stage 9 (project 3)**: **8 voices** target — so 8 CV-out breakout chains in the simulator and PCB plan.
- **Stage 8 (project 2)** and editor hosting: defaults stand (numbers come later from real rig; editor served externally for now).

I will proceed with these.

### What I will *not* assume — these I need from you eventually
- **Mechanical / enclosure choices** (Eurorack vs. desktop box vs. 19″ rack).
- **Connector / pinout choices** for your specific synth modules (only you know your rig).
- **Calibration data** (must come from the real hardware, can't be invented).

---

## 3. Local testing strategy

You asked: *"How can I test locally, without having to have the hardware connected always? Are there simulators available?"*

Three layers — each catches a different class of bug:

### Layer 1 — Unit tests on host
- Already in place: 4 test files under `firmware/core/tests/`.
- Run on every commit (will be CI'd in GitHub Actions).
- Catches: protocol encode/decode bugs, CRC errors, router logic, patch schema regressions.

### Layer 2 — Host simulator (logic level)
- Already in place: `tools/simulator/main.cpp`.
- Feeds canned MIDI events through the real router and prints emitted commands.
- Catches: voice-allocation bugs, patch-routing bugs, edge cases.
- **Stage 3** turns it into a scriptable harness that can replay a `.mid` file.

### Layer 3 — Closed-loop simulator (analog level) — *NEW, this is what you really want*

See [Simulation.md](Simulation.md) for the full design. Summary:
- The simulator instantiates **virtual breakouts** that decode our SPI frames in software, model the DAC + S&H + CD4051 mux, and emit CV-vs-time waveforms.
- The waveforms are written to a CSV (or NDJSON) trace, viewable in:
  - The editor's "Scope" panel (real-time, over WebSocket).
  - Any external tool (gnuplot, Python matplotlib, Excel, PulseView).
- This lets you watch envelopes shape, see gate timing, verify pitch tracking — **all without hardware**.

### What ready-made simulators exist (and why they don't quite fit)

| Tool | What it does | Fit for MusicBrain |
|---|---|---|
| **Wokwi** (online) | MCU + peripherals (LCD, LEDs, basic SPI chips) in a browser, with a built-in logic analyser | Fine for project-1 LCD + relay logic. **No DAC8568, no SMP08, no CV plot**. |
| **Renode** (Antmicro, free) | Real STM32/NXP MCU emulation including peripherals; Python scripting; can mock SPI slaves | Powerful but heavy; we'd still write our own DAC/mux models. |
| **QEMU** | Generic emulator | Weak analog support; not worth it for our use case. |
| **PlatformIO `native` env** | Compile firmware for host, run on PC | This is exactly what our `core/` + `host/` HAL already does. |
| **ngspice / LTspice** | True SPICE analog circuit simulation | Excellent for verifying the *analog* output stage in isolation (op-amp scaling, S&H droop), driven by a digital stimulus we generate. **Complementary, not replacement.** |
| **PJRC Audio System simulator** | Teensy-specific audio block sim | Useful for the tuner ADC path only. |

**Verdict**: no single tool ticks all the boxes; the practical answer is **build it ourselves** as Stage 4. Our SPI frame, DAC choice, S&H topology and patch model are all known in software — modelling them in C++ is straight-forward and lets us iterate fast. Full design in [Simulation.md](Simulation.md).

---

## 4. Immediate next steps (this week)

Concretely, in order:

1. **Get the host toolchain working** (see [README.md](../README.md)). On Windows the path of least resistance is:
   ```powershell
   winget install Kitware.CMake LLVM.LLVM Ninja-build.Ninja
   # then start a new PowerShell so PATH refreshes
   cmake --version ; clang++ --version
   ```
   If `winget` is not available, install "Build Tools for Visual Studio 2022" with the C++ workload + CMake component.

2. **Run the existing build & tests** to prove the scaffold compiles:
   ```powershell
   cd D:\Git\Muziek\MusicBrain\firmware
   cmake -S . -B build -G Ninja
   cmake --build build
   ctest --test-dir build --output-on-failure
   ```

3. **Tell me whether to start Stage 2 (Patch JSON+CBOR I/O) or jump to Stage 4 (closed-loop simulator)**. Both are independent; we can interleave them. My recommendation: Stage 2 first (foundation other stages need), then Stage 4.

4. **Optionally answer the Stage 6 questions** (project 1 MCU/relay/display choices) so I can start that branch in parallel. Defaults are fine if you don't want to think about it yet.

---

## 5. Risks & how we mitigate them

| Risk | Likelihood | Mitigation |
|---|---|---|
| Latency budget (5 ms) blown by USB-MIDI jitter | Medium | DIN-MIDI is the primary input on project 3; USB-MIDI as secondary. Measure end-to-end early in Stage 9. |
| DAC8568 supply chain dries up | Low | AD5754R / MAX5134 are pin-compatible-ish alternatives ([tech/dac-comparison.md](tech/dac-comparison.md)). |
| Breakout MCU (RP2040) can't keep up with 50 kHz × 8 channels interpolation | Low | Has been measured at this rate by others; we have STM32F1 as backup. |
| Editor over WebSerial fails on user's browser | Medium | Document Chromium-only requirement; fall back to ESP32 + WebSocket path. |
| Schematics not yet drawn | High *now*, low *long-term* | Stage 6 schematics first (easy: relays); modular synth schematics gated by Stage 4+5 simulation working. |
| Project 3 scope creep | High | Strict stage gating. Each stage ships something usable on its own. |

---

## 6. Appendix — index of related docs

- [Requirements.md](Requirements.md) — original brief
- [Plan.md](Plan.md) — original (pre-decision) plan, kept for history
- [Answers.md](Answers.md) — your answers to the eight open questions
- [adr/](adr/) — eight Architecture Decision Records
- [protocols/spi-frame.md](protocols/spi-frame.md) — wire format
- [tech/](tech/) — per-technology briefs (RP2040, Teensy 4, CBOR, CAN-FD, …)
- [Simulation.md](Simulation.md) — closed-loop simulator design (next document)
