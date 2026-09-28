#pragma once
/**
 * @file SidModule.h
 * @brief SID (MOS 6581/8580) als multi-module: 1–4 chips, 3–12 stem-cellen (`tp_mmb_sid`).
 *
 * DSP: mmb_dsp::SidMulti / SidSynth / SidChip (firmware/lib/mmb-dsp/mmb_dsp/sid.h),
 * dezelfde header als de wasm in de simulator. Eigen, clean-room emulatie
 * op registerniveau — zie doc/plans/sid.md. Filter: 6581- of 8580-model.
 *
 * Multi-module zoals de sampler: cellen `voct_k` / `gate_k` (k = 1..12), de
 * stemtoewijzing doet MIDI-in (PolyGroup over de cellen). Cel 1–3 = chip 1,
 * 4–6 = chip 2, enzovoort; `chips` zet hoeveel chips meedoen (elk een eigen
 * filter, zoals een dual/triple-SID). Een kale `voct`/`gate` telt als cel 1.
 * Knoppen gelden voor alle chips.
 *
 * | Richting | Poort | Soort | Betekenis |
 * |---|---|---|---|
 * | in  | `voct_k` | Cv    | Toonhoogte cel k (1 V/oct, MIDI 60 = 0 V) |
 * | in  | `gate_k` | Gate  | Gate-bit cel k (ADSR) |
 * | in  | `bend`   | Cv    | V/oct bovenop alle stemmen |
 * | in  | `pw`     | Cv    | Opgeteld bij de pulsbreedte (0..1), ook `pw_cv` |
 * | in  | `cutoff` | Cv    | Opgeteld bij de cutoff (0..1 = het hele bereik), ook `cutoff_cv` |
 * | in  | `ext_in`, `ext_2..4` | Audio | EXT IN per chip, elk door het filter van die chip (`ext_in` = chip 1) |
 * | out | `out`    | Audio | Mono som (met limiter) |
 * | out | `out_l`/`out_r` | Audio | Stereo: chips verdeeld met `spread` |
 * | out | `sid_j`  | Audio | Chip j apart (j = 1..4), om zelf te mengen |
 *
 * Controls: tri, saw, pulse, noise (aan/uit, samen = combined waveform),
 * pw (0..1), ring, sync, attack/decay/sustain/release (0..15, de
 * registerwaarden), coarse (st), fine (ct), volume (0..15), level (0..1),
 * combo (0..10: sterkte van de combined waveforms; 0 = AND, 4 ≈ 8580, 7 ≈ 6581),
 * cutoff (0..2047, het 11-bit register), res (0..15), filt (stemmen door het
 * filter), lp/bp/hp (modes, combineerbaar), model (0 = 6581, 1 = 8580: filter
 * en uitgangsgedrag), curve (0..1: spreiding van de 6581-cutoffcurve),
 * chips (1..4), spread (0..1: stereobreedte).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/sid.h"

namespace mmb_link {

/** Eén SID, mono (de SID 3-osc gebruikt deze). */
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

/** 1–4 SID's: mono, stereo en per chip (SidMulti::Out-volgorde). */
class SidMultiStream : public AudioStream {
public:
    static constexpr int kOuts = mmb_dsp::SidMulti::kNumOuts;
    SidMultiStream() : AudioStream(mmb_dsp::SidMulti::kMaxChips, inputQueue_) { sid_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::SidMulti& sid() { return sid_; }

    void update() override {
        constexpr int kIns = mmb_dsp::SidMulti::kMaxChips;
        audio_block_t* ext[kIns];
        for (int j = 0; j < kIns; ++j) ext[j] = receiveReadOnly(j);
        auto releaseExt = [&] { for (auto* e : ext) if (e) release(e); };
        audio_block_t* out[kOuts];
        for (int c = 0; c < kOuts; ++c) {
            out[c] = allocate();
            if (!out[c]) {
                for (int k = 0; k < c; ++k) release(out[k]);
                releaseExt();
                return;
            }
        }
        float y[kOuts], x[kIns];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            for (int j = 0; j < kIns; ++j) x[j] = ext[j] ? ext[j]->data[i] * (1.0f / 32768.0f) : 0.0f;
            sid_.Process(x, y);
            for (int c = 0; c < kOuts; ++c) {
                const float v = y[c] > 1.f ? 1.f : (y[c] < -1.f ? -1.f : y[c]);
                out[c]->data[i] = static_cast<int16_t>(v * 32767.0f);
            }
        }
        for (int c = 0; c < kOuts; ++c) { transmit(out[c], c); release(out[c]); }
        releaseExt();
    }

private:
    audio_block_t* inputQueue_[mmb_dsp::SidMulti::kMaxChips] = {};
    mmb_dsp::SidMulti sid_;
};

class SidModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sid";
    explicit SidModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<SidMultiStream*>(&stream_);
        using M = mmb_dsp::SidMulti;
        if (portId == "out")   return { s, M::kOutMono, true };
        if (portId == "out_l") return { s, M::kOutL, true };
        if (portId == "out_r") return { s, M::kOutR, true };
        const int j = cellOf(portId, "sid", M::kMaxChips);
        if (j >= 0 && portId != "sid") return { s, M::kOutChip1 + j, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        const int j = extOf(portId);
        if (j >= 0) return { const_cast<SidMultiStream*>(&stream_), static_cast<uint8_t>(j), true };
        return {};
    }
    /** `ext_in` = chip 1, `ext_2..4` = chip 2..4 → 0-based, anders −1. */
    static int extOf(std::string_view portId) {
        if (portId == "ext_in") return 0;
        const int j = cellOf(portId, "ext", mmb_dsp::SidMulti::kMaxChips);
        return (j >= 1 && portId != "ext") ? j : -1;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l" || portId == "out_r") return PortKind::Audio;
        if (portId != "sid" && cellOf(portId, "sid", mmb_dsp::SidMulti::kMaxChips) >= 0) return PortKind::Audio;
        return PortKind::None;
    }

    /** Cel-poort `<base>_<k>` (k = 1..@p max) → 0-based index, of −1; kaal = cel 1. */
    static int cellOf(std::string_view portId, std::string_view base, int max = mmb_dsp::SidMulti::kCells) {
        if (portId == base) return 0;
        if (portId.size() <= base.size() + 1 || portId.substr(0, base.size()) != base ||
            portId[base.size()] != '_') return -1;
        int k = 0;
        for (char c : portId.substr(base.size() + 1)) {
            if (c < '0' || c > '9') return -1;
            k = k * 10 + (c - '0');
        }
        return (k >= 1 && k <= max) ? k - 1 : -1;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (cellOf(portId, "voct") >= 0) return PortKind::Cv;
        if (cellOf(portId, "gate") >= 0) return PortKind::Gate;
        if (portId == "bend" || cvPortIs(portId, "pw") || cvPortIs(portId, "cutoff")) return PortKind::Cv;
        if (extOf(portId) >= 0) return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& m = stream_.sid();
        int k;
        if      (portId == "bend")             m.all([&](mmb_dsp::SidSynth& c) { c.setBend(value); });
        else if (cvPortIs(portId, "pw"))       m.all([&](mmb_dsp::SidSynth& c) { c.setPwCv(value); });
        else if (cvPortIs(portId, "cutoff"))   m.all([&](mmb_dsp::SidSynth& c) { c.setCutoffCv(value); });
        else if ((k = cellOf(portId, "voct")) >= 0) m.setVoct(k, value);
        else if ((k = cellOf(portId, "gate")) >= 0) m.gate(k, value >= 0.5f);
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
        using S = mmb_dsp::SidSynth;
        auto& m = stream_.sid();
        auto each = [&](auto f) { m.all(f); };
        if      (controlId == "chips")   m.setChips(asInt(1));
        else if (controlId == "spread")  m.setSpread(asFloat(0.7f));
        else if (controlId == "tri")     { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setWaveBit(C::kTri, b); }); }
        else if (controlId == "saw")     { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setWaveBit(C::kSaw, b); }); }
        else if (controlId == "pulse")   { const bool b = asFloat(1.f) >= 0.5f; each([&](S& s) { s.setWaveBit(C::kPulse, b); }); }
        else if (controlId == "noise")   { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setWaveBit(C::kNoise, b); }); }
        else if (controlId == "pw")      { const float v = asFloat(0.5f); each([&](S& s) { s.setPw(v); }); }
        else if (controlId == "ring")    { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setRing(b); }); }
        else if (controlId == "sync")    { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setSync(b); }); }
        else if (controlId == "attack")  { const int n = asInt(0);  each([&](S& s) { s.setAttack(n); }); }
        else if (controlId == "decay")   { const int n = asInt(9);  each([&](S& s) { s.setDecay(n); }); }
        else if (controlId == "sustain") { const int n = asInt(10); each([&](S& s) { s.setSustain(n); }); }
        else if (controlId == "release") { const int n = asInt(9);  each([&](S& s) { s.setRelease(n); }); }
        else if (controlId == "coarse")  { const float v = asFloat(0.f); each([&](S& s) { s.setCoarse(v); }); }
        else if (controlId == "fine")    { const float v = asFloat(0.f); each([&](S& s) { s.setFine(v); }); }
        else if (controlId == "volume")  { const int n = asInt(15); each([&](S& s) { s.setVolume(n); }); }
        else if (controlId == "level")   { const float v = asFloat(0.8f); each([&](S& s) { s.setLevel(v); }); }
        else if (controlId == "combo")   { const float v = asFloat(7.0f); each([&](S& s) { s.setCombo(v); }); }
        else if (controlId == "cutoff")  { const float v = asFloat(1024.f); each([&](S& s) { s.setCutoff(v); }); }
        else if (controlId == "res")     { const int n = asInt(0); each([&](S& s) { s.setRes(n); }); }
        else if (controlId == "filt")    { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setFilt(b); }); }
        else if (controlId == "lp")      { const bool b = asFloat(1.f) >= 0.5f; each([&](S& s) { s.setMode(S::kLp, b); }); }
        else if (controlId == "bp")      { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setMode(S::kBp, b); }); }
        else if (controlId == "hp")      { const bool b = asFloat(0.f) >= 0.5f; each([&](S& s) { s.setMode(S::kHp, b); }); }
        else if (controlId == "model")   { const int n = asInt(0); each([&](S& s) { s.setModel(n); }); }
        else if (controlId == "curve")   { const float v = asFloat(0.5f); each([&](S& s) { s.setCurve(v); }); }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<SidModule>(id); });
    }

private:
    mutable SidMultiStream stream_;
};

}  // namespace mmb_link
