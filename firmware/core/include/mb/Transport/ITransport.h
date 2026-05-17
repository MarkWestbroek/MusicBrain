#pragma once
#include <cstddef>
#include <cstdint>

namespace mb {

// Generic byte-stream transport: USB-CDC on the brain, SPI on a breakout,
// loopback in tests. Non-blocking. Implementations must be safe to poll from
// the realtime loop.
class ITransport {
public:
    virtual ~ITransport() = default;
    virtual std::size_t send(const uint8_t* data, std::size_t len) = 0;
    virtual std::size_t recv(uint8_t* out, std::size_t cap) = 0;
};

}  // namespace mb
