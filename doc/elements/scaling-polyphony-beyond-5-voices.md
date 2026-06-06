# Scaling Polyphony Beyond 5 Voices — Analysis

> 5 voices is the hard CPU limit for Elements DSP on a single Teensy 4.1 @ 600 MHz
> (v0.6.0-attempt: minSrc=1-2, ring buffer starvation, 6×39%=234% total CPU).
> This document analyses two approaches to get more voices.

---

## Key insight: 32 kHz vs 44.1 kHz

The Elements DSP runs natively at **32 kHz** (`elements::kSampleRate`). The
current firmware resamples to 44.1 kHz **only because USB audio requires it** —
the Teensy Audio Library's USB output is fixed at 44.1 kHz.

In production, the output will be **analog** (DAC on PCB). This means:

- **No resampling needed** — the DAC can run at 32 kHz directly
- **No Audio Library needed** — no USB audio, no AudioConnection graph
- **No PIT ISR needed** — Part::Process output goes straight to DAC buffer
- **CPU savings**: PIT ISR currently costs 4.2% for resampling + mixing
- **Code simplification**: entire dual-rate layer disappears

This changes the architecture significantly. Below we describe both the
**current prototype** (USB audio, dual-rate) and the **production target**
(analog output, native 32 kHz).

---

## Option 1: Second Teensy as DSP Slave (Recommended)

### Concept

Run a second Teensy 4.1 as a dedicated DSP slave. The master Teensy handles
MIDI, voice allocation, reverb, and output. The slave runs 5 additional
`Part::Process()` voices and sends rendered audio to the master via SPI.

**Result**: 10 voices (5 master + 5 slave) with minimal inter-chip latency.

### Architecture — Production (analog output, native 32 kHz)

This is the simpler and final architecture. Both Teensies run Elements at its
native 32 kHz. No resampling, no Audio Library, no USB audio.

```
┌─────────────────────────────────────────────────────────────┐
│  Master Teensy 4.1                                          │
│                                                             │
│  USB-MIDI → Voice Allocator → 5 local voices               │
│                              → SPI: overflow notes to slave │
│                                                             │
│  loop(): 5× Part::Process(16) → 5× 32kHz ring buffers      │
│  DAC ISR: mix 5 local voices + slave stream → DAC output    │
│  Reverb: applied to combined mix before DAC                  │
└─────────────────────────────────────────────────────────────┘
          │ MOSI (note/CC data)     │ MISO (audio stream)
          │ SCK                     │ CS
          ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Slave Teensy 4.1                                           │
│                                                             │
│  SPI RX: noteOn/off + CC → 5 voices                         │
│  loop(): 5× Part::Process(16) → 5× 32kHz ring buffers      │
│  SPI TX: 32kHz pre-mixed stereo blocks → master             │
│                                                             │
│  NO: USB audio, USB MIDI, reverb, Audio Library, PIT ISR    │
│  YES: Part::Process, ring buffers, SPI slave driver          │
└─────────────────────────────────────────────────────────────┘
```

**Slave is very simple**: just Part::Process in loop() + SPI TX of pre-mixed
stereo blocks. No PIT ISR, no resampler, no Audio Library. The slave mixes
its 5 voices internally (same `0.4f` per-voice level) and sends one stereo
stream at 32 kHz.

### Architecture — Prototype (USB audio, dual-rate 32→44.1 kHz)

This is the current development setup, using USB audio for testing without
soldering. The master resamples to 44.1 kHz for USB output.

```
┌─────────────────────────────────────────────────────────────┐
│  Master Teensy 4.1                                          │
│                                                             │
│  USB-MIDI → Voice Allocator → 5 local voices               │
│                              → SPI: overflow notes to slave │
│                                                             │
│  loop(): 5× Part::Process(16) → 5× 32kHz ring buffers      │
│  PIT ISR: resample 5 local + mix slave stream → 44.1kHz     │
│  Audio ISR: feeder → reverb → USB audio                     │
└─────────────────────────────────────────────────────────────┘
          │ MOSI (note/CC data)     │ MISO (audio stream)
          │ SCK                     │ CS
          ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Slave Teensy 4.1                                           │
│                                                             │
│  SPI RX: noteOn/off + CC → 5 voices                         │
│  loop(): 5× Part::Process(16) → 5× 32kHz ring buffers      │
│  PIT ISR: resample + mix 5 voices → 44.1kHz stereo stream  │
│  SPI TX: 44.1kHz stereo blocks → master                    │
│                                                             │
│  NO: USB audio, USB MIDI, reverb, Audio Library             │
│  YES: Part::Process, ring buffers, PIT ISR, SPI slave       │
└─────────────────────────────────────────────────────────────┘
```

