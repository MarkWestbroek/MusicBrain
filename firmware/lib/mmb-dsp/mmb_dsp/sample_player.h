#pragma once
/**
 * @file sample_player.h
 * @brief Multisample-speler: keymap met key- én velocity-zones, 1–4 kanalen,
 *        V/Oct via fractionele interpolatie, vier loop-modes, per-zone gain,
 *        pan, decay en release.
 * @details
 * Header-only, float, samplerate-onafhankelijk; geen Arduino-afhankelijkheden.
 * Dezelfde code draait in `SamplerModule.h` (Teensy, samples in PSRAM) en in
 * de browser-simulator (`tools/mmb-wasm/sampler_wasm.cc`). De sampledata en
 * de keymap blijven eigendom van de aanroeper.
 *
 * **Kanalen.** Sampledata is *interleaved*: `data[frame * channels + ch]`.
 * De leeskop staat op frame-niveau, dus alle kanalen lopen per definitie in
 * de pas — ook door de loop-naad heen (anders verspringt het stereobeeld).
 * Een mono sample komt op alle uitgangen; stereo op 1/2; quad op 1–4.
 *
 * **Zones.** Een noot + velocity kiest een zone; bij meerdere treffers wint
 * de eerste (de importer sorteert ze). Zo bouw je een keymap: C1 zacht/
 * midden/hard, C2 idem, … `root` is de MIDI-noot waarop het sample van
 * huis uit staat, dus `voct` verschuift daarvandaan.
 *
 * **Decay.** Een piano heeft geen steady state: neem je de hele uitsterving
 * op, dan draagt het sample zijn eigen verloop en staat `decay` op 0. Loop
 * je (orgel, klankschaal, geheugendruk), dan is de loop stationair en legt
 * `decay` — gemeten uit de opname — het verloop er weer overheen.
 */

#include <cmath>
#include <cstdint>

namespace mmb_dsp {

constexpr int kMaxChannels = 4;

enum LoopMode : uint8_t {
    LOOP_NONE = 0,      ///< speelt tot het eind of tot note-off
    LOOP_ONE_SHOT,      ///< speelt altijd helemaal uit, negeert note-off
    LOOP_CONTINUOUS,    ///< loopt eeuwig; envelope/decay maakt het einde
    LOOP_SUSTAIN,       ///< loopt tot note-off, speelt daarna de staart af
};

/** Eén sample in de bank. `data` is interleaved met `channels` per frame. */
struct SampleSlot {
    const int16_t* data     = nullptr;
    int            frames   = 0;
    int            channels = 1;
    float          rate     = 44100.0f;
    bool valid() const { return data != nullptr && frames > 1 && channels >= 1; }
};

/** Eén zone in de keymap: welk sample klinkt bij welke noot en aanslag. */
struct Zone {
    uint8_t  slot     = 0;
    uint8_t  lowKey   = 0,   highKey = 127;
    uint8_t  lowVel   = 1,   highVel = 127;
    float    root     = 60.0f;   ///< MIDI-noot waarop het sample staat
    float    tuneCents = 0.0f;   ///< fijnstemming van dit sample
    float    gain     = 1.0f;    ///< lineair; houdt de laag-verhoudingen intact
    float    pan      = 0.0f;    ///< −1 links … +1 rechts (mono/stereo-uitgang)
    uint8_t  loopMode = LOOP_NONE;
    int      loopStart = 0, loopEnd = 0;   ///< frames
    float    decay    = 0.0f;    ///< s tot −60 dB; 0 = sample draagt zijn eigen verloop
    float    release  = 0.08f;   ///< s na note-off
    /**
     * Velocity-gevoeligheid *binnen* deze zone, in dB tussen aanslag 1 en 127.
     * 0 = uit: het niveau komt volledig uit het sample, wat klopt zodra je
     * genoeg lagen hebt (zo werkt de Elements-testbank). Heb je er weinig — of
     * kom je uit een SoundFont, waar de dynamiek in een modulator zit die wij
     * niet nabouwen — dan legt dit de ontbrekende dynamiek eroverheen.
     * Kwadratische kromme: bij de helft van de aanslag is de demping 3/4 van
     * de volle waarde, zoals de meeste samplers het doen.
     */
    uint8_t  velTrack = 0;
};

/** Gain-factor van de velocity-tracking; 1,0 als de zone hem uit heeft. */
inline float velTrackGain(uint8_t velTrack, int velocity) {
    if (velTrack == 0) return 1.0f;
    const float n = (velocity < 1 ? 1 : (velocity > 127 ? 127 : velocity)) * (1.0f / 127.0f);
    const float db = -static_cast<float>(velTrack) * (1.0f - n * n);
    return powf(10.0f, db * 0.05f);
}

/**
 * Eén stem: kiest bij note-on een zone en speelt die af. Meerdere stemmen
 * delen dezelfde slots- en zone-tabellen (de aanroeper houdt die vast).
 */
class SamplePlayer {
public:
    void Init(float sr) {
        sr_ = sr;
        slots_ = nullptr; numSlots_ = 0;
        zones_ = nullptr; numZones_ = 0;
        setAttackMs(1.5f);
        reset();
    }

