#include "storage.h"
#include "hal/mcu.h"

#include <LittleFS.h>

namespace mb {

bool Storage::begin() {
  // RP2040 LittleFS: begin() zonder parameters
  // De filesystem grootte wordt bepaald door platformio.ini (board_build.filesystem_size)
  if (!LittleFS.begin()) {
    Serial.println(F("[storage] LittleFS mount failed"));
    return false;
  }
  Serial.println(F("[storage] LittleFS mounted"));
  return true;
}

String Storage::readConfig() const {
  if (!LittleFS.exists(kPath)) return String();
  File f = LittleFS.open(kPath, "r");
  if (!f) return String();
  String s = f.readString();
  f.close();
  return s;
}

bool Storage::writeConfig(const String& json) {
  // Write to a temp file first, then atomically rename. This avoids leaving a
  // half-written config behind if power is yanked mid-write.
  File f = LittleFS.open(kTmpPath, "w");
  if (!f) return false;
  const size_t written = f.print(json);
  f.close();
  if (written != json.length()) {
    LittleFS.remove(kTmpPath);
    return false;
  }
  if (LittleFS.exists(kPath)) LittleFS.remove(kPath);
  return LittleFS.rename(kTmpPath, kPath);
}

}  // namespace mb
