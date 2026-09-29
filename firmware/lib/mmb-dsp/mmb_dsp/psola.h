#pragma once
/**
 * @file psola.h
 * @brief Zingen met PSOLA: een ingesproken lettergreep op elke toonhoogte,
 *        zo lang als de toets ingedrukt is, met de klinkerkleur van de
 *        opname.
 * @details
 * **PSOLA** (Pitch-Synchronous Overlap-Add). De opname is vooraf voorzien van
 * *pitch marks* (lyric_bank.h). Rond elke mark knippen we een grain van twee
 * stemperioden met een Hann-venster. De grains plakken we opnieuw aan elkaar:
 *
 * - afstand tussen de grains = de gevraagde periode → **toonhoogte**;
 * - welke mark aan de beurt is volgt een eigen klok (`srcPos_`) → **duur**:
 *   dezelfde mark vaker = langer; in de klinkerkern loopt die klok heen en
 *   weer zolang de gate open is;
 * - hoe snel de grain wordt uitgelezen → **formanten** (los van de
 *   toonhoogte).
 *
 * Stemloze marks (medeklinkers) houden hun eigen afstand: die stukken spelen
 * ongewijzigd door, alleen `speed` rekt ze.
 *
 * Twee lagen:
 *  - `PsolaVoice` — één stem, één lettergreep tegelijk.
 *  - `ZangEngine` — acht stemmen, de keuze van de lettergreep (vast, of de
 *    volgende per aanslag; een akkoord deelt er één) en de som.
 *
 * Header-only, geen allocaties, geen afhankelijkheid van Teensy of wasm. De
 * bank is van de aanroeper en moet blijven staan zolang er grains klinken.
 */
#include "mmb_dsp/lyric_bank.h"

#include <cmath>
#include <cstdint>

namespace mmb_dsp {

/** @brief Eén zingende stem. */
class PsolaVoice {
public:
    static constexpr int kMaxGrains = 12;

    void Init(float sampleRate) {
        sr_ = sampleRate > 1000.0f ? sampleRate : 44100.0f;
        for (auto& g : grain_) g.active = false;
        emitting_ = false;
        gate_ = false;
        env_ = 0.0f;
        envState_ = EnvIdle;
        set_attack_ms(attackMs_);
        set_release_ms(releaseMs_);
        if (!tableReady()) buildTable();
    }

    void set_frequency(float hz)  { freq_ = hz < 20.0f ? 20.0f : (hz > 2000.0f ? 2000.0f : hz); }
    void set_speed(float s)       { speed_ = s < 0.1f ? 0.1f : (s > 8.0f ? 8.0f : s); }
    /** @brief Formantverhouding: 1 = zoals gesproken, 2 = een octaaf hoger. */
    void set_formant_ratio(float r) { formant_ = r < 0.4f ? 0.4f : (r > 2.5f ? 2.5f : r); }
    void set_attack_ms(float ms) {
        attackMs_ = ms < 0.0f ? 0.0f : ms;
        attackInc_ = attackMs_ <= 0.05f ? 1.0f : 1000.0f / (attackMs_ * sr_);
    }
    void set_release_ms(float ms) {
        releaseMs_ = ms < 1.0f ? 1.0f : ms;
        // e-macht: na `release` ms op −60 dB.
        releaseCoef_ = std::exp(-6.9078f / (releaseMs_ * 0.001f * sr_));
    }

    /** @brief Gate open: begin @p s op velocity-gain @p gain (0..1). */
    void Start(const Syllable& s, float gain) {
        if (!s.data || s.frames < 2 || s.numMarks < 2) return;
        syl_ = s;
        gain_ = gain;
        srcPos_ = static_cast<float>(Syllable::frameOf(s.marks[0]));
        markIdx_ = 0;
        dir_ = 1.0f;
        countdown_ = 0.0f;
        emitting_ = true;
        gate_ = true;
        // Lopende grains van de vorige lettergreep klinken uit: dat is de
        // overgang. De omhullende begint alleen opnieuw als de stem stil was.
        if (envState_ == EnvIdle) env_ = 0.0f;
        envState_ = EnvAttack;
    }

    /** @brief Gate dicht: de rest van de lettergreep speelt uit onder de release. */
    void Release() {
        gate_ = false;
        dir_ = 1.0f;
        if (envState_ != EnvIdle) envState_ = EnvRelease;
    }

    /** @brief Meteen stil (paniek, bankwissel). */
    void Kill() {
        for (auto& g : grain_) g.active = false;
        emitting_ = false; gate_ = false;
        env_ = 0.0f; envState_ = EnvIdle;
    }

    bool active() const { return envState_ != EnvIdle; }
    bool gate() const { return gate_; }

