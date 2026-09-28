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
 *    combinaties als AND van de 12-bit waarden (benadering), ring-mod en
 *    hard sync (bron = de vorige stem, cyclisch 3 → 1 → 2 → 3), test-bit;
 *  - noise: 23-bit LFSR (terugkoppeling bits 22 ^ 17), geklokt op de
 *    stijgende flank van accumulator-bit 19, 8 uitgangsbits;
 *  - ADSR per stem, cycle-exact als integer-toestandsmachine: de periodetabel,
 *    het pseudo-exponentiële verval (knikpunten 93/54/26/14/6) en de 15-bit
 *    rate-teller — waardoor de ADSR-bug vanzelf ontstaat;
 *  - 4-bit master volume en 3OFF;
 *  - een DC-blokker op de uitgang (eerste-orde hoogdoorlaat, 10 Hz): de rol
 *    van de koppelcondensator op de C64. Combined waveforms liggen vaak op de
 *    bodem van de DAC en geven anders een gelijkspanning die met de PW
 *    meezwaait.
 * Nog niet: het filter (registers worden wel bewaard), de DC-offset van de
 * 6581 en gemeten combined waveforms.
 *
 * Band-limited: niet cycle-exact. Per audio-sample schuift de accumulator
 * ~22 SID-cycli door; elke sprong in de golfvorm (wrap, pulsflank, sync-reset,
 * ring-omslag, noise-klok) krijgt een PolyBLEP op zijn exacte tijdstip. Dat
 * kost één sample latentie.
 */

