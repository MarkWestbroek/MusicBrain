#pragma once
/**
 * @file ZangModule.h
 * @brief Zingende stemmen (typeId `tp_mmb_zang`): ingesproken lettergrepen op
 *        de noten die je speelt, met PSOLA (kern `mmb_dsp::ZangEngine`).
 * @details
 * **Bank.** `LyricStore` leest één `.mmbl`-bestand (zie
 * `mmb_dsp/lyric_bank.h`) van de SD-kaart, `/mmb/lyrics/NN.mmbl`, in één keer
 * naar PSRAM. Eigen opslag, los van de sampler: koor en zang kunnen samen in
 * één patch. Een lyricbank is klein (22 kHz mono, ~44 KB per seconde), dus
 * er wordt niet gestreamd. De editor maakt het bestand en stuurt het via de
 * link (`bankPut` met `"kind":"lyric"`).
 *
 * **Stemmen.** Acht cellen zoals de sampler; de stemtoewijzer zit in MIDI-in.
 * De CV-kant zet alleen gewenste standen neer (gate, V/Oct, velocity); de
 * audioroutine ziet de flanken aan het begin van elk blok en start of lost de
 * stem daar. Zo raakt alleen de audioroutine de stemmen aan.
 *
 * Port map:
 * | Dir | portId      | Kind  | Betekenis                                   |
 * |-----|-------------|-------|---------------------------------------------|
 * | in  | `voct_k`    | Cv    | Toonhoogte cel k (1 V/oct, MIDI 60 = 0 V)  |
 * | in  | `gate_k`    | Gate  | Noot aan/uit cel k                          |
 * | in  | `vel_k`     | Cv    | Velocity cel k, 0..1                        |
 * | in  | `bend`      | Cv    | Gedeelde bend (V/Oct) op alle cellen        |
 * | in  | `syl_cv`    | Cv    | Kiest de lettergreep (0..1), telt op bij `syl` |
 * | in  | `formant_cv`| Cv    | Formantverschuiving, ±1 = ±1 octaaf         |
 * | in  | `next`      | Gate  | Flank = volgende lettergreep                |
 * | in  | `reset`     | Gate  | Flank = terug naar `syl`                    |
 * | out | `out_l` `out_r` | Audio | Som van de stemmen (mono op beide)      |
 * | out | `syl_out`   | Cv    | Huidige lettergreep, 0..1                   |
 * (k = 1..8; kale `voct`/`gate`/`vel` = cel 1.)
 *
 * Controls: `bank` (0–15), `syl` (beginlettergreep), `mode` (0 vast /
 * 1 volgende per aanslag / 2 idem, terug na 2 s stilte), `speed` (0,25–4),
 * `formant` (halve tonen), `attack` `release` (ms), `coarse` (semi), `fine`
 * (ct), `level` (0..1).
 *
 * Plan en achtergrond: doc/plans/zingende-stemmen.md.
 */
#include "AudioModule.h"
#include "SamplerModule.h"          // SampleBank opent de SD-kaart; die delen we
#include "mb/runtime/Registry.h"
#include "mmb_dsp/psola.h"
#include <Arduino.h>
#include <Audio.h>
#include <SD.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string_view>

namespace mmb_link {

/** @brief De lyricbank in het geheugen, gedeeld door alle ZANG-modules. */
class LyricStore {
public:
    static constexpr const char* kDir = "/mmb/lyrics";
    /** Bank-id's op de link: 100 + NN, zodat `bankPut` één protocol blijft. */
    static constexpr int kLinkBase = 100;
    static constexpr uint32_t kMaxBytes = 12u * 1024u * 1024u;

    static LyricStore& instance() { static LyricStore s; return s; }

    /** Oplopend bij elke wissel: de audioroutine bindt dan opnieuw. */
    uint32_t version() const { return version_; }
    const mmb_dsp::LyricBank* bank() const { return bank_.valid() ? &bank_ : nullptr; }
    int loaded() const { return loaded_; }
    int syllables() const { return bank_.numSyllables(); }
    const char* name() const { return bank_.name(); }
    uint32_t bytes() const { return bytes_; }

