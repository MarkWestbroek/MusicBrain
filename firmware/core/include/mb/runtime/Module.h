#pragma once
// ADR 0009 — module runtime classes (firmware side, skeleton only).
//
// Mirrors editor/src/modular-mb/runtime/Module.ts. This header declares the
// abstract `Module` base class with the same shape as the TypeScript runtime;
// concrete subclasses live alongside it (`CvModule.h`, `AudioModule.h`,
// `ExternalModule.h`).
//
// Implementation is deferred — these headers exist so the firmware namespace
// matches the editor and ADR vocabulary, and so follow-up commits can fill
// in subclasses incrementally without changing call sites.

#include "Types.h"
#include <cstdint>
#include <string_view>
#include <variant>

namespace mb::runtime {

// ControlValue mirrors the TS layer-2 union. Kept narrow so it fits in a
// register-sized variant; richer types come later (ADR 0009 open question).
using ControlValue = std::variant<float, bool, int32_t>;

class Module {
public:
    Module(std::string_view typeId, std::string_view id)
        : typeId_(typeId), id_(id) {}
    virtual ~Module() = default;

    std::string_view id()     const { return id_; }
    std::string_view typeId() const { return typeId_; }

    // Live-edit hook used by the registry / patch system.
    virtual void setControl(std::string_view controlId, ControlValue value) = 0;

protected:
    std::string_view typeId_;
    std::string_view id_;
};

}  // namespace mb::runtime
