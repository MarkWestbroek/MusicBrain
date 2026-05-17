#include "mb/host/HostStore.h"
#include <cstring>

namespace mb::host {

bool HostStore::read(uint32_t key, uint8_t* out, std::size_t cap, std::size_t& outLen) {
    auto it = map_.find(key);
    if (it == map_.end()) return false;
    outLen = it->second.size();
    if (outLen > cap) return false;
    std::memcpy(out, it->second.data(), outLen);
    return true;
}

bool HostStore::write(uint32_t key, const uint8_t* data, std::size_t len) {
    map_[key].assign(data, data + len);
    return true;
}

bool HostStore::erase(uint32_t key) {
    return map_.erase(key) > 0;
}

}  // namespace mb::host
