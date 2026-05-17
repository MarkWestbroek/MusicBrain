#pragma once
// In-memory IDisplay for tests + host harness. Records the last shown patch.

#include "mb/IDisplay.h"
#include <cstdint>
#include <string>
#include <string_view>

namespace mb::host {

class HostDisplay : public IDisplay {
public:
    void showPatch(uint8_t patchId, std::string_view name) override {
        lastId_   = patchId;
        lastName_.assign(name.begin(), name.end());
        ++showCalls_;
    }
    void clear() override {
        lastName_.clear();
        ++clearCalls_;
    }

    uint8_t            lastId()      const { return lastId_; }
    const std::string& lastName()    const { return lastName_; }
    std::size_t        showCalls()   const { return showCalls_; }
    std::size_t        clearCalls()  const { return clearCalls_; }

private:
    uint8_t     lastId_{0xFF};
    std::string lastName_{};
    std::size_t showCalls_{0};
    std::size_t clearCalls_{0};
};

}  // namespace mb::host
