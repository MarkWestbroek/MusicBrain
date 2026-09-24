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
 *
 * **Streamen (sinds fw 0.5.66).** De bank hoeft niet in het geheugen te
 * passen: elk sample krijgt een *kop* in PSRAM (standaard 0,5 s, minder als
 * de bank groot is), de rest leest de hoofdlus (`SampleBank::service()`) per
 * stem vooruit van de kaart in een ringbuffer. Past de hele bank, dan blijft
 * alles resident (kop = alles) en is er niets veranderd. Zie sample_player.h
 * ("Streamen") voor het kernel-deel; hier zit de kaart-kant.
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
 * `env_rel` (ms) en `env_sens` (dB, lift op de follower — zonder lift haalt
 * een keurig uitgestuurd sample amper 0,2 en blijft de wah een kiertje).
 * Dezelfde kernels als VcfModule en Ms20Module; de stem
 * verlaat de module niet, dus stereo en quad blijven intact. Auto-wah is de
 * multikabel env_k → cutoff_k in de patcher.
 * | out | `out_l` `out_r` `out_3` `out_4` | Audio | mono → L+R, stereo → 1/2, quad → 1–4 |
 * Controls: `bank` (0–15), `coarse` (semi), `fine` (ct), `start` (0..1),
 * `attack` (ms; telt op bij de opkomst die de zone zelf meebrengt),
 * `level` (0..1), `limit` (1 = limiter + zachte begrenzing op de som, 0 =
 * hard afknippen op ±1; zie mmb_dsp/limiter.h).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <SD.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <string_view>

