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
import { flattenProjectForFirmware, polyControlTargets } from './polyExpand';

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
interface Serial extends EventTarget {
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
  | { kind: 'connected'; fw?: string; version?: string; step?: number }
  | { kind: 'error'; message: string };

export interface LinkLogEntry {
  ts: number;
  dir: 'rx' | 'tx' | 'sys';
  text: string;
}

/** Telemetrie uit het firmware "status"-bericht (zie main.cpp onGetStatus). */
export interface DeviceStatus {
  cpu?: number;      // audio-ISR-belasting nu (%)
  cpuMax?: number;   // piek sinds boot (%)
  mem?: number;      // audio-blocks in gebruik
  memMax?: number;   // piek audio-blocks
  memPool?: number;  // pool-grootte (AudioMemory)
  modules?: number;  // live module-instanties
  retired?: number;  // gepensioneerde (nooit vrijgegeven) modules
  patch?: string;    // actieve patch-id
  loopHz?: number;   // main-loop iteraties/s (CV-tick-headroom)
  uptimeMs?: number;
  heapFree?: number;  // vrije heap (RAM2) in bytes — module/DSP-budget
  outPeak?: number;   // hoogste |sample| op de master-uitgang sinds vorige poll (0..1)
  psramMB?: number;   // PSRAM op de Teensy in MB (0 = geen) — daar gaan samplebanken heen
  sdOk?: boolean;     // SD-kaart gelezen bij het opstarten (zie teensyStorage.ts)
  sdFs?: number;      // 12/16/32 = FAT, 64 = exFAT
  sdMB?: number;      // grootte van de kaart in MB
  sdBanks?: number;   // bit k = /mmb/banks/kk.mmbs staat erop
  sdBankNames?: string[];  // naam uit de kop van elke bank, op banknummer
  sdTries?: number;   // bij de hoeveelste poging de kaart openging
  sdMs?: number;      // hoe lang openen bij het opstarten duurde
  sdErr?: number;     // SdFat-foutcode van de laatste mislukte poging
  stkOom?: boolean;   // STK-allocatie ooit gefaald → STK-sectie zwijgt
  elementsReady?: boolean;  // Elements-diagnose: DSP-buffers gebonden?
  elementsCpu?: number;     // Elements-diagnose: ISR-aandeel (%)
  elementsPeak?: number;    // Elements-diagnose: hoogste |output| sinds vorige poll
  elementsGate?: boolean;   // Elements-diagnose: ziet de Part een open gate?
  elementsExc?: number;     // Elements-diagnose: exciter-meter (0..1)
  elementsRes?: number;     // Elements-diagnose: resonator-meter (0..1)
  // MI-ports: ready = DSP-buffers gebonden, cpu = ISR-aandeel (%),
  // peak = hoogste |output| sinds vorige poll (0..1).
  ringsReady?: boolean;
  ringsCpu?: number;
  ringsPeak?: number;
  plaitsReady?: boolean;
  plaitsCpu?: number;
  plaitsPeak?: number;
  cloudsReady?: boolean;
  cloudsCpu?: number;
  cloudsPeak?: number;
  tidesOut1?: number;  // momentane out1 van de Tides-slopegenerator
  ts: number;        // editor-tijdstempel van ontvangst
}

interface LinkState {
  status: LinkStatus;
  log: LinkLogEntry[];
  lastAck?: { ok: boolean; applied?: string; err?: string; modules?: number; patches?: number; racks?: number };
  lastStatus?: DeviceStatus;
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
// Telemetrie-polling: loopt zolang de poort open is, los van welke panelen
// zichtbaar zijn — zo kan zowel de modal als de patcher de status tonen.
let statusPollTimer: ReturnType<typeof setInterval> | null = null;

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
    // Niet door disconnect() gestopt → de Teensy is weggevallen.
    if (!readLoopAbort) void lostConnection('leesverbinding verbroken');
  }
}

/**
 * De Teensy viel weg (herstart na flashen, stekker eruit). Opruimen zoals
 * disconnect() dat doet. Zonder dit bleef de schrijver zijn slot houden en
 * bleef de poort "open": de volgende Verbinden kreeg hetzelfde poort-object
 * terug en struikelde over "Cannot create writer when WritableStream is
 * locked" — alleen een herlaad van de pagina hielp dan nog.
 */
async function lostConnection(reason: string): Promise<void> {
  if (!port) return;
  readLoopAbort = true;
  await safeClose();
  setState({ status: { kind: 'disconnected' } });
  pushLog({ ts: Date.now(), dir: 'sys', text: `Teensy weggevallen (${reason}) — opnieuw verbinden kan meteen` });
}

