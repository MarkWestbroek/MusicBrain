#include "PatchBank.h"
#include <cstring>
#include <cstdio>

PatchBank::PatchBank() {
    std::memset(&bank_, 0, sizeof(bank_));
}

bool PatchBank::begin() {
    ready_ = fs_.begin(kDiskSize);
    if (!ready_) {
        Serial.println("[patch] LittleFS mount failed");
        return false;
    }

    if (!read()) {
        // No valid bank file — create fresh.
        reset();
        bank_.magic = kMagic;
        bank_.version = kVersion;
        if (!write()) {
            Serial.println("[patch] init failed (unable to write bank file)");
            ready_ = false;
            return false;
        }
        Serial.println("[patch] created empty patch bank (128 slots)");
        return true;
    }

    Serial.printf("[patch] loaded bank: count=%u next=%u current=%u\n",
                  static_cast<unsigned>(bank_.count),
                  static_cast<unsigned>(bank_.nextSlot),
                  static_cast<unsigned>(bank_.currentSlot));
    return true;
}

void PatchBank::reset() {
    std::memset(&bank_, 0, sizeof(bank_));
}

bool PatchBank::write() {
    File f = fs_.open(kFilePath, FILE_WRITE_BEGIN);
    if (!f) return false;
    size_t written = f.write(reinterpret_cast<const uint8_t*>(&bank_), sizeof(bank_));
    f.flush();
    f.close();
    return written == sizeof(bank_);
}

bool PatchBank::read() {
    File f = fs_.open(kFilePath, FILE_READ);
    if (!f) return false;
    size_t n = f.read(reinterpret_cast<uint8_t*>(&bank_), sizeof(bank_));
    f.close();

    if (n == sizeof(bank_)) {
        // Exact size match — validate.
        if (bank_.magic != kMagic) return false;
        if (bank_.version > kVersion) return false;
        if (bank_.count > kMaxSlots) return false;
        if (bank_.nextSlot >= kMaxSlots) return false;
        if (bank_.currentSlot >= kMaxSlots) return false;
        return true;
    }

    // Size mismatch — maybe older version. Check header without
    // allocating the full BankFile on stack.
    if (n >= static_cast<int>(kHeaderSize)) {
        uint8_t hdrBuf[kHeaderSize];
        f = fs_.open(kFilePath, FILE_READ);
        if (!f) return false;
        int hdrRead = f.read(hdrBuf, sizeof(hdrBuf));
        f.close();
        if (hdrRead < static_cast<int>(sizeof(hdrBuf))) return false;
        BankFile* hdr = reinterpret_cast<BankFile*>(hdrBuf);
        if (hdr->magic == kMagic && hdr->version == 1) {
            return migrateFromV1();
        }
    }
    return false;
}

bool PatchBank::migrateFromV1() {
    File f = fs_.open(kFilePath, FILE_READ);
    if (!f) return false;

    // Read v1 header (16 bytes).
    uint8_t hdrBuf[kHeaderSize];
    if (f.read(hdrBuf, sizeof(hdrBuf)) < static_cast<int>(sizeof(hdrBuf))) {
        f.close();
        return false;
    }
    BankFile* v1hdr = reinterpret_cast<BankFile*>(hdrBuf);

    reset();
    bank_.magic = kMagic;
    bank_.version = kVersion;
    bank_.count = v1hdr->count;
    bank_.nextSlot = v1hdr->nextSlot;
    bank_.currentSlot = v1hdr->currentSlot;

    // Read slots one by one (avoids large stack allocation).
    uint8_t slotBuf[kSlotSizeV1];
    for (uint16_t i = 0; i < kMaxSlots; ++i) {
        int n = f.read(slotBuf, sizeof(slotBuf));
        if (n < static_cast<int>(sizeof(slotBuf))) break;
        std::memcpy(&bank_.slots[i], slotBuf, sizeof(slotBuf));
        bank_.slots[i].name[0] = '\0';
    }
    f.close();

    if (!write()) return false;
    Serial.println("[patch] migrated bank v1 → v2 (added name field)");
    return true;
}

// --- Save ---

uint16_t PatchBank::saveNew(const StoredPatch& data) {
    uint16_t slot = bank_.nextSlot;
    bank_.slots[slot] = data;
    bank_.slots[slot].name[0] = '\0';
    if (bank_.count < kMaxSlots) {
        bank_.count++;
    }
    bank_.currentSlot = slot;
    bank_.nextSlot = static_cast<uint16_t>((slot + 1) % kMaxSlots);
    if (write()) {
        Serial.printf("[patch] saved prog %u (count=%u)\n",
                      static_cast<unsigned>(slot + 1),
                      static_cast<unsigned>(bank_.count));
        return slot;
    }
    Serial.println("[patch] save failed");
    return UINT16_MAX;
}

