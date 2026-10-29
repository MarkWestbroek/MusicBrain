#pragma once
// Een hele patch in de plugin (doc/plans/plugin-patches.md §4–5): de JSON die
// de Teensy krijgt (buildConfigPayload in teensyLink.ts: poly-groepen
// uitgevouwen, alle knoppen erbij), met elke module als wasm2c-instantie
// (W2cRuntime.h) en MIXER8/OUT native zoals de firmware ze doet.
//
// Timing zoals de Teensy (firmware main.cpp, CvGraph.cpp):
//  - Audio rekent op 44,1 kHz in blokken van 32. CV tikt op 1 kHz met een
//    fractionele teller (tik k valt op k·44100/1000); de tikken die in een
//    audioblok vallen, draaien vóór dat blok wordt gerenderd, zodat een tik
//    nooit een half blok ziet.
//  - Per tik: eerst de MIDI die tot die tik binnenkwam (naar MIDI-IN), dan
//    tikken alle CV-modules (volgorde doet niet ter zake), dan de bridge.
//    Een CV-keten heeft dus per stap één tik vertraging, zoals op de Teensy.
//  - De bridge leest elke CV-kabel en schrijft alleen bij een verandering
//    (geheugen per kabel): bij twee kabels op één ingang wint de bron die
//    het laatst veranderde. De bridge is de enige schrijver van CV-ingangen.
//  - Een audiomodule leest een CV-ingang per blok (een gate korter dan een
//    blok mist hij, zoals de Teensy bij 128). Een CV-uitgang van een
//    audiomodule is het laatste sample van het vorige blok.
//  - Audio: kabels naar dezelfde ingang tellen op; modules in
//    topologische volgorde, een terugkoppeling krijgt één blok vertraging.
//  - Kabels die audio en CV mengen, slaat de firmware over; hier ook.
//  - `attenuation` op een kabel geldt als versterking (zoals de simulator).
//
// Bypass (plugin-patches.md §9): de pseudo-knop `__bypass` in controlState.
// Welke modules en hoe staat per type in "bypass" naast "project" in de JSON
// (de generator haalt het uit bypassRoute.ts): { "own": true } = de module
// heeft zelf een knop `bypass`, die zetten we; anders [uitgang, ingang,
// terugval?] voor het droge pad (terugval: als de ingang geen kabel heeft,
// bv. in_r bij een mono bron, zoals de firmware mono op beide kanten zet). Overgang in ~10 ms, met trails: de invoer van het
// effect gaat dicht, zijn uitgang klinkt uit, het droge signaal komt erbij.

#include "W2cRuntime.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <cmath>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace mmb_plugin {

class PatchEngine {
public:
    static constexpr double kRate = 44100.0;
    static constexpr int kBlock = 32;
    static constexpr int kPortAudio_ = 0;   // MmbKind

    using Factory = std::function<const W2cVtable*(const std::string& typeId)>;

