// Het lint (Trautonium-draad) als invoer, zonder React zodat het te testen
// is. De vinger op het lint geeft een traploze toonhoogte; omdat een
// MIDI-ontvanger alleen hele noten kent, wordt die gespeeld als een
// ankernoot plus pitch bend. Komt de vinger verder dan het bendbereik van
// de ankernoot, dan schuift het anker mee (legato: nieuwe noot vóór het
// loslaten van de oude, dus geen nieuwe aanslag in een monofone patch).

/** Maten in eenheden van de viewBox; het lint is één halve toon SEMI breed. */
export const RIBBON_SEMI = 11;          // = een halve toetsbreedte: zelfde schaal als het klavier
export const RIBBON_H = 90;
export const RIBBON_H_TALL = 150;
/** Bendbereiken die het lint kan aannemen (halve tonen; MIDI-IN `bendRange` 1..24). */
export const RIBBON_BENDS = [2, 12, 24] as const;

/** Breedte van een lint over `octaves` octaven (plus de bovenste noot). */
export function ribbonWidth(octaves: number): number {
  return (octaves * 12 + 1) * RIBBON_SEMI;
}

/** Toonhoogte (fractionele MIDI-noot) op plek x; noot `startMidi` ligt in
 *  het midden van het eerste vak. `snap` 0..1 trekt naar de dichtstbijzijnde
 *  halve toon: 0 = traploos, 1 = vaste halve tonen. */
export function pitchAt(x: number, startMidi: number, octaves: number, snap = 0): number {
  const max = octaves * 12;
  let p = x / RIBBON_SEMI - 0.5;
  p = Math.max(0, Math.min(max, p));
  const n = Math.round(p);
  const s = Math.max(0, Math.min(1, snap));
  return startMidi + n + (p - n) * (1 - s);
}

/** Druk uit de hoogte op het lint: laag op het lint is hard (zoals op de
 *  toetsen), 0..127. Een pen of drukgevoelig scherm (pressure ∉ {0, 0,5, 1})
 *  gaat voor. */
export function pressureAt(y: number, h: number, pointerPressure?: number): number {
  const fromY = Math.max(0, Math.min(1, y / h));
  const p = pointerPressure;
  const real = p !== undefined && p > 0 && p !== 0.5 && p !== 1;
  return Math.round(127 * (real ? Math.max(0, Math.min(1, p)) : fromY));
}

/** Aanslag bij het neerzetten: dezelfde hoogte-regel, nooit helemaal 0. */
export function velocityFromPressure(press127: number): number {
  return Math.max(0.15, Math.min(1, press127 / 127));
}

/** Pitch bend (14 bit, 8192 = midden) voor `pitch` ten opzichte van `anchor`
 *  bij een bereik van `range` halve tonen. */
export function bendFor(pitch: number, anchor: number, range: number): number {
  const d = (pitch - anchor) / range;
  return Math.max(0, Math.min(16383, Math.round(8192 + d * 8192)));
}

/** Moet het anker mee? Ja zodra de afstand buiten het bereik valt (met een
 *  halve toon marge, zodat de bend nooit tegen zijn rand aan zit). */
export function needsNewAnchor(pitch: number, anchor: number, range: number): boolean {
  return Math.abs(pitch - anchor) > range - 0.5;
}

/** Stand van de MIDI-IN die het lint nodig heeft: bend in de toonhoogte
 *  (`bendPitch` aan) en een bereik dat bij het lint past. */
export function ribbonReady(bendPitch: unknown, bendRange: unknown, wantRange: number): boolean {
  const on = bendPitch === true || (typeof bendPitch === 'number' && bendPitch >= 0.5);
  return on && typeof bendRange === 'number' && Math.round(bendRange) === wantRange;
}

export interface RibbonCallbacks {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onBend?: (value14: number) => void;
  onAftertouch?: (midi: number, value: number) => void;
}
export interface RibbonConfig { startMidi: number; octaves: number; h: number; bendRange: number; snap: number }

/** De vingers op het lint → MIDI-gebeurtenissen. Monofoon: de nieuwste
 *  vinger speelt; tilt die op terwijl een andere nog ligt, dan neemt die
 *  het over (legato). Puur, zodat het zonder DOM te testen is. */
export class RibbonPlayer {
  private fingers = new Map<number, { x: number; y: number; p?: number }>();
  private anchor: number | null = null;
  private lastPress = 0;
  constructor(private cb: () => RibbonCallbacks, private cfg: () => RibbonConfig) {}

  /** Plek van de spelende vinger (voor de markering), of null. */
  marker(): { x: number; press: number } | null {
    const last = [...this.fingers.values()].pop();
    return last && this.anchor !== null ? { x: last.x, press: this.lastPress } : null;
  }
  down(id: number, x: number, y: number, p?: number): void {
    this.fingers.delete(id);
    this.fingers.set(id, { x, y, p });
    this.play();
  }
  move(id: number, x: number, y: number, p?: number): void {
    const f = this.fingers.get(id);
    if (!f) return;
    f.x = x; f.y = y; f.p = p;
    if ([...this.fingers.keys()].pop() === id) this.play();   // alleen de nieuwste vinger speelt
  }
  up(id: number): void {
    if (!this.fingers.delete(id)) return;
    if (this.fingers.size > 0) this.play();
    else this.stop();
  }
  /** Alles los (paniek, of wisselen naar het klavier). */
  release(): void { this.fingers.clear(); this.stop(); }

  private play(): void {
    const last = [...this.fingers.values()].pop();
    if (!last) return;
    const { startMidi, octaves, h, bendRange, snap } = this.cfg();
    const cb = this.cb();
    const pitch = pitchAt(last.x, startMidi, octaves, snap);
    const press = pressureAt(last.y, h, last.p);
    if (this.anchor === null) {
      const a = Math.round(pitch);
      this.anchor = a;
      cb.onBend?.(bendFor(pitch, a, bendRange));
      cb.onNoteOn(a, velocityFromPressure(press));
    } else if (needsNewAnchor(pitch, this.anchor, bendRange)) {
      // Legato: eerst de nieuwe noot, dan de oude los, zodat de gate blijft.
      const old = this.anchor, a = Math.round(pitch);
      this.anchor = a;
      cb.onBend?.(bendFor(pitch, a, bendRange));
      cb.onNoteOn(a, velocityFromPressure(press));
      cb.onNoteOff(old);
    } else {
      cb.onBend?.(bendFor(pitch, this.anchor, bendRange));
    }
    if (press !== this.lastPress) { this.lastPress = press; cb.onAftertouch?.(this.anchor, press); }
  }
  private stop(): void {
    const a = this.anchor;
    if (a === null) return;
    const cb = this.cb();
    this.anchor = null;
    if (this.lastPress > 0) cb.onAftertouch?.(a, 0);
    this.lastPress = 0;
    cb.onNoteOff(a);
    cb.onBend?.(8192);
  }
}
