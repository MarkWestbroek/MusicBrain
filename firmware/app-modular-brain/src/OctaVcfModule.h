#pragma once
/**
 * @file OctaVcfModule.h
 * @brief Octa-VCF (typeId `tp_mmb_octa_vcf`, FW-PM-2): acht identieke
 *        state-variable filtercellen met één gedeelde control-set.
 *
 * @details
 * Het multi-module-patroon van @ref OctaVcoModule toegepast op het filter:
 * 8 × `AudioFilterStateVariable`, allemaal gestuurd door dezelfde knoppen
 * (`cutoff`/`q`/`cv_amt`/`type`), met per cel een eigen audio-in, eigen
 * cutoff-CV en eigen audio-uit. Dat maakt poly-patches compact: één module
 * en 8 kabels in plaats van 8 losse VCF's — precies de vorm van de latere
 * hardware-dCV-module met één set fysieke controllers.
 *
 * Cutoff-CV per cel loopt zoals in @ref VcfModule via een interne
 * `AudioSynthWaveformDc`-proxy op de frequentie-modulatie-ingang van het
 * filter (audio-rate op de Teensy, gevoed op de 1 kHz-tick met slew); de
 * gedeelde `cv`-ingang telt daar bovenop. `cv_amt` (octaven) geldt voor
 * alle cellen.
 *
 * Port map (N = 1..8):
 * | Dir | portId   | Kind  | Betekenis                          |
 * |-----|----------|-------|-------------------------------------|
 * | in  | `in_N`   | Audio | Cel-ingang                          |
 * | in  | `cv_N`   | Cv    | Cel-cutoff-CV (±1 = ±cv_amt octaaf) |
 * | in  | `cv`     | Cv    | Gedeelde cutoff-CV (alle cellen)    |
 * | out | `out_N`  | Audio | Cel-uitgang (kanaal volgt `type`)   |
 *
 * Controls: `cutoff` (Hz), `q` (0.7–5), `cv_amt` (0–7 oct),
 * `type` (0=LP, 1=BP, 2=HP — kanaalkeuze, dus graph-rebuild bij wissel).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <array>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Acht SVF-cellen met gedeelde controllers. */
class OctaVcfModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_octa_vcf";
    static constexpr int          kCells  = 8;

    explicit OctaVcfModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        for (int i = 0; i < kCells; ++i) {
            svf_[i].frequency(800.0f);
            svf_[i].resonance(0.9f);
            svf_[i].octaveControl(cvAmt_);
            dc_[i].amplitude(0.0f);
        }
    }

    // --- Audio ports ----------------------------------------------------

    AudioPort outputPort(std::string_view portId) const override {
        const int idx = cellIndex(portId, "out");
        if (idx >= 0)
            return { const_cast<AudioFilterStateVariable*>(&svf_[idx]),
                     static_cast<uint8_t>(type_), true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        const int idx = cellIndex(portId, "in");
        if (idx >= 0)
            return { const_cast<AudioFilterStateVariable*>(&svf_[idx]), 0, true };
        return {};
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (cellIndex(portId, "out") >= 0) ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "cv")                 return PortKind::Cv;
        if (cellIndex(portId, "cv") >= 0)   return PortKind::Cv;
        return PortKind::None;
    }

    /** @brief `cv_N` per cel, `cv` gedeeld; som naar de DC-proxy (met slew). */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "cv") {
            cvShared_ = value;
            for (int i = 0; i < kCells; ++i) applyCv(i);
            return;
        }
        const int idx = cellIndex(portId, "cv");
        if (idx >= 0) {
            cvCell_[idx] = value;
            applyCv(idx);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if (controlId == "cutoff") {
            const float hz = asFloat(800.0f);
            for (int i = 0; i < kCells; ++i) svf_[i].frequency(hz);
        } else if (controlId == "q") {
            const float q = asFloat(0.9f);
            for (int i = 0; i < kCells; ++i) svf_[i].resonance(q);
        } else if (controlId == "cv_amt") {
            cvAmt_ = asFloat(2.0f);
            for (int i = 0; i < kCells; ++i) svf_[i].octaveControl(cvAmt_);
        } else if (controlId == "type") {
            if (auto* i = std::get_if<int32_t>(&value)) {
                int t = *i;
                if (t < 0) t = 0;
                if (t > 2) t = 2;
                type_ = t;   // kanaalkeuze — nieuwe graph-build pakt het op
            }
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<OctaVcfModule>(id);
            });
    }

private:
    /** @brief Parse `<base>_N` (N = 1..8) → 0-based index, of −1. */
    static int cellIndex(std::string_view portId, std::string_view base) {
        if (portId.size() != base.size() + 2) return -1;
        if (portId.compare(0, base.size(), base) != 0) return -1;
        if (portId[base.size()] != '_') return -1;
        const char c = portId[base.size() + 1];
        if (c < '1' || c > '8') return -1;
        return static_cast<int>(c - '1');
    }

    void applyCv(int i) {
        dc_[i].amplitude(cvShared_ + cvCell_[i], kCvSlewMs);
    }

    mutable std::array<AudioFilterStateVariable, kCells> svf_;
    mutable std::array<AudioSynthWaveformDc, kCells>     dc_;
    /// Interne patches: DC-proxy → SVF frequentie-modulatie-ingang (1).
    std::array<AudioConnection, kCells> dcPatch_{
        AudioConnection{ dc_[0], 0, svf_[0], 1 },
        AudioConnection{ dc_[1], 0, svf_[1], 1 },
        AudioConnection{ dc_[2], 0, svf_[2], 1 },
        AudioConnection{ dc_[3], 0, svf_[3], 1 },
        AudioConnection{ dc_[4], 0, svf_[4], 1 },
        AudioConnection{ dc_[5], 0, svf_[5], 1 },
        AudioConnection{ dc_[6], 0, svf_[6], 1 },
        AudioConnection{ dc_[7], 0, svf_[7], 1 },
    };

    std::array<float, kCells> cvCell_{};
    float cvShared_ = 0.0f;
    float cvAmt_    = 2.0f;
    int   type_     = 0;   ///< 0=LP, 1=BP, 2=HP (uitgangskanaal).

    /// DC-slew per CV-update (ms) — de-zippert de 1 kHz-tick (zie VcaModule).
    static constexpr float kCvSlewMs = 2.0f;
};

}  // namespace mmb_link
