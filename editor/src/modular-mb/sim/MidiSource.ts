// MIDI sources for the simulator.
//
// Drie bronnen implementeren dezelfde `MidiSource`-interface zodat de UI
// ze inwisselbaar kan inhangen:
//
//   1. ScreenKeyboardSource — on-screen toetsenbord (zie SimPanel),
//      óók bestuurbaar via computer-toetsen (A S D F …).
//   2. TestSequenceSource   — speelt een patroon in lus af zodat je snel
//      kunt horen of er geluid uit komt: een arpeggio (één noot tegelijk)
//      of een akkoord, om een PolyGroup met meer stemmen tegelijk te voeden.
//   3. WebMidiSource        — echte USB/Bluetooth MIDI via de browser
//      (Web MIDI API; werkt in Chrome/Edge/Opera/recente Firefox/Safari).

export type MidiEvent =
  | { kind: 'noteOn';    note: number; velocity: number; }
  | { kind: 'noteOff';   note: number; release?: number; }   // release-velocity 0..1 (0x80 d2), weg = niet gemeld
  | { kind: 'cc';        controller: number; value: number; }
  | { kind: 'pitchBend'; value: number; }   // 14-bit 0-16383 (8192 = centre)
  | { kind: 'pressure';  value: number; }   // channel aftertouch (0xD0), 0..127
  | { kind: 'polyPressure'; note: number; value: number; }   // per toets (0xA0), 0..127
  | { kind: 'program';   program: number; };  // program change (0xC0), 0..127 — kiest een patch (ED-RC-8)

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

  /** Tikt de gebruiker in een tekstveld, dan is 'a' een letter — geen noot. */
  private static isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t?.isContentEditable;
  }

  private kd = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ScreenKeyboardSource.isTyping(e)) return;
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

/** Welk patroon de test-sequence speelt. */
export type SequencePattern = 'arp' | 'build' | 'chords';

/** De opbouw van het achtstemmige stapel-akkoord: C E G B D F♯ A C. */
const STACK = [60, 64, 67, 71, 74, 78, 81, 84];

/**
 * De patronen, als lijst van stappen. Eén stap = de noten die tijdens die
 * stap moeten klínken (dus niet "aanslaan"): wat in de volgende stap nog
 * staat blijft liggen, de rest gaat uit. Zo beschrijft dezelfde vorm een
 * arpeggio (één noot per stap) én een akkoord dat zich opbouwt.
 */
export const SEQUENCE_PATTERNS: readonly {
  id: SequencePattern; label: string; hint: string; steps: readonly (readonly number[])[];
  /** Staplengte als veelvoud van een achtste. */
  stepFactor?: number;
  /** `piano` = aanslag per noot verschilt, zoals een pianist een akkoord zet. */
  touch?: 'flat' | 'piano';
}[] = [
  {
    id: 'arp',
    label: 'Arpeggio (C majeur)',
    hint: 'C–E–G–C–G–E, één noot tegelijk — de monofone testtoon.',
    steps: [[60], [64], [67], [72], [67], [64]],
  },
  {
    id: 'build',
    label: 'Opbouwend akkoord (×8)',
    hint: 'Stapelt C E G B D F♯ A C op tot acht klinkende noten, houdt het '
        + 'akkoord vast en laat dan los. Meer stemmen dan een kleine PolyGroup '
        + 'heeft, dus je hoort ook of voice-stealing klopt.',
    steps: [...STACK.map((_, i) => STACK.slice(0, i + 1)), STACK, STACK, STACK, []],
  },
  {
    id: 'chords',
    label: 'Akkoorden (Cmaj7 · Am7 · Fmaj7 · G7)',
    hint: 'Vier noten tegelijk, één akkoord per hele noot. Gemeenschappelijke '
        + 'tonen blijven staan tussen de akkoorden, dus alleen de wisselende '
        + 'stemmen hertriggeren — en de aanslag verschilt per noot.',
    steps: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 65]],
    stepFactor: 8,
    touch: 'piano',
  },
];

export class TestSequenceSource extends BaseSource {
  readonly id = 'sequence';
  readonly label = 'Test-sequence (arpeggio / akkoorden)';
  private timer: number | null = null;
  private offTimer: number | null = null;
  private idx = 0;
  private bpm = 120;
  private pattern: SequencePattern = 'arp';
  /** Noten die nu klinken — meer dan één zodra je een akkoord speelt. */
  private held = new Set<number>();
  /** Deel van de stap waarin een wegvallende noot nog hoog staat. */
  private static readonly GATE_RATIO = 0.7;

