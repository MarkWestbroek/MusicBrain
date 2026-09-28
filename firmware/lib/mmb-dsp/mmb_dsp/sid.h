#pragma once
/**
 * @file sid.h
 * @brief SID (MOS 6581/8580): eigen emulatie op registerniveau + een
 *        besturingslaag die V/oct, gate en knoppen in registers vertaalt.
 *
 * Clean-room: geschreven vanuit de openbare documentatie (datasheet, C64
 * Programmer's Reference Guide, gepubliceerde beschrijvingen van het gedrag)
 * — níet vanuit reSID/reSIDfp (GPL). Zie doc/plans/sid.md.
 *
 * Wat er in deze stap zit (plan §2, stap 1 + 2):
 *  - drie stemmen: 24-bit fase-accumulator, golfvormen tri/saw/pulse/noise,
 *    ring-mod en hard sync (bron = de vorige stem, cyclisch 3 → 1 → 2 → 3),
 *    test-bit;
 *  - combined waveforms via een eigen bitlijn-model (zie combinedModel):
 *    elke uitgangsbit is een gewogen stemming van de gekozen golfvorm-bits
 *    eromheen, waarin een 0 harder trekt dan een 1. Eén knop (`setCombo`,
 *    0..10) schuift van zuivere AND (0) via de 8580 (4) naar de 6581 (7) en
 *    verder. Combineer je noise, dan schrijft de uitgang terug in de LFSR en
 *    sterft de ruis uit, zoals op de chip (noise-combinaties rekenen als
 *    zuivere AND: goedkoop, en de ruis is er toch snel uit);
 *  - noise: 23-bit LFSR (terugkoppeling bits 22 ^ 17), geklokt op de
 *    stijgende flank van accumulator-bit 19, 8 uitgangsbits;
 *  - ADSR per stem, cycle-exact als integer-toestandsmachine: de periodetabel,
 *    het pseudo-exponentiële verval (knikpunten 93/54/26/14/6) en de 15-bit
 *    rate-teller — waardoor de ADSR-bug vanzelf ontstaat;
 *  - het filter: een 2-polig state-variable filter (ZDF/TPT, 12 dB/oct) met
 *    LP/BP/HP combineerbaar (LP+HP = notch), routing per stem en EXT IN, in
 *    twee modellen (setFilterModel):
 *      8580 — cutoff vrijwel lineair ~30 Hz … ~12 kHz, resonantie tot Q ≈ 4,
 *             schoon;
 *      6581 — cutoff op een S-curve (onderaan ~220 Hz, in het midden steil,
 *             spreiding per exemplaar via setCurve), minder resonantie (tot
 *             Q ≈ 2,1), zachte begrenzing op de ingang en de bandpass-
 *             toestand (grommende resonantie), plus DC per stem (doffe tik bij
 *             het aanslaan) en een DC-term in de volume-DAC (volume-klik,
 *             waarmee C64-spellen samples speelden).
 *    Alle mappings op het oor, niet gemeten;
 *  - 4-bit master volume en 3OFF;
 *  - een DC-blokker op de uitgang (eerste-orde hoogdoorlaat, 10 Hz): de rol
 *    van de koppelcondensator op de C64. Combined waveforms liggen vaak op de
 *    bodem van de DAC en geven anders een gelijkspanning die met de PW
 *    meezwaait.
 * Nog niet: metingen aan echte chips (filtercurves, combined waveforms,
 * DC-niveaus); alle modelparameters zijn op het oor gekozen.
 *
 * Band-limited: niet cycle-exact. Per audio-sample schuift de accumulator
 * ~22 SID-cycli door; elke sprong in de golfvorm (wrap, pulsflank, sync-reset,
 * ring-omslag, noise-klok) krijgt een PolyBLEP op zijn exacte tijdstip. Dat
 * kost één sample latentie.
 */

#include <cmath>
#include <cstdint>
#include <memory>

#include "mmb_dsp/limiter.h"

namespace mmb_dsp {

class SidChip {
public:
    static constexpr double kClockPal  = 985248.0;
    static constexpr double kClockNtsc = 1022727.0;
    static constexpr int    kNumRegs   = 25;          // $00..$18 (schrijfbaar)

    // Registerbits van het besturingsregister (stem-offset +4).
    enum : uint8_t {
        kGate = 0x01, kSync = 0x02, kRing = 0x04, kTest = 0x08,
        kTri  = 0x10, kSaw  = 0x20, kPulse = 0x40, kNoise = 0x80,
    };

    void Init(float sampleRate, double clock = kClockPal) {
        fs_ = sampleRate;
        clock_ = clock;
        cyclesPerSample_ = clock / sampleRate;
        cyclesPerSampleF_ = static_cast<float>(cyclesPerSample_);
        dcR_ = std::exp(-2.0f * 3.14159265f * kDcBlockHz / sampleRate);
        setCombo(kComboDefault);
        Reset();
    }

    /** Cutoff in Hz bij een 11-bit registerwaarde (8580-model). */
    static float cutoffHz8580(int reg) {
        return kFcLo + static_cast<float>(reg < 0 ? 0 : (reg > 2047 ? 2047 : reg)) * ((kFcHi - kFcLo) / 2047.0f);
    }
    /** Q bij een 4-bit resonantiewaarde (8580-model): 0,707 … ≈ 4. */
    static float resonanceQ8580(int res) {
        return 0.7071f * std::exp2(static_cast<float>(res & 15) * (kResOctaves / 15.0f));
    }

    /**
     * Cutoff in Hz bij een 11-bit registerwaarde (6581-model): een S-curve
     * tussen ~220 Hz en ~16 kHz. @p curve (0..1) schuift het steile midden:
     * 0 = helder exemplaar, 1 = donker exemplaar, 0,5 = gemiddeld.
     */
    static float cutoffHz6581(int reg, float curve) {
        const float x = static_cast<float>(reg < 0 ? 0 : (reg > 2047 ? 2047 : reg)) / 2047.0f;
        const float m = 0.55f + (curve - 0.5f) * 0.3f;
        auto sig = [&](float t) { return 1.0f / (1.0f + std::exp(-kCurveSteep * (t - m))); };
        const float lo = sig(0.0f), hi = sig(1.0f);
        return kFcLo6581 + (kFcHi6581 - kFcLo6581) * (sig(x) - lo) / (hi - lo);
    }
    /** Q bij een 4-bit resonantiewaarde (6581-model): 0,707 … ≈ 2,1. */
    static float resonanceQ6581(int res) {
        return 0.7071f * std::exp2(static_cast<float>(res & 15) * (kResOctaves6581 / 15.0f));
    }

