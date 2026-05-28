#pragma once
/**
 * @file VoiceAllocator.h
 * @brief Fixed-size N-voice polyphony allocator with last-note priority
 *        and oldest-voice stealing.
 *
 * @details
 * Manages up to `kMaxAllocVoices` simultaneous voices.  Each voice is
 * either *free* (gate low, available for new notes) or *held* (gate high,
 * currently sounding a MIDI note).
 *
 * **Allocation strategy (NoteOn):**
 * 1. If any free voices exist, pick the one that has been free the longest
 *    (lowest `age`) — this reuses the voice that has had the most time to
 *    finish its release phase, minimising clicks.
 * 2. If all voices are held, steal the *oldest* held voice (the one that
 *    has been sounding longest).  The stolen note's index is returned in
 *    `AllocResult::prevNote` so the caller can cleanly retrigger envelopes.
 *
 * **Release strategy (NoteOff):**
 * Last-note priority: when the same MIDI note appears on multiple voices
 * (e.g. after a steal + retrigger), only the *most recently allocated*
 * instance is released.  This prevents a stale NoteOff from silencing a
 * note that was retriggered after the original was stolen.
 *
 * **Thread safety:**
 * This class is a pure, stateless-from-the-outside data structure with no
 * I/O, no timers, and no dynamic allocation.  It is not inherently
 * thread-safe; callers must ensure mutual exclusion when mixing ISR and
 * main-thread access (see `MidiInModule`).
 *
 * **See also:** `doc/protocols/schemas/patch.synth.v1.md`
 */

#include "Types.h"
#include <array>
#include <cstdint>

namespace mb {

/** @brief Maximum number of simultaneous voices the allocator can manage. */
inline constexpr uint8_t kMaxAllocVoices = 16;

/** @brief Per-voice runtime state maintained by the allocator. */
struct VoiceState {
    bool     held = false;  ///< Gate is currently high (note sounding).
    uint8_t  note = 0;      ///< MIDI note number (0–127); only meaningful while `held`.
    uint32_t age  = 0;      ///< Monotonically increasing timestamp; higher = more recently allocated/released.
};

/** @brief Return value from `VoiceAllocator::noteOn()`. */
struct AllocResult {
    uint8_t voiceIdx = 0;     ///< Voice slot index assigned to the new note (0 … voiceCount−1).
    bool    stole    = false; ///< True if an already-held voice was evicted to make room.
    uint8_t prevNote = 0;     ///< MIDI note that was stolen (valid only when `stole == true`).
};

/** @brief Fixed-size N-voice polyphony allocator.
 *  Configure voice count once, then call `noteOn()`/`noteOff()` per MIDI event. */
class VoiceAllocator {
public:
    /** @brief Set the polyphony count and reset all voice state.
     *  @p voiceCount is clamped to `kMaxAllocVoices` silently. */
    void configure(uint8_t voiceCount);

    /** @brief Allocate a voice for @p note.
     *  Returns the chosen voice slot.  Prefers the oldest free voice;
     *  steals the oldest held voice when all slots are in use. */
    AllocResult noteOn(uint8_t note);

    /** @brief Release the voice holding @p note.
     *  When the same note appears on multiple voices (after a steal),
     *  releases only the most recently allocated instance (last-note priority).
     *  @return Voice index that was released, or 0xFF if no voice held the note. */
    uint8_t     noteOff(uint8_t note);

    /** @brief Release all voices simultaneously (MIDI All Notes Off / patch reload). */
    void        allOff();

    /** @brief Currently configured polyphony count. */
    uint8_t            voiceCount() const { return voiceCount_; }

    /** @brief Read-only access to per-voice state at index @p i. */
    const VoiceState&  state(uint8_t i)  const { return voices_[i]; }

private:
    std::array<VoiceState, kMaxAllocVoices> voices_{};  ///< Voice state table, indexed 0…kMaxAllocVoices−1.
    uint8_t  voiceCount_ = 0;  ///< Active polyphony count (≤ kMaxAllocVoices).
    uint32_t tick_       = 0;  ///< Monotonic counter incremented on every alloc/release; drives `age` comparison.
};

}  // namespace mb
