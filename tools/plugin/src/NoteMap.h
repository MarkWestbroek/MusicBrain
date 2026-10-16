#pragma once
// Noten uit de DAW (MIDI) naar de CV-ingangen van een module: voct (1 V/oct,
// MIDI 60 = 0 V), gate en velocity. Dit is wat MIDI-IN in de editor doet.
//
//  - Mono (poorten voct/gate/vel): een notenstapel met laatste-noot-
//    prioriteit; de gate blijft hoog zolang er een noot ligt (legato), en
//    gaat bij een nieuwe noot één blok omlaag als `retrigger` aan staat.
//  - Poly (poorten voct_1..N/gate_1..N/vel_1..N): een cel per noot; dezelfde
//    noot opnieuw → die cel, anders de langst vrije, anders de oudste stelen.
//  - Sustainpedaal (CC 64): losgelaten noten blijven liggen tot het pedaal
//    omhoog gaat. Pitchbend ±2 halve tonen telt op bij voct.
//
// De vertaler kent de module niet: hij levert per blok de stand van elke
// cel (voct, gate, vel); de plugin schrijft die naar de poorten.

#include <juce_audio_processors/juce_audio_processors.h>

#include <vector>

namespace mmb_plugin {

class NoteMap {
public:
    struct Cell { float voct = 0.0f; bool gate = false; float vel = 0.0f; int note = -1; bool held = false; bool pedalHeld = false; unsigned long stamp = 0; };
    static constexpr float kBendSemitones = 2.0f;

    /** @p cells 1 = mono (notenstapel), >1 = poly. */
    void reset(int cells) {
        cells_.assign(static_cast<std::size_t>(cells < 1 ? 1 : cells), Cell {});
        stack_.clear(); pedal_ = false; bend_ = 0.0f; counter_ = 0;
    }
    int size() const { return static_cast<int>(cells_.size()); }
    const Cell& cell(int k) const { return cells_[static_cast<std::size_t>(k)]; }
    float bend() const { return bend_; }

    void handle(const juce::MidiMessage& m) {
        if (m.isNoteOn()) noteOn(m.getNoteNumber(), m.getFloatVelocity());
        else if (m.isNoteOff()) noteOff(m.getNoteNumber());
        else if (m.isPitchWheel()) bend_ = (static_cast<float>(m.getPitchWheelValue()) - 8192.0f) / 8192.0f * kBendSemitones / 12.0f;
        else if (m.isSustainPedalOn()) pedal_ = true;
        else if (m.isSustainPedalOff()) { pedal_ = false; for (auto& c : cells_) if (c.pedalHeld) { c.pedalHeld = false; if (!c.held) release(c); } if (cells_.size() == 1) refreshMono(); }
        else if (m.isAllNotesOff() || m.isAllSoundOff()) reset(size());
    }

private:
    static float voctOf(int note) { return static_cast<float>(note - 60) / 12.0f; }

    void noteOn(int note, float vel) {
        if (cells_.size() == 1) {
            for (auto it = stack_.begin(); it != stack_.end(); ++it) if (*it == note) { stack_.erase(it); break; }
            stack_.push_back(note);
            Cell& c = cells_[0];
            c.note = note; c.voct = voctOf(note); c.vel = vel; c.gate = true; c.held = true; c.pedalHeld = false; c.stamp = ++counter_;
            return;
        }
        int pick = -1;
        for (std::size_t k = 0; k < cells_.size(); ++k) if (cells_[k].note == note && (cells_[k].held || cells_[k].pedalHeld)) { pick = static_cast<int>(k); break; }
        if (pick < 0) { unsigned long oldest = ~0ul; for (std::size_t k = 0; k < cells_.size(); ++k) if (!cells_[k].gate && cells_[k].stamp < oldest) { oldest = cells_[k].stamp; pick = static_cast<int>(k); } }
        if (pick < 0) { unsigned long oldest = ~0ul; for (std::size_t k = 0; k < cells_.size(); ++k) if (cells_[k].stamp < oldest) { oldest = cells_[k].stamp; pick = static_cast<int>(k); } }
        Cell& c = cells_[static_cast<std::size_t>(pick)];
        c.note = note; c.voct = voctOf(note); c.vel = vel; c.gate = true; c.held = true; c.pedalHeld = false; c.stamp = ++counter_;
    }

    void noteOff(int note) {
        if (cells_.size() == 1) {
            for (auto it = stack_.begin(); it != stack_.end(); ++it) if (*it == note) { stack_.erase(it); break; }
            Cell& c = cells_[0];
            if (c.note == note) {
                c.held = false;
                if (pedal_) c.pedalHeld = true;
                else refreshMono();
            }
            return;
        }
        for (auto& c : cells_) {
            if (c.note != note || !c.held) continue;
            c.held = false;
            if (pedal_) c.pedalHeld = true; else release(c);
        }
    }

    /** Mono: na een note-off naar de vorige noot van de stapel, of de gate dicht. */
    void refreshMono() {
        Cell& c = cells_[0];
        if (c.held || c.pedalHeld) return;
        if (!stack_.empty()) {
            c.note = stack_.back(); c.voct = voctOf(c.note); c.gate = true; c.held = true; c.stamp = ++counter_;
        } else release(c);
    }
    void release(Cell& c) { c.gate = false; c.stamp = ++counter_; }

    std::vector<Cell> cells_;
    std::vector<int> stack_;
    bool pedal_ = false;
    float bend_ = 0.0f;
    unsigned long counter_ = 0;
};

}  // namespace mmb_plugin
