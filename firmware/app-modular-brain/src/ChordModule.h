#pragma once
/**
 * @file ChordModule.h
 * @brief Chord-generator: 1 V/Oct in, 4 gestemde CV's uit
 *        (typeId `tp_mmb_chord`, FW-CV-5).
 *
 * @details
 * CV-domein-module (1 kHz tick): neemt één V/Oct-ingang en zet er vier
 * akkoordstemmen omheen. Voedt een Octa-VCO (4 cellen), vier VCO's of de
 * resonator-bank; achter een quantizer ([[tp_mmb_quant]]) blijft alles
 * netjes in de toonsoort.
 *
 * `inv` is de klassieke inversie (de n laagste stemmen een octaaf omhoog);
 * `spread` opent de voicing trapsgewijs (eerst de topstem +1 octaaf, dan de
 * derde, dan de tweede) zodat de noten in het akkoord blijven.
 *
 * Port map:
 * | Dir | portId | Kind | Betekenis                       |
 * |-----|--------|------|----------------------------------|
 * | in  | `voct` | Cv   | Grondtoon (V/Oct)               |
 * | out | `out1`…`out4` | Cv | De vier akkoordstemmen     |
 *
 * Controls: `chord` (0=Maj 1=Min 2=Maj7 3=Min7 4=Dom7 5=Sus2 6=Sus4
 * 7=Dim7 8=Aug 9=Kwint), `inv` (0..3), `spread` (0..1).
 */

#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

/** @brief Akkoord-CV-generator op de 1 kHz CV-tick. */
class ChordModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_chord";

    explicit ChordModule(std::string_view id)
        : CvModule(kTypeId, id) {}

    // --- CvModule -------------------------------------------------------

    void tick() override {
        // Akkoordtabellen in semitonen (4 stemmen, laag → hoog).
        static const int8_t kChords[10][4] = {
            {0, 4, 7, 12},   // majeur
            {0, 3, 7, 12},   // mineur
            {0, 4, 7, 11},   // maj7
            {0, 3, 7, 10},   // min7
            {0, 4, 7, 10},   // dom7
            {0, 2, 7, 12},   // sus2
            {0, 5, 7, 12},   // sus4
            {0, 3, 6, 9},    // dim7
            {0, 4, 8, 12},   // aug
            {0, 7, 12, 19},  // kwint/octaaf
        };
        for (int i = 0; i < 4; ++i) {
            int semi = kChords[chord_][i];
            if (i < inv_) semi += 12;                    // inversie
            // spread opent de voicing van boven naar beneden (octaven,
            // dus altijd akkoordeigen): >0.25 stem 4, >0.5 stem 3, >0.75 stem 2.
            if (i > 0 && spread_ > 0.25f * static_cast<float>(4 - i)) semi += 12;
            out_[i] = in_ + static_cast<float>(semi) * (1.0f / 12.0f);
        }
    }

    // --- Ports ------------------------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out1" || portId == "out2" ||
                portId == "out3" || portId == "out4")
                   ? PortKind::Cv : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return portId == "voct" ? PortKind::Cv : PortKind::None;
    }

    float readCvPort(std::string_view portId) const override {
        if (portId == "out1") return out_[0];
        if (portId == "out2") return out_[1];
        if (portId == "out3") return out_[2];
        if (portId == "out4") return out_[3];
        return 0.0f;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") in_ = value;
    }

    // --- Controls -----------------------------------------------------------

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        if (controlId == "chord") {
            int c = static_cast<int>(asFloat(0.0f));
            chord_ = c < 0 ? 0 : c > 9 ? 9 : c;
        }
        else if (controlId == "inv") {
            int v = static_cast<int>(asFloat(0.0f));
            inv_ = v < 0 ? 0 : v > 3 ? 3 : v;
        }
        else if (controlId == "spread") {
            float s = asFloat(0.0f);
            spread_ = s < 0.0f ? 0.0f : s > 1.0f ? 1.0f : s;
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ChordModule>(id);
            });
    }

private:
    int   chord_ = 0, inv_ = 0;
    float spread_ = 0.0f;
    float in_ = 0.0f, out_[4] = {};
};

}  // namespace mmb_link
