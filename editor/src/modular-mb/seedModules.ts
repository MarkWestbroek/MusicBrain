// Voorbeeld-modules — handmatig gemodelleerd op basis van foto's van de
// eigenlijke modules. Geen logo's: alleen tekstlabels (copyright-veilig).
// Coördinaten in millimeter, top-left = (0,0).
//
// 6 modules:
//   1. Hexinverter Mutant Snare        12 HP  PCB-zwart + oranje accenten
//   2. Mutable Instruments Elements    34 HP  mi-cream, kleurcode wit/roze/cyaan
//   3. Mutable Instruments Shelves+Exp  16 HP  EQ-filter incl. expander-jacks
//   4. Analogue Systems RS-110 MkII    10 HP  aluminium multimode-filter
//   5. Erica Synths Fusion VCO         22 HP  PCB-zwart met 2 buizen
//   6. Malekko Richter Oscillator II    8 HP  aluminium dual-VCO
//
// Aanroep via "✨ Voorbeelden" in de project-balk.

import {
  type ModularProject, type ModuleType, type ModuleInstance, type RackSlot,
  type Rack, type Patch, type PatchConnection, type ControlValue,
  type ModuleRole, type CellGroup, type PolyGroup,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';
import { uid } from './store';
import { DX7_VOICE_NAMES } from './dx7BankNames';

// ── helpers ────────────────────────────────────────────────────────────

const W = (hp: number) => hp * MM_PER_HP;

function knob(id: string, label: string, x: number, y: number,
              opts: Partial<{ min: number; max: number; def: number; size: 'small'|'medium'|'large'; color: string; style: string; unit: string;
                              step: number; ticks: { every?: number; highlight?: number[] } }> = {}) {
  return {
    control: {
      kind: 'knob' as const, id, label,
      min: opts.min ?? 0, max: opts.max ?? 10, defaultValue: opts.def ?? 5,
      size: (opts.size ?? 'medium') as 'small'|'medium'|'large',
      color: opts.color, style: (opts.style as never) ?? 'generic',
      unit: opts.unit,
      ...(opts.step !== undefined ? { step: opts.step } : {}),
      ticks: opts.ticks,
    },
    placement: { x, y },
  };
}
function inPort(id: string, name: string, signal: 'cv'|'gate'|'trigger'|'audio'|'midi', x: number, y: number,
                opts: Partial<{ cellGroupId: string }> = {}) {
  return {
    port: {
      id, name, signalType: signal, direction: 'in' as const,
      ...(opts.cellGroupId ? { cellGroupId: opts.cellGroupId } : {}),
    },
    placement: { x, y, labelPos: 'below' as const },
  };
}
function outPort(id: string, name: string, signal: 'cv'|'gate'|'trigger'|'audio'|'midi', x: number, y: number,
                 opts: Partial<{ eventKind: 'voice' | 'global'; cellGroupId: string }> = {}) {
  return {
    port: {
      id, name, signalType: signal, direction: 'out' as const,
      ...(opts.eventKind ? { eventKind: opts.eventKind } : {}),
      ...(opts.cellGroupId ? { cellGroupId: opts.cellGroupId } : {}),
    },
    placement: { x, y, labelPos: 'below' as const },
  };
}
function toggle(id: string, label: string, x: number, y: number, def = false) {
  return { control: { kind: 'toggle' as const, id, label, defaultValue: def }, placement: { x, y } };
}
function sw(id: string, label: string, x: number, y: number, positions: string[], defaultIndex = 0) {
  return { control: { kind: 'switch' as const, id, label, positions, defaultIndex }, placement: { x, y } };
}
function button(id: string, label: string, x: number, y: number) {
  return { control: { kind: 'button' as const, id, label, momentary: true }, placement: { x, y } };
}
function slider(id: string, label: string, x: number, y: number,
                opts: Partial<{ min: number; max: number; def: number; lengthMm: number; unit: string; orientation: 'v'|'h' }> = {}) {
  return {
    control: {
      kind: 'slider' as const, id, label,
      min: opts.min ?? 0, max: opts.max ?? 1, defaultValue: opts.def ?? 0,
      orientation: (opts.orientation ?? 'v') as 'v'|'h',
      lengthMm: opts.lengthMm ?? 35,
      unit: opts.unit,
      style: 'mini-fader' as const,
    },
    placement: { x, y },
  };
}
function display(id: string, x: number, y: number,
                 opts: Partial<{ label: string; digits: number; style: 'led'|'oled'|'led-green'; bindTo: string;
                                 bindTo2: string; lookup: string[][];
                                 format: 'int'|'float1'|'float2'|'midi'|'onoff'; text: string;
                                 size: 'small'|'medium'|'large' }> = {}) {
  return {
    control: {
      kind: 'display' as const, id,
      label: opts.label,
      digits: opts.digits ?? 4,
      style: opts.style ?? 'led',
      bindTo: opts.bindTo,
      format: opts.format,
      text: opts.text,
      size: opts.size,
    },
    placement: { x, y },
  };
}
function led(id: string, x: number, y: number,
             opts: Partial<{ label: string; color: string; size: 'small'|'medium'|'large'; bindTo: string; bindMatch: number }> = {}) {
  return {
    control: {
      kind: 'led' as const, id,
      label: opts.label,
      color: opts.color,
      size: opts.size ?? 'medium',
      bindTo: opts.bindTo,
      bindMatch: opts.bindMatch,
    },
    placement: { x, y },
  };
}

type Spec = ReturnType<typeof knob | typeof inPort | typeof outPort | typeof toggle | typeof sw | typeof button | typeof slider | typeof display | typeof led>;

function assemble(spec: {
  typeId: string;
  categoryId: string;
  variant: string;
  brand: string;
  model: string;
  hp: number;
  texture: 'aluminum'|'pcb-black'|'mi-cream'|'gold-plate'|'wood';
  baseColor?: string;
  texts: { x: number; y: number; text: string; fontSize?: number; color?: string; align?: 'start'|'middle'|'end' }[];
  decorations?: { kind: 'rect'|'line'|'text'|'tubeSlot'|'ledMarker'|'jackBlock'; x: number; y: number; w?: number; h?: number; x2?: number; y2?: number; color?: string; text?: string; fontSize?: number }[];
  items: Spec[];
  notes?: string;
  internal?: boolean;
  simulatedBy?: string;
  simulationControlMap?: Record<string, string>;
  role?: ModuleRole;
  cellGroups?: CellGroup[];
}): { type: ModuleType; module: ModuleInstance } {
  const controls = spec.items.filter((s): s is Extract<Spec, { control: unknown }> => 'control' in s).map((s) => s.control);
  const ports    = spec.items.filter((s): s is Extract<Spec, { port: unknown }>    => 'port'    in s).map((s) => s.port);
  const controlPlacements: Record<string, { x: number; y: number }> = {};
  const portPlacements:    Record<string, { x: number; y: number; labelPos?: 'above'|'below'|'left'|'right'|'none' }> = {};
  for (const s of spec.items) {
    if ('control' in s) controlPlacements[s.control.id] = s.placement;
    if ('port'    in s) portPlacements   [s.port.id]    = s.placement;
  }
  const type: ModuleType = {
    id: spec.typeId,
    categoryId: spec.categoryId,
    variant: spec.variant,
    ports, controls,
    notes: spec.notes,
    ...(spec.internal ? { internal: true } : {}),
    ...(spec.simulatedBy ? { simulatedBy: spec.simulatedBy } : {}),
    ...(spec.simulationControlMap ? { simulationControlMap: spec.simulationControlMap } : {}),
    ...(spec.role ? { role: spec.role } : {}),
    ...(spec.cellGroups ? { cellGroups: spec.cellGroups } : {}),
  };
  const module: ModuleInstance = {
    id: uid('mod'),
    typeId: spec.typeId,
    internal: spec.internal ?? false,
    name: `${spec.brand} ${spec.model}`,
    brand: spec.brand,
    modelNumber: spec.model,
    visual: {
      hpWidth: spec.hp,
      heightMm: PANEL_HEIGHT_MM,
      texture: spec.texture,
      baseColor: spec.baseColor,
      texts: spec.texts,
      decorations: spec.decorations,
      controlPlacements,
      portPlacements,
    },
  };
  return { type, module };
}

// ───────────────────────────────────────────────────────────────────────
// 1. Hexinverter Mutant Snare — 12 HP, PCB-zwart, oranje accenten
// ───────────────────────────────────────────────────────────────────────

function mutantSnare() {
  const w = W(12);
  const cx = w / 2;
  return assemble({
    typeId: 'tp_mutant_snare',
    categoryId: 'drum',
    variant: 'Analog snare-drum voice',
    brand: 'Hexinverter',
    model: 'Mutant Snare',
    hp: 12,
    texture: 'pcb-black',
    baseColor: '#0a0a0a',
    texts: [
      { x: cx, y: 6, text: 'Mutant Snare', fontSize: 3.2, color: '#e5e7eb', align: 'middle' },
      // rij 1
      { x: w*0.18, y: 32, text: 'SHELL TONE', fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
      { x: cx,     y: 32, text: 'DRIVE',      fontSize: 1.8, color: '#fff7ed', align: 'middle' },
      { x: w*0.82, y: 32, text: 'SHELL PITCH',fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
      // rij 2
      { x: w*0.18, y: 58, text: 'DECAY',      fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
      { x: cx,     y: 58, text: 'MIX',        fontSize: 1.8, color: '#fff7ed', align: 'middle' },
      { x: w*0.82, y: 58, text: 'CUTOFF',     fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
      // rij 3 (cv attenuators + snappy)
      { x: w*0.18, y: 78, text: 'CV',         fontSize: 1.6, color: '#fb923c', align: 'middle' },
      { x: cx,     y: 78, text: 'SNAPPY',     fontSize: 1.6, color: '#fb923c', align: 'middle' },
      { x: w*0.82, y: 78, text: 'CV',         fontSize: 1.6, color: '#fb923c', align: 'middle' },
      // mode + res
      { x: w*0.30, y: 92, text: 'MODE',       fontSize: 1.6, color: '#fb923c', align: 'middle' },
      { x: w*0.70, y: 92, text: 'RES',        fontSize: 1.6, color: '#e5e7eb', align: 'middle' },
      // jacks
      { x: w*0.18, y: 112, text: 'TRIG',      fontSize: 1.6, color: '#94a3b8', align: 'middle' },
      { x: w*0.38, y: 112, text: 'ACC',       fontSize: 1.6, color: '#94a3b8', align: 'middle' },
      { x: w*0.62, y: 112, text: 'EXT IN',    fontSize: 1.6, color: '#94a3b8', align: 'middle' },
      { x: w*0.82, y: 112, text: 'OUT',       fontSize: 1.6, color: '#fff7ed', align: 'middle' },
      { x: cx, y: 124, text: 'HEXINVERTER',   fontSize: 1.8, color: '#94a3b8', align: 'middle' },
    ],
    decorations: [
      // oranje vlek achter Drive en Mix
      { kind: 'rect', x: cx-6, y: 13, w: 12, h: 50, color: '#ea580c' },
      // dunne lijn onder controls
      { kind: 'rect', x: 3, y: 100, w: w-6, h: 0.4, color: '#475569' },
    ],
    items: [
      knob('shell_tone',  'Shell Tone',  w*0.18, 22, { size: 'medium' }),
      knob('drive',       'Drive',       cx,     22, { size: 'large', color: '#0a0a0a' }),
      knob('shell_pitch', 'Shell Pitch', w*0.82, 22, { size: 'medium' }),
      knob('decay',       'Decay',       w*0.18, 48, { size: 'medium' }),
      knob('mix',         'Mix',         cx,     48, { size: 'large', color: '#0a0a0a' }),
      knob('cutoff',      'Cutoff',      w*0.82, 48, { size: 'medium' }),
      knob('cv1_atten',   'CV Atten',    w*0.18, 72, { size: 'small' }),
      knob('snappy',      'Snappy',      cx,     72, { size: 'small' }),
      knob('cv2_atten',   'CV Atten',    w*0.82, 72, { size: 'small' }),
      sw  ('mode',        'Mode',        w*0.30, 88, ['HP', 'BP'], 0),
      knob('res',         'Resonance',   w*0.70, 88, { size: 'small' }),

      inPort ('trig',   'Trig',   'trigger', w*0.18, 106),
      inPort ('accent', 'Accent', 'cv',      w*0.38, 106),
      inPort ('ext_in', 'Ext In', 'audio',   w*0.62, 106),
      outPort('out',    'Out',    'audio',   w*0.82, 106),
    ],
    notes: 'Analoge snare-drum-voice met aparte shell- en snappy-secties + EXT-in voor 808/909-cymbal-truc.',
  });
}

// ───────────────────────────────────────────────────────────────────────
// 2. Mutable Instruments Elements — 34 HP
// ───────────────────────────────────────────────────────────────────────

function elements() {
  const w = W(34);
  // Layout: linker I/O-kolom (V/Oct, Gate, Ext, Out) op x≈4..13.
  // Knoppen-kolommen [1..6] op breed verspreide x, plus aux-out [7].
  const cols: readonly [number,number,number,number,number,number,number,number] =
    [w*0.07, w*0.20, w*0.31, w*0.42, w*0.55, w*0.67, w*0.82, w*0.94];
  const topY = 22;
  const bigY = 50;
  const lowKnobY = 78;
  const attenY = 96;
  const cvJackY = 114;
  // Linker I/O-kolom (eigen y-grid, los van de knoppen-rijen)
  const ioLx = 4, ioRx = 13;
  return assemble({
    typeId: 'tp_mi_elements',
    categoryId: 'vco',
    variant: 'Modal synthesis voice',
    brand: 'Mutable Instruments',
    model: 'Elements',
    hp: 34,
    texture: 'mi-cream',
    baseColor: '#efe8d2',
    texts: [
      // alleen panel-titel + subtitel + brand: knoppen/jacks labelen zichzelf
      { x: w*0.10, y: 7, text: 'Elements', fontSize: 3, color: '#1f2937' },
      { x: w*0.95, y: 7, text: 'modal synthesizer', fontSize: 1.8, color: '#6b7280', align: 'end' },
      { x: w/2, y: 126, text: 'MUTABLE INSTRUMENTS', fontSize: 1.8, color: '#1f2937', align: 'middle' },
    ],
    decorations: [
      // verticale scheidingslijn rond het centrum (excitation | resonator)
      { kind: 'rect', x: w*0.48, y: 14, w: 0.4, h: PANEL_HEIGHT_MM - 28, color: '#9ca3af' },
      // licht-grijs vlak achter de Out L/R jacks
      { kind: 'rect', x: 1, y: 104, w: 16, h: 16, color: '#cbd5e1' },
    ],
    items: [
      // top-rij kleine knoppen
      knob('contour',   'Contour',   cols[1], topY, { size: 'small', color: '#ffffff' }),
      knob('bow',       'Bow',       cols[2], topY, { size: 'small', color: '#ffffff' }),
      knob('blow_amt',  'Blow',      cols[3], topY, { size: 'small', color: '#e11d48' }),
      knob('strike_amt','Strike',    cols[4], topY, { size: 'small', color: '#0891b2' }),
      knob('coarse',    'Coarse',    cols[5], topY, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#ffffff' }),
      knob('fine',      'Fine',      cols[6], topY, { size: 'small', min: -50, max: 50, def: 0, unit: 'ct',   color: '#ffffff' }),

      // play button + grote knoppen
      button('play',    'Play',      cols[0], bigY-6),
      knob('flow',      'Flow',      cols[2], bigY, { size: 'large', color: '#e11d48' }),
      knob('mallet',    'Mallet',    cols[3], bigY, { size: 'large', color: '#0891b2' }),
      knob('geometry',  'Geometry',  cols[5], bigY, { size: 'large', color: '#ffffff' }),
      knob('bright',    'Brightness',cols[6], bigY, { size: 'large', color: '#ffffff' }),
      // FM knob op vrije plek tussen excitation- en resonator-deel
      knob('fm_amt',    'FM',        cols[4], bigY, { size: 'medium', min: -1, max: 1, def: 0, color: '#ffffff' }),

      // low knoppen
      knob('bow_tim',   'Bow Tim',   cols[2], lowKnobY, { size: 'small', color: '#ffffff' }),
      knob('blow_tim',  'Blow Tim',  cols[3], lowKnobY, { size: 'small', color: '#e11d48' }),
      knob('strike_tim','Strike Tim',cols[4], lowKnobY, { size: 'small', color: '#0891b2' }),
      knob('damping',   'Damping',   cols[5], lowKnobY, { size: 'small', color: '#ffffff' }),
      knob('position',  'Position',  cols[6], lowKnobY, { size: 'small', color: '#ffffff' }),
      knob('space',     'Space',     cols[7], lowKnobY, { size: 'small', color: '#ffffff' }),

      // attenuverters (heel klein, ruim onder de low-knoppen)
      knob('a_bow',    'A Bow',    cols[2], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
      knob('a_blow',   'A Blow',   cols[3], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
      knob('a_strike', 'A Strike', cols[4], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
      knob('a_damp',   'A Damp',   cols[5], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
      knob('a_pos',    'A Pos',    cols[6], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
      knob('a_space',  'A Space',  cols[7], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),

      // linker I/O-kolom (eigen verticale spacing van ~16mm tussen rijen)
      inPort('vct',     'V/Oct',   'cv',    ioLx, 26),
      inPort('fm_in',   'FM',      'cv',    ioRx, 26),
      inPort('gate',    'Gate',    'gate',  ioLx, 44),
      inPort('strength','Strength','cv',    ioRx, 44),
      inPort('ext_pink','Ext Pink','audio', ioLx, 70),
      inPort('ext_cyan','Ext Cyan','audio', ioRx, 70),
      outPort('out_l',  'Out L',   'audio', ioLx, 112),
      outPort('out_r',  'Out R',   'audio', ioRx, 112),

      // CV-jacks onder de attenuverters
      inPort('cv_bow',    'CV Bow',   'cv', cols[2], cvJackY),
      inPort('cv_blow',   'CV Blow',  'cv', cols[3], cvJackY),
      inPort('cv_strike', 'CV Strike','cv', cols[4], cvJackY),
      inPort('cv_damp',   'CV Damp',  'cv', cols[5], cvJackY),
      inPort('cv_pos',    'CV Pos',   'cv', cols[6], cvJackY),
      inPort('cv_space',  'CV Space', 'cv', cols[7], cvJackY),

      outPort('aux',    'Aux',     'audio', w-5, 112),
    ],
    notes: 'Modal-synthese stem (excitation: bow/blow/strike → resonator: modal/string/drum/non-linear string).',
  });
}

// ───────────────────────────────────────────────────────────────────────
// 3. MI Shelves + Expander (gecombineerd) — 16 HP
// ───────────────────────────────────────────────────────────────────────

function shelvesPlusExp() {
  const w = W(16);
  // 4 bands: low-shelf (LS, wit), lo-mid (LM, roze), hi-mid (HM, cyaan), hi-shelf (HS, wit)
  const bands = [
    { id: 'ls', label: 'LS', y: 20, col: '#ffffff' },
    { id: 'lm', label: 'LM', y: 44, col: '#e11d48' },
    { id: 'hm', label: 'HM', y: 68, col: '#0891b2' },
    { id: 'hs', label: 'HS', y: 92, col: '#ffffff' },
  ] as const;
  const items: Spec[] = [];
  const texts: { x: number; y: number; text: string; fontSize?: number; color?: string; align?: 'start'|'middle'|'end' }[] = [
    { x: w/2, y: 6, text: 'Shelves + Exp', fontSize: 2.6, color: '#1f2937', align: 'middle' },
    { x: w/2, y: 125, text: 'MUTABLE INSTRUMENTS', fontSize: 1.6, color: '#1f2937', align: 'middle' },
  ];

  for (const b of bands) {
    // CV-jacks links
    items.push(inPort(`${b.id}_fcv`, `${b.label} F-CV`, 'cv', w*0.10, b.y));
    items.push(inPort(`${b.id}_gcv`, `${b.label} G-CV`, 'cv', w*0.22, b.y));
    // knoppen midden
    items.push(knob(`${b.id}_freq`, `${b.label} Freq`, w*0.42, b.y, { size: 'medium', color: b.col, min: 20, max: 20000, def: 1000, unit: 'Hz' }));
    items.push(knob(`${b.id}_gain`, `${b.label} Gain`, w*0.58, b.y, { size: 'medium', color: b.col, min: -15, max: 15, def: 0, unit: 'dB' }));
    // expander-uitgangen rechts (per-band)
    items.push(outPort(`${b.id}_out`, `${b.label} Out`, 'audio', w*0.78, b.y));
    // labels
    texts.push({ x: w*0.42, y: b.y+9, text: `${b.label} FREQ`, fontSize: 1.4, color: b.col === '#ffffff' ? '#1f2937' : b.col, align: 'middle' });
    texts.push({ x: w*0.58, y: b.y+9, text: `${b.label} GAIN`, fontSize: 1.4, color: b.col === '#ffffff' ? '#1f2937' : b.col, align: 'middle' });
  }

  // Q-knoppen alleen voor de twee middenbanden (LM, HM)
  items.push(knob('lm_q', 'LM Q', w*0.30, 44, { size: 'small', color: '#e11d48' }));
  items.push(knob('hm_q', 'HM Q', w*0.30, 68, { size: 'small', color: '#0891b2' }));
  texts.push({ x: w*0.30, y: 53, text: 'Q', fontSize: 1.4, color: '#e11d48', align: 'middle' });
  texts.push({ x: w*0.30, y: 77, text: 'Q', fontSize: 1.4, color: '#0891b2', align: 'middle' });

  // hoofd-IN en hoofd-OUT (Shelves zelf)
  items.push(inPort ('in',  'In',  'audio', w*0.30, 114));
  items.push(outPort('out', 'Out', 'audio', w*0.55, 114));
  items.push(outPort('exp_hp', 'Exp HP', 'audio', w*0.72, 114));
  items.push(outPort('exp_bp', 'Exp BP', 'audio', w*0.85, 114));
  texts.push({ x: w*0.30, y: 122, text: 'IN',  fontSize: 1.4, color: '#1f2937', align: 'middle' });
  texts.push({ x: w*0.55, y: 122, text: 'OUT', fontSize: 1.4, color: '#1f2937', align: 'middle' });

  return assemble({
    typeId: 'tp_mi_shelves_exp',
    categoryId: 'vcf',
    variant: 'EQ-filter (Shelves) + per-band expander-outs',
    brand: 'Mutable Instruments',
    model: 'Shelves + Exp',
    hp: 16,
    texture: 'mi-cream',
    baseColor: '#efe8d2',
    texts,
    decorations: [
      { kind: 'rect', x: w*0.07, y: 14, w: 0.4, h: 90, color: '#9ca3af' },
      { kind: 'rect', x: 3, y: 106, w: w-6, h: 0.4, color: '#9ca3af' },
    ],
    items,
    notes: 'Vier-bands EQ-filter (low-shelf, lo-mid bell, hi-mid bell, hi-shelf). De expander voegt per-band uitgangen toe; standalone is de expander niet bruikbaar, dus hier samengevoegd tot één module.',
  });
}

// ───────────────────────────────────────────────────────────────────────
// 4. Analogue Systems RS-110 MkII — 10 HP, vertical jacks-knob-jacks
// ───────────────────────────────────────────────────────────────────────

function rs110() {
  const w = W(10);
  // 5 rijen, elke rij: jack-links (15%), knob-midden (50%), jack-rechts (85%)
  const rows = [
    { id: 'freq',  label: 'Frequency', inId: 'vct',   inLabel: '1V/Oct', inSig: 'cv' as const,   outId: 'notch', outLabel: 'Notch', color: '#3b82f6' },
    { id: 'depth', label: 'Depth',     inId: 'fcv',   inLabel: 'CV In',  inSig: 'cv' as const,   outId: 'bp',    outLabel: 'BP',    color: '#0a0a0a' },
    { id: 'lvl1',  label: 'Level 1',   inId: 'in1',   inLabel: 'In 1',   inSig: 'audio' as const,outId: 'lp',    outLabel: 'LP',    color: '#0a0a0a' },
    { id: 'lvl2',  label: 'Level 2',   inId: 'in2',   inLabel: 'In 2',   inSig: 'audio' as const,outId: 'hp',    outLabel: 'HP',    color: '#0a0a0a' },
    { id: 'res',   label: 'Resonance', inId: 'rin',   inLabel: 'Res In', inSig: 'audio' as const,outId: 'rout',  outLabel: 'Res Out',color: '#facc15' },
  ];
  const items: Spec[] = [];
  const texts: { x: number; y: number; text: string; fontSize?: number; color?: string; align?: 'start'|'middle'|'end' }[] = [
    { x: w/2, y: 6, text: 'MULTIMODE FILTER', fontSize: 2,   color: '#1f2937', align: 'middle' },
    { x: w/2, y: 11, text: 'RS-110',          fontSize: 1.5, color: '#1f2937', align: 'middle' },
    { x: w/2, y: 125, text: 'AS', fontSize: 1.6, color: '#1f2937', align: 'middle' },
  ];
  rows.forEach((r, i) => {
    const y = 24 + i * 20;
    items.push(inPort(r.inId, r.inLabel, r.inSig, w*0.15, y));
    items.push(knob(r.id, r.label, w*0.50, y, { size: 'medium', color: r.color, min: r.id === 'freq' ? 20 : 0, max: r.id === 'freq' ? 20000 : 10, def: r.id === 'freq' ? 1000 : 5 }));
    items.push(outPort(r.outId, r.outLabel, 'audio', w*0.85, y));
    texts.push({ x: w*0.15, y: y+9, text: r.inLabel,  fontSize: 1.4, color: '#1f2937', align: 'middle' });
    texts.push({ x: w*0.50, y: y+9, text: r.label,    fontSize: 1.4, color: '#1f2937', align: 'middle' });
    texts.push({ x: w*0.85, y: y+9, text: r.outLabel, fontSize: 1.4, color: '#1f2937', align: 'middle' });
  });
  return assemble({
    typeId: 'tp_as_rs110',
    categoryId: 'vcf',
    variant: 'Multimode VCF (4-pole, simult. LP/BP/HP/Notch)',
    brand: 'Analogue Systems',
    model: 'RS-110 MkII',
    hp: 10,
    texture: 'aluminum',
    baseColor: '#dcd9cc',
    texts,
    decorations: [],
    items,
    notes: 'Multimode-filter met 4 gelijktijdige uitgangen (LP/BP/HP/Notch) + aparte resonance-in/out voor patching.',
    simulatedBy: 'tp_mmb_vcf',
    simulationControlMap: { freq: 'cutoff', res: 'q' },
  });
}

// ───────────────────────────────────────────────────────────────────────
// 5. Erica Synths Fusion VCO — 22 HP, PCB-zwart + 2 buizen
// ───────────────────────────────────────────────────────────────────────

function fusionVco() {
  const w = W(22);
  const cx = w/2;
  return assemble({
    typeId: 'tp_erica_fusion_vco',
    categoryId: 'vco',
    variant: 'Tube-hybrid VCO',
    brand: 'Erica Synths',
    model: 'Fusion VCO',
    hp: 22,
    texture: 'pcb-black',
    baseColor: '#0a0a0a',
    texts: [
      { x: cx, y: 6, text: 'FUSION VCO', fontSize: 2.8, color: '#f5f5f5', align: 'middle' },
      { x: cx, y: 33, text: 'FREQUENCY', fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
      { x: w*0.30, y: 60, text: 'WAVESHAPE', fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
      { x: w*0.70, y: 60, text: 'FM LEVEL',  fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
      { x: cx, y: 84, text: 'DRY/WET',  fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
      // bottom knobs labels
      { x: w*0.10, y: 100, text: 'SUBWAVE1', fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
      { x: w*0.28, y: 100, text: 'SUB MIX',  fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
      { x: w*0.72, y: 100, text: 'COLOUR',   fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
      { x: w*0.90, y: 100, text: 'SUBWAVE2', fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
      // jacks labels
      { x: w*0.06, y: 122, text: 'AUDIO',  fontSize: 1.2, color: '#94a3b8', align: 'middle' },
      { x: w*0.20, y: 122, text: 'SUB CV', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
      { x: w*0.34, y: 122, text: '1V/OCT', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
      { x: w*0.48, y: 122, text: 'FM IN',  fontSize: 1.2, color: '#94a3b8', align: 'middle' },
      { x: w*0.62, y: 122, text: 'WAVE CV',fontSize: 1.2, color: '#94a3b8', align: 'middle' },
      { x: w*0.78, y: 122, text: 'VCO OUT',fontSize: 1.2, color: '#fde047', align: 'middle' },
      { x: w*0.92, y: 122, text: 'MIX OUT',fontSize: 1.2, color: '#fde047', align: 'middle' },
      { x: cx, y: 128, text: 'erica fusion', fontSize: 1.4, color: '#94a3b8', align: 'middle' },
    ],
    decorations: [
      // twee buizen flankeren de frequency-knob
      { kind: 'tubeSlot', x: 5, y: 14, w: 18, h: 38, color: '#fb7185' },
      { kind: 'tubeSlot', x: w-23, y: 14, w: 18, h: 38, color: '#fb7185' },
    ],
    items: [
      // toggle voor wave selectie (links boven van frequency)
      sw('wave_sel', 'Wave', w*0.40, 18, ['Saw','Tri','Sin'], 1),
      // grote frequency
      knob('frequency', 'Frequency', cx, 22, { size: 'large', min: 20, max: 20000, def: 220, unit: 'Hz' }),
      knob('waveshape', 'Waveshape', w*0.30, 50, { size: 'medium' }),
      knob('fm_level',  'FM Level',  w*0.70, 50, { size: 'medium' }),
      knob('dry_wet',   'Dry/Wet',   cx,     74, { size: 'medium', def: 5 }),

      knob('subwave1',  'Subwave 1', w*0.10, 94, { size: 'medium' }),
      knob('sub_mix',   'Sub Mix',   w*0.28, 94, { size: 'medium' }),
      knob('colour',    'Colour',    w*0.72, 94, { size: 'medium' }),
      knob('subwave2',  'Subwave 2', w*0.90, 94, { size: 'medium' }),

      inPort ('audio_in', 'Audio In', 'audio', w*0.06, 115),
      inPort ('sub_cv',   'Sub CV',   'cv',    w*0.20, 115),
      inPort ('vct',      'V/Oct',    'cv',    w*0.34, 115),
      inPort ('fm_in',    'FM In',    'cv',    w*0.48, 115),
      inPort ('wave_cv',  'Wave CV',  'cv',    w*0.62, 115),
      outPort('vco_out',  'VCO Out',  'audio', w*0.78, 115),
      outPort('mix_out',  'Mix Out',  'audio', w*0.92, 115),
    ],
    notes: 'Hybride buis-VCO; twee NOS-buizen voor de saturatie-/colour-trap.',
  });
}

// ───────────────────────────────────────────────────────────────────────
// 6. Malekko Richter Oscillator II — 8 HP, aluminium
// ───────────────────────────────────────────────────────────────────────

function richterOsc2() {
  const w = W(14);
  const cx = w/2;
  return assemble({
    typeId: 'tp_richter_osc2',
    categoryId: 'vco',
    variant: 'Analog VCO with phase-mod + sub waves',
    brand: 'Malekko',
    model: 'Richter Oscillator II',
    hp: 14,
    texture: 'aluminum',
    baseColor: '#d5d4cc',
    texts: [
      { x: cx, y: 5,  text: 'RICHTER',       fontSize: 2.4, color: '#1f2937', align: 'middle' },
      { x: cx, y: 10, text: 'OSCILLATOR II', fontSize: 3.2, color: '#1f2937', align: 'middle' },
      { x: cx, y: 38, text: 'FINE',          fontSize: 1.6, color: '#1f2937', align: 'middle' },
      { x: w*0.18, y: 47, text: 'EXT ↑',     fontSize: 1.3, color: '#1f2937', align: 'middle' },
      { x: w*0.82, y: 47, text: 'EXT ↑',     fontSize: 1.3, color: '#1f2937', align: 'middle' },
      { x: w*0.20, y: 70, text: 'EXP',       fontSize: 1.4, color: '#1f2937', align: 'middle' },
      { x: cx,     y: 62, text: 'LFO',       fontSize: 1.3, color: '#1f2937', align: 'middle' },
      { x: w*0.80, y: 70, text: 'PHASE MOD', fontSize: 1.3, color: '#1f2937', align: 'middle' },
      { x: w*0.18, y: 92, text: '1V/OCT',    fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.50, y: 92, text: 'COARSE',    fontSize: 1.4, color: '#1f2937', align: 'middle' },
      { x: w*0.82, y: 92, text: 'PHASE',     fontSize: 1.4, color: '#1f2937', align: 'middle' },
      // outputs row 1
      { x: w*0.18, y: 110, text: 'TRI 2', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.40, y: 110, text: 'SQR 2', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.62, y: 110, text: 'SAW 2', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      // outputs row 2
      { x: w*0.10, y: 122, text: 'TRI 1', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.28, y: 122, text: 'SQR 1', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.46, y: 122, text: 'SAW 1', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.66, y: 122, text: 'SINE', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: w*0.86, y: 122, text: 'SYNC', fontSize: 1.2, color: '#1f2937', align: 'middle' },
      { x: cx, y: 128, text: 'MALEKKO',   fontSize: 1.4, color: '#1f2937', align: 'middle' },
    ],
    items: [
      knob('fine',     'Fine',      cx,      26, { size: 'large', min: -50, max: 50, def: 0, unit: 'ct', color: '#0a0a0a' }),
      inPort('ext_l',  'Ext L',     'cv',    w*0.18, 42),
      inPort('ext_r',  'Ext R',     'cv',    w*0.82, 42),
      knob('exp',      'Exp',       w*0.20, 62, { size: 'medium', color: '#0a0a0a' }),
      button('lfo',    'LFO',       cx,      58),
      knob('phase_mod','Phase Mod', w*0.80, 62, { size: 'medium', color: '#0a0a0a' }),
      inPort('vct',    '1V/Oct',    'cv',    w*0.18, 84),
      knob('coarse',   'Coarse',    w*0.50, 84, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#0a0a0a' }),
      knob('phase',    'Phase',     w*0.82, 84, { size: 'medium', color: '#0a0a0a' }),
      outPort('tri2',  'Tri 2',     'audio', w*0.18, 104),
      outPort('sqr2',  'Sqr 2',     'audio', w*0.40, 104),
      outPort('saw2',  'Saw 2',     'audio', w*0.62, 104),
      outPort('tri1',  'Tri 1',     'audio', w*0.10, 116),
      outPort('sqr1',  'Sqr 1',     'audio', w*0.28, 116),
      outPort('saw1',  'Saw 1',     'audio', w*0.46, 116),
      outPort('sine',  'Sine',      'audio', w*0.66, 116),
      outPort('sync',  'Sync',      'gate',  w*0.86, 116),
    ],
    notes: 'Analoge VCO met phase-modulation; aparte 2nd-octave en 1st-octave golfvorm-uitgangen. 14 HP aluminium-front.',
  });
}

// ───────────────────────────────────────────────────────────────────────
// MMB Brain — interne modules
// ───────────────────────────────────────────────────────────────────────

// 1. MMB AHDSR envelope — 8 HP, 5 verticale sliders + gate/trig in + cv/eoc out
function mmbAhdsr() {
  const w = W(8);
  // SliderGlyph rendert vanaf het CENTRUM (y) en strekt zich uit van
  // y-len/2 tot y+len/2 — dus minimaal len/2 + headroom voor titel.
  const sliderLen = 56;
  const sliderY = 22 + sliderLen / 2;   // = 50
  const colX = [w*0.12, w*0.30, w*0.50, w*0.70, w*0.88] as const;
  return assemble({
    typeId: 'tp_mmb_ahdsr',
    categoryId: 'envelope',
    variant: 'AHDSR (vertical-sliders)',
    brand: 'MMB',
    model: 'AHDSR',
    hp: 8,
    texture: 'pcb-black',
    baseColor: '#111827',
    internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'AHDSR',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'envelope', fontSize: 1.4, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',    fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    decorations: [
      { kind: 'rect', x: 1, y: 20, w: w-2, h: sliderLen+12, color: '#0b1220' },
    ],
    items: [
      slider('attack',  'A', colX[0], sliderY, { min: 0,    max: 2000, def: 10,   lengthMm: sliderLen, unit: 'ms' }),
      slider('hold',    'H', colX[1], sliderY, { min: 0,    max: 5000, def: 0,    lengthMm: sliderLen, unit: 'ms' }),
      slider('decay',   'D', colX[2], sliderY, { min: 0,    max: 5000, def: 200,  lengthMm: sliderLen, unit: 'ms' }),
      slider('sustain', 'S', colX[3], sliderY, { min: 0,    max: 1,    def: 0.7,  lengthMm: sliderLen }),
      slider('release', 'R', colX[4], sliderY, { min: 0,    max: 8000, def: 400,  lengthMm: sliderLen, unit: 'ms' }),

      toggle('loop',    'Loop',  w*0.20, 96),
      toggle('retrig',  'Reset', w*0.45, 96),
      sw    ('curve',   'Curve', w*0.74, 96, ['Lin','Exp','Log'], 1),

      inPort ('gate',    'Gate', 'gate',   w*0.20, 112),
      inPort ('trig',    'Trig', 'trigger',w*0.50, 112),
      outPort('cv_out',  'Env',  'cv',     w*0.80, 112),
      outPort('eoc',     'EOC',  'trigger',w*0.50, 122),
    ],
    notes: 'Interne MMB envelope. Loop=on maakt er een quasi-LFO van; curve schakelt tussen lineair/exp/log per fase. Reset=on hertriggert elke noot vanaf 0 (consistente filter-wah); Reset=off vervolgt klikvrij vanaf de huidige waarde (goed voor amp-env).',
  });
}

// 2. MMB LFO — 6 HP, rate-knob + wave-switch + depth-knob, 2 outs
function mmbLfo() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_lfo',
    categoryId: 'lfo',
    variant: 'LFO (rate+wave+depth)',
    brand: 'MMB',
    model: 'LFO',
    hp: 6,
    texture: 'pcb-black',
    baseColor: '#111827',
    internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'LFO',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate',  'Rate',  w/2, 26, { size: 'large',  min: 0.01, max: 50, def: 1,  unit: 'Hz', color: '#f9fafb' }),
      sw  ('wave',  'Wave',  w/2, 56, ['Sin','Tri','Saw','Sqr','S&H'], 0),
      knob('depth', 'Depth', w/2, 78, { size: 'medium', min: 0,    max: 1,  def: 1, color: '#f9fafb' }),
      toggle('bipolar','Bip', w*0.25, 96, true),
      sw    ('run',   'Run',  w*0.75, 96, ['Always','Gated','OneShot'], 0),

      inPort ('rate_cv','Rate', 'cv',     w*0.25, 112),
      inPort ('reset',  'Rst',  'trigger',w*0.50, 112),
      outPort('out',    'Out',  'cv',     w*0.75, 112),
      outPort('out_inv','Inv',  'cv',     w*0.50, 122),
    ],
    notes: 'Interne MMB LFO; bipolar=on geeft \u00b1depth, off geeft 0..depth.',
  });
}

// 3. MMB S&H + Slew — 4 HP
function mmbSh() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_sh',
    categoryId: 'utility',
    variant: 'S&H + Slew',
    brand: 'MMB',
    model: 'S&H',
    hp: 4,
    texture: 'pcb-black',
    baseColor: '#111827',
    internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'S&H',  fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('slew', 'Slew', w/2, 30, { size: 'medium', min: 0, max: 5000, def: 0, unit: 'ms', color: '#f9fafb' }),
      sw  ('mode', 'Mode', w/2, 60, ['S&H','T&H','Slew'], 0),
      inPort ('in',   'In',   'cv',     w*0.30, 92),
      inPort ('trig', 'Trig', 'trigger',w*0.70, 92),
      outPort('out',  'Out',  'cv',     w/2,    114),
    ],
    notes: 'Sample-and-hold met slew-limiter. In Slew-mode wordt de trigger-input genegeerd.',
  });
}

// 4. MMB VCO — 8 HP. Simulator-vriendelijk: wave-switch, coarse/fine knoppen,
//    V/Oct + FM in, audio out. Port-ids matchen de engine-conventie.
function mmbVco() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_vco',
    categoryId: 'vco',
    variant: 'VCO (wave + coarse/fine)',
    brand: 'MMB', model: 'VCO',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'VCO',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('wave',   'Wave',   w/2,    22, ['Sin','Tri','Saw','Sqr'], 2),
      knob('coarse', 'Coarse', w*0.30, 50, { size: 'large',  min: -36, max: 36, def: 0,  unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.70, 50, { size: 'medium', min: -100, max: 100, def: 0, unit: 'ct',  color: '#f9fafb' }),
      knob('fm_amt', 'FM',     w*0.30, 78, { size: 'medium', min: 0, max: 1, def: 0,  color: '#f9fafb' }),
      knob('level',  'Level',  w*0.70, 78, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('voct', '1V/Oct', 'cv',    w*0.18, 104),
      inPort ('tune', 'Tune',   'cv',    w*0.40, 104),
      inPort ('fm',   'FM',     'cv',    w*0.62, 104),
      inPort ('sync', 'Sync',   'trigger', w*0.84, 104),
      outPort('out',  'Out',    'audio', w/2,    118),
    ],
    notes: 'Interne MMB VCO. \'wave\' kiest sine/triangle/sawtooth/square; coarse+fine zijn semitonen+cent offsets t.o.v. de inkomende V/Oct. \'tune\' is een aparte V/Oct-ingang die bij de hoofdpitch wordt opgeteld (voor pitch-bend/detune zonder de noot-V/Oct te overschrijven).',
  });
}

// 4b. MMB Quad-VCO-Shared — 16 HP. Multi-module: 4 identical oscillator
//     cells sharing ONE set of controls (wave/coarse/fine/level). The
//     canonical "shared-controls multi-module" referenced in the polyphony
//     sketch (CellGroup with controlIds: []). Useful as a fan-out target
//     for an N=4 voice group: one v/oct in and one audio out per cell.
function mmbQuadVcoShared() {
  const w = W(16);
  const colX = (i: number) => w * (0.125 + i * 0.25);          // cell centres
  return assemble({
    typeId: 'tp_mmb_quad_vco_shared',
    categoryId: 'vco',
    variant: 'Quad VCO (shared controls)',
    brand: 'MMB', model: 'QUAD-VCO-S',
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'osc',
      label: 'Oscillator',
      count: 4,
      portIds: ['voct', 'out'],
      controlIds: [],   // shared-controls multi-module
    }],
    texts: [
      { x: w/2, y: 8,   text: 'QUAD-VCO-S',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'shared controls · 4 cells', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',         fontSize: 1.8, color: '#f9fafb', align: 'middle' },
      { x: colX(0), y: 78, text: '1', fontSize: 1.6, color: '#9ca3af', align: 'middle' },
      { x: colX(1), y: 78, text: '2', fontSize: 1.6, color: '#9ca3af', align: 'middle' },
      { x: colX(2), y: 78, text: '3', fontSize: 1.6, color: '#9ca3af', align: 'middle' },
      { x: colX(3), y: 78, text: '4', fontSize: 1.6, color: '#9ca3af', align: 'middle' },
    ],
    items: [
      // Shared (module-global) controls — apply to ALL 4 cells.
      sw  ('wave',   'Wave',   w*0.20, 28, ['Sin','Tri','Saw','Sqr'], 2),
      knob('coarse', 'Coarse', w*0.45, 32, { size: 'large',  min: -36, max: 36, def: 0,  unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.65, 32, { size: 'medium', min: -100, max: 100, def: 0, unit: 'ct',  color: '#f9fafb' }),
      knob('level',  'Level',  w*0.85, 32, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      // Per-cell ports — 4× v/oct in (top row) + 4× audio out (bottom row).
      // ids carry the 1-based cell index; cellGroupId binds them to 'osc'.
      inPort ('voct_1', 'V/Oct', 'cv',    colX(0), 92, { cellGroupId: 'osc' }),
      inPort ('voct_2', 'V/Oct', 'cv',    colX(1), 92, { cellGroupId: 'osc' }),
      inPort ('voct_3', 'V/Oct', 'cv',    colX(2), 92, { cellGroupId: 'osc' }),
      inPort ('voct_4', 'V/Oct', 'cv',    colX(3), 92, { cellGroupId: 'osc' }),
      outPort('out_1',  'Out',   'audio', colX(0), 116, { cellGroupId: 'osc' }),
      outPort('out_2',  'Out',   'audio', colX(1), 116, { cellGroupId: 'osc' }),
      outPort('out_3',  'Out',   'audio', colX(2), 116, { cellGroupId: 'osc' }),
      outPort('out_4',  'Out',   'audio', colX(3), 116, { cellGroupId: 'osc' }),
    ],
    notes: 'Multi-module met 4 identieke oscillator-cellen die ALLE dezelfde control-set delen (wave/coarse/fine/level). Eén v/oct-in en één audio-out per cel. Canonisch voorbeeld van een shared-controls multi-module (CellGroup met controlIds: []). Hardware bestaat nog niet — eerst alleen in simulator gebruiken.',
  });
}

// 4c. MMB Quad Mixer (shared) — 12 HP. Multi-module met 4 mix-cellen. Elke
//     cel heeft een eigen audio-in én een eigen PAN-knop (per-cel control),
//     maar deelt één globale VOLUME-knop. Demonstreert het per-cel-controls-
//     geval van CellGroups (controlIds: ['pan']) tegenover de shared-controls
//     quad-VCO (controlIds: []). Mengt de 4 cellen naar één stereo-out.
function mmbQuadMixerShared() {
  const w = W(12);
  const colX = (i: number) => w * (0.16 + i * 0.22);          // cell centres
  return assemble({
    typeId: 'tp_mmb_quad_mixer_shared',
    categoryId: 'utility',
    variant: 'Quad Mixer (per-cell pan, shared volume)',
    brand: 'MMB', model: 'QUAD-MIX-S',
    hp: 12, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'chan',
      label: 'Channel',
      count: 4,
      portIds: ['in'],
      controlIds: ['pan'],   // per-cell control (each cell has its own pan)
    }],
    texts: [
      { x: w/2, y: 8,   text: 'QUAD-MIX-S',  fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'per-cel pan · gedeelde volume', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',         fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Per-cell audio-in (top row) + per-cell pan (mid row).
      inPort('in_1', 'In', 'audio', colX(0), 30, { cellGroupId: 'chan' }),
      inPort('in_2', 'In', 'audio', colX(1), 30, { cellGroupId: 'chan' }),
      inPort('in_3', 'In', 'audio', colX(2), 30, { cellGroupId: 'chan' }),
      inPort('in_4', 'In', 'audio', colX(3), 30, { cellGroupId: 'chan' }),
      knob('pan_1', 'Pan', colX(0), 52, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      knob('pan_2', 'Pan', colX(1), 52, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      knob('pan_3', 'Pan', colX(2), 52, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      knob('pan_4', 'Pan', colX(3), 52, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      // Shared (module-global) master volume — applies to ALL 4 cells.
      knob('volume', 'Volume', w/2, 82, { size: 'large', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      // Global stereo output (collapses the 4 cells to a stereo bus).
      outPort('out_l', 'L', 'audio', w*0.38, 110),
      outPort('out_r', 'R', 'audio', w*0.62, 110),
    ],
    notes: 'Multi-module met 4 mix-cellen. Elke cel heeft een eigen audio-in en een eigen PAN-knop (per-cel control), maar deelt één globale VOLUME-knop (shared control). Mengt naar één stereo-out. Voorbeeld van het per-cel-controls-geval van CellGroups (controlIds: [\'pan\']) — vergelijk met de quad-VCO die juist ALLE controls deelt (controlIds: []). Hardware bestaat nog niet — eerst alleen in simulator gebruiken.',
  });
}

// 5. MMB VCF — 6 HP. Cutoff/Q/type-switch, audio-in, cutoff-CV + Q-CV in, audio-out.
function mmbVcf() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_vcf',
    categoryId: 'vcf',
    variant: 'VCF (lp/hp/bp)',
    brand: 'MMB', model: 'VCF',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'VCF',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('cutoff',   'Cutoff',   w/2, 22, { size: 'large', min: 20, max: 18000, def: 2000, unit: 'Hz', color: '#f9fafb' }),
      knob('q',        'Q',        w*0.30, 48, { size: 'medium', min: 0.7, max: 5, def: 0.7, color: '#f9fafb' }),
      knob('cv_amt',   'CV amt',   w*0.70, 48, { size: 'medium', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('q_cv_amt', 'Q CV amt', w*0.30, 70, { size: 'small', min: 0, max: 4.3, def: 2, color: '#f9fafb' }),
      sw  ('type',     'Type',     w*0.70, 72, ['LP','HP','BP'], 0),

      inPort ('in',   'In',   'audio', w*0.25, 98),
      inPort ('cv',   'F CV', 'cv',    w*0.75, 98),
      inPort ('q_cv', 'Q CV', 'cv',    w*0.25, 112),
      outPort('out',  'Out',  'audio', w*0.75, 112),
    ],
    notes: 'Interne MMB filter (state-variable). Cutoff-knop is de basis; F CV moduleert via cv_amt (1V/oct-achtig). Q CV telt op bij de Q-knop met q_cv_amt als diepte (in Q-eenheden, control-rate — prima voor LFO/envelope-sweeps). Q stabiel tussen 0.7 en 5.0.',
  });
}

// 5b. MMB LADDER — 6 HP. Moog-stijl 4-pole lowpass ladder (Huovilainen-model,
//     AudioFilterLadder). Audio-rate CV op cutoff ÉN resonantie, plus input-
//     drive (tanh-overdrive). Alleen LP 24 dB/oct — voor HP/BP: de MMB VCF.
function mmbLadder() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_ladder',
    categoryId: 'vcf',
    variant: 'Ladder VCF (Moog-stijl, 24 dB LP)',
    brand: 'MMB', model: 'LADDER',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'LADDER', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',    fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('cutoff',   'Cutoff',   w/2, 22, { size: 'large', min: 20, max: 18000, def: 2000, unit: 'Hz', color: '#f9fafb' }),
      knob('q',        'Res (Q)',  w*0.28, 48, { size: 'medium', min: 0, max: 1.8, def: 0.7, color: '#f9fafb' }),
      knob('drive',    'Drive',    w*0.72, 48, { size: 'medium', min: 0, max: 4, def: 1, color: '#f9fafb' }),
      knob('cv_amt',       'F CV amt',   w*0.20, 70, { size: 'small', min: 0, max: 7, def: 2, unit: 'oct', color: '#f9fafb' }),
      knob('q_cv_amt',     'Res CV amt', w*0.50, 70, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('drive_cv_amt', 'Drv CV amt', w*0.80, 70, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),

      inPort ('in',       'In',     'audio', w*0.20, 98),
      inPort ('cv',       'F CV',   'cv',    w*0.50, 98),
      inPort ('q_cv',     'Res CV', 'cv',    w*0.80, 98),
      inPort ('drive_cv', 'Drv CV', 'cv',    w*0.20, 112),
      outPort('out',      'Out',    'audio', w*0.80, 112),
    ],
    notes: 'Moog-stijl 4-pole lowpass ladder (Huovilainen-model, firmware tp_mmb_ladder). Res = Q: de Res-knop is de basiswaarde, Res CV moduleert erbovenop (diepte via Res CV amt, 0–1 res-eenheden). F CV en Res CV zijn audio-rate op de Teensy; F CV in octaven (F CV amt 0–7 oct). Drv CV moduleert de drive exponentieel: ±1 CV bij amt 1 is ×4…÷4. Res boven ~1.1 gaat zelf-oscilleren; Drive >1 stuurt de tanh-clipping aan. Alleen lowpass 24 dB/oct — HP/BP doe je met de MMB VCF.',
  });
}

// 5c. MMB MS-20 — 6 HP. Korg35 Sallen-Key ZDF-filter (Pirkle-model) met tanh-
//     diodeclipping in de resonantielus en 2x oversampling — dezelfde karakter-
//     keuzes als het Gowin FPGA-project (MS20_synth_voice). LP 12 dB / HP 6 dB,
//     live schakelbaar. Zelf-oscillatie bij Res = 1.
function mmbMs20() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_ms20',
    categoryId: 'vcf',
    variant: 'MS-20 filter (Korg35 Sallen-Key, LP/HP)',
    brand: 'MMB', model: 'MS-20',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MS-20', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',   fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('cutoff',   'Cutoff',   w/2, 22, { size: 'large', min: 20, max: 18000, def: 2000, unit: 'Hz', color: '#f9fafb' }),
      knob('q',        'Res (Q)',  w*0.28, 48, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('drive',    'Drive',    w*0.72, 48, { size: 'medium', min: 0.1, max: 10, def: 1, color: '#f9fafb' }),
      knob('cv_amt',       'F CV amt',   w*0.20, 70, { size: 'small', min: 0, max: 7, def: 2, unit: 'oct', color: '#f9fafb' }),
      knob('q_cv_amt',     'Res CV amt', w*0.50, 70, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('drive_cv_amt', 'Drv CV amt', w*0.80, 70, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      sw  ('type',     'Mode',     w/2, 86, ['LP','HP'], 0),

      inPort ('in',       'In',     'audio', w*0.20, 100),
      inPort ('cv',       'F CV',   'cv',    w*0.50, 100),
      inPort ('q_cv',     'Res CV', 'cv',    w*0.80, 100),
      inPort ('drive_cv', 'Drv CV', 'cv',    w*0.20, 113),
      outPort('out',      'Out',    'audio', w*0.80, 113),
    ],
    notes: 'Korg35/MS-20 Sallen-Key filter (zero-delay-feedback naar Pirkle, firmware tp_mmb_ms20) met tanh-diodeclipping in de resonantielus en 2x oversampling — de MS-20 "scream". Res = Q: de Res-knop is de basiswaarde, Res CV moduleert erbovenop (diepte via Res CV amt). Drv CV moduleert de drive exponentieel (±1 CV bij amt 1 = ×4…÷4). Res = 1 gaat zelf-oscilleren; Drive bepaalt hoe hard de lus satureert. LP is 12 dB/oct, HP is (Korg35-typisch) 6 dB/oct; de mode-switch schakelt live, zonder rebuild. Alle CV control-rate met per-block smoothing; F CV in octaven.',
  });
}

// 6. MMB VCA — 4 HP. Gain knob + cv-in (typisch ENV → VCA).
function mmbVca() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_vca',
    categoryId: 'vca',
    variant: 'VCA (linear)',
    brand: 'MMB', model: 'VCA',
    hp: 4, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'VCA',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('gain', 'Gain', w/2, 24, { size: 'large', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      sw  ('resp', 'Resp', w/2, 60, ['Lin','Exp'], 0),

      inPort ('in',  'In',  'audio', w*0.25, 92),
      inPort ('cv',  'CV',  'cv',    w*0.75, 92),
      outPort('out', 'Out', 'audio', w/2,    114),
    ],
    notes: 'Lineaire VCA. Bij gain=0 is de basisweg dicht; een CV-input voegt erbovenop (typisch envelope → CV).',
  });
}

// 7. MMB OUT — 4 HP. Routeert audio naar de master-uitgang (Tone destination).
function mmbOut() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_out',
    categoryId: 'utility',
    variant: 'Audio output',
    brand: 'MMB', model: 'OUT',
    hp: 4, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'OUT',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('level', 'Level', w/2, 30, { size: 'large', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort ('l',  'L',  'audio', w*0.30, 92),
      inPort ('r',  'R',  'audio', w*0.70, 92),
    ],
    notes: 'Stuurt aangesloten audio naar de master out. Mono-bron op L of R werkt ook.',
  });
}

// 7b. MMB MIDI-In — 14 HP. Breakout-module die de actieve MIDI-bron
//     (USB-keyboard, screen-keyboard of test-sequence) splitst in pitch/gate/
//     velocity én modulatie-CV's (mod-wheel, pitch-bend, 2 vrije CC's).
//     Mono/poly volgt uit voiceCount; steal mapt op firmware StealStrategy.
function mmbMidiIn() {
  const w = W(14);
  return assemble({
    typeId: 'tp_mmb_midiin',
    categoryId: 'utility',
    variant: 'MIDI-to-CV breakout',
    brand: 'MMB', model: 'MIDI-IN',
    hp: 14, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'event-source',
    texts: [
      { x: w/2, y: 8,   text: 'MIDI-IN', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'voicing · steal · modulatie', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w*0.60, y: 26, text: 'Voices', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w*0.24, y: 100, text: 'NOTE', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w*0.74, y: 100, text: 'MOD',  fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',     fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('channel', 'Ch', w*0.12, 30, { size: 'small', min: 0, max: 16, def: 0, step: 1, unit: '0=all', color: '#f9fafb' }),
      // Live display: kanaal-nummer (0 = all). Mirrort de Ch-knop.
      display('chDisp', w*0.26, 30, { digits: 3, style: 'led', bindTo: 'channel', format: 'int' }),
      // Activity-LED: licht op zodra de simulator een MIDI-bron stuurt.
      led('act', w*0.90, 28, { label: 'Act', color: '#22c55e', size: 'medium' }),
      // Aantal stemmen van de patch (volgt patch.voiceCount). 1 = monofoon.
      // De waarde wordt door de patcher ingespoten (synthetisch 'voiceCount').
      display('voicesDisp', w*0.60, 32, { digits: 2, style: 'led', bindTo: 'voiceCount', format: 'int' }),
      // Note-priority (mono): welke ingedrukte toets de mono-stem volgt.
      // 'last' = laatst aangeslagen, 'low' = laagste, 'high' = hoogste.
      // Firmware doet nu altijd last-note; low/high = FW-1.
      sw  ('priority', 'Prio', w*0.12, 52, ['last','low','high'], 0),
      // Voice-stealing (poly): welke klinkende stem wordt afgepakt als alle
      // stemmen bezet zijn. Mapt 1-op-1 op firmware StealStrategy
      // {Oldest=0, Lowest=1, Highest=2} (VoiceAllocator, ADR 0011).
      sw  ('steal', 'Steal', w*0.34, 52, ['old','low','hi'], 0),
      // Legato (mono): nieuwe noot bij nog-ingedrukte vorige glijdt door
      // zonder envelope-hertrigger. Label/keuze nu aanwezig; firmware-gedrag
      // = FW-1 (nog te bouwen).
      sw  ('legato', 'Leg', w*0.56, 52, ['off','on'], 0),
      // Pitch-bend-bereik in halve tonen (integer).
      knob('bendRange', 'Bend', w*0.80, 52, { size: 'small', min: 1, max: 24, def: 2, step: 1, unit: 'st', color: '#f9fafb' }),
      // Portamento / glide (vrije rij y=66). Glijtijd in ms per octaaf (0 = uit,
      // directe sprong). Unison = één toets stuurt alle stemmen (last-note);
      // Sprd = symmetrische unison-detune in centen (fat-sound).
      knob('glide', 'Glide', w*0.14, 66, { size: 'small', min: 0, max: 2000, def: 0, step: 10, unit: 'ms/oct', color: '#f9fafb' }),
      sw  ('unison', 'Uni', w*0.40, 66, ['off','on'], 0),
      knob('spread', 'Sprd', w*0.66, 66, { size: 'small', min: 0, max: 100, def: 0, step: 1, unit: 'ct', color: '#f9fafb' }),
      // CC-pickers: welk CC-nummer naar cv_cc1/cv_cc2 gaat (integer). Defaults
      // 74 (filter-cutoff) en 71 (resonantie). Elke knop heeft een LED-display
      // dat het gekozen CC-nummer toont.
      knob   ('cc1Num',  'CC1#', w*0.16, 80, { size: 'small', min: 0, max: 127, def: 74, step: 1, color: '#f9fafb' }),
      display('cc1Disp', w*0.34, 80, { digits: 3, style: 'led', bindTo: 'cc1Num', format: 'int' }),
      knob   ('cc2Num',  'CC2#', w*0.58, 80, { size: 'small', min: 0, max: 127, def: 71, step: 1, color: '#f9fafb' }),
      display('cc2Disp', w*0.76, 80, { digits: 3, style: 'led', bindTo: 'cc2Num', format: 'int' }),
      // Note-outputs (per stem) — links.
      outPort('pitch', 'V/Oct', 'cv',   w*0.10, 112, { eventKind: 'voice' }),
      outPort('gate',  'Gate',  'gate', w*0.24, 112, { eventKind: 'voice' }),
      outPort('vel',   'Vel',   'cv',   w*0.38, 112, { eventKind: 'voice' }),
      // Modulatie-outputs (globaal) — rechts.
      outPort('cv_mod',  'Mod',  'cv', w*0.58, 112),
      outPort('cv_bend', 'Bend', 'cv', w*0.70, 112),
      outPort('cv_cc1',  'CC1',  'cv', w*0.82, 112),
      outPort('cv_cc2',  'CC2',  'cv', w*0.94, 112),
    ],
    notes: 'Zet inkomende MIDI om in CV. NOTE-uitgangen (per stem): pitch (V/Oct), gate, velocity. MOD-uitgangen (globaal): Mod (mod-wheel CC1), Bend (pitch-bend, V/Oct, bereik = Bend-knop in halve tonen), CC1/CC2 (vrij kiesbare CC-nummers via CC1#/CC2#; het gekozen nummer staat op het LED-display naast elke knop). De MIDI-bron kies je in het Simulatie-paneel. Mono/poly volgt automatisch uit het aantal stemmen (voiceCount). PRIO = mono note-priority (last/low/high). STEAL = poly voice-stealing → firmware StealStrategy. LEG = legato (firmware-gedrag = FW-1, nog te bouwen). GLIDE = portamento (ms per octaaf, 0 = uit). UNI = unison (één toets → alle stemmen, last-note); SPRD = unison-detune in centen. Géén MIDI-jack op de front; alles loopt via de brain.',
  });
}

// 7c. MMB CvMath — 4 HP. Combinatorial CV processor: weighted sum or multiply.
function mmbCvMath() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_cvmath',
    categoryId: 'utility',
    variant: 'CV Math (sum/mult)',
    brand: 'MMB', model: 'CV-MATH',
    hp: 4, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'CV-MATH', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',      fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('mode',   'Mode',   w/2,    22, ['Sum','Mult'], 0),
      knob('gain_a', 'Gain A', w*0.30, 46, { size: 'small', min: -2, max: 2, def: 1, color: '#f9fafb' }),
      knob('gain_b', 'Gain B', w*0.70, 46, { size: 'small', min: -2, max: 2, def: 1, color: '#f9fafb' }),
      knob('gain_c', 'Gain C', w*0.30, 68, { size: 'small', min: -2, max: 2, def: 1, color: '#f9fafb' }),
      knob('offset', 'Offset', w*0.70, 68, { size: 'small', min: -5, max: 5,  def: 0, color: '#f9fafb' }),

      inPort ('a',   'A',   'cv', w*0.20, 92),
      inPort ('b',   'B',   'cv', w*0.50, 92),
      inPort ('c',   'C',   'cv', w*0.80, 92),
      outPort('out', 'Out', 'cv', w/2,    114),
    ],
    notes: 'Sum-mode: out = a×gain_a + b×gain_b + c×gain_c + offset. Mult-mode: out = (a×gain_a) × (b×gain_b) — ring-mod stijl, bijv. envelope × velocity; let op: gain 0 maakt het product 0 (stilte). Gain-waarden kunnen negatief zijn voor inversie.',
  });
}

// 7e. MMB MIXER — 8 HP. 4-kanaals STEREO mixer met per-kanaal volume + pan.
//     Bouwsteen voor polyfonie: N voice-ketens voeden aparte kanalen en de
//     stereo out_l/out_r-paar gaat naar VCF/VCA/OUT. Eén rij per kanaal:
//     [in]  Vol  Pan.
function mmbMixer() {
  const w = W(8);
  const rowY = (i: number) => 26 + i * 22;     // 26, 48, 70, 92
  const items: ReturnType<typeof knob | typeof inPort | typeof outPort>[] = [];
  for (let i = 0; i < 4; ++i) {
    const n = i + 1;
    const y = rowY(i);
    items.push(
      inPort(`in${n}`, `${n}`, 'audio', w * 0.12, y),
      knob(`vol${n}`, 'Vol', w * 0.45, y, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob(`pan${n}`, 'Pan', w * 0.78, y, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
    );
  }
  items.push(
    outPort('out_l', 'L', 'audio', w * 0.38, 116),
    outPort('out_r', 'R', 'audio', w * 0.62, 116),
  );
  return assemble({
    typeId: 'tp_mmb_mixer',
    categoryId: 'utility',
    variant: 'Stereo mixer (4-in)',
    brand: 'MMB', model: 'MIXER',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MIXER', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',   fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items,
    notes: 'Stereo 4-kanaals mixer. Per kanaal: Vol (0..1) + Pan (-1 links .. +1 rechts, equal-power). Elke ingang wordt naar de L- en R-bus gemengd; out_l/out_r vormen het stereo-paar. Basis voor polyfone stem-sommatie.',
  });
}

// 7b. MMB MIXER-8 — 12 HP. 8-kanaals stereo mixer (twee kolommen van 4).
//     De 8-in variant voor 8-stemmige racks; firmware sommeert via twee
//     AudioMixer4-banken + een sub-mix. Per kanaal Vol + Pan, out_l/out_r.
function mmbMixer8() {
  const w = W(12);
  const rowY = (i: number) => 28 + i * 22;     // 28, 50, 72, 94
  const items: ReturnType<typeof knob | typeof inPort | typeof outPort>[] = [];
  // Kolom links = kanaal 1..4, kolom rechts = kanaal 5..8.
  const cols = [
    { inX: w * 0.06, volX: w * 0.20, panX: w * 0.34 },
    { inX: w * 0.56, volX: w * 0.70, panX: w * 0.84 },
  ];
  for (let n = 1; n <= 8; ++n) {
    const col = cols[n <= 4 ? 0 : 1]!;
    const y = rowY((n - 1) % 4);
    items.push(
      inPort(`in${n}`, `${n}`, 'audio', col.inX, y),
      knob(`vol${n}`, 'Vol', col.volX, y, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob(`pan${n}`, 'Pan', col.panX, y, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
    );
  }
  items.push(
    outPort('out_l', 'L', 'audio', w * 0.40, 118),
    outPort('out_r', 'R', 'audio', w * 0.60, 118),
  );
  return assemble({
    typeId: 'tp_mmb_mixer8',
    categoryId: 'utility',
    variant: 'Stereo mixer (8-in)',
    brand: 'MMB', model: 'MIX8',
    hp: 12, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MIXER-8', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',     fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items,
    notes: 'Stereo 8-kanaals mixer (twee kolommen van 4). Per kanaal: Vol (0..1) + Pan (-1 links .. +1 rechts, equal-power). De firmware sommeert via twee AudioMixer4-banken in een sub-mix. Sommatie-node voor racks tot 8 stemmen.',
  });
}

// 7c. MMB MIXER-16 — 24 HP. 16-kanaals stereo mixer (vier kolommen van 4).
//     Voor 16-stemmige racks. Firmware gebruikt vier AudioMixer4-banken + sub-mix.
function mmbMixer16() {
  const w = W(24);
  const rowY = (i: number) => 28 + i * 22;     // 28, 50, 72, 94
  const items: ReturnType<typeof knob | typeof inPort | typeof outPort>[] = [];
  // Vier kolommen van 4 kanalen.
  const cols = [
    { inX: w * 0.05, volX: w * 0.12, panX: w * 0.21 },
    { inX: w * 0.30, volX: w * 0.37, panX: w * 0.46 },
    { inX: w * 0.55, volX: w * 0.62, panX: w * 0.71 },
    { inX: w * 0.80, volX: w * 0.87, panX: w * 0.96 },
  ];
  for (let n = 1; n <= 16; ++n) {
    const colIdx = Math.floor((n - 1) / 4);
    const col = cols[colIdx]!;
    const y = rowY((n - 1) % 4);
    items.push(
      inPort(`in${n}`, `${n}`, 'audio', col.inX, y),
      knob(`vol${n}`, 'Vol', col.volX, y, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob(`pan${n}`, 'Pan', col.panX, y, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
    );
  }
  items.push(
    outPort('out_l', 'L', 'audio', w * 0.40, 118),
    outPort('out_r', 'R', 'audio', w * 0.60, 118),
  );
  return assemble({
    typeId: 'tp_mmb_mixer16',
    categoryId: 'utility',
    variant: 'Stereo mixer (16-in)',
    brand: 'MMB', model: 'MIX16',
    hp: 24, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MIXER-16', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',      fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items,
    notes: 'Stereo 16-kanaals mixer (vier kolommen van 4). Per kanaal: Vol (0..1) + Pan (-1 links .. +1 rechts, equal-power). De firmware sommeert via vier AudioMixer4-banken in een sub-mix. Sommatie-node voor racks tot 16 stemmen.',
  });
}

// 8. MMB SEQ-8 — 8 HP. 8-step sequencer (semitone-knoppen) + run/length/rate.
//    Outputs: CV (volt-per-octave proxy) + GATE. De engine draait de
//    interne clock zodra Start ingedrukt is.
function mmbSeq8() {
  const w = W(20);
  // Twee rijen van 8 stappen.
  const rowY1 = 38;
  const rowY2 = 62;
  const sx = (i: number) => w * (0.07 + (i % 8) * 0.115);
  const rowY = (i: number) => (i < 8 ? rowY1 : rowY2);
  // LED-rij iets onder elke knop.
  const ledY = (i: number) => rowY(i) + 9;
  const stepKnobs = [];
  const stepLeds = [];
  const stepDefaults = [0,4,7,12,7,0,5,3,12,9,7,5,4,0,-5,-12];
  for (let i = 0; i < 16; i++) {
    const id = `s${i+1}`;
    stepKnobs.push(
      knob(id, String(i+1), sx(i), rowY(i), {
        size: 'small', min: -24, max: 24, def: stepDefaults[i] ?? 0, unit: 'st', color: '#f9fafb',
      })
    );
    stepLeds.push(
      led(`led_${id}`, sx(i), ledY(i), { color: '#fbbf24', size: 'small', bindTo: '__currentStep', bindMatch: i + 1 })
    );
  }
  // Hack: bindTo '__currentStep' wordt door de panel-renderer afgevangen
  // (engine schrijft __currentStep als 1-based step naar controlState).
  // We patchen de LED's hieronder zodat ze "aan" zijn als hun index matcht.
  return assemble({
    typeId: 'tp_mmb_seq8',
    categoryId: 'sequencer',
    variant: '16-step CV/Gate sequencer',
    brand: 'MMB', model: 'SEQ-16',
    hp: 20, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'SEQ-16', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: '16-step sequencer', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',   fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    decorations: [
      { kind: 'rect', x: 2, y: 30, w: w-4, h: 44, color: '#0b1220' },
    ],
    items: [
      ...stepKnobs,
      ...stepLeds,

      knob ('root',   'Root',   w*0.18, 92, { size: 'medium', min: 24, max: 96, def: 60, unit: 'midi', color: '#f9fafb' }),
      knob ('rate',   'Rate',   w*0.36, 92, { size: 'medium', min: 0.5, max: 16, def: 4, unit: 'Hz',   color: '#f9fafb' }),
      knob ('gate',   'Gate',   w*0.54, 92, { size: 'medium', min: 0.05, max: 0.95, def: 0.5, color: '#f9fafb' }),
      knob ('length', 'Length', w*0.70, 92, { size: 'medium', min: 2, max: 16, def: 8, color: '#f9fafb',
                                               ticks: { every: 1, highlight: [6, 8, 12, 16] } }),
      sw    ('run',   'Run',    w*0.08, 92, ['Free','Off','Gate'], 0),
      led   ('runLed', w*0.08, 104, { color: '#22c55e', size: 'small', bindTo: '__runActive' }),
      // Step-positie display (1..16, live) — groot & duidelijk.
      display('stepDisp', w*0.88, 92, { label: 'Step', digits: 2, style: 'led', bindTo: '__currentStep', format: 'int', size: 'large' }),
      // BPM-indicator naast Rate (bindTo '__rateBpm', engine schrijft elke
      // rate-update een afgeleide BPM).
      display('rateBpm', w*0.36, 104, { label: 'BPM', digits: 3, style: 'led', bindTo: '__rateBpm', format: 'int', size: 'small' }),
      // Length-waarde naast de knob — toont integer 2..16.
      display('lenVal',  w*0.70, 104, { label: 'len', digits: 2, style: 'led', bindTo: 'length', format: 'int', size: 'small' }),

      inPort ('clock', 'Clk',   'trigger', w*0.10, 114),
      inPort ('reset', 'Rst',   'trigger', w*0.22, 114),
      inPort ('voct_in','V+',   'cv',      w*0.34, 114),
      inPort ('run_in', 'Run+', 'gate',    w*0.46, 114),
      outPort('cv',     'CV',   'cv',      w*0.62, 114),
      outPort('gate_out','Gate','gate',    w*0.76, 114),
      outPort('trig',   'Trig', 'trigger', w*0.90, 114),
    ],
    notes: '16-step sequencer met semitone-per-step. Run-schakelaar: Free = sequencer loopt vrij, Off = doorlus (V+ → CV-out, Run+ → Gate-out — sequencer als kabeltje), Gate = wacht op Run+ rising edge en gebruikt V+ als root. CV-out is een proxy voor V/Oct. V+ override-t de root (toetsenbord bepaalt grondtoon). Trig vuurt een korte puls per step (handig voor drum-envelopes). Step-LED licht op bij de huidige positie.',
  });
}

// 9. MMB NOISE — 4 HP. Witte/roze/bruin ruis met level-knop.
function mmbNoise() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_noise',
    categoryId: 'noise',
    variant: 'Noise generator',
    brand: 'MMB', model: 'NOISE',
    hp: 4, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'NOISE', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',   fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('color', 'Color', w/2, 30, ['white','pink','brown'], 0),
      knob('level', 'Level', w/2, 60, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      outPort('out', 'Out', 'audio', w/2, 100),
    ],
    notes: 'Witte / roze / bruine ruis. Mooi voor S&H-bronnen, drum-shells of hi-hat-percussie.',
  });
}

// 10. MMB ECHO — 6 HP. Stereo-feedback delay (Tone.FeedbackDelay).
function mmbEcho() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_echo',
    categoryId: 'effect',
    variant: 'Feedback delay',
    brand: 'MMB', model: 'ECHO',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'ECHO', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'feedback delay', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('time',     'Time',  w*0.30, 30, { size: 'medium', min: 0.01, max: 0.5, def: 0.30, unit: 's',  color: '#f9fafb' }),
      knob('feedback', 'Fbk',   w*0.70, 30, { size: 'medium', min: 0,    max: 0.95,def: 0.45, color: '#f9fafb' }),
      knob('mix',      'Mix',   w*0.30, 70, { size: 'medium', min: 0,    max: 1,   def: 0.35, color: '#f9fafb' }),
      toggle('tempo_sync', 'Sync', w*0.70, 70, false),
      inPort ('time_cv', 'T+',  'cv',    w*0.18, 100),
      inPort ('fbk_cv',  'F+',  'cv',    w*0.38, 100),
      inPort ('mix_cv',  'M+',  'cv',    w*0.58, 100),
      inPort ('in',  'In',  'audio', w*0.30, 116),
      outPort('out', 'Out', 'audio', w*0.70, 116),
    ],
    notes: 'Feedback-delay met CV op tijd (sec), feedback en mix. Op de Teensy een AudioEffectDelay-feedbacklus (max 500 ms). Sync-toggle haakt later in op de master-clock.',
  });
}

// 11. MMB PHASER — 6 HP. Klassiek phaser-effect (Tone.Phaser).
function mmbPhaser() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_phaser',
    categoryId: 'effect',
    variant: 'Phaser',
    brand: 'MMB', model: 'PHASER',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'PHASER', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',    fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate',     'Rate',  w*0.30, 30, { size: 'medium', min: 0.1, max: 8, def: 0.5, unit: 'Hz', color: '#f9fafb' }),
      knob('depth',    'Depth', w*0.70, 30, { size: 'medium', min: 0,   max: 1, def: 0.7, color: '#f9fafb' }),
      knob('feedback', 'Fbk',   w*0.30, 70, { size: 'medium', min: 0,   max: 0.95, def: 0.3, color: '#f9fafb' }),
      knob('mix',      'Mix',   w*0.70, 70, { size: 'medium', min: 0,   max: 1, def: 0.5, color: '#f9fafb' }),
      inPort ('rate_cv',  'R+', 'cv',    w*0.18, 100),
      inPort ('depth_cv', 'D+', 'cv',    w*0.42, 100),
      inPort ('in',  'In',  'audio', w*0.30, 116),
      outPort('out', 'Out', 'audio', w*0.70, 116),
    ],
    notes: '6-traps all-pass phaser (custom AudioStream op de Teensy). CV op rate en depth. Klassieke sweep-modulatie; mooi achter een VCF of als send.',
  });
}

