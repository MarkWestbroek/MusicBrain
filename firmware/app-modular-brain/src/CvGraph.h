#pragma once
/**
 * @file CvGraph.h
 * @brief Discovery + routing layer for CV-domain patch connections.
 *
 * @details
 * Mirrors `AudioGraph` but for the CV side of the project.  After a patch
 * is activated, `CvGraph::build()` walks `patch["connections"]` and keeps
 * only the entries where both endpoints declare a CV-domain `PortKind`
 * (`Cv` or `Gate`).  For each kept entry it caches the source / sink
 * `Module*` pointers and the port ids, so the per-tick bridge can run as
 * a flat loop without any string lookup or map walk.
 *
 * On every CV tick (currently 1 ms polled from `loop()`; promoted to
 * `IntervalTimer` ISR later) `tickBridge()` walks the route list once:
 *   1. read `value = src->readCvPort(srcPort)`
 *   2. if it differs from the previous tick's value, write
 *      `dst->writeCvPort(dstPort, value)` and update the cache.
 *
 * The wrapper modules are responsible for translating the CV value to
 * their internal implementation (audio-rate DC, Teensy library setter,
 * FPGA register, SPI DAC, …).  Patches never see those details.
 *
 * **Thread safety**: `build()` is main-thread only.  `tickBridge()` is
 * lock-free w.r.t. its inputs because the route list is frozen after
 * build and the values it reads/writes are atomic floats.
 */

#include "AudioModule.h"
#include "mb/runtime/CvBus.h"
#include "mb/runtime/Module.h"
#include <ArduinoJson.h>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace mmb_link {

/** @brief Builds and runs the CV-domain routes for a patch. */
class CvGraph {
public:
    /** @brief One resolved CV connection. */
    struct Route {
        mb::runtime::Module* src;
        std::string          srcPort;
        mb::runtime::Module* dst;
        std::string          dstPort;
        float                lastValue;  ///< previously pushed value, for change-detection
        bool                 primed;     ///< false until first tick has run
    };

    /** @brief Rebuild the route list from a patch's `connections` array. */
    void build(
        JsonObjectConst patch,
        const std::unordered_map<std::string,
                                 std::unique_ptr<mb::runtime::Module>>& instances);

    /** @brief Drop all routes. */
    void tearDown();

    /** @brief One CV-bridge pass: read each source, write to each sink
     *  if the value has changed (or this is the first tick).  O(routes). */
    void tickBridge();

    int routedCount() const { return static_cast<int>(routes_.size()); }
    int skippedCount() const { return skipped_; }

private:
    std::vector<Route> routes_;
    int skipped_ = 0;
};

}  // namespace mmb_link