// De browser meldt het zelf als het apparaat verdwijnt; bij flashen gebeurt
// dat al vóór de leesroutine een fout krijgt.
if (typeof navigator !== 'undefined' && navigator.serial) {
  navigator.serial.addEventListener('disconnect', (e) => {
    if (port && e.target === (port as unknown as EventTarget)) void lostConnection('apparaat losgekoppeld of herstart');
  });
}

// Wachten op een specifieke ack (bankPut/bankDelete): de wachters kijken
// mee met elke binnenkomende regel; de eerste die past lost de belofte in.
interface AckWaiter { match: (msg: Record<string, unknown>) => boolean; resolve: (m: Record<string, unknown>) => void;
  reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
const ackWaiters: AckWaiter[] = [];
function waitForAck(match: (msg: Record<string, unknown>) => boolean, timeoutMs: number, what: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const w: AckWaiter = { match, resolve, reject,
      timer: setTimeout(() => { const i = ackWaiters.indexOf(w); if (i >= 0) ackWaiters.splice(i, 1);
        reject(new Error(`${what}: geen antwoord van de Teensy`)); }, timeoutMs) };
    ackWaiters.push(w);
  });
}
let bankProgress: ((bytes: number, size: number) => void) | null = null;

function handleLine(line: string): void {
  // Status-telemetrie komt elke paar seconden binnen tijdens polling — niet
  // in het verkeerslog spuiten, alleen in lastStatus verwerken.
  const isStatus = line.startsWith('{"type":"status"');
  if (!isStatus) pushLog({ ts: Date.now(), dir: 'rx', text: line });
  if (!line.startsWith('{')) return;  // raw printf logs are kept in the log only
  try {
    const msg = JSON.parse(line) as { type?: string; [k: string]: unknown };
    if (msg.type === 'ack') {
      for (let i = 0; i < ackWaiters.length; i++) {
        const w = ackWaiters[i]!;
        if (w.match(msg)) { ackWaiters.splice(i, 1); clearTimeout(w.timer); w.resolve(msg); break; }
      }
    } else if (msg.type === 'bankProgress' && bankProgress) {
      bankProgress(Number(msg.bytes), Number(msg.size));
    }
    switch (msg.type) {
      case 'hello':
        setState({ status: {
          kind:    'connected',
          fw:      typeof msg.fw      === 'string'  ? msg.fw      : undefined,
          version: typeof msg.version === 'string'  ? msg.version : undefined,
          step:    typeof msg.step    === 'number'  ? msg.step    : undefined,
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
      case 'status': {
        const num = (v: unknown): number | undefined => typeof v === 'number' ? v : undefined;
        setState({ lastStatus: {
          cpu:      num(msg.cpu),
          cpuMax:   num(msg.cpuMax),
          mem:      num(msg.mem),
          memMax:   num(msg.memMax),
          memPool:  num(msg.memPool),
          modules:  num(msg.modules),
          retired:  num(msg.retired),
          patch:    typeof msg.patch === 'string' ? msg.patch : undefined,
          loopHz:   num(msg.loopHz),
          uptimeMs: num(msg.uptimeMs),
          heapFree: num(msg.heapFree),
          outPeak:  num(msg.outPeak),
          psramMB:  num(msg.psramMB),
          sdOk:     typeof msg.sdOk === 'boolean' ? msg.sdOk : undefined,
          sdFs:     num(msg.sdFs),
          sdMB:     num(msg.sdMB),
          sdBanks:  num(msg.sdBanks),
          sdBankNames: Array.isArray(msg.sdBankNames) ? msg.sdBankNames.map(String) : undefined,
          sdTries:  num(msg.sdTries),
          sdMs:     num(msg.sdMs),
          sdErr:    num(msg.sdErr),
          stkOom:   typeof msg.stkOom === 'boolean' ? msg.stkOom : undefined,
          elementsReady: typeof msg.elementsReady === 'boolean' ? msg.elementsReady : undefined,
          elementsCpu:   num(msg.elementsCpu),
          elementsPeak:  num(msg.elementsPeak),
          elementsGate:  typeof msg.elementsGate === 'boolean' ? msg.elementsGate : undefined,
          elementsExc:   num(msg.elementsExc),
          elementsRes:   num(msg.elementsRes),
          ringsReady:  typeof msg.ringsReady  === 'boolean' ? msg.ringsReady  : undefined,
          ringsCpu:    num(msg.ringsCpu),
          ringsPeak:   num(msg.ringsPeak),
          plaitsReady: typeof msg.plaitsReady === 'boolean' ? msg.plaitsReady : undefined,
          plaitsCpu:   num(msg.plaitsCpu),
          plaitsPeak:  num(msg.plaitsPeak),
          cloudsReady: typeof msg.cloudsReady === 'boolean' ? msg.cloudsReady : undefined,
          cloudsCpu:   num(msg.cloudsCpu),
          cloudsPeak:  num(msg.cloudsPeak),
          tidesOut1:   num(msg.tidesOut1),
          ts: Date.now(),
        } });
        break;
      }
    }
  } catch {
    // ignore non-JSON lines
  }
}

async function writeLine(s: string, quiet = false): Promise<void> {
  if (!writer) throw new Error('not connected');
  if (!quiet) pushLog({ ts: Date.now(), dir: 'tx', text: s.length > 200 ? s.slice(0, 200) + '…' : s });
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
    // Nog vergrendeld door een verbinding die deze pagina niet meer kent
    // (bijv. na een hot-reload van de editor): dan helpt alleen een herlaad.
    if (port.writable?.locked) {
      throw new Error('De seriële poort is nog vergrendeld door een eerdere verbinding. Herlaad de editor (F5) en verbind opnieuw.');
    }
    writer = port.writable!.getWriter();
    readLoopAbort = false;
    void readLoop();
    pushLog({ ts: Date.now(), dir: 'sys', text: 'serial port opened' });
    // Request a hello so we get firmware version even if we missed the boot one.
    await writeLine(JSON.stringify({ type: 'hello' }));
    // Start telemetrie-polling (2 s) — gestopt in safeClose().
    if (statusPollTimer) clearInterval(statusPollTimer);
    statusPollTimer = setInterval(() => { void sendGetStatus(); }, 2000);
    void sendGetStatus();
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
  if (statusPollTimer) { clearInterval(statusPollTimer); statusPollTimer = null; }
  try { if (reader) await reader.cancel(); } catch { /* ignore */ }
  try { if (writer) { writer.releaseLock(); } } catch { /* ignore */ }
  try { if (port)   await port.close(); } catch { /* ignore */ }
  port = null; writer = null; reader = null; rxBuf = '';
  setState({ lastStatus: undefined });
}

/** De config-payload precies zoals sendConfig hem stuurt (los, voor tools en tests). */
export function buildConfigPayload(project: ModularProject): { json: string; modules: number; patches: number } {
  // Expand poly-groups (×N voices) into the flat per-voice connection list the
  // firmware runs — the brain only ever sees a flat module + connection graph
  // (ADR 0010 §3). Done here, just before serialising, so the editor model
  // keeps its single master-voice cables.
  const flat = flattenProjectForFirmware(project);
  // Build a minimal runtime-only payload — the Teensy only needs enough to
  // instantiate modules and wire the audio graph. Strip ALL visual/design-
  // time fields so the JSON stays well under the 96 KB line buffer.
  //
  // Alleen de ACTIEVE patch gaat mee (het project verzamelt bij elke seed een
  // extra patch + ±100 modules; alles meesturen liet een 16-stemmige comb-
  // patch op 140 KB uitkomen én instantieert dode modules op de Teensy).
  // Patch wisselen = opnieuw pushen; de Push-knop activeert toch al mee.
  const activeId = flat.activePatchId;
  const pushPatches = activeId
    ? flat.patches.filter((p) => p.id === activeId)
    : flat.patches;
  // Modules die de gepushte patches echt raken: alles aan een kabel plus
  // alles in de racks van die patches (voor controlState zonder kabel).
  const usedIds = new Set<string>();
  for (const p of pushPatches) {
    for (const cc of p.connections) { usedIds.add(cc.from.moduleId); usedIds.add(cc.to.moduleId); }
    for (const rid of p.rackIds) {
      flat.racks.find((r) => r.id === rid)?.slots.forEach((s) => usedIds.add(s.moduleId));
    }
  }
  // Control-surface-bindings (ED-CS-1/FW-CS-1): per poly-groep uitgevouwen
  // naar álle stemmen — de firmware kent geen poly-groepen, dus een binding
  // op de master wordt N bindings op dezelfde (ch, cc). De editor-`groups`
  // gaan bewust niet mee (alleen de actieve rijen zijn runtime-relevant).
  const surfacePatch = pushPatches[0];
  const midiBindings = (flat.midiMap?.bindings ?? []).flatMap((b) =>
    (surfacePatch ? polyControlTargets(surfacePatch, flat, b.mod) : [b.mod])
      .map((mod) => ({ ...b, mod })));
  const runtime = {
    version:       flat.version,
    name:          flat.name,
    activePatchId: flat.activePatchId,
    ...(midiBindings.length > 0 ? { midiMap: { bindings: midiBindings } } : {}),
    modules: flat.modules.filter((m) => usedIds.has(m.id)).map((m) => ({
      id:     m.id,
      typeId: m.typeId,
    })),
    // NB: `racks` en kabel-`id`s worden bewust weggelaten — de firmware
    // gebruikt ze niet (AudioGraph/CvGraph lezen alleen from/to) en op een
    // 16-stemmige patch schelen ze samen >10 KB in de 96 KB-lijnbuffer.
    patches: pushPatches.map((p) => ({
      id:      p.id,
      name:    p.name,
      // Firmware `applyPatchVoiceCount()` leest dit veld bij patch-activatie
      // om elke MidiInModule op N stemmen te zetten (poly fan-out pitchK/gateK).
      voiceCount: p.voiceCount,
      rackIds: p.rackIds,
      connections: p.connections.map((c) => ({
        from: c.from,
        to:   c.to,
        ...(c.attenuation !== undefined ? { attenuation: c.attenuation } : {}),
        ...(c.invert      ? { invert: c.invert }       : {}),
      })),
      controlState: p.controlState,
    })),
  };
  const json = JSON.stringify({ type: 'config', project: runtime });
  return { json, modules: runtime.modules.length, patches: runtime.patches.length };
}

export async function sendConfig(project: ModularProject): Promise<void> {
  const { json, modules, patches } = buildConfigPayload(project);
  // Payload-grootte in het log: de firmware-lijnbuffer is 96 KB — bij
  // overschrijding stuurt de firmware een expliciete "line too long"-ack.
  pushLog({ ts: Date.now(), dir: 'sys', text:
    `config payload: ${(json.length / 1024).toFixed(1)} KB — ${modules} modules, ${patches} patch(es)` });
  await writeLine(json);
}

export async function sendSelectPatch(patchId: string): Promise<void> {
  await writeLine(JSON.stringify({ type: 'selectPatch', patchId }));
}

export async function sendSetStatic(enabled: boolean): Promise<void> {
  await writeLine(JSON.stringify({ type: 'setStatic', enabled }));
}

/** Editor MIDI bridge: forward a note event to the Teensy over the serial link.
 *  The firmware dispatches it through the same path as hardware USB-MIDI.
 *  @param on        true = note-on, false = note-off
 *  @param note      MIDI note number 0..127
 *  @param velocity  0..127 (ignored on note-off)
 *  @param channel   0-based MIDI channel (default 0) */
export async function sendMidi(
  on: boolean, note: number, velocity = 100, channel = 0,
): Promise<void> {
  if (!writer) return;  // silently no-op when disconnected
  await writeLine(JSON.stringify({
    type: 'midi', on,
    note: note | 0, vel: velocity | 0, ch: channel | 0,
  }), true);  // quiet: don't flood the log while playing
}

/** Editor MIDI bridge: forward a pitch-bend event to the Teensy over the serial link.
 *  @param value14  14-bit unsigned pitch-bend value (0-16383, 8192 = centre)
 *  @param channel  0-based MIDI channel (default 0) */
export async function sendMidiBend(
  value14: number, channel = 0,
): Promise<void> {
  if (!writer) return;
  await writeLine(JSON.stringify({
    type: 'bend', val: value14 | 0, ch: channel | 0,
  }), true);
}

/** Editor MIDI bridge: forward a control-change (e.g. mod-wheel CC1) to the Teensy.
 *  The firmware dispatches it through the same path as hardware USB-MIDI.
 *  @param controller  CC number 0..127 (1 = mod-wheel)
 *  @param value       0..127
 *  @param channel     0-based MIDI channel (default 0) */
export async function sendMidiCC(
  controller: number, value: number, channel = 0,
): Promise<void> {
  if (!writer) return;
  await writeLine(JSON.stringify({
    type: 'cc', cc: controller | 0, val: value | 0, ch: channel | 0,
  }), true);
}

/** Live control-sync (FW-LIVE-1): push one control value to one module on the
 *  Teensy without a full config re-push. The firmware applies it instantly and
 *  persists it into the active patch, so a later full push is a no-op.
 *  @param moduleId   target module id
 *  @param controlId  control id on that module
 *  @param value      scalar value (boolean / integer / float) */
export async function sendControlPoke(
  moduleId: string, controlId: string, value: boolean | number,
): Promise<void> {
  if (!writer) return;
  await writeLine(JSON.stringify({
    type: 'controlPoke', mod: moduleId, ctrl: controlId, v: value,
  }), true);  // quiet: knob drags emit a stream of these
}

/** Draw-waveshape push (FW-AU-6): send a single-cycle int16 table to a
 *  draw-waveshape oscillator on the Teensy.
 *  @param moduleId  target module id
 *  @param data      sample values, ideally in −32768..32767 (2..256 points) */
export async function sendWaveform(
  moduleId: string, data: number[],
): Promise<void> {
  if (!writer) return;
  await writeLine(JSON.stringify({
    type: 'wavetable', mod: moduleId, data: data.map((x) => x | 0),
  }));
}

/** DX7-bank push (FW-AU-13): één 32-voice bank (4096 bytes packed, dus een
 *  .syx zonder de 8-byte sysex-framing) naar de gedeelde Dx7-bank.
 *  Alle tp_mmb_dx7-instanties herladen hun program bij de volgende note-on. */
export async function sendDx7Bank(bytes: Uint8Array): Promise<void> {
  if (!writer) return;
  if (bytes.length !== 4096) throw new Error(`dx7bank: verwacht 4096 bytes, kreeg ${bytes.length}`);
  await writeLine(JSON.stringify({ type: 'dx7bank', data: Array.from(bytes) }));
}

/** Telemetrie-verzoek: firmware antwoordt met {"type":"status",...} dat in
 *  `lastStatus` belandt (niet in het verkeerslog). Stil no-op indien offline. */
/**
 * Een `.mmbs` naar de SD-kaart van de Teensy, zonder de kaart eruit te halen:
 * `bankPut` opent `/mmb/banks/NN.part`, daarna gaan de bytes ruw over de
 * poort (Web Serial doet de flow control), de Teensy hernoemt en laadt de
 * bank opnieuw als die in gebruik was. Zie TeensyLink.h (pollRaw) voor het
 * protocol. `onProgress` krijgt elke 256 KB een tussenstand.
 */
export async function sendBank(bank: number, bytes: Uint8Array,
                               onProgress?: (bytes: number, size: number) => void): Promise<void> {
  if (!writer) throw new Error('niet verbonden');
  if (bank < 0 || bank > 15) throw new Error('bank 0-15');
  const applied = (m: Record<string, unknown>, phase: string): boolean =>
    m.applied === 'bankPut' && m.phase === phase && Boolean(m.ok);
  const failed = (m: Record<string, unknown>): boolean =>
    m.ok === false && typeof m.err === 'string' && m.err.startsWith('bankPut');
  const begin = waitForAck((m) => applied(m, 'begin') || failed(m), 5000, 'bankPut');
  await writeLine(JSON.stringify({ type: 'bankPut', bank, size: bytes.length }));
  const b = await begin;
  if (b.ok === false) throw new Error(String(b.err));
  bankProgress = onProgress ?? null;
  // Ruim de tijd: 100 KB/s als ondergrens, plus 30 s voor hernoemen en herladen.
  const done = waitForAck((m) => applied(m, 'done') || failed(m), 30_000 + bytes.length / 100, 'bankPut');
  try {
    const CHUNK = 16 * 1024;
    for (let off = 0; off < bytes.length; off += CHUNK) {
      await writer.write(bytes.subarray(off, Math.min(off + CHUNK, bytes.length)));
    }
    pushLog({ ts: Date.now(), dir: 'tx', text: `bankPut: ${(bytes.length / 1024).toFixed(0)} KB verzonden naar bank ${bank}` });
    const d = await done;
    if (d.ok === false) throw new Error(String(d.err));
  } finally {
    bankProgress = null;
  }
  await sendGetStatus();           // banknamen op de kaart verversen
}

export async function sendBankDelete(bank: number): Promise<void> {
  const ack = waitForAck((m) => m.applied === 'bankDelete' || (m.ok === false && String(m.err).startsWith('bankDelete')), 10_000, 'bankDelete');
  await writeLine(JSON.stringify({ type: 'bankDelete', bank }));
  const m = await ack;
  if (m.ok === false) throw new Error(String(m.err));
  await sendGetStatus();
}

export async function sendGetStatus(): Promise<void> {
  if (!writer) return;
  await writeLine(JSON.stringify({ type: 'getStatus' }), true);
}

/** True when a serial writer is currently attached (connected to a Teensy). */
export function isConnected(): boolean {
  return writer !== null;
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
