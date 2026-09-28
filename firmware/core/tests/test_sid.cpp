// CTest — mmb_dsp::SidChip / SidSynth (doc/plans/sid.md, stap 1 + 2):
//  - toonhoogte, pulsbreedte, LFSR tegen een eigen referentie
//  - ADSR-tijden (datasheet) en de ADSR-bug (15-bit rate-teller)
//  - sync, ring-mod, PolyBLEP-aliasing, test-bit, V/oct in SidSynth
#include "test_harness.h"
#include "mmb_dsp/sid.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <initializer_list>
#include <vector>

using mmb_dsp::SidChip;

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr float  kFs = 44100.f;

void setFreq(SidChip& c, int v, double hz) {
    const unsigned r = unsigned(hz * 16777216.0 / c.clock() + 0.5);
    c.write(v * 7, r & 0xff);
    c.write(v * 7 + 1, r >> 8);
}
void setPw(SidChip& c, int v, unsigned pw) { c.write(v * 7 + 2, pw & 0xff); c.write(v * 7 + 3, (pw >> 8) & 15); }
void sustainFull(SidChip& c, int v) { c.write(v * 7 + 5, 0x00); c.write(v * 7 + 6, 0xf0); }
SidChip fresh() { SidChip c; c.Init(kFs); c.write(0x18, 15); return c; }

std::vector<float> render(SidChip& c, int n) {
    std::vector<float> y(n);
    for (auto& s : y) s = c.Process();
    return y;
}
int risingZeroCrossings(const std::vector<float>& y, int from) {
    int zc = 0;
    for (size_t i = from + 1; i < y.size(); ++i) if (y[i - 1] < 0 && y[i] >= 0) ++zc;
    return zc;
}
/** Amplitude van de component op @p f (Goertzel), vanaf sample @p from. */
double tone(const std::vector<float>& x, double f, int from) {
    const double w = 2 * kPi * f / kFs, k = 2 * std::cos(w);
    double s1 = 0, s2 = 0;
    for (size_t i = from; i < x.size(); ++i) { const double s = x[i] + k * s1 - s2; s2 = s1; s1 = s; }
    const double re = s1 - s2 * std::cos(w), im = s2 * std::sin(w);
    return std::sqrt(re * re + im * im) / double(x.size() - from);
}

}  // namespace

MB_TEST(sid_pitch_saw_440) {
    SidChip c = fresh(); setFreq(c, 0, 440); sustainFull(c, 0);
    c.write(4, SidChip::kSaw | SidChip::kGate);
    auto y = render(c, 44100 + 4410);
    const int zc = risingZeroCrossings(y, 4410);
    std::printf("        saw 440 Hz: %d nuldoorgangen/s\n", zc);
    MB_REQUIRE(std::abs(zc - 440) <= 1);
    float peak = 0; for (size_t i = 4410; i < y.size(); ++i) peak = std::max(peak, std::abs(y[i]));
    MB_REQUIRE(peak > 0.8f && peak < 1.2f);
}

MB_TEST(sid_pulse_width) {
    // pw 1024/4096: de uitgang is hoog zolang acc ≥ pw → 75 % van de tijd.
    SidChip c = fresh(); setFreq(c, 0, 220); sustainFull(c, 0); setPw(c, 0, 1024);
    c.write(4, SidChip::kPulse | SidChip::kGate);
    auto y = render(c, 44100);
    int hi = 0, n = 0;
    for (int i = 4410; i < 44100; ++i) { hi += y[i] > 0; ++n; }
    std::printf("        pulse hoog %.3f van de tijd\n", double(hi) / n);
    MB_REQUIRE(std::abs(double(hi) / n - 0.75) < 0.01);
}

MB_TEST(sid_noise_lfsr_matches_reference) {
    // De LFSR moet precies zo vaak geklokt zijn als bit 19 van de accumulator
    // is gestegen — dat toetst de gebeurtenissen-boekhouding per sample.
    SidChip c = fresh(); const unsigned freq = 0x1234;
    c.write(0, freq & 0xff); c.write(1, freq >> 8); sustainFull(c, 0);
    c.write(4, SidChip::kNoise | SidChip::kGate);
    const int N = 20000;
    render(c, N);
    const double total24 = double(freq) * (c.clock() / kFs) * N;
    const long long rises = total24 >= 524288.0 ? (long long)std::floor((total24 - 524288.0) / 1048576.0) + 1 : 0;
    uint32_t l = 0x7ffff8;
    for (long long i = 0; i < rises; ++i) l = ((l << 1) | (((l >> 22) ^ (l >> 17)) & 1)) & 0x7fffff;
    std::printf("        LFSR na %lld klokken: %06x (ref %06x)\n", rises, unsigned(c.lfsr(0)), unsigned(l));
    MB_REQUIRE(c.lfsr(0) == l);
    auto y = render(c, 8192);
    double e = 0; for (float s : y) e += s * s;
    MB_REQUIRE(e / y.size() > 0.05);
}

