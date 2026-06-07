# app-elements — Mutable Instruments *Elements* 5-voice polyphonic port

Dedicated Teensy 4.1 app for the open-source (MIT) **Elements** modal /
physical-modelling voice, running **5 voices polyphonic** with dual-thread
rendering and hybrid DTCM/OCRAM memory layout.

## Architecture

### Dual-thread rendering

The original Audio Library approach (v0.1–v0.2) caused audio crackling with
2+ voices because `Part::Process()` (heavy DSP: 64 Svf filters, 5
Karplus-Strong strings) ran inside the Audio ISR. The dual-thread pattern
splits the work:

- **loop() (background)**: calls `Part::Process(16)` for each voice, writes
  stereo samples into per-voice 32 kHz ring buffers (2048 frames ≈ 64 ms).
- **PIT ISR (44.1 kHz)**: lightweight — only linear-interpolation resample +
  mix from the pre-rendered ring buffers. ISR CPU: **4.2%** for 5 voices.
- **Audio Library**: minimal `UsbFeeder` reads from a 44.1 kHz output ring
  buffer, feeds through `ElementsReverbStream` → `AudioOutputUSB`.

### Hybrid DTCM/OCRAM memory layout

C++ objects with vtables/internal pointers **crash** in OCRAM (DACCVIOL at
nullptr 0x4). The fix: Part structs (~3 KB each) in DTCM, delay-line buffers
split between OCRAM and DTCM via `VoiceBuffers` pointer indirection:

| Region | Contents | Size |
|--------|----------|------|
| **DTCM** | Part structs (5×3 KB), stretchBuf (5×20 KB), reverbBuffer (64 KB), ring buffers (5×16 KB), Audio lib, stack | ~280 KB |
| **OCRAM** | stringBuf (5×40 KB), resonatorBowBuf (5×32 KB), diffuserBuf (5×4 KB), Audio block pool | ~389 KB |
| **FLASH** | Code + lookup tables (~380 KB) | ~470 KB |

After `Part::Init()`, `arm_dcache_flush_delete()` ensures cache coherency for
OCRAM buffer regions. `stretchBuf` and `reverbBuffer` are in DTCM — no flush
needed.

### Non-blocking Serial output

`Serial.printf()` on Teensy 4.1 USB CDC blocks the loop() for **~25 ms** per
call, which drains ring buffers to 3–16 samples regardless of buffer size
(512, 2048, or 4096 frames). The fix (v0.5.4): format the CPU report into a
static buffer, drain **one character per loop() iteration** via
`Serial.write()`. This keeps the loop() responsive and ring buffers stable at
> 2000 frames.

## CPU budget (measured on hardware)

| Component | Idle | Under MIDI Load |
|-----------|------|-----------------|
| PIT ISR (resample + mix 5 voices) | 4.2% | 4.1–4.4% |
| Part::Process per voice (peak) | 38.5% | 40–42% |
| Ring buffer min level (2048 frames) | 2030 | 2019–2035 |
| `-O3` optimization | no improvement | — |

The loop() can do ~5,128 Part::Process calls/sec, producing ~81,920 samples/sec
per voice — far exceeding the ISR consumption rate of ~32,000 samples/sec.

## DSP source

The genuine upstream Mutable Instruments **Elements** DSP (MIT, © Emilie Gillet)
is vendored byte-exact under [lib/mi-elements/](lib/mi-elements/) (see its
`VENDORED.md` for provenance). Key vendored modifications for pointer-indirected
delay-line buffers:

| File | Change |
|------|--------|
| `stmlib/dsp/delay_line.h` | `T line_[max_delay]` → `T* line_` (pointer). Added `Init(T* external_buffer)` overload. |
| `elements/dsp/string.h/.cc` | `Init(bool, float* string_buf, float* stretch_buf)` — accepts external buffers. |
| `elements/dsp/resonator.h/.cc` | `Init(float** bow_bufs)` — accepts external bow delay-line buffer pointers. |
| `elements/dsp/voice.h/.cc` | Added `VoiceBuffers` struct. `Init(const VoiceBuffers*)` passes buffers down. |
| `elements/dsp/part.h/.cc` | `Init(const VoiceBuffers*)` — passes buffers to `voice_[i].Init(buffers)`. |

## MIDI control

