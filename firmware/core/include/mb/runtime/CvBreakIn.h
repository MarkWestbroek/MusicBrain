#pragma once
/**
 * @file CvBreakIn.h
 * @brief Brain-side receiver for dCV frames arriving over the SPI bus.
 *
 * @details
 * `CvBreakIn` is the mirror image of `CvBreakout`. Where a `CvBreakout`
 * *encodes* the brain's CV values into `SpiFrame`s and ships them out, a
 * `CvBreakIn` *decodes* frames that arrive from the bus and exposes the most
 * recent value per slot to the local CV graph.
 *
 * **Role in the two-Teensy split (ADR 0010 / doc/uml/08).**
 * The eventual architecture splits the workload across two boards:
 * - the **CV-Teensy** runs envelopes/LFOs/sequencers and ships their values
 *   out through a `CvBreakout` (SPI master, `CvSet`/`GateSet` frames);
 * - the **audio-Teensy** receives those frames through a `CvBreakIn` (SPI
 *   slave RX) and drives its `AudioModule`s via `writeCvPort()`.
 *
 * Because routing already flows through `readCvPort()` / `writeCvPort()` and
 * never through direct pointers between the CV and audio objects, a module
 * graph does not change when the transport moves from in-process to SPI — only
 * the producer side swaps a direct route for a `CvBreakout`, and the consumer
 * side swaps it for a `CvBreakIn`.
 *
 * **Transport-agnostic.** `CvBreakIn` knows nothing about SPI DMA. The SPI
 * slave ISR (or the host test, or the web simulator) calls `onFrame()` with a
 * fully-received frame buffer; the class only decodes and stores. This keeps
 * the decode path host-testable with no hardware.
 *
 * **Addressing.** A frame's `channel` is packed as `(caseId << 8) | slotId`
 * (see `doc/protocols/spi-frame.md`). A `CvBreakIn` claims the contiguous
 * range `[firstSlot, firstSlot + slotCount)` on its `caseId`; frames outside
 * that range are ignored so several break-ins can share one bus.
 *
 * **Ports.** Output port ids are 1-based `inK` (`in1` … `inN`). They are CV
 * outputs *from the local graph's perspective* — `CvGraph` reads them with
 * `readCvPort("inK")` and writes the value into a downstream module. Gate
 * frames (`GateSet`) are stored as `0.0f` / `1.0f` in the same slot, so a
 * receiving module's `writeCvPort()` handles them uniformly.
 */

#include "CvModule.h"
#include "Registry.h"
#include "../Protocol/SpiFrame.h"
#include <array>
#include <cstddef>
#include <cstdint>

namespace mb::runtime {

/** @brief Receives dCV frames from the bus and exposes per-slot CV values. */
class CvBreakIn final : public CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_cv_in";

    /** @brief Maximum input slots, matching `CvBreakout::kMaxBreakoutSlots`. */
    static constexpr std::uint8_t kMaxSlots = 16;

    /** @param caseId/firstSlot  Wire-level base address this receiver claims.
     *  @param slotCount          Number of slots exposed (≤ kMaxSlots). */
    explicit CvBreakIn(std::string_view id,
                       std::uint8_t caseId = 0,
                       std::uint8_t firstSlot = 0,
                       std::uint8_t slotCount = kMaxSlots)
        : CvModule(kTypeId, id),
          caseId_(caseId), firstSlot_(firstSlot),
          slotCount_(slotCount > kMaxSlots ? kMaxSlots : slotCount) {}

    // --- Frame ingestion (called from the SPI RX ISR or a test) ----------

    /**
     * @brief Decode one fully-received bus frame and update the slot it
     *        addresses.
     *
     * Accepts `CvSet` and `GateSet` opcodes whose channel falls inside this
     * receiver's `[firstSlot, firstSlot + slotCount)` range on `caseId_`.
     * Any other frame (wrong case, out-of-range slot, unknown opcode, bad
     * CRC) is silently ignored.
     *
     * @return true if a slot value was updated; false otherwise.
     */
    bool onFrame(const std::uint8_t* data, std::size_t len);

    // --- Module / CvModule overrides -------------------------------------

    /** @brief No layer-2 controls beyond the address rebind handled here.
     *  `addr_case` / `addr_first_slot` let a patch re-point the receiver at
     *  a different physical board without a code change (mirrors CvBreakout). */
    void setControl(std::string_view controlId, ControlValue value) override;

    /** @brief Pull-driven source: values arrive via `onFrame()`, so tick is a
     *  no-op. Implemented so the receiver shares the CV-tick dispatch loop. */
    void tick() override {}

    /** @brief `inK` (1-based) is a CV output into the local graph. */
    PortKind outputPortKind(std::string_view portId) const override {
        return (slotForPort(portId) >= 0) ? PortKind::Cv : PortKind::None;
    }

    /** @brief Sample the latest value received for output port `inK`. */
    float readCvPort(std::string_view portId) const override {
        const int slot = slotForPort(portId);
        return slot >= 0 ? values_[static_cast<std::size_t>(slot)] : 0.0f;
    }

    // --- Diagnostics / tests ---------------------------------------------

    /** @brief Latest normalised value stored in @p slot (0 for out-of-range). */
    float slotValue(std::uint8_t slot) const {
        return slot < slotCount_ ? values_[slot] : 0.0f;
    }

    /** @brief Number of input slots this receiver exposes. */
    std::uint8_t slotCount() const { return slotCount_; }

    /** @brief Wire-level channel for slot @p slot. */
    std::uint16_t channelFor(std::uint8_t slot) const {
        return static_cast<std::uint16_t>(caseId_) << 8
             | static_cast<std::uint16_t>(firstSlot_ + slot);
    }

    static void registerFactory();

private:
    /** @brief Map an `inK` (1-based) port id to a 0-based slot index.
     *  @return slot index in `[0, slotCount)`, or −1 if not a valid `inK`. */
    int slotForPort(std::string_view portId) const {
        constexpr std::string_view base = "in";
        if (portId.size() <= base.size())          return -1;
        if (portId.substr(0, base.size()) != base) return -1;
        std::uint32_t k = 0;
        for (char c : portId.substr(base.size())) {
            if (c < '0' || c > '9') return -1;
            k = k * 10 + static_cast<std::uint32_t>(c - '0');
            if (k > kMaxSlots) return -1;
        }
        if (k == 0 || k > slotCount_) return -1;  // 1-based, in range.
        return static_cast<int>(k - 1);
    }

    std::uint8_t caseId_;
    std::uint8_t firstSlot_;
    std::uint8_t slotCount_;
    std::array<float, kMaxSlots> values_{};
};

}  // namespace mb::runtime
