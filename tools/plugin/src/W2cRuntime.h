#pragma once
// Een wasm-gastheer als wasm2c-instantie, met de exports als functietabel
// (W2cVtable, per module gemaakt door tools/plugin/wasm2c/gen_w2c.py). Zo
// passen meerdere modules in één plugin (de patch-plugin) en heeft elk
// exemplaar een eigen instantie: eigen lineair geheugen, eigen globals.
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

#include <cstdint>
#include <cstdio>
#include <mutex>
#include <string>
#include <vector>

extern "C" {
#include "wasm-rt.h"
#include "wasm-rt-exceptions.h"
#include "wasm-rt-impl.h"
}

// Dezelfde kerntypen als de wasm2c-headers (met dezelfde guard).
#ifndef WASM_RT_CORE_TYPES_DEFINED
#define WASM_RT_CORE_TYPES_DEFINED
typedef uint8_t u8;
typedef int8_t s8;
typedef uint16_t u16;
typedef int16_t s16;
typedef uint32_t u32;
typedef int32_t s32;
typedef uint64_t u64;
typedef int64_t s64;
typedef float f32;
typedef double f64;
#endif

// WASI-instantie voor modules met libc-imports; de functies staan in wasi_stubs.c.
struct w2c_wasi__snapshot__preview1 { int unused; };

namespace mmb_plugin {

inline w2c_wasi__snapshot__preview1& mmbWasi() { static w2c_wasi__snapshot__preview1 w {}; return w; }

/** De exports van één module (mmb_abi.h); optionele zijn nullptr als de module ze niet heeft. */
struct W2cVtable {
    const char* name;
    void* (*create)();
    void (*instantiate)(void*);
    void (*destroy)(void*);
    wasm_rt_memory_t* (*memory)(void*);
    void (*init)(void*);
    void (*render)(void*, u32);
    f32 (*native_rate)(void*);
    u32 (*block)(void*);
    u32 (*type_id)(void*);
    u32 (*num_inputs)(void*);
    u32 (*input_id)(void*, u32);
    u32 (*input_kind)(void*, u32);
    u32 (*input_ptr)(void*, u32);
    void (*input_connected)(void*, u32, u32);
    u32 (*num_outputs)(void*);
    u32 (*output_id)(void*, u32);
    u32 (*output_kind)(void*, u32);
    u32 (*output_ptr)(void*, u32);
    u32 (*num_controls)(void*);
    u32 (*control_id)(void*, u32);
    void (*set_control)(void*, u32, f32);
    f32 (*set_rate)(void*, f32);
    u32 (*blob_ptr)(void*, u32, u32);
    void (*blob_commit)(void*, u32, u32, f32, u32);
    void (*zone_set)(void*, u32, u32, u32, u32, u32, u32, f32, f32, f32, f32, u32, u32, u32, f32, f32, u32, f32);
    void (*zone_count)(void*, u32);
    void (*midi)(void*, u32, u32, u32);
};

/** Eén instantie; de Host-interface van HostProcessor.h, plus mmb_midi. */
class W2cHost {
public:
    static constexpr bool kShared = false;
    static constexpr bool kBank = true;   // per module: hasBank()
    static constexpr bool kRawMidi = false;

    explicit W2cHost(const W2cVtable& vt) : vt_(vt) {
        static std::once_flag once;
        std::call_once(once, [] { wasm_rt_init(); });
        inst_ = vt_.create();
        vt_.instantiate(inst_);
        nIn_ = static_cast<int>(vt_.num_inputs(inst_));
        nOut_ = static_cast<int>(vt_.num_outputs(inst_));
        for (int i = 0; i < nIn_; ++i) {
            inOff_.push_back(vt_.input_ptr(inst_, static_cast<u32>(i)));
            inKind_.push_back(static_cast<int>(vt_.input_kind(inst_, static_cast<u32>(i))));
            inId_.push_back(str(vt_.input_id(inst_, static_cast<u32>(i))));
        }
        for (int i = 0; i < nOut_; ++i) {
            outOff_.push_back(vt_.output_ptr(inst_, static_cast<u32>(i)));
            outKind_.push_back(static_cast<int>(vt_.output_kind(inst_, static_cast<u32>(i))));
            outId_.push_back(str(vt_.output_id(inst_, static_cast<u32>(i))));
        }
        for (u32 c = 0; c < vt_.num_controls(inst_); ++c) controlId_.push_back(str(vt_.control_id(inst_, c)));
        typeId_ = str(vt_.type_id(inst_));
    }
    ~W2cHost() { vt_.destroy(inst_); }
    W2cHost(const W2cHost&) = delete;
    W2cHost& operator=(const W2cHost&) = delete;

