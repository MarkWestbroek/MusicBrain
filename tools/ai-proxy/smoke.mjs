// Rooktest voor de AI-proxy: een nep-upstream op een vrije poort, de proxy
// ertussen, en verzoeken met/zonder code en over de daglimiet.
//
//   node smoke.mjs

import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'ai-proxy-'));
const check = (ok, what) => { console.log(`${ok ? 'ok ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

let seen = null;
const upstream = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    seen = { auth: req.headers.authorization, body: JSON.parse(b) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hallo' } }], usage: { total_tokens: 7 } }));
  });
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const upPort = upstream.address().port;
const env = { ...process.env, AI_PROXY_DIR: dir, UPSTREAM_KEY: 'geheim', UPSTREAM_URL: `http://127.0.0.1:${upPort}/x`, UPSTREAM_MODEL: 'deepseek-chat', AI_PROXY_PORT: '18787' };
const out = execFileSync(process.execPath, [join(here, 'server.mjs'), 'add-code', 'Test', '2'], { env }).toString();
const code = /: (mb-\S+)/.exec(out)[1];
const proxy = spawn(process.execPath, [join(here, 'server.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => proxy.stdout.once('data', r));

const post = (auth) => fetch('http://127.0.0.1:18787/ai/v1/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  body: JSON.stringify({ model: 'gpt-anything', messages: [{ role: 'user', content: 'hoi' }], stream: true }),
});
try {
  check((await fetch('http://127.0.0.1:18787/ai/health')).status === 200, 'health');
  check((await post(null)).status === 401, 'zonder code: 401');
  check((await post('mb-verkeerd')).status === 401, 'verkeerde code: 401');
  const r1 = await post(code);
  check(r1.status === 200 && (await r1.json()).choices[0].message.content === 'hallo', 'met code: antwoord van upstream');
  check(seen.auth === 'Bearer geheim', 'upstream krijgt de echte key, niet de code');
  check(seen.body.model === 'deepseek-chat' && seen.body.stream === undefined, 'model vastgezet, streaming eruit');
  check((await post(code)).status === 200, 'tweede verzoek binnen limiet');
  check((await post(code)).status === 429, 'derde verzoek: daglimiet (2)');
  const log = readFileSync(join(dir, 'usage.jsonl'), 'utf8').trim().split('\n');
  check(log.length === 2 && JSON.parse(log[0]).usage.total_tokens === 7, 'gebruik gelogd');
  execFileSync(process.execPath, [join(here, 'server.mjs'), 'revoke', 'Test'], { env });
  check((await post(code)).status === 401, 'ingetrokken code: 401');
} finally {
  proxy.kill(); upstream.close();
}