MB_TEST(sid_adsr_datasheet_times) {
    // Attack 0: 255 stappen × 9 cycli ≈ 2,3 ms; decay 0 van 255 naar 0 met
    // het exponentiële verval ≈ 6,9 ms (datasheet: 2 ms / 6 ms).
    {
        SidChip c = fresh(); setFreq(c, 0, 440); c.write(5, 0x00); c.write(6, 0x00);
        c.write(4, SidChip::kSaw | SidChip::kGate);
        int n = 0; while (c.envState(0) == SidChip::kAttack && n < 100000) { c.Process(); ++n; }
        const double ms = n * 1000.0 / kFs;
        std::printf("        attack 0: %.2f ms\n", ms);
        MB_REQUIRE(std::abs(ms - 255.0 * 9 / c.clock() * 1000.0) < 0.05);
        int m = 0; while (c.env(0) > 0 && m < 100000) { c.Process(); ++m; }
        const double dms = m * 1000.0 / kFs;
        std::printf("        decay 0 naar nul: %.2f ms\n", dms);
        MB_REQUIRE(dms > 6.0 && dms < 7.5);
    }
    {
        // Attack 15: 255 × 31251 cycli ≈ 8,1 s (datasheet: 8 s).
        SidChip c = fresh(); c.write(5, 0xf0); c.write(6, 0xf0); c.write(4, SidChip::kSaw | SidChip::kGate);
        int n = 0; while (c.envState(0) == SidChip::kAttack && n < 600000) { c.Process(); ++n; }
        std::printf("        attack 15: %.3f s\n", n / kFs);
        MB_REQUIRE(std::abs(n / kFs - 255.0 * 31251 / c.clock()) < 0.005);
    }
}

MB_TEST(sid_adsr_bug_rate_counter_wrap) {
    // 10 ms op attack 15 (de rate-teller staat dan op ~9850, onder de periode
    // van 31251), dan attack 0 (periode 9): de teller is al voorbij 9 en moet
    // eerst rond de 15 bits — de eerste stap komt pas na ~23 ms.
    SidChip c = fresh(); c.write(5, 0xf0); c.write(6, 0xf0); c.write(4, SidChip::kSaw | SidChip::kGate);
    render(c, 441);
    const int e0 = c.env(0);
    c.write(5, 0x00);
    int n = 0; while (c.env(0) == e0 && n < 10000) { c.Process(); ++n; }
    const double ms = n * 1000.0 / kFs;
    std::printf("        eerste stap na %.1f ms (zonder de bug < 0,1 ms)\n", ms);
    MB_REQUIRE(ms > 15.0 && ms < 30.0);
}

MB_TEST(sid_hard_sync) {
    // Stem 2 (saw 700 Hz) gesynct door stem 1 (200 Hz, zelf stil) → grondtoon 200 Hz.
    for (int sync = 0; sync < 2; ++sync) {
        SidChip c = fresh(); setFreq(c, 0, 200); setFreq(c, 1, 700); sustainFull(c, 1);
        c.write(11, SidChip::kSaw | SidChip::kGate | (sync ? SidChip::kSync : 0));
        const double g = tone(render(c, 22050), 200, 2205);
        std::printf("        %s: component op 200 Hz %.4f\n", sync ? "sync" : "zonder sync", g);
        MB_REQUIRE(sync ? g > 0.05 : g < 0.01);
    }
}

MB_TEST(sid_ring_mod) {
    // Stem 2 tri 500 Hz, geringd door de MSB van stem 1 (130 Hz) → zijbanden op 500 ± 130.
    for (int ring = 0; ring < 2; ++ring) {
        SidChip c = fresh(); setFreq(c, 0, 130); setFreq(c, 1, 500); sustainFull(c, 1);
        c.write(11, SidChip::kTri | SidChip::kGate | (ring ? SidChip::kRing : 0));
        auto y = render(c, 22050);
        const double g = tone(y, 630, 2205) + tone(y, 370, 2205);
        std::printf("        %s: zijbanden %.4f\n", ring ? "ring" : "zonder ring", g);
        MB_REQUIRE(ring ? g > 0.05 : g < 0.01);
    }
}

