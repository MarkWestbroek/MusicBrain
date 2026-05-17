#pragma once
#include <cstdint>
#include <string_view>

namespace mb {

// Abstract display. Project 1 uses a 16x2 LCD or small OLED (ADR 0003);
// project 3 may use a larger TFT. Drivers live in hal/<target>/ or in
// the application.
class IDisplay {
public:
    virtual ~IDisplay() = default;
    virtual void clear() = 0;
    virtual void writeLine(uint8_t row, std::string_view text) = 0;
    virtual void setBrightness(uint8_t pct) = 0;  // 0..100
};

}  // namespace mb
