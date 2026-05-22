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
    using Factory = std::function<std::unique_ptr<Module>(std::string_view instanceId)>;

    void register_(std::string_view typeId, Factory factory) {
        factories_.emplace(std::string{typeId}, std::move(factory));
    }

    bool has(std::string_view typeId) const {
        return factories_.find(std::string{typeId}) != factories_.end();
    }

    std::unique_ptr<Module> create(std::string_view typeId,
                                   std::string_view instanceId) const {
        auto it = factories_.find(std::string{typeId});
        if (it == factories_.end()) return nullptr;
        return it->second(instanceId);
    }

    static Registry& global() {
        static Registry r;
        return r;
    }

private:
    std::unordered_map<std::string, Factory> factories_;
};

}  // namespace mb::runtime
