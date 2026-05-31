// CTest — ADR 0009 / ADR 0010 dCV bus receiver (CvBreakIn):
//  - self-registers in the global Registry
//  - decodes a CvSet frame into the addressed slot (round-trip with CvOut12)
//  - decodes a GateSet frame as 0.0 / 1.0
//  - ignores frames addressed to a different case or an out-of-range slot
//  - readCvPort("inK") / outputPortKind("inK") map 1-based ports to slots
//  - address rebind via setControl re-points the receiver
#include "test_harness.h"
#include "mb/runtime/CvBreakIn.h"
#include "mb/runtime/CvOut12.h"
#include "mb/runtime/Registry.h"
#include "mb/Protocol/SpiFrame.h"

#include <vector>

using namespace mb::runtime;

namespace {

// A BreakoutSink that re-injects every encoded frame straight into a
// CvBreakIn, so we can assert the full encode → decode round-trip.
class LoopbackSink : public BreakoutSink {
public:
    explicit LoopbackSink(CvBreakIn& rx) : rx_(rx) {}
    int delivered = 0;
    void send(const std::uint8_t* data, std::size_t len) override {
        if (rx_.onFrame(data, len)) ++delivered;
    }
private:
    CvBreakIn& rx_;
};

// Encode a GateSet frame (u16 channel BE + u8 on) into `out`.
std::size_t encodeGate(std::uint16_t channel, bool on,
                       std::uint8_t* out, std::size_t cap) {
    std::uint8_t payload[3];
    payload[0] = static_cast<std::uint8_t>((channel >> 8) & 0xFF);
    payload[1] = static_cast<std::uint8_t>(channel & 0xFF);
    payload[2] = on ? 1 : 0;
    return mb::proto::encode(mb::proto::Opcode::GateSet, payload, sizeof(payload),
                             out, cap);
}

}  // namespace

MB_TEST(cv_break_in_self_registers) {
    MB_REQUIRE(Registry::global().has(CvBreakIn::kTypeId));
}

MB_TEST(cv_break_in_round_trip_from_cvout12) {
    // Producer and receiver share the same base address (case 2, firstSlot 4).
    CvOut12   tx("cv_tx", /*caseId*/2, /*firstSlot*/4);
    CvBreakIn rx("cv_rx", /*caseId*/2, /*firstSlot*/4, /*slotCount*/8);
    LoopbackSink sink(rx);
    tx.setSink(&sink);

    tx.setInputValue(0, 0.5f);
    tx.setInputValue(3, -1.0f);
    tx.tick();

    MB_REQUIRE(sink.delivered == 2);
    // Slot 0 ≈ 0.5 (32767-scaled round-trip is within one LSB).
    MB_REQUIRE(rx.slotValue(0) > 0.49f);
    MB_REQUIRE(rx.slotValue(0) < 0.51f);
    // Slot 3 == -1.0 exactly (rail value).
    MB_REQUIRE(rx.slotValue(3) < -0.999f);
    // readCvPort uses 1-based port ids.
    MB_REQUIRE(rx.readCvPort("in1") == rx.slotValue(0));
    MB_REQUIRE(rx.readCvPort("in4") == rx.slotValue(3));
}

MB_TEST(cv_break_in_decodes_gate) {
    CvBreakIn rx("cv_rx", /*caseId*/0, /*firstSlot*/0, /*slotCount*/4);
    std::uint8_t frame[mb::proto::kMaxFrame];

    std::size_t n = encodeGate(rx.channelFor(2), /*on*/true, frame, sizeof(frame));
    MB_REQUIRE(rx.onFrame(frame, n));
    MB_REQUIRE(rx.slotValue(2) == 1.0f);

    n = encodeGate(rx.channelFor(2), /*on*/false, frame, sizeof(frame));
    MB_REQUIRE(rx.onFrame(frame, n));
    MB_REQUIRE(rx.slotValue(2) == 0.0f);
}

MB_TEST(cv_break_in_ignores_foreign_and_out_of_range) {
    CvBreakIn rx("cv_rx", /*caseId*/2, /*firstSlot*/4, /*slotCount*/4);
    std::uint8_t frame[mb::proto::kMaxFrame];

    // Wrong case (3 instead of 2).
    std::size_t n = encodeGate(static_cast<std::uint16_t>(3 << 8 | 4), true,
                               frame, sizeof(frame));
    MB_REQUIRE(!rx.onFrame(frame, n));

    // Right case but slot 8 is outside [4, 8).
    n = encodeGate(static_cast<std::uint16_t>(2 << 8 | 8), true, frame, sizeof(frame));
    MB_REQUIRE(!rx.onFrame(frame, n));

    // Below the range (slot 3 < firstSlot 4).
    n = encodeGate(static_cast<std::uint16_t>(2 << 8 | 3), true, frame, sizeof(frame));
    MB_REQUIRE(!rx.onFrame(frame, n));
}

MB_TEST(cv_break_in_port_kind_and_bounds) {
    CvBreakIn rx("cv_rx", 0, 0, /*slotCount*/2);
    MB_REQUIRE(rx.outputPortKind("in1") == mb::runtime::Module::PortKind::Cv);
    MB_REQUIRE(rx.outputPortKind("in2") == mb::runtime::Module::PortKind::Cv);
    // Only 2 slots: in3 and non-port ids are None.
    MB_REQUIRE(rx.outputPortKind("in3") == mb::runtime::Module::PortKind::None);
    MB_REQUIRE(rx.outputPortKind("in0") == mb::runtime::Module::PortKind::None);
    MB_REQUIRE(rx.outputPortKind("out") == mb::runtime::Module::PortKind::None);
}

MB_TEST(cv_break_in_address_rebind) {
    CvBreakIn rx("cv_rx", /*caseId*/0, /*firstSlot*/0, /*slotCount*/4);
    rx.setControl("addr_case", static_cast<std::int32_t>(5));
    rx.setControl("addr_first_slot", static_cast<std::int32_t>(2));
    // channelFor(0) must now reflect the new base (case 5, slot 2).
    MB_REQUIRE(rx.channelFor(0) == static_cast<std::uint16_t>(5 << 8 | 2));

    std::uint8_t frame[mb::proto::kMaxFrame];
    std::size_t n = encodeGate(rx.channelFor(1), true, frame, sizeof(frame));
    MB_REQUIRE(rx.onFrame(frame, n));
    MB_REQUIRE(rx.slotValue(1) == 1.0f);
}
