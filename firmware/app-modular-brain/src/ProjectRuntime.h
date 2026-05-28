/**
 * @file ProjectRuntime.h
 * @brief Live runtime state for a pushed ModularProject.
 *
 * @details
 * When the browser editor pushes a project configuration over the
 * TeensyLink, the firmware needs to:
 *   1. Store the configuration persistently (the JSON source buffer is
 *      reused by the next incoming message).
 *   2. Instantiate a concrete `mb::runtime::Module` object for every
 *      module listed in the project, using the global `Registry`.
 *   3. Know which patch (preset) is currently active so it can later
 *      wire the audio graph accordingly.
 *
 * ProjectRuntime is the single object that owns all of this.  It lives
 * as a global in `main.cpp` and is updated by the TeensyLink callbacks.
 *
 * **Module instantiation:**
 * Each module in the project JSON has a `typeId` (e.g. `"tp_mmb_ahdsr"`).
 * The Registry maps that string to a factory function; calling it produces
 * a heap-allocated `Module` subclass.  Modules whose `typeId` is not in the
 * registry (external Eurorack modules, future types not yet implemented in
 * firmware) are counted as "unknown" and skipped gracefully.
 *
 * **Patch activation:**
 * A project can contain multiple patches (presets).  `activatePatch()`
 * validates the requested patch id, counts how many of its cables connect
 * two known module instances ("wired") versus at least one unknown module
 * ("dangling"), and logs the result.  Actual AudioConnection wiring is the
 * next build step.
 *
 * **Memory:**
 * The project JSON is deep-copied into an owned `JsonDocument`.  Module
 * instances are stored in an `unordered_map<string, unique_ptr<Module>>`.
 * Both are heap-allocated; Teensy 4.1 RAM2 has ~495 KB free for `new`.
 */
#pragma once

#include <ArduinoJson.h>
#include <cstring>
#include <memory>
#include <string>
#include <unordered_map>

#include "mb/runtime/Module.h"
#include "mb/runtime/Registry.h"
#include "TeensyLink.h"

namespace mmb_link {

/** @brief Owns the live runtime state for a pushed ModularProject. */
class ProjectRuntime {
public:
    /** Counts from the last `applyConfig()` call, returned to the caller
     *  so TeensyLink can include them in the `ack` message. */
    struct LoadResult {
        int requested = 0; ///< Total module entries in the project JSON.
        int created   = 0; ///< Modules successfully instantiated via the Registry.
        int unknown   = 0; ///< Modules skipped (typeId not registered or missing id).
    };

    /**
     * @brief Ingest a new project configuration from the editor.
     *
     * Deep-copies @p project into an owned JsonDocument (the source view
     * is backed by TeensyLink's line buffer, which is overwritten on the
     * next incoming message).  Clears any previously instantiated modules,
     * then instantiates every module whose `typeId` is registered in the
     * global Registry.
     *
     * @param project  The `project` sub-object from the incoming config
     *                 message; must remain valid for the duration of this
     *                 call (it is deep-copied internally).
     * @return LoadResult  Counts of requested / created / unknown modules.
     */
    LoadResult applyConfig(JsonObjectConst project) {
        instances_.clear();
        projectDoc_.clear();
        projectDoc_["project"] = project;     // deep copy
        activePatchId_.clear();
        const char* ap = project["activePatchId"] | "";
        if (*ap) activePatchId_ = ap;

        LoadResult r;
        auto& reg = mb::runtime::Registry::global();
        JsonArrayConst mods = project["modules"].as<JsonArrayConst>();
        for (JsonObjectConst m : mods) {
            ++r.requested;
            const char* id     = m["id"]     | "";
            const char* typeId = m["typeId"] | "";
            if (!*id || !*typeId) { ++r.unknown; continue; }
            if (!reg.has(typeId)) {
                ++r.unknown;
                continue;
            }
            auto inst = reg.create(typeId, id);
            if (!inst) { ++r.unknown; continue; }
            instances_.emplace(std::string{id}, std::move(inst));
            ++r.created;
        }
        TeensyLink::logf("runtime: created=%d unknown=%d total=%d active=%s",
                         r.created, r.unknown, r.requested,
                         activePatchId_.empty() ? "(none)" : activePatchId_.c_str());
        return r;
    }

    /**
     * @brief Switch the currently active patch (preset).
     *
     * Scans the stored project JSON for a patch whose `id` matches @p patchId.
     * If found, records it as the active patch and walks all of its connections,
     * counting how many refer to modules that have been instantiated ("wired")
     * versus modules that are missing from the Registry ("dangling").  Both
     * counts are logged via TeensyLink so the editor can display diagnostics.
     *
     * Actual `AudioConnection` wiring is performed in a later build step.
     *
     * @param patchId  Null-terminated patch id string from the `selectPatch` message.
     * @return true  if the patch was found and activated; false otherwise.
     */
    bool activatePatch(const char* patchId) {
        if (!patchId || !*patchId) return false;
        for (JsonObjectConst p : projectDoc_["project"]["patches"].as<JsonArrayConst>()) {
            const char* id = p["id"] | "";
            if (std::strcmp(id, patchId) != 0) continue;
            activePatchId_ = patchId;
            JsonArrayConst conns = p["connections"].as<JsonArrayConst>();
            int wired = 0, dangling = 0;
            for (JsonObjectConst c : conns) {
                const char* srcId = c["from"]["moduleId"] | "";
                const char* dstId = c["to"]["moduleId"]   | "";
                const bool ok = find(srcId) && find(dstId);
                if (ok) ++wired; else ++dangling;
            }
            TeensyLink::logf("active patch=%s connections=%d wired=%d dangling=%d",
                             patchId, static_cast<int>(conns.size()), wired, dangling);
            return true;
        }
        TeensyLink::logf("activatePatch: unknown id %s", patchId);
        return false;
    }

    /** @brief Look up a live module by its project-level @p id.
     *  @return Pointer to the module, or nullptr if no instance with that id exists. */
    mb::runtime::Module* find(const char* id) const {
        auto it = instances_.find(std::string{id});
        return it == instances_.end() ? nullptr : it->second.get();
    }

    /** @brief Number of module instances currently held. */
    std::size_t instanceCount() const { return instances_.size(); }

    /** @brief Id of the most recently activated patch, or empty string if none. */
    const std::string& activePatchId() const { return activePatchId_; }

    /**
     * @brief Read-only access to the live module instances map.
     *
     * Used by `AudioGraph::build()` to resolve module ids to concrete
     * `AudioPortModule` objects.  The returned reference is valid until
     * the next `applyConfig()` call (which rebuilds the map).
     */
    const std::unordered_map<std::string, std::unique_ptr<mb::runtime::Module>>&
    instances() const { return instances_; }

    /**
     * @brief Return the JSON object for the currently active patch.
     *
     * Searches the stored project for a patch whose id matches
     * `activePatchId()`.  Returns an empty (null) `JsonObjectConst` if no
     * patch is active or the stored document is empty.
     *
     * The returned view is valid as long as `projectDoc_` is not cleared
     * (i.e. until the next `applyConfig()` call).
     */
    JsonObjectConst activePatchJson() const {
        if (activePatchId_.empty()) return {};
        for (JsonObjectConst p :
                 projectDoc_["project"]["patches"].as<JsonArrayConst>()) {
            if (std::strcmp(p["id"] | "", activePatchId_.c_str()) == 0)
                return p;
        }
        return {};
    }

private:
    JsonDocument projectDoc_;
    std::unordered_map<std::string, std::unique_ptr<mb::runtime::Module>> instances_;
    std::string  activePatchId_;
};

}  // namespace mmb_link