    float Tick() {
        if (envState_ == EnvIdle) return 0.0f;

        if (emitting_) {
            countdown_ -= 1.0f;
            int guard = 4;                       // nooit meer dan een paar grains per sample
            while (countdown_ <= 0.0f && emitting_ && guard-- > 0) Emit();
        }

        float y = 0.0f;
        bool any = false;
        for (auto& g : grain_) {
            if (!g.active) continue;
            any = true;
            const float u = g.pos * g.invL;                 // −1..+1
            const float w = window(u);
            const float sp = g.center + g.pos * g.step;     // bronframes
            y += w * g.gain * read(g, sp);
            g.pos += 1.0f;
            if (g.pos >= g.L) g.active = false;
        }

        switch (envState_) {
            case EnvAttack:
                env_ += attackInc_;
                if (env_ >= 1.0f) { env_ = 1.0f; envState_ = EnvHold; }
                break;
            case EnvRelease:
                env_ *= releaseCoef_;
                if (env_ < 1.0e-4f) { Kill(); return 0.0f; }
                break;
            default: break;
        }
        if (!emitting_ && !any) { Kill(); return 0.0f; }
        return y * env_ * gain_;
    }

private:
    enum EnvState : uint8_t { EnvIdle, EnvAttack, EnvHold, EnvRelease };

    struct Grain {
        const int16_t* data = nullptr;
        uint32_t frames = 0;
        float center = 0.0f;   ///< bronframe van de mark
        float step = 1.0f;     ///< bronframes per uitvoersample
        float pos = 0.0f;      ///< uitvoersamples vanaf het midden, −L..+L
        float L = 1.0f;        ///< halve lengte in uitvoersamples
        float invL = 1.0f;
        float gain = 1.0f;
        bool  active = false;
    };

    static float read(const Grain& g, float sp) {
        if (sp < 0.0f) return 0.0f;
        const uint32_t i = static_cast<uint32_t>(sp);
        if (i + 1 >= g.frames) return 0.0f;
        const float f = sp - static_cast<float>(i);
        const float a = static_cast<float>(g.data[i]);
        const float b = static_cast<float>(g.data[i + 1]);
        return (a + (b - a) * f) * (1.0f / 32768.0f);
    }

    // Hann-venster over u = −1..+1, uit een tabel (één keer gebouwd, gedeeld).
    static constexpr int kTable = 256;
    static float* table() { static float t[kTable + 2]; return t; }
    static bool& tableReady() { static bool r = false; return r; }
    static void buildTable() {
        float* t = table();
        for (int i = 0; i <= kTable + 1; ++i) {
            const float u = static_cast<float>(i) / static_cast<float>(kTable);   // 0..1 = |u|
            t[i] = u >= 1.0f ? 0.0f : 0.5f * (1.0f + std::cos(3.14159265f * u));
        }
        tableReady() = true;
    }
    static float window(float u) {
        if (u < 0.0f) u = -u;
        if (u >= 1.0f) return 0.0f;
        const float x = u * static_cast<float>(kTable);
        const int i = static_cast<int>(x);
        const float f = x - static_cast<float>(i);
        const float* t = table();
        return t[i] + (t[i + 1] - t[i]) * f;
    }

    float markPos(uint32_t i) const { return static_cast<float>(Syllable::frameOf(syl_.marks[i])); }

    /** Dichtstbijzijnde mark bij srcPos_, lopend vanaf de vorige keuze. */
    uint32_t nearest() {
        uint32_t i = markIdx_;
        const uint32_t last = syl_.numMarks - 1;
        if (i > last) i = last;
        while (i < last && markPos(i + 1) <= srcPos_) ++i;
        while (i > 0 && markPos(i) > srcPos_) --i;
        if (i < last && (markPos(i + 1) - srcPos_) < (srcPos_ - markPos(i))) ++i;
        markIdx_ = i;
        return i;
    }