#include <cmath>
#include <cstdint>

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
        dcR_ = std::exp(-2.0f * 3.14159265f * kDcBlockHz / sampleRate);
        Reset();
    }

    void Reset() {
        for (auto& r : regs_) r = 0;
        for (auto& v : voice_) v = Voice{};
        cycleFrac_ = 0.0;
        dcX1_ = dcY1_ = 0.0f;
    }

    double clock() const { return clock_; }

    void write(int reg, uint8_t val) {
        if (reg < 0 || reg >= kNumRegs) return;
        regs_[reg] = val;
        if (reg < 21 && reg % 7 == 4) {                   // besturingsregister
            Voice& v = voice_[reg / 7];
            const bool gate = val & kGate;
            if (gate && !v.gate) { v.envState = kAttack; v.holdZero = false; }
            else if (!gate && v.gate) { v.envState = kRelease; }
            v.gate = gate;
            if (val & kTest) { v.acc = 0.0; v.lfsr = kLfsrInit; }
        }
    }
    uint8_t reg(int r) const { return (r >= 0 && r < kNumRegs) ? regs_[r] : 0; }

    /** Eén sample, mono. Eén stem op vol volume ≈ ±1; drie stemmen ≈ ±3. */
    float Process() {
        cycleFrac_ += cyclesPerSample_;
        const int cycles = static_cast<int>(cycleFrac_);
        cycleFrac_ -= cycles;

        // Fase A: vrij-lopende MSB-flanken van elke stem (bron voor sync/ring
        // van de volgende stem). Tweede-orde-effecten (een bron die zelf net
        // gesynct wordt) laten we weg.
        Free fr[3];
        for (int i = 0; i < 3; ++i) fr[i] = freeEdges(i);

        float mix = 0.0f;
        const uint8_t modeVol = regs_[0x18];
        const uint8_t filt = regs_[0x17] & 0x0f;
        for (int i = 0; i < 3; ++i) {
            const float w = renderVoice(i, fr[(i + 2) % 3]);
            clockEnvelope(voice_[i], i, cycles);
            Voice& v = voice_[i];
            const float out = w * v.prevEnv * (1.0f / 255.0f);
            v.prevEnv = static_cast<float>(v.env);
            // 3OFF: stem 3 uit de mix, tenzij hij door het filter gaat.
            if (i == 2 && (modeVol & 0x80) && !(filt & 0x04)) continue;
            mix += out;
        }
        const float x = mix * static_cast<float>(modeVol & 0x0f) * (1.0f / 15.0f);
        // DC-blokker: y = x − x₋₁ + R·y₋₁.
        const float y = x - dcX1_ + dcR_ * dcY1_;
        dcX1_ = x; dcY1_ = y;
        return y;
    }

    // ── test-/meethaakjes ────────────────────────────────────────────
    uint32_t acc(int i) const   { return static_cast<uint32_t>(voice_[i].acc) >> 8; }  // 24 bits
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
    static constexpr uint32_t kLfsrInit = 0x7ffff8;
    static constexpr double   k2p32 = 4294967296.0;
    static constexpr double   k2p31 = 2147483648.0;

    struct Voice {
        double   acc = 0.0;        // accumulator × 2^8 (acc24 in de bovenste 24 van 32 bits)
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
    struct Free { double rise = -1.0, fall = -1.0; bool msbStart = false; };

    Free freeEdges(int i) const {
        const Voice& v = voice_[i];
        Free f;
        f.msbStart = v.acc >= k2p31;
        const double inc = increment(i);
        if (inc <= 0.0 || (regs_[i * 7 + 4] & kTest)) return f;
        const double end = v.acc + inc;
        if (v.acc < k2p31 && end >= k2p31) f.rise = (k2p31 - v.acc) / inc;
        if (end >= k2p32) f.fall = (k2p32 - v.acc) / inc;
        return f;
    }

    double increment(int i) const {
        const unsigned freq = regs_[i * 7] | (regs_[i * 7 + 1] << 8);
        return static_cast<double>(freq) * 256.0 * cyclesPerSample_;
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
    static float waveform(uint8_t ctrl, uint32_t acc32, bool srcMsb, uint32_t lfsr, uint32_t pwThr) {
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
        // Combinaties: AND van de 12-bit waarden. Echte chips wijken hier
        // per exemplaar van af (plan §2, stap 6: meten).
        uint32_t v = 0xfff;
        if (sel & kTri)   v &= (tri32 >> 20) & 0xffe;
        if (sel & kSaw)   v &= acc32 >> 20;
        if (sel & kPulse) v &= pulseHigh ? 0xfff : 0;
        if (sel & kNoise) v &= static_cast<uint32_t>(noiseBits(lfsr)) << 4;
        return (static_cast<float>(v) - 2048.0f) * (1.0f / 2048.0f);
    }

    enum EvType { kEvWrap, kEvPulse, kEvNoise, kEvSrc, kEvSync };
    struct Event { double t; int type; };

    /** Eén stem één sample verder; geeft het (één sample vertraagde) band-limited sample. */
    float renderVoice(int i, const Free& src) {
        Voice& v = voice_[i];
        const uint8_t ctrl = regs_[i * 7 + 4];
        const uint32_t thr = pulseThreshold(i);
        const double inc = (ctrl & kTest) ? 0.0 : increment(i);
        bool srcMsb = src.msbStart;

        // Gebeurtenissen verzamelen (hooguit een handvol per sample).
        Event ev[24]; int n = 0;
        auto add = [&](double t, int type) { if (t >= 0.0 && t < 1.0 && n < 24) ev[n++] = { t, type }; };
        double syncT = -1.0;
        if ((ctrl & kSync) && src.rise >= 0.0) { syncT = src.rise; add(syncT, kEvSync); }
        if ((ctrl & kRing) && (ctrl & kTri)) { add(src.rise, kEvSrc); add(src.fall, kEvSrc); }
        if (inc > 0.0) {
            // Vóór een eventuele sync-reset: vanaf de huidige stand.
            const double lim = syncT >= 0.0 ? syncT : 1.0;
            const double a0 = v.acc, a1 = a0 + inc * lim;
            if (a1 >= k2p32) add((k2p32 - a0) / inc, kEvWrap);
            addCrossings(a0, a1, inc, 0.0, thr, add);
            if (ctrl & kNoise) addNoiseClocks(a0, a1, inc, 0.0, add);
            // Na de reset: vanaf 0.
            if (syncT >= 0.0) {
                const double b1 = inc * (1.0 - syncT);
                addCrossings(0.0, b1, inc, syncT, thr, add);
                if (ctrl & kNoise) addNoiseClocks(0.0, b1, inc, syncT, add);
            }
        }
        // Sorteren op tijd (insertion sort, n is klein).
        for (int a = 1; a < n; ++a) {
            Event e = ev[a]; int b = a - 1;
            while (b >= 0 && ev[b].t > e.t) { ev[b + 1] = ev[b]; --b; }
            ev[b + 1] = e;
        }

        // Doorlopen: vóór/na elke gebeurtenis de golfvorm, sprong = BLEP.
        double base = v.acc, tBase = 0.0;
        float corrPrev = 0.0f, corrCur = 0.0f;
        for (int k = 0; k < n; ++k) {
            const double t = ev[k].t;
            double at = base + inc * (t - tBase);
            uint32_t before, after;
            uint32_t lfsrBefore = v.lfsr;
            bool srcBefore = srcMsb;
            switch (ev[k].type) {
                case kEvWrap:
                    before = 0xffffffffu; after = 0u;
                    base = at - k2p32; tBase = t;
                    if (base < 0.0) base = 0.0;
                    break;
                case kEvPulse:
                    before = thr - 1u; after = thr;
                    break;
                case kEvNoise: {
                    // De flank ligt op m·2^28 + 2^27; `at` zit daar op afronding na.
                    const double x = std::floor((at - 134217728.0) / 268435456.0 + 0.5) * 268435456.0 + 134217728.0;
                    after = clampAcc(x >= k2p32 ? x - k2p32 : x);
                    before = after - 1u;
                    v.lfsr = clockLfsr(v.lfsr);
                    break;
                }
                case kEvSrc:
                    before = after = clampAcc(at);
                    srcMsb = !srcMsb;
                    break;
                default:  // kEvSync
                    before = clampAcc(at); after = 0u;
                    base = 0.0; tBase = t;
                    break;
            }
            const float h = waveform(ctrl, after, srcMsb, v.lfsr, thr) -
                            waveform(ctrl, before, srcBefore, lfsrBefore, thr);
            if (h != 0.0f) {
                const float tf = static_cast<float>(t);
                corrPrev += 0.5f * h * (1.0f - tf) * (1.0f - tf);
                corrCur  -= 0.5f * h * tf * tf;
            }
        }
        double end = base + inc * (1.0 - tBase);
        if (end >= k2p32) end -= k2p32;
        if (end < 0.0) end = 0.0;
        v.acc = end;

        const float naive = waveform(ctrl, clampAcc(end), srcMsb, v.lfsr, thr);
        const float out = v.prevVal + corrPrev;
        v.prevVal = naive + corrCur;
        return out;
    }

    static uint32_t clampAcc(double a) {
        if (a <= 0.0) return 0u;
        if (a >= k2p32 - 1.0) return 0xffffffffu;
        return static_cast<uint32_t>(a);
    }

    /** Doorgang van drempel X (en X + 2^32) in (a0, a1]; tijd = t0 + afstand/inc. */
    template <class Add>
    static void addCrossings(double a0, double a1, double inc, double t0, uint32_t X, Add& add) {
        if (X == 0u) return;                  // pw 0: altijd hoog, geen flank
        const double x = static_cast<double>(X);
        if (a0 < x && x <= a1) add(t0 + (x - a0) / inc, kEvPulse);
        if (a0 < x + k2p32 && x + k2p32 <= a1) add(t0 + (x + k2p32 - a0) / inc, kEvPulse);
    }
    /** Stijgende flanken van bit 19 (acc24) = bit 27 (acc32): bij m·2^28 + 2^27. */
    template <class Add>
    static void addNoiseClocks(double a0, double a1, double inc, double t0, Add& add) {
        const double P = 268435456.0, H = 134217728.0;
        double m = std::floor((a0 - H) / P) + 1.0;
        for (int guard = 0; guard < 8; ++guard, m += 1.0) {
            const double x = m * P + H;
            if (x > a1) break;
            if (x > a0) add(t0 + (x - a0) / inc, kEvNoise);
        }
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
    double  cycleFrac_ = 0.0;
    static constexpr float kDcBlockHz = 10.0f;
    float   dcR_ = 0.9986f, dcX1_ = 0.0f, dcY1_ = 0.0f;
};

/**
 * Besturingslaag: drie stem-cellen (V/oct + gate), gedeelde knoppen, alles
 * naar SID-registers. De firmwaremodule en de wasm zijn hier dunne schillen
 * omheen; een hardware-backend (de SID-kaart) krijgt later dezelfde writes.
 */
class SidSynth {
public:
    static constexpr int kVoices = 3;

    void Init(float sampleRate) {
        chip_.Init(sampleRate);
        for (int k = 0; k < kVoices; ++k) { writeFreq(k); writePw(k); writeAdsr(k); writeControl(k); }
        writeVolume();
    }
    SidChip& chip() { return chip_; }

    // ── per cel ──────────────────────────────────────────────────────
    void setVoct(int k, float v) { if (ok(k) && v != voct_[k]) { voct_[k] = v; writeFreq(k); } }
    void gate(int k, bool high)  { if (ok(k) && high != gate_[k]) { gate_[k] = high; writeControl(k); } }

    // ── gedeeld ──────────────────────────────────────────────────────
    void setBend(float v)        { if (v != bend_) { bend_ = v; allFreq(); } }
    void setCoarse(float st)     { coarse_ = st; allFreq(); }
    void setFine(float ct)       { fine_ = ct; allFreq(); }
    void setWave(uint8_t bits)   { wave_ = bits & 0xf0; allControl(); }
    void setWaveBit(uint8_t bit, bool on) { setWave(on ? (wave_ | bit) : (wave_ & ~bit)); }
    void setRing(bool on)        { ring_ = on; allControl(); }
    void setSync(bool on)        { sync_ = on; allControl(); }
    void setPw(float pw)         { pw_ = pw; allPw(); }
    void setPwCv(float cv)       { if (cv != pwCv_) { pwCv_ = cv; allPw(); } }
    void setAttack(int n)        { attack_ = nib(n);  allAdsr(); }
    void setDecay(int n)         { decay_ = nib(n);   allAdsr(); }
    void setSustain(int n)       { sustain_ = nib(n); allAdsr(); }
    void setRelease(int n)       { release_ = nib(n); allAdsr(); }
    void setVolume(int n)        { volume_ = nib(n); writeVolume(); }
    void setLevel(float l)       { level_ = l < 0.f ? 0.f : (l > 1.f ? 1.f : l); }

    /** Eén sample, mono, ±1 (hard begrensd). */
    float Process() {
        const float y = chip_.Process() * level_ * kGain;
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

    static bool ok(int k) { return k >= 0 && k < kVoices; }
    static uint8_t nib(int n) { return static_cast<uint8_t>(n < 0 ? 0 : (n > 15 ? 15 : n)); }
    void allFreq()    { for (int k = 0; k < kVoices; ++k) writeFreq(k); }
    void allControl() { for (int k = 0; k < kVoices; ++k) writeControl(k); }
    void allPw()      { for (int k = 0; k < kVoices; ++k) writePw(k); }
    void allAdsr()    { for (int k = 0; k < kVoices; ++k) writeAdsr(k); }

    void writeFreq(int k) {
        // V/oct rond C4 (MIDI 60 = 0 V = 261,63 Hz), zoals de rest van MMB.
        const double oct = voct_[k] + bend_ + (coarse_ + fine_ * 0.01) / 12.0;
        const uint16_t f = freqReg(261.6255653 * std::pow(2.0, oct));
        chip_.write(k * 7 + 0, f & 0xff);
        chip_.write(k * 7 + 1, f >> 8);
    }
    void writePw(int k) {
        float p = pw_ + pwCv_;
        p = p < 0.f ? 0.f : (p > 1.f ? 1.f : p);
        const unsigned v = static_cast<unsigned>(p * 4095.0f + 0.5f);
        chip_.write(k * 7 + 2, v & 0xff);
        chip_.write(k * 7 + 3, (v >> 8) & 0x0f);
    }
    void writeAdsr(int k) {
        chip_.write(k * 7 + 5, static_cast<uint8_t>((attack_ << 4) | decay_));
        chip_.write(k * 7 + 6, static_cast<uint8_t>((sustain_ << 4) | release_));
    }
    void writeControl(int k) {
        uint8_t c = wave_;
        if (ring_) c |= SidChip::kRing;
        if (sync_) c |= SidChip::kSync;
        if (gate_[k]) c |= SidChip::kGate;
        chip_.write(k * 7 + 4, c);
    }
    void writeVolume() { chip_.write(0x18, static_cast<uint8_t>((chip_.reg(0x18) & 0xf0) | volume_)); }

    SidChip chip_;
    float   voct_[kVoices] = {};
    bool    gate_[kVoices] = {};
    float   bend_ = 0.f, coarse_ = 0.f, fine_ = 0.f;
    uint8_t wave_ = SidChip::kPulse;
    bool    ring_ = false, sync_ = false;
    float   pw_ = 0.5f, pwCv_ = 0.f;
    uint8_t attack_ = 0, decay_ = 9, sustain_ = 10, release_ = 9, volume_ = 15;
    float   level_ = 0.8f;
};

}  // namespace mmb_dsp
