// De bedieningslaag van de freestyle-machine (MOCKUP.md §3, §4.2): DROP,
// NEXT, FILL, stems aan/uit, TAP, start/stop. Niets gebeurt op de flank:
// elke bediening wapent een verandering die op de volgende tel, maat of
// frase landt (ArmQueue). Alleen de DROP omlaag is direct.
//
// Pure TypeScript: dit object kent de engine niet. Het geeft `Fired`-
// pakketjes terug (knopstanden en/of mastergain, met de contexttijd waarop
// ze moeten klinken); de pagina plant ze op die tijd op de AudioEngine.
// Zo is de hele toestandsmachine zonder audio te testen.

import { ArmQueue, BarClock, DEFAULT_METER, type Boundary, type Meter } from './barClock';
import { stemChanges } from './freestylePatch';
import { PERCUSSIONIST_HH_SCALE, STEMS, STEM_LABEL, type Change, type Section, type Stem, type Style } from './style';

export interface Fired {
  /** Contexttijd waarop dit moet klinken. */
  at: number;
  /** Voor het logboek en het scherm. */
  label: string;
  changes: Change[];
  master?: { gain: number; rampS: number };
}

type Pending =
  | { type: 'drop-up' }
  | { type: 'next'; target: number }
  | { type: 'stem'; stem: Stem; on: boolean }
  | { type: 'fill-on' }
  | { type: 'fill-off' };

/** Hoe lang de DROP mag duren om stil te worden, en om terug te komen. */
export const DROP_DOWN_S = 0.005;
export const DROP_UP_S = 0.01;
/** Tijd tussen "start" en de eerste tel: genoeg om de klok aan te zetten. */
export const START_LEAD_S = 0.08;

export class Performance {
  readonly clock: BarClock;
  private queue: ArmQueue<Pending>;
  private section_ = 0;
  private stems_: Record<Stem, boolean>;
  private dropped_ = false;
  private fill_ = false;
  private percussionist_ = false;
  /** Waar de DROP terugkomt: op de tel (standaard) of de maat. */
  dropReturn: Exclude<Boundary, 'now' | 'phrase'> = 'beat';

  constructor(readonly style: Style, meter: Meter = DEFAULT_METER) {
    this.clock = new BarClock(style.bpm, meter);
    this.queue = new ArmQueue<Pending>(this.clock);
    this.stems_ = { ...this.sectionAt(0).stems };
  }

  // ── toestand voor het scherm ─────────────────────────────────────────
  get running(): boolean { return this.clock.isRunning; }
  get sectionIndex(): number { return this.section_; }
  get section(): Section { return this.sectionAt(this.section_); }
  get stems(): Readonly<Record<Stem, boolean>> { return this.stems_; }
  get dropped(): boolean { return this.dropped_; }
  get filling(): boolean { return this.fill_; }
  get percussionist(): boolean { return this.percussionist_; }
  get bpm(): number { return this.clock.bpm; }

  /** Wat er gewapend staat, leesbaar ("→ HOOK on the 1", "HATS off next bar"). */
  pendingLabels(): string[] {
    return this.queue.pending().map((p) => {
      switch (p.payload.type) {
        case 'next': return `→ ${this.sectionAt(p.payload.target).name} on the 1`;
        case 'stem': return `${STEM_LABEL[p.payload.stem]} ${p.payload.on ? 'on' : 'off'} next bar`;
        case 'fill-on': return 'FILL next bar';
        case 'fill-off': return 'fill ends next bar';
        case 'drop-up': return `beat returns on the ${this.dropReturn}`;
      }
    });
  }
  /** De stand van een stem zoals hij wordt ná wat gewapend staat. */
  stemWillBe(stem: Stem): boolean {
    const p = this.queue.pending().find((x) => x.payload.type === 'stem' && x.payload.stem === stem);
    return p && p.payload.type === 'stem' ? p.payload.on : this.stems_[stem];
  }

  // ── bediening ────────────────────────────────────────────────────────
  /** Start: de klok begint even na `now` vers op tel 1 van sectie 1, met de
   *  standen van die sectie. */
  start(now: number): Fired {
    const at = now + START_LEAD_S;
    this.queue.clear();
    this.section_ = 0;
    this.stems_ = { ...this.sectionAt(0).stems };
    this.dropped_ = false; this.fill_ = false;
    this.clock.start(at);
    return {
      at, label: `start · ${this.section.name}`,
      changes: [{ module: 'clock', control: 'run', value: true }, ...this.sectionChanges(0)],
      master: { gain: 1, rampS: DROP_UP_S },
    };
  }

  /** Stop: direct stil en de klok uit. (Een einde-fill komt later.) */
  stop(now: number): Fired {
    this.queue.clear();
    this.clock.stop();
    this.dropped_ = false; this.fill_ = false;
    return { at: now, label: 'stop', changes: [{ module: 'clock', control: 'run', value: false }], master: { gain: 1, rampS: DROP_UP_S } };
  }

  /** DROP ingedrukt: direct stil (klikvrij), de punchline valt droog. */
  dropDown(now: number): Fired | null {
    if (this.dropped_) return null;
    this.dropped_ = true;
    this.cancelAll('drop-up');
    return { at: now, label: 'DROP', changes: [], master: { gain: 0, rampS: DROP_DOWN_S } };
  }

