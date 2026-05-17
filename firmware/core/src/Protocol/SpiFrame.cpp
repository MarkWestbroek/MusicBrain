#include "mb/Protocol/SpiFrame.h"
#include <cstring>

namespace mb::proto {

uint16_t crc16Ccitt(const uint8_t* data, std::size_t len) {
    uint16_t crc = 0xFFFF;
    for (std::size_t i = 0; i < len; ++i) {
        crc ^= static_cast<uint16_t>(data[i]) << 8;
        for (int b = 0; b < 8; ++b) {
            crc = (crc & 0x8000) ? static_cast<uint16_t>((crc << 1) ^ 0x1021)
                                 : static_cast<uint16_t>(crc << 1);
        }
    }
    return crc;
}

std::size_t encode(Opcode op, const uint8_t* payload, std::size_t payloadLen,
                   uint8_t* out, std::size_t outCap) {
    if (payloadLen > kMaxPayload) return 0;
    const std::size_t total = kHeaderBytes + payloadLen + kCrcBytes;
    if (outCap < total) return 0;

    out[0] = kFrameMagic;
    out[1] = kFrameVersion;
    out[2] = static_cast<uint8_t>(op);
    out[3] = static_cast<uint8_t>(payloadLen);
    if (payloadLen > 0) std::memcpy(out + kHeaderBytes, payload, payloadLen);

    const uint16_t crc = crc16Ccitt(out, kHeaderBytes + payloadLen);
    out[kHeaderBytes + payloadLen]     = static_cast<uint8_t>(crc >> 8);
    out[kHeaderBytes + payloadLen + 1] = static_cast<uint8_t>(crc & 0xFF);
    return total;
}

bool decode(const uint8_t* in, std::size_t inLen,
            Opcode& outOp, const uint8_t*& outPayload, std::size_t& outPayloadLen,
            std::size_t& outConsumed) {
    outConsumed = 0;
    if (inLen < kHeaderBytes + kCrcBytes) return false;
    if (in[0] != kFrameMagic || in[1] != kFrameVersion) return false;

    const std::size_t payloadLen = in[3];
    if (payloadLen > kMaxPayload) return false;
    const std::size_t total = kHeaderBytes + payloadLen + kCrcBytes;
    if (inLen < total) return false;

    const uint16_t got      = static_cast<uint16_t>(in[kHeaderBytes + payloadLen]) << 8
                            | in[kHeaderBytes + payloadLen + 1];
    const uint16_t expected = crc16Ccitt(in, kHeaderBytes + payloadLen);
    if (got != expected) return false;

    outOp         = static_cast<Opcode>(in[2]);
    outPayload    = (payloadLen > 0) ? (in + kHeaderBytes) : nullptr;
    outPayloadLen = payloadLen;
    outConsumed   = total;
    return true;
}

}  // namespace mb::proto
