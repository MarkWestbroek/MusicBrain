#pragma once
/**
 * @file ArpModule.h
 * @brief Arpeggiator (typeId `tp_mmb_arp`): speelt de toetsen die je
 *        vasthoudt als een geklokte reeks, het bruikbare deel van Mutable
 *        Yarns.
 *
 * @details
 * CV-domein-module (1 kHz tick) die zelf MIDI-noten hoort, net als MIDI-IN:
 * main.cpp (`forwardMidiToRuntime`) en de simulator (`AudioEngine.sendMidi`)
 * geven noten aan elke MIDI-IN én elke ARP. Hij houdt de ingedrukte toetsen
 * bij en speelt er elke klokstap één van, op één stem (`pitch`/`gate`/`vel`,
 * zoals de mono-uitgangen van MIDI-IN).
 *
 * Volgorde (`mode`):
 * | 0 | Up      | laag naar hoog, dan het volgende octaaf               |
 * | 1 | Down    | hoog naar laag                                         |
 * | 2 | Up/Down | heen en terug, de uitersten één keer                   |
 * | 3 | Random  | willekeurig uit de reeks (nooit twee keer dezelfde als |
 * |   |         | er meer dan één is)                                    |
 * | 4 | Played  | in de volgorde waarin je de toetsen aansloeg           |
 *
 * `octaves` (1..4) herhaalt de reeks zoveel octaven hoger. `latch`: de
 * reeks blijft spelen na het loslaten; een nieuwe aanslag na het loslaten
 * van alles begint een nieuwe reeks. Zonder toetsen staat hij stil.
 *
 * Klok: intern `tempo` (bpm) met `division` (0 = kwarten, 1 = achtsten,
 * 2 = achtste triolen, 3 = zestienden, 4 = zestiende triolen, 5 =
 * tweeëndertigsten), of met `extclock` een stap per stijgende flank op
 * `clock`. De eerste aanslag (uit stilstand) speelt meteen. `gate` is de
 * lengte van de noot als deel van de stap (bij de externe klok gemeten aan de
 * vorige twee flanken); er blijft altijd een korte pauze zodat de volgende
 * noot opnieuw aanslaat.
 *
 * Port map:
 * | Dir | portId  | Kind | Betekenis                               |
 * |-----|---------|------|-----------------------------------------|
 * | in  | `clock` | Gate | Stapklok (met `extclock`)               |
 * | in  | `reset` | Gate | Terug naar het begin van de reeks       |
 * | out | `pitch` | Cv   | V/Oct (MIDI 60 = 0 V)                   |
 * | out | `gate`  | Gate | Noot aan                                |
 * | out | `vel`   | Cv   | Aanslag van de toets, 0..1              |
 * | out | `step`  | Gate | Puls op elke stap (ook zonder toetsen)  |
 *
 * Controls: `mode`, `octaves`, `tempo`, `division`, `gate` (0,05..1),
 * `latch` (toggle), `extclock` (toggle), `channel` (0 = alle, 1..16).
 */

#include "CvHelpers.h"
#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

class ArpModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_arp";
    static constexpr int kMaxHeld = 16;
    enum Mode { Up, Down, UpDown, Random, Played };

    explicit ArpModule(std::string_view id) : CvModule(kTypeId, id) {}

    // ── MIDI (vanuit main.cpp en de wasm-gastheer) ─────────────────────────
    void onNoteOn(std::uint8_t channel, std::uint8_t note, std::uint8_t velocity) {
        if (filtered(channel)) return;
        if (velocity == 0) { onNoteOff(channel, note); return; }
        // Latch: wie na het loslaten van alles opnieuw aanslaat, begint een
        // nieuwe reeks.
        if (latch_ && fingers_ == 0) count_ = 0;
        const bool wasEmpty = count_ == 0;
        int at = find(note);
        if (at < 0 && count_ < kMaxHeld) at = count_++;
        if (at < 0) return;
        held_[at] = { note, velocity, order_++, true };
        ++fingers_;
        if (wasEmpty) startNow_ = true;      // uit stilstand: meteen spelen
    }
    void onNoteOff(std::uint8_t channel, std::uint8_t note, std::uint8_t = 0) {
        if (filtered(channel)) return;
        const int at = find(note);
        if (at < 0 || !held_[at].down) return;
        held_[at].down = false;
        if (fingers_ > 0) --fingers_;
        if (!latch_) remove(at);
        if (count_ == 0) gateMs_ = 0;      // alles los: de klinkende noot ook
    }
    void onControlChange(std::uint8_t channel, std::uint8_t cc, std::uint8_t) {
        if (filtered(channel)) return;
        if (cc == 123 || cc == 120) allNotesOff();
    }
    void allNotesOff() { count_ = 0; fingers_ = 0; gateMs_ = 0; pos_ = -1; }

    // ── klok en uitgangen ─────────────────────────────────────────────────
    void tick() override {
        ++sinceEdge_;
        bool step;
        if (extClock_) {
            step = clockEdge_.rise(clock_ >= 0.5f);
            if (step) { if (sinceEdge_ > 1) periodMs_ = sinceEdge_; sinceEdge_ = 0; }
        } else {
            if (startNow_) internal_.reset();
            step = internal_.tick();
            periodMs_ = static_cast<std::uint32_t>(internal_.periodMs() + 0.5f);
        }
        if (resetEdge_.rise(reset_ >= 0.5f)) { pos_ = -1; dir_ = 1; internal_.reset(); }
        // Uit stilstand speelt de eerste aanslag meteen (ook op de externe klok).
        if (startNow_) { step = true; pos_ = -1; dir_ = 1; startNow_ = false; }
        stepPulse_ = step ? 5 : (stepPulse_ > 0 ? stepPulse_ - 1 : 0);
        if (step) advance();
        else if (gateMs_ > 0) --gateMs_;
    }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "pitch" || portId == "vel") return PortKind::Cv;
        if (portId == "gate" || portId == "step") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "pitch") return static_cast<float>(note_ - 60) / 12.0f;
        if (portId == "gate")  return gateMs_ > 0 ? 1.0f : 0.0f;
        if (portId == "vel")   return static_cast<float>(vel_) / 127.0f;
        if (portId == "step")  return stepPulse_ > 0 ? 1.0f : 0.0f;
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "clock") clock_ = value;
        else if (portId == "reset") reset_ = value;
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        if (controlId == "mode") mode_ = clampInt(cvutil::asFloat(value, 0.0f), 0, 4);
        else if (controlId == "octaves") octaves_ = clampInt(cvutil::asFloat(value, 1.0f), 1, 4);
        else if (controlId == "tempo") { bpm_ = cvutil::clampFinite(cvutil::asFloat(value, 120.0f), 20.0f, 300.0f, 120.0f); applyRate(); }
        else if (controlId == "division") { division_ = clampInt(cvutil::asFloat(value, 3.0f), 0, 5); applyRate(); }
        else if (controlId == "gate") gate_ = cvutil::clampFinite(cvutil::asFloat(value, 0.5f), 0.05f, 1.0f, 0.5f);
        else if (controlId == "latch") {
            const bool was = latch_;
            latch_ = cvutil::asBool(value, false);
            if (was && !latch_) dropReleased();   // latch uit: losgelaten toetsen weg
        }
        else if (controlId == "extclock") extClock_ = cvutil::asBool(value, false);
        else if (controlId == "channel") channel_ = clampInt(cvutil::asFloat(value, 0.0f), 0, 16);
    }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ArpModule>(id);
        });
    }

