#pragma once

#include <Arduino.h>
#include <LittleFS.h>
#include "elements/dsp/patch.h"

// ---------------------------------------------------------------------------
// Persistent patch bank for Elements firmware.
// Stores 128 slots in Teensy program flash via LittleFS.
// Each slot: elements::Patch + modulation + reverb + 16-char name.
// ---------------------------------------------------------------------------

struct StoredPatch {
    elements::Patch patch;
    float modulation;
    float reverbAmount;
    float reverbTime;
    char name[16];  // null-terminated, up to 15 visible chars
};

class PatchBank {
public:
    PatchBank();

    // Mount LittleFS and load bank file. Prints status to Serial.
    // Call once in setup(). Returns true if bank is ready.
    bool begin();

    // True after successful begin().
    bool ready() const { return ready_; }

    // --- Accessors ---

    uint16_t count() const { return bank_.count; }
    uint16_t currentSlot() const { return bank_.currentSlot; }
    uint16_t nextSlot() const { return bank_.nextSlot; }
    const StoredPatch& slot(uint16_t i) const { return bank_.slots[i]; }
    const char* slotName(uint16_t slot) const;

    // --- Save ---

    // Save patch to nextSlot (auto-advance). For CC#102 "save as new" workflow.
    // Returns the slot written, or UINT16_MAX on failure.
    uint16_t saveNew(const StoredPatch& data);

    // Save patch to a specific slot. Preserves existing name if data has none.
    // Returns true on success.
    bool saveToSlot(uint16_t slot, const StoredPatch& data);

    // --- Recall ---

    // Load slot into out. Returns false if bank empty or slot out of range.
    bool load(uint16_t slot, StoredPatch& out) const;

    // --- Delete ---

    // Delete slot, shift subsequent slots back. Returns false if out of range.
    bool remove(uint16_t slot);

    // --- Names ---

    // Set name for a slot. Max 15 chars (16th is null). Truncated if longer.
    bool setName(uint16_t slot, const char* name);
    bool clearName(uint16_t slot);

    // --- Serial helpers (non-blocking friendly) ---

    void printList() const;
    void printInfo() const;
    void printSlot(uint16_t slot) const;

private:
    static constexpr uint16_t kMaxSlots = 128;
    static constexpr uint32_t kMagic = 0x50424E4B;  // 'PBNK'
    static constexpr uint32_t kVersion = 2;
    static constexpr size_t kDiskSize = 1024 * 1024;
    static constexpr const char* kFilePath = "patchbank.bin";

    // Legacy v1 slot size (before name field).
    static constexpr size_t kSlotSizeV1 = 92;
    static constexpr size_t kHeaderSize = 16;

    struct BankFile {
        uint32_t magic;
        uint32_t version;
        uint16_t count;
        uint16_t nextSlot;
        uint16_t currentSlot;
        uint16_t reserved;
        StoredPatch slots[kMaxSlots];
    };

    void reset();
    bool write();
    bool read();
    bool migrateFromV1();

    LittleFS_Program fs_;
    BankFile bank_;
    bool ready_ = false;
};
