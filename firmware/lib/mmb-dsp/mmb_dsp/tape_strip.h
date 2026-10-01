#pragma once
// Tape strip: de bandmechanica van een Mellotron om een gewone samplebank.
// Per toets een bandje van `Length` seconden dat na het loslaten met een veer
// terugloopt (`Return` = terugloop van een volle strip). Een toets die wordt
// ingedrukt terwijl het bandje nog onderweg is, speelt vanaf de plek waar het
// bandje dan staat. Bij het indrukken drukt een kussen de band tegen de kop
// (`Contact`: opkomst, hoogafval en een kleine pitch-dip), de capstanmotor
// zakt onder belasting (`Motor`, meer toetsen = trager), wow en flutter
// moduleren de snelheid, en `Wear` voegt ruis, bandbreedteverlies en zachte
// verzadiging toe. Aan het einde van de strip stopt de klank abrupt.
//
// De kern weet niets van samples: de wrapper (wasm of Teensy) bezit de acht
// mmb_dsp::SamplePlayer-stemmen en vraagt hier per noot de startpositie, per
// blok de snelheidsafwijking (V/Oct) en per sample de bewerking van het
// stemsignaal. Zo blijft dit testbaar zonder bank.
#include <cmath>
#include <cstdint>

namespace mmb_dsp {

class TapeStrip {
public:
    static constexpr int kVoices = 8;
    static constexpr int kKeys = 128;
    static constexpr int kMaxChannels = 4;
    enum Control { Length, Return, Contact, Motor, Wow, Flutter, Wear, Level };

