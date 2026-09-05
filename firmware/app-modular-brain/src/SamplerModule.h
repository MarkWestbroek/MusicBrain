#pragma once
/**
 * @file SamplerModule.h
 * @brief Sample-speler (typeId `tp_mmb_sampler`) op de header-only kern
 *        `mmb_dsp::SamplePlayer`, met een gedeelde 16-slots samplebank in
 *        PSRAM (Teensy 4.1 met gesoldeerde PSRAM) en SD als opslag.
 * @details
 * **Bank.** `SampleBank` is één statische bank voor alle instanties (zoals
 * de DX7-bank): 16 slots, elk een mono int16-sample + samplerate. Een
 * sample komt binnen via het serial-frame `sample` (chunked, zie
 * TeensyLink.h) en wordt in PSRAM gezet (`extmem_malloc`; zonder PSRAM de
 * gewone heap) én als `/mmb/samples/NN.raw` op de SD-kaart bewaard
 * (header "MMBS" + rate + lengte). Bij het kiezen van een slot dat nog
 * niet in geheugen staat, wordt hij van SD geladen. Zonder SD werkt alles
 * tot de volgende reboot.
 *
 * Port map:
 * | Dir | portId | Kind  | Betekenis                                  |
 * |-----|--------|-------|--------------------------------------------|
 * | in  | `voct` | Cv    | Toonhoogte (1 V/oct, MIDI 60 = 0 V)        |
 * | in  | `gate` | Gate  | Stijgend = (her)start, dalend = release in gate-modus |
 * | out | `out`  | Audio | Mono uitgang                               |
 * Controls: `slot` (0..15), `root` (MIDI-noot van het sample), `coarse`
 * (semi), `fine` (ct), `start`/`end` (0..1), `loop` (0/1), `mode`
 * (0 = one-shot, 1 = gate), `attack`/`release` (ms), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <SD.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string_view>

#include "mmb_dsp/sample_player.h"

#if defined(ARDUINO_TEENSY41)
extern "C" uint8_t external_psram_size;   // MB PSRAM (0 = niet gesoldeerd)
extern "C" void* extmem_malloc(size_t);
extern "C" void  extmem_free(void*);
#endif

namespace mmb_link {

/** @brief Gedeelde samplebank (16 slots) in PSRAM, met SD-persistentie. */
class SampleBank {
public:
    static constexpr int      kSlots     = 16;
    static constexpr uint32_t kMaxSamples = 44100u * 20u;   ///< 20 s per slot
    static constexpr const char* kDir    = "/mmb/samples";

    struct Slot {
        int16_t* data = nullptr;
        uint32_t len = 0;
        uint32_t cap = 0;
        float    rate = 44100.0f;
        uint32_t received = 0;    ///< samples binnen tijdens een upload
        bool     uploading = false;
        bool     sdChecked = false;
    };

    static SampleBank& instance() { static SampleBank b; return b; }

    /** Probeer de SD-kaart (Teensy 4.1 ingebouwde slot). Eén keer aanroepen. */
    void beginStorage() {
        sdOk_ = SD.begin(BUILTIN_SDCARD);
        if (sdOk_ && !SD.exists(kDir)) { SD.mkdir("/mmb"); SD.mkdir(kDir); }
    }
    bool sdOk() const { return sdOk_; }
    uint32_t version() const { return version_; }

    /** Upload starten: geheugen reserveren voor `total` samples. */
    bool beginUpload(int slot, uint32_t total, float rate) {
        if (slot < 0 || slot >= kSlots || total == 0 || total > kMaxSamples) return false;
        Slot& s = slots_[slot];
        if (!ensureCapacity(s, total)) return false;
        s.len = 0; s.received = 0; s.rate = rate > 0 ? rate : 44100.0f; s.uploading = true;
        return true;
    }
    bool chunk(int slot, uint32_t seq, const int16_t* data, uint32_t n) {
        if (slot < 0 || slot >= kSlots) return false;
        Slot& s = slots_[slot];
        if (!s.uploading) return false;
        (void)seq;
        if (s.received + n > s.cap) n = s.cap - s.received;
        std::memcpy(s.data + s.received, data, n * sizeof(int16_t));
        s.received += n;
        return true;
    }
    void endUpload(int slot) {
        if (slot < 0 || slot >= kSlots) return;
        Slot& s = slots_[slot];
        s.len = s.received; s.uploading = false; s.sdChecked = true;
        ++version_;
        saveToSd(slot);
    }

