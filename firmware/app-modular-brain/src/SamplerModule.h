#pragma once
/**
 * @file SamplerModule.h
 * @brief Multisample-speler (typeId `tp_mmb_sampler`) op de header-only kern
 *        `mmb_dsp::SamplePlayer`, met een `.mmbs`-bank in PSRAM.
 * @details
 * **Bank.** `SampleBank` laadt één `.mmbs`-bestand (zie `mmb_dsp/sample_bank.h`)
 * van de SD-kaart naar PSRAM: samples én keymap in één blok, zonder parser.
 * De editor schrijft dat bestand (🎹 Multisample-import); kopieer het naar
 * `/mmb/banks/NN.mmbs` op de SD. De `bank`-control kiest NN (0–15).
 * Zonder PSRAM valt de allocatie terug op de gewone heap; past de bank niet,
 * dan blijft de module stil in plaats van te crashen.
 *
 * **Stemmen.** Acht stemmen per instantie met een eigen allocator (zelfde noot
 * → hertrigger, anders vrij, anders de oudste stelen), zodat één module
 * akkoorden en overlappende uitstervingen aankan — een piano heeft immers
 * geen steady state en klinkt na loslaten door.
 *
 * Port map:
 * | Dir | portId  | Kind  | Betekenis                                   |
 * |-----|---------|-------|---------------------------------------------|
 * | in  | `voct_k` | Cv   | Toonhoogte cel k (1 V/oct, MIDI 60 = 0 V)  |
 * | in  | `gate_k` | Gate | Note-on/off cel k                           |
 * | in  | `vel_k`  | Cv   | Velocity cel k, 0..1 → kiest de laag        |
 * | in  | `cutoff_k` | Cv | Cutoff-CV van stem k (±1 → ±`cv_amt` octaven)  |
 * | out | `env_k`  | Cv   | Envelope-follower van stem k (vóór het filter) |
 * (k = 1..8; kale `voct`/`gate`/`vel` = cel 1. Multi-module: de
 *  stemtoewijzer zit in MIDI-in, niet hier — construct B in
 *  doc/uml/11-simulation-wasm.md.)
 * Filter in de cel: `filter` (0 geen / 1 SVF / 2 MS-20), `cutoff` (Hz), `q`
 * (0..1), `fmode` (0 LP / 1 HP / 2 BP), `drive`, `cv_amt` (octaven),
 * `env_rel` (ms). Dezelfde kernels als VcfModule en Ms20Module; de stem
 * verlaat de module niet, dus stereo en quad blijven intact. Auto-wah is de
 * multikabel env_k → cutoff_k in de patcher.
 * | out | `out_l` `out_r` `out_3` `out_4` | Audio | mono → L+R, stereo → 1/2, quad → 1–4 |
 * Controls: `bank` (0–15), `coarse` (semi), `fine` (ct), `start` (0..1),
 * `attack` (ms), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <SD.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string_view>

#include "mmb_dsp/sample_player.h"
#include "mmb_dsp/sample_bank.h"

#if defined(ARDUINO_TEENSY41)
extern "C" uint8_t external_psram_size;   // MB PSRAM (0 = niet gesoldeerd)
extern "C" void* extmem_malloc(size_t);
extern "C" void  extmem_free(void*);
#endif

namespace mmb_link {

/** @brief Gedeelde `.mmbs`-bank: samples + keymap in PSRAM, geladen van SD. */
class SampleBank {
public:
    static constexpr int kMaxSlots = 64;
    static constexpr int kMaxZones = 256;
    static constexpr const char* kDir = "/mmb/banks";

    static SampleBank& instance() { static SampleBank b; return b; }

    /** SD-kaart openen (ingebouwd slot). Eén keer vanuit setup(). */
    void beginStorage() {
        sdOk_ = SD.begin(BUILTIN_SDCARD);
        if (sdOk_ && !SD.exists(kDir)) { SD.mkdir("/mmb"); SD.mkdir(kDir); }
    }
    bool sdOk() const { return sdOk_; }
    uint32_t version() const { return version_; }
    int loadedBank() const { return loaded_; }

    const mmb_dsp::SampleSlot* slots() const { return slots_; }
    int numSlots() const { return numSlots_; }
    const mmb_dsp::Zone* zones() const { return zones_; }
    int numZones() const { return numZones_; }