// 12. MMB OCTA-VCO — 20 HP. Multi-module met 8 identieke oscillator-cellen die
//     ALLE dezelfde control-set delen (wave/coarse/fine/level) plus een
//     gespreide detune. Firmware: tp_mmb_octa_vco (FW-PM-1). Eén v/oct-in en
//     één audio-out per cel; 'tune' is een gedeelde V/Oct-offset voor alle 8.
function mmbOctaVco() {
  const w = W(20);
  const colX = (i: number) => w * (0.08 + i * 0.119);          // 8 cell centres
  return assemble({
    typeId: 'tp_mmb_octa_vco',
    categoryId: 'vco',
    variant: 'Octa VCO (shared controls)',
    brand: 'MMB', model: 'OCTA-VCO-S',
    hp: 20, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'osc',
      label: 'Oscillator',
      count: 8,
      portIds: ['voct', 'out'],
      controlIds: [],   // shared-controls multi-module
    }],
    texts: [
      { x: w/2, y: 8,   text: 'OCTA-VCO-S',  fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'shared controls · 8 cells', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',         fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Shared (module-global) controls — apply to ALL 8 cells.
      sw  ('wave',   'Wave',   w*0.16, 30, ['Sin','Tri','Saw','Sqr'], 2),
      knob('coarse', 'Coarse', w*0.36, 34, { size: 'large',  min: -36, max: 36, def: 0,  unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.54, 34, { size: 'medium', min: -100, max: 100, def: 0, unit: 'ct',  color: '#f9fafb' }),
      knob('detune', 'Detune', w*0.70, 34, { size: 'medium', min: 0, max: 50, def: 0, unit: 'ct', color: '#f9fafb' }),
      knob('level',  'Level',  w*0.86, 34, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),

      // Per-cell ports — 8× v/oct in (top row) + 8× audio out (bottom row).
      ...Array.from({ length: 8 }, (_, i) =>
        inPort(`voct_${i+1}`, 'V/Oct', 'cv', colX(i), 92, { cellGroupId: 'osc' })),
      ...Array.from({ length: 8 }, (_, i) =>
        outPort(`out_${i+1}`, 'Out', 'audio', colX(i), 116, { cellGroupId: 'osc' })),

      // Shared tune (V/Oct offset) input — applies to all 8 cells.
      inPort ('tune', 'Tune', 'cv', w*0.50, 78),
    ],
    notes: 'Multi-module met 8 identieke oscillator-cellen die ALLE dezelfde control-set delen (wave/coarse/fine/level). \'detune\' spreidt de 8 cellen symmetrisch in cents voor een dikke supersaw/unison. Eén v/oct-in en één audio-out per cel; \'tune\' is een gedeelde V/Oct-offset. Firmware: tp_mmb_octa_vco (FW-PM-1).',
  });
}

