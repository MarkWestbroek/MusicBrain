#!/usr/bin/env bash
# Bouwt het native referentie-harnas (dx7ref) met de systeem-clang.
# De msfa-bronnen dragen Teensy-linker-secties (.dmabuffers) die Mach-O niet
# slikt; we kopiëren ze naar een tijdelijke map en strippen dat attribuut.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/firmware/lib/msfa"
TMP="${TMPDIR:-/tmp}/msfa-native"
OUT="${1:-${TMPDIR:-/tmp}/dx7ref}"

rm -rf "$TMP"; mkdir -p "$TMP/msfa"
for f in "$SRC"/msfa/*; do
  sed -e 's/__attribute__((section("\.dmabuffers")))//g' "$f" > "$TMP/msfa/$(basename "$f")"
done
cp "$ROOT/tools/dx7-wasm/dx7_wasm.cc" "$TMP/"

clang++ -std=c++17 -O2 -Wno-deprecated-declarations -Wno-parentheses \
  -I"$TMP" -I"$ROOT/tools/dx7-wasm" \
  -o "$OUT" "$ROOT/tools/dx7-wasm/ref.cc" \
  "$TMP"/msfa/dx7note.cc "$TMP"/msfa/env.cc "$TMP"/msfa/exp2.cc "$TMP"/msfa/fm_core.cc \
  "$TMP"/msfa/fm_op_kernel.cc "$TMP"/msfa/freqlut.cc "$TMP"/msfa/lfo.cc "$TMP"/msfa/patch.cc \
  "$TMP"/msfa/pitchenv.cc "$TMP"/msfa/sin.cc
echo "built $OUT"