    enum FilterModel { kModel6581 = 0, kModel8580 = 1 };
    /** Filter- en uitgangsmodel van de chip (6581 of 8580). */
    void setFilterModel(int m) { model_ = m == kModel8580 ? kModel8580 : kModel6581; updateFilter(); }
    int  filterModel() const   { return model_; }
    /** Spreiding van de 6581-cutoffcurve per exemplaar, 0..1 (0,5 = gemiddeld). */
    void setCurve(float c)     { curve_ = c < 0.f ? 0.f : (c > 1.f ? 1.f : c); updateFilter(); }
    /** Zet de DC-blokker op de huidige vaste gelijkspanning (6581: de
     *  volume-DAC), zodat het laden van een patch geen tik geeft. */
    void settleDc() {
        dcX1_ = model_ == kModel6581 ? kMixDc6581 * static_cast<float>(regs_[0x18] & 0x0f) * (1.0f / 15.0f) : 0.0f;
        dcY1_ = 0.0f;
    }

    void Reset() {
        for (auto& r : regs_) r = 0;
        for (auto& v : voice_) v = Voice{};
        cycleFrac_ = 0.0f;
        dcX1_ = dcY1_ = 0.0f;
        ic1_ = ic2_ = 0.0f;
        updateFilter();
        g_ = gTarget_;
    }

    double clock() const { return clock_; }

    void write(int reg, uint8_t val) {
        if (reg < 0 || reg >= kNumRegs) return;
        regs_[reg] = val;
        if (reg < 21 && reg % 7 <= 1) updateIncrement(reg / 7);
        if (reg < 21 && reg % 7 == 4) {                   // besturingsregister
            Voice& v = voice_[reg / 7];
            const bool gate = val & kGate;
            if (gate && !v.gate) { v.envState = kAttack; v.holdZero = false; }
            else if (!gate && v.gate) { v.envState = kRelease; }
            v.gate = gate;
            if (val & kTest) { v.acc = 0u; v.lfsr = kLfsrInit; }
            ensureTable(val);
        } else if (reg >= 0x15 && reg <= 0x17) {
            updateFilter();
        }
    }

    /**
     * Sterkte van het combined-waveform-effect, 0..10: 0 = zuivere AND,
     * 4 ≈ 8580, 7 ≈ 6581, 10 = nog zwakker dan een 6581. Bouwt de tabellen
     * opnieuw; roep dit aan buiten de audio-interrupt (zoals write()).
     */
    void setCombo(float c) {
        c = c < 0.f ? 0.f : (c > 10.f ? 10.f : c);
        if (c == combo_) return;
        combo_ = c;
        const float s = c * 0.1f;
        cmA_ = kComboA * s;
        cmT_ = 0.5f + kComboT * s;
        cmP_ = 1.0f - kComboP * s;
        if (cmP_ < 0.f) cmP_ = 0.f;
        cmW_ = 0.001f + kComboW * s;
        for (int d = 0; d <= kComboR; ++d) cmK_[d] = d == 0 ? 1.0f : std::pow(cmA_, static_cast<float>(d));
        for (int m = 0; m < 8; ++m) if (table_[m]) fillTable(m);
    }
    float combo() const { return combo_; }
    /** Combined-waveform-tabellen delen met @p owner (zelfde Combo-stand, zoals
     *  de chips van één SidMulti): scheelt 8 KB per combinatie per chip. */
    void shareTablesFrom(SidChip* owner) { tableOwner_ = owner ? owner : this; }

    /** Uitgang van een combinatie in 1/16 van een 12-bit stap (test-/meethaakje). */
    uint16_t combinedValue(uint8_t ctrl, uint32_t acc12, bool triFlip, uint32_t lfsr, bool pulseHigh) const {
        return combinedModel(ctrl & 0xf0, acc12, triFlip, lfsr, pulseHigh);
    }
    uint8_t reg(int r) const { return (r >= 0 && r < kNumRegs) ? regs_[r] : 0; }

    /** Eén sample, mono. Eén stem op vol volume ≈ ±1; drie stemmen ≈ ±3.
     *  @p ext = EXT IN (±1, telt als één stem); door het filter als FILT EX aan staat. */
    float Process(float ext = 0.0f) {
        cycleFrac_ += cyclesPerSampleF_;
        const int cycles = static_cast<int>(cycleFrac_);
        cycleFrac_ -= cycles;

        // Stil: alle drie de envelopes staan op nul en wachten op een gate.
        // Dan alleen het goedkope bijhouden — fase, envelope-teller (voor de
        // ADSR-bug), het uitklinken van het filter en de DC-blokker — zonder
        // golfvormen, gebeurtenissen en BLEP. Een poly-SID met één noot
        // rekent zo alleen op de chip die speelt.
        if (ext == 0.0f && voice_[0].holdZero && voice_[1].holdZero && voice_[2].holdZero)
            return processIdle(cycles);

        // Fase A: vrij-lopende MSB-flanken van elke stem (bron voor sync/ring
        // van de volgende stem). Tweede-orde-effecten (een bron die zelf net
        // gesynct wordt) laten we weg.
        Free fr[3];
        for (int i = 0; i < 3; ++i) fr[i] = freeEdges(i);

        float direct = 0.0f, filtIn = 0.0f;
        const uint8_t modeVol = regs_[0x18];
        const uint8_t filt = regs_[0x17] & 0x0f;
        const bool m6581 = model_ == kModel6581;
        // 6581: de golfvorm-DAC staat niet rond nul; die offset schaalt mee
        // met de envelope (doffe tik bij het aanslaan en loslaten).
        const float voiceDc = m6581 ? kVoiceDc6581 : 0.0f;
        for (int i = 0; i < 3; ++i) {
            const float w = renderVoice(i, fr[(i + 2) % 3]);
            clockEnvelope(voice_[i], i, cycles);
            Voice& v = voice_[i];
            const float out = (w + voiceDc) * v.prevEnv * (1.0f / 255.0f);
            v.prevEnv = static_cast<float>(v.env);
            if (filt & (1u << i)) { filtIn += out; continue; }
            // 3OFF: stem 3 uit de mix, tenzij hij door het filter gaat.
            if (i == 2 && (modeVol & 0x80)) continue;
            direct += out;
        }
        if (filt & 0x08) filtIn += ext; else direct += ext;
        // 6581: ook de volume-DAC voert een gelijkspanning mee, dus een
        // volumewijziging geeft een stap (de volume-klik; zo speelden
        // C64-spellen samples). De DC-blokker laat alleen de stap door.
        const float x = (direct + processFilter(filtIn, modeVol) + (m6581 ? kMixDc6581 : 0.0f))
                      * static_cast<float>(modeVol & 0x0f) * (1.0f / 15.0f);
        // DC-blokker: y = x − x₋₁ + R·y₋₁.
        const float y = x - dcX1_ + dcR_ * dcY1_;
        dcX1_ = x; dcY1_ = y;
        return y;
    }

    // ── test-/meethaakjes ────────────────────────────────────────────
    uint32_t acc(int i) const   { return voice_[i].acc >> 8; }  // 24 bits
    uint32_t lfsr(int i) const  { return voice_[i].lfsr; }
    int      env(int i) const   { return voice_[i].env; }
    int      envState(int i) const { return voice_[i].envState; }

