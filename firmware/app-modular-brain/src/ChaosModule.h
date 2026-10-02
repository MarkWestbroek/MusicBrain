#pragma once
/**
 * @file ChaosModule.h
 * @brief Chaotische modulator: drie vreemde aantrekkers als CV-bron
 *        (typeId `tp_mmb_chaos`).
 *
 * @details
 * CV-domein-module (1 kHz tick). Een LFO herhaalt zich, ruis heeft geen
 * richting; een chaotisch stelsel zit ertussenin: het beweegt vloeiend en
 * samenhangend, maar komt nooit precies terug. Drie uitgangen (`x`, `y`, `z`)
 * zijn drie kanten van dezelfde beweging, dus modulaties die ermee gestuurd
 * worden horen bij elkaar zonder gelijk te lopen.
 *
 * Modellen (`model`):
 * - **0 Lorenz**: twee lobben; de baan cirkelt een poos om de ene en springt
 *   dan onvoorspelbaar naar de andere. `gate` is hoog op de rechterlob: een
 *   onregelmatige maar niet willekeurige schakelaar.
 * - **1 Rössler**: een bijna-sinus op x en y die af en toe uitschiet; z ligt
 *   stil en geeft dan een piek. `shape` loopt door de periodeverdubbeling
 *   (laag = periodiek, hoog = chaotisch).
 * - **2 Thomas**: een trage, symmetrische dwaaltocht in drie richtingen; het
 *   rustigste van de drie, bedoeld voor minutenlange drift.
 *
 * `rate` is het aantal omlopen per seconde (ruwweg; 0,005 Hz = ruim drie
 * minuten per omloop). Geïntegreerd met Runge-Kutta 4 in vaste deelstappen;
 * een ontspoorde toestand wordt teruggezet. Reset herstelt de beginpositie,
 * dus een patch begint reproduceerbaar.
 *
 * Port map:
 * | Dir | portId    | Kind | Betekenis                                  |
 * |-----|-----------|------|--------------------------------------------|
 * | in  | `rate_cv` | Cv   | Exponentieel: ±1 = ±4 octaven maal de knop |
 * | in  | `reset`   | Gate | Terug naar de beginpositie                 |
 * | out | `x`,`y`,`z` | Cv | Drie assen, ±depth (of 0..depth unipolair) |
 * | out | `gate`    | Gate | x boven nul (met hysterese)                |
 *
 * Controls: `rate` (0,005..20 Hz), `model` (0..2), `shape` (0..1), `depth`
 * (0..1), `rate_cv_amt` (-1..1), `bipolar` (toggle).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class ChaosModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_chaos";

    explicit ChaosModule(std::string_view id) : CvModule(kTypeId, id) { restart(); }

    void tick() override {
        if (resetEdge_.rise(reset_ >= 0.5f)) restart();
        // Karakteristieke omlooptijd en grootste veilige stap per model.
        static constexpr float kPeriod[3]  = {0.75f, 6.0f, 7.0f};
        static constexpr float kMaxStep[3] = {0.008f, 0.05f, 0.1f};
        const float hz = cvutil::clampFinite(rate_ * std::exp2(4.0f * rateCv_ * rateCvAmt_), 0.0005f, 40.0f, 0.2f);
        const float dt = hz * kPeriod[model_] * 0.001f;
        int steps = static_cast<int>(dt / kMaxStep[model_]) + 1;
        if (steps > 12) steps = 12;
        const float h = dt / static_cast<float>(steps);
        for (int step = 0; step < steps; ++step) rk4(h);
        if (!std::isfinite(s_[0] + s_[1] + s_[2]) || std::fabs(s_[0]) > 1e4f) restart();
        normalise();
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "x" || portId == "y" || portId == "z") return PortKind::Cv;
        if (portId == "gate") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "rate_cv") return PortKind::Cv;
        if (portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "x") return out_[0];
        if (portId == "y") return out_[1];
        if (portId == "z") return out_[2];
        if (portId == "gate") return gate_ ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "rate_cv") rateCv_ = cvutil::clampFinite(value, -2.0f, 2.0f, 0.0f);
        else if (portId == "reset") reset_ = value;
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "rate") rate_ = cvutil::clampFinite(cvutil::asFloat(value, 0.2f), 0.005f, 20.0f, 0.2f);
        else if (controlId == "model") {
            const int model = static_cast<int>(cvutil::asFloat(value, 0.0f) + 0.5f);
            const int next = model < 0 ? 0 : model > 2 ? 2 : model;
            if (next != model_) { model_ = next; restart(); }
        }
        else if (controlId == "shape") shape_ = cvutil::clampFinite(cvutil::asFloat(value, 0.3f), 0.0f, 1.0f, 0.3f);
        else if (controlId == "depth") depth_ = cvutil::clampFinite(cvutil::asFloat(value, 1.0f), 0.0f, 1.0f, 1.0f);
        else if (controlId == "rate_cv_amt") rateCvAmt_ = cvutil::clampFinite(cvutil::asFloat(value, 1.0f), -1.0f, 1.0f, 1.0f);
        else if (controlId == "bipolar") bipolar_ = cvutil::asBool(value, true);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ChaosModule>(id);
        });
    }

private:
    // Parameter die `shape` per model verschuift.
    float lorenzRho() const { return 24.0f + 36.0f * shape_; }      // 28 bij shape 0,11
    float roesslerC() const { return 3.5f + 5.5f * shape_; }        // 5,7 bij shape 0,4
    float thomasB() const   { return 0.11f + 0.19f * shape_; }      // 0,208 bij shape 0,52

    void restart() {
        static constexpr float kStart[3][3] = {{1.0f, 1.0f, 20.0f}, {1.0f, 1.0f, 0.0f}, {1.1f, 1.1f, -0.01f}};
        for (int axis = 0; axis < 3; ++axis) s_[axis] = kStart[model_][axis];
        gate_ = false;
        normalise();
    }

    void derivative(const float* s, float* d) const {
        if (model_ == 0) {
            d[0] = 10.0f * (s[1] - s[0]);
            d[1] = s[0] * (lorenzRho() - s[2]) - s[1];
            d[2] = s[0] * s[1] - (8.0f / 3.0f) * s[2];
        } else if (model_ == 1) {
            d[0] = -s[1] - s[2];
            d[1] = s[0] + 0.2f * s[1];
            d[2] = 0.2f + s[2] * (s[0] - roesslerC());
        } else {
            const float b = thomasB();
            d[0] = std::sin(s[1]) - b * s[0];
            d[1] = std::sin(s[2]) - b * s[1];
            d[2] = std::sin(s[0]) - b * s[2];
        }
    }

    void rk4(float h) {
        float k1[3], k2[3], k3[3], k4[3], t[3];
        derivative(s_, k1);
        for (int i = 0; i < 3; ++i) t[i] = s_[i] + 0.5f * h * k1[i];
        derivative(t, k2);
        for (int i = 0; i < 3; ++i) t[i] = s_[i] + 0.5f * h * k2[i];
        derivative(t, k3);
        for (int i = 0; i < 3; ++i) t[i] = s_[i] + h * k3[i];
        derivative(t, k4);
        for (int i = 0; i < 3; ++i) s_[i] += h * (k1[i] + 2.0f * k2[i] + 2.0f * k3[i] + k4[i]) * (1.0f / 6.0f);
    }

    void normalise() {
        float n[3];
        if (model_ == 0) {
            const float rho = lorenzRho();
            const float scale = std::sqrt((8.0f / 3.0f) * (rho - 1.0f));   // afstand van de lobben
            n[0] = s_[0] / (2.3f * scale);
            n[1] = s_[1] / (3.0f * scale);
            n[2] = (s_[2] - (rho - 1.0f)) / (0.85f * rho);
        } else if (model_ == 1) {
            const float c = roesslerC();
            n[0] = s_[0] / (2.1f * c);
            n[1] = s_[1] / (1.9f * c);
            n[2] = s_[2] / (2.2f * c) - 1.0f;
        } else {
            const float scale = thomasB() * 1.05f;                          // |x| <= 1/b
            for (int axis = 0; axis < 3; ++axis) n[axis] = s_[axis] * scale;
        }
        for (int axis = 0; axis < 3; ++axis) {
            const float limited = n[axis] < -1.0f ? -1.0f : n[axis] > 1.0f ? 1.0f : n[axis];
            out_[axis] = depth_ * (bipolar_ ? limited : 0.5f + 0.5f * limited);
        }
        if (n[0] > 0.05f) gate_ = true;
        else if (n[0] < -0.05f) gate_ = false;
    }

    cvutil::Edge resetEdge_;
    float s_[3] = {1.0f, 1.0f, 20.0f};
    float out_[3] = {};
    float rate_ = 0.2f, shape_ = 0.3f, depth_ = 1.0f, rateCv_ = 0.0f, rateCvAmt_ = 1.0f, reset_ = 0.0f;
    int model_ = 0;
    bool bipolar_ = true, gate_ = false;
};

}  // namespace mmb_link
