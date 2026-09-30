#pragma once
/**
 * @file WarpsModule.h
 * @brief Mutable Instruments *Warps* meta-modulator (typeId `tp_mmb_warps`).
 *
 * @details
 * Wrapper rond de gevendorde Warps-`Modulator` (`firmware/lib/mi-warps`,
 * MIT, (c) Emilie Gillet): twee audio-ingangen worden door elkaar gevouwen
 * met een morphende algoritme-knop — xfade, wavefolder, analoge/digitale
 * ringmod, XOR, comparator, spectraal, morph en een **vocoder**. Draait
 * **native op 44.1 kHz**: `Modulator::Init()` neemt de sample rate en
 * oversampled intern zelf waar nodig — geen resampler (anders dan Clouds).
 *
 * De carrier (ingang 1) kan vervangen worden door de interne oscillator
 * (`shape` 1–5: sin/tri/saw/puls/ruis-LP), bespeelbaar via `voct` — dan is
 * Warps zelf een stem met ingang 2 als modulator (vocoder op je eigen stem!).
 *
 * Port map:
 * | Dir | portId | Kind  | Betekenis                                     |
 * |-----|--------|-------|-----------------------------------------------|
 * | in  | `in1`  | Audio | Carrier (extern; genegeerd bij interne osc)   |
 * | in  | `in2`  | Audio | Modulator                                     |
 * | in  | `voct` | Cv    | Interne-oscillator-pitch (1 V/oct rond C4)    |
 * | in  | `algo`/`algo_cv`, `timbre`/`timbre_cv` | Cv | modulatie        |
 * | out | `out`  | Audio | Hoofduitgang (1+2)                            |
 * | out | `aux`  | Audio | Aux-uitgang (2+1 — omgekeerde rol)            |
 *
 * **Algo-schaal.** De knop loopt 0..8 en morpht tussen de algoritmes; de
 * Warps-kern zelf wil 0..1, dus de module deelt door 8 (tot fw 0.5.90 ging
 * de 0..8 ongeschaald de kern in: alles vanaf 1 was dezelfde *bevroren*
 * vocoder, en de vocoder volgde de modulator dus nooit).
 *   0 crossfade · 1 fold · 2 analoge ringmod · 3 digitale ringmod · 4 XOR ·
 *   5 comparator · 5,6–6 overgang · **6–8 vocoder**, waarbij de positie de
 *   release van de banden is: 6 = snel (spraak verstaanbaar), 7 = traag,
 *   8 = bevroren (de klinker blijft staan).
 * Timbre is in de vocoder de formantverschuiving; 0,5 = zuiver vocoderen,
 * daarbuiten lekt er ook drager langs de banden.
 *
 * **Blokgrootte.** De filterbank van de vocoder decimeert intern ÷3 en ÷12
 * en rekent dus alleen goed op blokken die een veelvoud van 12 zijn (Warps
 * zelf: 60). Een Teensy-audioblok is 128 en dat is geen veelvoud van 12:
 * tot fw 0.5.90 ging het in twee halve blokken van 64 de kern in, en gaf de
 * vocoder op de hardware NaN — exact stilte. Nu loopt alles door een kleine
 * FIFO in brokken van 60, met 60 samples (1,4 ms) vaste vertraging.
 *
 * **Shape in de vocoder.** De vocoder kiest zijn interne drager als
 * `shape + 1` (zaag/puls/ruis), dus alleen shape 1..3 bestaat daar; 4 en 5
 * wijzen buiten de tabel. In het vocoder-gebied (algo > 5,4) klemt de module
 * shape daarom op 3.
 *
 * Controls: `algo` (0..8, zie boven), `timbre` (0..1),
 * `shape` (0=extern, 1..5 interne carrier), `drive1`/`drive2` (0..2),
 * `coarse` (semitonen offset interne osc), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <new>
#include <string_view>

// Gevendorde upstream Warps-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-warps.
#include "warps/dsp/modulator.h"

namespace mmb_link {

/** @brief Warps Modulator als AudioStream (2 in, 2 uit, 44.1 kHz native). */
class WarpsVoice : public AudioStream {
public:
    WarpsVoice() : AudioStream(2, inputQueueArray_) {
        modulator_.Init(AUDIO_SAMPLE_RATE_EXACT);
        auto* p = modulator_.mutable_parameters();
        p->channel_drive[0] = 1.0f;
        p->channel_drive[1] = 1.0f;
        p->modulation_algorithm = 0.0f;
        p->modulation_parameter = 0.5f;
        p->carrier_shape = 0;
        p->note = 48.0f;
        p->frequency_shift_pot = 0.0f;
        p->frequency_shift_cv  = 0.0f;
        p->phase_shift = 0.0f;
        ready_ = true;
    }

