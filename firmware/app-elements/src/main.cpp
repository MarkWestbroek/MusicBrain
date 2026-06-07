// MusicBrain — app-elements 5-voice polyphony.
//
// v0.5.4: 5-voice polyphony with hybrid DTCM/OCRAM layout.
// - Part::Process(16) runs in loop() (background, non-ISR)
// - PIT ISR only does resample + mix from pre-rendered 32 kHz ring buffer
// - Audio Library only handles USB output via minimal feeder
// - Part structs in DTCM, delay-line buffers split:
//   stringBuf + resonatorBowBuf + diffuserBuf → DMAMEM (OCRAM)
//   stretchBuf + reverbBuffer → DTCM
//   (OCRAM: 389KB for 5 voices, DTCM: ~168KB extra for stretch+reverb)
//
// Signal path: loop() → 5× Part::Process(16) → 32 kHz ring buffer
//              PIT ISR → resample → mix → 44.1 kHz ring buffer
//              Audio ISR → feeder → reverb → USB audio
// Control:     USB-MIDI noteOn/off → round-robin voice allocator
//
// v0.6.0-attempt: 6 voices tested — minSrc=1-2 (ring buffer starvation).
//   6 × 39% per-voice CPU = 234% total, exceeds 32kHz budget.
//   5 voices is the hard limit for Elements DSP on Teensy 4.1 @ 600MHz.

#include <Arduino.h>
#include <Audio.h>
#include <usb_midi.h>
#include <cmath>
#include <cstring>
#include <LittleFS.h>

#include "FwVersion.h"

#include "elements/dsp/dsp.h"
#include "elements/dsp/part.h"
#include "elements/dsp/fx/reverb.h"

#include "ElementsReverbModule.h"
#include "PatchBank.h"

