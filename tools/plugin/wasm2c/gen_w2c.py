#!/usr/bin/env python3
"""Eén .wasm-gastheer als C voor de plugin (W2cPlugin.h), via wasm2c.

    gen_w2c.py <wasm2c> <module.wasm> <uitmap>

Schrijft in <uitmap>:
  mod.c / mod.h   wasm2c-uitvoer, modulenaam "mod" (elke plugin heeft er één)
  mod_glue.h      welke optionele exports er zijn (MMB_W2C_HAS_*) en lege
                  WASI-functies voor de imports (libc in de gastheer: printf
                  en dergelijke; de plugin heeft geen bestanden of klok nodig)

Aangeroepen vanuit CMake (mmb_add_module ... W2C <wasm>); zie
doc/plans/plugin-patches.md §4.
"""
import os
import re
import subprocess
import sys

OPTIONAL = {
    'mmb_set_rate': 'MMB_W2C_HAS_SET_RATE',
    'mmb_blob_ptr': 'MMB_W2C_HAS_BLOB',
    'mmb_zone_set': 'MMB_W2C_HAS_ZONES',
}
ENOSYS = 52  # WASI errno: functie niet beschikbaar


def main() -> None:
    wasm2c, wasm, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    subprocess.run([wasm2c, '-n', 'mod', wasm, '-o', os.path.join(out, 'mod.c')], check=True)
    header = open(os.path.join(out, 'mod.h'), encoding='utf-8').read()

    lines = [
        '#pragma once',
        f'// Gegenereerd door tools/plugin/wasm2c/gen_w2c.py uit {os.path.basename(wasm)}; niet met de hand wijzigen.',
        '#include "mod.h"',
        '',
    ]
    for export, flag in OPTIONAL.items():
        lines.append(f'#define {flag} {1 if f"w2c_mod_{export}(" in header else 0}')

    # Imports: "u32 w2c_wasi__snapshot__preview1_fd_write(struct w2c_wasi__snapshot__preview1*, u32, u32, u32, u32);"
    imports = re.findall(r'^(\w+) (w2c_wasi__snapshot__preview1_\w+)\(struct w2c_wasi__snapshot__preview1\*((?:, \w+)*)\);', header, re.M)
    lines.append(f'#define MMB_W2C_WASI {1 if imports else 0}')
    if imports:
        lines += ['', 'extern "C" {', 'struct w2c_wasi__snapshot__preview1 { int unused; };']
        for ret, name, rest in imports:
            args = [t.strip() for t in rest.split(',') if t.strip()]
            params = ', '.join(['struct w2c_wasi__snapshot__preview1*'] + [f'{t} a{i}' for i, t in enumerate(args)])
            body = f'return {ENOSYS};' if ret != 'void' else ''
            lines.append(f'{ret} {name}({params}) {{ {body} }}')
        lines.append('}')
    lines.append('')
    open(os.path.join(out, 'mod_glue.h'), 'w', encoding='utf-8').write('\n'.join(lines))


if __name__ == '__main__':
    main()
