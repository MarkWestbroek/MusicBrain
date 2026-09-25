#!/usr/bin/env bash
# Bouwt de Teensy-modules als WebAssembly voor de editor-simulator:
#   editor/public/wasm/<typeId>.wasm   (één per module, mmb-wasm ABI)
# Toolchain: wasi-sdk in ~/.wasi-sdk (of $WASI_SDK). Zie README.md.
#   tools/mmb-wasm/build.sh            # alles
#   tools/mmb-wasm/build.sh rings      # één module
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LIB="$ROOT/firmware/lib"
ELEM="$ROOT/firmware/app-elements/lib/mi-elements"
OUTDIR="$ROOT/editor/public/wasm"
HERE="$ROOT/tools/mmb-wasm"

if [ -z "${WASI_SDK:-}" ]; then
  # Nieuwste uitgepakte SDK in ~/.wasi-sdk — macos, linux of windows.
  WASI_SDK="$(ls -d "$HOME"/.wasi-sdk/wasi-sdk-*/ 2>/dev/null | sed 's:/$::' | sort -V | tail -1 || true)"
fi
CXX="$WASI_SDK/bin/clang++"
[ -x "$CXX" ] || CXX="$WASI_SDK/bin/clang++.exe"   # Git Bash op Windows
[ -x "$CXX" ] || { echo "wasi-sdk niet gevonden (zet WASI_SDK)" >&2; exit 1; }
SYSROOT="$WASI_SDK/share/wasi-sysroot"
TARGET=wasm32-wasip1
[ -d "$SYSROOT/include/$TARGET" ] || TARGET=wasm32-wasi
mkdir -p "$OUTDIR"

# Gedeelde stmlib-implementaties (byte-identiek over de MI-libs; de firmware
# linkt ze ook uit mi-elements).
STMLIB_CC="$ELEM/stmlib/dsp/units.cc $ELEM/stmlib/utils/random.cc"
# Elke MI-lib draagt een stmlib-subset; wat een lib mist (delay_line.h,
# ring_buffer.h) vindt de firmware-LDF in een andere lib. Zelfde hier: eerst
# de eigen map, dan de meest complete stmlib-kopieën als fallback.
FALLBACK_INC="-I$LIB/mi-plaits -I$ELEM -I$LIB/mi-rings -I$LIB/mi-clouds -I$LIB/mi-marbles"

# Geheugen per module. Elke module in een patch is een eigen wasm-instantie
# (sinds stap 6 ook VCO/VCA/envelopes/MIDI-in), dus 8 MB vast per instantie
# liep bij een 4-stemmige patch (29 instanties) tegen Chrome's grens aan:
# "Cannot allocate Wasm memory for new instance". Daarom: geen vaste
# beginmaat (de linker neemt data + stack, ~0,5–1 MB) en een bovengrens,
# zodat V8 per instantie alleen dat reserveert. malloc groeit tot de grens.
# MAXMEM="…" ervoor zet een andere grens (de sampler houdt banken in het
# wasm-geheugen en krijgt 2 GB).
MAXMEM_DEFAULT=33554432   # 32 MB
build() {  # naam typeId include-dirs... -- bronnen...
           # EXTRA="-DFOO=1" ervoor zet extra compilervlaggen (één bron,
           # meer binaries — zie de envfollower hieronder).
  local name="$1"; shift
  local typeId="$1"; shift
  local incs=()
  while [ "$1" != "--" ]; do incs+=("-I$1"); shift; done
  shift
  echo "→ $typeId"
  if ! "$CXX" \
    --target="$TARGET" --sysroot="$SYSROOT" \
    -std=c++17 -O3 -msimd128 -fno-exceptions -fno-rtti -DTEST \
    -Wno-unused-value -Wno-deprecated-register -include cstdio \
    -I"$HERE" -I"$HERE/shim" ${incs[@]+"${incs[@]}"} $FALLBACK_INC ${EXTRA:-} \
    -nostartfiles -Wl,--no-entry -Wl,--export-memory -Wl,--max-memory="${MAXMEM:-$MAXMEM_DEFAULT}" -Wl,-z,stack-size=262144 \
    -o "$OUTDIR/$typeId.wasm" \
    "$HERE/${name}_wasm.cc" "$@" 2> "$OUTDIR/$typeId.log"; then
    echo "   MISLUKT — zie $OUTDIR/$typeId.log"; grep -m3 "error:" "$OUTDIR/$typeId.log" | sed 's/^/   /'; FAILED="$FAILED $typeId"
  else
    rm -f "$OUTDIR/$typeId.log"
    ls -la "$OUTDIR/$typeId.wasm" | awk '{print "   " $5 " bytes"}'
  fi
}
FAILED=""

want="${1:-all}"
sel() { [ "$want" = all ] || [ "$want" = "$1" ]; }

