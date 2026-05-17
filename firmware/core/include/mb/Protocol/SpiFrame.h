#pragma once
// Wire format between the brain and breakout boards (over SPI, or over
// CAN-FD/RS-485 via a bridge node). See doc/protocols/spi-frame.md for the
// authoritative description.

#include "../Types.h"
#include <cstddef>
#include <cstdint>

namespace mb::proto {

inline constexpr uint8_t kFrameMagic   = 0xA5;
inline constexpr uint8_t kFrameVersion = 0x01;

enum class Opcode : uint8_t {
    Ping        = 0x00,
    Pong        = 0x01,
    CvSet       = 0x10,  // payload: uint16 channel, int16 value
    CvSegment   = 0x11,  // payload: uint16 channel, int16 target, uint16 ms, uint8 curve
    GateSet     = 0x20,  // payload: uint16 channel, uint8 on
    TriggerPulse= 0x21,  // payload: uint16 channel, uint16 ms
    CvInRequest = 0x30,  // payload: uint16 channel
    CvInReport  = 0x31,  // payload: uint16 channel, int16 value
};

// Frame: [magic][version][opcode][len][payload...][crc16]
inline constexpr std::size_t kHeaderBytes = 4;
inline constexpr std::size_t kCrcBytes    = 2;
inline constexpr std::size_t kMaxPayload  = 56;  // keeps total <= CAN-FD 64-byte frame
inline constexpr std::size_t kMaxFrame    = kHeaderBytes + kMaxPayload + kCrcBytes;

uint16_t crc16Ccitt(const uint8_t* data, std::size_t len);

// Encode an opcode + payload into `out`. Returns bytes written, or 0 on error.
std::size_t encode(Opcode op, const uint8_t* payload, std::size_t payloadLen,
                   uint8_t* out, std::size_t outCap);

// Try to decode a frame from `in`. On success returns true and fills the
// out parameters; otherwise returns false and the caller should keep buffering.
bool decode(const uint8_t* in, std::size_t inLen,
            Opcode& outOp, const uint8_t*& outPayload, std::size_t& outPayloadLen,
            std::size_t& outConsumed);

}  // namespace mb::proto
