#include "test_harness.h"
#include "mb/PatchBank.h"
#include "mb/SwitcherPatch.h"
#include "mb/SwitcherRouter.h"

#include <cstring>

using namespace mb;
using namespace mb::switcher;

namespace {

Patch makePatch(ProgramId id, const char* name, uint16_t mask, uint8_t relays = 16) {
    Patch p{};
    p.id = id;
    p.setName(name);
    SwitcherPatchV1 sp{};
    sp.relayCount = relays;
    sp.relayMask  = mask;
    MB_REQUIRE(writeBlob(p, sp));
    return p;
}

PatchBank makeBank() {
    PatchBank b{};
    MB_REQUIRE(b.insert(makePatch(0, "Clean",  0x0001)));
    MB_REQUIRE(b.insert(makePatch(1, "Crunch", 0x0003)));
    MB_REQUIRE(b.insert(makePatch(2, "Lead",   0x000F)));
    MB_REQUIRE(b.insert(makePatch(3, "All",    0xFFFF)));
    return b;
}

}  // namespace

MB_TEST(switcher_blob_roundtrip) {
    Patch p{};
    SwitcherPatchV1 sp{};
    sp.relayCount = 16;
    sp.relayMask  = 0xA5A5;
    sp.flags      = 0;
    MB_REQUIRE(writeBlob(p, sp));
    MB_REQUIRE(p.blobSize == kBlobSize);

    auto got = readBlob(p);
    MB_REQUIRE(got.has_value());
    MB_REQUIRE(got->relayCount == 16);
    MB_REQUIRE(got->relayMask  == 0xA5A5);
}

MB_TEST(switcher_blob_rejects_overflow_mask) {
    Patch p{};
    SwitcherPatchV1 sp{};
    sp.relayCount = 4;
    sp.relayMask  = 0x00F1;  // bit 4..7 set above relayCount=4
    MB_REQUIRE(!writeBlob(p, sp));
}

MB_TEST(switcher_blob_rejects_zero_count) {
    Patch p{};
    SwitcherPatchV1 sp{};
    sp.relayCount = 0;
    MB_REQUIRE(!writeBlob(p, sp));
}

MB_TEST(switcher_blob_rejects_bad_crc) {
    Patch p{};
    SwitcherPatchV1 sp{};
    sp.relayCount = 8;
    sp.relayMask  = 0x0055;
    MB_REQUIRE(writeBlob(p, sp));
    p.blob[6] ^= 0xFF;  // corrupt crc
    MB_REQUIRE(!readBlob(p).has_value());
}

MB_TEST(switcher_blob_rejects_bad_version) {
    Patch p{};
    SwitcherPatchV1 sp{};
    sp.relayCount = 8;
    sp.relayMask  = 0x0055;
    MB_REQUIRE(writeBlob(p, sp));
    p.blob[0] = 2;  // version
    MB_REQUIRE(!readBlob(p).has_value());
}

MB_TEST(switcher_pc_selects_patch_and_emits_relays) {
    PatchBank bank = makeBank();
    SwitcherRouter r{bank};

    InputEvent ev{};
    ev.kind = InputKind::MidiProgramChange;
    ev.data = 2;  // "Lead" → mask 0x000F → 4 relays on, 12 off
    auto res = r.handle(ev, nullptr);

    MB_REQUIRE(bank.activeId().value() == 2);
    // 16 RelaySet + 1 DisplayDirty
    MB_REQUIRE(res.count == 17);

    int onCount = 0;
    int displayDirty = 0;
    for (std::size_t i = 0; i < res.count; ++i) {
        const auto& c = res.commands[i];
        if (c.kind == OutputKind::RelaySet) {
            if (c.payload < 4) MB_REQUIRE(c.data == 1);
            else               MB_REQUIRE(c.data == 0);
            if (c.data == 1) ++onCount;
        } else if (c.kind == OutputKind::DisplayDirty) {
            ++displayDirty;
        }
    }
    MB_REQUIRE(onCount == 4);
    MB_REQUIRE(displayDirty == 1);
}

MB_TEST(switcher_pc_unknown_program_ignored) {
    PatchBank bank = makeBank();
    MB_REQUIRE(bank.setActive(0));
    SwitcherRouter r{bank};

    InputEvent ev{};
    ev.kind = InputKind::MidiProgramChange;
    ev.data = 99;  // not in bank
    auto res = r.handle(ev, nullptr);

    MB_REQUIRE(res.count == 0);
    MB_REQUIRE(bank.activeId().value() == 0);  // unchanged
}

MB_TEST(switcher_footswitch_up_wraps) {
    PatchBank bank = makeBank();
    MB_REQUIRE(bank.setActive(3));  // last
    SwitcherRouter r{bank};

    InputEvent ev{};
    ev.kind    = InputKind::Footswitch;
    ev.payload = 0;   // up
    ev.data    = 1;   // pressed
    auto res = r.handle(ev, nullptr);

    MB_REQUIRE(bank.activeId().value() == 0);  // wrapped to first
    MB_REQUIRE(res.count >= 1);
    // last command should be the synthetic MidiOut PC.
    const auto& last = res.commands[res.count - 1];
    MB_REQUIRE(last.kind == OutputKind::MidiOut);
    MB_REQUIRE(last.payload == 0xC0);
    MB_REQUIRE(last.data == 0);
}

MB_TEST(switcher_footswitch_down_wraps) {
    PatchBank bank = makeBank();
    MB_REQUIRE(bank.setActive(0));
    SwitcherRouter r{bank};

    InputEvent ev{};
    ev.kind    = InputKind::Footswitch;
    ev.payload = 1;   // down
    ev.data    = 1;
    auto res = r.handle(ev, nullptr);

    MB_REQUIRE(bank.activeId().value() == 3);  // wrapped to last
    MB_REQUIRE(res.count >= 1);
}

MB_TEST(switcher_footswitch_release_ignored) {
    PatchBank bank = makeBank();
    MB_REQUIRE(bank.setActive(1));
    SwitcherRouter r{bank};

    InputEvent ev{};
    ev.kind    = InputKind::Footswitch;
    ev.payload = 0;
    ev.data    = 0;  // released
    auto res = r.handle(ev, nullptr);

    MB_REQUIRE(res.count == 0);
    MB_REQUIRE(bank.activeId().value() == 1);
}

MB_TEST(switcher_patchbank_indexof_and_at) {
    PatchBank bank = makeBank();
    MB_REQUIRE(bank.indexOf(0) == 0);
    MB_REQUIRE(bank.indexOf(3) == 3);
    MB_REQUIRE(bank.indexOf(99) == bank.size());
    MB_REQUIRE(bank.at(2) != nullptr);
    MB_REQUIRE(bank.at(2)->id == 2);
    MB_REQUIRE(bank.at(99) == nullptr);
}
