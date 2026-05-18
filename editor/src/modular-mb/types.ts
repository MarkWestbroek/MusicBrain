// ─────────────────────────────────────────────────────────────────────────
// Modular Music Brain (MMB) — data model v0.1
//
// Scope of v0.1:
//   • Modules with typed input/output ports (CV, gate, audio, MIDI)
//   • Patches = named sets of connections + module-parameter values
//   • Envelopes (AHDSR only for v0.1; shape is a discriminated union so
//     multiphase/sampled/drawn/hwEmulation can be added later without
//     breaking existing patch JSON)
//   • LFOs (basic waveforms for v0.1; same extensibility pattern)
//
// JSON format rules:
//   • Every persisted shape carries `kind` so the union can be widened.
//   • Times are in milliseconds, frequencies in Hz, voltages in V (CV).
//   • CV ranges are stored explicitly per port; do not assume ±5 V or 0–10 V.
// ─────────────────────────────────────────────────────────────────────────

export type SignalType = 'cv' | 'gate' | 'trigger' | 'audio' | 'midi';

/** Visual conventions for cables / handles. Kept here next to the type so
 *  Patcher graph view and Matrix view stay in sync. Colours are
 *  intentionally distinct enough to read from a distance. */
export const SIGNAL_COLOUR: Record<SignalType, string> = {
  cv:      '#2563eb', // blue   — continuous voltage
  gate:    '#16a34a', // green  — sustained on/off
  trigger: '#eab308', // yellow — momentary pulse
  audio:   '#ea580c', // orange — audio-rate signal
  midi:    '#9333ea', // purple — MIDI message stream
};

export const SIGNAL_LABEL: Record<SignalType, string> = {
  cv: 'CV', gate: 'Gate', trigger: 'Trig', audio: 'Audio', midi: 'MIDI',
};

/** Which signal types may legally connect from src → dst. A gate output
 *  can drive a CV input (binary 0/+V). A trigger can stand in for a gate.
 *  Audio and MIDI are strict. */
export const SIGNAL_COMPATIBILITY: Record<SignalType, SignalType[]> = {
  cv:      ['cv'],
  gate:    ['gate', 'cv'],
  trigger: ['trigger', 'gate'],
  audio:   ['audio'],
  midi:    ['midi'],
};

export function canConnect(src: SignalType, dst: SignalType): boolean {
  return SIGNAL_COMPATIBILITY[src].includes(dst);
}

export interface CvRange {
  /** Lower bound in volts (or normalised −1..0 for bipolar gates). */
  min: number;
  /** Upper bound in volts. */
  max: number;
  /** True for ±V signals (LFOs, audio); false for unipolar (envelopes, gates). */
  bipolar: boolean;
}

export interface Port {
  id: string;
  name: string;
  signalType: SignalType;
  /** Only meaningful for `cv` (and optionally `audio`). */
  range?: CvRange;
}

/** Knob / setting on a hardware or internal module. */
export interface Param {
  id: string;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  /** How this parameter is preferred to be rendered. The actual editor
   *  may render any of these on top of the same value (MVC); this is
   *  only the *default* view. */
  preferredView?: 'knob' | 'slider' | 'numeric' | 'toggle';
}

/** Optional visual layout for a module on the patcher graph. v0.2 uses
 *  algorithmic port placement (inputs left, outputs right); v0.3 will
 *  let users place handles/knobs freely to mimic the actual front panel. */
export interface ModuleVisual {
  /** Panel width in grid units (1 unit = ~12 px). */
  width?: number;
  /** Panel height in grid units. */
  height?: number;
  /** Panel background colour, e.g. '#fde68a' for a custom hardware module. */
  color?: string;
  /** Manual port placement — if absent, ports are spaced automatically. */
  inputPositions?:  Record<string, { x: number; y: number }>;
  outputPositions?: Record<string, { x: number; y: number }>;
  knobPositions?:   Record<string, { x: number; y: number }>;
}

export type ModuleKind =
  // Analog hardware
  | 'vco' | 'vcf' | 'vca' | 'mixer' | 'mult' | 'attenuator' | 'breakout'
  // Internal / digital (run on the brain itself)
  | 'envelope' | 'lfo' | 'midiRouter' | 'sequencer'
  // Catch-all for user-defined hardware
  | 'custom';

export interface ModuleDef {
  id: string;
  kind: ModuleKind;
  /** Display label, e.g. "VCO-1", "ADSR-A". */
  label: string;
  /** Brand/model of the underlying hardware (optional for internal modules). */
  brand?: string;
  model?: string;
  inputs:  Port[];
  outputs: Port[];
  params:  Param[];
  /** Free-form notes for the musician. */
  notes?: string;
  /** Layout position in the patcher view. */
  x?: number;
  y?: number;
  /** Optional visual layout for the front-panel rendering. */
  visual?: ModuleVisual;
  /** Marks modules that are "passive" in the sense that the brain cannot
   *  control their knobs (e.g. a Eurorack VCO). The patch may still store
   *  recommended knob positions as documentation. */
  externallyControlled?: boolean;
}

// ─── Envelope shapes ─────────────────────────────────────────────────────

export type CurveKind =
  | 'linear' | 'exp' | 'log' | 'sCurve'
  | { kind: 'bezier'; c1: number; c2: number };