namespace {

// ---------------------------------------------------------------------------
// 5× Part instances in DTCM (structs only, ~3KB each).
// Large delay-line buffers are in DMAMEM (OCRAM) via VoiceBuffers.
// ---------------------------------------------------------------------------
constexpr int kNumVoices = 5;

elements::Part parts[kNumVoices];
elements::PerformanceState perfState[kNumVoices];

// ---------------------------------------------------------------------------
// Hybrid DTCM/OCRAM delay-line buffers for 5 voices.
// OCRAM (DMAMEM) — large buffers that don't need single-cycle access:
//   stringBuf[5][5][2048]      = 204,800 bytes
//   resonatorBowBuf[5][8][1024] = 163,840 bytes
//   diffuserBuf[5][1024]       =  20,480 bytes
//   OCRAM total: 389,120 bytes (~389KB) — fits in 512KB OCRAM ✅
//
// DTCM — smaller buffers that benefit from single-cycle access:
//   stretchBuf[5][5][1024]    = 102,400 bytes
//   reverbBuffer[32768]       =  65,536 bytes (uint16_t)
//   DTCM extra: 167,936 bytes (~168KB) — DTCM had ~363KB free ✅
// ---------------------------------------------------------------------------
DMAMEM float stringBuf[kNumVoices][5][2048];       // OCRAM: 5 strings × 2048
float stretchBuf[kNumVoices][5][1024];             // DTCM: 5 strings × 1024
DMAMEM float resonatorBowBuf[kNumVoices][8][1024]; // OCRAM: 8 bow modes × 1024
DMAMEM float diffuserBuf[kNumVoices][1024];        // OCRAM: 1 diffuser × 1024

elements::VoiceBuffers voiceBuffers[kNumVoices];

// ---------------------------------------------------------------------------
// Reverb buffer in DTCM (64KB). Moved from OCRAM to free space for 5th voice.
// The FxEngine uses an external pointer, so DTCM placement works fine.
// ---------------------------------------------------------------------------
uint16_t reverbBuffer[32768];

// ---------------------------------------------------------------------------
// 32 kHz ring buffer: loop() writes, PIT ISR reads.
// ---------------------------------------------------------------------------
// Each voice produces stereo (main + aux) at 32 kHz.
// We need enough buffer to cover the worst-case PIT ISR consumption rate.
// PIT ISR consumes ~32000/44100 ≈ 0.726 source samples per output sample.
// At 44.1 kHz, that's ~0.726 × 44100 = 32000 source samples/sec.
// Buffer of 2048 stereo frames = ~64 ms of audio at 32 kHz.
// With non-blocking Serial output (one char per loop()), blocking is ~0
// and 2048 frames is ample. Previous blocking Serial.printf drained 512
// and 2048 and even 4096-frame buffers to 3–16 samples.
constexpr int kSrcRingSize = 2048;

struct SrcStereoSample { float l; float r; };

// Per-voice source ring buffers.
SrcStereoSample srcRing[kNumVoices][kSrcRingSize];
volatile int srcWriteIdx[kNumVoices] = {};
volatile int srcReadIdx[kNumVoices]  = {};

inline int srcRingAvailable(int v) {
    int avail = srcWriteIdx[v] - srcReadIdx[v];
    if (avail < 0) avail += kSrcRingSize;
    return avail;
}

inline void srcRingPush(int v, float l, float r) {
    srcRing[v][srcWriteIdx[v]].l = l;
    srcRing[v][srcWriteIdx[v]].r = r;
    srcWriteIdx[v] = (srcWriteIdx[v] + 1) % kSrcRingSize;
}

inline SrcStereoSample srcRingPop(int v) {
    SrcStereoSample s = srcRing[v][srcReadIdx[v]];
    srcReadIdx[v] = (srcReadIdx[v] + 1) % kSrcRingSize;
    return s;
}

// ---------------------------------------------------------------------------
// 44.1 kHz ring buffer: PIT ISR writes, Audio feeder reads.
// ---------------------------------------------------------------------------
constexpr int kOutRingSize = 256;

struct OutStereoSample { int16_t l; int16_t r; };
OutStereoSample outRing[kOutRingSize];
volatile int outWriteIdx = 0;
volatile int outReadIdx  = 0;

inline int outRingAvailable() {
    int avail = outWriteIdx - outReadIdx;
    if (avail < 0) avail += kOutRingSize;
    return avail;
}

inline void outRingPush(int16_t l, int16_t r) {
    outRing[outWriteIdx].l = l;
    outRing[outWriteIdx].r = r;
    outWriteIdx = (outWriteIdx + 1) % kOutRingSize;
}

inline OutStereoSample outRingPop() {
    OutStereoSample s = outRing[outReadIdx];
    outReadIdx = (outReadIdx + 1) % kOutRingSize;
    return s;
}

// ---------------------------------------------------------------------------
// PIT ISR — resample + mix, one 44.1 kHz sample per interrupt.
// ---------------------------------------------------------------------------
// This ISR is LIGHT: it only does linear interpolation resampling and mixing.
// The heavy Part::Process() work happens in loop() which pre-fills the
// 32 kHz ring buffers. The ISR just reads from those buffers.

volatile uint32_t isrMaxCycles = 0;
volatile uint32_t partProcessMaxCycles = 0;

// Per-voice resampler state.
struct ResamplerState {
    float phase = 0.0f;
    float s0L   = 0.0f;
    float s1L   = 0.0f;
    float s0R   = 0.0f;
    float s1R   = 0.0f;
    static constexpr float kStep = 32000.0f / 44100.0f;
};

ResamplerState rs[kNumVoices];

void pitCallback() {
    uint32_t entry = ARM_DWT_CYCCNT;

    float mixL = 0.0f;
    float mixR = 0.0f;

    for (int v = 0; v < kNumVoices; ++v) {
        // Linear interpolation resampling.
        float yL = rs[v].s0L + (rs[v].s1L - rs[v].s0L) * rs[v].phase;
        float yR = rs[v].s0R + (rs[v].s1R - rs[v].s0R) * rs[v].phase;

        rs[v].phase += ResamplerState::kStep;
        while (rs[v].phase >= 1.0f) {
            rs[v].phase -= 1.0f;
            rs[v].s0L = rs[v].s1L;
            rs[v].s0R = rs[v].s1R;
            // Pull next 32 kHz sample from ring buffer.
            if (srcRingAvailable(v) > 0) {
                SrcStereoSample s = srcRingPop(v);
                rs[v].s1L = s.l;
                rs[v].s1R = s.r;
            } else {
                // Underrun — repeat last sample (causes slight distortion
                // but avoids silence/crackle).
                rs[v].s1L = rs[v].s0L;
                rs[v].s1R = rs[v].s0R;
            }
        }

        if (yL > 1.0f) yL = 1.0f; else if (yL < -1.0f) yL = -1.0f;
        if (yR > 1.0f) yR = 1.0f; else if (yR < -1.0f) yR = -1.0f;

        mixL += yL * 0.4f;  // 5 voices × 0.4 = max 2.0, clipsafe
        mixR += yR * 0.4f;
    }

    if (mixL > 1.0f) mixL = 1.0f; else if (mixL < -1.0f) mixL = -1.0f;
    if (mixR > 1.0f) mixR = 1.0f; else if (mixR < -1.0f) mixR = -1.0f;

    outRingPush(static_cast<int16_t>(mixL * 32767.0f),
               static_cast<int16_t>(mixR * 32767.0f));

    uint32_t exit = ARM_DWT_CYCCNT;
    uint32_t cycles = exit - entry;
    if (cycles > isrMaxCycles) isrMaxCycles = cycles;
}

// ---------------------------------------------------------------------------
// UsbFeeder — minimal AudioStream that reads from the output ring buffer.
// ---------------------------------------------------------------------------
class UsbFeeder : public AudioStream {
public:
    UsbFeeder() : AudioStream(0, nullptr) {}

