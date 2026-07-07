#pragma once
/**
 * @file GridsModule.h
 * @brief Topologische drum-sequencer (typeId `tp_mmb_grids`, FW-SQ-2).
 *
 * @details
 * Geïnspireerd op MI Grids (het *idee*: een 2D-kaart van drumpatronen,
 * density-knoppen per stem, accenten, chaos), maar **volledig eigen
 * patroondata en -generator** — de upstream Grids-firmware is GPL-3.0 en
 * die data vendoren we bewust niet naast de MIT/Apache-libs.
 *
 * Werking: per instrument (BD/SD/HH) bestaan drie hand-geschreven
 * 32-staps "grooves" (basis, druk, gesyncopeerd; waarden 0..255 zijn
 * prioriteiten per stap). De X-as morpht basis→druk, de Y-as mengt de
 * gesyncopeerde smaak erin. Daaroverheen ligt bilineair geïnterpoleerde
 * hash-textuur (value-noise op een 5×5-raster) zodat elke plek op de
 * kaart een eigen karakter heeft — schuiven verandert het patroon
 * geleidelijk, zoals bij het origineel. De density-knop per stem is een
 * drempel: hogere prioriteiten klinken het eerst; niveaus > 192 krijgen
 * een accent. `chaos` voegt per patroonronde random perturbatie toe.
 *
 * Port map:
 * | Dir | portId | Kind | Betekenis                                 |
 * |-----|--------|------|--------------------------------------------|
 * | in  | `clock` | Gate | Externe stap-klok (1 puls = 1/16), met `extclock` |
 * | in  | `reset` | Gate | Terug naar stap 0                         |
 * | in  | `x`/`x_cv`, `y`/`y_cv` | Cv | Kaartpositie-modulatie      |
 * | out | `bd` `sd` `hh` | Gate | Triggers (10 ms)                   |
 * | out | `acc`  | Gate | Accent (bij elke geaccentueerde hit)       |
 *
 * Controls: `tempo` (BPM, interne klok), `x` `y` (0..1 kaartpositie),
 * `bd` `sd` `hh` (0..1 density per stem), `chaos` (0..1),
 * `extclock` (bool).
 */

#include "mb/runtime/CvModule.h"
#include "mb/runtime/Registry.h"
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

