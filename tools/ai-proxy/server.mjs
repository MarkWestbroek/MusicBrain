#!/usr/bin/env node
// MusicBrain AI-proxy (ED-RC-10) — jouw API-key op de server, toegang met een
// code die jij uitgeeft. De editor (profiel "MusicBrain-server") stuurt
// OpenAI-compatibele chat-completions naar /ai/v1/chat/completions met de
// toegangscode als Bearer; dit proces controleert de code en de daglimiet,
// zet de échte key erop en stuurt het door naar de upstream (standaard
// DeepSeek). De key komt nooit in de browser.
//
// Geen afhankelijkheden (Node 18+). Zie README.md voor installatie op de VPS.
//
//   node server.mjs                              start (poort AI_PROXY_PORT, 8787)
//   node server.mjs add-code "Naam" [perDag]     nieuwe toegangscode
//   node server.mjs list                          codes + gebruik vandaag
//   node server.mjs revoke <code|naam>            code uitzetten
//
// Omgeving:
//   UPSTREAM_KEY    (verplicht) de API-key, bijv. van DeepSeek
//   UPSTREAM_URL    standaard https://api.deepseek.com/chat/completions
//   UPSTREAM_MODEL  als gezet: elk verzoek krijgt dit model (de client kiest niet)
//   AI_PROXY_PORT   standaard 8787
//   AI_PROXY_HOST   standaard 127.0.0.1 (Caddy zit ervoor); in een container 0.0.0.0
//   AI_PROXY_DIR    map met invites.json en usage.jsonl (standaard naast dit script)

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.AI_PROXY_DIR ?? dirname(fileURLToPath(import.meta.url));
const INVITES = join(DIR, 'invites.json');
const USAGE = join(DIR, 'usage.jsonl');
const MAX_BODY = 512 * 1024;

function readInvites() {
  if (!existsSync(INVITES)) return [];
  try { return JSON.parse(readFileSync(INVITES, 'utf8')); } catch { return []; }
}
function writeInvites(list) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(INVITES, JSON.stringify(list, null, 2) + '\n');
}
const today = () => new Date().toISOString().slice(0, 10);

// ── beheer via de commandoregel ──────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'add-code') {
  const name = args[0] ?? 'gast';
  const perDay = Number(args[1] ?? 200);
  const code = `mb-${randomBytes(9).toString('base64url')}`;
  writeInvites([...readInvites(), { code, name, perDay, active: true, created: today() }]);
  console.log(`toegangscode voor ${name} (${perDay}/dag): ${code}`);
  process.exit(0);
}
if (cmd === 'list') {
  const used = usageToday();
  for (const i of readInvites()) console.log(`${i.active ? '✓' : '✕'} ${i.name.padEnd(20)} ${String(used.get(i.code) ?? 0).padStart(4)}/${i.perDay}  ${i.code}`);
  process.exit(0);
}
if (cmd === 'revoke') {
  const who = args[0];
  const list = readInvites().map((i) => (i.code === who || i.name === who ? { ...i, active: false } : i));
  writeInvites(list);
  console.log(`ingetrokken: ${who}`);
  process.exit(0);
}

function usageToday() {
  const m = new Map();
  if (!existsSync(USAGE)) return m;
  const d = today();
  for (const line of readFileSync(USAGE, 'utf8').split('\n')) {
    if (!line.includes(d)) continue;
    try { const u = JSON.parse(line); if (u.date === d) m.set(u.code, (m.get(u.code) ?? 0) + 1); } catch { /* regel overslaan */ }
  }
  return m;
}

// ── server ────────────────────────────────────────────────────────────────
const UPSTREAM_URL = process.env.UPSTREAM_URL ?? 'https://api.deepseek.com/chat/completions';
const UPSTREAM_KEY = process.env.UPSTREAM_KEY ?? '';
const UPSTREAM_MODEL = process.env.UPSTREAM_MODEL ?? '';
const PORT = Number(process.env.AI_PROXY_PORT ?? 8787);
const HOST = process.env.AI_PROXY_HOST ?? '127.0.0.1';
if (!UPSTREAM_KEY) { console.error('ai-proxy: UPSTREAM_KEY ontbreekt'); process.exit(1); }

const counts = usageToday();   // bij de start inlezen, daarna in het geheugen bijhouden
let countDay = today();

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = (req.url ?? '').replace(/^\/ai(?=\/)/, '');
  if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || url !== '/v1/chat/completions') return send(res, 404, { error: 'niet gevonden' });

  const code = /^Bearer\s+(.+)$/.exec(req.headers.authorization ?? '')?.[1]?.trim() ?? '';
  const invite = readInvites().find((i) => i.code === code && i.active);
  if (!invite) return send(res, 401, { error: 'onbekende of ingetrokken toegangscode' });
  if (countDay !== today()) { counts.clear(); countDay = today(); }
  const used = counts.get(code) ?? 0;
  if (used >= invite.perDay) return send(res, 429, { error: `daglimiet bereikt (${invite.perDay})` });

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) return send(res, 413, { error: 'verzoek te groot' });
  }
  let json;
  try { json = JSON.parse(body); } catch { return send(res, 400, { error: 'geen JSON' }); }
  if (UPSTREAM_MODEL) json.model = UPSTREAM_MODEL;
  delete json.stream;   // geen streaming door de proxy

  counts.set(code, used + 1);
  try {
    const up = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UPSTREAM_KEY}` },
      body: JSON.stringify(json),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await up.text();
    let usage = null;
    try { usage = JSON.parse(text).usage ?? null; } catch { /* geen JSON */ }
    appendFileSync(USAGE, JSON.stringify({ date: today(), t: new Date().toISOString(), code, name: invite.name, status: up.status, usage }) + '\n');
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' });
    res.end(text);
  } catch (e) {
    send(res, 502, { error: `upstream niet bereikbaar: ${e instanceof Error ? e.message : String(e)}` });
  }
});

server.listen(PORT, HOST, () => console.log(`ai-proxy luistert op ${HOST}:${PORT} → ${UPSTREAM_URL}`));
