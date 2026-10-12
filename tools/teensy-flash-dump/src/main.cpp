// Flash-dump voor Teensy 4.1: stuurt het LittleFS_Program-gebied als hex over
// USB-serieel. Leest alleen (memory-mapped flash op 0x60000000); koppelt het
// bestandssysteem NIET (LittleFS::begin formatteert bij een mislukte mount) en
// schrijft niets.
//
// Commando's (regel + \n):
//   info               → gebied en grootte
//   dump               → "BEGIN <adres> <lengte>", regels "<offset> <hex 64 bytes>", "END <som>"
//
// Het gebied: zoals LittleFS_Program::begin(1 MB) op een Teensy 4.1 —
// 0x60000000 + 0x7C0000 − 0x100000 = 0x606C0000.
#include <Arduino.h>

static constexpr uint32_t kBase = 0x60000000u + 0x7C0000u - 0x100000u;
static constexpr uint32_t kLen = 0x100000u;

static void dump() {
  const uint8_t* p = reinterpret_cast<const uint8_t*>(kBase);
  uint32_t sum = 0;
  Serial.printf("BEGIN %08lX %lu\n", (unsigned long)kBase, (unsigned long)kLen);
  char line[16 + 64 * 2 + 4];
  static const char hex[] = "0123456789abcdef";
  for (uint32_t off = 0; off < kLen; off += 64) {
    int n = snprintf(line, sizeof(line), "%06lX ", (unsigned long)off);
    for (int i = 0; i < 64; ++i) {
      const uint8_t b = p[off + i];
      sum += b;
      line[n++] = hex[b >> 4];
      line[n++] = hex[b & 15];
    }
    line[n++] = '\n';
    Serial.write(line, n);
  }
  Serial.printf("END %lu\n", (unsigned long)sum);
  Serial.flush();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  static char buf[32];
  static int pos = 0;
  digitalWriteFast(LED_BUILTIN, (millis() / 500) & 1);
  while (Serial.available()) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      buf[pos] = 0;
      if (strcmp(buf, "dump") == 0) dump();
      else if (strcmp(buf, "info") == 0) Serial.printf("flash-dump: %08lX, %lu bytes\n", (unsigned long)kBase, (unsigned long)kLen);
      pos = 0;
    } else if (pos < (int)sizeof(buf) - 1) {
      buf[pos++] = c;
    }
  }
}
