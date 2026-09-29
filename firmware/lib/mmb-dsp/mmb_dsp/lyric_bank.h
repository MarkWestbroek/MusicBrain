#pragma once
/**
 * @file lyric_bank.h
 * @brief `.mmbl` — MMB-lyricbank: ingesproken lettergrepen met hun pitch
 *        marks, zodat `Psola` (psola.h) ze op elke toonhoogte kan zingen.
 * @details
 * Zelfde familie als `.mmbs` (sample_bank.h): de vierde letter van de
 * extensie is de vierde magic-byte. De editor doet de analyse (toonhoogte,
 * pitch marks, lettergreepgrenzen, klinkerkern) en schrijft dit bestand; de
 * firmware en de wasm lezen het zonder parser: één blok in het geheugen,
 * `LyricBank::attach()` controleert het en wijst erin.
 *
 * Layout (little-endian, alles 4-byte uitgelijnd):
 *
 *     LyricHeader     (48 bytes)
 *     SyllableRecord  syl[numSyllables]     (40 bytes elk)
 *     uint32          marks[numMarks]       frame-index binnen de lettergreep,
 *                                           oplopend; bit 31 = stemloos
 *     int16           data[...]             alle lettergrepen achter elkaar,
 *                                           mono, op `rate` Hz
 *
 * Een **pitch mark** is het moment waarop de stembanden sluiten: het midden
 * van één grain. In stemloze stukken (s, f, t) staan de marks op een vast
 * raster en dragen ze de vlag `kMarkUnvoiced`; die stukken spelen ongewijzigd
 * door. `sustainStart`/`sustainEnd` zijn mark-indexen en begrenzen de
 * klinkerkern waarin de stem heen en weer loopt zolang de toets ingedrukt is
 * (`sustainEnd <= sustainStart` = niet aan te houden).
 *
 * Plan en achtergrond: doc/plans/zingende-stemmen.md.
 */
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace mmb_dsp {

constexpr uint32_t kLyricBankMagic   = 0x4C424D4Du;   ///< 'MMBL' little-endian
constexpr uint32_t kLyricBankVersion = 1;
constexpr uint32_t kMarkUnvoiced     = 0x80000000u;   ///< vlag in een mark
constexpr uint32_t kMarkFrameMask    = 0x7FFFFFFFu;
constexpr uint8_t  kSylWordEnd       = 0x01;          ///< laatste lettergreep van een woord

#pragma pack(push, 1)

struct LyricHeader {
    char     magic[4];       ///< "MMBL"
    uint32_t version;
    uint32_t numSyllables;
    uint32_t numMarks;       ///< totaal, over alle lettergrepen
    float    rate;           ///< Hz van het datablok (22050)
    char     name[28];       ///< bank-naam, nul-getermineerd
};                           // 48 bytes

struct SyllableRecord {
    uint32_t frameOffset;    ///< begin in het datablok (frames)
    uint32_t frames;
    uint32_t markOffset;     ///< begin in de marks-tabel
    uint32_t numMarks;
    uint32_t sustainStart;   ///< mark-index: begin van de klinkerkern
    uint32_t sustainEnd;     ///< mark-index: eind (<= start = geen kern)
    float    pitchHz;        ///< gesproken toonhoogte (mediaan), 0 = stemloos
    uint8_t  flags;          ///< kSylWordEnd
    uint8_t  pad[3];
    char     text[8];        ///< "zon", "ne" — voor het display (nul-getermineerd als korter)
};                           // 40 bytes

#pragma pack(pop)

static_assert(sizeof(LyricHeader) == 48, "LyricHeader layout");
static_assert(sizeof(SyllableRecord) == 40, "SyllableRecord layout");

/** @brief Eén lettergreep, klaar om te spelen: wijzers in het bankblok. */
struct Syllable {
    const int16_t*  data = nullptr;
    uint32_t        frames = 0;
    const uint32_t* marks = nullptr;
    uint32_t        numMarks = 0;
    uint32_t        sustainStart = 0;
    uint32_t        sustainEnd = 0;
    float           pitchHz = 0.0f;
    float           rate = 22050.0f;
    uint8_t         flags = 0;

    bool hasSustain() const { return sustainEnd > sustainStart && sustainEnd < numMarks; }
    static uint32_t frameOf(uint32_t mark) { return mark & kMarkFrameMask; }
    static bool unvoiced(uint32_t mark) { return (mark & kMarkUnvoiced) != 0; }
};

/**
 * @brief Een `.mmbl`-blok in het geheugen. Bezit niets: het blok is van de
 *        aanroeper (PSRAM op de Teensy, wasm-geheugen in de simulator) en
 *        moet blijven staan zolang er stemmen op spelen.
 */
class LyricBank {
public:
    /**
     * @brief Controleer het blok en wijs erin. Het blok moet op een
     *        4-bytegrens beginnen.
     * @return false bij een onbekende magic/versie of als iets buiten het
     *         blok wijst; de bank is dan leeg.
     */
    bool attach(const uint8_t* p, size_t n) {
        detach();
        if (!p || n < sizeof(LyricHeader)) return false;
        if ((reinterpret_cast<uintptr_t>(p) & 3u) != 0) return false;
        LyricHeader h;
        std::memcpy(&h, p, sizeof(h));
        if (std::memcmp(h.magic, "MMBL", 4) != 0) return false;
        if (h.version != kLyricBankVersion) return false;
        if (h.numSyllables == 0 || h.numSyllables > kMaxSyllables) return false;
        if (!(h.rate >= 4000.0f && h.rate <= 96000.0f)) return false;

        const size_t sylBytes  = static_cast<size_t>(h.numSyllables) * sizeof(SyllableRecord);
        const size_t markBytes = static_cast<size_t>(h.numMarks) * sizeof(uint32_t);
        const size_t dataAt = sizeof(LyricHeader) + sylBytes + markBytes;
        if (dataAt > n) return false;
        const size_t dataFrames = (n - dataAt) / sizeof(int16_t);

        const auto* syl   = reinterpret_cast<const SyllableRecord*>(p + sizeof(LyricHeader));
        const auto* marks = reinterpret_cast<const uint32_t*>(p + sizeof(LyricHeader) + sylBytes);
        for (uint32_t i = 0; i < h.numSyllables; ++i) {
            const SyllableRecord& s = syl[i];
            if (s.frames == 0) return false;
            if (static_cast<size_t>(s.frameOffset) + s.frames > dataFrames) return false;
            if (static_cast<size_t>(s.markOffset) + s.numMarks > h.numMarks) return false;
            uint32_t prev = 0;
            for (uint32_t m = 0; m < s.numMarks; ++m) {
                const uint32_t f = Syllable::frameOf(marks[s.markOffset + m]);
                if (f >= s.frames) return false;
                if (m > 0 && f <= prev) return false;
                prev = f;
            }
        }
        header_ = h;
        header_.name[sizeof(header_.name) - 1] = '\0';
        syl_ = syl;
        marks_ = marks;
        data_ = reinterpret_cast<const int16_t*>(p + dataAt);
        return true;
    }

    void detach() { syl_ = nullptr; marks_ = nullptr; data_ = nullptr; header_ = LyricHeader{}; }

    bool  valid() const { return syl_ != nullptr; }
    int   numSyllables() const { return valid() ? static_cast<int>(header_.numSyllables) : 0; }
    float rate() const { return header_.rate; }
    const char* name() const { return header_.name; }

    /** @brief Lettergreep @p i (modulo het aantal), of false bij een lege bank. */
    bool syllable(int i, Syllable* out) const {
        if (!valid() || !out) return false;
        const int n = static_cast<int>(header_.numSyllables);
        i %= n;
        if (i < 0) i += n;
        const SyllableRecord& s = syl_[i];
        out->data = data_ + s.frameOffset;
        out->frames = s.frames;
        out->marks = marks_ + s.markOffset;
        out->numMarks = s.numMarks;
        out->sustainStart = s.sustainStart;
        out->sustainEnd = s.sustainEnd;
        out->pitchHz = s.pitchHz;
        out->rate = header_.rate;
        out->flags = s.flags;
        return true;
    }

    /** @brief Tekst van lettergreep @p i in @p buf (9 bytes), nul-getermineerd. */
    void text(int i, char buf[9]) const {
        buf[0] = '\0';
        if (!valid()) return;
        const int n = static_cast<int>(header_.numSyllables);
        i %= n;
        if (i < 0) i += n;
        std::memcpy(buf, syl_[i].text, 8);
        buf[8] = '\0';
    }

    static constexpr uint32_t kMaxSyllables = 4096;

private:
    LyricHeader header_{};
    const SyllableRecord* syl_ = nullptr;
    const uint32_t* marks_ = nullptr;
    const int16_t* data_ = nullptr;
};

}  // namespace mmb_dsp
