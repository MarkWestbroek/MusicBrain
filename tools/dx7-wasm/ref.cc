// Native referentie-harnas: dezelfde dx7_wasm.cc-API, gecompileerd met de
// gewone C++-compiler. Rendert een vaste sequentie en schrijft float32-
// samples (44,1 kHz, little-endian) naar een bestand, zodat de JS-port
// (editor/public/dx7/dx7-core.js) er sample-voor-sample tegen getest kan
// worden.  Zie ref-build.sh.
//
//   dx7ref <roms.bin> <out.f32> <bank> <program> <note> <vel> <onFrames> <offFrames>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "dx7_wasm.cc"

int main(int argc, char** argv) {
    if (argc < 9) { std::fprintf(stderr, "args\n"); return 2; }
    const char* romsPath = argv[1];
    const char* outPath  = argv[2];
    int bank = std::atoi(argv[3]), prog = std::atoi(argv[4]);
    int note = std::atoi(argv[5]), vel = std::atoi(argv[6]);
    int onFrames = std::atoi(argv[7]), offFrames = std::atoi(argv[8]);

    dx7_init();
    FILE* rf = std::fopen(romsPath, "rb");
    if (!rf) { std::perror("roms"); return 1; }
    for (int b = 0; b < 8; ++b) {
        if (std::fread(dx7_bank_ptr(b), 1, 4096, rf) != 4096) { std::fprintf(stderr, "roms te kort\n"); return 1; }
        dx7_bank_loaded(b, 1);
    }
    std::fclose(rf);

    dx7_set_bank(bank);
    dx7_set_program(prog);
    char name[11]; dx7_voice_name(name);
    std::fprintf(stderr, "voice \"%s\"\n", name);

    std::vector<float> out;
    dx7_note_on(note, vel);
    int done = 0;
    while (done < onFrames) {
        int n = dx7_render(512);
        out.insert(out.end(), dx7_out_ptr(), dx7_out_ptr() + n);
        done += n;
    }
    dx7_note_off(note);
    done = 0;
    while (done < offFrames) {
        int n = dx7_render(512);
        out.insert(out.end(), dx7_out_ptr(), dx7_out_ptr() + n);
        done += n;
    }
    FILE* of = std::fopen(outPath, "wb");
    std::fwrite(out.data(), sizeof(float), out.size(), of);
    std::fclose(of);
    std::fprintf(stderr, "%zu samples, actieve stemmen na afloop: %d\n", out.size(), dx7_active_voices());
    return 0;
}
