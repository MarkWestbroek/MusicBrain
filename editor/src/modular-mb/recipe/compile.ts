// Recept-compiler (ED-RC-1) — zie doc/plans/patch-recept.md.
//
// `compileRecipe(project, recipe)` vertaalt een PatchRecipe naar een lijst
// PatchOps; `applyOps(project, ops)` past ze toe. De compiler zendt bewust
// ops uit en geen eindproject: dezelfde lijst is seed, regressietest,
// replay én (later) de demonstratiemodus met uitleg per stap.
//
// Layout en bedrading volgen `seedPolyVoicePatch` (seedModules.ts), zodat
// de pariteitstest de compiler tegen de bestaande seed kan houden:
//   rij 0  = MIDI-in · master-keten · mixer · OUT · vibrato-sectie · bus-FX
//   rij v  = stem v (followers), recht onder de master
//   kabels = alleen master-kabels; de flatten (polyExpand) doet de rest.

import {
  type ModularProject, type ModuleType, type ModuleInstance, type PatchConnection,
  type PolyGroup, type ControlValue, type RackSlot,
  canConnect, resolvePorts,
} from '../types';
import { uid } from '../store';
import { seedInternals } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';
import {
  resolveTypeId, suggestTypeIds, shortName, playableControls, portRoles, CATALOG,
  type PortRoles,
} from './catalog';
import {
  type PatchRecipe, type RecipeModule, type PatchOp, type CompileResult, RecipeError,
} from './types';
import { familyOf } from './classify';

// ── helpers ─────────────────────────────────────────────────────────────

interface Resolved {
  typeId: string;
  type: ModuleType;
  roles: PortRoles;
  hp: number;
  controls: Record<string, ControlValue>;
}

/** Één geplaatste module in de op-lijst (id + type + rollen). */
interface Placed extends Resolved { id: string; }

const MI_TYPE = 'tp_mmb_midiin';
const OUT_TYPE = 'tp_mmb_out';
const ENV_TYPE = 'tp_mmb_ahdsr';
const VCA_TYPE = 'tp_mmb_vca';
const LFO_TYPE = 'tp_mmb_lfo';
const MATH_TYPE = 'tp_mmb_cvmath';

function mixerTypeFor(channels: number): string {
  return channels > 8 ? 'tp_mmb_mixer16' : channels > 4 ? 'tp_mmb_mixer8' : 'tp_mmb_mixer';
}

/**
 * Knopstanden van buiten (recept met `controls`, dus ook een taalmodel)
 * tegen het type houden: onbekende id's vervallen, getallen worden op het
 * bereik geklemd, switch-standen op 0..n-1, toggles worden booleans.
 * Niets van wat hier binnenkomt mag ongefilterd naar de wasm of de Teensy.
 */
export function sanitizeControls(type: ModuleType, raw: Record<string, unknown>, warnings: string[]): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (const [id, v] of Object.entries(raw)) {
    const c = type.controls.find((x) => x.id === id);
    if (!c || c.kind === 'display' || c.kind === 'led') { warnings.push(`${type.variant}: onbekende knop "${id}" genegeerd.`); continue; }
    if (c.kind === 'toggle' || c.kind === 'button') { out[id] = v === true || v === 1 || v === 'true' || v === 'on' || v === 'aan'; continue; }
    let n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (c.kind === 'switch' && !Number.isFinite(n)) {
      // Standnaam ("Aan", "LP") of aan/uit-woord voor een tweestandenschakelaar.
      const s = String(v).trim().toLowerCase();
      const byLabel = c.positions.findIndex((p) => p.toLowerCase() === s);
      if (byLabel >= 0) n = byLabel;
      else if (c.positions.length === 2 && ['on', 'aan', 'true', 'yes'].includes(s)) n = 1;
      else if (c.positions.length === 2 && ['off', 'uit', 'false', 'no'].includes(s)) n = 0;
      else if (v === true || v === false) n = v ? 1 : 0;
    }
    if (!Number.isFinite(n)) { warnings.push(`${type.variant}: "${id}" = ${JSON.stringify(v)} is geen getal; genegeerd.`); continue; }
    if (c.kind === 'switch') {
      const idx = Math.max(0, Math.min(c.positions.length - 1, Math.round(n)));
      if (idx !== n) warnings.push(`${type.variant}: "${id}" ${n} → stand ${idx} (${c.positions[idx]}).`);
      out[id] = idx;
    } else if ('min' in c && 'max' in c && typeof c.min === 'number' && typeof c.max === 'number') {
      const clamped = Math.max(c.min, Math.min(c.max, n));
      if (clamped !== n) warnings.push(`${type.variant}: "${id}" ${n} buiten ${c.min}..${c.max} → ${clamped}.`);
      out[id] = clamped;
    } else {
      out[id] = n;
    }
  }
  return out;
}

