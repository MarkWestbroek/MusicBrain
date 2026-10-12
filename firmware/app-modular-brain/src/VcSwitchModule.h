#pragma once
/**
 * @file VcSwitchModule.h
 * @brief VC SWITCH (typeId `tp_mmb_vcswitch`), fw 0.5.112: een spanningsgestuurde
 *        A/B-schakelaar in het CV-domein, dubbel (zoals de Doepfer A-150).
 *
 * Mark (2026-10-12): het sustainpedaal laat een tweede envelope het werk
 * doen. Twee kanalen met één gezamenlijke Select, zodat één pedaal de amp- en
 * de filter-envelope tegelijk omzet:
 *   out1 = A1·(1−x) + B1·x,  out2 = A2·(1−x) + B2·x
 * x volgt Select: in Mode Gate is x 1 zodra Select ≥ 0,5 (B), in Mode Fade is
 * x Select zelf (0 … 1, traploos mengen). De schakelaar B kiest met de hand B.
 * Glide (ms) is de tijd waarin x van 0 naar 1 gaat: 0 = hard schakelen, een
 * paar ms = klikvrij, langer = overvloeien. 1 kHz, zoals elke CV-module.
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class VcSwitchModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vcswitch";

    explicit VcSwitchModule(std::string_view id) : CvModule(kTypeId, id) {}

    void tick() override {
        float target = fade_ ? cvutil::clampFinite(sel_, 0.0f, 1.0f, 0.0f) : (sel_ >= 0.5f ? 1.0f : 0.0f);
        if (manualB_) target = 1.0f;
        const float step = glideMs_ <= 0.0f ? 1.0f : 1.0f / glideMs_;   // 1 tik = 1 ms
        if (x_ < target) x_ = x_ + step < target ? x_ + step : target;
        else if (x_ > target) x_ = x_ - step > target ? x_ - step : target;
        out1_ = a1_ + (b1_ - a1_) * x_;
        out2_ = a2_ + (b2_ - a2_) * x_;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out1" || portId == "out2" ? PortKind::Cv : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "a1" || portId == "b1" || portId == "a2" || portId == "b2" || portId == "sel") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "out1") return out1_;
        if (portId == "out2") return out2_;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        const float v = cvutil::clampFinite(value, -16.0f, 16.0f, 0.0f);
        if (portId == "a1") a1_ = v;
        else if (portId == "b1") b1_ = v;
        else if (portId == "a2") a2_ = v;
        else if (portId == "b2") b2_ = v;
        else if (portId == "sel") sel_ = v;
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "glide") glideMs_ = cvutil::clampFinite(cvutil::asFloat(value, 5.0f), 0.0f, 5000.0f, 5.0f);
        else if (controlId == "mode") fade_ = cvutil::asFloat(value, 0.0f) >= 0.5f;
        else if (controlId == "manual") manualB_ = cvutil::asBool(value, false);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<VcSwitchModule>(id);
        });
    }

private:
    float a1_ = 0.0f, b1_ = 0.0f, a2_ = 0.0f, b2_ = 0.0f, sel_ = 0.0f;
    float out1_ = 0.0f, out2_ = 0.0f, x_ = 0.0f, glideMs_ = 5.0f;
    bool fade_ = false, manualB_ = false;
};

}  // namespace mmb_link
