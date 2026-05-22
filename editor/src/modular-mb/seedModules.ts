// Voorbeeld-modules — handmatig gemodelleerd op basis van foto's van de
// eigenlijke modules. Geen logo's: alleen tekstlabels (copyright-veilig).
// Coördinaten in millimeter, top-left = (0,0).
//
// 6 modules:
//   1. Hexinverter Mutant Snare        12 HP  PCB-zwart + oranje accenten
//   2. Mutable Instruments Elements    34 HP  mi-cream, kleurcode wit/roze/cyaan
//   3. Mutable Instruments Shelves+Exp 16 HP  EQ-filter incl. expander-jacks
//   4. Analogue Systems RS-110 MkII    10 HP  aluminium multimode-filter
//   5. Erica Synths Fusion VCO         22 HP  PCB-zwart met 2 buizen
//   6. Malekko Richter Oscillator II    8 HP  aluminium dual-VCO
//
// Aanroep via "✨ Voorbeelden" in de project-balk.

import {
  type ModularProject, type ModuleType, type ModuleInstance, type RackSlot,
  type Rack, type Patch, type PatchConnection, type ControlValue,
  MM_PER_HP, PANEL_HEIGHT_MM,
} from './types';
import { uid } from './store';

// ── helpers ────────────────────────────────────────────────────────────

const W = (hp: number) => hp * MM_PER_HP;

function knob(id: string, label: string, x: number, y: number,
              opts: Partial<{ min: number; max: number; def: number; size: 'small'|'medium'|'large'; color: string; style: string; unit: string;
                              ticks: { every?: number; highlight?: number[] } }> = {}) {
  return {
    control: {
      kind: 'knob' as const, id, label,
      min: opts.min ?? 0, max: opts.max ?? 10, defaultValue: opts.def ?? 5,
      size: (opts.size ?? 'medium') as 'small'|'medium'|'large',
      color: opts.color, style: (opts.style as never) ?? 'generic',
      unit: opts.unit,
      ticks: opts.ticks,
    },
    placement: { x, y },
  };
}
function inPort(id: string, name: string, signal: 'cv'|'gate'|'trigger'|'audio'|'midi', x: number, y: number) {
  return { port: { id, name, signalType: signal, direction: 'in' as const }, placement: { x, y, labelPos: 'below' as const } };
}
function outPort(id: string, name: string, signal: 'cv'|'gate'|'trigger'|'audio'|'midi', x: number, y: number) {
  return { port: { id, name, signalType: signal, direction: 'out' as const }, placement: { x, y, labelPos: 'below' as const } };
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
                 opts: Partial<{ label: string; digits: number; style: 'led'|'oled'; bindTo: string;
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

      toggle('loop',    'Loop',  w*0.30, 96),
      sw    ('curve',   'Curve', w*0.70, 96, ['Lin','Exp','Log'], 1),

      inPort ('gate',    'Gate', 'gate',   w*0.20, 112),
      inPort ('trig',    'Trig', 'trigger',w*0.50, 112),
      outPort('cv_out',  'Env',  'cv',     w*0.80, 112),
      outPort('eoc',     'EOC',  'trigger',w*0.50, 122),
    ],
    notes: 'Interne MMB envelope. Loop=on maakt er een quasi-LFO van; curve schakelt tussen lineair/exp/log per fase.',
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

      inPort ('voct', '1V/Oct', 'cv',    w*0.20, 104),
      inPort ('fm',   'FM',     'cv',    w*0.50, 104),
      inPort ('sync', 'Sync',   'trigger', w*0.80, 104),
      outPort('out',  'Out',    'audio', w/2,    118),
    ],
    notes: 'Interne MMB VCO. \'wave\' kiest sine/triangle/sawtooth/square; coarse+fine zijn semitonen+cent offsets t.o.v. de inkomende V/Oct.',
  });
}

// 5. MMB VCF — 6 HP. Cutoff/Q/type-switch, audio-in, cv-cutoff-in, audio-out.
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
      knob('cutoff', 'Cutoff', w/2, 24, { size: 'large', min: 20, max: 18000, def: 2000, unit: 'Hz', color: '#f9fafb' }),
      knob('q',      'Q',      w*0.30, 54, { size: 'medium', min: 0.1, max: 12, def: 0.7, color: '#f9fafb' }),
      knob('cv_amt', 'CV amt', w*0.70, 54, { size: 'medium', min: 0, max: 1, def: 1, color: '#f9fafb' }),
      sw  ('type',   'Type',   w/2,    78, ['LP','HP','BP'], 0),

      inPort ('in',   'In',     'audio', w*0.25, 104),
      inPort ('cv',   'Cut CV', 'cv',    w*0.75, 104),
      outPort('out',  'Out',    'audio', w/2,    118),
    ],
    notes: 'Interne MMB filter. Cutoff-knop is de basis; CV-input moduleert via cv_amt (1V/oct-achtig, ~5 octaven full-swing).',
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

