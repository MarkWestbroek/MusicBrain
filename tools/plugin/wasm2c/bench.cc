// Meetopstelling wasm2c (doc/plans/plugin-patches.md §4): N stemmen ×
// (VCO → LADDER → VCA, AHDSR op cutoff en VCA) als wasm2c-instanties van de
// .wasm uit editor/public/wasm/. Meet CPU per seconde audio en laat per stem
// de VCO-frequentie zien (onafhankelijke instanties).
//
// Bouwen (bash, wabt in ~/src/wabt met de doelen wasm2c en wasm-objdump):
//   W=editor/public/wasm R=~/src/wabt/wasm2c
//   I="-I$R -I$HOME/src/wabt/third_party/simde -I."
//   D="-DWASM_RT_USE_MMAP=0 -DWASM_RT_MEMCHECK_BOUNDS_CHECK=1"
//   for m in vco ladder vca ahdsr; do ~/src/wabt/build/wasm2c -n $m $W/tp_mmb_$m.wasm -o $m.c
//     clang -O2 $D $I -c $m.c; done
//   clang -O2 $D $I -c $R/wasm-rt-impl.c $R/wasm-rt-mem-impl.c
//   clang++ -std=c++17 -O2 $D $I bench.cc *.o -o bench
//   ./bench 8 10            # stemmen, seconden; ./bench 1 1 x toont alleen de poorten
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "wasm-rt.h"
#include "vco.h"
#include "ladder.h"
#include "vca.h"
#include "ahdsr.h"

extern "C" {
struct w2c_wasi__snapshot__preview1 { int dummy; };
u32 w2c_wasi__snapshot__preview1_clock_time_get(struct w2c_wasi__snapshot__preview1*, u32, u64, u32) { return 52; }
u32 w2c_wasi__snapshot__preview1_fd_close(struct w2c_wasi__snapshot__preview1*, u32) { return 52; }
u32 w2c_wasi__snapshot__preview1_fd_seek(struct w2c_wasi__snapshot__preview1*, u32, u64, u32, u32) { return 52; }
u32 w2c_wasi__snapshot__preview1_fd_write(struct w2c_wasi__snapshot__preview1*, u32, u32, u32, u32) { return 52; }
}
static w2c_wasi__snapshot__preview1 g_wasi;

struct Mod {
    std::string type;
    void* inst = nullptr;
    wasm_rt_memory_t* mem = nullptr;
    float rate = 0; int block = 0;
    void (*render)(void*, u32) = nullptr;
    void (*setc)(void*, u32, f32) = nullptr;
    void (*conn)(void*, u32, u32) = nullptr;
    std::vector<std::string> ins, outs, ctrls;
    std::vector<float*> inBuf, outBuf;
    const char* str(u32 p) const { return reinterpret_cast<const char*>(mem->data + p); }
    int in(const char* id) const { for (size_t i = 0; i < ins.size(); ++i) if (ins[i] == id) return (int)i; std::printf("%s: geen ingang %s\n", type.c_str(), id); return -1; }
    int out(const char* id) const { for (size_t i = 0; i < outs.size(); ++i) if (outs[i] == id) return (int)i; std::printf("%s: geen uitgang %s\n", type.c_str(), id); return -1; }
    void set(const char* id, float v) { for (size_t i = 0; i < ctrls.size(); ++i) if (ctrls[i] == id) { setc(inst, (u32)i, v); return; } std::printf("%s: geen control %s\n", type.c_str(), id); }
};

