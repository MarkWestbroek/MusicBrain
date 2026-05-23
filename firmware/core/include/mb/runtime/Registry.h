#pragma once
// ADR 0009 — runtime-class registry (firmware skeleton).
//
// Maps `typeId` (e.g. "tp_mmb_vcf") to a factory that builds a Module
// instance. Mirrors editor/src/modular-mb/runtime/Registry.ts.
//
// Concrete subclasses self-register at static-init time so adding a new
// module type means dropping in one new .cpp file with one REGISTER_MODULE
// macro call — no changes to the patch loader.
//
// This is the firmware analogue of the TS `registry` singleton. Tests are
// expected to construct an isolated `Registry` rather than mutate the
// global one.

#include "Module.h"
#include <functional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <memory>

namespace mb::runtime {

class Registry {
public:
    // Factories take an instance id (assigned by the patch) and return an
    // owning pointer to a fresh `Module`. Returning by `unique_ptr` keeps
    // ownership unambiguous and removes any need for a virtual dtor dance.
    using Factory = std::function<std::unique_ptr<Module>(std::string_view instanceId)>;

    // Register a factory. If a factory for `typeId` is already present
    // it is overwritten silently — callers (typically `Foo::registerFactory`)
    // are expected to be idempotent.
    void register_(std::string_view typeId, Factory factory) {
        factories_.emplace(std::string{typeId}, std::move(factory));
    }

    // True if a factory is registered for `typeId`. The patch loader uses
    // this to skip ExternalModule-only catalog entries gracefully.
    bool has(std::string_view typeId) const {
        return factories_.find(std::string{typeId}) != factories_.end();
    }

    // Construct a fresh instance. Returns nullptr when no factory exists
    // for `typeId` — the caller must handle that case (the patch loader
    // logs a warning and falls back to an ExternalModule placeholder).
    std::unique_ptr<Module> create(std::string_view typeId,
                                   std::string_view instanceId) const {
        auto it = factories_.find(std::string{typeId});
        if (it == factories_.end()) return nullptr;
        return it->second(instanceId);
    }

    // Global singleton used by the production code path. Tests should
    // construct their own `Registry` to avoid leaking state between cases.
    static Registry& global() {
        static Registry r;
        return r;
    }

private:
    std::unordered_map<std::string, Factory> factories_;
};

}  // namespace mb::runtime
