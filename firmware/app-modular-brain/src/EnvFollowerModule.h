#pragma once
/**
 * @file EnvFollowerModule.h
 * @brief Envelope follower (FW-CV-6): audio erin, stuurspanning eruit.
 *        Twee varianten uit dezelfde romp — `tp_mmb_env_follower` met acht
 *        cellen (16 HP) en `tp_mmb_env_follower_mono` met één (6 HP).
 *
 * @details
 * Een cel volgt het niveau van zijn audio-ingang en levert dat als CV terug,
 * plus een gate zodra de envelope boven de drempel komt. Klassiek gebruik:
 * een sampler of externe bron door de follower, en de `env`-uitgang op de
 * cutoff-CV van een VCF — het filter opent dan mee met de aanslag.
 *
 * De DSP zelf is @ref mmb_dsp::EnvFollower, dezelfde header als de
 * browser-simulator gebruikt (`tools/mmb-wasm/envfollower_wasm.cc`), zodat
 * sim en hardware identiek reageren.
 *
 * Detectie loopt op **audiotempo** in @ref AudioAnalyzeEnvFollower::update(),
 * niet op de 1 kHz CV-tick: een aanslag van 2 ms zou anders door de mazen
 * vallen. `readCvPort()` leest daardoor alleen de laatste stand af en is
 * vrij van bijwerkingen — nodig, want de CV-brug leest een bron één keer
 * per route, en dat is niet noodzakelijk één keer per tick.
 *
 * De 8-cel variant volgt het multi-module-patroon van @ref OctaVcaModule:
 * identieke cellen met één gedeelde control-set. De mono-variant is dezelfde
 * code met Cells = 1 en kale jacknamen.
 *
 * Port map (N = 1..8; bij de mono-variant heten ze kaal `in`/`env`/`gate`):
 * | Dir | portId   | Kind  | Betekenis                          |
 * |-----|----------|-------|------------------------------------|
 * | in  | `in_N`   | Audio | Cel-ingang                         |
 * | out | `env_N`  | Cv    | Gevolgde envelope, 0..1            |
 * | out | `gate_N` | Gate  | Envelope boven `thresh` (hysterese)|
 *
 * Controls (gedeeld over alle cellen):
 * | controlId | type  | range        | default | effect                    |
 * |-----------|-------|--------------|---------|---------------------------|
 * | `attack`  | float | 0,05 … 500ms | 5       | Hoe snel de env meestijgt |
 * | `release` | float | 1 … 5000 ms  | 120     | Hoe traag hij terugvalt   |
 * | `sens`    | float | -24 … +48 dB | 0       | Gevoeligheid              |
 * | `mode`    | int   | 0=peak 1=rms | 1       | Detector                  |
 * | `thresh`  | float | 0 … 1        | 0.1     | Gate-drempel              |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/env_follower.h"
#include <Audio.h>
#include <array>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/**
 * @brief Eén AudioStream-cel: slikt audio, produceert geen audio.
 *
 * Zoals `AudioAnalyzePeak` een eindpunt in de audiograaf is. `update()`
 * wordt door de audiobibliotheek voor elk levend `AudioStream`-object
 * aangeroepen, ook zonder afnemer, dus de detector loopt altijd door.
 */
class AudioAnalyzeEnvFollower : public AudioStream {
public:
    AudioAnalyzeEnvFollower() : AudioStream(1, inputQueueArray_) {
        dsp.Init(AUDIO_SAMPLE_RATE_EXACT);
    }

    void update() override {
        audio_block_t* block = receiveReadOnly(0);
        if (!block) {
            // Geen kabel of stilte: laat de release gewoon doorlopen op nul,
            // anders blijft een losgekoppelde cel op zijn laatste waarde hangen.
            static const float kSilence[AUDIO_BLOCK_SAMPLES] = { 0.0f };
            dsp.ProcessBlock(kSilence, AUDIO_BLOCK_SAMPLES);
            return;
        }
        float buf[AUDIO_BLOCK_SAMPLES];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i)
            buf[i] = block->data[i] * (1.0f / 32768.0f);
        release(block);
        dsp.ProcessBlock(buf, AUDIO_BLOCK_SAMPLES);
    }

    /// Publiek: de module zet er controls op en leest env()/gate() af.
    mmb_dsp::EnvFollower dsp;