    void Emit() {
        const uint32_t last = syl_.numMarks - 1;
        const uint32_t i = nearest();
        const bool unv = Syllable::unvoiced(syl_.marks[i]);
        const float c = markPos(i);
        const float rateRatio = syl_.rate / sr_;                // bronframes per uitvoersample, op gesproken snelheid
        const float fallback = syl_.rate * 0.005f;              // 5 ms als er geen buur is
        const float toPrev = i > 0 ? c - markPos(i - 1) : (i < last ? markPos(i + 1) - c : fallback);
        const float toNext = i < last ? markPos(i + 1) - c : toPrev;

        // Halve grainlengte in bronframes: één periode.
        float half = unv ? (toNext > toPrev ? toNext : toPrev) : 0.5f * (toPrev + toNext);
        const float maxHalf = syl_.rate * 0.02f;                // 50 Hz
        if (half < 8.0f) half = 8.0f;
        if (half > maxHalf) half = maxHalf;

        const float step = rateRatio * formant_;
        const float L = half / step;

        float interval, advance;
        if (unv) {
            // Medeklinker: eigen afstand aanhouden, alleen `speed` rekt.
            advance = toNext;
            interval = toNext / (rateRatio * speed_);
        } else {
            interval = sr_ / freq_;
            advance = interval * rateRatio * speed_;
        }
        if (interval < 8.0f) interval = 8.0f;

        // Som van Hann-vensters met halve lengte L op afstand `interval` is
        // L/interval; daarvoor corrigeren, maar nooit versterken.
        float gain = interval / L;
        if (gain > 1.0f) gain = 1.0f;

        Grain* g = freeGrain();
        g->data = syl_.data; g->frames = syl_.frames;
        g->center = c; g->step = step;
        g->L = L; g->invL = 1.0f / L;
        g->pos = -L; g->gain = gain; g->active = true;

        countdown_ += interval;

        // De bronklok: vooruit, en in de klinkerkern heen en weer zolang de
        // gate open is.
        float next = srcPos_ + dir_ * advance;
        if (gate_ && syl_.hasSustain()) {
            const float a = markPos(syl_.sustainStart);
            const float b = markPos(syl_.sustainEnd);
            if (dir_ > 0.0f && next >= b) { dir_ = -1.0f; next = b - (next - b); if (next < a) next = a; }
            else if (dir_ < 0.0f && next <= a) { dir_ = 1.0f; next = a + (a - next); if (next > b) next = b; }
        } else {
            if (dir_ < 0.0f) { dir_ = 1.0f; next = srcPos_ + advance; }
        }
        srcPos_ = next;
        if (srcPos_ >= markPos(last) + toNext || srcPos_ >= static_cast<float>(syl_.frames)) emitting_ = false;
    }

    Grain* freeGrain() {
        Grain* oldest = &grain_[0];
        for (auto& g : grain_) {
            if (!g.active) return &g;
            if (g.pos * g.invL > oldest->pos * oldest->invL) oldest = &g;
        }
        return oldest;      // vol: de grain die het verst is
    }

    float sr_ = 44100.0f;
    Syllable syl_{};
    Grain grain_[kMaxGrains];
    float freq_ = 220.0f, speed_ = 1.0f, formant_ = 1.0f, gain_ = 1.0f;
    float srcPos_ = 0.0f, dir_ = 1.0f, countdown_ = 0.0f;
    uint32_t markIdx_ = 0;
    bool emitting_ = false, gate_ = false;
    float env_ = 0.0f, attackInc_ = 1.0f, releaseCoef_ = 0.999f;
    float attackMs_ = 5.0f, releaseMs_ = 250.0f;
    EnvState envState_ = EnvIdle;
};

/**
 * @brief Acht zingende stemmen op één lyricbank, met de keuze van de
 *        lettergreep.
 *
 * `mode`: 0 = vast (altijd `syl`), 1 = volgende lettergreep per aanslag,
 * 2 = als 1, maar na 2 s stilte terug naar `syl`. Aanslagen binnen 30 ms van
 * elkaar zijn één akkoord en delen de lettergreep.
 */
class ZangEngine {
public:
    static constexpr int kVoices = 8;

    void Init(float sampleRate) {
        sr_ = sampleRate > 1000.0f ? sampleRate : 44100.0f;
        for (auto& v : voice_) v.Init(sr_);
        chordWindow_ = static_cast<uint32_t>(0.030f * sr_);
        idleReset_   = static_cast<uint32_t>(2.0f * sr_);
        clock_ = 0; lastOn_ = 0; lastSound_ = 0;
        Reset();
        applyAll();
    }

    /** @brief Bank koppelen (of nullptr). Alle stemmen gaan stil. */
    void set_bank(const LyricBank* b) {
        for (auto& v : voice_) v.Kill();
        bank_ = (b && b->valid()) ? b : nullptr;
        Reset();
    }
    const LyricBank* bank() const { return bank_; }

