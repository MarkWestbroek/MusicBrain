#pragma once
/**
 * @file VcfModule.h
 * @brief VCF module (typeId `tp_mmb_vcf`): wraps `AudioFilterStateVariable`.
 *
 * @details
 * Port map:
 * | Direction | portId | AudioStream / channel                         |
 * |-----------|--------|-----------------------------------------------|
 * | input     | `in`   | `vcf_`, channel 0 (audio)                     |
 * | output    | `out`  | `vcf_`, channel 0/1/2 — depends on `type`     |
 *
 * Output channel mapping for `type` control:
 * - 0 = LP → channel 0 (lowpass)
 * - 1 = HP → channel 2 (highpass)
 * - 2 = BP → channel 1 (bandpass)
 *
 * The `cv` input (cutoff modulation) is a CV-domain port.
 * `AudioFilterStateVariable` does not have an audio CV input; cutoff
 * is controlled by the `cutoff` control value instead.  CV-driven cutoff
 * modulation is a planned future enhancement.
 *
 * Controls:
 * | controlId | type    | effect                      |
 * |-----------|---------|-----------------------------|
 * | `cutoff`  | float   | Cutoff frequency in Hz      |
 * | `q`       | float   | Resonance (0.7 … 5.0 range) |
 * | `cv_amt`  | float   | Stored; not yet applied     |
 * | `type`    | int32_t | 0=LP, 1=HP, 2=BP            |
 *
 * **Note:** changing `type` at runtime only takes effect after the next
 * `AudioGraph::build()` call (the output channel is fixed per connection).
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief State-variable filter backed by `AudioFilterStateVariable`. */
class VcfModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vcf";

    explicit VcfModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {
        vcf_.frequency(2000.0f);
        vcf_.resonance(0.7f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") {
            // Map filter type to the correct output channel
            uint8_t ch = 0;                // LP default
            if (type_ == 1) ch = 2;        // HP
            else if (type_ == 2) ch = 1;   // BP
            return { const_cast<AudioFilterStateVariable*>(&vcf_), ch, true };
        }
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioFilterStateVariable*>(&vcf_), 0, true };
        // "cv" is CV-domain; no audio port — skip
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if (controlId == "cutoff") {
            vcf_.frequency(asFloat(2000.0f));
        } else if (controlId == "q") {
            vcf_.resonance(asFloat(0.7f));
        } else if (controlId == "type") {
            if (auto* i = std::get_if<int32_t>(&value))
                type_ = static_cast<uint8_t>(*i);
        }
        // cv_amt: stored for future CV-driven cutoff modulation
    }

    /** @brief Register the VCF factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<VcfModule>(id);
            });
    }

private:
    mutable AudioFilterStateVariable vcf_;
    uint8_t type_ = 0;  ///< 0=LP, 1=HP, 2=BP; used in outputPort() channel selection
};

}  // namespace mmb_link
