#pragma once
// Excitable-media synthesis: een begrensd raster van 16 x 16 prikkelbare
// cellen (Greenberg-Hastings): rust -> actief (Excite stappen) -> refractair
// (Refract stappen) -> rust. Een rustende cel wordt actief zodra minstens
// Thresh van zijn vier buren actief is. Twee pacemakers (A links, B rechts)
// prikkelen hun cel periodiek op de toonhoogte van V/Oct zolang hun gate hoog
// is; de golffronten lopen één cel per stap, doven uit aan de rand en
// vernietigen elkaar waar ze botsen. Twee Gaussische pickups lezen de
// activiteit als stereo-audio. Is de periode korter dan actief + refractair,
// dan slaat de cel elke tweede puls over: een subharmoniek ontstaat causaal
// uit het medium. Het medium stapt elke Speed samples (1, 2 of 4).
//
// Eigen compacte uitvoering; geen reactie-diffusievergelijking en geen
// claim op een nieuwe synthesevorm. Gedeeld door Teensy (ExcitableModule.h)
// en browser (excitable_wasm.cc). Toestand: 256 bytes cellen, geen heap.
#include <cmath>
#include <cstdint>

namespace mmb_dsp {

class ExcitableMedium {
public:
    static constexpr int kSize = 16;
    static constexpr int kCells = kSize * kSize;
    enum Control { Pitch, Detune, Excite, Refract, Thresh, Speed, Pickup, Level };

    void Init(float rate) {
        *this = ExcitableMedium();
        rate_ = finiteClamp(rate, 8000.0f, 192000.0f, 44100.0f);
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Pitch: pitch_ = finiteClamp(value, -36, 36, 0); break;
            case Detune: detune_ = finiteClamp(value, -24, 24, 7); break;
            case Excite: excite_ = static_cast<int>(finiteClamp(value, 1, 8, 3) + 0.5f); break;
            case Refract: refract_ = static_cast<int>(finiteClamp(value, 2, 60, 12) + 0.5f); break;
            case Thresh: thresh_ = static_cast<int>(finiteClamp(value, 1, 3, 1) + 0.5f); break;
            case Speed: divisor_ = static_cast<int>(finiteClamp(value, 1, 4, 2) + 0.5f); if (divisor_ == 3) divisor_ = 2; break;
            case Pickup: pickup_ = finiteClamp(value, 0, 1, 0.4f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); return;
            default: return;
        }
        prepare();
    }

    void setVoct(float value) {
        value = finiteClamp(value, -5, 5, 0);
        if (value != voct_) { voct_ = value; prepare(); }
    }
    void setVoctB(float value) {
        value = finiteClamp(value, -5, 5, 0);
        if (value != voctB_) { voctB_ = value; prepare(); }
    }

    void clear() {
        for (int cell = 0; cell < kCells; ++cell) state_[cell] = 0;
        phaseA_ = phaseB_ = 0;
        activeCells_ = 0;
        heldL_ = heldR_ = outL_ = outR_ = 0;
        dcInL_ = dcInR_ = dcOutL_ = dcOutR_ = 0;
    }

    void Tick(float gateA, float gateB, float reset, float& left, float& right) {
        const bool highReset = reset >= 0.5f;
        if (highReset && !resetHigh_) clear();
        resetHigh_ = highReset;
        if (++sampleCounter_ >= divisor_) {
            sampleCounter_ = 0;
            step(!highReset && gateA >= 0.5f, !highReset && gateB >= 0.5f);
        }
        // Sample-and-hold per stap, dan een eenvoudige eenpool-lowpass tegen
        // de trapjes, en DC-blokkering per kanaal.
        outL_ += (heldL_ - outL_) * smooth_;
        outR_ += (heldR_ - outR_) * smooth_;
        const float blockedL = outL_ - dcInL_ + dcCoefficient_ * dcOutL_;
        dcInL_ = outL_; dcOutL_ = blockedL;
        const float blockedR = outR_ - dcInR_ + dcCoefficient_ * dcOutR_;
        dcInR_ = outR_; dcOutR_ = blockedR;
        left = level_ * (blockedL > 1 ? 1 : blockedL < -1 ? -1 : blockedL);
        right = level_ * (blockedR > 1 ? 1 : blockedR < -1 ? -1 : blockedR);
    }

    /** Aandeel actieve plus refractaire cellen, 0..1. */
    float activity() const { return static_cast<float>(activeCells_) / kCells; }
    int cellState(int x, int y) const { return state_[index(x, y)]; }

private:
    static float finiteClamp(float value, float low, float high, float fallback) {
        return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
    }
    static int index(int x, int y) { return y * kSize + x; }

