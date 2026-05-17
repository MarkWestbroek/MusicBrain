#pragma once
// Abstract OLED/LCD driver. Project 1 uses an SSD1306 128x64 over I2C, but
// the router only needs `showPatch(id, name)`.

#include <cstdint>
#include <string_view>

namespace mb {

class IDisplay {
public:
    virtual ~IDisplay() = default;
    virtual void showPatch(uint8_t patchId, std::string_view name) = 0;
    virtual void clear() = 0;
};

}  // namespace mb