In the prototype, the slave also needs a PIT ISR to resample its 5 voices
to 44.1 kHz before sending via SPI. This is temporary — in production both
Teensies run native 32 kHz and the PIT ISR disappears.

### Inter-chip communication

**Protocol**: SPI at 10–20 MHz (already designed for CV/gate in `two-teensy-spi.md`).
The existing SPI frame protocol (`doc/protocols/spi-frame.md`) can be extended
with new opcodes for audio transport.

**New opcodes needed** (for control data, extending existing SPI frame protocol):

| Opcode | Name | Direction | Payload |
|-------:|------|-----------|---------|
| `0x40` | `NoteOn` | master → slave | `u8 voice, u8 note, u8 velocity` |
| `0x41` | `NoteOff` | master → slave | `u8 voice` |
| `0x42` | `CcSet` | master → slave | `u8 cc, i16 value` |

**Audio transport** (slave → master): not using the framed protocol.
The slave sends a continuous stream of pre-mixed stereo blocks via SPI DMA.
Each block: `[u8 magic][u8 block_seq][16× i16 L][16× i16 R]` = 66 bytes.
The magic/seq header allows the master to detect dropped blocks.

**Recommended**: Dual SPI channel approach:
- **SPI framed protocol** (existing): for note/CC control data (low bandwidth,
  ~100 bytes/sec, needs CRC).
- **SPI DMA audio stream**: for rendered stereo blocks (128–176 KB/sec,
  continuous, simple header — no CRC needed, audio glitches are audible but
  not catastrophic).

**Alternative: I²S for audio transport.** The Teensy 4.1 has a hardware I²S
peripheral that could carry the audio stream instead of SPI DMA. I²S is
designed for continuous audio streaming and would be even simpler to set up
(no custom framing needed). The slave would output I²S, the master would
receive I²S and mix it with local voices. This keeps SPI free for control
data only. **I²S is worth investigating** — it may be the cleanest solution
for audio transport between two Teensies.

**Another alternative: analog mixing.** If both Teensies have DAC outputs,
the simplest approach is: each Teensy outputs its 5 voices to its own DAC
channel, and the analog signals are mixed externally (summing opamp or
resistor network). No inter-chip audio transport at all! Only SPI for
control data. This is the **absolute simplest** production architecture.

### Bandwidth analysis

**Control data (master → slave)** — same for both scenarios:
- NoteOn/NoteOff: ~10 events/sec × 4 bytes = 40 bytes/sec
- CC changes: ~5 events/sec × 4 bytes = 20 bytes/sec
- Total: ~60 bytes/sec — trivial, even at 1 MHz SPI

**Audio data (slave → master)** — depends on scenario:

| Scenario | Stream format | Bandwidth | SPI @ 20 MHz util |
|----------|--------------|-----------|--------------------|
| **Production** (32 kHz) | 1 pre-mixed stereo × 32kHz × 2ch × 2B | **128 KB/sec** | 5% ✅✅ |
| **Prototype** (44.1 kHz) | 1 pre-mixed stereo × 44.1kHz × 2ch × 2B | **176 KB/sec** | 7% ✅✅ |

Both are very low — SPI has ample headroom.

**Latency**:
- Production: 1 block at 32 kHz = 0.5 ms. SPI transfer of 64 bytes at 20 MHz
  = 32 µs. Total: **~0.53 ms** — imperceptible.
- Prototype: 1 block at 44.1 kHz = 0.36 ms. SPI transfer of 66 bytes at 20 MHz
  = 33 µs. Total: **~0.39 ms** — imperceptible.

### Slave firmware — Production (native 32 kHz)

The production slave is **very simple** — no PIT ISR, no resampler, no Audio
Library. Just Part::Process + SPI:

| Component | Master | Slave |
|-----------|--------|-------|
| Part::Process(16) | ✅ 5 voices | ✅ 5 voices |
| Ring buffers (32kHz) | ✅ 5 voices | ✅ 5 voices |
| DAC ISR (mix → DAC) | ✅ 5 local + slave stream | ❌ (no DAC) |
| PIT ISR (resample) | ❌ (native 32kHz → DAC) | ❌ not needed |
| Audio Library | ❌ (analog output) | ❌ not needed |
| Reverb | ✅ (on combined mix) | ❌ (master does reverb) |
| USB MIDI | ✅ | ❌ (control via SPI) |
| Voice allocator | ✅ round-robin (0–9) | ❌ (master assigns) |
| SPI master | ✅ (TX control, RX audio) | ❌ |
| SPI slave | ❌ | ✅ (RX control, TX audio) |

**Slave loop()**: render 5 voices → mix into stereo → push to SPI TX ring
buffer. The SPI DMA drains the ring buffer continuously. No ISR needed on
the slave at all — the loop() just keeps the ring buffer filled.

