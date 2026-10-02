#pragma once
/**
 * @file KernelStream.h
 * @brief Gedeelde AudioStream-romp voor mmb_dsp-kernels met de uniforme
 *        interface (Init / setControl / setCv / cvOut / Process).
 *
 * Geen module (geen `kTypeId`): `tools/contract_dump.py` slaat dit bestand
 * over. De moduleklassen (WavefolderModule.h, LpgModule.h, …) houden hun
 * poort- en control-namen zelf uitgeschreven, zodat het contract ze ziet;
 * deze romp doet alleen het blokwerk dat anders in elke module herhaald wordt:
 *
 * - int16-blokken naar float en terug, met begrenzing en NaN-vangnet;
 * - controls en CV's komen uit de hoofdlus / CV-tick en worden aan het begin
 *   van een audioblok op de kernel gezet (één schrijver per variabele);
 * - `active(false)` bij parkeren (FW-13): de stream verbruikt zijn ingangen
 *   en zwijgt.
 *
 * De kernel levert `kControls`, `kCvIns`, `kCvOuts` en `kDefaults[]`.
 */

#include <Audio.h>
#include <cstdint>

namespace mmb_link {

template <class Kernel, int AudioIns, int AudioOuts>
class KernelStream final : public AudioStream {
public:
    KernelStream() : AudioStream(AudioIns, AudioIns > 0 ? inputQueue_ : nullptr) {
        kernel_.Init(AUDIO_SAMPLE_RATE_EXACT);
        for (int index = 0; index < Kernel::kControls; ++index) {
            controls_[index] = Kernel::kDefaults[index];
            kernel_.setControl(index, Kernel::kDefaults[index]);
            applied_[index] = Kernel::kDefaults[index];
        }
    }

    void control(int index, float value) { if (index >= 0 && index < Kernel::kControls) controls_[index] = value; }
    void cv(int index, float value) { if (index >= 0 && index < kCvSlots) cv_[index] = value; }
    float cvOut(int index) const { return index >= 0 && index < kCvOutSlots ? cvOut_[index] : 0.0f; }
    void active(bool value) { active_ = value; }
    Kernel& kernel() { return kernel_; }

    void update() override {
        audio_block_t* blocks[kInSlots] = {};
        for (int channel = 0; channel < AudioIns; ++channel) blocks[channel] = receiveReadOnly(channel);
        if (!active_) {
            for (int channel = 0; channel < AudioIns; ++channel) if (blocks[channel]) release(blocks[channel]);
            return;
        }
        for (int index = 0; index < Kernel::kControls; ++index) {
            const float value = controls_[index];
            if (value != applied_[index]) { kernel_.setControl(index, value); applied_[index] = value; }
        }
        for (int index = 0; index < Kernel::kCvIns; ++index) kernel_.setCv(index, cv_[index]);

        const float* inputs[kInSlots] = {};
        for (int channel = 0; channel < AudioIns; ++channel) {
            if (!blocks[channel]) continue;
            for (int sample = 0; sample < AUDIO_BLOCK_SAMPLES; ++sample)
                in_[channel][sample] = blocks[channel]->data[sample] * (1.0f / 32768.0f);
            inputs[channel] = in_[channel];
            release(blocks[channel]);
        }
        float* outputs[AudioOuts];
        for (int channel = 0; channel < AudioOuts; ++channel) outputs[channel] = out_[channel];
        kernel_.Process(inputs, outputs, AUDIO_BLOCK_SAMPLES);
        for (int index = 0; index < Kernel::kCvOuts; ++index) cvOut_[index] = kernel_.cvOut(index);

        for (int channel = 0; channel < AudioOuts; ++channel) {
            audio_block_t* block = allocate();
            if (!block) continue;
            for (int sample = 0; sample < AUDIO_BLOCK_SAMPLES; ++sample) {
                float value = out_[channel][sample];
                if (!(value == value)) value = 0.0f;
                value = value < -1.0f ? -1.0f : value > 1.0f ? 1.0f : value;
                block->data[sample] = static_cast<int16_t>(value * 32767.0f);
            }
            transmit(block, channel);
            release(block);
        }
    }

private:
    static constexpr int kInSlots = AudioIns > 0 ? AudioIns : 1;
    static constexpr int kCvSlots = Kernel::kCvIns > 0 ? Kernel::kCvIns : 1;
    static constexpr int kCvOutSlots = Kernel::kCvOuts > 0 ? Kernel::kCvOuts : 1;

    audio_block_t* inputQueue_[kInSlots] = {};
    Kernel kernel_;
    float in_[kInSlots][AUDIO_BLOCK_SAMPLES];
    float out_[AudioOuts][AUDIO_BLOCK_SAMPLES];
    volatile float controls_[Kernel::kControls];
    float applied_[Kernel::kControls];
    volatile float cv_[kCvSlots] = {};
    volatile float cvOut_[kCvOutSlots] = {};
    volatile bool active_ = true;
};

}  // namespace mmb_link
