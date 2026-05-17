// patch_engine.h — pure logic: given a parsed config + an active patch id,
// produce the relay bitmask. Kept dependency-free so we can unit-test it
// natively later (host build) without dragging in Arduino headers.

#pragma once
#include <ArduinoJson.h>
#include <stdint.h>

namespace mb {

struct PatchResult {
  bool     ok       = false;
  uint32_t mask     = 0;     // bit i set ⇒ relay (i+1) ON
  uint8_t  count    = 16;    // total relays in the system (from config.relayCount)
  int      patchId  = -1;    // resolved active patch id (echoed back for sanity)
  const char* error = nullptr;
};

/// Walk the JSON config and compute the relay bitmask for `patchId`.
/// If `patchId` is negative, the project's `activePatchId` is used.
PatchResult computePatch(const JsonDocument& cfg, int patchId);

}  // namespace mb
