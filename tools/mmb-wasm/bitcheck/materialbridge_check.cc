#include "mmb_dsp/material_bridge.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>

int main() {
    using Bridge = mmb_dsp::MaterialBridge;
    static_assert(sizeof(Bridge) < 256, "Material Bridge must remain a small fixed-state kernel");
    for (const float rate : {32000.0f, 44100.0f, 48000.0f, 96000.0f}) {
        Bridge bridge;
        bridge.Init(rate);
        bridge.setControl(Bridge::Decay, 8);
        bridge.setControl(Bridge::Memory, 0);
        float left, right;
        bridge.Tick(0, 1, 0, 1, 0, left, right);
        float previous = bridge.energyTotal();
        for (int sample = 0; sample < static_cast<int>(rate * 2); ++sample) {
            if (sample % 128 == 0) {
                bridge.setControl(Bridge::Coupling, sample % 256 ? 0 : 1);
                bridge.setControl(Bridge::Spread, sample % 512 ? 0 : 1);
                bridge.setVoct(sample % 256 ? -2 : 2);
            }
            bridge.Tick(0, 0, 0, 1, 0, left, right);
            const float energy = bridge.energyTotal();
            assert(std::isfinite(energy) && energy <= previous * 1.000002f);
            previous = energy;
        }
        assert(previous < 0.06f);
        bridge.Init(rate);
        bridge.setControl(Bridge::Decay, 8);
        for (int sample = 0; sample < static_cast<int>(rate * 0.1f); ++sample)
            bridge.Tick(0, sample == 0 ? 1 : 0, 0, 1, 0, left, right);
        assert(bridge.broken() && bridge.stress() > 0.6f);
        bool sawHysteresis = false;
        for (int sample = 0; sample < static_cast<int>(rate * 8); ++sample) {
            bridge.Tick(0, 0, 0, 1, 0, left, right);
            if (bridge.stress() > 0.3f && bridge.stress() < 0.5f) {
                assert(bridge.broken());
                sawHysteresis = true;
            }
        }
        assert(sawHysteresis && !bridge.broken() && bridge.stress() < 0.25f);
        for (int sample = 0; sample < 10000; ++sample) {
            bridge.Tick(1, sample % 2, (sample + 1) % 2, 1, 0, left, right);
            assert(bridge.energyTotal() <= 4.00001f);
            assert(std::fabs(left) <= 1 && std::fabs(right) <= 1);
        }
        bridge.Tick(0, 0, 0, 1, 1, left, right);
        assert(bridge.energyTotal() == 0 && bridge.stress() == 0);
    }
    std::printf("PASS: passivity, hysteresis, recovery, energy limit, reset at 4 rates; kernel %zu bytes\n", sizeof(Bridge));
}