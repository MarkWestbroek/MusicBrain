#pragma once
// Gastheer native: hetzelfde <naam>_wasm.cc dat de browser draait, hier
// native gecompileerd (mmb_abi.h) en na deze header ingevoegd. Globale
// toestand, dus één exemplaar per DAW-proces (HostProcessor.h); de wasm2c-
// route (W2cPlugin.h) heeft die beperking niet en is de standaard.

#include "HostProcessor.h"
#include "mmb_abi.h"

#if MMB_PLUGIN_BANK
// In de gastheer (<naam>_wasm.cc, na deze header ingevoegd).
extern "C" int16_t* mmb_blob_ptr(int slot, int bytes);
extern "C" void mmb_blob_commit(int slot, int frames, float rate, int channels);
extern "C" void mmb_zone_set(int idx, int slot, int lowKey, int highKey, int lowVel, int highVel,
                             float root, float tuneCents, float gain, float pan,
                             int loopMode, int loopStart, int loopEnd, float decay, float release,
                             int velTrack, float attack);
extern "C" void mmb_zone_count(int n);
#endif

namespace mmb_plugin {

struct NativeHost {
    static constexpr bool kShared = true;
    static constexpr bool kBank = MMB_PLUGIN_BANK + 0 != 0;

    int numInputs() const { return MMB_NUM_INPUTS; }
    const char* inputId(int i) const { return MMB_INPUTS[i].id; }
    int inputKind(int i) const { return MMB_INPUTS[i].kind; }
    float* inBuf(int i) { return MMB_INPUTS[i].buf; }
    void setConnected(int i, int c) { MMB_INPUTS[i].connected = c; }
    int numOutputs() const { return MMB_NUM_OUTPUTS; }
    int outputKind(int i) const { return MMB_OUTPUTS[i].kind; }
    const float* outBuf(int i) const { return MMB_OUTPUTS[i].buf; }
    int controlIndex(const char* id) const { return mmb_control_index(id); }
    void setControl(int c, float v) { mmb_set_control(c, v); }
    float setRate(float r) { return mmb_set_rate(r); }
    void init() { mmb_init(); }
    float nativeRate() const { return mmb_native_rate(); }
    int block() const { return MMB_BLOCK; }
    bool process(int frames) { mmb_process(frames); return true; }
    const char* typeId() const { return MMB_TYPE_ID; }
#if MMB_PLUGIN_BANK
    int16_t* blobPtr(int slot, int bytes) { return mmb_blob_ptr(slot, bytes); }
    void blobCommit(int slot, int frames, float rate, int channels) { mmb_blob_commit(slot, frames, rate, channels); }
    void zoneSet(int idx, int slot, int lk, int hk, int lv, int hv, float root, float tune, float gain, float pan,
                 int loopMode, int loopStart, int loopEnd, float decay, float release, int velTrack, float attack) {
        mmb_zone_set(idx, slot, lk, hk, lv, hv, root, tune, gain, pan, loopMode, loopStart, loopEnd, decay, release, velTrack, attack);
    }
    void zoneCount(int n) { mmb_zone_count(n); }
#endif
};

using AbiProcessor = HostProcessor<NativeHost>;

}  // namespace mmb_plugin