#include "mmb_dsp/limiter.h"
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
    // Zelfde grenzen als de sampler-wasm: een vleugel uit een SoundFont heeft
    // zo 121 samples in 150 zones. De tabellen staan statisch (28 KB).
    static constexpr int kMaxSlots = 256;
    static constexpr int kMaxZones = 512;
    static constexpr const char* kDir = "/mmb/banks";

    static SampleBank& instance() { static SampleBank b; return b; }

    static constexpr int      kSdTries       = 6;     ///< pogingen bij het opstarten
    static constexpr uint32_t kSdRetryMs     = 200;   ///< pauze daartussen
    static constexpr uint32_t kSdLateRetryMs = 2000;  ///< later hooguit zo vaak opnieuw

    /**
     * SD-kaart openen (ingebouwd slot), vanuit setup(). Met een paar nieuwe
     * pogingen: bij koud aanzetten krijgen kaart en Teensy tegelijk stroom,
     * en een snelle UHS-kaart (Samsung Pro 64 GB) antwoordt dan soms nog
     * niet. Met één poging, zoals het was, betekende dat "geen kaart" tot de
     * volgende herstart — terwijl hij na een warme herstart (flashen) wél
     * gelezen werd. Poging, tijd en foutcode gaan mee in de status.
     */
    void beginStorage() {
        const uint32_t t0 = millis();
        for (sdTries_ = 1; ; ++sdTries_) {
            if (openCard() || sdTries_ >= kSdTries) break;
            delay(kSdRetryMs);
        }
        sdMs_ = millis() - t0;
        lastTryMs_ = millis();
        snapshot();
    }

    /**
     * Nog eens proberen als er bij het opstarten geen kaart was. Vanuit de
     * main thread: bij een bankwissel (load) en bij elke patch-push, zodat een
     * kaart die je later terugsteekt gevonden wordt zonder de stekker eruit.
     * Niet in een vaste lus — zonder kaart kost een poging even tijd, en de
     * CV-tick mag niet haperen. Lukt het, dan wordt de gevraagde bank alsnog
     * geladen.
     */
    bool retryIfMissing(bool force = false) {
        if (sdOk_) return true;
        if (!mountIfMissing(force)) return false;
        const int want = loaded_;
        loaded_ = -1;
        if (want >= 0) load(want);
        return true;
    }

    /** Alleen de kaart alsnog openen (zonder de bank te laden) — voor load(). */
    bool mountIfMissing(bool force = false) {
        if (sdOk_) return true;
        if (!force && millis() - lastTryMs_ < kSdLateRetryMs) return false;
        lastTryMs_ = millis();
        ++sdTries_;
        if (!openCard()) return false;
        snapshot();
        return true;
    }

    bool sdOk() const { return sdOk_; }
    /** Hoeveelste poging slaagde (of hoeveel er mislukten). */
    int      sdTries()  const { return sdTries_; }
    /** Hoe lang het openen bij het opstarten duurde, in ms. */
    uint32_t sdMs()     const { return sdMs_; }
    /** SdFat-foutcode van de laatste mislukte poging (0 = geen fout). */
    uint8_t  sdErr()    const { return sdErr_; }
    /** Bestandssysteem van de kaart: 12/16/32 = FAT, 64 = exFAT, 0 = geen. */
    uint8_t  fsType()   const { return fsType_; }
    /** Grootte van de kaart in MB (0 = geen kaart). */
    uint32_t sizeMB()   const { return sizeMB_; }
    /** Welke banken er op de kaart staan: bit k = `/mmb/banks/kk.mmbs`. */
    uint16_t bankMask() const { return bankMask_; }
    /** Naam uit de kop van bank k ("" als die bank er niet staat, "?" als het
     *  bestand er wel staat maar geen geldige bank is). */
    const char* bankName(int k) const { return (k >= 0 && k < 16) ? names_[k] : ""; }
    uint32_t version() const { return version_; }
    int loadedBank() const { return loaded_; }

    const mmb_dsp::SampleSlot* slots() const { return slots_; }
    int numSlots() const { return numSlots_; }
    const mmb_dsp::Zone* zones() const { return zones_; }
    int numZones() const { return numZones_; }

    // ── upload via de link ──────────────────────────────────────────────
    /** Begin: `/mmb/banks/NN.part` openen (afgekapt, vooraf gereserveerd). */
    bool uploadBegin(int bank, uint32_t size, uint32_t crc32 = 0) {
        if (bank < 0 || bank > 15) return false;
        upCrcWant_ = crc32; upCrc_ = 0xFFFFFFFFu;
        if (!sdOk_ && !mountIfMissing(true)) return false;
        if (upFile_) upFile_.close();
        char path[40];
        snprintf(path, sizeof(path), "%s/%02d.part", kDir, bank);
        SD.sdfs.remove(path);
        upFile_ = SD.sdfs.open(path, O_WRITE | O_CREAT | O_TRUNC);
        if (!upFile_) return false;
        upFile_.preAllocate(size);           // aaneengesloten: sneller schrijven én streamen
        upErr_ = false; upBank_ = bank; upBytes_ = 0;
        return true;
    }
    void uploadBytes(const uint8_t* data, size_t n) {
        if (!upFile_ || upErr_) return;
        if (upFile_.write(data, n) != n) upErr_ = true; else upBytes_ += n;
        if (upCrcWant_) upCrc_ = crc32Update(upCrc_, data, n);
    }
    /** CRC32 (IEEE 802.3, zoals zlib.crc32): tabelloos per nibble, ~30 MB/s op de Teensy. */
    static uint32_t crc32Update(uint32_t crc, const uint8_t* p, size_t n) {
        static const uint32_t t[16] = {
            0x00000000u, 0x1DB71064u, 0x3B6E20C8u, 0x26D930ACu, 0x76DC4190u, 0x6B6B51F4u, 0x4DB26158u, 0x5005713Cu,
            0xEDB88320u, 0xF00F9344u, 0xD6D6A3E8u, 0xCB61B38Cu, 0x9B64C2B0u, 0x86D3D2D4u, 0xA00AE278u, 0xBDBDF21Cu };
        for (size_t i = 0; i < n; ++i) {
            crc ^= p[i];
            crc = t[crc & 15] ^ (crc >> 4);
            crc = t[crc & 15] ^ (crc >> 4);
        }
        return crc;
    }
    /**
     * Klaar: `.part` → `NN.mmbs` (de oude gaat weg), kaart opnieuw
     * inventariseren, en als die bank geladen was: opnieuw laden. `ok` false
     * (of een schrijffout) = opruimen en de oude bank laten staan.
     */
    bool uploadDone(int bank, bool ok) {
        if (upFile_) upFile_.close();
        char part[40], dst[40];
        snprintf(part, sizeof(part), "%s/%02d.part", kDir, bank);
        snprintf(dst, sizeof(dst), "%s/%02d.mmbs", kDir, bank);
        if (!ok || upErr_ || bank != upBank_) { SD.sdfs.remove(part); return false; }
        // CRC32 over alles wat binnenkwam: één regel ertussen (status-poll) of
        // één gemiste byte en hij klopt niet. De grootte alleen zegt niets:
        // de Teensy leest precies `size` bytes, dus die klopt altijd.
        if (upCrcWant_ && (upCrc_ ^ 0xFFFFFFFFu) != upCrcWant_) {
            SD.sdfs.remove(part);
            Serial.printf("[sampler] bank %02d: CRC klopt niet (kreeg %08lx, verwacht %08lx), verworpen\n", bank,
                          static_cast<unsigned long>(upCrc_ ^ 0xFFFFFFFFu), static_cast<unsigned long>(upCrcWant_));
            return false;
        }
        // Dan nakijken of het een gave bank is: magic, tabellen en de
        // datalengte moeten precies op het ontvangen aantal bytes uitkomen.
        // Zit er ook maar één regel tussendoor (een status-poll op dezelfde
        // poort), dan klopt dat niet en blijft de oude bank staan.
        if (!validBankFile(part, upBytes_)) {
            SD.sdfs.remove(part);
            Serial.printf("[sampler] bank %02d: upload ongeldig (%lu bytes), verworpen\n", bank,
                          static_cast<unsigned long>(upBytes_));
            return false;
        }
        if (loaded_ == bank) {                 // de stemmen los van het oude bestand
            numSlots_ = numZones_ = 0; ++version_; delay(6);
            if (file_) file_.close();
        }
        SD.sdfs.remove(dst);
        if (!SD.sdfs.rename(part, dst)) { SD.sdfs.remove(part); return false; }
        snapshot();
        if (loaded_ == bank) { loaded_ = -1; load(bank); }
        Serial.printf("[sampler] bank %02d geschreven via de link: %lu KB\n", bank,
                      static_cast<unsigned long>(upBytes_ / 1024));
        return true;
    }
    /** Kop en tabellen lezen en de verwachte bestandsgrootte tegen `size` leggen. */
    bool validBankFile(const char* path, uint32_t size) {
        FsFile f = SD.sdfs.open(path, O_READ);
        if (!f) return false;
        mmb_dsp::BankHeader h{};
        bool ok = f.read(&h, sizeof(h)) == static_cast<int>(sizeof(h))
               && std::memcmp(h.magic, "MMBS", 4) == 0
               && h.version >= mmb_dsp::kBankVersionMin && h.version <= mmb_dsp::kBankVersion
               && h.numSlots > 0 && h.numSlots <= kMaxSlots && h.numZones <= kMaxZones;
        if (ok) {
            uint64_t samples = 0;
            for (uint32_t i = 0; i < h.numSlots && ok; ++i) {
                mmb_dsp::SlotHeader sh{};
                ok = f.read(&sh, sizeof(sh)) == static_cast<int>(sizeof(sh)) && sh.channels >= 1 && sh.channels <= 4;
                samples += static_cast<uint64_t>(sh.frames) * sh.channels;
            }
            const size_t zr = h.version >= 2 ? sizeof(mmb_dsp::ZoneRecord) : sizeof(mmb_dsp::ZoneRecordV1);
            const uint64_t expect = sizeof(h) + sizeof(mmb_dsp::SlotHeader) * h.numSlots
                                  + zr * h.numZones + samples * 2u;
            ok = ok && expect == size;
        }
        f.close();
        return ok;
    }
    /** `NN.mmbs` van de kaart halen; was hij geladen, dan zwijgt de sampler. */
    bool deleteBank(int bank) {
        if (bank < 0 || bank > 15 || !sdOk_) return false;
        char dst[40];
        snprintf(dst, sizeof(dst), "%s/%02d.mmbs", kDir, bank);
        if (loaded_ == bank) { numSlots_ = numZones_ = 0; ++version_; delay(6); if (file_) file_.close(); loaded_ = -1; }
        const bool ok = SD.sdfs.remove(dst);
        snapshot();
        return ok;
    }

    // ── streamen ───────────────────────────────────────────────────────
    static constexpr int kRingFrames  = 16384;  ///< per stem (~370 ms bij 44,1 kHz; +2 oct = 93 ms)
    static constexpr int kChunkFrames = 4096;   ///< per SD-leesbeurt (16 KB stereo)
    static constexpr int kMaxStreams  = 16;     ///< stemmen die kunnen streamen (2 samplers)
    static constexpr uint32_t kHeadMsDefault = 500;

    /** Gewenste koplengte in ms (bij het laden; hoger = minder streamen). */
    uint32_t headMs() const { return headMs_; }
    /**
     * Zet de koplengte en laad de bank opnieuw. Standaard streamt een bank
     * alleen als hij niet past; met `force` streamt hij ook als hij wél past
     * (test en afstelling via de link: {"type":"samplerHead","ms":20,"force":true}).
     */
    void setHeadMs(uint32_t ms, bool force = false) {
        headMs_ = ms < 10 ? 10 : (ms > 60000 ? 60000 : ms);
        forceHeads_ = force;
        const int want = loaded_;
        loaded_ = -1;
        if (want >= 0) load(want);
    }
    /** Werkelijke koplengte na het laden (ms bij 44,1 kHz); 0 = alles resident. */
    uint32_t headMsActual() const { return headActualMs_; }
    bool     streamingBank() const { return streamingBank_; }
    uint32_t streamChunks() const { return chunks_; }
    uint32_t streamKB() const { return static_cast<uint32_t>(bytes_ >> 10); }
    /** Underrun-frames sinds de vorige status (de vuller telt ze per stem op). */
    uint32_t streamUnderruns() { const uint32_t u = underAcc_; underAcc_ = 0; return u; }
    /** Grootste SD-leesbeurt (µs) sinds de vorige status. */
    uint32_t streamMaxUs() { const uint32_t m = maxUs_; maxUs_ = 0; return m; }

    /** Stemmen aanmelden die mogen streamen; ze krijgen elk een ring. */
    void attachVoices(mmb_dsp::SamplePlayer* v, int n) {
        for (int i = 0; i < n; ++i) {
            int k = 0;
            while (k < numVoices_ && voices_[k] != &v[i]) ++k;   // al aangemeld: ring opnieuw koppelen
            if (k == numVoices_) {
                if (numVoices_ >= kMaxStreams) break;
                voices_[numVoices_++] = &v[i];
            }
            int16_t* ring = ringFor(k);
            if (ring) v[i].attachStream(ring, kRingFrames);
        }
    }

    /**
     * De vuller — vanuit loop(), zo vaak mogelijk. Per aanroep hooguit één
     * leesbeurt per stem (≈ 1 ms elk), zodat de CV-tick blijft lopen. Leest
     * in RAM (DMA-veilig) en zet het daarna in de ring (PSRAM).
     */
    /** Diagnose: kleinste voorsprong (frames) van een streamende stem sinds de vorige status. */
    int32_t  streamLeadMin() { const int32_t m = leadMin_; leadMin_ = 1 << 30; return m; }
    uint32_t streamServiceCalls() { const uint32_t c = svcCalls_; svcCalls_ = 0; return c; }

    void service() {
        if (!streamingBank_ || !file_) return;
        ++svcCalls_;
        // Volgorde: de stem met de kleinste voorsprong eerst. Een nieuwe noot
        // heeft alleen zijn kop; als hij op zeven andere leesbeurten (elk
        // ~1-2 ms) moet wachten, is een korte kop op voordat de ring vult.
        int order[kMaxStreams];
        int32_t lead[kMaxStreams];
        for (int i = 0; i < numVoices_; ++i) {
            const mmb_dsp::SamplePlayer::Stream& sv = voices_[i]->stream();
            lead[i] = sv.active ? sv.fillIdx - voices_[i]->streamIdx() : (1 << 30);
            order[i] = i;
        }
        for (int a = 1; a < numVoices_; ++a) {          // insertion sort, n <= 16
            const int o = order[a]; int b = a;
            while (b > 0 && lead[order[b - 1]] > lead[o]) { order[b] = order[b - 1]; --b; }
            order[b] = o;
        }
        for (int oi = 0; oi < numVoices_; ++oi) {
            const int i = order[oi];
            mmb_dsp::SamplePlayer& v = *voices_[i];
            const mmb_dsp::SamplePlayer::Stream& sv = v.stream();
            if (sv.active) {
                const int32_t lead = sv.fillIdx - v.streamIdx();
                if (lead < leadMin_) leadMin_ = lead;
                // Underruns cumulatief: per stem het verschil met de vorige stand
                // (de teller van de stem begint bij elke noot opnieuw op 0).
                const uint32_t u = v.streamUnderruns();
                if (u >= lastUnder_[i]) underAcc_ += u - lastUnder_[i]; else underAcc_ += u;
                lastUnder_[i] = u;
                if (v.streamUnderruns() && !sv.reported) {
                    const_cast<mmb_dsp::SamplePlayer::Stream&>(sv).reported = true;
                    Serial.printf("[sampler] underrun stem %d: idx %ld fill %ld end %ld pos %ld gen %lu lead %ld\n",
                                  i, static_cast<long>(v.streamIdx()), static_cast<long>(sv.fillIdx),
                                  static_cast<long>(sv.endIdx), static_cast<long>(sv.fillPos),
                                  static_cast<unsigned long>(sv.gen), static_cast<long>(lead));
                }
            }
            uint32_t gen; int32_t pos, count;
            if (!v.streamNext(kChunkFrames, gen, pos, count)) continue;
            if (count <= 0) { v.streamCommit(gen, pos, 0); continue; }
            const mmb_dsp::SamplePlayer::Stream& st = v.stream();
            const int slot = static_cast<int>(st.slot - slots_);
            if (slot < 0 || slot >= numSlots_) continue;
            const int ch = slots_[slot].channels;
            const uint32_t t0 = micros();
            // Korte loop: de vulling wrapt binnen de chunk; lees dan de hele
            // loop één keer en rol hem uit. Anders is de vulling aaneengesloten.
            const bool wraps = st.loops && !st.tail && st.loopEnd > st.loopStart
                            && pos < st.loopEnd && pos + count > st.loopEnd;
            const int32_t readPos = wraps ? st.loopStart : pos;
            const int32_t readN   = wraps ? st.loopEnd - st.loopStart : count;
            if (readN <= 0 || readN > kChunkFrames) continue;
            // Sector-uitgelijnd lezen (512 B): SdFat leest dan rechtstreeks via
            // DMA i.p.v. sector voor sector door zijn cache; de kop van het
            // blok (`skip` bytes) gooien we weg. Bufferruimte: +1 sector.
            const uint64_t byteOff = dataOffset_
                + (static_cast<uint64_t>(slotFrameOffset_[slot]) + static_cast<uint64_t>(readPos)) * ch * 2u;
            const uint32_t skip = static_cast<uint32_t>(byteOff & 511u);
            if (!file_.seek(byteOff - skip)) continue;
            const size_t want = static_cast<size_t>(readN) * ch * 2u;
            const int got = file_.read(chunkBuf_, want + skip);
            if (got < static_cast<int>(want + skip)) continue;
            // In de ring (stride = kanalen), in runs: tot het loop-einde en tot
            // de ringrand, met memcpy — geen per-frame werk (dat was de bottleneck).
            const int32_t ri = v.streamRingIndex();
            const int16_t* buf = reinterpret_cast<const int16_t*>(chunkBuf_ + skip);
            int32_t k = 0;
            while (k < count) {
                const int32_t fp = mmb_dsp::SamplePlayer::streamFramePos(st, pos, k);
                int32_t run = count - k;
                if (wraps && st.loopEnd - fp < run) run = st.loopEnd - fp;
                const int32_t rpos = (ri + k) % kRingFrames;
                if (kRingFrames - rpos < run) run = kRingFrames - rpos;
                std::memcpy(st.ring + static_cast<long>(rpos) * ch, buf + static_cast<long>(fp - readPos) * ch,
                            static_cast<size_t>(run) * ch * sizeof(int16_t));
                k += run;
            }
            v.streamCommit(gen, pos, count);
            const uint32_t dt = micros() - t0;
            if (dt > maxUs_) maxUs_ = dt;
            ++chunks_;
            bytes_ += want;
        }
    }

    /** Laad `/mmb/banks/NN.mmbs`; idempotent per index. */
    bool load(int index) {
        // Zonder kaart niet vastbijten op "al geprobeerd": misschien zit hij er nu wél.
        if (index == loaded_ && (sdOk_ || numSlots_ > 0)) return numSlots_ > 0;
        numSlots_ = numZones_ = 0;
        loaded_ = index;
        ++version_;                       // stemmen herbinden, ook bij falen
        if (!sdOk_ && !mountIfMissing()) return false;

        char path[40];
        snprintf(path, sizeof(path), "%s/%02d.mmbs", kDir, index);
        File f = SD.open(path, FILE_READ);
        if (!f) { Serial.printf("[sampler] %s niet gevonden\n", path); return false; }

        mmb_dsp::BankHeader h{};
        if (f.read(reinterpret_cast<uint8_t*>(&h), sizeof(h)) != sizeof(h)
            || std::memcmp(h.magic, "MMBS", 4) != 0
            || h.version < mmb_dsp::kBankVersionMin || h.version > mmb_dsp::kBankVersion
            || h.numSlots == 0 || h.numSlots > kMaxSlots || h.numZones > kMaxZones) {
            Serial.printf("[sampler] %s: ongeldige bank\n", path);
            f.close();
            return false;
        }

        // Slot- en zonetabellen.
        mmb_dsp::SlotHeader sh[kMaxSlots];
        if (f.read(reinterpret_cast<uint8_t*>(sh), sizeof(mmb_dsp::SlotHeader) * h.numSlots)
            != static_cast<int>(sizeof(mmb_dsp::SlotHeader) * h.numSlots)) { f.close(); return false; }
        // Zone-records: v1 is 40 bytes, v2 44 (`attack` erbij). De eerste 40
        // zijn identiek, dus we lezen ze als bytes en lopen er met de juiste
        // stap doorheen — één buffer, beide versies.
        const size_t zrSize = h.version >= 2 ? sizeof(mmb_dsp::ZoneRecord)
                                             : sizeof(mmb_dsp::ZoneRecordV1);
        static alignas(4) uint8_t zbuf[kMaxZones * sizeof(mmb_dsp::ZoneRecord)];   // 22 KB: niet op de stack
        if (h.numZones && f.read(zbuf, zrSize * h.numZones)
            != static_cast<int>(zrSize * h.numZones)) { f.close(); return false; }

        // Koppen: hoeveel frames van elk sample resident? Past alles, dan
        // alles (geen streamen); anders zoveel als de kop-instelling en het
        // geheugen toelaten, voor elk sample naar rato. Quad-samples kunnen
        // niet streamen (ring is stereo) en blijven altijd heel resident.
        uint32_t totalFrames = 0, totalSamples = 0;
        for (uint32_t i = 0; i < h.numSlots; ++i) {
            totalFrames += sh[i].frames;
            totalSamples += sh[i].frames * sh[i].channels;
        }
        const uint32_t budget = sampleBudget();
        uint32_t head[kMaxSlots];
        streamingBank_ = false;
        if (totalSamples <= budget && !forceHeads_) {
            for (uint32_t i = 0; i < h.numSlots; ++i) head[i] = sh[i].frames;
        } else {
            streamingBank_ = true;
            // Koplengte in frames (bij de rate van het sample); zoek de
            // grootste die past, van de instelling omlaag tot 10 ms.
            uint32_t ms = headMs_;
            for (;;) {
                uint32_t need = 0;
                for (uint32_t i = 0; i < h.numSlots; ++i) {
                    const uint32_t hf = static_cast<uint32_t>(sh[i].rate * ms / 1000.0f);
                    head[i] = (sh[i].channels > 2 || hf >= sh[i].frames) ? sh[i].frames : hf;
                    need += head[i] * sh[i].channels;
                }
                if (need <= budget) break;
                if (ms <= 10) {
                    Serial.printf("[sampler] %s: past niet, ook niet met koppen van 10 ms (%lu KB nodig)\n",
                                  path, static_cast<unsigned long>(need * 2 / 1024));
                    f.close();
                    return false;
                }
                ms = ms > 40 ? ms * 3 / 4 : 10;
            }
            headActualMs_ = ms;
        }
        uint32_t headSamples = 0;
        for (uint32_t i = 0; i < h.numSlots; ++i) headSamples += head[i] * sh[i].channels;
        if (streamingBank_ && headSamples >= totalSamples) streamingBank_ = false;   // kop dekt alles
        if (!ensureCapacity(headSamples)) {
            Serial.printf("[sampler] %s: geen geheugen voor %lu KB\n", path,
                          static_cast<unsigned long>(headSamples * 2 / 1024));
            f.close();
            return false;
        }
        // Koppen lezen: per slot vanaf zijn frameOffset in het datablok.
        dataOffset_ = static_cast<uint32_t>(sizeof(h) + sizeof(mmb_dsp::SlotHeader) * h.numSlots
                                            + zrSize * h.numZones);
        uint32_t sampleOffset = 0;
        for (uint32_t i = 0; i < h.numSlots; ++i) {
            const size_t want = static_cast<size_t>(head[i]) * sh[i].channels * sizeof(int16_t);
            const uint64_t off = dataOffset_ + static_cast<uint64_t>(sh[i].frameOffset) * sh[i].channels * 2u;
            if (!f.seek(off) || f.read(reinterpret_cast<uint8_t*>(data_ + sampleOffset), want) != static_cast<int>(want)) {
                Serial.printf("[sampler] %s: data te kort (slot %lu)\n", path, static_cast<unsigned long>(i));
                f.close();
                return false;
            }
            slots_[i].data     = data_ + sampleOffset;
            slots_[i].frames   = static_cast<int>(sh[i].frames);
            slots_[i].channels = static_cast<int>(sh[i].channels);
            slots_[i].rate     = sh[i].rate;
            slots_[i].resident = head[i] >= sh[i].frames ? -1 : static_cast<int>(head[i]);
            slotFrameOffset_[i] = sh[i].frameOffset;
            sampleOffset += head[i] * sh[i].channels;
        }
        // Het bestand blijft open voor de vuller (de vorige gaat dicht).
        if (file_) file_.close();
        if (streamingBank_) file_ = f; else { f.close(); headActualMs_ = 0; }
        chunks_ = 0; bytes_ = 0;
        for (uint32_t i = 0; i < h.numZones; ++i) {
            const uint8_t* rec = zbuf + static_cast<size_t>(i) * zrSize;
            const mmb_dsp::ZoneRecordV1& zr =
                *reinterpret_cast<const mmb_dsp::ZoneRecordV1*>(rec);
            mmb_dsp::Zone& z = zones_[i];
            z.slot = static_cast<uint8_t>(zr.slot);
            z.lowKey = zr.lowKey; z.highKey = zr.highKey;
            z.lowVel = zr.lowVel; z.highVel = zr.highVel;
            z.root = zr.root; z.tuneCents = zr.tuneCents;
            z.gain = zr.gain; z.pan = zr.pan;
            z.loopMode = zr.loopMode;
            z.velTrack = zr.velTrack;
            z.loopStart = static_cast<int>(zr.loopStart);
            z.loopEnd = static_cast<int>(zr.loopEnd);
            z.decay = zr.decay; z.release = zr.release;
            z.attack = h.version >= 2
                ? reinterpret_cast<const mmb_dsp::ZoneRecord*>(rec)->attack : 0.0f;
        }
        numSlots_ = static_cast<int>(h.numSlots);
        numZones_ = static_cast<int>(h.numZones);
        ++version_;
        Serial.printf("[sampler] bank %02d \"%s\": %d samples, %d zones, %lu KB, %.1f s; %s\n",
                      index, h.name, numSlots_, numZones_,
                      static_cast<unsigned long>(totalSamples * 2 / 1024),
                      totalFrames / 44100.0f,
                      streamingBank_ ? "streamt" : "resident");
        if (streamingBank_)
            Serial.printf("[sampler]   koppen %lu ms = %lu KB resident, rest van de kaart\n",
                          static_cast<unsigned long>(headActualMs_),
                          static_cast<unsigned long>(headSamples * 2 / 1024));
        return true;
    }

