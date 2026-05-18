// main.cpp — MusicBrain effect-switcher firmware for ESP32.
//
// Responsibilities:
//   • Connect to WiFi (STA mode; the configured creds come from secrets.h).
//   • Mount LittleFS and load the persisted config (schema version 1, same
//     JSON that the React editor produces).
//   • Expose a small REST API on port 80 (see endpoints below).
//   • Drive the relay hardware via the Relays driver (74HC595 chain by default).
//
// REST API
// ────────
//   GET  /api/status                  → { firmware, uptimeMs, freeHeap, wifi }
//   GET  /api/config                  → current SwitcherProject JSON
//   PUT  /api/config   (json body)    → replace + persist config, re-apply patch
//   GET  /api/patch                   → { activePatchId, relayMask, relayCount }
//   POST /api/patch/<id>              → activate patch by id, drive relays
//   POST /api/patch/next              → +1 to current patch index (wraps)
//   POST /api/patch/prev              → -1 to current patch index (wraps)
//
// CORS is wide-open so the editor (running on localhost:5173 in dev) can talk
// to the device directly during a "Connect to device" flow.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <WiFi.h>

#include "patch_engine.h"
#include "relays.h"
#include "storage.h"
#include "midi_effect.h"

#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #warning "secrets.h not found — copy src/secrets.h.example to src/secrets.h and fill in your WiFi creds"
  #define MB_WIFI_SSID     "musicbrain-setup"
  #define MB_WIFI_PASSWORD "musicbrain"
  #define MB_HOSTNAME      "musicbrain"
  #define MB_HTTP_USER     ""
  #define MB_HTTP_PASS     ""
#endif

namespace {

WebServer      server(80);
mb::Storage    storage;
mb::Relays     relays;
mb::MidiEffect midiEffect;

// Active config kept in RAM (parsed). 8 KiB is enough for ~10 effects with
// images stripped (images are NOT shipped to the device — they live only in
// the editor's localStorage / exported JSON).
StaticJsonDocument<8192> activeConfig;
String activeConfigRaw;            // the verbatim JSON, returned by GET /api/config
int    activePatchId = -1;

// ─── Helpers ─────────────────────────────────────────────────────────────

void sendJson(int code, const String& body) {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  server.send(code, "application/json", body);
}

void sendError(int code, const char* msg) {
  StaticJsonDocument<128> d;
  d["error"] = msg;
  String s;  serializeJson(d, s);
  sendJson(code, s);
}

bool authOK() {
  if (strlen(MB_HTTP_USER) == 0) return true;
  if (!server.authenticate(MB_HTTP_USER, MB_HTTP_PASS)) {
    server.requestAuthentication();
    return false;
  }
  return true;
}

void applyActivePatch() {
  const auto r = mb::computePatch(activeConfig, activePatchId);
  if (!r.ok) {
    Serial.printf("[patch] %s\n", r.error ? r.error : "compute failed");
    relays.setMask(0, r.count > 0 ? r.count : 16);
    return;
  }
  activePatchId = r.patchId;
  relays.setMask(r.mask, r.count);
  Serial.printf("[patch] active=%d  mask=0x%08X  count=%u\n", r.patchId, r.mask, r.count);
  midiEffect.sendPatchCC(activePatchId);
}

bool loadConfigFromString(const String& json, const char** errOut) {
  StaticJsonDocument<8192> doc;
  const DeserializationError e = deserializeJson(doc, json);
  if (e) { if (errOut) *errOut = e.c_str(); return false; }
  if (!doc["version"].is<int>() || doc["version"].as<int>() != 1) {
    if (errOut) *errOut = "schema version != 1"; return false;
  }
  activeConfig.clear();
  activeConfig.set(doc);            // copy in
  activeConfigRaw = json;
  activePatchId = activeConfig["activePatchId"].is<int>()
                    ? activeConfig["activePatchId"].as<int>()
                    : -1;
  return true;
}

// ─── Handlers ────────────────────────────────────────────────────────────

void handleStatus() {
  if (!authOK()) return;
  StaticJsonDocument<256> d;
  d["firmware"] = APP_VERSION;
  d["uptimeMs"] = millis();
  d["freeHeap"] = ESP.getFreeHeap();
  JsonObject w = d.createNestedObject("wifi");
  w["ssid"] = WiFi.SSID();
  w["ip"]   = WiFi.localIP().toString();
  w["rssi"] = WiFi.RSSI();
  String s; serializeJson(d, s);
  sendJson(200, s);
}

void handleGetConfig() {
  if (!authOK()) return;
  if (activeConfigRaw.length() == 0) { sendError(404, "no config stored"); return; }
  sendJson(200, activeConfigRaw);
}

void handlePutConfig() {
  if (!authOK()) return;
  const String body = server.arg("plain");
  if (body.length() == 0) { sendError(400, "empty body"); return; }
  const char* err = nullptr;
  if (!loadConfigFromString(body, &err)) { sendError(400, err ? err : "invalid config"); return; }
  if (!storage.writeConfig(body))         { sendError(500, "failed to persist");          return; }
  applyActivePatch();
  sendJson(200, "{\"ok\":true}");
}

void handleGetPatch() {
  if (!authOK()) return;
  StaticJsonDocument<128> d;
  d["activePatchId"] = activePatchId;
  d["relayMask"]     = relays.mask();
  d["relayCount"]    = activeConfig["relayCount"].is<int>() ? activeConfig["relayCount"].as<int>() : 16;
  String s; serializeJson(d, s);
  sendJson(200, s);
}

void handleSetPatch() {
  if (!authOK()) return;
  // URI is /api/patch/<id|next|prev>; WebServer stores it in server.uri().
  const String uri = server.uri();
  const int lastSlash = uri.lastIndexOf('/');
  if (lastSlash < 0) { sendError(400, "missing patch id"); return; }
  const String tail = uri.substring(lastSlash + 1);

  // Resolve current patch ordinal so we can do next/prev.
  const JsonArrayConst patches = activeConfig["patches"].as<JsonArrayConst>();
  if (patches.isNull() || patches.size() == 0) { sendError(400, "no patches"); return; }

  auto findOrdinal = [&patches](int id) -> int {
    int i = 0;
    for (JsonObjectConst p : patches) { if (p["id"].as<int>() == id) return i; ++i; }
    return -1;
  };

  int targetId = -1;
  if (tail == "next" || tail == "prev") {
    const int n   = patches.size();
    const int cur = findOrdinal(activePatchId);
    const int idx = (cur < 0)
        ? 0
        : (tail == "next" ? (cur + 1) % n : (cur - 1 + n) % n);
    targetId = patches[idx]["id"].as<int>();
  } else {
    targetId = tail.toInt();
    if (findOrdinal(targetId) < 0) { sendError(404, "patch id not found"); return; }
  }

  activePatchId = targetId;
  // Reflect the change back into the parsed config so GET /api/config stays in sync.
  activeConfig["activePatchId"] = targetId;
  applyActivePatch();

  StaticJsonDocument<128> d;
  d["activePatchId"] = activePatchId;
  d["relayMask"]     = relays.mask();
  String s; serializeJson(d, s);
  sendJson(200, s);
}

void handleOptions() {
  // CORS preflight catch-all.
  sendJson(204, "");
}

void handleNotFound() {
  sendError(404, "not found");
}

// ─── WiFi bring-up ───────────────────────────────────────────────────────

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(MB_HOSTNAME);
  WiFi.begin(MB_WIFI_SSID, MB_WIFI_PASSWORD);
  Serial.printf("[wifi] connecting to '%s' ", MB_WIFI_SSID);
  const uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20'000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] OK  ip=%s  rssi=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    if (MDNS.begin(MB_HOSTNAME)) {
      MDNS.addService("http", "tcp", 80);
      Serial.printf("[mdns] http://%s.local/\n", MB_HOSTNAME);
    }
  } else {
    Serial.println("[wifi] FAILED — running standalone (no network)");
  }
}

}  // namespace

