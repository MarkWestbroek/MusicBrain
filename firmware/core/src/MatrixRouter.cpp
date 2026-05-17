#include "mb/MatrixRouter.h"

namespace mb {

namespace {

OutputCommand makeCvSet(ChannelId ch, int16_t cvCode) {
    return OutputCommand{
        OutputKind::CvSet,
        static_cast<uint16_t>(ch),
        static_cast<uint16_t>(ch),       // payload mirror for symmetry w/ other kinds
        static_cast<int32_t>(cvCode),
    };
}

OutputCommand makeGate(ChannelId ch, bool on) {
    return OutputCommand{
        OutputKind::GateSet,
        static_cast<uint16_t>(ch),
        static_cast<uint16_t>(ch),
        on ? 1 : 0,
    };
}

}  // namespace

int16_t MatrixRouter::midiNoteToCvCode(uint8_t midiNote) {
    // (note - 60) * (32767 / 60), clamped to [-32767, +32767].
    const int n = static_cast<int>(midiNote) - 60;
    // Use int math: multiply first, divide second, with rounding.
    int scaled = (n * 32767) / 60;
    if (scaled >  32767) scaled =  32767;
    if (scaled < -32767) scaled = -32767;
    return static_cast<int16_t>(scaled);
}

RouterResult MatrixRouter::handle(const InputEvent& ev, const Patch* active) {
    RouterResult r;
    if (active == nullptr) return r;

    auto sp = synth::readBlob(*active);
    if (!sp) return r;

    if (sp->voiceCount != configuredFor_) {
        alloc_.configure(sp->voiceCount);
        configuredFor_ = sp->voiceCount;
    }

    switch (ev.kind) {
        case InputKind::MidiNoteOn: {
            const uint8_t note = static_cast<uint8_t>(ev.payload & 0xFF);
            const auto    a    = alloc_.noteOn(note);
            const ChannelId pitchCh = sp->pitchChannel(a.voiceIdx);
            const ChannelId gateCh  = sp->gateChannel(a.voiceIdx);

            // When stealing: drop the gate first so the breakout sees a
            // distinct trigger edge after the new CV settles.
            if (a.stole && r.count < kMaxOutputsPerEvent) {
                r.commands[r.count++] = makeGate(gateCh, false);
            }
            if (r.count < kMaxOutputsPerEvent) {
                r.commands[r.count++] = makeCvSet(pitchCh, midiNoteToCvCode(note));
            }
            if (r.count < kMaxOutputsPerEvent) {
                r.commands[r.count++] = makeGate(gateCh, true);
            }
            return r;
        }

        case InputKind::MidiNoteOff: {
            const uint8_t note = static_cast<uint8_t>(ev.payload & 0xFF);
            const uint8_t v    = alloc_.noteOff(note);
            if (v == 0xFF) return r;
            const ChannelId gateCh = sp->gateChannel(v);
            r.commands[r.count++] = makeGate(gateCh, false);
            return r;
        }

        case InputKind::MidiProgramChange:
            r.commands[r.count++] = OutputCommand{OutputKind::DisplayDirty, 0, 0, 0};
            return r;

        default:
            return r;
    }
}

}  // namespace mb
