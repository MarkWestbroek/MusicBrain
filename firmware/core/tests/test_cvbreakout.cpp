// CTest \u2014 ADR 0009 / ADR 0010 CV-breakout family:
//  - CvOut12 / CvOut16 / GateOut all self-register
//  - setInputValue \u2192 tick() emits one CvSet frame with correct channel + value
//  - GateOut deduplicates: no frame on repeated identical state
//  - Address rebind via setControl("addr_case", ...) resends all slots
#include "test_harness.h"
#include "mb/runtime/CvOut12.h"
#include "mb/runtime/CvOut16.h"
#include "mb/runtime/GateOut.h"
#include "mb/runtime/Registry.h"
#include "mb/Protocol/SpiFrame.h"

#include <vector>
#include <cstring>

using namespace mb::runtime;

namespace {

struct CapturedFrame {
    std::vector<std::uint8_t> bytes;
};

class CapturingSink : public BreakoutSink {
public:
    std::vector<CapturedFrame> frames;
    void send(const std::uint8_t* data, std::size_t len) override {
        CapturedFrame f;
        f.bytes.assign(data, data + len);
        frames.push_back(std::move(f));
    }
};

// Decode a captured frame and sanity-check it.
bool decodeOne(const CapturedFrame& f,
               mb::proto::Opcode& outOp,
               const std::uint8_t*& outPayload,
               std::size_t& outPayloadLen) {
    std::size_t consumed = 0;
    return mb::proto::decode(f.bytes.data(), f.bytes.size(),
                              outOp, outPayload, outPayloadLen, consumed);
}

std::uint16_t readU16(const std::uint8_t* p) {
    return static_cast<std::uint16_t>((p[0] << 8) | p[1]);
}
std::int16_t readI16(const std::uint8_t* p) {
    return static_cast<std::int16_t>((p[0] << 8) | p[1]);
}

}  // namespace

MB_TEST(cv_breakouts_self_register) {
    MB_REQUIRE(Registry::global().has(CvOut12::kTypeId));
    MB_REQUIRE(Registry::global().has(CvOut16::kTypeId));
    MB_REQUIRE(Registry::global().has(GateOut::kTypeId));
}

MB_TEST(cv_out_12_emits_frame_per_dirty_slot) {
    CvOut12 board("cv1", /*caseId*/2, /*firstSlot*/4);
    CapturingSink sink;
    board.setSink(&sink);
    // Two slots dirty: 0 and 3.
    board.setInputValue(0, 0.5f);
    board.setInputValue(3, -1.0f);
    board.tick();
    MB_REQUIRE(sink.frames.size() == 2);

    // First frame: channel = (2<<8)|4 = 0x0204, value ~= 0.5*32767.
    mb::proto::Opcode op;
    const std::uint8_t* payload = nullptr;
    std::size_t plen = 0;
    MB_REQUIRE(decodeOne(sink.frames[0], op, payload, plen));
    MB_REQUIRE(op == mb::proto::Opcode::CvSet);
    MB_REQUIRE(plen == 4);
    MB_REQUIRE(readU16(payload) == 0x0204);
    MB_REQUIRE(readI16(payload + 2) > 16000);
    MB_REQUIRE(readI16(payload + 2) < 17000);

    // Second frame: channel 0x0207, value = -32768.
    MB_REQUIRE(decodeOne(sink.frames[1], op, payload, plen));
    MB_REQUIRE(readU16(payload) == 0x0207);
    MB_REQUIRE(readI16(payload + 2) == -32768);

    // A second tick with no new writes should emit nothing.
    sink.frames.clear();
    board.tick();
    MB_REQUIRE(sink.frames.empty());
}

MB_TEST(cv_out_12_no_sink_is_silent_safe) {
    CvOut12 board("cv1");
    // No sink set \u2014 tick must not crash, just no-op.
    board.setInputValue(0, 0.25f);
    board.tick();
}

MB_TEST(gate_out_deduplicates_repeated_state) {
    GateOut board("g1", /*caseId*/0, /*firstSlot*/0, /*slotCount*/4);
    CapturingSink sink;
    board.setSink(&sink);

    // Slot 0 goes high.
    board.setInputValue(0, 1.0f);
    board.tick();
    MB_REQUIRE(sink.frames.size() == 1);
    // Write same value again \u2014 no new frame (initial state already sent).
    sink.frames.clear();
    board.setInputValue(0, 1.0f);
    board.tick();
    MB_REQUIRE(sink.frames.empty());
    // Change to low \u2014 one frame.
    board.setInputValue(0, 0.0f);
    board.tick();
    MB_REQUIRE(sink.frames.size() == 1);
}

MB_TEST(cv_out_address_rebind_resends_all_slots) {
    CvOut12 board("cv1", /*caseId*/0, /*firstSlot*/0, /*slotCount*/2);
    CapturingSink sink;
    board.setSink(&sink);
    board.setInputValue(0, 0.1f);
    board.setInputValue(1, 0.2f);
    board.tick();
    MB_REQUIRE(sink.frames.size() == 2);

    // Rebind to a different case \u2014 every slot becomes dirty so the next
    // tick re-sends all of them under the new addresses.
    sink.frames.clear();
    board.setControl("addr_case", ControlValue{std::int32_t{7}});
    board.tick();
    MB_REQUIRE(sink.frames.size() == 2);

    mb::proto::Opcode op;
    const std::uint8_t* payload = nullptr;
    std::size_t plen = 0;
    MB_REQUIRE(decodeOne(sink.frames[0], op, payload, plen));
    MB_REQUIRE(readU16(payload) == 0x0700);
}

MB_TEST(cv_out_16_uses_same_wire_format_as_12) {
    CvOut16 board("p1");
    CapturingSink sink;
    board.setSink(&sink);
    board.setInputValue(0, 1.0f);
    board.tick();
    MB_REQUIRE(sink.frames.size() == 1);
    mb::proto::Opcode op;
    const std::uint8_t* payload = nullptr;
    std::size_t plen = 0;
    MB_REQUIRE(decodeOne(sink.frames[0], op, payload, plen));
    MB_REQUIRE(op == mb::proto::Opcode::CvSet);
    MB_REQUIRE(readI16(payload + 2) == 32767);
}
