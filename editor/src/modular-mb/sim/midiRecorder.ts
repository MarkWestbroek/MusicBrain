// midiRecorder — de MIDI die de simulator speelt meeschrijven naast de WAV.
//
// De engine stuurt alle MIDI (schermklavier, sequencer, Web MIDI) door één
// functie naar de MidiIn-modules; daar hangt een tap aan (AudioEngine.onMidi).
// Tijden zijn milliseconden sinds de start van de opname, gemeten met
// performance.now() direct nadat de audio-tap aangesloten is. Het verschil
// met de audio is een paar ms (één audioblok plus de worklet-hop).
//
// Het bestand is een Standard MIDI File type 0 op 120 BPM met 480 PPQ: dan
// is één tick precies 1/960 s en blijft de tijd exact, ook in een DAW die het
// tempo uit het bestand overneemt.
//
// `encodeSmf()` is zuiver — los te testen onder node, zie midiRecorder.test.ts.

import type { ModularProject, Patch } from '../types';

export interface MidiEvent {
  /** ms sinds de start van de opname. */
  t: number;
  status: number;
  d1: number;
  d2: number;
}

export const SMF_PPQ = 480;
export const SMF_BPM = 120;
const TICKS_PER_MS = (SMF_PPQ * SMF_BPM) / 60_000;   // 0,96

/** Aantal databytes na een statusbyte (kanaalberichten). */
function dataLen(status: number): number {
  const hi = status & 0xF0;
  return hi === 0xC0 || hi === 0xD0 ? 1 : 2;
}

function varLen(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7F];
  while ((v >>= 7) > 0) out.unshift((v & 0x7F) | 0x80);
  return out;
}

/**
 * Standard MIDI File type 0. Alleen kanaalberichten (0x80–0xEF); de rest
 * wordt overgeslagen. `lengthMs` zet het End-of-Track op de lengte van de
 * audio, zodat beide bestanden in een DAW even lang zijn.
 */
export function encodeSmf(events: readonly MidiEvent[], opts: { lengthMs?: number; name?: string } = {}): Uint8Array<ArrayBuffer> {
  const track: number[] = [];
  const meta = (type: number, data: number[]): void => { track.push(0, 0xFF, type, ...varLen(data.length), ...data); };
  if (opts.name) meta(0x03, [...new TextEncoder().encode(opts.name)]);
  const us = Math.round(60_000_000 / SMF_BPM);
  meta(0x51, [(us >> 16) & 0xFF, (us >> 8) & 0xFF, us & 0xFF]);
  meta(0x58, [4, 2, 24, 8]);

  const sorted = events
    .filter((e) => e.status >= 0x80 && e.status < 0xF0)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map((x) => x.e);
  let last = 0;
  for (const e of sorted) {
    const tick = Math.max(last, Math.round(Math.max(0, e.t) * TICKS_PER_MS));
    track.push(...varLen(tick - last), e.status & 0xFF, e.d1 & 0x7F);
    if (dataLen(e.status) === 2) track.push(e.d2 & 0x7F);
    last = tick;
  }
  const endTick = Math.max(last, Math.round((opts.lengthMs ?? 0) * TICKS_PER_MS));
  track.push(...varLen(endTick - last), 0xFF, 0x2F, 0x00);

  const out = new Uint8Array(14 + 8 + track.length);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string): void => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'MThd'); dv.setUint32(4, 6); dv.setUint16(8, 0); dv.setUint16(10, 1); dv.setUint16(12, SMF_PPQ);
  str(14, 'MTrk'); dv.setUint32(18, track.length);
  out.set(track, 22);
  return out;
}

/** Verzamelt MIDI tijdens een opname. */
export class MidiRecorder {
  private events: MidiEvent[] = [];
  private t0 = 0;
  private running = false;

  get active(): boolean { return this.running; }
  get count(): number { return this.events.length; }

  start(now = performance.now()): void {
    this.events = []; this.t0 = now; this.running = true;
  }

  /** Voor AudioEngine.onMidi. */
  readonly record = (status: number, d1: number, d2: number, now = performance.now()): void => {
    if (this.running) this.events.push({ t: now - this.t0, status, d1, d2 });
  };

  /** Stopt en geeft de events terug, met noot-uit voor noten die nog klinken. */
  stop(lengthMs: number): MidiEvent[] {
    this.running = false;
    const held = new Map<number, number>();   // (kanaal<<7|noot) → status-kanaal
    for (const e of this.events) {
      const hi = e.status & 0xF0, key = ((e.status & 0x0F) << 7) | e.d1;
      if (hi === 0x90 && e.d2 > 0) held.set(key, e.status & 0x0F);
      else if (hi === 0x80 || (hi === 0x90 && e.d2 === 0)) held.delete(key);
    }
    const end = Math.max(lengthMs, this.events.at(-1)?.t ?? 0);
    const out = [...this.events];
    for (const [key, ch] of held) out.push({ t: end, status: 0x80 | ch, d1: key & 0x7F, d2: 0 });
    this.events = [];
    return out;
  }
}

/**
 * Het project teruggebracht tot deze ene patch: zijn racks, de modules
 * daarin en de patch zelf. Te laden via Importeren; zo kun je een opname
 * later opnieuw laten klinken met de MIDI.
 */
export function patchSnapshot(project: ModularProject, patch: Patch): ModularProject {
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const ids = new Set(racks.flatMap((r) => r.slots.map((s) => s.moduleId)));
  return {
    ...project,
    racks,
    modules: project.modules.filter((m) => ids.has(m.id) || m.internal),
    patches: [patch],
    activePatchId: patch.id,
    activeRackId: racks[0]?.id ?? project.activeRackId,
  };
}

/** `mmb-x-20260928-101500.wav` → `mmb-x-20260928-101500.mid` (of `.patch.json`). */
export function siblingName(wavName: string, ext: string): string {
  return wavName.replace(/\.wav$/i, '') + ext;
}

export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