    warps::Parameters* params() { return modulator_.mutable_parameters(); }
    bool ready() const { return ready_; }
    float takePeak() {
        const float p = peak_;
        peak_ = 0.0f;
        return p * (1.0f / 32768.0f);
    }
    void setLevel(float v) { level_ = v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }

    void update() override {
        if (!ready_) return;
        audio_block_t* in1 = receiveReadOnly(0);
        audio_block_t* in2 = receiveReadOnly(1);
        audio_block_t* outM = allocate();
        audio_block_t* outA = allocate();
        if (!outM || !outA) {
            if (outM) release(outM);
            if (outA) release(outA);
            if (in1) release(in1);
            if (in2) release(in2);
            return;
        }

        // Invoer achteraan de FIFO; dan in brokken van kChunk door de kern.
        // Invariant na elke update: inCount_ + outCount_ == kChunk, dus de
        // buffers van kChunk + AUDIO_BLOCK_SAMPLES lopen nooit over en er
        // staan altijd genoeg samples klaar (rest van 128 mod 60 is ≤ 56).
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            inFifo_[inCount_ + i].l = in1 ? in1->data[i] : 0;
            inFifo_[inCount_ + i].r = in2 ? in2->data[i] : 0;
        }
        inCount_ += AUDIO_BLOCK_SAMPLES;
        int done = 0;
        while (inCount_ - done >= kChunk) {
            modulator_.Process(inFifo_ + done, outFifo_ + outCount_, kChunk);
            done += kChunk;
            outCount_ += kChunk;
        }
        inCount_ -= done;
        if (done && inCount_ > 0)
            std::memmove(inFifo_, inFifo_ + done, sizeof(inFifo_[0]) * inCount_);

        const warps::ShortFrame* outF = outFifo_;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float m = outF[i].l * level_;
            float a = outF[i].r * level_;
            if (m >  32767.0f) m =  32767.0f; else if (m < -32768.0f) m = -32768.0f;
            if (a >  32767.0f) a =  32767.0f; else if (a < -32768.0f) a = -32768.0f;
            const float absM = m < 0.0f ? -m : m;
            if (absM > peak_) peak_ = absM;
            outM->data[i] = static_cast<int16_t>(m);
            outA->data[i] = static_cast<int16_t>(a);
        }
        outCount_ -= AUDIO_BLOCK_SAMPLES;
        if (outCount_ > 0)
            std::memmove(outFifo_, outFifo_ + AUDIO_BLOCK_SAMPLES,
                         sizeof(outFifo_[0]) * outCount_);

        transmit(outM, 0);
        transmit(outA, 1);
        release(outM);
        release(outA);
        if (in1) release(in1);
        if (in2) release(in2);
    }

private:
    /// Brok waarin de kern rekent: veelvoud van 12 (filterbank ÷3 en ÷12),
    /// en Warps' eigen blokgrootte.
    static constexpr int kChunk = 60;
    static constexpr int kFifo  = kChunk + AUDIO_BLOCK_SAMPLES;
    static_assert(AUDIO_BLOCK_SAMPLES >= kChunk, "FIFO rekent op blok >= brok");

    audio_block_t* inputQueueArray_[2] = { nullptr, nullptr };
    warps::ShortFrame inFifo_[kFifo]  = {};
    warps::ShortFrame outFifo_[kFifo] = {};
    int inCount_  = 0;
    int outCount_ = kChunk;      ///< kChunk stilte vooraf = de vaste vertraging
    warps::Modulator modulator_;
    volatile bool  ready_ = false;
    volatile float peak_  = 0.0f;
    float level_ = 0.8f;
};