private:
    audio_block_t* inputQueueArray_[1] = { nullptr };
};

/**
 * @brief Gedeelde romp voor beide varianten: @p Cells identieke cellen met
 *        één gedeelde control-set.
 *
 * Het celaantal is een template-parameter zodat de enkelvoudige variant ook
 * écht één `AudioStream` heeft. De audiobibliotheek roept `update()` aan op
 * elk levend stream-object, dus zeven ongebruikte cellen zouden elke blok
 * 128 samples stilte staan verwerken.
 *
 * Bij één cel heten de jacks kaal (`in`, `env`, `gate`) zoals overal in dit
 * project; de `_1`-vorm blijft aanvaard, zodat een patch die van de 8-cel
 * versie komt niet stukloopt.
 */
template <int Cells>
class EnvFollowerBase : public AudioModule {
public:
    static constexpr int kCells = Cells;

    // --- Audio-poorten --------------------------------------------------

    AudioPort outputPort(std::string_view) const override { return {}; }

    AudioPort inputPort(std::string_view portId) const override {
        const int idx = cellIndex(portId, "in");
        if (idx >= 0)
            return { const_cast<AudioAnalyzeEnvFollower*>(&cell_[idx]), 0, true };
        return {};
    }

    // --- Port-kind / CV-brug --------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        if (cellIndex(portId, "env")  >= 0) return PortKind::Cv;
        if (cellIndex(portId, "gate") >= 0) return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        return (cellIndex(portId, "in") >= 0) ? PortKind::Audio : PortKind::None;
    }

    float readCvPort(std::string_view portId) const override {
        int idx = cellIndex(portId, "env");
        if (idx >= 0) return cell_[idx].dsp.env();
        idx = cellIndex(portId, "gate");
        if (idx >= 0) return cell_[idx].dsp.gate() ? 1.0f : 0.0f;
        return 0.0f;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        for (int i = 0; i < Cells; ++i) {
            auto& d = cell_[i].dsp;
            if      (controlId == "attack")  d.set_attack_ms (asFloat(5.0f));
            else if (controlId == "release") d.set_release_ms(asFloat(120.0f));
            else if (controlId == "sens")    d.set_sens_db   (asFloat(0.0f));
            else if (controlId == "mode")    d.set_mode(static_cast<int>(asFloat(1.0f) + 0.5f));
            else if (controlId == "thresh")  d.set_threshold (asFloat(0.1f));
            else return;
        }
    }

protected:
    EnvFollowerBase(const char* typeId, std::string_view id)
        : AudioModule(typeId, id) {}

private:
    /** `in_3` → 2, en bij één cel ook een kale `in` → 0. -1 = niet van ons. */
    static int cellIndex(std::string_view portId, std::string_view base) {
        if (Cells == 1 && portId == base) return 0;
        if (portId.size() != base.size() + 2) return -1;
        if (portId.compare(0, base.size(), base) != 0) return -1;
        if (portId[base.size()] != '_') return -1;
        const char c = portId[base.size() + 1];
        if (c < '1' || c > '0' + Cells) return -1;
        return static_cast<int>(c - '1');
    }

    mutable std::array<AudioAnalyzeEnvFollower, Cells> cell_;
};

/** @brief Acht cellen, 16 HP — de poly-variant. */
class EnvFollowerModule final : public EnvFollowerBase<8> {
public:
    static constexpr const char* kTypeId = "tp_mmb_env_follower";

    explicit EnvFollowerModule(std::string_view id)
        : EnvFollowerBase(kTypeId, id) {}

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<EnvFollowerModule>(id);
            });
    }
};

/** @brief Eén cel, 6 HP — voor als je er maar één nodig hebt. */
class EnvFollowerMonoModule final : public EnvFollowerBase<1> {
public:
    static constexpr const char* kTypeId = "tp_mmb_env_follower_mono";

    explicit EnvFollowerMonoModule(std::string_view id)
        : EnvFollowerBase(kTypeId, id) {}

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<EnvFollowerMonoModule>(id);
            });
    }
};

}  // namespace mmb_link
