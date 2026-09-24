#!/usr/bin/env bash
# Bit-identiteitschecks: bewijzen dat een kernel die uit een firmware-module
# naar firmware/lib/mmb-dsp getild is, sample voor sample hetzelfde rekent als
# de oude inline code. Zo kan de firmware op de kernel over zonder dat de
# klank van de hardware verandert — ook als er niemand kan luisteren.
#   tools/mmb-wasm/bitcheck/check.sh            # alles
#   tools/mmb-wasm/bitcheck/check.sh resonator  # één
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
if [ -z "${WASI_SDK:-}" ]; then
  WASI_SDK="$(ls -d "$HOME"/.wasi-sdk/wasi-sdk-*/ 2>/dev/null | sed 's:/$::' | sort -V | tail -1 || true)"
fi
CXX="$WASI_SDK/bin/clang++"; [ -x "$CXX" ] || CXX="$WASI_SDK/bin/clang++.exe"
OUT="$(mktemp -d)"
for src in "$HERE"/*_check.cc; do
  name="$(basename "$src" _check.cc)"
  [ -n "${1:-}" ] && [ "$1" != "$name" ] && continue
  "$CXX" --target=wasm32-wasip1 -std=c++17 -O2 -fno-exceptions \
    -I "$ROOT/firmware/lib/mmb-dsp" -o "$OUT/$name.wasm" "$src"
  printf '%-12s ' "$name"; node --no-warnings "$HERE/run.mjs" "$OUT/$name.wasm" | tail -1
done
