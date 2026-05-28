#pragma once
/**
 * @file Registry.h
 * @brief Global factory registry that maps module type-ids to constructors.
 *
 * @details
 * At startup the firmware does not know which module types the editor will
 * push in a project.  The Registry decouples the project loader
 * (ProjectRuntime) from the concrete module classes by storing a map of
 * `typeId → Factory` entries.
 *
 * **Self-registration pattern:**
 * Each concrete module class provides a static `registerFactory()` method
 * that inserts its own factory into `Registry::global()`.  Those methods
 * are called once at startup by `registerAllRuntimeModules()`.  Adding a
 * new module type therefore only requires one extra `.h`/`.cpp` pair and
 * one line in `RegisterAllModules.h` — no other files change.
 *
 * **Mirrors the editor:**
 * This class is the C++ equivalent of
 * `editor/src/modular-mb/runtime/Registry.ts`.  Both follow the same
 * typeId convention (e.g. `"tp_mmb_ahdsr"`).
 *
 * **Testing:**
 * Unit tests should construct their own local `Registry` instance rather
 * than mutating `global()`, to keep test cases isolated.
 */

#include "Module.h"
#include <functional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <memory>

namespace mb::runtime {

/** @brief Global factory registry — maps typeId strings to Module constructors. */
class Registry {
public:
    /**
     * @brief A callable that produces a new Module instance.
     * Receives the project-level instance id; returns an owning pointer.
     */
    using Factory = std::function<std::unique_ptr<Module>(std::string_view instanceId)>;

    /**
     * @brief Register (or overwrite) a factory for the given @p typeId.
     *
     * Uses insert-or-assign semantics: if a factory for @p typeId already
     * exists it is replaced.  This means that registration order matters —
     * the **last** call for a given typeId wins.  In practice this allows
     * app-level modules (registered in `registerAllRuntimeModules()`) to
     * override default factories that were registered by static initialisers
     * in core library translation units.
     */
    void register_(std::string_view typeId, Factory factory) {
        factories_.insert_or_assign(std::string{typeId}, std::move(factory));
    }

    /** @brief Return true if a factory is registered for @p typeId.  Used by
     *  ProjectRuntime to skip module types that are not implemented in
     *  firmware (e.g. external Eurorack modules). */
    bool has(std::string_view typeId) const {
        return factories_.find(std::string{typeId}) != factories_.end();
    }

    /**
     * @brief Construct a fresh Module of the given type.
     * @param typeId      Module-type catalog id.
     * @param instanceId  Project-level instance id (e.g. `"vco1"`).
     * @return Owning pointer to the new instance, or nullptr if @p typeId
     *         has no registered factory.
     */
    std::unique_ptr<Module> create(std::string_view typeId,
                                   std::string_view instanceId) const {
        auto it = factories_.find(std::string{typeId});
        if (it == factories_.end()) return nullptr;
        return it->second(instanceId);
    }

    /**
     * @brief The process-wide singleton used by production code.
     * Unit tests should use a local Registry instance to stay isolated.
     */
    static Registry& global() {
        static Registry r;
        return r;
    }

private:
    std::unordered_map<std::string, Factory> factories_;
};

}  // namespace mb::runtime
