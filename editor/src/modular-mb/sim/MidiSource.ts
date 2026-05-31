// MIDI sources for the simulator.
//
// Drie bronnen implementeren dezelfde `MidiSource`-interface zodat de UI
// ze inwisselbaar kan inhangen:
//
//   1. ScreenKeyboardSource — on-screen toetsenbord (zie SimPanel),
//      óók bestuurbaar via computer-toetsen (A S D F …).
//   2. TestSequenceSource   — speelt een C-majeur arpeggio in lus af
//      zodat je snel kunt horen of er geluid uit komt.
//   3. WebMidiSource        — echte USB/Bluetooth MIDI via de browser
//      (Web MIDI API; werkt in Chrome/Edge/Opera/recente Firefox/Safari).

export type MidiEvent =
  | { kind: 'noteOn';    note: number; velocity: number; }
  | { kind: 'noteOff';   note: number; }
  | { kind: 'cc';        controller: number; value: number; }
  | { kind: 'pitchBend'; value: number; };  // 14-bit 0-16383 (8192 = centre)

export type MidiListener = (e: MidiEvent) => void;

export interface MidiSource {
  readonly id: string;
  readonly label: string;
  start(): Promise<void> | void;
  stop(): void;
  subscribe(fn: MidiListener): () => void;
  /** Optional UI description (e.g. device names for WebMIDI). */
  describe?(): string;
}

abstract class BaseSource implements MidiSource {
  abstract readonly id: string;
  abstract readonly label: string;
  protected listeners = new Set<MidiListener>();
  abstract start(): Promise<void> | void;
  abstract stop(): void;
  subscribe(fn: MidiListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  protected emit(e: MidiEvent): void {
    this.listeners.forEach((fn) => fn(e));
  }
}

// ── 1. Screen keyboard ────────────────────────────────────────────────

/** Houdt enkel state bij — de UI in SimPanel rendert de toetsen.
 *  Computer-toetsen worden hier vertaald naar noten als `start()` actief is. */
export class ScreenKeyboardSource extends BaseSource {
  readonly id = 'screen';
  readonly label = 'On-screen toetsenbord';
  private octave = 4;
  private active = false;
  private down = new Set<number>();

  // A S D F G H J K   →  C D E F G A B C
  // W E . T Y U .      →  C# D# . F# G# A# .
  private static readonly KEYMAP: Record<string, number> = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
  };

  start(): void {
    if (this.active) return;
    this.active = true;
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup',   this.ku);
  }
  stop(): void {
    this.active = false;
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup',   this.ku);
    this.down.forEach((n) => this.emit({ kind: 'noteOff', note: n }));
    this.down.clear();
  }
  setOctave(o: number): void { this.octave = Math.max(0, Math.min(8, o)); }
  getOctave(): number { return this.octave; }

  /** Called by the UI when a key is pressed/released. */
  pressNote(midi: number, velocity = 0.9): void {
    if (this.down.has(midi)) return;
    this.down.add(midi);
    this.emit({ kind: 'noteOn', note: midi, velocity });
  }
  releaseNote(midi: number): void {
    if (!this.down.delete(midi)) return;
    this.emit({ kind: 'noteOff', note: midi });
  }

  private kd = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { this.octave = Math.max(0, this.octave - 1); return; }
    if (k === 'x') { this.octave = Math.min(8, this.octave + 1); return; }
    const off = ScreenKeyboardSource.KEYMAP[k];
    if (off === undefined) return;
    e.preventDefault();
    this.pressNote(this.octave * 12 + 12 + off);
  };
  private ku = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    const off = ScreenKeyboardSource.KEYMAP[k];
    if (off === undefined) return;
    this.releaseNote(this.octave * 12 + 12 + off);
  };
}

// ── 2. Test sequence ──────────────────────────────────────────────────

export class TestSequenceSource extends BaseSource {
  readonly id = 'sequence';
  readonly label = 'Test-sequence (C-majeur arpeggio)';
  private timer: number | null = null;
  private idx = 0;
  private notes = [60, 64, 67, 72, 67, 64];
  private bpm = 120;
  private lastNote: number | null = null;

