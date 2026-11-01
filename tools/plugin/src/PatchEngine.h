#pragma once
// Een hele patch in de plugin (doc/plans/plugin-patches.md §4–5): de JSON die
// de Teensy krijgt (buildConfigPayload in teensyLink.ts: poly-groepen
// uitgevouwen, alle knoppen erbij), met elke module als wasm2c-instantie
// (W2cRuntime.h) en de mixers (4/8/16) en OUT native zoals de firmware ze doet.
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
// Modules op een andere rate of blokgrootte (Plaits/Rings 48 kHz, Elements/
// Clouds 32 kHz, DX7 blok 64, Warps blok 60): eerst mag een module met
// MMB_RATE_FLEX zelf naar 44,1 kHz (setRate vóór init). Lukt dat niet, dan
// draait hij achter een fifo met een Lagrange-resampler per audiopoort, zoals
// HostProcessor dat voor een losse plugin doet ("Resampled"). Dat kost hem
// een paar blokken vertraging; zijn CV-poorten gaan gewoon via de bridge.
//
// Transport van de DAW (transport()): een ritmebox (tp_mmb_rhythm) loopt mee
// zodra de DAW speelt. Bij de eerstvolgende maatstreep: Run aan op de externe
// klok (ExtClock), daarna een puls op elke tel op `clock`; de box verdeelt de
// stappen zelf over de tel; tot die maatstreep zwijgt hij. Stopt de DAW,
// dan stopt de box; springt de
// positie (cycle, verplaatsen), dan begint hij weer bij de volgende
// maatstreep. Speelt de DAW niet, dan loopt de box vrij op zijn Tempo.
//
// Bypass (plugin-patches.md §9): de pseudo-knop `__bypass` in controlState.
// Welke modules en hoe staat per type in "bypass" naast "project" in de JSON
// (de generator haalt het uit bypassRoute.ts): { "own": true } = de module
// heeft zelf een knop `bypass`, die zetten we; anders [uitgang, ingang,
// terugval?] voor het droge pad (terugval: als de ingang geen kabel heeft,
// bv. in_r bij een mono bron, zoals de firmware mono op beide kanten zet). Overgang in ~10 ms, met trails: de invoer van het
// effect gaat dicht, zijn uitgang klinkt uit, het droge signaal komt erbij.

#include "MmbsLoad.h"
#include "W2cRuntime.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

#include <cstring>
#if __has_include("dx7_roms.h")
#include "dx7_roms.h"   // de 8 DX7-fabrieksbanken (generated/, uit editor/public/dx7/roms.bin)
#define MMB_HAVE_DX7_ROMS 1
#endif

