#pragma once
// CONV — convolutiegalm (doc/plans/conv-reverb.md), eigen code (MIT). Gedeeld
// door de Teensy (ConvModule.h) en de simulator (conv_wasm.cc).
//
// Opbouw:
//  - pre-delay en de convolutie lezen uit één ingangsring (mono-som van L+R);
//  - de impulsrespons (IR, stereo) is opgedeeld in partities van oplopende
//    grootte (niet-uniform, Gardner 1995): 3 × 64 samples, dan 2 × 128,
//    2 × 256 … tot 4096, en de rest van de staart in blokken van 4096. Elke
//    grootte is een overlap-save-convolutie in het frequentiedomein met een
//    eigen vertragingslijn van spectra (FDL). Kleine blokken voor de kop
//    (weinig vertraging), grote voor de staart (weinig rekenwerk per sample);
//  - de grotere niveaus hebben één blok speling; hun werk wordt verdeeld over
//    de tikken van 64 samples binnen hun periode, zodat er geen cpu-piek is
//    eens per 4096 samples;
//  - de vertraging van het geheel is 64 samples (1,45 ms); die gaat af van de
//    pre-delay;
//  - op de natte kant: Lo cut, Hi cut (eenpolig), Width (mid/side), Mix.
//
// De IR's: een bank van gegenereerde ruimtes (gekleurde, uitstervende ruis
// met vroege reflecties, per band een eigen galmtijd). Size rekt de IR op
// (herbemonsteren: een grotere of kleinere ruimte), Length kapt af met een
// uitfade. Alle IR's worden genormaliseerd op energie 1, zodat Mix bij elke
// IR ongeveer even luid is.
//
// Een nieuwe IR (knop IR, Size, Length) vraagt een herberekening van alle
// spectra. Standaard doet Process die zelf (simulator); de Teensy zet
// setAutoRebuild(false) en roept rebuild() aan vanuit de hoofdlus.
//
// Geheugen via convAllocator(): standaard malloc; de Teensy zet PSRAM in. De
// toegang is op volgorde (per partitie een aaneengesloten blok), dus PSRAM met
// zijn cache is hier geschikt.

#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>

namespace mmb_dsp {

struct ConvAllocator {
    void* (*alloc)(std::size_t bytes) = std::malloc;
    void (*free)(void* p) = std::free;
};
inline ConvAllocator& convAllocator() { static ConvAllocator a; return a; }

/** Reële FFT van lengte n (macht van 2). Gepakt formaat zoals CMSIS:
 *  [0] = DC, [1] = Nyquist, daarna (re, im) voor de bins 1 … n/2−1.
 *  inverse(forward(x)) = x (de schaal zit in inverse). */
class ConvFft {
public:
    ConvFft() = default;
    ConvFft(const ConvFft&) = delete;
    ConvFft& operator=(const ConvFft&) = delete;
    ~ConvFft() { release(); }

    bool init(int n) {
        release();
        n_ = n; m_ = n / 2;
        twC_ = static_cast<float*>(std::malloc(sizeof(float) * (m_ > 1 ? m_ : 2)));
        twR_ = static_cast<float*>(std::malloc(sizeof(float) * 2 * m_));
        rev_ = static_cast<int*>(std::malloc(sizeof(int) * m_));
        if (!twC_ || !twR_ || !rev_) { release(); return false; }
        for (int k = 0; k < m_ / 2; ++k) {
            const double a = -2.0 * 3.14159265358979323846 * k / m_;
            twC_[2 * k] = static_cast<float>(std::cos(a)); twC_[2 * k + 1] = static_cast<float>(std::sin(a));
        }
        for (int k = 0; k < m_; ++k) {
            const double a = -2.0 * 3.14159265358979323846 * k / n_;
            twR_[2 * k] = static_cast<float>(std::cos(a)); twR_[2 * k + 1] = static_cast<float>(std::sin(a));
        }
        int bits = 0; while ((1 << bits) < m_) ++bits;
        for (int i = 0; i < m_; ++i) {
            int r = 0; for (int b = 0; b < bits; ++b) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
            rev_[i] = r;
        }
        return true;
    }
    void release() {
        std::free(twC_); std::free(twR_); std::free(rev_);
        twC_ = twR_ = nullptr; rev_ = nullptr; n_ = m_ = 0;
    }
    int size() const { return n_; }