    /** Naam van bank k op de kaart ("" = niet aanwezig, "?" = geen geldige bank). */
    const char* cardName(int k) const { return (k >= 0 && k < 16) ? names_[k] : ""; }
    /** Hoogste banknummer op de kaart, of −1. */
    int cardLast() const {
        int last = -1;
        for (int k = 0; k < 16; ++k) if (names_[k][0]) last = k;
        return last;
    }
    /** Kaart inventariseren: de naam uit de kop van elke NN.mmbl. Bij het
     *  opstarten, na een upload en na verwijderen. */
    void snapshot() {
        for (auto& n : names_) n[0] = '\0';
        if (!card()) return;
        char path[40];
        for (int k = 0; k < 16; ++k) {
            snprintf(path, sizeof(path), "%s/%02d.mmbl", kDir, k);
            FsFile f = SD.sdfs.open(path, O_READ);
            if (!f) continue;
            mmb_dsp::LyricHeader h{};
            const bool ok = f.read(&h, sizeof(h)) == static_cast<int>(sizeof(h))
                         && std::memcmp(h.magic, "MMBL", 4) == 0;
            f.close();
            if (!ok) { std::strcpy(names_[k], "?"); continue; }
            std::memcpy(names_[k], h.name, sizeof(h.name));
            names_[k][sizeof(names_[k]) - 1] = '\0';
            if (!names_[k][0]) std::strcpy(names_[k], "(zonder naam)");
        }
        scanned_ = true;
    }
    bool scanned() const { return scanned_; }

    /**
     * Laad `/mmb/lyrics/NN.mmbl`. Vanuit de main thread. De stemmen zwijgen
     * eerst (versie omhoog, even wachten tot de audioroutine het gezien
     * heeft), dan pas verhuist het blok.
     */
    bool load(int index) {
        if (index < 0) index = 0;
        if (index > 15) index = 15;
        if (index == loaded_ && bank_.valid()) return true;
        release();
        loaded_ = index;
        if (!card()) return false;
        char path[40];
        snprintf(path, sizeof(path), "%s/%02d.mmbl", kDir, index);
        FsFile f = SD.sdfs.open(path, O_READ);
        if (!f) { Serial.printf("[zang] bank %02d: %s niet gevonden\n", index, path); return false; }
        const uint64_t size = f.fileSize();
        if (size < sizeof(mmb_dsp::LyricHeader) || size > kMaxBytes) {
            f.close();
            Serial.printf("[zang] bank %02d: ongeldige grootte\n", index);
            return false;
        }
        if (!reserve(static_cast<uint32_t>(size))) {
            f.close();
            Serial.printf("[zang] bank %02d: geen geheugen voor %lu KB\n", index,
                          static_cast<unsigned long>(size / 1024));
            return false;
        }
        uint32_t got = 0;
        while (got < size) {
            const uint32_t want = static_cast<uint32_t>(size) - got > 32768u ? 32768u : static_cast<uint32_t>(size) - got;
            const int n = f.read(data_ + got, want);
            if (n <= 0) break;
            got += static_cast<uint32_t>(n);
        }
        f.close();
        if (got != size || !bank_.attach(data_, got)) {
            bank_.detach();
            Serial.printf("[zang] bank %02d: geen geldige lyricbank\n", index);
            ++version_;
            return false;
        }
        bytes_ = got;
        ++version_;
        Serial.printf("[zang] bank %02d \"%s\": %d lettergrepen, %lu KB (%s)\n", index, bank_.name(),
                      bank_.numSyllables(), static_cast<unsigned long>(got / 1024), inPsram_ ? "PSRAM" : "heap");
        return true;
    }