    /** Bouwt de graaf uit de config-JSON. Geeft false met @p error als iets niet kan. */
    bool load(const juce::String& json, const Factory& factory, juce::String& error) {
        const juce::var root = juce::JSON::parse(json);
        const juce::var project = root.hasProperty("project") ? root["project"] : root;
        const juce::var patch = project["patches"][0];
        if (!patch.isObject()) { error = "geen patch in de JSON"; return false; }

        // Modules.
        if (auto* mods = project["modules"].getArray()) {
            for (const auto& m : *mods) {
                const std::string id = m["id"].toString().toStdString(), type = m["typeId"].toString().toStdString();
                auto node = std::make_unique<Node>();
                node->id = id; node->type = type;
                if (type == "tp_mmb_mixer8") node->kind = Node::Mixer8;
                else if (type == "tp_mmb_out") node->kind = Node::Out;
                else {
                    const W2cVtable* vt = factory(type);
                    if (!vt) { std::printf("[mmb] patch: %s (%s) heeft geen wasm, overgeslagen\n", id.c_str(), type.c_str()); continue; }
                    node->host = std::make_unique<W2cHost>(*vt);
                    node->host->init();
                    const float rate = node->host->nativeRate();
                    const int block = node->host->block();
                    if (block == 1 && rate == 1000.0f) node->kind = Node::Cv;
                    else if (rate == static_cast<float>(kRate) && block > 0 && kBlock % block == 0) node->kind = Node::Audio;
                    else { error = juce::String(type) + ": " + juce::String(rate) + " Hz, blok " + juce::String(block) + " kan nog niet in een patch"; return false; }
                    node->block = block;
                    if (node->host->hasMidi()) midiNodes_.push_back(node.get());
                }
                byId_[id] = node.get();
                nodes_.push_back(std::move(node));
            }
        }

        // Bypass-routes per type (vóór de knoppen: controlState kan `__bypass` hebben).
        if (auto* bp = root["bypass"].getDynamicObject()) {
            for (auto& n : nodes_) {
                if (!n->host || !bp->hasProperty(juce::Identifier(n->type))) continue;
                const juce::var r = bp->getProperty(juce::Identifier(n->type));
                if (r.isObject() && static_cast<bool>(r["own"])) { n->ownBypass = true; continue; }
                if (auto* pairs = r.getArray())
                    for (const auto& pr : *pairs) {
                        const int o = n->host->outputIndex(pr[0].toString().toStdString()), i = n->host->inputIndex(pr[1].toString().toStdString());
                        const int f = pr.size() > 2 ? n->host->inputIndex(pr[2].toString().toStdString()) : -1;
                        if (o >= 0 && i >= 0 && outKind(*n, o) == kPortAudio_ && inKind(*n, i) == kPortAudio_) n->dry.push_back({ o, i, f });
                    }
            }
        }

        // Knoppen, en het aantal stemmen naar MIDI-IN (applyPatchVoiceCount).
        if (auto* cs = patch["controlState"].getDynamicObject()) {
            for (const auto& kv : cs->getProperties()) {
                Node* n = find(kv.name.toString().toStdString());
                if (!n) continue;
                if (auto* ctl = kv.value.getDynamicObject())
                    for (const auto& c : ctl->getProperties()) setControl(*n, c.name.toString().toStdString(), toFloat(c.value));
            }
        }
        const int voices = static_cast<int>(patch["voiceCount"]);
        if (voices > 0) for (Node* n : midiNodes_) setControl(*n, "voiceCount", static_cast<float>(voices));

        // Kabels.
        if (auto* conns = patch["connections"].getArray()) {
            for (const auto& c : *conns) {
                Node* src = find(c["from"]["moduleId"].toString().toStdString());
                Node* dst = find(c["to"]["moduleId"].toString().toStdString());
                if (!src || !dst) { ++skipped_; continue; }
                const std::string sp = c["from"]["portId"].toString().toStdString(), dp = c["to"]["portId"].toString().toStdString();
                const int so = outIndex(*src, sp), di = inIndex(*dst, dp);
                if (so < 0 || di < 0) { std::printf("[mmb] patch: poort %s.%s -> %s.%s onbekend\n", src->id.c_str(), sp.c_str(), dst->id.c_str(), dp.c_str()); ++skipped_; continue; }
                const float gain = c.hasProperty("attenuation") ? static_cast<float>(static_cast<double>(c["attenuation"])) : 1.0f;
                const bool srcAudio = outKind(*src, so) == kPortAudio_, dstAudio = inKind(*dst, di) == kPortAudio_;
                if (srcAudio != dstAudio) { ++skipped_; continue; }   // gemengd: de firmware slaat hem ook over
                if (srcAudio) audio_.push_back({ src, so, dst, di, gain });
                else cv_.push_back({ src, so, dst, di, gain, 0.0f, false });
                if (dst->host) dst->host->setConnected(di, 1);
            }
        }
        order();
        // Terugval van het droge pad: een ingang zonder kabel → de terugvalingang.
        for (auto& n : nodes_)
            for (auto& d : n->dry) {
                const auto wired = [&](int in) { return std::any_of(audio_.begin(), audio_.end(), [&](const AudioCable& c) { return c.dst == n.get() && c.in == in; }); };
                if (d.fallback >= 0 && !wired(d.in) && wired(d.fallback)) d.in = d.fallback;
            }
        for (auto& n : nodes_) n->byp = n->bypTarget;   // de opgeslagen stand meteen, zonder overgang
        loaded_ = true;
        std::printf("[mmb] patch: %zu modules, %zu audiokabels, %zu cv-kabels, %d overgeslagen\n", nodes_.size(), audio_.size(), cv_.size(), skipped_);
        std::fflush(stdout);
        return true;
    }

