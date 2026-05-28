// ADR 0009 / ADR 0010 — CvBreakout base implementation.
#include "mb/runtime/CvBreakout.h"

#include <algorithm>

namespace mb::runtime {

void CvBreakout::setControl(std::string_view controlId, ControlValue value) {
    // Common rebinding controls. Subclasses delegate to this for anything
    // they do not recognise themselves.
    auto asInt = [&](std::int32_t fallback) -> std::int32_t {
        if (auto* i = std::get_if<std::int32_t>(&value)) return *i;
        if (auto* f = std::get_if<float>(&value))        return static_cast<std::int32_t>(*f);
        return fallback;
    };

    if (controlId == "addr_case") {
        caseId_ = static_cast<std::uint8_t>(std::clamp<std::int32_t>(asInt(0), 0, 255));
        std::fill(dirty_.begin(), dirty_.end(), true);   // resend on next tick
    } else if (controlId == "addr_first_slot") {
        firstSlot_ = static_cast<std::uint8_t>(std::clamp<std::int32_t>(asInt(0), 0, 255));
        std::fill(dirty_.begin(), dirty_.end(), true);
    }
}

}  // namespace mb::runtime