MB_TEST(sid_polyblep_reduces_aliasing) {
    // Saw 3 kHz: harmonische 9 (27 kHz) spiegelt naar 17,1 kHz. Naïef is die
    // 1/9 van de grondtoon (0,111); de 2-punts PolyBLEP drukt hem ~4× omlaag.
    SidChip c = fresh(); setFreq(c, 0, 3000); sustainFull(c, 0); c.write(4, SidChip::kSaw | SidChip::kGate);
    auto y = render(c, 22050);
    const double ratio = tone(y, kFs - 9 * 3000, 2205) / tone(y, 3000, 2205);
    std::printf("        alias 17,1 kHz / grondtoon = %.4f (naïef 0,111)\n", ratio);
    MB_REQUIRE(ratio < 0.04);
    for (float s : y) MB_REQUIRE(std::isfinite(s) && std::abs(s) < 1.6f);
}

MB_TEST(sid_combined_waveforms_and_test_bit) {
    SidChip c = fresh(); setFreq(c, 0, 330); sustainFull(c, 0); setPw(c, 0, 2048);
    c.write(4, SidChip::kTri | SidChip::kSaw | SidChip::kPulse | SidChip::kGate);
    for (float s : render(c, 4410)) MB_REQUIRE(std::isfinite(s));
    c.write(4, SidChip::kSaw | SidChip::kTest | SidChip::kGate);
    render(c, 100);
    MB_REQUIRE(c.acc(0) == 0);
}

MB_TEST(sid_synth_voct_c5) {
    // SidSynth: V/oct rond C4 (0 V = 261,63 Hz), dus 1 V = C5 = 523,25 Hz.
    mmb_dsp::SidSynth s; s.Init(kFs);
    s.setWave(SidChip::kSaw); s.setAttack(0); s.setSustain(15);
    s.setVoct(0, 1.0f); s.gate(0, true);
    std::vector<float> y(44100 + 4410);
    for (auto& v : y) v = s.Process();
    const int zc = risingZeroCrossings(y, 4410);
    std::printf("        voct 1 → %d nuldoorgangen/s\n", zc);
    MB_REQUIRE(std::abs(zc - 523) <= 1);
}

MB_TEST(sid_dc_blocker_centres_combined_waveforms) {
    // Tri+pulse ligt met pw 3072 het grootste deel van de periode op de bodem
    // van de DAC (naïef DC −0,875); de koppelcondensator (10 Hz) haalt dat weg
    // en laat het wisselende deel staan.
    SidChip c = fresh(); c.setCombo(0.f);           // zuivere AND: de grootste DC
    setFreq(c, 0, 220); sustainFull(c, 0); setPw(c, 0, 3072);
    c.write(4, SidChip::kTri | SidChip::kPulse | SidChip::kGate);
    auto y = render(c, 44100);
    double s = 0, s2 = 0; const int from = 22050;
    for (int i = from; i < 44100; ++i) { s += y[i]; s2 += double(y[i]) * y[i]; }
    const double n = 44100 - from, dc = s / n, ac = std::sqrt(s2 / n - dc * dc);
    std::printf("        tri+pulse pw 75 %%: dc %+.4f, ac %.3f\n", dc, ac);
    MB_REQUIRE(std::abs(dc) < 0.01);
    MB_REQUIRE(ac > 0.2);
}

MB_TEST(sid_combo_zero_is_exact_and) {
    // Knop op 0: het bitlijn-model is exact de AND van de 12-bit golfvormen.
    SidChip c = fresh(); c.setCombo(0.f);
    for (uint32_t a = 0; a < 4096; ++a) {
        const uint32_t msb = (a >> 11) & 1u;
        const uint32_t tri = ((a << 1) ^ (msb ? 0xffeu : 0u)) & 0xffeu;
        MB_REQUIRE(c.combinedValue(SidChip::kTri | SidChip::kSaw, a, false, 0, true) == (tri & a) * 16u);
        MB_REQUIRE(c.combinedValue(SidChip::kSaw | SidChip::kPulse, a, false, 0, true) == a * 16u);
    }
}

