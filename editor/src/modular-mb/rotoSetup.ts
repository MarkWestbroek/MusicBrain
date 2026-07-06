// ROTO-SETUP import/export (ED-CS-4) — het setup-bestandsformaat van de
// Melbourne Instruments ROTO-SETUP-app blijkt leesbare JSON (voorbeeld:
// doc/RotoControl/SETUP 01.json). Dit is de enige route naar tekstlabels op
// de Roto-displays: MIDI zelf kan geen namen vervoeren en het live-
// integratieprotocol van Melbourne is gesloten. De editor genereert dus een
// setup-bestand met de labels van de gebonden controls; de gebruiker
// importeert dat in ROTO-SETUP en pusht het naar het apparaat.
//
// Formaat-aannames (afgeleid uit een v1-export van app-versie 3.2.1; er is
// geen publieke spec): controlMode 0 = CC, controlChannel 1-16, controlParam
// = CC-nummer, hapticMode 0 = gewone knob, hapticIndent 255 = uit,
// colorScheme 1 = accentkleur. Bij een nieuwe app-versie: opnieuw een
// export maken en vergelijken.

import type { Control, MidiBinding, ModularProject } from './types';
import { resolveControls } from './types';

// ── Formaat ──────────────────────────────────────────────────────────────

interface RotoKnob {
  controlIndex: number;        // 0-31 (paginas van 8)
  controlMode: number;         // 0 = CC, 1 = NRPN (aanname)
  controlChannel: number;      // 1-16
  controlParam: number;        // CC-nummer
  nrpnAddress: number;
  minValue: number;
  maxValue: number;
  controlName: string;
  colorScheme: number;
  hapticMode: number;
  hapticIndent1: number;
  hapticIndent2: number;
  hapticSteps: number;
  stepNames: string[];
}

export interface RotoSetup {
  version: number;
  type: string;                // "MIDI"
  name: string;
  index: number;
  knobs: RotoKnob[];
  buttons: unknown[];
}

const KNOB_COUNT_MAX = 32;
// Displaynamen op het apparaat zijn kort; conservatief afkappen zodat de
// import in ROTO-SETUP niet struikelt over te lange strings.
const NAME_MAX = 8;

const EMPTY_STEP_NAMES = Array.from({ length: 16 }, () => '');

// ── Export: bindings → setup-bestand ─────────────────────────────────────

function labelFor(p: ModularProject, b: MidiBinding): string {
  const mod = p.modules.find((m) => m.id === b.mod);
  const ctrl: Control | undefined = mod
    ? resolveControls(mod, p.moduleTypes).find((c) => c.id === b.ctrl)
    : undefined;
  const raw = (ctrl && 'label' in ctrl && ctrl.label) || b.ctrl || `cc${b.cc}`;
  return raw.slice(0, NAME_MAX);
}

/** Genereer een ROTO-SETUP-bestand uit de huidige bindings. Volgorde =
 *  rijvolgorde in het paneel; knob-index = rij-index (max 32). */
export function exportRotoSetup(
  p: ModularProject, bindings: MidiBinding[], name: string,
): RotoSetup {
  const knobs: RotoKnob[] = bindings.slice(0, KNOB_COUNT_MAX).map((b, i) => ({
    controlIndex: i,
    controlMode: 0,
    controlChannel: b.ch || 1,      // omni-binding: zet de Roto op kanaal 1
    controlParam: b.cc,
    nrpnAddress: 0,
    minValue: 0,
    maxValue: 127,                   // MMB-schaling gebeurt editor/firmware-kant
    controlName: labelFor(p, b),
    colorScheme: 1,
    hapticMode: 0,
    hapticIndent1: 255,
    hapticIndent2: 255,
    hapticSteps: 0,
    stepNames: [...EMPTY_STEP_NAMES],
  }));
  return { version: 1, type: 'MIDI', name: name.slice(0, 16), index: 0, knobs, buttons: [] };
}

// ── Import: setup-bestand → binding-rijen ────────────────────────────────

/** Lees kanaal + CC uit de knobs van een ROTO-SETUP-export. Alleen CC-mode
 *  knobs (controlMode 0); volgorde = controlIndex. Module/control blijven
 *  leeg — die kiest de gebruiker in het paneel (of via een groep). */
export function importRotoSetup(input: unknown): Pick<MidiBinding, 'ch' | 'cc'>[] | null {
  if (!input || typeof input !== 'object') return null;
  const setup = input as Partial<RotoSetup>;
  if (!Array.isArray(setup.knobs)) return null;
  return setup.knobs
    .filter((k): k is RotoKnob =>
      !!k && typeof k === 'object' &&
      (k as RotoKnob).controlMode === 0 &&
      typeof (k as RotoKnob).controlParam === 'number' &&
      typeof (k as RotoKnob).controlChannel === 'number')
    .sort((a, b) => a.controlIndex - b.controlIndex)
    .map((k) => ({
      ch: Math.max(0, Math.min(16, k.controlChannel)),
      cc: Math.max(0, Math.min(127, k.controlParam)),
    }));
}
