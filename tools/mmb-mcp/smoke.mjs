// Rooktest voor de MCP-server: start hem op een tijdelijk project, praat
// JSON-RPC over stdio (newline-delimited, zoals MCP-stdio) en controleert
// initialize, tools/list en een paar tools/call's.
//
//   node smoke.mjs

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(os.tmpdir(), `mmb-mcp-smoke-${process.pid}.json`);
const child = spawn(process.execPath, [path.join(here, 'node_modules/tsx/dist/cli.mjs'), path.join(here, 'src/server.ts'), '--project', tmp],
  { stdio: ['pipe', 'pipe', 'inherit'] });

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let nextId = 1;
function call(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 20000);
  });
}
function notify(method, params) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
const textOf = (res) => JSON.parse(res.result.content[0].text);
const check = (ok, what) => { console.log(`${ok ? 'ok ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

try {
  const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  check(init.result?.serverInfo?.name === 'mmb', 'initialize');
  notify('notifications/initialized', {});

  const list = await call('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  check(names.includes('build_patch') && names.includes('get_patch_summary') && names.includes('save_project'), `tools/list (${names.length} tools)`);

  const built = await call('tools/call', { name: 'build_patch', arguments: { recipe: { voices: 4, source: 'wavetable', filter: 'ladder', bus: ['diode compressor'] } } });
  check(!built.result.isError && textOf(built).ok === true, `build_patch: ${textOf(built).summary}`);

  const sum = await call('tools/call', { name: 'get_patch_summary', arguments: {} });
  const s = textOf(sum);
  check(s.voices === 4 && s.modules.some((m) => m.typeId === 'tp_mmb_wt_vco' && m.poly === 4), 'get_patch_summary');

  const rep = await call('tools/call', { name: 'replace_module', arguments: { from: 'filter', to: 'ms20' } });
  check(!rep.result.isError && /MS-20/.test(textOf(rep).summary), `replace_module: ${textOf(rep).summary}`);

  const bad = await call('tools/call', { name: 'get_module_type', arguments: { typeId: 'flanger' } });
  check(bad.result.isError === true && /Onbekend/.test(bad.result.content[0].text), 'fout als isError');

  check(fs.existsSync(tmp) && JSON.parse(fs.readFileSync(tmp, 'utf8')).patches.length === 1, 'project-JSON weggeschreven');
} catch (e) {
  check(false, String(e));
} finally {
  child.kill();
  try { fs.unlinkSync(tmp); } catch { /* al weg */ }
}
