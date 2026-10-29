#pragma once
// Gastheer via wasm2c: de .wasm uit editor/public/wasm (dezelfde die de
// simulator draait) als C, door tools/plugin/wasm2c/gen_w2c.py gemaakt
// (mod.c/mod.h/mod_glue.h in de bouwmap). Elk exemplaar heeft een eigen
// instantie: eigen lineair geheugen en eigen globals, dus zoveel exemplaren
// als de DAW wil. Gemeten even snel als native (doc/plans/plugin-patches.md §4).
//
// Geheugen: expliciete bounds checks (WASM_RT_USE_MMAP=0,
// WASM_RT_MEMCHECK_BOUNDS_CHECK=1, zie CMakeLists.txt), dus geen signal
// handler en geen gereserveerde gigabytes in de DAW. Een trap (fout in de
// module) springt terug naar wasm_rt_impl_try: de module zwijgt vanaf dan en
// meldt dat, de DAW loopt door.
//
// Adressen in het wasm-geheugen (poortbuffers, strings, bank-slots) worden
// bij elk gebruik opnieuw bij `data` opgeteld: het geheugen kan groeien en
// verhuizen (bank laden).

#include "HostProcessor.h"

extern "C" {
#include "wasm-rt.h"
#include "wasm-rt-exceptions.h"
#include "wasm-rt-impl.h"
}
#include "mod_glue.h"

#include <mutex>

namespace mmb_plugin {

class W2cHost {
public:
    static constexpr bool kShared = false;
    static constexpr bool kBank = MMB_W2C_HAS_BLOB && MMB_W2C_HAS_ZONES;

    W2cHost() {
        static std::once_flag once;
        std::call_once(once, [] { wasm_rt_init(); });
#if MMB_W2C_WASI
        wasm2c_mod_instantiate(&inst_, &wasi_);
#else
        wasm2c_mod_instantiate(&inst_);
#endif
        nIn_ = static_cast<int>(w2c_mod_mmb_num_inputs(&inst_));
        nOut_ = static_cast<int>(w2c_mod_mmb_num_outputs(&inst_));
        for (int i = 0; i < nIn_; ++i) {
            inOff_.push_back(w2c_mod_mmb_input_ptr(&inst_, static_cast<u32>(i)));
            inKind_.push_back(static_cast<int>(w2c_mod_mmb_input_kind(&inst_, static_cast<u32>(i))));
            inId_.push_back(str(w2c_mod_mmb_input_id(&inst_, static_cast<u32>(i))));
        }
        for (int i = 0; i < nOut_; ++i) {
            outOff_.push_back(w2c_mod_mmb_output_ptr(&inst_, static_cast<u32>(i)));
            outKind_.push_back(static_cast<int>(w2c_mod_mmb_output_kind(&inst_, static_cast<u32>(i))));
        }
        for (u32 c = 0; c < w2c_mod_mmb_num_controls(&inst_); ++c) controlId_.push_back(str(w2c_mod_mmb_control_id(&inst_, c)));
        typeId_ = str(w2c_mod_mmb_type_id(&inst_));
    }
    ~W2cHost() { wasm2c_mod_free(&inst_); }
    W2cHost(const W2cHost&) = delete;
    W2cHost& operator=(const W2cHost&) = delete;

