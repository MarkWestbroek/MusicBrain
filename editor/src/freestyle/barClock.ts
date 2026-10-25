// Maatklok voor de freestyle-machine (spinoffs/freestyle-machine/MOCKUP.md
// §6): tel, maat en frase op de klok van de AudioContext, en een wachtrij
// van gewapende acties die op de volgende tel, maat of frase landen.
//
// Pure TypeScript, geen audio: de pagina geeft de contexttijd (seconden)
// door. De klok rekent in *tellen*: een gewapende actie onthoudt op welke
// absolute tel hij landt, niet op welke tijd. Verandert het tempo (TAP),
// dan verschuift de tijd van die tel mee en blijft de actie op de "1".

/** Waar een actie landt. `now` = direct (de DROP omlaag). */
export type Boundary = 'now' | 'beat' | 'bar' | 'phrase';

export interface Meter { beatsPerBar: number; barsPerPhrase: number }
export const DEFAULT_METER: Meter = { beatsPerBar: 4, barsPerPhrase: 4 };

export interface Position {
  /** Absolute tel sinds start, met fractie; vóór de start 0. */
  absBeat: number;
  /** Tel in de maat, 0-based. */
  beat: number;
  /** Maat in de frase, 0-based. */
  bar: number;
  /** Frase sinds start, 0-based. */
  phrase: number;
  /** Fractie binnen de tel, 0..1. */
  frac: number;
}

export class BarClock {
  /** Contexttijd waarop tel `originBeat` valt; samen het ankerpunt. */
  private origin = 0;
  private originBeat = 0;
  private running = false;

  constructor(private bpm_: number, readonly meter: Meter = DEFAULT_METER) {}

  get bpm(): number { return this.bpm_; }
  get isRunning(): boolean { return this.running; }

  /** Tel 0 valt op contexttijd `at`. */
  start(at: number): void { this.origin = at; this.originBeat = 0; this.running = true; }
  stop(): void { this.running = false; }

  /** Nieuw tempo zonder sprong: de tel die op `at` klinkt blijft dezelfde,
   *  alleen de tellen daarna komen sneller of trager. */
  setBpm(bpm: number, at: number): void {
    this.originBeat = this.beatAt(at);
    this.origin = at;
    this.bpm_ = bpm;
  }

  beatAt(t: number): number { return this.originBeat + ((t - this.origin) * this.bpm_) / 60; }
  timeOfBeat(absBeat: number): number { return this.origin + ((absBeat - this.originBeat) * 60) / this.bpm_; }

  position(t: number): Position {
    const b = Math.max(0, this.beatAt(t));
    const { beatsPerBar: bpb, barsPerPhrase: bpp } = this.meter;
    const whole = Math.floor(b);
    return {
      absBeat: b,
      beat: whole % bpb,
      bar: Math.floor(whole / bpb) % bpp,
      phrase: Math.floor(whole / (bpb * bpp)),
      frac: b - whole,
    };
  }

  /** Lengte van een grens in tellen. */
  unit(kind: Exclude<Boundary, 'now'>): number {
    const { beatsPerBar: bpb, barsPerPhrase: bpp } = this.meter;
    return kind === 'beat' ? 1 : kind === 'bar' ? bpb : bpb * bpp;
  }

  /** De eerstvolgende grens van deze soort strikt ná `t + minLead`, als
   *  absolute tel. Vóór de start is dat tel 0: wie vóór het begin wapent,
   *  landt op de start. */
  nextBoundary(kind: Boundary, t: number, minLead = 0): number {
    if (kind === 'now') return this.beatAt(t);
    const u = this.unit(kind);
    const b = this.beatAt(t + minLead);
    if (b < 0) return 0;
    return (Math.floor(b / u) + 1) * u;
  }
}

export interface Armed<T> {
  id: number;
  kind: Boundary;
  /** Absolute tel waarop hij landt. */
  fireBeat: number;
  payload: T;
}

/** Gewapende acties, per tel. `due()` haalt eruit wat binnen de lookahead
 *  landt; de aanroeper plant het dan op de exacte tijd. */
export class ArmQueue<T> {
  private items: Armed<T>[] = [];
  private seq = 0;

  constructor(private readonly clock: BarClock) {}

  /** Wapen `payload` voor de volgende grens. `minLead`: een grens die al
   *  binnen zoveel seconden valt wordt overgeslagen (het bericht naar de
   *  worklet kost een blok; een grens over 2 ms haal je niet meer). */
  arm(kind: Boundary, payload: T, now: number, minLead = 0.03): Armed<T> {
    const fireBeat = this.clock.nextBoundary(kind, now, kind === 'now' ? 0 : minLead);
    const item: Armed<T> = { id: ++this.seq, kind, fireBeat, payload };
    this.items.push(item);
    this.items.sort((a, b) => a.fireBeat - b.fireBeat || a.id - b.id);
    return item;
  }

  cancel(id: number): boolean {
    const n = this.items.length;
    this.items = this.items.filter((x) => x.id !== id);
    return this.items.length !== n;
  }

  /** Alles wat binnen `lookahead` seconden landt, in volgorde, mét de
   *  contexttijd (`at`); de items gaan uit de wachtrij. */
  due(now: number, lookahead: number): Array<Armed<T> & { at: number }> {
    const out: Array<Armed<T> & { at: number }> = [];
    const keep: Armed<T>[] = [];
    for (const it of this.items) {
      const at = this.clock.timeOfBeat(it.fireBeat);
      if (at <= now + lookahead) out.push({ ...it, at: Math.max(at, now) });
      else keep.push(it);
    }
    this.items = keep;
    return out;
  }

  pending(): readonly Armed<T>[] { return this.items; }
  clear(): void { this.items = []; }
}
