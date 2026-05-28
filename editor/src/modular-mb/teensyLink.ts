// editor ↔ teensy link — Web Serial transport for mmb-config.v1.
//
// One singleton link per editor session; React components subscribe via
// `useTeensyLink()`. We keep the actual SerialPort outside React so reconnect
// state survives re-renders.
//
// Protocol: newline-terminated JSON, both directions, 115200 8N1.
// Match `firmware/app-modular-brain/src/TeensyLink.h`.

import { useSyncExternalStore } from 'react';
import type { ModularProject } from './types';

// ── Web Serial type shims ──────────────────────────────────────────────
// (Chrome/Edge ship these globally; we add minimal types so TS compiles
// without the @types/w3c-web-serial package.)
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number }
interface SerialOpenOptions { baudRate: number }
interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(opts: SerialOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface SerialPortFilter { usbVendorId?: number; usbProductId?: number }
interface Serial {
  requestPort(opts?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}
declare global {
  interface Navigator { serial?: Serial }
}

// ── Link state ──────────────────────────────────────────────────────────

export type LinkStatus =
  | { kind: 'unsupported' }       // no navigator.serial in this browser
  | { kind: 'disconnected' }
  | { kind: 'connecting' }
  | { kind: 'connected'; fw?: string; step?: number }
  | { kind: 'error'; message: string };

export interface LinkLogEntry {
  ts: number;
  dir: 'rx' | 'tx' | 'sys';
  text: string;
}

interface LinkState {
  status: LinkStatus;
  log: LinkLogEntry[];
  lastAck?: { ok: boolean; applied?: string; err?: string; modules?: number; patches?: number; racks?: number };
}

const LOG_MAX = 200;

let state: LinkState = {
  status: typeof navigator !== 'undefined' && navigator.serial
    ? { kind: 'disconnected' }
    : { kind: 'unsupported' },
  log: [],
};
const listeners = new Set<() => void>();

function emit(): void { for (const l of listeners) l(); }
function setState(next: Partial<LinkState>): void {
  state = { ...state, ...next };
  emit();
}
function pushLog(entry: LinkLogEntry): void {
  const log = state.log.concat(entry);
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  state = { ...state, log };
  emit();
}

// ── Active connection (singletons) ──────────────────────────────────────

let port:   SerialPort | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let readLoopAbort = false;

const enc = new TextEncoder();
const dec = new TextDecoder();
let rxBuf = '';

async function readLoop(): Promise<void> {
  if (!port || !port.readable) return;
  reader = port.readable.getReader();
  try {
    while (!readLoopAbort) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      rxBuf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = rxBuf.indexOf('\n')) >= 0) {
        const line = rxBuf.slice(0, nl).replace(/\r$/, '');
        rxBuf = rxBuf.slice(nl + 1);
        if (line.length > 0) handleLine(line);
      }
    }
  } catch (err) {
    pushLog({ ts: Date.now(), dir: 'sys', text: `read error: ${(err as Error).message}` });
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
    reader = null;
  }
}

function handleLine(line: string): void {
  pushLog({ ts: Date.now(), dir: 'rx', text: line });
  if (!line.startsWith('{')) return;  // raw printf logs are kept in the log only
  try {
    const msg = JSON.parse(line) as { type?: string; [k: string]: unknown };
    switch (msg.type) {
      case 'hello':
        setState({ status: {
          kind: 'connected',
          fw:   typeof msg.fw === 'string'   ? msg.fw   : undefined,
          step: typeof msg.step === 'number' ? msg.step : undefined,
        } });
        break;
      case 'ack':
        setState({ lastAck: {
          ok:       Boolean(msg.ok),
          applied:  typeof msg.applied === 'string' ? msg.applied : undefined,
          err:      typeof msg.err === 'string' ? msg.err : undefined,
          modules:  typeof msg.modules === 'number' ? msg.modules : undefined,
          patches:  typeof msg.patches === 'number' ? msg.patches : undefined,
          racks:    typeof msg.racks   === 'number' ? msg.racks   : undefined,
        } });
        break;
      case 'log':
        // already shown via rx log entry
        break;
    }
  } catch {
    // ignore non-JSON lines
  }
}

async function writeLine(s: string): Promise<void> {
  if (!writer) throw new Error('not connected');
  pushLog({ ts: Date.now(), dir: 'tx', text: s.length > 200 ? s.slice(0, 200) + '…' : s });
  await writer.write(enc.encode(s + '\n'));
}

// ── Public API ──────────────────────────────────────────────────────────

export async function connect(): Promise<void> {
  if (!navigator.serial) {
    setState({ status: { kind: 'unsupported' } });
    return;
  }
  if (state.status.kind === 'connecting' || state.status.kind === 'connected') return;
  setState({ status: { kind: 'connecting' } });
  try {
    // Teensy USB VID = 0x16C0.
    port = await navigator.serial.requestPort({ filters: [{ usbVendorId: 0x16C0 }] });
    // The browser may return a port that is already open (e.g. after a
    // hot-reload). Only call open() when readable is null.
    if (!port.readable) {
      await port.open({ baudRate: 115200 });
    }
    writer = port.writable!.getWriter();
    readLoopAbort = false;
    void readLoop();
    pushLog({ ts: Date.now(), dir: 'sys', text: 'serial port opened' });
    // Request a hello so we get firmware version even if we missed the boot one.
    await writeLine(JSON.stringify({ type: 'hello' }));
  } catch (err) {
    setState({ status: { kind: 'error', message: (err as Error).message } });
    await safeClose();
  }
}

export async function disconnect(): Promise<void> {
  readLoopAbort = true;
  await safeClose();
  setState({ status: { kind: 'disconnected' } });
  pushLog({ ts: Date.now(), dir: 'sys', text: 'disconnected' });
}

async function safeClose(): Promise<void> {
  try { if (reader) await reader.cancel(); } catch { /* ignore */ }
  try { if (writer) { writer.releaseLock(); } } catch { /* ignore */ }
  try { if (port)   await port.close(); } catch { /* ignore */ }
  port = null; writer = null; reader = null; rxBuf = '';
}

export async function sendConfig(project: ModularProject): Promise<void> {
  // Build a minimal runtime-only payload — the Teensy only needs enough to
  // instantiate modules and wire the audio graph. Strip ALL visual/design-
  // time fields so the JSON stays well under the 48 KB line buffer.
  const runtime = {
    version:       project.version,
    name:          project.name,
    activePatchId: project.activePatchId,
    modules: project.modules.map((m) => ({
      id:     m.id,
      typeId: m.typeId,
    })),
    racks: project.racks.map((r) => ({
      id:    r.id,
      slots: r.slots.map((s) => ({ id: s.id, moduleId: s.moduleId })),
    })),
    patches: project.patches.map((p) => ({
      id:      p.id,
      name:    p.name,
      rackIds: p.rackIds,
      connections: p.connections.map((c) => ({
        id:   c.id,
        from: c.from,
        to:   c.to,
        ...(c.attenuation !== undefined ? { attenuation: c.attenuation } : {}),
        ...(c.invert      ? { invert: c.invert }       : {}),
      })),
      controlState: p.controlState,
    })),
  };
  await writeLine(JSON.stringify({ type: 'config', project: runtime }));
}

export async function sendSelectPatch(patchId: string): Promise<void> {
  await writeLine(JSON.stringify({ type: 'selectPatch', patchId }));
}

export function clearLog(): void {
  state = { ...state, log: [] };
  emit();
}

// ── React hook ──────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTeensyLink(): LinkState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