// 7b. MMB MIDI-In — 6 HP. Breakout-module die de actieve MIDI-bron
//     (USB-keyboard, screen-keyboard of test-sequence) splitst in een
//     CV-pitch en een Gate. Mono / last-note. Channel-knop is voor nu
//     informatief; de engine luistert nog naar alle kanalen.
function mmbMidiIn() {
  const w = W(6);
  return assemble({
    typeId: 'tp_mmb_midiin',
    categoryId: 'utility',
    variant: 'MIDI-to-CV breakout',
    brand: 'MMB', model: 'MIDI-IN',
    hp: 6, texture: 'pcb-black', baseColor: '#111827', internal: true,
    texts: [
      { x: w/2, y: 8,   text: 'MIDI-IN', fontSize: 2.2, color: '#f9fafb', align: 'middle' },
      { x: w/2, y: 14,  text: 'mono · last-note', fontSize: 1.2, color: '#9ca3af', align: 'middle' },
      { x: w/2, y: 126, text: 'MMB',     fontSize: 1.6, color: '#f9fafb', align: 'middle' },
    ],
    items: [
      knob('channel', 'Ch', w*0.30, 35, { size: 'small', min: 0, max: 16, def: 0, unit: '0=all', color: '#f9fafb' }),
      // Live display: kanaal-nummer (0 = all). Mirrort de Ch-knop.
      display('chDisp', w*0.70, 35, { digits: 3, style: 'led', bindTo: 'channel', format: 'int' }),
      sw  ('mode',    'Mode', w*0.30, 60, ['mono','legato','last'], 0),
      // Activity-LED: licht op zodra de simulator een MIDI-bron stuurt (later
      // koppelbaar aan engine-state; nu altijd "klaar").
      led('act', w*0.70, 60, { label: 'Act', color: '#22c55e', size: 'medium' }),
      outPort('pitch', 'V/Oct', 'cv',   w*0.30, 95),
      outPort('gate',  'Gate',  'gate', w*0.70, 95),
    ],
    notes: 'Zet inkomende MIDI-noten (USB / screen-keyboard / test-sequence) om in CV (V/Oct) en Gate. De MIDI-bron kies je in het Simulatie-paneel; deze module heeft géén MIDI-poort op de front (er bestaat geen "MIDI-in jack" in modulair-land — alles loopt via de brain). Sluit pitch op een VCO\u2019s voct aan en gate op een envelope.',
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
      knob('time',     'Time',  w*0.30, 30, { size: 'medium', min: 0.01, max: 2.0, def: 0.30, unit: 's',  color: '#f9fafb' }),
      knob('feedback', 'Fbk',   w*0.70, 30, { size: 'medium', min: 0,    max: 0.95,def: 0.45, color: '#f9fafb' }),
      knob('mix',      'Mix',   w*0.30, 70, { size: 'medium', min: 0,    max: 1,   def: 0.35, color: '#f9fafb' }),
      toggle('tempo_sync', 'Sync', w*0.70, 70, false),
      inPort ('in',  'In',  'audio', w*0.30, 110),
      outPort('out', 'Out', 'audio', w*0.70, 110),
    ],
    notes: 'Feedback-delay (Tone.FeedbackDelay). Mooi achter een VCA. Sync-toggle haakt later in op de master-clock.',
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
      inPort ('in',  'In',  'audio', w*0.30, 110),
      outPort('out', 'Out', 'audio', w*0.70, 110),
    ],
    notes: 'Phaser (Tone.Phaser). Klassieke sweep-modulatie; mooi achter een VCF of als send.',
  });
}

// ── public entry ───────────────────────────────────────────────────────

/** Plaats interne modules in (en creëer eventueel) de `rack_internal`. */
export function seedInternals(project: ModularProject): ModularProject {
  const all = [mmbAhdsr(), mmbLfo(), mmbSh(), mmbVco(), mmbVcf(), mmbVca(), mmbOut(), mmbMidiIn(), mmbSeq8(), mmbNoise(), mmbEcho(), mmbPhaser()];
  const newTypes = all.map((x) => x.type);
  const newModules = all.map((x) => x.module);

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

  return {
    ...project,
    moduleTypes: [...project.moduleTypes, ...newTypes],
    modules:     [...project.modules, ...newModules],
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
    [mi.id]:  { channel: 0, mode: 0 },
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
