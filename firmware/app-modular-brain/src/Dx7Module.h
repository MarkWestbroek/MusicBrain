#pragma once
/**
 * @file Dx7Module.h
 * @brief Yamaha DX7-stem (typeId `tp_mmb_dx7`) op de msfa-engine.
 *
 * @details
 * Wrapper rond de gevendorde msfa-kern (`firmware/lib/msfa`, Apache-2.0,
 * Google's music-synthesizer-for-android — dezelfde engine als Dexed en
 * MicroDexed): 6-operator FM, envelopes, LFO en DX7-patch-formaat, allemaal
 * fixed-point. Rendert **native op 44.1 kHz** — geen resampler nodig; per
 * `update()` twee msfa-blokken van N=64 samples.
 *
 * **Eén stem per instantie**, net als VcoModule — polyfonie loopt via het
 * bestaande polyExpand-mechanisme (N instanties). De zware lookup-tabellen
 * (Freqlut/Exp2/Sin/Tanh) zijn klasse-statics en worden éénmalig gebouwd.
 *
 * **Banken:** één gedeelde 32-voice DX7-bank (4096 bytes, het klassieke
 * bulk-dump-formaat zonder sysex-framing) voor álle instanties, geladen via
 * het serial-frame `{"type":"dx7bank","data":[4096 bytes]}` →
 * `Dx7Module::setBank()`. Zonder geladen bank klinkt elk program als de
 * ingebouwde **E.PIANO 1** (uit msfa zelf). `program` (0–31) kiest de voice.
 *
 * Port map:
 * | Dir | portId | Kind  | Betekenis                                   |
 * |-----|--------|-------|---------------------------------------------|
 * | in  | `voct` | Cv    | 1 V/oct rond C4 (fractioneel via pitch-mod) |
 * | in  | `gate` | Gate  | Note-on/off (rising → init, falling → keyup)|
 * | in  | `vel`  | Cv    | Velocity 0..1 → 1..127 (gesampled op gate)  |
 * | out | `out`  | Audio | Mono FM-uitgang                             |
 *
 * Controls: `program` (0–31), `coarse` (semitonen, −36..36), `fine`
 * (cents, −100..100), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string_view>

// Gevendorde msfa-kern (Apache-2.0): firmware/lib/msfa.
#include "msfa/synth.h"
#include "msfa/freqlut.h"
#include "msfa/exp2.h"
#include "msfa/sin.h"
#include "msfa/lfo.h"
#include "msfa/pitchenv.h"
#include "msfa/dx7note.h"
#include "msfa/patch.h"
#include "msfa/controllers.h"

namespace mmb_link {

/** @brief Eén DX7-stem (msfa Dx7Note + Lfo) als AudioStream. */
class Dx7Voice : public AudioStream {
public:
    Dx7Voice() : AudioStream(0, nullptr) {
        ensureTables();
        std::memset(patch_, 0, sizeof(patch_));
        applyProgram(0);
        controllers_.values_[kControllerPitch] = 0x2000;
    }

    /** @brief Gedeelde 32-voice bank (4096 bytes packed) voor alle stemmen. */
    static bool setBank(const std::uint8_t* data, std::size_t len) {
        if (len != kBankBytes) return false;
        std::memcpy(bankData(), data, kBankBytes);
        bankLoaded() = true;
        ++bankVersion();
        return true;
    }
    static const char* bankVoiceName(int program, char out[11]) {
        const char* src = bankLoaded()
            ? bankData() + (program & 31) * 128 + 118
            : kEpiano + 128 - 10;
        std::memcpy(out, src, 10);
        out[10] = '\0';
        return out;
    }

    void setProgram(int p) {
        if (p < 0) p = 0;
        if (p > 31) p = 31;
        program_ = p;
        applyProgram(p);
    }
    void setCoarse(float semis)  { coarse_ = semis; applyPitch(); }
    void setFine(float cents)    { fine_ = cents;  applyPitch(); }
    void setLevel(float v)       { level_ = v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void setVoct(float v)        { voct_ = v; applyPitch(); }
    void setVelocity(float v)    { vel_ = v; }

    void gate(bool high) {
        if (high && !gateHigh_) {
            // Herlaad de patch als er intussen een nieuwe bank is gepusht:
            // note-on is het veilige moment (note wordt toch geherinit).
            if (appliedBankVersion_ != bankVersion()) applyProgram(program_);
            int v = static_cast<int>(vel_ * 127.0f);
            if (v < 1) v = 1;
            if (v > 127) v = 127;
            note_.init(patch_, midinote_, v);
            lfo_.keydown();
            active_ = true;
        } else if (!high && gateHigh_) {
            note_.keyup();
        }
        gateHigh_ = high;
    }

    float takePeak() {
        const float p = peak_;
        peak_ = 0.0f;
        return p * (1.0f / 32768.0f);
    }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;
        if (!active_) {
            std::memset(out->data, 0, sizeof(out->data));
            transmit(out, 0);
            release(out);
            return;
        }
        static_assert(AUDIO_BLOCK_SAMPLES == 2 * N, "msfa N=64 verwacht");
        int32_t buf[N];
        for (int half = 0; half < 2; ++half) {
            std::memset(buf, 0, sizeof(buf));          // compute() telt op
            const std::int32_t lfoValue = lfo_.getsample();
            const std::int32_t lfoDelay = lfo_.getdelay();
            note_.compute(buf, lfoValue, lfoDelay, &controllers_);
            int16_t* dst = out->data + half * N;
            for (int i = 0; i < N; ++i) {
                // Schaal + clip zoals msfa's SynthUnit (>>4, clip ±2^24, >>9).
                std::int32_t val = buf[i] >> 4;
                if (val < -(1 << 24)) val = -(1 << 24);
                if (val >= (1 << 24)) val = (1 << 24) - 1;
                float y = static_cast<float>(val >> 9) * level_;
                const float a = y < 0.0f ? -y : y;
                if (a > peak_) peak_ = a;
                dst[i] = static_cast<int16_t>(y);
            }
        }
        transmit(out, 0);
        release(out);
    }

private:
    static constexpr std::size_t kBankBytes = 4096;

