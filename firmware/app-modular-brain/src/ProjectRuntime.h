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
#include <string_view>
#include <unordered_map>
#include <vector>

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
        // ── Teensy AudioStream lifetime hazard ────────────────────────────
        // Every audio module composes one or more `AudioStream` objects. The
        // Teensy core's `AudioStream` ctor links itself into a *global*
        // `first_update` list but the class declares **no destructor that
        // unlinks** it. Destroying a live audio module therefore leaves a
        // dangling pointer that the audio ISR walks every 128 samples → hard
        // fault (`DACCVIOL`, garbage address). The old `instances_.clear()`
        // here did exactly that on every re-push → the "device has been lost"
        // crashes.
        //
        // Fix: **reconcile** instead of clear+recreate. Reuse every instance
        // whose `id`+`typeId` is unchanged (no AudioStream churn), create only
        // genuinely new modules, and *retire* (keep alive forever, never free)
        // modules that vanished from the new config. Retired modules are
        // disconnected by the next graph rebuild, so they stay silent and cost
        // only a tiny idle update; a power-cycle clears the pool.
        projectDoc_.clear();
        projectDoc_["project"] = project;     // deep copy
        activePatchId_.clear();
        const char* ap = project["activePatchId"] | "";
        if (*ap) activePatchId_ = ap;

        LoadResult r;
        auto& reg = mb::runtime::Registry::global();
        std::unordered_map<std::string, std::unique_ptr<mb::runtime::Module>> next;
        JsonArrayConst mods = project["modules"].as<JsonArrayConst>();
        for (JsonObjectConst m : mods) {
            ++r.requested;
            const char* id     = m["id"]     | "";
            const char* typeId = m["typeId"] | "";
            if (!*id || !*typeId) { ++r.unknown; continue; }
            // Reuse an unchanged instance — keeps its AudioStream out of the
            // destroy path. Control state is re-applied on patch activation.
            auto it = instances_.find(std::string{id});
            if (it != instances_.end() && it->second &&
                it->second->typeId() == std::string_view{typeId}) {
                next.emplace(it->first, std::move(it->second));
                instances_.erase(it);
                ++r.created;
                continue;
            }
            if (!reg.has(typeId)) { ++r.unknown; continue; }
            auto inst = reg.create(typeId, id);
            if (!inst) { ++r.unknown; continue; }
            next.emplace(std::string{id}, std::move(inst));
            ++r.created;
        }
        // Whatever is still in instances_ disappeared from the new config and
        // cannot be safely destroyed — retire it (kept alive, silent).
        for (auto& kv : instances_) {
            if (kv.second) retired_.push_back(std::move(kv.second));
        }
        instances_ = std::move(next);

        TeensyLink::logf("runtime: created=%d unknown=%d total=%d retired=%d active=%s",
                         r.created, r.unknown, r.requested,
                         static_cast<int>(retired_.size()),
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
            const int applied = applyControlState(p);
            TeensyLink::logf("active patch=%s connections=%d wired=%d dangling=%d controls=%d",
                             patchId, static_cast<int>(conns.size()), wired, dangling, applied);
            return true;
        }
        TeensyLink::logf("activatePatch: unknown id %s", patchId);
        return false;
    }

    /**
     * @brief Push every key/value in `patch.controlState[moduleId]` into the
     *        matching module instance via `setControl()`.
     *
     * The patch JSON schema is:
     *   patch.controlState = { moduleId: { controlId: value, ... }, ... }
     * Values may be float, int (long), or bool.
     *
     * @return Number of `setControl()` calls that actually fired.
     */
    int applyControlState(JsonObjectConst patch) {
        JsonObjectConst cs = patch["controlState"].as<JsonObjectConst>();
        if (cs.isNull()) return 0;
        int n = 0;
        for (JsonPairConst modPair : cs) {
            auto* mod = find(modPair.key().c_str());
            if (!mod) continue;
            JsonObjectConst ctrls = modPair.value().as<JsonObjectConst>();
            if (ctrls.isNull()) continue;
            for (JsonPairConst kv : ctrls) {
                JsonVariantConst v = kv.value();
                if      (v.is<bool>())  mod->setControl(kv.key().c_str(), v.as<bool>());
                else if (v.is<long>())  mod->setControl(kv.key().c_str(),
                                            static_cast<std::int32_t>(v.as<long>()));
                else if (v.is<float>()) mod->setControl(kv.key().c_str(), v.as<float>());
                else continue;
                ++n;
            }
        }
        return n;
    }

    /** @brief Look up a live module by its project-level @p id.
     *  @return Pointer to the module, or nullptr if no instance with that id exists. */
    mb::runtime::Module* find(const char* id) const {
        auto it = instances_.find(std::string{id});
        return it == instances_.end() ? nullptr : it->second.get();
    }

    /**
     * @brief Live control-sync (FW-LIVE-1): apply one control to one module
     *        instantly *and* persist it into the active patch's controlState.
     *
     * Persisting means a later full `push config` with identical cabling is a
     * no-op for this control — the device already holds the value, and a patch
     * re-activation (`activatePatch`) re-applies the same number.  Only the
     * stored value changes; no graph rebuild is triggered.
     *
     * @param moduleId   Target module id.
     * @param controlId  Control id on that module.
     * @param value      Scalar value (bool / long / float).
     * @return true if the module exists and the control was applied.
     */
    bool pokeControl(const char* moduleId, const char* controlId,
                     JsonVariantConst value) {
        auto* mod = find(moduleId);
        if (!mod) return false;
        if      (value.is<bool>())  mod->setControl(controlId, value.as<bool>());
        else if (value.is<long>())  mod->setControl(controlId,
                                        static_cast<std::int32_t>(value.as<long>()));
        else if (value.is<float>()) mod->setControl(controlId, value.as<float>());
        else return false;
        persistControl(moduleId, controlId, value);
        return true;
    }

    /**
     * @brief FW-CS-1: pokeControl-variant voor de MIDI-controlmap.
     *
     * De CC-handler heeft alleen een kant-en-klare float (geschaald door
     * `MidiMap::scale()`), geen JsonVariant — zelfde toepassen + persisteren
     * als de JSON-variant hierboven.
     */
    bool pokeControl(const char* moduleId, const char* controlId, float value) {
        auto* mod = find(moduleId);
        if (!mod) return false;
        mod->setControl(controlId, value);
        persistControl(moduleId, controlId, value);
        return true;
    }

    /** @brief FW-CS-1: int-variant voor integer-controls (step-gekwantiseerd,
     *  bv. DX7 bank/program) — modules die alleen int32 verstaan blijven werken. */
    bool pokeControl(const char* moduleId, const char* controlId,
                     std::int32_t value) {
        auto* mod = find(moduleId);
        if (!mod) return false;
        mod->setControl(controlId, value);
        persistControl(moduleId, controlId, value);
        return true;
    }

    /**
     * @brief Bulk-waveform push (FW-AU-6): hand a single-cycle table to a
     *        draw-waveshape oscillator.  RTTI-free via `setWaveformData()`.
     * @return true if the module exists and accepted the table.
     */
    bool setWaveform(const char* moduleId, const std::int16_t* data,
                     std::size_t count) {
        auto* mod = find(moduleId);
        if (!mod) return false;
        return mod->setWaveformData(data, count);
    }

    /** @brief Number of module instances currently held. */
    std::size_t instanceCount() const { return instances_.size(); }

    /** @brief Number of retired (never-freed) modules from earlier configs.
     *  Groeit bij elke re-push met gewijzigde module-ids; alleen een
     *  power-cycle leegt de pool. Gerapporteerd in het status-bericht. */
    std::size_t retiredCount() const { return retired_.size(); }

    /** @brief Id of the most recently activated patch, or empty string if none. */
    const std::string& activePatchId() const { return activePatchId_; }

    /**
     * @brief Read-only access to the live module instances map.
     *
     * Used by `AudioGraph::build()` to resolve module ids to concrete
     * `AudioModule` objects.  The returned reference is valid until
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
    /**
     * @brief Persist a single control value into the active patch's
     *        controlState (FW-LIVE-1).  Creates the controlState / module
     *        sub-objects on demand.  std::string keys force ArduinoJson to
     *        copy them into the document (the source key buffer is transient).
     *        Templated zodat zowel JsonVariantConst als een kale float
     *        (FW-CS-1) dezelfde route nemen.
     */
    template <typename T>
    void persistControl(const char* moduleId, const char* controlId,
                        const T& value) {
        if (activePatchId_.empty()) return;
        JsonObject project = projectDoc_["project"];
        for (JsonObject p : project["patches"].as<JsonArray>()) {
            if (std::strcmp(p["id"] | "", activePatchId_.c_str()) != 0) continue;
            JsonObject cs = p["controlState"].is<JsonObject>()
                ? p["controlState"].as<JsonObject>()
                : p["controlState"].to<JsonObject>();
            JsonObject mod = cs[std::string{moduleId}].is<JsonObject>()
                ? cs[std::string{moduleId}].as<JsonObject>()
                : cs[std::string{moduleId}].to<JsonObject>();
            mod[std::string{controlId}] = value;  // value deep-copied
            return;
        }
    }

    JsonDocument projectDoc_;
    std::unordered_map<std::string, std::unique_ptr<mb::runtime::Module>> instances_;
    /** Modules dropped by a re-config. Kept alive (never destroyed) because
     *  their AudioStream members cannot be safely removed from the Teensy
     *  audio update list while the engine runs. See applyConfig(). */
    std::vector<std::unique_ptr<mb::runtime::Module>> retired_;
    std::string  activePatchId_;
};

}  // namespace mmb_link