function isStereoIn(r: PortRoles): boolean  { return !!(r.audioIn.left && r.audioIn.right); }
function isStereoOut(r: PortRoles): boolean { return !!(r.audioOut.left && r.audioOut.right); }

// ── compile ─────────────────────────────────────────────────────────────

export function compileRecipe(project: ModularProject, recipe: PatchRecipe): CompileResult {
  const warnings: string[] = [];
  const ops: PatchOp[] = [];

  // Opzoekomgeving mét internals; de op `seedInternals` wordt alleen
  // uitgezonden als het project een benodigd type mist.
  const env = seedInternals(project);
  const types = env.moduleTypes;
  const protoOf = (typeId: string): ModuleInstance => {
    const m = env.modules.find((x) => x.typeId === typeId);
    if (!m) throw new RecipeError(`Geen prototype-module voor type ${typeId}.`);
    return m;
  };
  const resolve = (ref: RecipeModule, what: string): Resolved => {
    const name = typeof ref === 'string' ? ref : ref.type;
    const typeId = resolveTypeId(name, types);
    if (!typeId) {
      const sug = suggestTypeIds(name).map((t) => shortName(t, types));
      throw new RecipeError(
        `Onbekende module "${name}" (${what}).` + (sug.length ? ` Bedoelde je: ${sug.join(', ')}?` : ''),
        sug);
    }
    const type = types.find((t) => t.id === typeId)!;
    const overrides = typeof ref === 'string' ? {} : sanitizeControls(type, ref.controls ?? {}, warnings);
    return {
      typeId, type, roles: portRoles(type), hp: protoOf(typeId).visual.hpWidth,
      controls: { ...playableControls(type), ...overrides },
    };
  };
  const fixed = (typeId: string, controls: Record<string, ControlValue>): Resolved => {
    const type = types.find((t) => t.id === typeId);
    if (!type) throw new RecipeError(`MMB-module ${typeId} ontbreekt in de catalogus.`);
    return { typeId, type, roles: portRoles(type), hp: protoOf(typeId).visual.hpWidth, controls };
  };

  // 1. Recept uitlezen en valideren.
  const N = Math.max(1, Math.min(16, Math.round(recipe.voices ?? 1)));
  const src = resolve(recipe.source, 'bron');
  if (!src.roles.audioOut.mono && !src.roles.audioOut.left) {
    throw new RecipeError(`${shortName(src.typeId, types)} heeft geen audio-uitgang en kan geen stemkern zijn.`);
  }
  const flt = recipe.filter === null ? null : resolve(recipe.filter ?? 'vcf', 'filter');
  if (flt && !(flt.roles.audioIn.mono && flt.roles.audioOut.mono)) {
    throw new RecipeError(`${shortName(flt.typeId, types)} heeft geen mono audio in/uit en past niet als filter per stem.`);
  }
  const vfx = (recipe.voiceFx ?? []).map((r) => resolve(r, 'effect per stem'));
  for (const f of vfx) {
    if (!(f.roles.audioIn.mono && f.roles.audioOut.mono)) {
      throw new RecipeError(`${shortName(f.typeId, types)} heeft geen mono audio in/uit en past niet als effect per stem (probeer het op de bus).`);
    }
  }
  const bus = (recipe.bus ?? []).map((r) => resolve(r, 'bus-effect'));
  for (const b of bus) {
    const stereo = isStereoIn(b.roles) && isStereoOut(b.roles);
    const mono   = !!(b.roles.audioIn.mono && b.roles.audioOut.mono);
    if (!stereo && !mono) {
      throw new RecipeError(`${shortName(b.typeId, types)} heeft geen audio in/uit en past niet op de bus.`);
    }
  }

  const ampEnv    = recipe.ampEnv ?? true;
  const velocity  = recipe.velocity ?? true;
  const filterEnv = flt ? (recipe.filterEnv ?? true) : false;
  if (!flt && recipe.filterEnv) warnings.push('Geen filter, dus geen filter-envelope.');
  let voiceLfo = recipe.voiceLfo ?? false;
  if (voiceLfo && !(flt && flt.roles.cv)) {
    warnings.push('LFO per stem vraagt een filter met cv-ingang; overgeslagen.');
    voiceLfo = false;
  }
  const vibratoTarget = src.roles.tune ? 'tune' : src.roles.modulation ? 'modulation' : null;
  let vibrato = recipe.vibrato ?? vibratoTarget !== null;
  if (vibrato && !vibratoTarget) {
    warnings.push(`${shortName(src.typeId, types)} heeft geen tune- of modulation-ingang; vibrato overgeslagen.`);
    vibrato = false;
  }
  const hasVca = ampEnv || velocity;
  const srcStereo = !src.roles.audioOut.mono && isStereoOut(src.roles);
  const chainEmpty = !flt && vfx.length === 0 && !hasVca;
  const stereoDirect = srcStereo && chainEmpty && N === 1;   // L/R op twee mixerkanalen
  if (srcStereo && !stereoDirect) {
    warnings.push(`${shortName(src.typeId, types)} is stereo; in een stemketen wordt alleen de L-uitgang gebruikt.`);
  }

  // 2. Modules benoemen (id's nu al, zodat de ops deterministisch zijn).
  const mk = (r: Resolved): Placed => ({ ...r, id: uid('mod') });
  const envAmpCtl = { attack: 8,  hold: 0, decay: 300, sustain: 0.7, release: 500, loop: false, curve: 1 };
  const envFltCtl = { attack: 20, hold: 0, decay: 600, sustain: 0.3, release: 800, loop: false, curve: 1, retrig: true };
  const velMathCtl = { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 };
  const lfoVCtl    = { rate: 0.7, wave: 1, depth: 1, bipolar: true, run: 0 };
  const lfoSumCtl  = { mode: 0, gain_a: 1, gain_b: 0.25, gain_c: 0, offset: 0 };

  // Stemketen: volgorde = kolomvolgorde in het rack.
  type SlotKey = 'source' | 'envFlt' | 'lfoV' | 'lfoSum' | 'filter' | `fx${number}` | 'envAmp' | 'velMath' | 'vca';
  interface Slot { key: SlotKey; label: string; make: () => Placed; note?: string }
  const slots: Slot[] = [
    { key: 'source', label: shortName(src.typeId, types), make: () => mk(src),
      note: `${shortName(src.typeId, types)} is de stemkern: hij maakt de klank per noot.` },
    ...(filterEnv ? [{ key: 'envFlt' as const, label: 'envFlt', make: () => mk(fixed(ENV_TYPE, envFltCtl)),
      note: 'Een tweede envelope sweept de filter-cutoff per noot.' }] : []),
    ...(voiceLfo ? [
      { key: 'lfoV' as const,   label: 'LFO',    make: () => mk(fixed(LFO_TYPE, lfoVCtl)),
        note: 'Een LFO per stem laat het filter langzaam wiebelen.' },
      { key: 'lfoSum' as const, label: 'LfoSum', make: () => mk(fixed(MATH_TYPE, lfoSumCtl)),
        note: 'CV-math telt envelope en LFO op vóór ze naar de cutoff gaan.' },
    ] : []),
    ...(flt ? [{ key: 'filter' as const, label: shortName(flt.typeId, types), make: () => mk(flt),
      note: `${shortName(flt.typeId, types)} vormt de klank: cutoff en resonantie.` }] : []),
    ...vfx.map((f, i) => ({ key: `fx${i}` as const, label: shortName(f.typeId, types), make: () => mk(f),
      note: `${shortName(f.typeId, types)} zit per stem tussen filter en VCA.` })),
    ...(ampEnv ? [{ key: 'envAmp' as const, label: 'envAmp', make: () => mk(fixed(ENV_TYPE, envAmpCtl)),
      note: 'De amp-envelope opent de VCA bij elke noot (aanslag, uitsterven).' }] : []),
    ...(ampEnv && velocity ? [{ key: 'velMath' as const, label: 'CvMath', make: () => mk(fixed(MATH_TYPE, velMathCtl)),
      note: 'CV-math vermenigvuldigt envelope × velocity: harder spelen = luider.' }] : []),
    ...(hasVca ? [{ key: 'vca' as const, label: 'VCA', make: () => mk(fixed(VCA_TYPE, { gain: 0, resp: 0 })),
      note: 'De VCA is de volumekraan van de stem.' }] : []),
  ];
  const voices: Record<string, Placed>[] = Array.from({ length: N }, () => {
    const v: Record<string, Placed> = {};
    for (const s of slots) v[s.key] = s.make();
    return v;
  });
  const master = voices[0]!;

  const channels = stereoDirect ? 2 : N;
  const mi    = mk(fixed(MI_TYPE, { channel: 0, priority: 0, steal: 0, legato: 0, voiceCount: N }));
  const mixerType = fixed(mixerTypeFor(channels), {});
  const mixerCtl: Record<string, ControlValue> = {};
  for (const c of mixerType.type.controls) {
    const m = /^(vol|pan)(\d+)$/.exec(c.id);
    if (!m) continue;
    const ch = Number(m[2]);
    if (m[1] === 'vol') mixerCtl[c.id] = ch <= channels ? 0.8 : 0;
    else mixerCtl[c.id] = stereoDirect ? (ch === 1 ? -1 : ch === 2 ? 1 : 0) : 0;
  }
  const mixer = mk({ ...mixerType, controls: mixerCtl });
  const out   = mk(fixed(OUT_TYPE, { level: 0.8 }));
  const lfo      = vibrato ? mk(fixed(LFO_TYPE,  { rate: 5.5, wave: 0, depth: 1, bipolar: true, run: 0 })) : null;
  const vibDepth = vibrato ? mk(fixed(MATH_TYPE, { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 })) : null;
  const bendSum  = vibrato && vibratoTarget === 'tune'
    ? mk(fixed(MATH_TYPE, { mode: 0, gain_a: 0.04, gain_b: 1, gain_c: 0, offset: 0 })) : null;
  // Bus: stereo module = 1 instantie, mono module = L/R-paar.
  interface BusStage { left: Placed; right: Placed | null; short: string }
  const busStages: BusStage[] = bus.map((b) => {
    const stereo = isStereoIn(b.roles) && isStereoOut(b.roles);
    const short = shortName(b.typeId, types);
    if (stereo) return { left: mk(b), right: null, short };
    const widen = CATALOG[b.typeId]?.widen;
    return { left: mk(b), right: mk({ ...b, controls: widen ? widen(b.controls) : { ...b.controls } }), short };
  });

  // 3. Layout.
  const rackId = uid('rack');
  const patchId = uid('patch');
  const colOffset: Record<string, number> = {};
  let offset = mi.hp;
  for (const s of slots) { colOffset[s.key] = offset; offset += master[s.key]!.hp; }
  const mixerOffset = offset; offset += mixer.hp;
  const outOffset   = offset; offset += out.hp;
  const globals: Placed[] = [lfo, vibDepth, bendSum].filter((x): x is Placed => x !== null);
  const globalOffsets = globals.map((g) => { const o = offset; offset += g.hp; return o; });
  const busFlat: Placed[] = busStages.flatMap((s) => (s.right ? [s.left, s.right] : [s.left]));
  const busOffsets = busFlat.map((b) => { const o = offset; offset += b.hp; return o; });
  const rowHp = offset;

  // 4. Ops.
  const needed = new Set<string>([mi.typeId, mixer.typeId, out.typeId,
    ...slots.map((s) => master[s.key]!.typeId), ...globals.map((g) => g.typeId), ...busFlat.map((b) => b.typeId)]);
  const missing = [...needed].filter((t) => !project.moduleTypes.some((x) => x.id === t));
  if (missing.length) {
    ops.push({ op: 'seedInternals', note: 'De MMB-modules (VCO, VCF, envelopes, mixer, …) worden in het project gezet.' });
  }

  const chainText = slots.map((s) => s.label).join(' → ');
  const busText = busStages.map((s) => s.short).join(' → ');
  const summary = `${N === 1 ? 'mono' : `${N}× poly`} · ${chainText}` + (busText ? ` · bus: ${busText}` : '');
  const name = recipe.name ?? (N === 1
    ? `Mono ${shortName(src.typeId, types)}${flt ? ' → ' + shortName(flt.typeId, types) : ''}`
    : `${N}-stemmige ${shortName(src.typeId, types)}${flt ? ' → ' + shortName(flt.typeId, types) : ''}`)
    + (busText ? ` · ${busText}` : '');

  ops.push({
    op: 'addRack',
    rack: {
      id: rackId, name: `${name} rack`,
      description: `Recept: ${summary}. Rij 0 = master + mixer/out${N > 1 ? `, stemmen 2..${N} in rij 1..${N - 1}` : ''}.`,
      rows: Math.max(1, N), hpPerRow: Math.max(64, rowHp + 4), kind: 'physical',
    },
    note: `Een nieuw rack met ${N === 1 ? 'één rij' : `${N} rijen: één per stem`}.`,
  });

  const addMod = (m: Placed, row: number, hpOffset: number, note?: string): void => {
    ops.push({ op: 'addModule', moduleId: m.id, slotId: uid('slot'), typeId: m.typeId, rackId, row, hpOffset, note });
  };
  addMod(mi, 0, 0, 'MIDI-in is de bron van toonhoogte, gate en velocity per noot.');
  voices.forEach((v, vi) => {
    for (const s of slots) {
      addMod(v[s.key]!, vi, colOffset[s.key]!,
        vi === 0 ? s.note : vi === 1 ? `Stem ${vi + 1}: dezelfde keten, recht onder de master.` : undefined);
    }
  });
  addMod(mixer, 0, mixerOffset, `De mixer telt de ${N === 1 ? 'stem' : `${N} stemmen`} op tot één stereo signaal.`);
  addMod(out,   0, outOffset,   'OUT is de audio-uitgang van de brain.');
  globals.forEach((g, i) => addMod(g, 0, globalOffsets[i]!,
    i === 0 ? 'De vibrato-sectie: LFO × modwheel, plus pitch-bend.' : undefined));
  busFlat.forEach((b, i) => addMod(b, 0, busOffsets[i]!,
    i === 0 ? 'Bus-effecten staan achter de mixer en werken op alle stemmen samen.' : undefined));

  if (N >= 2) {
    for (const s of slots) {
      const group: PolyGroup = {
        id: uid('poly'), label: s.label, voiceCount: N,
        members: voices.map((v) => ({ kind: 'module' as const, moduleId: v[s.key]!.id })),
      };
      ops.push({ op: 'addPolyGroup', rackId, group,
        note: s.key === 'source'
          ? `De ${N} ${s.label}-modules worden één poly-groep: je patcht alleen de master, de rest volgt.` : undefined });
    }
  }

  ops.push({
    op: 'addPatch',
    patch: {
      id: patchId, name,
      description: (N >= 2
        ? `Eén master voice-keten + PolyGroups (×${N}); de flatten expandeert naar ${N} stemmen via MidiIn pitch/gate/vel en ${slots[slots.length - 1]!.label}→mixer in1..in${N}.`
        : 'Monofone voice-keten (geen PolyGroups): MidiIn → bron → … → mixer → OUT.')
        + ` Recept: ${summary}.`,
      voiceCount: N, rackIds: [rackId],
      folder: familyOf(src.typeId),   // map in de Patches-tab: VCO, Wavetable, Physical modelling, …
    },
    note: 'Een nieuwe patch: de kabels en knopstanden komen hierin.',
  });

  const c = (from: Placed, fromPort: string | undefined, to: Placed, toPort: string | undefined, note?: string): void => {
    if (!fromPort || !toPort) {
      throw new RecipeError(`Interne fout: poort ontbreekt (${from.typeId}.${fromPort} → ${to.typeId}.${toPort}).`);
    }
    const connection: PatchConnection = {
      id: uid('conn'),
      from: { moduleId: from.id, portId: fromPort },
      to:   { moduleId: to.id,   portId: toPort },
    };
    ops.push({ op: 'connect', patchId, connection, note });
  };

  // Audio: bron → filter → fx… → VCA → mixer.in1 (stem v → in(v)).
  const audioNodes: Placed[] = [
    ...(flt ? [master.filter!] : []),
    ...vfx.map((_, i) => master[`fx${i}`]!),
    ...(hasVca ? [master.vca!] : []),
  ];
  const srcOut = src.roles.audioOut.mono ?? src.roles.audioOut.left;
  if (stereoDirect) {
    c(master.source!, src.roles.audioOut.left,  mixer, 'in1', 'De stereo bron gaat rechtstreeks naar mixerkanaal 1 (L) …');
    c(master.source!, src.roles.audioOut.right, mixer, 'in2', '… en kanaal 2 (R).');
  } else {
    let prev: { m: Placed; port: string | undefined } = { m: master.source!, port: srcOut };
    for (const node of audioNodes) {
      c(prev.m, prev.port, node, node.roles.audioIn.mono,
        node === audioNodes[0] ? 'Het audiopad: bron → filter → VCA.' : undefined);
      prev = { m: node, port: node.roles.audioOut.mono };
    }
    c(prev.m, prev.port, mixer, 'in1',
      N > 1 ? 'De master gaat naar mixerkanaal 1; stem v komt vanzelf op kanaal v.' : 'Naar mixerkanaal 1.');
  }

  // Events: pitch/gate/vel (voice-poorten → fan-out per stem).
  if (src.roles.pitch) c(mi, 'pitch', master.source!, src.roles.pitch, 'Toonhoogte (V/oct) van MIDI-in naar de bron.');
  else warnings.push(`${shortName(src.typeId, types)} heeft geen voct-ingang; toonhoogte niet bedraad.`);
  if (ampEnv)    c(mi, 'gate', master.envAmp!, 'gate', 'De gate start de amp-envelope.');
  if (filterEnv) c(mi, 'gate', master.envFlt!, 'gate');
  if (src.roles.gate)     c(mi, 'gate', master.source!, src.roles.gate, 'De bron heeft zelf een gate (pluk/noteOn).');
  if (src.roles.vel)      c(mi, 'vel',  master.source!, src.roles.vel);
  if (src.roles.strength) c(mi, 'vel',  master.source!, src.roles.strength, 'Velocity → aanslagkracht van het model.');

  // Vibrato.
  if (vibrato && lfo && vibDepth) {
    c(lfo, 'out',    vibDepth, 'a', 'LFO × modwheel: het wiel bepaalt de vibrato-diepte.');
    c(mi,  'cv_mod', vibDepth, 'b');
    if (vibratoTarget === 'tune' && bendSum) {
      c(vibDepth, 'out',     bendSum, 'a', 'Vibrato en pitch-bend worden opgeteld …');
      c(mi,       'cv_bend', bendSum, 'b');
      c(bendSum,  'out',     master.source!, src.roles.tune, '… en gaan samen naar de tune-ingang van elke stem.');
    } else {
      c(vibDepth, 'out', master.source!, src.roles.modulation, 'Naar de modulation-ingang van het model.');
    }
  }

  // Filter-modulatie.
  if (flt && flt.roles.cv) {
    if (filterEnv && voiceLfo) {
      c(master.envFlt!, 'cv_out', master.lfoSum!, 'a', 'Envelope + LFO samen op de cutoff.');
      c(master.lfoV!,   'out',    master.lfoSum!, 'b');
      c(master.lfoSum!, 'out',    master.filter!, flt.roles.cv);
    } else if (filterEnv) {
      c(master.envFlt!, 'cv_out', master.filter!, flt.roles.cv, 'De filter-envelope sweept de cutoff.');
    } else if (voiceLfo) {
      c(master.lfoV!, 'out', master.filter!, flt.roles.cv);
    }
  } else if (flt && filterEnv) {
    warnings.push(`${shortName(flt.typeId, types)} heeft geen cv-ingang; filter-envelope niet bedraad.`);
  }

  // Amp: envelope × velocity → VCA.
  if (hasVca) {
    if (ampEnv && velocity) {
      c(master.envAmp!,  'cv_out', master.velMath!, 'a', 'Envelope × velocity …');
      c(mi,              'vel',    master.velMath!, 'b');
      c(master.velMath!, 'out',    master.vca!, 'cv', '… stuurt de VCA.');
    } else if (ampEnv) {
      c(master.envAmp!, 'cv_out', master.vca!, 'cv', 'De envelope stuurt de VCA.');
    } else {
      c(mi, 'vel', master.vca!, 'cv', 'Velocity stuurt de VCA rechtstreeks (geen envelope).');
    }
  }

  // Bus: mixer → stages → OUT.
  let busL: { m: Placed; port: string } = { m: mixer, port: 'out_l' };
  let busR: { m: Placed; port: string } = { m: mixer, port: 'out_r' };
  for (const st of busStages) {
    if (st.right) {
      c(busL.m, busL.port, st.left,  st.left.roles.audioIn.mono,  `${st.short} als L/R-paar op de bus.`);
      c(busR.m, busR.port, st.right, st.right.roles.audioIn.mono);
      busL = { m: st.left,  port: st.left.roles.audioOut.mono! };
      busR = { m: st.right, port: st.right.roles.audioOut.mono! };
    } else {
      c(busL.m, busL.port, st.left, st.left.roles.audioIn.left,  `${st.short} (stereo) op de bus.`);
      c(busR.m, busR.port, st.left, st.left.roles.audioIn.right);
      busL = { m: st.left, port: st.left.roles.audioOut.left! };
      busR = { m: st.left, port: st.left.roles.audioOut.right! };
    }
  }
  c(busL.m, busL.port, out, 'l', 'Stereo naar OUT.');
  c(busR.m, busR.port, out, 'r');

  // Knopstanden.
  const setCtl = (m: Placed, note?: string): void => {
    ops.push({ op: 'setControls', patchId, moduleId: m.id, values: { ...m.controls }, note });
  };
  setCtl(mi, `MIDI-in op ${N} ${N === 1 ? 'stem' : 'stemmen'}, alle kanalen.`);
  setCtl(mixer, 'Mixerkanalen van de stemmen open, de rest dicht.');
  setCtl(out);
  for (const g of globals) setCtl(g);
  for (const v of voices) for (const s of slots) setCtl(v[s.key]!);
  for (const b of busFlat) setCtl(b);

  ops.push({ op: 'activate', rackId, patchId, note: 'Klaar: rack en patch zijn actief. Speel in de Simulatie-tab.' });

  // 5. Controle: pas toe op de opzoekomgeving en laat de flatten erover lopen.
  validateOps(env, ops, patchId);

  return { ops, warnings, summary, rackId, patchId };
}