bool PatchBank::saveToSlot(uint16_t slot, const StoredPatch& data) {
    if (slot >= kMaxSlots) return false;
    StoredPatch sp = data;
    // Preserve existing name if data has none.
    if (sp.name[0] == '\0' && bank_.slots[slot].name[0] != '\0') {
        std::strncpy(sp.name, bank_.slots[slot].name, sizeof(sp.name));
        sp.name[sizeof(sp.name) - 1] = '\0';
    }
    bank_.slots[slot] = sp;
    bank_.currentSlot = slot;
    if (slot >= bank_.count) {
        bank_.count = static_cast<uint16_t>(slot + 1);
    }
    if (bank_.nextSlot <= slot) {
        bank_.nextSlot = static_cast<uint16_t>((slot + 1) % kMaxSlots);
    }
    if (write()) {
        printSlot(slot);
        Serial.printf("[patch] saved (count=%u)\n",
                      static_cast<unsigned>(bank_.count));
        return true;
    }
    Serial.println("[patch] save failed");
    return false;
}

// --- Recall ---

bool PatchBank::load(uint16_t slot, StoredPatch& out) const {
    if (bank_.count == 0) return false;
    if (slot >= bank_.count) return false;
    out = bank_.slots[slot];
    return true;
}

// --- Delete ---

bool PatchBank::remove(uint16_t slot) {
    if (slot >= bank_.count) return false;
    for (uint16_t i = slot; i + 1 < bank_.count; ++i) {
        bank_.slots[i] = bank_.slots[i + 1];
    }
    std::memset(&bank_.slots[bank_.count - 1], 0, sizeof(StoredPatch));
    bank_.count--;

    if (bank_.currentSlot >= slot && bank_.currentSlot > 0) {
        bank_.currentSlot--;
    }
    if (bank_.nextSlot > slot && bank_.nextSlot > 0) {
        bank_.nextSlot--;
    }

    if (write()) {
        Serial.printf("[patch] deleted prog %u (count=%u)\n",
                      static_cast<unsigned>(slot + 1),
                      static_cast<unsigned>(bank_.count));
        return true;
    }
    Serial.println("[patch] delete failed");
    return false;
}

// --- Names ---

const char* PatchBank::slotName(uint16_t slot) const {
    if (slot < kMaxSlots && bank_.slots[slot].name[0] != '\0') {
        return bank_.slots[slot].name;
    }
    return nullptr;
}

bool PatchBank::setName(uint16_t slot, const char* name) {
    if (slot >= bank_.count || slot >= kMaxSlots) return false;
    std::strncpy(bank_.slots[slot].name, name, sizeof(bank_.slots[slot].name));
    bank_.slots[slot].name[sizeof(bank_.slots[slot].name) - 1] = '\0';
    if (!write()) return false;
    printSlot(slot);
    return true;
}

bool PatchBank::clearName(uint16_t slot) {
    if (slot >= kMaxSlots) return false;
    bank_.slots[slot].name[0] = '\0';
    return write();
}

// --- Serial helpers ---

void PatchBank::printSlot(uint16_t slot) const {
    const char* n = slotName(slot);
    if (n) {
        Serial.printf("[patch] prog %u = \"%s\"\n",
                      static_cast<unsigned>(slot + 1), n);
    } else {
        Serial.printf("[patch] prog %u\n", static_cast<unsigned>(slot + 1));
    }
}

void PatchBank::printInfo() const {
    Serial.printf("[patch] count=%u next=%u current=%u\n",
                  static_cast<unsigned>(bank_.count),
                  static_cast<unsigned>(bank_.nextSlot),
                  static_cast<unsigned>(bank_.currentSlot));
}

void PatchBank::printList() const {
    if (bank_.count == 0) {
        Serial.println("[patch] bank is empty");
        return;
    }
    for (uint16_t i = 0; i < bank_.count; ++i) {
        const char* n = slotName(i);
        if (n) {
            Serial.printf("  %2u  \"%s\"%s\n",
                          static_cast<unsigned>(i + 1), n,
                          (i == bank_.currentSlot) ? " <" : "  ");
        } else {
            Serial.printf("  %2u  (unnamed)%s\n",
                          static_cast<unsigned>(i + 1),
                          (i == bank_.currentSlot) ? " <" : "  ");
        }
    }
    Serial.printf("[patch] %u/%u slots\n",
                  static_cast<unsigned>(bank_.count),
                  static_cast<unsigned>(kMaxSlots));
}
