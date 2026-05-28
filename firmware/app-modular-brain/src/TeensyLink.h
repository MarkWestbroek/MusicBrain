// Editor ↔ Teensy link over USB Serial.
//
// Protocol (mmb-config.v1, see doc/sketches/polyphony-rack-patcher-ui.md §6.5):
//   newline-terminated UTF-8 JSON lines, 115200 baud, USB-Serial.
//
//   From editor (host) → Teensy:
//     {"type":"hello"}                        request hello reply
//     {"type":"config","project":{...}}       full ModularProject push
//     {"type":"selectPatch","patchId":"..."}  switch active patch
//
//   From Teensy → editor:
//     {"type":"hello","fw":"mmb-teensy-1","step":2}
//     {"type":"ack","ok":true,"applied":"config","modules":N,"patches":M}
//     {"type":"ack","ok":false,"err":"..."}
//     {"type":"log","msg":"..."}
//
// This first slice only acks; module instantiation comes in B-step 3+.

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

namespace mmb_link {

// Max line buffer. The runtime-only ModularProject payload (no categories/
// moduleTypes) is typically 5-15 KB. We pre-allocate in BSS so there is no
// heap fragmentation risk. Teensy 4.1 RAM1 has ~370 KB free for globals.
inline constexpr size_t kLineMax = 48 * 1024;

class TeensyLink {
public:
    using ConfigHandler      = void (*)(JsonObjectConst project);
    using SelectPatchHandler = void (*)(const char* patchId);

    void begin(ConfigHandler onConfig, SelectPatchHandler onSelectPatch) {
        onConfig_      = onConfig;
        onSelectPatch_ = onSelectPatch;
        bufLen_ = 0;
        sendHello();
    }

    // Call from loop().
    void poll() {
        while (Serial.available() > 0) {
            const int c = Serial.read();
            if (c < 0) break;
            if (c == '\n') {
                handleLine();
                bufLen_ = 0;
            } else if (c != '\r') {
                if (bufLen_ < kLineMax - 1) buf_[bufLen_++] = static_cast<char>(c);
                // else: overflow — silently drop until next \n (shouldn't happen
                // after the editor strips categories/moduleTypes from the payload).
            }
        }
    }

    static void log(const char* msg) {
        JsonDocument doc;
        doc["type"] = "log";
        doc["msg"]  = msg;
        serializeJson(doc, Serial);
        Serial.println();
    }

    static void logf(const char* fmt, ...) {
        char tmp[200];
        va_list ap; va_start(ap, fmt);
        vsnprintf(tmp, sizeof(tmp), fmt, ap);
        va_end(ap);
        log(tmp);
    }

private:
    char   buf_[kLineMax];
    size_t bufLen_ = 0;
    ConfigHandler      onConfig_      = nullptr;
    SelectPatchHandler onSelectPatch_ = nullptr;

    void sendHello() {
        JsonDocument doc;
        doc["type"] = "hello";
        doc["fw"]   = "mmb-teensy-1";
        doc["step"] = 2;
        serializeJson(doc, Serial);
        Serial.println();
    }

    void sendAckOk(const char* applied, JsonDocument& extra) {
        JsonDocument doc;
        doc["type"]    = "ack";
        doc["ok"]      = true;
        doc["applied"] = applied;
        for (JsonPair kv : extra.as<JsonObject>()) doc[kv.key()] = kv.value();
        serializeJson(doc, Serial);
        Serial.println();
    }

    void sendAckErr(const char* err) {
        JsonDocument doc;
        doc["type"] = "ack";
        doc["ok"]   = false;
        doc["err"]  = err;
        serializeJson(doc, Serial);
        Serial.println();
    }

    void handleLine() {
        if (bufLen_ == 0) return;
        buf_[bufLen_] = '\0';
        JsonDocument doc;
        const DeserializationError err = deserializeJson(doc, buf_, bufLen_);
        if (err) {
            char tmp[64];
            snprintf(tmp, sizeof(tmp), "parse: %s", err.c_str());
            sendAckErr(tmp);
            return;
        }
        const char* type = doc["type"] | "";
        if (strcmp(type, "hello") == 0) {
            sendHello();
            return;
        }
        if (strcmp(type, "config") == 0) {
            JsonObjectConst project = doc["project"].as<JsonObjectConst>();
            if (project.isNull()) { sendAckErr("config: missing project"); return; }
            const int modules = project["modules"].is<JsonArrayConst>()
                ? static_cast<int>(project["modules"].as<JsonArrayConst>().size()) : 0;
            const int patches = project["patches"].is<JsonArrayConst>()
                ? static_cast<int>(project["patches"].as<JsonArrayConst>().size()) : 0;
            const int racks   = project["racks"].is<JsonArrayConst>()
                ? static_cast<int>(project["racks"].as<JsonArrayConst>().size()) : 0;
            if (onConfig_) onConfig_(project);
            JsonDocument extra;
            extra["modules"] = modules;
            extra["patches"] = patches;
            extra["racks"]   = racks;
            sendAckOk("config", extra);
            return;
        }
        if (strcmp(type, "selectPatch") == 0) {
            const char* patchId = doc["patchId"] | "";
            if (!patchId || !*patchId) { sendAckErr("selectPatch: missing patchId"); return; }
            if (onSelectPatch_) onSelectPatch_(patchId);
            JsonDocument extra;
            extra["patchId"] = patchId;
            sendAckOk("selectPatch", extra);
            return;
        }
        sendAckErr("unknown type");
    }
};

}  // namespace mmb_link
