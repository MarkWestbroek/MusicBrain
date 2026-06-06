#include "patch_engine.h"
#include <string.h>

namespace mb {

PatchResult computePatch(const JsonDocument& cfg, int patchId) {
  PatchResult r;
  if (cfg.isNull() || !cfg["version"].is<int>() || cfg["version"].as<int>() != 1) {
    r.error = "config schema version != 1";
    return r;
  }

  r.count = cfg["relayCount"].is<int>() ? cfg["relayCount"].as<int>() : 16;
  if (r.count == 0 || r.count > 32) { r.error = "relayCount out of range (1..32)"; return r; }

  const int resolved = patchId >= 0
      ? patchId
      : (cfg["activePatchId"].is<int>() ? cfg["activePatchId"].as<int>() : -1);
  r.patchId = resolved;
  if (resolved < 0) { r.error = "no active patch"; return r; }

  const JsonArrayConst patches = cfg["patches"].as<JsonArrayConst>();
  const JsonArrayConst devices = cfg["devices"].as<JsonArrayConst>();
  if (patches.isNull() || devices.isNull()) { r.error = "missing patches/devices arrays"; return r; }

  // Locate the requested patch.
  JsonObjectConst patch;
  for (JsonObjectConst p : patches) {
    if (p["id"].is<int>() && p["id"].as<int>() == resolved) { patch = p; break; }
  }
  if (patch.isNull()) { r.error = "patch id not found"; return r; }

  // The editor stores BYPASSED devices (devices whose relay should stay OFF).
  // So a device is active iff it has a valid relayIndex AND is not in the
  // patch's `bypassed` list. This mirrors editor/src/effect-switcher/types.ts.
  const JsonArrayConst bypassed = patch["bypassed"].as<JsonArrayConst>();

  auto isBypassed = [&bypassed](const char* deviceId) -> bool {
    if (bypassed.isNull() || !deviceId) return false;
    for (JsonVariantConst v : bypassed) {
      const char* s = v.as<const char*>();
      if (s && strcmp(s, deviceId) == 0) return true;
    }
    return false;
  };

  for (JsonObjectConst d : devices) {
    if (!d["relayIndex"].is<int>()) continue;
    const int idx = d["relayIndex"].as<int>();     // 0-based; -1 = unassigned
    if (idx < 0 || idx >= static_cast<int>(r.count)) continue;
    const char* did = d["id"].as<const char*>();
    if (isBypassed(did)) continue;
    r.mask |= (1u << idx);
  }

  r.ok = true;
  return r;
}

}  // namespace mb