MB_TEST(sid_combo_weakens_from_and_via_8580_to_6581) {
    // Het niveau van een combinatie daalt over de knop: AND > 8580 > 6581 > 10,
    // en blijft hoorbaar (op het oor gekozen doelen, zie SidChip::combinedModel).
    const int combos[2] = { SidChip::kTri | SidChip::kSaw, SidChip::kTri | SidChip::kPulse };
    for (int w : combos) {
        double prev = 1e9, and0 = 0;
        for (float knob : { 0.f, 4.f, 7.f, 10.f }) {
            SidChip c = fresh(); c.setCombo(knob);
            setFreq(c, 0, 220); sustainFull(c, 0); setPw(c, 0, 2048);
            c.write(4, static_cast<uint8_t>(w | SidChip::kGate));
            auto y = render(c, 22050);
            double s2 = 0; for (int i = 8820; i < 22050; ++i) s2 += double(y[i]) * y[i];
            const double lvl = std::sqrt(s2 / (22050 - 8820));
            if (knob == 0.f) and0 = lvl;
            std::printf("        golf %02x combo %2.0f: %.3f (%.0f %% van AND)\n", w, knob, lvl, 100 * lvl / and0);
            MB_REQUIRE(lvl < prev);
            MB_REQUIRE(lvl > 0.15 * and0);
            prev = lvl;
        }
    }
}

MB_TEST(sid_noise_dies_in_combination_and_revives) {
    // Noise + saw: de uitgang schrijft terug in de LFSR en de ruis sterft uit.
    mmb_dsp::SidSynth s; s.Init(kFs);
    s.setAttack(0); s.setSustain(15);
    s.setWave(SidChip::kNoise | SidChip::kSaw); s.setVoct(0, 1.f); s.gate(0, true);
    for (int i = 0; i < 44100; ++i) s.Process();
    std::printf("        LFSR na 1 s noise+saw: %06x\n", unsigned(s.chip().lfsr(0)));
    MB_REQUIRE(s.chip().lfsr(0) == 0);
    // Terug naar alleen noise: de test-bit zet de LFSR terug, er is weer ruis.
    s.setWave(SidChip::kNoise);
    double e = 0; for (int i = 0; i < 22050; ++i) { const float y = s.Process(); if (i > 4410) e += double(y) * y; }
    std::printf("        daarna alleen noise: rms² %.4f\n", e / (22050 - 4411));
    MB_REQUIRE(s.chip().lfsr(0) != 0);
    MB_REQUIRE(e / (22050 - 4411) > 0.01);
}

namespace {
/** Cutoffregister voor een frequentie in het 8580-model. */
int fcReg(double hz) { return int((hz - 30.0) * 2047.0 / (12000.0 - 30.0) + 0.5); }
/** Stem 1 als saw op @p f0; filter met cutoff @p fc, mode @p mode ($18-bits), res @p res. */
std::vector<float> filteredSaw(double f0, double fc, uint8_t mode, int res, bool route = true) {
    SidChip c = fresh(); c.setFilterModel(SidChip::kModel8580);
    setFreq(c, 0, f0); sustainFull(c, 0);
    const int r = fcReg(fc);
    c.write(0x15, r & 7); c.write(0x16, uint8_t(r >> 3));
    c.write(0x17, uint8_t((res << 4) | (route ? 0x01 : 0x00)));
    c.write(0x18, uint8_t(mode | 15));
    c.write(4, SidChip::kSaw | SidChip::kGate);
    return render(c, 22050);
}
}  // namespace

MB_TEST(sid_filter_cutoff_mapping_8580) {
    MB_REQUIRE(std::abs(SidChip::cutoffHz8580(0) - 30.f) < 0.01f);
    MB_REQUIRE(std::abs(SidChip::cutoffHz8580(2047) - 12000.f) < 0.5f);
    MB_REQUIRE(std::abs(SidChip::resonanceQ8580(0) - 0.7071f) < 0.001f);
    MB_REQUIRE(SidChip::resonanceQ8580(15) > 3.5f && SidChip::resonanceQ8580(15) < 4.5f);
}