  /** DROP los: de beat komt strak terug op de volgende tel (of maat). */
  dropUp(now: number): void {
    if (!this.dropped_) return;
    this.cancelAll('drop-up');
    this.queue.arm(this.dropReturn, { type: 'drop-up' }, now);
  }

  /** NEXT: de volgende sectie op de "1" van de volgende frase. Nog eens
   *  drukken terwijl hij gewapend staat: nog een sectie verder. */
  next(now: number): void {
    const p = this.queue.pending().find((x) => x.payload.type === 'next');
    const n = this.style.sections.length;
    if (p && p.payload.type === 'next') {
      this.queue.cancel(p.id);
      this.queue.arm('phrase', { type: 'next', target: (p.payload.target + 1) % n }, now);
    } else {
      this.queue.arm('phrase', { type: 'next', target: (this.section_ + 1) % n }, now);
    }
  }

  /** Stem aan/uit op de volgende maat. Stond hij al gewapend: annuleren. */
  toggleStem(stem: Stem, now: number): void {
    const p = this.queue.pending().find((x) => x.payload.type === 'stem' && x.payload.stem === stem);
    if (p) { this.queue.cancel(p.id); return; }
    this.queue.arm('bar', { type: 'stem', stem, on: !this.stems_[stem] }, now);
  }

  /** FILL: op de volgende maat één maat lang de fill-standen, dan terug. */
  fill(now: number): void {
    if (this.fill_ || this.queue.pending().some((x) => x.payload.type === 'fill-on')) return;
    this.queue.arm('bar', { type: 'fill-on' }, now);
  }

  /** Percussionist speelt mee: hats dunner, meteen (geen maatgrens nodig). */
  setPercussionist(on: boolean, now: number): Fired | null {
    if (on === this.percussionist_) return null;
    this.percussionist_ = on;
    return { at: now, label: on ? 'percussionist on' : 'percussionist off', changes: this.gridsChanges(this.section_) };
  }

  /** TAP: nieuw tempo, zonder sprong in de tel; de klokmodule volgt. */
  setBpm(bpm: number, now: number): Fired {
    this.clock.setBpm(bpm, now);
    return { at: now, label: `tempo ${bpm}`, changes: [{ module: 'clock', control: 'tempo', value: bpm }] };
  }

  /** Haal op wat binnen `lookahead` seconden landt en voer het logisch uit;
   *  de pagina plant de wijzigingen op `at`. */
  tick(now: number, lookahead = 0.12): Fired[] {
    if (!this.clock.isRunning) return [];
    const out: Fired[] = [];
    for (const d of this.queue.due(now, lookahead)) {
      const f = this.fire(d.payload, d.at, now);
      if (f) out.push(f);
    }
    return out;
  }

  // ── intern ───────────────────────────────────────────────────────────
  private sectionAt(i: number): Section {
    const s = this.style.sections[i];
    if (!s) throw new Error(`freestyle: sectie ${i} bestaat niet`);
    return s;
  }
  private cancelAll(type: Pending['type']): void {
    for (const p of [...this.queue.pending()]) if (p.payload.type === type) this.queue.cancel(p.id);
  }

  private fire(p: Pending, at: number, now: number): Fired | null {
    switch (p.type) {
      case 'drop-up':
        this.dropped_ = false;
        return { at, label: 'beat back', changes: [], master: { gain: 1, rampS: DROP_UP_S } };
      case 'next': {
        this.section_ = p.target;
        this.stems_ = { ...this.sectionAt(p.target).stems };
        // Een lopende fill of gewapende stem-wissel is met de sectie achterhaald.
        this.fill_ = false; this.cancelAll('fill-off'); this.cancelAll('stem');
        return { at, label: `→ ${this.section.name}`, changes: this.sectionChanges(p.target) };
      }
      case 'stem': {
        this.stems_ = { ...this.stems_, [p.stem]: p.on };
        const only = stemChanges(this.stems_).filter((c) => STEMS.some((s) => s === p.stem && (c.module === 'kick' || c.module === 'bass' ? s === 'kick' : c.module === 'snare' ? s === 'snare' : c.module === 'hat' ? s === 'hats' : s === 'motif')));
        return { at, label: `${STEM_LABEL[p.stem]} ${p.on ? 'on' : 'off'}`, changes: only };
      }
      case 'fill-on':
        this.fill_ = true;
        this.queue.arm('bar', { type: 'fill-off' }, Math.max(now, at));
        return { at, label: 'fill', changes: this.style.fill };
      case 'fill-off':
        this.fill_ = false;
        return { at, label: 'fill ends', changes: this.gridsChanges(this.section_) };
    }
  }

  /** Alle standen van een sectie: haar knoppen (met percussionist-correctie)
   *  en de stem-niveaus. */
  private sectionChanges(i: number): Change[] {
    const s = this.sectionAt(i);
    return [...this.withPercussionist(s.changes), ...stemChanges(s.stems)];
  }
  /** Alleen de Grids-standen van een sectie (na een fill, of percussionist aan/uit). */
  private gridsChanges(i: number): Change[] {
    return this.withPercussionist(this.sectionAt(i).changes.filter((c) => c.module === 'grids'));
  }
  private withPercussionist(changes: Change[]): Change[] {
    if (!this.percussionist_) return changes;
    return changes.map((c) => (c.module === 'grids' && c.control === 'hh' && typeof c.value === 'number'
      ? { ...c, value: Math.round(c.value * PERCUSSIONIST_HH_SCALE * 1000) / 1000 } : c));
  }
}