    void Init(float rate) {
        *this = TapeStrip();
        rate_ = finiteClamp(rate, 8000.0f, 192000.0f, 44100.0f);
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Length: length_ = finiteClamp(value, 1, 8, 8); break;
            case Return: return_ = finiteClamp(value, 0.1f, 4, 1); break;
            case Contact: contact_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Motor: motor_ = finiteClamp(value, 0, 1, 0.4f); break;
            case Wow: wow_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Flutter: flutter_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Wear: wear_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); return;
            default: return;
        }
        prepare();
    }

    /** Gedeelde druk op het kussen (channel pressure), 0..1: vertraagt licht. */
    void setPress(float value) { press_ = finiteClamp(value, 0, 1, 0); }

    void clear() {
        for (int key = 0; key < kKeys; ++key) { position_[key] = 0; playedBy_[key] = -1; }
        for (int voice = 0; voice < kVoices; ++voice) voices_[voice] = Voice();
        motorState_ = 0;
        lastKey_ = -1;
    }

    /**
     * Toets `midi` wordt ingedrukt op stem `voice`. Geeft de bandpositie in
     * seconden waar het bandje nu staat (0 = begin). De wrapper zet daarmee
     * de startoffset van de sampler-stem.
     */
    float noteOn(int voice, int midi) {
        if (voice < 0 || voice >= kVoices) return 0;
        if (midi < 0) midi = 0;
        if (midi >= kKeys) midi = kKeys - 1;
        Voice& v = voices_[voice];
        if (v.key >= 0 && playedBy_[v.key] == voice) playedBy_[v.key] = -1;
        v = Voice();
        v.key = midi;
        v.playing = true;
        v.gain = 0;
        playedBy_[midi] = voice;
        lastKey_ = midi;
        return position_[midi];
    }

    /** Toets van stem `voice` losgelaten: het bandje loopt terug. */
    void noteOff(int voice) {
        if (voice < 0 || voice >= kVoices) return;
        Voice& v = voices_[voice];
        if (v.key >= 0 && playedBy_[v.key] == voice) playedBy_[v.key] = -1;
        v.playing = false;
    }

    /** Eén keer per blok van `frames` samples: posities, motor, wow en flutter. */
    void PrepareBlock(int frames) {
        const float dt = frames / rate_;
        // Wow: trage sinus plus een random walk, flutter: twee snellere sinussen.
        wowPhase_ += 6.28318530718f * 0.55f * dt;
        if (wowPhase_ > 6.28318530718f) wowPhase_ -= 6.28318530718f;
        wowDrift_ = wowDrift_ * (1 - 0.6f * dt) + noise() * 0.4f * dt;
        if (wowDrift_ > 1) wowDrift_ = 1; else if (wowDrift_ < -1) wowDrift_ = -1;
        flutterPhase_ += 6.28318530718f * 6.3f * dt;
        if (flutterPhase_ > 6.28318530718f) flutterPhase_ -= 6.28318530718f;
        flutterPhase2_ += 6.28318530718f * 11.1f * dt;
        if (flutterPhase2_ > 6.28318530718f) flutterPhase2_ -= 6.28318530718f;
        // Motor: belasting = spelende stemmen, met traagheid (~150 ms).
        int playing = 0;
        for (int voice = 0; voice < kVoices; ++voice) if (voices_[voice].playing) ++playing;
        const float load = static_cast<float>(playing) / kVoices;
        motorState_ += (load - motorState_) * (1 - std::exp(-dt / 0.15f));
        sharedCents_ = -motor_ * 40 * motorState_
                     + wow_ * 25 * (0.7f * std::sin(wowPhase_) + 0.5f * wowDrift_)
                     + flutter_ * 6 * (std::sin(flutterPhase_) + 0.5f * std::sin(flutterPhase2_))
                     - press_ * 40;
        // Bandposities: spelend vooruit, losgelaten terug met de veer.
        const float speed = std::exp2(sharedCents_ / 1200);
        const float rewind = length_ / return_;
        for (int key = 0; key < kKeys; ++key) {
            if (playedBy_[key] >= 0) {
                position_[key] += dt * speed;
                if (position_[key] >= length_) {
                    position_[key] = length_;
                    voices_[playedBy_[key]].ending = true;
                }
            } else if (position_[key] > 0) {
                position_[key] -= dt * rewind;
                if (position_[key] < 0) position_[key] = 0;
            }
        }
        // Per stem: kopcontact (opkomst, hoogafval, pitch-dip) en einde strip.
        for (int voice = 0; voice < kVoices; ++voice) {
            Voice& v = voices_[voice];
            if (v.key < 0) continue;
            v.age += dt;
            const float contactTime = 0.008f + 0.05f * contact_;
            const float decay = std::exp(-v.age / (contactTime * 0.8f));
            v.sagCents = -contact_ * 60 * decay;
            const float contactHz = 16000 - (16000 - 700) * contact_ * decay;
            const float wearHz = 12000 * std::exp2(-2 * wear_);
            const float hz = contactHz < wearHz ? contactHz : wearHz;
            v.lpCoefficient = 1 - std::exp(-6.28318530718f * hz / rate_);
            v.gainStep = v.ending ? -1 / (0.006f * rate_) : 1 / (contactTime * rate_);
        }
    }

    /** Snelheidsafwijking van stem `voice` in V/Oct (gedeeld + eigen kopcontact). */
    float voctOffset(int voice) const {
        if (voice < 0 || voice >= kVoices) return 0;
        return (sharedCents_ + voices_[voice].sagCents) / 1200;
    }
    /** De strip van deze stem is op en de uitfade is klaar: stem hard stoppen. */
    bool stopped(int voice) const {
        return voice >= 0 && voice < kVoices && voices_[voice].ending && voices_[voice].gain <= 0;
    }
    bool ending(int voice) const { return voice >= 0 && voice < kVoices && voices_[voice].ending; }

    /** Per sample, in-place op het stemsignaal (channels <= 4). */
    void Process(int voice, float* io, int channels) {
        if (voice < 0 || voice >= kVoices) return;
        Voice& v = voices_[voice];
        v.gain += v.gainStep / 1;
        if (v.gain > 1) v.gain = 1; else if (v.gain < 0) v.gain = 0;
        const float drive = 1 + 1.5f * wear_;
        const float scale = level_ * v.gain / drive;
        if (channels > kMaxChannels) channels = kMaxChannels;
        for (int channel = 0; channel < channels; ++channel) {
            v.lp[channel] += (io[channel] - v.lp[channel]) * v.lpCoefficient;
            io[channel] = softClip(v.lp[channel] * drive) * scale;
        }
    }

    /** Bandruis zolang er een bandje loopt; één keer per sample bij de som optellen. */
    float hiss() {
        bool running = false;
        for (int voice = 0; voice < kVoices && !running; ++voice) running = voices_[voice].playing;
        hissGain_ += ((running ? 1.0f : 0.0f) - hissGain_) * 0.0005f;
        return hissGain_ * wear_ * 0.0025f * level_ * noise();
    }

    /** Positie van het laatst aangeslagen bandje, 0..1 van Length. */
    float tapePosition() const { return lastKey_ < 0 ? 0 : position_[lastKey_] / length_; }
    /** Motorbelasting 0..1 (met traagheid). */
    float load() const { return motorState_; }
    float keyPosition(int midi) const { return midi < 0 || midi >= kKeys ? 0 : position_[midi]; }
    float lengthSeconds() const { return length_; }

private:
    struct Voice {
        int key = -1;
        bool playing = false, ending = false;
        float age = 0, gain = 1, gainStep = 0, sagCents = 0, lpCoefficient = 1;
        float lp[kMaxChannels] = {};
    };

    static float finiteClamp(float value, float low, float high, float fallback) {
        return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
    }
    static float softClip(float x) {
        if (x > 3) return 1;
        if (x < -3) return -1;
        const float x2 = x * x;
        return x * (27 + x2) / (27 + 9 * x2);
    }
    float noise() {
        state_ ^= state_ << 13;
        state_ ^= state_ >> 17;
        state_ ^= state_ << 5;
        return static_cast<float>(state_ >> 8) * (2.0f / 16777216.0f) - 1;
    }
    void prepare() {}

    float rate_ = 44100, length_ = 8, return_ = 1, contact_ = 0.5f, motor_ = 0.4f;
    float wow_ = 0.3f, flutter_ = 0.3f, wear_ = 0.3f, level_ = 0.8f, press_ = 0;
    float position_[kKeys] = {};
    int playedBy_[kKeys] = {-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                            -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1};
    Voice voices_[kVoices];
    int lastKey_ = -1;
    float motorState_ = 0, sharedCents_ = 0;
    float wowPhase_ = 0, wowDrift_ = 0, flutterPhase_ = 1.1f, flutterPhase2_ = 2.3f;
    float hissGain_ = 0;
    uint32_t state_ = 0x2545F491u;
};

}
