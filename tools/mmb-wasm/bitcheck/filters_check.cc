// Invariantentest voor het SEM-filter, de wah en de ensemble op vier
// samplefrequenties: de filtervormen kloppen (laagdoorlaat, notch,
// hoogdoorlaat, bandpass), het SEM-filter zingt niet zelf, de wah-piek
// schuift met het pedaal, en de ensemble laat met Depth 0 de toon staan en
// verstemt hem met Depth open.
#include "kernel_check.h"
#include "mmb_dsp/ensemble.h"
#include "mmb_dsp/sem.h"
#include "mmb_dsp/wah.h"

namespace {
using namespace check;
using mmb_dsp::Ensemble;
using mmb_dsp::Sem;
using mmb_dsp::Wah;

double semGain(float rate, float mode, double hz, int output = 0, float resonance = 0.2f) {
    Sem sem;
    sem.Init(rate);
    sem.setControl(Sem::Mode, mode); sem.setControl(Sem::Level, 1); sem.setControl(Sem::Drive, 0);
    sem.setControl(Sem::Resonance, resonance);
    auto out = run<Sem, 2>(sem, rate, 0.5, true, sine(hz, 0.25), nothing());
    return db(tone(out[output], hz, rate, static_cast<size_t>(0.2 * rate)) / 0.25);
}
double wahGain(float rate, float pedal, double hz) {
    Wah wah;
    wah.Init(rate);
    wah.setControl(Wah::Pedal, pedal); wah.setControl(Wah::Level, 1);
    auto out = run<Wah, 1>(wah, rate, 0.5, true, sine(hz, 0.25), nothing());
    return db(tone(out[0], hz, rate, static_cast<size_t>(0.2 * rate)) / 0.25);
}
}  // namespace

int main() {
    static_assert(sizeof(Sem) < 128 && sizeof(Wah) < 128, "filters must stay tiny kernels");
    for (const float rate : kRates) {
        // SEM op 1 kHz.
        assert(std::fabs(semGain(rate, 0, 100)) < 0.5);
        const double slope = semGain(rate, 0, 2000) - semGain(rate, 0, 8000);
        assert(slope > 20 && slope < 28);                             // 12 dB per octaaf
        assert(std::fabs(semGain(rate, 1, 10000)) < 0.6 && semGain(rate, 1, 100) < -36);
        assert(semGain(rate, 0.5f, 1000) < -25 && std::fabs(semGain(rate, 0.5f, 100)) < 0.5);
        assert(semGain(rate, 0, 1000, 1, 0.6f) > semGain(rate, 0, 250, 1, 0.6f) + 15);
        Sem ringing;
        ringing.Init(rate);
        ringing.setControl(Sem::Resonance, 1); ringing.setControl(Sem::Drive, 1);
        auto tail = run<Sem, 2>(ringing, rate, 1, true, [](double t) { return t < 0.001 ? 1.0f : 0.0f; }, nothing())[0];
        for (size_t i = tail.size() / 2; i < tail.size(); ++i) assert(std::fabs(tail[i]) < 1e-5f);

        // Wah: hak laag, teen hoog.
        assert(wahGain(rate, 0, 400) > wahGain(rate, 0, 2200) + 20 && wahGain(rate, 0, 400) > 3);
        assert(wahGain(rate, 1, 2200) > wahGain(rate, 1, 400) + 15);

        // Ensemble: Depth 0 laat 440 Hz staan, open verstemt hij; links en rechts verschillen.
        for (int open = 0; open < 2; ++open) {
            Ensemble ensemble;
            ensemble.Init(rate);
            ensemble.setControl(Ensemble::Depth, open ? 0.7f : 0.0f);
            ensemble.setControl(Ensemble::Mix, 1); ensemble.setControl(Ensemble::Level, 1); ensemble.setControl(Ensemble::Tone, 1);
            const int total = static_cast<int>(rate * 3);
            std::vector<float> left(total), right(total);
            float in[32], outL[32], outR[32];
            const float* ins[2] = {in, nullptr};
            float* outs[2] = {outL, outR};
            for (int start = 0; start < total; start += 32) {
                const int frames = total - start < 32 ? total - start : 32;
                for (int k = 0; k < frames; ++k) in[k] = static_cast<float>(0.5 * std::sin(2 * kPi * 440 * (start + k) / rate));
                ensemble.Process(ins, outs, frames);
                for (int k = 0; k < frames; ++k) {
                    assert(std::isfinite(outL[k]) && std::fabs(outL[k]) <= 1 && std::fabs(outR[k]) <= 1);
                    left[start + k] = outL[k]; right[start + k] = outR[k];
                }
            }
            const double carrier = db(tone(left, 440, rate, static_cast<size_t>(0.5 * rate)) / 0.5);
            double difference = 0;
            for (int i = total / 2; i < total; ++i) difference += std::fabs(left[i] - right[i]);
            difference /= total / 2;
            if (open) assert(carrier < -12 && difference > 0.1);
            else assert(std::fabs(carrier) < 1.5 && difference < 1e-4);
        }
    }
    std::printf("PASS: SEM LP/notch/HP/BP at 12 dB/oct and no self-oscillation, wah peak follows the pedal, ensemble detunes and widens, four rates; sem %zu, wah %zu, ensemble %zu bytes\n",
                sizeof(Sem), sizeof(Wah), sizeof(Ensemble));
}
