// Taper — de som tussen een gebaar (pixel, muiswiel, CC-stap) en een waarde.
//
// Een knop met een lineair bereik verdeelt zijn resolutie gelijk over Hz, maar
// het oor hoort verhoudingen. Cutoff loopt van 20 tot 18000 Hz; met 120 px voor
// de hele slag is één pixel 150 Hz, en dat is bij 300 Hz zeven halve tonen —
// daar hoor je de knop trappen. Met een log-taper is één pixel overal dezelfde
// verhouding, en dan bepaalt alleen nog de sleepweg hoe fijn het is.
//
// Drie curves, en ze staan op drie plekken hetzelfde:
//   'lin'  v = min + (max−min)·t
//   'log'  v = min·(max/min)^t          constante verhouding; vereist min > 0
//   'exp'  v = min + (max−min)·t²       de "audio taper" van een volumeknop
// Dezelfde formules zitten in `surfaceBridge.ts` (Roto/CC → waarde) en in de
// firmware (`MidiMap::scale`). Lopen die uit de pas, dan voelt dezelfde
// Roto-knop op de Teensy anders dan in de simulator.

import type { Taper } from './types';

export interface TaperRange {
  min: number;
  max: number;
  taper?: Taper;
  /** Control-id en eenheid, voor de afleiding hieronder. Een KnobControl past
   *  hier zo in; een MIDI-binding draagt alleen zijn eigen `curve`. */
  id?: string;
  unit?: string;
}

/**
 * De curve die bij deze control hoort als er geen expliciete `taper` op staat.
 *
 * Afgeleid in plaats van opgeslagen, en wel hierom: een project bewaart zijn
 * eigen kopie van de moduletypes. Zou de taper alleen uit die kopie komen,
 * dan bleef een bestaande patch lineair tot je de types opnieuw seedde — en
 * dan staat de cutoffknop dus nog steeds na één pixel op 200 Hz.
 *
 * Frequenties en tijden horen op verhoudingen: van 300 naar 400 Hz is bijna
 * een kwart, van 10000 naar 10100 Hz hoor je niets. Volume net zo: het oor
 * hoort dB's, dus een volumeknop krijgt de kwadratische "audio taper" van een
 * analoge pot.
 */
export function derivedTaper(r: TaperRange): Taper | undefined {
  if ((r.unit === 'Hz' || r.unit === 'ms' || r.unit === 's') && r.min > 0 && r.max > r.min) {
    return 'log';
  }
  if (r.id && /^(level|vol\d*|volume|gain|master)$/.test(r.id)
      && r.min >= 0 && r.max <= 1.0001) {
    return 'exp';
  }
  return undefined;
}

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * De curve die echt gebruikt kan worden. 'log' heeft een bereik nodig dat
 * helemaal boven nul ligt; een verkeerd getagde control (level 0…1, een
 * bipolaire fine-knop) valt stil terug op lineair in plaats van NaN te geven.
 */
export function effectiveTaper(r: TaperRange): Taper {
  const t = r.taper ?? derivedTaper(r) ?? 'lin';
  if (t === 'log' && !(r.min > 0 && r.max > r.min)) return 'lin';
  return t;
}

/** Knoppositie 0…1 → waarde. `t` buiten 0…1 wordt geklemd. */
export function fromTaper(t: number, r: TaperRange): number {
  const u = clamp01(t);
  switch (effectiveTaper(r)) {
    case 'log': return r.min * Math.pow(r.max / r.min, u);
    case 'exp': return r.min + (r.max - r.min) * u * u;
    default:    return r.min + (r.max - r.min) * u;
  }
}

/** Waarde → knoppositie 0…1. */
export function toTaper(v: number, r: TaperRange): number {
  switch (effectiveTaper(r)) {
    case 'log':
      if (!(v > 0)) return 0;
      return clamp01(Math.log(v / r.min) / Math.log(r.max / r.min));
    case 'exp': {
      const span = r.max - r.min;
      return span === 0 ? 0 : clamp01(Math.sqrt(clamp01((v - r.min) / span)));
    }
    default: {
      const span = r.max - r.min;
      return span === 0 ? 0 : clamp01((v - r.min) / span);
    }
  }
}

/** Hoeveel octaven overspant een log-bereik? 0 voor de andere curves. */
export function taperOctaves(r: TaperRange): number {
  return effectiveTaper(r) === 'log' ? Math.log2(r.max / r.min) : 0;
}

/** Sleepweg voor de hele slag, in pixels (zonder de fijn-modifier). */
export const KNOB_TRAVEL_PX = 120;
/** Zo lang is een octaaf onder je muis bij een log-knop. */
export const PX_PER_OCTAVE = 48;
/** Shift = een kwart van de snelheid, dus vier keer zo lange weg. */
export const FINE_FACTOR = 4;
/** Wieltje: zoveel pixels deltaY telt als één klik (trackpads sturen minder). */
export const WHEEL_NOTCH_PX = 40;

/**
 * Hoeveel de knop opschuift per klik van het wiel, gemeten in knoppositie.
 *
 * Op een log-knop is dat precies een halve toon — twaalf klikjes is een
 * octaaf, en dat is te onthouden terwijl je luistert. Procentueel rekenen
 * werkt daar niet: 1/300 van de slag is op een cutoff nog geen halve halve
 * toon, en dan tel je honderd klikjes van 20 naar 200 Hz. De rest houdt de
 * gebruikelijke honderd klikjes over de hele slag.
 */
export function wheelStep(r: TaperRange, fine = false): number {
  const oct = taperOctaves(r);
  const base = oct > 0 ? (1 / 12) / oct : 1 / 100;
  return base * (fine ? 1 / FINE_FACTOR : 1);
}

/**
 * De sleepweg van deze control. Lineaire en exp-knoppen houden de weg die ze
 * altijd hadden; een log-knop krijgt een vaste hoeveelheid pixels per octaaf,
 * zodat een filter over zijn hele bereik even fijn stelt (48 px/oct ≈ een
 * kwart halve toon per pixel) en een korter bereik niet onnodig ver sleept.
 */
export function dragTravelPx(r: TaperRange): number {
  const oct = taperOctaves(r);
  if (oct <= 0) return KNOB_TRAVEL_PX;
  return Math.min(720, Math.max(240, Math.round(PX_PER_OCTAVE * oct)));
}