    void forward(const float* in, float* out) const {
        if (in != out) std::memcpy(out, in, sizeof(float) * n_);
        cfft(out, false);
        const float z0r = out[0], z0i = out[1];
        out[0] = z0r + z0i; out[1] = z0r - z0i;
        for (int k = 1; k <= m_ / 2; ++k) {
            const int j = m_ - k;
            const float zkr = out[2 * k], zki = out[2 * k + 1], zjr = out[2 * j], zji = out[2 * j + 1];
            const float fer = 0.5f * (zkr + zjr), fei = 0.5f * (zki - zji);
            const float for_ = 0.5f * (zki + zji), foi = -0.5f * (zkr - zjr);
            const float wr = twR_[2 * k], wi = twR_[2 * k + 1];
            const float tr = wr * for_ - wi * foi, ti = wr * foi + wi * for_;
            out[2 * k] = fer + tr; out[2 * k + 1] = fei + ti;
            out[2 * j] = fer - tr; out[2 * j + 1] = -(fei - ti);
        }
    }

    void inverse(const float* in, float* out) const {
        const float x0 = in[0], xm = in[1];
        for (int k = 1; k <= m_ / 2; ++k) {
            const int j = m_ - k;
            const float xkr = in[2 * k], xki = in[2 * k + 1], xjr = in[2 * j], xji = in[2 * j + 1];
            const float fer = 0.5f * (xkr + xjr), fei = 0.5f * (xki - xji);
            const float br = xkr - xjr, bi = xki + xji;
            const float wr = twR_[2 * k], wi = twR_[2 * k + 1];
            const float fr = 0.5f * (br * wr + bi * wi), fi = 0.5f * (bi * wr - br * wi);
            out[2 * k] = fer - fi; out[2 * k + 1] = fei + fr;
            out[2 * j] = fer + fi; out[2 * j + 1] = -fei + fr;
        }
        out[0] = 0.5f * (x0 + xm); out[1] = 0.5f * (x0 - xm);
        cfft(out, true);
        const float s = 1.0f / static_cast<float>(m_);
        for (int i = 0; i < n_; ++i) out[i] *= s;
    }

private:
    void cfft(float* d, bool inverse) const {
        for (int i = 0; i < m_; ++i) {
            const int j = rev_[i];
            if (i < j) {
                float t = d[2 * i]; d[2 * i] = d[2 * j]; d[2 * j] = t;
                t = d[2 * i + 1]; d[2 * i + 1] = d[2 * j + 1]; d[2 * j + 1] = t;
            }
        }
        for (int len = 2; len <= m_; len <<= 1) {
            const int half = len >> 1, step = m_ / len;
            for (int k = 0; k < half; ++k) {
                const float wr = twC_[2 * k * step];
                const float wi = inverse ? -twC_[2 * k * step + 1] : twC_[2 * k * step + 1];
                for (int i = k; i < m_; i += len) {
                    float* a = d + 2 * i;
                    float* b = d + 2 * (i + half);
                    const float xr = b[0] * wr - b[1] * wi, xi = b[0] * wi + b[1] * wr;
                    b[0] = a[0] - xr; b[1] = a[1] - xi;
                    a[0] += xr; a[1] += xi;
                }
            }
        }
    }

    int n_ = 0, m_ = 0;
    float* twC_ = nullptr;
    float* twR_ = nullptr;
    int* rev_ = nullptr;
};

class Conv {
public:
    enum Control { Ir, Mix, Predelay, Length, Size, LoCut, HiCut, Width, kControls };
    enum CvIn { MixCv, kCvIns };
    enum CvOut { kCvOuts };

    static constexpr int kTick = 64;              // kleinste blok = vertraging
    static constexpr int kMaxBlock = 4096;        // grootste blok (FFT 8192)
    static constexpr int kMaxLevels = 8;
    static constexpr int kRing = 32768;           // ingang: 250 ms pre-delay + 2 × 4096
    static constexpr float kMaxSeconds = 4.0f;    // langste IR (na Size)
    static constexpr int kIrCount = 6;
    static constexpr float kDefaults[kControls] = { 0, 0.3f, 10.0f, 4.0f, 1.0f, 20.0f, 16000.0f, 1.0f };

    Conv() = default;
    Conv(const Conv&) = delete;
    Conv& operator=(const Conv&) = delete;
    ~Conv() { freeLevels(); convAllocator().free(ring_); }