    /** Periodetabel van de rate-teller (cycli per envelope-stap). */
    static uint16_t ratePeriod(int nibble) {
        static constexpr uint16_t kPeriods[16] = {
            9, 32, 63, 95, 149, 220, 267, 313, 392, 977, 1954, 3126, 3907, 11720, 19532, 31251,
        };
        return kPeriods[nibble & 15];
    }

    enum EnvState { kAttack = 0, kDecaySustain = 1, kRelease = 2 };

private:
    /** Doelcoëfficiënten uit $15/$16 (cutoff) en $17 (resonantie). */
    void updateFilter() {
        const int fc = (regs_[0x15] & 7) | (regs_[0x16] << 3);
        const int res = regs_[0x17] >> 4;
        float hz = model_ == kModel6581 ? cutoffHz6581(fc, curve_) : cutoffHz8580(fc);
        if (hz > 0.45f * fs_) hz = 0.45f * fs_;
        gTarget_ = std::tan(3.14159265f * hz / fs_);
        k_ = 1.0f / (model_ == kModel6581 ? resonanceQ6581(res) : resonanceQ8580(res));
    }

    /** ZDF-SVF (Zavalishin/Simper), één sample; somt de gekozen modes. */
    float processFilter(float in, uint8_t modeVol) {
        g_ += (gTarget_ - g_) * kCutoffGlide;         // cutoffsprongen ~1 ms gladstrijken
        const bool m6581 = model_ == kModel6581;
        if (m6581) in = softClip(in * kDrive6581) * (1.0f / kDrive6581);
        const float a1 = 1.0f / (1.0f + g_ * (g_ + k_));
        const float a2 = g_ * a1, a3 = g_ * a2;
        const float v3 = in - ic2_;
        const float v1 = a1 * ic1_ + a2 * v3;         // band
        const float v2 = ic2_ + a2 * ic1_ + a3 * v3;  // laag
        ic1_ = 2.0f * v1 - ic1_;
        ic2_ = 2.0f * v2 - ic2_;
        // 6581: de bandpass-integrator loopt vol — de resonantie gromt en
        // blijft begrensd in plaats van schoon te piepen.
        if (m6581) ic1_ = softClip(ic1_ * kStateSat6581) * (1.0f / kStateSat6581);
        const float hp = in - k_ * v1 - v2;
        float y = 0.0f;
        if (modeVol & 0x10) y += v2;
        if (modeVol & 0x20) y += v1;
        if (modeVol & 0x40) y += hp;
        return y;
    }

    /** Eén stil sample (zie Process): fase en envelope-teller lopen door, het
     *  filter klinkt uit tot het stil is, de DC-blokker blijft meelopen. */
    float processIdle(int cycles) {
        for (int i = 0; i < 3; ++i) {
            Voice& v = voice_[i];
            if (!(regs_[i * 7 + 4] & kTest)) v.acc += v.inc;   // 32 bits: loopt vanzelf rond
            clockEnvelope(v, i, cycles);
            v.prevVal = 0.0f;
            v.prevEnv = 0.0f;
        }
        const uint8_t modeVol = regs_[0x18];
        float f = 0.0f;
        if (std::fabs(ic1_) + std::fabs(ic2_) > 1e-6f) f = processFilter(0.0f, modeVol);
        else ic1_ = ic2_ = 0.0f;
        const float x = (f + (model_ == kModel6581 ? kMixDc6581 : 0.0f))
                      * static_cast<float>(modeVol & 0x0f) * (1.0f / 15.0f);
        const float y = x - dcX1_ + dcR_ * dcY1_;
        dcX1_ = x; dcY1_ = y;
        return y;
    }

    /** Zachte begrenzer (rationele tanh-benadering), ±1 voorbij |x| = 3. */
    static float softClip(float x) {
        if (x > 3.0f) return 1.0f;
        if (x < -3.0f) return -1.0f;
        const float x2 = x * x;
        return x * (27.0f + x2) / (27.0f + 9.0f * x2);
    }

    static constexpr uint32_t kLfsrInit = 0x7ffff8;
    static constexpr uint64_t k2p32 = 0x100000000ull;
    static constexpr uint64_t k2p31 = 0x80000000ull;

    struct Voice {
        uint32_t acc = 0u;         // accumulator × 2^8 (acc24 in de bovenste 24 van 32 bits)
        uint32_t inc = 0u;         // stap per audio-sample in dezelfde eenheid (freq · 256 · cycli/sample)
        uint32_t lfsr = kLfsrInit;
        bool     gate = false;
        // envelope
        int      envState = kRelease;
        int      env = 0;          // 0..255
        uint16_t rateCounter = 0;  // 15 bits
        int      expCounter = 0;
        bool     holdZero = true;
        float    prevEnv = 0.0f;
        // PolyBLEP-vertraging
        float    prevVal = 0.0f;   // naïeve waarde van het vorige sample (+ correcties)
    };

    /** Vrij-lopende flanken van de MSB binnen dit sample (-1 = geen). */
    struct Free { float rise = -1.0f, fall = -1.0f; bool msbStart = false; };

    Free freeEdges(int i) const {
        const Voice& v = voice_[i];
        Free f;
        f.msbStart = v.acc >= k2p31;
        if (v.inc == 0u || (regs_[i * 7 + 4] & kTest)) return f;
        const float inv = 1.0f / static_cast<float>(v.inc);
        const uint64_t a = v.acc, e = a + v.inc;
        if (a < k2p31 && e >= k2p31) f.rise = static_cast<float>(k2p31 - a) * inv;
        if (e >= k2p32) f.fall = static_cast<float>(k2p32 - a) * inv;
        return f;
    }

    /** Stap per audio-sample uit het frequentieregister, één keer per write
     *  (de oscillator zelf rekent met integers, niet met doubles). */
    void updateIncrement(int i) {
        const unsigned freq = regs_[i * 7] | (regs_[i * 7 + 1] << 8);
        voice_[i].inc = static_cast<uint32_t>(static_cast<double>(freq) * 256.0 * cyclesPerSample_ + 0.5);
    }
    uint32_t pulseThreshold(int i) const {
        const unsigned pw = regs_[i * 7 + 2] | ((regs_[i * 7 + 3] & 0x0f) << 8);
        return static_cast<uint32_t>(pw) << 20;
    }

    static uint8_t noiseBits(uint32_t l) {
        return static_cast<uint8_t>(
            ((l >> 13) & 0x80) | ((l >> 12) & 0x40) | ((l >> 9) & 0x20) | ((l >> 7) & 0x10) |
            ((l >> 6) & 0x08)  | ((l >> 3) & 0x04)  | ((l >> 1) & 0x02) | (l & 0x01));
    }
    static uint32_t clockLfsr(uint32_t l) {
        const uint32_t bit = ((l >> 22) ^ (l >> 17)) & 1u;
        return ((l << 1) | bit) & 0x7fffffu;
    }