/** @brief Module-wrapper rond @ref WarpsVoice. */
class WarpsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_warps";

    /// Genulde allocatie — MI-DSP rekent op BSS-genulde staat (zie Elements).
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit WarpsModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    WarpsVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l")
            return { const_cast<WarpsVoice*>(&voice_), 0, true };
        if (portId == "aux" || portId == "out_r")
            return { const_cast<WarpsVoice*>(&voice_), 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in1" || portId == "in" || portId == "carrier")
            return { const_cast<WarpsVoice*>(&voice_), 0, true };
        if (portId == "in2" || portId == "modulator")
            return { const_cast<WarpsVoice*>(&voice_), 1, true };
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" ||
                portId == "aux" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (cvPortIs(portId, "algo") || cvPortIs(portId, "timbre"))
            return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        auto* p = voice_.params();
        if (portId == "voct") {
            voct_ = value;
            p->note = 60.0f + 12.0f * voct_ + coarse_;
        } else if (cvPortIs(portId, "algo")) {
            // ±1 CV schuift ±4 algoritmes bovenop de knop.
            float a = algoBase_ + 4.0f * value;
            if (a < 0.0f) a = 0.0f;
            if (a > 8.0f) a = 8.0f;
            p->modulation_algorithm = a * kAlgoScale;
            applyShape(a);
        } else if (cvPortIs(portId, "timbre")) {
            float t = timbreBase_ + value;
            if (t < 0.0f) t = 0.0f;
            if (t > 1.0f) t = 1.0f;
            p->modulation_parameter = t;
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        auto* p = voice_.params();
        if (controlId == "algo") {
            algoBase_ = asFloat(0.0f);
            if (algoBase_ < 0.0f) algoBase_ = 0.0f;
            if (algoBase_ > 8.0f) algoBase_ = 8.0f;
            p->modulation_algorithm = algoBase_ * kAlgoScale;
            applyShape(algoBase_);
        }
        else if (controlId == "timbre") {
            timbreBase_ = asFloat(0.5f);
            if (timbreBase_ < 0.0f) timbreBase_ = 0.0f;
            if (timbreBase_ > 1.0f) timbreBase_ = 1.0f;
            p->modulation_parameter = timbreBase_;
        }
        else if (controlId == "shape") {
            int sh = static_cast<int>(asFloat(0.0f));
            if (sh < 0) sh = 0;
            if (sh > 5) sh = 5;
            shape_ = sh;
            applyShape(p->modulation_algorithm * 8.0f);
        }
        else if (controlId == "drive1") p->channel_drive[0] = clamp02(asFloat(1.0f));
        else if (controlId == "drive2") p->channel_drive[1] = clamp02(asFloat(1.0f));
        else if (controlId == "coarse") {
            // Met de laatste V/Oct erbij — zonder die term viel de noot bij
            // elke draai aan Coarse terug op C4 tot de volgende CV-schrijf.
            coarse_ = asFloat(0.0f);
            p->note = 60.0f + 12.0f * voct_ + coarse_;
        }
        else if (controlId == "level")  voice_.setLevel(asFloat(0.8f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<WarpsModule>(id);
            });
    }

private:
    static float clamp02(float v) {
        return v < 0.0f ? 0.0f : (v > 2.0f ? 2.0f : v);
    }
    /// Knop 0..8 → Warps-kern 0..1 (modulator.cc rekent zelf weer ×8).
    static constexpr float kAlgoScale = 1.0f / 8.0f;
    /// Vanaf hier mengt de kern de vocoder-oscillator in (vocoder_amount > 0).
    static constexpr float kVocoderFrom = 5.4f;

    /// Zet de drager-shape, in het vocoder-gebied geklemd op 3 (zie kop).
    void applyShape(float algo) {
        int sh = shape_;
        if (algo > kVocoderFrom && sh > 3) sh = 3;
        voice_.params()->carrier_shape = sh;
    }

    mutable WarpsVoice voice_;
    float algoBase_   = 0.0f;
    float timbreBase_ = 0.5f;
    int   shape_      = 0;
    float coarse_     = 0.0f;
    float voct_       = 0.0f;   ///< Laatste V/Oct, zodat `coarse` hem niet wist.
};

}  // namespace mmb_link
