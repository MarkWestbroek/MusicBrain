#pragma once
/**
 * @file CvBus.h
 * @brief In-memory pub/sub bus for CV-domain signals.
 *
 * @details
 * The CvBus carries CV values between CV-domain producers (Ahdsr, Lfo,
 * MidiIn, Sequencer, ...) and consumers (wrapped audio modules that want
 * to be modulated, or CV breakouts). Each signal is identified by a key
 * of the form `"<moduleId>.<portId>"` (e.g. `"mod_s5p7ab8.cv_out"`).
 *
 * Producers call `publish(key, value)` at most once per CV tick from
 * `CvModule::tick()`.  Consumers either read directly via `read(key)`
 * (pull model) or are driven by a `CvGraph` that walks known
 * subscriptions after each tick and pushes new values to each consumer
 * (push model).
 *
 * Float values use the project-wide CV convention:
 *   * audio-gain / envelope amplitude in `[0.0 ... 1.0]`
 *   * V/Oct pitch in volts (0V = C4)
 *   * gate / trigger as `0.0f` (off) or `1.0f` (on)
 *
 * **Thread safety**: `publish()` is called from the CV-tick ISR, `read()`
 * may be called from main or audio block context.  Reads/writes of a
 * single `float` are atomic on Cortex-M7, but the underlying
 * `unordered_map` is **not** ISR-safe to resize.  Therefore all keys must
 * be inserted during graph build (main thread) before the ISR starts
 * publishing.  After build, the map structure is stable and only the
 * `float` cells are mutated.
 */

#include <cstdint>
#include <string>
#include <string_view>
#include <unordered_map>

namespace mb::runtime {

class CvBus {
public:
    using Key = std::string;

    /** @brief Ensure a slot exists for @p key.  Call from main thread
     *  during graph build, before any ISR publishing starts. */
    float& slot(std::string_view key) {
        return values_[std::string{key}];
    }

    /** @brief Update the value at @p key.  Caller must have called
     *  `slot()` for this key earlier (main-thread allocation).  Safe
     *  to call from the CV-tick ISR. */
    void publish(std::string_view key, float value) {
        auto it = values_.find(std::string{key});
        if (it != values_.end()) it->second = value;
    }

    /** @brief Read the most recently published value, or @p def if
     *  the key was never registered. */
    float read(std::string_view key, float def = 0.0f) const {
        auto it = values_.find(std::string{key});
        return it == values_.end() ? def : it->second;
    }

    /** @brief True if a slot for @p key exists. */
    bool has(std::string_view key) const {
        return values_.find(std::string{key}) != values_.end();
    }

    /** @brief Number of registered signals. */
    std::size_t size() const { return values_.size(); }

    /** @brief Remove all signals.  Call from main thread during graph
     *  tear-down, with the CV ISR stopped. */
    void clear() { values_.clear(); }

    /** @brief Process-wide singleton.  Same lifetime pattern as
     *  `Registry::global()`. */
    static CvBus& global() {
        static CvBus instance;
        return instance;
    }

    /** @brief Build a `"<moduleId>.<portId>"` key without allocating
     *  intermediate `std::string`s in the hot path.  Currently
     *  allocates one string; kept as a helper so the call sites read
     *  the same way and we can optimise later if needed. */
    static Key makeKey(std::string_view moduleId, std::string_view portId) {
        Key k;
        k.reserve(moduleId.size() + 1 + portId.size());
        k.append(moduleId).append(1, '.').append(portId);
        return k;
    }

private:
    std::unordered_map<Key, float> values_;
};

}  // namespace mb::runtime