    // Ingebouwde default-voice: E.PIANO 1 (128 bytes packed, uit msfa).
    static constexpr char kEpiano[128] = {
        95, 29, 20, 50, 99, 95, 0, 0, 41, 0, 19, 0, 115, 24, 79, 2, 0,
        95, 20, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 3, 0, 99, 2, 0,
        95, 29, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 59, 24, 89, 2, 0,
        95, 20, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 59, 8, 99, 2, 0,
        95, 50, 35, 78, 99, 75, 0, 0, 0, 0, 0, 0, 59, 28, 58, 28, 0,
        96, 25, 25, 67, 99, 75, 0, 0, 0, 0, 0, 0, 83, 8, 99, 2, 0,
        94, 67, 95, 60, 50, 50, 50, 50, 4, 6, 34, 33, 0, 0, 56, 24,
        69, 46, 80, 73, 65, 78, 79, 32, 49, 32,
    };

    // Function-local statics: gedeeld over alle instanties, init-once.
    // 4 KB in gewone BSS; de grote msfa-tabellen staan al in RAM2.
    static char* bankData()          { static char b[kBankBytes]; return b; }
    static bool& bankLoaded()        { static bool v = false; return v; }
    static std::uint32_t& bankVersion() { static std::uint32_t v = 0; return v; }

    static void ensureTables() {
        static bool done = false;
        if (done) return;
        done = true;
        Freqlut::init(AUDIO_SAMPLE_RATE_EXACT);
        Exp2::init();
        Tanh::init();
        Sin::init();
        Lfo::init(AUDIO_SAMPLE_RATE_EXACT);
        PitchEnv::init(AUDIO_SAMPLE_RATE_EXACT);
    }

    void applyProgram(int p) {
        const char* packed = bankLoaded() ? bankData() + (p & 31) * 128
                                          : kEpiano;
        UnpackPatch(packed, patch_);
        lfo_.reset(patch_ + 137);
        appliedBankVersion_ = bankVersion();
    }

    /** V/Oct + coarse + fine → geheel midinote + fractie via pitch-bend
     *  (msfa's bend is hard 3 semitonen fullscale: 1 semitoon ≈ 0x2000/3). */
    void applyPitch() {
        const float semis = 60.0f + 12.0f * voct_ + coarse_ + fine_ * 0.01f;
        float base = std::floor(semis);
        float frac = semis - base;
        int m = static_cast<int>(base);
        if (m < 0)   { m = 0;   frac = 0.0f; }
        if (m > 127) { m = 127; frac = 0.0f; }
        midinote_ = m;
        controllers_.values_[kControllerPitch] =
            0x2000 + static_cast<int>(frac * (0x2000 / 3.0f));
    }

    Dx7Note     note_;
    Lfo         lfo_;
    Controllers controllers_;
    char        patch_[156];

    std::uint32_t appliedBankVersion_ = 0;
    int   program_  = 0;
    int   midinote_ = 60;
    float voct_ = 0.0f, coarse_ = 0.0f, fine_ = 0.0f;
    float vel_ = 0.8f, level_ = 0.8f;
    bool  gateHigh_ = false;
    bool  active_   = false;   ///< pas renderen na de eerste note-on
    volatile float peak_ = 0.0f;
};

/** @brief Module-wrapper rond @ref Dx7Voice. */
class Dx7Module final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_dx7";

    explicit Dx7Module(std::string_view id)
        : AudioModule(kTypeId, id) {}

    Dx7Voice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<Dx7Voice*>(&voice_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (portId == "gate" || portId == "trig") return PortKind::Gate;
        if (portId == "vel" || portId == "velocity") return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "voct")  voice_.setVoct(value);
        else if (portId == "gate" || portId == "trig") voice_.gate(value >= 0.5f);
        else if (portId == "vel" || portId == "velocity") voice_.setVelocity(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "program") voice_.setProgram(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "coarse")  voice_.setCoarse(asFloat(0.0f));
        else if (controlId == "fine")    voice_.setFine(asFloat(0.0f));
        else if (controlId == "level")   voice_.setLevel(asFloat(0.8f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<Dx7Module>(id);
            });
    }

private:
    mutable Dx7Voice voice_;
};

}  // namespace mmb_link