    /** Golfvorm-uitgang voor een accumulatorstand (32 bits), ±1. */
    float waveform(uint8_t ctrl, uint32_t acc32, bool srcMsb, uint32_t lfsr, uint32_t pwThr) const {
        const uint8_t sel = ctrl & 0xf0;
        if (!sel) return 0.0f;
        const bool msb = (acc32 >> 31) != 0;
        const bool triMsb = (ctrl & kRing) ? (msb != srcMsb) : msb;
        const uint32_t tri32 = (acc32 << 1) ^ (triMsb ? 0xffffffffu : 0u);
        const bool pulseHigh = (ctrl & kTest) || acc32 >= pwThr;
        switch (sel) {
            case kTri:   return static_cast<float>(tri32 * (2.0 / k2p32) - 1.0);
            case kSaw:   return static_cast<float>(acc32 * (2.0 / k2p32) - 1.0);
            case kPulse: return pulseHigh ? 1.0f : -1.0f;
            case kNoise: return (noiseBits(lfsr) + 0.5f) * (1.0f / 128.0f) - 1.0f;
            default: break;
        }
        // Combinaties: een lage puls trekt alle bits hard naar 0.
        if ((sel & kPulse) && !pulseHigh) return -1.0f;
        // Met noise erbij: zuivere AND. Goedkoop (het bitlijn-model zou per
        // sample opnieuw moeten, want de ruisbits wisselen), en de ruis sterft
        // in een combinatie binnen een fractie van een seconde toch uit.
        if (sel & kNoise) return (static_cast<float>(andValue(sel, acc32, triMsb, lfsr)) - 2048.0f) * (1.0f / 2048.0f);
        const bool triFlip = (ctrl & kRing) && srcMsb;
        const uint32_t acc12 = acc32 >> 20;
        const uint16_t* t = tableOwner_->table_[(sel >> 4) & 7].get();
        const uint16_t v16 = (t && !triFlip) ? t[acc12] : combinedModel(sel, acc12, triFlip, lfsr, pulseHigh);
        return (static_cast<float>(v16) * (1.0f / 16.0f) - 2048.0f) * (1.0f / 2048.0f);
    }

    /** Zuivere AND van de gekozen 12-bit golfvormen (pulse = hoog; de lage
     *  puls is al afgevangen). Gebruikt voor combinaties met noise. */
    static uint16_t andValue(uint8_t sel, uint32_t acc32, bool triMsb, uint32_t lfsr) {
        uint32_t v = 0xfff;
        if (sel & kTri)   v &= (((acc32 << 1) ^ (triMsb ? 0xffffffffu : 0u)) >> 20) & 0xffe;
        if (sel & kSaw)   v &= acc32 >> 20;
        if (sel & kNoise) v &= static_cast<uint32_t>(noiseBits(lfsr)) << 4;
        return static_cast<uint16_t>(v);
    }

    /**
     * Bitlijn-model voor combined waveforms (eigen model, niet gemeten).
     *
     * Op de chip hangen de gekozen golfvormen samen aan dezelfde 12 lijnen
     * naar de DAC. Een 0 trekt in NMOS harder dan een 1 omhoog houdt (vandaar
     * "AND-achtig"), en een lijn voelt zijn buren mee. Model: per bit j tellen
     * we de drijvers die 1 zijn (een hoge puls telt mee met gewicht cmP_) en
     * die 0 zijn (gewicht kComboZ). Het met cmK_[|i−j|] gewogen aandeel enen
     * rond bit i bepaalt hoe ver die lijn omhoog komt: een zachte drempel rond
     * cmT_ met breedte cmW_ (een half omlaag getrokken lijn geeft de DAC een
     * halve bijdrage). Met cmA_ = 0 (geen buren), cmT_ = 0,5 en een smalle
     * cmW_ is dat exact de AND. De parameters zijn op het oor gekozen, zodat
     * het niveau van een combinatie bij de 8580 (4) op ~55–85 % van de AND
     * ligt en bij de 6581 (7) op ~30–50 %.
     *
     * Uitgang in 1/16 van een 12-bit stap; @p bits krijgt de uitgangsbits
     * die meer dan half hoog staan (voor de noise-terugschrijving).
     */
    uint16_t combinedModel(uint8_t sel, uint32_t acc12, bool triFlip, uint32_t lfsr, bool pulseHigh,
                           uint16_t* bits = nullptr) const {
        const bool msb = (acc12 >> 11) & 1u;
        const uint32_t tri12 = ((acc12 << 1) ^ ((msb != triFlip) ? 0xffeu : 0u)) & 0xffeu;
        const uint32_t noi12 = static_cast<uint32_t>(noiseBits(lfsr)) << 4;
        float one[12], all[12];
        for (int j = 0; j < 12; ++j) {
            float o = 0.f, z = 0.f;
            if (sel & kTri)   { if ((tri12 >> j) & 1u) o += 1.f; else z += 1.f; }
            if (sel & kSaw)   { if ((acc12 >> j) & 1u) o += 1.f; else z += 1.f; }
            if (sel & kNoise) { if ((noi12 >> j) & 1u) o += 1.f; else z += 1.f; }
            if ((sel & kPulse) && pulseHigh) o += cmP_;
            one[j] = o;
            all[j] = o + kComboZ * z;
        }
        float out = 0.f;
        uint16_t hiBits = 0;
        for (int i = 0; i < 12; ++i) {
            float num = 0.f, den = 0.f;
            const int lo = i - kComboR < 0 ? 0 : i - kComboR, hi = i + kComboR > 11 ? 11 : i + kComboR;
            for (int j = lo; j <= hi; ++j) {
                const float k = cmK_[j > i ? j - i : i - j];
                num += k * one[j]; den += k * all[j];
            }
            if (den <= 0.f) continue;
            float f = (num / den - cmT_) / cmW_ + 0.5f;
            f = f < 0.f ? 0.f : (f > 1.f ? 1.f : f);
            out += f * static_cast<float>(1u << i);
            if (f > 0.5f) hiBits |= static_cast<uint16_t>(1u << i);
        }
        if (bits) *bits = hiBits;
        return static_cast<uint16_t>(out * 16.0f + 0.5f);
    }

    /** Tabel voor een tri/saw/pulse-combinatie (pulse = hoog), geïndexeerd op acc12. */
    void ensureTable(uint8_t ctrl) {
        const int m = (ctrl >> 4) & 7;               // tri=1, saw=2, pulse=4
        if (tableOwner_ != this) { tableOwner_->ensureTable(ctrl); return; }
        if (m == 0 || m == 1 || m == 2 || m == 4 || table_[m]) return;
        table_[m].reset(new uint16_t[4096]);
        if (table_[m]) fillTable(m);                  // geen geheugen: rekent zonder tabel verder
    }
    void fillTable(int m) {
        const uint8_t sel = static_cast<uint8_t>(m << 4);
        for (uint32_t a = 0; a < 4096; ++a) table_[m][a] = combinedModel(sel, a, false, 0, true);
    }

