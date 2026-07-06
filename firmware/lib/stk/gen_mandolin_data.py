"""Genereer include/stk/MandolinData.h uit STK's mand1..12.raw.

De raw-bestanden (16-bit big-endian mono, 22050 Hz) zitten in de STK-repo
(https://github.com/thestk/stk) onder rawwaves/. Gebruik:

    python gen_mandolin_data.py <pad-naar-stk-checkout>
"""
import struct, pathlib, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)

RAWWAVES = pathlib.Path(sys.argv[1]) / "rawwaves"
OUT = pathlib.Path(__file__).parent / "include" / "stk" / "MandolinData.h"

arrays = []
for n in range(1, 13):
    raw = (RAWWAVES / f"mand{n}.raw").read_bytes()
    samples = struct.unpack(f">{len(raw)//2}h", raw)
    peak = max(1, max(abs(s) for s in samples))
    arrays.append((n, samples, peak))

lines = []
lines.append("#pragma once")
lines.append("// MMB: gegenereerd uit STK rawwaves/mand1..12.raw (16-bit big-endian,")
lines.append("// 22050 Hz) door gen_mandolin_data.py. Niet met de hand bewerken.")
lines.append("// De .progmem-sectie dwingt flash-plaatsing af: op de Teensy 4 gaat .rodata")
lines.append("// anders naar DTCM (RAM1), en dat is te kostbaar voor 24 KB sampledata.")
lines.append("// Flash is op de T4.1 memory-mapped, dus gewoon direct leesbaar.")
lines.append("#include <cstdint>")
lines.append("")
lines.append('#define MMB_MANDOLIN_FLASH __attribute__((section(".progmem.mandolin"), aligned(4)))')
lines.append("")
lines.append("namespace stk {")
lines.append("")
for n, samples, peak in arrays:
    lines.append(f"MMB_MANDOLIN_FLASH static const int16_t kMand{n}[{len(samples)}] = {{")
    for i in range(0, len(samples), 12):
        chunk = ", ".join(f"{s}" for s in samples[i:i+12])
        lines.append(f"  {chunk},")
    lines.append("};")
    lines.append("")
lines.append("struct MandolinBodyWave { const int16_t* data; unsigned long size; float peak; };")
lines.append("")
lines.append("static const MandolinBodyWave kMandolinBody[12] = {")
for n, samples, peak in arrays:
    lines.append(f"  {{ kMand{n}, {len(samples)}, {peak}.0f }},")
lines.append("};")
lines.append("")
lines.append("} // namespace stk")
lines.append("")

OUT.write_text("\n".join(lines), encoding="ascii")
total = sum(len(s) * 2 for _, s, _ in arrays)
print(f"OK: {OUT} — 12 arrays, {total} bytes sampledata")
