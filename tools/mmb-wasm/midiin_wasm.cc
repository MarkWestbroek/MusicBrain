// tp_mmb_midiin — MIDI-In met stemtoewijzing. Draait
// mb::runtime::MidiInModule zelf (core/src/runtime/MidiIn.cpp en de
// VoiceAllocator) via cvhost.h, 1 kHz, blok 1: prioriteit, legato, steal,
// glide, unison met spread — alles zoals de firmware het doet, inclusief wat
// de firmware (nog) niet goed doet (FW-10: een gestolen stem slaat niet
// opnieuw aan, want gate uit en aan vallen binnen één tick).
//
// Noten komen binnen via `mmb_midi(status, d1, d2)` (bericht 'midi' in de
// worklet), zoals de MIDI-ISR van de Teensy `onNoteOn` e.d. aanroept.
// Uitgangen: de gezamenlijke `pitch`/`gate`/`vel`, de MOD-uitgangen, en per
// stem `pitchK`/`gateK`/`velK` (K = 1..16) — die laatste gebruikt de
// poly-uitvouwing, net als `polyExpand.ts` voor de firmware doet.
#include "cvhost.h"
#include "mb/runtime/MidiIn.h"

const char* const MMB_TYPE_ID     = "tp_mmb_midiin";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[1] = {};
const int MMB_NUM_INPUTS = 0;
MmbPort MMB_OUTPUTS[] = {
    { "pitch", MMB_CV, 0, {} },
    { "gate", MMB_GATE, 0, {} },
    { "vel", MMB_CV, 0, {} },
    { "cv_mod", MMB_CV, 0, {} },
    { "cv_bend", MMB_CV, 0, {} },
    { "cv_cc1", MMB_CV, 0, {} },
    { "cv_cc2", MMB_CV, 0, {} },
    { "pitch1", MMB_CV, 0, {} },
    { "gate1", MMB_GATE, 0, {} },
    { "vel1", MMB_CV, 0, {} },
    { "pitch2", MMB_CV, 0, {} },
    { "gate2", MMB_GATE, 0, {} },
    { "vel2", MMB_CV, 0, {} },
    { "pitch3", MMB_CV, 0, {} },
    { "gate3", MMB_GATE, 0, {} },
    { "vel3", MMB_CV, 0, {} },
    { "pitch4", MMB_CV, 0, {} },
    { "gate4", MMB_GATE, 0, {} },
    { "vel4", MMB_CV, 0, {} },
    { "pitch5", MMB_CV, 0, {} },
    { "gate5", MMB_GATE, 0, {} },
    { "vel5", MMB_CV, 0, {} },
    { "pitch6", MMB_CV, 0, {} },
    { "gate6", MMB_GATE, 0, {} },
    { "vel6", MMB_CV, 0, {} },
    { "pitch7", MMB_CV, 0, {} },
    { "gate7", MMB_GATE, 0, {} },
    { "vel7", MMB_CV, 0, {} },
    { "pitch8", MMB_CV, 0, {} },
    { "gate8", MMB_GATE, 0, {} },
    { "vel8", MMB_CV, 0, {} },
    { "pitch9", MMB_CV, 0, {} },
    { "gate9", MMB_GATE, 0, {} },
    { "vel9", MMB_CV, 0, {} },
    { "pitch10", MMB_CV, 0, {} },
    { "gate10", MMB_GATE, 0, {} },
    { "vel10", MMB_CV, 0, {} },
    { "pitch11", MMB_CV, 0, {} },
    { "gate11", MMB_GATE, 0, {} },
    { "vel11", MMB_CV, 0, {} },
    { "pitch12", MMB_CV, 0, {} },
    { "gate12", MMB_GATE, 0, {} },
    { "vel12", MMB_CV, 0, {} },
    { "pitch13", MMB_CV, 0, {} },
    { "gate13", MMB_GATE, 0, {} },
    { "vel13", MMB_CV, 0, {} },
    { "pitch14", MMB_CV, 0, {} },
    { "gate14", MMB_GATE, 0, {} },
    { "vel14", MMB_CV, 0, {} },
    { "pitch15", MMB_CV, 0, {} },
    { "gate15", MMB_GATE, 0, {} },
    { "vel15", MMB_CV, 0, {} },
    { "pitch16", MMB_CV, 0, {} },
    { "gate16", MMB_GATE, 0, {} },
    { "vel16", MMB_CV, 0, {} },
    // Expressie (MPE stap 1): druk en release-velocity, master + per stem.
    { "press", MMB_CV, 0, {} }, { "rel", MMB_CV, 0, {} },
    { "press1", MMB_CV, 0, {} }, { "press2", MMB_CV, 0, {} }, { "press3", MMB_CV, 0, {} }, { "press4", MMB_CV, 0, {} },
    { "press5", MMB_CV, 0, {} }, { "press6", MMB_CV, 0, {} }, { "press7", MMB_CV, 0, {} }, { "press8", MMB_CV, 0, {} },
    { "press9", MMB_CV, 0, {} }, { "press10", MMB_CV, 0, {} }, { "press11", MMB_CV, 0, {} }, { "press12", MMB_CV, 0, {} },
    { "press13", MMB_CV, 0, {} }, { "press14", MMB_CV, 0, {} }, { "press15", MMB_CV, 0, {} }, { "press16", MMB_CV, 0, {} },
    { "rel1", MMB_CV, 0, {} }, { "rel2", MMB_CV, 0, {} }, { "rel3", MMB_CV, 0, {} }, { "rel4", MMB_CV, 0, {} },
    { "rel5", MMB_CV, 0, {} }, { "rel6", MMB_CV, 0, {} }, { "rel7", MMB_CV, 0, {} }, { "rel8", MMB_CV, 0, {} },
    { "rel9", MMB_CV, 0, {} }, { "rel10", MMB_CV, 0, {} }, { "rel11", MMB_CV, 0, {} }, { "rel12", MMB_CV, 0, {} },
    { "rel13", MMB_CV, 0, {} }, { "rel14", MMB_CV, 0, {} }, { "rel15", MMB_CV, 0, {} }, { "rel16", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 55 + 2 + 32;
MmbControl MMB_CONTROLS[] = {
    { "channel", 0.0f }, { "priority", 0.0f }, { "steal", 0.0f }, { "legato", 0.0f },
    { "bendRange", 2.0f }, { "glide", 0.0f }, { "unison", 0.0f }, { "spread", 0.0f },
    { "cc1Num", 74.0f }, { "cc2Num", 71.0f }, { "voiceCount", 1.0f }, { "bendPitch", 0.0f },
};
const int MMB_NUM_CONTROLS = 12;

mb::runtime::Module* cvhost_make() { return new mb::runtime::MidiInModule("midiin"); }

/** Eén MIDI-bericht, kanaal 1-based zoals de Teensy het aan de module geeft. */
MMB_EXPORT(mmb_midi) void mmb_midi(int status, int d1, int d2) {
    if (!g_cvmod) return;
    auto* mi = static_cast<mb::runtime::MidiInModule*>(g_cvmod);
    const auto ch = static_cast<std::uint8_t>((status & 0x0F) + 1);
    const auto a = static_cast<std::uint8_t>(d1 & 0x7F), b = static_cast<std::uint8_t>(d2 & 0x7F);
    switch (status & 0xF0) {
        case 0x90: mi->onNoteOn(ch, a, b); break;
        case 0x80: mi->onNoteOff(ch, a, b); break;          // b = release velocity
        case 0xD0: mi->onChannelPressure(ch, a); break;     // aftertouch (kanaal)
        case 0xA0: mi->onPolyPressure(ch, a, b); break;     // aftertouch (per toets)
        case 0xB0: mi->onControlChange(ch, a, b); break;
        case 0xE0: mi->onPitchBend(ch, a | (b << 7)); break;
        default: break;
    }
}