    void update() override {
        audio_block_t* blockL = allocate();
        audio_block_t* blockR = allocate();
        if (!blockL || !blockR) {
            if (blockL) release(blockL);
            if (blockR) release(blockR);
            return;
        }

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            if (outRingAvailable() > 0) {
                OutStereoSample s = outRingPop();
                blockL->data[i] = s.l;
                blockR->data[i] = s.r;
            } else {
                blockL->data[i] = 0;
                blockR->data[i] = 0;
            }
        }

        transmit(blockL, 0);
        transmit(blockR, 1);
        release(blockL);
        release(blockR);
    }
};

AudioOutputUSB usbOut;
UsbFeeder      feeder;

// Reverb: mmb_link::ElementsReverbStream processes 44.1 kHz stereo blocks.
// Signal path: feeder → reverb → USB output.
mmb_link::ElementsReverbStream reverbStream;
AudioConnection feederToReverbL{ feeder, 0, reverbStream, 0 };
AudioConnection feederToReverbR{ feeder, 1, reverbStream, 1 };
AudioConnection reverbToUsbL{ reverbStream, 0, usbOut, 0 };
AudioConnection reverbToUsbR{ reverbStream, 1, usbOut, 1 };

// Reverb control state.
float reverbAmount    = 0.5f;
float reverbTime      = 0.5f;
float reverbDiffusion = 0.625f;
float reverbLp        = 0.7f;

// ---------------------------------------------------------------------------
// Patch bank (persistent on Teensy program flash via LittleFS).
// CC#102 >= 64 = save new slot, Program Change = recall.
// Serial: p save, p save N, p load N, p delete N, p list, p info, p name N
// ---------------------------------------------------------------------------
PatchBank patchBank;
bool patchSaveLatched = false;
constexpr uint8_t kPatchSaveTriggerCC = 102;

// Capture current voice-0 state into a StoredPatch for saving.
StoredPatch captureCurrentPatch() {
    StoredPatch s = {};
    s.patch = *parts[0].mutable_patch();
    s.modulation = perfState[0].modulation;
    s.reverbAmount = reverbAmount;
    s.reverbTime = reverbTime;
    s.name[0] = '\0';
    return s;
}

// Apply a StoredPatch to all voices and reverb.
void applyStoredPatch(const StoredPatch& s) {
    for (int i = 0; i < kNumVoices; ++i) {
        *parts[i].mutable_patch() = s.patch;
        perfState[i].modulation = s.modulation;
    }
    reverbAmount = s.reverbAmount;
    reverbTime = s.reverbTime;
    reverbStream.setAmount(reverbAmount);
    reverbStream.setTime(reverbTime);
}

// IntervalTimer for 44.1 kHz sample-by-sample output.
IntervalTimer pitTimer;

// ---------------------------------------------------------------------------
// Simple N-voice allocator.
// ---------------------------------------------------------------------------
struct VoiceAlloc {
    uint8_t note = 255;
    bool    gate = false;
};
VoiceAlloc voiceAlloc_[kNumVoices]; // N

