#include "test_harness.h"
#include "mb/Router.h"

MB_TEST(null_router_emits_display_dirty_on_program_change) {
    mb::NullRouter r;
    mb::InputEvent ev{mb::InputKind::MidiProgramChange, 0, 0, 0};
    auto out = r.handle(ev, nullptr);
    MB_REQUIRE(out.count == 1);
    MB_REQUIRE(out.commands[0].kind == mb::OutputKind::DisplayDirty);
}

MB_TEST(null_router_ignores_other_events) {
    mb::NullRouter r;
    mb::InputEvent ev{mb::InputKind::MidiNoteOn, 0, 60, 100};
    auto out = r.handle(ev, nullptr);
    MB_REQUIRE(out.count == 0);
}
