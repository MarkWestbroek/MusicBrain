#pragma once
/**
 * @file Sid3Module.h
 * @brief SID 3-osc: één SID met instellingen per stem (`tp_mmb_sid3`).
 *
 * Zelfde engine als tp_mmb_sid (mmb_dsp::SidSynth, sid.h), ander paneel: elke
 * stem heeft zijn eigen golfvorm, PW, ring/sync, ADSR, coarse/fine en
 * filterroute. Stack (standaard): voct_1/gate_1 sturen alle drie de stemmen,
 * elk met zijn eigen coarse/fine — drie oscillatoren op één noot, waar ring
 * en sync een vast interval hebben. Split: elke stem heeft een eigen
 * voct_k/gate_k, zoals in een C64-tune (bas, lead, drum op één chip).
 *
 * Geen cel-module: voor polyfoon spelen zet je meerdere SID 3-osc's in een
 * PolyGroup (zoals de DX7); elke noot krijgt een eigen chip met eigen filter.
 *
 * | Richting | Poort | Soort | Betekenis |
 * |---|---|---|---|
 * | in  | `voct_k` | Cv    | Toonhoogte stem k (Split) / alle stemmen (Stack, k = 1) |
 * | in  | `gate_k` | Gate  | Gate stem k (Split) / alle stemmen (Stack, k = 1) |
 * | in  | `bend`   | Cv    | V/oct bovenop alle stemmen |
 * | in  | `pw`     | Cv    | Opgeteld bij de pulsbreedte van alle stemmen, ook `pw_cv` |
 * | in  | `cutoff` | Cv    | Opgeteld bij de cutoff (0..1 = het hele bereik), ook `cutoff_cv` |
 * | in  | `ext_in` | Audio | EXT IN: altijd door het SID-filter |
 * | out | `out`    | Audio | Mono |
 *
 * Controls per stem k = 1..3: tri_k, saw_k, pulse_k, noise_k, pw_k, ring_k,
 * sync_k, attack_k, decay_k, sustain_k, release_k (0..15), coarse_k (st),
 * fine_k (ct), filt_k. Gedeeld: stack, combo, volume, level, cutoff, res,
 * lp/bp/hp, model (0 = 6581, 1 = 8580), curve.
 */

#include "SidModule.h"

namespace mmb_link {

class Sid3Module final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sid3";
    explicit Sid3Module(std::string_view id) : AudioModule(kTypeId, id) {
        // Standaardstemmen, gelijk aan het paneel: pulse; saw 8 ct hoger;
        // driehoek een octaaf lager.
        auto& s = stream_.sid();
        s.setStack(true);
        s.setWave(1, mmb_dsp::SidChip::kSaw); s.setFine(1, 8.f);
        s.setWave(2, mmb_dsp::SidChip::kTri); s.setCoarse(2, -12.f);
    }

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
    PortKind inputPortKind(std::string_view portId) const override {
        if (SidModule::cellOf(portId, "voct") >= 0) return PortKind::Cv;
        if (SidModule::cellOf(portId, "gate") >= 0) return PortKind::Gate;
        if (portId == "bend" || cvPortIs(portId, "pw") || cvPortIs(portId, "cutoff")) return PortKind::Cv;
        if (portId == "ext_in") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& s = stream_.sid();
        int k;
        if      (portId == "bend")                  s.setBend(value);
        else if (cvPortIs(portId, "pw"))            s.setPwCv(value);
        else if (cvPortIs(portId, "cutoff"))        s.setCutoffCv(value);
        else if ((k = SidModule::cellOf(portId, "voct")) >= 0) s.setVoct(k, value);
        else if ((k = SidModule::cellOf(portId, "gate")) >= 0) s.gate(k, value >= 0.5f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto asInt = [&](int fb) { return static_cast<int>(asFloat(static_cast<float>(fb)) + 0.5f); };
        auto on = [&](float fb) { return asFloat(fb) >= 0.5f; };
        using C = mmb_dsp::SidChip;
        auto& s = stream_.sid();
        // Per stem: `<naam>_<k>`, k = 1..3.
        std::string_view base;
        const int k = voiceOf(controlId, base);
        if (k >= 0) {
            if      (base == "tri")     s.setWaveBit(k, C::kTri,   on(0.f));
            else if (base == "saw")     s.setWaveBit(k, C::kSaw,   on(0.f));
            else if (base == "pulse")   s.setWaveBit(k, C::kPulse, on(0.f));
            else if (base == "noise")   s.setWaveBit(k, C::kNoise, on(0.f));
            else if (base == "pw")      s.setPw(k, asFloat(0.5f));
            else if (base == "ring")    s.setRing(k, on(0.f));
            else if (base == "sync")    s.setSync(k, on(0.f));
            else if (base == "attack")  s.setAttack(k, asInt(0));
            else if (base == "decay")   s.setDecay(k, asInt(9));
            else if (base == "sustain") s.setSustain(k, asInt(10));
            else if (base == "release") s.setRelease(k, asInt(9));
            else if (base == "coarse")  s.setCoarse(k, asFloat(0.f));
            else if (base == "fine")    s.setFine(k, asFloat(0.f));
            else if (base == "filt")    s.setFilt(k, on(0.f));
            return;
        }
        if      (controlId == "stack")  s.setStack(on(1.f));
        else if (controlId == "combo")  s.setCombo(asFloat(7.0f));
        else if (controlId == "volume") s.setVolume(asInt(15));
        else if (controlId == "level")  s.setLevel(asFloat(0.8f));
        else if (controlId == "cutoff") s.setCutoff(asFloat(1024.f));
        else if (controlId == "res")    s.setRes(asInt(0));
        else if (controlId == "lp")     s.setMode(mmb_dsp::SidSynth::kLp, on(1.f));
        else if (controlId == "bp")     s.setMode(mmb_dsp::SidSynth::kBp, on(0.f));
        else if (controlId == "hp")     s.setMode(mmb_dsp::SidSynth::kHp, on(0.f));
        else if (controlId == "model")  s.setModel(asInt(0));
        else if (controlId == "curve")  s.setCurve(asFloat(0.5f));
    }

    /** `<naam>_<k>` (k = 1..3) → 0-based stem en @p base = naam; anders −1. */
    static int voiceOf(std::string_view id, std::string_view& base) {
        if (id.size() < 3 || id[id.size() - 2] != '_') return -1;
        const char c = id.back();
        if (c < '1' || c > '0' + mmb_dsp::SidSynth::kVoices) return -1;
        base = id.substr(0, id.size() - 2);
        return c - '1';
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<Sid3Module>(id); });
    }

private:
    mutable SidStream stream_;
};

}  // namespace mmb_link
