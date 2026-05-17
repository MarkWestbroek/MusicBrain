// Host harness for project 1 (effect-switcher). Demonstrates the same core
// router + HAL interfaces that the RP2040 firmware will use, but driven from
// stdin/printf so it can be smoke-tested on a laptop.
//
// Usage:
//   mb_switcher              -> runs a built-in demo sequence
//   mb_switcher --interactive-> reads single-char commands from stdin:
//        u = footswitch up, d = footswitch down, 0..7 = direct PC, q = quit

#include "mb/PatchBank.h"
#include "mb/SwitcherPatch.h"
#include "mb/SwitcherRouter.h"
#include "mb/host/HostDisplay.h"
#include "mb/host/HostRelayBoard.h"

#include <cstdio>
#include <cstring>
#include <string>

using namespace mb;
using namespace mb::switcher;

namespace {

void applyResult(const RouterResult& res,
                 mb::host::HostRelayBoard& relays,
                 mb::host::HostDisplay&    display,
                 const PatchBank&          bank) {
    for (std::size_t i = 0; i < res.count; ++i) {
        const auto& c = res.commands[i];
        switch (c.kind) {
            case OutputKind::RelaySet:
                relays.setRelay(c.payload, c.data != 0);
                break;
            case OutputKind::DisplayDirty:
                if (auto* p = bank.active()) {
                    display.showPatch(static_cast<uint8_t>(p->id), p->nameView());
                }
                break;
            default:
                break;  // MidiOut etc. ignored in this host harness
        }
    }
}

void printState(const mb::host::HostRelayBoard& relays,
                const mb::host::HostDisplay&    display) {
    std::printf("  display: id=%u name=\"%s\"\n",
                display.lastId(), display.lastName().c_str());
    std::printf("  relays : ");
    for (std::size_t i = 0; i < relays.relayCount(); ++i) {
        std::printf("%c", relays.state(i) ? '#' : '.');
    }
    std::printf("  (mask=0x%04X)\n", relays.mask());
}

Patch makePatch(ProgramId id, const char* name, uint16_t mask) {
    Patch p{};
    p.id = id;
    p.setName(name);
    SwitcherPatchV1 sp{};
    sp.relayCount = 16;
    sp.relayMask  = mask;
    (void)writeBlob(p, sp);
    return p;
}

PatchBank makeDemoBank() {
    PatchBank b{};
    b.insert(makePatch(0, "Clean",      0x0001));
    b.insert(makePatch(1, "Crunch",     0x0003));
    b.insert(makePatch(2, "Lead",       0x000F));
    b.insert(makePatch(3, "Solo",       0x0017));
    b.insert(makePatch(4, "Ambient",    0x0080));
    b.insert(makePatch(5, "Octave",     0x0144));
    b.insert(makePatch(6, "Reverb",     0x0300));
    b.insert(makePatch(7, "All",        0x00FF));
    return b;
}

}  // namespace

int main(int argc, char** argv) {
    PatchBank bank = makeDemoBank();
    SwitcherRouter router{bank};
    mb::host::HostRelayBoard relays{16};
    mb::host::HostDisplay    display{};

    bool interactive = false;
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--interactive") == 0) interactive = true;
    }

    std::printf("mb_switcher: 8 demo patches loaded.\n");

    auto sendPc = [&](uint8_t prog) {
        InputEvent ev{};
        ev.kind = InputKind::MidiProgramChange;
        ev.data = prog;
        auto res = router.handle(ev, nullptr);
        applyResult(res, relays, display, bank);
        std::printf("PC %u:\n", prog);
        printState(relays, display);
    };

    auto sendFs = [&](uint16_t id) {
        InputEvent ev{};
        ev.kind    = InputKind::Footswitch;
        ev.payload = id;
        ev.data    = 1;
        auto res = router.handle(ev, nullptr);
        applyResult(res, relays, display, bank);
        std::printf("FS %s:\n", id == 0 ? "up" : "down");
        printState(relays, display);
    };

    if (!interactive) {
        sendPc(0);
        sendFs(0);  // 0 → 1
        sendFs(0);  // 1 → 2
        sendPc(7);
        sendFs(1);  // 7 → 6
        sendFs(0);  // 6 → 7
        sendFs(0);  // 7 → 0 (wrap)
        return 0;
    }

    std::printf("Commands: u(p) d(own) 0..7 q(uit)\n");
    int ch;
    while ((ch = std::getchar()) != EOF) {
        if (ch == '\n' || ch == '\r' || ch == ' ') continue;
        if (ch == 'q') break;
        if (ch == 'u') sendFs(0);
        else if (ch == 'd') sendFs(1);
        else if (ch >= '0' && ch <= '7') sendPc(static_cast<uint8_t>(ch - '0'));
        else std::printf("?\n");
    }
    return 0;
}