    /** Bank en keymap koppelen (blijven eigendom van de aanroeper). */
    void bind(const SampleSlot* slots, int numSlots, const Zone* zones, int numZones) {
        slots_ = slots; numSlots_ = numSlots;
        zones_ = zones; numZones_ = numZones;
        reset();
    }

    void setAttackMs(float ms) { attackInc_ = 1.0f / (sr_ * (ms < 0.2f ? 0.2f : ms) * 0.001f); }
    void set_level(float l)    { level_ = l < 0.0f ? 0.0f : (l > 1.0f ? 1.0f : l); }
    /** Extra transponering bovenop de zone (module-controls coarse/fine). */
    void set_transpose(float semitones) { transpose_ = semitones; }
    /** Startpunt 0..1 binnen het sample (0 = zoals opgenomen). */
    void set_startOffset(float s) { startOffset_ = s < 0.0f ? 0.0f : (s > 0.99f ? 0.99f : s); }

    bool active() const { return active_; }
    int  note()   const { return note_; }
    /** Kanaalaantal van het klinkende sample (0 als er niets speelt). */
    int  channels() const { return active_ && slot_ ? slot_->channels : 0; }

    /** Zoek de zone voor `midi`+`velocity` (1..127); −1 als er geen past. */
    int findZone(int midi, int velocity) const {
        for (int i = 0; i < numZones_; ++i) {
            const Zone& z = zones_[i];
            if (midi < z.lowKey || midi > z.highKey) continue;
            if (velocity < z.lowVel || velocity > z.highVel) continue;
            if (z.slot >= numSlots_ || !slots_[z.slot].valid()) continue;
            return i;
        }
        return -1;
    }

    void noteOn(int midi, int velocity) {
        if (velocity < 1) velocity = 1;
        if (velocity > 127) velocity = 127;
        const int zi = findZone(midi, velocity);
        if (zi < 0) { active_ = false; return; }
        zone_ = &zones_[zi];
        slot_ = &slots_[zone_->slot];
        note_ = midi;
        vel_  = velocity;
        velGain_ = velTrackGain(zone_->velTrack, velocity);
        posInt_ = static_cast<int>(startOffset_ * static_cast<float>(slot_->frames - 1));
        posFrac_ = 0.0f;
        env_ = 0.0f; envState_ = ENV_ATTACK;
        decayGain_ = 1.0f;
        // Gemeten uitsterving: −60 dB in `decay` seconden (0 = sample zelf).
        decayMul_ = zone_->decay > 0.0f
            ? std::exp(-6.907755f / (zone_->decay * sr_)) : 1.0f;
        releaseInc_ = 1.0f / (sr_ * (zone_->release < 0.005f ? 0.005f : zone_->release));
        gate_ = true;
        active_ = true;
        updateIncrement();
    }

    void noteOff(int midi) {
        if (!active_ || (midi >= 0 && midi != note_)) return;
        gate_ = false;
        if (zone_ && zone_->loopMode == LOOP_ONE_SHOT) return;   // speelt uit
        envState_ = ENV_RELEASE;
    }
    void allOff() { gate_ = false; if (active_) envState_ = ENV_RELEASE; }

    /** V/Oct (volt; 0 = MIDI 60) — mag continu meebewegen (pitch-bend, glide). */
    void set_voct(float v) { voct_ = v; if (active_) updateIncrement(); }

