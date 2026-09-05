#pragma once
/**
 * @file TapeEchoModule.h
 * @brief Bandecho (typeId `tp_mmb_tape_echo`): één-koppige tape-delay met
 *        verzadiging, toonverlies per omloop en wow/flutter.
 * @details
 * Dunne AudioStream-wrapper rond `mmb_dsp::TapeEcho` (firmware/lib/mmb-dsp,
 * header-only). Dezelfde DSP draait in de browser-simulator via
 * tools/mmb-wasm — wat je daar hoort is wat de Teensy doet.
 *
 * De band (int16, 1 s + marge ≈ 96 KB) staat op de heap; bij OOM blijft de
 * module stil in plaats van te crashen (zelfde patroon als Rings/Clouds).
 *
 * Port map:
 * | Dir | portId            | Kind  | Betekenis                            |
 * |-----|-------------------|-------|--------------------------------------|
 * | in  | `in`              | Audio | Ingang                               |
 * | in  | `time`/`time_cv`  | Cv    | Bandtijd in seconden (zoals ECHO)    |
 * | in  | `fbk`/`fbk_cv`    | Cv    | Feedback 0..1,1                      |
 * | in  | `mix`/`mix_cv`    | Cv    | Dry/wet                              |
 * | out | `out`             | Audio | Uitgang                              |
 * Controls: `time` (0,02..1 s), `feedback` (0..1,1), `mix`, `tone`, `wow`,
 * `flutter`, `drive` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <memory>
#include <new>
#include <string_view>

#include "mmb_dsp/tape_echo.h"

namespace mmb_link {

class TapeEchoStream : public AudioStream {
public:
    TapeEchoStream() : AudioStream(1, inputQueue_) {
        const int len = mmb_dsp::TapeEcho::bufferLength(AUDIO_SAMPLE_RATE_EXACT);
        tape_.reset(new (std::nothrow) int16_t[len]);
        if (tape_) {
            echo_.Init(AUDIO_SAMPLE_RATE_EXACT, tape_.get(), len);
            Serial.printf("[tape_echo] band ok: %d KB\n", static_cast<int>(len * 2 / 1024));
        } else {
            Serial.println("[tape_echo] band alloc FAILED — module blijft stil");
        }
    }

    mmb_dsp::TapeEcho& echo() { return echo_; }

    void update() override {
        audio_block_t* in = receiveReadOnly(0);
        audio_block_t* out = allocate();
        if (!out) { if (in) release(in); return; }
        if (!echo_.ready()) {
            std::memset(out->data, 0, sizeof(out->data));
        } else {
            for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
                const float x = in ? in->data[i] * (1.0f / 32768.0f) : 0.0f;
                float y = echo_.Process(x);
                if (!(y == y)) y = 0.0f;
                if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
                out->data[i] = static_cast<int16_t>(y * 32767.0f);
            }
        }
        transmit(out, 0);
        release(out);
        if (in) release(in);
    }

private:
    audio_block_t* inputQueue_[1] = { nullptr };
    std::unique_ptr<int16_t[]> tape_;
    mmb_dsp::TapeEcho echo_;
};

class TapeEchoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_tape_echo";

    explicit TapeEchoModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<TapeEchoStream*>(&stream_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return { const_cast<TapeEchoStream*>(&stream_), 0, true };
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "time") || cvPortIs(portId, "fbk") || cvPortIs(portId, "mix"))
            return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& e = stream_.echo();
        if      (cvPortIs(portId, "time")) e.set_time(value);
        else if (cvPortIs(portId, "fbk"))  e.set_feedback(value);
        else if (cvPortIs(portId, "mix"))  e.set_mix(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        auto& e = stream_.echo();
        if      (controlId == "time")     e.set_time(asFloat(0.35f));
        else if (controlId == "feedback") e.set_feedback(asFloat(0.5f));
        else if (controlId == "mix")      e.set_mix(asFloat(0.4f));
        else if (controlId == "tone")     e.set_tone(asFloat(0.6f));
        else if (controlId == "wow")      e.set_wow(asFloat(0.3f));
        else if (controlId == "flutter")  e.set_flutter(asFloat(0.2f));
        else if (controlId == "drive")    e.set_drive(asFloat(0.3f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<TapeEchoModule>(id);
            });
    }

private:
    mutable TapeEchoStream stream_;
};

}  // namespace mmb_link
