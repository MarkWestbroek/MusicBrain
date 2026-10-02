#pragma once
/**
 * @file PadsModule.h
 * @brief Vier grote drukknoppen die gates en triggers geven (typeId
 *        `tp_mmb_pads`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Bedoeld om snel een gate- of CV-ingang te
 * proberen zonder klavier of sequencer: de Fast-ingang van de ROTARY, de
 * Ping van de LPG, Accent en Slide van ACID, een Reset. De knoppen zijn
 * controls (`b1..b4`, een bool die de editor live doorstuurt); per knop zijn
 * er twee uitgangen:
 *
 * - `gate_k`: hoog zolang de knop is ingedrukt (of, met `latch_k` aan,
 *   omgezet bij elke druk: aan, uit, aan);
 * - `trig_k`: een puls van 10 ms bij elke druk.
 *
 * `any` is hoog als een van de vier gates hoog is.
 *
 * Port map:
 * | Dir | portId     | Kind | Betekenis                       |
 * |-----|------------|------|---------------------------------|
 * | out | `gate_1..4`| Gate | Ingedrukt (of vergrendeld)      |
 * | out | `trig_1..4`| Gate | 10 ms bij elke druk             |
 * | out | `any`      | Gate | Een van de gates is hoog        |
 *
 * Controls: `b1..b4` (knoppen), `latch1..latch4` (toggles).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class PadsModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_pads";
    static constexpr int kPads = 4;

    explicit PadsModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        for (int pad = 0; pad < kPads; ++pad) {
            const bool pressed = pressed_[pad];
            if (trigTicks_[pad] > 0) --trigTicks_[pad];
            if (edge_[pad].rise(pressed)) {
                trigTicks_[pad] = 10;
                if (latch_[pad]) latched_[pad] = !latched_[pad];
            }
            gate_[pad] = latch_[pad] ? latched_[pad] : pressed;
        }
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "gate_1" || portId == "gate_2" || portId == "gate_3" || portId == "gate_4") return PortKind::Gate;
        if (portId == "trig_1" || portId == "trig_2" || portId == "trig_3" || portId == "trig_4") return PortKind::Gate;
        if (portId == "any") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view) const override { return PortKind::None; }
    float readCvPort(std::string_view portId) const override {
        if (portId == "any") return gate_[0] || gate_[1] || gate_[2] || gate_[3] ? 1.0f : 0.0f;
        if (portId.size() == 6 && (portId.substr(0, 5) == "gate_" || portId.substr(0, 5) == "trig_")) {
            const int pad = portId[5] - '1';
            if (pad < 0 || pad >= kPads) return 0.0f;
            if (portId[0] == 'g') return gate_[pad] ? 1.0f : 0.0f;
            return trigTicks_[pad] > 0 ? 1.0f : 0.0f;
        }
        return 0.0f;
    }
    void writeCvPort(std::string_view, float) override {}

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        const bool on = cvutil::asBool(value, false);
        if      (controlId == "b1") pressed_[0] = on;
        else if (controlId == "b2") pressed_[1] = on;
        else if (controlId == "b3") pressed_[2] = on;
        else if (controlId == "b4") pressed_[3] = on;
        else if (controlId == "latch1") setLatch(0, on);
        else if (controlId == "latch2") setLatch(1, on);
        else if (controlId == "latch3") setLatch(2, on);
        else if (controlId == "latch4") setLatch(3, on);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<PadsModule>(id);
        });
    }

private:
    void setLatch(int pad, bool on) { if (latch_[pad] != on) { latch_[pad] = on; latched_[pad] = false; } }

    cvutil::Edge edge_[kPads];
    int trigTicks_[kPads] = {};
    bool pressed_[kPads] = {}, latch_[kPads] = {}, latched_[kPads] = {}, gate_[kPads] = {};
};

}  // namespace mmb_link
