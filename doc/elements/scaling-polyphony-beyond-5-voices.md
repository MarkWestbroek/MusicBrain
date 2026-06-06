# Scaling Polyphony Beyond 5 Voices — Analysis

> 5 voices is the hard CPU limit for Elements DSP on a single Teensy 4.1 @ 600 MHz
> (v0.6.0-attempt: minSrc=1-2, ring buffer starvation, 6×39%=234% total CPU).
> This document analyses two approaches to get more voices.

---

## Option 1: Second Teensy as DSP Slave (Recommended)

### Concept

Run a second Teensy 4.1 as a dedicated DSP slave. The master Teensy handles
MIDI, voice allocation, reverb, and USB audio. The slave runs 5 additional
`Part::Process()` voices and sends rendered 32 kHz audio blocks back to the
master via SPI.

**Result**: 10 voices (5 master + 5 slave) with minimal inter-chip latency.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Master Teensy 4.1                                          │
│                                                             │
│  USB-MIDI → Voice Allocator → 5 local voices               │
│                              → SPI: overflow notes to slave │
│                                                             │
│  loop(): 5× Part::Process(16) → 5× 32kHz ring buffers      │
│  + SPI RX: 5× 16-sample blocks from slave                  │
│  PIT ISR: resample + mix 10 voices → 44.1kHz ring buffer   │
│  Audio ISR: feeder → reverb → USB audio                     │
└─────────────────────────────────────────────────────────────┘
          │ MOSI (note/CC data)     │ MISO (audio blocks)
          │ SCK                     │ CS
          ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Slave Teensy 4.1                                           │
