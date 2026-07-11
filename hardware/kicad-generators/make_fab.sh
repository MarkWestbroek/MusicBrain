#!/usr/bin/env bash
# Genereer JLCPCB-fab-pakketten voor alle MusicBrain-borden.
set -u
ROOT="d:/Git/Muziek/MusicBrain/Images/schematics"

# dir:base  (base = bestandsnaam zonder extensie)
BOARDS="
ad5754r-breakout:ad5754r-breakout
musicbrain-busboard:musicbrain-busboard
musicbrain-gate8:musicbrain-gate8
musicbrain-adc8:musicbrain-adc8
musicbrain-dac8:musicbrain-dac8
musicbrain-gatein8:musicbrain-gatein8
musicbrain-pot8:musicbrain-pot8
musicbrain-enc4:musicbrain-enc4
musicbrain-jack8:musicbrain-jack8
musicbrain-jack4:musicbrain-jack4
musicbrain-riser:musicbrain-riser
"

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

  gcount=$(ls "$gerb" | wc -l)
  echo "$dir : $gcount gerber/drill-bestanden, CPL + BOM (JLC-formaat)"
done
echo "GEREED"