    /** Combinatie met noise: waar de uitgang 0 is, worden de LFSR-aftakkingen
     *  gewist (de uitgang schrijft terug) — de ruis sterft uit. */
    static uint32_t noiseWriteBack(uint32_t lfsr, uint16_t out12) {
        static constexpr uint8_t kTap[8] = { 0, 2, 5, 9, 11, 14, 18, 20 };   // uitgangsbit 4..11
        for (int b = 0; b < 8; ++b)
            if (!((out12 >> (4 + b)) & 1u)) lfsr &= ~(1u << kTap[b]);
        return lfsr;
    }

    enum EvType { kEvWrap, kEvPulse, kEvNoise, kEvSrc, kEvSync };
    struct Event { float t; int type; };

    /** Eén stem één sample verder; geeft het (één sample vertraagde) band-limited sample.
     *  Fase als 32-bit integer (64 bits voor de vergelijkingen), tijdstippen in float. */
    float renderVoice(int i, const Free& src) {
        Voice& v = voice_[i];
        const uint8_t ctrl = regs_[i * 7 + 4];
        const uint32_t thr = pulseThreshold(i);
        const uint32_t inc = (ctrl & kTest) ? 0u : v.inc;
        const float incF = static_cast<float>(inc), inv = inc ? 1.0f / incF : 0.0f;
        const uint64_t a0 = v.acc;
        bool srcMsb = src.msbStart;

        // Gebeurtenissen verzamelen (hooguit een handvol per sample).
        Event ev[24]; int n = 0;
        auto add = [&](float t, int type) { if (t >= 0.0f && t < 1.0f && n < 24) ev[n++] = { t, type }; };
        float syncT = -1.0f;
        if ((ctrl & kSync) && src.rise >= 0.0f) { syncT = src.rise; add(syncT, kEvSync); }
        if ((ctrl & kRing) && (ctrl & kTri)) { add(src.rise, kEvSrc); add(src.fall, kEvSrc); }
        if (inc) {
            // Vóór een eventuele sync-reset: vanaf de huidige stand.
            const uint64_t a1 = syncT >= 0.0f ? a0 + static_cast<uint64_t>(incF * syncT) : a0 + inc;
            if (a1 >= k2p32) add(static_cast<float>(k2p32 - a0) * inv, kEvWrap);
            addCrossings(a0, a1, inv, 0.0f, thr, add);
            if (ctrl & kNoise) addNoiseClocks(a0, a1, inv, 0.0f, add);
            // Na de reset: vanaf 0.
            if (syncT >= 0.0f) {
                const uint64_t b1 = static_cast<uint64_t>(incF * (1.0f - syncT));
                addCrossings(0, b1, inv, syncT, thr, add);
                if (ctrl & kNoise) addNoiseClocks(0, b1, inv, syncT, add);
            }
        }
        // Sorteren op tijd (insertion sort, n is klein).
        for (int a = 1; a < n; ++a) {
            Event e = ev[a]; int b = a - 1;
            while (b >= 0 && ev[b].t > e.t) { ev[b + 1] = ev[b]; --b; }
            ev[b + 1] = e;
        }

        // Doorlopen: vóór/na elke gebeurtenis de golfvorm, sprong = BLEP.
        bool reset = false;                         // na een sync-reset telt de fase vanaf 0
        float corrPrev = 0.0f, corrCur = 0.0f;
        for (int k = 0; k < n; ++k) {
            const float t = ev[k].t;
            const uint64_t at = reset ? static_cast<uint64_t>(incF * (t - syncT))
                                      : a0 + static_cast<uint64_t>(incF * t);
            uint32_t before, after;
            const uint32_t lfsrBefore = v.lfsr;
            const bool srcBefore = srcMsb;
            switch (ev[k].type) {
                case kEvWrap:
                    before = 0xffffffffu; after = 0u;
                    break;
                case kEvPulse:
                    before = thr - 1u; after = thr;
                    break;
                case kEvNoise: {
                    // De flank ligt op m·2^28 + 2^27; `at` zit daar op afronding na.
                    constexpr uint64_t P = 1ull << 28, H = 1ull << 27;
                    const uint64_t m = at >= H ? (at - H + P / 2) / P : 0;
                    after = static_cast<uint32_t>(m * P + H);
                    before = after - 1u;
                    v.lfsr = clockLfsr(v.lfsr);
                    if ((ctrl & kNoise) && (ctrl & (kTri | kSaw | kPulse))) {
                        const bool ph = (ctrl & kTest) || after >= thr;
                        const bool triMsb = ((after >> 31) != 0) != ((ctrl & kRing) && srcMsb);
                        const uint16_t o = ((ctrl & kPulse) && !ph) ? 0
                            : andValue(ctrl & 0xf0, after, triMsb, v.lfsr);
                        v.lfsr = noiseWriteBack(v.lfsr, o);
                    }
                    break;
                }
                case kEvSrc:
                    before = after = static_cast<uint32_t>(at);
                    srcMsb = !srcMsb;
                    break;
                default:  // kEvSync
                    before = static_cast<uint32_t>(at); after = 0u;
                    reset = true;
                    break;
            }
            const float h = waveform(ctrl, after, srcMsb, v.lfsr, thr) -
                            waveform(ctrl, before, srcBefore, lfsrBefore, thr);
            if (h != 0.0f) {
                corrPrev += 0.5f * h * (1.0f - t) * (1.0f - t);
                corrCur  -= 0.5f * h * t * t;
            }
        }
        // Zonder sync exact acc + inc (32 bits lopen vanzelf rond): geen drift.
        v.acc = syncT >= 0.0f ? static_cast<uint32_t>(incF * (1.0f - syncT))
                              : static_cast<uint32_t>(a0 + inc);

        const float naive = waveform(ctrl, v.acc, srcMsb, v.lfsr, thr);
        const float out = v.prevVal + corrPrev;
        v.prevVal = naive + corrCur;
        return out;
    }

    /** Doorgang van drempel X (en X + 2^32) in (a0, a1]; tijd = t0 + afstand/inc. */
    template <class Add>
    static void addCrossings(uint64_t a0, uint64_t a1, float inv, float t0, uint32_t X, Add& add) {
        if (X == 0u) return;                  // pw 0: altijd hoog, geen flank
        const uint64_t x = X;
        if (a0 < x && x <= a1) add(t0 + static_cast<float>(x - a0) * inv, kEvPulse);
        if (a0 < x + k2p32 && x + k2p32 <= a1) add(t0 + static_cast<float>(x + k2p32 - a0) * inv, kEvPulse);
    }
    /** Stijgende flanken van bit 19 (acc24) = bit 27 (acc32): bij m·2^28 + 2^27. */
    template <class Add>
    static void addNoiseClocks(uint64_t a0, uint64_t a1, float inv, float t0, Add& add) {
        constexpr uint64_t P = 1ull << 28, H = 1ull << 27;
        uint64_t x = (a0 >= H ? (a0 - H) / P + 1 : 0) * P + H;
        for (int guard = 0; guard < 8 && x <= a1; ++guard, x += P)
            if (x > a0) add(t0 + static_cast<float>(x - a0) * inv, kEvNoise);
    }

