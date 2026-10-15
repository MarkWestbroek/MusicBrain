// MMB SID als plugin (instrument): mmb_dsp::SidMulti (dezelfde header als
// SidModule.h en sid_wasm.cc) in de MMB-romp. De noten komen uit de MIDI van
// de DAW; een kleine stemverdeler zet ze op de cellen (chips × 3 stemmen),
// wat in de editor MIDI-IN doet. V/oct zoals overal in MMB: MIDI 60 = 0 V.

#include "MmbPluginBase.h"
#include "tp_mmb_sid_params.h"
#include "mmb_dsp/sid.h"

namespace {

using mmb_plugin::is;

class SidProcessor final : public mmb_plugin::MmbProcessor {
public:
    using M = mmb_dsp::SidMulti;
    using S = mmb_dsp::SidSynth;
    using C = mmb_dsp::SidChip;
    static constexpr float kBendSemitones = 2.0f;

    SidProcessor() : MmbProcessor(mmb_plugin::kModule_tp_mmb_sid, true) {}

    void prepare(double sampleRate, int) override {
        sid_.Init(static_cast<float>(sampleRate));
        for (auto& c : cells_) c = Cell {};
        counter_ = 0;
    }

    // Zelfde vertaling als mmb_on_control in tools/mmb-wasm/sid_wasm.cc.
    void applyControl(const char* id, float v) override {
        const bool on = v >= 0.5f;
        const int n = static_cast<int>(v + 0.5f);
        auto each = [&](auto fn) { sid_.all([&](S& s) { fn(s); }); };
        if      (is(id, "tri"))     each([&](S& s) { s.setWaveBit(C::kTri, on); });
        else if (is(id, "saw"))     each([&](S& s) { s.setWaveBit(C::kSaw, on); });
        else if (is(id, "pulse"))   each([&](S& s) { s.setWaveBit(C::kPulse, on); });
        else if (is(id, "noise"))   each([&](S& s) { s.setWaveBit(C::kNoise, on); });
        else if (is(id, "pw"))      each([&](S& s) { s.setPw(v); });
        else if (is(id, "ring"))    each([&](S& s) { s.setRing(on); });
        else if (is(id, "sync"))    each([&](S& s) { s.setSync(on); });
        else if (is(id, "attack"))  each([&](S& s) { s.setAttack(n); });
        else if (is(id, "decay"))   each([&](S& s) { s.setDecay(n); });
        else if (is(id, "sustain")) each([&](S& s) { s.setSustain(n); });
        else if (is(id, "release")) each([&](S& s) { s.setRelease(n); });
        else if (is(id, "coarse"))  each([&](S& s) { s.setCoarse(v); });
        else if (is(id, "fine"))    each([&](S& s) { s.setFine(v); });
        else if (is(id, "volume"))  each([&](S& s) { s.setVolume(n); });
        else if (is(id, "level"))   each([&](S& s) { s.setLevel(v); });
        else if (is(id, "combo"))   each([&](S& s) { s.setCombo(v); });
        else if (is(id, "cutoff"))  each([&](S& s) { s.setCutoff(v); });
        else if (is(id, "res"))     each([&](S& s) { s.setRes(n); });
        else if (is(id, "filt"))    each([&](S& s) { s.setFilt(on); });
        else if (is(id, "lp"))      each([&](S& s) { s.setMode(S::kLp, on); });
        else if (is(id, "bp"))      each([&](S& s) { s.setMode(S::kBp, on); });
        else if (is(id, "hp"))      each([&](S& s) { s.setMode(S::kHp, on); });
        else if (is(id, "model"))   each([&](S& s) { s.setModel(n); });
        else if (is(id, "curve"))   each([&](S& s) { s.setCurve(v); });
        else if (is(id, "chips"))   { chips_ = n < 1 ? 1 : (n > M::kMaxChips ? M::kMaxChips : n); sid_.setChips(chips_); }
        else if (is(id, "spread"))  sid_.setSpread(v);
    }

    void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override {
        const int frames = buffer.getNumSamples();
        float* outL = buffer.getWritePointer(0);
        float* outR = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : nullptr;
        auto event = midi.begin();
        const float ext[M::kMaxChips] = {};
        float y[M::kNumOuts];
        for (int n = 0; n < frames; ++n) {
            while (event != midi.end() && (*event).samplePosition <= n) { handle((*event).getMessage()); ++event; }
            sid_.Process(ext, y);
            outL[n] = y[M::kOutL];
            if (outR) outR[n] = y[M::kOutR];
        }
    }

private:
    struct Cell { int note = -1; bool gate = false; unsigned long stamp = 0; };

    int cellCount() const { return chips_ * S::kVoices; }

    void handle(const juce::MidiMessage& m) {
        if (m.isNoteOn()) noteOn(m.getNoteNumber());
        else if (m.isNoteOff()) noteOff(m.getNoteNumber());
        else if (m.isPitchWheel()) {
            const float bend = (static_cast<float>(m.getPitchWheelValue()) - 8192.0f) / 8192.0f;
            sid_.all([&](S& s) { s.setBend(bend * kBendSemitones / 12.0f); });
        } else if (m.isAllNotesOff() || m.isAllSoundOff()) {
            for (int k = 0; k < M::kCells; ++k) { cells_[k] = Cell {}; sid_.gate(k, false); }
        }
    }

    void noteOn(int note) {
        const int count = cellCount();
        // Dezelfde noot opnieuw: die cel; anders de langst vrije cel; anders de oudste stelen.
        int pick = -1;
        for (int k = 0; k < count; ++k) if (cells_[k].gate && cells_[k].note == note) { pick = k; break; }
        if (pick < 0) {
            unsigned long oldest = ~0ul;
            for (int k = 0; k < count; ++k) if (!cells_[k].gate && cells_[k].stamp < oldest) { oldest = cells_[k].stamp; pick = k; }
        }
        if (pick < 0) {
            unsigned long oldest = ~0ul;
            for (int k = 0; k < count; ++k) if (cells_[k].stamp < oldest) { oldest = cells_[k].stamp; pick = k; }
        }
        Cell& c = cells_[pick];
        c.note = note; c.gate = true; c.stamp = ++counter_;
        sid_.setVoct(pick, static_cast<float>(note - 60) / 12.0f);
        sid_.gate(pick, true);
    }

    void noteOff(int note) {
        for (int k = 0; k < cellCount(); ++k) {
            Cell& c = cells_[k];
            if (!c.gate || c.note != note) continue;
            c.gate = false; c.stamp = ++counter_;
            sid_.gate(k, false);
        }
    }

    M sid_;
    int chips_ = 1;
    Cell cells_[M::kCells];
    unsigned long counter_ = 0;
};

}  // namespace

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new SidProcessor(); }
