#pragma once
/**
 * @file OctaVcaModule.h
 * @brief Octa-VCA (typeId `tp_mmb_octa_vca`, FW-PM-3): acht identieke
 *        VCA-cellen met één gedeelde control-set.
 *
 * @details
 * Zelfde multi-module-patroon als @ref OctaVcfModule, toegepast op de VCA:
 * 8 × `AudioEffectMultiply` met per cel een audio-in, een gain-CV-in en een
 * audio-uit. De CV loopt via een geslewde `AudioSynthWaveformDc`-proxy op
 * multiply-kanaal 1 (zie VcaModule voor het de-zipper-verhaal). De gedeelde
 * `level`-control schaalt alle cellen (CV × level).
 *
 * Port map (N = 1..8):
 * | Dir | portId  | Kind  | Betekenis                 |
 * |-----|---------|-------|---------------------------|
 * | in  | `in_N`  | Audio | Cel-ingang                |
 * | in  | `cv_N`  | Cv    | Cel-gain (0..1 × level)   |
 * | out | `out_N` | Audio | Cel-uitgang               |
 *
 * Controls: `level` (0..1, gedeelde schaal op alle CV's).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <array>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Acht multiply-VCA-cellen met gedeelde level-schaal. */
class OctaVcaModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_octa_vca";
    static constexpr int          kCells  = 8;

    explicit OctaVcaModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        for (int i = 0; i < kCells; ++i) dc_[i].amplitude(0.0f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        const int idx = cellIndex(portId, "out");
        if (idx >= 0)
            return { const_cast<AudioEffectMultiply*>(&mult_[idx]), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        const int idx = cellIndex(portId, "in");
        if (idx >= 0)
            return { const_cast<AudioEffectMultiply*>(&mult_[idx]), 0, true };
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (cellIndex(portId, "out") >= 0) ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return (cellIndex(portId, "cv") >= 0) ? PortKind::Cv : PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        const int idx = cellIndex(portId, "cv");
        if (idx >= 0) {
            cv_[idx] = value;
            dc_[idx].amplitude(value * level_, kCvSlewMs);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if (controlId == "level") {
            level_ = asFloat(1.0f);
            if (level_ < 0.0f) level_ = 0.0f;
            if (level_ > 1.0f) level_ = 1.0f;
            for (int i = 0; i < kCells; ++i)
                dc_[i].amplitude(cv_[i] * level_, kCvSlewMs);
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<OctaVcaModule>(id);
            });
    }

private:
    static int cellIndex(std::string_view portId, std::string_view base) {
        if (portId.size() != base.size() + 2) return -1;
        if (portId.compare(0, base.size(), base) != 0) return -1;
        if (portId[base.size()] != '_') return -1;
        const char c = portId[base.size() + 1];
        if (c < '1' || c > '8') return -1;
        return static_cast<int>(c - '1');
    }

    mutable std::array<AudioEffectMultiply, kCells>  mult_;
    mutable std::array<AudioSynthWaveformDc, kCells> dc_;
    std::array<AudioConnection, kCells> dcPatch_{
        AudioConnection{ dc_[0], 0, mult_[0], 1 },
        AudioConnection{ dc_[1], 0, mult_[1], 1 },
        AudioConnection{ dc_[2], 0, mult_[2], 1 },
        AudioConnection{ dc_[3], 0, mult_[3], 1 },
        AudioConnection{ dc_[4], 0, mult_[4], 1 },
        AudioConnection{ dc_[5], 0, mult_[5], 1 },
        AudioConnection{ dc_[6], 0, mult_[6], 1 },
        AudioConnection{ dc_[7], 0, mult_[7], 1 },
    };

    std::array<float, kCells> cv_{};
    float level_ = 1.0f;

    static constexpr float kCvSlewMs = 2.0f;
};

}  // namespace mmb_link
