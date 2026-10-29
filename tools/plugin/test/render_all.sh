#!/bin/bash
# Elke gastheer-plugin (wasm2c of native) 2 s renderen met MmbPluginCheck:
# effecten krijgen het testsignaal, instrumenten drie noten. Twee exemplaren
# naast elkaar (instances=2). Per plugin één regel met piek en het verschil
# tussen de exemplaren.
#
#   tools/plugin/test/render_all.sh <bouwmap> <uitmap> [plugin-id ...]
set -u
here=$(cd "$(dirname "$0")" && pwd); repo=$(cd "$here/../../.." && pwd)
build=$1; out=$2; shift 2
mkdir -p "$out"
[ -f "$out/in.wav" ] || python3 "$here/make_test_wav.py" "$out/in.wav"
check="$build/MmbPluginCheck_artefacts/Release/MmbPluginCheck"
for f in "$repo"/tools/plugin/generated/*_plugin.cpp; do
  grep -q -E 'AbiPlugin.h|W2cPlugin.h' "$f" || continue
  id=$(basename "$f" _plugin.cpp)
  if [ $# -gt 0 ]; then case " $* " in *" $id "*) ;; *) continue ;; esac; fi
  slug=${id#tp_mmb_}
  tgt=Mmb$(echo "$slug" | awk -F_ '{for(i=1;i<=NF;i++) printf toupper(substr($i,1,1)) substr($i,2)}')
  v=$(ls -d "$build/${tgt}_artefacts/Release/VST3/"*.vst3 2>/dev/null | head -1)
  [ -n "$v" ] || { echo "$id: geen vst3"; continue; }
  if grep -q 'true); }' "$f"; then arg="notes=48,60,64"; else arg="in=$out/in.wav"; fi
  log=$("$check" "$v" "$out/$id.wav" 2 $arg instances=2 2>&1)
  echo "$id $(echo "$log" | grep -o 'piek [0-9.]*' | tail -1) | 2e: $(echo "$log" | grep -o 'eerste [0-9.e+-]*' | awk '{print $2}') | traps: $(echo "$log" | grep -c 'fout in de module')"
done
