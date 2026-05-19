// ─────────────────────────────────────────────────────────────────────────
// Modular Music Brain (MMB) — data model v2 (2026-05-19)
//
// v2 introduces the three-layer module model:
//   Category  → ModuleType (template) → Module (concrete realisation)
//                                          ↑
//                                  placed in Rack(s)
//                                          ↑
//                                referenced by Patch (connections + controlState)
//
// The v1 model (single `ModuleDef`) is migrated on import — see
// `migrateProject()` in this file.
// ─────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
//  Cable / signal types
// ═══════════════════════════════════════════════════════════════════════

export type SignalType = 'cv' | 'gate' | 'trigger' | 'audio' | 'midi';

export const SIGNAL_COLOUR: Record<SignalType, string> = {
  cv:      '#2563eb',
  gate:    '#16a34a',
  trigger: '#eab308',
  audio:   '#ea580c',
  midi:    '#9333ea',
};

export const SIGNAL_LABEL: Record<SignalType, string> = {
  cv: 'CV', gate: 'Gate', trigger: 'Trig', audio: 'Audio', midi: 'MIDI',
};

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
  min: number;
  max: number;
  bipolar: boolean;
}

// ═══════════════════════════════════════════════════════════════════════
//  Ports
// ═══════════════════════════════════════════════════════════════════════

export interface Port {
  id: string;
  name: string;
  signalType: SignalType;
  /** in = jack accepts a signal; out = jack drives one. */
  direction: 'in' | 'out';
  range?: CvRange;
}

// ═══════════════════════════════════════════════════════════════════════
//  Controls (knobs, sliders, switches, …) — discriminated union
// ═══════════════════════════════════════════════════════════════════════

export type KnobStyle =
  | 'generic'
  | 'bakelite-pointer'
  | 'mutable-small'
  | 'mutable-large'
  | 'davies-1900h'
  | 'rogan-pointer'
  | 'thonk-d-shaft'
  | 'tube';

export type SliderStyle = 'fader' | 'mini-fader';
export type ButtonStyle = 'momentary' | 'push' | 'led';
export type Taper       = 'lin' | 'log' | 'exp';
export type ControlSize = 'small' | 'medium' | 'large';

export interface KnobControl {
  kind: 'knob';
  id: string;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  taper?: Taper;
  style?: KnobStyle;
  /** Cap colour, e.g. for Mutable Instruments' red/cyan/white system. */
  color?: string;
  size?: ControlSize;
}

export interface SliderControl {
  kind: 'slider';
  id: string;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  orientation: 'v' | 'h';
  lengthMm?: number;
  style?: SliderStyle;
}

export interface ToggleControl {
  kind: 'toggle';
  id: string;
  label: string;
  offLabel?: string;
  onLabel?: string;
  defaultValue: boolean;
}

export interface SwitchControl {
  kind: 'switch';
  id: string;
  label: string;
  positions: string[];
  defaultIndex: number;
  orientation?: 'v' | 'h' | 'rotary';
}

export interface ButtonControl {
  kind: 'button';
  id: string;
  label: string;
  momentary: boolean;
  defaultValue?: boolean;
  style?: ButtonStyle;
}

export interface JoystickControl {
  kind: 'joystick';
  id: string;
  label: string;
  axes: ('x' | 'y')[];
  defaultValue: { x: number; y: number };
}

export interface ExoticControl {
  kind: 'exotic';
  id: string;
  label: string;
  description: string;
  defaultValue: number;
}

export type Control =
  | KnobControl | SliderControl | ToggleControl
  | SwitchControl | ButtonControl | JoystickControl | ExoticControl;

/** Value stored per (module, control) in a patch. Shape depends on kind. */
export type ControlValue = number | boolean | { x: number; y: number };

