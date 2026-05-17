#pragma once
#include "mb/Transport/ITransport.h"
#include <deque>

namespace mb::host {

// Loopback transport for tests and the simulator: every byte you send()
// is immediately available to recv() on the same instance.
class HostLoopback : public ITransport {
public:
    std::size_t send(const uint8_t* data, std::size_t len) override;
    std::size_t recv(uint8_t* out, std::size_t cap) override;
private:
    std::deque<uint8_t> buf_;
};

}  // namespace mb::host
