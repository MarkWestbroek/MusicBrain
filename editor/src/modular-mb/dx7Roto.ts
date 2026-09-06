// dx7Roto — de DX7-patcheditor op de Roto-Control.
//
// 155 parameters achter acht knoppen. De verdeling volgt hoe je aan een DX7
// werkt: je kiest een operator en draait dan aan *zijn* parameters, dus de
// zes operatorknoppen zitten op de buttons en de acht encoders tonen steeds
// de gekozen operator. Vier pagina's (de Roto heeft er vier van acht):
//
//   1  toon        level, mode, coarse, fine, detune, velocity, rate-scaling, amp-mod
//   2  envelope    R1 R2 R3 R4 · L1 L2 L3 L4
//   3  globaal     algoritme, feedback, transpose, LFO
//   4  toetsschaal breakpoint, links/rechts diepte en curve, pitch-mod, osc-sync
//
// Waardebereik: elke knob krijgt in het setup-bestand zijn *eigen* maximum
// (`maxValue`), dus de Roto stuurt 0..99 voor een level en 0..31 voor het
// algoritme, en zijn display toont het getal dat ook in de editor staat. Geen
// herschaling, geen afrondingsdrift.
//
// Kanaal 16 is van deze editor. De bindings van het Surface-paneel gebruiken
// kanaal 1; door de editor apart te zetten kunnen beide tegelijk aanstaan.
import { DX7, opOffset, LFO_WAVES, CURVES } from './dx7Patch';

export const DX7_ROTO_CHANNEL = 16;
/** Eerste CC van de 32 encoders; de buttons volgen erna. */
const KNOB_CC0 = 20;
const BUTTON_CC0 = 52;

export interface RotoParam {
  /** ≤ 8 tekens — dat is wat op het Roto-display past. */
  label: string;
  /** Byte in de uitgepakte patch; per-operator parameters zijn een functie. */
  at: number | ((uiOp: number) => number);
  max: number;
  /** Schakelaar: namen per stand, geeft de Roto klikjes en tekst. */
  steps?: readonly string[];
}

export interface RotoPage { name: string; params: RotoParam[] }

const op = (rel: number) => (uiOp: number): number => opOffset(uiOp) + rel;

export const DX7_ROTO_PAGES: RotoPage[] = [
  {
    name: 'toon',
    params: [
      { label: 'Level',   at: op(DX7.op.outputLevel), max: 99 },
      { label: 'Mode',    at: op(DX7.op.oscMode),     max: 1, steps: ['ratio', 'vast'] },
      { label: 'Coarse',  at: op(DX7.op.freqCoarse),  max: 31 },
      { label: 'Fine',    at: op(DX7.op.freqFine),    max: 99 },
      { label: 'Detune',  at: op(DX7.op.detune),      max: 14 },
      { label: 'Veloc',   at: op(DX7.op.velSens),     max: 7 },
      { label: 'RateScl', at: op(DX7.op.rateScaling), max: 7 },
      { label: 'AmpMod',  at: op(DX7.op.ampModSens),  max: 3 },
    ],
  },
  {
    name: 'envelope',
    params: [
      { label: 'R1', at: op(DX7.op.rate + 0),  max: 99 },
      { label: 'R2', at: op(DX7.op.rate + 1),  max: 99 },
      { label: 'R3', at: op(DX7.op.rate + 2),  max: 99 },
      { label: 'R4', at: op(DX7.op.rate + 3),  max: 99 },
      { label: 'L1', at: op(DX7.op.level + 0), max: 99 },
      { label: 'L2', at: op(DX7.op.level + 1), max: 99 },
      { label: 'L3', at: op(DX7.op.level + 2), max: 99 },
      { label: 'L4', at: op(DX7.op.level + 3), max: 99 },
    ],
  },
  {
    name: 'globaal',
    params: [
      { label: 'Algo',   at: DX7.algorithm, max: 31 },
      { label: 'Feedbk', at: DX7.feedback,  max: 7 },
      { label: 'Transp', at: DX7.transpose, max: 48 },
      { label: 'LfoGolf', at: DX7.lfoWave,  max: 5, steps: LFO_WAVES },
      { label: 'LfoSpd', at: DX7.lfoSpeed,  max: 99 },
      { label: 'LfoDly', at: DX7.lfoDelay,  max: 99 },
      { label: 'LfoPMD', at: DX7.lfoPmd,    max: 99 },
      { label: 'LfoAMD', at: DX7.lfoAmd,    max: 99 },
    ],
  },
  {
    name: 'toetsschaal',
    params: [
      { label: 'BrkPt',  at: op(DX7.op.breakPoint), max: 99 },
      { label: 'LDepth', at: op(DX7.op.leftDepth),  max: 99 },
      { label: 'RDepth', at: op(DX7.op.rightDepth), max: 99 },
      { label: 'LCurve', at: op(DX7.op.leftCurve),  max: 3, steps: CURVES },
      { label: 'RCurve', at: op(DX7.op.rightCurve), max: 3, steps: CURVES },
      { label: 'PitchMS', at: DX7.pitchModSens,     max: 7 },
      { label: 'OscSync', at: DX7.oscSync,          max: 1, steps: ['uit', 'aan'] },
      { label: 'LfoSync', at: DX7.lfoSync,          max: 1, steps: ['uit', 'aan'] },
    ],
  },
];

