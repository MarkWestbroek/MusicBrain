// Patch-library bouwen op een export uit de editor.
//
//   node tools/mmb-mcp/node_modules/tsx/dist/cli.mjs tools/patch-library/build-library.ts <export.json> <uit.json>
//
// Doet twee dingen, zonder iets weg te gooien:
//   1. deelt de bestaande patches in mappen in (alleen het veld `folder`);
//   2. voegt showcase-patches toe voor moduletypes die nog in geen enkele
//      patch zitten, plus een map Klassiekers met bekende klanken.
//
// Nieuwe patches krijgen elk een eigen rack. Recepten lopen via de
// recept-compiler (zelfde bedrading als Ctrl+K en de AI); wat daar niet in
// past (zelfspelend, cel-modules, twee bronnen per stem) bouwt `custom()`.
// Alles wordt nagelopen met de poly-flatten en de knopbereiken van het type.

import fs from 'node:fs';
import path from 'node:path';
import {
  migrateProject, resolvePorts, canConnect,
  type ModularProject, type ModuleInstance, type Patch, type PatchConnection,
  type PolyGroup, type Rack, type RackSlot, type ControlValue,
} from '../../editor/src/modular-mb/types';
import { uid } from '../../editor/src/modular-mb/store';
import {
  seedKrellPatch, seed808JamPatch, seedGenerativeJamPatch,
  seedCloudsAmbientPatch, seedWarpsVocoderPatch, seedTapeStripPolyPatch,
} from '../../editor/src/modular-mb/seedModules';
import { expandPatchConnections } from '../../editor/src/modular-mb/polyExpand';
import { buildRecipe, sanitizeControls } from '../../editor/src/modular-mb/recipe/compile';
import { addBusFx, feedCvInput, spreadVoices } from '../../editor/src/modular-mb/recipe/edits';
import { classifyPatch } from '../../editor/src/modular-mb/recipe/classify';
import type { PatchRecipe } from '../../editor/src/modular-mb/recipe/types';

type Ctl = Record<string, ControlValue>;
type CtlOf = Ctl | ((voice: number) => Ctl);

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('gebruik: build-library.ts <export.json> <uit.json>');
  process.exit(1);
}

const warnings: string[] = [];
const T = (short: string): string => (short.startsWith('tp_') ? short : `tp_mmb_${short}`);

// ── helpers ─────────────────────────────────────────────────────────────

function typeOf(p: ModularProject, typeId: string) {
  const t = p.moduleTypes.find((x) => x.id === typeId);
  if (!t) throw new Error(`moduletype ${typeId} ontbreekt`);
  return t;
}

/** Knopstanden tegen het type houden; een tikfout of een waarde buiten het
 *  bereik komt als waarschuwing in het rapport. */
function clean(p: ModularProject, typeId: string, ctl: Ctl, where: string): Ctl {
  const { voiceCount, ...panel } = ctl;   // voiceCount is geen paneelknop (MIDI-In)
  const w: string[] = [];
  const out = sanitizeControls(typeOf(p, typeId), panel, w);
  for (const x of w) warnings.push(`${where}: ${x}`);
  return voiceCount === undefined ? out : { ...out, voiceCount };
}

function setCtl(p: ModularProject, pid: string, ids: string[], ctl: CtlOf): ModularProject {
  return {
    ...p,
    patches: p.patches.map((x) => {
      if (x.id !== pid) return x;
      const cs = { ...x.controlState };
      ids.forEach((id, v) => {
        const m = p.modules.find((q) => q.id === id)!;
        const values = clean(p, m.typeId, typeof ctl === 'function' ? ctl(v) : ctl, x.name);
        cs[id] = { ...(cs[id] ?? {}), ...values };
      });
      return { ...x, controlState: cs };
    }),
  };
}

/** De n-de kolom van een type in een recept-rack: de master in rij 0 plus
 *  zijn followers (zelfde hp-positie). Recept-volgorde: bron, envFlt, filter,
 *  fx, envAmp, velMath, vca, mixer, out, vibrato-LFO, vibDepth, bendSum, bus. */
function col(p: ModularProject, rackId: string, short: string, n = 0): string[] {
  const rack = p.racks.find((r) => r.id === rackId)!;
  const typeId = T(short);
  const isType = (s: RackSlot) => p.modules.find((m) => m.id === s.moduleId)?.typeId === typeId;
  const row0 = rack.slots.filter((s) => s.row === 0 && isType(s)).sort((a, b) => a.hpOffset - b.hpOffset);
  const head = row0[n];
  if (!head) throw new Error(`${rack.name}: geen ${short} #${n}`);
  return rack.slots.filter((s) => s.hpOffset === head.hpOffset && isType(s))
    .sort((a, b) => a.row - b.row).map((s) => s.moduleId);
}

/** Modules van een type die in deze patch aan een kabel hangen. */
function cabled(p: ModularProject, pid: string, short: string): string[] {
  const patch = p.patches.find((x) => x.id === pid)!;
  const ids = new Set(patch.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId]));
  return p.modules.filter((m) => ids.has(m.id) && m.typeId === T(short)).map((m) => m.id);
}

function meta(p: ModularProject, pid: string, v: { name?: string; folder: string; description: string }): ModularProject {
  const rid = p.patches.find((x) => x.id === pid)!.rackIds[0];
  return {
    ...p,
    patches: p.patches.map((x) => (x.id !== pid ? x : { ...x, ...v })),
    racks: p.racks.map((r) => (r.id === rid && v.name ? { ...r, name: `${v.name} rack` } : r)),
  };
}

interface Built { p: ModularProject; pid: string; rid: string }
const last = (p: ModularProject): Built => ({ p, pid: p.activePatchId!, rid: p.activeRackId! });

function recipe(p: ModularProject, r: PatchRecipe): Built {
  return last(buildRecipe(p, r));
}

function busFx(b: Built, short: string, ctl: Ctl, right?: Ctl): Built {
  let p = addBusFx(b.p, b.pid, T(short)).project;
  const ids = cabled(p, b.pid, short).slice(-2);          // stereo: 1, mono: L/R-paar
  const fresh = ids.filter((id) => !cabled(b.p, b.pid, short).includes(id));
  p = setCtl(p, b.pid, [fresh[0]!], ctl);
  if (fresh[1]) p = setCtl(p, b.pid, [fresh[1]], right ?? ctl);
  return { ...b, p };
}

// ── custom(): vrije opbouw, met poly over modules of over cellen ─────────

interface Mod {
  k: string;                 // lokale naam, gebruikt in de kabels
  t: string;                 // type, kort ("vco") of volledig
  ctl?: CtlOf;
  per?: boolean;             // één per stem (poly-groep van modules)
  cells?: string;            // cel-groep van een multi-module die de stemmen draagt
}
interface Spec {
  name: string; folder: string; description: string; rack?: string;
  voices?: number;
  mods: Mod[];
  cables: [string, string][];   // 'k.poort' → 'k.poort' (alleen master-kabels)
}

function custom(project: ModularProject, s: Spec): Built {
  const N = Math.max(1, s.voices ?? 1);
  const p0 = project;
  const fresh = (typeId: string): ModuleInstance => {
    const proto = p0.modules.find((m) => m.typeId === typeId);
    if (!proto) throw new Error(`${s.name}: geen prototype voor ${typeId}`);
    return { ...proto, id: uid('mod'), internal: false, visual: proto.visual };
  };
  const inst = new Map<string, ModuleInstance[]>();
  const slots: RackSlot[] = [];
  const polyGroups: PolyGroup[] = [];
  const controlState: Record<string, Ctl> = {};
  let offset = 0;
  for (const m of s.mods) {
    const typeId = T(m.t);
    const copies = m.per && N > 1 ? N : 1;
    const list = Array.from({ length: copies }, () => fresh(typeId));
    inst.set(m.k, list);
    list.forEach((mod, v) => {
      slots.push({ id: uid('slot'), moduleId: mod.id, row: v, hpOffset: offset });
      let ctl = typeof m.ctl === 'function' ? m.ctl(v) : (m.ctl ?? {});
      if (typeId === 'tp_mmb_midiin') ctl = { channel: 0, ...ctl, voiceCount: N };
      if (Object.keys(ctl).length) controlState[mod.id] = clean(p0, typeId, ctl, `${s.name}/${m.k}`);
    });
    offset += list[0]!.visual.hpWidth;
    if (N > 1 && m.per) {
      polyGroups.push({ id: uid('poly'), label: m.k, voiceCount: N,
        members: list.map((mod) => ({ kind: 'module' as const, moduleId: mod.id })) });
    }
    if (N > 1 && m.cells) {
      polyGroups.push({ id: uid('poly'), label: m.k, voiceCount: N,
        members: Array.from({ length: N }, (_, i) => ({ kind: 'cell' as const, moduleId: list[0]!.id, cellGroupId: m.cells!, cellIndex: i })) });
    }
  }
  const perVoice = s.mods.some((m) => m.per) && N > 1;
  const rack: Rack = {
    id: uid('rack'), name: s.rack ?? `${s.name} rack`, description: s.description,
    rows: perVoice ? N : 1, hpPerRow: Math.max(64, offset + 4), slots, kind: 'physical', polyGroups,
  };
  const end = (ref: string) => {
    const dot = ref.indexOf('.');
    const list = inst.get(ref.slice(0, dot));
    if (!list) throw new Error(`${s.name}: onbekende module in kabel "${ref}"`);
    return { moduleId: list[0]!.id, portId: ref.slice(dot + 1) };
  };
  const connections: PatchConnection[] = s.cables.map(([a, b]) => ({ id: uid('conn'), from: end(a), to: end(b) }));
  const patch: Patch = {
    id: uid('patch'), name: s.name, description: s.description, folder: s.folder,
    voiceCount: N, rackIds: [rack.id], connections, controlState, envelopes: [], lfos: [],
  };
  const p: ModularProject = {
    ...p0, racks: [...p0.racks, rack], modules: [...p0.modules, ...[...inst.values()].flat()],
    patches: [...p0.patches, patch], activeRackId: rack.id, activePatchId: patch.id,
  };
  return { p, pid: patch.id, rid: rack.id };
}