    // ── upload via de link ──────────────────────────────────────────────
    bool uploadBegin(int index, uint32_t size, uint32_t crc32 = 0) {
        if (index < 0 || index > 15 || size > kMaxBytes) return false;
        if (!card()) return false;
        if (upFile_) upFile_.close();
        char path[40];
        snprintf(path, sizeof(path), "%s/%02d.part", kDir, index);
        SD.sdfs.remove(path);
        upFile_ = SD.sdfs.open(path, O_WRITE | O_CREAT | O_TRUNC);
        if (!upFile_) return false;
        upFile_.preAllocate(size);
        upErr_ = false; upIndex_ = index; upBytes_ = 0;
        upCrcWant_ = crc32; upCrc_ = 0xFFFFFFFFu;
        return true;
    }
    void uploadBytes(const uint8_t* d, size_t n) {
        if (!upFile_ || upErr_) return;
        if (upFile_.write(d, n) != n) upErr_ = true; else upBytes_ += n;
        if (upCrcWant_) upCrc_ = SampleBank::crc32Update(upCrc_, d, n);
    }
    bool uploadDone(int index, bool ok) {
        if (upFile_) upFile_.close();
        char part[40], dst[40];
        snprintf(part, sizeof(part), "%s/%02d.part", kDir, index);
        snprintf(dst, sizeof(dst), "%s/%02d.mmbl", kDir, index);
        if (!ok || upErr_ || index != upIndex_) { SD.sdfs.remove(part); return false; }
        if (upCrcWant_ && (upCrc_ ^ 0xFFFFFFFFu) != upCrcWant_) {
            SD.sdfs.remove(part);
            Serial.printf("[zang] bank %02d: CRC klopt niet, verworpen\n", index);
            return false;
        }
        if (!validFile(part, upBytes_)) {
            SD.sdfs.remove(part);
            Serial.printf("[zang] bank %02d: upload ongeldig (%lu bytes), verworpen\n", index,
                          static_cast<unsigned long>(upBytes_));
            return false;
        }
        const bool reload = loaded_ == index;
        if (reload) release();
        SD.sdfs.remove(dst);
        if (!SD.sdfs.rename(part, dst)) { SD.sdfs.remove(part); return false; }
        if (reload) { loaded_ = -1; load(index); }
        snapshot();
        Serial.printf("[zang] bank %02d geschreven via de link: %lu KB\n", index,
                      static_cast<unsigned long>(upBytes_ / 1024));
        return true;
    }
    bool deleteBank(int index) {
        if (index < 0 || index > 15 || !card()) return false;
        char dst[40];
        snprintf(dst, sizeof(dst), "%s/%02d.mmbl", kDir, index);
        if (loaded_ == index) { release(); loaded_ = -1; }
        const bool ok = SD.sdfs.remove(dst);
        snapshot();
        return ok;
    }

private:
    bool card() {
        SampleBank& sb = SampleBank::instance();
        if (!sb.sdOk() && !sb.mountIfMissing(true)) return false;
        if (!dirReady_) {
            if (!SD.exists("/mmb")) SD.mkdir("/mmb");
            if (!SD.exists(kDir)) SD.mkdir(kDir);
            dirReady_ = true;
        }
        return true;
    }

    /** Kop lezen en de verwachte minimale grootte tegen `size` leggen. */
    static bool validFile(const char* path, uint32_t size) {
        FsFile f = SD.sdfs.open(path, O_READ);
        if (!f) return false;
        mmb_dsp::LyricHeader h{};
        bool ok = f.read(&h, sizeof(h)) == static_cast<int>(sizeof(h))
               && std::memcmp(h.magic, "MMBL", 4) == 0
               && h.version == mmb_dsp::kLyricBankVersion
               && h.numSyllables > 0 && h.numSyllables <= mmb_dsp::LyricBank::kMaxSyllables;
        if (ok) {
            const uint64_t tables = sizeof(h)
                + static_cast<uint64_t>(h.numSyllables) * sizeof(mmb_dsp::SyllableRecord)
                + static_cast<uint64_t>(h.numMarks) * sizeof(uint32_t);
            uint64_t frames = 0;
            for (uint32_t i = 0; i < h.numSyllables && ok; ++i) {
                mmb_dsp::SyllableRecord r{};
                ok = f.read(&r, sizeof(r)) == static_cast<int>(sizeof(r));
                const uint64_t end = static_cast<uint64_t>(r.frameOffset) + r.frames;
                if (end > frames) frames = end;
            }
            ok = ok && tables + frames * 2u == size;
        }
        f.close();
        return ok;
    }

    /** Stemmen los van het blok: bank weg, versie omhoog, één audiocyclus wachten. */
    void release() {
        bank_.detach();
        ++version_;
        delay(6);
    }

    bool reserve(uint32_t bytes) {
        if (cap_ >= bytes && data_) return true;
        freeBlock();
#if defined(ARDUINO_TEENSY41)
        if (external_psram_size > 0) {
            data_ = static_cast<uint8_t*>(extmem_malloc(bytes));
            inPsram_ = data_ != nullptr;
        }
#endif
        if (!data_) {
            data_ = static_cast<uint8_t*>(std::malloc(bytes));
            inPsram_ = false;
        }
        cap_ = data_ ? bytes : 0;
        return data_ != nullptr;
    }
    void freeBlock() {
        if (!data_) return;
#if defined(ARDUINO_TEENSY41)
        if (inPsram_) { extmem_free(data_); data_ = nullptr; }
#endif
        if (data_) std::free(data_);
        data_ = nullptr; cap_ = 0;
    }