constexpr uint8_t kHeartbeatPin = LED_BUILTIN;
uint32_t lastBlinkMs = 0;
uint32_t lastCpuReportMs = 0;
bool ledState = false;

inline float noteToHz(uint8_t note) {
    return 440.0f * powf(2.0f, (static_cast<int>(note) - 69) / 12.0f);
}

void noteOn(uint8_t note, uint8_t velocity) {
    const float strength = velocity / 127.0f;
    const float hz = noteToHz(note);

    for (int i = 0; i < kNumVoices; ++i) {
        if (voiceAlloc_[i].note == note) {
            perfState[i].note     = 69.0f + 12.0f * log2f(hz / 440.0f);
            perfState[i].strength = strength;
            perfState[i].gate     = true;
            // No Serial.printf here — it blocks loop() and causes ring buffer underrun.
            return;
        }
    }

    for (int i = 0; i < kNumVoices; ++i) {
        if (!voiceAlloc_[i].gate) {
            perfState[i].note     = 69.0f + 12.0f * log2f(hz / 440.0f);
            perfState[i].strength = strength;
            perfState[i].gate     = true;
            voiceAlloc_[i].note   = note;
            voiceAlloc_[i].gate   = true;
            return;
        }
    }

    // Steal oldest voice (lowest index that's busy).
    for (int i = 0; i < kNumVoices; ++i) {
        if (voiceAlloc_[i].gate) {
            perfState[i].note     = 69.0f + 12.0f * log2f(hz / 440.0f);
            perfState[i].strength = strength;
            perfState[i].gate     = true;
            voiceAlloc_[i].note   = note;
            voiceAlloc_[i].gate   = true;
            return;
        }
    }
}

void noteOff(uint8_t note) {
    for (int i = 0; i < kNumVoices; ++i) {
        if (voiceAlloc_[i].note == note && voiceAlloc_[i].gate) {
            perfState[i].gate     = false;
            voiceAlloc_[i].gate   = false;
            voiceAlloc_[i].note   = 255;
            return;
        }
    }
}

void handleNoteOn(uint8_t /*ch*/, uint8_t note, uint8_t velocity) {
    if (velocity == 0) { noteOff(note); return; }
    noteOn(note, velocity);
}

void handleNoteOff(uint8_t /*ch*/, uint8_t note, uint8_t /*velocity*/) {
    noteOff(note);
}

void handleControlChange(uint8_t /*ch*/, uint8_t cc, uint8_t value) {
    if (cc == kPatchSaveTriggerCC) {
        if (value >= 64 && !patchSaveLatched) {
            patchBank.saveNew(captureCurrentPatch());
            patchSaveLatched = true;
        } else if (value < 64) {
            patchSaveLatched = false;
        }
        return;
    }

    const float v = value / 127.0f;
    for (int i = 0; i < kNumVoices; ++i) {
        elements::Patch* p = parts[i].mutable_patch();
        switch (cc) {
            case 1:  p->exciter_envelope_shape = v; break;
            case 16: {
                int mode = static_cast<int>(v * 2.0f + 0.5f);
                p->exciter_bow_level    = (mode == 0) ? 0.8f : 0.0f;
                p->exciter_blow_level   = (mode == 1) ? 0.8f : 0.0f;
                p->exciter_strike_level = (mode == 2) ? 0.8f : 0.0f;
                break;
            }
            case 17: p->resonator_geometry   = v; break;
            case 18: p->resonator_brightness = v; break;
            case 19: p->resonator_damping    = v; break;
            case 20: p->resonator_position   = v; break;
            case 21: p->space                = v; break;
            case 22: p->exciter_bow_timbre   = v; break;
            case 23: p->exciter_blow_timbre  = v; break;
            case 24: p->exciter_strike_timbre = v; break;
            case 25: p->exciter_blow_meta    = v; break;
            case 26: p->exciter_strike_meta  = v; break;
            case 27: p->exciter_signature    = v; break;
            case 28: p->resonator_modulation_frequency = (v * 2.0f) / 32000.0f; break;
            case 29: p->resonator_modulation_offset = v; break;
            case 30: perfState[i].modulation = v * 48.0f - 24.0f; break;
        }
    }
    // Reverb controls (CC#31/32) — apply once, not per-voice.
    switch (cc) {
        case 31: reverbAmount = v;    reverbStream.setAmount(v);    break;
        case 32: reverbTime   = v;    reverbStream.setTime(v);      break;
    }
}