    void Init(float sampleRate) {
        sr_ = sampleRate;
        if (!ring_) ring_ = static_cast<float*>(convAllocator().alloc(sizeof(float) * kRing));
        if (ring_) std::memset(ring_, 0, sizeof(float) * kRing);
        t_ = 0;
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
    }

    void setControl(int control, float v) {
        switch (control) {
            case Ir: { const int i = clampi(static_cast<int>(v + 0.5f), 0, kIrCount - 1); if (i != ir_) { ir_ = i; pending_ = true; } break; }
            case Mix: mix_ = clamp01(v); break;
            case Predelay: predelayMs_ = v < 0.0f ? 0.0f : (v > 250.0f ? 250.0f : v); break;
            case Length: { const float l = v < 0.1f ? 0.1f : (v > kMaxSeconds ? kMaxSeconds : v); if (l != length_) { length_ = l; pending_ = true; } break; }
            case Size: { const float s = v < 0.5f ? 0.5f : (v > 2.0f ? 2.0f : v); if (s != size_) { size_ = s; pending_ = true; } break; }
            case LoCut: loCut_ = v < 10.0f ? 10.0f : (v > 2000.0f ? 2000.0f : v); break;
            case HiCut: hiCut_ = v < 500.0f ? 500.0f : (v > 20000.0f ? 20000.0f : v); break;
            case Width: width_ = clamp01(v); break;
            default: return;
        }
        update();
    }
    void setCv(int input, float v) {
        if (v != v) v = 0.0f;
        if (input == MixCv) { mixCv_ = v; update(); }
    }
    float cvOut(int) const { return 0.0f; }

    void setAutoRebuild(bool on) { autoRebuild_ = on; }
    bool rebuildPending() const { return pending_; }
    /** Lengte van de huidige IR in samples (0 = geen). */
    int irLength() const { return irLen_; }

    /** Alle spectra opnieuw (nieuwe IR, Size of Length). Op de Teensy uit de
     *  hoofdlus, met de audio even uit voor de wissel (zie ConvModule.h). */
    bool rebuild() {
        pending_ = false;
        const int maxLen = static_cast<int>(kMaxSeconds * sr_);
        // De natuurlijke IR, zo lang als na het oprekken nog past.
        const Preset& p = kPresets[ir_];
        int natLen = static_cast<int>(p.t60 * 1.1f * sr_);
        const int cap = static_cast<int>(static_cast<float>(maxLen) / size_) + 2;
        if (natLen > cap) natLen = cap;
        int len = static_cast<int>(static_cast<float>(natLen) * size_);
        const int lenCap = static_cast<int>(length_ * sr_);
        if (len > lenCap) len = lenCap;
        if (len > maxLen) len = maxLen;
        if (len < kTick) len = kTick;

        ConvAllocator& A = convAllocator();
        float* nat = static_cast<float*>(A.alloc(sizeof(float) * 2 * natLen));
        float* ir = static_cast<float*>(A.alloc(sizeof(float) * 2 * len));
        bool ok = nat && ir;
        if (ok) {
            generate(p, nat, nat + natLen, natLen);
            for (int c = 0; c < 2; ++c) resample(nat + c * natLen, natLen, ir + c * len, len, size_);
            finish(ir, ir + len, len);
        }
        A.free(nat);
        Level fresh[kMaxLevels];
        int count = 0;
        if (ok) ok = plan(fresh, count, len) && fill(fresh, count, ir, ir + len, len);
        A.free(ir);
        if (!ok) { for (int i = 0; i < count; ++i) freeLevel(fresh[i]); return false; }
        freeLevels();
        for (int i = 0; i < count; ++i) { levels_[i] = fresh[i]; fresh[i] = Level(); }
        levelCount_ = count;
        irLen_ = len;
        return true;
    }

