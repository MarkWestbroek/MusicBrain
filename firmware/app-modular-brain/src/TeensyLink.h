/**
 * @file TeensyLink.h
 * @brief USB-Serial JSON protocol bridge between the browser editor and the
 *        Teensy firmware (mmb-config.v1).
 *
 * @details
 * The MusicBrain editor runs in the browser and communicates with the Teensy
 * over USB using the Web Serial API (Chrome/Edge only). Both sides exchange
 * newline-terminated UTF-8 JSON messages at 115 200 baud.
 *
 * **Message flow:**
 *
 * Editor → Teensy:
 * - `{"type":"hello"}` — request a handshake reply (editor sends this on
 *   connect so it can learn the firmware version even if it missed the
 *   boot-time hello).
 * - `{"type":"config","project":{...}}` — push the complete runtime-only
 *   ModularProject snapshot. The editor strips all design-time data
 *   (categories, module-type definitions, visual layouts) so the payload
 *   is typically 3–15 KB.
 * - `{"type":"selectPatch","patchId":"..."}` — switch the active patch
 *   (preset). The firmware reinstantiates the audio graph from the stored
 *   project snapshot.
 *
 * Teensy → Editor:
 * - `{"type":"hello","fw":"mmb-teensy-1","step":N}` — sent on boot and in
 *   reply to every incoming hello. `step` reflects the B-phase build step.
 * - `{"type":"ack","ok":true,"applied":"config","modules":N,...}` — success
 *   acknowledgement, echoes back counts for the editor to display.
 * - `{"type":"ack","ok":false,"err":"..."}` — error acknowledgement.
 * - `{"type":"log","msg":"..."}` — free-form diagnostic log line, shown in
 *   the editor's log pane.
 *
 * **Buffer strategy:**
 * The line buffer is a statically-allocated `char[]` in BSS (no heap). This
 * avoids the silent truncation that Arduino's `String` produces under heap
 * pressure at large payload sizes. The buffer is 48 KB — comfortably larger
 * than the largest expected payload; Teensy 4.1 has 512 KB of RAM2 and over
 * 300 KB of free RAM1.
 *
 * **Caller contract:**
 * Call `begin()` once from `setup()`, then call `poll()` on every iteration
 * of `loop()`. Both `log()` and `logf()` are safe to call from anywhere in
 * the main thread (not from ISRs).
 */

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>
#include "FwVersion.h"

namespace mmb_link {

// Max line buffer. The runtime-only ModularProject payload (no categories/
// moduleTypes) is typically 5-15 KB. We pre-allocate in BSS so there is no
// heap fragmentation risk. Teensy 4.1 RAM1 has ~370 KB free for globals.
inline constexpr size_t kLineMax = 48 * 1024;

/**
 * @brief Handles the USB-Serial JSON protocol (mmb-config.v1).
 *
 * Instantiate one global instance and call `begin()` + `poll()`. Everything
 * else is driven by callbacks and the `log()` / `logf()` static helpers.
 */
class TeensyLink {
public:
    /** Callback invoked when a valid "config" message arrives. The
     *  @p project view is valid only for the duration of the callback —
     *  callers that need to retain data must deep-copy it (ProjectRuntime
     *  does this via ArduinoJson's assignment). */
    using ConfigHandler      = void (*)(JsonObjectConst project);

    /** Callback invoked when a "selectPatch" message arrives. */
    using SelectPatchHandler = void (*)(const char* patchId);

    /** Callback invoked when a "setStatic" message arrives. */
    using SetStaticHandler = void (*)(bool enabled);

    /** @brief Initialise the link and send the opening hello frame.
     *  Must be called once from Arduino `setup()` after `Serial.begin()`. */
    void begin(ConfigHandler onConfig, SelectPatchHandler onSelectPatch,
               SetStaticHandler onSetStatic = nullptr) {
        onConfig_      = onConfig;
        onSelectPatch_ = onSelectPatch;
        onSetStatic_   = onSetStatic;
        bufLen_ = 0;
        sendHello();
    }

    /** @brief Drain the serial input buffer and dispatch complete lines.
     *  Call on every iteration of Arduino `loop()`. Non-blocking. */
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

    /** @brief Send a structured log message to the editor.
     *  Serialises `{"type":"log","msg":"..."}` onto the serial line.
     *  Safe to call from the main thread at any time. */
    static void log(const char* msg) {
        JsonDocument doc;
        doc["type"] = "log";
        doc["msg"]  = msg;
        serializeJson(doc, Serial);
        Serial.println();
    }

    /** @brief printf-style variant of log(). Message is truncated at 200 chars. */
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
    SetStaticHandler   onSetStatic_   = nullptr;

    void sendHello() {
        JsonDocument doc;
        doc["type"]    = "hello";
        doc["fw"]      = "mmb-teensy-1";
        doc["version"] = FW_VERSION;
        doc["step"]    = 3;
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
        if (strcmp(type, "setStatic") == 0) {
            if (!doc["enabled"].is<bool>()) { sendAckErr("setStatic: missing enabled"); return; }
            const bool en = doc["enabled"].as<bool>();
            if (onSetStatic_) onSetStatic_(en);
            JsonDocument extra;
            extra["enabled"] = en;
            sendAckOk("setStatic", extra);
            return;
        }
        sendAckErr("unknown type");
    }
};

}  // namespace mmb_link