void handleProgramChange(uint8_t /*ch*/, uint8_t program) {
    StoredPatch sp;
    if (patchBank.load(program, sp)) {
        applyStoredPatch(sp);
        patchBank.printSlot(program);
    } else {
        Serial.printf("[patch] prog %u out of range (count=%u)\n",
                      static_cast<unsigned>(program + 1),
                      static_cast<unsigned>(patchBank.count()));
    }
}

// ---------------------------------------------------------------------------
// Serial command line buffer + parser (non-blocking).
// Commands: p save, p info, p list, p load N, p save N, p delete N, p name N
// ---------------------------------------------------------------------------
constexpr int kCmdBufSize = 64;
static char cmdBuf[kCmdBufSize];
static int cmdPos = 0;

void processSerialCommand(const char* cmd) {
    if (!patchBank.ready()) {
        Serial.println("[patch] bank not available");
        return;
    }

    if (strcmp(cmd, "p save") == 0) {
        patchBank.saveToSlot(patchBank.currentSlot(), captureCurrentPatch());
        return;
    }

    if (strcmp(cmd, "p info") == 0) {
        patchBank.printInfo();
        return;
    }

    if (strcmp(cmd, "p list") == 0) {
        patchBank.printList();
        return;
    }

    unsigned n = 0;
    if (sscanf(cmd, "p load %u", &n) == 1) {
        if (n == 0) { Serial.println("[patch] use prog 1 for first slot"); return; }
        StoredPatch sp;
        uint16_t slot = static_cast<uint16_t>(n - 1);
        if (patchBank.load(slot, sp)) {
            applyStoredPatch(sp);
            patchBank.printSlot(slot);
        } else {
            Serial.printf("[patch] prog %u out of range (count=%u)\n",
                          static_cast<unsigned>(n),
                          static_cast<unsigned>(patchBank.count()));
        }
        return;
    }

    if (sscanf(cmd, "p save %u", &n) == 1) {
        if (n == 0) { Serial.println("[patch] use prog 1 for first slot"); return; }
        patchBank.saveToSlot(static_cast<uint16_t>(n - 1), captureCurrentPatch());
        return;
    }

    if (sscanf(cmd, "p delete %u", &n) == 1) {
        if (n == 0) { Serial.println("[patch] use prog 1 for first slot"); return; }
        patchBank.remove(static_cast<uint16_t>(n - 1));
        return;
    }

    // p name N <text>
    unsigned nameProg = 0;
    char nameBuf[32];
    if (sscanf(cmd, "p name %u %31[^\n]", &nameProg, nameBuf) >= 1) {
        if (nameProg == 0) { Serial.println("[patch] use prog 1"); return; }
        if (sscanf(cmd, "p name %u %*s", &nameProg) == 1) {
            patchBank.setName(static_cast<uint16_t>(nameProg - 1), nameBuf);
        } else {
            patchBank.clearName(static_cast<uint16_t>(nameProg - 1));
        }
        return;
    }

    Serial.println("[patch] unknown. Try: p save, p info, p list, p load N, p save N, p delete N, p name N <text>");
}

void pollSerialCommands() {
    while (Serial.available() > 0) {
        char c = static_cast<char>(Serial.read());
        if (c == '\n' || c == '\r') {
            if (cmdPos > 0) {
                cmdBuf[cmdPos] = '\0';
                processSerialCommand(cmdBuf);
                cmdPos = 0;
            }
        } else if (c == '\b' || c == 0x7F) {
            if (cmdPos > 0) cmdPos--;
        } else if (cmdPos < kCmdBufSize - 1) {
            cmdBuf[cmdPos++] = c;
        }
    }
}

// ---------------------------------------------------------------------------
// Background rendering — runs in loop(), pre-fills 32 kHz ring buffers.
// ---------------------------------------------------------------------------
// Each Part::Process(16) call produces 16 stereo samples at 32 kHz.
// We keep the ring buffers filled so the PIT ISR never underruns.

