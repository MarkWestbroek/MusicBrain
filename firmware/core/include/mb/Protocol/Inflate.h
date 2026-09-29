/**
 * @file Inflate.h
 * @brief Raw DEFLATE (RFC 1951) uitpakken — voor MusicBrain-SysEx-patches.
 *
 * Klein en header-only: stored-, fixed- en dynamic-Huffman-blokken, canonieke
 * Huffman-decodering bit voor bit (snel genoeg voor een paar KB patchdata).
 * Geen zlib-/gzip-kop: de editor comprimeert met `deflate-raw`.
 *
 * Eigen implementatie op basis van de specificatie (RFC 1951); geen code van
 * zlib/puff/tinf overgenomen.
 */
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace mb::protocol {

class Inflate {
public:
    /**
     * @brief Pak `in` uit naar `out` (achteraan toegevoegd).
     * @param maxOut bovengrens voor de uitvoer (bescherming tegen onzin/zip-bommen).
     * @param err    bij false: korte oorzaak.
     */
    static bool raw(const uint8_t* in, size_t inLen, std::vector<uint8_t>& out,
                    size_t maxOut, const char** err = nullptr) {
        Inflate s(in, inLen, out, maxOut);
        const char* e = s.run();
        if (err) *err = e;
        return e == nullptr;
    }

private:
    struct Huff {
        uint16_t count[16] = {};   // aantal codes per lengte
        uint16_t symbol[288] = {}; // symbolen gesorteerd op (lengte, waarde)
    };

    const uint8_t* in_;
    size_t inLen_, pos_ = 0;
    uint32_t bitBuf_ = 0;
    int bitCnt_ = 0;
    std::vector<uint8_t>& out_;
    size_t maxOut_;
    bool eof_ = false;

    Inflate(const uint8_t* in, size_t n, std::vector<uint8_t>& out, size_t maxOut)
        : in_(in), inLen_(n), out_(out), maxOut_(maxOut) {}

    int bits(int n) {
        while (bitCnt_ < n) {
            if (pos_ >= inLen_) { eof_ = true; return 0; }
            bitBuf_ |= static_cast<uint32_t>(in_[pos_++]) << bitCnt_;
            bitCnt_ += 8;
        }
        const int v = static_cast<int>(bitBuf_ & ((1u << n) - 1u));
        bitBuf_ >>= n;
        bitCnt_ -= n;
        return v;
    }

    /** Canonieke Huffman-tabel uit codelengtes; false bij een overvolle set. */
    static bool build(Huff& h, const uint8_t* lengths, int n) {
        for (int i = 0; i < 16; ++i) h.count[i] = 0;
        for (int i = 0; i < n; ++i) h.count[lengths[i]]++;
        h.count[0] = 0;
        int left = 1;
        for (int len = 1; len < 16; ++len) {
            left <<= 1;
            left -= h.count[len];
            if (left < 0) return false;
        }
        uint16_t offs[16];
        offs[1] = 0;
        for (int len = 1; len < 15; ++len) offs[len + 1] = static_cast<uint16_t>(offs[len] + h.count[len]);
        for (int i = 0; i < n; ++i) if (lengths[i]) h.symbol[offs[lengths[i]]++] = static_cast<uint16_t>(i);
        return true;
    }

    /** Eén symbool decoderen (bits komen MSB-eerst per code). */
    int decode(const Huff& h) {
        int code = 0, first = 0, index = 0;
        for (int len = 1; len < 16; ++len) {
            code |= bits(1);
            if (eof_) return -1;
            const int count = h.count[len];
            if (code - first < count) return h.symbol[index + (code - first)];
            index += count;
            first += count;
            first <<= 1;
            code <<= 1;
        }
        return -1;
    }

    const char* codes(const Huff& lit, const Huff& dist) {
        static const uint16_t lbase[29] = {3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258};
        static const uint8_t  lext[29]  = {0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0};
        static const uint16_t dbase[30] = {1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577};
        static const uint8_t  dext[30]  = {0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13};
        for (;;) {
            int sym = decode(lit);
            if (sym < 0) return "kapotte code";
            if (sym < 256) {
                if (out_.size() >= maxOut_) return "te groot";
                out_.push_back(static_cast<uint8_t>(sym));
            } else if (sym == 256) {
                return nullptr;
            } else {
                sym -= 257;
                if (sym >= 29) return "ongeldige lengte";
                const int len = lbase[sym] + bits(lext[sym]);
                const int ds = decode(dist);
                if (ds < 0 || ds >= 30) return "ongeldige afstand";
                const size_t d = static_cast<size_t>(dbase[ds] + bits(dext[ds]));
                if (eof_) return "afgebroken";
                if (d > out_.size()) return "afstand te ver terug";
                if (out_.size() + static_cast<size_t>(len) > maxOut_) return "te groot";
                const size_t from = out_.size() - d;
                for (int i = 0; i < len; ++i) out_.push_back(out_[from + static_cast<size_t>(i)]);
            }
        }
    }

    const char* stored() {
        bitBuf_ = 0; bitCnt_ = 0;                      // naar de bytegrens
        if (pos_ + 4 > inLen_) return "afgebroken";
        const unsigned len  = in_[pos_] | (in_[pos_ + 1] << 8);
        const unsigned nlen = in_[pos_ + 2] | (in_[pos_ + 3] << 8);
        pos_ += 4;
        if (len != (~nlen & 0xFFFFu)) return "stored-lengte klopt niet";
        if (pos_ + len > inLen_) return "afgebroken";
        if (out_.size() + len > maxOut_) return "te groot";
        out_.insert(out_.end(), in_ + pos_, in_ + pos_ + len);
        pos_ += len;
        return nullptr;
    }

    const char* fixed() {
        static Huff lit, dist;
        static bool made = false;
        if (!made) {
            uint8_t l[288];
            int i = 0;
            for (; i < 144; ++i) l[i] = 8;
            for (; i < 256; ++i) l[i] = 9;
            for (; i < 280; ++i) l[i] = 7;
            for (; i < 288; ++i) l[i] = 8;
            build(lit, l, 288);
            for (i = 0; i < 30; ++i) l[i] = 5;
            build(dist, l, 30);
            made = true;
        }
        return codes(lit, dist);
    }

    const char* dynamic() {
        static const uint8_t order[19] = {16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15};
        const int nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        if (eof_) return "afgebroken";
        if (nlen > 286 || ndist > 30) return "te veel codes";
        uint8_t lengths[320] = {};
        for (int i = 0; i < ncode; ++i) lengths[order[i]] = static_cast<uint8_t>(bits(3));
        Huff lencode;
        if (!build(lencode, lengths, 19)) return "codelengte-tabel ongeldig";
        int idx = 0;
        while (idx < nlen + ndist) {
            int sym = decode(lencode);
            if (sym < 0) return "kapotte codelengte";
            if (sym < 16) { lengths[idx++] = static_cast<uint8_t>(sym); continue; }
            uint8_t len = 0;
            int rep;
            if (sym == 16) { if (idx == 0) return "herhaling zonder vorige"; len = lengths[idx - 1]; rep = 3 + bits(2); }
            else if (sym == 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            if (idx + rep > nlen + ndist) return "te veel lengtes";
            while (rep--) lengths[idx++] = len;
        }
        if (lengths[256] == 0) return "geen eindcode";
        Huff lit, dist;
        if (!build(lit, lengths, nlen)) return "literal-tabel ongeldig";
        if (!build(dist, lengths + nlen, ndist)) return "afstand-tabel ongeldig";
        return codes(lit, dist);
    }

    const char* run() {
        int last;
        do {
            last = bits(1);
            const int type = bits(2);
            if (eof_) return "afgebroken";
            const char* e = type == 0 ? stored() : type == 1 ? fixed() : type == 2 ? dynamic() : "onbekend bloktype";
            if (e) return e;
        } while (!last);
        return nullptr;
    }
};

}  // namespace mb::protocol