    int numInputs() const { return nIn_; }
    const char* inputId(int i) const { return inId_[static_cast<std::size_t>(i)].c_str(); }
    int inputKind(int i) const { return inKind_[static_cast<std::size_t>(i)]; }
    float* inBuf(int i) { return reinterpret_cast<float*>(mem() + inOff_[static_cast<std::size_t>(i)]); }
    void setConnected(int i, int c) { vt_.input_connected(inst_, static_cast<u32>(i), static_cast<u32>(c)); }
    int numOutputs() const { return nOut_; }
    const char* outputId(int i) const { return outId_[static_cast<std::size_t>(i)].c_str(); }
    int outputKind(int i) const { return outKind_[static_cast<std::size_t>(i)]; }
    const float* outBuf(int i) { return reinterpret_cast<const float*>(mem() + outOff_[static_cast<std::size_t>(i)]); }
    /** Schrijfbaar, voor de patchmotor (bypass mengt het droge signaal erbij na render). */
    float* outBufMut(int i) { return reinterpret_cast<float*>(mem() + outOff_[static_cast<std::size_t>(i)]); }
    int inputIndex(const std::string& id) const { for (int i = 0; i < nIn_; ++i) if (inId_[static_cast<std::size_t>(i)] == id) return i; return -1; }
    int outputIndex(const std::string& id) const { for (int i = 0; i < nOut_; ++i) if (outId_[static_cast<std::size_t>(i)] == id) return i; return -1; }
    int controlIndex(const char* id) const {
        for (std::size_t c = 0; c < controlId_.size(); ++c) if (controlId_[c] == id) return static_cast<int>(c);
        return -1;
    }
    void setControl(int c, float v) { guarded([&] { vt_.set_control(inst_, static_cast<u32>(c), v); }); }
    float setRate(float r) {
        if (!vt_.set_rate) return nativeRate();
        float got = 0.0f;
        guarded([&] { got = vt_.set_rate(inst_, r); });
        return got;
    }
    void init() { guarded([&] { vt_.init(inst_); }); }
    float nativeRate() { return vt_.native_rate(inst_); }
    int block() { return static_cast<int>(vt_.block(inst_)); }
    bool process(int frames) { return guarded([&] { vt_.render(inst_, static_cast<u32>(frames)); }); }
    const char* typeId() const { return typeId_.c_str(); }
    bool dead() const { return dead_; }

    bool hasMidi() const { return vt_.midi != nullptr; }
    void midi(int status, int d1, int d2) {
        if (vt_.midi) guarded([&] { vt_.midi(inst_, static_cast<u32>(status), static_cast<u32>(d1), static_cast<u32>(d2)); });
    }

    bool hasBank() const { return vt_.blob_ptr && vt_.blob_commit && vt_.zone_set && vt_.zone_count; }
    int16_t* blobPtr(int slot, int bytes) {
        u32 at = 0;
        if (!guarded([&] { at = vt_.blob_ptr(inst_, static_cast<u32>(slot), static_cast<u32>(bytes)); }) || at == 0) return nullptr;
        return reinterpret_cast<int16_t*>(mem() + at);
    }
    void blobCommit(int slot, int frames, float rate, int channels) {
        guarded([&] { vt_.blob_commit(inst_, static_cast<u32>(slot), static_cast<u32>(frames), rate, static_cast<u32>(channels)); });
    }
    void zoneSet(int idx, int slot, int lk, int hk, int lv, int hv, float root, float tune, float gain, float pan,
                 int loopMode, int loopStart, int loopEnd, float decay, float release, int velTrack, float attack) {
        guarded([&] {
            vt_.zone_set(inst_, static_cast<u32>(idx), static_cast<u32>(slot), static_cast<u32>(lk), static_cast<u32>(hk),
                         static_cast<u32>(lv), static_cast<u32>(hv), root, tune, gain, pan, static_cast<u32>(loopMode),
                         static_cast<u32>(loopStart), static_cast<u32>(loopEnd), decay, release, static_cast<u32>(velTrack), attack);
        });
    }
    void zoneCount(int n) { guarded([&] { vt_.zone_count(inst_, static_cast<u32>(n)); }); }

private:
    u8* mem() { return vt_.memory(inst_)->data; }
    std::string str(u32 at) { return std::string(reinterpret_cast<const char*>(mem() + at)); }

    /** Roept @p f aan; een trap in de module maakt hem stil in plaats van de DAW te laten vallen. */
    template <class F>
    bool guarded(F&& f) {
        if (dead_) return false;
        const auto trap = static_cast<wasm_rt_trap_t>(wasm_rt_impl_try());
        if (trap == WASM_RT_TRAP_NONE) { f(); return true; }
        dead_ = true;
        std::printf("[mmb] %s: fout in de module (%s), hij zwijgt nu\n", typeId_.c_str(), wasm_rt_strerror(trap));
        std::fflush(stdout);
        return false;
    }

    const W2cVtable& vt_;
    void* inst_ = nullptr;
    int nIn_ = 0, nOut_ = 0;
    std::vector<u32> inOff_, outOff_;
    std::vector<int> inKind_, outKind_;
    std::vector<std::string> inId_, outId_, controlId_;
    std::string typeId_;
    bool dead_ = false;
};

}  // namespace mmb_plugin
