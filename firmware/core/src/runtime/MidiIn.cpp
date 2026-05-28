// ADR 0009 / ADR 0010 — MidiInModule implementation. See header for design.
#include "mb/runtime/MidiIn.h"

#include <algorithm>

namespace mb::runtime {

namespace {

// 1 V per octave, MIDI 60 (middle C) anchored at 0 V.
constexpr float kInvSemitonesPerOctave = 1.0f / 12.0f;
constexpr std::uint8_t kAnchorNote     = 60;

float noteToVolts(std::uint8_t note) {
    return (static_cast<int>(note) - static_cast<int>(kAnchorNote)) * kInvSemitonesPerOctave;
}

}  // namespace

MidiInModule::MidiInModule(std::string_view id)
    : CvModule(kTypeId, id)
{
    // Reasonable default: 1 voice, omni — matches a brand-new MIDI-in
    // module in the editor without any user configuration.
    alloc_.configure(1);
}

void MidiInModule::setControl(std::string_view controlId, ControlValue value) {
    auto asInt = [&](std::int32_t fallback) -> std::int32_t {
        if (auto* i = std::get_if<std::int32_t>(&value))  return *i;
        if (auto* f = std::get_if<float>(&value))         return static_cast<std::int32_t>(*f);
        if (auto* b = std::get_if<bool>(&value))          return *b ? 1 : 0;
        return fallback;
    };

    if (controlId == "channel") {
        const auto c = std::clamp<std::int32_t>(asInt(0), 0, 16);
        channelFilter_ = static_cast<std::uint8_t>(c);
    } else if (controlId == "voiceCount" || controlId == "voices") {
        const auto n = std::clamp<std::int32_t>(asInt(1), 1, static_cast<std::int32_t>(kMaxAllocVoices));
        alloc_.configure(static_cast<std::uint8_t>(n));
        // Reconfiguring is a destructive op: any held notes from the old
        // layout would point at indices that may no longer be valid.
        allNotesOff();
    }
    // Unknown ids are silently ignored (forward-compat with older patches).
}

bool MidiInModule::filteredOut(std::uint8_t channel) const {
    // MIDI channels on the wire are 0..15; user-facing is 1..16. The
    // editor stores 1..16, so we compare 1-based on both sides; callers
    // pass 1..16 (or 0 to mean "the device didn't tell us the channel").
    if (channelFilter_ == kOmni) return false;
    return channel != channelFilter_;
}

void MidiInModule::onNoteOn(std::uint8_t channel, std::uint8_t note, std::uint8_t velocity) {
    if (filteredOut(channel)) return;

    // MIDI convention: NoteOn with velocity 0 == NoteOff.
    if (velocity == 0) { onNoteOff(channel, note); return; }

    const auto r = alloc_.noteOn(note);
    if (r.voiceIdx >= kMaxAllocVoices) return;   // defensive; allocator
                                                 // never returns >=kMax.

    if (r.stole) {
        // The voice we got back was holding `r.prevNote`. Lower its gate
        // first so downstream envelopes register a clean retrigger, even
        // though we're about to raise it again below.
        gate_[r.voiceIdx] = false;
    }

    currentNote_[r.voiceIdx] = note;
    velocity_   [r.voiceIdx] = velocity;
    gate_       [r.voiceIdx] = true;
}

void MidiInModule::onNoteOff(std::uint8_t channel, std::uint8_t note) {
    if (filteredOut(channel)) return;

    const auto idx = alloc_.noteOff(note);
    if (idx == 0xFF || idx >= kMaxAllocVoices) return;   // no voice held it.

    gate_[idx] = false;
    // Note: we deliberately keep `currentNote_` and `velocity_` so a
    // release-phase envelope can still report sensible values. The next
    // NoteOn on this voice will overwrite them.
}

void MidiInModule::allNotesOff() {
    alloc_.allOff();
    gate_.fill(false);
    // Keep `velocity_` / `currentNote_` so the last-played values remain
    // available for inspection (matches typical hardware behaviour).
}

float MidiInModule::voicePitchV(std::uint8_t voiceIdx) const {
    if (voiceIdx >= kMaxAllocVoices) return 0.0f;
    return noteToVolts(currentNote_[voiceIdx]);
}

bool MidiInModule::voiceGate(std::uint8_t voiceIdx) const {
    if (voiceIdx >= kMaxAllocVoices) return false;
    return gate_[voiceIdx];
}

float MidiInModule::voiceVelocity(std::uint8_t voiceIdx) const {
    if (voiceIdx >= kMaxAllocVoices) return 0.0f;
    return static_cast<float>(velocity_[voiceIdx]) * (1.0f / 127.0f);
}

void MidiInModule::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<MidiInModule>(instanceId);
    });
}

namespace {
const int kMidiInAutoRegister = [] { MidiInModule::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