MB_TEST(sid_filter_lowpass_and_highpass) {
    const auto dry = filteredSaw(220, 500, 0x10, 0, false);   // niet door het filter
    const auto lp  = filteredSaw(220, 500, 0x10, 0);
    const auto hp  = filteredSaw(220, 2000, 0x40, 0);
    const double d1 = tone(dry, 220, 4410), d10 = tone(dry, 2200, 4410);
    const double l1 = tone(lp, 220, 4410),  l10 = tone(lp, 2200, 4410);
    const double h1 = tone(hp, 220, 4410),  h10 = tone(hp, 2200, 4410);
    std::printf("        LP 500 Hz: grondtoon %.2f×, 10e harmonische %.3f×\n", l1 / d1, l10 / d10);
    std::printf("        HP 2 kHz:  grondtoon %.3f×, 10e harmonische %.2f×\n", h1 / d1, h10 / d10);
    MB_REQUIRE(l1 / d1 > 0.7 && l1 / d1 < 1.3);          // grondtoon onder de cutoff blijft
    MB_REQUIRE(l10 / d10 < 0.08);                        // 2-polig: ~2 oct boven fc ≈ −22 dB of meer
    MB_REQUIRE(h1 / d1 < 0.03);                          // HP haalt de grondtoon weg
    MB_REQUIRE(h10 / d10 > 0.6);
}

MB_TEST(sid_filter_resonance_and_modes) {
    // Resonantie tilt de harmonische bij de cutoff op (saw 110 Hz, fc 880 Hz = 8e).
    const double r0 = tone(filteredSaw(110, 880, 0x10, 0), 880, 4410);
    const double r15 = tone(filteredSaw(110, 880, 0x10, 15), 880, 4410);
    std::printf("        res 15 / res 0 op de cutoff: %.2f×\n", r15 / r0);
    MB_REQUIRE(r15 / r0 > 2.5);
    // Door het filter zonder mode: stil (zoals op de chip).
    const auto none = filteredSaw(220, 1000, 0x00, 0);
    double e = 0; for (int i = 4410; i < (int)none.size(); ++i) e += double(none[i]) * none[i];
    MB_REQUIRE(e / (none.size() - 4410) < 1e-6);
    // LP+HP = notch: de component op de cutoff zakt weg t.o.v. LP alleen.
    const double lp = tone(filteredSaw(110, 880, 0x10, 0), 880, 4410);
    const double notch = tone(filteredSaw(110, 880, 0x50, 0), 880, 4410);
    std::printf("        notch/LP op de cutoff: %.3f×\n", notch / lp);
    MB_REQUIRE(notch / lp < 0.2);
}

MB_TEST(sid_filter_ext_in) {
    // EXT IN (1 kHz sinus) door een LP op 200 Hz: sterk gedempt; zonder FILT EX droog.
    for (int routed = 0; routed < 2; ++routed) {
        SidChip c = fresh(); c.setFilterModel(SidChip::kModel8580);
        const int r = fcReg(200);
        c.write(0x15, r & 7); c.write(0x16, uint8_t(r >> 3));
        c.write(0x17, routed ? 0x08 : 0x00); c.write(0x18, 0x10 | 15);
        std::vector<float> y(22050);
        for (int i = 0; i < 22050; ++i) y[i] = c.Process(0.5f * float(std::sin(2 * kPi * 1000.0 * i / kFs)));
        const double a = tone(y, 1000, 4410);
        std::printf("        EXT IN 1 kHz %s: %.3f\n", routed ? "door LP 200 Hz" : "droog", a);
        MB_REQUIRE(routed ? a < 0.02 : a > 0.2);
    }
}

MB_TEST(sid_filter_6581_s_curve) {
    // Onderaan blijft de 6581 rond ~220 Hz hangen, in het midden loopt hij
    // steil op; Curve schuift dat midden (helder ↔ donker exemplaar).
    float prev = 0.f;
    for (int r = 0; r <= 2047; r += 64) { const float f = SidChip::cutoffHz6581(r, 0.5f); MB_REQUIRE(f >= prev); prev = f; }
    const float f0 = SidChip::cutoffHz6581(0, 0.5f), f200 = SidChip::cutoffHz6581(200, 0.5f);
    const float f1024 = SidChip::cutoffHz6581(1024, 0.5f), f2047 = SidChip::cutoffHz6581(2047, 0.5f);
    std::printf("        6581: reg 0 → %.0f Hz, 200 → %.0f Hz, 1024 → %.0f Hz, 2047 → %.0f Hz\n", f0, f200, f1024, f2047);
    MB_REQUIRE(std::abs(f0 - 220.f) < 1.f && f200 < 500.f && f1024 > 3000.f && f2047 > 15000.f);
    MB_REQUIRE(SidChip::cutoffHz6581(1024, 0.f) > SidChip::cutoffHz6581(1024, 1.f));
    MB_REQUIRE(SidChip::resonanceQ6581(15) < SidChip::resonanceQ8580(15));
}