sel elements && build elements tp_mmb_elements "$ELEM" -- \
  "$ELEM"/elements/dsp/exciter.cc "$ELEM"/elements/dsp/multistage_envelope.cc \
  "$ELEM"/elements/dsp/part.cc "$ELEM"/elements/dsp/resonator.cc "$ELEM"/elements/dsp/string.cc \
  "$ELEM"/elements/dsp/tube.cc "$ELEM"/elements/dsp/voice.cc "$ELEM"/elements/dsp/ominous_voice.cc \
  "$ELEM"/elements/resources.cc $STMLIB_CC

sel rings && build rings tp_mmb_rings "$LIB/mi-rings" -- \
  "$LIB"/mi-rings/rings/dsp/fm_voice.cc "$LIB"/mi-rings/rings/dsp/part.cc \
  "$LIB"/mi-rings/rings/dsp/resonator.cc "$LIB"/mi-rings/rings/dsp/string.cc \
  "$LIB"/mi-rings/rings/resources.cc $STMLIB_CC

sel marbles && build marbles tp_mmb_marbles "$LIB/mi-marbles" -- \
  "$LIB"/mi-marbles/marbles/ramp/ramp_extractor.cc \
  "$LIB"/mi-marbles/marbles/random/discrete_distribution_quantizer.cc \
  "$LIB"/mi-marbles/marbles/random/lag_processor.cc "$LIB"/mi-marbles/marbles/random/output_channel.cc \
  "$LIB"/mi-marbles/marbles/random/quantizer.cc "$LIB"/mi-marbles/marbles/random/t_generator.cc \
  "$LIB"/mi-marbles/marbles/random/x_y_generator.cc "$LIB"/mi-marbles/marbles/resources.cc $STMLIB_CC

sel stages && build stages tp_mmb_stages "$LIB/mi-stages" -- \
  "$LIB"/mi-stages/stages/resources.cc "$LIB"/mi-stages/stages/segment_generator.cc \
  "$LIB"/mi-stages/tides2/ramp/ramp_extractor.cc $STMLIB_CC

sel peaks && build peaks tp_mmb_peaks "$LIB/mi-peaks" -- \
  "$LIB"/mi-peaks/peaks/drums/bass_drum.cc "$LIB"/mi-peaks/peaks/drums/fm_drum.cc \
  "$LIB"/mi-peaks/peaks/drums/high_hat.cc "$LIB"/mi-peaks/peaks/drums/snare_drum.cc \
  "$LIB"/mi-peaks/peaks/resources.cc $STMLIB_CC

sel morphwt && build morphwt tp_mmb_morph_wt --

sel clouds && build clouds tp_mmb_clouds "$LIB/mi-clouds" -- \
  "$LIB"/mi-clouds/clouds/dsp/correlator.cc "$LIB"/mi-clouds/clouds/dsp/granular_processor.cc \
  "$LIB"/mi-clouds/clouds/dsp/mu_law.cc "$LIB"/mi-clouds/clouds/dsp/pvoc/frame_transformation.cc \
  "$LIB"/mi-clouds/clouds/dsp/pvoc/phase_vocoder.cc "$LIB"/mi-clouds/clouds/dsp/pvoc/stft.cc \
  "$LIB"/mi-clouds/clouds/resources.cc "$LIB"/mi-clouds/stmlib/dsp/atan.cc $STMLIB_CC

sel plaits && build plaits tp_mmb_plaits "$LIB/mi-plaits" -- \
  $(find "$LIB/mi-plaits/plaits" -name "*.cc" | sort) $STMLIB_CC

sel tides && build tides tp_mmb_tides "$LIB/mi-tides" -- \
  "$LIB"/mi-tides/tides2/poly_slope_generator.cc "$LIB"/mi-tides/tides2/resources.cc $STMLIB_CC

sel warps && build warps tp_mmb_warps "$LIB/mi-warps" -- \
  "$LIB"/mi-warps/warps/dsp/filter_bank.cc "$LIB"/mi-warps/warps/dsp/modulator.cc \
  "$LIB"/mi-warps/warps/dsp/oscillator.cc "$LIB"/mi-warps/warps/dsp/vocoder.cc \
  "$LIB"/mi-warps/warps/resources.cc $STMLIB_CC