export function defaultValueOf(c: Control): ControlValue {
  switch (c.kind) {
    case 'knob':
    case 'slider':
    case 'exotic':    return c.defaultValue;
    case 'toggle':    return c.defaultValue;
    case 'switch':    return c.defaultIndex;
    case 'button':    return c.defaultValue ?? false;
    case 'joystick':  return c.defaultValue;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Visual / panel layout — millimetres, top-left origin.
//  1 HP = 5.08 mm; 3U Eurorack = 128.5 mm tall.
// ═══════════════════════════════════════════════════════════════════════

export const MM_PER_HP = 5.08;
export const PANEL_HEIGHT_MM = 128.5;

export type PanelTexture =
  | 'aluminum'
  | 'pcb-black'
  | 'mi-cream'
  | 'gold-plate'
  | 'wood';

export interface PanelDecoration {
  kind: 'rect' | 'line' | 'text' | 'tubeSlot' | 'ledMarker' | 'jackBlock';
  x: number; y: number;
  w?: number; h?: number;
  x2?: number; y2?: number;
  color?: string;
  text?: string;
  fontSize?: number;
}

export interface ControlPlacement {
  x: number;
  y: number;
  rotation?: number;
  sizeOverride?: ControlSize;
}

export interface PortPlacement {
  x: number;
  y: number;
  labelPos?: 'above' | 'below' | 'left' | 'right' | 'none';
}

export interface ModuleVisual {
  hpWidth: number;
  heightMm?: number;
  texture: PanelTexture;
  baseColor?: string;
  decorations?: PanelDecoration[];
  /** Text-only labels (no logos — copyright-safe). */
  texts?: { x: number; y: number; text: string; fontSize?: number; color?: string; align?: 'start' | 'middle' | 'end' }[];
  controlPlacements: Record<string, ControlPlacement>;
  portPlacements:    Record<string, PortPlacement>;
}

// ═══════════════════════════════════════════════════════════════════════
//  Categories (top layer)
// ═══════════════════════════════════════════════════════════════════════

export type ModuleKind =
  | 'vco' | 'vcf' | 'vca' | 'mixer' | 'mult' | 'attenuator' | 'breakout'
  | 'envelope' | 'lfo' | 'midiRouter' | 'sequencer'
  | 'effect' | 'drum' | 'noise' | 'utility'
  | 'custom';

export interface ModuleCategory {
  id: string;
  label: string;
  kind: ModuleKind | string;
  defaultCvRange?: CvRange;
}

// ═══════════════════════════════════════════════════════════════════════
//  ModuleType (middle layer — template)
// ═══════════════════════════════════════════════════════════════════════

export interface ModuleType {
  id: string;
  categoryId: string;
  /** Variant within the category, e.g. "ladder", "AHDSR", "pitch-CV 16-bit". */
  variant: string;
  notes?: string;
  ports: Port[];
  controls: Control[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Module (bottom layer — concrete realisation)
// ═══════════════════════════════════════════════════════════════════════

export interface Module {
  id: string;
  typeId: string;
  /** True = the brain itself implements this (envelopes, LFOs, MIDI router). */
  internal: boolean;
  name: string;
  brand?: string;
  modelNumber?: string;
  /** If present, overrides the type's port set. */
  portsOverride?: Port[];
  controlsOverride?: Control[];
  visual: ModuleVisual;
  notes?: string;
}

export function resolvePorts(mod: Module, types: ModuleType[]): Port[] {
  if (mod.portsOverride) return mod.portsOverride;
  const t = types.find((x) => x.id === mod.typeId);
  return t ? t.ports : [];
}

export function resolveControls(mod: Module, types: ModuleType[]): Control[] {
  if (mod.controlsOverride) return mod.controlsOverride;
  const t = types.find((x) => x.id === mod.typeId);
  return t ? t.controls : [];
}

// ═══════════════════════════════════════════════════════════════════════
//  Rack
// ═══════════════════════════════════════════════════════════════════════

export interface RackSlot {
  id: string;
  moduleId: string;
  row: number;
  hpOffset: number;
}

export interface Rack {
  id: string;
  name: string;
  description?: string;
  rows: number;
  hpPerRow: number;
  slots: RackSlot[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Envelope / LFO shapes (unchanged from v1)
// ═══════════════════════════════════════════════════════════════════════

export type CurveKind =
  | 'linear' | 'exp' | 'log' | 'sCurve'
  | { kind: 'bezier'; c1: number; c2: number };

export interface AhdsrShape {
  kind: 'ahdsr';
  attackMs: number; holdMs: number; decayMs: number;
  sustain: number; releaseMs: number; curve: CurveKind;
}

export interface Phase { value: number; time: number; curve: CurveKind; }

export interface MultiphaseShape {
  kind: 'multiphase';
  phases: Phase[];
  sustainPhase?: number;
}

export interface SampledShape {
  kind: 'sampled';
  sampleRateHz: number;
  variants: number[][];
}

export interface DrawnShape {
  kind: 'drawn';
  points: { t: number; v: number }[];
}

export interface HwEmulationShape {
  kind: 'hwEmulation';
  circuitId: string;
  params: Record<string, number>;
}

export type EnvelopeShape =
  | AhdsrShape | MultiphaseShape | SampledShape | DrawnShape | HwEmulationShape;

export type LfoWave = 'sine' | 'triangle' | 'saw' | 'rsaw' | 'square' | 'pulse';
export interface WaveShape { kind: 'wave'; wave: LfoWave; pwm?: number; }
export type LfoShape = WaveShape | MultiphaseShape | SampledShape | DrawnShape;

export type TriggerSource =
  | { kind: 'midiNote'; channel: number; noteFilter?: { min: number; max: number } }
  | { kind: 'gatePort'; moduleId: string; portId: string }
  | { kind: 'lfo';      lfoId: string; threshold: number }
  | { kind: 'manual' };

export interface EnvelopeInstance {
  id: string; label: string; shape: EnvelopeShape; loop: boolean;
  trigger: TriggerSource;
  outputs: { moduleId: string; portId: string }[];
}

export interface LfoInstance {
  id: string; label: string; shape: LfoShape;
  freqHz: number; startPhase: number; bipolar: boolean;
  running: 'always' | 'gated' | 'oneShot';
  trigger?: TriggerSource;
  outputs: { moduleId: string; portId: string }[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Patch
// ═══════════════════════════════════════════════════════════════════════

export interface PatchConnection {
  id: string;
  from: { moduleId: string; portId: string };
  to:   { moduleId: string; portId: string };
  attenuation?: number;
  invert?: boolean;
}

export interface Patch {
  id: string;
  name: string;
  description?: string;
  voiceCount: number;
  rackId: string;
  connections: PatchConnection[];
  /** Per module: controlId → ControlValue. */
  controlState: Record<string, Record<string, ControlValue>>;
  envelopes: EnvelopeInstance[];
  lfos: LfoInstance[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Top-level project
// ═══════════════════════════════════════════════════════════════════════

export interface ModularProject {
  version: 2;
  name: string;
  description?: string;
  configVersion?: string;

  categories:  ModuleCategory[];
  moduleTypes: ModuleType[];
  modules:     Module[];
  racks:       Rack[];
  patches:     Patch[];

  activeRackId?:  string;
  activePatchId?: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  Seed
// ═══════════════════════════════════════════════════════════════════════

export function defaultCategories(): ModuleCategory[] {
  const cv  = { min: -5, max: 5,  bipolar: true  };
  const uni = { min:  0, max: 10, bipolar: false };
  return [
    { id: 'vco',      label: 'VCO',       kind: 'vco',      defaultCvRange: cv  },
    { id: 'vcf',      label: 'VCF',       kind: 'vcf',      defaultCvRange: cv  },
    { id: 'vca',      label: 'VCA',       kind: 'vca',      defaultCvRange: uni },
    { id: 'mixer',    label: 'Mixer',     kind: 'mixer' },
    { id: 'breakout', label: 'Breakout',  kind: 'breakout' },
    { id: 'envelope', label: 'Envelope',  kind: 'envelope', defaultCvRange: uni },
    { id: 'lfo',      label: 'LFO',       kind: 'lfo',      defaultCvRange: cv  },
    { id: 'sequencer',label: 'Sequencer', kind: 'sequencer' },
    { id: 'drum',     label: 'Drum',      kind: 'drum' },
    { id: 'effect',   label: 'Effect',    kind: 'effect' },
    { id: 'noise',    label: 'Noise/Rand',kind: 'noise' },
    { id: 'utility',  label: 'Utility',   kind: 'utility' },
  ];
}

export function emptyModularProject(): ModularProject {
  return {
    version: 2,
    name: 'ModularMB',
    categories:  defaultCategories(),
    moduleTypes: [],
    modules:     [],
    racks: [{
      id: 'rack_default',
      name: 'Mijn rack',
      rows: 3,
      hpPerRow: 84,
      slots: [],
    }],
    patches: [],
    activeRackId: 'rack_default',
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  Migration: v1 → v2
//
//  v1 had a flat `modules: ModuleDef[]` with `inputs/outputs/params` per
//  module. We map each v1 module to a v2 (ModuleType, Module) pair and
//  place all modules in a default rack. Patch `moduleSettings` becomes
//  `controlState` (param values were always numbers).
// ═══════════════════════════════════════════════════════════════════════

interface V1Param {
  id: string; name: string; min: number; max: number; defaultValue: number;
  unit?: string; preferredView?: 'knob' | 'slider' | 'numeric' | 'toggle';
}
interface V1Port {
  id: string; name: string; signalType: SignalType; range?: CvRange;
}
interface V1ModuleDef {
  id: string; kind: ModuleKind; label: string;
  brand?: string; model?: string;
  inputs: V1Port[]; outputs: V1Port[]; params: V1Param[];
  notes?: string; x?: number; y?: number;
  visual?: unknown;
  externallyControlled?: boolean;
}
interface V1Patch {
  id: string; name: string; description?: string; voiceCount: number;
  connections: PatchConnection[];
  moduleSettings: Record<string, Record<string, number>>;
  envelopes: EnvelopeInstance[]; lfos: LfoInstance[];
}
interface V1Project {
  version: 1;
  name: string; description?: string; configVersion?: string;
  modules: V1ModuleDef[];
  categories: ModuleCategory[];
  patches: V1Patch[];
  activePatchId?: string;
}

function paramToControl(p: V1Param): Control {
  const view = p.preferredView ?? 'knob';
  if (view === 'toggle') {
    return { kind: 'toggle', id: p.id, label: p.name, defaultValue: p.defaultValue > 0 };
  }
  if (view === 'slider') {
    return {
      kind: 'slider', id: p.id, label: p.name,
      min: p.min, max: p.max, defaultValue: p.defaultValue,
      unit: p.unit, orientation: 'v',
    };
  }
  // 'knob' and 'numeric' both render as knob in v2 (numeric is still a view option in widgets).
  return {
    kind: 'knob', id: p.id, label: p.name,
    min: p.min, max: p.max, defaultValue: p.defaultValue,
    unit: p.unit, style: 'generic', size: 'medium',
  };
}

function isV1(p: unknown): p is V1Project {
  return !!p && typeof p === 'object' && (p as { version?: unknown }).version === 1;
}
function isV2(p: unknown): p is ModularProject {
  return !!p && typeof p === 'object' && (p as { version?: unknown }).version === 2;
}

/** Convert a v1 project to v2. Each v1 module becomes one type + one module. */
export function migrateV1toV2(v1: V1Project): ModularProject {
  const moduleTypes: ModuleType[] = [];
  const modules:     Module[]     = [];
  const rackSlots:   RackSlot[]   = [];
  // patch settings: oldModuleId → newModuleId (kept identical for traceability)
  for (let i = 0; i < v1.modules.length; i++) {
    const m = v1.modules[i]!;
    const ports: Port[] = [
      ...m.inputs .map((p) => ({ ...p, direction: 'in'  as const })),
      ...m.outputs.map((p) => ({ ...p, direction: 'out' as const })),
    ];
    const controls = m.params.map(paramToControl);
    const typeId = `type_${m.id}`;
    moduleTypes.push({
      id: typeId,
      categoryId: m.kind,
      variant: `${m.kind} (uit v1)`,
      ports,
      controls,
    });
    // Best-effort visual: empty placement maps; renderer falls back to auto-layout.
    const visual: ModuleVisual = {
      hpWidth: Math.max(4, Math.min(20, controls.length + 4)),
      texture: 'aluminum',
      controlPlacements: {},
      portPlacements:    {},
    };
    modules.push({
      id: m.id,
      typeId,
      internal: m.kind === 'envelope' || m.kind === 'lfo'
             || m.kind === 'midiRouter' || m.kind === 'sequencer',
      name: m.label,
      brand: m.brand,
      modelNumber: m.model,
      notes: m.notes,
      visual,
    });
    // Lay out left-to-right, wrap every 84 HP across 3 rows.
    rackSlots.push({
      id: `slot_${m.id}`,
      moduleId: m.id,
      row: Math.floor((i * 6) / 84),
      hpOffset: (i * 6) % 84,
    });
  }
  const rack: Rack = {
    id: 'rack_default',
    name: 'Mijn rack',
    rows: 3, hpPerRow: 84,
    slots: rackSlots,
  };
  const patches: Patch[] = v1.patches.map((px) => ({
    id: px.id,
    name: px.name,
    description: px.description,
    voiceCount: px.voiceCount,
    rackId: rack.id,
    connections: px.connections,
    controlState: px.moduleSettings,   // numbers are valid ControlValue
    envelopes: px.envelopes,
    lfos: px.lfos,
  }));
  return {
    version: 2,
    name: v1.name,
    description: v1.description,
    configVersion: v1.configVersion,
    categories: v1.categories.length ? v1.categories : defaultCategories(),
    moduleTypes,
    modules,
    racks: [rack],
    patches,
    activeRackId: rack.id,
    activePatchId: v1.activePatchId,
  };
}

/** Accept v1 or v2 JSON and always return a v2 project. */
export function migrateProject(input: unknown): ModularProject | null {
  if (isV2(input)) return input;
  if (isV1(input)) return migrateV1toV2(input);
  return null;
}