    bool loaded() const { return loaded_; }

    /** Zet knop @p control van module @p moduleId. */
    void setControl(const std::string& moduleId, const std::string& control, float v) {
        if (Node* n = find(moduleId)) setControl(*n, control, v);
    }

    /** Een MIDI-bericht op sample @p at van de interne klok (44,1 kHz). */
    void midi(const juce::MidiMessage& m, double at) {
        const auto* d = m.getRawData();
        if (m.getRawDataSize() < 1 || (d[0] & 0xF0) == 0xF0) return;
        pending_.push_back({ at, d[0], m.getRawDataSize() > 1 ? d[1] : 0, m.getRawDataSize() > 2 ? d[2] : 0 });
    }
    double now() const { return clock_; }

    /** Eén blok van kBlock samples; @p l en @p r krijgen de uitgang. */
    void process(float* l, float* r) {
        // CV-tikken die in dit blok vallen, eerst.
        while (nextTick_ < clock_ + kBlock) {
            deliverMidi(nextTick_);
            for (Node* n : cvNodes_) n->host->process(1);
            bridge();
            nextTick_ += kRate / 1000.0;
        }
        std::fill(l, l + kBlock, 0.0f);
        std::fill(r, r + kBlock, 0.0f);
        for (Node* n : audioOrder_) render(*n, l, r);
        clock_ += kBlock;
    }

private:
    struct Node {
        enum Kind { Cv, Audio, Mixer8, Out } kind = Audio;
        std::string id, type;
        std::unique_ptr<W2cHost> host;
        int block = kBlock;
        // Native MIXER8/OUT.
        float vol[8] = { 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f }, pan[8] = {};
        float level = 1.0f;
        float in[8][kBlock] = {};
        float out[2][kBlock] = {};
        // Bypass: eigen knop, of droge paren (uitgang, ingang); byp loopt naar bypTarget.
        bool ownBypass = false;
        struct Dry { int out, in, fallback; };
        std::vector<Dry> dry;
        float byp = 0.0f, bypTarget = 0.0f;
    };
    static constexpr float kBypassStep = 1.0f / (0.010f * static_cast<float>(kRate));   // 10 ms
    struct AudioCable { Node* src; int out; Node* dst; int in; float gain; };
    struct CvCable { Node* src; int out; Node* dst; int in; float gain; float last; bool primed; };
    struct MidiEvent { double at; int s, d1, d2; };

    static float toFloat(const juce::var& v) { return v.isBool() ? (static_cast<bool>(v) ? 1.0f : 0.0f) : static_cast<float>(static_cast<double>(v)); }
    Node* find(const std::string& id) { auto it = byId_.find(id); return it == byId_.end() ? nullptr : it->second; }

    void setControl(Node& n, const std::string& control, float v) {
        if (control == "__bypass") {
            if (n.ownBypass) setControl(n, "bypass", v);
            else if (!n.dry.empty()) n.bypTarget = v >= 0.5f ? 1.0f : 0.0f;
            return;
        }
        if (n.host) { const int c = n.host->controlIndex(control.c_str()); if (c >= 0) n.host->setControl(c, v); return; }
        if (n.kind == Node::Out && control == "level") { n.level = v; return; }
        if (n.kind == Node::Mixer8 && control.size() == 4) {
            const int i = control[3] - '1';
            if (i < 0 || i > 7) return;
            if (control.compare(0, 3, "vol") == 0) n.vol[i] = v;
            else if (control.compare(0, 3, "pan") == 0) n.pan[i] = v;
        }
    }

