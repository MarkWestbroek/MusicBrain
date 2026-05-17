# Simulation strategy

> Companion to [Plan-v2.md](Plan-v2.md) §3. Describes how MusicBrain firmware can be exercised **end-to-end without any hardware**, including a realistic CV-versus-time output suitable for visual inspection in a scope-like UI.

---

## 1. Goal

Run the *entire* signal path of project 3 on a developer laptop:

```
[MIDI file or live USB]
        │
        ▼
   Router (real code from firmware/core/)
        │  SPI frames
        ▼
   Virtual Bridge ── (optional) virtual CAN-FD ── Virtual Bridge
        │
        ▼
   Virtual Breakout (CV-out, gate, trigger, CV-in)
        │  emits time-stamped analog samples
        ▼
   Trace file  /  WebSocket stream  /  Scope panel in editor
```

What this gives us:
- Replay a `.mid` file and **see the resulting CV waveforms** before any solder is melted.
- Verify envelope timing, gate behaviour, pitch-CV tracking, voice-allocation correctness.
- Reproduce bug reports as `.mid` + expected `.csv`, drop-in regression tests.

What this is **not**:
- An analog circuit simulator. For checking op-amp scaling stages, S&H droop or capacitor selection, **export the simulator's CV samples and feed them as a PWL source into LTspice / ngspice**. The two tools are complementary.

---

## 2. Why build this ourselves