#include <algorithm>
#include <atomic>
#include <map>
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
                // De mixers rekent de motor zelf (Mixer8Module.h en broers: vol/pan per kanaal).
                if (type == "tp_mmb_mixer8") { node->kind = Node::Mixer; node->channels = 8; }
                else if (type == "tp_mmb_mixer") { node->kind = Node::Mixer; node->channels = 4; }
                else if (type == "tp_mmb_mixer16") { node->kind = Node::Mixer; node->channels = 16; }
                else if (type == "tp_mmb_out") node->kind = Node::Out;
                else {
                    const W2cVtable* vt = factory(type);
                    if (!vt) { std::printf("[mmb] patch: %s (%s) heeft geen wasm, overgeslagen\n", id.c_str(), type.c_str()); continue; }
                    node->host = std::make_unique<W2cHost>(*vt);
                    node->host->setRate(static_cast<float>(kRate));   // alleen met MMB_RATE_FLEX
                    node->host->init();
#ifdef MMB_HAVE_DX7_ROMS
                    // DX7: de fabrieksbanken als blobs, zoals de editor ze stuurt (slot 0..7);
                    // anders speelt hij alleen zijn ingebouwde E.PIANO 1, wat Bank en Program ook zeggen.
                    if (type == "tp_mmb_dx7" && node->host->hasBlobs())
                        for (int b = 0; b < kDx7RomBanks; ++b)
                            if (int16_t* p = node->host->blobPtr(b, 4096)) { std::memcpy(p, kDx7Roms[b], 4096); node->host->blobCommit(b, 0, 0.0f, 1); }
#endif
                    const float rate = node->host->nativeRate();
                    const int block = node->host->block();
                    if (block == 1 && rate == 1000.0f) node->kind = Node::Cv;
                    else if (rate == static_cast<float>(kRate) && block > 0 && kBlock % block == 0) {
                        node->kind = Node::Audio;
                        if (block < kBlock) node->full.assign(static_cast<std::size_t>(node->host->numOutputs()), std::vector<float>(kBlock, 0.0f));
                    }
                    else if (rate > 0.0f && block > 0 && block <= kMaxForeignBlock) {
                        node->kind = Node::Audio;
                        node->rs = std::make_unique<Resampled>(*node->host, rate, block);
                        std::printf("[mmb] patch: %s draait op %.0f Hz, blok %d, met een resampler\n", type.c_str(), rate, block);
                    }
                    else { error = juce::String(type) + ": " + juce::String(rate) + " Hz, blok " + juce::String(block) + " kan nog niet in een patch"; return false; }
                    node->block = block;
                    if (node->host->hasMidi()) midiNodes_.push_back(node.get());
                    if (type == "tp_mmb_rhythm") rhythmNodes_.push_back(node.get());
                    // Samplebanken (sampler, TAPE STRIP, PERCUTER): de Bank-knop kiest een
                    // .mmbs uit de bankmap; laden doet loadBanks() (buiten de audiothread).
                    if (node->host->hasBank() && type != "tp_mmb_zang") { node->bankNode = true; node->wantBank = 0; bankNodes_.push_back(node.get()); }
                    // ZANG (lyricbanken) laadt de motor nog niet: zo'n module blijft stil.
                    else if (type == "tp_mmb_zang" &&
                        std::find(needsBank_.begin(), needsBank_.end(), type) == needsBank_.end()) {
                        needsBank_.push_back(type);
                        std::printf("[mmb] patch: %s heeft een lyricbank nodig; die laadt de patchmotor nog niet, dus hij blijft stil\n", type.c_str());
                    }
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
    /** Leest de bank van knopstand n (de bankmap); false als die er niet is. */
    using BankReader = std::function<bool(int knob, juce::MemoryBlock& data)>;

    /** Wacht er een Bank-knop op een andere bank? */
    bool banksPending() const {
        for (const Node* n : bankNodes_) if (n->wantBank.load() != n->loadedBank) return true;
        return false;
    }
    /**
     * Laadt de gevraagde banken (message-thread). @p lock: om het overzetten
     * heen (de callback-lock van de plugin), of null zolang de motor nog niet
     * speelt. Fouten komen in @p errors ("SAMPLER: geen bank 21").
     */
    void loadBanks(const BankReader& read, const juce::CriticalSection* lock, juce::StringArray& errors) {
        std::map<int, juce::MemoryBlock> cache;   // een poly-groep vraagt acht keer dezelfde bank
        for (Node* n : bankNodes_) {
            const int want = n->wantBank.load();
            if (want == n->loadedBank) continue;
            auto it = cache.find(want);
            if (it == cache.end()) {
                juce::MemoryBlock data;
                if (!read(want, data)) data.reset();
                it = cache.emplace(want, std::move(data)).first;
            }
            n->loadedBank = want;
            const juce::String who = juce::String(n->type).fromFirstOccurrenceOf("tp_mmb_", false, false).toUpperCase();
            if (it->second.getSize() == 0) { errors.addIfNotAlreadyThere(who + ": geen bank " + juce::String(want) + " in de bankmap"); continue; }
            juce::String error;
            bool ok;
            if (lock) { const juce::ScopedLock sl(*lock); ok = applyMmbs(*n->host, it->second.getData(), it->second.getSize(), error); }
            else ok = applyMmbs(*n->host, it->second.getData(), it->second.getSize(), error);
            if (!ok) errors.addIfNotAlreadyThere(who + ": " + error);
        }
    }

    /**
     * Transport van de DAW voor het volgende stuk van @p span motorsamples,
     * dat begint op motorsample @p at: speelt hij, tempo, positie in kwartnoten
     * en de maatlengte in kwartnoten.
     */
    void transport(bool playing, double bpm, double ppq, double barQuarters, double at, double span) {
        if (rhythmNodes_.empty()) return;
        if (!playing || bpm <= 0.0) {
            if (syncPlaying_) syncEvents_.push_back({ at, SyncStop });
            syncPlaying_ = false;
            return;
        }
        const double qPerSample = bpm / 60.0 / kRate;
        // Begin, of een sprong (cycle, verplaatsen): wachten op de volgende maatstreep.
        if (!syncPlaying_ || std::abs(ppq - syncNextPpq_) > 0.01) {
            syncPlaying_ = true; syncArmed_ = true;
            syncEvents_.push_back({ at, SyncStop });   // stil tot de maatstreep, niet vrij doorlopen
        }
        syncNextPpq_ = ppq + span * qPerSample;
        if (bpm != syncBpm_) { syncBpm_ = bpm; for (Node* n : rhythmNodes_) setControl(*n, "tempo", static_cast<float>(bpm)); }
        const double bar = barQuarters > 0.0 ? barQuarters : 4.0;
        // Net na een maatstreep begonnen (binnen 1/20 kwart): dat is op de maatstreep.
        if (syncArmed_ && std::fmod(ppq, bar) < 0.05) {
            syncEvents_.push_back({ at, SyncStart });
            syncEvents_.push_back({ at, SyncBeat });
            syncEvents_.push_back({ at + 0.005 * kRate, SyncBeatOff });
            syncArmed_ = false;
        }
        for (double q = std::ceil(ppq - 1.0e-9); q < syncNextPpq_; q += 1.0) {
            if (q < ppq + 1.0e-9 && !syncEvents_.empty() && syncEvents_.back().what == SyncBeatOff && syncEvents_.back().at > at) continue;   // die tel is al gegeven
            const double t = at + (q - ppq) / qPerSample;
            const double inBar = std::fmod(q, bar);
            if (syncArmed_) {
                if (inBar > 1.0e-6 && bar - inBar > 1.0e-6) continue;
                syncEvents_.push_back({ t, SyncStart });
                syncArmed_ = false;
            }
            syncEvents_.push_back({ t, SyncBeat });
            syncEvents_.push_back({ t + 0.005 * kRate, SyncBeatOff });   // puls van 5 ms
        }
    }

    void process(float* l, float* r) {
        applySync();
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
    static constexpr int kMaxForeignBlock = 256;   // bypassBlock rekent op de stack met deze maat

    /** Een module op een andere rate of blokgrootte: fifo's en resamplers om
     *  hem heen. In: per audio-ingang 44,1 kHz → eigen rate; uit: per
     *  audio-uitgang terug, kBlock samples per motorblok in `out`. */
    struct Resampled {
        Resampled(W2cHost& h, float rate, int block) : ratio(rate / kRate), block(block) {
            for (int i = 0; i < h.numInputs(); ++i) if (h.inputKind(i) == kPortAudio_) ins.push_back(i);
            for (int o = 0; o < h.numOutputs(); ++o) if (h.outputKind(o) == kPortAudio_) outs.push_back(o);
            in.assign(ins.size(), {}); inInterp.resize(ins.size());
            outFifo.assign(outs.size(), {}); outInterp.resize(outs.size());
            out.assign(static_cast<std::size_t>(h.numOutputs()), std::vector<float>(kBlock, 0.0f));
            // Voorsprong: twee eigen blokken stilte, zodat er altijd genoeg is.
            for (auto& f : outFifo) f.assign(static_cast<std::size_t>(2 * block + 8), 0.0f);
        }
        double ratio;                 // eigen samples per motorsample
        int block;
        double carry = 0.0;
        int pending = 0;              // eigen samples die de module nog moet rekenen
        std::vector<int> ins, outs;   // poortnummers van de audiopoorten
        std::vector<std::vector<float>> in, outFifo, out;
        std::vector<juce::LagrangeInterpolator> inInterp, outInterp;
    };

    struct Node {
        enum Kind { Cv, Audio, Mixer, Out } kind = Audio;
        std::unique_ptr<Resampled> rs;   // niet null: andere rate of blokgrootte
        bool bankNode = false;           // samplebank via de Bank-knop
        std::atomic<int> wantBank { -1 };   // gevraagd (audiothread schrijft)
        int loadedBank = -1;                // erin (message-thread)
        std::vector<std::vector<float>> full;   // blok < kBlock: de uitgangen over het hele motorblok
        std::string id, type;
        std::unique_ptr<W2cHost> host;
        int block = kBlock;
        // Native MIXER (4/8/16 kanalen) en OUT.
        int channels = 0;
        float vol[16] = { 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f }, pan[16] = {};
        float level = 1.0f;
        float in[16][kBlock] = {};
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
        if (n.bankNode && control == "bank") n.wantBank = static_cast<int>(std::lround(v));
        if (n.host) { const int c = n.host->controlIndex(control.c_str()); if (c >= 0) n.host->setControl(c, v); return; }
        if (n.kind == Node::Out && control == "level") { n.level = v; return; }
        if (n.kind == Node::Mixer && control.size() >= 4) {
            const int i = channelIndex(control, 3, n.channels);
            if (i < 0) return;
            if (control.compare(0, 3, "vol") == 0) n.vol[i] = v;
            else if (control.compare(0, 3, "pan") == 0) n.pan[i] = v;
        }
    }

    /** "vol12" vanaf @p at → 11; −1 als het geen kanaal 1..@p channels is. */
    static int channelIndex(const std::string& s, std::size_t at, int channels) {
        if (s.size() <= at || s.size() > at + 2) return -1;
        int v = 0;
        for (std::size_t k = at; k < s.size(); ++k) { if (s[k] < '0' || s[k] > '9') return -1; v = v * 10 + (s[k] - '0'); }
        return v >= 1 && v <= channels ? v - 1 : -1;
    }

    // Poorten van native modules: MIXER in1..inN → out_l/out_r, OUT l/r.
    static int inIndex(Node& n, const std::string& p) {
        if (n.host) return n.host->inputIndex(p);
        if (n.kind == Node::Mixer && p.compare(0, 2, "in") == 0) return channelIndex(p, 2, n.channels);
        if (n.kind == Node::Out) return p == "l" ? 0 : p == "r" ? 1 : -1;
        return -1;
    }
    static int outIndex(Node& n, const std::string& p) {
        if (n.host) {
            const int i = n.host->outputIndex(p);
            if (i >= 0) return i;
            // Paneelnamen die de firmware aliast (PlaitsModule.h): out → out_l, aux → out_r.
            if (p == "out") return n.host->outputIndex("out_l");
            if (p == "aux") return n.host->outputIndex("out_r");
            return -1;
        }
        if (n.kind == Node::Mixer) return p == "out_l" ? 0 : p == "out_r" ? 1 : -1;
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

    enum SyncWhat { SyncStart, SyncBeat, SyncBeatOff, SyncStop };
    struct SyncEvent { double at; SyncWhat what; };

    /** Transportgebeurtenissen die in dit blok vallen (op blokgrens: ≤ 0,7 ms). */
    void applySync() {
        if (syncEvents_.empty()) return;
        std::size_t k = 0;
        for (; k < syncEvents_.size() && syncEvents_[k].at < clock_ + kBlock; ++k)
            for (Node* n : rhythmNodes_) {
                switch (syncEvents_[k].what) {
                    case SyncStart: setControl(*n, "extclock", 1.0f); setControl(*n, "run", 1.0f); break;
                    case SyncStop:  setControl(*n, "run", 0.0f); setControl(*n, "extclock", 0.0f); break;
                    case SyncBeat:
                    case SyncBeatOff: {
                        const int in = n->host->inputIndex("clock");
                        if (in < 0) break;
                        float* buf = n->host->inBuf(in);
                        std::fill(buf, buf + n->block, syncEvents_[k].what == SyncBeat ? 1.0f : 0.0f);
                        n->host->setConnected(in, 1);
                        break;
                    }
                }
            }
        if (k > 0) syncEvents_.erase(syncEvents_.begin(), syncEvents_.begin() + static_cast<long>(k));
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

    /** Uitgang van een kabelbron, voor subblok @p offset van het motorblok. */
    static const float* source(AudioCable& c, int offset) {
        if (c.src->rs) return c.src->rs->out[static_cast<std::size_t>(c.out)].data() + offset;
        if (c.src->host && !c.src->full.empty()) return c.src->full[static_cast<std::size_t>(c.out)].data() + offset;
        if (c.src->host) return c.src->host->outBuf(c.out);
        return c.src->out[c.out] + offset;
    }

    /** Een motorblok voor een module achter de resampler. */
    void renderResampled(Node& n) {
        Resampled& r = *n.rs;
        // Ingangen op 44,1 kHz verzamelen en naar de eigen rate.
        const double want = kBlock * r.ratio + r.carry;
        const int native = static_cast<int>(want);
        r.carry = want - native;
        float gathered[kBlock];
        for (std::size_t a = 0; a < r.ins.size(); ++a) {
            std::fill(gathered, gathered + kBlock, 0.0f);
            for (auto& c : audio_) {
                if (c.dst != &n || c.in != r.ins[a]) continue;
                const float* s = source(c, 0);
                for (int k = 0; k < kBlock; ++k) gathered[k] += c.gain * s[k];
            }
            auto& f = r.in[a];
            const std::size_t at = f.size();
            f.resize(at + static_cast<std::size_t>(native));
            if (r.ratio == 1.0) std::copy(gathered, gathered + native, f.begin() + static_cast<long>(at));
            else r.inInterp[a].process(1.0 / r.ratio, gathered, f.data() + at, native, kBlock, 0);
        }
        // De module in zijn eigen blokken; zonder audio-ingang telt alleen de klok.
        r.pending += native;
        while (r.pending >= r.block) {
            for (std::size_t a = 0; a < r.ins.size(); ++a) {
                auto& f = r.in[a];
                float* dst = n.host->inBuf(r.ins[a]);
                const std::size_t take = std::min<std::size_t>(f.size(), static_cast<std::size_t>(r.block));
                std::copy(f.begin(), f.begin() + static_cast<long>(take), dst);
                std::fill(dst + take, dst + r.block, 0.0f);
                f.erase(f.begin(), f.begin() + static_cast<long>(take));
            }
            if (n.dry.empty() || (n.byp == 0.0f && n.bypTarget == 0.0f)) n.host->process(r.block);
            else bypassBlock(n);
            for (std::size_t o = 0; o < r.outs.size(); ++o) {
                const float* src = n.host->outBuf(r.outs[o]);
                r.outFifo[o].insert(r.outFifo[o].end(), src, src + r.block);
            }
            r.pending -= r.block;
        }
        // Terug naar 44,1 kHz: kBlock samples per uitgang.
        for (std::size_t o = 0; o < r.outs.size(); ++o) {
            auto& f = r.outFifo[o];
            float* dst = r.out[static_cast<std::size_t>(r.outs[o])].data();
            const int need = static_cast<int>(std::ceil(kBlock * r.ratio)) + 4;
            if (static_cast<int>(f.size()) < need) f.insert(f.begin(), static_cast<std::size_t>(need) - f.size(), 0.0f);
            int used;
            if (r.ratio == 1.0) { std::copy(f.begin(), f.begin() + kBlock, dst); used = kBlock; }
            else used = r.outInterp[o].process(r.ratio, f.data(), dst, kBlock, static_cast<int>(f.size()), 0);
            f.erase(f.begin(), f.begin() + used);
        }
    }

    /** Eén subblok met bypass: invoer dicht naar mate van byp (trails), droog erbij. */
    void bypassBlock(Node& n) {
        float g[kMaxForeignBlock];
        for (int k = 0; k < n.block; ++k) {
            n.byp += n.byp < n.bypTarget ? (std::min)(kBypassStep, n.bypTarget - n.byp) : -(std::min)(kBypassStep, n.byp - n.bypTarget);
            g[k] = n.byp;
        }
        // Droge kopie van de gebruikte ingangen, dan de invoer van het effect dichtdraaien.
        float dryIn[8][kMaxForeignBlock];
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
        if (n.rs) { renderResampled(n); return; }
        if (n.host) {
            for (int off = 0; off < kBlock; off += n.block) {
                // Audio-ingangen: de som van hun kabels.
                for (int i = 0; i < n.host->numInputs(); ++i) {
                    if (n.host->inputKind(i) != kPortAudio_) continue;
                    float* in = n.host->inBuf(i);
                    std::fill(in, in + n.block, 0.0f);
                    for (auto& c : audio_) {
                        if (c.dst != &n || c.in != i) continue;
                        const float* s = source(c, off);
                        for (int k = 0; k < n.block; ++k) in[k] += c.gain * s[k];
                    }
                }
                if (n.dry.empty() || (n.byp == 0.0f && n.bypTarget == 0.0f)) n.host->process(n.block);
                else bypassBlock(n);
                // Kleiner blok: elk subblok bewaren, zodat wie erna komt het hele motorblok leest.
                for (std::size_t o = 0; o < n.full.size(); ++o) {
                    const float* src = n.host->outBuf(static_cast<int>(o));
                    std::copy(src, src + n.block, n.full[o].begin() + off);
                }
            }
            return;
        }
        // Native: ingangen verzamelen (bronnen met blok 32).
        for (auto& row : n.in) std::fill(row, row + kBlock, 0.0f);
        for (auto& c : audio_) {
            if (c.dst != &n) continue;
            const float* s = source(c, 0);
            for (int k = 0; k < kBlock; ++k) n.in[c.in][k] += c.gain * s[k];
        }
        if (n.kind == Node::Mixer) {
            // Equal-power pan zoals Mixer8Module.h: θ = (pan + 1)·π/4.
            std::fill(n.out[0], n.out[0] + kBlock, 0.0f);
            std::fill(n.out[1], n.out[1] + kBlock, 0.0f);
            for (int i = 0; i < n.channels; ++i) {
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
    std::vector<Node*> cvNodes_, audioOrder_, midiNodes_, rhythmNodes_, bankNodes_;
    std::vector<SyncEvent> syncEvents_;
    bool syncPlaying_ = false, syncArmed_ = false;
    double syncNextPpq_ = 0.0, syncBpm_ = 0.0;
    std::vector<AudioCable> audio_;
    std::vector<CvCable> cv_;
    std::vector<MidiEvent> pending_;
    double clock_ = 0.0, nextTick_ = 0.0;
    int skipped_ = 0;
    bool loaded_ = false;
    std::vector<std::string> needsBank_;
public:
    /** Moduletypen in de patch die een bank nodig hebben (en dus stil blijven). */
    const std::vector<std::string>& needsBank() const { return needsBank_; }
};

}  // namespace mmb_plugin
