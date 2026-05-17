#include "test_harness.h"
#include "mb/Protocol/SpiFrame.h"
#include <array>

MB_TEST(spi_frame_roundtrip) {
    using namespace mb::proto;
    std::array<uint8_t, 6> payload{0x00, 0x05, 0x12, 0x34, 0x00, 0x10};
    std::array<uint8_t, kMaxFrame> buf{};
    auto n = encode(Opcode::CvSet, payload.data(), payload.size(), buf.data(), buf.size());
    MB_REQUIRE(n > 0);

    Opcode op;
    const uint8_t* pp = nullptr;
    std::size_t plen = 0;
    std::size_t consumed = 0;
    MB_REQUIRE(decode(buf.data(), n, op, pp, plen, consumed));
    MB_REQUIRE(op == Opcode::CvSet);
    MB_REQUIRE(plen == payload.size());
    MB_REQUIRE(consumed == n);
    for (std::size_t i = 0; i < plen; ++i) MB_REQUIRE(pp[i] == payload[i]);
}

MB_TEST(spi_frame_rejects_bad_crc) {
    using namespace mb::proto;
    std::array<uint8_t, kMaxFrame> buf{};
    auto n = encode(Opcode::Ping, nullptr, 0, buf.data(), buf.size());
    MB_REQUIRE(n > 0);
    buf[n - 1] ^= 0xFF;  // corrupt CRC

    Opcode op;
    const uint8_t* pp;
    std::size_t plen, consumed;
    MB_REQUIRE(!decode(buf.data(), n, op, pp, plen, consumed));
}

MB_TEST(spi_frame_reports_incomplete) {
    using namespace mb::proto;
    std::array<uint8_t, kMaxFrame> buf{};
    auto n = encode(Opcode::Ping, nullptr, 0, buf.data(), buf.size());
    Opcode op;
    const uint8_t* pp;
    std::size_t plen, consumed;
    MB_REQUIRE(!decode(buf.data(), n - 1, op, pp, plen, consumed));
}