// ─────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.printf("MusicBrain effect-switcher v%s\n", APP_VERSION);

  relays.begin();
  storage.begin();

  // Try to load a previously-persisted config, otherwise start empty (the
  // editor will push one via PUT /api/config on first use).
  const String json = storage.readConfig();
  if (json.length() > 0) {
    const char* err = nullptr;
    if (loadConfigFromString(json, &err)) {
      Serial.println(F("[config] restored from LittleFS"));
      applyActivePatch();
    } else {
      Serial.printf("[config] persisted file invalid (%s) — ignored\n", err ? err : "?");
    }
  } else {
    Serial.println(F("[config] no stored config — waiting for PUT /api/config"));
  }

  midiEffect.begin(activeConfig, [](int id) {
    activePatchId = id;
    applyActivePatch();
  });

  connectWiFi();

  // Routes
  server.on("/api/status",  HTTP_GET,    handleStatus);
  server.on("/api/config",  HTTP_GET,    handleGetConfig);
  server.on("/api/config",  HTTP_PUT,    handlePutConfig);
  server.on("/api/patch",   HTTP_GET,    handleGetPatch);

  // We register POST under a catch-all-prefix matcher for the dynamic <id|next|prev>.
  // The ESP32 WebServer doesn't do path parameters natively, so we use onNotFound
  // as a router for /api/patch/*.
  server.onNotFound([]() {
    const String& uri = server.uri();
    const HTTPMethod m = server.method();
    if (m == HTTP_OPTIONS) { handleOptions(); return; }
    if (m == HTTP_POST && uri.startsWith("/api/patch/")) { handleSetPatch(); return; }
    handleNotFound();
  });

  server.begin();
  Serial.println(F("[http] listening on :80"));
}

void loop() {
  server.handleClient();
  midiEffect.loop();
}