/** Controleer poorten, richting en signaaltypes van alle connect-ops en laat
 *  de poly-flatten over het resultaat lopen. Gooit RecipeError. */
export function validateOps(project: ModularProject, ops: PatchOp[], patchId?: string): void {
  const built = applyOps(project, ops);
  const types = built.moduleTypes;
  const modById = new Map(built.modules.map((m) => [m.id, m]));
  for (const op of ops) {
    if (op.op !== 'connect') continue;
    const { from, to } = op.connection;
    const fm = modById.get(from.moduleId), tm = modById.get(to.moduleId);
    if (!fm || !tm) throw new RecipeError(`Kabel naar onbekende module (${from.moduleId} → ${to.moduleId}).`);
    const fp = resolvePorts(fm, types).find((p) => p.id === from.portId && p.direction === 'out');
    const tp = resolvePorts(tm, types).find((p) => p.id === to.portId && p.direction === 'in');
    if (!fp) throw new RecipeError(`${fm.typeId} heeft geen uitgang "${from.portId}".`);
    if (!tp) throw new RecipeError(`${tm.typeId} heeft geen ingang "${to.portId}".`);
    if (!canConnect(fp.signalType, tp.signalType)) {
      throw new RecipeError(`${fm.typeId}.${from.portId} (${fp.signalType}) past niet op ${tm.typeId}.${to.portId} (${tp.signalType}).`);
    }
  }
  const patch = built.patches.find((p) => p.id === (patchId ?? built.activePatchId));
  if (patch) expandPatchConnections(patch, built);
}