    /** Laad `/mmb/banks/NN.mmbs`; idempotent per index. */
    bool load(int index) {
        if (index == loaded_) return numSlots_ > 0;
        numSlots_ = numZones_ = 0;
        loaded_ = index;
        ++version_;                       // stemmen herbinden, ook bij falen
        if (!sdOk_) return false;

        char path[40];
        snprintf(path, sizeof(path), "%s/%02d.mmbs", kDir, index);
        File f = SD.open(path, FILE_READ);
        if (!f) { Serial.printf("[sampler] %s niet gevonden\n", path); return false; }

        mmb_dsp::BankHeader h{};
        if (f.read(reinterpret_cast<uint8_t*>(&h), sizeof(h)) != sizeof(h)
            || std::memcmp(h.magic, "MMBS", 4) != 0 || h.version != mmb_dsp::kBankVersion
            || h.numSlots == 0 || h.numSlots > kMaxSlots || h.numZones > kMaxZones) {
            Serial.printf("[sampler] %s: ongeldige bank\n", path);
            f.close();
            return false;
        }

        // Slot- en zonetabellen.
        mmb_dsp::SlotHeader sh[kMaxSlots];
        if (f.read(reinterpret_cast<uint8_t*>(sh), sizeof(mmb_dsp::SlotHeader) * h.numSlots)
            != static_cast<int>(sizeof(mmb_dsp::SlotHeader) * h.numSlots)) { f.close(); return false; }
        mmb_dsp::ZoneRecord zr[kMaxZones];
        if (h.numZones && f.read(reinterpret_cast<uint8_t*>(zr), sizeof(mmb_dsp::ZoneRecord) * h.numZones)
            != static_cast<int>(sizeof(mmb_dsp::ZoneRecord) * h.numZones)) { f.close(); return false; }

        // Sampledata: één blok in PSRAM.
        uint32_t totalFrames = 0, totalSamples = 0;
        for (uint32_t i = 0; i < h.numSlots; ++i) {
            totalFrames += sh[i].frames;
            totalSamples += sh[i].frames * sh[i].channels;
        }
        if (!ensureCapacity(totalSamples)) {
            Serial.printf("[sampler] %s: geen geheugen voor %lu KB\n", path,
                          static_cast<unsigned long>(totalSamples * 2 / 1024));
            f.close();
            return false;
        }
        const size_t want = static_cast<size_t>(totalSamples) * sizeof(int16_t);
        const size_t got = f.read(reinterpret_cast<uint8_t*>(data_), want);
        f.close();
        if (got != want) { Serial.printf("[sampler] %s: data te kort\n", path); return false; }

        // Tabellen omzetten naar pointers in het datablok.
        uint32_t sampleOffset = 0;
        for (uint32_t i = 0; i < h.numSlots; ++i) {
            slots_[i].data     = data_ + sampleOffset;
            slots_[i].frames   = static_cast<int>(sh[i].frames);
            slots_[i].channels = static_cast<int>(sh[i].channels);
            slots_[i].rate     = sh[i].rate;
            sampleOffset += sh[i].frames * sh[i].channels;
        }
        for (uint32_t i = 0; i < h.numZones; ++i) {
            mmb_dsp::Zone& z = zones_[i];
            z.slot = static_cast<uint8_t>(zr[i].slot);
            z.lowKey = zr[i].lowKey; z.highKey = zr[i].highKey;
            z.lowVel = zr[i].lowVel; z.highVel = zr[i].highVel;
            z.root = zr[i].root; z.tuneCents = zr[i].tuneCents;
            z.gain = zr[i].gain; z.pan = zr[i].pan;
            z.loopMode = zr[i].loopMode;
            z.velTrack = zr[i].velTrack;
            z.loopStart = static_cast<int>(zr[i].loopStart);
            z.loopEnd = static_cast<int>(zr[i].loopEnd);
            z.decay = zr[i].decay; z.release = zr[i].release;
        }
        numSlots_ = static_cast<int>(h.numSlots);
        numZones_ = static_cast<int>(h.numZones);
        ++version_;
        Serial.printf("[sampler] bank %02d \"%s\": %d samples, %d zones, %lu KB, %.1f s\n",
                      index, h.name, numSlots_, numZones_,
                      static_cast<unsigned long>(totalSamples * 2 / 1024),
                      totalFrames / 44100.0f);
        return true;
    }

private:
    bool ensureCapacity(uint32_t samples) {
        if (cap_ >= samples && data_) return true;
        free();
#if defined(ARDUINO_TEENSY41)
        if (external_psram_size > 0) {
            data_ = static_cast<int16_t*>(extmem_malloc(samples * sizeof(int16_t)));
            inPsram_ = data_ != nullptr;
        }
#endif
        if (!data_) {
            data_ = static_cast<int16_t*>(std::malloc(samples * sizeof(int16_t)));
            inPsram_ = false;
        }
        cap_ = data_ ? samples : 0;
        return data_ != nullptr;
    }
    void free() {
        if (!data_) return;
#if defined(ARDUINO_TEENSY41)
        if (inPsram_) { extmem_free(data_); data_ = nullptr; }
#endif
        if (data_) std::free(data_);
        data_ = nullptr; cap_ = 0;
    }