void renderBackground() {
    static const float kSilence[elements::kMaxBlockSize] = {};

    for (int v = 0; v < kNumVoices; ++v) {
        // Only render if the ring buffer has room for at least 16 samples.
        // (kSrcRingSize - srcRingAvailable(v)) gives free space.
        int freeSpace = kSrcRingSize - srcRingAvailable(v);
        if (freeSpace >= static_cast<int>(elements::kMaxBlockSize)) {
            float main[elements::kMaxBlockSize];
            float aux[elements::kMaxBlockSize];
            uint32_t pt0 = ARM_DWT_CYCCNT;
            parts[v].Process(perfState[v], kSilence, kSilence,
                             main, aux, elements::kMaxBlockSize);
            uint32_t pt1 = ARM_DWT_CYCCNT;
            uint32_t partCycles = pt1 - pt0;
            if (partCycles > partProcessMaxCycles) partProcessMaxCycles = partCycles;
            for (size_t i = 0; i < elements::kMaxBlockSize; ++i) {
                srcRingPush(v, main[i], aux[i]);
            }
        }
    }
}

}  // namespace

void setup() {
    pinMode(kHeartbeatPin, OUTPUT);
    Serial.begin(115200);
    uint32_t t0 = millis();
    while (!Serial && (millis() - t0) < 1500) { /* spin briefly */ }
    Serial.printf("[boot] app-elements 5-voice hybrid %s online\n", FW_VERSION);
    Serial.printf("[boot] CPU @ %lu MHz\n",
                  static_cast<unsigned long>(F_CPU_ACTUAL / 1000000));
    if (CrashReport) {
        Serial.println("[boot] *** previous run crashed — CrashReport follows ***");
        Serial.print(CrashReport);
        Serial.println("[boot] *** end CrashReport ***");
    }

    // Enable ARM cycle counter for CPU measurement.
    ARM_DEMCR |= ARM_DEMCR_TRCENA;
    ARM_DWT_CTRL |= ARM_DWT_CTRL_CYCCNTENA;

    // Wire up VoiceBuffers: point each VoiceBuffers struct to the
    // DMAMEM (OCRAM) float arrays for that voice.
    for (int v = 0; v < kNumVoices; ++v) {
        for (int s = 0; s < 5; ++s) {
            voiceBuffers[v].string_buf[s]   = stringBuf[v][s];
            voiceBuffers[v].stretch_buf[s]   = stretchBuf[v][s];
        }
        for (int b = 0; b < 8; ++b) {
            voiceBuffers[v].resonator_bow_buf[b] = resonatorBowBuf[v][b];
        }
        voiceBuffers[v].diffuser_buf = diffuserBuf[v];
    }

    // Initialise Parts with OCRAM buffers.
    for (int i = 0; i < kNumVoices; ++i) {
        parts[i].Init(&voiceBuffers[i]);
    }

    // Flush D-Cache: Init() wrote to DMAMEM (OCRAM) buffers via the cache.
    // The Cortex-M7 D-Cache must be flushed so that subsequent reads from
    // OCRAM (e.g. during Part::Process in loop()) see the initialized data.
    // arm_dcache_flush_delete() pushes dirty cache lines to physical RAM
    // and invalidates them, forcing fresh reads from physical OCRAM.
    arm_dcache_flush_delete(reinterpret_cast<void*>(stringBuf),
                            sizeof(stringBuf));
    // stretchBuf is in DTCM — no D-Cache flush needed.
    arm_dcache_flush_delete(reinterpret_cast<void*>(resonatorBowBuf),
                            sizeof(resonatorBowBuf));
    arm_dcache_flush_delete(reinterpret_cast<void*>(diffuserBuf),
                            sizeof(diffuserBuf));

    // Initialise reverb: 64KB buffer in DTCM — no D-Cache flush needed.
    reverbStream.begin(reverbBuffer);
    reverbStream.setAmount(reverbAmount);
    reverbStream.setTime(reverbTime);
    reverbStream.setDiffusion(reverbDiffusion);
    reverbStream.setLp(reverbLp);

    // Initialize persistent patch storage and restore current slot if present.
    if (patchBank.begin() && patchBank.count() > 0) {
        StoredPatch sp;
        if (patchBank.load(patchBank.currentSlot(), sp)) {
            applyStoredPatch(sp);
        }
    }

    for (auto& ps : perfState) {
        ps.gate       = false;
        ps.note       = 69.0f;
        ps.modulation = 0.0f;
        ps.strength   = 0.8f;
    }

    // Audio library: minimal — just USB output + feeder.
    AudioMemory(20);

    // Pre-fill the 32 kHz ring buffers before starting the PIT timer.
    // This ensures the ISR has data from the very first sample.
    for (int fill = 0; fill < 32; ++fill) {  // 32 × 16 = 512 samples per voice
        renderBackground();
    }

    // Start PIT timer for 44.1 kHz sample-by-sample output.
    pitTimer.begin(pitCallback, 1000000.0f / 44100.0f);

    usbMIDI.setHandleNoteOn(handleNoteOn);
    usbMIDI.setHandleNoteOff(handleNoteOff);
    usbMIDI.setHandleControlChange(handleControlChange);
    usbMIDI.setHandleProgramChange(handleProgramChange);

    Serial.println("[boot] 5-voice hybrid + reverb ready. Part in loop(), resample in ISR.");
    Serial.println("[boot] stringBuf+resonatorBowBuf+diffuserBuf in OCRAM, stretchBuf+reverb in DTCM.");
    Serial.println("[boot] Reverb: CC#31=amount, CC#32=time.");
    Serial.println("[boot] Patch bank: CC#102>=64 saves new slot, Program Change recalls. Serial: p save, p info, p list, p load N, p save N, p delete N, p name N <text>");
    Serial.println("[boot] Hold 5 notes to test polyphony.");
}

