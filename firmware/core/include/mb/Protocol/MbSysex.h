/**
 * @file MbSysex.h
 * @brief MusicBrain-patches via SysEx ontvangen (doc/plans/sysex-patch.md).
 *
 * Bericht: F0 7D 4D 42 <ver=01> <cmd> <seqHi> <seqLo> <totHi> <totLo> <data…> <sum> F7
 *  - cmd 02 = firmwareconfig: dezelfde JSON-regel als de link ({"type":"config",…});
 *  - cmd 01 = editor-patch: voor editors, hier genegeerd;
 *  - sum    = (128 − som(data) mod 128) mod 128.
 * Inhoud van alle berichten samen: 7-bit gepakt; uitgepakt = 4 bytes lengte
 * (big-endian) + deflate-raw; ingepakt = UTF-8-JSON.
 *
 * Zuiver en host-testbaar: `feed()` krijgt telkens één volledig bericht.
 */
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#include "mb/Protocol/Inflate.h"

namespace mb::protocol {

inline constexpr uint8_t kMbManufacturer = 0x7D;
inline constexpr uint8_t kMbSysexVersion = 1;
inline constexpr uint8_t kMbCmdEditorPatch = 0x01;
inline constexpr uint8_t kMbCmdFirmwareConfig = 0x02;

/** 7 → 8 bit: per groep eerst een byte met de hoogste bits (bit i = byte i). */
inline std::vector<uint8_t> unpack7(const uint8_t* p, size_t n) {
    std::vector<uint8_t> out;
    out.reserve(n * 7 / 8 + 7);
    for (size_t i = 0; i < n; i += 8) {
        const uint8_t msb = p[i];
        for (size_t j = 0; j < 7 && i + 1 + j < n; ++j)
            out.push_back(static_cast<uint8_t>(p[i + 1 + j] | (((msb >> j) & 1u) << 7)));
    }
    return out;
}

class MbSysexAssembler {
public:
    enum class Status { Ignored, Partial, Done, Error };

    /** Welk commando we verzamelen (standaard de firmwareconfig). */
    explicit MbSysexAssembler(uint8_t wantCmd = kMbCmdFirmwareConfig,
                              size_t maxPacked = 128 * 1024, size_t maxText = 96 * 1024)
        : want_(wantCmd), maxPacked_(maxPacked), maxText_(maxText) {}

    /** Eén volledig bericht (F0 … F7). */
    Status feed(const uint8_t* m, size_t len) {
        if (len < 13 || m[0] != 0xF0 || m[len - 1] != 0xF7) return Status::Ignored;
        if (m[1] != kMbManufacturer || m[2] != 0x4D || m[3] != 0x42) return Status::Ignored;
        if (m[4] != kMbSysexVersion) return fail("onbekende SysEx-versie");
        const uint8_t cmd = m[5];
        if (cmd != want_) return Status::Ignored;
        const unsigned seq = (m[6] << 7) | m[7], total = (m[8] << 7) | m[9];
        const uint8_t* data = m + 10;
        const size_t n = len - 12;
        unsigned sum = 0;
        for (size_t i = 0; i < n; ++i) { if (data[i] & 0x80) return fail("byte boven 7 bit"); sum += data[i]; }
        if (((128 - (sum % 128)) % 128) != m[len - 2]) return fail("controlegetal klopt niet");
        if (total == 0) return fail("aantal berichten is 0");
        if (seq == 0) { packed_.clear(); next_ = 0; total_ = total; text_.clear(); }
        if (seq != next_ || total != total_) return fail("berichten niet op volgorde");
        if (packed_.size() + n > maxPacked_) return fail("te groot");
        packed_.insert(packed_.end(), data, data + n);
        ++next_;
        if (next_ < total_) return Status::Partial;

        const std::vector<uint8_t> body = unpack7(packed_.data(), packed_.size());
        packed_.clear(); next_ = 0; total_ = 0;
        if (body.size() < 4) return fail("inhoud te kort");
        const size_t clen = (static_cast<size_t>(body[0]) << 24) | (static_cast<size_t>(body[1]) << 16)
                          | (static_cast<size_t>(body[2]) << 8) | body[3];
        if (clen > body.size() - 4) return fail("lengte klopt niet");
        std::vector<uint8_t> raw;
        const char* e = nullptr;
        if (!Inflate::raw(body.data() + 4, clen, raw, maxText_, &e)) return fail(e ? e : "uitpakken mislukt");
        text_.assign(raw.begin(), raw.end());
        cmd_ = cmd;
        return Status::Done;
    }

    const std::string& text() const { return text_; }
    uint8_t cmd() const { return cmd_; }
    const char* error() const { return err_; }
    /** Voortgang van een reeks: hoeveel berichten binnen / verwacht. */
    unsigned received() const { return next_; }
    unsigned expected() const { return total_; }

private:
    Status fail(const char* e) { err_ = e; packed_.clear(); next_ = 0; total_ = 0; return Status::Error; }

    uint8_t want_;
    size_t maxPacked_, maxText_;
    std::vector<uint8_t> packed_;
    std::string text_;
    unsigned next_ = 0, total_ = 0;
    uint8_t cmd_ = 0;
    const char* err_ = nullptr;
};

}  // namespace mb::protocol