private:
    /** Hoeveel int16's er voor koppen zijn: PSRAM min ringen en marge, anders heap-marge. */
    uint32_t sampleBudget() const {
#if defined(ARDUINO_TEENSY41)
        if (external_psram_size > 0) {
            const uint32_t total = static_cast<uint32_t>(external_psram_size) * 1024u * 1024u;
            const uint32_t rings = static_cast<uint32_t>(kMaxStreams) * kRingFrames * 2u * 2u;   // stereo-ringen
            const uint32_t reserve = 256u * 1024u;
            return (total - rings - reserve) / 2u;
        }
#endif
        return 160u * 1024u / 2u;            // zonder PSRAM: kleine koppen op de heap
    }
    int16_t* ringFor(int i) {
        if (i < 0 || i >= kMaxStreams) return nullptr;
        if (!rings_[i]) {
            const size_t bytes = static_cast<size_t>(kRingFrames) * 2u * sizeof(int16_t);   // stereo
#if defined(ARDUINO_TEENSY41)
            if (external_psram_size > 0) rings_[i] = static_cast<int16_t*>(extmem_malloc(bytes));
#endif
            if (!rings_[i]) rings_[i] = static_cast<int16_t*>(std::malloc(bytes));
        }
        return rings_[i];
    }
    bool ensureCapacity(uint32_t samples) {
        if (cap_ >= samples && data_) return true;
        // De stemmen wijzen nog in het oude blok: versie is al opgehoogd, dus
        // de audio-ISR bindt bij zijn volgende cyclus opnieuw (en zwijgt).
        delay(6);
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
    uint32_t slotFrameOffset_[kMaxSlots] = {};
    File     file_;                              ///< open bank tijdens het streamen
    FsFile   upFile_;                            ///< `.part` tijdens een upload
    bool     upErr_ = false;
    int      upBank_ = -1;
    uint32_t upBytes_ = 0, upCrc_ = 0xFFFFFFFFu, upCrcWant_ = 0;
    uint32_t dataOffset_ = 0;                    ///< begin van het datablok in het bestand
    bool     streamingBank_ = false;
    uint32_t headMs_ = kHeadMsDefault, headActualMs_ = 0;
    bool     forceHeads_ = false;
    uint32_t chunks_ = 0, maxUs_ = 0, svcCalls_ = 0;
    int32_t  leadMin_ = 1 << 30;
    uint64_t bytes_ = 0;
    int16_t* rings_[kMaxStreams] = {};
    mmb_dsp::SamplePlayer* voices_[kMaxStreams] = {};
    int      numVoices_ = 0;
    alignas(32) uint8_t chunkBuf_[kChunkFrames * 2 * 2 + 512];   ///< één leesbeurt, stereo + uitlijnsector (RAM, DMA-veilig)
    uint32_t lastUnder_[kMaxStreams] = {};
    uint32_t underAcc_ = 0;
    int      numSlots_ = 0, numZones_ = 0, loaded_ = -1;
    int16_t* data_ = nullptr;
    uint32_t cap_ = 0, version_ = 0;
    bool     sdOk_ = false, inPsram_ = false;
    uint8_t  fsType_ = 0;
    uint32_t sizeMB_ = 0;
    uint16_t bankMask_ = 0;
    char     names_[16][29] = {};
    int      sdTries_ = 0;
    uint32_t sdMs_ = 0, lastTryMs_ = 0;
    uint8_t  sdErr_ = 0;

    /** Eén poging om de kaart te openen; foutcode bewaren voor de status. */
    bool openCard() {
        sdOk_ = SD.begin(BUILTIN_SDCARD);
        sdErr_ = sdOk_ ? 0 : SD.sdfs.sdErrorCode();
        if (sdOk_ && !SD.exists(kDir)) { SD.mkdir("/mmb"); SD.mkdir(kDir); }
        return sdOk_;
    }

    /**
     * Momentopname voor de status: bestandssysteem, grootte en welke banken
     * er staan. Eén keer bij het opstarten — de firmware leest de kaart ook
     * alleen dan, dus dit is precies wat hij kan gebruiken. Geen usedSize():
     * die telt op een grote kaart alle vrije clusters na en kan seconden duren.
     */
    void snapshot() {
        fsType_ = 0; sizeMB_ = 0; bankMask_ = 0;
        for (auto& n : names_) n[0] = '\0';
        if (!sdOk_) return;
        fsType_ = SD.sdfs.fatType();
        sizeMB_ = static_cast<uint32_t>(SD.totalSize() / (1024ull * 1024ull));
        char path[40];
        for (int i = 0; i < 16; ++i) {
            snprintf(path, sizeof(path), "%s/%02d.mmbs", kDir, i);
            File f = SD.open(path, FILE_READ);
            if (!f) continue;
            bankMask_ |= static_cast<uint16_t>(1u << i);
            // Alleen de kop (44 bytes): de naam die de importer erin zette,
            // zodat het display laat zien wat er écht op de kaart staat.
            mmb_dsp::BankHeader h{};
            const bool ok = f.read(reinterpret_cast<uint8_t*>(&h), sizeof(h)) == sizeof(h)
                         && std::memcmp(h.magic, "MMBS", 4) == 0;
            f.close();
            if (!ok) { std::strcpy(names_[i], "?"); continue; }
            std::memcpy(names_[i], h.name, sizeof(h.name));      // 28 tekens, niet per se afgesloten
            names_[i][sizeof(h.name)] = '\0';
            for (char* c = names_[i]; *c; ++c) if (static_cast<unsigned char>(*c) < 0x20) *c = '?';
        }
    }
};