    mmb_dsp::LyricBank bank_;
    uint8_t* data_ = nullptr;
    uint32_t cap_ = 0, bytes_ = 0, version_ = 1;
    int      loaded_ = -1;
    bool     inPsram_ = false, dirReady_ = false, scanned_ = false;
    char     names_[16][29] = {};
    FsFile   upFile_;
    bool     upErr_ = false;
    int      upIndex_ = -1;
    uint32_t upBytes_ = 0, upCrc_ = 0xFFFFFFFFu, upCrcWant_ = 0;
};

/** @brief De audiostroom: `ZangEngine` → twee uitgangen. */
class ZangStream : public AudioStream {
public:
    static constexpr int kVoices = mmb_dsp::ZangEngine::kVoices;

    ZangStream() : AudioStream(0, nullptr) {
        engine_.Init(AUDIO_SAMPLE_RATE_EXACT);
        ready_ = true;
    }

    // ── CV-kant: alleen standen neerzetten ──────────────────────────────
    void setVoct(int k, float v)     { if (k >= 0 && k < kVoices) voct_[k] = v; }
    void setVelocity(int k, float v) { if (k >= 0 && k < kVoices) vel_[k] = v < 0.f ? 0.f : (v > 1.f ? 1.f : v); }
    void gate(int k, bool high)      { if (k >= 0 && k < kVoices) gateWant_[k] = high; }
    void setBend(float v)            { bend_ = v; }
    void setSyllableCv(float v)      { sylCv_ = v; }
    void setFormantCv(float v)       { formantCv_ = v; }
    void next(bool high)             { if (high && !nextIn_) ++nextCount_; nextIn_ = high; }
    void reset(bool high)            { if (high && !resetIn_) ++resetCount_; resetIn_ = high; }

    // ── knoppen (main thread; enkele floats, de audioroutine leest ze) ──
    void setSyllable(int s)     { engine_.set_syllable(s); }
    void setMode(int m)         { engine_.set_mode(m); }
    void setSpeed(float s)      { engine_.set_speed(s); }
    void setFormant(float st)   { engine_.set_formant_semitones(st); }
    void setAttack(float ms)    { engine_.set_attack_ms(ms); }
    void setRelease(float ms)   { engine_.set_release_ms(ms); }
    void setTranspose(float st) { engine_.set_transpose(st); }
    void setLevel(float l)      { engine_.set_level(l); }

    float sylOut() const { return sylOut_; }
    int   activeVoices() const { return active_; }
    float takePeak() { const float p = peak_; peak_ = 0.0f; return p; }

    void update() override {
        if (!ready_) return;
        LyricStore& store = LyricStore::instance();
        if (boundVersion_ != store.version()) {
            boundVersion_ = store.version();
            engine_.set_bank(store.bank());
            for (auto& g : gate_) g = false;        // na een bankwissel opnieuw aanslaan
        }
        audio_block_t* l = allocate();
        audio_block_t* r = allocate();
        if (!l || !r) { if (l) release(l); if (r) release(r); return; }

        // Flanken en standen van de CV-kant, één keer per blok.
        engine_.set_syllable_cv(sylCv_);
        engine_.set_formant_cv(formantCv_);
        const uint32_t rc = resetCount_, nc = nextCount_;
        if (rc != resetSeen_) { resetSeen_ = rc; engine_.Reset(); }
        if (nc != nextSeen_)  { nextSeen_ = nc;  engine_.Next(); }
        for (int k = 0; k < kVoices; ++k) {
            engine_.set_voct(k, voct_[k] + bend_);
            const bool want = gateWant_[k];
            if (want && !gate_[k]) engine_.NoteOn(k, vel_[k]);
            else if (!want && gate_[k]) engine_.NoteOff(k);
            gate_[k] = want;
        }

        float peak = peak_;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float y = engine_.Tick();
            if (!(y == y)) y = 0.0f;                 // NaN-vangnet
            const float a = y < 0.0f ? -y : y;
            if (a > peak) peak = a;
            const int16_t s = static_cast<int16_t>(y * 32767.0f);
            l->data[i] = s;
            r->data[i] = s;
        }
        peak_ = peak;
        sylOut_ = engine_.currentNormalized();
        active_ = engine_.activeVoices();
        transmit(l, 0);
        transmit(r, 1);
        release(l);
        release(r);
    }

private:
    mmb_dsp::ZangEngine engine_;
    volatile bool ready_ = false;
    uint32_t boundVersion_ = 0;
    volatile float voct_[kVoices] = {};
    volatile float vel_[kVoices] = { 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f };
    volatile bool  gateWant_[kVoices] = {};
    bool  gate_[kVoices] = {};
    volatile float bend_ = 0.0f, sylCv_ = 0.0f, formantCv_ = 0.0f;
    bool nextIn_ = false, resetIn_ = false;
    volatile uint32_t nextCount_ = 0, resetCount_ = 0;
    uint32_t nextSeen_ = 0, resetSeen_ = 0;
    volatile float sylOut_ = 0.0f, peak_ = 0.0f;
    volatile int   active_ = 0;
};

class ZangModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_zang";

    explicit ZangModule(std::string_view id) : AudioModule(kTypeId, id) {
        LyricStore& store = LyricStore::instance();
        if (!store.scanned()) store.snapshot();
        store.load(bank_);
    }

    ZangStream& stream() { return stream_; }

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<ZangStream*>(&stream_);
        if (portId == "out" || portId == "out_l") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "syl_out") return PortKind::Cv;
        return (portId == "out" || portId == "out_l" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (SamplerModule::cellOf(portId, "voct") >= 0) return PortKind::Cv;
        if (SamplerModule::cellOf(portId, "gate") >= 0 || SamplerModule::cellOf(portId, "trig") >= 0) return PortKind::Gate;
        if (SamplerModule::cellOf(portId, "vel") >= 0) return PortKind::Cv;
        if (portId == "bend") return PortKind::Cv;
        if (cvPortIs(portId, "syl") || cvPortIs(portId, "formant")) return PortKind::Cv;
        if (portId == "next" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        int k;
        if (portId == "bend") stream_.setBend(value);
        else if (portId == "next")  stream_.next(value >= 0.5f);
        else if (portId == "reset") stream_.reset(value >= 0.5f);
        else if (cvPortIs(portId, "syl"))     stream_.setSyllableCv(value);
        else if (cvPortIs(portId, "formant")) stream_.setFormantCv(value);
        else if ((k = SamplerModule::cellOf(portId, "voct")) >= 0) stream_.setVoct(k, value);
        else if ((k = SamplerModule::cellOf(portId, "gate")) >= 0 ||
                 (k = SamplerModule::cellOf(portId, "trig")) >= 0) stream_.gate(k, value >= 0.5f);
        else if ((k = SamplerModule::cellOf(portId, "vel")) >= 0) stream_.setVelocity(k, value);
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "syl_out" ? stream_.sylOut() : 0.0f;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        if (controlId == "bank") {
            int b = static_cast<int>(asFloat(0.0f));
            if (b < 0) b = 0;
            if (b > 15) b = 15;
            bank_ = b;
            LyricStore::instance().load(bank_);
        }
        else if (controlId == "syl")     stream_.setSyllable(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "mode")    stream_.setMode(static_cast<int>(asFloat(1.0f) + 0.5f));
        else if (controlId == "speed")   stream_.setSpeed(asFloat(1.0f));
        else if (controlId == "formant") stream_.setFormant(asFloat(0.0f));
        else if (controlId == "attack")  stream_.setAttack(asFloat(5.0f));
        else if (controlId == "release") stream_.setRelease(asFloat(250.0f));
        else if (controlId == "coarse")  { coarse_ = asFloat(0.0f); stream_.setTranspose(coarse_ + fine_ * 0.01f); }
        else if (controlId == "fine")    { fine_   = asFloat(0.0f); stream_.setTranspose(coarse_ + fine_ * 0.01f); }
        else if (controlId == "level")   stream_.setLevel(asFloat(0.8f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ZangModule>(id);
            });
    }

private:
    mutable ZangStream stream_;
    int   bank_ = 0;
    float coarse_ = 0.0f, fine_ = 0.0f;
};

}  // namespace mmb_link
