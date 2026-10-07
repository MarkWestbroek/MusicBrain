// tp_mmb_arp — arpeggiator. Draait ArpModule.h zelf, de firmwareklasse, via
// de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1. Noten komen binnen via
// `mmb_midi(status, d1, d2)`, net als bij tp_mmb_midiin: de simulator stuurt
// MIDI naar elke MIDI-IN en elke ARP.
#define CVHOST_TOGGLES "latch", "extclock"
#include "cvhost.h"
#include "ArpModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_arp";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = { { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = {
    { "pitch", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "vel", MMB_CV, 0, {} }, { "step", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "mode", 0.0f }, { "octaves", 1.0f }, { "tempo", 120.0f }, { "division", 3.0f }, { "gate", 0.5f },
    { "latch", 0.0f }, { "extclock", 0.0f }, { "channel", 0.0f },
};
const int MMB_NUM_CONTROLS = 8;

mb::runtime::Module* cvhost_make() { return new mmb_link::ArpModule("arp"); }

/** Eén MIDI-bericht, kanaal 1-based zoals de Teensy het aan de module geeft. */
MMB_EXPORT(mmb_midi) void mmb_midi(int status, int d1, int d2) {
    if (!g_cvmod) return;
    auto* arp = static_cast<mmb_link::ArpModule*>(g_cvmod);
    const auto ch = static_cast<std::uint8_t>((status & 0x0F) + 1);
    const auto a = static_cast<std::uint8_t>(d1 & 0x7F), b = static_cast<std::uint8_t>(d2 & 0x7F);
    switch (status & 0xF0) {
        case 0x90: arp->onNoteOn(ch, a, b); break;
        case 0x80: arp->onNoteOff(ch, a, b); break;
        case 0xB0: arp->onControlChange(ch, a, b); break;
        default: break;
    }
}