| CC# | Parameter | Range |
|-----|-----------|-------|
| 1 | Exciter envelope shape | 0–1 |
| 16 | Exciter mode (bow/blow/strike) | 0=bow, 1=blow, 2=strike |
| 17 | Resonator geometry | 0–1 |
| 18 | Resonator brightness | 0–1 |
| 19 | Resonator damping | 0–1 |
| 20 | Resonator position | 0–1 |
| 21 | Space | 0–1 |
| 22–27 | Exciter timbre/meta/signature | 0–1 |
| 28 | Resonator modulation frequency | 0–2/32k |
| 29 | Resonator modulation offset | 0–1 |
| 30 | Performance modulation | ±24 |
| **31** | **Reverb amount** | **0–1** |
| **32** | **Reverb time** | **0–1** |
| **102** | **Patch save trigger** | **value ≥ 64 saves current patch to next slot** |

Program Change (0–127) recalls patch slot 0–127.

### Patch bank MVP (v0.5.5)

- Persistent storage via Teensy LittleFS program flash (`patchbank.bin`)
- 128 slots (`elements::Patch` + perf modulation + reverb amount/time)
- Save trigger is edge-detected: CC#102 only saves when crossing to `>= 64`
- Program Change recalls a stored slot immediately

Serial boot examples:
- `[patch] loaded bank: count=... next=... current=...`
- `[patch] saved slot N (count=M)`
- `[patch] recalled slot N`

Note-on/off uses a simple round-robin allocator with voice stealing (lowest
index).

## Build / flash / monitor

```powershell
# from repo root
.\.venv\Scripts\pio.exe run -d firmware\app-elements
# flash (disconnect editor serial first):
.\.venv\Scripts\pio.exe run -d firmware\app-elements -t upload
# monitor (115200 baud, CPU report every 10 s):
.\.venv\Scripts\pio.exe device monitor -d firmware\app-elements --baud 115200
```

## Version history

| Version | Voices | Key change | Status |
|---------|--------|------------|--------|
| 0.1.0 | 1 | Audio Library ISR, single voice | ✅ works |
| 0.2.0 | 2 | Audio Library ISR, 2 voices | ❌ crackling |
| 0.2.2 | 2 | Dual-thread (Part in loop) | ✅ clean, 2.5% ISR |
| 0.3.0 | 4 | DMAMEM Part in OCRAM | ❌ DACCVIOL crash |
| 0.3.1 | 3 | Part in DTCM (fallback) | ✅ 3.1% ISR |
| 0.4.0 | 4 | DTCM Part + OCRAM buffers (VoiceBuffers) | ✅ 3.8% ISR |
| 0.4.1 | 4 | + reverb (CC#31/32) | ✅ 3.8% ISR |
| 0.5.0 | 5 | Hybrid DTCM/OCRAM (stretchBuf+reverb→DTCM) | ❌ Serial blocks |
| 0.5.1–0.5.3 | 5 | Various Serial/blocking fixes | ❌ still blocks ~25 ms |
| **0.5.4** | **5** | **Non-blocking Serial.write (1 char/iter)** | **✅ stable** |
| **0.5.5** | **5** | **Patch bank MVP (LittleFS + Program Change recall + CC#102 save)** | **✅ persistent presets** |
| 0.6.0-attempt | 6 | 6-voice test | ❌ minSrc=1-2, CPU 234% |

## 6-voice test result (v0.6.0-attempt)

Memory: 6 voices fits (OCRAM ~467 KB / ~34 KB free, DTCM ~397 KB / ~60 KB free).
CPU: **FAILS** — minSrc=1-2 (ring buffer starvation). ISR=5.1%, part=39% per voice.
6 × 39% per-voice peak = 234% total CPU, exceeds the 32 kHz rendering budget.
The loop() cannot fill 6 ring buffers faster than the ISR drains them.

**5 voices is the hard limit** for Elements DSP on Teensy 4.1 @ 600 MHz.

## Remaining work

1. Integrate `tp_mmb_elements` into `app-modular-brain` (delete local
   `AudioModule.h` copy, reuse shared mixin).
2. Down-sample external `blow_in` / `strike_in` audio inputs into Part
   (currently silence — only internal exciters active).
3. Add SysEx patch dump/load (full editor round-trip, backup/restore).
4. Add per-voice CC control (currently all voices share same CC values).

## Documentation

- [Architecture & ADRs](../../doc/elements/architecture.md) — detailed memory
  layouts, CPU measurements, decision records.
- [Scaling beyond 5 voices](../../doc/elements/scaling-polyphony-beyond-5-voices.md) —
  dual-Teensy vs. FPGA sidecar analysis, implementation plan.
- [Vendored DSP](lib/mi-elements/VENDORED.md) — provenance, file list,
  Teensy adaptations.