MB_TEST(sid_filter_6581_distorts_more_than_8580) {
    // Een hard EXT IN-signaal (sinus 200 Hz, 0,9) door een open lowpass: de
    // 6581 maakt duidelijk meer 3e harmonische dan de schone 8580.
    double h3[2];
    for (int m = 0; m < 2; ++m) {
        SidChip c = fresh(); c.setFilterModel(m == 0 ? SidChip::kModel6581 : SidChip::kModel8580);
        c.write(0x15, 7); c.write(0x16, 0xff); c.write(0x17, 0x08); c.write(0x18, 0x10 | 15);
        std::vector<float> y(22050);
        for (int i = 0; i < 22050; ++i) y[i] = c.Process(0.9f * float(std::sin(2 * kPi * 200.0 * i / kFs)));
        h3[m] = tone(y, 600, 4410) / tone(y, 200, 4410);
    }
    std::printf("        3e harmonische / grondtoon: 6581 %.4f, 8580 %.5f\n", h3[0], h3[1]);
    MB_REQUIRE(h3[0] > 0.01);
    MB_REQUIRE(h3[0] > 10 * h3[1]);
}

MB_TEST(sid_6581_volume_click) {
    // De volume-DAC voert op de 6581 een gelijkspanning mee: volume 15 → 0
    // geeft een stap (de digi-truc). Op de 8580 blijft het stil.
    double peak[2];
    for (int m = 0; m < 2; ++m) {
        SidChip c = fresh(); c.setFilterModel(m == 0 ? SidChip::kModel6581 : SidChip::kModel8580);
        render(c, 4410);                                   // DC-blokker ingeslingerd
        c.write(0x18, 0);
        float p = 0; for (float v : render(c, 441)) p = std::max(p, std::abs(v));
        peak[m] = p;
    }
    std::printf("        volume-klik: 6581 %.3f, 8580 %.4f\n", peak[0], peak[1]);
    MB_REQUIRE(peak[0] > 0.1 && peak[1] < 0.001);
}

MB_TEST(sid_synth_init_without_click) {
    // SidSynth start in de 6581-stand zonder tik: de DC-blokker staat al op
    // de gelijkspanning van de volume-DAC.
    mmb_dsp::SidSynth s; s.Init(kFs);
    float p = 0; for (int i = 0; i < 4410; ++i) p = std::max(p, std::abs(s.Process()));
    std::printf("        stilte na Init: piek %.5f\n", p);
    MB_REQUIRE(p < 0.001f);
}

MB_TEST(sid_synth_stack_and_split) {
    // Stack: V/oct en gate van stem 1 sturen alle drie, elk met eigen coarse
    // (0, +7, −12 halve tonen) → componenten op C4, G4 en C3.
    mmb_dsp::SidSynth s; s.Init(kFs); s.setModel(SidChip::kModel8580);
    s.setWave(SidChip::kTri); s.setAttack(0); s.setSustain(15);
    s.setCoarse(1, 7.f); s.setCoarse(2, -12.f);
    s.setStack(true); s.setVoct(0, 0.f); s.gate(0, true);
    std::vector<float> y(22050);
    for (auto& v : y) v = s.Process();
    const double c4 = tone(y, 261.63, 4410), g4 = tone(y, 392.0, 4410), c3 = tone(y, 130.81, 4410);
    std::printf("        stack: C4 %.3f  G4 %.3f  C3 %.3f\n", c4, g4, c3);
    MB_REQUIRE(c4 > 0.05 && g4 > 0.05 && c3 > 0.05);
    // Split: stem 2 en 3 zonder eigen gate blijven stil; alleen C4 klinkt.
    mmb_dsp::SidSynth t; t.Init(kFs); t.setModel(SidChip::kModel8580);
    t.setWave(SidChip::kTri); t.setAttack(0); t.setSustain(15);
    t.setCoarse(1, 7.f); t.setCoarse(2, -12.f);
    t.setVoct(0, 0.f); t.gate(0, true);
    for (auto& v : y) v = t.Process();
    const double sg4 = tone(y, 392.0, 4410), sc3 = tone(y, 130.81, 4410);
    std::printf("        split: G4 %.4f  C3 %.4f\n", sg4, sc3);
    MB_REQUIRE(sg4 < 0.005 && sc3 < 0.005);
}
