#!/usr/bin/env bash
# Genereer JLCPCB-fab-pakketten voor alle MusicBrain-borden.
set -u

# Cross-platform (macOS + Windows/git-bash), net als cardlib.py:
# - ROOT wordt afgeleid van de scriptlocatie i.p.v. een hardgecodeerd pad;
# - kicad-cli en python worden autogedetecteerd.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../schematics" && pwd)"

if command -v kicad-cli >/dev/null 2>&1; then
  KCLI="kicad-cli"
elif [ -x "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli" ]; then
  KCLI="/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
else
  echo "kicad-cli niet gevonden (PATH of /Applications/KiCad/...)"; exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1; then
  PY="python"
else
  echo "python niet gevonden"; exit 1
fi

# dir:base  (base = bestandsnaam zonder extensie); deprecated/ doet niet mee
BOARDS="
ad5754r-breakout:ad5754r-breakout
musicbrain-gate8:musicbrain-gate8
musicbrain-adc8:musicbrain-adc8
musicbrain-dac8:musicbrain-dac8
musicbrain-gatein8:musicbrain-gatein8
musicbrain-jack8:musicbrain-jack8
musicbrain-jack4:musicbrain-jack4
musicbrain-riser:musicbrain-riser
musicbrain-pot8front:musicbrain-pot8front
musicbrain-potriser:musicbrain-potriser
musicbrain-enc5front:musicbrain-enc5front
musicbrain-i2criser:musicbrain-i2criser
musicbrain-busboard:musicbrain-busboard
musicbrain-axon:musicbrain-axon
musicbrain-vca8:musicbrain-vca8
musicbrain-matrix:musicbrain-matrix
musicbrain-matrix-c:musicbrain-matrix-c
musicbrain-vcf8kern:musicbrain-vcf8kern
musicbrain-vcf8kern-testadapter:musicbrain-vcf8kern-testadapter
"

# optioneel: alleen geselecteerde borden (komma-gescheiden dir-namen als arg 1)
if [ -n "${1:-}" ]; then
  SEL=",$1,"
  FILTERED=""
  for entry in $BOARDS; do
    dir="${entry%%:*}"
    case "$SEL" in *",$dir,"*|*",${dir#musicbrain-},"*) FILTERED="$FILTERED $entry";; esac
  done
  BOARDS="$FILTERED"
fi

GLAYERS="F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts,F.Paste,B.Paste"
# 4-laags borden (matrix): binnenlagen automatisch meenemen
GLAYERS4="F.Cu,In1.Cu,In2.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts,F.Paste,B.Paste"

for entry in $BOARDS; do
  dir="${entry%%:*}"; base="${entry##*:}"
  bd="$ROOT/$dir"
  pcb="$bd/$base.kicad_pcb"
  sch="$bd/$base.kicad_sch"
  fab="$bd/fab"
  gerb="$fab/gerbers"
  [ -f "$pcb" ] || { echo "SKIP $dir (geen pcb)"; continue; }
  rm -rf "$fab"; mkdir -p "$gerb"

  layers="$GLAYERS"
  grep -q '"In1.Cu"' "$pcb" && layers="$GLAYERS4"
  "$KCLI" pcb export gerbers --no-protel-ext --check-zones \
    --layers "$layers" -o "$gerb/" "$pcb" >/dev/null 2>&1
  "$KCLI" pcb export drill --format excellon --excellon-separate-th \
    --generate-map --map-format gerberx2 -o "$gerb/" "$pcb" >/dev/null 2>&1
  "$KCLI" pcb export pos --format csv --units mm --side both \
    -o "$fab/$base-cpl.csv" "$pcb" >/dev/null 2>&1
  if [ -f "$sch" ]; then
    "$KCLI" sch export bom \
      --fields "Value,Reference,Footprint,QUANTITY,LCSC" \
      --labels "Comment,Designator,Footprint,Qty,LCSC Part #" \
      --group-by "Value,Footprint" \
      --sort-field "Reference" \
      -o "$fab/$base-bom.csv" "$sch" >/dev/null 2>&1
  fi

  "$PY" "$(dirname "$0")/jlc_fix.py" "$fab" >/dev/null

  "$PY" - "$gerb" "$fab/$base-gerbers.zip" <<'PYZIP'
import sys, os, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(src)):
        z.write(os.path.join(src, f), f)
PYZIP

  gcount=$(ls "$gerb" | wc -l)
  echo "$dir : $gcount gerber/drill-bestanden, CPL + BOM (JLC-formaat)"
done
echo "GEREED"
