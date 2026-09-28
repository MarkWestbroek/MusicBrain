// midiMonitor — MIDI-OX in de editor.
//
// Twee stromen, zodat je ziet waar het misgaat:
//   'in'    — ruwe bytes van elk MIDI-apparaat dat de browser ziet (eigen
//             MIDIAccess, los van de gekozen sim-bron). Komt hier niets
//             binnen, dan stuurt het apparaat het niet.
//   'patch' — wat de sim-engine echt naar de MIDI-In-modules stuurt
//             (AudioEngine.onMidi). Staat het wel bij 'in' maar niet hier,
//             dan filtert de sim het (bron niet actief, berichttype niet
//             ondersteund).
// De LEDjes op de MIDI-In-poorten lezen de 'patch'-stroom.
//
// `describeMidi` en `formatBytes` zijn zuiver — zie midiMonitor.test.ts.

export type MonDir = 'in' | 'patch';

export interface MonEntry {
  id: number;
  /** performance.now() */
  t: number;
  dir: MonDir;
  /** Apparaatnaam (bij 'in') of 'sim'. */
  src: string;
  bytes: number[];
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** 60 → "C4" (middelste C = C4, zoals de meeste DAW's). */
export function noteName(n: number): string {
  return `${NOTE[n % 12]}${Math.floor(n / 12) - 1}`;
}

const CC_NAMES: Record<number, string> = {
  0: 'Bank MSB', 1: 'Modwheel', 2: 'Breath', 4: 'Foot', 5: 'Portamento', 7: 'Volume', 10: 'Pan', 11: 'Expression',
  32: 'Bank LSB', 64: 'Sustain', 65: 'Portamento aan', 66: 'Sostenuto', 67: 'Soft', 71: 'Resonantie', 74: 'Cutoff',
  120: 'All sound off', 121: 'Reset all', 123: 'All notes off',
};

const SYSTEM: Record<number, string> = {
  0xF0: 'SysEx', 0xF1: 'MTC', 0xF2: 'Song position', 0xF3: 'Song select', 0xF6: 'Tune request', 0xF7: 'SysEx einde',
  0xF8: 'Clock', 0xFA: 'Start', 0xFB: 'Continue', 0xFC: 'Stop', 0xFE: 'Active sensing', 0xFF: 'Reset',
};

export interface MidiDescription {
  /** Korte soortnaam: "Note On", "Aftertouch", "CC", … */
  type: string;
  /** 1..16, of null bij systeemberichten. */
  channel: number | null;
  /** Leesbare inhoud: "C4 vel 100", "Modwheel = 64". */
  text: string;
  /** Realtime-ruis (clock, active sensing) — standaard verborgen. */
  realtime: boolean;
}

export function describeMidi(bytes: readonly number[]): MidiDescription {
  const s = bytes[0] ?? 0, d1 = bytes[1] ?? 0, d2 = bytes[2] ?? 0;
  if (s >= 0xF0) {
    const type = SYSTEM[s] ?? `Systeem ${s.toString(16).toUpperCase()}`;
    return { type, channel: null, text: s === 0xF0 ? `${bytes.length} bytes` : '', realtime: s === 0xF8 || s === 0xFE };
  }
  const ch = (s & 0x0F) + 1;
  switch (s & 0xF0) {
    case 0x90: return d2 > 0
      ? { type: 'Note On', channel: ch, text: `${noteName(d1)} vel ${d2}`, realtime: false }
      : { type: 'Note Off', channel: ch, text: `${noteName(d1)} (vel 0)`, realtime: false };
    case 0x80: return { type: 'Note Off', channel: ch, text: `${noteName(d1)} rel ${d2}`, realtime: false };
    case 0xA0: return { type: 'Poly AT', channel: ch, text: `${noteName(d1)} druk ${d2}`, realtime: false };
    case 0xB0: return { type: 'CC', channel: ch, text: `${d1}${CC_NAMES[d1] ? ` ${CC_NAMES[d1]}` : ''} = ${d2}`, realtime: false };
    case 0xC0: return { type: 'Program', channel: ch, text: `${d1 + 1} (${d1})`, realtime: false };
    case 0xD0: return { type: 'Aftertouch', channel: ch, text: `druk ${d1}`, realtime: false };
    case 0xE0: {
      const v = ((d2 << 7) | d1) - 8192;
      return { type: 'Pitch bend', channel: ch, text: `${v > 0 ? '+' : ''}${v}`, realtime: false };
    }
    default: return { type: '?', channel: null, text: '', realtime: false };
  }
}

export function formatBytes(bytes: readonly number[], hex: boolean): string {
  const shown = bytes.length > 12 ? [...bytes.slice(0, 12)] : bytes;
  const s = shown.map((b) => hex ? b.toString(16).toUpperCase().padStart(2, '0') : String(b).padStart(3, ' ')).join(' ');
  return bytes.length > 12 ? `${s} …` : s;
}

/** Laatste waarde per soort, voor de LEDjes op de MIDI-In-poorten. */
export interface PortActivity {
  noteOn?: { t: number; note: number; vel: number };
  noteOff?: { t: number; note: number; rel: number };
  press?: { t: number; value: number; note?: number };
  bend?: { t: number; value: number };
  cc: Map<number, { t: number; value: number }>;
  held: Set<number>;
}

type EngineLike = { onMidi(fn: (s: number, d1: number, d2: number) => void): () => void };

const MAX = 2000;

export class MidiMonitor {
  private entries: MonEntry[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();
  private engineUnsub: (() => void) | null = null;
  private access: MIDIAccess | null = null;
  private rawStarting: Promise<void> | null = null;
  private bound = new Set<MIDIInput>();
  /** Opent de ruwe stroom een foutmelding (geen Web MIDI, geen toestemming). */
  rawError: string | null = null;
  readonly activity: PortActivity = { cc: new Map(), held: new Set() };
  /** Loopt op bij elke wijziging; handig voor React-selectors. */
  version = 0;

  list(): readonly MonEntry[] { return this.entries; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  clear(): void {
    this.entries = [];
    this.bump();
  }

  push(dir: MonDir, src: string, bytes: number[], t = performance.now()): void {
    this.entries.push({ id: this.nextId++, t, dir, src, bytes });
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX);
    if (dir === 'patch') this.track(bytes, t);
    this.bump();
  }

  private track(b: number[], t: number): void {
    const s = (b[0] ?? 0) & 0xF0, d1 = b[1] ?? 0, d2 = b[2] ?? 0, a = this.activity;
    if (s === 0x90 && d2 > 0) { a.noteOn = { t, note: d1, vel: d2 }; a.held.add(d1); }
    else if (s === 0x80 || s === 0x90) { a.noteOff = { t, note: d1, rel: d2 }; a.held.delete(d1); }
    else if (s === 0xD0) a.press = { t, value: d1 };
    else if (s === 0xA0) a.press = { t, value: d2, note: d1 };
    else if (s === 0xE0) a.bend = { t, value: ((d2 << 7) | d1) - 8192 };
    else if (s === 0xB0) { a.cc.set(d1, { t, value: d2 }); if (d1 === 123 || d1 === 120) a.held.clear(); }
  }

  private bump(): void {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  /** De 'patch'-stroom: eenmalig aanhaken aan de sim-engine. */
  attachEngine(engine: EngineLike): void {
    if (this.engineUnsub) return;
    this.engineUnsub = engine.onMidi((s, d1, d2) => {
      const len = (s & 0xF0) === 0xC0 || (s & 0xF0) === 0xD0 ? 2 : 3;
      this.push('patch', 'sim', len === 2 ? [s, d1] : [s, d1, d2]);
    });
  }

  get rawActive(): boolean { return this.access !== null; }

  /** De 'in'-stroom: eigen MIDIAccess, alle ingangen, inclusief clock. */
  startRaw(): Promise<void> {
    if (this.access) return Promise.resolve();
    if (this.rawStarting) return this.rawStarting;
    this.rawStarting = (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) throw new Error('Web MIDI wordt niet ondersteund in deze browser.');
        this.access = await navigator.requestMIDIAccess({ sysex: false });
        this.rawError = null;
        this.bindAll();
        this.access.addEventListener('statechange', () => this.bindAll());
      } catch (err) {
        this.rawError = err instanceof Error ? err.message : String(err);
      } finally {
        this.rawStarting = null;
        this.bump();
      }
    })();
    return this.rawStarting;
  }

  inputNames(): string[] {
    const names: string[] = [];
    this.access?.inputs.forEach((i) => { if (i.state !== 'disconnected') names.push(i.name ?? '?'); });
    return names;
  }

  private bindAll(): void {
    this.access?.inputs.forEach((inp) => {
      if (this.bound.has(inp)) return;
      this.bound.add(inp);
      inp.addEventListener('midimessage', (ev) => {
        const data = (ev as MIDIMessageEvent).data;
        if (data && data.length) this.push('in', inp.name ?? '?', [...data]);
      });
    });
    this.bump();
  }
}

export const midiMonitor = new MidiMonitor();
