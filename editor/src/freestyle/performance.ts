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
import { PERCUSSIONIST_HH_SCALE, STEM_LABEL, STEM_LEVELS, type Change, type Section, type Stem, type Style } from './style';

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
  | { type: 'fill-off' }
  /** Het einde: na de einde-fill stopt de klok. */
  | { type: 'end' }
  /** Autopilot: de variatie van frase `phrase`, gepland op haar "1". */
  | { type: 'auto'; phrase: number }
  /** Autopilot: stems tijdelijk weg (`bars` maten), daarna `auto-unmute`. */
  | { type: 'auto-mute'; stems: Stem[]; bars: number; label: string }
  | { type: 'auto-unmute'; stems: Stem[] };

/** Autopilot (MOCKUP.md §4.5): per frase een kleine variatie op de Grids-
 *  standen van de sectie, in een rondje van vier; in de vierde frase een
 *  fill in de laatste maat. Zo is vier minuten op één sectie niet dood. */
export const AUTO_VARIATIONS: ReadonlyArray<Readonly<Record<string, number>>> = [
  {},
  { hh: 0.1, y: 0.1 },
  {},
  { hh: 0.15, x: 0.1 },
];
export const AUTO_FILL_EVERY = 4;
/** Autopilot-mutes (besluit Mark 2026-10-27): in de derde frase van elke
 *  vier valt de bas de laatste maat weg en komt op de 1 terug; elke achtste
 *  frase begint met twee maten alleen bas en hats. Alleen stems die aan
 *  staan gaan tijdelijk uit; wat de rapper zelf wisselt, blijft zo. */
