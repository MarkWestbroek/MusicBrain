// Draait een gecompileerde bit-identiteitscheck (WASI-command) onder node.
//   node tools/mmb-wasm/bitcheck/run.mjs <check>.wasm
import { readFileSync } from 'node:fs';
import { WASI } from 'node:wasi';

const wasi = new WASI({ version: 'preview1', args: [], env: {} });
const mod = await WebAssembly.compile(readFileSync(process.argv[2]));
const inst = await WebAssembly.instantiate(mod, wasi.getImportObject());
process.exitCode = wasi.start(inst);