private:
    struct Held { std::uint8_t note; std::uint8_t vel; std::uint32_t order; bool down; };

    static int clampInt(float v, int lo, int hi) {
        const int i = static_cast<int>(v + 0.5f);
        return i < lo ? lo : i > hi ? hi : i;
    }
    bool filtered(std::uint8_t channel) const { return channel_ != 0 && channel != channel_; }
    int find(std::uint8_t note) const {
        for (int i = 0; i < count_; ++i) if (held_[i].note == note) return i;
        return -1;
    }
    void remove(int at) {
        for (int i = at; i + 1 < count_; ++i) held_[i] = held_[i + 1];
        --count_;
    }
    void dropReleased() {
        for (int i = count_ - 1; i >= 0; --i) if (!held_[i].down) remove(i);
    }
    void applyRate() {
        // Stappen per tel: kwart, achtste, achtste triool, zestiende, zestiende triool, 32e.
        static constexpr float kPerBeat[6] = { 1, 2, 3, 4, 6, 8 };
        // StepClock telt zestienden (4 per tel); omrekenen naar de gekozen deling.
        internal_.setBpm(bpm_ * kPerBeat[division_] / 4.0f);
    }

    /** De reeks voor deze stap: gesorteerd (of in aanslagvolgorde) en over de octaven. */
    int buildSequence(std::uint8_t* seq, std::uint8_t* vel) const {
        int idx[kMaxHeld];
        for (int i = 0; i < count_; ++i) idx[i] = i;
        // Insertion sort: op toonhoogte, of op aanslagvolgorde bij Played.
        for (int i = 1; i < count_; ++i) {
            const int k = idx[i];
            int j = i - 1;
            while (j >= 0 && (mode_ == Played ? held_[idx[j]].order > held_[k].order : held_[idx[j]].note > held_[k].note)) {
                idx[j + 1] = idx[j]; --j;
            }
            idx[j + 1] = k;
        }
        int n = 0;
        for (int o = 0; o < octaves_; ++o) {
            for (int i = 0; i < count_; ++i) {
                const int note = held_[idx[i]].note + 12 * o;
                if (note > 127) continue;
                seq[n] = static_cast<std::uint8_t>(note);
                vel[n] = held_[idx[i]].vel;
                ++n;
            }
        }
        return n;
    }

    void advance() {
        std::uint8_t seq[kMaxHeld * 4], vel[kMaxHeld * 4];
        const int n = count_ > 0 ? buildSequence(seq, vel) : 0;
        if (n == 0) { gateMs_ = 0; return; }
        switch (mode_) {
            case Down:
                pos_ = pos_ <= 0 || pos_ >= n ? n - 1 : pos_ - 1;
                break;
            case UpDown:
                if (n == 1) { pos_ = 0; break; }
                if (pos_ < 0 || pos_ >= n) { pos_ = 0; dir_ = 1; break; }
                if (pos_ + dir_ < 0 || pos_ + dir_ >= n) dir_ = -dir_;
                pos_ += dir_;
                break;
            case Random: {
                int next = static_cast<int>(rng_.uniform() * static_cast<float>(n));
                if (n > 1 && next == pos_) next = (next + 1) % n;
                pos_ = next;
                break;
            }
            default:   // Up, Played
                pos_ = pos_ + 1 >= n || pos_ < 0 ? 0 : pos_ + 1;
                if (pos_ < 0) pos_ = 0;
                break;
        }
        note_ = seq[pos_];
        vel_ = vel[pos_];
        // Noot-lengte: deel van de stap, met minstens 2 ms stilte ervoor de volgende.
        const float len = gate_ * static_cast<float>(periodMs_);
        std::uint32_t ms = static_cast<std::uint32_t>(len + 0.5f);
        if (ms + 2 > periodMs_) ms = periodMs_ > 3 ? periodMs_ - 2 : 1;
        if (ms < 1) ms = 1;
        gateMs_ = ms;
    }

    Held held_[kMaxHeld] = {};
    int count_ = 0, fingers_ = 0;
    std::uint32_t order_ = 0;
    int mode_ = Up, octaves_ = 1, division_ = 3, channel_ = 0;
    float bpm_ = 120.0f, gate_ = 0.5f, clock_ = 0.0f, reset_ = 0.0f;
    bool latch_ = false, extClock_ = false, startNow_ = false;
    int pos_ = -1, dir_ = 1;
    std::uint8_t note_ = 60, vel_ = 100;
    std::uint32_t gateMs_ = 0, periodMs_ = 125, sinceEdge_ = 0;
    int stepPulse_ = 0;
    cvutil::StepClock internal_;
    cvutil::Edge clockEdge_, resetEdge_;
    cvutil::Rng rng_;
};

}  // namespace mmb_link
