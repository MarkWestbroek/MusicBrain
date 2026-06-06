// storage.h — LittleFS-backed config persistence for RP2040.
//
// We keep the JSON exactly as the editor produced it (schema `version: 1`).
// That way you can:
//   1. download what's on the device via `GET /api/config`
//   2. edit it in the React app
//   3. push it back via `PUT /api/config`
// without any lossy translation in the middle.

#pragma once
#include <Arduino.h>

namespace mb {

class Storage {
 public:
  /// Mount LittleFS (auto-formatted on first boot).
  bool begin();

  /// Returns the raw JSON of the stored config, or "" if no config exists yet.
  String readConfig() const;

  /// Replaces the on-disk config with `json`. Atomic-ish: writes to .tmp then renames.
  bool writeConfig(const String& json);

 private:
  static constexpr const char* kPath    = "/config.json";
  static constexpr const char* kTmpPath = "/config.json.tmp";
};

}  // namespace mb