  start(): void {
    if (this.timer !== null) return;
    const step = (): void => {
      if (this.lastNote !== null) this.emit({ kind: 'noteOff', note: this.lastNote });
      const n = this.notes[this.idx % this.notes.length]!;
      this.emit({ kind: 'noteOn', note: n, velocity: 0.9 });
      this.lastNote = n;
      this.idx++;
    };
    const intervalMs = 60_000 / this.bpm / 2;   // 8th-notes
    this.timer = window.setInterval(step, intervalMs);
    step();
  }
  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.lastNote !== null) {
      this.emit({ kind: 'noteOff', note: this.lastNote });
      this.lastNote = null;
    }
    this.idx = 0;
  }
  setBpm(b: number): void { this.bpm = Math.max(30, Math.min(300, b)); }
  getBpm(): number { return this.bpm; }
}

// ── 3. Web MIDI ───────────────────────────────────────────────────────

export class WebMidiSource extends BaseSource {
  readonly id = 'webmidi';
  readonly label = 'USB / Bluetooth MIDI (Web MIDI)';
  private access: MIDIAccess | null = null;
  private inputs: MIDIInput[] = [];
  /* Notes currently held, keyed by MIDI note number.  Used to de-duplicate
   * events when a controller exposes several input ports (e.g. the KeyStep
   * Pro publishes multiple ports): a single physical key press then arrives
   * once per port.  Without this guard each press allocates two voices on
   * the same pitch, which beats/comb-filters into a hoarse ring-mod sound. */
  private held = new Set<number>();

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  /* The Teensy enumerates its own USB-MIDI port, which the browser sees as an
   * *input*.  We must never listen to it: the firmware would otherwise feed
   * its own output straight back into the bridge, creating a MIDI loop.  Any
   * port whose name/manufacturer mentions Teensy/MusicBrain is skipped. */
  private static isOwnDevicePort(inp: MIDIInput): boolean {
    const hay = `${inp.name ?? ''} ${inp.manufacturer ?? ''}`.toLowerCase();
    return hay.includes('teensy') || hay.includes('musicbrain');
  }

  async start(): Promise<void> {
    if (!WebMidiSource.isSupported()) {
      throw new Error('Web MIDI niet ondersteund in deze browser.');
    }
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.bindInputs();
    this.access.onstatechange = () => this.bindInputs();
  }
  stop(): void {
    for (const inp of this.inputs) inp.onmidimessage = null;
    this.inputs = [];
    this.held.forEach((n) => this.emit({ kind: 'noteOff', note: n }));
    this.held.clear();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
  }
  describe(): string {
    if (!this.access) return 'niet verbonden';
    const names: string[] = [];
    this.access.inputs.forEach((i) => {
      if (!WebMidiSource.isOwnDevicePort(i)) names.push(i.name ?? 'unnamed');
    });
    return names.length ? names.join(', ') : 'geen MIDI-apparaten gevonden';
  }

  private bindInputs(): void {
    if (!this.access) return;
    for (const inp of this.inputs) inp.onmidimessage = null;
    const list: MIDIInput[] = [];
    this.access.inputs.forEach((i) => {
      if (!WebMidiSource.isOwnDevicePort(i)) list.push(i);
    });
    this.inputs = list;
    for (const inp of this.inputs) inp.onmidimessage = this.onMessage;
  }

  private onMessage = (ev: MIDIMessageEvent): void => {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status = data[0]! & 0xf0;
    const d1 = data[1]!;
    const d2 = data[2] ?? 0;
    if (status === 0x90 && d2 > 0) {
      if (this.held.has(d1)) return;          // already sounding — ignore dupe
      this.held.add(d1);
      this.emit({ kind: 'noteOn',  note: d1, velocity: d2 / 127 });
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      if (!this.held.delete(d1)) return;       // not sounding — ignore stray off
      this.emit({ kind: 'noteOff', note: d1 });
    } else if (status === 0xb0) {
      this.emit({ kind: 'cc', controller: d1, value: d2 });
    } else if (status === 0xe0) {
      // Pitch bend: two 7-bit bytes → 14-bit unsigned (LSB first).
      this.emit({ kind: 'pitchBend', value: (d2 << 7) | d1 });
    }
  };
}
