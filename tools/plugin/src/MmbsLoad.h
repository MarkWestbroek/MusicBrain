#pragma once
// Een `.mmbs`-bank (mmb_dsp/sample_bank.h) in een gastheer met blob- en
// zone-exports (sampler, TAPE STRIP, PERCUTER), zoals parseBank
// (sampleBank.ts) en de worklet van de simulator het doen. Gedeeld door een
// losse plugin (HostProcessor) en de patchmotor (PatchEngine).

#include "mmb_dsp/sample_bank.h"

#include <juce_core/juce_core.h>

#include <cstdint>
#include <cstring>

namespace mmb_plugin {

/** Zet @p data in @p host; false met @p error als de bank niet klopt. De
 *  aanroeper zorgt dat er intussen niet gerenderd wordt. */
template <class H>
bool applyMmbs(H& host, const void* data, std::size_t size, juce::String& error) {
    using namespace mmb_dsp;
    const auto* b = static_cast<const uint8_t*>(data);
    if (size < sizeof(BankHeader) || std::memcmp(b, "MMBS", 4) != 0) { error = "geen .mmbs-bank"; return false; }
    BankHeader h; std::memcpy(&h, b, sizeof h);
    if (h.version < kBankVersionMin || h.version > kBankVersion) { error = "bankversie " + juce::String(h.version) + " onbekend"; return false; }
    const std::size_t zoneSize = h.version >= 2 ? sizeof(ZoneRecord) : sizeof(ZoneRecordV1);
    const std::size_t dataAt = sizeof(BankHeader) + h.numSlots * sizeof(SlotHeader) + h.numZones * zoneSize;
    if (dataAt > size) { error = "bank afgekapt (tabellen)"; return false; }
    host.zoneCount(0);     // eerst de keymap weg: geen stem op een half geladen slot
    const std::size_t samples = (size - dataAt) / 2;
    for (uint32_t i = 0; i < h.numSlots; ++i) {
        SlotHeader sh; std::memcpy(&sh, b + sizeof(BankHeader) + i * sizeof(SlotHeader), sizeof sh);
        const int ch = sh.channels ? sh.channels : 1;
        const std::size_t start = static_cast<std::size_t>(sh.frameOffset) * ch, count = static_cast<std::size_t>(sh.frames) * ch;
        if (start + count > samples) { error = "bank afgekapt (slot " + juce::String(i) + ")"; return false; }
        int16_t* dst = host.blobPtr(static_cast<int>(i), static_cast<int>(count * 2));
        if (!dst) { error = "geen geheugen voor slot " + juce::String(i); return false; }
        std::memcpy(dst, b + dataAt + start * 2, count * 2);
        host.blobCommit(static_cast<int>(i), static_cast<int>(sh.frames), sh.rate > 0 ? sh.rate : 44100.0f, ch);
    }
    for (uint32_t i = 0; i < h.numZones; ++i) {
        ZoneRecord z {};
        std::memcpy(&z, b + sizeof(BankHeader) + h.numSlots * sizeof(SlotHeader) + i * zoneSize, zoneSize);
        host.zoneSet(static_cast<int>(i), z.slot, z.lowKey, z.highKey, z.lowVel, z.highVel, z.root, z.tuneCents, z.gain, z.pan,
                     z.loopMode, static_cast<int>(z.loopStart), static_cast<int>(z.loopEnd), z.decay, z.release, z.velTrack,
                     h.version >= 2 ? z.attack : 0.0f);
    }
    host.zoneCount(static_cast<int>(h.numZones));
    return true;
}

}  // namespace mmb_plugin