    /** in[0]/in[1] (R mag nullptr zijn), out[0]/out[1]. */
    void Process(const float* const* in, float* const* out, int frames) {
        if (pending_ && autoRebuild_) rebuild();
        const float* inL = in[0];
        const float* inR = in[1] ? in[1] : in[0];
        for (int n = 0; n < frames; ++n) {
            const float l = inL ? inL[n] : 0.0f;
            const float r = inR ? inR[n] : l;
            if (!ring_ || levelCount_ == 0) { out[0][n] = l; out[1][n] = r; continue; }
            if ((t_ & (kTick - 1)) == 0) tick(t_);
            ring_[t_ & (kRing - 1)] = 0.5f * (l + r);
            float wl = 0.0f, wr = 0.0f;
            for (int i = 0; i < levelCount_; ++i) {
                const Level& L = levels_[i];
                const float* o = L.out + L.cur * 2 * L.n;
                const int idx = static_cast<int>(t_ & static_cast<std::uint32_t>(L.n - 1));
                wl += o[idx]; wr += o[L.n + idx];
            }
            ++t_;
            // Natte kant: Lo cut, Hi cut, Width.
            hpL_ += (wl - hpL_) * loCoef_; wl -= hpL_;
            hpR_ += (wr - hpR_) * loCoef_; wr -= hpR_;
            lpL_ += (wl - lpL_) * hiCoef_; lpR_ += (wr - lpR_) * hiCoef_;
            const float mid = 0.5f * (lpL_ + lpR_), side = 0.5f * (lpL_ - lpR_) * width_;
            out[0][n] = l * dry_ + (mid + side) * wet_;
            out[1][n] = r * dry_ + (mid - side) * wet_;
        }
    }

private:
    struct Preset { float t60, lo, hi, attackMs, earlyFrom, earlyTo; int earlyCount; float earlyGain; };
    // Gegenereerde ruimtes: galmtijd (s), laag/hoog als factor daarop, opbouw,
    // vroege reflecties (venster in ms, aantal, sterkte).
    static constexpr Preset kPresets[kIrCount] = {
        { 2.4f, 1.3f, 0.50f, 25.0f, 12.0f,  85.0f, 10, 0.5f },   // Hall
        { 0.7f, 1.0f, 0.60f,  5.0f,  3.0f,  30.0f, 14, 0.7f },   // Room
        { 1.4f, 1.1f, 0.70f, 10.0f,  6.0f,  50.0f, 12, 0.5f },   // Chamber
        { 2.0f, 0.8f, 0.90f,  1.0f,  0.0f,   0.0f,  0, 0.0f },   // Plate
        { 4.2f, 1.4f, 0.40f, 60.0f, 20.0f, 150.0f,  8, 0.4f },   // Church
        { 0.35f, 0.9f, 0.70f, 2.0f,  1.0f,  15.0f, 16, 0.8f },   // Small
    };

    struct Level {
        int n = 0, start = 0, parts = 0, slices = 1, delay = 0;
        int fdlPos = 0, cur = 0;
        ConvFft* fft = nullptr;
        float* mem = nullptr;     // één blok: h, fdl, acc, out, win
        float* h = nullptr;       // [2][parts][2n]
        float* fdl = nullptr;     // [parts][2n]
        float* acc = nullptr;     // [2][2n]
        float* out = nullptr;     // [2 buffers][2 kanalen][n]
        float* win = nullptr;     // [2n]
    };

    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    static int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

    void update() {
        preSamples_ = static_cast<int>(predelayMs_ * 0.001f * sr_) - kTick;   // de blokvertraging gaat ervan af
        if (preSamples_ < 0) preSamples_ = 0;
        loCoef_ = 1.0f - std::exp(-6.2831853f * loCut_ / sr_);
        hiCoef_ = 1.0f - std::exp(-6.2831853f * hiCut_ / sr_);
        const float mix = clamp01(mix_ + mixCv_);
        dry_ = std::cos(1.5707963f * mix);
        wet_ = std::sin(1.5707963f * mix);
    }

    // ── De partities ────────────────────────────────────────────────────
    bool plan(Level* lv, int& count, int len) {
        count = 0;
        int start = 0, n = kTick;
        while (start < len && count < kMaxLevels) {
            Level& L = lv[count];
            L.n = n; L.start = start;
            const int need = (len - start + n - 1) / n;
            if (count == 0) {
                L.slices = 1; L.delay = kTick + start - n;              // = 0
                L.parts = need < 3 ? need : 3;
            } else {
                L.slices = n / kTick; L.delay = kTick + start - 2 * n;  // = 0 bij start = 2n − 64
                L.parts = (n == kMaxBlock || need < 2) ? need : 2;
            }
            if (L.delay < 0) return false;
            const std::size_t floats = static_cast<std::size_t>(2 * n) * (3 * L.parts + 2 + 1) + static_cast<std::size_t>(4 * n);
            L.mem = static_cast<float*>(convAllocator().alloc(sizeof(float) * floats));
            L.fft = new (std::nothrow) ConvFft;
            ++count;
            if (!L.mem || !L.fft || !L.fft->init(2 * n)) return false;
            std::memset(L.mem, 0, sizeof(float) * floats);
            L.h = L.mem;
            L.fdl = L.h + static_cast<std::size_t>(2) * L.parts * 2 * n;
            L.acc = L.fdl + static_cast<std::size_t>(L.parts) * 2 * n;
            L.out = L.acc + 4 * n;
            L.win = L.out + 4 * n;
            start += L.parts * n;
            if (count == 1) n = 2 * kTick;
            else if (n < kMaxBlock) n *= 2;
        }
        return start >= len;
    }

