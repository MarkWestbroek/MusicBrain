#include "mb/host/HostTransport.h"

namespace mb::host {

std::size_t HostLoopback::send(const uint8_t* data, std::size_t len) {
    for (std::size_t i = 0; i < len; ++i) buf_.push_back(data[i]);
    return len;
}

std::size_t HostLoopback::recv(uint8_t* out, std::size_t cap) {
    std::size_t n = 0;
    while (n < cap && !buf_.empty()) {
        out[n++] = buf_.front();
        buf_.pop_front();
    }
    return n;
}

}  // namespace mb::host
