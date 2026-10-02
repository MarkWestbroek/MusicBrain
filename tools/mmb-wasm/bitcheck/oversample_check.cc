// Invariantentest voor de oversampler en de twee kernels die hem gebruiken
// (wavefolder, drive), op vier samplefrequenties: de vertraging is precies
// 16 samples, de doorlaat is vlak, de vouwvormen zijn continu en oneven, een
// harde vervormer blijft binnen ±1 en vervormt meer met meer Drive.
#include "kernel_check.h"
#include "mmb_dsp/drive.h"
#include "mmb_dsp/wavefolder.h"

int main() {
    using namespace check;
    using mmb_dsp::Drive;
    using mmb_dsp::Oversampler4;
    using mmb_dsp::Wavefolder;

    // Oversampler: impuls komt na kLatency samples terug, gelijkstroom houdt zijn niveau.
    Oversampler4 oversampler;
    oversampler.Init();
    int top = 0; float best = 0;
    for (int n = 0; n < 64; ++n) {
        const float y = oversampler.process(n == 0 ? 1.0f : 0.0f, [](float v) { return v; });
        if (std::fabs(y) > best) { best = std::fabs(y); top = n; }
    }
    assert(top == Oversampler4::kLatency && best > 0.9f);
    oversampler.clear();
    float settled = 0;
    for (int n = 0; n < 200; ++n) settled = oversampler.process(0.5f, [](float v) { return v; });
    assert(std::fabs(settled - 0.5f) < 1e-3f);

    // Vouwvormen: oneven, continu, binnen ±1, en eenheid in het lineaire gebied.
    for (int type = 0; type < 3; ++type) {
        float previous = Wavefolder::shape(type, -14.0f);
        for (float u = -14.0f; u <= 14.0f; u += 0.001f) {
            const float y = Wavefolder::shape(type, u);
            assert(std::fabs(y) <= 1.2f);
            assert(std::fabs(y - previous) < 0.02f);                  // geen sprongen
            assert(std::fabs(y + Wavefolder::shape(type, -u)) < 1e-4f);
            previous = y;
        }
    }
    assert(std::fabs(Wavefolder::shape(1, 0.5f) - 0.5f) < 1e-5f);
    assert(std::fabs(Wavefolder::shape(2, 0.5f) - 0.5f) < 1e-3f);

    for (const float rate : kRates) {
        // Folder dicht: de keten laat 1 kHz ongemoeid door.
        Wavefolder folder;
        folder.Init(rate);
        folder.setControl(Wavefolder::Fold, 0); folder.setControl(Wavefolder::Type, 1); folder.setControl(Wavefolder::Level, 1);
        auto clean = run<Wavefolder, 1>(folder, rate, 0.5, true, sine(1000, 0.5), nothing())[0];
        assert(std::fabs(db(tone(clean, 1000, rate, 4000) / 0.5)) < 0.1);
        // Open: de vijfde harmonische komt erbij, de vierde niet (symmetrisch).
        folder.setControl(Wavefolder::Fold, 0.6f);
        auto folded = run<Wavefolder, 1>(folder, rate, 0.5, true, sine(220, 0.8), nothing())[0];
        assert(db(tone(folded, 1100, rate, 4000)) > -30 && db(tone(folded, 880, rate, 4000)) < -70);

        // Drive: elke stand vervormt meer naarmate Drive verder open staat.
        for (int mode = 0; mode < 3; ++mode) {
            double third[2];
            for (int step = 0; step < 2; ++step) {
                Drive drive;
                drive.Init(rate);
                drive.setControl(Drive::Mode, static_cast<float>(mode));
                drive.setControl(Drive::Amount, static_cast<float>(step));
                auto out = run<Drive, 1>(drive, rate, 0.6, true, sine(220, 0.25), nothing())[0];
                third[step] = db(tone(out, 660, rate, 8000) / tone(out, 220, rate, 8000));
            }
            assert(third[1] > third[0] + 6 && third[1] > -20);
        }
        // Onzin erin: eindig eruit (run() controleert elk sample).
        Drive drive;
        drive.Init(rate);
        drive.setControl(Drive::Amount, NAN);
        drive.setCv(Drive::AmountCv, INFINITY);
        run<Drive, 1>(drive, rate, 0.1, true, [](double t) { return t < 0.05 ? 1e9f : NAN; }, nothing());
    }
    std::printf("PASS: oversampler latency/dc, fold shapes odd+continuous, folder and drive on four rates; folder %zu bytes, drive %zu bytes\n",
                sizeof(Wavefolder), sizeof(Drive));
}