// Non-blocking Serial output: format the CPU report into a static buffer,
// then drain one character per loop() iteration via Serial.write().
// Serial.printf() blocks for ~25 ms on USB CDC, which drains the ring
// buffers to 3–16 samples. Serial.write() of one byte is non-blocking
// (USB CDC TX buffer is 64 bytes). This keeps the loop() responsive.
static char cpuReportBuf[128];
static int cpuReportLen = 0;
static int cpuReportPos = 0;

void loop() {
    // Background rendering: keep the 32 kHz ring buffers filled.
    // This is the TOP priority — always render before anything else.
    renderBackground();

    // MIDI input.
    while (usbMIDI.read()) { /* drain */ }

    // Render again after MIDI processing (MIDI may have changed perfState).
    renderBackground();

    // Serial commands (p save / p list / p load N / p delete N).
    pollSerialCommands();

    // Track peak loop() cycles for CPU report.
    // (Not wrapping in ARM_DWT_CYCCNT to avoid overhead — the per-voice
    // partProcessMaxCycles already gives the key metric.)

    const uint32_t now = millis();

    // CPU report every 10 seconds: format into buffer, drain non-blocking.
    if (now - lastCpuReportMs >= 10000 && cpuReportLen == 0) {
        lastCpuReportMs = now;
        float isrPct = static_cast<float>(isrMaxCycles) * 100.0f /
                       (F_CPU_ACTUAL / 44100.0f);
        float partPct = static_cast<float>(partProcessMaxCycles) * 100.0f /
                       (F_CPU_ACTUAL / 32000.0f * 16);
        // Find minimum ring buffer level across all voices.
        int minSrc = kSrcRingSize;
        for (int v = 0; v < kNumVoices; ++v) {
            int avail = srcRingAvailable(v);
            if (avail < minSrc) minSrc = avail;
        }
        cpuReportLen = snprintf(cpuReportBuf, sizeof(cpuReportBuf),
                                "[cpu] ISR=%.1f%% part=%.1f%% minSrc=%d\n",
                                isrPct, partPct, minSrc);
        cpuReportPos = 0;
        isrMaxCycles = 0;
        partProcessMaxCycles = 0;
    }

    // Drain one character per loop() iteration (non-blocking).
    if (cpuReportPos < cpuReportLen) {
        Serial.write(cpuReportBuf[cpuReportPos++]);
        if (cpuReportPos >= cpuReportLen) {
            cpuReportLen = 0;  // Done — ready for next report.
        }
    }

    if (now - lastBlinkMs >= 500) {
        lastBlinkMs = now;
        ledState = !ledState;
        digitalWrite(kHeartbeatPin, ledState ? HIGH : LOW);
    }
}
