#pragma once
/**
 * @file sample_bank.h
 * @brief `.mmbk` — MusicBrain-samplebank: één bestand met alle samples én de
 *        keymap, zodat de Teensy hem zonder parser in PSRAM kan zetten.
 * @details
 * Layout (little-endian, alles 4-byte uitgelijnd):
 *
 *     char     magic[4]   "MMBK"
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

constexpr uint32_t kBankMagic   = 0x4B424D4Du;   ///< 'MMBK' little-endian
constexpr uint32_t kBankVersion = 1;

#pragma pack(push, 1)

struct BankHeader {
    char     magic[4];      ///< "MMBK"
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
