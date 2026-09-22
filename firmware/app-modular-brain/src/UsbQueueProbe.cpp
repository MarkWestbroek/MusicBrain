// De wachtrij-pointers van AudioOutputUSB zijn private statics. Een
// expliciete template-instantiatie mag private leden noemen; zo lezen we ze
// uit zonder de Teensy-core aan te passen.
#include <Arduino.h>
#include "UsbQueueProbe.h"

namespace {
template <typename Tag, typename Tag::type P>
struct Rob { friend typename Tag::type get(Tag) { return P; } };
struct L1  { using type = audio_block_t**; friend type get(L1); };
struct L2  { using type = audio_block_t**; friend type get(L2); };
struct Off { using type = uint16_t*;       friend type get(Off); };
template struct Rob<L1,  &AudioOutputUSB::left_1st>;
template struct Rob<L2,  &AudioOutputUSB::left_2nd>;
template struct Rob<Off, &AudioOutputUSB::offset_1st>;

inline uint32_t blockCycles() {
    return static_cast<uint32_t>(static_cast<double>(F_CPU_ACTUAL) * AUDIO_BLOCK_SAMPLES
                                 / AUDIO_SAMPLE_RATE_EXACT);
}
}  // namespace

UsbQueueProbe::Stats UsbQueueProbe::s_;
uint32_t          UsbQueueProbe::lastCycle_ = 0;
volatile bool     UsbQueueProbe::requested_ = false;
volatile uint32_t UsbQueueProbe::lastKick_ = 0;
IntervalTimer     UsbQueueProbe::timer_;

int usbTxQueueFill(bool& first, bool& second) {
    __disable_irq();
    const audio_block_t* l1 = *get(L1{});
    const audio_block_t* l2 = *get(L2{});
    const int off = *get(Off{});
    __enable_irq();
    first = l1 != nullptr; second = l2 != nullptr;
    return (first ? AUDIO_BLOCK_SAMPLES - off : 0) + (second ? AUDIO_BLOCK_SAMPLES : 0);
}

void UsbQueueProbe::startPacer() {
    update_setup();                          // de core start nu geen eigen timer
    lastKick_ = ARM_DWT_CYCCNT;
    const float usec = 1e6f * AUDIO_BLOCK_SAMPLES / AUDIO_SAMPLE_RATE_EXACT / 16.0f;
    timer_.begin(pace, usec);
}

void UsbQueueProbe::kick(uint32_t now) {
    requested_ = true;
    lastKick_ = now;
    update_all();                            // software-interrupt: audiocyclus
}

// Timer-ISR, elke 1/16 blok (~181 us).
void UsbQueueProbe::pace() {
    const uint32_t now = ARM_DWT_CYCCNT;
    const uint32_t block = blockCycles();
    if (usb_audio_transmit_setting != 0) {
        bool a, b;
        const int fill = usbTxQueueFill(a, b);
        if (!requested_ && fill <= kLowWater) {
            ++s_.paced;
            kick(now);
        } else if (now - lastKick_ > 3 * block) {
            // Stream open maar de pc haalt niets af: laat de patch doorlopen.
            ++s_.freeRun;
            kick(now);
        }
    } else if (now - lastKick_ >= block) {
        // Geen USB-audiostroom: vrij lopen op de nominale blokperiode.
        ++s_.freeRun;
        const uint32_t next = lastKick_ + block;
        kick(now);
        if (now - next < block) lastKick_ = next;   // gemiddeld exact, zonder drift
    }
}

void UsbQueueProbe::update() {
    if (role_ == Role::After) { requested_ = false; return; }
    const uint32_t now = ARM_DWT_CYCCNT;
    if (lastCycle_ != 0) {
        const uint32_t us = (now - lastCycle_) / (F_CPU_ACTUAL / 1000000);
        if (us < s_.periodMinUs) s_.periodMinUs = us;
        if (us > s_.periodMaxUs) s_.periodMaxUs = us;
    }
    lastCycle_ = now;
    bool a, b;
    const int fill = usbTxQueueFill(a, b);
    if (fill < s_.fillMin) s_.fillMin = fill;
    if (fill > s_.fillMax) s_.fillMax = fill;
    if (b) ++s_.overruns;                                          // usbOut gooit zo een blok weg
    if (!a && usb_audio_transmit_setting != 0) ++s_.underruns;     // de pc kreeg nullen
    ++s_.cycles;
}

UsbQueueProbe::Stats UsbQueueProbe::take() {
    __disable_irq();
    const Stats r = s_;
    s_ = Stats{};
    __enable_irq();
    return r;
}
