#include "mb/Router.h"

namespace mb {

RouterResult NullRouter::handle(const InputEvent& ev, const Patch* /*active*/) {
    RouterResult r;
    if (ev.kind == InputKind::MidiProgramChange) {
        r.commands[r.count++] = OutputCommand{OutputKind::DisplayDirty, 0, 0, 0};
    }
    return r;
}

}  // namespace mb
