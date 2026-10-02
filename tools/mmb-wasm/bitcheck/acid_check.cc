// Invariantentest voor de acid-stem op vier samplefrequenties: de toonhoogte
// volgt V/Oct, de stem zwijgt na de gate (ook met volle resonantie: het
// filter zingt niet zelf), een accent is luider, en een slide bindt de noot
// (de envelope slaat niet opnieuw aan).
#include "kernel_check.h"
#include "mmb_dsp/acid.h"

int main() {
    using namespace check;
    using mmb_dsp::Acid;
    static_assert(sizeof(Acid) < 256, "Acid must stay a small kernel");
    for (const float rate : kRates) {
        const auto rms = [&](const std::vector<float>& a, double from, double to) {
            double sum = 0; int n = 0;
            for (int i = static_cast<int>(from * rate); i < static_cast<int>(to * rate); ++i) { sum += a[i] * a[i]; ++n; }
            return std::sqrt(sum / n);
        };
        // Eén noot C3, gate 0,5 s.
        double loud[2];
        for (int accent = 0; accent < 2; ++accent) {
            Acid acid;
            acid.Init(rate);
            acid.setControl(Acid::Resonance, 1);
            auto out = run<Acid, 1>(acid, rate, 1.2, false, silence(), [&](double t) {
                acid.setCv(Acid::Voct, -1);
                acid.setCv(Acid::AccentIn, static_cast<float>(accent));
                acid.setCv(Acid::Gate, t < 0.5 ? 1.0f : 0.0f);
            })[0];
            std::vector<float> held(out.begin() + static_cast<int>(0.05 * rate), out.begin() + static_cast<int>(0.45 * rate));
            assert(tone(held, 130.8128, rate) > 0.1);
            assert(tone(held, 130.8128 * 1.06, rate) < tone(held, 130.8128, rate) * 0.2);
            assert(rms(out, 0.7, 1.2) < 1e-3);                 // dicht = stil, ook met volle resonantie
            loud[accent] = rms(out, 0.02, 0.12);
        }
        assert(loud[1] > loud[0] * 1.1);

        // Slide: tweede noot zonder nieuwe aanslag; zonder slide wel.
        for (int slide = 0; slide < 2; ++slide) {
            Acid acid;
            acid.Init(rate);
            float envAfter = 0;
            run<Acid, 1>(acid, rate, 0.6, false, silence(), [&](double t) {
                acid.setCv(Acid::Voct, t < 0.4 ? -1.0f : 0.0f);
                acid.setCv(Acid::SlideIn, slide && t > 0.3 ? 1.0f : 0.0f);
                acid.setCv(Acid::Gate, t < 0.38 || t > 0.4 ? 1.0f : 0.0f);
                if (t > 0.42 && envAfter == 0) envAfter = acid.cvOut(Acid::Env);
            });
            if (slide) assert(envAfter < 0.5f); else assert(envAfter > 0.9f);
        }

        // Uitersten en onzin: run() controleert eindig en ±1.
        Acid wild;
        wild.Init(rate);
        for (int control = Acid::Cutoff; control <= Acid::Accent; ++control) wild.setControl(control, 99);
        run<Acid, 1>(wild, rate, 1, false, silence(), [&](double t) {
            wild.setCv(Acid::Voct, t < 0.5 ? 9.0f : NAN);
            wild.setCv(Acid::CutoffCv, INFINITY);
            wild.setCv(Acid::AccentIn, 1);
            wild.setCv(Acid::Gate, static_cast<int>(t * 40) % 2 ? 1.0f : 0.0f);
        });
    }
    std::printf("PASS: pitch follows V/Oct, silent after gate at full resonance, accent louder, slide ties, four rates; kernel %zu bytes\n", sizeof(Acid));
}