// 13. MMB STRING — 6 HP. Karplus-Strong getokkelde snaar (FW-AU-8). Gate
//     tokkelt de snaar op de toonhoogte van V/Oct; 'pluck' regelt de
//     aanslag-helderheid.
function mmbString() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_string',
    categoryId: 'vco',
    variant: 'Karplus-Strong string',
    brand: 'MMB', model: 'STRING',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'STRING', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'Karplus-Strong', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('pluck', 'Pluck', w*0.30, 36, { size: 'medium', min: 0.01, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('level', 'Level', w*0.70, 36, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort ('voct',  'V/Oct',  'cv',    w*0.20, 92),
      inPort ('gate',  'Gate',  'gate',  w*0.50, 92),
      inPort ('pluck_cv', 'P+',  'cv',    w*0.80, 92),
      inPort ('level_cv', 'L+',  'cv',    w*0.20, 110),
      outPort('out',   'Out',   'audio', w*0.65, 110),
    ],
    notes: 'Karplus-Strong physical-modeling snaar (firmware tp_mmb_string, FW-AU-8). Een Gate rising-edge tokkelt de snaar op de toonhoogte uit V/Oct. \'pluck\' bepaalt de helderheid/ruisinhoud van de aanslag (0.01 dof … 1.0 helder); pluck en level zijn ook als CV bestuurbaar.',
  });
}

