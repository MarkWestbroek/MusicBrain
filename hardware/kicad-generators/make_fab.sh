#!/usr/bin/env bash
# Genereer JLCPCB-fab-pakketten voor alle MusicBrain-borden.
set -u
ROOT="d:/Git/Muziek/MusicBrain/hardware/schematics"

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

for entry in $BOARDS; do
  dir="${entry%%:*}"; base="${entry##*:}"
  bd="$ROOT/$dir"
  pcb="$bd/$base.kicad_pcb"
  sch="$bd/$base.kicad_sch"
  fab="$bd/fab"
  gerb="$fab/gerbers"
  [ -f "$pcb" ] || { echo "SKIP $dir (geen pcb)"; continue; }
  rm -rf "$fab"; mkdir -p "$gerb"

  kicad-cli pcb export gerbers --no-protel-ext --check-zones \
    --layers "$GLAYERS" -o "$gerb/" "$pcb" >/dev/null 2>&1
  kicad-cli pcb export drill --format excellon --excellon-separate-th \
    --generate-map --map-format gerberx2 -o "$gerb/" "$pcb" >/dev/null 2>&1
  kicad-cli pcb export pos --format csv --units mm --side both \
    -o "$fab/$base-cpl.csv" "$pcb" >/dev/null 2>&1
  if [ -f "$sch" ]; then
    kicad-cli sch export bom \
      --fields "Value,Reference,Footprint,QUANTITY,LCSC" \
      --labels "Comment,Designator,Footprint,Qty,LCSC Part #" \
      --group-by "Value,Footprint" \
      --sort-field "Reference" \
      -o "$fab/$base-bom.csv" "$sch" >/dev/null 2>&1
  fi

  python "$(dirname "$0")/jlc_fix.py" "$fab" >/dev/null

  python - "$gerb" "$fab/$base-gerbers.zip" <<'PYZIP'
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