  start(): void {
    if (this.timer !== null) return;
    const def = this.def();
    const intervalMs = 60_000 / this.bpm / 2 * (def.stepFactor ?? 1);   // 8th-notes × factor
    // Stilte vóór de volgende stap. Bij korte stappen is dat een deel van de
    // stap, bij lange akkoorden houden we het op een ruime honderdste seconde
    // — anders staat er een halve seconde niets tussen twee akkoorden.
    const gapMs = Math.min(intervalMs * (1 - TestSequenceSource.GATE_RATIO), 120);
    const step = (): void => {
      const steps = this.steps();
      const first = this.idx % steps.length === 0;   // eerste akkoord van de lus
      const cur  = steps[this.idx % steps.length]!;
      const next = steps[(this.idx + 1) % steps.length]!;
      this.idx++;
      // Alles wat niet in deze stap staat hoort niet meer te klinken; wat er
      // al ligt blijft liggen (geen hertrigger van een gehouden akkoordnoot).
      for (const n of [...this.held]) if (!cur.includes(n)) this.release(n);
      for (const n of cur) {
        this.press(n, def.touch === 'piano' ? this.velocityFor(cur, n, first) : 0.9);
      }
      // Noten die in de vólgende stap wegvallen gaan nú al uit, op GATE_RATIO
      // van de stap. Zonder die pauze vallen deze noteOff en de noteOn van de
      // volgende stap in hetzelfde audioblok: de stemtoewijzer geeft de net
      // vrijgekomen stem meteen weer uit, die ziet dus nooit een dalende flank
      // op zijn gate en een wasm-stem hertriggert dan niet. De SEQ-module doet
      // hetzelfde met zijn gateRatio.
      const stopping = cur.filter((n) => !next.includes(n));
      if (stopping.length > 0) {
        this.offTimer = window.setTimeout(() => {
          this.offTimer = null;
          for (const n of stopping) this.release(n);
        }, intervalMs - gapMs);
      }
    };
    this.timer = window.setInterval(step, intervalMs);
    step();
  }
  stop(): void {
    this.clearTimers();
    this.releaseAll();
    this.idx = 0;
  }
  setBpm(b: number): void {
    this.bpm = Math.max(30, Math.min(300, b));
    // Loopt hij al, dan moet het nieuwe tempo meteen gelden: interval opnieuw
    // opzetten zonder de lus te herstarten (idx blijft staan).
    if (this.timer !== null) { this.clearTimers(); this.start(); }
  }
  getBpm(): number { return this.bpm; }
  /** Patroonwissel begint bij stap 1 — met een schone lei, geen hangers. */
  setPattern(p: SequencePattern): void {
    if (p === this.pattern) return;
    this.pattern = p;
    this.idx = 0;
    if (this.offTimer !== null) { window.clearTimeout(this.offTimer); this.offTimer = null; }
    this.releaseAll();
  }
  getPattern(): SequencePattern { return this.pattern; }

  private def(): typeof SEQUENCE_PATTERNS[number] {
    return SEQUENCE_PATTERNS.find((p) => p.id === this.pattern) ?? SEQUENCE_PATTERNS[0]!;
  }
  private steps(): readonly (readonly number[])[] { return this.def().steps; }
  /**
   * Aanslag zoals een pianist een akkoord zet: bas en bovenstem dragen, de
   * vulling eronder blijft zachter, het eerste akkoord van de lus krijgt een
   * accent, en elke noot wat spreiding. Met overal dezelfde velocity klinkt
   * een akkoordenreeks als een orgel dat aan- en uitgaat.
   */
  private velocityFor(chord: readonly number[], note: number, first: boolean): number {
    let lo = Infinity, hi = -Infinity;
    for (const n of chord) { if (n < lo) lo = n; if (n > hi) hi = n; }
    const outer = note === lo || note === hi;
    const base = (outer ? 0.80 : 0.62) + (first ? 0.08 : 0);
    const spread = (Math.random() - 0.5) * 0.08;
    return Math.max(0.15, Math.min(1, base + spread));
  }
  private clearTimers(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.offTimer !== null) { window.clearTimeout(this.offTimer); this.offTimer = null; }
  }
  private press(midi: number, velocity: number): void {
    if (this.held.has(midi)) return;
    this.held.add(midi);
    this.emit({ kind: 'noteOn', note: midi, velocity });
  }
  private release(midi: number): void {
    if (!this.held.delete(midi)) return;
    this.emit({ kind: 'noteOff', note: midi });
  }
  private releaseAll(): void {
    for (const n of [...this.held]) this.release(n);
  }
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
      // Echte note-off (0x80) draagt de release-velocity; 0 = niet gemeld.
      this.emit(status === 0x80 && d2 > 0 ? { kind: 'noteOff', note: d1, release: d2 / 127 }
                                           : { kind: 'noteOff', note: d1 });
    } else if (status === 0xd0) {
      this.emit({ kind: 'pressure', value: d1 });
    } else if (status === 0xa0) {
      this.emit({ kind: 'polyPressure', note: d1, value: d2 });
    } else if (status === 0xb0) {
      this.emit({ kind: 'cc', controller: d1, value: d2 });
    } else if (status === 0xc0) {
      this.emit({ kind: 'program', program: d1 });
    } else if (status === 0xe0) {
      // Pitch bend: two 7-bit bytes → 14-bit unsigned (LSB first).
      this.emit({ kind: 'pitchBend', value: (d2 << 7) | d1 });
    }
  };
}
