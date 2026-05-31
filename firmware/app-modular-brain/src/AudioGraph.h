#pragma once
/**
 * @file AudioGraph.h
 * @brief Dynamic audio graph builder from a patch's connection list.
 *
 * @details
 * When a patch is activated, `AudioGraph::build()` iterates every entry in
 * the `connections` array of the patch JSON.  For each connection where both
 * the source module and the destination module are `AudioModule`
 * instances **and** both report a valid audio port for their respective port
 * ids, `AudioGraph` creates one `AudioConnection` and stores it in an owned
 * `vector`.
 *
 * Connections that cannot be mapped to audio (e.g. CV-to-CV, gate-to-gate,
 * or connections that reference an uninstantiated or non-audio module) are
 * silently skipped and counted in `skippedCount()`.
 *
 * **Lifetime:** `AudioConnection` registers itself with the Teensy Audio
 * system in its constructor and deregisters in its destructor.  Calling
 * `tearDown()` (or calling `build()` again) destroys all owned connections,
 * safely tearing down the previous audio graph.
 *
 * **Thread safety:** `build()` and `tearDown()` wrap graph mutations in
 * `AudioNoInterrupts()` / `AudioInterrupts()`.
 */

#include "AudioModule.h"
#include <ArduinoJson.h>
#include <Audio.h>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "mb/runtime/Module.h"

namespace mmb_link {

/** @brief Builds and owns the dynamic `AudioConnection` objects for one patch. */
class AudioGraph {
public:
    /**
     * @brief Tear down the previous graph then build a new one from the patch JSON.
     *
     * Iterates `patch["connections"]` and creates one `AudioConnection` for
     * every entry where both endpoints resolve to a valid `AudioPort`.
     * Non-audio connections (CV–CV, gate, missing modules) are skipped.
     *
     * @param patch      The active patch JSON object (must have a `connections` array).
     * @param instances  Live module instances from `ProjectRuntime::instances()`.
     */
    void build(
        JsonObjectConst patch,
        const std::unordered_map<std::string,
                                 std::unique_ptr<mb::runtime::Module>>& instances);

    /** @brief Destroy all active `AudioConnection` objects. */
    void tearDown();

    /** @brief Number of `AudioConnection` objects currently active. */
    int wiredCount()   const { return wired_; }

    /** @brief Number of patch connections skipped (non-audio or unresolved). */
    int skippedCount() const { return skipped_; }

private:
    std::vector<std::unique_ptr<AudioConnection>> conns_;
    int wired_   = 0;
    int skipped_ = 0;
};

}  // namespace mmb_link
