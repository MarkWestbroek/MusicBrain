#pragma once
#include "mb/Storage/IStore.h"
#include <unordered_map>
#include <vector>

namespace mb::host {

class HostStore : public IStore {
public:
    bool read (uint32_t key, uint8_t* out, std::size_t cap, std::size_t& outLen) override;
    bool write(uint32_t key, const uint8_t* data, std::size_t len) override;
    bool erase(uint32_t key) override;
private:
    std::unordered_map<uint32_t, std::vector<uint8_t>> map_;
};

}  // namespace mb::host