/** Elke master-kabel: bestaan de poorten, klopt de richting en het signaal?
 *  Daarna de flatten erover en elke uitgewaaierde bestemming nalopen. */
function validate(p: ModularProject, pid: string): void {
  const patch = p.patches.find((x) => x.id === pid)!;
  const byId = new Map(p.modules.map((m) => [m.id, m]));
  const fail = (msg: string): never => { throw new Error(`${patch.name}: ${msg}`); };
  for (const c of patch.connections) {
    const fm = byId.get(c.from.moduleId), tm = byId.get(c.to.moduleId);
    if (!fm || !tm) fail(`kabel naar onbekende module`);
    const fp = resolvePorts(fm!, p.moduleTypes).find((q) => q.id === c.from.portId && q.direction === 'out');
    const tp = resolvePorts(tm!, p.moduleTypes).find((q) => q.id === c.to.portId && q.direction === 'in');
    if (!fp) fail(`${fm!.typeId} heeft geen uitgang "${c.from.portId}"`);
    if (!tp) fail(`${tm!.typeId} heeft geen ingang "${c.to.portId}"`);
    if (!canConnect(fp!.signalType, tp!.signalType)) {
      fail(`${fm!.typeId}.${c.from.portId} (${fp!.signalType}) past niet op ${tm!.typeId}.${c.to.portId} (${tp!.signalType})`);
    }
  }
  for (const c of expandPatchConnections(patch, p)) {
    const tm = byId.get(c.to.moduleId)!;
    if (!resolvePorts(tm, p.moduleTypes).some((q) => q.id === c.to.portId && q.direction === 'in')) {
      fail(`flatten: ${tm.typeId} heeft geen ingang "${c.to.portId}"`);
    }
  }
  // Twee kabels op één cv-ingang tellen niet op (de laatste wint).
  const seen = new Map<string, number>();
  for (const c of patch.connections) {
    const tm = byId.get(c.to.moduleId)!;
    const tp = resolvePorts(tm, p.moduleTypes).find((q) => q.id === c.to.portId)!;
    if (tp.signalType !== 'cv') continue;
    const k = `${c.to.moduleId}.${c.to.portId}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    if (seen.get(k) === 2) warnings.push(`${patch.name}: twee kabels op cv-ingang ${tm.typeId}.${c.to.portId}`);
  }
}

// ── 1. bestaande patches indelen ────────────────────────────────────────

function folderFor(p: ModularProject, x: Patch): string {
  const ids = new Set(x.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId]));
  const used = new Set(p.modules.filter((m) => ids.has(m.id)).map((m) => m.typeId.replace('tp_mmb_', '')));
  const has = (...t: string[]) => t.some((q) => used.has(q));
  if (/^(CS-80|Axel F)/.test(x.name)) return 'Klassiekers';
  if (/^(Test patch|alleen VCO)/.test(x.name)) return 'Test';
  if (has('sid', 'sid3')) return 'SID';
  if (has('zang', 'fof') || (has('warps') && has('sampler', 'audioin'))) return 'Stemmen';
  if (has('material_bridge', 'reservoir', 'gendyn', 'excitable', 'scanned')) return 'Onderzoek';
  if (has('tapestrip')) return 'Sampling';
  if (has('dx7')) return 'FM';
  return x.folder?.trim() || classifyPatch(p, x).family;
}

// ── 2. nieuwe patches ───────────────────────────────────────────────────

const DETUNE = [0, 6, -5, 3, -7, 4, -3, 7, -2, 5, -6, 2];
const builders: ((p: ModularProject) => Built)[] = [];
const add = (fn: (p: ModularProject) => Built): void => { builders.push(fn); };

// ── Klassiekers ─────────────────────────────────────────────────────────

add((p) => {
  let b = recipe(p, {
    name: 'Oxygène strings (Eminent + Small Stone)', voices: 8,
    source: { type: 'vco', controls: { wave: 2, coarse: 0, fine: 0, level: 0.8 } },
    filter: { type: 'vcf', controls: { cutoff: 1800, q: 0.7, cv_amt: 0.5, type: 0 } },
    bus: [
      { type: 'bbd_chorus', controls: { rate: 0.6, depth: 0.6, delay: 12, feedback: 0, mix: 0.5, spread: 1, age: 0.4, tone: 0.55 } },
      { type: 'stereo_phaser', controls: { rate: 0.12, depth: 0.85, feedback: 0.55, spread: 0.5, mix: 0.5 } },
      { type: 'reverb', controls: { size: 0.7, mode: 0, damp: 0.45, predelay: 20, mod: 0.4, mix: 0.3 } },
    ],
  });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'vco'), (v) => ({ fine: DETUNE[v]! }));
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 300, hold: 0, decay: 1200, sustain: 0.7, release: 1200, curve: 1 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 1), { attack: 350, hold: 0, decay: 500, sustain: 0.9, release: 1300, curve: 1 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'mixer8'), Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`vol${i + 1}`, 0.5])));
  b.p = spreadVoices(b.p, b.pid, 0.5).project;
  b.p = meta(b.p, b.pid, { folder: 'Klassiekers',
    description: 'De strijkers van Jean-Michel Jarre (Oxygène, Équinoxe): de zaagtanden van een Eminent 310 door het ensemble-chorus en dan door een Small Stone-phaser. Hier: 8 stemmen zaagtand → VCF met trage inzet, BBD-chorus (ensemble), Stereo Phaser (traag, veel feedback) en plaatgalm. Houd akkoorden lang aan; de phaser doet het werk.' });
  return b;
});

add((p) => custom(p, {
  name: 'Oxygène vogeltjes (zelfspelend)', folder: 'Klassiekers',
  description: 'De voorbijvliegende vogeltjes van Jarre, zelfspelend: een hoge sinus krijgt per tjirp een snelle toonhoogte-veeg (envelope) met een triller (LFO 19 Hz) en een willekeurige toonhoogte (LFO op S&H). Een trage blokgolf maakt er groepjes van, de echo herhaalt ze en de ST-VCA laat ze met een trage LFO van links naar rechts vliegen. Draai aan SEQ rate (tempo van de tjirpjes), de pan-LFO (vliegsnelheid) en de offsets van de CV-math (hoe ver de veeg gaat).',
  mods: [
    { k: 'seq', t: 'seq8', ctl: { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0, s8: 0, root: 60, rate: 6.5, gate: 0.45, length: 8, run: 0 } },
    { k: 'lfoRnd', t: 'lfo', ctl: { rate: 6.5, wave: 4, depth: 1, bipolar: true, run: 0 } },
    { k: 'envP', t: 'ahdsr', ctl: { attack: 0, hold: 0, decay: 110, sustain: 0, release: 60, retrig: true, curve: 1 } },
    { k: 'lfoTril', t: 'lfo', ctl: { rate: 19, wave: 0, depth: 1, bipolar: true, run: 0 } },
    { k: 'sum', t: 'cvmath', ctl: { mode: 0, gain_a: 0.9, gain_b: 0.12, gain_c: 0.55, offset: 0 } },
    { k: 'vco', t: 'vco', ctl: { wave: 0, coarse: 36, fine: 0, fm_amt: 0, level: 0.8 } },
    { k: 'envA', t: 'ahdsr', ctl: { attack: 2, hold: 0, decay: 120, sustain: 0, release: 50, curve: 1 } },
    { k: 'lfoGroep', t: 'lfo', ctl: { rate: 0.37, wave: 3, depth: 1, bipolar: false, run: 0 } },
    { k: 'gateM', t: 'cvmath', ctl: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 } },
    { k: 'vca', t: 'vca', ctl: { gain: 0, resp: 0 } },
    { k: 'echo', t: 'echo', ctl: { time: 0.31, feedback: 0.55, mix: 0.4 } },
    { k: 'rev', t: 'reverb', ctl: { size: 0.8, mode: 0, damp: 0.35, predelay: 25, mod: 0.4, mix: 0.4 } },
    { k: 'lfoPan', t: 'lfo', ctl: { rate: 0.09, wave: 1, depth: 0.95, bipolar: true, run: 0 } },
    { k: 'pan', t: 'stereo_vca', ctl: { vol: 0.9, pan: 0 } },
    // De panner gaat hard links/rechts een mixer in: zo blijft het beeld ook
    // in de simulator stereo (OUT telt daar l en r van een wasm-module op).
    { k: 'mix', t: 'mixer', ctl: { vol1: 1, pan1: -1, vol2: 1, pan2: 1, vol3: 0, vol4: 0 } },
    { k: 'out', t: 'out', ctl: { level: 0.9 } },
  ],
  cables: [
    ['seq.gate_out', 'envP.gate'], ['seq.gate_out', 'envA.gate'],
    ['envP.cv_out', 'sum.a'], ['lfoTril.out', 'sum.b'], ['lfoRnd.out', 'sum.c'], ['sum.out', 'vco.tune'],
    ['envA.cv_out', 'gateM.a'], ['lfoGroep.out', 'gateM.b'], ['gateM.out', 'vca.cv'],
    ['vco.out', 'vca.in'], ['vca.out', 'echo.in'], ['echo.out', 'rev.in_l'], ['rev.out_l', 'pan.in'],
    ['lfoPan.out', 'pan.pan_cv'], ['pan.l', 'mix.in1'], ['pan.r', 'mix.in2'], ['mix.out_l', 'out.l'], ['mix.out_r', 'out.r'],
  ],
}));

add((p) => custom(p, {
  name: 'Oxygène wind (ruis door ladder)', folder: 'Klassiekers',
  description: 'De wind en branding uit Oxygène: roze ruis door een resonerend ladderfilter waarvan de cutoff door twee trage LFO\'s zwerft. Houd een toets vast: de wind zwelt aan (attack 1,2 s) en gaat liggen als je loslaat; hoger op het klavier fluit hij hoger. Draai Res richting 1,5 voor een fluitende storm, of zet Noise op white voor branding.',
  mods: [
    { k: 'mi', t: 'midiin' },
    { k: 'noise', t: 'noise', ctl: { color: 1, level: 0.8 } },
    { k: 'lfo1', t: 'lfo', ctl: { rate: 0.13, wave: 0, depth: 1, bipolar: true, run: 0 } },
    { k: 'lfo2', t: 'lfo', ctl: { rate: 0.41, wave: 1, depth: 1, bipolar: true, run: 0 } },
    { k: 'sum', t: 'cvmath', ctl: { mode: 0, gain_a: 0.45, gain_b: 0.2, gain_c: 0.3, offset: 0 } },
    { k: 'lad', t: 'ladder', ctl: { cutoff: 650, q: 1.2, drive: 1.2, cv_amt: 2.2, q_cv_amt: 0, drive_cv_amt: 0 } },
    { k: 'envA', t: 'ahdsr', ctl: { attack: 1200, hold: 0, decay: 500, sustain: 1, release: 2500, curve: 1 } },
    { k: 'vca', t: 'vca', ctl: { gain: 0, resp: 0 } },
    { k: 'rev', t: 'elements_reverb', ctl: { amount: 0.45, time: 0.75, diffusion: 0.7, lp: 0.6 } },
    { k: 'out', t: 'out', ctl: { level: 1 } },
  ],
  cables: [
    ['noise.out', 'lad.in'], ['lfo1.out', 'sum.a'], ['lfo2.out', 'sum.b'], ['mi.pitch', 'sum.c'], ['sum.out', 'lad.cv'],
    ['lad.out', 'vca.in'], ['mi.gate', 'envA.gate'], ['envA.cv_out', 'vca.cv'],
    ['vca.out', 'rev.in_l'], ['rev.out_l', 'out.l'], ['rev.out_r', 'out.r'],
  ],
}));

const mellotron = (name: string, bank: number, tape: Ctl, description: string) => add((p) => {
  let b = last(seedTapeStripPolyPatch(p, 8));
  b.p = setCtl(b.p, b.pid, cabled(b.p, b.pid, 'tapestrip'), { bank, length: 8, return: 1.2, contact: 0.55, motor: 0.45, wow: 0.35, flutter: 0.3, wear: 0.4, level: 0.8, ...tape });
  b = busFx(b, 'reverb', { size: 0.55, mode: 0, damp: 0.5, predelay: 10, mod: 0.3, mix: 0.22 });
  if (tape.level === 1) b.p = setCtl(b.p, b.pid, cabled(b.p, b.pid, 'out'), { level: 1 });   // zachte bank
  b.p = meta(b.p, b.pid, { name, folder: 'Klassiekers', description });
  return b;
});
mellotron('Mellotron koor (8 Voice Choir)', 5, { level: 1 },
  'Het Mellotron-koor: TAPE STRIP op samplebank 05 (Concert Choir, in de simulator de standaardbank op die plek). Elk bandje duurt 8 seconden en stopt dan abrupt; snel dezelfde toets opnieuw = het bandje is nog niet terug en begint halverwege. Wow, flutter en slijtage staan op "oud apparaat". Aftertouch drukt het kussen aan, meer toetsen tegelijk laat de motor zakken.');
mellotron('Mellotron fluiten (Strawberry Fields)', 7, { contact: 0.45, wear: 0.45 },
  'De fluiten van Strawberry Fields Forever. TAPE STRIP op samplebank 07: standaard staat daar de shakuhachi; kies in de bankbalk gu-flute.mmbs op plek 07 voor de echte dwarsfluit (op de Teensy: zet de fluitbank als 07.mmbs op de SD). Speel het intro-loopje in het middenregister en laat de noten los vóór de 8 seconden om zijn.');
mellotron('Mellotron strijkers (3 Violins)', 3, { wow: 0.4, flutter: 0.35 },
  'De drie violen van het Mellotron (Nights in White Satin, Watcher of the Skies). TAPE STRIP op samplebank 03: standaard staat daar de warm pad; kies in de bankbalk gu-strings.mmbs op plek 03 voor strijkers (op de Teensy: de strijkersbank als 03.mmbs). Dikke akkoorden laten de motor hoorbaar zakken.');

add((p) => {
  let b = custom(p, {
    name: 'Jump-koper (Octa-VCO · VCF · VCA)', folder: 'Klassiekers', voices: 8,
    description: 'Het koper van Van Halens Jump (Oberheim OB-Xa), gebouwd met de Octa-drieling: één Octa-VCO, één Octa-VCF en één Octa-VCA dragen samen acht stemmen, elk met een eigen filter- en amp-envelope. Detune spreidt de acht cellen een paar cent uit elkaar (analoge drift). Modwheel = vibrato, pitch-bend werkt op alle stemmen. Speel de akkoorden staccato in het middenregister.',
    mods: [
      { k: 'mi', t: 'midiin', ctl: { steal: 0 } },
      { k: 'OCTA-VCO', t: 'octa_vco', cells: 'osc', ctl: { wave: 2, coarse: 0, fine: 0, detune: 12, level: 0.5 } },
      { k: 'envFlt', t: 'ahdsr', per: true, ctl: { attack: 4, hold: 0, decay: 380, sustain: 0.55, release: 300, curve: 1, retrig: true } },
      { k: 'OCTA-VCF', t: 'octa_vcf', cells: 'flt', ctl: { cutoff: 1300, q: 1.1, cv_amt: 2.5, type: 0 } },
      { k: 'envAmp', t: 'ahdsr', per: true, ctl: { attack: 4, hold: 0, decay: 300, sustain: 0.85, release: 280, curve: 1 } },
      { k: 'velMath', t: 'cvmath', per: true, ctl: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 } },
      { k: 'OCTA-VCA', t: 'octa_vca', cells: 'vca', ctl: { level: 1 } },
      { k: 'mix', t: 'mixer8', ctl: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [[`vol${i + 1}`, 0.38], [`pan${i + 1}`, (i / 7) * 0.8 - 0.4]]).flat()) },
      { k: 'out', t: 'out', ctl: { level: 0.8 } },
      { k: 'lfo', t: 'lfo', ctl: { rate: 5.5, wave: 0, depth: 1, bipolar: true, run: 0 } },
      { k: 'vibDepth', t: 'cvmath', ctl: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 } },
      { k: 'bendSum', t: 'cvmath', ctl: { mode: 0, gain_a: 0.04, gain_b: 1, gain_c: 0, offset: 0 } },
    ],
    cables: [
      ['mi.pitch', 'OCTA-VCO.voct_1'], ['OCTA-VCO.out_1', 'OCTA-VCF.in_1'],
      ['mi.gate', 'envFlt.gate'], ['envFlt.cv_out', 'OCTA-VCF.cv_1'], ['OCTA-VCF.out_1', 'OCTA-VCA.in_1'],
      ['mi.gate', 'envAmp.gate'], ['envAmp.cv_out', 'velMath.a'], ['mi.vel', 'velMath.b'], ['velMath.out', 'OCTA-VCA.cv_1'],
      ['OCTA-VCA.out_1', 'mix.in1'], ['mix.out_l', 'out.l'], ['mix.out_r', 'out.r'],
      ['lfo.out', 'vibDepth.a'], ['mi.cv_mod', 'vibDepth.b'], ['vibDepth.out', 'bendSum.a'], ['mi.cv_bend', 'bendSum.b'],
      ['bendSum.out', 'OCTA-VCO.tune'],
    ],
  });
  b = busFx(b, 'bbd_chorus', { rate: 0.45, depth: 0.3, delay: 10, feedback: 0, mix: 0.3, spread: 1, age: 0.3, tone: 0.7 });
  b = busFx(b, 'reverb', { size: 0.5, mode: 0, damp: 0.45, predelay: 15, mod: 0.3, mix: 0.2 });
  return b;
});

add((p) => {
  let b = recipe(p, {
    name: 'Popcorn (Moog-pluk)', voices: 4,
    source: { type: 'vco', controls: { wave: 3, coarse: 0, fine: 0, level: 0.85 } },
    filter: { type: 'ladder', controls: { cutoff: 420, q: 0.9, drive: 1.2, cv_amt: 4, q_cv_amt: 0 } },
    bus: [{ type: 'reverb', controls: { size: 0.35, mode: 0, damp: 0.5, predelay: 5, mod: 0.2, mix: 0.15 } }],
  });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 0, hold: 0, decay: 110, sustain: 0, release: 90, curve: 1, retrig: true });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 1), { attack: 1, hold: 0, decay: 170, sustain: 0, release: 120, curve: 1 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'mixer'), { vol1: 0.5, vol2: 0.5, vol3: 0.5, vol4: 0.5 });
  b.p = meta(b.p, b.pid, { folder: 'Klassiekers',
    description: 'De plop van Popcorn (Gershon Kingsley / Hot Butter): blokgolf door een ladderfilter dat per noot in een tiende seconde dichtklapt, zonder sustain. Vier stemmen zodat snelle loopjes elkaar niet afkappen. Meer Res = natter, langere decay op de filter-envelope = minder "pop".' });
  return b;
});

add((p) => {
  let b = recipe(p, {
    name: 'Lucky Man-lead (Minimoog)', voices: 3,
    source: { type: 'vco', controls: { wave: 3, coarse: 0, fine: 0, level: 0.8 } },
    filter: { type: 'ladder', controls: { cutoff: 1500, q: 0.45, drive: 1.4, cv_amt: 1.5, q_cv_amt: 0 } },
    bus: [
      { type: 'tape_echo', controls: { time: 0.38, feedback: 0.35, mix: 0.22, tone: 0.55, wow: 0.3, flutter: 0.2, drive: 0.3 } },
      { type: 'reverb', controls: { size: 0.55, mode: 0, damp: 0.45, predelay: 15, mod: 0.3, mix: 0.2 } },
    ],
  });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'midiin'), { priority: 0, legato: 1, glide: 160, unison: 1, spread: 9 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 15, hold: 0, decay: 500, sustain: 0.7, release: 400, curve: 1 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 1), { attack: 10, hold: 0, decay: 300, sustain: 1, release: 350, curve: 1 });
  b.p = meta(b.p, b.pid, { folder: 'Klassiekers',
    description: 'De Moog-solo van Keith Emerson in Lucky Man: drie blokgolven op één toets (MIDI-In op unison, 9 cent spreiding) door een ladderfilter, met portamento (glide 160 ms per octaaf) en legato. Modwheel = vibrato, bandecho en plaat erachter. Speel één noot tegelijk en glijd met grote sprongen; eindig laag.' });
  return b;
});

const dx7 = (name: string, voices: number, program: number, description: string, chorus: boolean, gain: { level: number; vol: number; out: number }) => add((p) => {
  let b = recipe(p, {
    name, voices, filter: null, ampEnv: false, velocity: false,
    source: { type: 'dx7', controls: { bank: 0, program, coarse: 0, fine: 0, level: gain.level } },
    bus: [
      ...(chorus ? [{ type: 'bbd_chorus', controls: { rate: 0.8, depth: 0.35, delay: 10, feedback: 0, mix: 0.4, spread: 1, age: 0.2, tone: 0.75 } }] : []),
      { type: 'reverb', controls: { size: 0.5, mode: 0, damp: 0.4, predelay: 15, mod: 0.3, mix: chorus ? 0.2 : 0.1 } },
    ],
  });
  const mixer = voices > 4 ? 'mixer8' : 'mixer';
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, mixer), Object.fromEntries(Array.from({ length: voices }, (_, i) => [`vol${i + 1}`, gain.vol])));
  b.p = setCtl(b.p, b.pid, cabled(b.p, b.pid, 'out'), { level: gain.out });
  b.p = meta(b.p, b.pid, { folder: 'Klassiekers', description });
  return b;
});
dx7('DX7 E.Piano 1 (ROM1A-11) · chorus', 8, 10,
  'Het bekendste DX7-geluid: E.PIANO 1 uit de fabrieks-ROM 1A, de elektrische piano van zowat elke ballad uit de jaren tachtig. Acht stemmen, BBD-chorus en een beetje plaat. Zacht spelen is rond en bel-achtig, hard spelen geeft de bekende "tine"-blaf.', true, { level: 0.9, vol: 0.9, out: 0.8 });
dx7('DX7 Bass 1 (ROM1A-15)', 4, 14,
  'BASS 1 uit ROM 1A: de strakke FM-bas van Take On Me en de halve hitparade van 1985. Droog, met alleen een vleugje plaat. Speel hem een of twee octaven onder het midden.', false, { level: 1, vol: 1, out: 1 });

add((p) => {
  let b = recipe(p, {
    name: 'Higher Ground-clavi (DX7 + auto-wah)', voices: 6, filter: null, ampEnv: false, velocity: false,
    source: { type: 'dx7', controls: { bank: 0, program: 19, coarse: 0, fine: 0, level: 1 } },
    bus: [{ type: 'ms20', controls: { cutoff: 450, q: 0.4, drive: 2, cv_amt: 4, q_cv_amt: 0, drive_cv_amt: 0, type: 0 } }],
  });
  const flt = cabled(b.p, b.pid, 'ms20');
  const mixer = col(b.p, b.rid, 'mixer8')[0]!;
  const f = custom(b.p, { name: '_', folder: '_', description: '', mods: [{ k: 'ef', t: 'env_follower_mono' }], cables: [] });
  // De follower komt in het rack van de clavi te staan, niet in een eigen rack.
  const efId = f.p.modules.at(-1)!.id;
  const rack = f.p.racks.find((r) => r.id === b.rid)!;
  const rowEnd = Math.max(...rack.slots.filter((s) => s.row === 0).map((s) => s.hpOffset + f.p.modules.find((m) => m.id === s.moduleId)!.visual.hpWidth));
  b.p = {
    ...f.p,
    racks: f.p.racks.filter((r) => r.id !== f.rid).map((r) => (r.id !== b.rid ? r : {
      ...r, hpPerRow: Math.max(r.hpPerRow, rowEnd + 12), slots: [...r.slots, { id: uid('slot'), moduleId: efId, row: 0, hpOffset: rowEnd }],
    })),
    patches: f.p.patches.filter((x) => x.id !== f.pid).map((x) => (x.id !== b.pid ? x : {
      ...x,
      connections: [...x.connections,
        { id: uid('conn'), from: { moduleId: mixer, portId: 'out_l' }, to: { moduleId: efId, portId: 'in' } },
        ...flt.map((id) => ({ id: uid('conn'), from: { moduleId: efId, portId: 'env' }, to: { moduleId: id, portId: 'cv' } })),
      ],
    })),
    activePatchId: b.pid, activeRackId: b.rid,
  };
  b.p = setCtl(b.p, b.pid, [efId], { attack: 3, release: 180, sens: 30, thresh: 0.1, mode: 0 });
  b.p = setCtl(b.p, b.pid, [mixer], Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`vol${i + 1}`, 1])));
  b.p = setCtl(b.p, b.pid, cabled(b.p, b.pid, 'out'), { level: 1 });
  b.p = meta(b.p, b.pid, { folder: 'Klassiekers',
    description: 'Stevie Wonders Higher Ground: een clavinet door een envelope-filter (Mu-Tron III). Hier CLAV 1 uit de DX7-ROM, zes stemmen, met op de bus een MS-20-filter dat door een envelope follower wordt opengeduwd: hoe harder je speelt, hoe verder de wah opengaat (tot vier octaven). Sens op de follower bepaalt hoe gevoelig; Release hoe snel hij dichtvalt. Speel kort en percussief.' });
  return b;
});

add((p) => {
  let b = custom(p, {
    name: 'On the Run (VCS3-sequence, zelfspelend)', folder: 'Klassiekers',
    description: 'De sequence van Pink Floyds On the Run (Dark Side of the Moon): acht noten op 11 stappen per seconde uit de sequencer van een Synthi AKS, met een filter dat langzaam open en dicht zwiept en een hi-hat van ruis erbij. Zelfspelend. Draai aan de trage LFO (zwiep), aan Res op het ladderfilter, of verander een stap in de SEQ: het origineel is precies zo ontstaan.',
    mods: [
      { k: 'seq', t: 'seq8', ctl: { s1: 0, s2: 3, s3: 5, s4: 3, s5: 10, s6: 8, s7: 10, s8: 12, root: 52, rate: 11, gate: 0.5, length: 8, run: 0 } },
      { k: 'vco', t: 'vco', ctl: { wave: 2, coarse: 0, fine: 0, fm_amt: 0, level: 0.85 } },
      { k: 'envF', t: 'ahdsr', ctl: { attack: 0, hold: 0, decay: 70, sustain: 0.2, release: 40, curve: 1, retrig: true } },
      { k: 'lfoZwiep', t: 'lfo', ctl: { rate: 0.06, wave: 1, depth: 1, bipolar: true, run: 0 } },
      { k: 'sum', t: 'cvmath', ctl: { mode: 0, gain_a: 0.3, gain_b: 0.55, gain_c: 0, offset: 0.1 } },
      { k: 'lad', t: 'ladder', ctl: { cutoff: 700, q: 1.0, drive: 1.3, cv_amt: 3, q_cv_amt: 0, drive_cv_amt: 0 } },
      { k: 'envA', t: 'ahdsr', ctl: { attack: 1, hold: 0, decay: 80, sustain: 0.35, release: 40, curve: 1 } },
      { k: 'vca', t: 'vca', ctl: { gain: 0, resp: 0 } },
      { k: 'noise', t: 'noise', ctl: { color: 0, level: 0.6 } },
      { k: 'hp', t: 'vcf', ctl: { cutoff: 7000, q: 0.9, cv_amt: 0, q_cv_amt: 0, type: 1 } },
      { k: 'envH', t: 'ahdsr', ctl: { attack: 0, hold: 0, decay: 22, sustain: 0, release: 15, curve: 1 } },
      { k: 'vcaH', t: 'vca', ctl: { gain: 0, resp: 0 } },
      { k: 'mix', t: 'mixer', ctl: { vol1: 0.8, pan1: 0, vol2: 0.3, pan2: 0.25, vol3: 0, vol4: 0 } },
      { k: 'out', t: 'out', ctl: { level: 0.8 } },
    ],
    cables: [
      ['seq.cv', 'vco.voct'], ['seq.gate_out', 'envF.gate'], ['seq.gate_out', 'envA.gate'], ['seq.gate_out', 'envH.gate'],
      ['envF.cv_out', 'sum.a'], ['lfoZwiep.out', 'sum.b'], ['sum.out', 'lad.cv'],
      ['vco.out', 'lad.in'], ['lad.out', 'vca.in'], ['envA.cv_out', 'vca.cv'], ['vca.out', 'mix.in1'],
      ['noise.out', 'hp.in'], ['hp.out', 'vcaH.in'], ['envH.cv_out', 'vcaH.cv'], ['vcaH.out', 'mix.in2'],
      ['mix.out_l', 'out.l'], ['mix.out_r', 'out.r'],
    ],
  });
  b = busFx(b, 'reverb', { size: 0.4, mode: 0, damp: 0.5, predelay: 10, mod: 0.3, mix: 0.15 });
  return b;
});

add((p) => {
  let b = custom(p, {
    name: 'Stranger Things-arpeggio (zelfspelend)', folder: 'Klassiekers',
    description: 'Het thema van Stranger Things (Kyle Dixon & Michael Stein): een Cmaj7-arpeggio op en neer (C-E-G-B-C-B-G-E) in zestienden op 84 bpm, twee zaagtanden een paar cent uit elkaar, en een ladderfilter dat in een halve minuut open en weer dicht gaat. Hier doet Tides die trage beweging. Zelfspelend; BBD-chorus, stereo bandecho en plaat erachter. Draai Tides Rate omhoog voor een snellere zwiep.',
    mods: [
      { k: 'seq', t: 'seq8', ctl: { s1: 0, s2: 4, s3: 7, s4: 11, s5: 12, s6: 11, s7: 7, s8: 4, root: 48, rate: 5.6, gate: 0.6, length: 8, run: 0 } },
      { k: 'vcoA', t: 'vco', ctl: { wave: 2, coarse: 0, fine: -6, fm_amt: 0, level: 0.8 } },
      { k: 'vcoB', t: 'vco', ctl: { wave: 2, coarse: 0, fine: 7, fm_amt: 0, level: 0.8 } },
      { k: 'mixV', t: 'mixer', ctl: { vol1: 0.6, pan1: 0, vol2: 0.6, pan2: 0, vol3: 0, vol4: 0 } },
      { k: 'envF', t: 'ahdsr', ctl: { attack: 2, hold: 0, decay: 160, sustain: 0.25, release: 120, curve: 1, retrig: true } },
      { k: 'tides', t: 'tides', ctl: { rate: 0.035, mode: 1, output: 2, shape: 0.5, slope: 0.5, smooth: 0.6, shift: 0.5 } },
      { k: 'sum', t: 'cvmath', ctl: { mode: 0, gain_a: 0.25, gain_b: 0.6, gain_c: 0, offset: 0.1 } },
      { k: 'lad', t: 'ladder', ctl: { cutoff: 450, q: 0.7, drive: 1.2, cv_amt: 3.2, q_cv_amt: 0, drive_cv_amt: 0 } },
      { k: 'envA', t: 'ahdsr', ctl: { attack: 2, hold: 0, decay: 200, sustain: 0.6, release: 160, curve: 1 } },
      { k: 'vca', t: 'vca', ctl: { gain: 0, resp: 0 } },
      { k: 'out', t: 'out', ctl: { level: 0.8 } },
    ],
    cables: [
      ['seq.cv', 'vcoA.voct'], ['seq.cv', 'vcoB.voct'], ['vcoA.out', 'mixV.in1'], ['vcoB.out', 'mixV.in2'],
      ['mixV.out_l', 'lad.in'], ['seq.gate_out', 'envF.gate'], ['seq.gate_out', 'envA.gate'],
      ['envF.cv_out', 'sum.a'], ['tides.out1', 'sum.b'], ['sum.out', 'lad.cv'],
      ['lad.out', 'vca.in'], ['envA.cv_out', 'vca.cv'], ['vca.out', 'out.l'], ['vca.out', 'out.r'],
    ],
  });
  b = busFx(b, 'bbd_chorus', { rate: 0.4, depth: 0.4, delay: 12, feedback: 0, mix: 0.35, spread: 1, age: 0.3, tone: 0.6 });
  b = busFx(b, 'stereo_tape_echo', { time: 0.357, ratio: 1.5, feedback: 0.35, cross: 0.3, mix: 0.25, tone: 0.55, wow: 0.25, flutter: 0.2, drive: 0.3 });
  b = busFx(b, 'reverb', { size: 0.65, mode: 0, damp: 0.45, predelay: 20, mod: 0.35, mix: 0.25 });
  return b;
});

// ── Showcases per module ────────────────────────────────────────────────

add((p) => {
  let b = recipe(p, {
    name: 'Kathedraal (WT-VCO orgel ×12 · Shimmer)', voices: 12, filter: null,
    source: { type: 'wt_vco', controls: { bank: 3, coarse: 0, fine: 0, level: 0.7 } },
    bus: [{ type: 'shimmer', controls: { shimmer: 0.55, interval: 0, size: 0.85, damp: 0.35, tone: 0.55, predelay: 20, mod: 0.4, mix: 0.45 } }],
  });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'wt_vco'), (v) => ({ fine: DETUNE[v]! / 2 }));
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 60, hold: 0, decay: 300, sustain: 1, release: 900, curve: 1 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'mixer16'), Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`vol${i + 1}`, 0.35])));
  b.p = spreadVoices(b.p, b.pid, 0.6).project;
  b.p = meta(b.p, b.pid, { folder: 'Wavetable',
    description: 'Showcase WT-VCO, Mixer-16 en Shimmer: twaalf stemmen van de orgel-golftabel (bank Organ) zonder filter, in een shimmer-galm die elke ronde een octaaf hoger terugkomt. Probeer de andere banken van de WT-VCO (Vocal, Pulse) en Interval op de shimmer (+7 = kwint, −12 = een octaaf omlaag).' });
  return b;
});

add((p) => {
  let b = recipe(p, {
    name: 'Draw-VCO ×4 · Console EQ', voices: 4,
    source: { type: 'draw_vco', controls: { coarse: 0, fine: 0, level: 0.8 } },
    filter: { type: 'vcf', controls: { cutoff: 1400, q: 0.9, cv_amt: 0.7, type: 0 } },
    bus: [{ type: 'console_eq', controls: { hpf: 2, high_gain: 3, output: 0, mid_freq: 3, mid_gain: 3, color: 1.3, low_freq: 2, low_gain: 4, bypass: 0 } }],
  });
  b.p = meta(b.p, b.pid, { folder: 'Wavetable',
    description: 'Showcase Draw-VCO en Console EQ: vier stemmen van de getekende golfvorm door een VCF, met de Britse kanaal-EQ op de bus (HPF 80 Hz, +4 dB op 110 Hz, +3 dB op 3,2 kHz, kleur 1,3). Open 〜 Wave en teken een golf: die gaat live naar deze oscillator. Zonder tekening klinkt de standaardtabel.' });
  return b;
});

add((p) => {
  let b = custom(p, {
    name: 'FM-VCO klokken (2-op, 1 : 3,5)', folder: 'FM', voices: 6,
    description: 'Showcase FM-VCO: twee-operator-FM met losse modules. Per stem moduleert een sinus-VCO op 3,5× de toonhoogte (coarse +22, fine −31) de FM-ingang van de FM-VCO; een eigen envelope laat de modulatie-index uitsterven, zodat de klok helder inzet en rond uitklinkt. Verander coarse van de modulator voor andere klokken (12 = octaaf: orgel; 19 = 3×: hout), of FM amt voor meer metaal.',
    mods: [
      { k: 'mi', t: 'midiin', ctl: { steal: 0 } },
      { k: 'mod', t: 'vco', per: true, ctl: { wave: 0, coarse: 22, fine: -31, fm_amt: 0, level: 0.9 } },
      { k: 'envIdx', t: 'ahdsr', per: true, ctl: { attack: 0, hold: 0, decay: 900, sustain: 0.1, release: 900, curve: 1, retrig: true } },
      { k: 'vcaIdx', t: 'vca', per: true, ctl: { gain: 0, resp: 0 } },
      { k: 'FM-VCO', t: 'fm_vco', per: true, ctl: (v) => ({ wave: 0, coarse: 0, fine: DETUNE[v]! / 2, fm_amt: 1.4, level: 0.8 }) },
      { k: 'envAmp', t: 'ahdsr', per: true, ctl: { attack: 1, hold: 0, decay: 2600, sustain: 0, release: 1800, curve: 1 } },
      { k: 'velMath', t: 'cvmath', per: true, ctl: { mode: 1, gain_a: 1, gain_b: 1, gain_c: 1, offset: 0 } },
      { k: 'vca', t: 'vca', per: true, ctl: { gain: 0, resp: 0 } },
      { k: 'mix', t: 'mixer8', ctl: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [[`vol${i + 1}`, i < 6 ? 0.4 : 0], [`pan${i + 1}`, i < 6 ? (i / 5) * 1.0 - 0.5 : 0]]).flat()) },
      { k: 'out', t: 'out', ctl: { level: 0.8 } },
    ],
    cables: [
      ['mi.pitch', 'mod.voct'], ['mi.pitch', 'FM-VCO.voct'], ['mi.gate', 'envIdx.gate'], ['mi.gate', 'envAmp.gate'],
      ['mod.out', 'vcaIdx.in'], ['envIdx.cv_out', 'vcaIdx.cv'], ['vcaIdx.out', 'FM-VCO.fm'],
      ['FM-VCO.out', 'vca.in'], ['envAmp.cv_out', 'velMath.a'], ['mi.vel', 'velMath.b'], ['velMath.out', 'vca.cv'],
      ['vca.out', 'mix.in1'], ['mix.out_l', 'out.l'], ['mix.out_r', 'out.r'],
    ],
  });
  b = busFx(b, 'reverb', { size: 0.75, mode: 0, damp: 0.35, predelay: 20, mod: 0.35, mix: 0.3 });
  return b;
});

add((p) => {
  let b = custom(p, {
    name: 'Akkoord-machine (Chord → Octa-VCO)', folder: 'VCO',
    description: 'Showcase Chord: één toets = een heel akkoord. CHORD zet vier stemmen rond de gespeelde noot (hier Maj7, licht gespreid) en stuurt vier cellen van de Octa-VCO; samen door één ladderfilter per kant met een gedeelde envelope (parafoon, zoals een stringmachine of een house-stab). Kies een ander akkoord op CHORD (Min7, Sus4, Dim7), draai Inv voor omkeringen en Spread voor een wijdere ligging.',
    mods: [
      { k: 'mi', t: 'midiin', ctl: { priority: 0, legato: 0 } },
      { k: 'chord', t: 'chord', ctl: { chord: 2, inv: 0, spread: 0.3 } },
      { k: 'osc', t: 'octa_vco', ctl: { wave: 2, coarse: 0, fine: 0, detune: 8, level: 0.5 } },
      { k: 'mixV', t: 'mixer', ctl: { vol1: 0.8, pan1: -0.8, vol2: 0.8, pan2: -0.3, vol3: 0.8, pan3: 0.3, vol4: 0.8, pan4: 0.8 } },
      { k: 'envF', t: 'ahdsr', ctl: { attack: 20, hold: 0, decay: 800, sustain: 0.4, release: 600, curve: 1, retrig: true } },
      { k: 'ladL', t: 'ladder', ctl: { cutoff: 600, q: 0.5, drive: 1.2, cv_amt: 3, q_cv_amt: 0, drive_cv_amt: 0 } },
      { k: 'ladR', t: 'ladder', ctl: { cutoff: 600, q: 0.5, drive: 1.2, cv_amt: 3, q_cv_amt: 0, drive_cv_amt: 0 } },
      { k: 'envA', t: 'ahdsr', ctl: { attack: 12, hold: 0, decay: 400, sustain: 0.8, release: 700, curve: 1 } },
      { k: 'vcaL', t: 'vca', ctl: { gain: 0, resp: 0 } },
      { k: 'vcaR', t: 'vca', ctl: { gain: 0, resp: 0 } },
      { k: 'out', t: 'out', ctl: { level: 0.8 } },
    ],
    cables: [
      ['mi.pitch', 'chord.voct'],
      ['chord.out1', 'osc.voct_1'], ['chord.out2', 'osc.voct_2'], ['chord.out3', 'osc.voct_3'], ['chord.out4', 'osc.voct_4'],
      ['osc.out_1', 'mixV.in1'], ['osc.out_2', 'mixV.in2'], ['osc.out_3', 'mixV.in3'], ['osc.out_4', 'mixV.in4'],
      ['mixV.out_l', 'ladL.in'], ['mixV.out_r', 'ladR.in'],
      ['mi.gate', 'envF.gate'], ['envF.cv_out', 'ladL.cv'], ['envF.cv_out', 'ladR.cv'],
      ['ladL.out', 'vcaL.in'], ['ladR.out', 'vcaR.in'],
      ['mi.gate', 'envA.gate'], ['envA.cv_out', 'vcaL.cv'], ['envA.cv_out', 'vcaR.cv'],
      ['vcaL.out', 'out.l'], ['vcaR.out', 'out.r'],
    ],
  });
  b = busFx(b, 'bbd_chorus', { rate: 0.5, depth: 0.45, delay: 12, feedback: 0, mix: 0.4, spread: 1, age: 0.3, tone: 0.6 });
  b = busFx(b, 'reverb', { size: 0.6, mode: 0, damp: 0.45, predelay: 15, mod: 0.3, mix: 0.25 });
  return b;
});

add((p) => custom(p, {
  name: 'Quantizer-melodie (LFO → Quant, zelfspelend)', folder: 'Generatief',
  description: 'Showcase Quant: twee LFO\'s (een trage driehoek en een S&H-golf op 4 Hz) worden opgeteld en door de quantizer op A-mineur pentatonisch vastgeklikt. Elke nootwissel vuurt Trig, en die slaat de envelope aan: blijft de noot gelijk, dan klinkt hij door. Zelfspelend. Kies een andere Scale of Root, of draai Glide open voor glijdende noten; de gain van LFO B (CV-math) bepaalt hoe grillig de melodie springt.',
  mods: [
    { k: 'lfoA', t: 'lfo', ctl: { rate: 0.11, wave: 1, depth: 1, bipolar: true, run: 0 } },
    { k: 'lfoB', t: 'lfo', ctl: { rate: 4, wave: 4, depth: 1, bipolar: true, run: 0 } },
    { k: 'sum', t: 'cvmath', ctl: { mode: 0, gain_a: 0.7, gain_b: 0.45, gain_c: 0, offset: 0 } },
    { k: 'quant', t: 'quant', ctl: { scale: 4, root: 9, glide: 0 } },
    { k: 'vco', t: 'vco', ctl: { wave: 1, coarse: 0, fine: 0, fm_amt: 0, level: 0.85 } },
    { k: 'envF', t: 'ahdsr', ctl: { attack: 0, hold: 0, decay: 220, sustain: 0.15, release: 200, curve: 1, retrig: true } },
    { k: 'vcf', t: 'vcf', ctl: { cutoff: 900, q: 1.4, cv_amt: 0.8, q_cv_amt: 0, type: 0 } },
    { k: 'envA', t: 'ahdsr', ctl: { attack: 2, hold: 60, decay: 350, sustain: 0, release: 300, curve: 1 } },
    { k: 'vca', t: 'vca', ctl: { gain: 0, resp: 0 } },
    { k: 'echo', t: 'stereo_tape_echo', ctl: { time: 0.375, ratio: 0.75, feedback: 0.45, cross: 0.4, mix: 0.35, tone: 0.55, wow: 0.3, flutter: 0.2, drive: 0.3 } },
    { k: 'rev', t: 'reverb', ctl: { size: 0.7, mode: 0, damp: 0.4, predelay: 20, mod: 0.35, mix: 0.3 } },
    { k: 'out', t: 'out', ctl: { level: 0.55 } },
  ],
  cables: [
    ['lfoA.out', 'sum.a'], ['lfoB.out', 'sum.b'], ['sum.out', 'quant.in'], ['quant.out', 'vco.voct'],
    ['quant.trig', 'envF.gate'], ['quant.trig', 'envA.gate'],
    ['vco.out', 'vcf.in'], ['envF.cv_out', 'vcf.cv'], ['vcf.out', 'vca.in'], ['envA.cv_out', 'vca.cv'],
    ['vca.out', 'echo.in_l'], ['vca.out', 'echo.in_r'], ['echo.out_l', 'rev.in_l'], ['echo.out_r', 'rev.in_r'],
    ['rev.out_l', 'out.l'], ['rev.out_r', 'out.r'],
  ],
}));

add((p) => {
  let b = recipe(p, {
    name: 'Sitar-snaren (String → Resonator)', voices: 6, filter: null,
    source: { type: 'string', controls: { pluck: 0.9, level: 0.9 } },
    bus: [
      { type: 'resonator', controls: { root: 0, scale: 1, structure: 0.3, decay: 0.8, damping: 0.55, mix: 0.45, level: 0.8 } },
      { type: 'elements_reverb', controls: { amount: 0.3, time: 0.6, diffusion: 0.7, lp: 0.6 } },
    ],
  });
  const res = cabled(b.p, b.pid, 'resonator');
  b.p = setCtl(b.p, b.pid, [res[1]!], { structure: 0.42 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 1, hold: 0, decay: 600, sustain: 1, release: 2500, curve: 1 });
  b.p = meta(b.p, b.pid, { folder: 'Physical modelling',
    description: 'Showcase Resonator: zes Karplus-Strong-snaren, met op de bus een bank van twaalf meeklinkende snaren per kant, gestemd op C-majeur (zoals de sympathische snaren van een sitar of de klankkast van een piano). Speel in C: verwante noten laten de bank zingen, vreemde noten veel minder. Scale en Root op de resonator stemmen de bank om; Struct links en rechts verschilt voor breedte.' });
  return b;
});

add((p) => {
  const drum = (k: string, drum: number, extra: Ctl): Mod => ({ k, t: 'cr78', ctl: { drum, tone: 0.5, decay: 0.5, bend: 0.5, level: 0.8, ...extra } });
  let b = custom(p, {
    name: 'CR-78-groove (Grids, zelfspelend)', folder: 'Drums',
    description: 'Showcase CR-78 en Grids: de Roland CompuRhythm van In the Air Tonight, Heart of Glass en Vienna, berekend in plaats van gesampeld. Grids klokt kick, snare, hi-hat en maracas; zijn accent-uitgang gaat naar de accent-ingang van kick en snare (luider én een hardere pitch-buiging, zoals het echte circuit). Zelfspelend op 96 bpm. Loop met X en Y over de drumkaart, of draai BD/SD/HH voor drukker en kaler. Diode-compressor en een korte plaat op de bus.',
    mods: [
      { k: 'grids', t: 'grids', ctl: { x: 0.3, y: 0.35, bd: 0.7, sd: 0.55, hh: 0.75, chaos: 0.05, tempo: 96, extclock: false } },
      drum('kick', 0, { tone: 0.4, decay: 0.55, level: 0.9 }),
      drum('snare', 1, { tone: 0.55, decay: 0.45 }),
      drum('hat', 5, { tone: 0.6, decay: 0.3, level: 0.6 }),
      drum('maracas', 7, { tone: 0.5, decay: 0.3, level: 0.5 }),
      { k: 'mix', t: 'mixer', ctl: { vol1: 0.9, pan1: 0, vol2: 0.75, pan2: -0.15, vol3: 0.5, pan3: 0.3, vol4: 0.4, pan4: -0.4 } },
      { k: 'out', t: 'out', ctl: { level: 0.8 } },
    ],
    cables: [
      ['grids.bd', 'kick.gate'], ['grids.sd', 'snare.gate'], ['grids.hh', 'hat.gate'], ['grids.hh', 'maracas.gate'],
      ['grids.acc', 'kick.accent_cv'], ['grids.acc', 'snare.accent_cv'],
      ['kick.out', 'mix.in1'], ['snare.out', 'mix.in2'], ['hat.out', 'mix.in3'], ['maracas.out', 'mix.in4'],
      ['mix.out_l', 'out.l'], ['mix.out_r', 'out.r'],
    ],
  });
  b = busFx(b, 'diode_comp', { threshold: -18, makeup: 4, ratio: 2, attack: 1, release: 4, color: 1.2, mix: 1, bypass: 0 });
  b = busFx(b, 'reverb', { size: 0.4, mode: 0, damp: 0.55, predelay: 10, mod: 0.2, mix: 0.15 });
  return b;
});

add((p) => custom(p, {
  name: 'Wah-EP per stem (DX7 · Env-Follow-8 → Octa-VCF)', folder: 'FM', voices: 8,
  description: 'Showcase Env-Follow-8 en Octa-VCF: acht DX7-stemmen (E.PIANO 1), elk met een eigen envelope follower die het eigen bandfilter openduwt. Anders dan een wah op de bus reageert elke noot op zijn eigen aanslag: een harde noot in een zacht akkoord "kwaakt" alleen. Sens en Release op de follower bepalen het gedrag; Type op de Octa-VCF (LP/BP/HP) het karakter.',
  mods: [
    { k: 'mi', t: 'midiin', ctl: { steal: 0 } },
    { k: 'DX7', t: 'dx7', per: true, ctl: { bank: 0, program: 10, coarse: 0, fine: 0, level: 0.75 } },
    { k: 'ENV-FOLLOW', t: 'env_follower', cells: 'follow', ctl: { attack: 4, release: 200, sens: 14, thresh: 0.1, mode: 0 } },
    { k: 'OCTA-VCF', t: 'octa_vcf', cells: 'flt', ctl: { cutoff: 380, q: 1.8, cv_amt: 4, type: 1 } },
    { k: 'mix', t: 'mixer8', ctl: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [[`vol${i + 1}`, 0.5], [`pan${i + 1}`, (i / 7) * 1.0 - 0.5]]).flat()) },
    { k: 'out', t: 'out', ctl: { level: 0.85 } },
  ],
  cables: [
    ['mi.pitch', 'DX7.voct'], ['mi.gate', 'DX7.gate'], ['mi.vel', 'DX7.vel'],
    ['DX7.out', 'ENV-FOLLOW.in_1'], ['DX7.out', 'OCTA-VCF.in_1'], ['ENV-FOLLOW.env_1', 'OCTA-VCF.cv_1'],
    ['OCTA-VCF.out_1', 'mix.in1'], ['mix.out_l', 'out.l'], ['mix.out_r', 'out.r'],
  ],
}));

add((p) => {
  let b = recipe(p, {
    name: 'Ringmod-klokken (VCO × draaggolf)', voices: 6, filter: null,
    source: { type: 'vco', controls: { wave: 0, coarse: 0, fine: 0, level: 0.9 } },
    voiceFx: [{ type: 'ringmod', controls: { freq: 915.7, wave: 0, mode: 0, bias: 0.3, mix: 1 } }],
    bus: [{ type: 'reverb', controls: { size: 0.75, mode: 0, damp: 0.35, predelay: 20, mod: 0.35, mix: 0.3 } }],
  });
  const mi = col(b.p, b.rid, 'midiin')[0]!;
  const rm = col(b.p, b.rid, 'ringmod')[0]!;
  b.p = feedCvInput(b.p, b.pid, { moduleId: mi, portId: 'pitch' }, { moduleId: rm, portId: 'voct' }).project;
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 1, hold: 0, decay: 3000, sustain: 0, release: 2200, curve: 1 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'mixer8'), Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`vol${i + 1}`, 0.42])));
  b.p = spreadVoices(b.p, b.pid, 0.6).project;
  b.p = meta(b.p, b.pid, { folder: 'Effect',
    description: 'Showcase Ringmod: per stem een sinus maal een draaggolf die de toonhoogte volgt op 3,5× (Freq 915,7 Hz bij C4, V/Oct van het klavier). Het product bevat alleen som- en verschiltonen (2,5× en 4,5×): een klok die over het hele klavier gelijk blijft. Zet Mode op Diode voor de gemene vier-diodenring, of haal de V/Oct-kabel los voor metaal dat per toets anders is.' });
  return b;
});

add((p) => {
  let b = recipe(p, {
    name: 'Octaver-bas (OC-2)', voices: 1,
    source: { type: 'vco', controls: { wave: 2, coarse: 0, fine: 0, level: 0.85 } },
    filter: { type: 'ladder', controls: { cutoff: 700, q: 0.4, drive: 1.3, cv_amt: 2.5, q_cv_amt: 0 } },
    voiceFx: [{ type: 'octaver', controls: { oct1: 0.8, oct2: 0.35, up: 0, dry: 0.8, tone: 0.4 } }],
    bus: [{ type: 'comp', controls: { threshold: -20, ratio: 4, attack: 10, release: 150, makeup: 4, drive: 0.25 } }],
  });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'midiin'), { priority: 0, legato: 1, glide: 40 });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 0), { attack: 2, hold: 0, decay: 250, sustain: 0.35, release: 150, curve: 1, retrig: true });
  b.p = setCtl(b.p, b.pid, col(b.p, b.rid, 'ahdsr', 1), { attack: 3, hold: 0, decay: 300, sustain: 0.85, release: 150, curve: 1 });
  b.p = meta(b.p, b.pid, { folder: 'Effect',
    description: 'Showcase Octaver: een monofone zaagtandbas door de analoge octaver (flip-flop-delers, OC-2-familie): −1 octaaf stevig erbij, −2 octaven een beetje, het droge signaal ernaast. Speel één noot tegelijk in het middenregister; de sub komt eronder. Up is de Octavia-truc (octaaf omhoog, rauw). Compressor met wat drive op de bus.' });
  return b;
});

// Bestaande seeds uit de editor (Voorbeelden) die ongedekte modules laten horen.
const seeded = (fn: (p: ModularProject) => ModularProject, folder: string, name?: string, outLevel?: number) => add((p) => {
  const b = last(fn(p));
  if (outLevel !== undefined) b.p = setCtl(b.p, b.pid, cabled(b.p, b.pid, 'out'), { level: outLevel });
  b.p = meta(b.p, b.pid, { folder, ...(name ? { name } : {}), description: b.p.patches.find((x) => x.id === b.pid)!.description ?? '' });
  return b;
});
seeded(seedKrellPatch, 'Generatief', 'Krell (Stages + Marbles, zelfspelend)');
seeded(seedGenerativeJamPatch, 'Generatief', 'Generative jam (Marbles → Plaits → Clouds)', 1);
seeded(seedCloudsAmbientPatch, 'Effect', 'Clouds ambient (Plaits → Clouds · Tides)', 1);
seeded(seed808JamPatch, 'Drums', '808-jam (Marbles → Peaks, zelfspelend)');
seeded(seedWarpsVocoderPatch, 'Stemmen', 'Warps vocoder (robotstem)');

// ── uitvoeren ───────────────────────────────────────────────────────────

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const loaded = migrateProject(raw);
if (!loaded) throw new Error(`${inPath} is geen MMB-project`);
// Bewust géén seedInternals hier: de library blijft op de moduletypes van de
// export staan. Wat de werkboom intussen aan nieuwe (onaffe) types heeft,
// hoort niet ongemerkt in het project van de gebruiker te komen.
let project = loaded;
const typesBefore = project.moduleTypes.length;
const keepActive = { patch: project.activePatchId, rack: project.activeRackId };
const before = project.patches.length;

const moves: string[] = [];
project = {
  ...project,
  patches: project.patches.map((x) => {
    const folder = folderFor(project, x);
    if ((x.folder ?? '') !== folder) moves.push(`${x.folder ?? '(geen map)'} → ${folder}: ${x.name}`);
    return { ...x, folder };
  }),
};

const made: { name: string; folder: string; voices: number; id: string }[] = [];
for (const fn of builders) {
  const b = fn(project);
  validate(b.p, b.pid);
  project = b.p;
  const x = project.patches.find((q) => q.id === b.pid)!;
  made.push({ name: x.name, folder: x.folder ?? '', voices: x.voiceCount, id: x.id });
}
project = { ...project, activePatchId: keepActive.patch, activeRackId: keepActive.rack };

// Dekking: welke interne types hangen nu nergens aan een kabel?
const usedTypes = new Set<string>();
for (const x of project.patches) {
  const ids = new Set(x.connections.flatMap((c) => [c.from.moduleId, c.to.moduleId]));
  for (const m of project.modules) if (ids.has(m.id)) usedTypes.add(m.typeId);
}
const uncovered = project.moduleTypes.filter((t) => t.internal && !usedTypes.has(t.id)).map((t) => t.id.replace('tp_mmb_', ''));

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(project));
const folders = new Map<string, number>();
for (const x of project.patches) folders.set(x.folder ?? '', (folders.get(x.folder ?? '') ?? 0) + 1);
fs.writeFileSync(outPath.replace(/\.json$/, '.report.json'), JSON.stringify({ made, moves, warnings, uncovered, folders: Object.fromEntries(folders) }, null, 1));

if (project.moduleTypes.length !== typesBefore) {
  throw new Error(`moduletypes veranderd (${typesBefore} → ${project.moduleTypes.length}): een seed of recept heeft seedInternals aangeroepen`);
}
console.log(`patches: ${before} → ${project.patches.length} · racks: ${project.racks.length} · modules: ${project.modules.length}`);
console.log('mappen:', [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0], 'nl')).map(([k, n]) => `${k} (${n})`).join(', '));
console.log(`verplaatst: ${moves.length}`); for (const m of moves) console.log('  ' + m);
console.log(`nieuw: ${made.length}`); for (const m of made) console.log(`  [${m.folder}] ${m.name} (${m.voices})`);
console.log('nog ongedekt:', uncovered.join(', ') || '—');
if (warnings.length) { console.log(`waarschuwingen: ${warnings.length}`); for (const w of warnings) console.log('  ' + w); }