sel elementsreverb && build elementsreverb tp_mmb_elements_reverb "$ELEM" -- $STMLIB_CC
sel octavca && build octavca tp_mmb_octa_vca --
sel stereovca && build stereovca tp_mmb_stereo_vca --
sel resonator && build resonator tp_mmb_resonator "$LIB/mmb-dsp" --
sel cr78 && build cr78 tp_mmb_cr78 "$LIB/mmb-dsp" --
sel comp && build comp tp_mmb_comp "$LIB/mmb-dsp" --
sel comb && build comb tp_mmb_comb --
CVINC=("$ROOT/firmware/core/include" "$ROOT/firmware/app-modular-brain/src")
sel quant && build quant tp_mmb_quant "${CVINC[@]}" --
sel chord && build chord tp_mmb_chord "${CVINC[@]}" --
sel grids && build grids tp_mmb_grids "${CVINC[@]}" --
sel lfo   && build lfo   tp_mmb_lfo   "${CVINC[@]}" -- "$ROOT/firmware/core/src/runtime/Lfo.cpp"
sel string && build string tp_mmb_string --
sel echo   && build echo   tp_mmb_echo   --
sel phaser && build phaser tp_mmb_phaser "$LIB/mmb-dsp" --
sel ladder && build ladder tp_mmb_ladder --
sel octavcf && build octavcf tp_mmb_octa_vcf --
sel octavco && build octavco tp_mmb_octa_vco --
sel wtvco   && build wtvco   tp_mmb_wt_vco   --
sel drawvco && build drawvco tp_mmb_draw_vco --
sel noise   && build noise   tp_mmb_noise   "$LIB/mmb-dsp" --
sel vco     && build vco     tp_mmb_vco     --
sel fmvco   && build fmvco   tp_mmb_fm_vco  --
sel vca     && build vca     tp_mmb_vca     --
CORE="$ROOT/firmware/core/src"
sel ahdsr   && build ahdsr   tp_mmb_ahdsr   "${CVINC[@]}" -- "$CORE/runtime/Ahdsr.cpp"
sel cvmath  && build cvmath  tp_mmb_cvmath  "${CVINC[@]}" --
sel seq8    && build seq8    tp_mmb_seq8    "${CVINC[@]}" -- "$CORE/runtime/Seq16.cpp"
sel midiin  && build midiin  tp_mmb_midiin  "${CVINC[@]}" -- "$CORE/runtime/MidiIn.cpp" "$CORE/VoiceAllocator.cpp"
sel vcf && build vcf tp_mmb_vcf "$LIB/mmb-dsp" --
sel ms20 && build ms20 tp_mmb_ms20 "$LIB/mmb-dsp" --

STK="$LIB/stk"
sel stksound && build stksound tp_mmb_stk_sound "$STK/include" "$STK/include/stk" -- "$STK"/src/*.cpp

sel tapeecho && build tapeecho tp_mmb_tape_echo "$LIB/mmb-dsp" --
sel fetcomp && build fetcomp tp_mmb_fet_comp "$LIB/mmb-dsp" --
sel optocomp && build optocomp tp_mmb_opto_comp "$LIB/mmb-dsp" --
sel buscomp && build buscomp tp_mmb_bus_comp "$LIB/mmb-dsp" --
sel varimucomp && build varimucomp tp_mmb_varimu_comp "$LIB/mmb-dsp" --
sel programeq && build programeq tp_mmb_program_eq "$LIB/mmb-dsp" --
sel diodecomp && build diodecomp tp_mmb_diode_comp "$LIB/mmb-dsp" --
sel consoleeq && build consoleeq tp_mmb_console_eq "$LIB/mmb-dsp" --
sel paraeq && build paraeq tp_mmb_para_eq "$LIB/mmb-dsp" --
sel stereotapeecho && build stereotapeecho tp_mmb_stereo_tape_echo "$LIB/mmb-dsp" --
sel digitalecho && build digitalecho tp_mmb_digital_echo "$LIB/mmb-dsp" --
sel bbdchorus && build bbdchorus tp_mmb_bbd_chorus "$LIB/mmb-dsp" --
sel ringmod && build ringmod tp_mmb_ringmod "$LIB/mmb-dsp" --
sel octaver && build octaver tp_mmb_octaver "$LIB/mmb-dsp" --
sel harmonizer && build harmonizer tp_mmb_harmonizer "$LIB/mmb-dsp" --
sel reverb && build reverb tp_mmb_reverb "$LIB/mmb-dsp" --
sel tremolo && build tremolo tp_mmb_tremolo "$LIB/mmb-dsp" --
sel stereophaser && build stereophaser tp_mmb_stereo_phaser "$LIB/mmb-dsp" --
sel vibe && build vibe tp_mmb_vibe "$LIB/mmb-dsp" --

sel envfollower && build envfollower tp_mmb_env_follower "$LIB/mmb-dsp" --
sel envfollower && EXTRA="-DMMB_EF_CELLS=1" build envfollower tp_mmb_env_follower_mono "$LIB/mmb-dsp" --

# Banken (blobs) leven in het wasm-geheugen: ruime bovengrens.
sel sampler && MAXMEM=2147483648 build sampler tp_mmb_sampler "$LIB/mmb-dsp" --
MSFA="$LIB/msfa"
sel dx7 && build dx7 tp_mmb_dx7 "$MSFA" -- \
  "$MSFA"/msfa/dx7note.cc "$MSFA"/msfa/env.cc "$MSFA"/msfa/exp2.cc \
  "$MSFA"/msfa/fm_core.cc "$MSFA"/msfa/fm_op_kernel.cc "$MSFA"/msfa/freqlut.cc \
  "$MSFA"/msfa/lfo.cc "$MSFA"/msfa/patch.cc "$MSFA"/msfa/pitchenv.cc "$MSFA"/msfa/sin.cc

[ -z "$FAILED" ] && echo "klaar." || { echo "mislukt:$FAILED"; exit 1; }
