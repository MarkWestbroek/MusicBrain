#pragma once
/**
 * @file CvHelpers.h
 * @brief Kleine gedeelde hulpjes voor de CV-modules van het modulatorpakket
 *        (S&H, Clock, Euclid, Turing, Branches, Chaos, LFO-8, Slope, Logic).
 *
 * Geen module: geen `kTypeId`, dus `tools/contract_dump.py` slaat dit bestand
 * over. Alleen pure C++17, zodat de wasm-gastheer (cvhost.h) het meeneemt.
 */

#include "mb/runtime/Module.h"
#include <cmath>
#include <cstdint>

namespace mmb_link::cvutil {

/** Control als getal, welk type de patch-JSON er ook van maakte. */
inline float asFloat(const mb::runtime::ControlValue& value, float fallback) {
    if (const auto* f = std::get_if<float>(&value)) return *f;
    if (const auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
    if (const auto* b = std::get_if<bool>(&value)) return *b ? 1.0f : 0.0f;
    return fallback;
}

/** Toggle: bool op de Teensy, getal vanuit de worklet. */
inline bool asBool(const mb::runtime::ControlValue& value, bool fallback) {
    if (const auto* b = std::get_if<bool>(&value)) return *b;
    if (const auto* i = std::get_if<std::int32_t>(&value)) return *i != 0;
    if (const auto* f = std::get_if<float>(&value)) return *f >= 0.5f;
    return fallback;
}

/** Begrenzen; NaN en oneindig vallen terug op `fallback`. */
inline float clampFinite(float value, float low, float high, float fallback) {
    return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
}

/** Stijgende flank op een gate (>= 0,5 = hoog). */
struct Edge {
    bool high = false;
    bool rise(bool now) { const bool r = now && !high; high = now; return r; }
};

/** xorshift32: klein, snel, reproduceerbaar vanaf een vast zaad. */
struct Rng {
    std::uint32_t state = 0x2545F491u;
    std::uint32_t next() {
        state ^= state << 13; state ^= state >> 17; state ^= state << 5;
        return state;
    }
    /** Uniform 0..1 (exclusief 1). */
    float uniform() { return static_cast<float>(next() >> 8) * (1.0f / 16777216.0f); }
};

/** Interne 16e-nootklok met dezelfde afspraak als Grids: `tempo` in bpm,
 *  vier stappen per tel. `tick()` geeft true op de tick waarop een stap begint;
 *  `high()` is waar in de eerste helft van de stap. */
struct StepClock {
    float bpm = 120.0f;
    float ms = 0.0f;
    bool  started = false;
    void setBpm(float value) { bpm = clampFinite(value, 20.0f, 300.0f, 120.0f); }
    float periodMs() const { return 15000.0f / bpm; }
    void reset() { ms = 0.0f; started = false; }
    bool tick() {
        if (!started) { started = true; ms = 0.0f; return true; }
        ms += 1.0f;
        if (ms >= periodMs()) { ms -= periodMs(); return true; }
        return false;
    }
    bool high() const { return started && ms < periodMs() * 0.5f; }
};

}  // namespace mmb_link::cvutil