    /**
     * Render één frame naar `out[0..channels-1]` (opgeteld, dus de aanroeper
     * wist de buffer). `outChannels` is het aantal uitgangen van de module.
     */
    inline void Process(float* out, int outChannels) {
        if (!active_ || !slot_ || !zone_) return;

        // ── envelope ──
        if (envState_ == ENV_ATTACK) {
            env_ += attackInc_;
            if (env_ >= 1.0f) { env_ = 1.0f; envState_ = ENV_SUSTAIN; }
        } else if (envState_ == ENV_RELEASE) {
            env_ -= releaseInc_;
            if (env_ <= 0.0f) { env_ = 0.0f; active_ = false; return; }
        }
        if (decayMul_ != 1.0f) decayGain_ *= decayMul_;

        // ── lezen met lineaire interpolatie, per kanaal, zelfde frame ──
        const int ch = slot_->channels;
        const int i0 = posInt_;
        int i1 = i0 + 1;
        const bool looping = (zone_->loopMode == LOOP_CONTINUOUS)
                          || (zone_->loopMode == LOOP_SUSTAIN && gate_);
        if (looping && i1 >= zone_->loopEnd && zone_->loopEnd > zone_->loopStart) {
            i1 = zone_->loopStart;                  // naadloos over de loop heen
        } else if (i1 >= slot_->frames) {
            i1 = i0;
        }
        const float f = posFrac_;
        const float amp = env_ * decayGain_ * zone_->gain * velGain_ * level_ * (1.0f / 32768.0f);
        const int16_t* base0 = slot_->data + static_cast<long>(i0) * ch;
        const int16_t* base1 = slot_->data + static_cast<long>(i1) * ch;

        float v[kMaxChannels];
        for (int c = 0; c < ch && c < kMaxChannels; ++c) {
            v[c] = (base0[c] + (base1[c] - base0[c]) * f) * amp;
        }
        // Mono → beide (of alle) uitgangen; pan werkt op de eerste twee.
        if (ch == 1) {
            const float p = zone_->pan;
            const float gl = p <= 0.0f ? 1.0f : 1.0f - p;
            const float gr = p >= 0.0f ? 1.0f : 1.0f + p;
            if (outChannels >= 2) { out[0] += v[0] * gl; out[1] += v[0] * gr; }
            else                    out[0] += v[0];
        } else {
            for (int c = 0; c < ch && c < outChannels; ++c) out[c] += v[c];
            // Stereo sample op een quad-uitgang: 3/4 blijven stil.
        }

        // ── voortbewegen ──
        posFrac_ += inc_;
        const int step = static_cast<int>(posFrac_);
        if (step) { posInt_ += step; posFrac_ -= static_cast<float>(step); }

        if (looping && zone_->loopEnd > zone_->loopStart && posInt_ >= zone_->loopEnd) {
            posInt_ = zone_->loopStart + (posInt_ - zone_->loopEnd);
            if (posInt_ >= zone_->loopEnd) posInt_ = zone_->loopStart;
        } else if (posInt_ >= slot_->frames - 1) {
            posInt_ = slot_->frames - 1;
            posFrac_ = 0.0f;
            if (envState_ != ENV_RELEASE) { envState_ = ENV_RELEASE; }
        }
    }

private:
    enum EnvState : uint8_t { ENV_IDLE, ENV_ATTACK, ENV_SUSTAIN, ENV_RELEASE };

    void reset() {
        active_ = false; gate_ = false; zone_ = nullptr; slot_ = nullptr;
        note_ = -1; posInt_ = 0; posFrac_ = 0.0f; env_ = 0.0f; envState_ = ENV_IDLE;
        decayGain_ = 1.0f; decayMul_ = 1.0f;
    }
    void updateIncrement() {
        if (!slot_ || !zone_) { inc_ = 1.0f; return; }
        const float semis = 12.0f * voct_ + (60.0f - zone_->root)
                          + transpose_ + zone_->tuneCents * 0.01f;
        inc_ = (slot_->rate / sr_) * std::exp2(semis / 12.0f);
    }

    float sr_ = 44100.0f;
    const SampleSlot* slots_ = nullptr;  int numSlots_ = 0;
    const Zone*       zones_ = nullptr;  int numZones_ = 0;
    const SampleSlot* slot_ = nullptr;
    const Zone*       zone_ = nullptr;

    int   posInt_ = 0;
    float posFrac_ = 0.0f, inc_ = 1.0f;
    float voct_ = 0.0f, transpose_ = 0.0f, startOffset_ = 0.0f, level_ = 0.8f;
    float velGain_ = 1.0f;
    int   note_ = -1, vel_ = 100;
    bool  active_ = false, gate_ = false;

    float env_ = 0.0f, attackInc_ = 0.02f, releaseInc_ = 0.01f;
    float decayGain_ = 1.0f, decayMul_ = 1.0f;
    EnvState envState_ = ENV_IDLE;
};

}  // namespace mmb_dsp
