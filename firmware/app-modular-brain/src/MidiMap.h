/**
 * @file MidiMap.h
 * @brief FW-CS-1 — control-surface-map: bindt inkomende MIDI-CC's aan
 *        module-controls (zie doc/plans/control-surface.md).
 *
 * @details
 * De editor stuurt in de projectconfig een optionele `midiMap`:
 *
 *   "midiMap": {
 *     "bindings": [
 *       { "ch": 1, "cc": 74, "mod": "vcf1", "ctrl": "cutoff",
 *         "min": 0.0, "max": 1.0, "curve": "lin" }
 *     ]
 *   }
 *
 * `load()` parseert die lijst; `match()` zoekt een binding bij een inkomende
 * (kanaal, CC) en `scale()` beeldt de 7-bit waarde af op het controlbereik.
 * De aanroeper (main.cpp) stuurt de geschaalde waarde door het
 * `pokeControl`-pad (FW-LIVE-1), zodat toepassen én persisteren zich exact
 * als een editor-poke gedragen. Gebonden CC's worden daar *geconsumeerd*:
 * ze bereiken de MidiInModules niet meer.
 *
 * **Kanaalconventie**: binding `ch` is 1–16, zoals usbMIDI kanalen aan de
 * handlers doorgeeft; 0 = omni. Let op: de editor-MIDI-bridge
 * (`{"type":"cc"}`) stuurt historisch 0-based kanalen (mod-wheel gebruikt
 * ch=0) — control-surface-verkeer via de bridge moet dus 1-based zenden
 * (ED-CS-2), anders matcht een binding met ch=1 niet.
 *
 * **Beperking**: waardes worden als float ge-`setControl`d. Continue
 * controls (knob/slider) werken; switch/toggle-controls die een int32/bool
 * verwachten zijn een latere uitbreiding.
 *
 * Parse gebeurt op config-push (main thread), nooit in de audio-ISR; heap
 * (std::string voor de ids) is daar prima, net als in ProjectRuntime.
 */
#pragma once

#include <ArduinoJson.h>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>

namespace mmb_link {

/** @brief Vaste tabel van CC→control-bindings uit de projectconfig. */
class MidiMap {
public:
    static constexpr std::size_t kMaxBindings = 64;

    struct Binding {
        uint8_t     ch  = 0;    ///< MIDI-kanaal 1–16; 0 = omni.
        uint8_t     cc  = 0;    ///< CC-nummer 0–127.
        std::string moduleId;   ///< Doelmodule (zelfde id als controlPoke).
        std::string controlId;  ///< Control op die module.
        float       min = 0.0f; ///< Controlwaarde bij CC 0.
        float       max = 1.0f; ///< Controlwaarde bij CC 127.
        bool        exp = false;///< Curve: false = lineair, true = exponentieel.
        /** Kwantisatiestap van de doel-control (KnobControl.step); 0 = continu. */
        float       step = 0.0f;
        /** Afgeleid: step en min zijn heel → poke als int32 (DX7 bank/program). */
        bool        integer = false;
    };

    /**
     * @brief (Her)laad de bindings uit `project.midiMap.bindings`.
     *
     * Ontbrekende of lege `midiMap` = lege tabel (geen fout). Entries zonder
     * `mod`/`ctrl` of met een CC buiten 0–127, en alles voorbij
     * `kMaxBindings`, worden geteld als `skipped()`.
     *
     * @param project  Het `project`-object uit het config-bericht.
     * @return Aantal geladen bindings.
     */
    int load(JsonObjectConst project) {
        count_   = 0;
        skipped_ = 0;
        JsonArrayConst arr = project["midiMap"]["bindings"].as<JsonArrayConst>();
        if (arr.isNull()) return 0;
        for (JsonObjectConst b : arr) {
            const char* mod  = b["mod"]  | "";
            const char* ctrl = b["ctrl"] | "";
            const int   cc   = b["cc"]   | -1;
            const int   ch   = b["ch"]   | 0;
            if (!*mod || !*ctrl || cc < 0 || cc > 127 || ch < 0 || ch > 16 ||
                count_ >= kMaxBindings) {
                ++skipped_;
                continue;
            }
            Binding& e  = bindings_[count_++];
            e.ch        = static_cast<uint8_t>(ch);
            e.cc        = static_cast<uint8_t>(cc);
            e.moduleId  = mod;
            e.controlId = ctrl;
            e.min       = b["min"] | 0.0f;
            e.max       = b["max"] | 1.0f;
            e.exp       = std::strcmp(b["curve"] | "lin", "exp") == 0;
            e.step      = b["step"] | 0.0f;
            e.integer   = e.step > 0.0f
                       && e.step == std::floor(e.step)
                       && e.min  == std::floor(e.min);
        }
        return static_cast<int>(count_);
    }

    /**
     * @brief Roep @p fn aan voor elke binding die (kanaal, CC) matcht.
     *
     * Meerdere matches zijn normaal: de editor vouwt een binding op een
     * poly-master uit naar één binding per stem, allemaal op dezelfde
     * (ch, cc).
     *
     * @return Aantal matches (0 = CC is ongebonden).
     */
    template <typename F>
    int forEachMatch(uint8_t ch, uint8_t cc, F&& fn) const {
        int n = 0;
        for (std::size_t i = 0; i < count_; ++i) {
            const Binding& b = bindings_[i];
            if (b.cc == cc && (b.ch == 0 || b.ch == ch)) { fn(b); ++n; }
        }
        return n;
    }

    /** @brief Beeld een 7-bit CC-waarde af op het controlbereik van @p b,
     *  met step-kwantisatie (geclamped) wanneer de control die heeft. */
    static float scale(const Binding& b, uint8_t value) {
        float t = static_cast<float>(value) / 127.0f;
        if (b.exp) t *= t;
        float v = b.min + (b.max - b.min) * t;
        if (b.step > 0.0f) {
            v = b.min + std::round((v - b.min) / b.step) * b.step;
            v = std::clamp(v, std::min(b.min, b.max), std::max(b.min, b.max));
        }
        return v;
    }

    std::size_t size()    const { return count_; }
    std::size_t skipped() const { return skipped_; }

private:
    Binding     bindings_[kMaxBindings];
    std::size_t count_   = 0;
    std::size_t skipped_ = 0;
};

}  // namespace mmb_link
