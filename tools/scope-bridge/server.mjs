// Scope bridge: spawns the simulator and forwards every NDJSON line it prints
// to all connected WebSocket clients. The editor's Scope panel connects to
// ws://localhost:8765 and plots the resulting CV-vs-time trace.
//
// Usage:
//   node server.mjs                       # spawn ../../firmware/build/simulator/mb_simulator(.exe)
//   node server.mjs --exe path/to/sim     # explicit binary
//   node server.mjs --replay file.ndjson  # replay a previously captured trace
//   node server.mjs --port 8765
//
// No build step. No bundler. Pure Node + the `ws` package.

import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { platform } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { port: 8765, exe: null, replay: null, loop: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port')         out.port   = Number(argv[++i]);
    else if (a === '--exe')     out.exe    = argv[++i];
    else if (a === '--replay')  out.replay = argv[++i];
    else if (a === '--loop')    out.loop   = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error('unknown arg:', a); process.exit(2); }
  }
  return out;
}

function printHelp() {
  console.log(`scope-bridge — forwards mb_simulator NDJSON over WebSocket

Options:
  --port <n>          WebSocket port (default 8765)
  --exe <path>        Path to mb_simulator binary (default: auto-detect)
  --replay <file>     Replay a captured .ndjson trace instead of spawning
  --loop              With --replay, restart from the top when EOF
`);
}

function defaultExe() {
  const ext  = platform === 'win32' ? '.exe' : '';
  const root = resolve(__dirname, '..', '..');
  return resolve(root, 'firmware', 'build', 'simulator', `mb_simulator${ext}`);
}

class TraceHub {
  constructor() { this.clients = new Set(); }
  add(ws)    { this.clients.add(ws); ws.on('close', () => this.clients.delete(ws)); }
  send(line) { for (const ws of this.clients) { if (ws.readyState === ws.OPEN) ws.send(line); } }
}

function pipeLineStream(stream, hub, onEnd) {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  rl.on('line', (line) => { if (line.trim().length) hub.send(line); });
  rl.on('close', () => onEnd && onEnd());
}

function startReplay(file, hub, loop) {
  const run = () => {
    if (!existsSync(file)) { console.error('replay file missing:', file); process.exit(1); }
    console.log(`[replay] streaming ${file}${loop ? ' (looping)' : ''}`);
    pipeLineStream(createReadStream(file, { encoding: 'utf8' }), hub, () => {
      if (loop) setTimeout(run, 250);
    });
  };
  run();
}

function startSimulator(exe, hub) {
  if (!existsSync(exe)) {
    console.error(`simulator binary not found: ${exe}`);
    console.error('build it first: cd firmware && cmake --build build');
    process.exit(1);
  }
  console.log(`[sim] spawning ${exe} --loop`);
  const child = spawn(exe, ['--loop'], { stdio: ['ignore', 'pipe', 'inherit'] });
  pipeLineStream(child.stdout, hub, () => console.log('[sim] exited'));
  child.on('exit', (code) => console.log(`[sim] exit code ${code}`));
}

const args = parseArgs(process.argv);
const hub  = new TraceHub();
const wss  = new WebSocketServer({ port: args.port });

wss.on('listening', () => console.log(`scope-bridge listening on ws://localhost:${args.port}`));
wss.on('connection', (ws) => { console.log('[ws] client connected'); hub.add(ws); });

if (args.replay) startReplay(args.replay, hub, args.loop);
else             startSimulator(args.exe || defaultExe(), hub);