// ── apply ───────────────────────────────────────────────────────────────

/** Pas één op toe (puur; geeft een nieuw project). */
export function applyOp(p: ModularProject, op: PatchOp): ModularProject {
  switch (op.op) {
    case 'seedInternals':
      return seedInternals(p);
    case 'addRack':
      return { ...p, racks: [...p.racks, { ...op.rack, slots: [], polyGroups: [] }] };
    case 'addModule': {
      const proto = p.modules.find((m) => m.typeId === op.typeId);
      if (!proto) throw new RecipeError(`Geen prototype-module voor type ${op.typeId}; seedInternals eerst?`);
      const mod: ModuleInstance = { ...proto, id: op.moduleId, internal: false,
        name: op.name ?? proto.name, visual: proto.visual };
      const slot: RackSlot = { id: op.slotId, moduleId: op.moduleId, row: op.row, hpOffset: op.hpOffset };
      if (!p.racks.some((r) => r.id === op.rackId)) throw new RecipeError(`Rack ${op.rackId} bestaat niet.`);
      return {
        ...p,
        modules: [...p.modules, mod],
        racks: p.racks.map((r) => (r.id === op.rackId ? { ...r, slots: [...r.slots, slot] } : r)),
      };
    }
    case 'addPolyGroup':
      return {
        ...p,
        racks: p.racks.map((r) => (r.id === op.rackId
          ? { ...r, polyGroups: [...(r.polyGroups ?? []), op.group] } : r)),
      };
    case 'addPatch':
      return { ...p, patches: [...p.patches, { ...op.patch, connections: [], controlState: {}, envelopes: [], lfos: [] }] };
    case 'connect':
      return {
        ...p,
        patches: p.patches.map((x) => (x.id === op.patchId
          ? { ...x, connections: [...x.connections, op.connection] } : x)),
      };
    case 'setControls':
      return {
        ...p,
        patches: p.patches.map((x) => (x.id === op.patchId
          ? { ...x, controlState: { ...x.controlState,
              [op.moduleId]: { ...(x.controlState[op.moduleId] ?? {}), ...op.values } } }
          : x)),
      };
    case 'activate':
      return { ...p, activeRackId: op.rackId, activePatchId: op.patchId };
  }
}

export function applyOps(project: ModularProject, ops: PatchOp[]): ModularProject {
  return ops.reduce(applyOp, project);
}

/** Compileer + toepassen in één keer (de seed-vorm). */
export function buildRecipe(project: ModularProject, recipe: PatchRecipe): ModularProject {
  return applyOps(project, compileRecipe(project, recipe).ops);
}