    mmb_dsp::SampleSlot slots_[kMaxSlots];
    mmb_dsp::Zone       zones_[kMaxZones];
    int      numSlots_ = 0, numZones_ = 0, loaded_ = -1;
    int16_t* data_ = nullptr;
    uint32_t cap_ = 0, version_ = 0;
    bool     sdOk_ = false, inPsram_ = false;
};

/** @brief Acht stemmen als één AudioStream met vier uitgangen. */
class SamplerStream : public AudioStream {
public:
    static constexpr int kVoices = 8;

    SamplerStream() : AudioStream(0, nullptr) {
        for (int i = 0; i < kVoices; ++i) voice_[i].Init(AUDIO_SAMPLE_RATE_EXACT);
        rebind();
    }

    void setBank(int b) {
        if (b < 0) b = 0;
        if (b > 15) b = 15;
        if (b == bank_) return;
        bank_ = b;
        SampleBank::instance().load(bank_);
        rebind();
    }
    // Per cel (0-based). Multi-module: wie welke cel bespeelt beslist de
    // stemtoewijzer in MIDI-in of de poly-sequencer; hier zit geen allocator.
    void setVoct(int k, float v) {
        if (k < 0 || k >= kVoices) return;
        voct_[k] = v;
        voice_[k].set_voct(v);           // ook tijdens de noot (bend, glide)
    }
    void setVelocity(int k, float v) {
        if (k < 0 || k >= kVoices) return;
        vel_[k] = v < 0.f ? 0.f : (v > 1.f ? 1.f : v);
    }
    void gate(int k, bool high) {
        if (k < 0 || k >= kVoices) return;
        if (high && !gate_[k]) {
            const int midi = static_cast<int>(lroundf(60.0f + 12.0f * voct_[k]));
            voice_[k].set_voct(voct_[k]);
            voice_[k].noteOn(midi, static_cast<int>(vel_[k] * 127.0f));
        } else if (!high && gate_[k]) {
            voice_[k].noteOff(-1);
        }
        gate_[k] = high;
    }
    void setCutoffCv(int k, float v) { if (k >= 0 && k < kVoices) voice_[k].set_cutoff_cv(v); }
    float env(int k) const { return (k >= 0 && k < kVoices) ? voice_[k].env() : 0.0f; }
    void setFilterType(int t)     { for (auto& v : voice_) v.set_filter_type(t); }
    void setFilterCutoff(float hz){ for (auto& v : voice_) v.set_filter_cutoff(hz); }
    void setFilterQ(float q)      { for (auto& v : voice_) v.set_filter_resonance(q); }
    void setFilterMode(int m)     { for (auto& v : voice_) v.set_filter_mode(m); }
    void setFilterDrive(float d)  { for (auto& v : voice_) v.set_filter_drive(d); }
    void setCvAmount(float oct)   { for (auto& v : voice_) v.set_cutoff_cv_amount(oct); }
    void setEnvRelease(float ms)  { for (auto& v : voice_) v.set_env_times(2.0f, ms); }
    void setTranspose(float semis) { for (auto& v : voice_) v.set_transpose(semis); }
    void setStart(float s)  { for (auto& v : voice_) v.set_startOffset(s); }
    void setAttack(float ms){ for (auto& v : voice_) v.setAttackMs(ms); }
    void setLevel(float l)  { for (auto& v : voice_) v.set_level(l); }

    void update() override {
        if (boundVersion_ != SampleBank::instance().version()) rebind();
        for (auto& v : voice_) v.PrepareBlock();
        audio_block_t* out[4];
        for (int c = 0; c < 4; ++c) {
            out[c] = allocate();
            if (!out[c]) { for (int k = 0; k < c; ++k) release(out[k]); return; }
        }
        float mix[mmb_dsp::kMaxChannels];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) mix[c] = 0.0f;
            for (auto& v : voice_) v.Process(mix, 4);
            for (int c = 0; c < 4; ++c) {
                float y = mix[c];
                if (!(y == y)) y = 0.0f;
                if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
                out[c]->data[i] = static_cast<int16_t>(y * 32767.0f);
            }
        }
        for (int c = 0; c < 4; ++c) { transmit(out[c], c); release(out[c]); }
    }