│                                                             │
│  SPI RX: noteOn/off + CC → 5 voices                         │
│  loop(): 5× Part::Process(16) → local 32kHz ring buffers   │
│  SPI TX: 5× 16-sample stereo blocks → master               │
│                                                             │
│  NO: USB audio, USB MIDI, reverb, Audio Library             │
│  YES: Part::Process, ring buffers, SPI slave driver         │
└─────────────────────────────────────────────────────────────┘
```

### Inter-chip communication

**Protocol**: SPI at 10–20 MHz (already designed for CV/gate in `two-teensy-spi.md`).
The existing SPI frame protocol (`doc/protocols/spi-frame.md`) can be extended
with new opcodes for audio transport.

**New opcodes needed**:

| Opcode | Name | Direction | Payload |
|-------:|------|-----------|---------|
| `0x40` | `NoteOn` | master → slave | `u8 voice, u8 note, u8 velocity` |
| `0x41` | `NoteOff` | master → slave | `u8 voice` |
| `0x42` | `CcSet` | master → slave | `u8 cc, i16 value` |
| `0x50` | `AudioBlock` | slave → master | `u8 voice, 16× i16 L, 16× i16 R` (66 bytes) |

**Audio block payload**: 1 voice × 16 samples × 2 channels × 2 bytes = 64 bytes
+ 1 voice byte + 1 padding = 66 bytes. This exceeds the current 56-byte payload
limit. Options:
- (a) Increase max payload to 64 bytes (still fits CAN-FD 64-byte field minus
  header/CRC, but tight). Or split into two frames per block.
- (b) Send 5 voices × 16 samples as a bulk transfer: 5×64 = 320 bytes. This
  needs a multi-frame protocol or raw SPI DMA (no frame overhead).
- (c) **Simplest**: use raw SPI DMA for audio, not the framed protocol. The
  framed protocol is for CV/gate (low bandwidth, needs CRC). Audio is high-
  bandwidth and continuous — DMA with a simple header is better.

**Recommended**: Dual SPI channel approach:
- **SPI framed protocol** (existing): for note/CC control data (low bandwidth,
  ~100 bytes/sec, needs CRC).
- **SPI DMA audio stream**: for rendered audio blocks (high bandwidth, continuous,
  no CRC needed — audio glitches are audible but not catastrophic).

Actually, the simplest approach is even simpler: **the master sends MIDI-like
control via the existing SPI frame protocol, and the slave sends audio back
via a separate SPI DMA channel or even I²S**.

### Bandwidth analysis

**Control data (master → slave)**:
- NoteOn/NoteOff: ~10 events/sec × 4 bytes = 40 bytes/sec
- CC changes: ~5 events/sec × 4 bytes = 20 bytes/sec
- Total: ~60 bytes/sec — trivial, even at 1 MHz SPI

**Audio data (slave → master)**:
- 5 voices × 32 kHz × 2 channels × 2 bytes (int16) = 640 KB/sec
- At 20 MHz SPI: 2.5 MB/sec raw → 640 KB/sec is 25% utilization ✅
- At 10 MHz SPI: 1.25 MB/sec raw → 640 KB/sec is 51% utilization ✅
- Block-based: 5 voices × 16 samples × 4 bytes = 320 bytes per block
  × 2000 blocks/sec (32kHz/16) = 640 KB/sec ✅

**Latency**: One 16-sample block = 0.5 ms at 32 kHz. SPI transfer of 320 bytes
at 20 MHz = 160 µs. Total inter-chip latency: **~0.66 ms** — imperceptible.

### Slave firmware simplification

The slave Teensy runs a stripped-down version of `app-elements`:

| Component | Master | Slave |
|-----------|--------|-------|
| Part::Process(16) | ✅ 5 voices | ✅ 5 voices |
| Ring buffers (32kHz) | ✅ 5 voices | ✅ 5 voices |
| PIT ISR (resample) | ✅ 10 voices | ❌ not needed |
| Audio Library | ✅ USB output | ❌ not needed |
| Reverb | ✅ | ❌ (master does reverb) |
| USB MIDI | ✅ | ❌ (control via SPI) |
| Voice allocator | ✅ round-robin | ❌ (master assigns) |
| SPI master | ✅ | ❌ |
| SPI slave | ❌ | ✅ (RX control, TX audio) |
| Serial debug | ✅ non-blocking | optional (debug only) |

**Slave memory**: same hybrid DTCM/OCRAM layout as master. No Audio Library
saves ~20KB DTCM. No reverb saves 64KB DTCM. No USB saves some RAM.
Estimated: **~60KB more free DTCM, ~20KB more free OCRAM** than master.

### Does the slave need the Audio Library?

**No.** The slave doesn't produce USB audio. It renders Part::Process(16) in
loop() and sends raw 32kHz float/int16 blocks via SPI. No AudioConnection
graph, no AudioStream, no AudioMemory. This is a significant simplification.

### Voice allocation across two Teensies

The master runs a 10-voice round-robin allocator. Voices 0–4 are local,
voices 5–9 are on the slave. When a noteOn arrives:

1. Master picks the next voice index (0–9).
2. If voice 0–4: render locally.
3. If voice 5–9: send NoteOn opcode to slave via SPI.

CC changes are broadcast to both Teensies (all voices share same timbre).

### Integration with existing two-Teensy design

The project already has a two-Teensy architecture documented in
`doc/tech/two-teensy-spi.md` — but that's for **CV/gate distribution**
(CV brain + audio instrument). The DSP slave concept is different:

- **Existing design**: CV Teensy (master) sends CV/gate to audio Teensy (slave)
  via SPI. Both run `app-modular-brain` with different roles.
- **DSP slave design**: audio Teensy (master) sends overflow notes to DSP
  Teensy (slave) via SPI. Slave sends rendered audio back.

These could be **combined**: one Teensy is the CV brain + main audio, the
other is the DSP slave + secondary audio output. But that's a future
integration step — for now, the DSP slave is a standalone `app-elements`
variant.

### Pros and cons

| Aspect | Assessment |
|--------|------------|
| **Complexity** | Low — reuse existing Part::Process code, add SPI slave driver |
| **Latency** | ~0.66 ms — imperceptible |
| **Voice count** | 10 (5+5) — doubles capacity |
| **Cost** | ~€25 for second Teensy 4.1 |
| **Development time** | ~1–2 weeks for SPI slave driver + stripped firmware |
| **Risk** | Low — well-understood SPI on Teensy, proven DSP code |
| **Power** | Two Teensies ~0.5W each = 1W total |
| **Size** | Two Teensy boards in one eurorack module (3U × ~8HP) |

---

## Option 2: FPGA Sidecar (Future / Experimental)

### Concept

Use an FPGA (e.g., Arty S7-50 with Spartan-7) to accelerate the most
parallel-friendly parts of the Elements DSP, freeing the Teensy CPU for
more voices.

### What the FPGA could accelerate

The Elements DSP pipeline per voice is:

```
Exciter (bow/blow/strike) → Resonator (64 bandpass filters) → Diffuser → Output
```

| DSP component | CPU cost | FPGA suitability |
|---------------|----------|-------------------|
| **Resonator** (64 parallel Svf bandpass filters) | ~60% of Part::Process | ✅✅✅ Ideal — massively parallel, identical structure |
| **Exciter** (bow=String Karplus-Strong, blow=Tube, strike=noise burst) | ~25% of Part::Process | ⚠️ Mixed — String has delay lines (sequential), Tube is sequential |
| **Diffuser** (FxEngine allpass network) | ~10% of Part::Process | ⚠️ Sequential delay-line structure |
| **Envelope** (MultistageEnvelope) | ~5% | ❌ Simple, not worth FPGA overhead |

**Best FPGA target**: the Resonator. 64 identical Svf filters running in
parallel would take ~1 clock cycle per sample on FPGA vs. 64 sequential
iterations on CPU. This could reduce Part::Process from ~39% to ~15% per
voice, enabling ~13 voices on a single Teensy.

### Inter-chip communication for FPGA

If the FPGA runs the Resonator, the Teensy runs the Exciter. The data flow
per 16-sample block:

```
Teensy: Exciter → 16-sample "raw" audio → SPI → FPGA
FPGA: Resonator + Diffuser → 16-sample "main/aux" → SPI → Teensy
```

**Bandwidth**: 1 voice × 16 samples × 2 bytes × 2 directions = 128 bytes/block
× 2000 blocks/sec = 256 KB/sec per voice. For 5 voices: 1.28 MB/sec.
At 20 MHz SPI: feasible ✅.

**Latency**: 2 SPI transfers per block = ~0.5 ms round-trip. Acceptable but
adds 1 block of latency (0.5 ms at 32 kHz).

### Challenges

| Challenge | Severity | Notes |
|-----------|----------|-------|
| **HDL development** | 🔴 High | Resonator in Verilog/VHDL — 64 Svf filters, coefficient loading, parameter interpolation. Months of work. |
| **Coefficient transfer** | 🟡 Medium | Resonator coefficients (frequency, gain, damping for 64 modes) change with CC#17–20. Need SPI protocol for coefficient updates. |
| **Verification** | 🔴 High | FPGA DSP must match C++ bit-exact (or close enough). Need test harness comparing FPGA output vs. reference C++ output. |
| **Toolchain** | 🟡 Medium | Xilinx Vivado for Spartan-7. Free WebPACK license, but heavy (~30GB install, long synthesis times). |
| **Production** | 🔴 High | Arty S7-50 is a dev board ($149). Production needs custom PCB with FPGA — much more complex than Teensy. |
| **Power** | 🟡 Medium | Spartan-7 ~0.5–1W. Total system ~1.5–2W. |
| **Latency** | 🟢 Low | ~0.5 ms added — imperceptible for musical use. |

### FPGA vs. second Teensy — comparison

| Aspect | Second Teensy | FPGA Sidecar |
|--------|---------------|--------------|
| **Voice count** | 10 (5+5) | ~13 (if Resonator offloaded) |
| **Development time** | 1–2 weeks | 2–4 months |
| **Cost (dev)** | ~€25 | ~€149 (Arty S7-50) |
| **Cost (production)** | ~€25 per Teensy | ~€10–30 for FPGA chip + PCB (much more complex) |
| **Complexity** | Low (C++ firmware) | High (HDL + C++ + integration) |
| **Risk** | Low | High (new technology, verification) |
| **Latency** | ~0.66 ms | ~0.5 ms |
| **Power** | ~1W (two Teensies) | ~1.5–2W |
| **Flexibility** | Can run any DSP code | Fixed to accelerated function |

---

## Recommendation

**Start with Option 1 (second Teensy)**. It's the simplest path to more voices:

1. **Immediate**: 10 voices with minimal development effort.
2. **Leverages existing work**: same Part::Process code, same hybrid memory
   layout, same SPI infrastructure (already designed for CV/gate).
3. **Low risk**: well-understood platform, proven DSP code.
4. **Fast iteration**: C++ firmware changes are quick to test.

**Option 2 (FPGA) is a future research direction**, worth exploring if:
- You need >10 voices on a single chip (e.g., 16-voice polyphony).
- You want to reduce per-voice CPU to enable other DSP on the Teensy.
- You're interested in FPGA development as a learning goal.

The FPGA approach has much higher development cost and risk. It's the right
choice if you're building a product that needs maximum polyphony in minimum
hardware — but for a prototype/experiment, the second Teensy is far more
practical.

---

## Implementation Plan (Option 1)

### Phase 1: SPI audio transport prototype (~1 week)

1. Create `app-elements-slave` firmware project (stripped-down `app-elements`).
2. Implement SPI slave driver on slave Teensy:
   - RX: framed protocol for NoteOn/NoteOff/CC (reuse existing `SpiFrame`).
   - TX: raw DMA for audio blocks (5 voices × 16 samples × stereo).
3. Implement SPI master audio RX on master Teensy:
   - TX: framed protocol for control data.
   - RX: DMA for audio blocks from slave.
4. Test with 1 voice on slave, verify audio quality and latency.

### Phase 2: 10-voice integration (~1 week)

1. Extend voice allocator to 10 voices (0–4 local, 5–9 remote).
2. Extend PIT ISR to resample + mix 10 voices (5 local + 5 from slave).
3. Test under MIDI load, measure CPU on both Teensies.
4. Verify minSrc stability on both sides.

### Phase 3: Integration with app-modular-brain (~future)

1. Merge DSP slave concept into the existing two-Teensy architecture
   (`doc/tech/two-teensy-spi.md`).
2. One Teensy = CV brain + 5 local voices + reverb + USB audio.
3. Other Teensy = 5 DSP voices + SPI slave.
4. Editor config: `host` field determines voice distribution.

---

## References

- `doc/tech/two-teensy-spi.md` — existing two-Teensy SPI architecture
- `doc/tech/spi.md` — SPI protocol overview
- `doc/protocols/spi-frame.md` — SPI frame format and opcodes
- `doc/elements/gemini-advies-1.md` and `gemini-advies-2.md` — Gemini analysis
  (memory layout, FPGA potential for Resonator)
- `doc/elements/architecture.md` — ADR 0014, CPU budget, version history
- `firmware/app-elements/README.md` — 5-voice status, 6-voice test result