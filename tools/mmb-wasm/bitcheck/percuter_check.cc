// Invariantentest voor de Percuter op vier samplefrequenties: een kanaal speelt
// zijn slot precies zo lang als de cartridge (gedeeld door de stemming), de
// som blijft binnen ±1, een kanaal zonder slot zwijgt, en zonder filter zijn
// alle waarden 8-bit.
#include "kernel_check.h"
#include "mmb_dsp/percuter.h"

int main() {
    using namespace check;
    using mmb_dsp::Percuter;
    static int16_t data[6250];
    for (int i = 0; i < 6250; ++i) data[i] = static_cast<int16_t>(std::lround(100 * std::sin(2 * kPi * 1000.0 * i / 12500)) * 256);
    mmb_dsp::SampleSlot slots[1];
    slots[0].data = data; slots[0].frames = 6250; slots[0].channels = 1; slots[0].rate = 12500;   // 0,5 s
    for (const float rate : kRates) {
        for (const float tune : {0.0f, 12.0f}) {
            Percuter percuter;
            percuter.Init(rate);
            percuter.bind(slots, 1);
            percuter.setControl(Percuter::Filter, 0);
            percuter.setControl(Percuter::kTuneBase, tune);
            const int total = static_cast<int>(rate * 1);
            float outs[10][32];
            float* ptrs[10];
            for (int c = 0; c < 10; ++c) ptrs[c] = outs[c];
            int last = -1;
            for (int start = 0; start < total; start += 32) {
                const int frames = total - start < 32 ? total - start : 32;
                const bool trigger = start < 64;
                percuter.setCv(Percuter::kTrigBase, trigger ? 1.0f : 0.0f);
                percuter.setCv(Percuter::kTrigBase + 1, trigger ? 1.0f : 0.0f);
                percuter.Process(nullptr, ptrs, frames);
                for (int k = 0; k < frames; ++k) {
                    assert(std::isfinite(outs[0][k]) && std::fabs(outs[0][k]) <= 1 && std::fabs(outs[1][k]) <= 1);
                    assert(outs[3][k] == 0);                                     // kanaal 2: geen slot
                    const float v = outs[2][k];
                    assert(std::fabs(v * 128 - std::round(v * 128)) < 1e-4f);    // 8 bit
                    if (v != 0) last = start + k;
                }
            }
            const float expected = 0.5f / std::exp2(tune / 12);
            assert(std::fabs(last / rate - expected) < 0.01f);
        }
    }
    std::printf("PASS: length follows the cartridge and tuning, 8-bit output, empty slot silent, bounded, four rates; kernel %zu bytes\n", sizeof(Percuter));
}