export interface AhdsrShape {
  kind: 'ahdsr';
  attackMs:  number;
  holdMs:    number;
  decayMs:   number;
  sustain:   number;  // 0..1
  releaseMs: number;
  /** Curve applied to all transition phases; per-phase override in v0.2. */
  curve: CurveKind;
}

/** Generic multiphase segment used by both envelopes and LFOs. */
export interface Phase {
  /** Target value at end of this phase. For envelopes: 0..1. For LFOs: −1..1. */
  value: number;
  /** Duration of the phase in ms (envelope) or fraction of cycle (LFO 0..1). */
  time: number;
  curve: CurveKind;
}

export interface MultiphaseShape {
  kind: 'multiphase';
  phases: Phase[];
  /** Index of the phase that becomes the sustain hold-point (envelope only). */
  sustainPhase?: number;
}

/** A captured analog-envelope curve. Multiple variants allow interpolation
 *  to retain analog "wobble" between repeats. */
export interface SampledShape {
  kind: 'sampled';
  sampleRateHz: number;
  /** One or more captures of the same envelope shape. */
  variants: number[][];
}

/** Hand-drawn envelope/LFO from a touch or pointer surface. */
export interface DrawnShape {
  kind: 'drawn';
  /** Sorted by t (0..1 for LFO cycle, or absolute ms for envelope). */
  points: { t: number; v: number }[];
}

/** Real-time emulation of a small analog circuit. */
export interface HwEmulationShape {
  kind: 'hwEmulation';
  circuitId: string;
  params: Record<string, number>;
}

export type EnvelopeShape =
  | AhdsrShape | MultiphaseShape | SampledShape | DrawnShape | HwEmulationShape;

export type LfoWave = 'sine' | 'triangle' | 'saw' | 'rsaw' | 'square' | 'pulse';

export interface WaveShape {
  kind: 'wave';
  wave: LfoWave;
  /** Only used for pulse; 0..1. */
  pwm?: number;
}

export type LfoShape = WaveShape | MultiphaseShape | SampledShape | DrawnShape;

// ─── Trigger sources ─────────────────────────────────────────────────────

export type TriggerSource =
  | { kind: 'midiNote'; channel: number; noteFilter?: { min: number; max: number } }
  | { kind: 'gatePort'; moduleId: string; portId: string }
  | { kind: 'lfo';      lfoId: string; threshold: number }
  | { kind: 'manual' };

// ─── Envelope / LFO instances (live on the brain) ────────────────────────

export interface EnvelopeInstance {
  id: string;
  label: string;
  shape: EnvelopeShape;
  loop: boolean;
  trigger: TriggerSource;
  /** Module-port targets this envelope drives. */
  outputs: { moduleId: string; portId: string }[];
}

export interface LfoInstance {
  id: string;
  label: string;
  shape: LfoShape;
  /** Free-running frequency, or one cycle per gate when running !== 'always'. */
  freqHz: number;
  /** Start phase 0..1. */
  startPhase: number;
  bipolar: boolean;
  running: 'always' | 'gated' | 'oneShot';
  trigger?: TriggerSource;  // only for gated / oneShot
  outputs: { moduleId: string; portId: string }[];
}

// ─── Patch (connections + values + envs/LFOs) ────────────────────────────

export interface PatchConnection {
  id: string;
  from: { moduleId: string; portId: string };
  to:   { moduleId: string; portId: string };
  /** 0..1 attenuation; 1 = pass-through. */
  attenuation?: number;
  invert?: boolean;
}

export interface Patch {
  id: string;
  name: string;
  description?: string;
  voiceCount: number;
  connections: PatchConnection[];
  /** Per module: paramId → value. */
  moduleSettings: Record<string, Record<string, number>>;
  envelopes: EnvelopeInstance[];
  lfos: LfoInstance[];
}

// ─── Category configuration ──────────────────────────────────────────────

export interface ModuleCategory {
  id: string;
  label: string;
  kind: ModuleKind;
  /** Default port ranges to pre-fill when adding a module of this kind. */
  defaultCvRange?: CvRange;
}

// ─── Top-level project ───────────────────────────────────────────────────

export interface ModularProject {
  version: 1;
  name: string;
  description?: string;
  configVersion?: string;
  modules: ModuleDef[];
  categories: ModuleCategory[];
  patches: Patch[];
  activePatchId?: string;
}

export function emptyModularProject(): ModularProject {
  return {
    version: 1,
    name: 'ModularMB',
    modules: [],
    categories: [
      { id: 'vco',      label: 'VCO',      kind: 'vco',
        defaultCvRange: { min: -5, max: 5, bipolar: true } },
      { id: 'vcf',      label: 'VCF',      kind: 'vcf',
        defaultCvRange: { min: -5, max: 5, bipolar: true } },
      { id: 'vca',      label: 'VCA',      kind: 'vca',
        defaultCvRange: { min: 0, max: 10, bipolar: false } },
      { id: 'mixer',    label: 'Mixer',    kind: 'mixer' },
      { id: 'breakout', label: 'Breakout', kind: 'breakout' },
      { id: 'envelope', label: 'Envelope', kind: 'envelope',
        defaultCvRange: { min: 0, max: 10, bipolar: false } },
      { id: 'lfo',      label: 'LFO',      kind: 'lfo',
        defaultCvRange: { min: -5, max: 5, bipolar: true } },
    ],
    patches: [],
  };
}