    // Poorten van native modules: MIXER8 in1..in8 → out_l/out_r, OUT l/r.
    static int inIndex(Node& n, const std::string& p) {
        if (n.host) return n.host->inputIndex(p);
        if (n.kind == Node::Mixer8 && p.size() == 3 && p.compare(0, 2, "in") == 0 && p[2] >= '1' && p[2] <= '8') return p[2] - '1';
        if (n.kind == Node::Out) return p == "l" ? 0 : p == "r" ? 1 : -1;
        return -1;
    }
    static int outIndex(Node& n, const std::string& p) {
        if (n.host) return n.host->outputIndex(p);
        if (n.kind == Node::Mixer8) return p == "out_l" ? 0 : p == "out_r" ? 1 : -1;
        return -1;
    }
    static int inKind(Node& n, int i) { return n.host ? n.host->inputKind(i) : kPortAudio_; }
    static int outKind(Node& n, int o) { return n.host ? n.host->outputKind(o) : kPortAudio_; }

    /** Audiovolgorde: topologisch over de audiokabels; wat in een lus zit, achteraan (één blok vertraging). */
    void order() {
        std::unordered_map<Node*, int> indeg;
        std::vector<Node*> audio;
        for (auto& n : nodes_) {
            if (n->kind == Node::Cv) { cvNodes_.push_back(n.get()); continue; }
            audio.push_back(n.get()); indeg[n.get()] = 0;
        }
        for (auto& c : audio_) if (c.src != c.dst) ++indeg[c.dst];
        std::vector<Node*> ready;
        for (Node* n : audio) if (indeg[n] == 0) ready.push_back(n);
        while (!ready.empty()) {
            Node* n = ready.front(); ready.erase(ready.begin());
            audioOrder_.push_back(n);
            for (auto& c : audio_) if (c.src == n && c.dst != n && --indeg[c.dst] == 0) ready.push_back(c.dst);
        }
        for (Node* n : audio) if (std::find(audioOrder_.begin(), audioOrder_.end(), n) == audioOrder_.end()) audioOrder_.push_back(n);
    }

    void deliverMidi(double upTo) {
        std::size_t k = 0;
        for (; k < pending_.size() && pending_[k].at <= upTo; ++k)
            for (Node* n : midiNodes_) n->host->midi(pending_[k].s, pending_[k].d1, pending_[k].d2);
        if (k > 0) pending_.erase(pending_.begin(), pending_.begin() + static_cast<long>(k));
    }

    /** CV-kabels: lezen, en alleen bij verandering schrijven. */
    void bridge() {
        for (auto& c : cv_) {
            if (!c.src->host || c.src->host->dead()) continue;
            const float* o = c.src->host->outBuf(c.out);
            const float v = c.gain * o[c.src->kind == Node::Cv ? 0 : c.src->block - 1];
            if (c.primed && v == c.last) continue;
            c.last = v; c.primed = true;
            if (!c.dst->host) continue;
            float* in = c.dst->host->inBuf(c.in);
            const int len = c.dst->kind == Node::Cv ? 1 : c.dst->block;
            for (int k = 0; k < len; ++k) in[k] = v;
        }
    }

    const float* source(AudioCable& c, int offset) {
        if (c.src->host) return c.src->host->outBuf(c.out);
        return c.src->out[c.out] + offset;
    }

