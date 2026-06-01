# Vendored: Mutable Instruments Elements DSP

This directory contains a **byte-exact** copy of the DSP sources from Mutable
Instruments *Elements* plus the minimal `stmlib` subset they depend on. The
code is the original work of **Emilie Gillet** and is distributed under the
**MIT license** (the per-file copyright headers are preserved unmodified).

## Provenance

| Component | Upstream repo | Commit |
|-----------|---------------|--------|
| `elements/` | https://github.com/pichenettes/eurorack | `08460a69a7e1f7a81c5a2abcc7189c9a6b7208d4` |
| `stmlib/`   | https://github.com/pichenettes/stmlib (submodule) | `e3bd7c9cc00e4364166f9905c0509b6ffd0535ec` |

Only the files actually reachable from `elements::Part` were copied. The large
STM32 HAL / CMSIS `third_party/` tree from `stmlib` was **deliberately
excluded** — the Teensy 4.1 has a hardware FPU, so the fixed-point / CMSIS code
paths are not needed.

## What was copied

```
elements/dsp/*.{h,cc}          modal voice (part, voice, exciter, resonator,
elements/dsp/fx/*.h            string, tube, ominous_voice, envelope, reverb…)
elements/resources.{cc,h}      wavetables / lookup tables
stmlib/stmlib.h
stmlib/dsp/{dsp,units,filter,cosine_oscillator,delay_line,parameter_interpolator}.h
stmlib/dsp/units.cc
stmlib/utils/random.{h,cc}
```

## License

MIT — see the copyright/permission header at the top of every `.cc`/`.h` file.

> Copyright 2014 Emilie Gillet (emilie.o.gillet@gmail.com)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software … (full MIT text in each source file).

The MusicBrain integration layer that *uses* this DSP lives outside this folder
(`firmware/app-elements/src/ElementsModule.h`).

## Teensy 4.1 adaptations (deviations from upstream)

The sources are otherwise byte-exact; the only intentional changes are:

1. **`elements/resources.cc`** — the 23 large lookup-table arrays are tagged
   `FLASHMEM` (a no-op macro is defined at the top of the file) so the
   ~380 KB of wavetables stay in flash instead of being copied into the
   Cortex-M7's 512 KB DTCM fast RAM at startup. The small pointer/index tables
   are left in RAM (a pointer array with relocations cannot share the
   `.flashmem` section with plain const data).
2. **`elements/drivers/debug_pin.h`** — a new stub providing no-op `TIC`/`TOC`
   macros, replacing the original STM32 GPIO timing driver (not vendored).

No DSP math was altered. The original STM32 hardware drivers, the CMSIS /
fixed-point `third_party/` tree, and the rest of `stmlib` were not copied.

