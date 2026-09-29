#pragma once
/**
 * @file AudioInModule.h
 * @brief Audio-ingang (typeId `tp_mmb_audioin`): het geluid dat de pc over
 *        USB naar de Teensy stuurt, als bron in de patch.
 *
 * @details
 * De brain heeft geen analoge audio-ingang, maar hij is wél een USB-audio-
 * apparaat in twee richtingen (`USB_MIDI_AUDIO_SERIAL`): de pc hoort hem als
 * microfoon (OutModule → `AudioOutputUSB`) én kan naar hem afspelen. Die
 * afspeelkant is `AudioInputUSB`, en die zit hier achter `out_l`/`out_r`.
 * Wat je op de pc naar het afspeelapparaat "Teensy MIDI/Audio" stuurt —
 * een headset-microfoon via *Listen to this device*, een DAW-spoor, een
 * browsertab — komt zo in de patch terecht. Vocoder op je eigen stem,
 * zonder extra hardware (zie doc/teensy-aan-de-pc.md §5).
 *
 * Er is precies één `AudioInputUSB` in het systeem (de USB-ontvangbuffer is
 * één statisch ding), lui aangemaakt bij de eerste module. Elke module-
 * instantie zet er zijn eigen mixerpaar achter, zodat `level` en `mono` per
 * instantie werken en twee AUDIO IN's in één patch niet in de weg zitten.
 *
 * Port map:
 * | Dir | portId  | Kind  | Betekenis                                  |
 * |-----|---------|-------|--------------------------------------------|
 * | out | `out_l` | Audio | USB-in links (bij `mono` = 1: ½·(L+R))     |
 * | out | `out_r` | Audio | USB-in rechts (bij `mono` = 1: ½·(L+R))    |
 *
 * Controls:
 * | controlId | type  | range | default | effect                              |
 * |-----------|-------|-------|---------|-------------------------------------|
 * | `level`   | float | 0 … 2 | 1       | versterking                         |
 * | `mono`    | int   | 0 … 1 | 1       | 1 = L+R sommeren naar beide uitgangen |
 *
 * `mono` staat standaard aan: een microfoon is mono en Windows zet hem vaak
 * alleen op links; zo klinkt hij op beide jacks.
 *
 * De simulator bouwt dit type niet als wasm maar rechtstreeks uit Web Audio
 * (getUserMedia → de standaard-microfoon), zie sim/AudioEngine.ts.
 */
#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <memory>
#include <string_view>

namespace mmb_link {

/** @brief Module rond de gedeelde @c AudioInputUSB met een eigen mixerpaar. */
class AudioInModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_audioin";

    /** @brief De ene USB-ontvanger van het systeem (lui aangemaakt). */
    static AudioInputUSB& usbIn() { static AudioInputUSB in; return in; }

    explicit AudioInModule(std::string_view id) : AudioModule(kTypeId, id) {
        AudioInputUSB& in = usbIn();
        cLL_ = std::make_unique<AudioConnection>(in, 0, mixL_, 0);
        cRL_ = std::make_unique<AudioConnection>(in, 1, mixL_, 1);
        cLR_ = std::make_unique<AudioConnection>(in, 0, mixR_, 0);
        cRR_ = std::make_unique<AudioConnection>(in, 1, mixR_, 1);
        applyGains();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return { const_cast<AudioMixer4*>(&mixL_), 0, true };
        if (portId == "out_r") return { const_cast<AudioMixer4*>(&mixR_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override { return {}; }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out_l" || portId == "out_r") ? PortKind::Audio : PortKind::None;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>    (&value)) return *b ? 1.0f : 0.0f;
            return fallback;
        };
        if (controlId == "level") {
            float l = asFloat(1.0f);
            level_ = l < 0.0f ? 0.0f : (l > 2.0f ? 2.0f : l);
            applyGains();
        } else if (controlId == "mono") {
            mono_ = asFloat(1.0f) >= 0.5f;
            applyGains();
        }
    }

    /** @brief Register the factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<AudioInModule>(id);
            });
    }

private:
    void applyGains() {
        // mixL: ingang 0 = USB L, 1 = USB R; mixR idem. Mono = ½·(L+R) op beide.
        const float own   = mono_ ? 0.5f * level_ : level_;
        const float other = mono_ ? 0.5f * level_ : 0.0f;
        mixL_.gain(0, own);   mixL_.gain(1, other);
        mixR_.gain(0, other); mixR_.gain(1, own);
        mixL_.gain(2, 0.0f);  mixL_.gain(3, 0.0f);
        mixR_.gain(2, 0.0f);  mixR_.gain(3, 0.0f);
    }

    mutable AudioMixer4 mixL_;
    mutable AudioMixer4 mixR_;
    std::unique_ptr<AudioConnection> cLL_, cRL_, cLR_, cRR_;
    float level_ = 1.0f;
    bool  mono_  = true;
};

}  // namespace mmb_link