    void prepare() {
        const float stepRate = rate_ / divisor_;
        const float rootA = 261.625565f * std::exp2(voct_ + pitch_ / 12);
        const float rootB = 261.625565f * std::exp2(voct_ + voctB_ + (pitch_ + detune_) / 12);
        incrementA_ = finiteClamp(rootA, 5, stepRate * 0.5f, 261.625565f) / stepRate;
        incrementB_ = finiteClamp(rootB, 5, stepRate * 0.5f, 261.625565f) / stepRate;
        // Pickups: bij Pickup 0 vlak bij de bronnen, bij 1 samen in het midden
        // waar de fronten botsen.
        pickupLx_ = 3 + pickup_ * 4.5f;
        pickupRx_ = 12 - pickup_ * 4.5f;
        for (int cell = 0; cell < kCells; ++cell) {
            const int x = cell % kSize, y = cell / kSize;
            const float dyl = y - 8.0f, dxl = x - pickupLx_, dxr = x - pickupRx_;
            weightL_[cell] = std::exp(-(dxl * dxl + dyl * dyl) / 3.0f);
            weightR_[cell] = std::exp(-(dxr * dxr + dyl * dyl) / 3.0f);
        }
        smooth_ = 1 - std::exp(-6.28318530718f * 6000 / rate_);
        dcCoefficient_ = 1 - 6.28318530718f * 20 / rate_;
    }

    float value(int cell) const {
        const int state = state_[cell];
        if (state == 0) return 0;
        if (state <= excite_) return 1;
        // Refractair: negatieve staart die lineair naar nul loopt. De puls is
        // daardoor bipolair (oppervlak +Excite tegen -Refract/4), zodat de
        // DC-blokker weinig te doen heeft en loslaten geen plof geeft.
        return -static_cast<float>(excite_ + refract_ - state) / refract_ * 0.5f;
    }

    void step(bool gateA, bool gateB) {
        // Pacemakers: prikkelen hun cel bij iedere fasewikkeling zolang de
        // gate hoog is. Een refractaire cel negeert de prikkel (blok).
        if (gateA) {
            phaseA_ += incrementA_;
            if (phaseA_ >= 1) { phaseA_ -= 1; excite(index(3, 8)); }
        } else phaseA_ = 0;
        if (gateB) {
            phaseB_ += incrementB_;
            if (phaseB_ >= 1) { phaseB_ -= 1; excite(index(12, 8)); }
        } else phaseB_ = 0;

        uint8_t next[kCells];
        const int full = excite_ + refract_;
        int active = 0;
        for (int y = 0; y < kSize; ++y) {
            for (int x = 0; x < kSize; ++x) {
                const int cell = index(x, y);
                const int state = state_[cell];
                int result;
                if (state == 0) {
                    int count = 0;
                    if (x > 0 && isExcited(state_[cell - 1])) ++count;
                    if (x < kSize - 1 && isExcited(state_[cell + 1])) ++count;
                    if (y > 0 && isExcited(state_[cell - kSize])) ++count;
                    if (y < kSize - 1 && isExcited(state_[cell + kSize])) ++count;
                    result = count >= thresh_ ? 1 : 0;
                } else {
                    result = state + 1 > full ? 0 : state + 1;
                }
                next[cell] = static_cast<uint8_t>(result);
                if (result) ++active;
            }
        }
        for (int cell = 0; cell < kCells; ++cell) state_[cell] = next[cell];
        activeCells_ = active;
        float sumL = 0, sumR = 0;
        for (int cell = 0; cell < kCells; ++cell) {
            const float v = value(cell);
            if (v == 0) continue;
            sumL += weightL_[cell] * v;
            sumR += weightR_[cell] * v;
        }
        // Een passerend front vult een flink deel van de Gaussische pickup
        // (gewichtssom ~9,4); 0,08 houdt de piek rond 0,6 bij Level 1.
        heldL_ = sumL * 0.08f;
        heldR_ = sumR * 0.08f;
    }

    bool isExcited(int state) const { return state >= 1 && state <= excite_; }
    void excite(int cell) { if (state_[cell] == 0) state_[cell] = 1; }

    float rate_ = 44100, pitch_ = 0, detune_ = 7, pickup_ = 0.4f, level_ = 0.8f, voct_ = 0, voctB_ = 0;
    int excite_ = 3, refract_ = 12, thresh_ = 1, divisor_ = 2;
    uint8_t state_[kCells] = {};
    float weightL_[kCells] = {}, weightR_[kCells] = {};
    float pickupLx_ = 0, pickupRx_ = 0;
    float incrementA_ = 0, incrementB_ = 0, phaseA_ = 0, phaseB_ = 0;
    int sampleCounter_ = 0, activeCells_ = 0;
    float heldL_ = 0, heldR_ = 0, outL_ = 0, outR_ = 0, smooth_ = 1;
    float dcInL_ = 0, dcInR_ = 0, dcOutL_ = 0, dcOutR_ = 0, dcCoefficient_ = 0;
    bool resetHigh_ = false;
};

}