    bool fill(Level* lv, int count, const float* irL, const float* irR, int len) {
        for (int i = 0; i < count; ++i) {
            Level& L = lv[i];
            for (int c = 0; c < 2; ++c) {
                const float* ir = c ? irR : irL;
                for (int p = 0; p < L.parts; ++p) {
                    float* w = L.win;
                    const int from = L.start + p * L.n;
                    for (int k = 0; k < L.n; ++k) w[k] = from + k < len ? ir[from + k] : 0.0f;
                    std::memset(w + L.n, 0, sizeof(float) * L.n);
                    L.fft->forward(w, L.h + (static_cast<std::size_t>(c) * L.parts + p) * 2 * L.n);
                }
            }
        }
        return true;
    }

    void freeLevel(Level& L) {
        convAllocator().free(L.mem);
        delete L.fft;
        L = Level();
    }
    void freeLevels() {
        for (int i = 0; i < levelCount_; ++i) freeLevel(levels_[i]);
        levelCount_ = 0;
        irLen_ = 0;
    }

    // ── Het rekenwerk, elke 64 samples ──────────────────────────────────
    void tick(std::uint32_t tc) {
        for (int i = 0; i < levelCount_; ++i) {
            Level& L = levels_[i];
            if (L.slices == 1) {
                if ((tc & static_cast<std::uint32_t>(L.n - 1)) != 0) continue;
                startJob(L, tc);
                mac(L, 0, L.parts);
                finishJob(L, L.cur);
            } else {
                const int phase = static_cast<int>((tc / kTick) % static_cast<std::uint32_t>(L.slices));
                if (phase == 0) { L.cur ^= 1; startJob(L, tc); }
                mac(L, phase * L.parts / L.slices, (phase + 1) * L.parts / L.slices);
                if (phase == L.slices - 1) finishJob(L, L.cur ^ 1);
            }
        }
    }

    void startJob(Level& L, std::uint32_t tc) {
        const int n2 = 2 * L.n;
        const std::uint32_t end = tc - static_cast<std::uint32_t>(L.delay + preSamples_);
        const std::uint32_t from = end - static_cast<std::uint32_t>(n2);
        for (int k = 0; k < n2; ++k) L.win[k] = ring_[(from + k) & (kRing - 1)];
        L.fft->forward(L.win, L.fdl + static_cast<std::size_t>(L.fdlPos) * n2);
        std::memset(L.acc, 0, sizeof(float) * 2 * n2);
    }

    void mac(Level& L, int p0, int p1) {
        const int n2 = 2 * L.n;
        for (int p = p0; p < p1; ++p) {
            int slot = L.fdlPos - p; if (slot < 0) slot += L.parts;
            const float* x = L.fdl + static_cast<std::size_t>(slot) * n2;
            for (int c = 0; c < 2; ++c) {
                const float* h = L.h + (static_cast<std::size_t>(c) * L.parts + p) * n2;
                float* a = L.acc + c * n2;
                a[0] += x[0] * h[0];
                a[1] += x[1] * h[1];
                for (int k = 2; k < n2; k += 2) {
                    const float xr = x[k], xi = x[k + 1], hr = h[k], hi = h[k + 1];
                    a[k] += xr * hr - xi * hi;
                    a[k + 1] += xr * hi + xi * hr;
                }
            }
        }
    }

    void finishJob(Level& L, int buffer) {
        const int n = L.n;
        for (int c = 0; c < 2; ++c) {
            L.fft->inverse(L.acc + c * 2 * n, L.win);
            std::memcpy(L.out + (buffer * 2 + c) * n, L.win + n, sizeof(float) * n);
        }
        if (++L.fdlPos >= L.parts) L.fdlPos = 0;
    }