    int numInputs() const { return nIn_; }
    const char* inputId(int i) const { return inId_[static_cast<std::size_t>(i)].c_str(); }
    int inputKind(int i) const { return inKind_[static_cast<std::size_t>(i)]; }
    float* inBuf(int i) { return reinterpret_cast<float*>(mem() + inOff_[static_cast<std::size_t>(i)]); }
    void setConnected(int i, int c) { w2c_mod_mmb_input_connected(&inst_, static_cast<u32>(i), static_cast<u32>(c)); }
    int numOutputs() const { return nOut_; }
    int outputKind(int i) const { return outKind_[static_cast<std::size_t>(i)]; }
    const float* outBuf(int i) { return reinterpret_cast<const float*>(mem() + outOff_[static_cast<std::size_t>(i)]); }
    int controlIndex(const char* id) const {
        for (std::size_t c = 0; c < controlId_.size(); ++c) if (controlId_[c] == id) return static_cast<int>(c);
        return -1;
    }
    void setControl(int c, float v) { guarded([&] { w2c_mod_mmb_set_control(&inst_, static_cast<u32>(c), v); }); }
    float setRate(float r) {
#if MMB_W2C_HAS_SET_RATE
        float got = 0.0f;
        guarded([&] { got = w2c_mod_mmb_set_rate(&inst_, r); });
        return got;
#else
        (void)r;
        return nativeRate();
#endif
    }
    void init() { guarded([&] { w2c_mod_mmb_init(&inst_); }); }
    float nativeRate() { return w2c_mod_mmb_native_rate(&inst_); }
    int block() { return static_cast<int>(w2c_mod_mmb_block(&inst_)); }
    bool process(int frames) { return guarded([&] { w2c_mod_mmb_render(&inst_, static_cast<u32>(frames)); }); }
    const char* typeId() const { return typeId_.c_str(); }
#if MMB_W2C_HAS_BLOB && MMB_W2C_HAS_ZONES
    int16_t* blobPtr(int slot, int bytes) {
        u32 at = 0;
        if (!guarded([&] { at = w2c_mod_mmb_blob_ptr(&inst_, static_cast<u32>(slot), static_cast<u32>(bytes)); }) || at == 0) return nullptr;
        return reinterpret_cast<int16_t*>(mem() + at);
    }
    void blobCommit(int slot, int frames, float rate, int channels) {
        guarded([&] { w2c_mod_mmb_blob_commit(&inst_, static_cast<u32>(slot), static_cast<u32>(frames), rate, static_cast<u32>(channels)); });
    }
    void zoneSet(int idx, int slot, int lk, int hk, int lv, int hv, float root, float tune, float gain, float pan,
                 int loopMode, int loopStart, int loopEnd, float decay, float release, int velTrack, float attack) {
        guarded([&] {
            w2c_mod_mmb_zone_set(&inst_, static_cast<u32>(idx), static_cast<u32>(slot), static_cast<u32>(lk), static_cast<u32>(hk),
                                 static_cast<u32>(lv), static_cast<u32>(hv), root, tune, gain, pan, static_cast<u32>(loopMode),
                                 static_cast<u32>(loopStart), static_cast<u32>(loopEnd), decay, release, static_cast<u32>(velTrack), attack);
        });
    }
    void zoneCount(int n) { guarded([&] { w2c_mod_mmb_zone_count(&inst_, static_cast<u32>(n)); }); }
#endif

private:
    u8* mem() { return w2c_mod_memory(&inst_)->data; }
    std::string str(u32 at) { return std::string(reinterpret_cast<const char*>(mem() + at)); }

    /** Roept @p f aan; een trap in de module maakt hem stil in plaats van de DAW te laten vallen. */
    template <class F>
    bool guarded(F&& f) {
        if (dead_) return false;
        const wasm_rt_trap_t trap = static_cast<wasm_rt_trap_t>(wasm_rt_impl_try());
        if (trap == WASM_RT_TRAP_NONE) { f(); return true; }
        dead_ = true;
        std::printf("[mmb] %s: fout in de module (%s), hij zwijgt nu\n", typeId_.c_str(), wasm_rt_strerror(trap));
        std::fflush(stdout);
        return false;
    }

    w2c_mod inst_ {};
#if MMB_W2C_WASI
    w2c_wasi__snapshot__preview1 wasi_ {};
#endif
    int nIn_ = 0, nOut_ = 0;
    std::vector<u32> inOff_, outOff_;
    std::vector<int> inKind_, outKind_;
    std::vector<std::string> inId_, controlId_;
    std::string typeId_;
    bool dead_ = false;
};

using W2cProcessor = HostProcessor<W2cHost>;

}  // namespace mmb_plugin