private:
    void rebind() {
        SampleBank& b = SampleBank::instance();
        boundVersion_ = b.version();
        for (auto& v : voice_) v.bind(b.slots(), b.numSlots(), b.zones(), b.numZones());
    }

    mmb_dsp::SamplePlayer voice_[kVoices];
    uint32_t boundVersion_ = 0xffffffffu;
    int   bank_ = -1;
    float voct_[kVoices] = {};
    float vel_[kVoices]  = { 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f };
    bool  gate_[kVoices] = {};
};

class SamplerModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sampler";

    explicit SamplerModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<SamplerStream*>(&stream_);
        if (portId == "out" || portId == "out_l") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        if (portId == "out_3") return { s, 2, true };
        if (portId == "out_4") return { s, 3, true };
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (cellOf(portId, "env") >= 0) return PortKind::Cv;
        return (portId == "out" || portId == "out_l" || portId == "out_r" ||
                portId == "out_3" || portId == "out_4") ? PortKind::Audio : PortKind::None;
    }
    /** Cel-poort `<base>_<k>` (k 1-based) → 0-based celindex, of −1. Een
     *  kale `voct`/`gate`/`vel` telt als cel 1, zodat een mono-patch zonder
     *  PolyGroup gewoon werkt. */
    static int cellOf(std::string_view portId, std::string_view base) {
        if (portId == base) return 0;
        if (portId.size() <= base.size() + 1 || portId.substr(0, base.size()) != base ||
            portId[base.size()] != '_') return -1;
        int k = 0;
        for (char c : portId.substr(base.size() + 1)) {
            if (c < '0' || c > '9') return -1;
            k = k * 10 + (c - '0');
        }
        return (k >= 1 && k <= SamplerStream::kVoices) ? k - 1 : -1;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (cellOf(portId, "voct") >= 0) return PortKind::Cv;
        if (cellOf(portId, "gate") >= 0 || cellOf(portId, "trig") >= 0) return PortKind::Gate;
        if (cellOf(portId, "vel") >= 0) return PortKind::Cv;
        if (cellOf(portId, "cutoff") >= 0) return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        int k;
        if ((k = cellOf(portId, "voct")) >= 0) stream_.setVoct(k, value);
        else if ((k = cellOf(portId, "gate")) >= 0 || (k = cellOf(portId, "trig")) >= 0) stream_.gate(k, value >= 0.5f);
        else if ((k = cellOf(portId, "vel")) >= 0) stream_.setVelocity(k, value);
        else if ((k = cellOf(portId, "cutoff")) >= 0) stream_.setCutoffCv(k, value);
    }
    /** `env_k`: envelope-follower van stem k (CV-uitgang); env_k → cutoff_k is de auto-wah. */
    float readCvPort(std::string_view portId) const override {
        const int k = cellOf(portId, "env");
        return k >= 0 ? stream_.env(k) : 0.0f;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        if      (controlId == "bank")   stream_.setBank(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "coarse") { coarse_ = asFloat(0.0f); stream_.setTranspose(coarse_ + fine_ * 0.01f); }
        else if (controlId == "fine")   { fine_   = asFloat(0.0f); stream_.setTranspose(coarse_ + fine_ * 0.01f); }
        else if (controlId == "start")  stream_.setStart(asFloat(0.0f));
        else if (controlId == "attack") stream_.setAttack(asFloat(1.5f));
        else if (controlId == "level")  stream_.setLevel(asFloat(0.8f));
        else if (controlId == "filter") stream_.setFilterType(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "cutoff") stream_.setFilterCutoff(asFloat(2000.0f));
        else if (controlId == "q")      stream_.setFilterQ(asFloat(0.3f));
        else if (controlId == "fmode")  stream_.setFilterMode(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "drive")  stream_.setFilterDrive(asFloat(1.0f));
        else if (controlId == "cv_amt") stream_.setCvAmount(asFloat(4.0f));
        else if (controlId == "env_rel") stream_.setEnvRelease(asFloat(120.0f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<SamplerModule>(id);
            });
    }

private:
    mutable SamplerStream stream_;
    float coarse_ = 0.0f, fine_ = 0.0f;
};

}  // namespace mmb_link