    /** Envelope @p cycles SID-cycli verder. */
    void clockEnvelope(Voice& v, int i, int cycles) {
        const uint8_t ad = regs_[i * 7 + 5], sr = regs_[i * 7 + 6];
        while (cycles > 0) {
            const int nib = v.envState == kAttack ? (ad >> 4)
                          : v.envState == kDecaySustain ? (ad & 15) : (sr & 15);
            const uint16_t period = ratePeriod(nib);
            // 15-bit teller, vergelijking op gelijkheid: staat hij al voorbij
            // de periode (na een wissel naar een snellere rate), dan moet hij
            // eerst rond — de ADSR-bug.
            int toGo = (period - v.rateCounter) & 0x7fff;
            if (toGo == 0) toGo = 0x8000;
            if (toGo > cycles) { v.rateCounter = static_cast<uint16_t>((v.rateCounter + cycles) & 0x7fff); break; }
            cycles -= toGo;
            v.rateCounter = 0;
            envelopeStep(v, sr >> 4);
        }
    }

    static int expPeriod(int env) {
        if (env >= 94) return 1;
        if (env >= 55) return 2;
        if (env >= 27) return 4;
        if (env >= 15) return 8;
        if (env >= 7)  return 16;
        return 30;
    }

    static void envelopeStep(Voice& v, int sustainNibble) {
        if (v.envState == kAttack) {
            v.expCounter = 0;
            if (++v.env >= 255) { v.env = 255; v.envState = kDecaySustain; }
            return;
        }
        if (v.holdZero) return;
        if (v.envState == kDecaySustain && v.env == sustainNibble * 17) return;
        if (++v.expCounter < expPeriod(v.env)) return;
        v.expCounter = 0;
        if (v.env > 0) --v.env;
        if (v.env == 0) v.holdZero = true;
    }

    uint8_t regs_[kNumRegs] = {};
    Voice   voice_[3];
    float   fs_ = 44100.0f;
    double  clock_ = kClockPal;
    double  cyclesPerSample_ = kClockPal / 44100.0;
    float   cycleFrac_ = 0.0f;                        // fractionele SID-cycli (blijft < 23)
    float   cyclesPerSampleF_ = static_cast<float>(kClockPal / 44100.0);
    static constexpr float kDcBlockHz = 10.0f;
    // Combined-waveform-model: straal, gewicht van een 0-drijver, en hoe ver
    // buurkoppeling (A), drempel (T), pulssterkte (P) en drempelbreedte (W)
    // meeschuiven met combo/10. Gekozen met een rooster op niveaudoelen
    // (scratch tune_combo.py), niet gemeten aan een chip.
    static constexpr int   kComboR = 4;
    static constexpr float kComboDefault = 7.0f;     // het 6581-punt
    static constexpr float kComboZ = 2.0f, kComboA = 0.6f, kComboT = 0.5f, kComboP = 1.1f, kComboW = 1.5f;
    float    combo_ = -1.0f, cmA_ = 0.f, cmT_ = 0.5f, cmP_ = 1.f, cmW_ = 0.001f;
    float    cmK_[kComboR + 1] = { 1.f, 0.f, 0.f, 0.f, 0.f };
    std::unique_ptr<uint16_t[]> table_[8];            // op index tri|saw|pulse (pulse = hoog)
    SidChip* tableOwner_ = this;                      // wiens tabellen deze chip leest
    float   dcR_ = 0.9986f, dcX1_ = 0.0f, dcY1_ = 0.0f;
    // Filter (8580-model): cutoff-bereik, resonantie tot 0,707·2^kResOctaves.
    static constexpr float kFcLo = 30.0f, kFcHi = 12000.0f, kResOctaves = 2.5f;
    static constexpr float kCutoffGlide = 0.02f;
    // 6581-model (op het oor): S-curve, minder resonantie, begrenzing, DC.
    static constexpr float kFcLo6581 = 220.0f, kFcHi6581 = 16000.0f, kCurveSteep = 10.0f;
    static constexpr float kResOctaves6581 = 1.6f, kDrive6581 = 0.7f, kStateSat6581 = 0.8f;
    static constexpr float kVoiceDc6581 = 0.2f, kMixDc6581 = 0.3f;
    int     model_ = kModel6581;
    float   curve_ = 0.5f;
    float   g_ = 0.0f, gTarget_ = 0.0f, k_ = 1.4142f, ic1_ = 0.0f, ic2_ = 0.0f;
};

/**
 * Besturingslaag: drie stemmen (V/oct + gate), alles naar SID-registers. De
 * firmwaremodules en de wasm zijn hier dunne schillen omheen; een
 * hardware-backend (de SID-kaart) krijgt later dezelfde writes.
 *
 * Elke stem heeft zijn eigen instellingen (golfvorm, PW, ring/sync, ADSR,
 * coarse/fine, filterroute). De setters zonder stemnummer zetten alle drie
 * tegelijk — zo gebruikt de SID ×3 (tp_mmb_sid) hem; de SID 3-osc
 * (tp_mmb_sid3) zet ze per stem. In Stack-stand volgen stem 2 en 3 de
 * toonhoogte en gate van stem 1 (drie oscillatoren op één noot).
 */
class SidSynth {
public:
    static constexpr int kVoices = 3;

    void Init(float sampleRate) {
        chip_.Init(sampleRate);
        for (int k = 0; k < kVoices; ++k) { writeFreq(k); writePw(k); writeAdsr(k); writeControl(k); }
        writeVolume();
        writeCutoff();
        writeResFilt();
        chip_.settleDc();
    }
    SidChip& chip() { return chip_; }

    // ── toonhoogte en gate per stem ──────────────────────────────────
    void setVoct(int k, float v) {
        if (!ok(k) || v == voct_[k]) return;
        voct_[k] = v;
        if (stack_ && k == 0) allFreq(); else writeFreq(k);
    }
    void gate(int k, bool high) {
        if (!ok(k) || high == gate_[k]) return;
        gate_[k] = high;
        if (stack_ && k == 0) allControl(); else writeControl(k);
    }
    /** Stack: stem 2 en 3 volgen V/oct en gate van stem 1. Uit = Split. */
    void setStack(bool on)       { if (on != stack_) { stack_ = on; allFreq(); allControl(); } }