See [Plan-v2.md §3 — "What ready-made simulators exist"](Plan-v2.md#what-ready-made-simulators-exist-and-why-they-dont-quite-fit). Short version:

- **Wokwi / Renode / QEMU** don't know our DAC8568 + CD4051 + SMP08 topology and don't produce a CV-vs-time plot.
- The SPI frame, voice-allocator and breakout firmware live in our codebase already; modelling them is a small amount of additional code.
- We get a free **regression-testing framework**: input `.mid` + expected `.csv` is a golden test.

The investment is small (a few hundred lines of C++) and pays back across all of project 3's development.

---

## 3. Architecture

### 3.1 New module: `firmware/sim/`

```
firmware/sim/
  CMakeLists.txt
  include/
    mb/sim/Clock.h               // virtual clock; advances in µs
    mb/sim/Trace.h               // CSV / NDJSON sink
    mb/sim/VirtualSpiBus.h       // moves frames brain→breakout(s)
    mb/sim/VirtualBridge.h       // SPI ↔ virtual CAN-FD
    mb/sim/chips/Dac8568.h       // 16-bit DAC model
    mb/sim/chips/Mcp4922.h       // 12-bit DAC model
    mb/sim/chips/Cd4051.h        // 3-bit analog mux
    mb/sim/chips/Smp08.h         // 8-channel S&H
    mb/sim/boards/CvOutBoard.h   // composes DAC + mux + S&H + output op-amp
    mb/sim/boards/GateBoard.h
    mb/sim/boards/CvInBoard.h
  src/                           // implementations
  examples/
    midi_to_cv.cpp               // CLI: read .mid + .json patch → write .csv trace
    live_ws_server.cpp           // serves traces over WebSocket
```

### 3.2 Time model

- Single virtual clock, monotonic, microsecond resolution.
- The simulator runs **faster than realtime** by default (no `sleep` calls; deterministic).
- A `--realtime` flag throttles to wall-clock for live demos / scope viewing.
- Every chip declares its propagation/settling time so the trace reflects realistic delays (e.g. DAC8568 settling ~10 µs after a write, CD4051 channel-switch glitch < 1 µs).

### 3.3 Virtual chip models

Each chip is a tiny C++17 class with three responsibilities:

1. **Accept** the same input the real chip would (SPI bytes, address pins, INH).
2. **Update** its internal state (register file for DACs, current channel for muxes, hold-cap voltage for S&H).
3. **Emit** time-stamped output samples to the `Trace` sink.

Example sketch:

```cpp
class Dac8568 {
public:
    void writeSpi(std::span<const std::uint8_t> bytes, Time t);
    float output(int channel) const;       // current V on that pin
    void tick(Time now, Trace& trace);     // append samples since last tick
private:
    std::array<std::uint16_t, 8> codes_{}; // 16-bit DAC codes
    Time lastWrite_[8]{};                  // for settling-time modelling
};
```

Models are deliberately *simple* (linear settling, no temperature drift, no noise) — the goal is to verify **firmware behaviour**, not to replace SPICE. If we want noise/drift modelling later, hook ngspice in as a co-simulator.

### 3.4 Trace format

NDJSON, one record per state change:

```json
{"t_us": 1234, "kind": "cv",   "case": 0, "slot": 3, "ch": 0, "v": 1.0833}
{"t_us": 1240, "kind": "gate", "case": 0, "slot": 4, "ch": 0, "on": true}
{"t_us": 1245, "kind": "trig", "case": 0, "slot": 5, "ch": 2, "dur_us": 10000}
```

NDJSON wins over CSV because the schema can grow (different chip types) without breaking older traces. A CSV adapter (`tools/trace-to-csv`) gives us spreadsheet/gnuplot input when wanted.

For Eurorack-style scoping the editor's scope panel resamples to a fixed grid (e.g. 1 kHz) on display.

### 3.5 Entry points

Three ways to drive the simulator:

| Mode | Command | Use |
|---|---|---|
| One-shot file | `mb_sim --patch p.json --midi song.mid --out trace.ndjson` | Regression tests, what-if exploration |
| Live REPL | `mb_sim --repl` | Type MIDI events, see traces stream |
| WebSocket server | `mb_sim --serve --port 8765` | Editor "Scope" panel connects over `ws://localhost:8765` |

All three share the same engine; only the front-end differs.

---

## 4. Editor "Scope" panel (Stage 5)

A small React component:

- WebSocket client → consumes the NDJSON stream.
- Plots up to 8 channels using either Canvas (fast) or a small library (`uplot` is ~40 KB and ideal for this).
- Time axis pan/zoom; per-channel colour & enable.
- "Snap to grid", cursor with V/time readout.
- Optional measurement overlays: peak, RMS, frequency (FFT on a window).

This is the same panel we'll later point at **real hardware** when an ESP32 streams ADC readings of physical outputs — so the development effort serves twice.

---

## 5. What this catches (and what it doesn't)

### Catches
- Voice-allocation bugs (wrong oscillator triggered).
- Off-by-one in SPI opcode tables.
- Patch-loading edge cases (default-value handling, missing fields).
- Latency regressions (assert `t_gate - t_event < 5000 µs`).
- Calibration math errors (assert `cv ≈ note × 1/12` after table apply).
- Glitches from mux switching during settling (the model emits the glitch).
- Bridge-routing mistakes (frame goes to wrong case-ID).

### Does NOT catch
- Analog noise, ground loops, EMI.
- Op-amp slew/clipping in the final scaling stage. → use LTspice with PWL of our trace.
- Mechanical/connector issues.
- Power-supply problems.
- Cable propagation in long CAN-FD runs.
- Real timing variation in the MCU's SPI peripheral (use a logic analyser on real HW).

These all require hardware, but they show up *after* the firmware is logically correct — which is exactly what the simulator gets us to.

---

## 6. Implementation plan (maps to Plan-v2 Stage 4 + 5)

**Stage 4 work items**

| # | Item | Effort |
|---|------|--------|
| 4.1 | `firmware/sim/Clock.h`, `Trace.h` (NDJSON sink) | S |
| 4.2 | `VirtualSpiBus` — moves frames brain→slave with chip-select | S |
| 4.3 | `Dac8568` model (16-bit, 8-ch, settling) | M |
| 4.4 | `Cd4051` + `Smp08` models (mux glitch, hold-cap droop) | M |
| 4.5 | `CvOutBoard` (composes the above into one breakout) | S |
| 4.6 | `GateBoard`, `CvInBoard` minimal models | S |
| 4.7 | `mb_sim` CLI (file mode) | S |
| 4.8 | One worked example: 1 voice, 8 bars of MIDI → trace file | S |
| 4.9 | Regression test: hash of trace must match golden file | S |

**Stage 5 work items**

| # | Item | Effort |
|---|------|--------|
| 5.1 | `mb_sim --serve` WebSocket mode (uses [uWebSockets](https://github.com/uNetworking/uWebSockets) or `cpp-httplib`) | M |
| 5.2 | Editor `Scope.tsx` (uplot, 8 channels, pan/zoom) | M |
| 5.3 | Editor connects "Local simulator" as a transport (sibling to WebSerial + real WS) | S |
| 5.4 | "Play patch" button: load patch.json + canned MIDI → see scope | S |

S = ½–1 day, M = 1–3 days, L = 1 week+. Total: ~2 weeks of focused work for both stages.

---

## 7. Dependencies pulled in

| Dependency | Where | Why | License |
|---|---|---|---|
| [smf](https://github.com/craigsapp/midifile) | sim | Read `.mid` files | BSD-2 |
| [uplot](https://github.com/leeoniya/uPlot) | editor | Fast canvas plotting | MIT |
| [uWebSockets](https://github.com/uNetworking/uWebSockets) or cpp-httplib | sim | WebSocket server | Apache-2.0 / MIT |
| (existing) [nlohmann/json](https://github.com/nlohmann/json) | sim | Trace records | MIT |

All MIT/BSD/Apache-2.0 — compatible with our MIT licence ([ADR 0007](adr/0007-license.md)).

---

## 8. Open design questions for you

Small decisions, none blocking:

1. **Trace format default**: NDJSON (recommended, schema-evolving) or CSV (simpler, Excel-friendly)?
2. **Time resolution**: µs (recommended, matches MCU) or ns (overkill)?
3. **Realistic noise modelling**: yes/no/later? Default: later.
4. **Scope library**: uplot (40 KB, fast, ugly default styling) or something heavier with a nicer look (recharts, ~200 KB)? Default: uplot.

Tell me if any of those differ from your preference; otherwise I'll proceed with the defaults when Stage 4 starts.

---

## 8. Effect-switcher editor simulations (added round-4)

The React editor's **Simulation** tab is split into two sub-views, because the
effect-switcher project has two *very* different user stories that deserve
their own visualisation:

### 8.1 `Musician using the box` (existing)

The on-stage view: footswitch → ESP32 brain → 16-relay matrix → audio
signal path with pedal cards. Pure offline simulation against the in-memory
patches; no device involved. This is what the guitarist sees in their head
when they think `what does pressing FS▼ do?`.

### 8.2 `Editor talking to the device` (new)

The workshop / config view. Three columns:

1. **Browser (editor)** — a stylised browser card with buttons for the real
   API verbs: *Connect*, *GET /api/status*, *GET /api/config*,
   *PUT /api/config*, *POST /api/patch/<id>*. The user picks the transport
   (USB cable or WiFi).
2. **Transport visualisation** — animated SVG of a USB cable *or* WiFi
   waves; lights up when `connected`.
3. **ESP32 device** — small dev-board sketch with a fake OLED screen
   showing `MusicBrain` + a status line (`idle` / `connected` /
   `receiving config…` / `applying patch N`) and a status LED.

Below the three columns sits a **request log** in dark-monospace; browser
requests are yellow (→) and device replies are green (←).

Everything is simulated in-memory — no actual HTTP traffic. When the real
`Connect to device` panel lands (Plan-v2 stage 7), the same layout will
be reused but the buttons will fire genuine etch() calls into the ESP32
firmware described in
[firmware/app-effect-switcher/esp32/README.md](../firmware/app-effect-switcher/esp32/README.md).

### 8.3 Why two simulations instead of one

The two views answer different questions:

| View | Audience | Question answered |
|---|---|---|
| Musician using the box | Performer | `Will pressing this footswitch do what I want?` |
| Editor → device | Tech / power-user | `If I push this config, what happens on the wire?` |

Mixing them into one screen would force one view to compromise — the
musician doesn't care about `PUT /api/config` and the tech doesn't need
to see pedal cards with brand logos.
