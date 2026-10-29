#!/usr/bin/env python3
"""Eén .wasm-gastheer als C voor de plugin, via wasm2c.

    gen_w2c.py <wasm2c> <module.wasm> <uitmap> [naam]

Schrijft in <uitmap> (naam standaard "mod"; letters en cijfers, want wasm2c
verdubbelt een underscore in de C-namen):
  <naam>.c / <naam>.h   wasm2c-uitvoer
  <naam>_vt.h           de functietabel `kW2c_<naam>` (W2cRuntime.h): de
                        exports als functies op een instantie; optionele
                        exports (mmb_set_rate, bank, mmb_midi) zijn nullptr
                        als de module ze niet heeft

De WASI-imports (libc in de gastheer) staan voor alle modules in
wasi_stubs.c. Aangeroepen vanuit CMake (mmb_add_module ... W2C <wasm>, en de
patch-plugins); zie doc/plans/plugin-patches.md §4.
"""
import os
import re
import subprocess
import sys

# Verplichte exports (mmb_abi.h), met hun handtekening na de instantie.
REQUIRED = ['mmb_init', 'mmb_render', 'mmb_native_rate', 'mmb_block', 'mmb_type_id',
            'mmb_num_inputs', 'mmb_input_id', 'mmb_input_kind', 'mmb_input_ptr', 'mmb_input_connected',
            'mmb_num_outputs', 'mmb_output_id', 'mmb_output_kind', 'mmb_output_ptr',
            'mmb_num_controls', 'mmb_control_id', 'mmb_set_control']
OPTIONAL = ['mmb_set_rate', 'mmb_blob_ptr', 'mmb_blob_commit', 'mmb_zone_set', 'mmb_zone_count', 'mmb_midi']


def main() -> None:
    wasm2c, wasm, out = sys.argv[1], sys.argv[2], sys.argv[3]
    name = sys.argv[4] if len(sys.argv) > 4 else 'mod'
    if not re.fullmatch(r'[a-z][a-z0-9]*', name):
        sys.exit(f'gen_w2c: naam "{name}" moet uit kleine letters en cijfers bestaan')
    os.makedirs(out, exist_ok=True)
    subprocess.run([wasm2c, '-n', name, wasm, '-o', os.path.join(out, f'{name}.c')], check=True)
    header = open(os.path.join(out, f'{name}.h'), encoding='utf-8').read()
    has = lambda e: f'w2c_{name}_{e}(' in header
    missing = [e for e in REQUIRED if not has(e)]
    if missing:
        sys.exit(f'gen_w2c: {os.path.basename(wasm)} mist exports: {", ".join(missing)}')
    wasi = 'struct w2c_wasi__snapshot__preview1*' in header

    fn = lambda e: f'reinterpret_cast<decltype(W2cVtable::{e[4:]})>(&w2c_{name}_{e})'
    opt = lambda e: fn(e) if has(e) else 'nullptr'
    inst = f'wasm2c_{name}_instantiate(static_cast<w2c_{name}*>(p){", &mmbWasi()" if wasi else ""})'
    lines = [
        '#pragma once',
        f'// Gegenereerd door tools/plugin/wasm2c/gen_w2c.py uit {os.path.basename(wasm)}; niet met de hand wijzigen.',
        '#include "W2cRuntime.h"',
        f'#include "{name}.h"',
        '',
        'namespace mmb_plugin {',
        f'inline const W2cVtable kW2c_{name} = {{',
        f'    "{name}",',
        f'    [] {{ return static_cast<void*>(new w2c_{name}()); }},',
        f'    [](void* p) {{ {inst}; }},',
        f'    [](void* p) {{ wasm2c_{name}_free(static_cast<w2c_{name}*>(p)); delete static_cast<w2c_{name}*>(p); }},',
        f'    [](void* p) {{ return w2c_{name}_memory(static_cast<w2c_{name}*>(p)); }},',
    ]
    lines += [f'    {fn(e)},' for e in REQUIRED]
    lines += [f'    {opt(e)},' for e in OPTIONAL]
    lines += ['};', '}  // namespace mmb_plugin', '']
    open(os.path.join(out, f'{name}_vt.h'), 'w', encoding='utf-8').write('\n'.join(lines))


if __name__ == '__main__':
    main()
