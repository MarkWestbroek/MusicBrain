// MusicBrain — app-elements SPIKE, 3-voice polyphony test.
//
// v0.3.1: 3-voice polyphony with dual-thread rendering.
// - Part::Process(16) runs in loop() (background, non-ISR)
// - PIT ISR only does resample + mix from pre-rendered 32 kHz ring buffer
// - Audio Library only handles USB output via minimal feeder
// - Parts in DTCM (DMAMEM/OCRAM crashes with DACCVIOL — C++ vtable issue)
//
// Signal path: loop() → 2× Part::Process(16) → 32 kHz ring buffer
//              PIT ISR → resample → mix → 44.1 kHz ring buffer
//              Audio ISR → feeder → USB audio
// Control:     USB-MIDI noteOn/off → round-robin voice allocator

#include <Arduino.h>
#include <Audio.h>
#include <usb_midi.h>
#include <cmath>

#include "FwVersion.h"

#include "elements/dsp/dsp.h"
#include "elements/dsp/part.h"

namespace {

// ---------------------------------------------------------------------------
// 4× Part instances in DMAMEM (OCRAM) — too large for DTCM.
// 4× ~107KB = ~428KB. DTCM has ~184KB free after stack/code.
// OCRAM has ~425KB free — fits perfectly.
// ---------------------------------------------------------------------------
constexpr int kNumVoices = 3;

// 3× Part instances in normal RAM (DTCM).
// 3× ~107KB = ~321KB. DTCM has ~426KB free after code/stack.
// DMAMEM (OCRAM) doesn't work for C++ objects with vtables/constructors
// because the D-Cache coherency issue causes DACCVIOL crashes.
// 4 voices would need ~428KB which exceeds DTCM — we'll need to
// extract large delay-line buffers to OCRAM separately for that.
elements::Part parts[kNumVoices];
elements::PerformanceState perfState[kNumVoices];

// ---------------------------------------------------------------------------
// 32 kHz ring buffer: loop() writes, PIT ISR reads.
// ---------------------------------------------------------------------------
// Each voice produces stereo (main + aux) at 32 kHz.
// We need enough buffer to cover the worst-case PIT ISR consumption rate.
// PIT ISR consumes ~32000/44100 ≈ 0.726 source samples per output sample.
// At 44.1 kHz, that's ~0.726 × 44100 = 32000 source samples/sec.
// Buffer of 256 stereo frames = ~8 ms of audio at 32 kHz.
constexpr int kSrcRingSize = 512;

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

        mixL += yL * 0.5f;  // 4 voices × 0.5 = max 2.0, clipsafe
        mixR += yR * 0.5f;
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
AudioConnection feederToUsbL{ feeder, 0, usbOut, 0 };
AudioConnection feederToUsbR{ feeder, 1, usbOut, 1 };

// IntervalTimer for 44.1 kHz sample-by-sample output.
IntervalTimer pitTimer;

// ---------------------------------------------------------------------------
// Simple 2-voice allocator.
// ---------------------------------------------------------------------------
struct VoiceAlloc {
    uint8_t note = 255;
    bool    gate = false;
};
VoiceAlloc voiceAlloc_[kNumVoices];

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
            Serial.printf("[poly] re-trigger note=%u on voice=%d\n", note, i);
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
            Serial.printf("[poly] note=%u → voice=%d\n", note, i);
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
            Serial.printf("[poly] steal note=%u → voice=%d\n", note, i);
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
            parts[v].Process(perfState[v], kSilence, kSilence,
                             main, aux, elements::kMaxBlockSize);
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
    Serial.printf("[boot] app-elements 3-voice dual-thread %s online\n", FW_VERSION);
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

    // Initialise Parts.
    for (auto& p : parts) p.Init();
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
    for (int fill = 0; fill < 4; ++fill) {  // 4 × 16 = 64 samples per voice
        renderBackground();
    }

    // Start PIT timer for 44.1 kHz sample-by-sample output.
    pitTimer.begin(pitCallback, 1000000.0f / 44100.0f);

    usbMIDI.setHandleNoteOn(handleNoteOn);
    usbMIDI.setHandleNoteOff(handleNoteOff);
    usbMIDI.setHandleControlChange(handleControlChange);

    Serial.println("[boot] 3-voice dual-thread ready. Part in loop(), resample in ISR.");
    Serial.println("[boot] Hold 3 notes to test polyphony.");
}

void loop() {
    // Background rendering: keep the 32 kHz ring buffers filled.
    // This is the TOP priority — always render before anything else.
    renderBackground();

    // MIDI input.
    while (usbMIDI.read()) { /* drain */ }

    // Render again after MIDI processing (MIDI may have changed perfState).
    renderBackground();

    const uint32_t now = millis();

    // CPU report every 5 seconds (less Serial = less blocking).
    if (now - lastCpuReportMs >= 5000) {
        lastCpuReportMs = now;
        float cpuPct = static_cast<float>(isrMaxCycles) * 100.0f /
                       (F_CPU_ACTUAL / 44100.0f);
        Serial.printf("[cpu] ISR=%.1f%% src=[%d,%d,%d]\n",
                      cpuPct, srcRingAvailable(0), srcRingAvailable(1),
                      srcRingAvailable(2));
        isrMaxCycles = 0;
    }

    if (now - lastBlinkMs >= 500) {
        lastBlinkMs = now;
        ledState = !ledState;
        digitalWrite(kHeartbeatPin, ledState ? HIGH : LOW);
    }
}