#define MAKE(M)                                                                                    \
    static Mod make_##M() {                                                                        \
        Mod m; m.type = #M;                                                                        \
        auto* i = new w2c_##M();                                                                   \
        MAKE_INST_##M(i);                                                                          \
        m.inst = i; m.mem = w2c_##M##_memory(i);                                                   \
        w2c_##M##_mmb_init(i);                                                                     \
        m.rate = w2c_##M##_mmb_native_rate(i); m.block = (int)w2c_##M##_mmb_block(i);              \
        m.render = [](void* p, u32 f) { w2c_##M##_mmb_render((w2c_##M*)p, f); };                   \
        m.setc = [](void* p, u32 c, f32 v) { w2c_##M##_mmb_set_control((w2c_##M*)p, c, v); };      \
        m.conn = [](void* p, u32 c, u32 v) { w2c_##M##_mmb_input_connected((w2c_##M*)p, c, v); };  \
        for (u32 k = 0; k < w2c_##M##_mmb_num_inputs(i); ++k) {                                    \
            m.ins.push_back(m.str(w2c_##M##_mmb_input_id(i, k)));                                  \
            m.inBuf.push_back((float*)(m.mem->data + w2c_##M##_mmb_input_ptr(i, k))); }            \
        for (u32 k = 0; k < w2c_##M##_mmb_num_outputs(i); ++k) {                                   \
            m.outs.push_back(m.str(w2c_##M##_mmb_output_id(i, k)));                                \
            m.outBuf.push_back((float*)(m.mem->data + w2c_##M##_mmb_output_ptr(i, k))); }          \
        for (u32 k = 0; k < w2c_##M##_mmb_num_controls(i); ++k)                                    \
            m.ctrls.push_back(m.str(w2c_##M##_mmb_control_id(i, k)));                              \
        return m;                                                                                  \
    }
#define MAKE_INST_vco(i) wasm2c_vco_instantiate(i)
#define MAKE_INST_ladder(i) wasm2c_ladder_instantiate(i)
#define MAKE_INST_vca(i) wasm2c_vca_instantiate(i)
#define MAKE_INST_ahdsr(i) wasm2c_ahdsr_instantiate(i, &g_wasi)
MAKE(vco) MAKE(ladder) MAKE(vca) MAKE(ahdsr)

static void dump(const Mod& m) {
    std::printf("%-7s rate %.0f blok %d | in:", m.type.c_str(), m.rate, m.block);
    for (auto& s : m.ins) std::printf(" %s", s.c_str());
    std::printf(" | uit:"); for (auto& s : m.outs) std::printf(" %s", s.c_str());
    std::printf(" | ctl:"); for (auto& s : m.ctrls) std::printf(" %s", s.c_str());
    std::printf("\n");
}

struct Voice { Mod vco, vcf, vca, env; };

int main(int argc, char** argv) {
    const int voices = argc > 1 ? std::atoi(argv[1]) : 8;
    const double seconds = argc > 2 ? std::atof(argv[2]) : 10.0;
    const char* names = argc > 3 ? argv[3] : nullptr;   // alleen poortnamen tonen
    wasm_rt_init();
    { Mod a = make_vco(), b = make_ladder(), c = make_vca(), d = make_ahdsr(); dump(a); dump(b); dump(c); dump(d); }
    if (names) return 0;

    // Poorten (namen uit de dump hierboven; zie module-types.json).
    std::vector<Voice> v;
    for (int s = 0; s < voices; ++s) v.push_back({make_vco(), make_ladder(), make_vca(), make_ahdsr()});
    const int vPitch = v[0].vco.in("voct"), vOut = v[0].vco.out("out");
    const int fIn = v[0].vcf.in("in"), fCv = v[0].vcf.in("cv"), fOut = v[0].vcf.out("out");
    const int aIn = v[0].vca.in("in"), aCv = v[0].vca.in("cv"), aOut = v[0].vca.out("out");
    const int eGate = v[0].env.in("gate"), eOut = v[0].env.out("cv_out");
    if (vPitch < 0 || vOut < 0 || fIn < 0 || fOut < 0 || aIn < 0 || aCv < 0 || aOut < 0 || eGate < 0 || eOut < 0) return 1;
    for (auto& x : v) {
        x.vco.conn(x.vco.inst, vPitch, 1); x.vcf.conn(x.vcf.inst, fIn, 1); x.vcf.conn(x.vcf.inst, fCv, 1);
        x.vca.conn(x.vca.inst, aIn, 1); x.vca.conn(x.vca.inst, aCv, 1); x.env.conn(x.env.inst, eGate, 1);
    }

    const int B = 32;                       // audioblok (native 44,1 kHz)
    const long blocks = (long)(seconds * 44100.0 / B);
    std::vector<float> mix(B);
    double cvAcc = 0.0, sumSq = 0.0, peak = 0.0;
    std::vector<double> voiceSq(voices, 0.0);
    std::vector<float> cvHold(voices, 0.0f);
    std::vector<long> zc(voices, 0);
    auto t0 = std::chrono::steady_clock::now();
    for (long b = 0; b < blocks; ++b) {
        const double t = (double)b * B / 44100.0;
        // CV-ticks op 1 kHz (blok 1), waarde vastgehouden over het audioblok.
        cvAcc += B * 1000.0 / 44100.0;
        while (cvAcc >= 1.0) {
            cvAcc -= 1.0;
            for (int s = 0; s < voices; ++s) {
                const double ph = std::fmod(t + 0.11 * s, 1.0);
                v[s].env.inBuf[eGate][0] = ph < 0.6 ? 1.0f : 0.0f;
                v[s].env.render(v[s].env.inst, 1);
                cvHold[s] = v[s].env.outBuf[eOut][0];
            }
        }
        std::fill(mix.begin(), mix.end(), 0.0f);
        for (int s = 0; s < voices; ++s) {
            auto& x = v[s];
            const float pitch = (float)(s * 5) / 12.0f;   // stem s: s×5 halve tonen hoger (1 per octaaf)
            for (int k = 0; k < B; ++k) x.vco.inBuf[vPitch][k] = pitch;
            x.vco.render(x.vco.inst, B);
            std::memcpy(x.vcf.inBuf[fIn], x.vco.outBuf[vOut], B * sizeof(float));
            for (int k = 0; k < B; ++k) x.vcf.inBuf[fCv][k] = cvHold[s];
            for (int k = 1; k < B; ++k) if ((x.vco.outBuf[vOut][k - 1] < 0) != (x.vco.outBuf[vOut][k] < 0)) ++zc[s];
            x.vcf.render(x.vcf.inst, B);
            std::memcpy(x.vca.inBuf[aIn], x.vcf.outBuf[fOut], B * sizeof(float));
            for (int k = 0; k < B; ++k) x.vca.inBuf[aCv][k] = cvHold[s];
            x.vca.render(x.vca.inst, B);
            for (int k = 0; k < B; ++k) { const float y = x.vca.outBuf[aOut][k]; mix[k] += y; voiceSq[s] += (double)y * y; }
        }
        for (float y : mix) { sumSq += (double)y * y; peak = std::max(peak, (double)std::fabs(y)); }
    }
    const double el = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    std::printf("%d stemmen × 4 modules, %.1f s audio in %.3f s: %.2f%% van één kern (realtime ×%.0f)\n",
                voices, seconds, el, 100.0 * el / seconds, seconds / el);
    std::printf("mix: rms %.4f piek %.3f\n", std::sqrt(sumSq / (blocks * B)), peak);
    for (int s = 0; s < voices; ++s) std::printf("  stem %d rms %.4f  vco ~%.1f Hz\n", s, std::sqrt(voiceSq[s] / (blocks * B)), zc[s] / 2.0 / seconds);
    return 0;
}