    void set_syllable(int s)      { base_ = s < 0 ? 0 : s; }
    void set_syllable_cv(float v) { cv_ = v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void set_mode(int m)          { mode_ = m < 0 ? 0 : (m > 2 ? 2 : m); }
    void set_speed(float s)       { speed_ = s; for (auto& v : voice_) v.set_speed(s); }
    void set_formant_semitones(float st) { formantSt_ = st; applyFormant(); }
    void set_formant_cv(float oct)       { formantCv_ = oct; applyFormant(); }
    void set_attack_ms(float ms)  { attack_ = ms; for (auto& v : voice_) v.set_attack_ms(ms); }
    void set_release_ms(float ms) { release_ = ms; for (auto& v : voice_) v.set_release_ms(ms); }
    void set_level(float l)       { level_ = l < 0.0f ? 0.0f : (l > 1.0f ? 1.0f : l); }
    void set_transpose(float st)  { transpose_ = st; }

    /** @brief Toonhoogte van stem @p k in volt (1 V/oct, 0 V = MIDI 60). */
    void set_voct(int k, float volts) {
        if (k < 0 || k >= kVoices) return;
        voct_[k] = volts;
        voice_[k].set_frequency(261.6256f * std::pow(2.0f, volts + transpose_ / 12.0f));
    }

    void NoteOn(int k, float velocity) {
        if (k < 0 || k >= kVoices || !bank_) return;
        const bool newChord = (clock_ - lastOn_) > chordWindow_ || !everOn_;
        if (newChord) {
            if (mode_ == 2 && everOn_ && (clock_ - lastSound_) > idleReset_) Reset();
            if (mode_ != 0) { if (first_) first_ = false; else ++seq_; }
        }
        lastOn_ = clock_;
        everOn_ = true;
        Syllable s;
        if (!bank_->syllable(current(), &s)) return;
        const float vel = velocity < 0.0f ? 0.0f : (velocity > 1.0f ? 1.0f : velocity);
        voice_[k].set_frequency(261.6256f * std::pow(2.0f, voct_[k] + transpose_ / 12.0f));
        voice_[k].Start(s, 0.25f + 0.75f * vel);
    }
    void NoteOff(int k) { if (k >= 0 && k < kVoices) voice_[k].Release(); }

    /** @brief Volgende lettergreep (flank op `next`). */
    void Next()  { ++seq_; first_ = false; }
    /** @brief Terug naar de beginlettergreep (flank op `reset`). */
    void Reset() { seq_ = 0; first_ = true; }

    /** @brief Index van de lettergreep die de volgende aanslag zingt / nu klinkt. */
    int current() const {
        const int n = bank_ ? bank_->numSyllables() : 0;
        if (n <= 0) return 0;
        const int off = static_cast<int>(cv_ * static_cast<float>(n - 1) + 0.5f);
        const int seq = mode_ == 0 ? 0 : seq_;
        return (base_ + off + seq) % n;
    }
    /** @brief `current()` als 0..1, voor de `syl_out`-poort. */
    float currentNormalized() const {
        const int n = bank_ ? bank_->numSyllables() : 0;
        return n > 1 ? static_cast<float>(current()) / static_cast<float>(n - 1) : 0.0f;
    }

    int activeVoices() const {
        int n = 0;
        for (const auto& v : voice_) if (v.active()) ++n;
        return n;
    }

    float Tick() {
        ++clock_;
        float y = 0.0f;
        bool sounding = false;
        for (auto& v : voice_) {
            if (!v.active()) continue;
            sounding = true;
            y += v.Tick();
        }
        if (sounding) lastSound_ = clock_;
        // Ruimte voor akkoorden: één stem op volle velocity piekt rond 0,55;
        // drie stemmen raken de zachte begrenzing net.
        y *= level_ * 0.7f;
        // Zachte begrenzing: acht stemmen mogen samen niet hard klippen.
        if (y > 1.0f || y < -1.0f) y = y > 0.0f ? 1.0f : -1.0f;
        else y = y * (1.5f - 0.5f * y * y);
        return y;
    }

private:
    void applyFormant() {
        const float r = std::pow(2.0f, formantSt_ / 12.0f + formantCv_);
        for (auto& v : voice_) v.set_formant_ratio(r);
    }
    void applyAll() {
        for (auto& v : voice_) { v.set_speed(speed_); v.set_attack_ms(attack_); v.set_release_ms(release_); }
        applyFormant();
    }

    float sr_ = 44100.0f;
    PsolaVoice voice_[kVoices];
    float voct_[kVoices] = {};
    const LyricBank* bank_ = nullptr;
    int base_ = 0, mode_ = 1, seq_ = 0;
    bool first_ = true, everOn_ = false;
    float cv_ = 0.0f, speed_ = 1.0f, formantSt_ = 0.0f, formantCv_ = 0.0f;
    float attack_ = 5.0f, release_ = 250.0f, level_ = 0.8f, transpose_ = 0.0f;
    uint32_t clock_ = 0, lastOn_ = 0, lastSound_ = 0, chordWindow_ = 1323, idleReset_ = 88200;
};

}  // namespace mmb_dsp