/** @brief 2D-drumkaart-sequencer op de 1 kHz CV-tick. */
class GridsModule final : public mb::runtime::CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_grids";

    explicit GridsModule(std::string_view id)
        : CvModule(kTypeId, id) {}

    // --- CvModule -------------------------------------------------------

    void tick() override {
        // Klok: extern (flank op `clock`) of intern (tempo).
        bool advance = false;
        if (extClock_) {
            if (clockIn_ && !clockPrev_) advance = true;
            clockPrev_ = clockIn_;
        } else {
            msCounter_ += 1.0f;
            const float periodMs = 15000.0f / bpm_;      // 1/16 noot
            if (msCounter_ >= periodMs) { msCounter_ -= periodMs; advance = true; }
        }
        if (resetIn_ && !resetPrev_) { step_ = 0; msCounter_ = 0.0f; }
        resetPrev_ = resetIn_;

        if (advance) evaluateStep();

        for (int i = 0; i < 4; ++i)
            if (gateTicks_[i] > 0) --gateTicks_[i];
    }

    // --- Ports ------------------------------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "bd" || portId == "sd" || portId == "hh" ||
            portId == "acc")
            return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock" || portId == "reset") return PortKind::Gate;
        if (cvPortIsGrids(portId, "x") || cvPortIsGrids(portId, "y")) return PortKind::Cv;
        return PortKind::None;
    }

    float readCvPort(std::string_view portId) const override {
        if (portId == "bd")  return gateTicks_[0] > 0 ? 1.0f : 0.0f;
        if (portId == "sd")  return gateTicks_[1] > 0 ? 1.0f : 0.0f;
        if (portId == "hh")  return gateTicks_[2] > 0 ? 1.0f : 0.0f;
        if (portId == "acc") return gateTicks_[3] > 0 ? 1.0f : 0.0f;
        return 0.0f;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "clock")  clockIn_ = value >= 0.5f;
        else if (portId == "reset")  resetIn_ = value >= 0.5f;
        else if (cvPortIsGrids(portId, "x"))  xCv_ = value;
        else if (cvPortIsGrids(portId, "y"))  yCv_ = value;
    }

    // --- Controls -----------------------------------------------------------

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        auto asBool = [&](bool fb) -> bool {
            if (auto* b = std::get_if<bool>        (&value)) return *b;
            if (auto* i = std::get_if<std::int32_t>(&value)) return *i != 0;
            if (auto* f = std::get_if<float>       (&value)) return *f >= 0.5f;
            return fb;
        };
        if      (controlId == "tempo") { bpm_ = asFloat(120.0f);
                                         if (bpm_ < 20.0f) bpm_ = 20.0f;
                                         if (bpm_ > 300.0f) bpm_ = 300.0f; }
        else if (controlId == "x")     x_ = clamp01(asFloat(0.5f));
        else if (controlId == "y")     y_ = clamp01(asFloat(0.5f));
        else if (controlId == "chaos") chaos_ = clamp01(asFloat(0.0f));
        else if (controlId == "bd")    dens_[0] = clamp01(asFloat(0.75f));
        else if (controlId == "sd")    dens_[1] = clamp01(asFloat(0.6f));
        else if (controlId == "hh")    dens_[2] = clamp01(asFloat(0.7f));
        else if (controlId == "extclock") extClock_ = asBool(false);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<GridsModule>(id);
            });
    }

