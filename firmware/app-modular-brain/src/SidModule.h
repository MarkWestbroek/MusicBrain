#pragma once
/**
 * @file SidModule.h
 * @brief SID (MOS 6581/8580) als multi-module met drie stem-cellen (`tp_mmb_sid`).
 *
 * DSP: mmb_dsp::SidSynth / SidChip (firmware/lib/mmb-dsp/mmb_dsp/sid.h),
 * dezelfde header als de wasm in de simulator. Eigen, clean-room emulatie
 * op registerniveau — zie doc/plans/sid.md. Filter: 8580-model.
 *
 * Multi-module zoals de sampler: drie cellen `voct_k` / `gate_k` (k = 1..3),
 * de stemtoewijzing doet MIDI-in (PolyGroup over de cellen). Een kale
 * `voct`/`gate` telt als cel 1. Knoppen gelden voor alle drie de stemmen.
 *
 * | Richting | Poort | Soort | Betekenis |
 * |---|---|---|---|
 * | in  | `voct_k` | Cv   | Toonhoogte stem k (1 V/oct, MIDI 60 = 0 V) |
 * | in  | `gate_k` | Gate | Gate-bit stem k (ADSR) |
 * | in  | `bend`   | Cv   | V/oct bovenop alle stemmen |
 * | in  | `pw`     | Cv   | Opgeteld bij de pulsbreedte (0..1), ook `pw_cv` |
 * | in  | `cutoff` | Cv   | Opgeteld bij de cutoff (0..1 = het hele bereik), ook `cutoff_cv` |
 * | in  | `ext_in` | Audio | EXT IN: altijd door het SID-filter |
 * | out | `out`    | Audio | Mono |
 *
 * Controls: tri, saw, pulse, noise (aan/uit, samen = combined waveform),
 * pw (0..1), ring, sync, attack/decay/sustain/release (0..15, de
 * registerwaarden), coarse (st), fine (ct), volume (0..15), level (0..1),
 * combo (0..10: sterkte van de combined waveforms; 0 = AND, 4 ≈ 8580, 7 ≈ 6581),
 * cutoff (0..2047, het 11-bit register), res (0..15), filt (stemmen door het
 * filter), lp/bp/hp (modes, combineerbaar).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/sid.h"

namespace mmb_link {

class SidStream : public AudioStream {
public:
    SidStream() : AudioStream(1, inputQueue_) { sid_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::SidSynth& sid() { return sid_; }

    void update() override {
        audio_block_t* ext = receiveReadOnly(0);
        audio_block_t* out = allocate();
        if (!out) { if (ext) release(ext); return; }
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = ext ? ext->data[i] * (1.0f / 32768.0f) : 0.0f;
            out->data[i] = static_cast<int16_t>(sid_.Process(x) * 32767.0f);
        }
        transmit(out, 0);
        release(out);
        if (ext) release(ext);
    }

private:
    audio_block_t* inputQueue_[1] = { nullptr };
    mmb_dsp::SidSynth sid_;
};

class SidModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sid";
    explicit SidModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<SidStream*>(&stream_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "ext_in") return { const_cast<SidStream*>(&stream_), 0, true };
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }

    /** Cel-poort `<base>_<k>` (k 1-based) → 0-based celindex, of −1; kaal = cel 1. */
    static int cellOf(std::string_view portId, std::string_view base) {
        if (portId == base) return 0;
        if (portId.size() != base.size() + 2 || portId.substr(0, base.size()) != base ||
            portId[base.size()] != '_') return -1;
        const char c = portId[base.size() + 1];
        return (c >= '1' && c <= '0' + mmb_dsp::SidSynth::kVoices) ? c - '1' : -1;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (cellOf(portId, "voct") >= 0) return PortKind::Cv;
        if (cellOf(portId, "gate") >= 0) return PortKind::Gate;
        if (portId == "bend" || cvPortIs(portId, "pw") || cvPortIs(portId, "cutoff")) return PortKind::Cv;
        if (portId == "ext_in") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& s = stream_.sid();
        int k;
        if      (portId == "bend")                 s.setBend(value);
        else if (cvPortIs(portId, "pw"))           s.setPwCv(value);
        else if (cvPortIs(portId, "cutoff"))       s.setCutoffCv(value);
        else if ((k = cellOf(portId, "voct")) >= 0) s.setVoct(k, value);
        else if ((k = cellOf(portId, "gate")) >= 0) s.gate(k, value >= 0.5f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto asInt = [&](int fb) { return static_cast<int>(asFloat(static_cast<float>(fb)) + 0.5f); };
        using C = mmb_dsp::SidChip;
        auto& s = stream_.sid();
        if      (controlId == "tri")     s.setWaveBit(C::kTri,   asFloat(0.f) >= 0.5f);
        else if (controlId == "saw")     s.setWaveBit(C::kSaw,   asFloat(0.f) >= 0.5f);
        else if (controlId == "pulse")   s.setWaveBit(C::kPulse, asFloat(1.f) >= 0.5f);
        else if (controlId == "noise")   s.setWaveBit(C::kNoise, asFloat(0.f) >= 0.5f);
        else if (controlId == "pw")      s.setPw(asFloat(0.5f));
        else if (controlId == "ring")    s.setRing(asFloat(0.f) >= 0.5f);
        else if (controlId == "sync")    s.setSync(asFloat(0.f) >= 0.5f);
        else if (controlId == "attack")  s.setAttack(asInt(0));
        else if (controlId == "decay")   s.setDecay(asInt(9));
        else if (controlId == "sustain") s.setSustain(asInt(10));
        else if (controlId == "release") s.setRelease(asInt(9));
        else if (controlId == "coarse")  s.setCoarse(asFloat(0.f));
        else if (controlId == "fine")    s.setFine(asFloat(0.f));
        else if (controlId == "volume")  s.setVolume(asInt(15));
        else if (controlId == "level")   s.setLevel(asFloat(0.8f));
        else if (controlId == "combo")   s.setCombo(asFloat(7.0f));
        else if (controlId == "cutoff")  s.setCutoff(asFloat(1024.f));
        else if (controlId == "res")     s.setRes(asInt(0));
        else if (controlId == "filt")    s.setFilt(asFloat(0.f) >= 0.5f);
        else if (controlId == "lp")      s.setMode(mmb_dsp::SidSynth::kLp, asFloat(1.f) >= 0.5f);
        else if (controlId == "bp")      s.setMode(mmb_dsp::SidSynth::kBp, asFloat(0.f) >= 0.5f);
        else if (controlId == "hp")      s.setMode(mmb_dsp::SidSynth::kHp, asFloat(0.f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<SidModule>(id); });
    }

private:
    mutable SidStream stream_;
};

}  // namespace mmb_link