/** @brief Acht stemmen als één AudioStream met vier uitgangen. */
class SamplerStream : public AudioStream {
public:
    static constexpr int kVoices = 8;

    SamplerStream() : AudioStream(0, nullptr) {
        for (int i = 0; i < kVoices; ++i) voice_[i].Init(AUDIO_SAMPLE_RATE_EXACT);
        SampleBank::instance().attachVoices(voice_, kVoices);   // ringen voor het streamen
        limiter_.Init(AUDIO_SAMPLE_RATE_EXACT);
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
        voice_[k].set_voct(v + bend_);   // ook tijdens de noot (bend, glide)
    }
    /**
     * Gedeelde `bend`-ingang (V/Oct) bovenop de V/Oct van élke cel: één kabel
     * cv_bend → bend buigt alle stemmen mee, ook in een PolyGroup. De
     * nootkeuze bij gate-op blijft op de kale voct_k (bend is modulatie).
     */
    void setBend(float v) {
        if (v == bend_) return;
        bend_ = v;
        for (int k = 0; k < kVoices; ++k)
            if (voice_[k].active()) voice_[k].set_voct(voct_[k] + bend_);
    }
    void setVelocity(int k, float v) {
        if (k < 0 || k >= kVoices) return;
        vel_[k] = v < 0.f ? 0.f : (v > 1.f ? 1.f : v);
    }
    void gate(int k, bool high) {
        if (k < 0 || k >= kVoices) return;
        if (high && !gate_[k]) {
            const int midi = static_cast<int>(lroundf(60.0f + 12.0f * voct_[k]));
            voice_[k].set_voct(voct_[k] + bend_);
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
    void setEnvSens(float db)     { for (auto& v : voice_) v.set_env_sens_db(db); }
    void setTranspose(float semis) { for (auto& v : voice_) v.set_transpose(semis); }
    void setStart(float s)  { for (auto& v : voice_) v.set_startOffset(s); }
    void setAttack(float ms){ for (auto& v : voice_) v.setAttackMs(ms); }
    void setLevel(float l)  { for (auto& v : voice_) v.set_level(l); }
    void setLimit(bool on)  { limiter_.set_enabled(on); }

    /** Zo vaak (in samples) worden de filtercoëfficiënten en de interne
     *  env -> cutoff bijgewerkt — gelijk aan het blok van de sampler-wasm in de
     *  simulator (MMB_BLOCK = 32). Per 128 samples, zoals het was, tikte een
     *  resonante MS-20 hoorbaar mee met de auto-wah (zie routeInternally). */
    static constexpr int kSubBlock = 32;

    void update() override {
        if (boundVersion_ != SampleBank::instance().version()) rebind();
        audio_block_t* out[4];
        for (int c = 0; c < 4; ++c) {
            out[c] = allocate();
            if (!out[c]) { for (int k = 0; k < c; ++k) release(out[k]); return; }
        }
        float mix[mmb_dsp::kMaxChannels];
        for (int s0 = 0; s0 < AUDIO_BLOCK_SAMPLES; s0 += kSubBlock) {
            for (int k = 0; k < kVoices; ++k) {
                const int src = cutoffFrom_[k];
                if (src >= 0) voice_[k].set_cutoff_cv(voice_[src].env());
                voice_[k].PrepareBlock();
            }
            for (int i = s0; i < s0 + kSubBlock; ++i) {
                for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) mix[c] = 0.0f;
                for (auto& v : voice_) v.Process(mix, 4);
                limiter_.Process(mix, 4);          // som binnen ±1, vóór de 16 bits
                for (int c = 0; c < 4; ++c) out[c]->data[i] = static_cast<int16_t>(mix[c] * 32767.0f);
            }
        }
        for (int c = 0; c < 4; ++c) { transmit(out[c], c); release(out[c]); }
    }

    /** Cutoff van stem @p to volgt voortaan de follower van stem @p from,
     *  op audiotempo (−1 = weer via de CV-ingang). */
    void setCutoffFrom(int to, int from) {
        if (to >= 0 && to < kVoices) cutoffFrom_[to] = (from >= 0 && from < kVoices) ? from : -1;
    }
    void clearCutoffFrom() { for (auto& f : cutoffFrom_) f = -1; }

private:
    void rebind() {
        SampleBank& b = SampleBank::instance();
        boundVersion_ = b.version();
        for (auto& v : voice_) v.bind(b.slots(), b.numSlots(), b.zones(), b.numZones());
    }

    mmb_dsp::SamplePlayer voice_[kVoices];
    mmb_dsp::OutputLimiter limiter_;
    uint32_t boundVersion_ = 0xffffffffu;
    int   bank_ = -1;
    float voct_[kVoices] = {};
    float bend_ = 0.f;
    float vel_[kVoices]  = { 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f };
    bool  gate_[kVoices] = {};
    int   cutoffFrom_[kVoices] = { -1, -1, -1, -1, -1, -1, -1, -1 };
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
        if (portId == "bend") return PortKind::Cv;          // gedeeld, niet per cel
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        int k;
        if (portId == "bend") stream_.setBend(value);
        else if ((k = cellOf(portId, "voct")) >= 0) stream_.setVoct(k, value);
        else if ((k = cellOf(portId, "gate")) >= 0 || (k = cellOf(portId, "trig")) >= 0) stream_.gate(k, value >= 0.5f);
        else if ((k = cellOf(portId, "vel")) >= 0) stream_.setVelocity(k, value);
        else if ((k = cellOf(portId, "cutoff")) >= 0) stream_.setCutoffCv(k, value);
    }
    /**
     * Auto-wah binnen de module: een kabel env_j → cutoff_k op deze sampler
     * handelt hij zelf af, elke 32 samples in de audioroutine — zoals de
     * simulator — in plaats van via de CvGraph (1 kHz, pas per 128 samples
     * toegepast). Andere kabels naar cutoff_k blijven gewoon via writeCvPort.
     */
    bool routeInternally(std::string_view fromPortId, std::string_view toPortId) override {
        const int from = cellOf(fromPortId, "env"), to = cellOf(toPortId, "cutoff");
        if (from < 0 || to < 0) return false;
        stream_.setCutoffFrom(to, from);
        return true;
    }
    void clearInternalRoutes() override { stream_.clearCutoffFrom(); }

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
        else if (controlId == "limit")  stream_.setLimit(asFloat(1.0f) >= 0.5f);
        else if (controlId == "filter") stream_.setFilterType(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "cutoff") stream_.setFilterCutoff(asFloat(2000.0f));
        else if (controlId == "q")      stream_.setFilterQ(asFloat(0.3f));
        else if (controlId == "fmode")  stream_.setFilterMode(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "drive")  stream_.setFilterDrive(asFloat(1.0f));
        else if (controlId == "cv_amt") stream_.setCvAmount(asFloat(4.0f));
        else if (controlId == "env_rel") stream_.setEnvRelease(asFloat(120.0f));
        else if (controlId == "env_sens") stream_.setEnvSens(asFloat(12.0f));
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