export interface AutoMute { every: number; phase: number; bar: number; bars: number; stems: Stem[]; label: string }
export const AUTO_MUTES: readonly AutoMute[] = [
  { every: 4, phase: 2, bar: 3, bars: 1, stems: ['bass'], label: 'autopilot · bass out' },
  { every: 8, phase: 7, bar: 0, bars: 2, stems: ['kick', 'snare', 'motif'], label: 'autopilot · breakdown' },
];

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
  private autopilot_ = false;
  /** Variatie van de Autopilot die nu klinkt (index in AUTO_VARIATIONS). */
  private autoVar_ = 0;
  /** Stems die de Autopilot tijdelijk uit heeft gezet. */
  private tempMuted_: Stem[] = [];
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
  get autopilot(): boolean { return this.autopilot_; }
  /** STOP is ingedrukt: de einde-fill loopt, daarna stopt hij. */
  get ending(): boolean { return this.queue.pending().some((x) => x.payload.type === 'end'); }
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
        case 'end': return 'ending — fill, then stop';
        case 'auto': case 'auto-mute': case 'auto-unmute': return '';
      }
    }).filter((s) => s !== '');
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
    this.dropped_ = false; this.fill_ = false; this.autoVar_ = 0; this.tempMuted_ = [];
    this.clock.start(at);
    if (this.autopilot_) this.planAuto(1);
    return {
      at, label: `start · ${this.section.name}`,
      changes: [{ module: 'clock', control: 'run', value: true }, ...this.sectionChanges(0)],
      master: { gain: 1, rampS: DROP_UP_S },
    };
  }

  /** STOP: een einde-fill op de volgende maat, en na die maat stil (de
   *  BeatBuddy-dubbeltik). Nog eens drukken terwijl het einde gewapend
   *  staat: meteen stil. */
  stop(now: number): Fired | null {
    if (!this.clock.isRunning) return null;
    if (this.ending) return this.stopNow(now);
    this.cancelAll('fill-on'); this.cancelAll('fill-off'); this.cancelAll('next'); this.cancelAutoAll();
    const fill = this.queue.arm('bar', { type: 'fill-on' }, now);
    this.queue.armAt(fill.fireBeat + this.clock.unit('bar'), { type: 'end' });
    return null;
  }

  /** Direct stil en de klok uit. */
  stopNow(now: number): Fired {
    this.queue.clear();
    this.clock.stop();
    this.dropped_ = false; this.fill_ = false; this.tempMuted_ = [];
    return { at: now, label: 'stop', changes: [{ module: 'clock', control: 'run', value: false }], master: { gain: 1, rampS: DROP_UP_S } };
  }

  /** Autopilot aan of uit. Aan: plant vanaf de volgende frase; uit: de
   *  sectie-standen meteen terug. */
  setAutopilot(on: boolean, now: number): Fired | null {
    if (on === this.autopilot_) return null;
    this.autopilot_ = on;
    this.cancelAutoAll();
    if (!this.clock.isRunning) return null;
    if (on) {
      const next = this.clock.nextBoundary('phrase', now);
      this.planAuto(Math.round(next / this.clock.unit('phrase')));
      return null;
    }
    this.autoVar_ = 0;
    // De sectie-standen terug, en wat de Autopilot tijdelijk uit had weer aan.
    return { at: now, label: 'autopilot off', changes: [...this.gridsChanges(this.section_), ...this.unmuteChanges()] };
  }
  private cancelAutoAll(): void { this.cancelAll('auto'); this.cancelAll('auto-mute'); this.cancelAll('auto-unmute'); }

  /** Plan de variatie van frase `phrase` op haar "1". */
  private planAuto(phrase: number): void {
    this.queue.armAt(phrase * this.clock.unit('phrase'), { type: 'auto', phrase });
  }

  /** DROP ingedrukt: direct stil (klikvrij), de punchline valt droog. */
  dropDown(now: number): Fired | null {
    // Opnieuw ingedrukt terwijl de terugkeer nog gewapend stond (korte tik,
    // dan vasthouden): die terugkeer vervalt, het blijft stil.
    this.cancelAll('drop-up');
    if (this.dropped_) return null;
    this.dropped_ = true;
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

  /** TAP of ±: nieuw tempo, zonder sprong in de tel; de klokmodule volgt. */
  setBpm(bpm: number, now: number): Fired {
    const v = Math.min(300, Math.max(30, Math.round(bpm * 10) / 10));
    this.clock.setBpm(v, now);
    return { at: now, label: `tempo ${v}`, changes: [{ module: 'clock', control: 'tempo', value: v }] };
  }
  nudgeBpm(delta: number, now: number): Fired { return this.setBpm(this.clock.bpm + delta, now); }

  /** Haal op wat binnen `lookahead` seconden landt en voer het logisch uit;
   *  de pagina plant de wijzigingen op `at`. */
  tick(now: number, lookahead = 0.12): Fired[] {
    if (!this.clock.isRunning) return [];
    const out: Fired[] = [];
    for (const d of this.queue.due(now, lookahead)) {
      const f = this.fire(d.payload, d.at, now);
      if (f) out.push(f);
      if (!this.clock.isRunning) break;     // het einde: wat erna nog klaarstond vervalt
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
        // Een lopende fill, gewapende stem-wissel of tijdelijke Autopilot-mute
        // is met de sectie achterhaald: de sectie zet alle niveaus.
        this.fill_ = false; this.cancelAll('fill-off'); this.cancelAll('stem');
        this.cancelAll('auto-unmute'); this.tempMuted_ = [];
        return { at, label: `→ ${this.section.name}`, changes: this.sectionChanges(p.target) };
      }
      case 'stem': {
        this.stems_ = { ...this.stems_, [p.stem]: p.on };
        return { at, label: `${STEM_LABEL[p.stem]} ${p.on ? 'on' : 'off'}`, changes: levelChanges([p.stem], p.on) };
      }
      case 'fill-on':
        this.fill_ = true;
        this.queue.arm('bar', { type: 'fill-off' }, Math.max(now, at));
        return { at, label: 'fill', changes: this.style.fill };
      case 'fill-off':
        this.fill_ = false;
        return { at, label: 'fill ends', changes: this.gridsChanges(this.section_) };
      case 'end': {
        const f = this.stopNow(at);
        return { ...f, label: 'end' };
      }
      case 'auto': {
        if (!this.autopilot_) return null;
        this.autoVar_ = p.phrase % AUTO_VARIATIONS.length;
        this.planAuto(p.phrase + 1);
        // Fill in de laatste maat van elke vierde frase (niet als er al een loopt).
        if ((p.phrase + 1) % AUTO_FILL_EVERY === 0 && !this.fill_ && !this.queue.pending().some((x) => x.payload.type === 'fill-on')) {
          this.queue.armAt(p.phrase * this.clock.unit('phrase') + (this.clock.meter.barsPerPhrase - 1) * this.clock.unit('bar'), { type: 'fill-on' });
        }
        const changes = this.gridsChanges(this.section_);
        // De tijdelijke mutes van deze frase: op de 1 meteen, anders op hun maat.
        const phraseBeat = p.phrase * this.clock.unit('phrase');
        for (const m of AUTO_MUTES) {
          if (p.phrase % m.every !== m.phase) continue;
          const mute: Pending = { type: 'auto-mute', stems: m.stems, bars: m.bars, label: m.label };
          if (m.bar === 0) changes.push(...this.muteNow(mute, at));
          else this.queue.armAt(phraseBeat + m.bar * this.clock.unit('bar'), mute);
        }
        return changes.length ? { at, label: `autopilot · phrase ${p.phrase + 1}`, changes } : null;
      }
      case 'auto-mute': {
        if (!this.autopilot_) return null;
        const changes = this.muteNow(p, at);
        return changes.length ? { at, label: p.label, changes } : null;
      }
      case 'auto-unmute': {
        const changes = this.unmuteChanges(p.stems);
        return changes.length ? { at, label: 'autopilot · all back', changes } : null;
      }
    }
  }

  /** Zet de stems van een Autopilot-mute uit die nu aan staan, en wapen de
   *  terugkeer na `bars` maten. */
  private muteNow(p: Extract<Pending, { type: 'auto-mute' }>, at: number): Change[] {
    const stems = p.stems.filter((s) => this.stems_[s] && !this.tempMuted_.includes(s));
    if (stems.length === 0) return [];
    this.tempMuted_ = [...this.tempMuted_, ...stems];
    // Elke mute heeft zijn eigen terugkeer: twee mutes kunnen elkaar
    // overlappen (de bas van frase 7 komt terug op de 1 waar de breakdown
    // van frase 8 begint).
    this.queue.armAt(Math.round(this.clock.beatAt(at)) + p.bars * this.clock.unit('bar'), { type: 'auto-unmute', stems });
    return levelChanges(stems, false);
  }
  /** Wat de Autopilot tijdelijk uit had weer aan (standaard alles), voor
   *  zover de rapper het intussen niet zelf uitzette. */
  private unmuteChanges(stems: readonly Stem[] = this.tempMuted_): Change[] {
    const back = this.tempMuted_.filter((s) => stems.includes(s) && this.stems_[s]);
    this.tempMuted_ = this.tempMuted_.filter((s) => !stems.includes(s));
    return levelChanges(back, true);
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
  /** De Grids-standen van een sectie met de correcties van dit moment:
   *  percussionist (hats dunner) en de Autopilot-variatie van deze frase. */
  private withPercussionist(changes: Change[]): Change[] {
    return withGrids(changes, this.autopilot_ ? AUTO_VARIATIONS[this.autoVar_] ?? {} : {}, this.percussionist_);
  }
}

/** De Level-knoppen van een paar stems aan (hun niveau) of uit (0). */
function levelChanges(stems: Stem[], on: boolean): Change[] {
  return stems.flatMap((s) => STEM_LEVELS[s].map((l) => ({ module: l.module, control: l.control, value: on ? l.level : 0 })));
}

/** De Grids-standen met de correcties van dit moment: de Autopilot-variatie
 *  (`vari`) en de percussionist (hats dunner). */
function withGrids(changes: Change[], vari: Readonly<Record<string, number>>, percussionist: boolean): Change[] {
  return changes.map((c) => {
    if (c.module !== 'grids' || typeof c.value !== 'number') return c;
    let v = c.value + (vari[c.control] ?? 0);
    if (c.control === 'hh' && percussionist) v *= PERCUSSIONIST_HH_SCALE;
    v = Math.min(1, Math.max(0, Math.round(v * 1000) / 1000));
    return v === c.value ? c : { ...c, value: v };
  });
}