/** Buttons: zes om de operator te kiezen, twee voor de patch zelf. */
export type RotoButtonAction =
  | { kind: 'selectOp'; op: number }
  | { kind: 'bankVoice' }
  | { kind: 'nextVoice' };

export const DX7_ROTO_BUTTONS: { label: string; action: RotoButtonAction }[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: `OP${n}`, action: { kind: 'selectOp' as const, op: n } })),
  { label: 'BANK',  action: { kind: 'bankVoice' } },
  { label: 'VOICE', action: { kind: 'nextVoice' } },
];

export const knobCc   = (page: number, slot: number): number => KNOB_CC0 + page * 8 + slot;
export const buttonCc = (index: number): number => BUTTON_CC0 + index;

/** Byte-offset van een parameter voor de gekozen operator. */
export function paramOffset(p: RotoParam, uiOp: number): number {
  return typeof p.at === 'function' ? p.at(uiOp) : p.at;
}

/** CC → parameter. `null` als deze CC niet van ons is. */
export function paramForCc(cc: number): { page: number; slot: number; param: RotoParam } | null {
  const i = cc - KNOB_CC0;
  if (i < 0 || i >= 32) return null;
  const page = Math.floor(i / 8), slot = i % 8;
  const param = DX7_ROTO_PAGES[page]?.params[slot];
  return param ? { page, slot, param } : null;
}

/** CC → button-actie, of `null`. */
export function buttonForCc(cc: number): RotoButtonAction | null {
  const i = cc - BUTTON_CC0;
  return DX7_ROTO_BUTTONS[i]?.action ?? null;
}

/** Alle knob-standen voor de gekozen operator, om de ringen mee te laten
 *  draaien na het laden van een voice of het wisselen van operator. */
export function rotoFeedback(patch: Uint8Array, uiOp: number): { cc: number; val: number }[] {
  const out: { cc: number; val: number }[] = [];
  DX7_ROTO_PAGES.forEach((pg, page) => {
    pg.params.forEach((param, slot) => {
      out.push({ cc: knobCc(page, slot), val: patch[paramOffset(param, uiOp)] ?? 0 });
    });
  });
  return out;
}

// ── ROTO-SETUP-bestand ───────────────────────────────────────────────────
// Zelfde formaat als rotoSetup.ts (v1-export van ROTO-SETUP 3.2.1). Dit is de
// enige weg naar tekstlabels op de displays: MIDI vervoert geen namen.

const EMPTY_STEP_NAMES = Array.from({ length: 16 }, () => '');

interface SetupKnob {
  controlIndex: number; controlMode: number; controlChannel: number;
  controlParam: number; nrpnAddress: number; minValue: number; maxValue: number;
  controlName: string; colorScheme: number; hapticMode: number;
  hapticIndent1: number; hapticIndent2: number; hapticSteps: number;
  stepNames: string[];
}
interface SetupButton extends Omit<SetupKnob, 'hapticIndent1' | 'hapticIndent2'> {
  ledOnColor: number; ledOffColor: number;
}

export interface Dx7RotoSetup {
  version: number; type: string; name: string; index: number;
  knobs: SetupKnob[]; buttons: SetupButton[];
}

const stepNames = (p: RotoParam): string[] => {
  if (!p.steps) return [...EMPTY_STEP_NAMES];
  const names = p.steps.slice(0, 16).map((s) => s.slice(0, 8));
  return [...names, ...EMPTY_STEP_NAMES].slice(0, 16);
};

/**
 * Genereer het setup-bestand. Per pagina een andere accentkleur, zodat je aan
 * de ring ziet in welke pagina je zit; schakelaars krijgen klikjes
 * (`hapticSteps`) en hun standnamen op het display.
 */
export function exportDx7RotoSetup(name = 'MMB DX7'): Dx7RotoSetup {
  const knobs: SetupKnob[] = [];
  DX7_ROTO_PAGES.forEach((pg, page) => {
    pg.params.forEach((param, slot) => {
      knobs.push({
        controlIndex: page * 8 + slot,
        controlMode: 0,                       // 0 = CC
        controlChannel: DX7_ROTO_CHANNEL,
        controlParam: knobCc(page, slot),
        nrpnAddress: 0,
        minValue: 0,
        maxValue: param.max,                  // de Roto stuurt de échte waarde
        controlName: param.label.slice(0, 8),
        colorScheme: page + 1,
        hapticMode: param.steps ? 1 : 0,
        hapticIndent1: 255, hapticIndent2: 255,
        hapticSteps: param.steps ? param.steps.length : 0,
        stepNames: stepNames(param),
      });
    });
  });
  const buttons: SetupButton[] = DX7_ROTO_BUTTONS.map((b, i) => ({
    controlIndex: i,
    controlMode: 0,
    controlChannel: DX7_ROTO_CHANNEL,
    controlParam: buttonCc(i),
    nrpnAddress: 65535,
    minValue: 0,
    maxValue: 127,
    controlName: b.label,
    colorScheme: 1,
    ledOnColor: 14,
    ledOffColor: 70,
    hapticMode: 0,
    hapticSteps: 0,
    stepNames: [...EMPTY_STEP_NAMES],
  }));
  return { version: 1, type: 'MIDI', name: name.slice(0, 16), index: 0, knobs, buttons };
}
