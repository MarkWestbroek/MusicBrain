#pragma once
#include <cstddef>
#include <cstdint>

namespace mb {

// Append-only blob store, sized for patch banks. Concrete implementations:
// - host:     in-memory + file
// - teensy4:  on-chip flash via EEPROM emulation or LittleFS
// - rp2040:   on-chip flash via pico-fs / LittleFS
class IStore {
public:
    virtual ~IStore() = default;
    virtual bool        read (uint32_t key, uint8_t* out, std::size_t cap, std::size_t& outLen) = 0;
    virtual bool        write(uint32_t key, const uint8_t* data, std::size_t len) = 0;
    virtual bool        erase(uint32_t key) = 0;
};

}  // namespace mb
