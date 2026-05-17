#include "mb/SwitcherRouter.h"

namespace mb {

namespace {

OutputCommand makeRelay(uint16_t id, bool on) {
    return OutputCommand{OutputKind::RelaySet, 0, id, on ? 1 : 0};
}

OutputCommand makeDisplayDirty() {
    return OutputCommand{OutputKind::DisplayDirty, 0, 0, 0};
}

OutputCommand makeProgramChange(ProgramId id) {
    // Emit a MIDI PC so the application loop (or a chained router) can
    // observe the change uniformly with externally-supplied PCs.
    return OutputCommand{
        OutputKind::MidiOut, 0, 0xC0u,
        static_cast<int32_t>(id) & 0x7F};
}

}  // namespace

RouterResult SwitcherRouter::selectProgram(ProgramId id) {
    RouterResult r{};
    if (!bank_.setActive(id)) return r;  // unknown id → no commands

    const Patch* p = bank_.active();
    if (p == nullptr) return r;

    auto sp = switcher::readBlob(*p);
    if (!sp) {
        // Bad blob: still refresh display so user sees an error state.
        r.commands[r.count++] = makeDisplayDirty();
        return r;
    }

    // Emit one RelaySet per relay so backends that don't bulk-set still work.
    for (uint16_t i = 0; i < sp->relayCount; ++i) {
        if (r.count >= kMaxOutputsPerEvent) break;
        r.commands[r.count++] = makeRelay(i, sp->isRelayOn(static_cast<uint8_t>(i)));
    }
    if (r.count < kMaxOutputsPerEvent) {
        r.commands[r.count++] = makeDisplayDirty();
    }
    return r;
}

RouterResult SwitcherRouter::handle(const InputEvent& ev, const Patch* /*active*/) {
    switch (ev.kind) {
        case InputKind::MidiProgramChange:
            return selectProgram(static_cast<ProgramId>(ev.data & 0xFF));

        case InputKind::Footswitch: {
            if (ev.data != 1) return RouterResult{};   // only on press
            const std::size_t n = bank_.size();
            if (n == 0) return RouterResult{};

            std::size_t idx = bank_.activeId()
                ? bank_.indexOf(*bank_.activeId())
                : n;  // == n means "none", treat as before-first

            const bool up = (ev.payload == 0);
            if (idx >= n) {
                idx = up ? 0 : (n - 1);
            } else if (up) {
                idx = (idx + 1) % n;
            } else {
                idx = (idx == 0) ? (n - 1) : (idx - 1);
            }

            const Patch* next = bank_.at(idx);
            if (next == nullptr) return RouterResult{};

            RouterResult r = selectProgram(next->id);
            // Also surface the synthetic PC for any downstream consumer.
            if (r.count < kMaxOutputsPerEvent) {
                r.commands[r.count++] = makeProgramChange(next->id);
            }
            return r;
        }

        default:
            return RouterResult{};
    }
}

}  // namespace mb
