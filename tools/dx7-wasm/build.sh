#!/usr/bin/env bash
# Bouwt editor/public/dx7/dx7.wasm uit de gevendorde msfa-kern + dx7_wasm.cc.
#
# Toolchain: wasi-sdk (https://github.com/WebAssembly/wasi-sdk/releases),
# uitgepakt in $WASI_SDK (default ~/.wasi-sdk/wasi-sdk-34.0-<arch>-macos).
# Geen emscripten nodig: msfa is pure integer-DSP + wat libm in de init.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MSFA="$ROOT/firmware/lib/msfa"
OUT="$ROOT/editor/public/dx7/dx7.wasm"

if [ -z "${WASI_SDK:-}" ]; then
  WASI_SDK="$(ls -d "$HOME"/.wasi-sdk/wasi-sdk-*-macos 2>/dev/null | sort | tail -1 || true)"
fi
if [ -z "$WASI_SDK" ] || [ ! -x "$WASI_SDK/bin/clang++" ]; then
  echo "wasi-sdk niet gevonden; zet WASI_SDK of pak hem uit in ~/.wasi-sdk" >&2
  exit 1
fi

# wasi-sdk >= 22 noemt de target wasm32-wasip1; oudere versies wasm32-wasi.
SYSROOT="$WASI_SDK/share/wasi-sysroot"
TARGET=wasm32-wasip1
[ -d "$SYSROOT/include/$TARGET" ] || TARGET=wasm32-wasi

mkdir -p "$(dirname "$OUT")"
"$WASI_SDK/bin/clang++" \
  --target="$TARGET" --sysroot="$SYSROOT" \
  -std=c++17 -O2 -fno-exceptions -fno-rtti \
  -I"$MSFA" \
  -nostartfiles -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=2097152 \
  -o "$OUT" \
  "$ROOT/tools/dx7-wasm/dx7_wasm.cc" \
  "$MSFA"/msfa/dx7note.cc "$MSFA"/msfa/env.cc "$MSFA"/msfa/exp2.cc \
  "$MSFA"/msfa/fm_core.cc "$MSFA"/msfa/fm_op_kernel.cc "$MSFA"/msfa/freqlut.cc \
  "$MSFA"/msfa/lfo.cc "$MSFA"/msfa/patch.cc "$MSFA"/msfa/pitchenv.cc "$MSFA"/msfa/sin.cc

ls -la "$OUT"