// 14. MMB ELEMENTS — 20 HP. Mutable Instruments Elements modal / physical-
//     modelling voice (FW-AU-9). Monofone voice: V/Oct + Gate in, stereo uit.
//     Paneel volgt de hardware-indeling: exciter-sectie links (wit/roze/cyaan
//     zoals MI), resonator rechts. Alle control-ids matchen de firmware
//     (`ElementsModule::setControl`); bow/blow/strike zijn continue levels.
function mmbElements() {
  const w = W(20);
  const col = (i: number): number => w * (0.09 + i * 0.164);   // 6 kolommen
  const rowA = 24, rowB = 46, rowC = 70, rowD = 90;
  return assemble({
    typeId: 'tp_mmb_elements',
    categoryId: 'vco',
    variant: 'Elements (MI)',
    brand: 'MI', model: 'ELEMENTS',
    hp: 20, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'ELEMENTS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'modal / physical modelling', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Rij A — envelope-contour + de drie continue exciter-levels + tuning.
      knob('envelope', 'Contour', col(0), rowA, { size: 'small', min: 0, max: 1, def: 1,   color: '#f9fafb' }),
      knob('bow',      'Bow',     col(1), rowA, { size: 'small', min: 0, max: 1, def: 0,   color: '#f9fafb' }),
      knob('blow',     'Blow',    col(2), rowA, { size: 'small', min: 0, max: 1, def: 0,   color: '#e11d48' }),
      knob('strike',   'Strike',  col(3), rowA, { size: 'small', min: 0, max: 1, def: 0.8, color: '#0891b2' }),
      knob('coarse',   'Coarse',  col(4), rowA, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',     'Fine',    col(5), rowA, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),
      // Rij B — meta-morphs (Flow/Mallet) + resonator-hoofdknoppen + FM.
      // FM: firmware mapt 0..1 → ±24 st (f×48−24); 0.5 = neutraal.
      knob('blow_meta',   'Flow',    col(1), rowB, { size: 'large', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('strike_meta', 'Mallet',  col(2), rowB, { size: 'large', min: 0, max: 1, def: 0.5, color: '#0891b2' }),
      knob('fm',          'FM',      col(3), rowB, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('geometry',    'Geometry',col(4), rowB, { size: 'large', min: 0, max: 1, def: 0.2, color: '#f9fafb' }),
      knob('brightness',  'Bright',  col(5), rowB, { size: 'large', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      // Rij C — timbres per exciter + resonator-detail.
      knob('bow_timbre',    'Bow Tim',   col(0), rowC, { size: 'small', min: 0, max: 1, def: 0.5,  color: '#f9fafb' }),
      knob('blow_timbre',   'Blow Tim',  col(1), rowC, { size: 'small', min: 0, max: 1, def: 0.5,  color: '#e11d48' }),
      knob('strike_timbre', 'Strike Tim',col(2), rowC, { size: 'small', min: 0, max: 1, def: 0.5,  color: '#0891b2' }),
      knob('damping',       'Damping',   col(3), rowC, { size: 'small', min: 0, max: 1, def: 0.25, color: '#f9fafb' }),
      knob('position',      'Position',  col(4), rowC, { size: 'small', min: 0, max: 1, def: 0.3,  color: '#f9fafb' }),
      knob('space',         'Space',     col(5), rowC, { size: 'small', min: 0, max: 1, def: 0.5,  color: '#f9fafb' }),
      // Rij D — exotica + uitgangsniveau.
      knob('signature',  'Signat', col(0), rowD, { size: 'small', min: 0, max: 1, def: 0,   color: '#9ca3af' }),
      knob('mod_freq',   'ModFrq', col(1), rowD, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      knob('mod_offset', 'ModOff', col(2), rowD, { size: 'small', min: 0, max: 1, def: 0.1, color: '#9ca3af' }),
      knob('level',      'Level',  col(5), rowD, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('voct',    'V/Oct',  'cv',    col(0), 108),
      inPort ('gate',    'Gate',   'gate',  col(1), 108),
      inPort ('strength','Str',    'cv',    col(2), 108),
      outPort('out_l',   'L',      'audio', col(4), 108),
      outPort('out_r',   'R',      'audio', col(5), 108),
    ],
    notes: 'Mutable Instruments Elements modal / physical-modelling voice (firmware tp_mmb_elements, FW-AU-9). V/Oct + Gate in, stereo uit (L/R). Exciters: Bow/Blow/Strike zijn continue levels (mengbaar, zoals de hardware); Flow/Mallet zijn de meta-morphs, Contour de exciter-envelope. FM: 0.5 = neutraal (±24 st bereik). Coarse/fine verschuiven de pitch t.o.v. V/Oct. Monofone voice; voor polyfonie plaats meerdere instanties in een PolyGroup.',
  });
}

// 14b. MMB RINGS — 14 HP. Mutable Instruments Rings resonator (FW-AU-11).
//     Strum via de gate-ingang; intern 1/2/4-stemmig (roterend per strum).
//     Control-ids matchen firmware RingsModule; stemsplit odd/even op L/R.
function mmbRings() {
  const w = W(14);
  const col = (i: number): number => w * (0.14 + i * 0.24);   // 4 kolommen
  return assemble({
    typeId: 'tp_mmb_rings',
    categoryId: 'vco',
    variant: 'Rings (MI resonator)',
    brand: 'MI', model: 'RINGS',
    hp: 14, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'RINGS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'resonator · strum', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('structure',  'Structure', col(0), 30, { size: 'large', min: 0, max: 1, def: 0.4, color: '#f9fafb' }),
      knob('brightness', 'Bright',    col(1), 30, { size: 'large', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('damping',    'Damping',   col(2), 30, { size: 'large', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('position',   'Position',  col(3), 30, { size: 'large', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      // Model: de 3 hoofdmodellen + de 3 "bonus"-modellen van de hardware.
      sw  ('model',     'Model', w*0.30, 62, ['Modal','Sympath','String','FM','Quant','Str+Rev'], 0),
      sw  ('polyphony', 'Poly',  w*0.72, 62, ['1','2','4'], 1),
      knob('coarse', 'Coarse', col(0), 88, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   col(1), 88, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),
      knob('level',  'Level',  col(3), 88, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('voct',  'V/Oct', 'cv',    col(0), 108),
      inPort ('gate',  'Strum', 'gate',  col(1), 108),
      outPort('out_l', 'Odd',   'audio', col(2), 108),
      outPort('out_r', 'Even',  'audio', col(3), 108),
      inPort ('structure_cv',  'S+', 'cv', col(0), 120),
      inPort ('brightness_cv', 'B+', 'cv', col(1), 120),
      inPort ('damping_cv',    'D+', 'cv', col(2), 120),
      inPort ('position_cv',   'P+', 'cv', col(3), 120),
    ],
    notes: 'Mutable Instruments Rings resonator (firmware tp_mmb_rings, FW-AU-11). Elke stijgende flank op Strum plukt de resonator op de huidige V/Oct-toonhoogte; Poly 2/4 laat strums over stemmen roteren (odd op L, even op R). Modellen: modal (klokken/marimba), sympathetic strings, string (Karplus-achtig), plus de FM/quantized/string+reverb bonus-modellen. Structure = inharmoniciteit/snaarkoppeling, Position = excitatiepunt.',
  });
}

// 14c. MMB PLAITS — 12 HP. Mutable Instruments Plaits macro-oscillator
//     (FW-AU-12): 16 synth-engines achter één engine-knop. Interne LPG
//     (decay/colour) vuurt per trigger op de gate-ingang.
function mmbPlaits() {
  const w = W(12);
  const col = (i: number): number => w * (0.16 + i * 0.34);   // 3 kolommen
  return assemble({
    typeId: 'tp_mmb_plaits',
    categoryId: 'vco',
    variant: 'Plaits (MI macro-osc)',
    brand: 'MI', model: 'PLAITS',
    hp: 12, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'PLAITS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '16 engines · macro-osc', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Engine-keuze: 0=VA 1=Waveshape 2=FM 3=Grain 4=Additive 5=Wavetable
      // 6=Chord 7=Speech 8=Swarm 9=Noise 10=Particle 11=String 12=Modal
      // 13=BassDrum 14=Snare 15=HiHat.
      knob   ('engine', 'Engine', w*0.28, 26, { size: 'medium', min: 0, max: 15, def: 0, step: 1, color: '#f9fafb' }),
      display('engDisp', w*0.66, 26, { digits: 2, style: 'led', bindTo: 'engine', format: 'int' }),
      knob('harmonics', 'Harmonics', col(0), 52, { size: 'large', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('timbre',    'Timbre',    col(1), 52, { size: 'large', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('morph',     'Morph',     col(2), 52, { size: 'large', min: 0, max: 1, def: 0.5, color: '#0891b2' }),
      knob('decay', 'Decay', col(0), 80, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('lpg',   'LPG',   col(1), 80, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('level', 'Level', col(2), 80, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('coarse', 'Coarse', col(0), 96, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   col(1), 96, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),

      inPort ('harmonics_cv', 'H+', 'cv', w*0.14, 106),
      inPort ('timbre_cv',    'T+', 'cv', w*0.50, 106),
      inPort ('morph_cv',     'M+', 'cv', w*0.86, 106),
      inPort ('voct', 'V/Oct', 'cv',    w*0.14, 118),
      inPort ('gate', 'Trig',  'gate',  w*0.38, 118),
      outPort('out',  'Out',   'audio', w*0.62, 118),
      outPort('aux',  'Aux',   'audio', w*0.86, 118),
    ],
    notes: 'Mutable Instruments Plaits macro-oscillator (firmware tp_mmb_plaits, FW-AU-12). Eén knop kiest uit 16 engines: 0 VA · 1 Waveshape · 2 FM · 3 Grain · 4 Additive · 5 Wavetable · 6 Chord · 7 Speech · 8 Swarm · 9 Noise · 10 Particle · 11 String · 12 Modal · 13 BassDrum · 14 Snare · 15 HiHat. Harmonics/Timbre/Morph zijn de drie macro-parameters (per engine anders). De interne low-pass-gate (Decay/LPG) vuurt per Trig; Aux draagt de engine-variant. CV-ingangen: harmonics_cv/timbre_cv/morph_cv/level_cv (alias zonder _cv werkt ook).',
  });
}

// 14d. MMB CLOUDS — 14 HP. Mutable Instruments Clouds granular processor
//     (FW-FX-4): stereo in → korrelwolk → stereo uit. 4 playback-modes.
function mmbClouds() {
  const w = W(14);
  const col = (i: number): number => w * (0.12 + i * 0.19);   // 5 kolommen
  return assemble({
    typeId: 'tp_mmb_clouds',
    categoryId: 'effect',
    variant: 'Clouds (MI granular)',
    brand: 'MI', model: 'CLOUDS',
    hp: 14, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'CLOUDS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'granular · texture', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('position', 'Position', col(0), 28, { size: 'large', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('size',     'Size',     col(1), 28, { size: 'large', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('pitch',    'Pitch',    col(2), 28, { size: 'large', min: -24, max: 24, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('density',  'Density',  col(3), 28, { size: 'large', min: 0, max: 1, def: 0.6, color: '#e11d48' }),
      knob('texture',  'Texture',  col(4), 28, { size: 'large', min: 0, max: 1, def: 0.5, color: '#0891b2' }),
      knob('mix',      'Mix',      col(0), 56, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('spread',   'Spread',   col(1), 56, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('feedback', 'Feedbk',   col(2), 56, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('reverb',   'Reverb',   col(3), 56, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('level',    'Level',    col(4), 56, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      // 0=Granular 1=Stretch 2=Looping-delay 3=Spectral.
      sw    ('mode',   'Mode',   w*0.28, 80, ['Gran','Strch','Loop','Spect'], 0),
      toggle('freeze', 'Freeze', w*0.72, 80),

      inPort ('in_l',   'In L',  'audio', col(0), 102),
      inPort ('in_r',   'In R',  'audio', col(1), 102),
      inPort ('freeze', 'Frz',   'gate',  col(2), 102),
      inPort ('trig',   'Trig',  'gate',  col(3), 102),
      inPort ('size_cv', 'S+',   'cv',    col(4), 102),
      outPort('out_l',  'Out L', 'audio', col(2), 118),
      outPort('out_r',  'Out R', 'audio', col(3), 118),
      inPort ('position_cv', 'P+', 'cv', col(0), 118),
      inPort ('density_cv',  'D+', 'cv', col(1), 118),
      inPort ('texture_cv',  'T+', 'cv', col(4), 118),
    ],
    notes: 'Mutable Instruments Clouds granular processor (firmware tp_mmb_clouds, FW-FX-4). Stereo in → korrelwolk → stereo uit; mono-bron op In L werkt ook. Freeze bevriest de audiobuffer (jack of toggle), Trig vuurt één korrel. Modes: granular / pitch-stretch / looping delay / spectral. CV-ingangen: position/density/texture (ook size_cv/pitch_cv/mix_cv via kabel). Let op: één instantie kost ~26% CPU en ~180 KB heap.',
  });
}

// 14e. MMB TIDES — 10 HP. Mutable Instruments Tides (tides2) slope-generator
//     (FW-CV-1): CV-domein op de 1 kHz-tick — LFO/envelope tot ~100 Hz,
//     vier samenhangende uitgangen.
function mmbTides() {
  const w = W(10);
  const col = (i: number): number => w * (0.16 + i * 0.34);
  return assemble({
    typeId: 'tp_mmb_tides',
    categoryId: 'lfo',
    variant: 'Tides (MI slopes)',
    brand: 'MI', model: 'TIDES',
    hp: 10, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'TIDES', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'slopes · 4 uitgangen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate',  'Rate',  w/2, 26, { size: 'large', min: 0.01, max: 100, def: 2, unit: 'Hz', color: '#f9fafb' }),
      // mode: 0=AD (envelope) 1=Loop (LFO) 2=AR (gate-envelope).
      sw  ('mode',   'Mode',   w*0.28, 50, ['AD','Loop','AR'], 1),
      // output: wat de 4 uitgangen betekenen. Default Phase (quadratuur):
      // Ampl geeft met Shift op het midden op álle uitgangen exact 0.
      sw  ('output', 'Out',    w*0.72, 50, ['Gates','Ampl','Phase','Freq'], 2),
      knob('shape',  'Shape',  w*0.14, 72, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('slope',  'Slope',  w*0.38, 72, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('smooth', 'Smooth', w*0.62, 72, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('shift',  'Shift',  w*0.86, 72, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      inPort ('shape_cv',  'Sh+', 'cv', w*0.14, 84),
      inPort ('slope_cv',  'Sl+', 'cv', w*0.38, 84),
      inPort ('smooth_cv', 'Sm+', 'cv', w*0.62, 84),
      inPort ('shift_cv',  'Sf+', 'cv', w*0.86, 84),

      inPort ('gate',    'Gate', 'gate', w*0.30, 102),
      inPort ('rate_cv', 'R+',   'cv',   w*0.70, 102),
      outPort('out1', '1', 'cv', w*0.14, 118),
      outPort('out2', '2', 'cv', w*0.38, 118),
      outPort('out3', '3', 'cv', w*0.62, 118),
      outPort('out4', '4', 'cv', w*0.86, 118),
    ],
    notes: 'Mutable Instruments Tides (tides2) slope-generator (firmware tp_mmb_tides, FW-CV-1). CV-domein op de 1 kHz-tick: LFO/envelope tot ~100 Hz. Mode: AD = trigger-envelope, Loop = LFO, AR = gate-envelope. Out-mode bepaalt de 4 uitgangen: Gates (slope+EOA+EOR), Ampl (4 niveaus via Shift), Phase (4 fasen — quadratuur-LFO!), Freq (4 gerelateerde snelheden). Rate-CV is exponentieel (±1 = ±1 octaaf). Uitgangen genormaliseerd (fullscale ≈ 1.0). Let op (upstream-gedrag): in Ampl-mode kiest Shift het actieve kanaal — op precies 0.5 zijn alle vier de uitgangen 0.',
  });
}

// 14f. MMB MARBLES — 14 HP. Mutable Instruments Marbles: generatieve
//     random-sequencer in het CV-domein (FW-CV-2). t1/t2 = random gates,
//     x1..x3 = gekwantiseerde random-CV's (volts → direct op V/Oct!),
//     y = trage random-CV. Déjà-vu rond 0.5 bevriest de loop.
function mmbMarbles() {
  const w = W(14);
  const col = (i: number): number => w * (0.10 + i * 0.135);   // 7 kolommen
  return assemble({
    typeId: 'tp_mmb_marbles',
    categoryId: 'sequencer',
    variant: 'Marbles (MI random)',
    brand: 'MI', model: 'MARBLES',
    hp: 14, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MARBLES', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'random · déjà vu', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w*0.25, y: 20, text: '— t —', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w*0.75, y: 20, text: '— X —', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('tempo',  'Tempo',  w*0.25, 32, { size: 'large', min: 10, max: 480, def: 120, unit: 'bpm', color: '#f9fafb' }),
      knob('spread', 'Spread', w*0.75, 32, { size: 'large', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('bias',   'Bias',   w*0.12, 56, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('jitter', 'Jitter', w*0.37, 56, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('xbias',  'Bias X', w*0.62, 56, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('steps',  'Steps',  w*0.87, 56, { size: 'small', min: 0, max: 1, def: 0.5, color: '#0891b2' }),
      knob('dejavu', 'Déjà vu', w*0.25, 76, { size: 'medium', min: 0, max: 1, def: 0, color: '#0891b2' }),
      knob('length', 'Loop',    w*0.55, 76, { size: 'small', min: 1, max: 16, def: 8, step: 1, color: '#f9fafb' }),
      // 0=Bernoulli (muntje t1/t2), 1=clusters, 2=drums.
      sw ('model', 'Model', w*0.85, 76, ['Coin','Clus','Drum'], 0),
      sw ('scale', 'Scale', w*0.18, 93, ['Maj','Min','Pent','Pelog','Bhai','Shri'], 0),
      sw ('range', 'Range', w*0.50, 93, ['+2V','+5V','±5V'], 2),
      toggle('extclock', 'ExtClk', w*0.82, 93),

      inPort ('clock',     'Clk', 'gate', col(0), 106),
      inPort ('rate_cv',   'R+',  'cv',   col(2), 106),
      inPort ('dejavu_cv', 'DV+', 'cv',   col(4), 106),
      inPort ('spread_cv', 'Sp+', 'cv',   col(6), 106),
      outPort('t1',   't1', 'gate', col(0), 119),
      outPort('t2',   't2', 'gate', col(1), 119),
      outPort('tclk', 'tK', 'gate', col(2), 119),
      outPort('x1',   'X1', 'cv',   col(3), 119),
      outPort('x2',   'X2', 'cv',   col(4), 119),
      outPort('x3',   'X3', 'cv',   col(5), 119),
      outPort('y',    'Y',  'cv',   col(6), 119),
    ],
    notes: 'Mutable Instruments Marbles (firmware tp_mmb_marbles, FW-CV-2): generatieve random-sequencer in het CV-domein (1 kHz-tick). t1/t2 zijn random gates rond de interne klok (Tempo, of ExtClk + Clk-jack); tK is de master-klok. X1..X3 zijn gekwantiseerde random-CV\'s in volts — patch X1 direct op een V/Oct-ingang en kies een Scale. Déjà vu rond 0.5 bevriest de loop (Loop = lengte); Steps maakt gladde CV\'s trapsgewijs; Spread/Bias X sturen de spreiding. Y is een trage random-CV (klok ÷16). Range: octaafbereik van X (±5V = ±5 octaven rond C4).',
  });
}

// 14g. MMB DX7 — 8 HP. Yamaha DX7-stem op de msfa-engine (Dexed-kern,
//     FW-AU-13). Eén stem per instantie (poly via polyExpand); program
//     kiest voice 0–31 uit de gedeelde bank (laden via Teensy-modal, .syx).
function mmbDx7() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_dx7',
    categoryId: 'vco',
    variant: 'DX7 (msfa 6-op FM)',
    brand: 'MMB', model: 'DX7',
    hp: 8, texture: 'pcb-black', baseColor: '#1e1b4b', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'DX7', fontSize: 2.6, color: '#a5b4fc', align: 'middle' },
      { x: w/2, y: 13,  text: '6-op FM · msfa', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Bank 0-7 = ingebouwde factory-ROMs (1A/1B/2A/2B/3A/3B/4A/4B),
      // 8 = USER (.syx via de Teensy-modal). Voice-namen: dx7BankNames.ts.
      knob   ('bank', 'Bank', w*0.32, 24, { size: 'small', min: 0, max: 8, def: 0, step: 1, color: '#a5b4fc', ticks: { every: 1, highlight: [0, 8] } }),
      display('bnkDisp', w*0.72, 24, { digits: 2, style: 'led', bindTo: 'bank', format: 'int' }),
      knob   ('program', 'Program', w*0.32, 44, { size: 'medium', min: 0, max: 31, def: 0, step: 1, color: '#a5b4fc' }),
      display('prgDisp', w*0.72, 44, { digits: 2, style: 'led', bindTo: 'program', format: 'int' }),
      // Groot groen naam-display: lookup[bank][program] → voice-naam.
      // Bank 8 (USR) toont 'USER nn' tot er een .syx geladen is.
      display('voiceName', w/2, 60, {
        digits: 10, style: 'led-green', size: 'large',
        bindTo: 'program', bindTo2: 'bank',
        lookup: [...DX7_VOICE_NAMES, Array.from({ length: 32 }, (_, i) => `USER ${i}`)],
        text: '----------',
      }),
      knob('coarse', 'Coarse', w*0.25, 76, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.75, 76, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),
      knob('level',  'Level',  w/2,    90, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('voct', 'V/Oct', 'cv',    w*0.20, 102),
      inPort ('gate', 'Gate',  'gate',  w*0.50, 102),
      inPort ('vel',  'Vel',   'cv',    w*0.80, 102),
      outPort('out',  'Out',   'audio', w/2,    118),
    ],
    notes: 'Yamaha DX7-stem op de msfa-engine (Apache-2.0, dezelfde kern als Dexed/MicroDexed; firmware tp_mmb_dx7, FW-AU-13). Eén stem per instantie — polyfoon via de Poly-seeds. De 8 Yamaha factory-ROMs (1A..4B) zitten ingebouwd in de firmware-flash; Bank kiest de ROM en Program de voice 0–31 (namen: zie dx7BankNames.ts — de firmware logt de naam bij elke wissel). Bank USR = eigen 32-voice .syx, geladen via de Teensy-modal (🎹 DX7-bank); zonder upload klinkt USR als E.PIANO 1. Velocity stuurt de FM-envelopes zoals op het origineel; pitch is fractioneel (V/Oct + Coarse/Fine via de interne pitch-mod).',
  });
}

// 15. MMB COMP — 6 HP. Feed-forward compressor met lichte tanh-overdrive
//     (firmware tp_mmb_comp, FW-FX-2). De Audio-lib heeft geen compressor,
//     dus dit is een custom AudioStream.
function mmbComp() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_comp',
    categoryId: 'effect',
    variant: 'Compressor + overdrive',
    brand: 'MMB', model: 'COMP',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'COMP', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'comp + drive', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('threshold', 'Thr',   w*0.28, 30, { size: 'medium', min: -48, max: 0, def: -18, unit: 'dB', color: '#f9fafb' }),
      knob('ratio',     'Ratio', w*0.72, 30, { size: 'medium', min: 1, max: 20, def: 4, unit: ':1', color: '#f9fafb' }),
      knob('attack',    'Atk',   w*0.28, 60, { size: 'small', min: 0.1, max: 100, def: 10, unit: 'ms', color: '#f9fafb' }),
      knob('release',   'Rel',   w*0.72, 60, { size: 'small', min: 5, max: 1000, def: 120, unit: 'ms', color: '#f9fafb' }),
      knob('makeup',    'Gain',  w*0.28, 86, { size: 'small', min: 0, max: 24, def: 0, unit: 'dB', color: '#f9fafb' }),
      knob('drive',     'Drive', w*0.72, 86, { size: 'small', min: 0, max: 1, def: 0.2, color: '#f9fafb' }),
      inPort ('thr_cv',   'T+', 'cv',    w*0.16, 104),
      inPort ('drive_cv', 'D+', 'cv',    w*0.40, 104),
      inPort ('in',  'In',  'audio', w*0.30, 118),
      outPort('out', 'Out', 'audio', w*0.70, 118),
    ],
    notes: 'Feed-forward peak-compressor met makeup-gain en een tanh soft-clip overdrive (firmware tp_mmb_comp, FW-FX-2). De Teensy Audio-lib heeft geen kant-en-klare compressor; dit is een custom AudioStream. \'drive\' voegt na de compressie warme saturatie toe; threshold en drive zijn ook als CV bestuurbaar.',
  });
}

// 15. MMB STEREO-VCA — 6 HP. Eén audio-in → L/R-out met vol- en pan-CV
//     (firmware tp_mmb_stereo_vca, FW-AU-1). Pan-CV: 0 = midden, −1 = links,
//     +1 = rechts, equal-power.
function mmbStereoVca() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_stereo_vca',
    categoryId: 'effect',
    variant: 'Stereo VCA / panner',
    brand: 'MMB', model: 'ST-VCA',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'ST-VCA', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'vol + pan', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('vol', 'Vol', w*0.30, 36, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('pan', 'Pan', w*0.70, 36, { size: 'medium', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      inPort ('vol_cv', 'V+',  'cv',    w*0.20, 86),
      inPort ('pan_cv', 'P+',  'cv',    w*0.50, 86),
      inPort ('in',     'In',  'audio', w*0.80, 86),
      outPort('l',      'L',   'audio', w*0.32, 112),
      outPort('r',      'R',   'audio', w*0.68, 112),
    ],
    notes: 'Stereo-VCA/panner: één audio-in waaiert naar L+R. \'vol\' regelt het totale niveau, \'pan\' de balans (equal-power). Pan-CV: 0 = midden, −1 = hard links, +1 = hard rechts. Firmware tp_mmb_stereo_vca (FW-AU-1).',
  });
}

// 16. MMB FM-VCO — 8 HP. 2-operator FM: een audio-in moduleert de frequentie
//     (firmware tp_mmb_fm_vco, FW-AU-4). Voed de carrier met een tweede VCO
//     voor klassieke FM-timbres.
function mmbFmVco() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_fm_vco',
    categoryId: 'vco',
    variant: 'FM VCO (2-op)',
    brand: 'MMB', model: 'FM-VCO',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'FM-VCO', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('wave',   'Wave',   w/2,    22, ['Sin','Tri','Saw','Sqr'], 0),
      knob('coarse', 'Coarse', w*0.30, 50, { size: 'large',  min: -36, max: 36, def: 0,  unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.70, 50, { size: 'medium', min: -100, max: 100, def: 0, unit: 'ct',  color: '#f9fafb' }),
      knob('fm_amt', 'FM',     w*0.30, 78, { size: 'medium', min: 0, max: 4, def: 1, unit: 'oct', color: '#f9fafb' }),
      knob('level',  'Level',  w*0.70, 78, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort ('voct', '1V/Oct', 'cv',    w*0.18, 104),
      inPort ('tune', 'Tune',   'cv',    w*0.40, 104),
      inPort ('fm',   'FM',     'audio', w*0.62, 104),
      outPort('out',  'Out',    'audio', w*0.86, 104),
    ],
    notes: 'Twee-operator FM-oscillator (AudioSynthWaveformModulated). De audio-FM-ingang moduleert de carrier-frequentie; \'fm_amt\' is de FM-diepte in octaven. Voed FM met een tweede VCO (de modulator) voor klassieke DX-achtige timbres. Firmware tp_mmb_fm_vco (FW-AU-4).',
  });
}

// 17. MMB COMB — 6 HP. Comb-/resonator-filter: getunede feedback-delay
//     bestuurd via V/Oct (firmware tp_mmb_comb, FW-AU-3). Bij hoge feedback
//     een gestemde resonator; mooi met ruis als excitatie.
function mmbComb() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_comb',
    categoryId: 'effect',
    variant: 'Comb / resonator',
    brand: 'MMB', model: 'COMB',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'COMB', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'tuned resonator', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('coarse',   'Tune', w*0.30, 30, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('feedback', 'Fbk',  w*0.70, 30, { size: 'medium', min: 0, max: 0.99, def: 0.9, color: '#f9fafb' }),
      knob('mix',      'Mix',  w*0.30, 70, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      inPort ('freq_cv', 'V/Oct', 'cv', w*0.18, 100),
      inPort ('fbk_cv',  'F+',  'cv',   w*0.42, 100),
      inPort ('mix_cv',  'M+',  'cv',   w*0.66, 100),
      inPort ('in',  'In',  'audio', w*0.30, 116),
      outPort('out', 'Out', 'audio', w*0.70, 116),
    ],
    notes: 'Comb-filter / resonator: een getunede feedback-delay (0.2–50 ms). De V/Oct-ingang stemt de toonhoogte (0V = C4); \'coarse\' is een semitone-offset. Bij hoge feedback wordt het een gestemde resonator — voed het met ruis of een puls voor plucked/blown timbres. Firmware tp_mmb_comb (FW-AU-3).',
  });
}

// 18. MMB WT-VCO — 8 HP. Wavetable-oscillator: 6 banks additieve golfvormen
//     (firmware tp_mmb_wt_vco, FW-AU-5).
function mmbWtVco() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_wt_vco',
    categoryId: 'vco',
    variant: 'Wavetable VCO',
    brand: 'MMB', model: 'WT-VCO',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'WT-VCO', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('bank',   'Bank',   w/2,    22, ['Saw','Sqr','Tri','Organ','Pulse','Vocal'], 0),
      knob('coarse', 'Coarse', w*0.30, 58, { size: 'large',  min: -36, max: 36, def: 0,  unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.70, 58, { size: 'medium', min: -100, max: 100, def: 0, unit: 'ct',  color: '#f9fafb' }),
      knob('level',  'Level',  w/2,    84, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort ('voct', '1V/Oct', 'cv',    w*0.25, 104),
      inPort ('tune', 'Tune',   'cv',    w*0.50, 104),
      outPort('out',  'Out',    'audio', w*0.78, 104),
    ],
    notes: 'Wavetable-oscillator met 6 banks (saw, square, triangle, orgel, 25%-pulse, vocaal/formant) — additief opgebouwd op de Teensy via arbitraryWaveform. \'bank\' kiest de golfvorm; coarse/fine zijn pitch-offsets t.o.v. V/Oct. Firmware tp_mmb_wt_vco (FW-AU-5).',
  });
}

// 19. MMB DRAW-VCO — 8 HP. Teken je eigen golfvorm in de editor en push die
//     live naar de oscillator (firmware tp_mmb_draw_vco, FW-AU-6). De draw-UI
//     stuurt een 'wavetable'-frame; firmware resamplet naar 256 punten.
function mmbDrawVco() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_draw_vco',
    categoryId: 'vco',
    variant: 'Draw-waveshape VCO',
    brand: 'MMB', model: 'DRAW-VCO',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'DRAW-VCO', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    decorations: [
      { kind: 'rect', x: w*0.12, y: 22, w: w*0.76, h: 30, color: '#0b1220' },
    ],
    items: [
      knob('coarse', 'Coarse', w*0.30, 70, { size: 'medium', min: -36, max: 36, def: 0,  unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.70, 70, { size: 'medium', min: -100, max: 100, def: 0, unit: 'ct',  color: '#f9fafb' }),
      knob('level',  'Level',  w/2,    92, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort ('voct', '1V/Oct', 'cv',    w*0.25, 110),
      inPort ('tune', 'Tune',   'cv',    w*0.50, 110),
      outPort('out',  'Out',    'audio', w*0.78, 110),
    ],
    notes: 'Teken-golfvorm-oscillator: de editor stuurt een single-cycle tabel via het \'wavetable\'-serieframe (FW-LIVE-1) en de firmware resamplet naar 256 punten. De zwarte balk is de teken-zone (UI volgt). coarse/fine zijn pitch-offsets t.o.v. V/Oct. Firmware tp_mmb_draw_vco (FW-AU-6).',
  });
}

// 20. MMB STK-SOUND — 8 HP. Multi-sound physical-modelling voice via STK
//     (firmware tp_mmb_stk_sound, FW-AU-10). Sound-keuze via rotary switch.
function mmbStkSound() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_stk_sound',
    categoryId: 'vco',
    variant: 'STK Sound (multi)',
    brand: 'MMB', model: 'STK-SOUND',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'STK-SOUND', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'physical modelling', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('sound',  'Sound',   w/2,    22, ['Plucked','Clarinet','Bowed','Flute','Brass','Saxophony','BlowHole','BandedWG','Mandolin'], 0),
      knob('level',  'Level',   w*0.30, 54, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('timbre', 'Timbre',  w*0.70, 54, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('modulation', 'Mod', w*0.30, 84, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('strength','Str',    w*0.70, 84, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort ('voct',   'V/Oct',   'cv',   w*0.20, 108),
      inPort ('gate',   'Gate',    'gate',  w*0.45, 108),
      inPort ('strength','Str+',   'cv',   w*0.20, 120),
      inPort ('timbre',  'Tim+',   'cv',   w*0.45, 120),
      inPort ('modulation','Mod+', 'cv',   w*0.70, 108),
      outPort('out',    'Out',     'audio', w*0.75, 120),
    ],
    notes: 'Multi-sound physical-modelling voice (firmware tp_mmb_stk_sound, FW-AU-10). De sound-selector kiest welk STK-algoritme actief is: Plucked (getokkelde snaar, Karplus-Strong), Clarinet (riet), Bowed (gestreken snaar), Flute (fluit), Brass (koper), Saxophony (saxofoon), BlowHole (enkelriet+klankgat), BandedWG (modale/waveguide) of Mandolin (commuted synthesis, geëmbedde body-samples). Alle CV-ingangen tellen op bij de knopwaarde. Monofone voice; polyfonie via PolyGroup.',
  });
}

// ── public entry ───────────────────────────────────────────────────────
/** Plaats interne modules in (en creëer eventueel) de `rack_internal`. */
export function seedInternals(project: ModularProject): ModularProject {
  const all = [mmbAhdsr(), mmbLfo(), mmbSh(), mmbVco(), mmbQuadVcoShared(), mmbOctaVco(), mmbQuadMixerShared(), mmbVcf(), mmbLadder(), mmbMs20(), mmbVca(), mmbOut(), mmbMidiIn(), mmbCvMath(), mmbMixer(), mmbMixer8(), mmbMixer16(), mmbSeq8(), mmbString(), mmbElements(), mmbRings(), mmbPlaits(), mmbClouds(), mmbTides(), mmbMarbles(), mmbDx7(), mmbComp(), mmbNoise(), mmbEcho(), mmbPhaser(), mmbStereoVca(), mmbFmVco(), mmbComb(), mmbWtVco(), mmbDrawVco(), mmbStkSound()];
  const newTypes = all.map((x) => x.type);

  // Upgrade-pad: bestaande interne types worden in-place VERVANGEN (zelfde
  // id), zodat paneel-wijzigingen na een re-seed zichtbaar worden. Alleen
  // echt nieuwe types krijgen een prototype-module + rackslot. Geplaatste
  // instanties van een geüpgraded type krijgen het nieuwe visual mee
  // (positie/controlState blijven staan).
  const existingIds = new Set(project.moduleTypes.map((t) => t.id));
  const upgraded = newTypes.filter((t) => existingIds.has(t.id));
  const brandNew  = all.filter((x) => !existingIds.has(x.type.id));
  const visualByType = new Map(all.map((x) => [x.type.id, x.module.visual]));
  const newModules = brandNew.map((x) => x.module);

  // Zorg dat het interne rack bestaat
  let racks = project.racks.slice();
  let internal = racks.find((r) => r.kind === 'internal' || r.id === 'rack_internal');
  if (!internal) {
    internal = {
      id: 'rack_internal', name: 'MMB Brain (intern)',
      description: 'Virtueel rack voor brain-modules.',
      rows: 1, hpPerRow: 64, slots: [], kind: 'internal',
    };
    racks = [...racks, internal];
  }

  // Auto-grow: voeg HP toe als ze niet passen
  const totalHpNew = newModules.reduce((s, m) => s + m.visual.hpWidth, 0);
  const usedHp = internal.slots.reduce((mx, s) => {
    const m = project.modules.find((x) => x.id === s.moduleId);
    return Math.max(mx, s.hpOffset + (m?.visual.hpWidth ?? 0));
  }, 0);
  const needed = usedHp + totalHpNew;
  const grownHpPerRow = Math.max(internal.hpPerRow, Math.ceil(needed / Math.max(1, internal.rows)));

  let offset = usedHp;
  const addSlots: RackSlot[] = [];
  for (const m of newModules) {
    addSlots.push({ id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset });
    offset += m.visual.hpWidth;
  }

  const updatedRacks = racks.map((r) =>
    r.id === internal!.id
      ? { ...r, hpPerRow: grownHpPerRow, slots: [...r.slots, ...addSlots] }
      : r);

  const upgradedIds = new Set(upgraded.map((t) => t.id));
  return {
    ...project,
    // map + dedupe: eerdere seedInternals-runs stapelden duplicaten van
    // dezelfde type-ids op — alleen de eerste blijft (geüpgraded).
    moduleTypes: [
      ...project.moduleTypes
        .map((t) => upgradedIds.has(t.id)
          ? newTypes.find((n) => n.id === t.id)! : t)
        .filter((t, i, arr) => !upgradedIds.has(t.id)
          || arr.findIndex((u) => u.id === t.id) === i),
      ...brandNew.map((x) => x.type),
    ],
    modules: [
      ...project.modules.map((m) => visualByType.has(m.typeId)
        ? { ...m, visual: visualByType.get(m.typeId)! } : m),
      ...newModules,
    ],
    racks: updatedRacks,
  };
}

export function seedExampleModules(project: ModularProject): ModularProject {
  const all = [mutantSnare(), elements(), shelvesPlusExp(), rs110(), fusionVco(), richterOsc2()];
  const newTypes = all.map((x) => x.type);
  const newModules = all.map((x) => x.module);

  const rackId = project.activeRackId ?? project.racks[0]?.id;
  const racks = project.racks.map((r) => {
    if (r.id !== rackId) return r;
    const occupancy: number[] = Array(r.rows).fill(0).map((_, row) => {
      const used = r.slots.filter((s) => s.row === row);
      return used.reduce((mx, s) => {
        const mod = project.modules.find((m) => m.id === s.moduleId);
        const hp = mod?.visual.hpWidth ?? 0;
        return Math.max(mx, s.hpOffset + hp);
      }, 0);
    });
    const newSlots: RackSlot[] = [];
    for (const m of newModules) {
      let placed = false;
      for (let row = 0; row < r.rows && !placed; row++) {
        const occ = occupancy[row] ?? 0;
        if (occ + m.visual.hpWidth <= r.hpPerRow) {
          newSlots.push({ id: uid('slot'), moduleId: m.id, row, hpOffset: occ });
          occupancy[row] = occ + m.visual.hpWidth;
          placed = true;
        }
      }
    }
    return { ...r, slots: [...r.slots, ...newSlots] };
  });

  return {
    ...project,
    moduleTypes: [...project.moduleTypes, ...newTypes],
    modules:     [...project.modules, ...newModules],
    racks,
  };
}

/** Maak een nieuw "Test rack" + "Test patch" met VCO→VCF→VCA→OUT en
 *  ENV→VCA, klaar om in de Simulatie-tab af te spelen. Zorgt automatisch
 *  dat de benodigde MMB-modules (incl. internals) bestaan. */
export function seedTestPatch(project: ModularProject): ModularProject {
  // 1. Verzeker dat alle internals (incl. VCO/VCF/VCA/OUT/ENV/SEQ) bestaan.
  const needed = ['tp_mmb_vco','tp_mmb_vcf','tp_mmb_vca','tp_mmb_out','tp_mmb_ahdsr','tp_mmb_seq8','tp_mmb_midiin'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  let p = missing ? seedInternals(project) : project;

  // 2. Maak nieuw fysiek rack met fresh modules.
  const types = p.moduleTypes;
  function fresh(typeId: string): ModuleInstance {
    const t = types.find((x) => x.id === typeId)!;
    const proto = p.modules.find((m) => m.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false,
             name: `${proto.brand ?? ''} ${proto.modelNumber ?? ''} (test)`.trim(),
             // copy visual via reference is fine (read-only at render time).
             visual: proto.visual };
    void t;
  }
  const seq = fresh('tp_mmb_seq8');
  const mi  = fresh('tp_mmb_midiin');
  const vco = fresh('tp_mmb_vco');
  const vcf = fresh('tp_mmb_vcf');
  const vca = fresh('tp_mmb_vca');
  const env = fresh('tp_mmb_ahdsr');
  const out = fresh('tp_mmb_out');

  // 3. Layout: één rij, achter elkaar.
  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const slot: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return slot;
  };
  const rackHp = seq.visual.hpWidth + mi.visual.hpWidth + vco.visual.hpWidth + vcf.visual.hpWidth
               + vca.visual.hpWidth + env.visual.hpWidth + out.visual.hpWidth;
  const rack: Rack = {
    id: uid('rack'), name: 'Test rack',
    description: 'Automatisch gegenereerd door "Test-patch": SEQ + MIDI-IN → VCO → VCF → VCA → OUT met ENV → VCA.',
    rows: 1, hpPerRow: Math.max(64, rackHp + 4),
    slots: [place(seq), place(mi), place(vco), place(vcf), place(vca), place(env), place(out)],
    kind: 'physical',
  };

  // 4. Patch met cables.
  const c = (from: { m: ModuleInstance; port: string }, to: { m: ModuleInstance; port: string }): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: from.m.id, portId: from.port },
    to:   { moduleId: to.m.id,   portId: to.port },
  });
  const connections: PatchConnection[] = [
    c({ m: vco, port: 'out' }, { m: vcf, port: 'in'  }),
    c({ m: vcf, port: 'out' }, { m: vca, port: 'in'  }),
    c({ m: vca, port: 'out' }, { m: out, port: 'l'   }),
    c({ m: vca, port: 'out' }, { m: out, port: 'r'   }),
    c({ m: env, port: 'cv_out' }, { m: vca, port: 'cv' }),
    // Sequencer drives toonhoogte (V/Oct) en envelope-gate.
    c({ m: seq, port: 'cv'       }, { m: vco, port: 'voct' }),
    c({ m: seq, port: 'gate_out' }, { m: env, port: 'gate' }),
    // MIDI-In parallel — als de sequencer uit staat, neemt deze het over
    // (keyboard / screen-keys / test-sequence → dezelfde VCO + envelope).
    c({ m: mi,  port: 'pitch'    }, { m: vco, port: 'voct' }),
    c({ m: mi,  port: 'gate'     }, { m: env, port: 'gate' }),
  ];

  // 5. Default control state — direct hoorbaar bij Start.
  const controlState: Record<string, Record<string, ControlValue>> = {
    [vco.id]: { wave: 2, coarse: 0, fine: 0, level: 0.8 },          // saw, A4-ish
    [vcf.id]: { cutoff: 2500, q: 0.7, cv_amt: 1, type: 0 },         // LP
    [vca.id]: { gain: 0, resp: 0 },                                 // closed; env opens it
    [env.id]: { attack: 5, hold: 0, decay: 200, sustain: 0.6, release: 400, loop: false, curve: 1 },
    [out.id]: { level: 0.8 },
    [seq.id]: { s1: 0, s2: 4, s3: 7, s4: 12, s5: 7, s6: 0, s7: 5, s8: 3,
                root: 60, rate: 4, gate: 0.5, length: 6, run: 0 },
    [mi.id]:  { channel: 0, priority: 0, steal: 0, legato: 0 },
  };

  const patch: Patch = {
    id: uid('patch'), name: 'Test patch',
    description: 'Simpele subtractieve synth: VCO → VCF → VCA met envelope op de VCA.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections,
    controlState,
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, seq, mi, vco, vcf, vca, env, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/** Test-patch voor de CV-bridge: MidiIn → VCO + 2×AHDSR (filter-env + amp-env),
 *  velocity via CvMath(mult) → VCA, filter-env → VCF.
 *  Requires seedInternals() zodat tp_mmb_cvmath beschikbaar is. */
export function seedCvBridgePatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_vco','tp_mmb_vcf','tp_mmb_vca','tp_mmb_out',
                  'tp_mmb_ahdsr','tp_mmb_midiin','tp_mmb_cvmath'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  let p = missing ? seedInternals(project) : project;

  const types = p.moduleTypes;
  function fresh(typeId: string): ModuleInstance {
    const proto = p.modules.find((m) => m.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  }

  const mi      = fresh('tp_mmb_midiin');
  const vco     = fresh('tp_mmb_vco');
  const vcf     = fresh('tp_mmb_vcf');
  const vca     = fresh('tp_mmb_vca');
  const envAmp  = fresh('tp_mmb_ahdsr');  // amp envelope  → VCA (via CvMath × vel)
  const envFlt  = fresh('tp_mmb_ahdsr');  // filter envelope → VCF
  const cvmath  = fresh('tp_mmb_cvmath'); // mult: envAmp × vel → VCA.cv
  const out     = fresh('tp_mmb_out');
  void types;

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  // Volgorde: signaalpad CV + audio leesbaar van links naar rechts:
  // MidiIn → VCO → envFlt → VCF → envAmp → CvMath(vel×env) → VCA → OUT
  const slotOrder = [mi, vco, envFlt, vcf, envAmp, cvmath, vca, out];
  const rackHp = slotOrder.reduce((s, m) => s + m.visual.hpWidth, 0);
  const rack: Rack = {
    id: uid('rack'), name: 'CV-bridge test rack',
    description: 'MIDI-In → VCO → envFlt → VCF → envAmp → CvMath(vel×env) → VCA → OUT.',
    rows: 1, hpPerRow: Math.max(64, rackHp + 4),
    slots: slotOrder.map(place),
    kind: 'physical',
  };

  const c = (from: { m: ModuleInstance; port: string }, to: { m: ModuleInstance; port: string }): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: from.m.id, portId: from.port },
    to:   { moduleId: to.m.id,   portId: to.port },
  });

  const connections: PatchConnection[] = [
    // Audio chain
    c({ m: vco,    port: 'out'    }, { m: vcf,    port: 'in'    }),
    c({ m: vcf,    port: 'out'    }, { m: vca,    port: 'in'    }),
    c({ m: vca,    port: 'out'    }, { m: out,    port: 'l'     }),
    c({ m: vca,    port: 'out'    }, { m: out,    port: 'r'     }),
    // CV: MIDI → VCO pitch
    c({ m: mi,     port: 'pitch'  }, { m: vco,    port: 'voct'  }),
    // CV: MIDI gate → both envelopes
    c({ m: mi,     port: 'gate'   }, { m: envAmp, port: 'gate'  }),
    c({ m: mi,     port: 'gate'   }, { m: envFlt, port: 'gate'  }),
    // CV: filter env → VCF cutoff
    c({ m: envFlt, port: 'cv_out' }, { m: vcf,    port: 'cv'    }),
    // CV: amp env × velocity → VCA (CvMath in mult mode)
    c({ m: envAmp, port: 'cv_out' }, { m: cvmath, port: 'a'     }),
    c({ m: mi,            port: 'vel'    }, { m: cvmath, port: 'b'     }),
    c({ m: cvmath, port: 'out'    }, { m: vca,    port: 'cv'    }),
  ];

  const controlState: Record<string, Record<string, ControlValue>> = {
    [mi.id]:     { channel: 0, priority: 0, steal: 0, legato: 0 },
    [vco.id]:    { wave: 2, coarse: 0, fine: 0, level: 0.9 },
    [vcf.id]:    { cutoff: 800, q: 0.8, cv_amt: 1, type: 0 },
    [vca.id]:    { gain: 0, resp: 0 },
    [envAmp.id]: { attack: 8, hold: 0, decay: 300, sustain: 0.7, release: 500, loop: false, curve: 1 },
    [envFlt.id]: { attack: 20, hold: 0, decay: 600, sustain: 0.3, release: 800, loop: false, curve: 1, retrig: true },
    [cvmath.id]: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 },  // mult: env × vel
    [out.id]:    { level: 0.8 },
  };

  const patch: Patch = {
    id: uid('patch'), name: 'CV-bridge patch',
    description: 'Twee envelopes (filter + amp), velocity via CvMath(mult) op de VCA. Test voor de CV-bridge (v0.4.x).',
    voiceCount: 1,
    rackIds: [rack.id],
    connections,
    controlState,
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, vco, vcf, vca, envAmp, envFlt, cvmath, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/**
 * Seed een **N-stemmige** testpatch (ADR 0011 §4 — voice-MVP, optie B).
 *
 * Eén leesbare voice-keten (VCO → envFlt → VCF → envAmp → CvMath(vel×env) → VCA)
 * wordt als **master** (stem 1) bedraad; `N-1` identieke follower-ketens bestaan
 * als echte modules maar krijgen géén eigen kabels. Elke gevoiceerde moduletype
 * zit in een rack-`PolyGroup` (×N). De editor toont dus één set kabels van de
 * mono MidiIn-poorten (`pitch`/`gate`/`vel`, `eventKind:'voice'`) naar de
 * masters; bij het pushen expandeert {@link flattenProjectForFirmware} deze tot
 * de echte per-stem-graaf (pitch1→VCO1 … pitchN→VCON, VCA's → mixer `in1..inN`).
 * `Patch.voiceCount = N` zodat de allocator N stemmen uitdeelt.
 *
 * De sommatie-mixer is `tp_mmb_mixer` (4-in) voor N≤4 en `tp_mmb_mixer8` (8-in)
 * voor N>4. Voor N=1 zijn er geen PolyGroups: de master-keten is dan al de hele
 * (monofone) patch.
 *
 * Zo blijft het editor-model schoon (één voice-keten + PolyGroups) en blijft de
 * brain "dom": die ziet enkel de platte connectie-lijst (ADR 0009/0010).
 *
 * @param voiceCount Aantal stemmen (1, 2, 4, 8 of 16).
 * @param opts       Stress-opties — zie {@link PolySeedOptions}.
 */
export interface PolySeedOptions {
  /** Stem-kern: 'vco' (default), 'string' (Karplus-Strong physical modeling)
   *  of 'stk' (STK multi-sound physical modelling, zie `stkSound`).
   *  Bij 'string'/'stk' vervalt de vibrato/bend→tune-route (geen tune-ingang);
   *  bij 'stk' gaat de mod-wheel-LFO naar de `modulation`-poort en velocity
   *  naar `strength`. */
  voiceSource?: 'vco' | 'string' | 'stk';
  /** Sound-index voor de STK-bron (0=Plucked, 1=Clarinet, 2=Bowed, 3=Flute,
   *  4=Brass, 5=Saxophony, 6=BlowHole, 7=BandedWG, 8=Mandolin). Default 0. */
  stkSound?: number;
  /** Filter per stem: 'vcf' (state-variable, default), 'ladder' (Moog-stijl
   *  Huovilainen) of 'ms20' (Korg35 ZDF met tanh-scream). Zelfde poorten
   *  (in/out/cv), dus drop-in in de keten; controlState per type afgestemd. */
  filterType?: 'vcf' | 'ladder' | 'ms20';
  /** Extra audio-schakel per stem tussen VCF en VCA (comb-resonator of phaser). */
  perVoiceFx?: 'comb' | 'phaser';
  /** LFO per stem die via een sum-CvMath samen met envFlt op de filter-cutoff
   *  moduleert. Verdubbelt zo'n beetje het aantal CV-routes (1 kHz tick-load). */
  perVoiceLfo?: boolean;
  /** Stereo echo-paar achter de mixer (tijd in s; firmware-cap 0.5 s). Vreet
   *  audio-blocks uit de pool — kijk naar "blocks" in de status-strip. */
  busEchoSeconds?: number;
  /** Eén Mutable-Elements-stem (mono bespeeld) naast het stack — de zwaarste
   *  module in het arsenaal. Claimt 2 extra mixerkanalen (stereo). */
  withElements?: boolean;
  /** Patch-naamlabel (default: afgeleid van de opties). */
  label?: string;
}

export function seedPolyVoicePatch(
  project: ModularProject, voiceCount: number, opts: PolySeedOptions = {},
): ModularProject {
  const N = Math.max(1, Math.min(16, Math.round(voiceCount)));
  const srcTypeId = opts.voiceSource === 'string' ? 'tp_mmb_string'
                  : opts.voiceSource === 'stk'    ? 'tp_mmb_stk_sound' : 'tp_mmb_vco';
  const vcfTypeId = opts.filterType === 'ladder' ? 'tp_mmb_ladder'
                  : opts.filterType === 'ms20'   ? 'tp_mmb_ms20' : 'tp_mmb_vcf';
  const fxTypeId  = opts.perVoiceFx === 'comb'   ? 'tp_mmb_comb'
                  : opts.perVoiceFx === 'phaser' ? 'tp_mmb_phaser' : null;
  // Mixer-kanalen: N stemmen + evt. 2 voor de stereo Elements-uitgang.
  const channelsNeeded = N + (opts.withElements ? 2 : 0);
  const mixerTypeId = channelsNeeded > 8 ? 'tp_mmb_mixer16'
                    : channelsNeeded > 4 ? 'tp_mmb_mixer8' : 'tp_mmb_mixer';
  const needed = [srcTypeId, vcfTypeId,'tp_mmb_vca','tp_mmb_out',
                  'tp_mmb_ahdsr','tp_mmb_midiin','tp_mmb_cvmath','tp_mmb_lfo', mixerTypeId,
                  ...(fxTypeId ? [fxTypeId] : []),
                  ...(opts.busEchoSeconds ? ['tp_mmb_echo'] : []),
                  ...(opts.withElements ? ['tp_mmb_elements'] : [])];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  let p = missing ? seedInternals(project) : project;

  function fresh(typeId: string): ModuleInstance {
    const proto = p.modules.find((m) => m.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  }

  const mi    = fresh('tp_mmb_midiin');
  const mixer = fresh(mixerTypeId);
  const out   = fresh('tp_mmb_out');
  // Vibrato-sectie (globaal, fan-out naar alle stemmen):
  //   lfo.out × cv_mod (mod wheel = depth) → + cv_bend → VCO.tune.
  const lfo      = fresh('tp_mmb_lfo');
  const vibDepth = fresh('tp_mmb_cvmath');  // mult: lfo × mod-wheel
  const bendSum  = fresh('tp_mmb_cvmath');  // sum:  vibrato·0.04 + bend
  // Globale stress-extra's (alleen aangemaakt wanneer de optie aan staat).
  const echoL    = opts.busEchoSeconds ? fresh('tp_mmb_echo') : null;
  const echoR    = opts.busEchoSeconds ? fresh('tp_mmb_echo') : null;
  const elements = opts.withElements   ? fresh('tp_mmb_elements') : null;

  // Per-voice ketens. index 0 → master (stem 1), 1..N-1 → followers.
  // `vco` is de stem-kern (VCO óf String); fx/lfoV/lfoSum zijn optioneel.
  type VoiceChain = {
    vco: ModuleInstance; vcf: ModuleInstance; vca: ModuleInstance;
    envAmp: ModuleInstance; envFlt: ModuleInstance; cvmath: ModuleInstance;
    fx?: ModuleInstance; lfoV?: ModuleInstance; lfoSum?: ModuleInstance;
  };
  const voices: VoiceChain[] = Array.from({ length: N }, () => ({
    vco:    fresh(srcTypeId),
    vcf:    fresh(vcfTypeId),
    vca:    fresh('tp_mmb_vca'),
    envAmp: fresh('tp_mmb_ahdsr'),
    envFlt: fresh('tp_mmb_ahdsr'),
    cvmath: fresh('tp_mmb_cvmath'),
    ...(fxTypeId          ? { fx:     fresh(fxTypeId) }       : {}),
    ...(opts.perVoiceLfo  ? { lfoV:   fresh('tp_mmb_lfo'),
                              lfoSum: fresh('tp_mmb_cvmath') } : {}),
  }));
  const master = voices[0]!;

  // Layout: een net grid. Rij 0 = MidiIn + master-keten + mixer + OUT
  // (links→rechts). Elke follower-stem v komt in rij v, exact onder zijn
  // master uitgelijnd. Zo blijft rij 0 (de ingeklapte patcher-weergave)
  // compact en ontstaat er geen gat tussen de laatste VCA en de mixer.
  const chainOrder: (keyof VoiceChain)[] = [
    'vco', 'envFlt',
    ...(opts.perVoiceLfo ? (['lfoV', 'lfoSum'] as const) : []),
    'vcf',
    ...(fxTypeId ? (['fx'] as const) : []),
    'envAmp', 'cvmath', 'vca',
  ];
  const colOffset: Record<string, number> = {};
  let offset = mi.visual.hpWidth;                 // MidiIn staat op kolom 0
  for (const key of chainOrder) {
    colOffset[key] = offset;
    offset += master[key]!.visual.hpWidth;
  }
  const mixerOffset = offset; offset += mixer.visual.hpWidth;
  const outOffset   = offset; offset += out.visual.hpWidth;
  const lfoOffset   = offset; offset += lfo.visual.hpWidth;
  const vibOffset   = offset; offset += vibDepth.visual.hpWidth;
  const sumOffset   = offset; offset += bendSum.visual.hpWidth;
  // Globale extra's achteraan rij 0.
  const extras: ModuleInstance[] = [
    ...(echoL ? [echoL] : []), ...(echoR ? [echoR] : []),
    ...(elements ? [elements] : []),
  ];
  const extraOffsets = extras.map((m) => { const o = offset; offset += m.visual.hpWidth; return o; });
  const rowHp = offset;

  const slots: RackSlot[] = [
    { id: uid('slot'), moduleId: mi.id, row: 0, hpOffset: 0 },
  ];
  voices.forEach((v, vi) => {
    for (const key of chainOrder) {
      slots.push({ id: uid('slot'), moduleId: v[key]!.id, row: vi, hpOffset: colOffset[key]! });
    }
  });
  slots.push({ id: uid('slot'), moduleId: mixer.id,    row: 0, hpOffset: mixerOffset });
  slots.push({ id: uid('slot'), moduleId: out.id,      row: 0, hpOffset: outOffset });
  slots.push({ id: uid('slot'), moduleId: lfo.id,      row: 0, hpOffset: lfoOffset });
  slots.push({ id: uid('slot'), moduleId: vibDepth.id, row: 0, hpOffset: vibOffset });
  slots.push({ id: uid('slot'), moduleId: bendSum.id,  row: 0, hpOffset: sumOffset });
  extras.forEach((m, i) => {
    slots.push({ id: uid('slot'), moduleId: m.id, row: 0, hpOffset: extraOffsets[i]! });
  });

  // PolyGroups: één per gevoiceerde moduletype. members[0] = master (stem 1),
  // members[1..] = followers. De flatten gebruikt deze volgorde. Bij N=1 zijn
  // er geen groepen (de master-keten is al de complete patch).
  const grp = (label: string, key: keyof VoiceChain): PolyGroup => ({
    id: uid('poly'), label, voiceCount: N,
    members: voices.map((v) => ({ kind: 'module' as const, moduleId: v[key]!.id })),
  });
  const polyGroups: PolyGroup[] = N >= 2 ? [
    grp(opts.voiceSource === 'string' ? 'String'
      : opts.voiceSource === 'stk'    ? 'STK' : 'VCO', 'vco'),
    grp('envFlt', 'envFlt'),
    ...(opts.perVoiceLfo ? [grp('LFO', 'lfoV'), grp('LfoSum', 'lfoSum')] : []),
    grp(opts.filterType === 'ladder' ? 'Ladder' : opts.filterType === 'ms20' ? 'MS-20' : 'VCF', 'vcf'),
    ...(fxTypeId ? [grp(opts.perVoiceFx === 'comb' ? 'Comb' : 'Phaser', 'fx')] : []),
    grp('envAmp', 'envAmp'),
    grp('CvMath', 'cvmath'),
    grp('VCA',  'vca'),
  ] : [];

  const rack: Rack = {
    id: uid('rack'), name: `${N}-stemmig test rack`,
    description: `MidiIn → [VCO → envFlt → VCF → envAmp → CvMath(vel×env) → VCA] ×${N} (PolyGroups) → ${N > 8 ? 'MIXER-16' : N > 4 ? 'MIXER-8' : 'MIXER'} → OUT. Rij 0 = master + mixer/out, followers in rij 1..${N - 1}.`,
    rows: Math.max(1, N), hpPerRow: Math.max(64, rowHp + 4),
    slots,
    kind: 'physical',
    polyGroups,
  };

  const c = (from: { m: ModuleInstance; port: string }, to: { m: ModuleInstance; port: string }): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: from.m.id, portId: from.port },
    to:   { moduleId: to.m.id,   portId: to.port },
  });

  // Slechts één set master-kabels — de flatten expandeert ze per stem.
  //   MidiIn pitch/gate/vel zijn voice-event-poorten → fan-out per stem.
  //   VCO→VCF, VCF→VCA, envFlt→VCF, envAmp→CvMath, CvMath→VCA zijn group→group
  //   (stem v → stem v). VCA→mixer is group→genummerde sink (in1→in1..inN).
  const connections: PatchConnection[] = [
    // Audio: bron → VCF → (fx →) VCA → mixer (master = in1; stem v → inv)
    c({ m: master.vco, port: 'out'    }, { m: master.vcf, port: 'in'    }),
    ...(master.fx
      ? [c({ m: master.vcf, port: 'out' }, { m: master.fx,  port: 'in' }),
         c({ m: master.fx,  port: 'out' }, { m: master.vca, port: 'in' })]
      : [c({ m: master.vcf, port: 'out' }, { m: master.vca, port: 'in' })]),
    c({ m: master.vca, port: 'out'    }, { m: mixer,      port: 'in1'   }),
    // CV: mono MIDI-poorten (voice-event) → master; fan-out per stem
    c({ m: mi,         port: 'pitch'  }, { m: master.vco,    port: 'voct' }),
    c({ m: mi,         port: 'gate'   }, { m: master.envAmp, port: 'gate' }),
    c({ m: mi,         port: 'gate'   }, { m: master.envFlt, port: 'gate' }),
    // String/STK-bron: de gate plukt de snaar / triggert noteOn (VCO heeft
    // simpelweg geen gate-poort, dus alleen bij deze bronnen bedraden).
    ...(opts.voiceSource === 'string' || opts.voiceSource === 'stk'
      ? [c({ m: mi, port: 'gate' }, { m: master.vco, port: 'gate' })]
      : []),
    // CV: vibrato + pitch-bend → tune (alleen bij VCO-bron; String en STK
    // hebben geen tune-ingang).
    ...(opts.voiceSource !== 'string' && opts.voiceSource !== 'stk' ? [
      c({ m: lfo,      port: 'out'     }, { m: vibDepth, port: 'a' }),
      c({ m: mi,       port: 'cv_mod'  }, { m: vibDepth, port: 'b' }),
      c({ m: vibDepth, port: 'out'     }, { m: bendSum,  port: 'a' }),
      c({ m: mi,       port: 'cv_bend' }, { m: bendSum,  port: 'b' }),
      c({ m: bendSum,  port: 'out'     }, { m: master.vco, port: 'tune' }),
    ] : []),
    // STK-bron: mod-wheel-LFO → modulation-poort (CC#11-laag van het model:
    // noiseGain, bowVelocity, vibrato, …) en velocity → strength (aanslag/
    // embouchure — telt in de firmware op bij de strength-knop).
    ...(opts.voiceSource === 'stk' ? [
      c({ m: lfo,      port: 'out'    }, { m: vibDepth,   port: 'a' }),
      c({ m: mi,       port: 'cv_mod' }, { m: vibDepth,   port: 'b' }),
      c({ m: vibDepth, port: 'out'    }, { m: master.vco, port: 'modulation' }),
      c({ m: mi,       port: 'vel'    }, { m: master.vco, port: 'strength' }),
    ] : []),
    // CV: filter-env → cutoff. Met perVoiceLfo loopt hij via een sum-CvMath
    // zodat envelope én stem-LFO samen de cutoff moduleren (group→group).
    ...(master.lfoSum && master.lfoV ? [
      c({ m: master.envFlt, port: 'cv_out' }, { m: master.lfoSum, port: 'a' }),
      c({ m: master.lfoV,   port: 'out'    }, { m: master.lfoSum, port: 'b' }),
      c({ m: master.lfoSum, port: 'out'    }, { m: master.vcf,    port: 'cv' }),
    ] : [
      c({ m: master.envFlt, port: 'cv_out' }, { m: master.vcf,    port: 'cv' }),
    ]),
    // CV: amp-env × velocity → VCA
    c({ m: master.envAmp, port: 'cv_out' }, { m: master.cvmath, port: 'a'  }),
    c({ m: mi,            port: 'vel'    }, { m: master.cvmath, port: 'b'  }),
    c({ m: master.cvmath, port: 'out'    }, { m: master.vca,    port: 'cv' }),
    // Mixer → (echo →) OUT (stereo, global→global)
    ...(echoL && echoR ? [
      c({ m: mixer, port: 'out_l' }, { m: echoL, port: 'in' }),
      c({ m: echoL, port: 'out'   }, { m: out,   port: 'l'  }),
      c({ m: mixer, port: 'out_r' }, { m: echoR, port: 'in' }),
      c({ m: echoR, port: 'out'   }, { m: out,   port: 'r'  }),
    ] : [
      c({ m: mixer, port: 'out_l' }, { m: out, port: 'l' }),
      c({ m: mixer, port: 'out_r' }, { m: out, port: 'r' }),
    ]),
    // Elements-stem (mono bespeeld, stereo naar de 2 extra mixerkanalen).
    ...(elements ? [
      c({ m: mi,       port: 'pitch' }, { m: elements, port: 'voct'         }),
      c({ m: mi,       port: 'gate'  }, { m: elements, port: 'gate'         }),
      c({ m: elements, port: 'out_l' }, { m: mixer,    port: `in${N + 1}`   }),
      c({ m: elements, port: 'out_r' }, { m: mixer,    port: `in${N + 2}`   }),
    ] : []),
  ];

  // Mixer-controlstate: kanaal 1..N op vol 0.8 (pan 0), daarna evt. 2 stereo
  // Elements-kanalen (L/R gepand), overige kanalen dicht.
  const mixerChannels = channelsNeeded > 8 ? 16 : channelsNeeded > 4 ? 8 : 4;
  const mixerState: Record<string, ControlValue> = {};
  for (let ch = 1; ch <= mixerChannels; ++ch) {
    const isVoice    = ch <= N;
    const isElements = elements !== null && (ch === N + 1 || ch === N + 2);
    mixerState[`vol${ch}`] = isVoice ? 0.8 : isElements ? 0.7 : 0;
    mixerState[`pan${ch}`] = isElements ? (ch === N + 1 ? -0.7 : 0.7) : 0;
  }

  const controlState: Record<string, Record<string, ControlValue>> = {
    // voiceCount (uit de patch) bepaalt mono vs poly; geen overladen 'mode'
    // meer. priority/steal/legato op hun defaults (last / oldest / off).
    [mi.id]:    { channel: 0, priority: 0, steal: 0, legato: 0, voiceCount: N },
    [mixer.id]: mixerState,
    [out.id]:   { level: 0.8 },
    // Vibrato: 5.5 Hz sinus, bipolair. Mod wheel (cv_mod 0..1) is de depth
    // via de mult-CvMath; de sum-CvMath schaalt naar ±0.04 V (≈ ±½ semitoon)
    // en telt de pitch-bend erbij op.
    [lfo.id]:      { rate: 5.5, wave: 0, depth: 1, bipolar: true, run: 0 },
    [vibDepth.id]: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 },
    [bendSum.id]:  { mode: 0, gain_a: 0.04, gain_b: 1, gain_c: 0, offset: 0 },
  };
  // Bus-echo: tijd gecapt op de firmware-limiet (kMaxDelayMs = 500 ms).
  if (echoL && echoR) {
    const t = Math.min(0.5, Math.max(0.05, opts.busEchoSeconds ?? 0.5));
    controlState[echoL.id] = { time: t,        feedback: 0.55, mix: 0.4 };
    controlState[echoR.id] = { time: t * 0.75, feedback: 0.55, mix: 0.4 };  // L≠R = breedte
  }
  voices.forEach((v) => {
    controlState[v.vco.id] = opts.voiceSource === 'string'
      ? { pluck: 0.9, level: 0.9 }
      : opts.voiceSource === 'stk'
      ? { sound: opts.stkSound ?? 0, level: 0.9, strength: 0.7, timbre: 0.5, modulation: 0.5 }
      : { wave: 2, coarse: 0, fine: 0, level: 0.9 };
    // Filter-instellingen per type: de envFlt-sweep (0..1 op `cv`) werkt bij
    // ladder/ms20 in octaven (cv_amt), bij de VCF als 0..1-modulatie.
    // Kalme startwaarden: hoge q/drive + brede sweeps lieten de ladder
    // piepen; de "scream" draai je zelf open (die pokes gaan live).
    controlState[v.vcf.id] = opts.filterType === 'ladder'
      ? { cutoff: 600, q: 0.6, drive: 1.0, cv_amt: 2, q_cv_amt: 0.3 }
      : opts.filterType === 'ms20'
        ? { cutoff: 600, q: 0.5, drive: 1.5, cv_amt: 2, q_cv_amt: 0.3, type: 0 }
        : { cutoff: 800, q: 0.8, cv_amt: 1, type: 0 };
    controlState[v.vca.id]    = { gain: 0, resp: 0 };
    controlState[v.envAmp.id] = { attack: 8, hold: 0, decay: 300, sustain: 0.7, release: 500, loop: false, curve: 1 };
    controlState[v.envFlt.id] = { attack: 20, hold: 0, decay: 600, sustain: 0.3, release: 800, loop: false, curve: 1, retrig: true };
    controlState[v.cvmath.id] = { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 };
    if (v.fx) {
      controlState[v.fx.id] = opts.perVoiceFx === 'comb'
        ? { coarse: 0, feedback: 0.85, mix: 0.4 }
        : { rate: 0.4, depth: 0.7, mix: 0.5 };
    }
    if (v.lfoV && v.lfoSum) {
      // Stem-LFO: traag filter-wobble; sum weegt envelope zwaarder dan LFO.
      controlState[v.lfoV.id]   = { rate: 0.7, wave: 1, depth: 1, bipolar: true, run: 0 };
      controlState[v.lfoSum.id] = { mode: 0, gain_a: 1, gain_b: 0.25, gain_c: 0, offset: 0 };
    }
  });

  const allModules: ModuleInstance[] = [mi];
  for (const v of voices) {
    allModules.push(v.vco, v.vcf, v.vca, v.envAmp, v.envFlt, v.cvmath);
    if (v.fx)     allModules.push(v.fx);
    if (v.lfoV)   allModules.push(v.lfoV);
    if (v.lfoSum) allModules.push(v.lfoSum);
  }
  allModules.push(mixer, out, lfo, vibDepth, bendSum, ...extras);

  const stkSoundNames = ['Plucked','Clarinet','Bowed','Flute','Brass','Saxophony','BlowHole','BandedWG','Mandolin'];
  const extrasLabel = [
    opts.voiceSource === 'string' ? 'string-voices' : null,
    opts.voiceSource === 'stk'    ? `STK ${stkSoundNames[opts.stkSound ?? 0] ?? '?'}` : null,
    opts.filterType && opts.filterType !== 'vcf' ? `${opts.filterType}-filter` : null,
    fxTypeId ? `${opts.perVoiceFx}/stem` : null,
    opts.perVoiceLfo ? 'LFO/stem' : null,
    echoL ? 'bus-echo' : null,
    elements ? '+Elements' : null,
  ].filter(Boolean).join(' · ');
  const patch: Patch = {
    id: uid('patch'),
    name: opts.label ?? (extrasLabel ? `${N}-stemmig 🔥 ${extrasLabel}` : `${N}-stemmige patch`),
    description: (N >= 2
      ? `Eén master voice-keten + PolyGroups (×${N}). De flatten expandeert naar ${N} stemmen via MidiIn pitch/gate/vel en VCA→${N > 4 ? 'MIXER-8' : 'mixer'} in1..in${N} (ADR 0011 optie B).`
      : 'Monofone voice-keten (geen PolyGroups): MidiIn → bron → VCF → VCA → mixer → OUT.')
      + (opts.voiceSource === 'stk'
        ? ' Mod-wheel-LFO → STK modulation, velocity → strength (alle stemmen).'
        : opts.voiceSource !== 'string'
        ? ' Vibrato: LFO×mod-wheel + pitch-bend → VCO tune (alle stemmen).' : '')
      + (extrasLabel ? ` Stress-opties: ${extrasLabel}.` : ''),
    voiceCount: N,
    rackIds: [rack.id],
    connections,
    controlState,
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, ...allModules],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/** Seed een tweestemmige testpatch. Dunne wrapper rond {@link seedPolyVoicePatch}. */
export function seedTwoVoicePatch(project: ModularProject): ModularProject {
  return seedPolyVoicePatch(project, 2);
}

/**
 * Solo-seed: de kortst mogelijke speelbare patch rond één instrument-module —
 * MidiIn (mono) → module (voct + gate) → OUT. Bedoeld om Rings/Plaits/
 * Elements/STK te leren kennen zonder de hele poly-keten eromheen.
 *
 * @param typeId   Instrument-typeId (moet `voct`- en `gate`-CV-ingangen hebben).
 * @param outL/outR  Audio-uitgangspoorten van de module (mono: 2× dezelfde).
 */
export function seedSoloVoicePatch(
  project: ModularProject,
  typeId: string, label: string, outL: string, outR: string,
  controls: Record<string, ControlValue> = {},
): ModularProject {
  const needed = [typeId, 'tp_mmb_midiin', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi   = fresh('tp_mmb_midiin');
  const inst = fresh(typeId);
  const out  = fresh('tp_mmb_out');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const rack: Rack = {
    id: uid('rack'), name: `${label} solo`,
    description: `MidiIn → ${label} → OUT.`,
    rows: 1, hpPerRow: Math.max(64, mi.visual.hpWidth + inst.visual.hpWidth + out.visual.hpWidth + 4),
    slots: [place(mi), place(inst), place(out)],
    kind: 'physical',
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name: `${label} solo`,
    description: `Monofoon: speel en draai — alle knoppen gaan live naar de Teensy.`,
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', inst, 'voct'),
      c(mi, 'gate',  inst, 'gate'),
      c(inst, outL, out, 'l'),
      c(inst, outR, out, 'r'),
    ],
    controlState: {
      [inst.id]: controls,
      [out.id]:  { level: 0.8 },
      [mi.id]:   { channel: 0, voiceCount: 1 },
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, inst, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/**
 * 8-stemmige DX7-poly: MidiIn → [DX7]×N (PolyGroup) → Mixer8 → OUT.
 * Geen VCF/VCA/ADSR-keten — de FM-envelopes van de DX7 doen het werk zelf,
 * en velocity gaat rechtstreeks de engine in. Program-knop (master) fant
 * via de poly-groep uit naar alle stemmen. Laad een .syx via de
 * Teensy-modal voor de andere 31 voices.
 */
export function seedDx7PolyPatch(project: ModularProject, voiceCount = 8): ModularProject {
  const N = Math.max(2, Math.min(16, Math.round(voiceCount)));
  const mixerTypeId = N > 8 ? 'tp_mmb_mixer16' : N > 4 ? 'tp_mmb_mixer8' : 'tp_mmb_mixer';
  const needed = ['tp_mmb_midiin', 'tp_mmb_dx7', mixerTypeId, 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi     = fresh('tp_mmb_midiin');
  const dx7s   = Array.from({ length: N }, () => fresh('tp_mmb_dx7'));
  const master = dx7s[0]!;
  const mixer  = fresh(mixerTypeId);
  const out    = fresh('tp_mmb_out');

  const dxOffset    = mi.visual.hpWidth;
  const mixerOffset = dxOffset + master.visual.hpWidth;
  const outOffset   = mixerOffset + mixer.visual.hpWidth;
  const slots: RackSlot[] = [
    { id: uid('slot'), moduleId: mi.id,    row: 0, hpOffset: 0 },
    ...dx7s.map((d, vi) => ({ id: uid('slot'), moduleId: d.id, row: vi, hpOffset: dxOffset })),
    { id: uid('slot'), moduleId: mixer.id, row: 0, hpOffset: mixerOffset },
    { id: uid('slot'), moduleId: out.id,   row: 0, hpOffset: outOffset },
  ];
  const polyGroups: PolyGroup[] = [{
    id: uid('poly'), label: 'DX7', voiceCount: N,
    members: dx7s.map((d) => ({ kind: 'module' as const, moduleId: d.id })),
  }];
  const rack: Rack = {
    id: uid('rack'), name: `DX7 poly ×${N}`,
    description: `MidiIn → [DX7]×${N} (PolyGroup) → ${N > 8 ? 'MIXER-16' : N > 4 ? 'MIXER-8' : 'MIXER'} → OUT. FM-envelopes intern; velocity direct de engine in.`,
    rows: N, hpPerRow: Math.max(64, outOffset + out.visual.hpWidth + 4),
    slots,
    kind: 'physical',
    polyGroups,
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name: `DX7 poly ×${N}`,
    description: `${N}-stemmige 6-op FM (msfa/Dexed-kern). Zonder geladen bank klinkt alles als E.PIANO 1; laad een .syx via de Teensy-modal en kies met Program (0–31).`,
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', master, 'voct'),
      c(mi, 'gate',  master, 'gate'),
      c(mi, 'vel',   master, 'vel'),
      c(master, 'out', mixer, 'in1'),
      c(mixer, 'out_l', out, 'l'),
      c(mixer, 'out_r', out, 'r'),
    ],
    controlState: {
      [mi.id]:     { channel: 0, voiceCount: N, steal: 0 },
      [master.id]: { program: 0, level: 0.75 },
      [mixer.id]:  Object.fromEntries(Array.from({ length: N }, (_, i) => [
        [`vol${i + 1}`, 0.6], [`pan${i + 1}`, (i / Math.max(1, N - 1)) * 1.2 - 0.6],
      ]).flat().map(([k, v]) => [k, v])) as Record<string, ControlValue>,
      [out.id]:    { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, ...dx7s, mixer, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/**
 * Zelfspelende demo-seed: Marbles klokt en kiest de noten, Plaits speelt ze,
 * Clouds maakt er een wolk van en Tides (quadratuur) beweegt de wolk.
 * Geen MIDI nodig — verbinden en luisteren.
 */
export function seedGenerativeJamPatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_marbles', 'tp_mmb_plaits', 'tp_mmb_clouds', 'tp_mmb_tides', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mar    = fresh('tp_mmb_marbles');
  const plaits = fresh('tp_mmb_plaits');
  const tides  = fresh('tp_mmb_tides');
  const clouds = fresh('tp_mmb_clouds');
  const out    = fresh('tp_mmb_out');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [mar, plaits, tides, clouds, out];
  const rack: Rack = {
    id: uid('rack'), name: 'Generative jam',
    description: 'Marbles → Plaits → Clouds; Tides beweegt de wolk. Zelfspelend.',
    rows: 1, hpPerRow: Math.max(64, all.reduce((n, m) => n + m.visual.hpWidth, 0) + 4),
    slots: all.map(place),
    kind: 'physical',
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name: 'Generative jam',
    description: 'Zelfspelend: Marbles kiest noten (pentatonisch) en klokt Plaits; Clouds + Tides maken er een drijvende wolk van. Draai aan Déjà vu (~0.5) om de melodie te laten loopen.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(mar, 'x1', plaits, 'voct'),
      c(mar, 't1', plaits, 'gate'),
      c(plaits, 'out', clouds, 'in_l'),
      c(plaits, 'aux', clouds, 'in_r'),
      c(mar, 't2', clouds, 'trig'),
      c(tides, 'out1', clouds, 'position_cv'),
      c(tides, 'out2', clouds, 'texture_cv'),
      c(clouds, 'out_l', out, 'l'),
      c(clouds, 'out_r', out, 'r'),
    ],
    controlState: {
      [mar.id]:    { tempo: 180, bias: 0.4, jitter: 0.1, model: 0, dejavu: 0, length: 8, spread: 0.5, xbias: 0.5, steps: 0.8, scale: 2, range: 1 },
      [plaits.id]: { engine: 11, harmonics: 0.5, timbre: 0.45, morph: 0.5, decay: 0.55, lpg: 0.6 },  // string — tokkelt mooi
      [tides.id]:  { rate: 0.07, mode: 1, output: 2, shape: 0.5, slope: 0.5, smooth: 0.6, shift: 0.5 },
      [clouds.id]: { position: 0.35, size: 0.6, pitch: 0, density: 0.5, texture: 0.5, mix: 0.55, spread: 0.6, feedback: 0.3, reverb: 0.55, mode: 0 },
      [out.id]:    { level: 0.8 },
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, ...all],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/**
 * Demo-seed voor de MI-nieuwkomers: MidiIn → Plaits → **Clouds** → OUT, met
 * **Tides** in phase-mode als quadratuur-LFO op Clouds' position en texture.
 * Monofoon en bewust rustig afgesteld: lange korrels, veel reverb — speel
 * één noot en laat de wolk drijven.
 */
export function seedCloudsAmbientPatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_midiin', 'tp_mmb_plaits', 'tp_mmb_clouds', 'tp_mmb_tides', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi     = fresh('tp_mmb_midiin');
  const plaits = fresh('tp_mmb_plaits');
  const tides  = fresh('tp_mmb_tides');
  const clouds = fresh('tp_mmb_clouds');
  const out    = fresh('tp_mmb_out');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [mi, plaits, tides, clouds, out];
  const rack: Rack = {
    id: uid('rack'), name: 'Clouds ambient',
    description: 'Plaits → Clouds, Tides (quadratuur) beweegt position/texture.',
    rows: 1, hpPerRow: Math.max(64, all.reduce((n, m) => n + m.visual.hpWidth, 0) + 4),
    slots: all.map(place),
    kind: 'physical',
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name: 'Clouds ambient',
    description: 'Speel één noot en laat de wolk drijven: Plaits door de granular, Tides ademt position en texture.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', plaits, 'voct'),
      c(mi, 'gate',  plaits, 'gate'),
      // Paneel-jacks heten 'out'/'aux' (firmware aliast out_l/out_r):
      // hoofd-engine links, aux-variant rechts — mooi breed de wolk in.
      c(plaits, 'out', clouds, 'in_l'),
      c(plaits, 'aux', clouds, 'in_r'),
      c(mi, 'gate', clouds, 'trig'),          // elke noot vuurt een korrel
      c(tides, 'out1', clouds, 'position_cv'),
      c(tides, 'out2', clouds, 'texture_cv'), // 90° verschoven (phase-mode)
      c(clouds, 'out_l', out, 'l'),
      c(clouds, 'out_r', out, 'r'),
    ],
    controlState: {
      [plaits.id]: { engine: 4, harmonics: 0.55, timbre: 0.5, morph: 0.4, decay: 0.7, lpg: 0.5 },  // additive — draagt lang
      [tides.id]:  { rate: 0.08, mode: 1, output: 2, shape: 0.5, slope: 0.5, smooth: 0.6, shift: 0.5 },  // loop + phase = quadratuur-LFO
      [clouds.id]: { position: 0.3, size: 0.7, pitch: 0, density: 0.45, texture: 0.5, mix: 0.7, spread: 0.6, feedback: 0.35, reverb: 0.6, mode: 0 },
      [out.id]:    { level: 0.8 },
      [mi.id]:     { channel: 0, voiceCount: 1 },
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, ...all],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}