    /** Sample van slot `slot` (laadt van SD als hij nog niet in geheugen staat). */
    const Slot* get(int slot) {
        if (slot < 0 || slot >= kSlots) return nullptr;
        Slot& s = slots_[slot];
        if (s.len == 0 && !s.sdChecked) { s.sdChecked = true; loadFromSd(slot); }
        return s.len ? &s : nullptr;
    }

private:
    bool ensureCapacity(Slot& s, uint32_t samples) {
        if (s.cap >= samples) return true;
        int16_t* p = nullptr;
#if defined(ARDUINO_TEENSY41)
        if (external_psram_size > 0) {
            if (s.data) extmem_free(s.data);
            p = static_cast<int16_t*>(extmem_malloc(samples * sizeof(int16_t)));
        } else
#endif
        {
            if (s.data) std::free(s.data);
            p = static_cast<int16_t*>(std::malloc(samples * sizeof(int16_t)));
        }
        if (!p) { s.data = nullptr; s.cap = 0; s.len = 0; return false; }
        s.data = p; s.cap = samples; s.len = 0;
        return true;
    }
    static void pathFor(int slot, char* out, size_t n) { snprintf(out, n, "%s/%02d.raw", kDir, slot); }

    void saveToSd(int slot) {
        if (!sdOk_) return;
        Slot& s = slots_[slot];
        char path[40]; pathFor(slot, path, sizeof(path));
        SD.remove(path);
        File f = SD.open(path, FILE_WRITE);
        if (!f) return;
        const uint32_t rate = static_cast<uint32_t>(s.rate);
        f.write("MMBS", 4);
        f.write(reinterpret_cast<const uint8_t*>(&rate), 4);
        f.write(reinterpret_cast<const uint8_t*>(&s.len), 4);
        f.write(reinterpret_cast<const uint8_t*>(s.data), s.len * sizeof(int16_t));
        f.close();
    }
    void loadFromSd(int slot) {
        if (!sdOk_) return;
        char path[40]; pathFor(slot, path, sizeof(path));
        File f = SD.open(path, FILE_READ);
        if (!f) return;
        char magic[4]; uint32_t rate = 0, len = 0;
        if (f.read(magic, 4) != 4 || std::memcmp(magic, "MMBS", 4) != 0) { f.close(); return; }
        f.read(reinterpret_cast<uint8_t*>(&rate), 4);
        f.read(reinterpret_cast<uint8_t*>(&len), 4);
        Slot& s = slots_[slot];
        if (len == 0 || len > kMaxSamples || !ensureCapacity(s, len)) { f.close(); return; }
        const size_t got = f.read(reinterpret_cast<uint8_t*>(s.data), len * sizeof(int16_t));
        f.close();
        s.len = static_cast<uint32_t>(got / sizeof(int16_t));
        s.rate = rate > 0 ? static_cast<float>(rate) : 44100.0f;
        ++version_;
    }

    Slot     slots_[kSlots];
    bool     sdOk_ = false;
    uint32_t version_ = 0;
};

/** @brief Eén sample-speler als AudioStream. */
class SamplerStream : public AudioStream {
public:
    SamplerStream() : AudioStream(0, nullptr) {
        player_.Init(AUDIO_SAMPLE_RATE_EXACT);
        bind();
    }
    mmb_dsp::SamplePlayer& player() { return player_; }
    void setSlot(int s) { slot_ = s < 0 ? 0 : (s >= SampleBank::kSlots ? SampleBank::kSlots - 1 : s); bind(); }

    void update() override {
        if (boundVersion_ != SampleBank::instance().version()) bind();
        audio_block_t* out = allocate();
        if (!out) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float y = player_.Process();
            if (!(y == y)) y = 0.0f;
            if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
            out->data[i] = static_cast<int16_t>(y * 32767.0f);
        }
        transmit(out, 0);
        release(out);
    }

private:
    void bind() {
        SampleBank& bank = SampleBank::instance();
        boundVersion_ = bank.version();
        const SampleBank::Slot* s = bank.get(slot_);
        if (s) player_.setSample(s->data, static_cast<int>(s->len), s->rate);
        else   player_.setSample(nullptr, 0, AUDIO_SAMPLE_RATE_EXACT);
    }
    mmb_dsp::SamplePlayer player_;
    int      slot_ = 0;
    uint32_t boundVersion_ = 0xffffffffu;
};

class SamplerModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sampler";

    explicit SamplerModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<SamplerStream*>(&stream_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (portId == "gate" || portId == "trig") return PortKind::Gate;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.player().set_voct(value);
        else if (portId == "gate" || portId == "trig") stream_.player().gate(value >= 0.5f);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fallback;
        };
        auto& p = stream_.player();
        if      (controlId == "slot")    stream_.setSlot(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "root")    p.set_root(asFloat(60.0f));
        else if (controlId == "coarse")  p.set_coarse(asFloat(0.0f));
        else if (controlId == "fine")    p.set_fine(asFloat(0.0f));
        else if (controlId == "start")   p.set_start(asFloat(0.0f));
        else if (controlId == "end")     p.set_end(asFloat(1.0f));
        else if (controlId == "loop")    p.set_loop(asFloat(0.0f) >= 0.5f);
        else if (controlId == "mode")    p.set_gate_mode(asFloat(0.0f) >= 0.5f);
        else if (controlId == "attack")  p.set_attack_ms(asFloat(2.0f));
        else if (controlId == "release") p.set_release_ms(asFloat(30.0f));
        else if (controlId == "level")   p.set_level(asFloat(0.8f));
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
};

}  // namespace mmb_link
