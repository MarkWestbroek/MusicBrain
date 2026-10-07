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
  type ModuleRole, type CellGroup, type PolyGroup, type Taper,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';
import { uid } from './store';
import { derivedTaper } from './taper';
import { DX7_VOICE_NAMES } from './dx7BankNames';

// ── helpers ────────────────────────────────────────────────────────────

const W = (hp: number) => hp * MM_PER_HP;

function knob(id: string, label: string, x: number, y: number,
              opts: Partial<{ min: number; max: number; def: number; size: 'small'|'medium'|'large'; color: string; style: string; unit: string;
                              step: number; taper: Taper; ticks: { every?: number; highlight?: number[]; labels?: Record<number, string> } }> = {}) {
  // Stempelen wat `derivedTaper` er toch al van zou maken, zodat een
  // geëxporteerd paneel zijn curve zichtbaar meedraagt.
  const taper = opts.taper
    ?? derivedTaper({ id, unit: opts.unit, min: opts.min ?? 0, max: opts.max ?? 10 });
  return {
    control: {
      kind: 'knob' as const, id, label,
      min: opts.min ?? 0, max: opts.max ?? 10, defaultValue: opts.def ?? 5,
      ...(taper ? { taper } : {}),
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
function button(id: string, label: string, x: number, y: number, size?: 'small' | 'medium' | 'large') {
  return { control: { kind: 'button' as const, id, label, momentary: true, ...(size ? { size } : {}) }, placement: { x, y } };
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
      bindTo2: opts.bindTo2,
      lookup: opts.lookup,
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
      // Standaarden = die van mb::runtime::Ahdsr: de Teensy krijgt een
      // onaangeraakte control niet mee en valt terug op zijn eigen beginstand.
      // Stond hier 400 ms en Exp, dan toonde het paneel iets anders dan je hoorde.
      slider('release', 'R', colX[4], sliderY, { min: 0,    max: 8000, def: 300,  lengthMm: sliderLen, unit: 'ms' }),

      toggle('loop',    'Loop',  w*0.20, 96),
      toggle('retrig',  'Reset', w*0.45, 96),
      sw    ('curve',   'Curve', w*0.74, 96, ['Lin','Exp','Log'], 0),

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
      knob('rate',  'Rate',  w/2, 24, { size: 'large',  min: 0.01, max: 50, def: 1,  unit: 'Hz', color: '#f9fafb' }),
      sw  ('wave',  'Wave',  w/2, 47, ['Sin','Tri','Saw','Sqr','S&H'], 0),
      knob('depth', 'Depth', w/2, 63, { size: 'medium', min: 0,    max: 1,  def: 1, color: '#f9fafb' }),
      toggle('bipolar','Bip', w*0.25, 79, true),
      sw    ('run',   'Run',  w*0.75, 79, ['Always','Gated','OneShot'], 0),
      // Attenuverter op de Rate-ingang, recht boven die jack: 1 = ±4 oct bij
      // ±1 CV (zoals vroeger), 0 = CV genegeerd, onder 0 omgekeerd.
      knob('rate_cv_amt', 'Rate CV', w*0.25, 93, { size: 'small', min: -1, max: 1, def: 1, color: '#f9fafb' }),

      // Ingangen boven, uitgangen onder; MMB past tussen Out en Inv.
      inPort ('rate_cv','Rate', 'cv',     w*0.25, 106),
      inPort ('reset',  'Rst',  'trigger',w*0.75, 106),
      outPort('out',    'Out',  'cv',     w*0.25, 118),
      outPort('out_inv','Inv',  'cv',     w*0.75, 118),
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
    notes: 'Sample-and-hold met slew-limiter. S&H: elke flank op Trig neemt de waarde van In over. T&H: zolang Trig hoog is volgt de uitgang In, laag = vasthouden. Slew: geen trigger nodig, de uitgang volgt In met de Slew-tijd (lag, portamento). Slew werkt in alle standen op de uitgang: S&H met slew geeft glijdende trapjes. Zit er geen kabel in In, dan is de bron interne ruis: S&H geeft de klassieke random-trap (zet er de Quantizer achter), Slew een traag zwervende random-CV. Firmware tp_mmb_sh; in de simulator draait dezelfde klasse als wasm.',
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
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
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
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'event-source',
    texts: [
      { x: w/2, y: 8,   text: 'MIDI-IN', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'voicing · steal · modulatie', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w*0.60, y: 26, text: 'Voices', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w*0.27, y: 100, text: 'NOTE', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w*0.77, y: 100, text: 'MOD',  fontSize: 1.2, color: '#9ca3af', align: 'middle' },
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
      // Bend→Pitch: de bend-wheel meteen in pitch/pitchK vouwen (per stem),
      // zodat ook een patch zonder cv_bend-kabel buigt. Uit = alleen op Bend.
      sw  ('bendPitch', 'B→P', w*0.88, 66, ['off','on'], 0),
      // CC-pickers: welk CC-nummer naar cv_cc1/cv_cc2 gaat (integer). Defaults
      // 74 (filter-cutoff) en 71 (resonantie). Elke knop heeft een LED-display
      // dat het gekozen CC-nummer toont.
      knob   ('cc1Num',  'CC1#', w*0.16, 80, { size: 'small', min: 0, max: 127, def: 74, step: 1, color: '#f9fafb' }),
      display('cc1Disp', w*0.34, 80, { digits: 3, style: 'led', bindTo: 'cc1Num', format: 'int' }),
      knob   ('cc2Num',  'CC2#', w*0.58, 80, { size: 'small', min: 0, max: 127, def: 71, step: 1, color: '#f9fafb' }),
      display('cc2Disp', w*0.76, 80, { digits: 3, style: 'led', bindTo: 'cc2Num', format: 'int' }),
      // Stemtoon: elke pitch-uitgang schuift log2(a4/440) V (A432 = -31,8 ct).
      // De speler zet dit meestal persoonlijk (chip A= in de kop); dan
      // gaat die instelling hier overheen.
      knob('a4', 'A4', w*0.93, 80, { size: 'small', min: 380, max: 500, def: 440, step: 1, unit: 'Hz', color: '#f9fafb' }),
      // Note-outputs (per stem) — links.
      outPort('pitch', 'V/Oct', 'cv',   w*0.07, 112, { eventKind: 'voice' }),
      outPort('gate',  'Gate',  'gate', w*0.17, 112, { eventKind: 'voice' }),
      outPort('vel',   'Vel',   'cv',   w*0.27, 112, { eventKind: 'voice' }),
      // Expressie per stem (MPE stap 1): druk (aftertouch, kanaal of per
      // toets) en release-velocity — waaieren net als pitch uit naar pressK/relK.
      outPort('press', 'Press', 'cv',   w*0.37, 112, { eventKind: 'voice' }),
      outPort('rel',   'Rel',   'cv',   w*0.47, 112, { eventKind: 'voice' }),
      // Modulatie-outputs (globaal) — rechts.
      outPort('cv_mod',  'Mod',  'cv', w*0.61, 112),
      outPort('cv_bend', 'Bend', 'cv', w*0.72, 112),
      outPort('cv_cc1',  'CC1',  'cv', w*0.83, 112),
      outPort('cv_cc2',  'CC2',  'cv', w*0.94, 112),
    ],
    notes: 'Zet inkomende MIDI om in CV. NOTE-uitgangen (per stem): pitch (V/Oct), gate, velocity, Press (aftertouch: channel pressure zet alle stemmen, poly pressure alleen de stem met die toets; 0..1) en Rel (release-velocity van de laatste note-off op die stem, 0..1, blijft staan — een keyboard dat hem niet meldt geeft 0,5). MOD-uitgangen (globaal): Mod (mod-wheel CC1), Bend (pitch-bend, V/Oct, bereik = Bend-knop in halve tonen; B→P aan = de bend zit ook al in pitch/pitchK, handig zonder aparte bend-kabel), CC1/CC2 (vrij kiesbare CC-nummers via CC1#/CC2#; het gekozen nummer staat op het LED-display naast elke knop). De MIDI-bron kies je in het Simulatie-paneel. Mono/poly volgt automatisch uit het aantal stemmen (voiceCount). PRIO = mono note-priority (last/low/high). STEAL = poly voice-stealing → firmware StealStrategy. LEG = legato (firmware-gedrag = FW-1, nog te bouwen). GLIDE = portamento (ms per octaaf, 0 = uit). UNI = unison (één toets → alle stemmen, last-note); SPRD = unison-detune in centen. Géén MIDI-jack op de front; alles loopt via de brain.',
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
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
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

// 9b. MMB AUDIO IN — 4 HP. Geluid van buiten de patch in: op de Teensy de
//     USB-audio die de pc naar hem afspeelt (AudioInputUSB), in de simulator
//     de microfoon van de browser. Zie AudioInModule.h en
//     doc/teensy-aan-de-pc.md §5.
function mmbAudioIn() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_audioin',
    categoryId: 'utility',
    variant: 'Audio input',
    brand: 'MMB', model: 'AUDIO IN',
    hp: 4, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'IN',   fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'mic · usb', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',  fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('level', 'Level', w/2, 30, { size: 'large', min: 0, max: 2, def: 1, color: '#f9fafb' }),
      sw  ('mono', 'Mono', w/2, 62, ['stereo', 'mono'], 1),
      outPort('out_l', 'L', 'audio', w*0.30, 100),
      outPort('out_r', 'R', 'audio', w*0.70, 100),
    ],
    notes: 'Audio-ingang. In de simulator: de microfoon van de browser (de standaard-ingang van je systeem; de browser vraagt toestemming). Op de Teensy: wat de pc naar het afspeelapparaat "Teensy MIDI/Audio" stuurt — zet in Windows bij je headset-microfoon "Listen to this device" aan met de Teensy als afspeelapparaat. Mono sommeert L+R naar beide uitgangen (een microfoon is mono). Gebruik een koptelefoon, anders gaat het rondzingen.',
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

// 10a. MMB SAMPLER — 8 HP. Sample-speler op de header-only kern
//      mmb_dsp::SamplePlayer (firmware SamplerModule.h, PSRAM + SD; dezelfde
//      kern als wasm in de simulator). Samples laden via de 🎧 Sample-knop;
//      `slot` kiest er een uit de gedeelde 16-slots bank.
function mmbSampler() {
  const w = W(16);
  const colX = (i: number) => w * (0.0625 + i * 0.125);         // acht cel-kolommen
  const cells = [1, 2, 3, 4, 5, 6, 7, 8];
  return assemble({
    typeId: 'tp_mmb_sampler',
    categoryId: 'vco',
    variant: 'Multisampler',
    brand: 'MMB', model: 'SAMPLER',
    hp: 16, texture: 'pcb-black', baseColor: '#14261f', internal: true,
    // Multi-module (construct B): acht stem-cellen die één bank delen. Wie
    // welke cel bespeelt beslist de stemtoewijzer in MIDI-in; hier geen
    // allocator. Controls zijn gedeeld (controlIds: []), zoals de QUAD-VCO.
    role: 'multi',
    cellGroups: [{
      id: 'voice',
      label: 'Stem',
      count: 8,
      portIds: ['voct', 'gate', 'vel', 'cutoff', 'env'],
      controlIds: [],
    }],
    texts: [
      { x: w/2, y: 8,   text: 'SAMPLER', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'keymap · 8 stemmen · filter per stem', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 73,  text: 'Env',   fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 85,  text: 'Cut',   fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 97,  text: 'V/Oct', fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 109, text: 'Gate',  fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 121, text: 'Vel',   fontSize: 1.0, color: '#9ca3af', align: 'start' },
    ],
    items: [
      knob('bank',   'Bank',   w*0.10, 28, { size: 'medium', min: 0, max: 15, def: 0, step: 1, color: '#f5a623', ticks: { every: 1, highlight: [0, 15] } }),
      knob('level',  'Level',  w*0.25, 28, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('coarse', 'Coarse', w*0.40, 28, { size: 'small', min: -24, max: 24, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.52, 28, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),
      knob('start',  'Start',  w*0.64, 28, { size: 'small', min: 0, max: 1, def: 0, color: '#9ca3af' }),
      knob('attack', 'Att',    w*0.76, 28, { size: 'small', min: 0.2, max: 500, def: 1.5, unit: 'ms', color: '#9ca3af' }),
      knob('env_rel', 'Env rel', w*0.90, 28, { size: 'small', min: 10, max: 2000, def: 120, unit: 'ms', color: '#9ca3af' }),
      // Filter in de cel — dezelfde kernels als VCF (SVF) en MS-20 (Korg35).
      sw  ('filter', 'Filter', w*0.08, 50, ['Uit', 'SVF', 'MS-20'], 0),
      knob('cutoff', 'Cutoff', w*0.24, 50, { size: 'medium', min: 20, max: 18000, def: 2000, unit: 'Hz', color: '#38bdf8' }),
      knob('q',      'Res',    w*0.38, 50, { size: 'small', min: 0, max: 1, def: 0.3, color: '#38bdf8' }),
      sw  ('fmode',  'Mode',   w*0.50, 50, ['LP', 'HP', 'BP'], 0),
      knob('drive',  'Drive',  w*0.62, 50, { size: 'small', min: 0.1, max: 10, def: 1, color: '#38bdf8' }),
      knob('cv_amt', 'CV amt', w*0.74, 50, { size: 'small', min: 0, max: 8, def: 4, unit: 'oct', color: '#38bdf8' }),
      // Lift op de follower: een keurig uitgestuurd sample geeft een env van
      // 0,1 à 0,2, en dan blijft de auto-wah op 4 octaven een kiertje.
      knob('env_sens', 'Sens', w*0.74, 60, { size: 'small', min: -12, max: 36, def: 12, unit: 'dB', color: '#38bdf8' }),
      // Limiter op de som: een zingende MS-20 op een paar stemmen komt ruim
      // boven ±1, en tussen modules is dat hard afknippen (digitale
      // overdrive). Aan = limiter + zachte begrenzing; Uit = het gruis.
      sw  ('limit', 'Limit', w*0.08, 62, ['Uit', 'Aan'], 1),
      // Gedeelde bend-ingang (V/Oct) bovenop de V/Oct van elke cel: één kabel
      // MidiIn.Bend → Bend buigt alle stemmen, ook in een PolyGroup.
      inPort('bend', 'Bend', 'cv', w*0.30, 62),
      outPort('out_l', 'L',  'audio', w*0.86, 50),
      outPort('out_r', 'R',  'audio', w*0.93, 50),
      outPort('out_3', '3',  'audio', w*0.86, 62),
      outPort('out_4', '4',  'audio', w*0.93, 62),
      // Per cel: Env (uit), Cutoff (in), V/Oct, Gate, Vel — ids `<base>_<k>`, gebonden aan 'voice'.
      ...cells.map((k) => outPort(`env_${k}`,   `${k}`, 'cv',   colX(k - 1), 72,  { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`cutoff_${k}`, '',     'cv',   colX(k - 1), 84,  { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`voct_${k}`,   '',     'cv',   colX(k - 1), 96,  { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`,   '',     'gate', colX(k - 1), 108, { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`vel_${k}`,    '',     'cv',   colX(k - 1), 120, { cellGroupId: 'voice' })),
    ],
    notes: 'Multisample-speler als multi-module: acht stem-cellen (voct_k/gate_k/vel_k) die één keymap-bank delen, elk met een filter in de stem (Filter: uit/SVF/MS-20 — dezelfde kernels als de losse VCF en MS-20) dat via cutoff_k gestuurd wordt, en een envelope-follower per stem op env_k (Sens tilt die met decibels op; zonder lift haalt een sample amper 0,2 en blijft de wah een kiertje). Auto-wah = env_k → cutoff_k. Een keymap met key- én velocity-zones kiest per noot en aanslag het juiste sample; V/Oct transponeert vanaf de root-noot van die zone; Bend (gedeelde CV-ingang, V/Oct) komt daar bij alle cellen bovenop — MidiIn.Bend → Bend en de pitch-wheel buigt alle stemmen mee (of een LFO voor vibrato). 1–4 kanalen (mono komt op L+R, stereo op L/R, quad op alle vier), gemengd over alle cellen. Limit (standaard aan): limiter + zachte begrenzing op die som, zodat een zingende MS-20 op een paar stemmen niet digitaal clipt; Uit = hard afknippen op ±1 (het gruis). Loop-modes: geen, one-shot, continu, of tot note-off. Polyfoon spelen = een PolyGroup over de cellen (Poly ▾ → Sampler ×8): MIDI-in verdeelt de noten, de sampler doet niets slims. Banken maak je met de 🎹 Multisample-import; die schrijft een .mmbs die je naar /mmb/banks/NN.mmbs op de SD kopieert — Bank kiest NN. In de simulator draait dezelfde kern (mmb_dsp::SamplePlayer) als wasm. Firmware tp_mmb_sampler.',
  });
}

// MMB TAPE STRIP — 16 HP. Mellotron-mechanica om een gewone samplebank
//     (firmware tp_mmb_tapestrip): acht stem-cellen op dezelfde bank als de
//     sampler, met per toets een bandje van Length seconden dat na loslaten
//     terugloopt, kopcontact, motorbelasting, wow/flutter en slijtage.
function mmbTapeStrip() {
  const w = W(16);
  const colX = (i: number) => w * (0.0625 + i * 0.125);
  const cells = [1, 2, 3, 4, 5, 6, 7, 8];
  return assemble({
    typeId: 'tp_mmb_tapestrip',
    categoryId: 'vco',
    variant: 'Tape strip (Mellotron-mechanica)',
    brand: 'MMB', model: 'TAPE STRIP',
    hp: 16, texture: 'pcb-black', baseColor: '#3b2a1a', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'voice',
      label: 'Stem',
      count: 8,
      portIds: ['voct', 'gate', 'vel'],
      controlIds: [],
    }],
    texts: [
      { x: w/2, y: 8,   text: 'TAPE STRIP', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'bank van de sampler · 8 bandjes', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 97,  text: 'V/Oct', fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 109, text: 'Gate',  fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 121, text: 'Vel',   fontSize: 1.0, color: '#9ca3af', align: 'start' },
    ],
    items: [
      knob('bank',    'Bank',    w*0.10, 30, { size: 'medium', min: 0, max: 15, def: 0, step: 1, color: '#f5a623', ticks: { every: 1, highlight: [0, 15] } }),
      knob('length',  'Length',  w*0.27, 30, { size: 'medium', min: 1, max: 8, def: 8, unit: 's', color: '#fbbf24' }),
      knob('return',  'Return',  w*0.44, 30, { size: 'medium', min: 0.1, max: 4, def: 1, unit: 's', color: '#fbbf24' }),
      knob('contact', 'Contact', w*0.61, 30, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#fbbf24' }),
      knob('level',   'Level',   w*0.80, 30, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('motor',   'Motor',   w*0.10, 56, { size: 'small', min: 0, max: 1, def: 0.4, color: '#fbbf24' }),
      knob('wow',     'Wow',     w*0.26, 56, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('flutter', 'Flutter', w*0.42, 56, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('wear',    'Wear',    w*0.58, 56, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      inPort('press', 'Press', 'cv', w*0.74, 56),
      inPort('bend',  'Bend',  'cv', w*0.88, 56),
      outPort('tape', 'Tape', 'cv', w*0.10, 76),
      outPort('load', 'Load', 'cv', w*0.26, 76),
      outPort('out_l', 'L', 'audio', w*0.74, 76),
      outPort('out_r', 'R', 'audio', w*0.88, 76),
      ...cells.map((k) => inPort(`voct_${k}`, '', 'cv',   colX(k - 1), 96,  { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`, '', 'gate', colX(k - 1), 108, { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`vel_${k}`,  '', 'cv',   colX(k - 1), 120, { cellGroupId: 'voice' })),
    ],
    notes: 'Mellotron-mechanica om een gewone samplebank: de goede opname komt uit de bank (dezelfde .mmbs-bank en Bank-knop als de SAMPLER; in de simulator krijgt deze module automatisch de bank van de sampler), de onvolmaaktheid komt hiervandaan. Per toets een bandje van Length seconden: na Length stopt de klank abrupt, hoe lang je de toets ook houdt. Loslaten laat het bandje met een veer terugspoelen (Return = terugloop van een volle strip); druk je de toets opnieuw in terwijl het bandje nog onderweg is, dan speelt hij vanaf de plek waar het bandje dan staat, zodat snelle herhalingen anders klinken dan de eerste aanslag. Contact is het drukkussen dat de band tegen de kop duwt: opkomst, hoogafval en een kleine pitch-dip bij het indrukken. Motor laat de capstan zakken onder belasting (meer toetsen = iets trager, met traagheid); Press (channel pressure) vertraagt licht. Wow en Flutter moduleren de snelheid; Wear voegt bandruis, bandbreedteverlies en zachte verzadiging toe. Tape (CV) is de positie van het laatst aangeslagen bandje, Load de motorbelasting. Acht stem-cellen; polyfoon via een PolyGroup (Poly ▾ → Tape strip ×8). Firmware tp_mmb_tapestrip op dezelfde SampleBank als de sampler.',
  });
}

// ── ZANG ────────────────────────────────────────────────────────────────
// Zingende stemmen: ingesproken lettergrepen op de noten die je speelt, met
// PSOLA (mmb_dsp::ZangEngine, doc/plans/zingende-stemmen.md). Multi-module
// met acht stem-cellen, zoals de sampler; de lyricbank (.mmbl) maak je met
// de knop 🎤 Zang.
function mmbZang() {
  const w = W(14);
  const colX = (i: number) => w * (0.0625 + i * 0.125);
  const cells = [1, 2, 3, 4, 5, 6, 7, 8];
  return assemble({
    typeId: 'tp_mmb_zang',
    categoryId: 'vco',
    variant: 'Zingende stemmen',
    brand: 'MMB', model: 'ZANG',
    hp: 14, texture: 'pcb-black', baseColor: '#2a1a2e', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'voice',
      label: 'Stem',
      count: 8,
      portIds: ['voct', 'gate', 'vel'],
      controlIds: [],
    }],
    texts: [
      { x: w/2, y: 8,   text: 'ZANG', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 12,  text: 'woorden · 8 stemmen · PSOLA', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 97,  text: 'V/Oct', fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 109, text: 'Gate',  fontSize: 1.0, color: '#9ca3af', align: 'start' },
      { x: 3, y: 121, text: 'Vel',   fontSize: 1.0, color: '#9ca3af', align: 'start' },
    ],
    items: [
      knob('bank',  'Bank',  w*0.12, 28, { size: 'medium', min: 0, max: 15, def: 0, step: 1, color: '#f5a623', ticks: { every: 1, highlight: [0, 15] } }),
      knob('syl',   'Start', w*0.32, 28, { size: 'medium', min: 0, max: 255, def: 0, step: 1, color: '#f5a623' }),
      // Het display toont de lettergreep die aan de beurt is (telemetrie uit
      // de wasm), niet de knop.
      display('sylDisp', w*0.50, 28, { digits: 3, style: 'led', bindTo: '__currentSyl', format: 'int' }),
      sw  ('mode',  'Mode',  w*0.68, 28, ['Vast', 'Door', 'Door+terug'], 1),
      knob('level', 'Level', w*0.88, 28, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('speed',   'Speed',   w*0.12, 52, { size: 'small', min: 0.25, max: 4, def: 1, color: '#f9fafb' }),
      knob('formant', 'Formant', w*0.28, 52, { size: 'medium', min: -12, max: 12, def: 0, unit: 'semi', color: '#e879f9' }),
      knob('attack',  'Att',     w*0.44, 52, { size: 'small', min: 0, max: 500, def: 5, unit: 'ms', color: '#9ca3af' }),
      knob('release', 'Rel',     w*0.58, 52, { size: 'small', min: 5, max: 3000, def: 250, unit: 'ms', color: '#9ca3af' }),
      knob('coarse',  'Coarse',  w*0.72, 52, { size: 'small', min: -24, max: 24, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',    'Fine',    w*0.86, 52, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),
      inPort ('syl_cv',     'Syl',   'cv',   w*0.08, 74),
      inPort ('next',       'Next',  'gate', w*0.22, 74),
      inPort ('reset',      'Reset', 'gate', w*0.36, 74),
      inPort ('formant_cv', 'Frm',   'cv',   w*0.50, 74),
      inPort ('bend',       'Bend',  'cv',   w*0.64, 74),
      outPort('syl_out',    'Syl',   'cv',   w*0.78, 74),
      outPort('out_l', 'L', 'audio', w*0.86, 84),
      outPort('out_r', 'R', 'audio', w*0.94, 84),
      ...cells.map((k) => inPort(`voct_${k}`, `${k}`, 'cv',   colX(k - 1), 96,  { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`, '',     'gate', colX(k - 1), 108, { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`vel_${k}`,  '',     'cv',   colX(k - 1), 120, { cellGroupId: 'voice' })),
    ],
    notes: 'Zingende stemmen. Een lyricbank bevat ingesproken lettergrepen; ZANG zingt ze op de noot die je speelt, met de klinkerkleur van de opname (PSOLA: korte stukjes van twee stemperioden, opnieuw aan elkaar geplakt op de gevraagde toonhoogte). Zolang de gate open is blijft de klinker klinken; bij loslaten speelt de slotmedeklinker uit. Start = de lettergreep waar het liedje begint (0 = de eerste). Mode: Vast = altijd die ene lettergreep (de knop kiest welke); Door = elke aanslag de volgende, rond naar het begin (een akkoord deelt er één); Door+terug = idem, maar na 2 s stilte begint het liedje opnieuw bij Start. Het display toont de lettergreep die aan de beurt is. Bank kiest de lyricbank: in de simulator het nummer waaronder 🎤 Zang hem zette, op de Teensy /mmb/lyrics/NN.mmbl. Next en Reset doen hetzelfde met een gate, Syl (CV 0..1) kiest rechtstreeks. Formant schuift de klinkerkleur los van de toonhoogte: omhoog = kinderstem, omlaag = reus. Speed rekt de medeklinkers en overgangen. Bereik: ruwweg een octaaf rond de gesproken toonhoogte klinkt natuurlijk. De bank maak je met 🎤 Zang (opnemen of wav, lettergrepen intypen); op de Teensy staat hij in /mmb/lyrics/NN.mmbl en kiest Bank het nummer. Acht stem-cellen als de sampler: polyfoon = een PolyGroup over de cellen (Poly ▾ → Zingende stem). Firmware tp_mmb_zang.',
  });
}

// ── SID (MOS 6581/8580) ────────────────────────────────────────────────
// Eigen emulatie op registerniveau (mmb_dsp::SidSynth, doc/plans/sid.md), als
// multi-module: drie stem-cellen die één chip delen, zoals op de C64. Stap 1
// + 2 van het plan: oscillatoren, noise, ring/sync en de ADSR — nog zonder
// filter.
function mmbSid() {
  // Links het stemmenblok (12 HP), dan de filterkolom (4 HP), rechts de
  // chips en uitgangen (4 HP).
  const w = W(12), full = W(20);
  const fx = w + W(4) / 2;                                    // midden filterkolom
  const gx = W(16) + W(4) / 2;                                // midden uitgangskolom
  const colX = (i: number) => 7 + i * 9.6;                   // zes cel-kolommen
  const cells = Array.from({ length: 12 }, (_, i) => i + 1);
  const cellY = (k: number, gate: boolean) => (k <= 6 ? 90 : 110) + (gate ? 9 : 0);
  const onOff = ['Uit', 'Aan'];
  const adsr = { size: 'small' as const, min: 0, max: 15, step: 1, color: '#c4b5fd' };
  const flt = '#38bdf8';
  return assemble({
    typeId: 'tp_mmb_sid', categoryId: 'vco', variant: 'SID 6581/8580 (emulatie)',
    brand: 'MMB', model: 'SID', hp: 20, texture: 'pcb-black', baseColor: '#2a2440', internal: true,
    role: 'multi',
    cellGroups: [{ id: 'voice', label: 'Stem', count: 12, portIds: ['voct', 'gate'], controlIds: [] }],
    texts: [
      { x: full/2, y: 8,   text: 'SID', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: full/2, y: 14,  text: '1–4 chips · 3–12 stemmen · 6581/8580 · C64', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: full/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 85,  text: 'V/Oct · Gate — stemmen 1–6 (chip 1–2)', fontSize: 0.9, color: '#9ca3af', align: 'start' },
      { x: 3, y: 105, text: 'stemmen 7–12 (chip 3–4)', fontSize: 0.9, color: '#9ca3af', align: 'start' },
      { x: gx, y: 19, text: 'CHIPS · UIT', fontSize: 1.0, color: '#f9fafb', align: 'middle' },
      { x: fx, y: 19, text: 'FILTER', fontSize: 1.1, color: flt, align: 'middle' },
    ],
    items: [
      // Golfvormen: elk los aan/uit; meer dan één tegelijk = combined waveform.
      sw('tri',   'Tri',   w*0.14, 26, onOff, 0),
      sw('saw',   'Saw',   w*0.38, 26, onOff, 0),
      sw('pulse', 'Pulse', w*0.62, 26, onOff, 1),
      sw('noise', 'Noise', w*0.86, 26, onOff, 0),
      knob('pw', 'PW', w*0.16, 44, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#fb923c' }),
      // Combined waveforms: 0 = zuivere AND, de chips gemarkeerd, 10 = nog zwakker dan een 6581.
      knob('combo', 'Combo', w*0.44, 44, { size: 'medium', min: 0, max: 10, def: 7, color: '#c4b5fd',
        ticks: { every: 1, highlight: [4, 7], labels: { 4: '8580', 7: '6581' } } }),
      sw('ring', 'Ring', w*0.70, 42, onOff, 0),
      sw('sync', 'Sync', w*0.90, 42, onOff, 0),
      // ADSR in registerwaarden 0..15 (attack 2 ms … 8 s, decay/release 6 ms … 24 s).
      knob('attack',  'A', w*0.14, 60, { ...adsr, def: 0 }),
      knob('decay',   'D', w*0.38, 60, { ...adsr, def: 9 }),
      knob('sustain', 'S', w*0.62, 60, { ...adsr, def: 10 }),
      knob('release', 'R', w*0.86, 60, { ...adsr, def: 9 }),
      knob('coarse', 'Coarse', w*0.14, 78, { size: 'small', min: -24, max: 24, def: 0, step: 1, unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.38, 78, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),
      knob('volume', 'Vol',    w*0.62, 78, { size: 'small', min: 0, max: 15, def: 15, step: 1, color: '#9ca3af' }),
      knob('level',  'Level',  w*0.86, 78, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      // Filter (8580-model): registerwaarden zoals op de chip.
      sw('filt',  'Filt', fx - 4.5, 27, onOff, 0),
      // Chipmodel voor filter en uitgang; Curve = spreiding van de 6581-cutoffcurve.
      sw('model', 'Chip', fx + 4.5, 27, ['6581', '8580'], 0),
      knob('cutoff', 'Cutoff', fx, 44, { size: 'medium', min: 0, max: 2047, def: 1024, step: 1, color: flt }),
      knob('res',    'Res',    fx - 4.5, 60, { size: 'small', min: 0, max: 15, def: 0, step: 1, color: flt }),
      knob('curve',  'Curve',  fx + 4.5, 60, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw('lp', 'LP', fx - 6.2, 76, onOff, 1),
      sw('bp', 'BP', fx,       76, onOff, 0),
      sw('hp', 'HP', fx + 6.2, 76, onOff, 0),
      ...cells.map((k) => inPort(`voct_${k}`, '', 'cv',   colX((k - 1) % 6), cellY(k, false), { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`, '', 'gate', colX((k - 1) % 6), cellY(k, true),  { cellGroupId: 'voice' })),
      inPort('cutoff_cv', 'Cut+', 'cv',    fx, 96),
      // EXT IN per chip, elk door het filter van die chip: stereo = Ext 1+2, quad = 1–4.
      inPort('ext_in', 'Ext 1', 'audio', fx - 5, 108),
      inPort('ext_2',  '2',     'audio', fx + 5, 108),
      inPort('ext_3',  '3',     'audio', fx - 5, 120),
      inPort('ext_4',  '4',     'audio', fx + 5, 120),
      // Chips en uitgangen: SIDs = hoeveel chips meedoen (elk 3 stemmen, eigen
      // filter); Spread verdeelt ze over L/R; S1–S4 = elke chip apart.
      knob('chips',  'SIDs',   gx, 29, { size: 'small', min: 1, max: 4, def: 1, step: 1, color: '#c4b5fd', ticks: { every: 1, highlight: [1, 2, 3, 4] } }),
      knob('spread', 'Spread', gx, 46, { size: 'small', min: 0, max: 1, def: 0.7, color: '#9ca3af' }),
      outPort('sid_1', 'S1', 'audio', gx - 5, 62),
      outPort('sid_2', 'S2', 'audio', gx + 5, 62),
      outPort('sid_3', 'S3', 'audio', gx - 5, 74),
      outPort('sid_4', 'S4', 'audio', gx + 5, 74),
      inPort('bend',  'Bend', 'cv', gx - 5, 90),
      inPort('pw_cv', 'PW+',  'cv', gx + 5, 90),
      outPort('out_l', 'L', 'audio', gx - 5, 104),
      outPort('out_r', 'R', 'audio', gx + 5, 104),
      outPort('out',  'Mono', 'audio', gx, 118),
    ],
    notes: 'De geluidschip van de Commodore 64 (MOS 6581/8580), als eigen emulatie op registerniveau — geen reSID-code. Drie stemmen, elk met een 24-bit oscillator en vier golfvormen: Tri, Saw, Pulse (breedte met PW, ook via PW+) en Noise (een 23-bit schuifregister). Zet je er meer dan één aan, dan krijg je een combined waveform: de golfvormen hangen dan aan dezelfde lijnen naar de DAC en een 0 trekt harder dan een 1, dus het lijkt op een AND, maar zwakker. Combo regelt hoe sterk: 0 = zuivere AND, 8580 en 6581 zijn gemarkeerd (op de 6581 wordt tri+saw dun en zacht), 10 gaat nog verder. Een eigen model, op het oor afgesteld, niet gemeten aan een chip. Noise in een combinatie sterft uit, zoals op de chip: de uitgang schrijft terug in het schuifregister. Wissel je daarna van golfvorm, dan zet de module het schuifregister terug met de test-bit (zoals C64-spelers dat deden). Ring en Sync koppelen elke stem aan de vorige (3 → 1 → 2 → 3): Ring vervangt de driehoek door een ringmodulatie met die stem, Sync zet de oscillator terug bij elke periode van die stem. De ADSR staat in registerwaarden 0..15 zoals op de chip (attack 2 ms tot 8 s, decay en release 6 ms tot 24 s, sustain in 16 stappen) en heeft de beroemde ADSR-bug: wissel je naar een snellere rate terwijl de interne teller al verder staat, dan wacht de envelope tot die rond is (tot ~33 ms). Vol is het 4-bit mastervolume van de chip. Multi-module: stem-cellen (voct_k/gate_k) die MIDI-in over de chips verdeelt — polyfoon spelen = een PolyGroup over de cellen (Poly ▾ → SID). SIDs (1–4) zet hoeveel chips meedoen: cel 1–3 = chip 1, 4–6 = chip 2, enzovoort, elk met een eigen filter (zoals een dual- of triple-SID); een stille chip kost vrijwel niets. Uitgangen: Mono (de som, met een limiter), L/R (de chips over het stereobeeld verdeeld met Spread, zoals de stereo-SID-tunes) en S1–S4 (elke chip apart, om zelf te mengen en te pannen). EXT IN per chip: Ext 1–4 gaan elk door het filter van hun eigen chip — een stereobron op Ext 1 en 2 (met SIDs = 2) of quad op 1–4, en met Spread komt die ook weer over het stereobeeld uit. Filter (8580-model): een 2-polig state-variable filter (12 dB/oct) met LP, BP en HP als losse schakelaars — combineerbaar zoals op de chip, LP+HP geeft een notch; zonder mode is wat door het filter gaat stil. Cutoff is het 11-bit register (0..2047, bij de 8580 vrijwel lineair van ~30 Hz tot ~12 kHz), Res het 4-bit register (8580 tot Q ≈ 4, 6581 tot ≈ 2, geen zelfoscillatie); beide op het oor, niet gemeten. Filt stuurt de drie stemmen door het filter. Cut+ telt op bij de cutoff (0..1 = het hele bereik, een envelope geeft de klassieke SID-bas). Ext is EXT IN: elk ander signaal gaat altijd door het SID-filter. Chip kiest het model van filter en uitgang. 8580: het nette filter hierboven. 6581 (standaard): de cutoff loopt als een S-curve (onderaan blijft hij rond ~220 Hz hangen, in het midden stijgt hij steil tot ~16 kHz) — Curve schuift dat midden, want geen twee 6581-exemplaren zijn gelijk (0 = helder exemplaar, 1 = donker) — de resonantie is zwakker en gromt in plaats van te piepen, een hard signaal vervormt, en elke stem geeft bij het aanslaan en loslaten een doffe tik (de DAC staat niet rond nul); ook een volumewijziging tikt, de truc waarmee C64-spellen samples speelden. Alles op het oor, niet gemeten. Firmware tp_mmb_sid, mmb_dsp::SidSynth — in de simulator draait dezelfde code als wasm.',
  });
}

// ── SID 3-osc ─────────────────────────────────────────────────────────
// Zelfde engine als de SID (mmb_dsp::SidSynth), maar met instellingen per
// stem, drie rijen zoals in een C64-tracker. Stack: één noot stuurt alle drie
// de stemmen (elk met eigen Coarse/Fine); Split: elke stem een eigen ingang.
// Geen cel-module: polyfoon = meerdere SID 3-osc's in een PolyGroup.
function mmbSid3() {
  const w = W(28);
  const onOff = ['Uit', 'Aan'];
  const small = (color: string) => ({ size: 'small' as const, color });
  const adsr = { size: 'small' as const, min: 0, max: 15, step: 1, color: '#c4b5fd' };
  const flt = '#38bdf8';
  const rowY = [24, 44, 64];
  const defs = [                                   // standaardstemmen
    { tri: 0, saw: 0, pulse: 1, coarse: 0, fine: 0 },
    { tri: 0, saw: 1, pulse: 0, coarse: 0, fine: 8 },
    { tri: 1, saw: 0, pulse: 0, coarse: -12, fine: 0 },
  ];
  const voiceRow = (k: number) => {
    const y = rowY[k - 1]!, d = defs[k - 1]!;
    return [
      sw(`tri_${k}`,   'Tri',   12, y, onOff, d.tri),
      sw(`saw_${k}`,   'Saw',   21, y, onOff, d.saw),
      sw(`pulse_${k}`, 'Pulse', 30, y, onOff, d.pulse),
      sw(`noise_${k}`, 'Noise', 39, y, onOff, 0),
      knob(`pw_${k}`, 'PW', 49, y + 2, { ...small('#fb923c'), min: 0, max: 1, def: 0.5 }),
      sw(`ring_${k}`, 'Ring', 59, y, onOff, 0),
      sw(`sync_${k}`, 'Sync', 68, y, onOff, 0),
      knob(`attack_${k}`,  'A', 78, y + 2, { ...adsr, def: 0 }),
      knob(`decay_${k}`,   'D', 87, y + 2, { ...adsr, def: 9 }),
      knob(`sustain_${k}`, 'S', 96, y + 2, { ...adsr, def: 10 }),
      knob(`release_${k}`, 'R', 105, y + 2, { ...adsr, def: 9 }),
      knob(`coarse_${k}`, 'Coarse', 115, y + 2, { ...small('#f9fafb'), min: -24, max: 24, def: d.coarse, step: 1, unit: 'semi' }),
      knob(`fine_${k}`,   'Fine',   124, y + 2, { ...small('#f9fafb'), min: -100, max: 100, def: d.fine, unit: 'ct' }),
      sw(`filt_${k}`, 'Filt', 134, y, onOff, 0),
    ];
  };
  return assemble({
    typeId: 'tp_mmb_sid3', categoryId: 'vco', variant: 'SID 3-osc (emulatie, per stem)',
    brand: 'MMB', model: 'SID 3-OSC', hp: 28, texture: 'pcb-black', baseColor: '#2a2440', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'SID 3-OSC', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'drie stemmen, elk eigen instellingen · Stack / Split · 6581/8580', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      ...rowY.map((y, i) => ({ x: 4, y: y + 1, text: `${i + 1}`, fontSize: 2.0, color: '#c4b5fd', align: 'middle' as const })),
      { x: 105, y: 79, text: 'FILTER', fontSize: 1.0, color: flt, align: 'middle' },
    ],
    items: [
      ...voiceRow(1), ...voiceRow(2), ...voiceRow(3),
      // Gedeeld
      sw('stack', 'Stack', 12, 86, ['Split', 'Stack'], 1),
      knob('combo', 'Combo', 27, 88, { size: 'medium', min: 0, max: 10, def: 7, color: '#c4b5fd',
        ticks: { every: 1, highlight: [4, 7], labels: { 4: '8580', 7: '6581' } } }),
      knob('volume', 'Vol',   43, 88, { ...small('#9ca3af'), min: 0, max: 15, def: 15, step: 1 }),
      knob('level',  'Level', 53, 88, { ...small('#f9fafb'), min: 0, max: 1, def: 0.8 }),
      knob('cutoff', 'Cutoff', 68, 88, { size: 'medium', min: 0, max: 2047, def: 1024, step: 1, color: flt }),
      knob('res',    'Res',    81, 88, { ...small(flt), min: 0, max: 15, def: 0, step: 1 }),
      sw('lp', 'LP',  91, 86, onOff, 1),
      sw('bp', 'BP',  99, 86, onOff, 0),
      sw('hp', 'HP', 107, 86, onOff, 0),
      sw('model', 'Chip', 118, 86, ['6581', '8580'], 0),
      knob('curve', 'Curve', 130, 88, { ...small('#9ca3af'), min: 0, max: 1, def: 0.5 }),
      // Jacks
      inPort('voct_1', 'V/Oct 1', 'cv',   12, 108),
      inPort('voct_2', '2',       'cv',   22, 108),
      inPort('voct_3', '3',       'cv',   32, 108),
      inPort('gate_1', 'Gate 1',  'gate', 44, 108),
      inPort('gate_2', '2',       'gate', 54, 108),
      inPort('gate_3', '3',       'gate', 64, 108),
      inPort('bend',      'Bend', 'cv',    78, 108),
      inPort('pw_cv',     'PW+',  'cv',    88, 108),
      inPort('cutoff_cv', 'Cut+', 'cv',    98, 108),
      inPort('ext_in',    'Ext',  'audio', 110, 108),
      outPort('out', 'Out', 'audio', 130, 108),
    ],
    notes: 'De SID van de Commodore 64 met instellingen per stem — dezelfde eigen emulatie als de SID-module, een ander paneel. Elke rij is één stem: golfvormen (Tri, Saw, Pulse, Noise; samen = combined waveform), PW, Ring en Sync (gekoppeld aan de vorige stem: 3 → 1 → 2 → 3), een ADSR in registerwaarden 0..15, Coarse en Fine, en Filt (deze stem door het filter). Stack (standaard): V/Oct 1 en Gate 1 sturen alle drie de stemmen, elk verstemd met zijn eigen Coarse/Fine — drie oscillatoren op één noot, zoals veel C64-leads en -bassen gemaakt zijn; ring en sync hebben dan een vast interval (probeer stem 2 met Sync aan en Coarse +7, of Ring op een driehoek). Split: elke stem een eigen V/Oct en Gate, zoals in een C64-tune (bas, melodie en drum op één chip). Gedeeld: Combo (0 = AND, 8580 en 6581 gemarkeerd), Vol (4-bit), Level, en het filter (Cutoff 0..2047, Res 0..15, LP/BP/HP combineerbaar, Chip 6581/8580, Curve voor de spreiding van de 6581), met Cut+ (0..1 = het hele bereik), PW+ (bij alle stemmen) en Ext (EXT IN door het filter). Polyfoon spelen: zet meerdere SID 3-osc\'s in een PolyGroup (Poly ▾ → SID 3-osc ×4): elke noot krijgt een eigen chip met eigen filter, zoals een stapel SID\'s. Standaardstemmen: pulse; saw 8 cent hoger; driehoek een octaaf lager. Firmware tp_mmb_sid3, mmb_dsp::SidSynth — in de simulator draait dezelfde code als wasm.',
  });
}

// 10b. MMB TAPE ECHO — 8 HP. Bandecho: één-koppige tape-delay met verzadiging,
//      toonverlies per omloop en wow/flutter (firmware TapeEchoModule.h op de
//      header-only kern mmb_dsp::TapeEcho; dezelfde kern draait als wasm in de
//      simulator). Feedback mag boven 1 — de verzadiger houdt het in toom.
function mmbTapeEcho() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_tape_echo',
    categoryId: 'effect',
    variant: 'Tape echo',
    brand: 'MMB', model: 'TAPE',
    hp: 8, texture: 'pcb-black', baseColor: '#1f1a14', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'TAPE ECHO', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'sat · tone · wow/flutter', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('time',     'Time',    w*0.25, 30, { size: 'medium', min: 0.02, max: 1.0, def: 0.35, unit: 's', color: '#f5a623' }),
      knob('feedback', 'Fbk',     w*0.75, 30, { size: 'medium', min: 0,    max: 1.1, def: 0.5,  color: '#f5a623' }),
      knob('mix',      'Mix',     w*0.25, 58, { size: 'small',  min: 0,    max: 1,   def: 0.4,  color: '#f9fafb' }),
      knob('tone',     'Tone',    w*0.75, 58, { size: 'small',  min: 0,    max: 1,   def: 0.6,  color: '#f9fafb' }),
      knob('wow',      'Wow',     w*0.20, 82, { size: 'small',  min: 0,    max: 1,   def: 0.3,  color: '#9ca3af' }),
      knob('flutter',  'Flutter', w*0.50, 82, { size: 'small',  min: 0,    max: 1,   def: 0.2,  color: '#9ca3af' }),
      knob('drive',    'Drive',   w*0.80, 82, { size: 'small',  min: 0,    max: 1,   def: 0.3,  color: '#9ca3af' }),
      inPort ('time_cv', 'T+',  'cv',    w*0.15, 102),
      inPort ('fbk_cv',  'F+',  'cv',    w*0.38, 102),
      inPort ('mix_cv',  'M+',  'cv',    w*0.61, 102),
      inPort ('in',  'In',  'audio', w*0.30, 118),
      outPort('out', 'Out', 'audio', w*0.70, 118),
    ],
    notes: 'Bandecho: de band is een int16-buffer (max 1 s), de leeskop staat op tijd + wow + flutter achter de schrijfkop en de tijd wordt traag geslewd — draaien aan Time zwiept de toonhoogte zoals een bandmotor. Feedback door een verzadiger (Drive) en een toon-lowpass (Tone): elke omloop doffer. Firmware tp_mmb_tape_echo (mmb_dsp::TapeEcho); dezelfde kern als wasm in de simulator.',
  });
}

// 10c. MMB FET COMP — 8 HP. FET-compressor in 1176-stijl (FW-FX-3 stap 1),
// zie doc/plans/vintage-compressors.md. Vaste drempel: Input stuurt hem aan.
function mmbFetComp() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_fet_comp',
    categoryId: 'effect',
    variant: 'FET compressor',
    brand: 'MMB', model: 'FET',
    hp: 8, texture: 'pcb-black', baseColor: '#16181c', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'FET COMP', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'limiting amplifier', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('input',   'Input',   w*0.27, 30, { size: 'medium', min: -12, max: 36, def: 0, unit: 'dB', color: '#f5a623' }),
      knob('output',  'Output',  w*0.73, 30, { size: 'medium', min: -24, max: 12, def: 0, unit: 'dB', color: '#f5a623' }),
      knob('attack',  'Attack',  w*0.27, 56, { size: 'small', min: 1, max: 7, def: 4, step: 1, color: '#f9fafb', ticks: { every: 1, highlight: [1, 7] } }),
      knob('release', 'Release', w*0.73, 56, { size: 'small', min: 1, max: 7, def: 4, step: 1, color: '#f9fafb', ticks: { every: 1, highlight: [1, 7] } }),
      sw  ('ratio',   'Ratio',   w*0.22, 80, ['4:1', '8:1', '12:1', '20:1', 'All'], 0),
      knob('mix',     'Mix',     w*0.72, 68, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
      // Niet op het origineel: hoeveel FET-vervorming. 1 = zoals gemeten.
      knob('color',   'Color',   w*0.72, 82, { size: 'small', min: 0, max: 2, def: 1, color: '#f5a623' }),
      // Met/zonder naast elkaar horen: Bypass laat het signaal ongemoeid door.
      sw  ('bypass',  'Bypass',  w*0.50, 92, ['Uit', 'Aan'], 0),
      outPort('gr',    'GR', 'cv',    w*0.50, 106),
      inPort ('in_l',  'L',  'audio', w*0.15, 106),
      inPort ('in_r',  'R',  'audio', w*0.32, 106),
      outPort('out_l', 'L',  'audio', w*0.68, 106),
      outPort('out_r', 'R',  'audio', w*0.85, 106),
    ],
    notes: 'FET-compressor die knipoogt naar de UREI/UA 1176. Geen threshold-knop: de drempel ligt vast en Input stuurt hem aan (meer Input = meer compressie), Output haalt het niveau terug. Attack en Release 1–7, 7 = snelst (800 → 20 µs en 1100 → 50 ms); op de snelste standen vervormt de bas, net als bij het echte apparaat. Ratio 4/8/12/20, en All = alle knoppen tegelijk ingedrukt: drempel lager, harder dan 20:1, de transiënt knalt erdoor en veel meer vervorming. De FET-vervorming groeit met het ingrijpen. Color regelt hoeveel FET-vervorming erbij komt (0 schoon, 1 zoals gemeten aan het apparaat, 2 dik; dubbel bemonsterd zodat het warm blijft). Mix = parallelle compressie, Bypass laat het signaal ongemoeid door (met/zonder vergelijken; zet dan Output zo dat beide kanten even luid zijn). GR = gain reduction als CV (1 = 20 dB). Stereo gekoppeld; alleen L aangesloten = mono op beide uitgangen. Firmware tp_mmb_fet_comp (mmb_dsp::FetComp); dezelfde kern als wasm in de simulator.',
  });
}

// 10d. MMB OPTO COMP — 8 HP. Opto-compressor in LA-2A-stijl (FW-FX-3 stap 2),
// zie doc/plans/vintage-compressors.md. Twee knoppen, net als het apparaat.
function mmbOptoComp() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_opto_comp',
    categoryId: 'effect',
    variant: 'Opto compressor',
    brand: 'MMB', model: 'OPTO',
    hp: 8, texture: 'pcb-black', baseColor: '#1b1714', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'OPTO COMP', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'leveling amplifier', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('peak', 'Peak red.', w*0.27, 32, { size: 'medium', min: 0, max: 100, def: 40, color: '#f5a623' }),
      knob('gain', 'Gain',      w*0.73, 32, { size: 'medium', min: -20, max: 20, def: 0, unit: 'dB', color: '#f5a623' }),
      sw  ('mode', 'Mode',      w*0.22, 62, ['Comp', 'Limit'], 0),
      knob('color', 'Color',    w*0.72, 60, { size: 'small', min: 0, max: 2, def: 1, color: '#f5a623' }),
      knob('mix',   'Mix',      w*0.72, 78, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
      sw  ('bypass', 'Bypass',  w*0.22, 86, ['Uit', 'Aan'], 0),
      outPort('gr',    'GR', 'cv',    w*0.50, 106),
      inPort ('in_l',  'L',  'audio', w*0.15, 106),
      inPort ('in_r',  'R',  'audio', w*0.32, 106),
      outPort('out_l', 'L',  'audio', w*0.68, 106),
      outPort('out_r', 'R',  'audio', w*0.85, 106),
    ],
    notes: 'Opto-compressor die knipoogt naar de Teletronix LA-2A. Twee knoppen, zoals het apparaat: Peak Reduction zakt de drempel (0 tot −45 dBFS) en Gain is de uitgangsversterking; attack en release liggen vast. Het karakter zit in de lichtcel: de eerste helft van het ingrijpen is in ~60 ms weg, de rest sijpelt er in seconden uit, en hoe langer en harder hij heeft gewerkt hoe trager dat gaat (~0,8 tot 12 s). Daardoor ademt hij mee in plaats van te pompen. Mode: Comp (~3:1 met brede knie) of Limit. Color regelt de buisverzadiging (0 schoon, 1 zoals het apparaat, 2 dik; dubbel bemonsterd), Mix is parallelle compressie, Bypass laat het signaal ongemoeid door. GR = gain reduction als CV (1 = 20 dB). Stereo gekoppeld; alleen L aangesloten = mono op beide uitgangen. Firmware tp_mmb_opto_comp (mmb_dsp::OptoComp); dezelfde kern als wasm in de simulator.',
  });
}

// 10e. MMB VCA-BUS — 10 HP. VCA-buscompressor in SSL-G-stijl (FW-FX-3 stap 3).
// ── Stereo bandecho met cross-feedback ─────────────────────────────────
function mmbStereoTapeEcho() {
  const w = W(12);
  return assemble({
    typeId: 'tp_mmb_stereo_tape_echo', categoryId: 'effect', variant: 'Stereo tape echo',
    brand: 'MMB', model: 'TAPE-ST', hp: 12, texture: 'pcb-black', baseColor: '#1f1a14', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'STEREO TAPE', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'twee sporen · cross-feedback', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('time',     'Time',    w*0.18, 30, { size: 'medium', min: 0.02, max: 1.0, def: 0.35, unit: 's', color: '#f5a623' }),
      knob('ratio',    'Ratio',   w*0.50, 30, { size: 'medium', min: 0.5, max: 2, def: 1, unit: '×R', color: '#f5a623', ticks: { every: 0.25, highlight: [0.5, 0.75, 1, 1.5, 2] } }),
      knob('feedback', 'Fbk',     w*0.82, 30, { size: 'medium', min: 0, max: 1.1, def: 0.4, color: '#f5a623' }),
      knob('cross',    'Cross',   w*0.18, 58, { size: 'medium', min: 0, max: 1.1, def: 0.3, color: '#38bdf8' }),
      knob('mix',      'Mix',     w*0.50, 58, { size: 'small', min: 0, max: 1, def: 0.4, color: '#f9fafb' }),
      knob('tone',     'Tone',    w*0.82, 58, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('wow',      'Wow',     w*0.18, 82, { size: 'small', min: 0, max: 1, def: 0.3, color: '#9ca3af' }),
      knob('flutter',  'Flutter', w*0.50, 82, { size: 'small', min: 0, max: 1, def: 0.2, color: '#9ca3af' }),
      knob('drive',    'Drive',   w*0.82, 82, { size: 'small', min: 0, max: 1, def: 0.3, color: '#9ca3af' }),
      inPort ('time_cv',  'T+', 'cv', w*0.10, 102),
      inPort ('fbk_cv',   'F+', 'cv', w*0.30, 102),
      inPort ('cross_cv', 'X+', 'cv', w*0.50, 102),
      inPort ('mix_cv',   'M+', 'cv', w*0.70, 102),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.30, 118),
      outPort('out_l', 'L', 'audio', w*0.70, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Stereo bandecho: twee bandsporen (dezelfde TapeEcho-kern als het mono-echo: verzadiging, toon-laagdoorlaat, wow en flutter) met Ratio = tijd van het rechterspoor als factor van links (0,75 of 1,5 = gepunteerde patronen) en Cross = hoeveel van het natte signaal van het ene spoor de schrijfkop van het andere in gaat. Cross 1 met Fbk 0 = ping-pong; Cross én Fbk samen = een wolk die van links naar rechts kruipt (de verzadiger houdt de lus in toom, ook boven 1). De wow/flutter van rechts loopt een kwartslag achter, dus de sporen zweven niet in de maat: breedte. Zonder R-kabel krijgt rechts hetzelfde als links (mono in, stereo uit). Firmware tp_mmb_stereo_tape_echo, mmb_dsp::StereoTapeEcho — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Vintage digitale echo ──────────────────────────────────────────────
function mmbDigitalEcho() {
  const w = W(12);
  return assemble({
    typeId: 'tp_mmb_digital_echo', categoryId: 'effect', variant: 'Vintage digital echo',
    brand: 'MMB', model: 'DDL-12', hp: 12, texture: 'pcb-black', baseColor: '#14181f', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'DIGITAL ECHO', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: '12-bit · modulatie · stereo', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('time',      'Time',   w*0.18, 30, { size: 'medium', min: 0.005, max: 1.0, def: 0.3, unit: 's', color: '#a3e635' }),
      knob('ratio',     'Ratio',  w*0.50, 30, { size: 'medium', min: 0.5, max: 2, def: 1, unit: '×R', color: '#a3e635', ticks: { every: 0.25, highlight: [0.5, 0.75, 1, 1.5, 2] } }),
      knob('feedback',  'Fbk',    w*0.82, 30, { size: 'medium', min: 0, max: 1.1, def: 0.4, color: '#a3e635' }),
      knob('cross',     'Cross',  w*0.18, 58, { size: 'small', min: 0, max: 1.1, def: 0, color: '#38bdf8' }),
      knob('mod_rate',  'Rate',   w*0.50, 58, { size: 'small', min: 0.05, max: 10, def: 0.8, unit: 'Hz', color: '#38bdf8' }),
      knob('mod_depth', 'Depth',  w*0.82, 58, { size: 'small', min: 0, max: 1, def: 0.2, color: '#38bdf8' }),
      knob('bits',      'Bits',   w*0.18, 82, { size: 'small', min: 6, max: 16, def: 12, step: 1, color: '#9ca3af' }),
      knob('band',      'Band',   w*0.50, 82, { size: 'small', min: 1000, max: 16000, def: 8000, unit: 'Hz', color: '#9ca3af' }),
      knob('mix',       'Mix',    w*0.82, 82, { size: 'small', min: 0, max: 1, def: 0.4, color: '#f9fafb' }),
      inPort ('time_cv', 'T+', 'cv', w*0.10, 102),
      inPort ('fbk_cv',  'F+', 'cv', w*0.30, 102),
      inPort ('mod_cv',  'D+', 'cv', w*0.50, 102),
      inPort ('mix_cv',  'M+', 'cv', w*0.70, 102),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.30, 118),
      outPort('out_l', 'L', 'audio', w*0.70, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Vintage digitale echo, naar de rack-delays van begin jaren tachtig: companderende converters van Bits breed (12 = de klassieke kasten; 8 wordt krakerig), een bandbreedte Band met de aliasing van toen (de interne samplefrequentie is 2 × Band — het gruis op de herhalingen), en een sinus-modulatie op de leeskop (Rate/Depth) voor chorus op de echo. Twee sporen met Ratio (R-tijd als factor van L) en Cross-feedback zoals het stereo bandecho. Zonder R-kabel krijgt rechts hetzelfde als links. Firmware tp_mmb_digital_echo, mmb_dsp::DigitalEcho — in de simulator draait dezelfde code als wasm.',
  });
}

// ── BBD-chorus ─────────────────────────────────────────────────────────
function mmbBbdChorus() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_bbd_chorus', categoryId: 'effect', variant: 'BBD chorus / flanger',
    brand: 'MMB', model: 'BBD', hp: 10, texture: 'pcb-black', baseColor: '#1a1f1a', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'BBD CHORUS', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'emmertjes · stereo', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate',     'Rate',   w*0.25, 30, { size: 'medium', min: 0.02, max: 12, def: 0.6, unit: 'Hz', color: '#4ade80' }),
      knob('depth',    'Depth',  w*0.75, 30, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#4ade80' }),
      knob('delay',    'Delay',  w*0.25, 58, { size: 'small', min: 0.5, max: 40, def: 8, unit: 'ms', color: '#f9fafb' }),
      knob('feedback', 'Fbk',    w*0.75, 58, { size: 'small', min: -0.95, max: 0.95, def: 0, color: '#f9fafb' }),
      knob('mix',      'Mix',    w*0.20, 82, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('spread',   'Spread', w*0.50, 82, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
      knob('age',      'Age',    w*0.80, 82, { size: 'small', min: 0, max: 1, def: 0.3, color: '#9ca3af' }),
      knob('tone',     'Tone',   w*0.50, 58, { size: 'small', min: 0, max: 1, def: 0.6, color: '#9ca3af' }),
      inPort ('rate_cv',  'R+', 'cv', w*0.15, 102),
      inPort ('depth_cv', 'D+', 'cv', w*0.40, 102),
      inPort ('mix_cv',   'M+', 'cv', w*0.65, 102),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.32, 118),
      outPort('out_l', 'L', 'audio', w*0.68, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'BBD-chorus (emmertjesgeheugen, CE-1/Dimension-familie): een korte vertraging (Delay, 2–6 ms = flanger, 8–20 = chorus, 20+ = doubling) die door een driehoek-LFO (Rate/Depth) heen en weer wordt getrokken. Het karakter zit in de keten: laagdoorlaat aan in- en uitgang (Tone = bandbreedte van de emmertjes), een zachte compander en klokruis (Age). Twee sporen met Spread = LFO-fasehoek (0 = mono, 1 = tegenfase: het brede Dimension-beeld); Fbk negatief of positief voor de flanger-kant. Mono in geeft stereo uit; met een R-kabel blijft het echt stereo. Firmware tp_mmb_bbd_chorus, mmb_dsp::BbdChorus — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Ringmodulator ──────────────────────────────────────────────────────
function mmbRingMod() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_ringmod', categoryId: 'effect', variant: 'Ring modulator',
    brand: 'MMB', model: 'RING', hp: 8, texture: 'pcb-black', baseColor: '#1f1420', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'RING MOD', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'clean · diode', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('freq', 'Freq', w/2,    32, { size: 'large', min: 1, max: 5000, def: 440, unit: 'Hz', color: '#e879f9' }),
      sw  ('wave', 'Wave', w*0.22, 62, ['Sin', 'Tri', 'Sqr'], 0),
      sw  ('mode', 'Mode', w*0.72, 62, ['Clean', 'Diode'], 0),
      knob('bias', 'Bias', w*0.28, 86, { size: 'small', min: 0, max: 1, def: 0.3, color: '#9ca3af' }),
      knob('mix',  'Mix',  w*0.72, 86, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      inPort ('voct',    'V/Oct', 'cv',    w*0.20, 104),
      inPort ('mix_cv',  'M+',    'cv',    w*0.50, 104),
      inPort ('carrier', 'Car',   'audio', w*0.80, 104),
      inPort ('in',  'In',  'audio', w*0.30, 118),
      outPort('out', 'Out', 'audio', w*0.70, 118),
    ],
    notes: 'Ringmodulator: ingang × draaggolf. De draaggolf komt van de eigen oscillator (Freq × 2^V/Oct — stem hem met een MIDI-pitch voor harmonische klokken, of laat hem los voor metaal) of van de Car-ingang als daar een kabel in zit (dan is het een echte vierkwadrantvermenigvuldiger van twee signalen). Clean = het zuivere product: alleen som- en verschiltonen, de grondtonen verdwijnen. Diode = de vier-diodenring: Bias is de drempel van de dioden; de draaggolf en de ingang lekken door en er komen oneven harmonischen bij — het gemene van een echte ringmod. Firmware tp_mmb_ringmod, mmb_dsp::RingMod — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Octaver ────────────────────────────────────────────────────────────
function mmbOctaver() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_octaver', categoryId: 'effect', variant: 'Analog octaver',
    brand: 'MMB', model: 'OCTAVE', hp: 8, texture: 'pcb-black', baseColor: '#14201a', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'OCTAVER', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: '−1 · −2 · up', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('oct1', '−1 oct', w*0.28, 32, { size: 'medium', min: 0, max: 1, def: 0.7, color: '#34d399' }),
      knob('oct2', '−2 oct', w*0.72, 32, { size: 'medium', min: 0, max: 1, def: 0, color: '#34d399' }),
      knob('up',   'Up',     w*0.28, 62, { size: 'small', min: 0, max: 1, def: 0, color: '#34d399' }),
      knob('dry',  'Dry',    w*0.72, 62, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('tone', 'Tone',   w/2,    86, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      inPort ('oct1_cv', '1+', 'cv', w*0.20, 104),
      inPort ('oct2_cv', '2+', 'cv', w*0.50, 104),
      inPort ('up_cv',   'U+', 'cv', w*0.80, 104),
      inPort ('in',  'In',  'audio', w*0.30, 118),
      outPort('out', 'Out', 'audio', w*0.70, 118),
    ],
    notes: 'Analoge octaver naar de klassieke octaafpedalen (OC-2-familie): geen pitch-shifter maar een flip-flop. De ingang gaat door een tracking-laagdoorlaat, een comparator maakt er een blokgolf van en twee delers geven f/2 (−1 oct) en f/4 (−2 oct); die blokgolven ademen mee met de envelope van de ingang en worden afgerond door Tone (laag = bijna sinus, hoog = hoekig). Up is de Octavia-truc: dubbelfasig gelijkrichten voor een octaaf omhoog (rauw, fuzzy). De drie niveaus zijn moduleerbaar via de CV-ingangen (een kabel vervangt de knop): envelope of LFO op −1 oct geeft een ademende sub. Werkt het best op één noot tegelijk (bas, lead); op akkoorden gaat het net zo mooi mis als het origineel. Firmware tp_mmb_octaver, mmb_dsp::Octaver — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Harmonizer / pitch-shifter ─────────────────────────────────────────
function mmbHarmonizer() {
  const w = W(12);
  return assemble({
    typeId: 'tp_mmb_harmonizer', categoryId: 'effect', variant: 'Pitch shifter / harmonizer',
    brand: 'MMB', model: 'HARMONY', hp: 12, texture: 'pcb-black', baseColor: '#1a1424', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'HARMONIZER', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'twee stemmen · shimmer', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w*0.25, y: 22, text: 'A', fontSize: 1.2, color: '#c084fc', align: 'middle' },
      { x: w*0.75, y: 22, text: 'B', fontSize: 1.2, color: '#c084fc', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('semi_a',   'Semi',   w*0.14, 34, { size: 'medium', min: -24, max: 24, def: 0, step: 1, unit: 'st', color: '#c084fc', ticks: { every: 12, highlight: [-12, 0, 12] } }),
      knob('cent_a',   'Cent',   w*0.36, 34, { size: 'small', min: -50, max: 50, def: 0, unit: 'ct', color: '#c084fc' }),
      knob('semi_b',   'Semi',   w*0.64, 34, { size: 'medium', min: -24, max: 24, def: 7, step: 1, unit: 'st', color: '#c084fc', ticks: { every: 12, highlight: [-12, 0, 12] } }),
      knob('cent_b',   'Cent',   w*0.86, 34, { size: 'small', min: -50, max: 50, def: 0, unit: 'ct', color: '#c084fc' }),
      knob('lvl_a',    'Level',  w*0.14, 60, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('lvl_b',    'Level',  w*0.86, 60, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('window',   'Window', w*0.38, 62, { size: 'small', min: 8, max: 120, def: 40, unit: 'ms', color: '#9ca3af' }),
      knob('feedback', 'Fbk',    w*0.62, 62, { size: 'small', min: 0, max: 0.9, def: 0, color: '#9ca3af' }),
      knob('spread',   'Spread', w*0.14, 86, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('algo',     'Algo',   w*0.38, 86, ['Heads', 'Grains'], 0),
      knob('jitter',   'Jitter', w*0.62, 86, { size: 'small', min: 0, max: 1, def: 0.2, color: '#9ca3af' }),
      knob('mix',      'Mix',    w*0.86, 86, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      inPort ('voct_a', 'A V/Oct', 'cv', w*0.14, 104),
      inPort ('voct_b', 'B V/Oct', 'cv', w*0.40, 104),
      inPort ('mix_cv', 'M+',      'cv', w*0.66, 104),
      inPort ('in',    'In', 'audio', w*0.20, 118),
      outPort('out_l', 'L',  'audio', w*0.66, 118),
      outPort('out_r', 'R',  'audio', w*0.86, 118),
    ],
    notes: 'Pitch-shifter/harmonizer in de stijl van de rack-harmonizers: twee stemmen (A, B) die elk een vertragingslijn met twee kruisgefadete leeskoppen uitlezen — de koppen lopen met 2^(semi/12) door het geheugen. Semi in halve tonen (±24), Cent fijn, en A V/Oct / B V/Oct tellen erbij op (1 V = 12 st: een sequencer of de MIDI-pitch als interval). Window = korrel: klein (10–20 ms) volgt strak maar klinkt ietsje metaalachtig, groot (60–100) is zachter maar smeert aanslagen. Fbk stuurt het natte signaal terug de shifter in: +12 met feedback = shimmer, +7 = getrapte kwinten. Spread zet A links en B rechts. Algo kiest de methode: Heads = twee koppen met een pitch-synchroon venster (strak op één noot: lead, bas, zang; op akkoorden het vintage gewiebel), Grains = korrels van Window ms met een Hann-venster, vier tegelijk over elkaar (gladder op akkoorden en pads); Jitter maakt plek, lengte en moment van de korrels willekeurig, van glad naar een wolkje. Mono in, stereo uit. Firmware tp_mmb_harmonizer, mmb_dsp::Harmonizer — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Plaat-/veergalm ────────────────────────────────────────────────────
function mmbReverb() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_reverb', categoryId: 'effect', variant: 'Plate / spring reverb',
    brand: 'MMB', model: 'PLATE·SPRING', hp: 10, texture: 'pcb-black', baseColor: '#141c24', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'REVERB', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'plaat · veer', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('size',     'Size',   w*0.28, 32, { size: 'large', min: 0, max: 1, def: 0.6, color: '#7dd3fc' }),
      sw  ('mode',     'Mode',   w*0.76, 30, ['Plate', 'Spring'], 0),
      knob('damp',     'Damp',   w*0.22, 62, { size: 'small', min: 0, max: 1, def: 0.4, color: '#9ca3af' }),
      knob('predelay', 'Pre',    w*0.50, 62, { size: 'small', min: 0, max: 120, def: 10, unit: 'ms', color: '#9ca3af' }),
      knob('mod',      'Mod',    w*0.78, 62, { size: 'small', min: 0, max: 1, def: 0.3, color: '#9ca3af' }),
      knob('mix',      'Mix',    w/2,    86, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      inPort ('size_cv', 'S+', 'cv', w*0.25, 104),
      inPort ('mix_cv',  'M+', 'cv', w*0.75, 104),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.32, 118),
      outPort('out_l', 'L', 'audio', w*0.68, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Twee galmen in één. Plate = de Dattorro-tank (input-diffusie, twee gemoduleerde all-passes, vier vertragingen in een acht, demping in de lus, zeven taps per kant): de gladde studioplaat; Size = decay, Damp = hoe snel het hoog wegsterft, Mod = de lichte zweving die de tank van metaal naar lucht brengt. Spring = twee veren (L/R iets anders): een vertragingslijn in feedback met acht dispersieve all-passes in de lus — laag komt later dan hoog, dat is de "boing" — een ingangs-bandpass en gerommel via Mod; Size = hoe lang de veer natrilt. Pre = predelay. Zonder R-kabel krijgt rechts hetzelfde als links. Firmware tp_mmb_reverb, mmb_dsp::Reverb — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Tremolo-pedaal ─────────────────────────────────────────────────────
function mmbTremolo() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_tremolo', categoryId: 'effect', variant: 'Tremolo pedal',
    brand: 'MMB', model: 'TREM', hp: 8, texture: 'pcb-black', baseColor: '#1f1a10', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'TREMOLO', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'amp · opto · harm · pan', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate',  'Rate',  w*0.28, 32, { size: 'medium', min: 0.05, max: 20, def: 4.5, unit: 'Hz', color: '#fbbf24' }),
      knob('depth', 'Depth', w*0.72, 32, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#fbbf24' }),
      sw  ('mode',  'Mode',  w*0.22, 60, ['Amp', 'Opto', 'Harm', 'Pan'], 0),
      sw  ('wave',  'Wave',  w*0.72, 60, ['Sin', 'Tri', 'Sqr'], 0),
      knob('shape', 'Shape', w*0.28, 88, { size: 'small', min: 0, max: 1, def: 0, color: '#9ca3af' }),
      knob('level', 'Level', w*0.72, 88, { size: 'small', min: 0, max: 2, def: 1, color: '#f9fafb' }),
      inPort ('rate_cv',  'R+', 'cv', w*0.25, 104),
      inPort ('depth_cv', 'D+', 'cv', w*0.75, 104),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.32, 118),
      outPort('out_l', 'L', 'audio', w*0.68, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Tremolo-pedaal in vier smaken. Amp = bias-tremolo van een buizenversterker (de dip is dieper dan de piek hoog is). Opto = fotocel-tremolo (blackface): de cel volgt de lamp snel omhoog en traag terug — het scheve, schokkerige golfje. Harm = brownface harmonic tremolo: laag en hoog (split bij 800 Hz) in tegenfase — half tremolo, half phaser. Pan = L en R in tegenfase: auto-panner. Wave sin/tri/sqr, Shape drukt de golf naar een blok toe, Level tot ×2 om het gemiddelde verlies te compenseren. Rate en Depth met CV (een LFO op Rate = ritmische versnelling). Mono in geeft stereo uit. Firmware tp_mmb_tremolo, mmb_dsp::Tremolo — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Vibe (univibe-familie) ─────────────────────────────────────────────
function mmbVibe() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_vibe', categoryId: 'effect', variant: 'Vibe (univibe-style)',
    brand: 'MMB', model: 'VIBE', hp: 8, texture: 'pcb-black', baseColor: '#241a12', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'VIBE', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'lamp · 4 × LDR', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('speed',     'Speed',     w*0.28, 32, { size: 'medium', min: 0.1, max: 12, def: 2, unit: 'Hz', color: '#fb923c' }),
      knob('intensity', 'Intensity', w*0.72, 32, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#fb923c' }),
      sw  ('mode',      'Mode',      w*0.24, 60, ['Chorus', 'Vibrato', 'Light'], 0),
      knob('lamp_age',  'Lamp age',  w*0.72, 62, { size: 'small', min: 0, max: 1, def: 0.7, color: '#9ca3af' }),
      knob('volume',    'Volume',    w/2,    88, { size: 'small', min: 0, max: 2, def: 1, color: '#f9fafb' }),
      inPort ('speed_cv',     'S+', 'cv', w*0.25, 104),
      inPort ('intensity_cv', 'I+', 'cv', w*0.75, 104),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.32, 118),
      outPort('out_l', 'L', 'audio', w*0.68, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'De univibe-familie (en moderne klonen als de Mojo Vibe): geen gewone phaser maar vier fasedraai-trappen met elk een andere condensator, zodat de notches wijd verspreid liggen, en vier lichtgevoelige weerstanden (LDR) rond één lampje dat door een LFO wordt aangestuurd. Het lampje reageert niet-lineair en de LDR’s worden snel laag-ohmig bij licht maar herstellen traag in het donker: de sweep is scheef en kloppend, hij ademt. Mode Chorus = droog + nat (het klassieke geluid, tussen chorus en phaser in); Vibrato = alleen nat (de fasedraaiing trekt aan de toonhoogte); Light = een zuivere vibrato met een vertragingslijn, zonder lampkarakter. Lamp age regelt hoeveel van dat oude-lamp-karakter erin zit (0 = nette sinus, 1 = een oud exemplaar). Speed en Intensity met CV — een expressiepedaal of envelope op Speed doet wat de voetpedaal-versie deed. Mono in geeft stereo uit. Firmware tp_mmb_vibe, mmb_dsp::Vibe — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Rotary (draaiende luidspreker) ─────────────────────────────────────
function mmbRotary() {
  const w = W(12);
  return assemble({
    typeId: 'tp_mmb_rotary', categoryId: 'effect', variant: 'Rotary speaker',
    brand: 'MMB', model: 'ROTARY', hp: 12, texture: 'pcb-black', baseColor: '#2a1d14', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'ROTARY', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'hoorn · trommel · traagheid', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('speed',     'Speed',   w*0.16, 30, ['Slow', 'Fast', 'Brake'], 0),
      knob('slow_rate', 'Slow',    w*0.44, 30, { size: 'medium', min: 0.1, max: 3, def: 0.8, unit: 'Hz', color: '#f59e0b' }),
      knob('fast_rate', 'Fast',    w*0.76, 30, { size: 'medium', min: 2, max: 10, def: 6.7, unit: 'Hz', color: '#f59e0b' }),
      knob('inertia',   'Inertia', w*0.16, 60, { size: 'small', min: 0.25, max: 2, def: 1, color: '#9ca3af' }),
      knob('drive',     'Drive',   w*0.40, 60, { size: 'small', min: 0, max: 1, def: 0.2, color: '#ef4444' }),
      knob('balance',   'Horn/Drum', w*0.64, 60, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      knob('spread',    'Spread',  w*0.86, 60, { size: 'small', min: 0, max: 1, def: 0.8, color: '#9ca3af' }),
      knob('noise',     'Noise',   w*0.30, 86, { size: 'small', min: 0, max: 1, def: 0.3, color: '#9ca3af' }),
      knob('level',     'Level',   w*0.70, 86, { size: 'small', min: 0, max: 2, def: 1, color: '#f9fafb' }),
      inPort ('fast',     'Fast', 'gate', w*0.25, 104),
      inPort ('drive_cv', 'D+',   'cv',   w*0.55, 104),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.30, 118),
      outPort('out_l', 'L', 'audio', w*0.70, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Draaiende luidspreker in Leslie-stijl: een hoorn voor het hoog en een trommel voor het laag (scheiding bij 800 Hz), elk met een eigen motor en eigen traagheid. De hoorn versnelt in ongeveer een seconde, de zware trommel in een seconde of vier, en vertragen duurt langer dan versnellen — tijdens het omschakelen lopen ze uit elkaar, en dat opwinden hoor je. Slow en Fast zijn allebei instelbaar (zoals op een ELKA); de standaard 0,8 en 6,7 Hz zijn die van een klassiek exemplaar, en de trommel draait altijd iets langzamer dan de hoorn. Brake laat beide uitlopen tot stilstand. Inertia schaalt de traagheid (0,25 = vlug, 2 = extra zwaar). Wat je hoort: Doppler (de toonhoogte schommelt), richting (van voren luid en helder, van achteren zacht en dof), een reflectie van de kastwand, en de bijgeluiden — de hoorn suist hoorbaar als hij snel draait, de motor bromt, de trommel rommelt en het relais tikt bij het omschakelen (Noise). Drive is de buizenvoorversterker. Spread = hoek tussen de twee microfoons (0 = mono). De Fast-gate schakelt op de flank: omhoog = snel, omlaag = langzaam — hang er het mod-wiel of een voetschakelaar via MIDI aan; de schakelaar op het paneel werkt ernaast. Mono in (L+R), stereo uit. Firmware tp_mmb_rotary, mmb_dsp::Leslie — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Shimmer reverb ─────────────────────────────────────────────────────
function mmbShimmer() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_shimmer', categoryId: 'effect', variant: 'Shimmer reverb',
    brand: 'MMB', model: 'SHIMMER', hp: 10, texture: 'pcb-black', baseColor: '#161a2a', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'SHIMMER', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'galm · octaaf in de lus', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('shimmer',  'Shimmer',  w*0.28, 32, { size: 'large', min: 0, max: 1, def: 0.5, color: '#a5b4fc' }),
      sw  ('interval', 'Interval', w*0.78, 30, ['+12', '+7', '+19', '+24', '−12'], 0),
      knob('size',     'Size',     w*0.20, 62, { size: 'small', min: 0, max: 1, def: 0.75, color: '#7dd3fc' }),
      knob('damp',     'Damp',     w*0.44, 62, { size: 'small', min: 0, max: 1, def: 0.35, color: '#9ca3af' }),
      knob('tone',     'Tone',     w*0.68, 62, { size: 'small', min: 0, max: 1, def: 0.6, color: '#9ca3af' }),
      knob('predelay', 'Pre',      w*0.20, 86, { size: 'small', min: 0, max: 120, def: 20, unit: 'ms', color: '#9ca3af' }),
      knob('mod',      'Mod',      w*0.44, 86, { size: 'small', min: 0, max: 1, def: 0.4, color: '#9ca3af' }),
      knob('mix',      'Mix',      w*0.72, 86, { size: 'medium', min: 0, max: 1, def: 0.4, color: '#f9fafb' }),
      inPort ('shimmer_cv', 'Sh+', 'cv', w*0.20, 104),
      inPort ('size_cv',    'S+',  'cv', w*0.50, 104),
      inPort ('mix_cv',     'M+',  'cv', w*0.80, 104),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.32, 118),
      outPort('out_l', 'L', 'audio', w*0.68, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Shimmer reverb: de plaatgalm (dezelfde Dattorro-tank als REVERB) met in de lus een korrel-pitch-shifter. De natte galm wordt een Interval omhoog geschoven (+12 = een octaaf, het bekende geluid; +7 een kwint, +19 octaaf plus kwint, −12 een octaaf omlaag) en gaat terug de galm in. Elke ronde komt er zo een laagje een interval hoger bij: een glinsterende wolk boven wat je speelt. Shimmer = hoeveel er terug gaat (0 = gewone plaat), Tone = hoe helder de lus is (lager = warmer, minder gefluit), Size/Damp/Pre/Mod zoals bij de plaat. Een zachte begrenzer in de lus voorkomt dat hij wegloopt. Zonder R-kabel krijgt rechts hetzelfde als links. Firmware tp_mmb_shimmer, mmb_dsp::Shimmer — in de simulator draait dezelfde code als wasm.',
  });
}

// ── Stereo phaser ──────────────────────────────────────────────────────
function mmbStereoPhaser() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_stereo_phaser', categoryId: 'effect', variant: 'Stereo phaser',
    brand: 'MMB', model: 'PHASE-ST', hp: 8, texture: 'pcb-black', baseColor: '#10201c', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'STEREO PHASER', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: '2 × 6 stages', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate',     'Rate',   w*0.28, 32, { size: 'medium', min: 0.02, max: 8, def: 0.4, unit: 'Hz', color: '#2dd4bf' }),
      knob('depth',    'Depth',  w*0.72, 32, { size: 'medium', min: 0, max: 1, def: 0.7, color: '#2dd4bf' }),
      knob('feedback', 'Fbk',    w*0.28, 62, { size: 'small', min: 0, max: 0.95, def: 0.3, color: '#9ca3af' }),
      knob('spread',   'Spread', w*0.72, 62, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      knob('mix',      'Mix',    w/2,    88, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      inPort ('rate_cv',  'R+', 'cv', w*0.25, 104),
      inPort ('depth_cv', 'D+', 'cv', w*0.75, 104),
      inPort ('in_l',  'L', 'audio', w*0.12, 118),
      inPort ('in_r',  'R', 'audio', w*0.32, 118),
      outPort('out_l', 'L', 'audio', w*0.68, 118),
      outPort('out_r', 'R', 'audio', w*0.88, 118),
    ],
    notes: 'Stereo phaser: twee keer de zes-traps all-pass-cascade van de mono phaser, met de LFO van rechts een Spread-deel verschoven — 0 = mono, 0,5 = een kwartslag (draaiend, breed), 1 = tegenfase (de notches van links zitten waar rechts open is). Fbk laat de notches resoneren. Mono in geeft stereo uit; met een R-kabel blijft het echt stereo. Firmware tp_mmb_stereo_phaser, mmb_dsp::StereoPhaser — in de simulator draait dezelfde code als wasm.',
  });
}

function mmbBusComp() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_bus_comp',
    categoryId: 'effect',
    variant: 'VCA bus compressor',
    brand: 'MMB', model: 'VCA-BUS',
    hp: 10, texture: 'pcb-black', baseColor: '#1a1d22', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'VCA-BUS', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'bus compressor', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('threshold', 'Threshold', w*0.27, 30, { size: 'medium', min: -60, max: 0, def: -18, unit: 'dB', color: '#f5a623' }),
      knob('makeup',    'Makeup',    w*0.73, 30, { size: 'medium', min: 0, max: 20, def: 0, unit: 'dB', color: '#f5a623' }),
      sw  ('ratio',   'Ratio',   w*0.10, 54, ['2:1', '4:1', '10:1'], 1),
      sw  ('attack',  'Attack',  w*0.40, 60, ['0.1', '0.3', '1', '3', '10', '30'], 5),
      sw  ('release', 'Release', w*0.70, 59, ['0.1', '0.3', '0.6', '1.2', 'Auto'], 4),
      sw  ('sc_hpf',  'SC HPF',  w*0.10, 82, ['Uit', '60', '100', '150'], 0),
      knob('mix',     'Mix',     w*0.48, 84, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
      sw  ('bypass',  'Bypass',  w*0.78, 84, ['Uit', 'Aan'], 0),
      inPort ('in_l',  'L',  'audio', w*0.12, 106),
      inPort ('in_r',  'R',  'audio', w*0.28, 106),
      outPort('gr',    'GR', 'cv',    w*0.50, 106),
      outPort('out_l', 'L',  'audio', w*0.72, 106),
      outPort('out_r', 'R',  'audio', w*0.88, 106),
    ],
    notes: 'VCA-buscompressor die knipoogt naar de SSL G-bus: strak en schoon, de lijm op een mix. Vaste standen zoals het apparaat: Attack 0,1 tot 30 ms, Release 0,1 tot 1,2 s en Auto, Ratio 2/4/10. De klassieke busstand: attack 30, release Auto, ratio 2 of 4 — de aanslag komt erdoor en de mix pompt mee met de maat. Auto = een snelle envelope (100 ms) voor losse pieken en een trage (1,2 s) die alleen bij aanhoudend luid materiaal groeit; de grootste wint. SC HPF (niet op het origineel) haalt laag uit de detector zodat de bas hem minder laat pompen. Makeup, Mix (parallel), Bypass, GR als CV. Stereo gekoppeld. Firmware tp_mmb_bus_comp (mmb_dsp::BusComp); dezelfde kern als wasm in de simulator.',
  });
}

// 10f. MMB VARI-MU — 10 HP. Variable-mu buizencompressor in Fairchild-stijl (FW-FX-3 stap 4).
function mmbVariMuComp() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_varimu_comp',
    categoryId: 'effect',
    variant: 'Vari-mu compressor',
    brand: 'MMB', model: 'VARI-MU',
    hp: 10, texture: 'pcb-black', baseColor: '#201a14', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'VARI-MU', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'tube limiter', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('input',     'Input',     w*0.20, 30, { size: 'medium', min: -12, max: 24, def: 0, unit: 'dB', color: '#f5a623' }),
      knob('threshold', 'Threshold', w*0.50, 30, { size: 'medium', min: -40, max: 0, def: -18, unit: 'dB', color: '#f5a623' }),
      knob('output',    'Output',    w*0.80, 30, { size: 'medium', min: -24, max: 12, def: 0, unit: 'dB', color: '#f5a623' }),
      sw  ('time',  'Time',  w*0.12, 62, ['1', '2', '3', '4', '5', '6'], 1),
      sw  ('mode',  'Mode',  w*0.42, 56, ['LR', 'M/S'], 0),
      knob('color', 'Color', w*0.76, 54, { size: 'small', min: 0, max: 2, def: 1, color: '#f5a623' }),
      knob('mix',   'Mix',   w*0.76, 74, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
      sw  ('bypass', 'Bypass', w*0.42, 78, ['Uit', 'Aan'], 0),
      inPort ('in_l',  'L',  'audio', w*0.12, 106),
      inPort ('in_r',  'R',  'audio', w*0.28, 106),
      outPort('gr',    'GR', 'cv',    w*0.50, 106),
      outPort('out_l', 'L',  'audio', w*0.72, 106),
      outPort('out_r', 'R',  'audio', w*0.88, 106),
    ],
    notes: 'Variable-mu buizencompressor die knipoogt naar de Fairchild 660/670: dik, warm, lijm. Er is geen vaste ratio: een paar dB boven de drempel rond 2:1, 20 dB erboven ~12:1 — zacht in, stevig aan de top. Time 1–6 zoals het apparaat (attack 0,2–0,8 ms, release 0,3 / 0,8 / 2 / 5 s); 5 en 6 passen zich aan het programma aan (een trage envelope die alleen bij aanhoudend materiaal groeit, loslaten in 10 of 25 s). Mode LR regelt links en rechts samen, M/S (lateral/vertical, zoals de 670) midden en zijkant apart: het midden stevig zonder de ruimte in te klemmen. Color = buisvervorming die meegroeit met het ingrijpen (dubbel bemonsterd). Input, Threshold, Output, Mix, Bypass, GR als CV. Firmware tp_mmb_varimu_comp (mmb_dsp::VariMuComp); dezelfde kern als wasm in de simulator.',
  });
}

// 10g. MMB PROGRAM EQ — 12 HP. Passieve program-EQ in Pultec-EQP-1A-stijl (FW-FX-3 stap 5).
function mmbProgramEq() {
  const w = W(12);
  const k10 = (id: string, label: string, x: number, y: number, size: 'small' | 'medium' = 'medium') =>
    knob(id, label, x, y, { size, min: 0, max: 10, def: 0, color: '#f5a623', ticks: { every: 1, highlight: [0, 10] } });
  return assemble({
    typeId: 'tp_mmb_program_eq',
    categoryId: 'effect',
    variant: 'Program EQ',
    brand: 'MMB', model: 'PROGRAM EQ',
    hp: 12, texture: 'pcb-black', baseColor: '#1c2230', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'PROGRAM EQ', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'passive program equalizer', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('low_freq',  'Low Hz', w*0.07, 30, ['20', '30', '60', '100'], 2),
      k10 ('low_boost', 'Boost',  w*0.34, 30),
      k10 ('low_atten', 'Atten',  w*0.58, 30),
      knob('output', 'Output', w*0.84, 30, { size: 'small', min: -12, max: 12, def: 0, unit: 'dB', color: '#9ca3af' }),
      sw  ('high_freq',  'High kHz', w*0.07, 60, ['3', '4', '5', '8', '10', '12', '16'], 4),
      k10 ('high_boost', 'Boost',     w*0.34, 58),
      knob('bandwidth', 'Bandwidth', w*0.58, 58, { size: 'small', min: 0, max: 10, def: 5, color: '#f9fafb', ticks: { every: 1, highlight: [0, 10] } }),
      knob('color',     'Color',     w*0.84, 58, { size: 'small', min: 0, max: 2, def: 1, color: '#f5a623' }),
      sw  ('atten_freq', 'Atten kHz', w*0.07, 86, ['5', '10', '20'], 1),
      k10 ('high_atten', 'Atten',     w*0.34, 86),
      sw  ('bypass', 'Bypass', w*0.66, 86, ['Uit', 'Aan'], 0),
      inPort ('in_l',  'L', 'audio', w*0.15, 106),
      inPort ('in_r',  'R', 'audio', w*0.32, 106),
      outPort('out_l', 'L', 'audio', w*0.68, 106),
      outPort('out_r', 'R', 'audio', w*0.85, 106),
    ],
    notes: 'Passieve program-EQ die knipoogt naar de Pultec EQP-1A. Laag (20/30/60/100 Hz): Boost tot +13,5 dB (een shelf met een lichte bult rond de frequentie) en een aparte Atten tot −10 dB die hoger begint (~3×) en zachter is. Draai je beide open, dan krijg je de beroemde Pultec-truc: een stevige boost onderin en een dip net erboven — vol maar niet modderig (op 60 Hz, beide op 10: +4,6 dB op 30 Hz, −6,8 dB rond 120 Hz). Hoog: een Boost-bell op 3–16 kHz (tot +16 dB) met Bandwidth van scherp naar breed, en een aparte Atten (shelf op 5/10/20 kHz, tot −16 dB). Buistrap met Color (0 = schoon), Output om het niveau gelijk te trekken bij een A/B met Bypass. Knoppen 0–10 zoals het apparaat; draaien glijdt in ~5 ms zodat het niet ritst. Stereo. Firmware tp_mmb_program_eq (mmb_dsp::ProgramEq); dezelfde kern als wasm in de simulator.',
  });
}

// 10h. MMB DIODE COMP — 10 HP. Diodebrug-compressor in Neve-33609-stijl (FW-FX-3 stap 6).
function mmbDiodeComp() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_diode_comp',
    categoryId: 'effect',
    variant: 'Diode bridge compressor',
    brand: 'MMB', model: 'DIODE',
    hp: 10, texture: 'pcb-black', baseColor: '#232a24', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'DIODE COMP', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'diode bridge compressor', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('threshold', 'Threshold', w*0.27, 30, { size: 'medium', min: -50, max: 0, def: -20, unit: 'dB', color: '#f5a623' }),
      knob('makeup',    'Makeup',    w*0.73, 30, { size: 'medium', min: 0, max: 20, def: 0, unit: 'dB', color: '#f5a623' }),
      sw  ('ratio',   'Ratio',   w*0.10, 58, ['1.5', '2', '3', '4', '6'], 1),
      sw  ('attack',  'Attack',  w*0.40, 54, ['Fast', 'Slow'], 1),
      sw  ('release', 'Release', w*0.66, 60, ['0.1', '0.4', '0.8', '1.5', 'A1', 'A2'], 4),
      knob('color', 'Color', w*0.40, 76, { size: 'small', min: 0, max: 2, def: 1, color: '#f5a623' }),
      knob('mix',   'Mix',   w*0.14, 84, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
      sw  ('bypass', 'Bypass', w*0.70, 86, ['Uit', 'Aan'], 0),
      inPort ('in_l',  'L',  'audio', w*0.12, 106),
      inPort ('in_r',  'R',  'audio', w*0.28, 106),
      outPort('gr',    'GR', 'cv',    w*0.50, 106),
      outPort('out_l', 'L',  'audio', w*0.72, 106),
      outPort('out_r', 'R',  'audio', w*0.88, 106),
    ],
    notes: 'Diodebrug-compressor die knipoogt naar de Neve 33609 / 2254: dik en gekleurd. Diodes zijn symmetrisch, dus vooral oneven harmonischen (3e, 5e) — anders dan de buis (even) en de FET (gemengd) — en die groeien hard mee met het ingrijpen: rustig is bijna schoon, flink ingrijpen wordt dik en Brits. Ratio 1,5 / 2 / 3 / 4 / 6 met een zachte knie, Attack Fast (2 ms) of Slow (10 ms), Release 0,1 / 0,4 / 0,8 / 1,5 s en A1/A2 (programma-afhankelijk: een snelle envelope van 40 of 150 ms naast een trage die alleen bij aanhoudend materiaal groeit en in 5 s loslaat). Color schaalt de diodevervorming (dubbel bemonsterd, alleen het vervormingsdeel), Threshold, Makeup, Mix, Bypass, GR als CV. Stereo gekoppeld. Firmware tp_mmb_diode_comp (mmb_dsp::DiodeComp); dezelfde kern als wasm in de simulator.',
  });
}

// 10i. MMB CONSOLE EQ — 10 HP. Britse klasse-A console-EQ in 1073-stijl (vintage-eq stap 1).
function mmbConsoleEq() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_console_eq',
    categoryId: 'effect',
    variant: 'Console EQ',
    brand: 'MMB', model: 'CONSOLE EQ',
    hp: 10, texture: 'pcb-black', baseColor: '#2a2320', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'CONSOLE EQ', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'class-A channel equalizer', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('hpf',      'HPF',   w*0.10, 32, ['Uit', '50', '80', '160', '300'], 0),
      knob('high_gain', 'High 12k', w*0.45, 30, { size: 'medium', min: -16, max: 16, def: 0, unit: 'dB', color: '#38bdf8' }),
      knob('output',    'Output',   w*0.80, 30, { size: 'small', min: -12, max: 12, def: 0, unit: 'dB', color: '#9ca3af' }),
      sw  ('mid_freq', 'Mid Hz', w*0.10, 62, ['360', '700', '1.6k', '3.2k', '4.8k', '7.2k'], 2),
      knob('mid_gain',  'Mid',    w*0.45, 58, { size: 'medium', min: -18, max: 18, def: 0, unit: 'dB', color: '#f5a623' }),
      knob('color',     'Color',  w*0.80, 58, { size: 'small', min: 0, max: 2, def: 1, color: '#f5a623' }),
      sw  ('low_freq', 'Low Hz', w*0.10, 88, ['35', '60', '110', '220'], 1),
      knob('low_gain',  'Low',    w*0.45, 86, { size: 'medium', min: -16, max: 16, def: 0, unit: 'dB', color: '#f97316' }),
      sw  ('bypass', 'Bypass', w*0.78, 88, ['Uit', 'Aan'], 0),
      inPort ('in_l',  'L', 'audio', w*0.15, 106),
      inPort ('in_r',  'R', 'audio', w*0.32, 106),
      outPort('out_l', 'L', 'audio', w*0.68, 106),
      outPort('out_r', 'R', 'audio', w*0.85, 106),
    ],
    notes: 'Console-EQ die knipoogt naar de Britse klasse-A kanaal-EQ (Neve 1073). Vaste keuzefrequenties, zoals het apparaat: HPF uit/50/80/160/300 Hz met 18 dB/oct; Low shelf op 35/60/110/220 Hz (±16 dB) met een lichte bult bij de knik — de inductor — waardoor +6 dB laag stevig klinkt en niet wollig; Mid bell op 360 Hz–7,2 kHz (±18 dB) met een matige Q die licht meeloopt met de gain (kleine ingrepen breed, grote gerichter); High shelf op 12 kHz (±16 dB). Color = klasse-A/transformatorkleur (asymmetrische verzadiging rond −12 dBFS, dubbel bemonsterd; 0 schoon, 2 dik). Output om het niveau gelijk te trekken bij een A/B met Bypass. Draaien glijdt in ~5 ms. Stereo. Firmware tp_mmb_console_eq (mmb_dsp::ConsoleEq); dezelfde kern als wasm in de simulator.',
  });
}

// 10j. MMB PARA EQ — 14 HP. Vierbands parametrische EQ in SSL/API-stijl (vintage-eq stap 2).
function mmbParaEq() {
  const w = W(14);
  const gain = (id: string, x: number, y: number) =>
    knob(id, 'Gain', x, y, { size: 'small', min: -15, max: 15, def: 0, unit: 'dB', color: '#f5a623' });
  return assemble({
    typeId: 'tp_mmb_para_eq',
    categoryId: 'effect',
    variant: 'Parametric EQ',
    brand: 'MMB', model: 'PARA EQ',
    hp: 14, texture: 'pcb-black', baseColor: '#1e232b', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'PARA EQ', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: '4-band parametric equalizer', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w*0.13, y: 22, text: 'LF',  fontSize: 1.4, color: '#f97316', align: 'middle' },
      { x: w*0.38, y: 22, text: 'LMF', fontSize: 1.4, color: '#f5a623', align: 'middle' },
      { x: w*0.63, y: 22, text: 'HMF', fontSize: 1.4, color: '#f5a623', align: 'middle' },
      { x: w*0.88, y: 22, text: 'HF',  fontSize: 1.4, color: '#38bdf8', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('lf_freq',  'Freq', w*0.13, 32, { size: 'small', min: 30, max: 450, def: 100, unit: 'Hz', taper: 'log', color: '#f97316' }),
      gain('lf_gain', w*0.13, 50),
      sw  ('lf_shelf', 'Shape', w*0.10, 68, ['Bell', 'Shelf'], 1),
      knob('lmf_freq', 'Freq', w*0.38, 32, { size: 'small', min: 200, max: 2000, def: 600, unit: 'Hz', taper: 'log', color: '#f5a623' }),
      gain('lmf_gain', w*0.38, 50),
      knob('lmf_q',    'Q',    w*0.38, 68, { size: 'small', min: 0.4, max: 4, def: 1, taper: 'log', color: '#9ca3af' }),
      knob('hmf_freq', 'Freq', w*0.63, 32, { size: 'small', min: 600, max: 7000, def: 2500, unit: 'Hz', taper: 'log', color: '#f5a623' }),
      gain('hmf_gain', w*0.63, 50),
      knob('hmf_q',    'Q',    w*0.63, 68, { size: 'small', min: 0.4, max: 4, def: 1, taper: 'log', color: '#9ca3af' }),
      knob('hf_freq',  'Freq', w*0.88, 32, { size: 'small', min: 1500, max: 16000, def: 8000, unit: 'Hz', taper: 'log', color: '#38bdf8' }),
      gain('hf_gain', w*0.88, 50),
      sw  ('hf_shelf', 'Shape', w*0.85, 68, ['Bell', 'Shelf'], 1),
      knob('hpf',    'HPF',    w*0.13, 88, { size: 'small', min: 16, max: 400, def: 16, unit: 'Hz', taper: 'log', color: '#9ca3af' }),
      knob('lpf',    'LPF',    w*0.88, 88, { size: 'small', min: 3000, max: 20000, def: 20000, unit: 'Hz', taper: 'log', color: '#9ca3af' }),
      sw  ('prop_q', 'Prop.Q', w*0.35, 90, ['Uit', 'Aan'], 0),
      knob('output', 'Output', w*0.63, 88, { size: 'small', min: -12, max: 12, def: 0, unit: 'dB', color: '#9ca3af' }),
      sw  ('bypass', 'Bypass', w*0.50, 108, ['Uit', 'Aan'], 0),
      inPort ('in_l',  'L', 'audio', w*0.10, 108),
      inPort ('in_r',  'R', 'audio', w*0.24, 108),
      outPort('out_l', 'L', 'audio', w*0.76, 108),
      outPort('out_r', 'R', 'audio', w*0.90, 108),
    ],
    notes: 'Vierbands parametrische EQ die knipoogt naar de Britse mixer-EQ (SSL E/G): strak, schoon, het werkpaard. LF (30–450 Hz) en HF (1,5–16 kHz) schakelbaar bell of shelf; LMF (200 Hz–2 kHz) en HMF (600 Hz–7 kHz) met eigen Q (0,4–4); alle ±15 dB. HPF 12 dB/oct (helemaal links = uit) en LPF (helemaal rechts = uit). Prop.Q is de Amerikaanse stand (API 550): de Q loopt mee met de gain — een kleine ingreep is breed, een grote gericht. Geen verzadiging; Output om het niveau gelijk te trekken bij een A/B met Bypass. Alle knoppen glijden in ~5 ms. Stereo. Firmware tp_mmb_para_eq (mmb_dsp::ParamEq); dezelfde kern als wasm in de simulator.',
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

// 12b. MMB OCTA-VCF — 20 HP. Acht SVF-cellen, één gedeelde control-set
//     (FW-PM-2). Per cel: audio-in, cutoff-CV, audio-uit. Compacte poly.
function mmbOctaVcf() {
  const w = W(20);
  const colX = (i: number) => w * (0.08 + i * 0.119);
  return assemble({
    typeId: 'tp_mmb_octa_vcf',
    categoryId: 'vcf',
    variant: 'Octa VCF (shared controls)',
    brand: 'MMB', model: 'OCTA-VCF-S',
    hp: 20, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'flt',
      label: 'Filter',
      count: 8,
      portIds: ['in', 'cv', 'out'],
      controlIds: [],
    }],
    texts: [
      { x: w/2, y: 8,   text: 'OCTA-VCF-S', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'shared controls · 8 cells', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('cutoff', 'Cutoff', w*0.25, 34, { size: 'large',  min: 20, max: 18000, def: 800, unit: 'Hz', color: '#f9fafb' }),
      knob('q',      'Res',    w*0.47, 34, { size: 'medium', min: 0.7, max: 5, def: 0.9, color: '#f9fafb' }),
      knob('cv_amt', 'CV amt', w*0.66, 34, { size: 'medium', min: 0, max: 7, def: 2, unit: 'oct', color: '#f9fafb' }),
      sw  ('type',   'Type',   w*0.86, 30, ['LP','BP','HP'], 0),

      inPort('cv', 'CV (all)', 'cv', w*0.50, 64),

      ...Array.from({ length: 8 }, (_, i) =>
        inPort(`in_${i+1}`, 'In', 'audio', colX(i), 84, { cellGroupId: 'flt' })),
      ...Array.from({ length: 8 }, (_, i) =>
        inPort(`cv_${i+1}`, 'CV', 'cv', colX(i), 101, { cellGroupId: 'flt' })),
      ...Array.from({ length: 8 }, (_, i) =>
        outPort(`out_${i+1}`, 'Out', 'audio', colX(i), 118, { cellGroupId: 'flt' })),
    ],
    notes: 'Multi-module met 8 identieke state-variable-filtercellen die één control-set delen (cutoff/res/CV-diepte/type) — de vorm van de latere hardware-module met één set fysieke knoppen. Per cel een eigen audio-in, cutoff-CV (±1 = ±CV-amt octaven, bovenop de gedeelde CV-ingang) en audio-uit. Type kiest LP/BP/HP voor alle cellen (her-push nodig). Firmware: tp_mmb_octa_vcf (FW-PM-2).',
  });
}

// 12c. MMB OCTA-VCA — 16 HP. Acht multiply-VCA-cellen, gedeelde level
//     (FW-PM-3). Typisch: envelopes op cv_N, stemmen op in_N.
function mmbOctaVca() {
  const w = W(16);
  const colX = (i: number) => w * (0.08 + i * 0.119);
  return assemble({
    typeId: 'tp_mmb_octa_vca',
    categoryId: 'vca',
    variant: 'Octa VCA (shared level)',
    brand: 'MMB', model: 'OCTA-VCA-S',
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'vca',
      label: 'VCA',
      count: 8,
      portIds: ['in', 'cv', 'out'],
      controlIds: [],
    }],
    texts: [
      { x: w/2, y: 8,   text: 'OCTA-VCA-S', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'shared level · 8 cells', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('level', 'Level', w/2, 34, { size: 'large', min: 0, max: 1, def: 1, color: '#f9fafb' }),

      ...Array.from({ length: 8 }, (_, i) =>
        inPort(`in_${i+1}`, 'In', 'audio', colX(i), 84, { cellGroupId: 'vca' })),
      ...Array.from({ length: 8 }, (_, i) =>
        inPort(`cv_${i+1}`, 'CV', 'cv', colX(i), 101, { cellGroupId: 'vca' })),
      ...Array.from({ length: 8 }, (_, i) =>
        outPort(`out_${i+1}`, 'Out', 'audio', colX(i), 118, { cellGroupId: 'vca' })),
    ],
    notes: 'Multi-module met 8 identieke VCA-cellen (multiply): per cel audio-in, gain-CV (typisch een envelope) en audio-uit. De gedeelde Level-knop schaalt alle cellen. Samen met de Octa-VCO en Octa-VCF maakt dit een complete 8-stemmige poly van drie modules. Firmware: tp_mmb_octa_vca (FW-PM-3).',
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
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
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
// Engines in registratievolgorde van Plaits 1.2 (zie de knop hieronder).
const PLAITS_ENGINE_NAMES = [
  'VA+VCF', 'PHASEDIST', 'FM 6-OP A', 'FM 6-OP B', 'FM 6-OP C', 'WAVETERR', 'STRINGS', 'CHIPTUNE',
  'VA', 'WAVESHAPE', 'FM 2-OP', 'GRAIN', 'ADDITIVE', 'WAVETABLE', 'CHORD', 'SPEECH',
  'SWARM', 'NOISE', 'PARTICLE', 'STRING', 'MODAL', 'BASS DRUM', 'SNARE', 'HI-HAT',
];

function mmbPlaits() {
  const w = W(12);
  const col = (i: number): number => w * (0.16 + i * 0.34);   // 3 kolommen
  return assemble({
    typeId: 'tp_mmb_plaits',
    categoryId: 'vco',
    variant: 'Plaits (MI macro-osc)',
    brand: 'MI', model: 'PLAITS',
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'PLAITS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '24 engines · macro-osc', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Engine-keuze = registratievolgorde in Plaits 1.2 (voice.cc), de acht
      // nieuwe engines staan vóór de klassieke zestien:
      // 0=VA+VCF 1=PhaseDist 2/3/4=6-op FM A/B/C 5=WaveTerrain 6=StringMachine
      // 7=Chiptune 8=VA 9=Waveshape 10=FM 11=Grain 12=Additive 13=Wavetable
      // 14=Chord 15=Speech 16=Swarm 17=Noise 18=Particle 19=String 20=Modal
      // 21=BassDrum 22=Snare 23=HiHat. (Tot 2026-09-29 stond hier de oude
      // 16-lijst met max 15: "7=Speech" was Chiptune, 16–23 onbereikbaar.)
      knob   ('engine', 'Engine', w*0.28, 26, { size: 'medium', min: 0, max: 23, def: 0, step: 1, color: '#f9fafb' }),
      display('engDisp', w*0.66, 22, { digits: 2, style: 'led', bindTo: 'engine', format: 'int' }),
      // De naam van de engine erbij: op een front zegt "Engine 13" niets.
      display('engName', w*0.66, 29, { digits: 9, style: 'led-green', size: 'small', bindTo: 'engine', lookup: [PLAITS_ENGINE_NAMES], text: 'VA+VCF' }),
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
    notes: 'Mutable Instruments Plaits macro-oscillator (firmware tp_mmb_plaits, FW-AU-12). Eén knop kiest uit 24 engines (Plaits 1.2): 0 VA+VCF · 1 Phase distortion · 2/3/4 6-op FM A/B/C · 5 Wave terrain · 6 String machine · 7 Chiptune · 8 VA · 9 Waveshape · 10 FM · 11 Grain · 12 Additive · 13 Wavetable · 14 Chord · 15 Speech · 16 Swarm · 17 Noise · 18 Particle · 19 String · 20 Modal · 21 BassDrum · 22 Snare · 23 HiHat. Speech (15): Trig moet gepatcht zijn; Harmonics kiest het model (0–0,33 klinkers formant→SAM→LPC, 0,33–0,45 LPC-fonemen, daarboven vijf woordbanken), Morph de klinker of het woord, Timbre de formantverschuiving. Harmonics/Timbre/Morph zijn de drie macro-parameters (per engine anders). De interne low-pass-gate (Decay/LPG) vuurt per Trig; Aux draagt de engine-variant. CV-ingangen: harmonics_cv/timbre_cv/morph_cv/level_cv (alias zonder _cv werkt ook).',
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
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
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
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
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
        digits: 10, style: 'led-green', size: 'medium',
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

// 14g2. MMB MORPH-WT — 10 HP. Morphing-wavetable-VCO (FW-AU-14): 8 frames
//     per bank, vloeiend gemorpht met knop of CV. USER-bank vulbaar via de
//     wavetable-push (wslot kiest het frame).
function mmbMorphWt() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_morph_wt',
    categoryId: 'vco',
    variant: 'Morph-WT (morphing wavetable)',
    brand: 'MMB', model: 'MORPH-WT',
    hp: 10, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MORPH-WT', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '8 frames · vloeiend', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('morph', 'Morph', w/2, 32, { size: 'large', min: 0, max: 7, def: 0, color: '#22c55e' }),
      // 0 Analog (sin→puls) · 1 Vocal (formants) · 2 Harmonics (drawbars)
      // 3 Digital (gaten/flips) · 4 USER (wavetable-push per wslot).
      sw  ('bank', 'Bank', w*0.22, 60, ['Ana','Voc','Hrm','Dig','Usr'], 0),
      knob('wslot',  'W-slot', w*0.62, 60, { size: 'small', min: 0, max: 7, def: 0, step: 1, color: '#9ca3af' }),
      knob('level',  'Level',  w*0.88, 60, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('coarse', 'Coarse', w*0.30, 88, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('fine',   'Fine',   w*0.70, 88, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f9fafb' }),

      inPort ('voct',     'V/Oct', 'cv',    w*0.18, 110),
      inPort ('morph_cv', 'M+',    'cv',    w*0.50, 110),
      outPort('out',      'Out',   'audio', w*0.82, 110),
    ],
    notes: 'Morphing-wavetable-VCO (firmware tp_mmb_morph_wt, FW-AU-14): 8 frames per bank, per sample geïnterpoleerd én tussen aangrenzende frames gecrossfaded — draai Morph (of stuur M+ met een LFO) voor vloeiende spectrale beweging. Banken: Analog (sin→tri→saw→puls), Vocal (schuivende formants), Harmonics (drawbar-opbouw), Digital (gaten/fase-flips), USER. USER-frames vul je met de wavetable-push van de Draw-VCO-teken-UI: W-slot kiest het doelframe. v2 is per-octaaf gebandlimit (3 mip-levels), dus ook hoog schoon.',
  });
}

// 14h. MMB WARPS — 10 HP. Mutable Instruments Warps meta-modulator
//     (FW-FX-5): twee audiobronnen door elkaar gevouwen; algoritme-knop
//     morpht van xfade tot vocoder. Interne carrier-osc via Shape+V/Oct.
function mmbWarps() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_warps',
    categoryId: 'effect',
    variant: 'Warps (MI meta-modulator)',
    brand: 'MI', model: 'WARPS',
    hp: 10, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'WARPS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'xmod · vocoder', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // 0=xfade 1=fold 2=ringmod(analoog) 3=ringmod(digitaal) 4=XOR
      // 5=comparator 6=spectraal 7=morph 8=vocoder — de knop morpht ertussen.
      knob('algo',   'Algorithm', w*0.35, 30, { size: 'large', min: 0, max: 8, def: 2, color: '#22c55e' }),
      display('algDisp', w*0.78, 30, { digits: 1, style: 'led', bindTo: 'algo', format: 'int' }),
      knob('timbre', 'Timbre',    w/2, 58, { size: 'large', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      // 0 = externe carrier (In 1); 1..5 = interne osc (sin/tri/saw/puls/ruis).
      sw  ('shape', 'Carrier', w*0.20, 80, ['Ext','Sin','Tri','Saw','Pls','Nz'], 0),
      knob('drive1', 'Drv 1',  w*0.55, 80, { size: 'small', min: 0, max: 2, def: 1, color: '#f9fafb' }),
      knob('drive2', 'Drv 2',  w*0.85, 80, { size: 'small', min: 0, max: 2, def: 1, color: '#f9fafb' }),
      knob('coarse', 'Coarse', w*0.55, 96, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('level',  'Level',  w*0.85, 96, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('in1',  'In 1',  'audio', w*0.14, 108),
      inPort ('in2',  'In 2',  'audio', w*0.38, 108),
      inPort ('voct', 'V/Oct', 'cv',    w*0.62, 108),
      inPort ('algo_cv', 'A+', 'cv',    w*0.86, 108),
      inPort ('timbre_cv', 'T+', 'cv',  w*0.14, 120),
      outPort('out',  'Out',   'audio', w*0.55, 120),
      outPort('aux',  'Aux',   'audio', w*0.85, 120),
    ],
    notes: 'Mutable Instruments Warps meta-modulator (firmware tp_mmb_warps, FW-FX-5). Vouwt In 1 (carrier) en In 2 (modulator) door elkaar; de Algorithm-knop morpht door: 0 xfade · 1 wavefolder · 2 ringmod (analoog model) · 3 ringmod (digitaal) · 4 XOR · 5 comparator · 6 spectraal · 7 morph · 8 vocoder. Timbre kleurt het gekozen algoritme. Carrier ≠ Ext vervangt In 1 door de interne oscillator (V/Oct + Coarse bespeelbaar) — zet 8 (vocoder) en spreek/speel via In 2. Aux draagt de spiegelvariant. Draait native op 44.1 kHz.',
  });
}

// 14i. MMB STAGES — 16 HP. Mutable Instruments Stages segment-generator
//     (FW-CV-3): 6 ketenbare segmenten → complexe envelope / multi-stage
//     LFO / step-sequencer, in het CV-domein.
function mmbStages() {
  const w = W(16);
  return assemble({
    typeId: 'tp_mmb_stages',
    categoryId: 'envelope',
    variant: 'Stages (MI segment-gen)',
    brand: 'MI', model: 'STAGES',
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'STAGES', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '6 segmenten · env/LFO/seq', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('t1', 'T1', w * (0.10 + 0 * 0.152), 34, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('s1', 'S1', w * (0.10 + 0 * 0.152), 54, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('type1', '', w * (0.10 + 0 * 0.152), 72, ['R','H','S','A'], 0),
      knob('t2', 'T2', w * (0.10 + 1 * 0.152), 34, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('s2', 'S2', w * (0.10 + 1 * 0.152), 54, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('type2', '', w * (0.10 + 1 * 0.152), 72, ['R','H','S','A'], 0),
      knob('t3', 'T3', w * (0.10 + 2 * 0.152), 34, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('s3', 'S3', w * (0.10 + 2 * 0.152), 54, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('type3', '', w * (0.10 + 2 * 0.152), 72, ['R','H','S','A'], 0),
      knob('t4', 'T4', w * (0.10 + 3 * 0.152), 34, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('s4', 'S4', w * (0.10 + 3 * 0.152), 54, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('type4', '', w * (0.10 + 3 * 0.152), 72, ['R','H','S','A'], 0),
      knob('t5', 'T5', w * (0.10 + 4 * 0.152), 34, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('s5', 'S5', w * (0.10 + 4 * 0.152), 54, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('type5', '', w * (0.10 + 4 * 0.152), 72, ['R','H','S','A'], 0),
      knob('t6', 'T6', w * (0.10 + 5 * 0.152), 34, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('s6', 'S6', w * (0.10 + 5 * 0.152), 54, { size: 'small', min: 0, max: 1, def: 0.5, color: '#9ca3af' }),
      sw  ('type6', '', w * (0.10 + 5 * 0.152), 72, ['R','H','S','A'], 0),

      knob   ('segments',  'Active', w*0.16, 96, { size: 'small', min: 1, max: 6, def: 3, step: 1, color: '#f9fafb' }),
      toggle ('loop',      'Loop',   w*0.36, 96),
      knob   ('loop_start','L-start',w*0.54, 96, { size: 'small', min: 0, max: 5, def: 0, step: 1, color: '#9ca3af' }),
      knob   ('loop_end',  'L-end',  w*0.72, 96, { size: 'small', min: 0, max: 5, def: 2, step: 1, color: '#9ca3af' }),
      knob   ('rate',      'Rate',   w*0.88, 96, { size: 'small', min: 0.05, max: 20, def: 1, color: '#f9fafb' }),

      inPort ('gate', 'Gate', 'gate', w*0.20, 114),
      outPort('out',  'Out',  'cv',   w*0.55, 114),
      outPort('eoc',  'EOC',  'gate', w*0.82, 114),
    ],
    notes: 'Mutable Instruments Stages (firmware tp_mmb_stages, FW-CV-3): 6 ketenbare segmenten in het CV-domein (1 kHz-tick). Elk segment heeft een type — R(amp) / H(old) / S(tep) / A(lt) — en twee knoppen (T = primary, S = secondary; betekenis per type: ramp = tijd+vorm, hold = niveau+tijd, step = niveau+portamento). Active kiest hoeveel segmenten meedoen; Loop + L-start/L-end laat een deel herhalen → een multi-stage-LFO. Gate triggert/gatet de keten; EOC pulseert bij de cyclusstart. Zonder loop is het een complexe multi-breakpoint-envelope.',
  });
}

// 14j. MMB PEAKS — 8 HP. Mutable Instruments Peaks drums (FW-AU-15):
//     808-achtige analoge-model-drums (kick/snare/hat/fm), gate-getriggerd.
function mmbPeaks() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_peaks',
    categoryId: 'drum',
    variant: 'Peaks (MI drums)',
    brand: 'MI', model: 'PEAKS',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'PEAKS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '808 drums', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('drum', 'Drum', w/2, 26, ['Kick','Snare','Hat','FM'], 0),
      knob('tone',  'Tone',  w*0.28, 50, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('decay', 'Decay', w*0.72, 50, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('snap',  'Snap',  w*0.28, 74, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('coarse','Coarse',w*0.72, 74, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('level', 'Level', w/2,    92, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('gate', 'Trig',  'gate', w*0.20, 110),
      inPort ('voct', 'V/Oct', 'cv',   w*0.50, 110),
      outPort('out',  'Out',   'audio', w*0.80, 110),
    ],
    notes: 'Mutable Instruments Peaks drums (firmware tp_mmb_peaks, FW-AU-15): 808-achtige analoge-model-drums. Drum kiest Kick / Snare / Hat / FM; elke stijgende flank op Trig slaat de drum. Tone en Decay zijn de macro-knoppen; Snap = punch (kick) / snappy (snare) / FM-amount (fm). V/Oct + Coarse stemmen de kick/snare/fm. Eén drum per module — plaats er meerdere en klok ze met Marbles t1/t2 of een sequencer. Rendert op 48 kHz, geresampled naar 44.1.',
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

// Lettergreeptabel van de firmware (mmb_dsp::FofVoice::kSyllables), in dezelfde volgorde.
const FOF_SYLLABLES = ['Vowel', 'doo', 'da', 'va', 'der', 'ja', 'cob', 'slaapt', 'gij', 'nog', 'al', 'le', 'klo', 'ken', 'lui', 'den', 'bim', 'bam', 'bom', 'de', 'na', 'hee', 'djoed', 'o', 'li', 'fant', 'je', 'in', 'het', 'bos', 'laat', 'ma', 'toch', 'niet', 'los', 'an', 'ders', 'raak', 'weg', 'kwijt', 'en', 'dan', 'heb', 'la', 'ter', 'spijt'];

function mmbFof() {
  const w = W(16);
  // Zeven CV-ingangen onderaan, elk met zijn attenuator er recht boven.
  const cvCols = [0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.92].map((f) => w * f);
  const amt = (id: string, label: string, x: number) =>
    knob(id, label, x, 104, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' });
  return assemble({
    typeId: 'tp_mmb_fof',
    categoryId: 'vco',
    variant: 'FOF zingende formantstem',
    brand: 'MMB', model: 'FOF-VOICE',
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'FOF-VOICE', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14, text: 'A · E · I · O · U', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('vowel', 'Vowel', w*0.25, 28, { size: 'medium', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('tone', 'Tone', w*0.75, 28, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('breath', 'Breath', w*0.20, 52, { size: 'small', min: 0, max: 1, def: 0.08, color: '#9ca3af' }),
      knob('vibrato', 'Vibrato', w*0.50, 52, { size: 'small', min: 0, max: 1, def: 0.12, color: '#9ca3af' }),
      knob('voice', 'Voice', w*0.80, 52, { size: 'small', min: 0, max: 1, def: 0.35, color: '#9ca3af' }),
      knob('syl', 'Syl', w*0.16, 72, { size: 'medium', min: 0, max: 45, def: 0, step: 1, color: '#fbbf24' }),
      display('sylDisp', w*0.50, 72, { digits: 6, style: 'oled', bindTo: 'syl', lookup: [FOF_SYLLABLES], text: 'Vowel', size: 'small' }),
      knob('level', 'Level', w*0.84, 72, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('voct', 'V/Oct', 'cv', w*0.12, 88),
      inPort('gate', 'Gate', 'gate', w*0.30, 88),
      inPort('next', 'Next', 'gate', w*0.50, 88),
      inPort('reset', 'Reset', 'gate', w*0.68, 88),
      outPort('out', 'Out', 'audio', w*0.88, 88),
      amt('syl_amt', 'Syl', cvCols[0]!),
      amt('vowel_amt', 'Vow', cvCols[1]!),
      amt('breath_amt', 'Air', cvCols[2]!),
      amt('vibrato_amt', 'Vib', cvCols[3]!),
      amt('voice_amt', 'Voi', cvCols[4]!),
      amt('vel_amt', 'Vel', cvCols[5]!),
      amt('press_amt', 'Prs', cvCols[6]!),
      inPort('syl_cv', 'Syl+', 'cv', cvCols[0]!, 120),
      inPort('vowel', 'Vow+', 'cv', cvCols[1]!, 120),
      inPort('breath', 'Air+', 'cv', cvCols[2]!, 120),
      inPort('vibrato', 'Vib+', 'cv', cvCols[3]!, 120),
      inPort('voice', 'Voi+', 'cv', cvCols[4]!, 120),
      inPort('vel', 'Vel', 'cv', cvCols[5]!, 120),
      inPort('pressure', 'Press', 'cv', cvCols[6]!, 120),
    ],
    notes: 'FOF/CHANT-geinspireerde zangoscillator met asymmetrische glottale bron. Vowel morft door A-E-I-O-U; formanten blijven staan bij pitchverandering. Voice loopt van korte, heldere sluiting naar langer, zachter open/sluitgedrag. Vel (0-1) regelt volume en verzacht de sluiting bij zachte aanslagen; zonder kabel volle sterkte. Press (0-1) is de doorlopende expressie tijdens de noot (MidiIn Press/aftertouch, breath controller of CV): lager = iets zachter (vloer 0,5), duidelijk ademiger (als Breath open staat) en een langere, zachtere sluiting; zonder kabel volle druk, ~20 ms gladgestreken. Vow+/Air+/Vib+/Voi+ tellen op bij de knop; de kleine knop boven elke CV-jack is de attenuator (1 = vol, 0 = kabel doet niets; bij Vel en Press = gevoeligheid). Syl kiest een lettergreep uit een tabel van 46 (0 = de Vowel-knop; dan doo, da, va, der, ja, cob, slaapt, gij, nog, al, le, klo, ken, lui, den, bim, bam, bom, de, na, hee, djoed, en 23-45 Olifantje in het bos: o, li, fant, je, in, het, bos, laat, ma, toch, niet, los, an, ders, raak, weg, kwijt, en, dan, heb, la, ter, spijt): synthetische medeklinkers (plosieven met sluiting/burst/glijbaan, nasalen, fricatieven, l/r/j/w met de Nederlandse schraap-r en -g) en tweeklanken, en een slotmedeklinker die speelt als de gate valt; het display toont de knopstand. Syl+ (0-1 over de tabel, zoals syl_cv bij ZANG) telt op bij de knop: CC-waarde = index × 127 / 45. Next (gate-flank) stapt naar de volgende lettergreep, Reset gaat terug naar de knop: een sustainpedaal via MIDI-IN CC2# = 64 werkt als stappedaal. De lettergreep wordt bij de gate-flank gelezen: kies hem vóór de noot (linkerhand pads, rechterhand melodie). Tone bepaalt de resonantiebreedte, Breath voegt pulsgebonden aspiratie toe en Vibrato geeft maximaal een halve toon (100 cent) bij 5,3 Hz. Geen exacte LF-bron, spraaksynthese of volledige CHANT-reconstructie. Mono; polyfonie via PolyGroup.',
  });
}

function mmbMaterialBridge() {
  const w = W(14);
  return assemble({
    typeId: 'tp_mmb_material_bridge', categoryId: 'vco',
    variant: 'Material Bridge (gekoppelde resonatoren)',
    brand: 'MMB', model: 'MATERIAL BRIDGE',
    hp: 14, texture: 'pcb-black', baseColor: '#163c39', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'MATERIAL BRIDGE', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('pitch', 'Pitch', w*0.18, 27, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('spread', 'Spread', w*0.50, 27, { size: 'medium', min: 0, max: 1, def: 0.35, color: '#f9fafb' }),
      knob('coupling', 'Couple', w*0.82, 27, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#6ee7b7' }),
      knob('decay', 'Decay', w*0.14, 53, { size: 'small', min: 0.05, max: 8, def: 2, unit: 's', color: '#f9fafb' }),
      knob('memory', 'Memory', w*0.38, 53, { size: 'small', min: 0, max: 1, def: 0.7, color: '#fb7185' }),
      knob('fatigue', 'Fatigue', w*0.62, 53, { size: 'small', min: 0, max: 1, def: 0.5, color: '#fb7185' }),
      knob('recovery', 'Recover', w*0.86, 53, { size: 'small', min: 0.1, max: 10, def: 2, unit: 's', color: '#f9fafb' }),
      inPort('coupling_cv', 'Cpl+', 'cv', w*0.12, 78),
      knob('pickup', 'Pickup', w*0.36, 78, { size: 'small', min: 0, max: 1, def: 0.25, color: '#6ee7b7' }),
      knob('level', 'Level', w*0.64, 78, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('pickup_cv', 'Pick+', 'cv', w*0.88, 78),
      inPort('in', 'In', 'audio', w*0.10, 100),
      inPort('voct', 'V/Oct', 'cv', w*0.30, 100),
      inPort('gate', 'Hit A', 'gate', w*0.50, 100),
      inPort('gate_b', 'Hit B', 'gate', w*0.70, 100),
      inPort('vel', 'Vel', 'cv', w*0.90, 100),
      inPort('reset', 'Reset', 'gate', w*0.18, 117),
      outPort('stress', 'Stress', 'cv', w*0.40, 117),
      outPort('out_l', 'L', 'audio', w*0.64, 117),
      outPort('out_r', 'R', 'audio', w*0.84, 117),
    ],
    notes: 'Experimentele state-graph voice: vier resonatoren delen energie via drie passieve koppelingen. Hit A/B slaan de uiteinden aan; audio exciteert A. Een harde aanslag (velocity boven ~0,85) drijft Stress over de breekdrempel; pas onder de hersteldrempel sluit het contact weer (hysterese). Memory laat dat gebroken contact de middelste brug verzwakken: energie blijft dan aan de aangeslagen kant en de pickupbalans verandert, zonder extra demping. Fatigue voegt stressafhankelijke demping toe (kortere uitklank onder belasting). Recover bepaalt het herstel; Stress geeft de toestand als CV. Pickup verplaatst twee passieve stereo-pickups. Reset wist energie en geheugen. V/Oct rond C4 transponeert het hele spectrum; de koppeling schaalt mee, zodat de modusverhoudingen vast liggen. Couple spreidt de modi (bij 0,65 ligt de sterkste modus ~36 cent boven de grondtoon). Dezelfde C++-kern op Teensy en in wasm.',
  });
}

// 21. MMB RESONATOR — 10 HP. Sympathetic-resonator-bank (firmware
//     tp_mmb_resonator, FW-FX-6): 12 Karplus-achtige snaar-resonatoren
//     gestemd op een schaal rond de grondtoon; het ingangssignaal excite't
//     ze allemaal → sitar/piano-klankkast-resonantie, berekend.
function mmbResonator() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_resonator',
    categoryId: 'effect',
    variant: 'Resonator (sympathetic)',
    brand: 'MMB', model: 'RESONATOR',
    hp: 10, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'RESONATOR', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '12 sympathetic strings', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('root',  'Root',  w*0.30, 30, { size: 'large', min: -24, max: 24, def: 0, unit: 'semi', color: '#f9fafb' }),
      // 0=chromatisch 1=majeur 2=mineur 3=kwint/octaaf 4=harmonische reeks.
      sw  ('scale', 'Scale', w*0.72, 30, ['Chrom','Maj','Min','5th','Harm'], 1),
      knob('structure', 'Struct', w*0.25, 60, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#e11d48' }),
      knob('decay',     'Decay',  w*0.75, 60, { size: 'medium', min: 0, max: 1, def: 0.7, color: '#f9fafb' }),
      knob('damping', 'Damp',  w*0.20, 86, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('mix',     'Mix',   w*0.50, 86, { size: 'small', min: 0, max: 1, def: 0.6, color: '#0891b2' }),
      knob('level',   'Level', w*0.80, 86, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),

      inPort ('in',        'In',    'audio', w*0.18, 104),
      inPort ('voct',      'V/Oct', 'cv',    w*0.50, 104),
      inPort ('struct_cv', 'St+',   'cv',    w*0.82, 104),
      outPort('out',       'Out',   'audio', w*0.32, 118),
      outPort('mix',       'Mix',   'audio', w*0.68, 118),
    ],
    notes: 'Sympathetic-resonator-bank (firmware tp_mmb_resonator, FW-FX-6). Twaalf Karplus-achtige comb-resonatoren gestemd op een schaal rond Root (semitonen rond C2, V/Oct verschuift mee). Audio op In excite\'t alle snaren tegelijk: harmonisch verwante snaren klinken mee (sitar/piano-klankkast), ook zonder direct te zijn aangeslagen. Struct spreidt de stemming (koor-detune), Decay = resonantietijd, Damp = helderheid (laag = donker). Out en Mix dragen hetzelfde signaal (dry/wet volgens de Mix-knob) — patch op Out. ~75 KB heap, enkele % CPU.',
  });
}

// 22. MMB CR-78 — 8 HP. Roland CR-78 drumstem, berekend (firmware
//     tp_mmb_cr78, FW-AU-16): bridged-T gedempte sinussen voor de vellen,
//     gefilterde ruis + envelope-VCA's voor de rest. Eén drum per instantie.
function mmbCr78() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_cr78',
    categoryId: 'drum',
    variant: 'CR-78 drum (berekend)',
    brand: 'MMB', model: 'CR-78',
    hp: 8, texture: 'pcb-black', baseColor: '#3b2413', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'CR-78', fontSize: 2.4, color: '#fbe8c8', align: 'middle' },
      { x: w/2, y: 13,  text: 'CompuRhythm · berekend', fontSize: 1.0, color: '#c8a878', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#fbe8c8', align: 'middle' },
    ],
    items: [
      sw  ('drum', 'Drum', w/2, 26, ['Kick','Snare','Rim','Claves','Cowbell','HiHat','Cymbal','Maracas','Guiro','Bongo','Conga','Tamb'], 0),
      knob('tone',  'Tone',  w*0.28, 54, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('decay', 'Decay', w*0.72, 54, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#fbe8c8' }),
      knob('bend',  'Bend',  w*0.28, 80, { size: 'small', min: 0, max: 1, def: 0.5, color: '#0891b2' }),
      knob('level', 'Level', w*0.72, 80, { size: 'small', min: 0, max: 1, def: 0.8, color: '#fbe8c8' }),

      inPort ('gate',      'Trig',  'gate',  w*0.16, 104),
      inPort ('voct',      'V/Oct', 'cv',    w*0.50, 104),
      inPort ('accent_cv', 'Acc',   'cv',    w*0.84, 104),
      outPort('out',       'Out',   'audio', w*0.50, 118),
    ],
    notes: 'Roland CR-78 drumstem, berekend i.p.v. gesampeld (firmware tp_mmb_cr78, FW-AU-16). Drum kiest een van 12 stemmen: Kick/Bongo/Conga zijn bridged-T gedempte sinussen met aanslag-pitchbuiging, Snare mengt vel + hiss, Rim/Claves korte hoge sinussen, Cowbell twee onharmonische sinussen door een soft-clip, HiHat/Cymbal/Maracas/Tamb gefilterde ruis met envelope-VCA, Guiro een pulstrein-geratel. Accent-CV maakt de slag luider én buigt de pitch harder (het accent-circuit — dat mist een sample). Tone = kleur/pitch per stem, Bend = buigdiepte, V/Oct stemt de vellen. Eén drum per module, zoals Peaks.',
  });
}

// 23. MMB QUANT — 6 HP. V/Oct-quantizer naar schaal (firmware tp_mmb_quant,
//     FW-CV-4). Ruwe CV (Marbles/S&H/LFO) erin, muzikale noten eruit;
//     trig-puls bij elke nootwissel.
function mmbQuant() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_quant',
    categoryId: 'utility',
    variant: 'Quantizer (schaal)',
    brand: 'MMB', model: 'QUANT',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'QUANT', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'CV → schaal', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('scale', 'Scale', w/2, 26, ['Chrom','Maj','Min','PentM','Pentm','Dor','5th','Whole'], 1),
      knob('root',  'Root',  w*0.30, 58, { size: 'medium', min: 0, max: 11, def: 0, step: 1, unit: 'semi', color: '#e11d48' }),
      knob('glide', 'Glide', w*0.70, 58, { size: 'medium', min: 0, max: 1, def: 0, color: '#0891b2' }),

      inPort ('in',   'In',   'cv',   w*0.25, 100),
      outPort('out',  'Out',  'cv',   w*0.75, 100),
      outPort('trig', 'Trig', 'gate', w*0.75, 116),
    ],
    notes: 'V/Oct-quantizer (firmware tp_mmb_quant, FW-CV-4): klikt de CV op In vast op de dichtstbijzijnde noot van de gekozen schaal. Root verschuift de grondtoon (semitonen), Glide is een one-pole portamento (0–500 ms) tussen de noten. Trig vuurt een 10 ms-puls bij elke nootwissel — trigger er een envelope of pluk mee. Klassiek achter Marbles X-uitgangen, een S&H of een trage LFO.',
  });
}

// MMB SCANNED — 12 HP. Scanned synthesis (firmware tp_mmb_scanned): een
//     traag bewegende massa-veerring van 64 punten wordt op audiotempo als
//     golftabel uitgelezen. Hit slaat de ring aan, Press drukt een vinger in
//     de ring, loslaten laat hem terugveren. Dezelfde C++-kern als de Teensy.
function mmbScanned() {
  const w = W(12);
  return assemble({
    typeId: 'tp_mmb_scanned', categoryId: 'vco',
    variant: 'Scanned (levende golftabel)',
    brand: 'MMB', model: 'SCANNED',
    hp: 12, texture: 'pcb-black', baseColor: '#2a1f3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'SCANNED', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'massa-veerring als golftabel', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('pitch', 'Pitch', w*0.18, 29, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('tension', 'Tension', w*0.50, 29, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#c084fc' }),
      knob('damping', 'Damping', w*0.82, 29, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('restore', 'Return', w*0.18, 55, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#c084fc' }),
      knob('speed', 'Speed', w*0.50, 55, { size: 'medium', min: 0.02, max: 1, def: 0.15, color: '#c084fc' }),
      knob('width', 'Width', w*0.82, 55, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('position', 'Position', w*0.18, 79, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      inPort('pos_cv', 'Pos+', 'cv', w*0.42, 79),
      inPort('press', 'Press', 'cv', w*0.64, 79),
      knob('level', 'Level', w*0.86, 79, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('in', 'In', 'audio', w*0.12, 100),
      inPort('voct', 'V/Oct', 'cv', w*0.31, 100),
      inPort('gate', 'Hit', 'gate', w*0.50, 100),
      inPort('vel', 'Vel', 'cv', w*0.69, 100),
      inPort('reset', 'Reset', 'gate', w*0.88, 100),
      outPort('energy', 'Energy', 'cv', w*0.30, 117),
      outPort('out', 'Out', 'audio', w*0.70, 117),
    ],
    notes: 'Scanned synthesis (Verplank/Mathews/Shaw): een gesloten ring van 64 massa\'s met veren naar de buren (Tension) en een terugveer naar rust (Return) beweegt traag; Speed vertraagt of versnelt het materiaal (fysica op ~5,5 kHz, met Speed verder omlaag). De vorm van de ring wordt op de toonhoogte van V/Oct en Pitch als golftabel uitgelezen, dus de golfvorm leeft en trilt na. Hit slaat de ring aan rond Position met Vel als kracht; Press (0..1) drukt een vinger in de ring en geeft een stilstaande vorm die bij loslaten terugveert; In duwt met audio. Width is de breedte van de vinger. Energy (CV 0..1) is de uitwijking van de ring. Reset wist posities en snelheden. Mono; dezelfde C++-kern op Teensy en in wasm.',
  });
}

// MMB RESERVOIR — 8 HP. Resource-coupled synthesis (firmware tp_mmb_reservoir):
//     een eindige, langzaam herstellende bron waar tot vier stemmen uit
//     putten. Envelope of gate op In A..D, de geschaalde versie komt op
//     Out A..D; Level/Starve/Empty geven de bron zelf. CV-module, 1 kHz.
function mmbReservoir() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_reservoir', categoryId: 'utility',
    variant: 'Reservoir (gedeelde bron)',
    brand: 'MMB', model: 'RESERVOIR',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'RESERVOIR', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'gedeelde herstellende bron', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('drain', 'Drain', w*0.28, 29, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#60a5fa' }),
      knob('recover', 'Recover', w*0.72, 29, { size: 'medium', min: 0.1, max: 20, def: 2, unit: 's', color: '#60a5fa' }),
      knob('floor', 'Floor', w*0.20, 55, { size: 'small', min: 0, max: 1, def: 0.1, color: '#f9fafb' }),
      knob('curve', 'Curve', w*0.50, 55, { size: 'small', min: 0.25, max: 4, def: 1, color: '#f9fafb' }),
      knob('thresh', 'Empty@', w*0.80, 55, { size: 'small', min: 0, max: 1, def: 0.15, color: '#f9fafb' }),
      inPort('in_a', 'A', 'cv', w*0.14, 76),
      inPort('in_b', 'B', 'cv', w*0.38, 76),
      inPort('in_c', 'C', 'cv', w*0.62, 76),
      inPort('in_d', 'D', 'cv', w*0.86, 76),
      outPort('out_a', 'A', 'cv', w*0.14, 92),
      outPort('out_b', 'B', 'cv', w*0.38, 92),
      outPort('out_c', 'C', 'cv', w*0.62, 92),
      outPort('out_d', 'D', 'cv', w*0.86, 92),
      inPort('refill', 'Refill', 'cv', w*0.25, 108),
      inPort('reset', 'Reset', 'gate', w*0.75, 108),
      outPort('level', 'Level', 'cv', w*0.18, 120),
      outPort('starve', 'Starve', 'cv', w*0.50, 120),
      outPort('empty', 'Empty', 'gate', w*0.82, 120),
    ],
    notes: 'Resource-coupled synthesis: een eindige bron (lucht, snaarspanning, voeding) waar tot vier stemmen tegelijk uit putten. Zet envelopes of gates (0..1) op In A..D; iedere belasting trekt de bron leeg (Drain 1 = een volle stem leegt hem in 1 s), de bron vult exponentieel bij met tijdconstante Recover. Out A..D is de eigen belasting maal het aanbod: stuur die naar de VCA-CV in plaats van de envelope zelf, dan laat een harde noot tijdelijk minder over voor de volgende stem en is het herstel hoorbaar. Aanbod = Floor + (1-Floor) * Level^Curve. Level is de bron (0..1), Starve het tekort (patch op cutoff of V/Oct met een attenuator), Empty een gate zodra de bron onder Empty@ zakt (hysterese 0,1) - laat het instrument stotteren. Refill vult extra bij, Reset maakt de bron direct vol. Onderzoeksmodule: toetst of gedeelde toestand anders speelt dan onafhankelijke stemmen.',
  });
}

// MMB GENDYN — 10 HP. Dynamische stochastische synthese (firmware
//     tp_mmb_gendyn, Xenakis): breekpunten die per cyclus een begrensde
//     random walk maken in amplitude en duur. Gestemd via V/Oct; Hit zaait
//     de ruis opnieuw zodat iedere noot reproduceerbaar begint.
function mmbGendyn() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_gendyn', categoryId: 'vco',
    variant: 'GENDYN (stochastisch)',
    brand: 'MMB', model: 'GENDYN',
    hp: 10, texture: 'pcb-black', baseColor: '#3d1f1f', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'GENDYN', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'dynamische stochastische synthese', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('pitch', 'Pitch', w*0.22, 29, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('points', 'Points', w*0.78, 29, { size: 'medium', min: 3, max: 24, def: 12, step: 1, color: '#f9fafb' }),
      knob('amp_step', 'Amp', w*0.22, 55, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#fb923c' }),
      knob('dur_step', 'Dur', w*0.78, 55, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#fb923c' }),
      knob('dist', 'Dist', w*0.16, 79, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('smooth', 'Smooth', w*0.39, 79, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('settle', 'Settle', w*0.61, 79, { size: 'small', min: 0, max: 1, def: 0.1, color: '#f9fafb' }),
      knob('seed', 'Seed', w*0.84, 79, { size: 'small', min: 0, max: 99, def: 1, step: 1, color: '#f9fafb' }),
      knob('level', 'Level', w*0.50, 100, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('voct', 'V/Oct', 'cv', w*0.14, 100),
      inPort('gate', 'Hit', 'gate', w*0.32, 100),
      inPort('chaos_cv', 'Amp+', 'cv', w*0.68, 100),
      inPort('reset', 'Reset', 'gate', w*0.86, 100),
      outPort('cycle', 'Cycle', 'gate', w*0.30, 117),
      outPort('out', 'Out', 'audio', w*0.70, 117),
    ],
    notes: 'GENDYN (Xenakis, dynamische stochastische synthese): een cyclus bestaat uit Points breekpunten; na iedere cyclus zet elk breekpunt een random stap in amplitude (Amp, spiegelend binnen -1..1) en in duur (Dur, symmetrisch rond de nominale periode, zodat de gemiddelde toonhoogte V/Oct volgt). Dist mengt uniforme stappen (0) met een zwaarstaartige verdeling (1: veel kleine, af en toe een grote). Smooth loopt van rechte lijnstukken (ruw, veel boventonen) naar cosinusbogen. Settle trekt amplitudes per cyclus iets naar nul, zodat de golf niet aan de grenzen blijft hangen. Hit zaait de ruis opnieuw met Seed en herstelt de beginvorm: iedere noot begint hetzelfde en wandelt daarna weg; zonder Hit loopt de wandeling vrij door. Amp+ moduleert de stapgrootte (bijv. met een envelope: stabiel begin, chaotische staart). Cycle is hoog tijdens het eerste segment van elke cyclus. Niet bandbegrensd; dat is de aard van de techniek.',
  });
}

// MMB EXCITABLE — 12 HP. Excitable-media synthesis (firmware tp_mmb_excitable):
//     een 16x16-raster van prikkelbare cellen met twee pacemakers (A links,
//     B rechts) en twee pickups. Fronten lopen, botsen en doven; een korte
//     periode tegenover de refractaire tijd geeft subharmonieken.
function mmbExcitable() {
  const w = W(12);
  return assemble({
    typeId: 'tp_mmb_excitable', categoryId: 'vco',
    variant: 'Excitable (prikkelbaar medium)',
    brand: 'MMB', model: 'EXCITABLE',
    hp: 12, texture: 'pcb-black', baseColor: '#1f3d2a', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'EXCITABLE', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'prikkelbaar celraster, 2 pacemakers', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('pitch', 'Pitch', w*0.18, 29, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('detune', 'Detune B', w*0.50, 29, { size: 'medium', min: -24, max: 24, def: 7, step: 1, unit: 'semi', color: '#f9fafb' }),
      knob('refract', 'Refract', w*0.82, 29, { size: 'medium', min: 2, max: 60, def: 12, step: 1, color: '#4ade80' }),
      knob('excite', 'Excite', w*0.18, 55, { size: 'medium', min: 1, max: 8, def: 3, step: 1, color: '#4ade80' }),
      knob('thresh', 'Thresh', w*0.50, 55, { size: 'medium', min: 1, max: 3, def: 1, step: 1, color: '#f9fafb' }),
      knob('pickup', 'Pickup', w*0.82, 55, { size: 'medium', min: 0, max: 1, def: 0.4, color: '#4ade80' }),
      sw('speed', 'Speed', w*0.30, 79, ['1', '2', '4'], 1),
      knob('level', 'Level', w*0.75, 79, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('voct', 'V/Oct', 'cv', w*0.12, 100),
      inPort('gate', 'Gate A', 'gate', w*0.31, 100),
      inPort('voct_b', 'V/Oct B', 'cv', w*0.50, 100),
      inPort('gate_b', 'Gate B', 'gate', w*0.69, 100),
      inPort('reset', 'Reset', 'gate', w*0.88, 100),
      outPort('activity', 'Activity', 'cv', w*0.22, 117),
      outPort('out_l', 'L', 'audio', w*0.58, 117),
      outPort('out_r', 'R', 'audio', w*0.82, 117),
    ],
    notes: 'Excitable-media synthesis: een begrensd raster van 16x16 prikkelbare cellen (rust, actief gedurende Excite stappen, refractair gedurende Refract stappen). Een rustende cel wordt actief zodra Thresh van zijn vier buren actief is. Pacemaker A (links) en B (rechts) prikkelen hun cel op de toonhoogte van V/Oct (B met Detune en V/Oct B erbij) zolang hun gate hoog is; de golffronten lopen een cel per stap, doven aan de rand en vernietigen elkaar waar ze botsen. Speed is het aantal audiosamples per mediumstap (1 = fijnst, zwaar op de Teensy). Pickup verplaatst beide pickups van de bronnen (0) naar het midden (1) waar de fronten botsen. Is de periode korter dan Excite + Refract, dan negeert de cel elke tweede of derde prikkel: subharmonieken ontstaan causaal uit het medium (bij Pitch +24 en Refract 60 klinkt weer ongeveer de grondtoon). Activity (CV 0..1) is het aandeel actieve en refractaire cellen. Pulsvormig geluid; de toonhoogte heeft stapjitter van een mediumstap. Onderzoeksmodule.',
  });
}

// ── Modulatorpakket (2026-10-02) ───────────────────────────────────────
// Negen CV-modules die als firmwareklasse via cvhost ook in de simulator
// draaien: Clock, Euclid, Turing, Branches, Chaos, LFO-8, Slope, Logic (en de
// firmwarekant van S&H hierboven).

// MMB CLOCK — 8 HP. Masterklok (firmware tp_mmb_clock): één fase, alle
//     delingen daarvan afgeleid, swing op de zestienden, maatzaag.
function mmbClock() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_clock', categoryId: 'sequencer',
    variant: 'Clock (masterklok + delers)',
    brand: 'MMB', model: 'CLOCK',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'CLOCK', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'masterklok · delers · swing', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('tempo', 'Tempo', w*0.30, 30, { size: 'large', min: 20, max: 300, def: 120, unit: 'bpm', color: '#f9fafb' }),
      toggle('run', 'Run', w*0.78, 30, true),
      knob('swing', 'Swing', w*0.20, 56, { size: 'small', min: 0, max: 1, def: 0, color: '#60a5fa' }),
      knob('width', 'Width', w*0.50, 56, { size: 'small', min: 0.05, max: 0.95, def: 0.5, color: '#f9fafb' }),
      knob('div', 'Div', w*0.80, 56, { size: 'small', min: 1, max: 64, def: 6, step: 1, color: '#f9fafb' }),
      inPort('reset', 'Rst', 'gate', w*0.25, 76),
      inPort('tempo_cv', 'Tempo', 'cv', w*0.75, 76),
      outPort('bar', 'Bar', 'gate', w*0.16, 96),
      outPort('beat', 'Beat', 'gate', w*0.39, 96),
      outPort('x2', '×2', 'gate', w*0.62, 96),
      outPort('x3', '×3', 'gate', w*0.85, 96),
      outPort('x4', '×4', 'gate', w*0.16, 114),
      outPort('div', 'Div', 'gate', w*0.50, 114),
      outPort('ramp', 'Ramp', 'cv', w*0.84, 114),
    ],
    notes: 'Masterklok: één tempo waar alle uitgangen van worden afgeleid, zodat ze onderling nooit verschuiven. Beat = kwartnoten, ×2 = achtsten, ×3 = triolen, ×4 = zestienden (de stapklok voor de sequencers: Seq Clk, of Grids/Euclid/Turing met ExtClk aan; zet bij de Seq de Rate-knop op het tempo van de stappen, want die bepaalt daar nog de lengte van de gate), Bar = één puls per maat van vier tellen, Div = elke Div zestienden (6 = gepunteerde kwart, 3 = gepunteerde achtste). Swing verschuift elke tweede zestiende op ×4: 0 = recht, 1 = triolen-swing. Width is de pulsbreedte. Ramp is een zaag van 0 naar 1 per maat: hang er een filter of een Morph aan en de modulatie loopt in de maat. Tempo-CV is exponentieel (+1 = dubbel tempo). Rst zet alles terug op de één; Run uit houdt de klok stil. Firmware tp_mmb_clock; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB EUCLID — 12 HP. Euclidische ritmes, drie kanalen (firmware
//     tp_mmb_euclid). Kolom per kanaal: Steps / Fill / Rot.
function mmbEuclid() {
  const w = W(12);
  const col = (i: number): number => w * (0.20 + i * 0.30);
  const colors = ['#e11d48', '#0891b2', '#eab308'];
  return assemble({
    typeId: 'tp_mmb_euclid', categoryId: 'sequencer',
    variant: 'Euclid (Euclidische ritmes ×3)',
    brand: 'MMB', model: 'EUCLID',
    hp: 12, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'EUCLID', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'slagen gelijk verdeeld over stappen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      ...[0, 1, 2].flatMap((i) => [
        knob(`steps_${i+1}`, 'Steps', col(i), 26, { size: 'small', min: 1, max: 32, def: 16, step: 1, color: colors[i] }),
        knob(`fill_${i+1}`, 'Fill', col(i), 44, { size: 'small', min: 0, max: 32, def: [4, 3, 5][i]!, step: 1, color: colors[i] }),
        knob(`rot_${i+1}`, 'Rot', col(i), 62, { size: 'small', min: 0, max: 31, def: [0, 4, 2][i]!, step: 1, color: '#f9fafb' }),
        inPort(`fill_${i+1}_cv`, 'Fill+', 'cv', col(i), 80),
        outPort(`out_${i+1}`, `${i+1}`, 'gate', col(i), 96),
      ]),
      knob('tempo', 'Tempo', w*0.16, 114, { size: 'small', min: 20, max: 300, def: 120, unit: 'bpm', color: '#f9fafb' }),
      toggle('extclock', 'ExtClk', w*0.36, 114),
      inPort('clock', 'Clk', 'gate', w*0.54, 114),
      inPort('reset', 'Rst', 'gate', w*0.72, 114),
      outPort('any', 'Any', 'gate', w*0.90, 114),
    ],
    notes: 'Euclidische ritmegenerator met drie kanalen. Per kanaal verdeelt het algoritme Fill slagen zo gelijk mogelijk over Steps stappen; Rot draait het patroon. 3 op 8 is de tresillo, 5 op 8 met Rot 6 de cinquillo, 7 op 16 een samba-achtig patroon; veel traditionele ritmes zijn zo te maken (stap 0 is altijd raak, de rest volgt uit de verdeling). Geef de kanalen verschillende lengtes (16, 12, 7) en ze schuiven tegen elkaar: polymetriek. Fill+ telt op bij de Fill-knop (0..1 = 0..Steps), dus een LFO of Chaos maakt het ritme dichter en ijler. Klok zoals Grids: intern (Tempo, zestienden) of ExtClk aan + Clk (bijvoorbeeld Clock ×4). Any is hoog als een van de drie slaat. Stuur de uitgangen naar Peaks, de CR-78 of een envelope. Firmware tp_mmb_euclid; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB ARP — 8 HP. Arpeggiator (firmware tp_mmb_arp): hoort zelf de toetsen.
function mmbArp() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_arp', categoryId: 'sequencer',
    variant: 'Arp (arpeggiator)',
    brand: 'MMB', model: 'ARP',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'ARP', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'arpeggiator · hoort de toetsen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('mode', 'Mode', w*0.30, 26, ['Up', 'Down', 'Up/Down', 'Random', 'Played'], 0),
      knob('octaves', 'Oct', w*0.75, 26, { size: 'small', min: 1, max: 4, def: 1, step: 1, color: '#f9fafb' }),
      knob('tempo', 'Tempo', w*0.30, 46, { size: 'medium', min: 20, max: 300, def: 120, unit: 'bpm', color: '#38bdf8' }),
      sw  ('division', 'Div', w*0.75, 46, ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'], 3),
      knob('gate', 'Gate', w*0.30, 66, { size: 'small', min: 0.05, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('channel', 'Ch', w*0.75, 66, { size: 'small', min: 0, max: 16, def: 0, step: 1, color: '#9ca3af',
        ticks: { labels: { 0: 'alle' } } }),
      toggle('latch', 'Latch', w*0.30, 82),
      toggle('extclock', 'ExtClk', w*0.75, 82),
      inPort('clock', 'Clk', 'gate', w*0.30, 98),
      inPort('reset', 'Rst', 'gate', w*0.70, 98),
      outPort('pitch', 'Pitch', 'cv', w*0.14, 116),
      outPort('gate', 'Gate', 'gate', w*0.38, 116),
      outPort('vel', 'Vel', 'cv', w*0.62, 116),
      outPort('step', 'Step', 'gate', w*0.86, 116),
    ],
    notes: 'Arpeggiator, het bruikbare deel van Mutable Yarns. Hoort zelf de toetsen (net als MIDI-IN: elk MIDI-bericht gaat naar elke MIDI-IN en elke ARP) en speelt de toetsen die je vasthoudt als geklokte reeks op één stem: Pitch (V/Oct), Gate en Vel, zoals de mono-uitgangen van MIDI-IN. Mode: Up, Down, Up/Down (heen en terug, de uitersten één keer), Random (nooit twee keer dezelfde) of Played (de volgorde waarin je aansloeg). Oct herhaalt de reeks één tot vier octaven hoger. Latch: de reeks blijft spelen na het loslaten; een nieuwe aanslag na het loslaten begint een nieuwe. Klok intern (Tempo in bpm, Div = notenwaarde) of ExtClk aan + Clk: een stap per flank. De eerste aanslag uit stilstand speelt meteen. Gate is de nootlengte als deel van de stap; er blijft altijd een korte pauze, zodat elke noot opnieuw aanslaat. Step pulseert op elke stap (ook zonder toetsen), Rst begint de reeks opnieuw. Ch = MIDI-kanaal (0 = alle). Firmware tp_mmb_arp; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB MARTENOT — 14 HP. Ondes Martenot-stem (firmware tp_mmb_martenot).
function mmbMartenot() {
  const w = W(14);
  const col = (i: number): number => w * (0.12 + i * 0.19);          // vijf kolommen
  return assemble({
    typeId: 'tp_mmb_martenot', categoryId: 'vco',
    variant: 'Martenot (Ondes Martenot-stem)',
    brand: 'MMB', model: 'MARTENOT',
    hp: 14, texture: 'wood', baseColor: '#2b1d14', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'MARTENOT', fontSize: 2.5, color: '#f3e3c3', align: 'middle' },
      { x: w/2, y: 13, text: 'tiroir · touche · vibrato', fontSize: 1.1, color: '#c9b38a', align: 'middle' },
      { x: 3, y: 36, text: 'tiroir', fontSize: 1.0, color: '#c9b38a', align: 'start' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f3e3c3', align: 'middle' },
    ],
    items: [
      knob('coarse', 'Coarse', col(0), 24, { size: 'small', min: -36, max: 36, def: 0, step: 1, unit: 'semi', color: '#f3e3c3' }),
      knob('fine',   'Fine',   col(1), 24, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f3e3c3' }),
      knob('glide',  'Glide',  col(2), 24, { size: 'small', min: 0, max: 2000, def: 0, unit: 'ms', color: '#f3e3c3' }),
      knob('vib',    'Vib',    col(3), 24, { size: 'small', min: 0, max: 1, def: 0.15, unit: 'semi', color: '#fbbf24' }),
      knob('vib_rate', 'Rate', col(4), 24, { size: 'small', min: 0.5, max: 12, def: 5.5, unit: 'Hz', color: '#fbbf24' }),
      // De tiroir: zes klankschakelaars, hier als mengknoppen.
      knob('onde',      'O', col(0), 44, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#fde68a' }),
      knob('creux',     'C', col(1), 44, { size: 'medium', min: 0, max: 1, def: 0, color: '#fde68a' }),
      knob('gambe',     'G', col(2), 44, { size: 'medium', min: 0, max: 1, def: 0, color: '#fde68a' }),
      knob('nasillard', 'N', col(3), 44, { size: 'medium', min: 0, max: 1, def: 0, color: '#fde68a' }),
      knob('octaviant', '8', col(4), 44, { size: 'medium', min: 0, max: 1, def: 0, color: '#fde68a' }),
      knob('souffle',   'S', col(0), 64, { size: 'small', min: 0, max: 1, def: 0.05, color: '#d6c4a0' }),
      knob('bright',    'Bright', col(1), 64, { size: 'small', min: 0, max: 1, def: 0.6, color: '#d6c4a0' }),
      // Dynamiek: klavier of touche.
      sw  ('touche', 'Volume', col(2), 82, ['Klavier', 'Touche'], 0),
      knob('attack',  'Att',   col(3), 82, { size: 'small', min: 0.5, max: 2000, def: 6, unit: 'ms', color: '#f3e3c3' }),
      knob('release', 'Rel',   col(4), 82, { size: 'small', min: 1, max: 5000, def: 250, unit: 'ms', color: '#f3e3c3' }),
      knob('level',   'Level', col(4), 64, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f3e3c3' }),
      inPort ('voct',   'V/Oct', 'cv',   w*0.08, 116),
      inPort ('gate',   'Gate',  'gate', w*0.21, 116),
      inPort ('vel',    'Vel',   'cv',   w*0.34, 116),
      inPort ('press',  'Touche','cv',   w*0.47, 116),
      inPort ('vib_cv', 'Vib+',  'cv',   w*0.60, 116),
      outPort('amp',    'Amp',   'cv',   w*0.78, 116),
      outPort('out',    'Out',   'audio', w*0.92, 116),
    ],
    notes: 'Een stem naar de Ondes Martenot (Maurice Martenot, 1928; Messiaens Turangalîla, Jonny Greenwood). Een bijna zuivere toon met de tiroir, de la met klankschakelaars, hier als mengknoppen die je kunt combineren: O (onde, de zuivere golf), C (creux, hol: alleen oneven boventonen), G (gambe, strijkend en rijk), N (nasillard, neuzig), 8 (octaviant, het octaaf erbij) en S (souffle, adem rond de toonhoogte). Volume: Klavier = de toets met zijn aanslag, druk zwelt erbovenop; Touche = zoals het instrument, de druktoets onder de linkerhand maakt het volume en de toetsen (of de ring aan de draad, of het lint van het schermtoetsenbord) kiezen alleen de toonhoogte: zonder druk klinkt er niets. Hang Touche aan aftertouch (Press van MIDI-IN). Vib is het vibrato dat je maakt door de toets opzij te wiegen; Vib+ (het modwiel) zet er meer bij. Glide is het glijden van de ring. Bright: hoe helder de toon de kast in gaat. De luidsprekers (Principal, Palme met meetrillende snaren, Métallique met een gong) zijn een eigen module erachter: DIFFUSEUR. Eigen model naar de beschrijvingen, op het oor. Firmware tp_mmb_martenot, mmb_dsp::Martenot; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB DIFFUSEUR — 8 HP. De luidsprekers van de Ondes Martenot (firmware tp_mmb_diffuseur).
function mmbDiffuseur() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_diffuseur', categoryId: 'effect',
    variant: 'Diffuseur (Martenot-luidsprekers)',
    brand: 'MMB', model: 'DIFFUSEUR',
    hp: 8, texture: 'wood', baseColor: '#2b1d14', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'DIFFUSEUR', fontSize: 2.2, color: '#f3e3c3', align: 'middle' },
      { x: w/2, y: 13, text: 'principal · palme · métallique', fontSize: 1.0, color: '#c9b38a', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f3e3c3', align: 'middle' },
    ],
    items: [
      sw  ('type', 'Kast', w/2, 26, ['Principal', 'Palme', 'Métallique'], 1),
      knob('mix',  'Mix',  w*0.30, 48, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#fde68a' }),
      knob('ring', 'Ring', w*0.72, 48, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#fde68a' }),
      knob('tune', 'Tune', w*0.30, 70, { size: 'small', min: -12, max: 12, def: 0, step: 1, unit: 'semi', color: '#f3e3c3' }),
      knob('gong', 'Gong', w*0.72, 70, { size: 'small', min: 60, max: 600, def: 196, unit: 'Hz', color: '#f3e3c3' }),
      knob('level', 'Level', w*0.30, 88, { size: 'small', min: 0, max: 2, def: 1, color: '#f3e3c3' }),
      inPort ('in',     'In',   'audio', w*0.20, 112),
      inPort ('mix_cv', 'Mix+', 'cv',    w*0.50, 112),
      outPort('out',    'Out',  'audio', w*0.80, 112),
    ],
    notes: 'De luidsprekers van de Ondes Martenot, elk met een eigen klank. Principal: de gewone kast, wat laag en wat hoog eraf. Palme: een liervormige kast met twaalf snaren, chromatisch gestemd vanaf C3, die meetrillen: een zingende halo die na de noot doorklinkt; Tune stemt de snaren om, Ring is hoe lang ze naklinken. Métallique: een gong als luidsprekermembraan; metalen, niet-harmonische boventonen die niet met de toon meegaan; Gong is de grondtoon van de gong, Ring hoe lang hij zingt. Mix mengt de kast met de directe klank (Principal heeft geen menging), Mix+ telt erbij op. Eén kast voor alle stemmen: zet hem na de stemmen, en ook achter iets anders (een piano door de palme). De vierde luidspreker, Résonance (veergalm), is REVERB in Spring-stand erachter. Eigen model op het oor. Firmware tp_mmb_diffuseur, mmb_dsp::Diffuseur; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB TURING — 8 HP. Schuifregister-sequencer (firmware tp_mmb_turing).
function mmbTuring() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_turing', categoryId: 'sequencer',
    variant: 'Turing (lus die langzaam verandert)',
    brand: 'MMB', model: 'TURING',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'TURING', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'schuifregister · 16 bits', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('change', 'Change', w/2, 31, { size: 'large', min: 0, max: 1, def: 0.1, color: '#e11d48',
        ticks: { labels: { 0: 'slot', 0.5: 'random', 1: '2×' } } }),
      knob('length', 'Length', w*0.25, 58, { size: 'small', min: 2, max: 16, def: 8, step: 1, color: '#f9fafb' }),
      knob('range', 'Range', w*0.75, 58, { size: 'small', min: 0, max: 5, def: 2, unit: 'oct', color: '#f9fafb' }),
      knob('tempo', 'Tempo', w*0.25, 78, { size: 'small', min: 20, max: 300, def: 120, unit: 'bpm', color: '#f9fafb' }),
      toggle('extclock', 'ExtClk', w*0.75, 78),
      inPort('clock', 'Clk', 'gate', w*0.18, 98),
      inPort('reset', 'Rst', 'gate', w*0.50, 98),
      inPort('change_cv', 'Chg+', 'cv', w*0.82, 98),
      outPort('cv', 'CV', 'cv', w*0.14, 116),
      outPort('cv2', 'CV2', 'cv', w*0.38, 116),
      outPort('pulse', 'Pulse', 'gate', w*0.62, 116),
      outPort('pulse2', 'P2', 'gate', w*0.86, 116),
    ],
    notes: 'Schuifregister-sequencer in de geest van de Turing Machine: een lus van Length stappen die je laat veranderen. Change is de kans dat het bit dat rondgaat omklapt: 0 = de lus zit op slot en herhaalt precies; 0,5 = elke stap een muntworp, geen herhaling; 1 = het bit klapt altijd om, de lus herhaalt na twee keer Length met een gespiegelde tweede helft. Daartussen verandert er af en toe een noot: draai open tot je iets hoort wat je bevalt en draai dicht om het te houden. CV is de 8-bits waarde van het register (0 tot Range octaven, ongekwantiseerd: zet er de Quantizer achter voor noten in een schaal); CV2 is dezelfde lijn acht stappen later, een canon. Pulse en P2 volgen twee bits van het register als ritme. Klok intern (Tempo, zestienden) of ExtClk aan + Clk. Rst zet het register terug op het beginpatroon, dus na een reset klinkt dezelfde lus. Firmware tp_mmb_turing; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB BRANCHES — 4 HP. Bernoulli-gate (firmware tp_mmb_branches).
function mmbBranches() {
  const w = W(4);
  return assemble({
    typeId: 'tp_mmb_branches', categoryId: 'utility',
    variant: 'Branches (muntworp per trigger)',
    brand: 'MMB', model: 'BRANCHES',
    hp: 4, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'BRANCH', fontSize: 1.9, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('p', 'P(B)', w/2, 28, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      toggle('toggle', 'Toggle', w/2, 50),
      toggle('latch', 'Latch', w/2, 66),
      inPort('in', 'In', 'gate', w*0.28, 86),
      inPort('p_cv', 'P+', 'cv', w*0.72, 86),
      outPort('a', 'A', 'gate', w*0.28, 110),
      outPort('b', 'B', 'gate', w*0.72, 110),
    ],
    notes: 'Bernoulli-gate (naar het idee van Mutable Instruments Branches, eigen code): elke trigger op In gaat naar uitgang A of naar uitgang B; P(B) is de kans op B. Toggle aan: P is de kans dat de kant wisselt (1 = strak om-en-om, een klokdeler door twee; klein = lang dezelfde kant). Latch aan: de gekozen uitgang blijft hoog tot de worp de andere kant kiest, een willekeurige schakelaar. Typisch: klok erin, A naar de hihat en B naar een fill; of een gate uit de sequencer erin en met P bepalen hoe vaak het accent meedoet. P+ telt op bij de knop. Firmware tp_mmb_branches; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB CHAOS — 8 HP. Vreemde aantrekkers als modulator (firmware tp_mmb_chaos).
function mmbChaos() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_chaos', categoryId: 'lfo',
    variant: 'Chaos (Lorenz / Rössler / Thomas)',
    brand: 'MMB', model: 'CHAOS',
    hp: 8, texture: 'pcb-black', baseColor: '#2a1f3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'CHAOS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'vloeiend, nooit hetzelfde', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate', 'Rate', w*0.30, 30, { size: 'large', min: 0.005, max: 20, def: 0.2, unit: 'Hz', color: '#a78bfa' }),
      sw('model', 'Model', w*0.78, 30, ['Lorenz', 'Rössler', 'Thomas'], 0),
      knob('shape', 'Shape', w*0.22, 58, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('depth', 'Depth', w*0.50, 58, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      toggle('bipolar', 'Bip', w*0.80, 58, true),
      knob('rate_cv_amt', 'Rate CV', w*0.25, 78, { size: 'small', min: -1, max: 1, def: 1, color: '#f9fafb' }),
      inPort('rate_cv', 'Rate', 'cv', w*0.25, 96),
      inPort('reset', 'Rst', 'gate', w*0.75, 96),
      outPort('x', 'X', 'cv', w*0.14, 116),
      outPort('y', 'Y', 'cv', w*0.38, 116),
      outPort('z', 'Z', 'cv', w*0.62, 116),
      outPort('gate', 'Gate', 'gate', w*0.86, 116),
    ],
    notes: 'Chaotische modulator. Een LFO herhaalt zich en ruis heeft geen richting; een chaotisch stelsel zit ertussenin: het beweegt vloeiend en samenhangend, maar komt nooit precies terug. X, Y en Z zijn drie kanten van dezelfde beweging: modulaties die ermee gestuurd worden horen bij elkaar zonder gelijk te lopen. Lorenz: twee lobben; de baan cirkelt een poos om de ene en springt dan onvoorspelbaar naar de andere (Gate is hoog op de rechterlob: een onregelmatige schakelaar). Rössler: een bijna-sinus op X en Y die af en toe uitschiet, met op Z losse pieken; Shape loopt door de periodeverdubbeling, van periodiek naar chaotisch. Thomas: een trage, symmetrische dwaaltocht, het rustigste van de drie, voor drift over minuten. Rate is ruwweg het aantal omlopen per seconde (0,005 Hz = ruim drie minuten per omloop); Rate-CV is exponentieel (±1 = ±4 octaven maal Rate CV). Depth schaalt de uitgangen, Bip uit maakt ze 0..Depth. Rst herstelt de beginpositie, dus een patch begint reproduceerbaar. Firmware tp_mmb_chaos; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB LFO-8 — 10 HP. Acht verwante LFO's op één knop (firmware tp_mmb_lfo8).
function mmbLfo8() {
  const w = W(10);
  const col = (i: number): number => w * (0.14 + (i % 4) * 0.24);
  return assemble({
    typeId: 'tp_mmb_lfo8', categoryId: 'lfo',
    variant: 'LFO-8 (acht verwante LFO’s)',
    brand: 'MMB', model: 'LFO-8',
    hp: 10, texture: 'pcb-black', baseColor: '#2a1f3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'LFO-8', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'snel → traag · één knop', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rate', 'Rate', w*0.28, 31, { size: 'large', min: 0.02, max: 50, def: 1, unit: 'Hz', color: '#a78bfa' }),
      knob('spread', 'Spread', w*0.72, 31, { size: 'medium', min: 1.1, max: 3, def: 1.6, color: '#f9fafb' }),
      knob('shape', 'Shape', w*0.18, 58, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb',
        ticks: { labels: { 0: 'tri', 1: 'sin' } } }),
      knob('depth', 'Depth', w*0.46, 58, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      toggle('bipolar', 'Bip', w*0.76, 58, true),
      inPort('rate_cv', 'Rate', 'cv', w*0.28, 78),
      inPort('reset', 'Rst', 'gate', w*0.72, 78),
      ...Array.from({ length: 8 }, (_, i) =>
        outPort(`out_${i+1}`, `${i+1}`, 'cv', col(i), i < 4 ? 98 : 116)),
    ],
    notes: 'Acht vrijlopende LFO’s op één Rate-knop. Uitgang 1 is de snelste (Rate), elke volgende is een factor Spread trager, met een kleine vaste afwijking per uitgang zodat ze nooit in de maat gaan lopen. Bij Rate 1 Hz en Spread 1,6 loopt uitgang 8 op ongeveer 0,04 Hz: van trilling tot getij op één knop. Prik overal een uitgang in en de hele patch beweegt samenhangend, zonder acht LFO’s te hoeven instellen. Shape loopt van driehoek naar sinus, Depth schaalt alle uitgangen, Bip uit maakt ze 0..Depth. Rate-CV is exponentieel (±1 = ±4 octaven) en werkt op alle acht; Rst zet alle fasen op nul. Firmware tp_mmb_lfo8; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB SLOPE — 8 HP. Functiegenerator (firmware tp_mmb_slope).
function mmbSlope() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_slope', categoryId: 'envelope',
    variant: 'Slope (functiegenerator: rise/fall)',
    brand: 'MMB', model: 'SLOPE',
    hp: 8, texture: 'pcb-black', baseColor: '#2a1f3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'SLOPE', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'envelope · LFO · lag', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('rise', 'Rise', w*0.28, 30, { size: 'medium', min: 0.001, max: 20, def: 0.05, unit: 's', color: '#34d399' }),
      knob('fall', 'Fall', w*0.72, 30, { size: 'medium', min: 0.001, max: 20, def: 0.5, unit: 's', color: '#f87171' }),
      knob('shape', 'Shape', w*0.28, 56, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb',
        ticks: { labels: { [-1]: 'log', 0: 'lin', 1: 'exp' } } }),
      toggle('cycle', 'Cycle', w*0.72, 56),
      inPort('in', 'In', 'cv', w*0.18, 80),
      inPort('trig', 'Trig', 'gate', w*0.50, 80),
      inPort('time_cv', 'Time', 'cv', w*0.82, 80),
      outPort('out', 'Out', 'cv', w*0.28, 98),
      outPort('inv', 'Inv', 'cv', w*0.72, 98),
      outPort('eor', 'EOR', 'gate', w*0.28, 116),
      outPort('eoc', 'EOC', 'gate', w*0.72, 116),
    ],
    notes: 'Functiegenerator naar het bekende West Coast-bouwblok (Serge DUSG, later Maths): één schakeling die envelope, LFO, lag of envelope-volger is, afhankelijk van wat je erin steekt. Trig: een flank laat de uitgang naar 1 stijgen (Rise) en daarna naar 0 dalen (Fall), een AD-envelope. In: de uitgang volgt de ingang, omhoog met Rise en omlaag met Fall; een gate geeft een ASR-envelope, een V/Oct-lijn portamento met omhoog en omlaag apart, een gelijkgericht signaal (Logic Abs) een envelope-volger. Cycle: aan het eind van de daling start hij zichzelf opnieuw, een LFO waarvan Rise en Fall de vorm bepalen (zaag, driehoek, ramp). Shape buigt de lijnen: log = snel begin en trage nadering (zoals een condensator), lin = recht, exp = trage start en snel eind. Rise en Fall zijn de tijd voor een volle slag; Time-CV rekt beide (+1 = acht keer zo lang). EOR is hoog zolang de uitgang daalt, EOC geeft een puls aan het eind van de daling: keten er een tweede Slope aan, of gebruik hem als klok. Inv = 1 − Out. Firmware tp_mmb_slope; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB LOGIC — 6 HP. CV-gereedschap (firmware tp_mmb_logic).
function mmbLogic() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_logic', categoryId: 'utility',
    variant: 'Logic (min/max, logica, vergelijker)',
    brand: 'MMB', model: 'LOGIC',
    hp: 6, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'LOGIC', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('thresh', 'Thresh', w/2, 26, { size: 'medium', min: -1, max: 1, def: 0.5, color: '#f9fafb' }),
      inPort('a', 'A', 'cv', w*0.28, 48),
      inPort('b', 'B', 'cv', w*0.72, 48),
      outPort('min', 'Min', 'cv', w*0.28, 66),
      outPort('max', 'Max', 'cv', w*0.72, 66),
      outPort('and', 'AND', 'gate', w*0.28, 83),
      outPort('or', 'OR', 'gate', w*0.72, 83),
      outPort('xor', 'XOR', 'gate', w*0.28, 100),
      outPort('gt', 'A>B', 'gate', w*0.72, 100),
      outPort('abs', '|A|', 'cv', w*0.28, 117),
      outPort('inv', '−A', 'cv', w*0.72, 117),
    ],
    notes: 'CV-gereedschap: twee ingangen, acht uitgangen die er elk iets anders mee doen. Het zijn de kleine bewerkingen waarmee twee eenvoudige modulatoren samen een ingewikkelde worden. Min en Max geven de laagste en de hoogste van A en B: op gates is dat AND en OR, op twee LFO’s een nieuwe golfvorm met knikken. AND, OR en XOR zijn gate-logica (een ingang telt als hoog boven Thresh): twee klokken door XOR geeft een derde, onregelmatiger ritme. A>B is een vergelijker; met alleen A aangesloten vergelijkt hij met Thresh en maakt hij van elke CV een gate (een LFO wordt een pulsgolf met instelbare breedte). |A| richt A gelijk: een bipolaire LFO wordt twee keer zo snel en unipolair, en met Slope erachter heb je een envelope-volger voor CV. −A keert A om. Firmware tp_mmb_logic; in de simulator draait dezelfde klasse als wasm.',
  });
}

// ── West Coast, pedalen en klassiekers (2026-10-02) ────────────────────
// Zeven audiomodules op gedeelde mmb_dsp-kernels (firmware via
// KernelStream.h, simulator via kernel_host.h).

// MMB FOLDER — 8 HP. Wavefolder (firmware tp_mmb_folder).
function mmbFolder() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_folder', categoryId: 'effect',
    variant: 'Wavefolder (West Coast)',
    brand: 'MMB', model: 'FOLDER',
    hp: 8, texture: 'pcb-black', baseColor: '#3d2a1f', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'FOLDER', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'boventonen door vouwen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('fold', 'Fold', w/2, 32, { size: 'large', min: 0, max: 1, def: 0.3, color: '#fb923c' }),
      knob('symmetry', 'Sym', w*0.25, 60, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      sw('type', 'Type', w*0.75, 60, ['Sine', 'Tri', '259'], 0),
      knob('mix', 'Mix', w*0.25, 80, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('level', 'Level', w*0.75, 80, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('fold_cv', 'Fold+', 'cv', w*0.25, 98),
      inPort('sym_cv', 'Sym+', 'cv', w*0.75, 98),
      inPort('in', 'In', 'audio', w*0.25, 116),
      outPort('out', 'Out', 'audio', w*0.75, 116),
    ],
    notes: 'Wavefolder: de West Coast-manier om boventonen te maken. Een filter haalt boventonen weg uit een rijke golf; een folder begint met een sinus of driehoek en vouwt de toppen terug zodra ze over een grens gaan. Hoe verder Fold open, hoe vaker de golf vouwt en hoe meer boventonen, in een patroon dat op FM lijkt maar strak harmonisch blijft. Zet er een envelope of LFO op Fold+ en de klank opent zoals een filter dat zou doen, maar dan andersom. Type: Sine = door een sinus (zacht, rond), Tri = hoekig terugvouwen (helder, scherp), 259 = de vijf vouwcellen van het timbre-circuit van de Buchla 259 (hol, neuzig). Sym schuift de golf voor het vouwen opzij en voegt even boventonen toe. Het werkt het best op een sinus of driehoek op volle sterkte; een zaag of een akkoord wordt snel ruis. Vier keer overbemonsterd. Mix mengt met het droge signaal. Erachter hoort een low-pass gate (LPG). Firmware tp_mmb_folder, mmb_dsp::Wavefolder; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB LPG — 6 HP. Low-pass gate met vactrol (firmware tp_mmb_lpg).
function mmbLpg() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_lpg', categoryId: 'vca',
    variant: 'LPG (low-pass gate, vactrol)',
    brand: 'MMB', model: 'LPG',
    hp: 6, texture: 'pcb-black', baseColor: '#3d2a1f', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'LPG', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'filter + versterker', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('offset', 'Open', w*0.28, 28, { size: 'medium', min: 0, max: 1, def: 0, color: '#fb923c' }),
      knob('decay', 'Decay', w*0.72, 28, { size: 'medium', min: 0.02, max: 4, def: 0.25, unit: 's', color: '#fb923c' }),
      sw('mode', 'Mode', w/2, 50, ['LP', 'Both', 'VCA'], 1),
      knob('res', 'Res', w*0.28, 68, { size: 'small', min: 0, max: 1, def: 0.1, color: '#f9fafb' }),
      knob('level', 'Level', w*0.72, 68, { size: 'small', min: 0, max: 1, def: 0.9, color: '#f9fafb' }),
      inPort('cv', 'CV', 'cv', w*0.28, 88),
      inPort('trig', 'Ping', 'gate', w*0.72, 88),
      inPort('in', 'In', 'audio', w*0.28, 104),
      outPort('out', 'Out', 'audio', w*0.72, 104),
      outPort('env', 'Env', 'cv', w/2, 118),
    ],
    notes: 'Low-pass gate: filter en versterker in één, gestuurd door een vactrol (een lampje tegen een lichtgevoelige weerstand). De weerstand reageert vlug op licht maar komt traag terug, en trager naarmate het donkerder wordt. In stand Both stuurt hij tegelijk de helderheid en het volume, zoals in de Buchla 292: een klank die uitsterft wordt ook doffer, net als een aangeslagen stuk hout of een getokkelde snaar. Ping: een trigger laat het lampje flitsen; zonder envelope geeft dat al een natuurlijke tik met een eigen staart (het bongo-geluid van de West Coast). Decay bepaalt hoe lang de vactrol nagloeit. CV (0..1) telt op bij Open: een envelope of LFO opent de gate geleidelijk, en ook dan komt hij traag terug. Mode LP = alleen het filter, VCA = alleen de versterker. Res geeft het filter een piek. Env is de toestand van de vactrol als CV (0..1): een envelope met dat nagloeien, voor elders in de patch. Firmware tp_mmb_lpg, mmb_dsp::Lpg; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB DRIVE — 6 HP. Overdrive / distortion / fuzz (firmware tp_mmb_drive).
function mmbDrive() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_drive', categoryId: 'effect',
    variant: 'Drive (overdrive / distortion / fuzz)',
    brand: 'MMB', model: 'DRIVE',
    hp: 6, texture: 'pcb-black', baseColor: '#3d1f1f', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'DRIVE', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'drie pedalen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('drive', 'Drive', w/2, 30, { size: 'large', min: 0, max: 1, def: 0.5, color: '#ef4444' }),
      sw('mode', 'Mode', w/2, 54, ['OD', 'Dist', 'Fuzz'], 0),
      knob('tone', 'Tone', w*0.28, 72, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('level', 'Level', w*0.72, 72, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('mix', 'Mix', w*0.28, 92, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      inPort('drive_cv', 'Drv+', 'cv', w*0.72, 92),
      inPort('in', 'In', 'audio', w*0.28, 114),
      outPort('out', 'Out', 'audio', w*0.72, 114),
    ],
    notes: 'Drie vervormpedalen in één. Het verschil zit niet in meer gain, maar in wat er vóór en ná de clipper gefilterd wordt en hoe hard die knipt. OD = overdrive naar de groene overdrive (Tube Screamer-familie): alleen midden en hoog gaan de zachte clipper in en het schone signaal wordt er weer bij opgeteld; het laag blijft strak en het midden komt naar voren, zodat een solo door de band heen komt. Dist = distortion naar de RAT-familie: veel versterking in een trage opamp, dan harde dioden; ruiger en platter, Tone is hier het filter dat het hoog wegneemt. Fuzz = naar de Big Muff-familie: twee clippende trappen achter elkaar en een toonregeling met een gat in het midden; lange, zingende sustain. Level 0,5 is ongeveer even luid als onbewerkt. Drv+ telt op bij Drive (een envelope-volger erop: harder spelen = meer vervorming). Vier keer overbemonsterd. Een eigen model naar de topologie van de schakelingen, op het oor; geen simulatie per onderdeel. Firmware tp_mmb_drive, mmb_dsp::Drive; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB TUBE — 10 HP. Buizenoverdrive: gitaarversterker of studio-voorversterker (firmware tp_mmb_tube).
function mmbTube() {
  const w = W(10);
  return assemble({
    typeId: 'tp_mmb_tube', categoryId: 'effect',
    variant: 'Tube (buizenversterker / studio-buis)',
    brand: 'MMB', model: 'TUBE',
    hp: 10, texture: 'pcb-black', baseColor: '#2b1d12', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'TUBE', fontSize: 2.4, color: '#fbbf24', align: 'middle' },
      { x: w/2, y: 13, text: 'buizenoverdrive', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw('mode', 'Mode', w*0.25, 24, ['Studio', 'Amp'], 1),
      knob('drive', 'Drive', w*0.68, 26, { size: 'large', min: 0, max: 1, def: 0.5, color: '#f59e0b' }),
      sw('stack', 'Stack', w*0.25, 44, ['Fender', 'Marshall', 'Vox'], 0),
      knob('bias', 'Bias', w*0.68, 46, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('bass', 'Bass', w*0.2, 62, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('mid', 'Mid', w*0.5, 62, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('treble', 'Treble', w*0.8, 62, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('presence', 'Pres', w*0.2, 79, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('sag', 'Sag', w*0.5, 79, { size: 'small', min: 0, max: 1, def: 0.4, color: '#f9fafb' }),
      sw('cab', 'Cab', w*0.8, 79, ['Uit', 'Aan'], 1),
      knob('mix', 'Mix', w*0.2, 96, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('level', 'Level', w*0.5, 96, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      inPort('drive_cv', 'Drv+', 'cv', w*0.8, 96),
      inPort('in_l', 'In L', 'audio', w*0.15, 114),
      inPort('in_r', 'In R', 'audio', w*0.38, 114),
      outPort('out_l', 'Out L', 'audio', w*0.62, 114),
      outPort('out_r', 'Out R', 'audio', w*0.85, 114),
    ],
    notes: 'Buizenoverdrive in twee standen. Wat een buis anders doet dan een diode: hij clipt asymmetrisch (boven nul gaat er roosterstroom lopen en wordt de top zacht afgerond, onder nul knijpt hij later en harder dicht), dus even boventonen; en de roosterstroom laadt de koppelcondensator op, waardoor het werkpunt na een harde aanslag even wegzakt en in tientallen milliseconden terugkomt (blocking): de vervorming ademt mee met je spel. Amp = gitaarversterker: twee triodetrappen, dan de toonstack (Stack Fender: diep gat in het midden rond 400 Hz; Marshall: ondieper en hoger, meer midden; Vox top boost: weinig gat, helder) met Bass/Mid/Treble, dan de push-pull-eindtrap met Sag (de voeding zakt in bij hard spelen: compressie, sponziger) en Presence, en een kastsimulatie (Cab; zet hem uit voor een eigen kast of galm). Studio = één triodetrap en een uitgangstrafo die het laag iets verzadigt: warmte en tweede harmonische op een stem, synth of mix, zonder toonstack of kast; Level blijft ongeveer gelijk als je Drive draait. Bias: links koud (eerder dichtknijpen, rauwer), rechts warm (eerder roosterstroom, ronder). Mix maakt het parallel. Drv+ (CV) telt op bij Drive. Stereo: twee gelijke kanalen; alleen In L = mono naar beide. Vier keer overbemonsterd. Een eigen model op gedrag en topologie, geen simulatie per onderdeel. Firmware tp_mmb_tube, mmb_dsp::Tube; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB FREQ-SHIFT — 8 HP. Frequency shifter (firmware tp_mmb_freqshift).
function mmbFreqShift() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_freqshift', categoryId: 'effect',
    variant: 'Frequency shifter (Bode)',
    brand: 'MMB', model: 'FREQ-SHIFT',
    hp: 8, texture: 'pcb-black', baseColor: '#1f3d36', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'FREQ', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'SHIFT', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('shift', 'Shift', w/2, 34, { size: 'large', min: -1, max: 1, def: 0.2, color: '#34d399',
        ticks: { labels: { [-1]: '−', 0: '0', 1: '+' } } }),
      sw('range', 'Range', w/2, 58, ['5 Hz', '50', '500', '5 k'], 1),
      knob('fbk', 'Fbk', w*0.20, 78, { size: 'small', min: 0, max: 0.95, def: 0, color: '#f9fafb' }),
      knob('mix', 'Mix', w*0.50, 78, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('level', 'Level', w*0.80, 78, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('in', 'In', 'audio', w*0.28, 98),
      inPort('shift_cv', 'Shift+', 'cv', w*0.72, 98),
      outPort('out', 'Up', 'audio', w*0.28, 116),
      outPort('down', 'Down', 'audio', w*0.72, 116),
    ],
    notes: 'Frequency shifter naar Bode: schuift elke frequentie hetzelfde aantal hertz op. Dat is iets anders dan een pitch-shifter, die vermenigvuldigt: bij +100 Hz wordt 200/400/600 Hz niet 300/600/900 maar 300/500/700. De boventonen staan dan niet meer in een hele verhouding: klokachtig, metalig. Shift maal Range is de verschuiving (Range 5 Hz voor trage, eindeloos doorlopende zwevingen; 50 en 500 voor ontstemmen en klokken; 5 k voor ringmod-achtig geweld). Up is het mengsel van droog en de omhoog geschoven kant (Mix), Down de andere kant: zet Up links en Down rechts en een klein beetje Shift geeft een breed, draaiend stereobeeld. Fbk stuurt de geschoven klank terug de ingang in: elke ronde schuift hij verder, een spiraal van zijbanden. Shift+ telt op bij de knop (een LFO erop geeft vibrato dat de boventonen uit elkaar trekt). Techniek: enkelzijbandmodulatie met twee all-pass-ketens die 90 graden verschillen; de ongewenste zijband ligt van 40 Hz tot 18 kHz meer dan 44 dB lager (gemeten). Firmware tp_mmb_freqshift, mmb_dsp::FreqShifter; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB ACID — 12 HP. Basstem naar de TB-303 (firmware tp_mmb_acid).
// ── Mixtur (Trautonium-stem) ──────────────────────────────────────────
function mmbMixtur() {
  const w = W(16);
  const col = (i: number): number => w * (0.10 + i * 0.2);          // vijf kolommen
  return assemble({
    typeId: 'tp_mmb_mixtur', categoryId: 'vco',
    variant: 'Mixtur (Trautonium-stem)',
    brand: 'MMB', model: 'MIXTUR',
    hp: 16, texture: 'wood', baseColor: '#3b2a1c', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'MIXTUR', fontSize: 2.6, color: '#f5e6c8', align: 'middle' },
      { x: w/2, y: 13, text: 'glimlamp · ondertonen · formanten', fontSize: 1.1, color: '#d6c4a0', align: 'middle' },
      { x: 3, y: 41, text: 'f/n', fontSize: 1.0, color: '#d6c4a0', align: 'start' },
      { x: 3, y: 57, text: 'Mix', fontSize: 1.0, color: '#d6c4a0', align: 'start' },
      { x: col(0), y: 41, text: 'f', fontSize: 1.4, color: '#f5e6c8', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f5e6c8', align: 'middle' },
    ],
    items: [
      knob('coarse', 'Coarse', col(0), 24, { size: 'small', min: -36, max: 36, def: 0, step: 1, unit: 'semi', color: '#f5e6c8' }),
      knob('fine',   'Fine',   col(1), 24, { size: 'small', min: -100, max: 100, def: 0, unit: 'ct', color: '#f5e6c8' }),
      knob('curve',  'Lamp',   col(2), 24, { size: 'small', min: 0, max: 1, def: 0.55, color: '#fbbf24' }),
      knob('unrest', 'Unrest', col(3), 24, { size: 'small', min: 0, max: 1, def: 0.25, color: '#fbbf24' }),
      knob('glide',  'Glide',  col(4), 24, { size: 'small', min: 0, max: 2000, def: 0, unit: 'ms', color: '#f5e6c8' }),
      // Mixtuur: hoofdtoon + vier ondertonen (deler 1..24 en niveau).
      knob('div1', 'Div', col(1), 41, { size: 'small', min: 1, max: 24, def: 2, step: 1, color: '#d6c4a0' }),
      knob('div2', 'Div', col(2), 41, { size: 'small', min: 1, max: 24, def: 3, step: 1, color: '#d6c4a0' }),
      knob('div3', 'Div', col(3), 41, { size: 'small', min: 1, max: 24, def: 4, step: 1, color: '#d6c4a0' }),
      knob('div4', 'Div', col(4), 41, { size: 'small', min: 1, max: 24, def: 5, step: 1, color: '#d6c4a0' }),
      knob('main', 'Main', col(0), 57, { size: 'medium', min: 0, max: 1, def: 0.8, color: '#fbbf24' }),
      knob('sub1', 'Sub 1', col(1), 57, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#fbbf24' }),
      knob('sub2', 'Sub 2', col(2), 57, { size: 'medium', min: 0, max: 1, def: 0.45, color: '#fbbf24' }),
      knob('sub3', 'Sub 3', col(3), 57, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#fbbf24' }),
      knob('sub4', 'Sub 4', col(4), 57, { size: 'medium', min: 0, max: 1, def: 0, color: '#fbbf24' }),
      // Vaste formantfilters.
      sw  ('formant', 'Formant', col(0), 78, ['Uit', 'A', 'E', 'I', 'O', 'U'], 1),
      knob('fshift', 'Shift', col(1), 78, { size: 'small', min: -12, max: 12, def: 0, unit: 'semi', color: '#93c5fd' }),
      knob('freso',  'Reso',  col(2), 78, { size: 'small', min: 0, max: 1, def: 0.55, color: '#93c5fd' }),
      knob('fmix',   'Form mix', col(3), 78, { size: 'small', min: 0, max: 1, def: 0.7, color: '#93c5fd' }),
      knob('noise',  'Noise', col(4), 78, { size: 'small', min: 0, max: 1, def: 0.03, color: '#d6c4a0' }),
      // Dynamiek.
      sw  ('dyn',     'Dyn',     col(0), 98, ['Vel', 'Press'], 0),
      knob('attack',  'Att',     col(1), 98, { size: 'small', min: 0.5, max: 2000, def: 8, unit: 'ms', color: '#f5e6c8' }),
      knob('release', 'Rel',     col(2), 98, { size: 'small', min: 1, max: 5000, def: 120, unit: 'ms', color: '#f5e6c8' }),
      knob('level',   'Level',   col(4), 98, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f5e6c8' }),
      inPort ('voct',    'V/Oct', 'cv',   w*0.07, 116),
      inPort ('gate',    'Gate',  'gate', w*0.18, 116),
      inPort ('vel',     'Vel',   'cv',   w*0.29, 116),
      inPort ('press',   'Press', 'cv',   w*0.40, 116),
      inPort ('sub_cv',  'Sub+',  'cv',   w*0.51, 116),
      inPort ('form_cv', 'Form+', 'cv',   w*0.62, 116),
      outPort('amp',     'Amp',   'cv',   w*0.80, 116),
      outPort('out',     'Out',   'audio', w*0.92, 116),
    ],
    notes: 'Een stem naar het Mixtur-Trautonium van Oskar Sala (bekend van The Birds). Drie dingen maken het geluid. (1) Een glimlamp-oscillator: een condensator laadt op en ontlaadt in één klap door een neonlamp, een zaagtand met een gebogen flank en een harde val; Lamp = hoe krom die laadcurve is, Unrest = de kleine onrust per periode van een echte lamp. (2) Ondertonen in plaats van boventonen: vier delers tellen de perioden van de hoofdtoon en geven f/Div (1..24), exact in fase met de hoofdtoon. De mengverhouding van Main en Sub 1–4 is een mixtuur: een akkoord uit de ondertoonreeks (bijv. Div 2-3-4-5 = de grondtoon met een octaaf, een kwint en een terts daaronder) dat meeschuift met de toonhoogte. Sub+ (CV) schaalt de vier ondertonen samen, zoals Salas pedaal. (3) Vaste formantfilters: drie bandfilters op de klinker A, E, I, O of U die níét meebewegen met de toonhoogte; daardoor klinkt hij als een stem of een blaasinstrument en verkleurt hij als je over het bereik glijdt. Shift schuift de drie samen, Reso maakt ze scherper, Form mix mengt droog en gefilterd, Form+ (CV) glijdt door de klinkerrij. Dyn: Vel = de aanslag van de toets, Press = continue druk (de draad van het instrument; MIDI-aftertouch of een lint met drukmeting). Glide maakt de toonhoogte traploos voor wie op toetsen speelt. Het instrument had twee manualen: twee modules, of een PolyGroup ×2. Amp is de dynamiek als CV. Eigen model naar de beschrijvingen, op het oor. Firmware tp_mmb_mixtur, mmb_dsp::Mixtur; in de simulator draait dezelfde code als wasm.',
  });
}

function mmbAcid() {
  const w = W(12);
  const col = (i: number): number => w * (0.12 + i * 0.19);
  return assemble({
    typeId: 'tp_mmb_acid', categoryId: 'vco',
    variant: 'Acid (303-stijl basstem)',
    brand: 'MMB', model: 'ACID',
    hp: 12, texture: 'aluminum', baseColor: '#c9ccd1', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'ACID', fontSize: 2.6, color: '#111827', align: 'middle' },
      { x: w/2, y: 13, text: 'bass line · accent · slide', fontSize: 1.1, color: '#374151', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#111827', align: 'middle' },
    ],
    items: [
      knob('tune', 'Tune', col(0), 30, { size: 'small', min: -24, max: 24, def: 0, unit: 'semi', step: 1, color: '#111827' }),
      knob('cutoff', 'Cutoff', col(1), 30, { size: 'medium', min: 0, max: 1, def: 0.35, color: '#111827' }),
      knob('res', 'Reso', col(2), 30, { size: 'medium', min: 0, max: 1, def: 0.7, color: '#111827' }),
      knob('envmod', 'Env mod', col(3), 30, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#111827' }),
      knob('decay', 'Decay', col(4), 30, { size: 'small', min: 0.1, max: 3, def: 0.4, unit: 's', color: '#111827' }),
      sw('wave', 'Wave', col(0), 58, ['Saw', 'Sqr'], 0),
      knob('accent', 'Accent', col(2), 58, { size: 'medium', min: 0, max: 1, def: 0.6, color: '#dc2626' }),
      knob('level', 'Level', col(4), 58, { size: 'small', min: 0, max: 1, def: 0.8, color: '#111827' }),
      inPort('voct', 'V/Oct', 'cv', col(0), 92),
      inPort('gate', 'Gate', 'gate', col(1), 92),
      inPort('accent', 'Acc', 'gate', col(2), 92),
      inPort('slide', 'Slide', 'gate', col(3), 92),
      inPort('cutoff_cv', 'Cut+', 'cv', col(4), 92),
      outPort('env', 'Env', 'cv', col(3), 114),
      outPort('out', 'Out', 'audio', col(4), 114),
    ],
    notes: 'Complete basstem naar de TB-303: één oscillator (zaag of blok), een vierpolig ladderfilter dat hard piept maar net niet zelf gaat zingen, en een filter-envelope met alleen Decay. Het karakter komt van twee gate-ingangen die bij het begin van elke noot gelezen worden. Acc (accent): de noot is luider, de filter-envelope kort en hij opent verder; een tweede, tragere schakeling telt opeenvolgende accenten bij elkaar op, zodat het filter bij een rij accenten per noot hoger klimt (de knop Accent bepaalt hoeveel). Slide: de toonhoogte glijdt in ongeveer 60 ms naar de volgende noot en de envelopes slaan niet opnieuw aan (gebonden noot); houd Slide hoog over de nootgrens heen. Het patroon maak je met de sequencer (V/Oct + Gate); hang Acc en Slide aan een tweede rij, Euclid, Turing of Branches en het wordt een acid-lijn die zichzelf varieert. Draai tijdens het spelen aan Cutoff, Reso en Env mod: dat is het instrument. Tune staat in halve tonen; een baslijn wil −12 of −24. Env is de filter-envelope als CV. Eigen model naar de topologie van het apparaat, op het oor; geen simulatie per onderdeel. Solo ▾ → Acid jam speelt een lijn. Firmware tp_mmb_acid, mmb_dsp::Acid; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB RUNGLER — 12 HP. Benjolin-stijl chaos (firmware tp_mmb_rungler).
function mmbRungler() {
  const w = W(12);
  const col = (i: number): number => w * (0.14 + i * 0.24);
  return assemble({
    typeId: 'tp_mmb_rungler', categoryId: 'vco',
    variant: 'Rungler (Benjolin-stijl chaos)',
    brand: 'MMB', model: 'RUNGLER',
    hp: 12, texture: 'pcb-black', baseColor: '#2a1f3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'RUNGLER', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'getrapte chaos · naar Rob Hordijk', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('freq_a', 'Freq A', col(0), 28, { size: 'medium', min: 0.5, max: 5000, def: 110, unit: 'Hz', color: '#a78bfa' }),
      knob('run_a', 'Run A', col(1), 28, { size: 'small', min: 0, max: 1, def: 0.4, color: '#e11d48' }),
      knob('run_b', 'Run B', col(2), 28, { size: 'small', min: 0, max: 1, def: 0.3, color: '#e11d48' }),
      knob('freq_b', 'Freq B', col(3), 28, { size: 'medium', min: 0.05, max: 2000, def: 3, unit: 'Hz', color: '#a78bfa' }),
      knob('cross_a', 'B→A', col(0), 52, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      toggle('loop', 'Loop', w/2, 52),
      knob('cross_b', 'A→B', col(3), 52, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('cutoff', 'Cutoff', col(0), 74, { size: 'medium', min: 20, max: 12000, def: 900, unit: 'Hz', color: '#38bdf8' }),
      knob('res', 'Res', col(1), 74, { size: 'small', min: 0, max: 1, def: 0.5, color: '#38bdf8' }),
      knob('sweep', 'Sweep', col(2), 74, { size: 'small', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('level', 'Level', col(3), 74, { size: 'small', min: 0, max: 1, def: 0.7, color: '#f9fafb' }),
      inPort('voct', 'V/Oct', 'cv', col(0), 94),
      inPort('rate_cv', 'Rate B', 'cv', col(1), 94),
      inPort('cutoff_cv', 'Cut+', 'cv', col(2), 94),
      outPort('tri_a', 'Tri A', 'audio', col(3), 94),
      outPort('rungler', 'Rung', 'cv', w*0.10, 114),
      outPort('tri_b', 'Tri B', 'cv', w*0.30, 114),
      outPort('pulse_b', 'Pls B', 'gate', w*0.50, 114),
      outPort('pwm', 'PWM', 'audio', w*0.70, 114),
      outPort('out', 'Out', 'audio', w*0.90, 114),
    ],
    notes: 'Chaotische stem naar de Benjolin van Rob Hordijk. Twee oscillatoren (A hoorbaar, B meestal traag) en daartussen de rungler: een schuifregister van acht bits dat door de puls van B geklokt wordt en de puls van A als data neemt. De laatste drie bits vormen een getrapte spanning van acht niveaus, en die spanning verstemt de oscillatoren die hem maken (Run A, Run B). Dat is een kring zonder begin: het gedrag loopt van vaste lussen via patronen die bijna herhalen tot ruis, afhankelijk van een paar knoppen. Hordijk noemde het getrapte chaos. Loop aan: het register voert alleen zijn eigen laatste bit terug en herhaalt (acht stappen); uit: nieuwe data van A komt erbij. B→A en A→B laten de driehoek van de een de ander verstemmen. Het geluid (Out) is een pulsgolf uit een vergelijker (driehoek A boven driehoek B) door een filter waarvan de cutoff met de rungler mee springt (Sweep); PWM is die pulsgolf zonder filter, Tri A de kale oscillator. Rung is de rungler zelf als CV (0..1): een getrapte modulator die bij de klank hoort, voor elders in de patch (via de Quantizer wordt het een melodie). Tri B en Pls B geven oscillator B als LFO en klok. V/Oct stemt A. Begin met Freq B rond 3 Hz en draai aan Run A. Niet bandbegrensd; dat hoort bij het instrument. Firmware tp_mmb_rungler, mmb_dsp::Rungler; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB ORGAN — 20 HP. Tonewheel-orgel met trekstangen (firmware tp_mmb_organ).
function mmbOrgan() {
  const w = W(20);
  const barX = (i: number): number => 9 + i * 7.6;            // negen trekstangen
  const colX = (i: number): number => 7 + i * 9.6;            // zes cel-kolommen, links
  const cells = Array.from({ length: 12 }, (_, i) => i + 1);
  const cellY = (k: number, gate: boolean) => (k <= 6 ? 90 : 110) + (gate ? 9 : 0);
  const bars: [string, string, number, string][] = [
    ['d16', "16'", 8, '#92400e'], ['d513', "5⅓'", 8, '#92400e'], ['d8', "8'", 8, '#f9fafb'],
    ['d4', "4'", 0, '#f9fafb'], ['d223', "2⅔'", 0, '#111827'], ['d2', "2'", 0, '#f9fafb'],
    ['d135', "1⅗'", 0, '#111827'], ['d113', "1⅓'", 0, '#111827'], ['d1', "1'", 0, '#f9fafb'],
  ];
  const rx = W(15);                                           // rechterkolom vanaf hier
  return assemble({
    typeId: 'tp_mmb_organ', categoryId: 'vco',
    variant: 'Organ (tonewheel, trekstangen)',
    brand: 'MMB', model: 'ORGAN',
    hp: 20, texture: 'wood', baseColor: '#5b3a1e', internal: true,
    role: 'multi',
    cellGroups: [{ id: 'voice', label: 'Toets', count: 12, portIds: ['voct', 'gate'], controlIds: [] }],
    texts: [
      { x: w/2, y: 8, text: 'ORGAN', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: '91 toonwielen · 9 trekstangen · 12 toetsen', fontSize: 1.1, color: '#e5e7eb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 85, text: 'V/Oct · Gate — toetsen 1–6', fontSize: 0.9, color: '#e5e7eb', align: 'start' },
      { x: 3, y: 105, text: 'toetsen 7–12', fontSize: 0.9, color: '#e5e7eb', align: 'start' },
    ],
    items: [
      ...bars.map(([id, label, def], i) =>
        slider(id, label, barX(i), 22, { min: 0, max: 8, def, lengthMm: 30 })),
      sw('perc', 'Perc', rx + 6, 26, ['Uit', '2e', '3e'], 0),
      toggle('perc_fast', 'Fast', rx + 19, 22, true),
      toggle('perc_soft', 'Soft', rx + 19, 34, false),
      sw('vib', 'Vib/Cho', rx + 6, 46, ['Uit', 'V1', 'V2', 'V3', 'C1', 'C2', 'C3'], 0),
      knob('click', 'Click', rx + 19, 50, { size: 'small', min: 0, max: 1, def: 0.4, color: '#f9fafb' }),
      knob('leak', 'Leak', rx + 6, 68, { size: 'small', min: 0, max: 1, def: 0.3, color: '#f9fafb' }),
      knob('level', 'Level', rx + 19, 68, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      ...cells.map((k) => inPort(`voct_${k}`, '', 'cv',   colX((k - 1) % 6), cellY(k, false), { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`, '', 'gate', colX((k - 1) % 6), cellY(k, true),  { cellGroupId: 'voice' })),
      inPort('swell', 'Swell', 'cv', rx + 6, 100),
      outPort('out', 'Out', 'audio', rx + 19, 100),
    ],
    notes: 'Tonewheel-orgel met trekstangen, gebouwd zoals de generator van een elektromechanisch orgel werkt en niet als negen sinussen per toets. Er draaien 91 toonwielen, altijd. Een toets maakt geen toon maar tapt negen wielen af (de voetmaten 16′, 5⅓′, 8′, 4′, 2⅔′, 2′, 1⅗′, 1⅓′, 1′) en de trekstangen (0..8, ongeveer 3 dB per stand) bepalen hoeveel van elk. Daar komt het karakter vandaan: twee toetsen die hetzelfde wiel aftappen krijgen dezelfde sinus in fase, dus het orgel zweeft niet met zichzelf; bovenin zijn de wielen op en vouwen de hoogste voetmaten een octaaf terug (foldback); en omdat de wielen doorlopen sluit een toets op een willekeurig punt van de golf: de key click (Click). Perc: percussie op de 2e of 3e harmonische, Fast of traag, Soft of normaal (normaal zet de trekstangen iets terug, zoals het origineel). Er is één percussie-envelope voor het hele klavier en hij slaat pas opnieuw aan als alle toetsen los zijn: legato spelen geeft alleen op de eerste noot een tik. Vib/Cho: scanner-vibrato V1..V3, of C1..C3 met het droge signaal erbij (het klassieke chorus). Leak laat wielen die in de kast naast elkaar zitten in elkaar lekken. Swell telt op bij Level: zet Level op 0 en een expressiepedaal (MIDI-IN CC) op Swell voor een zwelpedaal. Bekende registraties: 888000000 (jazz, met Perc 3e), 888888888 (vol), 838000000 (gospel-bas), 006876540 (fluitig). Twaalf toetsen tegelijk: Poly ▾ → Organ ×12 zet MIDI-in, het orgel en de ROTARY erachter klaar; de draaiende luidspreker en zijn buizenversterker horen erbij. De toonhoogte wordt op halve tonen afgerond. Firmware tp_mmb_organ, mmb_dsp::Tonewheel; in de simulator draait dezelfde code als wasm.',
  });
}

// ── Tweede ronde klassiekers (2026-10-02): SEM, complex-oscillator, wah,
// ensemble en elektrische piano. Zelfde recept als hierboven.

// MMB SEM — 8 HP. Tweepolig state-variable filter (firmware tp_mmb_sem).
function mmbSem() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_sem', categoryId: 'vcf',
    variant: 'SEM-filter (12 dB, LP→notch→HP)',
    brand: 'MMB', model: 'SEM',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2a3d', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'SEM', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: '12 dB · state variable', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('cutoff', 'Cutoff', w*0.30, 31, { size: 'large', min: 20, max: 18000, def: 1000, unit: 'Hz', color: '#38bdf8' }),
      knob('res', 'Res', w*0.78, 31, { size: 'medium', min: 0, max: 1, def: 0.3, color: '#38bdf8' }),
      knob('mode', 'Mode', w/2, 58, { size: 'medium', min: 0, max: 1, def: 0, color: '#f9fafb',
        ticks: { labels: { 0: 'LP', 0.5: 'notch', 1: 'HP' } } }),
      knob('drive', 'Drive', w*0.20, 80, { size: 'small', min: 0, max: 1, def: 0.2, color: '#ef4444' }),
      knob('cv_amt', 'CV amt', w*0.50, 80, { size: 'small', min: 0, max: 7, def: 4, unit: 'oct', color: '#f9fafb' }),
      knob('level', 'Level', w*0.80, 80, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('cutoff_cv', 'F CV', 'cv', w*0.28, 98),
      inPort('mode_cv', 'Mode+', 'cv', w*0.72, 98),
      inPort('in', 'In', 'audio', w*0.18, 116),
      outPort('out', 'Out', 'audio', w*0.50, 116),
      outPort('bp', 'BP', 'audio', w*0.82, 116),
    ],
    notes: 'Het tweepolige state-variable filter van de Oberheim SEM. Waar een ladder (Moog, ACID) steil is en bij resonantie het laag wegdrukt, is dit filter mild: 12 dB per octaaf, een resonantie die kleurt maar niet zelf gaat zingen, en het laag blijft staan. Het bijzondere is Mode: die loopt traploos van laagdoorlaat via een notch (laag en hoog samen, met een gat op de cutoff) naar hoogdoorlaat. Een LFO op Mode+ laat het filter van karakter veranderen in plaats van alleen open en dicht gaan. De bandpass heeft een eigen uitgang (BP): zet Out links en BP rechts voor een breed beeld. F CV is in octaven (±1 maal CV amt). Drive stuurt het filter harder aan; de verzadiging zit in het filter zelf. Solo ▾ → SEM sweep laat het horen. Firmware tp_mmb_sem, mmb_dsp::Sem; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB COMPLEX — 12 HP. Complex-oscillator naar de 259 (firmware tp_mmb_complex).
function mmbComplex() {
  const w = W(12);
  const col = (i: number): number => w * (0.14 + i * 0.24);
  return assemble({
    typeId: 'tp_mmb_complex', categoryId: 'vco',
    variant: 'Complex-oscillator (259-stijl)',
    brand: 'MMB', model: 'COMPLEX',
    hp: 12, texture: 'pcb-black', baseColor: '#3d2a1f', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'COMPLEX', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'modulatie → hoofdoscillator → timbre', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('ratio', 'Ratio', col(0), 28, { size: 'medium', min: 0.01, max: 16, def: 2, color: '#a78bfa' }),
      sw('mod_wave', 'Mod', col(1), 28, ['Sin', 'Tri', 'Saw'], 0),
      knob('pitch', 'Pitch', col(2), 28, { size: 'medium', min: -48, max: 48, def: 0, unit: 'semi', step: 1, color: '#f9fafb' }),
      knob('level', 'Level', col(3), 28, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('fm', 'FM', col(0), 54, { size: 'small', min: 0, max: 1, def: 0, color: '#e11d48' }),
      knob('am', 'AM', col(1), 54, { size: 'small', min: 0, max: 1, def: 0, color: '#e11d48' }),
      knob('tmod', 'T mod', col(2), 54, { size: 'small', min: 0, max: 1, def: 0, color: '#e11d48' }),
      knob('symmetry', 'Sym', col(3), 54, { size: 'small', min: -1, max: 1, def: 0, color: '#f9fafb' }),
      knob('timbre', 'Timbre', w/2, 80, { size: 'large', min: 0, max: 1, def: 0.3, color: '#fb923c' }),
      inPort('voct', 'V/Oct', 'cv', col(0), 104),
      inPort('fm_cv', 'FM+', 'cv', col(1), 104),
      inPort('timbre_cv', 'Tim+', 'cv', col(2), 104),
      outPort('mod', 'Mod', 'audio', col(2), 118),
      outPort('out', 'Out', 'audio', col(3), 118),
    ],
    notes: 'Complex-oscillator naar de Buchla 259: twee oscillatoren in één module. De modulatie-oscillator (frequentie = Ratio maal de grondtoon; hele getallen blijven harmonisch, daartussen wordt het klokachtig) bewerkt de hoofdoscillator op drie manieren, elk met een eigen index: FM (de toonhoogte, lineair en door nul heen), AM (hoe hard de sinus de vouwer in gaat) en T mod (hoe ver de vouwer open staat). De hoofdoscillator is een sinus die door het timbre-circuit gaat, de vijf vouwcellen van de 259: Timbre 0 is een zuivere sinus, verder open vouwt hij en komen er boventonen bij. Sym voegt even boventonen toe. Samen met een low-pass gate is dit de West Coast-stem: geen filter, de boventonen komen van FM en vouwen. Zet een envelope op Tim+ (helderder bij de aanslag) en een tweede op FM+. Mod is de modulatie-oscillator los. Vier keer overbemonsterd. Solo ▾ → Buchla-stem zet hem met Slope en LPG onder het klavier. Firmware tp_mmb_complex, mmb_dsp::ComplexOsc; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB WAH — 6 HP. Wah en klinkerfilter (firmware tp_mmb_wah).
function mmbWah() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_wah', categoryId: 'effect',
    variant: 'Wah (pedaal / auto / LFO, + klinkers)',
    brand: 'MMB', model: 'WAH',
    hp: 6, texture: 'pcb-black', baseColor: '#3d1f1f', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'WAH', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('pedal', 'Pedal', w/2, 27, { size: 'large', min: 0, max: 1, def: 0.3, color: '#fbbf24' }),
      sw('mode', 'Mode', w*0.28, 50, ['Pedal', 'Auto↑', 'Auto↓', 'LFO'], 0),
      sw('type', 'Type', w*0.72, 50, ['Wah', 'Vowel'], 0),
      knob('sens', 'Sens', w*0.28, 68, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('rate', 'Rate', w*0.72, 68, { size: 'small', min: 0.05, max: 12, def: 2, unit: 'Hz', color: '#f9fafb' }),
      knob('q', 'Q', w*0.18, 86, { size: 'small', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('mix', 'Mix', w*0.50, 86, { size: 'small', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      knob('level', 'Level', w*0.82, 86, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('in', 'In', 'audio', w*0.28, 103),
      inPort('pedal_cv', 'Ped+', 'cv', w*0.72, 103),
      outPort('env', 'Env', 'cv', w*0.28, 117),
      outPort('out', 'Out', 'audio', w*0.72, 117),
    ],
    notes: 'Wah: een smalle piek die door het midden van het spectrum schuift. Type Wah is het inductor-wahpedaal (Cry Baby-familie): de piek loopt van ongeveer 400 Hz (hak) naar 2,2 kHz (teen). Type Vowel zet er twee pieken neer die samen een klinker vormen en met het pedaal van OE via O, A en E naar IE lopen: een sprekend filter. Mode bepaalt wie het pedaal bedient. Pedal: de knop plus Ped+ (een expressiepedaal via MIDI-IN CC, een envelope of een LFO van buiten). Auto↑: een envelope-volger duwt het pedaal open, harder spelen is helderder (touch-wah, funk); Sens is de gevoeligheid en de knop Pedal de ruststand. Auto↓: andersom, harder spelen is doffer. LFO: een eigen sinus (Rate) tussen de knopstand en helemaal open. Q maakt de piek smaller en luider. Env is de envelope-volger als CV. Firmware tp_mmb_wah, mmb_dsp::Wah; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB ENSEMBLE — 6 HP. Driefasig chorus (firmware tp_mmb_ensemble).
function mmbEnsemble() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_ensemble', categoryId: 'effect',
    variant: 'Ensemble (string-machine-chorus)',
    brand: 'MMB', model: 'ENSEMBLE',
    hp: 6, texture: 'pcb-black', baseColor: '#1f3d36', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'ENSEMBLE', fontSize: 1.9, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'drie fasen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('depth', 'Depth', w/2, 30, { size: 'large', min: 0, max: 1, def: 0.7, color: '#2dd4bf' }),
      knob('slow', 'Slow', w*0.28, 56, { size: 'small', min: 0.1, max: 3, def: 0.6, unit: 'Hz', color: '#f9fafb' }),
      knob('fast', 'Fast', w*0.72, 56, { size: 'small', min: 2, max: 12, def: 6, unit: 'Hz', color: '#f9fafb' }),
      knob('tone', 'Tone', w*0.18, 76, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('mix', 'Mix', w*0.50, 76, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('level', 'Level', w*0.82, 76, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('depth_cv', 'D+', 'cv', w/2, 94),
      inPort('in_l', 'L', 'audio', w*0.14, 114),
      inPort('in_r', 'R', 'audio', w*0.38, 114),
      outPort('out_l', 'L', 'audio', w*0.62, 114),
      outPort('out_r', 'R', 'audio', w*0.86, 114),
    ],
    notes: 'Ensemble: het driefasige chorus van de string machines (Solina-familie). Een gewone chorus heeft één vertragingslijn met één LFO en je hoort de zweving op en neer gaan. Hier zijn het er drie, gemoduleerd door dezelfde twee LFO’s (Slow rond 0,6 Hz en Fast rond 6 Hz) maar steeds een derde slag verschoven. De drie fasen vullen elkaar altijd aan, dus er is geen moment waarop de modulatie stilvalt of omkeert: de klank wordt breed en dik zonder hoorbaar te golven. Een kale zaag wordt een strijkorkest; een orgel of elektrische piano krijgt ruimte. Depth is de diepte van beide LFO’s, Tone de bandbreedte van de emmertjesgeheugens (lager = doffer, ouder). Mono in geeft stereo uit (L en R worden gesommeerd). Firmware tp_mmb_ensemble, mmb_dsp::Ensemble; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB E-PIANO — 20 HP. Tine/reed voor een pickup (firmware tp_mmb_epiano).
function mmbEPiano() {
  const w = W(20);
  const colX = (i: number): number => 6.5 + i * 8.05;         // twaalf cel-kolommen
  const cells = Array.from({ length: 12 }, (_, i) => i + 1);
  return assemble({
    typeId: 'tp_mmb_epiano', categoryId: 'vco',
    variant: 'E-piano (tine / reed)',
    brand: 'MMB', model: 'E-PIANO',
    hp: 20, texture: 'pcb-black', baseColor: '#3a2a1a', internal: true,
    role: 'multi',
    cellGroups: [{ id: 'voice', label: 'Toets', count: 12, portIds: ['voct', 'gate', 'vel'], controlIds: [] }],
    texts: [
      { x: w/2, y: 8, text: 'E-PIANO', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'tine of reed voor een pickup · 12 toetsen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 82, text: 'V/Oct · Gate · Vel per toets', fontSize: 0.9, color: '#9ca3af', align: 'start' },
    ],
    items: [
      sw('type', 'Type', w*0.08, 30, ['Tine', 'Reed'], 0),
      knob('timbre', 'Timbre', w*0.24, 30, { size: 'large', min: 0, max: 1, def: 0.35, color: '#fbbf24' }),
      knob('bell', 'Bell', w*0.42, 30, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('decay', 'Decay', w*0.58, 30, { size: 'medium', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('drive', 'Drive', w*0.74, 30, { size: 'medium', min: 0, max: 1, def: 0.4, color: '#ef4444' }),
      knob('level', 'Level', w*0.90, 30, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('tremolo', 'Tremolo', w*0.24, 58, { size: 'small', min: 0, max: 1, def: 0.3, color: '#2dd4bf' }),
      knob('trem_rate', 'Rate', w*0.42, 58, { size: 'small', min: 0.5, max: 12, def: 4.5, unit: 'Hz', color: '#2dd4bf' }),
      knob('damper', 'Damper', w*0.58, 58, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      inPort('sustain', 'Sust', 'gate', w*0.08, 58),
      outPort('out_l', 'L', 'audio', w*0.76, 58),
      outPort('out_r', 'R', 'audio', w*0.90, 58),
      ...cells.map((k) => inPort(`voct_${k}`, '', 'cv',   colX(k - 1), 88,  { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`, '', 'gate', colX(k - 1), 100, { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`vel_${k}`,  `${k}`, 'cv', colX(k - 1), 112, { cellGroupId: 'voice' })),
    ],
    notes: 'Elektrische piano als model, zonder samples. De klank zit maar voor de helft in wat er trilt; de andere helft is hoe de pickup dat ziet, en die twee zijn hier apart gebouwd. Wat trilt: per toets een grondtoon die traag uitsterft en een hoge, niet-harmonische boventoon die snel wegsterft (Bell): de tik in de aanslag. Harder aanslaan geeft meer uitwijking en verhoudingsgewijs meer bel. Type Tine (Rhodes-familie): een magnetische pickup. Timbre is de plek van de tine voor de pickup, de stelschroef waarmee een technicus het instrument afregelt. Recht ervoor (0) passeert de tine het midden twee keer per trilling en klinkt vooral het octaaf: dun en glazig. Ernaast (hoger) komt de grondtoon terug: vol en rond. Drive is hoe dicht de tine bij de pickup staat: verder open gaat hij bij hard spelen blaffen. Type Reed (Wurlitzer-familie): een stalen tong voor een condensatorplaat; holler, nasaler, en de noot sterft sneller uit. Decay is de uitklinktijd (hoge noten korter, zoals het instrument). Tremolo is het heen-en-weer tussen links en rechts van het koffermodel. Damper is hoe snel de vilten demper een losgelaten toets stilt (0 = geen dempers: alles klinkt vrij uit; 1 = in ~15 ms); de bel wordt mee gedempt. Sust is het sustainpedaal (gate, bijvoorbeeld MIDI-IN CC2# = 64): zolang het hoog is klinken losgelaten toetsen vrij uit, en bij loslaten vallen de dempers op alle toetsen die niet meer ingedrukt zijn. Velocity doet veel: zonder kabel op Vel krijgt elke noot een gemiddelde aanslag. Twaalf toetsen tegelijk: Poly ▾ → E-piano ×12. Zet er de ENSEMBLE, de PHASER of de TREMOLO achter. Eigen model op meting, geen kopie van een bepaald exemplaar. Firmware tp_mmb_epiano, mmb_dsp::EPiano; in de simulator draait dezelfde code als wasm.',
  });
}

// ── Testbediening (2026-10-02): drukknoppen, schuiven, draaiknoppen ──
// Om in de browser snel een gate- of CV-ingang te proberen.

// MMB PADS — 8 HP. Vier grote drukknoppen (firmware tp_mmb_pads).
function mmbPads() {
  const w = W(8);
  const px = (i: number): number => (i % 2 === 0 ? w * 0.28 : w * 0.72);
  const py = (i: number): number => (i < 2 ? 30 : 58);
  return assemble({
    typeId: 'tp_mmb_pads', categoryId: 'utility',
    variant: 'Pads (4 drukknoppen: gate + trigger)',
    brand: 'MMB', model: 'PADS',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2937', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'PADS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'drukken = gate', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      ...[0, 1, 2, 3].map((i) => button(`b${i+1}`, `${i+1}`, px(i), py(i), 'large')),
      ...[0, 1, 2, 3].map((i) => toggle(`latch${i+1}`, 'Latch', w * (0.14 + i * 0.24), 76)),
      ...[0, 1, 2, 3].map((i) => outPort(`gate_${i+1}`, `G${i+1}`, 'gate', w * (0.14 + i * 0.24), 94)),
      ...[0, 1, 2, 3].map((i) => outPort(`trig_${i+1}`, `T${i+1}`, 'gate', w * (0.14 + i * 0.24), 108)),
      outPort('any', 'Any', 'gate', w/2, 120),
    ],
    notes: 'Vier grote drukknoppen om een gate- of CV-ingang met de muis (of een vinger) te proberen: de Fast-ingang van de ROTARY, de Ping van de LPG, Accent en Slide van ACID, een Reset of een envelope. G1..G4 is hoog zolang je de knop indrukt (een vlugge klik duurt minstens 100 ms); T1..T4 geeft bij elke druk een puls van 10 ms. Latch aan: de gate wisselt bij elke druk (aan, uit), voor een schakelaar die blijft staan. Any is hoog als een van de vier gates hoog is. Op de Teensy komen de knoppen via de editor (live control) binnen. Firmware tp_mmb_pads; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB FADERS — 8 HP. Vier schuiven als CV-bron (firmware tp_mmb_faders).
function mmbFaders() {
  const w = W(8);
  const col = (i: number): number => w * (0.14 + i * 0.24);
  return assemble({
    typeId: 'tp_mmb_faders', categoryId: 'utility',
    variant: 'Faders (4 schuiven als CV)',
    brand: 'MMB', model: 'FADERS',
    hp: 8, texture: 'pcb-black', baseColor: '#1f2937', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'FADERS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'handbediende CV', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      ...[0, 1, 2, 3].map((i) => slider(`v${i+1}`, `${i+1}`, col(i), 44, { min: 0, max: 1, def: 0, lengthMm: 44 })),
      sw('range', 'Range', w*0.28, 82, ['×1', '×2', '×5'], 0),
      knob('slew', 'Slew', w*0.72, 84, { size: 'small', min: 0, max: 2000, def: 10, unit: 'ms', color: '#f9fafb' }),
      ...[0, 1, 2, 3].map((i) => outPort(`out_${i+1}`, `${i+1}`, 'cv', col(i), 112)),
    ],
    notes: 'Vier schuiven, elk een CV-uitgang van 0 tot 1: om een CV-ingang met de hand te proberen (de cutoff van een filter, Fold van de FOLDER, Pedal van de WAH, Mode van het SEM-filter). Range vermenigvuldigt: ×1, ×2 of ×5 (×5 op een V/Oct-ingang is vijf octaven per volle slag). Slew strijkt een sprong glad, zodat een vlugge schuif geen tik geeft; zet hem hoog voor trage overgangen. Op de Teensy komen de schuiven via de editor (live control) binnen. Firmware tp_mmb_faders; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB KNOBS — 6 HP. Vier draaiknoppen als bipolaire CV (firmware tp_mmb_knobs).
function mmbKnobs() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_knobs', categoryId: 'utility',
    variant: 'Knobs (4 draaiknoppen als CV, ±)',
    brand: 'MMB', model: 'KNOBS',
    hp: 6, texture: 'pcb-black', baseColor: '#1f2937', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'KNOBS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'midden = 0', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      ...[0, 1, 2, 3].map((i) => knob(`v${i+1}`, `${i+1}`, i % 2 === 0 ? w*0.28 : w*0.72, i < 2 ? 28 : 52,
        { size: 'large', min: -1, max: 1, def: 0, color: '#f9fafb', ticks: { labels: { [-1]: '−', 0: '0', 1: '+' } } })),
      sw('range', 'Range', w*0.28, 76, ['×1', '×2', '×5'], 0),
      knob('slew', 'Slew', w*0.72, 78, { size: 'small', min: 0, max: 2000, def: 10, unit: 'ms', color: '#f9fafb' }),
      ...[0, 1, 2, 3].map((i) => outPort(`out_${i+1}`, `${i+1}`, 'cv', i % 2 === 0 ? w*0.28 : w*0.72, i < 2 ? 98 : 114)),
    ],
    notes: 'Vier draaiknoppen, elk een bipolaire CV-uitgang van −1 tot 1 (midden = 0): voor ingangen die een plus en een min kennen, zoals Shift van de FREQ SHIFT, Sym van de FOLDER, F CV van een filter of een V/Oct-ingang (Range ×5 = vijf octaven elke kant op). Slew strijkt sprongen glad. Op de Teensy komen de knoppen via de editor (live control) binnen. Firmware tp_mmb_knobs; in de simulator draait dezelfde klasse als wasm.',
  });
}

// MMB RHYTHM — 16 HP. Ritmebox met de CR-78-presets (firmware tp_mmb_rhythm).
/** Volgorde gelijk aan kCr78Patterns in firmware/lib/mmb-dsp/mmb_dsp/rhythm_box.h. */
export const RHYTHM_NAMES = ['Rock 1', 'Rock 2', 'Rock 3', 'Rock 4', 'Disco 1', 'Disco 2', 'Waltz', 'Shuffle',
  'Slow rock', 'Swing', 'Foxtrot', 'Tango', 'Boogie', 'Enka', 'Bossa nova'];
function mmbRhythm() {
  const w = W(16);
  const col = (i: number): number => w * (0.10 + i * 0.16);
  return assemble({
    typeId: 'tp_mmb_rhythm', categoryId: 'drum',
    variant: 'Rhythm box (CR-78-presets)',
    brand: 'MMB', model: 'RHYTHM',
    hp: 16, texture: 'wood', baseColor: '#4a3220', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'RHYTHM', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'ritmebox · presets naar de CR-78', fontSize: 1.1, color: '#e5e7eb', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      display('rhythmName', w*0.36, 24, { digits: 10, style: 'led-green', bindTo: 'rhythm', lookup: [RHYTHM_NAMES], text: 'Rock 1', size: 'medium' }),
      knob('rhythm', 'Rhythm', w*0.80, 26, { size: 'medium', min: 0, max: RHYTHM_NAMES.length - 1, def: 0, step: 1, color: '#fbbf24' }),
      sw('variation', 'Variation', w*0.14, 48, ['A', 'B', 'A+B'], 2),
      knob('tempo', 'Tempo', w*0.42, 48, { size: 'large', min: 30, max: 300, def: 120, unit: 'bpm', color: '#f9fafb' }),
      toggle('run', 'Run', w*0.68, 46, true),
      toggle('extclock', 'ExtClk', w*0.88, 46),
      knob('accent', 'Accent', col(0), 72, { size: 'small', min: 0, max: 1, def: 0.6, color: '#ef4444' }),
      knob('bass', 'Bass', col(1), 72, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('snare', 'Snare', col(2), 72, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      knob('metal', 'Metal', col(3), 72, { size: 'small', min: 0, max: 1, def: 0.7, color: '#f9fafb' }),
      knob('perc', 'Perc', col(4), 72, { size: 'small', min: 0, max: 1, def: 0.7, color: '#f9fafb' }),
      knob('level', 'Level', col(5), 72, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      inPort('start', 'Start', 'gate', col(0), 96),
      inPort('clock', 'Clk', 'gate', col(1), 96),
      inPort('reset', 'Rst', 'gate', col(2), 96),
      outPort('step', 'Step', 'gate', col(3), 96),
      outPort('bar', 'Bar', 'gate', col(4), 96),
      outPort('acc', 'Acc', 'gate', col(5), 96),
      outPort('out_l', 'L', 'audio', w*0.62, 114),
      outPort('out_r', 'R', 'audio', w*0.84, 114),
    ],
    notes: 'Ritmebox met de presets van de Roland CR-78, gespeeld op dezelfde berekende CR-78-stemmen als de CR-78-module (basdrum, lage conga, lage en hoge bongo, snare, rimshot, claves, koebel, maracas, hihat, cymbal). De patronen zijn met de hand overgenomen uit het notenschrift in de CR-78 Service Notes (20 juni 1979): Rock 1–4, Disco 1–2, Waltz, Shuffle, Slow rock, Swing, Foxtrot, Tango, Boogie, Enka en Bossa nova, elk met een A- en een B-maat (Foxtrot en Tango zitten op het origineel samen op één knop: A en B). Rock 4 en de Disco-patronen zijn onzeker overgenomen; Samba, Mambo, Cha-cha, Beguine en Rhumba ontbreken nog, want die zijn in de scan niet betrouwbaar te lezen. Variation: A, B, of A+B om en om. Run start en stopt; een puls op Start wisselt ook (een voetschakelaar via PADS). Tempo is in tellen per minuut; ExtClk aan laat hem een externe tel volgen (bijvoorbeeld CLOCK Beat): de box meet de afstand tussen de tellen en verdeelt de stappen erover, ook triolen. Rst gaat terug naar het begin van maat A. Accent is hoe hard de geaccentueerde stappen eruit springen; Bass, Snare, Metal (hihat, cymbal, maracas) en Perc (bongo, conga, claves, koebel, rimshot) zijn de groepsvolumes. Step, Bar en Acc geven een puls per stap, op de één en op elk accent: synchroniseer er een sequencer of een envelope mee. Firmware tp_mmb_rhythm, mmb_dsp::RhythmBox; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB PERCUTER — 24 HP. Acht 8-bit drumkanalen (firmware tp_mmb_percuter).
function mmbPercuter() {
  const w = W(24);
  const col = (k: number): number => 8 + k * 14.4;                // acht kanaalkolommen
  const ch = Array.from({ length: 8 }, (_, k) => k + 1);
  return assemble({
    typeId: 'tp_mmb_percuter', categoryId: 'drum',
    variant: 'Percuter (8 kanalen, 8-bit cartridges)',
    brand: 'MMB', model: 'PERCUTER',
    hp: 24, texture: 'pcb-black', baseColor: '#2b2b2b', internal: true,
    texts: [
      { x: w/2, y: 8, text: 'PERCUTER', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: '8 track digital drum computer · 8-bit cartridges', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('bank', 'Bank', w*0.10, 25, { size: 'medium', min: 0, max: 15, def: 0, step: 1, color: '#f5a623', ticks: { every: 1, highlight: [0, 15] } }),
      knob('tune', 'Tune', w*0.72, 25, { size: 'small', min: -12, max: 12, def: 0, unit: 'semi', color: '#f9fafb' }),
      toggle('filter', 'Filter', w*0.84, 23, true),
      knob('level', 'Level', w*0.94, 25, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      ...ch.flatMap((k) => [
        knob(`level_${k}`, `${k}`, col(k - 1), 42, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
        knob(`pan_${k}`, 'Pan', col(k - 1), 55, { size: 'small', min: -1, max: 1, def: 0, color: '#9ca3af' }),
        knob(`decay_${k}`, 'Dec', col(k - 1), 68, { size: 'small', min: 0, max: 1, def: 1, color: '#9ca3af' }),
        knob(`tune_${k}`, 'Tune', col(k - 1), 81, { size: 'small', min: -12, max: 12, def: 0, unit: 'semi', color: '#9ca3af' }),
        inPort(`trig_${k}`, 'Trig', 'gate', col(k - 1), 95),
        inPort(`vel_${k}`, 'Vel', 'cv', col(k - 1), 106),
        outPort(`out_${k}`, 'Out', 'audio', col(k - 1), 117),
      ]),
      inPort('pitch', 'Pitch', 'cv', w*0.30, 25),
      outPort('out_l', 'L', 'audio', w*0.44, 25),
      outPort('out_r', 'R', 'audio', w*0.56, 25),
    ],
    notes: 'Acht digitale drumkanalen naar de Dynacord Percuter (1984). Op het apparaat zit in elk kanaal een cartridge: een EPROM van 8 of 16 KB met kale 8-bit geluid, afgespeeld op 12,5 of 25 kHz. Het lo-fi-karakter komt van hoe hij afspeelt, en dat doet deze module ook: zonder interpolatie (je hoort de spiegeltonen boven de halve samplefrequentie), op 8 bit, en de toonhoogte is de afspeelklok, dus hoger gestemd is ook korter. Filter aan dempt de spiegeltonen zoals de de-emphasis van de cartridge; uit is rauw. Kanaal k speelt slot k van de samplebank die Bank kiest: dezelfde banken als de SAMPLER (/mmb/banks/NN.mmbs op de Teensy, de bankbalk in de simulator). Een bank maak je van cartridge-dumps met tools/mmb-wasm/percuter-to-mmbs.mjs: één .bin per kanaal, met per cartridge zijn eigen samplefrequentie. Per kanaal: Trig (gate), Vel (aanslag 0..1; zonder kabel volle sterkte), volume, Pan, Dec (1 = het hele sample, lager = korter) en Tune, en een eigen uitgang zonder volume en pan, zoals de losse uitgangen op het apparaat. Pitch is het pitchpedaal (V/Oct, op alle kanalen), Tune de globale stemming. Op de Teensy deelt hij de bank met de sampler en de tape strip: één bank tegelijk. Firmware tp_mmb_percuter, mmb_dsp::Percuter; in de simulator draait dezelfde code als wasm.',
  });
}

// MMB SYNTHEX — 28 HP. Polyfone stem naar de Elka Synthex (firmware tp_mmb_synthex).
function mmbSynthex() {
  const w = W(28);
  const col = (i: number): number => 9 + i * 17.2;
  const cells = Array.from({ length: 8 }, (_, i) => i + 1);
  return assemble({
    typeId: 'tp_mmb_synthex', categoryId: 'vco',
    variant: 'Synthex (8 stemmen, naar de Elka Synthex)',
    brand: 'MMB', model: 'SYNTHEX',
    hp: 28, texture: 'pcb-black', baseColor: '#1c1c22', internal: true,
    role: 'multi',
    cellGroups: [{ id: 'voice', label: 'Stem', count: 8, portIds: ['voct', 'gate'], controlIds: [] }],
    texts: [
      { x: w/2, y: 8, text: 'SYNTHEX', fontSize: 2.6, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13, text: 'OSC 1 · OSC 2 · MIX · FILTER · ENV F · ENV A · LFO · MASTER', fontSize: 1.0, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
      { x: 3, y: 99, text: 'V/Oct · Gate per stem', fontSize: 0.9, color: '#9ca3af', align: 'start' },
    ],
    items: [
      sw('o1_oct', 'Feet', col(0), 24, ["16'", "8'", "4'", "2'"], 2),
      sw('o1_wave', 'Wave', col(0), 42, ['Ramp', 'Sqr', 'Pulse'], 0),
      knob('o1_level', 'Volume', col(0), 60, { size: 'medium', min: 0, max: 10, def: 10, color: '#f9fafb' }),
      sw('o2_oct', 'Feet', col(1), 24, ["16'", "8'", "4'", "2'"], 2),
      knob('o2_transpose', 'Transp', col(1), 78, { size: 'small', min: -12, max: 12, def: 0, unit: 'semi', color: '#f9fafb' }),
      knob('o2_detune', 'Detune', col(2), 78, { size: 'small', min: -50, max: 50, def: 6, unit: 'ct', color: '#f9fafb' }),
      sw('o2_wave', 'Wave', col(1), 42, ['Ramp', 'Sqr', 'Pulse'], 0),
      knob('o2_level', 'Volume', col(1), 60, { size: 'medium', min: 0, max: 10, def: 8, color: '#f9fafb' }),
      toggle('sync', 'Sync', col(2), 24, false),
      toggle('ring', 'Ring', col(2), 36, false),
      knob('pw', 'PW', col(0), 78, { size: 'small', min: 0.05, max: 0.5, def: 0.3, color: '#f9fafb' }),
      knob('noise', 'Noise', col(2), 60, { size: 'small', min: 0, max: 10, def: 0, color: '#f9fafb' }),
      knob('freq', 'Freq', col(3), 24, { size: 'medium', min: 0, max: 10, def: 6, color: '#f9fafb' }),
      knob('res', 'Reso', col(3), 42, { size: 'medium', min: 0, max: 10, def: 2, color: '#f9fafb' }),
      knob('env_amt', 'Env', col(3), 60, { size: 'small', min: 0, max: 10, def: 4, color: '#f9fafb' }),
      knob('kbd', 'Kbd', col(3), 78, { size: 'small', min: 0, max: 10, def: 3, color: '#f9fafb' }),
      sw('mode', 'Mode', col(4), 24, ['LP', 'BP', 'HP'], 0),
      knob('fa', 'A', col(4), 42, { size: 'small', min: 0, max: 10, def: 0.5, color: '#f9fafb' }),
      knob('fd', 'D', col(4), 54, { size: 'small', min: 0, max: 10, def: 5, color: '#f9fafb' }),
      knob('fs', 'S', col(4), 66, { size: 'small', min: 0, max: 10, def: 6, color: '#f9fafb' }),
      knob('fr', 'R', col(4), 78, { size: 'small', min: 0, max: 10, def: 4, color: '#f9fafb' }),
      knob('aa', 'A', col(5), 42, { size: 'small', min: 0, max: 10, def: 0.5, color: '#f9fafb' }),
      knob('ad', 'D', col(5), 54, { size: 'small', min: 0, max: 10, def: 5, color: '#f9fafb' }),
      knob('as', 'S', col(5), 66, { size: 'small', min: 0, max: 10, def: 8, color: '#f9fafb' }),
      knob('ar', 'R', col(5), 78, { size: 'small', min: 0, max: 10, def: 4, color: '#f9fafb' }),
      knob('lfo_rate', 'Rate', col(6), 24, { size: 'small', min: 0.05, max: 20, def: 5, unit: 'Hz', color: '#f9fafb' }),
      sw('lfo_wave', 'Wave', col(6), 42, ['Tri', 'Sqr', 'Saw', 'S&H'], 0),
      knob('lfo_osc', '→Osc', col(6), 56, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('lfo_pw', '→PW', col(6), 66, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('lfo_vcf', '→VCF', col(6), 76, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('lfo_vca', '→VCA', col(6), 86, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('glide', 'Glide', col(5), 24, { size: 'small', min: 0, max: 1, def: 0, color: '#f9fafb' }),
      knob('tune', 'Tune', col(7), 24, { size: 'small', min: -12, max: 12, def: 0, unit: 'semi', color: '#f9fafb' }),
      toggle('chorus', 'Chorus', col(7), 42, true),
      knob('level', 'Level', col(7), 58, { size: 'small', min: 0, max: 1, def: 0.8, color: '#f9fafb' }),
      ...cells.map((k) => inPort(`voct_${k}`, '', 'cv', 7 + (k - 1) * 12, 104, { cellGroupId: 'voice' })),
      ...cells.map((k) => inPort(`gate_${k}`, '', 'gate', 7 + (k - 1) * 12, 115, { cellGroupId: 'voice' })),
      inPort('bend', 'Joy X', 'cv', col(7), 78),
      inPort('joy', 'Joy Y', 'cv', col(7), 90),
      outPort('out_l', 'L', 'audio', col(7) - 6, 110),
      outPort('out_r', 'R', 'audio', col(7) + 6, 110),
    ],
    notes: 'Polyfone stem naar de Elka Synthex (1981, ontwerp Mario Maggi), gebouwd naar het schema. Per stem twee oscillatoren; op het apparaat zijn die digitaal (tellers op 4 MHz), daarom stabiel. Golfvorm Ramp, Sqr of Pulse (met PW), voetmaat 16′ tot 2′; oscillator 2 heeft Transpose en Detune, Sync zet hem vast aan oscillator 1, Ring vervangt hem door het product van beide. De menger telt in 16 stappen, zoals de 4-bit volumes van het origineel, en heeft ruis. Het filter is het vierpolige OTA-filter van de Synthex: Mode kiest LP (24 dB), BP of HP, met Freq, Reso (tot net onder zingen), Env (de filter-envelope) en Kbd (toetsvolging). ENV F en ENV A zijn ADSR\u2019s in knopstanden 0..10 (2 ms tot 10 s). De LFO stuurt de oscillatoren, PW, het filter en het volume; Glide, Tune, de stereochorus en Level zitten bij MASTER. Joy X buigt de toonhoogte (V/Oct), Joy Y stuurt het filter, zoals de joystick. Acht stemmen tegelijk: Poly ▾ → Synthex ×8. Eigen model naar de topologie, geen simulatie per onderdeel. Firmware tp_mmb_synthex, mmb_dsp::Synthex; in de simulator draait dezelfde code als wasm.',
  });
}

// 24. MMB CHORD — 6 HP. Chord-generator (firmware tp_mmb_chord, FW-CV-5):
//     1 V/Oct in → 4 gestemde CV-uitgangen. Voedt Octa-VCO / 4 VCO's /
//     de resonator-bank; achter de quantizer blijft alles in de toonsoort.
function mmbChord() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_chord',
    categoryId: 'utility',
    variant: 'Chord (4 stemmen)',
    brand: 'MMB', model: 'CHORD',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'CHORD', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: '1 in · 4 stemmen', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      sw  ('chord', 'Chord', w/2, 26, ['Maj','Min','Maj7','Min7','Dom7','Sus2','Sus4','Dim7','Aug','5th'], 0),
      knob('inv',    'Inv',    w*0.30, 58, { size: 'medium', min: 0, max: 3, def: 0, step: 1, color: '#e11d48' }),
      knob('spread', 'Spread', w*0.70, 58, { size: 'medium', min: 0, max: 1, def: 0, color: '#0891b2' }),

      inPort ('voct', 'V/Oct', 'cv', w/2,    92),
      outPort('out1', '1', 'cv', w*0.20, 112),
      outPort('out2', '2', 'cv', w*0.40, 112),
      outPort('out3', '3', 'cv', w*0.60, 112),
      outPort('out4', '4', 'cv', w*0.80, 112),
    ],
    notes: 'Chord-generator (firmware tp_mmb_chord, FW-CV-5): zet vier akkoordstemmen rond de V/Oct-ingang. Inv is de klassieke inversie (laagste stemmen een octaaf omhoog), Spread opent de voicing trapsgewijs in octaven (blijft dus akkoordeigen). Stuur out1..4 naar vier VCO-cellen (Octa-VCO), vier DX7\'s of de resonator-bank. Achter de quantizer (tp_mmb_quant) blijft de grondtoon in de toonsoort.',
  });
}

// 25. MMB REVERB — 8 HP. Elements' Dattorro-reverb als losse stereo-module
//     (firmware tp_mmb_elements_reverb, FW-FX-3). Bestond al in de firmware
//     maar had geen editor-paneel (code-review 2026-07-05, punt 3/9).
function mmbElementsReverb() {
  const w = W(8);
  return assemble({
    typeId: 'tp_mmb_elements_reverb',
    categoryId: 'effect',
    variant: 'Reverb (Dattorro)',
    brand: 'MI', model: 'REVERB',
    hp: 8, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'REVERB', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'Dattorro · stereo', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MI', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('amount', 'Amount', w*0.28, 34, { size: 'large', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('time',   'Time',   w*0.72, 34, { size: 'large', min: 0, max: 1, def: 0.5, color: '#f9fafb' }),
      knob('diffusion', 'Diff', w*0.28, 66, { size: 'small', min: 0, max: 1, def: 0.625, color: '#f9fafb' }),
      knob('lp',        'Damp', w*0.72, 66, { size: 'small', min: 0, max: 1, def: 0.7, color: '#0891b2' }),

      inPort ('in_l',  'In L',  'audio', w*0.25, 96),
      inPort ('in_r',  'In R',  'audio', w*0.75, 96),
      outPort('out_l', 'Out L', 'audio', w*0.25, 114),
      outPort('out_r', 'Out R', 'audio', w*0.75, 114),
    ],
    notes: 'Mutable Instruments Elements\' Dattorro-plate-reverb als losse stereo-module (firmware tp_mmb_elements_reverb, FW-FX-3). Amount = dry/wet, Time = staartlengte, Diff = diffusie (echodichtheid), Damp = lowpass in de staart (laag = donkerder). Mono-bron: alleen In L aansluiten werkt (de plate spreidt naar stereo). 64 KB delaybuffer op de heap; draait native op 44.1 kHz.',
  });
}

// 26. MMB GRIDS — 10 HP. Topologische drum-sequencer (firmware tp_mmb_grids,
//     FW-SQ-2). Eigen patroondata (upstream Grids is GPL); zelfde spelidee:
//     X/Y-kaart, density per stem, accenten, chaos.
function mmbGrids() {
  const w = W(10);
  const col = (i: number): number => w * (0.14 + i * 0.24);
  return assemble({
    typeId: 'tp_mmb_grids',
    categoryId: 'sequencer',
    variant: 'Grids (drum-kaart)',
    brand: 'MMB', model: 'GRIDS',
    hp: 10, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'GRIDS', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'drum-kaart · X/Y', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('x',     'X',     w*0.28, 30, { size: 'large', min: 0, max: 1, def: 0.5, color: '#e11d48' }),
      knob('y',     'Y',     w*0.72, 30, { size: 'large', min: 0, max: 1, def: 0.5, color: '#0891b2' }),
      knob('bd',    'BD',    w*0.18, 60, { size: 'small', min: 0, max: 1, def: 0.75, color: '#f9fafb' }),
      knob('sd',    'SD',    w*0.42, 60, { size: 'small', min: 0, max: 1, def: 0.6, color: '#f9fafb' }),
      knob('hh',    'HH',    w*0.66, 60, { size: 'small', min: 0, max: 1, def: 0.7, color: '#f9fafb' }),
      knob('chaos', 'Chaos', w*0.88, 60, { size: 'small', min: 0, max: 1, def: 0, color: '#e11d48' }),
      knob('tempo', 'Tempo', w*0.30, 84, { size: 'medium', min: 20, max: 300, def: 120, unit: 'bpm', color: '#f9fafb' }),
      toggle('extclock', 'ExtClk', w*0.75, 84),

      inPort ('clock', 'Clk', 'gate', w*0.14, 102),
      inPort ('reset', 'Rst', 'gate', w*0.38, 102),
      inPort ('x_cv',  'X+',  'cv',   w*0.62, 102),
      inPort ('y_cv',  'Y+',  'cv',   w*0.86, 102),
      outPort('bd',  'BD',  'gate', col(0), 118),
      outPort('sd',  'SD',  'gate', col(1), 118),
      outPort('hh',  'HH',  'gate', col(2), 118),
      outPort('acc', 'Acc', 'gate', col(3), 118),
    ],
    notes: 'Topologische drum-sequencer (firmware tp_mmb_grids, FW-SQ-2), geïnspireerd op MI Grids maar met eigen patroondata (upstream is GPL-3.0). X morpht basis→druk, Y mengt syncopatie erin; elke plek op de kaart heeft eigen karakter (value-noise op een 5×5-rooster). BD/SD/HH zijn density-drempels per stem; hits met hoge prioriteit krijgen Acc (accent) — stuur die naar de accent-CV van de CR-78. Chaos randomiseert per patroonronde. 32 stappen (2 maten zestienden), interne klok (Tempo) of ExtClk + Clk-jack. Reset springt naar stap 0.',
  });
}

// 12d. MMB ENV-FOLLOWER — 16 HP. Acht envelope-follower-cellen met gedeelde
//     tijden/drempel (FW-CV-6). Audio erin, CV eruit: zet de sampler op in_1
//     en env_1 op de cutoff-CV van een filter en het filter ademt mee.
function mmbEnvFollower() {
  const w = W(16);
  const colX = (i: number) => w * (0.08 + i * 0.119);
  return assemble({
    typeId: 'tp_mmb_env_follower',
    categoryId: 'envelope',
    variant: 'Envelope follower (8 cellen)',
    brand: 'MMB', model: 'ENV-FOLLOW-8',
    hp: 16, texture: 'pcb-black', baseColor: '#111827', internal: true,
    role: 'multi',
    cellGroups: [{
      id: 'follow',
      label: 'Follower',
      count: 8,
      portIds: ['in', 'env', 'gate'],
      controlIds: [],
    }],
    texts: [
      { x: w/2, y: 8,   text: 'ENV-FOLLOW-8', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'audio \u2192 cv \u00b7 8 cellen', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB', fontSize: 1.8, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      // Lineaire ms-schalen: de editor kent (nog) geen log-taper, dus de
      // bereiken blijven zo dat de hele draai bruikbaar is.
      knob('attack',  'Attack',  w*0.20, 34, { size: 'medium', min: 0.1, max: 100,  def: 5,    unit: 'ms', color: '#f9fafb' }),
      knob('release', 'Release', w*0.42, 34, { size: 'medium', min: 5,   max: 1000, def: 150,  unit: 'ms', color: '#f9fafb' }),
      knob('sens',    'Sens',    w*0.64, 34, { size: 'medium', min: -12, max: 36,   def: 0,    unit: 'dB', color: '#0891b2' }),
      knob('thresh',  'Thresh',  w*0.86, 34, { size: 'medium', min: 0,   max: 1,    def: 0.10,             color: '#e11d48' }),
      sw('mode', 'Mode', w/2, 60, ['Peak', 'RMS'], 1),

      ...Array.from({ length: 8 }, (_, i) =>
        inPort(`in_${i+1}`, 'In', 'audio', colX(i), 84, { cellGroupId: 'follow' })),
      ...Array.from({ length: 8 }, (_, i) =>
        outPort(`env_${i+1}`, 'Env', 'cv', colX(i), 101, { cellGroupId: 'follow' })),
      ...Array.from({ length: 8 }, (_, i) =>
        outPort(`gate_${i+1}`, 'Gate', 'gate', colX(i), 118, { cellGroupId: 'follow' })),
    ],
    notes: 'Multi-module met 8 identieke envelope-follower-cellen: per cel een audio-in, de gevolgde envelope als CV (0..1) en een gate zodra die boven Thresh komt. Attack/Release zijn tijdconstanten van de detector; Sens is de gevoeligheid in dB; Mode kiest tussen piek (scherp, reageert op transi\u00ebnten) en RMS (rustiger, volgt het gemiddelde vermogen). De gate heeft 25 % hysterese zodat een uitstervende staart niet klappert. Typisch: sampler \u2192 in_1, env_1 \u2192 cutoff-CV van een VCF. Detectie loopt op audiotempo, niet op de CV-tick, zodat een aanslag van 2 ms niet wordt gemist. Firmware: tp_mmb_env_follower (FW-CV-6), gedeelde DSP mmb_dsp::EnvFollower \u2014 in de simulator draait dezelfde code als wasm.',
  });
}

// 12e. MMB ENV-FOLLOW — 6 HP. Dezelfde follower als hierboven, maar met één
//     cel en kale jacknamen: voor als je er maar één nodig hebt.
function mmbEnvFollowerMono() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_env_follower_mono',
    categoryId: 'envelope',
    variant: 'Envelope follower (enkel)',
    brand: 'MMB', model: 'ENV-FOLLOW',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'ENV', fontSize: 2.4, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 13,  text: 'FOLLOW', fontSize: 2.0, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 18,  text: 'audio \u2192 cv', fontSize: 1.1, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 124, text: 'MMB', fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('attack',  'Att',  w*0.28, 30, { size: 'small', min: 0.1, max: 100,  def: 5,   unit: 'ms', color: '#f9fafb' }),
      knob('release', 'Rel',  w*0.72, 30, { size: 'small', min: 5,   max: 1000, def: 150, unit: 'ms', color: '#f9fafb' }),
      knob('sens',    'Sens', w*0.28, 52, { size: 'small', min: -12, max: 36,   def: 0,   unit: 'dB', color: '#0891b2' }),
      knob('thresh',  'Thr',  w*0.72, 52, { size: 'small', min: 0,   max: 1,    def: 0.10,            color: '#e11d48' }),
      sw('mode', 'Mode', w/2, 72, ['Peak', 'RMS'], 1),

      inPort ('in',   'In',   'audio', w/2,    92),
      outPort('env',  'Env',  'cv',    w*0.28, 112),
      outPort('gate', 'Gate', 'gate',  w*0.72, 112),
    ],
    notes: 'Enkelvoudige envelope follower: audio erin, de gevolgde envelope als CV (0..1) eruit, plus een gate zodra die boven Thresh komt. Attack/Release zijn tijdconstanten van de detector; Sens is de gevoeligheid in dB; Mode kiest tussen piek (scherp, reageert op transi\u00ebnten) en RMS (rustiger, volgt het gemiddelde vermogen). De gate heeft 25 % hysterese zodat een uitstervende staart niet klappert. Typisch: sampler \u2192 In, Env \u2192 cutoff-CV van een VCF. Firmware: tp_mmb_env_follower_mono (FW-CV-6), dezelfde romp en dezelfde DSP als de 8-cel versie \u2014 alleen \u00e9\u00e9n cel. In de simulator draait dezelfde code als wasm.',
  });
}

// ── public entry ───────────────────────────────────────────────────────
/** Plaats interne modules in (en creëer eventueel) de `rack_internal`. */
export function seedInternals(project: ModularProject): ModularProject {
  const all = [mmbAhdsr(), mmbLfo(), mmbSh(), mmbVco(), mmbQuadVcoShared(), mmbOctaVco(), mmbOctaVcf(), mmbOctaVca(), mmbQuadMixerShared(), mmbVcf(), mmbLadder(), mmbMs20(), mmbVca(), mmbOut(), mmbMidiIn(), mmbCvMath(), mmbMixer(), mmbMixer8(), mmbMixer16(), mmbSeq8(), mmbString(), mmbElements(), mmbRings(), mmbPlaits(), mmbClouds(), mmbTides(), mmbMarbles(), mmbDx7(), mmbWarps(), mmbMorphWt(), mmbStages(), mmbPeaks(), mmbResonator(), mmbCr78(), mmbQuant(), mmbChord(), mmbElementsReverb(), mmbGrids(), mmbComp(), mmbNoise(), mmbAudioIn(), mmbEcho(), mmbTapeEcho(), mmbStereoTapeEcho(), mmbDigitalEcho(), mmbBbdChorus(), mmbRingMod(), mmbOctaver(), mmbHarmonizer(), mmbReverb(), mmbTremolo(), mmbStereoPhaser(), mmbVibe(), mmbRotary(), mmbShimmer(), mmbFetComp(),mmbOptoComp(), mmbBusComp(),mmbVariMuComp(), mmbProgramEq(), mmbDiodeComp(), mmbConsoleEq(), mmbParaEq(), mmbSampler(), mmbZang(), mmbSid(), mmbSid3(), mmbPhaser(), mmbStereoVca(), mmbFmVco(), mmbComb(), mmbWtVco(), mmbDrawVco(), mmbStkSound(), mmbFof(), mmbEnvFollower(), mmbEnvFollowerMono()];
  all.push(mmbMaterialBridge());
  all.push(mmbScanned());
  all.push(mmbReservoir());
  all.push(mmbGendyn());
  all.push(mmbExcitable());
  all.push(mmbTapeStrip());
  all.push(mmbClock(), mmbEuclid(), mmbTuring(), mmbBranches(), mmbChaos(), mmbLfo8(), mmbSlope(), mmbLogic());
  all.push(mmbFolder(), mmbLpg(), mmbDrive(), mmbTube(), mmbFreqShift(), mmbAcid(), mmbMixtur(), mmbRungler(), mmbOrgan());
  all.push(mmbMartenot(), mmbDiffuseur(), mmbArp());
  all.push(mmbSem(), mmbComplex(), mmbWah(), mmbEnsemble(), mmbEPiano());
  all.push(mmbPads(), mmbFaders(), mmbKnobs());
  all.push(mmbRhythm(), mmbPercuter(), mmbSynthex());
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
  const modules = [
    ...project.modules.map((m) => visualByType.has(m.typeId)
      ? { ...m, visual: visualByType.get(m.typeId)! } : m),
    ...newModules,
  ];
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
    modules,
    racks: pushApartGrown(updatedRacks, project.modules, modules),
  };
}

/**
 * Een paneel dat bij een upgrade breder wordt (de SID ging van 12 naar
 * 16 HP) blijft op zijn plek staan; zonder ingreep ligt de buurman er dan
 * overheen. In elke rij met zo'n gegroeide module schuiven de modules
 * erachter door tot ze niet meer overlappen; de rij groeit zo nodig mee.
 * Rijen zonder gegroeide module blijven onaangeroerd.
 */
function pushApartGrown(racks: Rack[], before: ModuleInstance[], after: ModuleInstance[]): Rack[] {
  const oldHp = new Map(before.map((m) => [m.id, m.visual.hpWidth]));
  const hpOf = new Map(after.map((m) => [m.id, m.visual.hpWidth]));
  const grown = new Set(after.filter((m) => m.visual.hpWidth > (oldHp.get(m.id) ?? m.visual.hpWidth)).map((m) => m.id));
  if (grown.size === 0) return racks;
  return racks.map((r) => {
    const rows = new Set(r.slots.filter((s) => grown.has(s.moduleId)).map((s) => s.row));
    if (rows.size === 0) return r;
    const moved = new Map<string, number>();
    let maxEnd = 0;
    for (const row of rows) {
      let cursor = 0;
      for (const s of r.slots.filter((x) => x.row === row).sort((a, b) => a.hpOffset - b.hpOffset)) {
        const at = Math.max(s.hpOffset, cursor);
        if (at !== s.hpOffset) moved.set(s.id, at);
        cursor = at + (hpOf.get(s.moduleId) ?? 0);
        maxEnd = Math.max(maxEnd, cursor);
      }
    }
    if (moved.size === 0) return r;
    return {
      ...r,
      hpPerRow: Math.max(r.hpPerRow, maxEnd),
      slots: r.slots.map((s) => (moved.has(s.id) ? { ...s, hpOffset: moved.get(s.id)! } : s)),
    };
  });
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

/** FM-testpatch (2-op): MIDI-IN → VCO (modulator, sinus, +12 st = ratio 2:1)
 *  → FM-VCO.fm; FM-VCO → VCF → VCA → OUT met ENV → VCA. Beide oscillators
 *  hangen aan MIDI-IN.pitch zodat de ratio vast blijft over het klavier.
 *  Draait in de simulator (FmVco-runtime) én op de Teensy (tp_mmb_fm_vco). */
export function seedFmTestPatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_vco','tp_mmb_fm_vco','tp_mmb_vcf','tp_mmb_vca','tp_mmb_out','tp_mmb_ahdsr','tp_mmb_midiin'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  function fresh(typeId: string, label: string): ModuleInstance {
    const proto = p.modules.find((m) => m.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false,
             name: `${proto.brand ?? ''} ${proto.modelNumber ?? ''} (${label})`.trim(),
             visual: proto.visual };
  }
  const mi  = fresh('tp_mmb_midiin', 'fm');
  const mod = fresh('tp_mmb_vco',    'modulator');
  const fm  = fresh('tp_mmb_fm_vco', 'carrier');
  const vcf = fresh('tp_mmb_vcf',    'fm');
  const vca = fresh('tp_mmb_vca',    'fm');
  const env = fresh('tp_mmb_ahdsr',  'fm');
  const out = fresh('tp_mmb_out',    'fm');
  const order = [mi, mod, fm, vcf, vca, env, out];

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const slot: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return slot;
  };
  const slots = order.map(place);
  const rack: Rack = {
    id: uid('rack'), name: 'FM test rack',
    description: 'Automatisch gegenereerd door "FM-test": MIDI-IN → VCO (mod) → FM-VCO → VCF → VCA → OUT met ENV → VCA.',
    rows: 1, hpPerRow: Math.max(64, offset + 4),
    slots,
    kind: 'physical',
  };

  const c = (from: { m: ModuleInstance; port: string }, to: { m: ModuleInstance; port: string }): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: from.m.id, portId: from.port },
    to:   { moduleId: to.m.id,   portId: to.port },
  });
  const connections: PatchConnection[] = [
    c({ m: mod, port: 'out' },    { m: fm,  port: 'fm'   }),   // modulator → FM-ingang
    c({ m: fm,  port: 'out' },    { m: vcf, port: 'in'   }),
    c({ m: vcf, port: 'out' },    { m: vca, port: 'in'   }),
    c({ m: vca, port: 'out' },    { m: out, port: 'l'    }),
    c({ m: vca, port: 'out' },    { m: out, port: 'r'    }),
    c({ m: env, port: 'cv_out' }, { m: vca, port: 'cv'   }),
    c({ m: mi,  port: 'pitch' },  { m: mod, port: 'voct' }),   // beide volgen het klavier
    c({ m: mi,  port: 'pitch' },  { m: fm,  port: 'voct' }),
    c({ m: mi,  port: 'gate' },   { m: env, port: 'gate' }),
  ];

  const controlState: Record<string, Record<string, ControlValue>> = {
    [mod.id]: { wave: 0, coarse: 12, fine: 0, level: 0.8 },           // sinus, ratio 2:1
    [fm.id]:  { wave: 0, coarse: 0, fine: 0, fm_amt: 1.5, level: 0.8 }, // 1,5 octaaf FM-diepte
    [vcf.id]: { cutoff: 6000, q: 0.3, cv_amt: 1, type: 0 },            // open LP, alleen wat top eraf
    [vca.id]: { gain: 0, resp: 0 },
    [env.id]: { attack: 5, hold: 0, decay: 350, sustain: 0.35, release: 500, loop: false, curve: 1 },
    [out.id]: { level: 0.8 },
    [mi.id]:  { channel: 0, priority: 0, steal: 0, legato: 0 },
  };

  const patch: Patch = {
    id: uid('patch'), name: 'FM test (2-op)',
    description: 'Sinus-modulator (+12 st) in de FM-ingang van de FM-VCO; draai Coarse op de modulator voor andere ratio\'s en FM op de carrier voor de diepte.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections,
    controlState,
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, ...order],
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
  /** Aftertouch → filter-cutoff: MidiIn.press (per stem uitgewaaierd) op de
   *  c-ingang van de sum-CvMath vóór het filter (gain 1,5 = tot anderhalf
   *  octaaf open bij volle druk). Voegt die CvMath toe als hij er nog niet
   *  is (perVoiceLfo). Opt-in: de recipe-compiler spiegelt de standaardseed. */
  aftertouch?: boolean;
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
    fx?: ModuleInstance; lfoV?: ModuleInstance;
    /** Sum-CvMath vóór de filter-cv (bij perVoiceLfo of aftertouch): a =
     *  filter-env, b = stem-LFO, c = aftertouch (MidiIn.press). */
    lfoSum?: ModuleInstance;
  };
  const withSum = Boolean(opts.perVoiceLfo || opts.aftertouch);
  const voices: VoiceChain[] = Array.from({ length: N }, () => ({
    vco:    fresh(srcTypeId),
    vcf:    fresh(vcfTypeId),
    vca:    fresh('tp_mmb_vca'),
    envAmp: fresh('tp_mmb_ahdsr'),
    envFlt: fresh('tp_mmb_ahdsr'),
    cvmath: fresh('tp_mmb_cvmath'),
    ...(fxTypeId          ? { fx:     fresh(fxTypeId) }       : {}),
    ...(opts.perVoiceLfo  ? { lfoV:   fresh('tp_mmb_lfo') }   : {}),
    ...(withSum           ? { lfoSum: fresh('tp_mmb_cvmath') } : {}),
  }));
  const master = voices[0]!;

  // Layout: een net grid. Rij 0 = MidiIn + master-keten + mixer + OUT
  // (links→rechts). Elke follower-stem v komt in rij v, exact onder zijn
  // master uitgelijnd. Zo blijft rij 0 (de ingeklapte patcher-weergave)
  // compact en ontstaat er geen gat tussen de laatste VCA en de mixer.
  const chainOrder: (keyof VoiceChain)[] = [
    'vco', 'envFlt',
    ...(opts.perVoiceLfo ? (['lfoV'] as const) : []),
    ...(withSum ? (['lfoSum'] as const) : []),
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
    ...(opts.perVoiceLfo ? [grp('LFO', 'lfoV')] : []),
    ...(withSum ? [grp('LfoSum', 'lfoSum')] : []),
    grp(opts.filterType === 'ladder' ? 'Ladder' : opts.filterType === 'ms20' ? 'MS-20' : 'VCF', 'vcf'),
    ...(fxTypeId ? [grp(opts.perVoiceFx === 'comb' ? 'Comb' : 'Phaser', 'fx')] : []),
    grp('envAmp', 'envAmp'),
    grp('CvMath', 'cvmath'),
    grp('VCA',  'vca'),
  ] : [];

  const rack: Rack = {
    id: uid('rack'), name: `${N}-stemmig test rack`,
    description: `MidiIn → [VCO → envFlt${opts.aftertouch ? ' + aftertouch' : ''} → VCF → envAmp → CvMath(vel×env) → VCA] ×${N} (PolyGroups) → ${N > 8 ? 'MIXER-16' : N > 4 ? 'MIXER-8' : 'MIXER'} → OUT. Rij 0 = master + mixer/out, followers in rij 1..${N - 1}.`,
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
    // CV: filter-env (+ stem-LFO) + aftertouch → cutoff, via de sum-CvMath
    // (group→group). Druk op de toets opent het filter van díé stem: press
    // is een voice-event-poort, dus per stem uitgewaaierd (poly-aftertouch),
    // of allemaal tegelijk bij gewone channel-aftertouch (Keystep).
    ...(master.lfoSum ? [
      c({ m: master.envFlt, port: 'cv_out' }, { m: master.lfoSum, port: 'a' }),
      ...(master.lfoV ? [c({ m: master.lfoV, port: 'out' }, { m: master.lfoSum, port: 'b' })] : []),
      ...(opts.aftertouch ? [c({ m: mi, port: 'press' }, { m: master.lfoSum, port: 'c' })] : []),
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
    // Filter-cv-sum: envelope vol, stem-LFO (traag wobble) op een kwart,
    // aftertouch tot anderhalf octaaf open bij volle druk.
    if (v.lfoSum) controlState[v.lfoSum.id] = { mode: 0, gain_a: 1, gain_b: 0.25, gain_c: opts.aftertouch ? 1.5 : 0, offset: 0 };
    if (v.lfoV)   controlState[v.lfoV.id]   = { rate: 0.7, wave: 1, depth: 1, bipolar: true, run: 0 };
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
  fx?: { typeId: string; label: string; controls?: Record<string, ControlValue>; mono?: boolean; monoIn?: boolean },
  /** `arp`: een ARP in plaats van MIDI-IN (zelfde pitch/gate/vel-uitgangen), met deze knoppen. */
  opts: { arp?: Record<string, ControlValue> } = {},
): ModularProject {
  const arp = opts.arp;
  const src = arp ? 'tp_mmb_arp' : 'tp_mmb_midiin';
  const needed = [typeId, src, 'tp_mmb_out', ...(fx ? [fx.typeId] : [])];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  // FOF kreeg later `vel` (2026-10-01) en `pressure` (2026-10-01, Pressure-stap):
  // een oud project met een FOF-type zonder die poorten wordt eerst ververst.
  const fofPorts = project.moduleTypes.find((type) => type.id === typeId)?.ports.map((port) => port.id) ?? [];
  const needsFofUpgrade = typeId === 'tp_mmb_fof'
    && !['vel', 'pressure', 'vibrato', 'voice', 'syl_cv', 'next'].every((id) => fofPorts.includes(id));
  const p = missing || needsFofUpgrade ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi   = fresh(src);
  const inst = fresh(typeId);
  // Optioneel effect tussen instrument en OUT (stereo in/uit).
  const fxm  = fx ? fresh(fx.typeId) : null;
  const out  = fresh('tp_mmb_out');
  const name = (fx ? `${label} + ${fx.label}` : `${label} solo`) + (arp ? ' arp' : '');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const rack: Rack = {
    id: uid('rack'), name,
    description: `${arp ? 'ARP' : 'MidiIn'} → ${label}${fxm ? ` → ${fx!.label}` : ''} → OUT.`,
    rows: 1, hpPerRow: Math.max(64, mi.visual.hpWidth + inst.visual.hpWidth
      + (fxm ? fxm.visual.hpWidth : 0) + out.visual.hpWidth + 4),
    slots: [place(mi), place(inst), ...(fxm ? [place(fxm)] : []), place(out)],
    kind: 'physical',
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name,
    description: (arp ? 'Arpeggio: houd een akkoord vast; ARP speelt de toetsen als reeks. ' : '')
      + `Monofoon: speel en draai — alle knoppen gaan live naar de Teensy.`
      + (fxm ? ` ${fx!.label} zit tussen ${label} en OUT.` : ''),
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', inst, 'voct'),
      c(mi, 'gate',  inst, 'gate'),
      ...(typeId === 'tp_mmb_material_bridge' || typeId === 'tp_mmb_fof' || typeId === 'tp_mmb_scanned' || typeId === 'tp_mmb_mixtur'
        || typeId === 'tp_mmb_martenot' ? [c(mi, 'vel', inst, 'vel')] : []),
      // Scanned: aftertouch drukt de vinger in de ring. Martenot: de touche.
      ...(!arp && (typeId === 'tp_mmb_scanned' || typeId === 'tp_mmb_mixtur' || typeId === 'tp_mmb_martenot') ? [c(mi, 'press', inst, 'press')] : []),
      // Martenot: het modwiel wiegt de toets (meer vibrato).
      ...(!arp && typeId === 'tp_mmb_martenot' ? [c(mi, 'cv_mod', inst, 'vib_cv')] : []),
      // Mono-effect (ringmod, octaver): L erin, de ene uitgang naar L én R.
      ...(fxm && fx!.mono
        ? [c(inst, outL, fxm, 'in'), c(fxm, 'out', out, 'l'), c(fxm, 'out', out, 'r')]
        // Mono in, stereo uit (harmonizer): L erin, L/R eruit.
        : fxm && fx!.monoIn
        ? [c(inst, outL, fxm, 'in'), c(fxm, 'out_l', out, 'l'), c(fxm, 'out_r', out, 'r')]
        : fxm
        ? [c(inst, outL, fxm, 'in_l'), c(inst, outR, fxm, 'in_r'),
           c(fxm, 'out_l', out, 'l'),  c(fxm, 'out_r', out, 'r')]
        : [c(inst, outL, out, 'l'),    c(inst, outR, out, 'r')]),
    ],
    controlState: {
      [inst.id]: controls,
      [out.id]:  { level: 0.8 },
      [mi.id]:   arp ?? { channel: 0, voiceCount: 1 },
      ...(fxm ? { [fxm.id]: fx!.controls ?? {} } : {}),
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, inst, ...(fxm ? [fxm] : []), out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/** Een effectmodule in een seed-keten: stereo in_l/in_r → out_l/out_r. */
export interface SeedFx {
  readonly typeId: string;
  readonly label: string;
  /** Kort, voor in de patchnaam. */
  readonly short?: string;
  /** Eén zin voor de patchbeschrijving. */
  readonly hint?: string;
  readonly controls?: Readonly<Record<string, ControlValue>>;
}

/** Bron → effecten → OUT, stereo, in volgorde. */
function stereoChain(
  c: (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string) => PatchConnection,
  src: ModuleInstance, fx: readonly ModuleInstance[], out: ModuleInstance,
  srcL = 'out_l', srcR = 'out_r',
): PatchConnection[] {
  const conns: PatchConnection[] = [];
  let l = { m: src, p: srcL }, r = { m: src, p: srcR };
  for (const m of fx) {
    conns.push(c(l.m, l.p, m, 'in_l'), c(r.m, r.p, m, 'in_r'));
    l = { m, p: 'out_l' }; r = { m, p: 'out_r' };
  }
  conns.push(c(l.m, l.p, out, 'l'), c(r.m, r.p, out, 'r'));
  return conns;
}

/** FET COMP achter de sampler (Poly-menu). */
const SAMPLER_FET_FX: SeedFx = {
  typeId: 'tp_mmb_fet_comp', label: 'FET COMP', short: 'FET',
  hint: 'Daarachter FET COMP (1176-stijl): Input +12 drukt hem stevig samen, Output −4 haalt het niveau terug. Probeer Ratio All.',
  controls: { input: 12, output: -4, attack: 5, release: 4, ratio: 0, mix: 1 },
};

/** Mastering-keten achter de sampler: program-EQ (Pultec-truc) en vari-mu. */
export const SAMPLER_MASTER_FX: readonly SeedFx[] = [
  { typeId: 'tp_mmb_program_eq', label: 'PROGRAM EQ', short: 'EQ',
    hint: 'Eerst PROGRAM EQ (Pultec-stijl) met de Pultec-truc op 60 Hz (boost 6, atten 4) en wat lucht op 10 kHz;',
    controls: { low_freq: 2, low_boost: 6, low_atten: 4, high_freq: 4, high_boost: 3, bandwidth: 7, atten_freq: 2, high_atten: 0, output: -2, color: 1 } },
  { typeId: 'tp_mmb_varimu_comp', label: 'VARI-MU', short: 'Vari-mu',
    hint: 'dan VARI-MU (Fairchild-stijl) als lijm: tijdstand 5 (programma-afhankelijk), rustig ingrijpen.',
    controls: { input: 6, threshold: -20, output: -2, time: 5, mode: 0, color: 1, mix: 1 } },
];

/** FET COMP achter een solo-instrument, met een stand die je meteen hoort. */
/** Effectenbatch 2026-09-25: echo's, chorus, ringmod en octaver in de Solo-keten. */
export const STEREO_TAPE_SOLO_FX = {
  typeId: 'tp_mmb_stereo_tape_echo', label: 'STEREO TAPE',
  controls: { time: 0.32, ratio: 1.5, feedback: 0.35, cross: 0.6, mix: 0.4, tone: 0.55, wow: 0.35, flutter: 0.25, drive: 0.4 },
} as const;
export const DIGITAL_ECHO_SOLO_FX = {
  typeId: 'tp_mmb_digital_echo', label: 'DIGITAL ECHO',
  controls: { time: 0.375, ratio: 1, feedback: 0.45, cross: 0.3, mix: 0.4, mod_rate: 0.7, mod_depth: 0.35, bits: 12, band: 7000 },
} as const;
export const BBD_SOLO_FX = {
  typeId: 'tp_mmb_bbd_chorus', label: 'BBD CHORUS',
  controls: { rate: 0.5, depth: 0.6, delay: 9, feedback: 0, mix: 0.5, spread: 1, age: 0.35, tone: 0.55 },
} as const;
export const HARMONIZER_SOLO_FX = {
  typeId: 'tp_mmb_harmonizer', label: 'HARMONIZER', monoIn: true,
  controls: { semi_a: 7, cent_a: 0, lvl_a: 0.8, semi_b: 12, cent_b: 5, lvl_b: 0.5, window: 40, feedback: 0.25, spread: 0.7, mix: 0.45 },
} as const;
export const REVERB_SOLO_FX = {
  typeId: 'tp_mmb_reverb', label: 'REVERB',
  controls: { mode: 0, size: 0.7, damp: 0.4, predelay: 15, mod: 0.3, mix: 0.35 },
} as const;
export const PALME_SOLO_FX = {
  typeId: 'tp_mmb_diffuseur', label: 'DIFFUSEUR', mono: true,
  controls: { type: 1, mix: 0.5, tune: 0, ring: 0.55, gong: 196, level: 1 },
} as const;
export const METALLIQUE_SOLO_FX = {
  typeId: 'tp_mmb_diffuseur', label: 'DIFFUSEUR', mono: true,
  controls: { type: 2, mix: 0.45, tune: 0, ring: 0.5, gong: 196, level: 1 },
} as const;
export const SPRING_SOLO_FX = {
  typeId: 'tp_mmb_reverb', label: 'SPRING',
  controls: { mode: 1, size: 0.75, damp: 0.5, predelay: 0, mod: 0.4, mix: 0.4 },
} as const;
export const TREMOLO_SOLO_FX = {
  typeId: 'tp_mmb_tremolo', label: 'TREMOLO',
  controls: { rate: 5.2, depth: 0.7, wave: 0, mode: 2, shape: 0.2, level: 1.2 },
} as const;
export const STEREO_PHASER_SOLO_FX = {
  typeId: 'tp_mmb_stereo_phaser', label: 'STEREO PHASER',
  controls: { rate: 0.35, depth: 0.8, feedback: 0.45, mix: 0.5, spread: 0.5 },
} as const;
export const VIBE_SOLO_FX = {
  typeId: 'tp_mmb_vibe', label: 'VIBE',
  controls: { speed: 1.6, intensity: 0.7, mode: 0, lamp_age: 0.75, volume: 1.1 },
} as const;
export const ROTARY_SOLO_FX = {
  typeId: 'tp_mmb_rotary', label: 'ROTARY',
  controls: { speed: 0, slow_rate: 0.8, fast_rate: 6.7, inertia: 1, drive: 0.35, balance: 0.5, spread: 0.8, noise: 0.35, level: 1.1 },
} as const;
export const SHIMMER_SOLO_FX = {
  typeId: 'tp_mmb_shimmer', label: 'SHIMMER',
  controls: { size: 0.8, damp: 0.35, shimmer: 0.55, interval: 0, tone: 0.55, predelay: 25, mod: 0.4, mix: 0.45 },
} as const;
export const RINGMOD_SOLO_FX = {
  typeId: 'tp_mmb_ringmod', label: 'RING MOD', mono: true,
  controls: { freq: 330, wave: 0, mode: 1, bias: 0.35, mix: 0.7 },
} as const;
export const OCTAVER_SOLO_FX = {
  typeId: 'tp_mmb_octaver', label: 'OCTAVER', mono: true,
  controls: { dry: 0.8, oct1: 0.8, oct2: 0.3, up: 0, tone: 0.45 },
} as const;

export const FET_SOLO_FX = {
  typeId: 'tp_mmb_fet_comp', label: 'FET COMP',
  controls: { input: 14, output: -6, attack: 5, release: 4, ratio: 0, mix: 1 },
} as const;

/** OPTO COMP achter een solo-instrument: traag en vloeiend. */
export const OPTO_SOLO_FX = {
  typeId: 'tp_mmb_opto_comp', label: 'OPTO COMP',
  controls: { peak: 55, gain: 4, mode: 0, color: 1, mix: 1 },
} as const;

/** VCA-BUS achter een solo-instrument: de klassieke busstand (30 ms, Auto, 4:1). */
export const BUS_SOLO_FX = {
  typeId: 'tp_mmb_bus_comp', label: 'VCA-BUS',
  controls: { threshold: -22, ratio: 1, attack: 5, release: 4, makeup: 4, sc_hpf: 0, mix: 1 },
} as const;

/** VARI-MU achter een solo-instrument: dik en warm. */
export const VARIMU_SOLO_FX = {
  typeId: 'tp_mmb_varimu_comp', label: 'VARI-MU',
  controls: { input: 10, threshold: -18, output: -4, time: 2, mode: 0, color: 1.3, mix: 1 },
} as const;

/** DIODE COMP achter een solo-instrument: flink ingrijpen, dan hoor je de diodes. */
export const DIODE_SOLO_FX = {
  typeId: 'tp_mmb_diode_comp', label: 'DIODE COMP',
  controls: { threshold: -28, ratio: 3, attack: 1, release: 4, makeup: 6, color: 1.2, mix: 1 },
} as const;

/** CONSOLE EQ achter een solo-instrument: HPF 80, wat laag en presence. */
export const CONSOLE_EQ_SOLO_FX = {
  typeId: 'tp_mmb_console_eq', label: 'CONSOLE EQ',
  controls: { hpf: 2, low_freq: 1, low_gain: 4, mid_freq: 3, mid_gain: 3, high_gain: 2, output: -2, color: 1 },
} as const;

/** PARA EQ achter een solo-instrument: een smile-curve met wat presence. */
export const PARA_EQ_SOLO_FX = {
  typeId: 'tp_mmb_para_eq', label: 'PARA EQ',
  controls: { hpf: 40, lf_freq: 90, lf_gain: 3, lf_shelf: 1, lmf_freq: 400, lmf_gain: -2, lmf_q: 1, hmf_freq: 3000, hmf_gain: 3, hmf_q: 1.2, hf_freq: 10000, hf_gain: 2, hf_shelf: 1, prop_q: 1, output: -1 },
} as const;

/** PROGRAM EQ achter een solo-instrument: de Pultec-truc onderin. */
export const EQ_SOLO_FX = {
  typeId: 'tp_mmb_program_eq', label: 'PROGRAM EQ',
  controls: { low_freq: 2, low_boost: 8, low_atten: 6, high_freq: 3, high_boost: 4, bandwidth: 6, atten_freq: 2, high_atten: 0, output: -3, color: 1 },
} as const;

/**
 * Krell-patch: het archetype van de zelfspelende synth. Stages genereert in
 * loop-mode een steeds wisselende envelope; z'n EOC-puls triggert Marbles
 * (nieuwe random noot) én de envelope zelf → een oneindige, nooit-herhalende
 * melodie. Morph-WT is de stem (envelope op morph + VCA), Clouds maakt er een
 * ruimte omheen. Verbinden en laten spelen.
 */
export function seedKrellPatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_stages', 'tp_mmb_marbles', 'tp_mmb_morph_wt', 'tp_mmb_vca', 'tp_mmb_clouds', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const st   = fresh('tp_mmb_stages');
  const mar  = fresh('tp_mmb_marbles');
  const wt   = fresh('tp_mmb_morph_wt');
  const vca  = fresh('tp_mmb_vca');
  const cl   = fresh('tp_mmb_clouds');
  const out  = fresh('tp_mmb_out');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [st, mar, wt, vca, cl, out];
  const rack: Rack = {
    id: uid('rack'), name: 'Krell',
    description: 'Stages (loop) triggert zichzelf + Marbles; Morph-WT stem in Clouds. Zelfspelend.',
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
    id: uid('patch'), name: 'Krell',
    description: 'Zelfspelend (Buchla-Krell): Stages loopt en triggert via EOC zichzelf + Marbles (nieuwe noot). De envelope stuurt de VCA en Morph-WT’s morph; Clouds maakt de ruimte. Draai aan Stages T2/rate en Marbles Deja vu.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(st, 'eoc', st, 'gate'),          // self-trigger: nooit stil
      c(st, 'eoc', mar, 'clock'),        // elke cyclus een nieuwe noot
      c(mar, 'x1', wt, 'voct'),
      c(st, 'out', wt, 'morph_cv'),      // envelope ademt door de wavetable
      c(wt, 'out', vca, 'in'),
      c(st, 'out', vca, 'cv'),           // envelope = amplitude
      c(vca, 'out', cl, 'in_l'),
      c(vca, 'out', cl, 'in_r'),
      c(cl, 'out_l', out, 'l'),
      c(cl, 'out_r', out, 'r'),
    ],
    controlState: {
      [st.id]:  { segments: 2, loop: 1, loop_start: 0, loop_end: 1, rate: 1,
                  t1: 0.15, s1: 0.6, type1: 0, t2: 0.5, s2: 0.3, type2: 0 },
      [mar.id]: { tempo: 60, bias: 0.5, jitter: 0.2, model: 0, dejavu: 0.2, length: 8, spread: 0.6, steps: 0.9, scale: 2, range: 1, extclock: 1 },
      [wt.id]:  { bank: 0, morph: 0, level: 0.9 },
      [vca.id]: { gain: 0, resp: 0 },
      [cl.id]:  { position: 0.4, size: 0.7, density: 0.4, texture: 0.5, mix: 0.6, reverb: 0.6, spread: 0.7, mode: 0, level: 0.9 },
      [out.id]: { level: 0.85 },
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
 * 808-jam: Marbles klokt drie Peaks-drums (kick/snare/hat) door een mixer.
 * Zelfspelend — de generatieve gates (t1 = kick op de tel, t2 = snare/hat)
 * maken een steeds wisselend ritme. Draai aan Marbles Déjà vu om een groove
 * vast te zetten.
 */
export function seedMaterialBridgeDemo(project: ModularProject): ModularProject {
  const p = seedInternals(project);
  const fresh = (typeId: string): ModuleInstance => {
    const proto = p.modules.find((module) => module.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const rhythmA = fresh('tp_mmb_seq8');
  const rhythmB = fresh('tp_mmb_seq8');
  const material = fresh('tp_mmb_material_bridge');
  const out = fresh('tp_mmb_out');
  const modules = [rhythmA, rhythmB, material, out];
  let offset = 0;
  const rack: Rack = {
    id: uid('rack'), name: 'Material Bridge demo',
    description: 'Zacht-hard-zacht-frase (2 Hz, 16 stappen) plus een trage tweede aanslag (0,5 Hz); vaste grondtoon.',
    rows: 1, hpPerRow: 64, kind: 'physical',
    slots: modules.map((module) => {
      const slot: RackSlot = { id: uid('slot'), moduleId: module.id, row: 0, hpOffset: offset };
      offset += module.visual.hpWidth;
      return slot;
    }),
  };
  rack.hpPerRow = Math.max(64, offset);
  const cable = (from: ModuleInstance, output: string, to: ModuleInstance, input: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: from.id, portId: output }, to: { moduleId: to.id, portId: input },
  });
  const connections = [
    cable(rhythmA, 'cv', material, 'vel'),
    cable(rhythmA, 'gate_out', material, 'gate'),
    cable(rhythmB, 'gate_out', material, 'gate_b'),
    cable(material, 'out_l', out, 'l'), cable(material, 'out_r', out, 'r'),
  ];
  // Zes zachte noten (vel 0,33: stress blijft onder de hersteldrempel), een
  // harde (vel 1: breekt de brug), zeven zachte tijdens breuk en herstel, twee
  // stappen rust. Dezelfde zachte noot klinkt dus voor en na de harde aanslag.
  const steps = { s1: 4, s2: 4, s3: 4, s4: 4, s5: 4, s6: 4, s7: 12, s8: 4, s9: 4, s10: 4, s11: 4, s12: 4, s13: 4, s14: 4, s15: 0, s16: 0 };
  const variants: Array<[string, number, number]> = [['Memory uit', 0, 0], ['Alleen brug', 0.85, 0], ['Brug + vermoeiing', 0.85, 0.85]];
  const patches = variants.map(([label, memory, fatigue]): Patch => ({
    id: uid('patch'), name: `Material Bridge demo - ${label}`,
    description: 'Zelfspelende zacht-hard-zacht-frase, vaste C3 en gedeelde velocity. De drie varianten verschillen alleen in Memory (brugcontact) en Fatigue (stressdemping); live wisselen reset de toestand niet. Gebruik de gerenderde takes voor een gematchte vergelijking.',
    voiceCount: 1, rackIds: [rack.id],
    connections: connections.map((connection) => ({ ...connection, id: uid('conn') })),
    controlState: {
      [rhythmA.id]: { ...steps, root: 60, rate: 2, gate: 0.1, length: 16, run: 0 },
      [rhythmB.id]: { root: 60, rate: 0.5, gate: 0.1, length: 8, run: 0 },
      [material.id]: { pitch: -12, spread: 0.12, coupling: 0.65, decay: 4, memory, fatigue, recovery: 2, pickup: 0.25, level: 0.8 },
      [out.id]: { level: 0.8 },
    },
    envelopes: [], lfos: [],
  }));
  return {
    ...p, modules: [...p.modules, ...modules], racks: [...p.racks, rack],
    patches: [...p.patches, ...patches], activeRackId: rack.id, activePatchId: patches[0]!.id,
  };
}

/**
 * Reservoir demo: twee zelfspelende stemmen (SEQ -> VCO -> VCA) waarvan de
 * envelopes door een gedeeld reservoir lopen. In de variant "gedeelde bron"
 * trekt iedere noot de bron leeg (Drain 0,7) en krijgt de andere stem minder;
 * in "onafhankelijk" staat Drain op 0 en zijn de envelopes ongewijzigd. Dat
 * is het enige verschil. Toetst of gedeelde toestand anders speelt dan
 * onafhankelijke stemmen (resource-coupled synthesis).
 */
export function seedReservoirDemo(project: ModularProject): ModularProject {
  const p = seedInternals(project);
  const fresh = (typeId: string): ModuleInstance => {
    const proto = p.modules.find((module) => module.typeId === typeId)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const seqA = fresh('tp_mmb_seq8'), seqB = fresh('tp_mmb_seq8');
  const vcoA = fresh('tp_mmb_vco'), vcoB = fresh('tp_mmb_vco');
  const envA = fresh('tp_mmb_ahdsr'), envB = fresh('tp_mmb_ahdsr');
  const reservoir = fresh('tp_mmb_reservoir');
  const vcaA = fresh('tp_mmb_vca'), vcaB = fresh('tp_mmb_vca');
  const mixer = fresh('tp_mmb_mixer');
  const out = fresh('tp_mmb_out');
  const modules = [seqA, seqB, vcoA, vcoB, envA, envB, reservoir, vcaA, vcaB, mixer, out];
  let offset = 0;
  const rack: Rack = {
    id: uid('rack'), name: 'Reservoir demo',
    description: 'Twee stemmen delen een eindige, herstellende bron: hun envelopes lopen door het reservoir naar de VCA-CV.',
    rows: 1, hpPerRow: 64, kind: 'physical',
    slots: modules.map((module) => {
      const slot: RackSlot = { id: uid('slot'), moduleId: module.id, row: 0, hpOffset: offset };
      offset += module.visual.hpWidth;
      return slot;
    }),
  };
  rack.hpPerRow = Math.max(64, offset);
  const cable = (from: ModuleInstance, output: string, to: ModuleInstance, input: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: from.id, portId: output }, to: { moduleId: to.id, portId: input },
  });
  const voice = (seq: ModuleInstance, vco: ModuleInstance, env: ModuleInstance, vca: ModuleInstance, port: string, mixIn: string) => [
    cable(seq, 'cv', vco, 'voct'),
    cable(seq, 'gate_out', env, 'gate'),
    cable(env, 'cv_out', reservoir, `in_${port}`),
    cable(reservoir, `out_${port}`, vca, 'cv'),
    cable(vco, 'out', vca, 'in'),
    cable(vca, 'out', mixer, mixIn),
  ];
  const connections = [
    ...voice(seqA, vcoA, envA, vcaA, 'a', 'in1'),
    ...voice(seqB, vcoB, envB, vcaB, 'b', 'in2'),
    cable(mixer, 'out_l', out, 'l'), cable(mixer, 'out_r', out, 'r'),
  ];
  const variants: Array<[string, number]> = [['gedeelde bron', 0.8], ['onafhankelijk', 0]];
  const patches = variants.map(([label, drain]): Patch => ({
    id: uid('patch'), name: `Reservoir demo - ${label}`,
    description: 'Twee zelfspelende stemmen (1 en 1,5 Hz) met envelopes door een gedeeld reservoir naar de VCA. De varianten verschillen alleen in Drain: 0,8 laat iedere noot de bron deels leegtrekken (gemeten: bron pendelt 0,44..0,65, stem A tot 11 dB zachter als B speelt), 0 laat de envelopes ongemoeid.',
    voiceCount: 1, rackIds: [rack.id],
    connections: connections.map((connection) => ({ ...connection, id: uid('conn') })),
    controlState: {
      [seqA.id]: { s1: 0, s2: 7, s3: 3, s4: 10, s5: 0, s6: 5, s7: 7, s8: 12, root: 48, rate: 1, gate: 0.5, length: 8, run: 0 },
      [seqB.id]: { s1: 7, s2: 0, s3: 12, s4: 3, s5: 10, s6: 7, s7: 5, s8: 0, root: 55, rate: 1.5, gate: 0.4, length: 8, run: 0 },
      [vcoA.id]: { wave: 2, level: 0.9 },
      [vcoB.id]: { wave: 1, level: 0.9 },
      [envA.id]: { attack: 5, hold: 0, decay: 150, sustain: 0.8, release: 250 },
      [envB.id]: { attack: 5, hold: 0, decay: 150, sustain: 0.8, release: 250 },
      [reservoir.id]: { drain, recover: 0.6, floor: 0.1, curve: 2, thresh: 0.15 },
      [mixer.id]: { vol1: 0.8, pan1: -0.5, vol2: 0.8, pan2: 0.5 },
      [out.id]: { level: 0.8 },
    },
    envelopes: [], lfos: [],
  }));
  return {
    ...p, modules: [...p.modules, ...modules], racks: [...p.racks, rack],
    patches: [...p.patches, ...patches], activeRackId: rack.id, activePatchId: patches[0]!.id,
  };
}

export function seed808JamPatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_marbles', 'tp_mmb_peaks', 'tp_mmb_mixer', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mar   = fresh('tp_mmb_marbles');
  const kick  = fresh('tp_mmb_peaks');
  const snare = fresh('tp_mmb_peaks');
  const hat   = fresh('tp_mmb_peaks');
  const mixer = fresh('tp_mmb_mixer');
  const out   = fresh('tp_mmb_out');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [mar, kick, snare, hat, mixer, out];
  const rack: Rack = {
    id: uid('rack'), name: '808 jam',
    description: 'Marbles klokt kick/snare/hat door een mixer. Zelfspelend.',
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
    id: uid('patch'), name: '808 jam',
    description: 'Zelfspelend 808-ritme: Marbles t1 = kick (op de tel), t2 = snare, tK = hat. Draai Marbles Bias/Déjà vu voor variatie; Peaks Tone/Decay per drum voor het geluid.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(mar, 't1', kick,  'gate'),
      c(mar, 't2', snare, 'gate'),
      c(mar, 'tclk', hat, 'gate'),
      c(kick,  'out', mixer, 'in1'),
      c(snare, 'out', mixer, 'in2'),
      c(hat,   'out', mixer, 'in3'),
      c(mixer, 'out_l', out, 'l'),
      c(mixer, 'out_r', out, 'r'),
    ],
    controlState: {
      [mar.id]:   { tempo: 120, bias: 0.5, jitter: 0.05, model: 0, dejavu: 0, length: 8, spread: 0.5, steps: 1, scale: 0, range: 1 },
      [kick.id]:  { drum: 0, tone: 0.4, decay: 0.6, snap: 0.6, coarse: 0, level: 0.9 },
      [snare.id]: { drum: 1, tone: 0.6, decay: 0.4, snap: 0.5, coarse: 0, level: 0.7 },
      [hat.id]:   { drum: 2, tone: 0.5, decay: 0.25, snap: 0.5, coarse: 0, level: 0.5 },
      [mixer.id]: { vol1: 0.9, vol2: 0.7, vol3: 0.5, pan1: 0, pan2: -0.2, pan3: 0.3 },
      [out.id]:   { level: 0.85 },
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
 * Vocoder-demo: jouw keyboard bespeelt Warps' interne zaag-carrier (V/Oct),
 * en een Marbles-geklokte Plaits (grain-engine) levert het ritmische
 * modulator-signaal — de zaag "spreekt" in het ritme van de generatieve
 * plukjes. Houd een akkoordnoot aan en draai aan Timbre en Déjà vu.
 */
export function seedWarpsVocoderPatch(project: ModularProject): ModularProject {
  const needed = ['tp_mmb_midiin', 'tp_mmb_warps', 'tp_mmb_marbles', 'tp_mmb_plaits', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi     = fresh('tp_mmb_midiin');
  const mar    = fresh('tp_mmb_marbles');
  const plaits = fresh('tp_mmb_plaits');
  const warps  = fresh('tp_mmb_warps');
  const out    = fresh('tp_mmb_out');

  let offset = 0;
  const place = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [mi, mar, plaits, warps, out];
  const rack: Rack = {
    id: uid('rack'), name: 'Warps vocoder',
    description: 'Keyboard → interne zaag-carrier; Marbles→Plaits als ritmische modulator.',
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
    id: uid('patch'), name: 'Warps vocoder',
    description: 'Speel (en houd) een noot: die bespeelt de interne zaag-carrier van Warps. Marbles klokt Plaits als ritmische modulator door de vocoder. Timbre = vocoder-kleur; Marbles Déjà vu ~0.5 loopt het ritme.',
    voiceCount: 1,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', warps, 'voct'),
      c(mar, 'x1', plaits, 'voct'),
      c(mar, 't1', plaits, 'gate'),
      c(plaits, 'out', warps, 'in2'),
      c(warps, 'out', out, 'l'),
      c(warps, 'aux', out, 'r'),
    ],
    controlState: {
      [mi.id]:     { channel: 0, voiceCount: 1 },
      [mar.id]:    { tempo: 220, bias: 0.45, jitter: 0.05, model: 0, dejavu: 0, length: 8, spread: 0.5, xbias: 0.5, steps: 0.8, scale: 2, range: 1 },
      [plaits.id]: { engine: 11, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.6, lpg: 0.6 },  // 11 = Grain (heette hier string; nummering gecorrigeerd 2026-09-29, klank ongewijzigd)
      [warps.id]:  { algo: 6.2, timbre: 0.5, shape: 3, drive1: 1, drive2: 1.3, coarse: 0, level: 0.85 },  // 6–8 = vocoder; 6,2 = snelle release (8 = bevroren)
      [out.id]:    { level: 0.85 },
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
 * Zingende stem: MidiIn → ZANG (acht stem-cellen als PolyGroup) → galm → OUT.
 * Elke aanslag zingt de volgende lettergreep van de lyricbank; een akkoord
 * deelt er één. De bank komt uit 🎤 Zang (simulator) of van de SD-kaart
 * (/mmb/lyrics/NN.mmbl, knop Bank).
 */
export function seedZangPatch(project: ModularProject, voiceCount = 8): ModularProject {
  const N = Math.max(2, Math.min(8, Math.round(voiceCount)));
  const needed = ['tp_mmb_midiin', 'tp_mmb_zang', 'tp_mmb_reverb', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid))
    || needed.some((tid) => !project.modules.some((m) => m.typeId === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi   = fresh('tp_mmb_midiin');
  const zang = fresh('tp_mmb_zang');
  const rev  = fresh('tp_mmb_reverb');
  const out  = fresh('tp_mmb_out');
  const name = 'Zingende stem';

  let offset = 0;
  const slot = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [mi, zang, rev, out];
  const slots = all.map(slot);
  const rack: Rack = {
    id: uid('rack'), name,
    description: `MidiIn → ZANG (${N} stem-cellen als PolyGroup) → galm → OUT.`,
    rows: 1, hpPerRow: Math.max(64, offset + 4),
    slots,
    kind: 'physical',
    polyGroups: [{
      id: uid('poly'), label: 'ZANG', voiceCount: N,
      members: Array.from({ length: N }, (_, i) => ({
        kind: 'cell' as const, moduleId: zang.id, cellGroupId: 'voice', cellIndex: i,
      })),
    }],
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name,
    description: 'Speel een melodie: elke aanslag zingt de volgende lettergreep, en de klinker blijft klinken zolang je de toets vasthoudt. Een akkoord zingt één lettergreep op alle noten. Maak eerst een lyricbank met 🎤 Zang (opnemen of wav, lettergrepen intypen) en zet hem in de simulator of op de Teensy. Formant = klinkerkleur (omhoog kinderstem, omlaag reus); Mode Vlg+terug begint na 2 s stilte weer bij de eerste lettergreep; de pitch-wheel buigt alle stemmen.',
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', zang, 'voct_1'),
      c(mi, 'gate',  zang, 'gate_1'),
      c(mi, 'vel',   zang, 'vel_1'),
      c(mi, 'cv_bend', zang, 'bend'),
      ...stereoChain(c, zang, [rev], out),
    ],
    controlState: {
      [mi.id]:   { channel: 0, voiceCount: N, steal: 0 },
      [zang.id]: { bank: 0, syl: 0, mode: 2, speed: 1, formant: 0, attack: 5, release: 250, coarse: 0, fine: 0, level: 0.8 },
      [rev.id]:  { mix: 0.25 },
      [out.id]:  { level: 0.85 },
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
 * Het koor zingt woorden: de sampler (Concert Choir, bank 5) is de **drager**
 * van Warps' vocoder, en de modulator levert de articulatie.
 *
 * - `modulator = 'plaits'`: Plaits' spraak-engine (15) spreekt bij elke
 *   aanslag een woord uit de TI-woordbank; het koor neemt de klinkers en
 *   medeklinkers over. Werkt zonder microfoon. Morph kiest het woord.
 * - `modulator = 'mic'`: AUDIO IN — je eigen stem (simulator: microfoon van
 *   de browser; Teensy: USB-audio van de pc). Praat of zing, en speel
 *   akkoorden: het koor zingt wat jij zegt, op de noten die jij speelt.
 * - `modulator = 'zang'`: de module ZANG — de lettergrepen uit je lyricbank.
 *   ZANG zingt ze zelf al op toon; hier levert hij alleen de articulatie en
 *   zingt het koor ze. Geen microfoon nodig, en je eigen woorden.
 *
 * Warps staat op `shape` 0 (externe carrier op in1) en `algo` 6,2 (vocoder
 * met snelle release; naar 8 toe worden de banden trager tot bevroren).
 * De sampler is mono naar Warps (out_l); acht stemmen, dus akkoorden.
 */
export function seedVocoderChoirPatch(
  project: ModularProject, modulator: 'plaits' | 'mic' | 'zang' = 'plaits', voiceCount = 8,
): ModularProject {
  const N = Math.max(2, Math.min(8, Math.round(voiceCount)));
  const modType = modulator === 'mic' ? 'tp_mmb_audioin' : modulator === 'zang' ? 'tp_mmb_zang' : 'tp_mmb_plaits';
  const needed = ['tp_mmb_midiin', 'tp_mmb_sampler', 'tp_mmb_warps', 'tp_mmb_out', modType];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid))
    || needed.some((tid) => !project.modules.some((m) => m.typeId === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi    = fresh('tp_mmb_midiin');
  const smp   = fresh('tp_mmb_sampler');
  const mod   = fresh(modType);
  const warps = fresh('tp_mmb_warps');
  const out   = fresh('tp_mmb_out');
  const name = modulator === 'mic' ? 'Koor zingt jouw stem'
    : modulator === 'zang' ? 'Koor zingt jouw woorden' : 'Koor zingt woorden';
  const modLabel = modulator === 'mic' ? 'AUDIO IN (microfoon)'
    : modulator === 'zang' ? 'ZANG (lyricbank)' : 'Plaits Speech';

  let offset = 0;
  const slot = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const all = [mi, smp, mod, warps, out];
  const slots = all.map(slot);
  const rack: Rack = {
    id: uid('rack'), name,
    description: `MidiIn → SAMPLER (koor, ${N} stemmen) = drager; ${modLabel} = modulator; Warps vocoder → OUT.`,
    rows: 1, hpPerRow: Math.max(64, offset + 4),
    slots,
    kind: 'physical',
    polyGroups: [{
      id: uid('poly'), label: 'SAMPLER', voiceCount: N,
      members: Array.from({ length: N }, (_, i) => ({
        kind: 'cell' as const, moduleId: smp.id, cellGroupId: 'voice', cellIndex: i,
      })),
    }, ...(modulator === 'zang' ? [{
      id: uid('poly'), label: 'ZANG', voiceCount: N,
      members: Array.from({ length: N }, (_, i) => ({
        kind: 'cell' as const, moduleId: mod.id, cellGroupId: 'voice', cellIndex: i,
      })),
    }] : [])],
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  // ZANG als modulator zit óók in een PolyGroup: elke noot zingt zijn
  // lettergreep op zijn eigen cel, net als het koor. De vocoder krijgt de som;
  // een akkoord deelt toch al één lettergreep.
  const zangTrigger = modulator === 'zang'
    ? [c(mi, 'pitch', mod, 'voct_1'), c(mi, 'gate', mod, 'gate_1'), c(mi, 'vel', mod, 'vel_1')]
    : [];
  const patch: Patch = {
    id: uid('patch'), name,
    description: (modulator === 'zang'
      ? 'Speel akkoorden: bij elke aanslag levert ZANG de volgende lettergreep uit je lyricbank, en het koor (sampler, bank 5) zingt hem via de vocoder. Maak de bank met 🎤 Zang. Formant op ZANG schuift de klinkerkleur van het koor.'
      : modulator === 'mic'
      ? 'Praat of zing in de microfoon en speel akkoorden: het koor (sampler, bank 5) zingt wat jij zegt op de noten die jij speelt. Simulator: de browser vraagt toestemming voor de microfoon; gebruik een koptelefoon. Teensy: stuur je microfoon naar het afspeelapparaat "Teensy MIDI/Audio" (doc/teensy-aan-de-pc.md §5).'
      : 'Speel akkoorden: bij elke aanslag spreekt Plaits (engine 15, Speech) een woord, en het koor (sampler, bank 5) zingt het via de vocoder. Morph kiest het woord, Harmonics de woordbank (boven 0,45), Timbre de formanten.')
      + ' Warps Algo 6–8 = vocoder (6 = snel en verstaanbaar, 8 = bevroren klinker); Timbre = formantverschuiving (0,5 = neutraal); Drive 2 = hoe hard de modulator de banden opent.',
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', smp, 'voct_1'),
      c(mi, 'gate',  smp, 'gate_1'),
      c(mi, 'vel',   smp, 'vel_1'),
      c(smp, 'out_l', warps, 'in1'),
      ...(modulator === 'mic'
        ? [c(mod, 'out_l', warps, 'in2')]
        : modulator === 'zang'
          ? [...zangTrigger, c(mod, 'out_l', warps, 'in2')]
          : [c(mi, 'pitch', mod, 'voct'), c(mi, 'gate', mod, 'gate'), c(mod, 'out', warps, 'in2')]),
      c(warps, 'out', out, 'l'),
      c(warps, 'out', out, 'r'),
    ],
    controlState: {
      [mi.id]:    { channel: 0, voiceCount: N, steal: 0 },
      [smp.id]:   { bank: 5, level: 0.9 },
      [mod.id]:   modulator === 'mic'
        ? { level: 1.5, mono: 1 }
        : modulator === 'zang'
          ? { bank: 0, syl: 0, mode: 2, speed: 1, formant: 0, attack: 2, release: 120, coarse: 0, fine: 0, level: 1 }
        : { engine: 15, harmonics: 0.55, timbre: 0.5, morph: 0.3, decay: 0.8, lpg: 0.5, level: 0.9 },
      [warps.id]: { algo: 6.2, timbre: 0.5, shape: 0, drive1: 1, drive2: 1.6, coarse: 0, level: 0.9 },  // 6–8 = vocoder; 6,2 = snelle release, verstaanbaar
      [out.id]:   { level: 0.85 },
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
    description: `${N}-stemmige 6-op FM (msfa/Dexed-kern). Bank kiest een van de acht fabrieksbanken (1A t/m 4B), Program de klank (0–31); het display toont de naam. Bank 8 is je eigen .syx, te laden via de Teensy-modal.`,
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
 * Sampler ×8: één SAMPLER-module, PolyGroup over zijn acht stem-cellen.
 * MidiIn → cel 1 (master); polyExpand waaiert uit naar voct_1..8 enz.
 * Construct B uit doc/uml/11-simulation-wasm.md — de sampler deelt één bank
 * en MIDI-in verdeelt de noten.
 */
export function seedSamplerPolyPatch(
  project: ModularProject, voiceCount = 8, autoWah = false,
  /** Effecten tussen de sampler en OUT, stereo in volgorde; `true` = FET COMP. */
  fx: boolean | readonly SeedFx[] = false,
): ModularProject {
  const N = Math.max(2, Math.min(8, Math.round(voiceCount)));
  const chain: readonly SeedFx[] = fx === true ? [SAMPLER_FET_FX] : fx === false ? [] : fx;
  const needed = ['tp_mmb_midiin', 'tp_mmb_sampler', 'tp_mmb_out', 'tp_mmb_lfo', 'tp_mmb_cvmath', ...chain.map((f) => f.typeId)];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;

  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi  = fresh('tp_mmb_midiin');
  const smp = fresh('tp_mmb_sampler');
  const out = fresh('tp_mmb_out');
  // Aftertouch-vibrato: LFO × druk (mult) → ±0,04 V + pitch-wheel (sum) →
  // de gedeelde Bend-ingang, dus op alle stemmen — precies wat gewone
  // channel-aftertouch (Keystep) betekent.
  const lfo      = fresh('tp_mmb_lfo');
  const vibDepth = fresh('tp_mmb_cvmath');
  const bendSum  = fresh('tp_mmb_cvmath');
  // Optioneel: effecten tussen de sampler en OUT, stereo, in volgorde.
  const fxm = chain.map((f) => fresh(f.typeId));
  const name = `Sampler ×${N}${autoWah ? ' auto-wah' : ''}${chain.map((f) => ` + ${f.short}`).join('')}`;

  let offset = 0;
  const slot = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const slots = [slot(mi), slot(smp), slot(lfo), slot(vibDepth), slot(bendSum), ...fxm.map(slot), slot(out)];
  const rack: Rack = {
    id: uid('rack'), name,
    description: `MidiIn → SAMPLER (${N} stem-cellen als PolyGroup)${chain.map((f) => ` → ${f.label}`).join('')} → OUT. Eén bank, MIDI-in verdeelt de noten; LFO × aftertouch + pitch-wheel → Bend.`,
    rows: 1, hpPerRow: Math.max(64, offset + 4),
    slots,
    kind: 'physical',
    polyGroups: [{
      id: uid('poly'), label: 'SAMPLER', voiceCount: N,
      members: Array.from({ length: N }, (_, i) => ({
        kind: 'cell' as const, moduleId: smp.id, cellGroupId: 'voice', cellIndex: i,
      })),
    }],
  };

  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'),
    from: { moduleId: fm.id, portId: fp },
    to:   { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name,
    description: (autoWah
      ? `${N}-stemmige multisampler met per stem een MS-20 in de cel, gestuurd door de envelope-follower van diezelfde stem (env_k → cutoff_k). Laad een bank via 🎹 Multisample en speel hard en zacht.`
      : `${N}-stemmige multisampler. Laad een bank via 🎹 Multisample (Testbank, ⤒ .mmbs of een .sf2) en speel.`)
      + ' Druk na de aanslag (aftertouch) = vibrato; de pitch-wheel buigt alle stemmen.'
      + chain.map((f) => ` ${f.hint}`).join(''),
    voiceCount: N,
    rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', smp, 'voct_1'),
      c(mi, 'gate',  smp, 'gate_1'),
      c(mi, 'vel',   smp, 'vel_1'),
      // Aftertouch-vibrato + pitch-wheel op de gedeelde Bend (alle stemmen).
      c(lfo, 'out',      vibDepth, 'a'),
      c(mi,  'press',    vibDepth, 'b'),
      c(vibDepth, 'out', bendSum,  'a'),
      c(mi,  'cv_bend',  bendSum,  'b'),
      c(bendSum, 'out',  smp,      'bend'),
      ...stereoChain(c, smp, fxm, out),
      // Auto-wah: de follower van stem k stuurt het filter van stem k. Eén
      // kabel op de master-cel; polyExpand (en de sim) vouwt hem uit naar 1..N.
      ...(autoWah ? [c(smp, 'env_1', smp, 'cutoff_1')] : []),
    ],
    controlState: {
      [mi.id]:  { channel: 0, voiceCount: N, steal: 0 },
      [lfo.id]:      { rate: 5.5, wave: 0, depth: 1, bipolar: true, run: 0 },
      [vibDepth.id]: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 },
      [bendSum.id]:  { mode: 0, gain_a: 0.04, gain_b: 1, gain_c: 0, offset: 0 },
      [smp.id]: autoWah
        ? { bank: 0, level: 0.8, filter: 2, cutoff: 300, q: 0.55, fmode: 0, drive: 1.5, cv_amt: 4, env_rel: 150, env_sens: 12 }
        : { bank: 0, level: 0.8 },
      [out.id]: { level: 0.85 },
      ...Object.fromEntries(fxm.map((m, i) => [m.id, { ...chain[i]!.controls }])),
    },
    envelopes: [], lfos: [],
  };

  return {
    ...p,
    racks:        [...p.racks, rack],
    modules:      [...p.modules, mi, smp, lfo, vibDepth, bendSum, ...fxm, out],
    patches:      [...p.patches, patch],
    activeRackId:  rack.id,
    activePatchId: patch.id,
  };
}

/**
 * Tape strip ×N: Mellotron-mechanica om de samplerbank, als PolyGroup over de
 * acht cellen. MidiIn verdeelt de noten; aftertouch gaat naar Press (kussen),
 * de pitch-wheel naar Bend.
 */
export function seedTapeStripPolyPatch(project: ModularProject, voiceCount = 8): ModularProject {
  const N = Math.max(2, Math.min(8, Math.round(voiceCount)));
  const needed = ['tp_mmb_midiin', 'tp_mmb_tapestrip', 'tp_mmb_out'];
  const missing = needed.some((tid) => !project.moduleTypes.some((t) => t.id === tid));
  const p = missing ? seedInternals(project) : project;
  const fresh = (tid: string): ModuleInstance => {
    const proto = p.modules.find((m) => m.typeId === tid)!;
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const mi = fresh('tp_mmb_midiin');
  const tape = fresh('tp_mmb_tapestrip');
  const out = fresh('tp_mmb_out');
  const name = `Tape strip ×${N}`;
  let offset = 0;
  const slot = (m: ModuleInstance): RackSlot => {
    const s: RackSlot = { id: uid('slot'), moduleId: m.id, row: 0, hpOffset: offset };
    offset += m.visual.hpWidth;
    return s;
  };
  const slots = [slot(mi), slot(tape), slot(out)];
  const rack: Rack = {
    id: uid('rack'), name,
    description: `MidiIn → TAPE STRIP (${N} stem-cellen als PolyGroup) → OUT. De bank van de sampler, de mechanica van een Mellotron.`,
    rows: 1, hpPerRow: Math.max(64, offset + 4), slots, kind: 'physical',
    polyGroups: [{
      id: uid('poly'), label: 'TAPE STRIP', voiceCount: N,
      members: Array.from({ length: N }, (_, i) => ({ kind: 'cell' as const, moduleId: tape.id, cellGroupId: 'voice', cellIndex: i })),
    }],
  };
  const c = (fm: ModuleInstance, fp: string, tm: ModuleInstance, tp: string): PatchConnection => ({
    id: uid('conn'), from: { moduleId: fm.id, portId: fp }, to: { moduleId: tm.id, portId: tp },
  });
  const patch: Patch = {
    id: uid('patch'), name,
    description: `${N}-stemmige tape strip op de samplerbank (Bank-knop; in de simulator de bank uit de bankbalk). Houd een toets langer dan Length: de klank stopt. Speel snel dezelfde toets opnieuw: het bandje is nog niet terug. Aftertouch drukt het kussen aan, de pitch-wheel buigt alle stemmen.`,
    voiceCount: N, rackIds: [rack.id],
    connections: [
      c(mi, 'pitch', tape, 'voct_1'),
      c(mi, 'gate', tape, 'gate_1'),
      c(mi, 'vel', tape, 'vel_1'),
      c(mi, 'press', tape, 'press'),
      c(mi, 'cv_bend', tape, 'bend'),
      c(tape, 'out_l', out, 'l'),
      c(tape, 'out_r', out, 'r'),
    ],
    controlState: {
      [mi.id]: { channel: 0, voiceCount: N, steal: 0 },
      [tape.id]: { bank: 0, length: 8, return: 1, contact: 0.5, motor: 0.4, wow: 0.3, flutter: 0.3, wear: 0.3, level: 0.8 },
      [out.id]: { level: 0.85 },
    },
    envelopes: [], lfos: [],
  };
  return {
    ...p, racks: [...p.racks, rack], modules: [...p.modules, mi, tape, out],
    patches: [...p.patches, patch], activeRackId: rack.id, activePatchId: patch.id,
  };
}

/** De Mellotrons: een tape strip ×8 op een vaste serverbank (`simBanks`),
 *  zodat iedere bezoeker dezelfde fluit of strijkers hoort. Op de Teensy
 *  telt het banknummer: 7 is daar de shakuhachi, 3 de warm pad. */
export const MELLOTRONS = {
  fluit: { name: 'Mellotron fluit', nn: 7, file: 'gu-flute.mmbs',
    description: 'De fluit van de Mellotron M400: elke toets een bandje van acht seconden, dan stopt de klank. Speel legato en laat het bandje terugspoelen; Wow, Flutter en Wear zijn de ouderdom van de machine.' },
  strijkers: { name: 'Mellotron strijkers', nn: 3, file: 'gu-strings.mmbs',
    description: 'Strijkers op de Mellotron: akkoorden van hoogstens acht seconden, met de veer die het bandje terugtrekt als je loslaat. Houd een akkoord vast tot het valt; dat is de machine, geen fout.' },
} as const;

export function seedMellotronPatch(project: ModularProject, which: keyof typeof MELLOTRONS): ModularProject {
  const m = MELLOTRONS[which];
  const p = seedTapeStripPolyPatch(project, 8);
  const tape = p.modules.find((x) => x.typeId === 'tp_mmb_tapestrip' && p.patches.at(-1)!.connections.some((c) => c.from.moduleId === x.id))!;
  return {
    ...p,
    racks: p.racks.map((r) => (r.id === p.activeRackId ? { ...r, name: m.name } : r)),
    patches: p.patches.map((x) => (x.id !== p.activePatchId ? x : {
      ...x, name: m.name, description: m.description,
      controlState: { ...x.controlState, [tape.id]: { ...x.controlState[tape.id], bank: m.nn } },
      simBanks: { [String(m.nn)]: m.file },
    })),
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
      [plaits.id]: { engine: 11, harmonics: 0.5, timbre: 0.45, morph: 0.5, decay: 0.55, lpg: 0.6 },  // 11 = Grain — tokkelt mooi (heette hier string; klank ongewijzigd)
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
      [plaits.id]: { engine: 4, harmonics: 0.55, timbre: 0.5, morph: 0.4, decay: 0.7, lpg: 0.5 },  // 4 = 6-op FM C — draagt lang (heette hier additive; klank ongewijzigd)
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