    /** Eén subblok met bypass: invoer dicht naar mate van byp (trails), droog erbij. */
    void bypassBlock(Node& n) {
        float g[kBlock];
        for (int k = 0; k < n.block; ++k) {
            n.byp += n.byp < n.bypTarget ? (std::min)(kBypassStep, n.bypTarget - n.byp) : -(std::min)(kBypassStep, n.byp - n.bypTarget);
            g[k] = n.byp;
        }
        // Droge kopie van de gebruikte ingangen, dan de invoer van het effect dichtdraaien.
        float dryIn[8][kBlock];
        int used[8], nUsed = 0;
        for (auto& [o, i, f] : n.dry) {
            if (std::find(used, used + nUsed, i) != used + nUsed || nUsed == 8) continue;
            std::copy(n.host->inBuf(i), n.host->inBuf(i) + n.block, dryIn[nUsed]);
            used[nUsed++] = i;
        }
        for (int i = 0; i < n.host->numInputs(); ++i) {
            if (n.host->inputKind(i) != kPortAudio_) continue;
            float* in = n.host->inBuf(i);
            for (int k = 0; k < n.block; ++k) in[k] *= 1.0f - g[k];
        }
        n.host->process(n.block);
        for (auto& [o, i, f] : n.dry) {
            const int u = static_cast<int>(std::find(used, used + nUsed, i) - used);
            if (u >= nUsed) continue;
            float* out = n.host->outBufMut(o);
            for (int k = 0; k < n.block; ++k) out[k] += g[k] * dryIn[u][k];
        }
    }

    void render(Node& n, float* l, float* r) {
        if (n.host) {
            for (int off = 0; off < kBlock; off += n.block) {
                // Audio-ingangen: de som van hun kabels.
                for (int i = 0; i < n.host->numInputs(); ++i) {
                    if (n.host->inputKind(i) != kPortAudio_) continue;
                    float* in = n.host->inBuf(i);
                    std::fill(in, in + n.block, 0.0f);
                    for (auto& c : audio_) {
                        if (c.dst != &n || c.in != i) continue;
                        const float* s = c.src->host ? c.src->host->outBuf(c.out) : c.src->out[c.out] + off;
                        for (int k = 0; k < n.block; ++k) in[k] += c.gain * s[k];
                    }
                }
                if (n.dry.empty() || (n.byp == 0.0f && n.bypTarget == 0.0f)) { n.host->process(n.block); continue; }
                bypassBlock(n);
            }
            return;
        }
        // Native: ingangen verzamelen (bronnen met blok 32).
        for (auto& row : n.in) std::fill(row, row + kBlock, 0.0f);
        for (auto& c : audio_) {
            if (c.dst != &n) continue;
            const float* s = c.src->host ? c.src->host->outBuf(c.out) : c.src->out[c.out];
            for (int k = 0; k < kBlock; ++k) n.in[c.in][k] += c.gain * s[k];
        }
        if (n.kind == Node::Mixer8) {
            // Equal-power pan zoals Mixer8Module.h: θ = (pan + 1)·π/4.
            std::fill(n.out[0], n.out[0] + kBlock, 0.0f);
            std::fill(n.out[1], n.out[1] + kBlock, 0.0f);
            for (int i = 0; i < 8; ++i) {
                const float th = (n.pan[i] + 1.0f) * 0.25f * 3.14159265f;
                const float gl = n.vol[i] * std::cos(th), gr = n.vol[i] * std::sin(th);
                for (int k = 0; k < kBlock; ++k) { n.out[0][k] += gl * n.in[i][k]; n.out[1][k] += gr * n.in[i][k]; }
            }
        } else if (n.kind == Node::Out) {
            for (int k = 0; k < kBlock; ++k) { l[k] += n.level * n.in[0][k]; r[k] += n.level * n.in[1][k]; }
        }
    }

    std::vector<std::unique_ptr<Node>> nodes_;
    std::unordered_map<std::string, Node*> byId_;
    std::vector<Node*> cvNodes_, audioOrder_, midiNodes_;
    std::vector<AudioCable> audio_;
    std::vector<CvCable> cv_;
    std::vector<MidiEvent> pending_;
    double clock_ = 0.0, nextTick_ = 0.0;
    int skipped_ = 0;
    bool loaded_ = false;
};

}  // namespace mmb_plugin
