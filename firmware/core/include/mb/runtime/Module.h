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

#include "../Types.h"
#include <cstdint>
#include <string>
#include <string_view>
#include <variant>

namespace mb::runtime {

// ControlValue mirrors the TS layer-2 union. Kept narrow so it fits in a
// register-sized variant; richer types come later (ADR 0009 open question).
using ControlValue = std::variant<float, bool, int32_t>;

class Module {
public:
    // The base ctor stores both ids by value. Callers may pass in temporaries
    // (e.g. `std::string_view` of a literal); copying into `std::string`
    // guarantees the strings outlive the lambda factories that construct us.
    Module(std::string_view typeId, std::string_view id)
        : typeId_(typeId), id_(id) {}
    virtual ~Module() = default;

    // Instance id assigned by the patch (e.g. "vco1"). Unique within a
    // single patch. Safe to use as a map key for the runtime instance list.
    std::string_view id()     const { return id_; }

    // Module-type id from the catalog (e.g. "tp_mmb_ahdsr"). Constant for
    // the lifetime of the instance — the registry looks up by this id.
    std::string_view typeId() const { return typeId_; }

    // Live-edit hook used by the registry / patch system. Called from the
    // main thread when a layer-2 control changes value. Implementations
    // must be cheap (this is on the UI thread) and may NOT block. Unknown
    // control ids must be silently ignored so older patches keep loading
    // against newer firmware.
    virtual void setControl(std::string_view controlId, ControlValue value) = 0;

protected:
    std::string typeId_;
    std::string id_;
};

}  // namespace mb::runtime