    // ── De IR ───────────────────────────────────────────────────────────
    float rand01() { rng_ = rng_ * 1664525u + 1013904223u; return static_cast<float>(rng_ >> 8) * (1.0f / 16777216.0f); }

    void generate(const Preset& p, float* outL, float* outR, int len) {
        const float lowC = 1.0f - std::exp(-6.2831853f * 300.0f / sr_);
        const float highC = 1.0f - std::exp(-6.2831853f * 3000.0f / sr_);
        const float kLo = -6.9077553f / (p.t60 * p.lo * sr_);
        const float kMid = -6.9077553f / (p.t60 * sr_);
        const float kHi = -6.9077553f / (p.t60 * p.hi * sr_);
        const float attack = p.attackMs * 0.001f * sr_;
        for (int c = 0; c < 2; ++c) {
            float* o = c ? outR : outL;
            rng_ = 0x9e3779b9u * static_cast<std::uint32_t>(c + 1) + static_cast<std::uint32_t>(ir_) * 7919u;
            float lp = 0.0f, hp = 0.0f;
            for (int i = 0; i < len; ++i) {
                const float noise = (rand01() + rand01() + rand01() - 1.5f) * 2.0f;
                lp += (noise - lp) * lowC;
                const float rest = noise - lp;
                hp += (rest - hp) * highC;
                const float hi = rest - hp, mid = rest - hi;
                const float t = static_cast<float>(i);
                const float ramp = attack > 0.5f ? 1.0f - std::exp(-t / attack) : 1.0f;
                o[i] = ramp * (lp * std::exp(kLo * t) + mid * std::exp(kMid * t) + hi * std::exp(kHi * t));
            }
            // Vroege reflecties: losse tikken, links en rechts op andere plekken.
            for (int k = 0; k < p.earlyCount; ++k) {
                const float u = (k + 0.25f + 0.5f * rand01()) / p.earlyCount;
                const int at = static_cast<int>((p.earlyFrom + (p.earlyTo - p.earlyFrom) * u) * 0.001f * sr_);
                if (at >= len) continue;
                const float g = p.earlyGain * std::pow(0.8f, static_cast<float>(k)) * (rand01() < 0.5f ? -1.0f : 1.0f);
                o[at] += g * 6.0f;
            }
        }
    }

    static void resample(const float* in, int inLen, float* out, int outLen, float size) {
        const float step = 1.0f / size;
        for (int i = 0; i < outLen; ++i) {
            const float pos = static_cast<float>(i) * step;
            const int k = static_cast<int>(pos);
            const float fr = pos - static_cast<float>(k);
            const float a = k < inLen ? in[k] : 0.0f;
            const float b = k + 1 < inLen ? in[k + 1] : 0.0f;
            out[i] = a + (b - a) * fr;
        }
    }

    /** Uitfade over het laatste vijfde en normaliseren op energie 1. */
    static void finish(float* l, float* r, int len) {
        const int fade = len / 5 > 1 ? len / 5 : 1;
        for (int i = len - fade; i < len; ++i) {
            const float g = 0.5f + 0.5f * std::cos(3.14159265f * static_cast<float>(i - (len - fade)) / static_cast<float>(fade));
            l[i] *= g; r[i] *= g;
        }
        double e = 0.0;
        for (int i = 0; i < len; ++i) e += static_cast<double>(l[i]) * l[i] + static_cast<double>(r[i]) * r[i];
        const float s = e > 1e-20 ? static_cast<float>(1.0 / std::sqrt(0.5 * e)) : 0.0f;
        for (int i = 0; i < len; ++i) { l[i] *= s; r[i] *= s; }
    }

    float sr_ = 44100.0f;
    float* ring_ = nullptr;
    std::uint32_t t_ = 0, rng_ = 1u;
    Level levels_[kMaxLevels];
    int levelCount_ = 0, irLen_ = 0, preSamples_ = 0;
    bool pending_ = true, autoRebuild_ = true;
    int ir_ = -1;
    float mix_ = 0.3f, predelayMs_ = 10.0f, length_ = -1.0f, size_ = -1.0f, loCut_ = 20.0f, hiCut_ = 16000.0f, width_ = 1.0f;
    float mixCv_ = 0.0f, dry_ = 1.0f, wet_ = 0.0f, loCoef_ = 0.0f, hiCoef_ = 1.0f;
    float hpL_ = 0.0f, hpR_ = 0.0f, lpL_ = 0.0f, lpR_ = 0.0f;
};

}  // namespace mmb_dsp