    // ── per stem ─────────────────────────────────────────────────────
    /** Nieuwe golfvormkeuze voor stem @p k. Zit er noise in, dan eerst even
     *  de test-bit: noise die in een combinatie is uitgestorven komt terug. */
    void setWave(int k, uint8_t bits) {
        if (!ok(k)) return;
        bits &= 0xf0;
        if (bits == v_[k].wave) return;
        v_[k].wave = bits;
        if (bits & SidChip::kNoise)
            chip_.write(k * 7 + 4, static_cast<uint8_t>(chip_.reg(k * 7 + 4) | SidChip::kTest));
        writeControl(k);
    }
    void setWaveBit(int k, uint8_t bit, bool on) {
        if (ok(k)) setWave(k, on ? (v_[k].wave | bit) : (v_[k].wave & ~bit));
    }
    void setRing(int k, bool on)    { if (ok(k)) { v_[k].ring = on; writeControl(k); } }
    void setSync(int k, bool on)    { if (ok(k)) { v_[k].sync = on; writeControl(k); } }
    void setPw(int k, float pw)     { if (ok(k)) { v_[k].pw = pw; writePw(k); } }
    void setAttack(int k, int n)    { if (ok(k)) { v_[k].attack = nib(n);  writeAdsr(k); } }
    void setDecay(int k, int n)     { if (ok(k)) { v_[k].decay = nib(n);   writeAdsr(k); } }
    void setSustain(int k, int n)   { if (ok(k)) { v_[k].sustain = nib(n); writeAdsr(k); } }
    void setRelease(int k, int n)   { if (ok(k)) { v_[k].release = nib(n); writeAdsr(k); } }
    void setCoarse(int k, float st) { if (ok(k)) { v_[k].coarse = st; writeFreq(k); } }
    void setFine(int k, float ct)   { if (ok(k)) { v_[k].fine = ct; writeFreq(k); } }
    /** Stem @p k door het filter (FILT k). */
    void setFilt(int k, bool on)    { if (ok(k)) { v_[k].filt = on; writeResFilt(); } }

    // ── alle stemmen tegelijk ────────────────────────────────────────
    void setWave(uint8_t bits)            { for (int k = 0; k < kVoices; ++k) setWave(k, bits); }
    void setWaveBit(uint8_t bit, bool on) { for (int k = 0; k < kVoices; ++k) setWaveBit(k, bit, on); }
    void setRing(bool on)        { for (int k = 0; k < kVoices; ++k) setRing(k, on); }
    void setSync(bool on)        { for (int k = 0; k < kVoices; ++k) setSync(k, on); }
    void setPw(float pw)         { for (int k = 0; k < kVoices; ++k) setPw(k, pw); }
    void setAttack(int n)        { for (int k = 0; k < kVoices; ++k) setAttack(k, n); }
    void setDecay(int n)         { for (int k = 0; k < kVoices; ++k) setDecay(k, n); }
    void setSustain(int n)       { for (int k = 0; k < kVoices; ++k) setSustain(k, n); }
    void setRelease(int n)       { for (int k = 0; k < kVoices; ++k) setRelease(k, n); }
    void setCoarse(float st)     { for (int k = 0; k < kVoices; ++k) setCoarse(k, st); }
    void setFine(float ct)       { for (int k = 0; k < kVoices; ++k) setFine(k, ct); }
    /** De drie stemmen door het filter (FILT 1–3). EXT IN gaat er altijd door. */
    void setFilt(bool on)        { for (int k = 0; k < kVoices; ++k) setFilt(k, on); }

    // ── gedeeld ──────────────────────────────────────────────────────
    void setBend(float v)        { if (v != bend_) { bend_ = v; allFreq(); } }
    void setPwCv(float cv)       { if (cv != pwCv_) { pwCv_ = cv; allPw(); } }
    void setVolume(int n)        { volume_ = nib(n); writeVolume(); }
    void setLevel(float l)       { level_ = l < 0.f ? 0.f : (l > 1.f ? 1.f : l); }
    /** Combined-waveform-sterkte 0..10 (0 = AND, 4 ≈ 8580, 7 ≈ 6581). */
    void setCombo(float c)       { chip_.setCombo(c); }

    // ── filter ───────────────────────────────────────────────────────
    /** Cutoff als 11-bit registerwaarde 0..2047. */
    void setCutoff(float r)      { cutoff_ = r; writeCutoff(); }
    /** Cutoff-CV 0..1 = het hele bereik erbovenop (negatief = omlaag). */
    void setCutoffCv(float cv)   { if (cv != cutoffCv_) { cutoffCv_ = cv; writeCutoff(); } }
    void setRes(int n)           { res_ = nib(n); writeResFilt(); }
    void setMode(uint8_t bit, bool on) {
        mode_ = static_cast<uint8_t>(on ? (mode_ | bit) : (mode_ & ~bit));
        writeVolume();
    }
    enum : uint8_t { kLp = 0x10, kBp = 0x20, kHp = 0x40 };
    /** Chipmodel voor filter en uitgang: 0 = 6581, 1 = 8580. */
    void setModel(int m)         { chip_.setFilterModel(m); chip_.settleDc(); }
    /** Spreiding van de 6581-cutoffcurve, 0..1. */
    void setCurve(float c)       { chip_.setCurve(c); }

    /** Eén sample, mono, ±1 (hard begrensd). @p ext = EXT IN (±1). */
    float Process(float ext = 0.0f) {
        const float y = chip_.Process(ext) * level_ * kGain;
        return y > 1.f ? 1.f : (y < -1.f ? -1.f : y);
    }

    /** SID-frequentieregister voor een toonhoogte in Hz. */
    uint16_t freqReg(double hz) const {
        const double r = hz * 16777216.0 / chip_.clock();
        return static_cast<uint16_t>(r < 0.0 ? 0.0 : (r > 65535.0 ? 65535.0 : r + 0.5));
    }

private:
    /** Eén stem op vol volume ≈ ±0,5 bij level 1; drie stemmen tot ±1,5 (dan begrensd). */
    static constexpr float kGain = 0.5f;

    struct Voice {
        uint8_t wave = SidChip::kPulse;
        bool    ring = false, sync = false, filt = false;
        float   pw = 0.5f, coarse = 0.f, fine = 0.f;
        uint8_t attack = 0, decay = 9, sustain = 10, release = 9;
    };

    static bool ok(int k) { return k >= 0 && k < kVoices; }
    static uint8_t nib(int n) { return static_cast<uint8_t>(n < 0 ? 0 : (n > 15 ? 15 : n)); }
    void allFreq()    { for (int k = 0; k < kVoices; ++k) writeFreq(k); }
    void allControl() { for (int k = 0; k < kVoices; ++k) writeControl(k); }
    void allPw()      { for (int k = 0; k < kVoices; ++k) writePw(k); }
    /** In Stack-stand volgen stem 2 en 3 de toonhoogte en gate van stem 1. */
    float voctOf(int k) const { return stack_ ? voct_[0] : voct_[k]; }
    bool  gateOf(int k) const { return stack_ ? gate_[0] : gate_[k]; }

