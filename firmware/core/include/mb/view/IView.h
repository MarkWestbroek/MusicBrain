#pragma once
// ADR 0009 — view layer for the on-device display (skeleton).
//
// Mirrors the role of editor/src/modular-mb/view/ in the web editor: a
// stateless renderer that reads from layer-2 patch state and (optionally)
// layer-3 runtime instances for live meters. On the device this typically
// targets an OLED, e.g. `VcoOledView`, `PatchStatusView`.
//
// Concrete view classes live in this directory; the interface is kept
// minimal so a view can be implemented against any framebuffer abstraction
// (`IDisplay` from mb/IDisplay.h or a future block-based renderer).

#include "../IDisplay.h"

namespace mb::view {

class IView {
public:
    virtual ~IView() = default;
    // Render this view onto the given display. Implementations should be
    // pure (no patch state mutation) so layout can be re-driven by the
    // UI tick without coupling to the timer ISR.
    virtual void render(IDisplay& display) = 0;
};

}  // namespace mb::view
