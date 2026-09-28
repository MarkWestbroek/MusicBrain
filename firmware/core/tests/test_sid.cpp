// CTest — mmb_dsp::SidChip / SidSynth (doc/plans/sid.md, stap 1 + 2):
//  - toonhoogte, pulsbreedte, LFSR tegen een eigen referentie
//  - ADSR-tijden (datasheet) en de ADSR-bug (15-bit rate-teller)
//  - sync, ring-mod, PolyBLEP-aliasing, test-bit, V/oct in SidSynth
#include "test_harness.h"
#include "mmb_dsp/sid.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
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
    float peak = 0; for (float s : y) peak = std::max(peak, std::abs(s));
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
    SidChip c = fresh(); setFreq(c, 0, 220); sustainFull(c, 0); setPw(c, 0, 3072);
    c.write(4, SidChip::kTri | SidChip::kPulse | SidChip::kGate);
    auto y = render(c, 44100);
    double s = 0, s2 = 0; const int from = 22050;
    for (int i = from; i < 44100; ++i) { s += y[i]; s2 += double(y[i]) * y[i]; }
    const double n = 44100 - from, dc = s / n, ac = std::sqrt(s2 / n - dc * dc);
    std::printf("        tri+pulse pw 75 %%: dc %+.4f, ac %.3f\n", dc, ac);
    MB_REQUIRE(std::abs(dc) < 0.01);
    MB_REQUIRE(ac > 0.2);
}