    void writeFreq(int k) {
        // V/oct rond C4 (MIDI 60 = 0 V = 261,63 Hz), zoals de rest van MMB.
        const double oct = voctOf(k) + bend_ + (v_[k].coarse + v_[k].fine * 0.01) / 12.0;
        const uint16_t f = freqReg(261.6255653 * std::pow(2.0, oct));
        chip_.write(k * 7 + 0, f & 0xff);
        chip_.write(k * 7 + 1, f >> 8);
    }
    void writePw(int k) {
        float p = v_[k].pw + pwCv_;
        p = p < 0.f ? 0.f : (p > 1.f ? 1.f : p);
        const unsigned v = static_cast<unsigned>(p * 4095.0f + 0.5f);
        chip_.write(k * 7 + 2, v & 0xff);
        chip_.write(k * 7 + 3, (v >> 8) & 0x0f);
    }
    void writeAdsr(int k) {
        chip_.write(k * 7 + 5, static_cast<uint8_t>((v_[k].attack << 4) | v_[k].decay));
        chip_.write(k * 7 + 6, static_cast<uint8_t>((v_[k].sustain << 4) | v_[k].release));
    }
    void writeControl(int k) {
        uint8_t c = v_[k].wave;
        if (v_[k].ring) c |= SidChip::kRing;
        if (v_[k].sync) c |= SidChip::kSync;
        if (gateOf(k)) c |= SidChip::kGate;
        chip_.write(k * 7 + 4, c);
    }
    void writeVolume() { chip_.write(0x18, static_cast<uint8_t>(mode_ | volume_)); }
    void writeCutoff() {
        float r = cutoff_ + cutoffCv_ * 2047.0f;
        r = r < 0.f ? 0.f : (r > 2047.f ? 2047.f : r);
        const unsigned v = static_cast<unsigned>(r + 0.5f);
        chip_.write(0x15, v & 7);
        chip_.write(0x16, static_cast<uint8_t>(v >> 3));
    }
    void writeResFilt() {
        uint8_t f = 0x08;                                // EXT IN altijd door het filter
        for (int k = 0; k < kVoices; ++k) if (v_[k].filt) f |= static_cast<uint8_t>(1u << k);
        chip_.write(0x17, static_cast<uint8_t>((res_ << 4) | f));
    }

    SidChip chip_;
    Voice   v_[kVoices];
    float   voct_[kVoices] = {};
    bool    gate_[kVoices] = {};
    bool    stack_ = false;
    float   bend_ = 0.f, pwCv_ = 0.f;
    uint8_t volume_ = 15;
    float   level_ = 0.8f;
    float   cutoff_ = 1024.f, cutoffCv_ = 0.f;
    uint8_t res_ = 0, mode_ = kLp;
};

/**
 * Meerdere SID's als één instrument (tp_mmb_sid): tot vier chips, elk met
 * drie stem-cellen en een eigen filter — zoals een dual/triple-SID. Cel k
 * (0-based) hoort bij chip k/3, stem k%3. Knoppen gelden voor alle chips.
 * Chips boven het ingestelde aantal rekenen niet mee; stille chips zijn door
 * SidChip's stille pad vrijwel gratis.
 *
 * Uitgangen: mono som, stereo (chips over het beeld verdeeld met Spread) en
 * elke chip apart (om zelf te mengen en te pannen). EXT IN per chip, elk door
 * het filter van die chip. Een limiter op de sommen
 * houdt vier chips samen binnen ±1.
 */
class SidMulti {
public:
    static constexpr int kMaxChips = 4;
    static constexpr int kCells = kMaxChips * SidSynth::kVoices;
    enum Out { kOutMono = 0, kOutL, kOutR, kOutChip1, kNumOuts = kOutChip1 + kMaxChips };

    void Init(float sampleRate) {
        for (auto& c : chip_) c.Init(sampleRate);
        for (int j = 1; j < kMaxChips; ++j) chip_[j].chip().shareTablesFrom(&chip_[0].chip());
        limiter_.Init(sampleRate);
        updatePan();
    }
    SidSynth& chip(int j) { return chip_[j]; }

    /** Aantal actieve chips, 1..4 (3..12 stemmen). */
    void setChips(int n) {
        n = n < 1 ? 1 : (n > kMaxChips ? kMaxChips : n);
        if (n == chips_) return;
        for (int j = n; j < kMaxChips; ++j) for (int v = 0; v < SidSynth::kVoices; ++v) chip_[j].gate(v, false);
        chips_ = n;
        updatePan();
    }
    int chips() const { return chips_; }
    /** Stereobreedte 0..1: 0 = alle chips in het midden, 1 = van links naar rechts. */
    void setSpread(float s) { spread_ = s < 0.f ? 0.f : (s > 1.f ? 1.f : s); updatePan(); }

    // Per cel (0-based, 0..11).
    void setVoct(int k, float v) { if (okCell(k)) chip_[k / 3].setVoct(k % 3, v); }
    void gate(int k, bool high)  { if (okCell(k)) chip_[k / 3].gate(k % 3, high); }

    /** Iets op alle chips toepassen (de gedeelde knoppen). */
    template <class F> void all(F f) { for (auto& c : chip_) f(c); }

    /** Eén sample. @p ext = EXT IN per chip (kMaxChips waarden, elk door het
     *  filter van zijn eigen chip: stereo over chip 1+2, quad over 1–4).
     *  @p out krijgt kNumOuts waarden: mono, L, R, chip 1..4. */
    void Process(const float* ext, float* out) {
        float mono = 0.f, l = 0.f, r = 0.f;
        for (int j = 0; j < kMaxChips; ++j) {
            const float y = j < chips_ ? chip_[j].Process(ext[j]) : 0.f;
            out[kOutChip1 + j] = y;
            mono += y; l += y * panL_[j]; r += y * panR_[j];
        }
        float sum[3] = { mono * gain_, l * gain_, r * gain_ };
        limiter_.Process(sum, 3);
        out[kOutMono] = sum[0]; out[kOutL] = sum[1]; out[kOutR] = sum[2];
    }
    /** Eén sample met alleen EXT IN op chip 1. */
    void Process(float ext1, float* out) {
        const float ext[kMaxChips] = { ext1, 0.f, 0.f, 0.f };
        Process(ext, out);
    }

private:
    static bool okCell(int k) { return k >= 0 && k < kCells; }
    /** Balans-panning van chip j over het stereobeeld (midden: 1 op beide
     *  kanten, dus één chip op L/R klinkt als de mono-uitgang; helemaal links:
     *  1 en 0). De som krijgt 1/√n zodat meer chips niet evenredig harder
     *  worden. */
    void updatePan() {
        for (int j = 0; j < kMaxChips; ++j) {
            const float pos = chips_ > 1 ? spread_ * (-1.f + 2.f * static_cast<float>(j) / static_cast<float>(chips_ - 1)) : 0.f;
            panL_[j] = pos > 0.f ? 1.f - pos : 1.f;
            panR_[j] = pos < 0.f ? 1.f + pos : 1.f;
        }
        gain_ = 1.0f / std::sqrt(static_cast<float>(chips_));
    }

    SidSynth chip_[kMaxChips];
    OutputLimiter limiter_;
    int   chips_ = 1;
    float spread_ = 0.7f, gain_ = 1.f;
    float panL_[kMaxChips] = {}, panR_[kMaxChips] = {};
};

}  // namespace mmb_dsp