### Slave firmware — Prototype (USB audio, dual-rate)

For the prototype (USB audio testing), the slave also needs a PIT ISR to
resample to 44.1 kHz:

| Component | Master | Slave |
|-----------|--------|-------|
| Part::Process(16) | ✅ 5 voices | ✅ 5 voices |
| Ring buffers (32kHz) | ✅ 5 voices | ✅ 5 voices |
| PIT ISR (resample + mix) | ✅ 5 local + slave stream | ✅ 5 voices → 44.1kHz stereo |
| 44.1 kHz ring buffer | ✅ (to Audio feeder) | ✅ (to SPI TX) |
| Audio Library | ✅ USB output | ❌ not needed |
| Reverb | ✅ (on combined mix) | ❌ (master does reverb) |
| USB MIDI | ✅ | ❌ (control via SPI) |
| Voice allocator | ✅ round-robin (0–9) | ❌ (master assigns) |
| SPI master | ✅ (TX control, RX audio) | ❌ |
| SPI slave | ❌ | ✅ (RX control, TX audio) |

**Slave memory**: same hybrid DTCM/OCRAM layout as master. No Audio Library
saves ~20KB DTCM. No reverb saves 64KB DTCM. No USB saves some RAM.
Estimated: **~60KB more free DTCM, ~20KB more free OCRAM** than master.

### Does the slave need the Audio Library?

**No, in both scenarios.** The slave never produces USB audio.

- **Production**: slave mixes 5 voices at 32 kHz and sends via SPI. No Audio
  Library, no PIT ISR, no resampler. Very simple.
- **Prototype**: slave resamples to 44.1 kHz in its own PIT ISR and sends
  via SPI. Still no Audio Library — the PIT ISR output goes to a ring buffer
  that SPI DMA drains, not to an Audio feeder.

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
| **Complexity** | Low — reuse existing code, add SPI slave driver |
| **Latency** | ~0.4–0.5 ms — imperceptible |
| **Voice count** | 10 (5+5) — doubles capacity |
| **Cost** | ~€25 for second Teensy 4.1 |
| **Development time** | ~1–2 weeks for SPI slave driver + stripped firmware |
| **Risk** | Low — well-understood SPI on Teensy, proven DSP code |
| **Power** | Two Teensies ~0.5W each = 1W total |
| **Size** | Two Teensy boards in one eurorack module (3U × ~8HP) |
| **Analog mixing option** | Even simpler — no audio over SPI, just analog summing |

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

### Phase 0: Decide audio transport method (~1 day)

Evaluate three options for getting slave audio to master:
1. **SPI DMA**: custom framing, moderate complexity, works today.
2. **I²S**: hardware peripheral, simplest framing, needs Teensy I²S slave mode
   investigation.
3. **Analog mixing**: each Teensy → own DAC → external summing. **Simplest
   production path** — no digital audio transport at all. Only SPI for control.

**Recommendation**: start with analog mixing for production (each Teensy has
its own DAC channel on the PCB). For the USB-audio prototype, use SPI DMA
to stream audio back to the master (since there's no DAC yet).

### Phase 1: SPI control transport prototype (~3 days)

1. Create `app-elements-slave` firmware project (stripped-down `app-elements`).
2. Implement SPI slave driver on slave Teensy:
   - RX: framed protocol for NoteOn/NoteOff/CC (reuse existing `SpiFrame`).
3. Implement SPI master control TX on master Teensy:
   - TX: framed protocol for control data.
4. Test: master sends NoteOn/NoteOff via SPI, slave renders and verifies
   audio output (initially via its own USB audio for debugging).

### Phase 2: Audio transport (~1 week)

**For prototype (USB audio)**:
1. Add SPI DMA audio stream from slave → master.
2. Master PIT ISR mixes slave stream with local voices.
3. Test 10-voice polyphony via USB audio.

**For production (analog output)**:
1. Each Teensy outputs to its own DAC channel.
2. External analog summing (opamp or resistor network).
3. Reverb applied to combined analog mix (or digitally on master before DAC).
4. No audio over SPI needed — only control data.

### Phase 3: 10-voice integration (~1 week)

1. Extend voice allocator to 10 voices (0–4 local, 5–9 remote).
2. Test under MIDI load, measure CPU on both Teensies.
3. Verify minSrc stability on both sides.
4. Tune mix levels (5×0.4 per Teensy, analog summing handles the rest).

### Phase 4: Integration with app-modular-brain (~future)

1. Merge DSP slave concept into the existing two-Teensy architecture
   (`doc/tech/two-teensy-spi.md`).
2. One Teensy = CV brain + 5 local voices + reverb + DAC output.
3. Other Teensy = 5 DSP voices + DAC output + SPI slave (control only).
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