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
    } else if (controlId == "steal") {
        // Poly voice-stealing strategy. Editor switch indices map 1:1 onto
        // StealStrategy { Oldest=0, Lowest=1, Highest=2 } (ADR 0011 §3).
        const auto s = std::clamp<std::int32_t>(asInt(0), 0, 2);
        alloc_.setStealStrategy(static_cast<StealStrategy>(s));
    } else if (controlId == "cc1Num") {
        cc1Num_ = static_cast<std::uint8_t>(std::clamp<std::int32_t>(asInt(74), 0, 127));
    } else if (controlId == "cc2Num") {
        cc2Num_ = static_cast<std::uint8_t>(std::clamp<std::int32_t>(asInt(71), 0, 127));
    } else if (controlId == "bendRange") {
        bendRange_ = static_cast<std::uint8_t>(std::clamp<std::int32_t>(asInt(2), 1, 24));
    } else if (controlId == "legato") {
        const bool on = asInt(0) != 0;
        if (on != legato_) {
            legato_ = on;
            // Switching the gate model mid-flight would desync the mono
            // note-stack from the allocator, so reset all held notes — the
            // same destructive policy we use when `voiceCount` changes.
            allNotesOff();
        }
    }
    // `priority` (mono note-priority last/low/high) is accepted by the editor
    // but not yet acted on here: the allocator currently always uses last-note
    // priority (see backlog FW-1).
    // Unknown ids are silently ignored (forward-compat with older patches).
}

void MidiInModule::monoPush(std::uint8_t note) {
    // Remove any existing instance so the note moves to the top of the stack.
    monoRemove(note);
    if (monoStackLen_ < kMonoStackMax) {
        monoStack_[monoStackLen_++] = note;
    } else {
        // Stack full: drop the oldest entry to make room (very unlikely with
        // 32 slots, but keeps us bounded and click-free).
        for (std::uint8_t i = 1; i < kMonoStackMax; ++i) monoStack_[i - 1] = monoStack_[i];
        monoStack_[kMonoStackMax - 1] = note;
    }
}

void MidiInModule::monoRemove(std::uint8_t note) {
    std::uint8_t w = 0;
    for (std::uint8_t r = 0; r < monoStackLen_; ++r) {
        if (monoStack_[r] != note) monoStack_[w++] = monoStack_[r];
    }
    monoStackLen_ = w;
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

    if (monoLegatoActive()) {
        // Mono legato: voice 0 changes pitch but the gate stays high while a
        // previous note is still sounding, so the envelopes are NOT
        // retriggered (legato glide). The very first note raises the gate.
        monoPush(note);
        currentNote_[0] = note;
        velocity_   [0] = velocity;
        gate_       [0] = true;
        return;
    }

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

    if (monoLegatoActive()) {
        // Mono legato: drop the released note. If keys remain held, fall back
        // to the most-recent one (pitch changes, gate stays high); otherwise
        // lower the gate so the envelopes release.
        monoRemove(note);
        if (monoStackLen_ > 0) {
            currentNote_[0] = monoStack_[monoStackLen_ - 1];
        } else {
            gate_[0] = false;
        }
        return;
    }

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
    monoStackLen_ = 0;   // clear the mono legato note-stack too.
    // Keep `velocity_` / `currentNote_` so the last-played values remain
    // available for inspection (matches typical hardware behaviour).
}

void MidiInModule::onControlChange(std::uint8_t channel, std::uint8_t cc, std::uint8_t value) {
    if (filteredOut(channel)) return;
    if (cc == 123) { allNotesOff(); return; }   // All Notes Off.
    const auto v = static_cast<std::uint8_t>(value & 0x7F);
    if (cc == 1)        modWheel_ = v;           // mod-wheel → cv_mod.
    if (cc == cc1Num_)  cc1Val_   = v;           // configurable slot 1.
    if (cc == cc2Num_)  cc2Val_   = v;           // configurable slot 2.
}

void MidiInModule::onPitchBend(std::uint8_t channel, int value14) {
    if (filteredOut(channel)) return;
    bend14_ = std::clamp(value14, 0, 16383);
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

float MidiInModule::readCvPort(std::string_view portId) const {
    const std::uint8_t n = alloc_.voiceCount();
    if (portId == "gate") {
        for (std::uint8_t v = 0; v < n; ++v)
            if (gate_[v]) return 1.0f;
        return 0.0f;
    }
    if (portId == "pitch") {
        // First currently-gated voice wins; if none, last note assigned to
        // voice 0 (so a release tail keeps its pitch).
        for (std::uint8_t v = 0; v < n; ++v)
            if (gate_[v]) return noteToVolts(currentNote_[v]);
        return noteToVolts(currentNote_[0]);
    }
    if (portId == "vel") {
        // Velocity of the first currently-gated voice, normalised to 0..1.
        // When no voice is gated we LATCH the last value (voice 0) instead
        // of dropping to 0 — exactly like `pitch` keeps its note. This is
        // essential for a velocity-scaled VCA (CvMath mult: env × vel): if
        // vel collapsed to 0 at note-off, `env × 0` would zero the VCA
        // instantly, cutting the release tail (no release) and producing a
        // hard step (click). Latching lets the envelope's own release ramp
        // bring the level down smoothly. Mirrors the documented contract of
        // voiceVelocity().
        for (std::uint8_t v = 0; v < n; ++v)
            if (gate_[v]) return static_cast<float>(velocity_[v]) * (1.0f / 127.0f);
        return static_cast<float>(velocity_[0]) * (1.0f / 127.0f);
    }
    // Modulation outputs (ED-MI-4). Continuous controllers that are global to
    // the module (not per-voice): mod-wheel, pitch-bend and two configurable
    // CC slots. cv_bend is in V/Oct so it can sum straight onto a VCO's voct.
    if (portId == "cv_mod")  return modWheel();
    if (portId == "cv_bend") return pitchBendV();
    if (portId == "cv_cc1")  return static_cast<float>(cc1Val_) * (1.0f / 127.0f);
    if (portId == "cv_cc2")  return static_cast<float>(cc2Val_) * (1.0f / 127.0f);
    // Voice-indexed ports (ADR 0011 §4): `pitchK`/`gateK`/`velK`, K = 1-based
    // voice index. These expose a single voice directly so the editor can wire
    // two (or more) independent voice chains by hand, ahead of the voice-stamp
    // expansion in ADR 0010. Out-of-range indices fall through to 0.0f.
    if (int vi = parseVoicePort(portId, "pitch"); vi >= 0) {
        return (vi < n) ? voicePitchV(static_cast<std::uint8_t>(vi)) : 0.0f;
    }
    if (int vi = parseVoicePort(portId, "gate"); vi >= 0) {
        return (vi < n && gate_[vi]) ? 1.0f : 0.0f;
    }
    if (int vi = parseVoicePort(portId, "vel"); vi >= 0) {
        return (vi < n) ? voiceVelocity(static_cast<std::uint8_t>(vi)) : 0.0f;
    }
    return 0.0f;
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