private:
    static bool cvPortIsGrids(std::string_view portId, std::string_view name) {
        if (portId == name) return true;
        constexpr std::string_view kSuffix = "_cv";
        return portId.size() == name.size() + kSuffix.size()
            && portId.substr(0, name.size()) == name
            && portId.substr(name.size()) == kSuffix;
    }
    static float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /// Deterministische hash → 0..255 (value-noise-rooster van de kaart).
    static uint8_t hash8(uint32_t cx, uint32_t cy, uint32_t k) {
        uint32_t h = cx * 374761393u + cy * 668265263u + k * 2246822519u;
        h ^= h >> 13; h *= 1274126177u; h ^= h >> 16;
        return static_cast<uint8_t>(h);
    }

    /// Prioriteit (0..255) van stap `s` voor instrument `instr` op (x,y).
    uint8_t mapLevel(int instr, int s, float x, float y) const {
        // Drie eigen grooves per instrument: basis / druk / gesyncopeerd.
        static const uint8_t kBase[3][32] = {
            { 255,10,20,30, 96,12,36,20, 208,10,24,40, 88,12,60,22,
              232,10,20,30, 92,12,44,20, 216,10,28,36, 84,14,70,26 },   // BD 4-op-de-vloer
            {  12, 8,20,10, 30,12,40,16, 255,12,24,18, 40,14,60,24,
               16,10,24,12, 36,12,50,20, 248,16,40,24, 70,20,90,40 },   // SD backbeat
            { 190,14,120,16, 200,14,130,18, 190,14,120,16, 200,16,130,20,
              190,14,124,16, 200,16,130,18, 190,16,124,18, 200,18,140,24 }, // HH 8sten
        };
        static const uint8_t kBusy[3][32] = {
            { 255,20,60,90, 160,24,110,60, 224,30,130,60, 150,30,120,70,
              240,20,60,100, 160,26,110,60, 224,40,140,70, 150,40,160,90 }, // BD driving
            {  20,30,60,50, 80,40,90,60, 255,50,90,60, 100,60,120,70,
               30,36,70,50, 90,44,100,60, 250,60,110,70, 130,80,160,100 }, // SD ghosts
            { 220,120,170,120, 210,120,170,130, 215,120,170,124, 210,124,174,134,
              220,120,170,124, 210,124,170,130, 215,124,174,130, 210,130,180,150 }, // HH 16den
        };
        static const uint8_t kAlt[3][32] = {
            { 255,12,30,100, 40,20,170,40, 60,24,190,50, 90,26,120,36,
              235,14,40,110, 44,22,160,40, 70,30,180,60, 100,30,130,60 },  // BD boom-bap
            {  16,12,40,24, 210,20,60,30, 90,20,200,30, 60,24,90,40,
               20,14,44,26, 215,22,70,30, 100,26,190,40, 80,30,120,60 },   // SD displaced
            {  40,12,60,14, 235,16,70,18, 44,12,64,16, 235,16,74,20,
               40,14,60,14, 235,16,70,20, 44,14,66,18, 235,20,90,30 },     // HH offbeat-open
        };
        const float a = static_cast<float>(kBase[instr][s]);
        const float b = static_cast<float>(kBusy[instr][s]);
        const float c = static_cast<float>(kAlt [instr][s]);
        float v = a + (b - a) * x;
        v = v + (c - v) * (y * 0.6f);

        // Value-noise op een 5×5-rooster: elke kaartcel een eigen karakter,
        // bilineair gemengd zodat schuiven vloeiend blijft.
        const float gx = x * 4.0f, gy = y * 4.0f;
        const uint32_t cx = static_cast<uint32_t>(gx), cy = static_cast<uint32_t>(gy);
        const float fx = gx - cx, fy = gy - cy;
        const uint32_t k = static_cast<uint32_t>(instr * 37 + s);
        const float n00 = hash8(cx,     cy,     k), n10 = hash8(cx + 1, cy,     k);
        const float n01 = hash8(cx,     cy + 1, k), n11 = hash8(cx + 1, cy + 1, k);
        const float n = (n00 + (n10 - n00) * fx) * (1.0f - fy)
                      + (n01 + (n11 - n01) * fx) * fy;
        v += (n - 128.0f) * 0.45f;

        if (v < 0.0f) v = 0.0f;
        if (v > 255.0f) v = 255.0f;
        return static_cast<uint8_t>(v);
    }

    void evaluateStep() {
        if (step_ == 0) {           // chaos: perturbatie per patroonronde
            for (int i = 0; i < 3; ++i) {
                rng_ = rng_ * 1664525u + 1013904223u;
                pert_[i] = static_cast<uint8_t>(
                    ((rng_ >> 24) * static_cast<uint32_t>(chaos_ * 64.0f)) >> 8);
            }
        }
        const float x = clamp01(x_ + xCv_);
        const float y = clamp01(y_ + yCv_);
        bool accent = false;
        for (int i = 0; i < 3; ++i) {
            int level = mapLevel(i, step_, x, y) + pert_[i];
            if (level > 255) level = 255;
            const int threshold = 255 - static_cast<int>(dens_[i] * 255.0f);
            if (level > threshold) {
                gateTicks_[i] = 10;                     // 10 ms trigger
                if (level > 192) accent = true;
            }
        }
        if (accent) gateTicks_[3] = 10;
        step_ = (step_ + 1) & 31;
    }

    float bpm_ = 120.0f, x_ = 0.5f, y_ = 0.5f, chaos_ = 0.0f;
    float dens_[3] = { 0.75f, 0.6f, 0.7f };
    float xCv_ = 0.0f, yCv_ = 0.0f;
    bool  extClock_ = false;

    float msCounter_ = 0.0f;
    int   step_ = 0;
    bool  clockIn_ = false, clockPrev_ = false;
    bool  resetIn_ = false, resetPrev_ = false;
    int   gateTicks_[4] = {};
    uint8_t pert_[3] = {};
    uint32_t rng_ = 0xBEEF1234u;
};

}  // namespace mmb_link
