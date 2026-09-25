#pragma once
/**
 * @file FxMem.h
 * @brief Geheugen voor grote effectbuffers: PSRAM als die er is, anders heap.
 *
 * De heap (RAM2, 512 KB) is klein voor een stereo bandecho (192 KB) plus een
 * galm (175 KB) plus STK; vrijgekomen blokken liggen bovendien niet
 * aaneengesloten (FW-13). Echo-banden worden op volgorde geschreven en
 * gelezen, dus de 32 KB-cache van de PSRAM vangt ze moeiteloos op: die gaan
 * naar PSRAM. Buffers met veel verspreide taps per sample (de galm) blijven
 * op de heap — daar zou elke tap een cache-miss zijn.
 *
 * De sampler laat hiervoor `SampleBank::kFxReservePsram` vrij van zijn
 * koppenbudget.
 */

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <memory>

extern "C" uint8_t external_psram_size;
extern "C" void* extmem_malloc(size_t);
extern "C" void  extmem_free(void*);

namespace mmb_link {

inline bool fxInPsram(const void* p) {
    const auto a = reinterpret_cast<uintptr_t>(p);
    return a >= 0x70000000u && a < 0x80000000u;            // FlexSPI2 (PSRAM)
}

/** Vrijgeven, waar hij ook vandaan kwam. */
struct FxFree {
    void operator()(void* p) const {
        if (!p) return;
        if (fxInPsram(p)) extmem_free(p); else std::free(p);
    }
};

template <typename T>
using FxBuf = std::unique_ptr<T[], FxFree>;

/** `n` elementen van T: eerst PSRAM, dan heap; leeg bij geen geheugen. */
template <typename T>
FxBuf<T> fxAlloc(std::size_t n) {
    void* p = nullptr;
#if defined(ARDUINO_TEENSY41)
    if (external_psram_size > 0) p = extmem_malloc(n * sizeof(T));
#endif
    if (!p) p = std::malloc(n * sizeof(T));
    return FxBuf<T>(static_cast<T*>(p));
}

}  // namespace mmb_link
