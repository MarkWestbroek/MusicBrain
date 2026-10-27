#pragma once
/**
 * @file DrawVcoModule.h
 * @brief Draw-waveshape oscillator (typeId `tp_mmb_draw_vco`, FW-AU-6).
 *
 * @details
 * An `AudioSynthWaveform` whose single-cycle table is **drawn in the editor**.
 * The browser sends the waveform over a dedicated `wavetable` serial frame
 * (`{"type":"wavetable","mod":id,"data":[...]}`); the firmware routes it to
 * `Module::setWaveformData()`, which this module overrides to copy/resample the
 * samples into its 256-point buffer.  Pitch tracking matches the plain VCO
 * (0 V = C4 = 261.626 Hz).
 *
 * Until a table is received the module defaults to a triangle so it is audible
 * immediately after patching.  The `shape` switch picks a fixed waveform
 * instead (mmb_dsp/draw_shapes.h); position 0 ("Getekend") plays the drawn
 * table, so existing patches sound the same.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel   |
 * |-----------|--------|--------|--------------------|
 * | input     | `voct` | Cv     | pitch (V/Oct)      |
 * | input     | `tune` | Cv     | aux V/Oct shift    |
 * | output    | `out`  | Audio  | `osc_`, channel 0  |
 *
 * Controls:
 * | controlId | type    | effect                      |
 * |-----------|---------|-----------------------------|
 * | `coarse`  | float   | Semitone offset             |
 * | `fine`    | float   | Cent offset                 |
 * | `level`   | float   | Output amplitude (0 … 1)    |
 * | `shape`   | int     | 0 drawn, 1 sine, 2 triangle, 3 saw, 4 square, 5 pulse 25 %, 6 organ |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/draw_shapes.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Oscillator with an editor-drawn single-cycle waveform. */
class DrawVcoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_draw_vco";
    static constexpr int kTableLen = 256;

    explicit DrawVcoModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        // Default triangle so the module makes sound before a draw arrives.
        for (int i = 0; i < kTableLen; ++i) {
            const float ph = static_cast<float>(i) / kTableLen;
            const float tri = (ph < 0.5f) ? (4.0f * ph - 1.0f)
                                          : (3.0f - 4.0f * ph);
            drawn_[i] = static_cast<int16_t>(tri * 32767.0f);
        }
        applyShape();
        osc_.begin(WAVEFORM_ARBITRARY);
        osc_.amplitude(0.8f);
        recomputeHz();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioSynthWaveform*>(&osc_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override { return {}; }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "tune") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "voct") { voct_ = value; recomputeHz(); }
        else if (portId == "tune") { tune_ = value; recomputeHz(); }
    }

    /** @brief Receive a drawn waveform; resample @p count points to 256. */
    bool setWaveformData(const std::int16_t* data, std::size_t count) override {
        if (!data || count < 2) return false;
        for (int i = 0; i < kTableLen; ++i) {
            // Nearest-neighbour resample of `count` source points → 256.
            const std::size_t src = (static_cast<std::size_t>(i) * count) / kTableLen;
            drawn_[i] = data[src];
        }
        if (shape_ == mmb_dsp::kDrawDrawn) applyShape();
        return true;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "coarse") { coarse_ = asFloat(0.0f); recomputeHz(); }
        else if (controlId == "fine")   { fine_ = asFloat(0.0f); recomputeHz(); }
        else if (controlId == "level")  { osc_.amplitude(asFloat(0.8f)); }
        else if (controlId == "shape")  {
            const int n = static_cast<int>(asFloat(0.0f) + 0.5f);
            shape_ = (n < 0 || n >= mmb_dsp::kDrawShapeCount) ? 0 : n;
            applyShape();
        }
    }

    /** @brief Register the draw-VCO factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<DrawVcoModule>(id);
            });
    }

private:
    /** De gespeelde tabel: de tekening (stand 0) of een vaste vorm. */
    void applyShape() {
        if (shape_ == mmb_dsp::kDrawDrawn)
            for (int i = 0; i < kTableLen; ++i) table_[i] = drawn_[i];
        else
            mmb_dsp::fillDrawShape(shape_, table_, kTableLen);
        osc_.arbitraryWaveform(table_, AUDIO_SAMPLE_RATE_EXACT * 0.5f);
    }

    void recomputeHz() {
        const float hz = 261.6256f
            * powf(2.0f, voct_ + tune_ + coarse_ / 12.0f + fine_ / 1200.0f);
        osc_.frequency(hz);
    }

    mutable AudioSynthWaveform osc_;
    int16_t table_[kTableLen] = { 0 };
    int16_t drawn_[kTableLen] = { 0 };   // laatste tekening (of de driehoek)
    int     shape_  = 0;
    float   voct_   = 0.0f;
    float   tune_   = 0.0f;
    float   coarse_ = 0.0f;
    float   fine_   = 0.0f;
};

}  // namespace mmb_link
