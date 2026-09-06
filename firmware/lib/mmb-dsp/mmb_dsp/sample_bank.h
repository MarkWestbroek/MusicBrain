#pragma once
/**
 * @file sample_bank.h
 * @brief `.mmbs` — MMB-samplebank: samples + keymap in één bestand, zodat de
 *        Teensy hem zonder parser in PSRAM kan zetten.
 * @details
 * **Naamgeving.** `mmb` is de prefix van dit deelproject (Modular Music
 * Brain, net als `mmb_link` / `mmb_dsp` / `tp_mmb_*`); de vierde letter zegt
 * welke soort bank het is, en is *gelijk aan de vierde magic-byte*. Zo kan de
 * extensie nooit met de inhoud in tegenspraak zijn:
 *
 *     .mmbs / "MMBS"   samplebank   (dit bestand)
 *     .mmbw / "MMBW"   wavetables   (gereserveerd)
 *     .mmbd / "MMBD"   DX7-banken   (gereserveerd)
 *
 * Layout (little-endian, alles 4-byte uitgelijnd):
 *
 *     char     magic[4]   "MMBS"  (samplebank; laatste letter = extensie)
 *     uint32   version    1
 *     uint32   numSlots
 *     uint32   numZones
 *     char     name[32]   bank-naam (nul-getermineerd)
 *     SlotHdr  slots[numSlots]     (16 bytes elk)
 *     ZoneRec  zones[numZones]     (40 bytes elk)
 *     int16    data[...]           alle samples achter elkaar, interleaved
 *
 * De offsets in `SlotHdr` zijn in **frames vanaf het begin van het datablok**;
 * `frames * channels` int16's per slot. De editor schrijft dit bestand
 * (`tools`/`SampleImport`), de firmware leest het rechtstreeks: één `read()`
 * naar PSRAM, dan wijzen `SampleSlot::data` in dat blok.
 */

#include <cstdint>

namespace mmb_dsp {

constexpr uint32_t kSampleBankMagic = 0x53424D4Du;   ///< 'MMBS' little-endian
constexpr uint32_t kBankVersion = 1;

#pragma pack(push, 1)

struct BankHeader {
    char     magic[4];      ///< "MMBS"
    uint32_t version;
    uint32_t numSlots;
    uint32_t numZones;
    char     name[32];
};                          // 44 bytes

struct SlotHeader {
    uint32_t frameOffset;   ///< frames vanaf het begin van het datablok
    uint32_t frames;
    uint16_t channels;
    uint16_t reserved;
    float    rate;
};                          // 16 bytes

struct ZoneRecord {
    uint16_t slot;
    uint8_t  lowKey, highKey;
    uint8_t  lowVel, highVel;
    uint8_t  loopMode;
    uint8_t  reserved;
    float    root;
    float    tuneCents;
    float    gain;
    float    pan;
    uint32_t loopStart;
    uint32_t loopEnd;
    float    decay;
    float    release;
};                          // 40 bytes

#pragma pack(pop)

static_assert(sizeof(BankHeader) == 44, "BankHeader layout");
static_assert(sizeof(SlotHeader) == 16, "SlotHeader layout");
static_assert(sizeof(ZoneRecord) == 40, "ZoneRecord layout");

}  // namespace mmb_dsp
