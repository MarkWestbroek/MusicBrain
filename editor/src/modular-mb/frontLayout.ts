// Het front als virtueel paneel (doc/plans/patch-front.md §4) en het
// automatische front (§5). Puur: geen React, geen store. (Heet frontLayout
// en niet frontPanel: op Windows botst dat met FrontPanel.tsx.)
//
// Een front wordt een tijdelijke ModuleType + ModuleInstance met de echte
// controldefinities (taper, bereik, schakelstanden) en een rasterlayout in
// `visual`, zodat `ModulePanel` het ongewijzigd tekent. Elke control krijgt
// een virtueel id (`c0`, `c1`, …) dat via `map` terugwijst naar
// (moduleId, controlId); poorten net zo (`p0`, …).
//
// Displays en LED's zijn ook controls en kunnen dus ook op een front. Zij
// tonen geen eigen waarde maar die van een andere control van hun module
// (`bindTo`): die waarden komen via `binds` uit de echte module, ook als de
// knop zelf niet op het front staat.

import { DULL_CONTROL, FRONT_CONTROLS } from './frontControls';
import { kindOf, type ModuleKindTag } from './recipe/catalog';
import { findTwin } from './recipe/edits';
import {
  MM_PER_HP, defaultValueOf, resolveControls, resolvePorts,
  type Control, type ControlValue, type FrontItem, type ModularProject, type ModuleInstance,
  type ModuleType, type PanelDecoration, type Patch, type PatchFront, type Port,
} from './types';

export type FrontTarget =
  | { kind: 'control'; moduleId: string; controlId: string }
  | { kind: 'port'; moduleId: string; portId: string };

export interface FrontModule {
  module: ModuleInstance;
  type: ModuleType;
  /** Virtueel control-/poort-id → echte (module, control|poort). */
  map: Record<string, FrontTarget>;
  /** Waar displays en LED's naar kijken: sleutel in de controlState van het
   *  virtuele paneel → echte (module, control), met de standaardwaarde. */
  binds: Record<string, { moduleId: string; controlId: string; def?: ControlValue }>;
  widthMm: number;
  heightMm: number;
}

// Raster in mm. Een rij knoppen is 28 mm hoog (grote knop r 8,5 + label);
// een rij jacks 15 mm; een groepskopje 7 mm.
const MARGIN_X = 5;
const TOP = 11;
const CELL_W = 24;
const ROW_KNOB = 28;
const ROW_PORT = 15;
const GROUP_H = 5;      // extra hoogte van een rij met een groepskopje erboven
const BOTTOM = 4;
export const DEFAULT_COLUMNS = 4;

/** Hoogte die een control in zijn rij vraagt (sliders en lange schakelaars
 *  zijn hoger dan een knop). */
function rowHeightFor(c: Control): number {
  switch (c.kind) {
    case 'slider': return c.orientation === 'v' ? (c.lengthMm ?? 18) + 12 : ROW_KNOB;
    case 'switch': return Math.max(ROW_KNOB, (c.positions.length <= 3 ? 6 : 2.2 * c.positions.length) + 10);
    case 'display': return c.size === 'large' ? 20 : 15;
    case 'led': return 12;
    default: return ROW_KNOB;
  }
}

/** Hoeveel rastercellen een control breed is: een lang display (de voicenaam
 *  van de DX7 in groot) neemt er twee. Zelfde maten als `DisplayGlyph`. */
function spanFor(c: Control): number {
  if (c.kind !== 'display') return 1;
  const charW = c.size === 'large' ? 3.4 : c.size === 'small' ? 1.4 : 2.0;
  return Math.max(1, Math.ceil((c.digits * charW + 4) / CELL_W));
}

/** Het label op het front: eigen label, anders het onderschrift van de
 *  patch, anders de gedrukte naam. */
export function frontLabel(item: Extract<FrontItem, { kind: 'control' }>, patch: Patch, c: Control): string {
  return item.label ?? patch.controlLabels?.[item.moduleId]?.[item.controlId] ?? c.label ?? c.id;
}

/** Bouw het virtuele paneel. Items naar onbekende modules of controls worden
 *  overgeslagen (zie `pruneFronts`). */
export function buildFrontModule(front: PatchFront, patch: Patch, project: ModularProject): FrontModule {
  const columns = Math.max(1, front.columns ?? DEFAULT_COLUMNS);
  const widthMm = columns * CELL_W + 2 * MARGIN_X;
  const controls: Control[] = [];
  const ports: Port[] = [];
  const map: Record<string, FrontTarget> = {};
  const binds: FrontModule['binds'] = {};
  const controlPlacements: ModuleInstance['visual']['controlPlacements'] = {};
  const portPlacements: ModuleInstance['visual']['portPlacements'] = {};
  const texts: NonNullable<ModuleInstance['visual']['texts']> = [
    { x: widthMm / 2, y: 6.5, text: front.name, fontSize: 3.2 },
  ];
  // Subtiele tegels om elke groep (per rij een segment), iets donkerder dan
  // het paneel, zodat de links uitgelijnde kopjes bij hun knoppen horen.
  const decorations: PanelDecoration[] = [];
  const TILE = '#bfc5cb';
  const tile = (x0: number, x1: number, y0: number, y1: number) =>
    decorations.push({ kind: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, color: TILE });

  // Eerst de controls in rasterrijen; de jacks komen daaronder. Een
  // groepskopje hangt boven de cel die erop volgt (inline, geen eigen rij),
  // zodat vier kolommen gevuld blijven; een kopje vlak vóór de jacks wordt
  // de kop van het jack-blok.
  type Cell = { c: Control; vid: string; size?: 'small' | 'large'; group?: string; span: number };
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let used = 0;   // bezette kolommen in de lopende rij
  const flush = () => { if (row.length) { rows.push(row); row = []; } used = 0; };
  const portItems: Extract<FrontItem, { kind: 'port' }>[] = [];
  // Vrij geplaatste items (stap 4) staan buiten het raster, op hun eigen mm.
  const free: { c: Control; vid: string; size?: 'small' | 'large'; x: number; y: number }[] = [];
  let freeBottom = 0;
  let portsHeader: string | undefined;
  let pendingGroup: string | undefined;
  let n = 0;
  for (const it of front.items) {
    if (it.kind === 'group') { pendingGroup = it.text; continue; }
    if (it.kind === 'port') { portItems.push(it); if (pendingGroup) { portsHeader = pendingGroup; pendingGroup = undefined; } continue; }
    const m = project.modules.find((x) => x.id === it.moduleId);
    if (!m) continue;
    const all = resolveControls(m, project.moduleTypes);
    const real = all.find((c) => c.id === it.controlId);
    if (!real) continue;
    const vid = `c${n++}`;
    let c: Control;
    if (real.kind === 'display' || real.kind === 'led') {
      // Een display houdt zijn eigen (meestal lege) label; de binding gaat
      // naar een sleutel die `frontControlState` uit de echte module vult.
      const bind = (id?: string): string | undefined => {
        if (!id) return undefined;
        const bound = all.find((x) => x.id === id);
        const key = `${vid}:${id}`;
        binds[key] = { moduleId: it.moduleId, controlId: id, ...(bound ? { def: defaultValueOf(bound) } : {}) };
        return key;
      };
      const label = it.label ?? real.label;
      c = real.kind === 'display'
        ? { ...real, id: vid, label, size: it.size ?? real.size, bindTo: bind(real.bindTo), bindTo2: bind(real.bindTo2) }
        : { ...real, id: vid, label, size: it.size ?? real.size, bindTo: bind(real.bindTo) };
    } else {
      c = { ...real, id: vid, label: frontLabel(it, patch, real) } as Control;
    }
    if (c.kind === 'knob' && it.range) {
      const min = Math.max(c.min, Math.min(it.range.min, it.range.max));
      const max = Math.min(c.max, Math.max(it.range.min, it.range.max));
      if (min < max) c = { ...c, min, max, defaultValue: Math.min(max, Math.max(min, c.defaultValue)) };
    }
    map[vid] = { kind: 'control', moduleId: it.moduleId, controlId: it.controlId };
    if (it.pos) {
      free.push({ c, vid, size: it.size, x: it.pos.x, y: it.pos.y });
      freeBottom = Math.max(freeBottom, it.pos.y + rowHeightFor(c) / 2 + 4);
      continue;
    }
    const span = Math.min(columns, spanFor(c));
    if (used + span > columns) flush();
    row.push({ c, vid, size: it.size, group: pendingGroup, span });
    pendingGroup = undefined;
    used += span;
    if (used >= columns) flush();
  }
  flush();

  let y = TOP;
  let inGroup = false;   // een groep loopt door over rijen tot het volgende kopje
  for (const r of rows) {
    const withGroup = r.some((cell) => cell.group);
    const top = y + (withGroup ? GROUP_H : 0);
    const h = Math.max(...r.map((cell) => rowHeightFor(cell.c)));
    let segStart: number | null = inGroup ? 0 : null;
    // Segmenten in kolommen (een breed display telt voor twee): van `from`
    // tot vóór `to`.
    const closeSeg = (from: number, to: number) => {
      if (to <= from) return;   // lege reeks (kopje op de eerste cel van een doorlopende groep)
      tile(MARGIN_X + CELL_W * from + 1, MARGIN_X + CELL_W * to - 1, y + 0.8, top + h - 1.2);
    };
    let col = 0;
    for (const cell of r) {
      controls.push(cell.c);
      const cx = MARGIN_X + CELL_W * (col + cell.span / 2);
      // Een staande schuif tekent zich rond zijn midden (SliderGlyph): midden
      // op top + 3 + len/2, zodat hij netjes binnen de rij (len + 12) valt.
      const cy = cell.c.kind === 'slider' && cell.c.orientation === 'v' ? top + 3 + (cell.c.lengthMm ?? 18) / 2 : top + h / 2 - 2;
      controlPlacements[cell.vid] = {
        x: cx, y: cy,
        sizeOverride: cell.c.kind === 'knob' ? (cell.size === 'large' ? 'large' : cell.size === 'small' ? 'small' : 'medium') : undefined,
      };
      if (cell.group) {
        if (segStart !== null) closeSeg(segStart, col);
        segStart = col; inGroup = true;
        texts.push({ x: MARGIN_X + CELL_W * col + 2.2, y: y + 3.7, text: cell.group, fontSize: 2.1, align: 'start', color: '#374151' });
      }
      col += cell.span;
    }
    if (segStart !== null) closeSeg(segStart, col);
    y = top + h;
  }

  if (portItems.length) {
    y += 2;
    const portsTop = y;
    let g = 0;   // rasterjacks (vrij geplaatste tellen niet mee voor de rijen)
    if (portsHeader) { texts.push({ x: MARGIN_X + 2.2, y: y + 3.7, text: portsHeader, fontSize: 2.1, align: 'start', color: '#374151' }); y += GROUP_H; }
    let i = 0;
    for (const it of portItems) {
      const m = project.modules.find((x) => x.id === it.moduleId);
      if (!m) continue;
      const real = resolvePorts(m, project.moduleTypes).find((p) => p.id === it.portId);
      if (!real) continue;
      const vid = `p${i}`;
      ports.push({ ...real, id: vid, name: it.label ?? real.name });
      map[vid] = { kind: 'port', moduleId: it.moduleId, portId: it.portId };
      if (it.pos) {
        portPlacements[vid] = { x: it.pos.x, y: it.pos.y, labelPos: 'below' };
        freeBottom = Math.max(freeBottom, it.pos.y + 8);
        i++;
        continue;
      }
      const col = g % columns;
      const prow = Math.floor(g / columns);
      portPlacements[vid] = { x: MARGIN_X + CELL_W * (col + 0.5), y: y + 5 + prow * ROW_PORT, labelPos: 'below' };
      i++; g++;
    }
    y += Math.ceil(g / columns) * ROW_PORT;
    if (g) tile(MARGIN_X + 1, MARGIN_X + CELL_W * Math.min(columns, g) - 1, portsTop + 0.8, y - 0.5);
  }
  for (const f of free) {
    controls.push(f.c);
    controlPlacements[f.vid] = {
      x: f.x, y: f.y,
      sizeOverride: f.c.kind === 'knob' ? (f.size === 'large' ? 'large' : f.size === 'small' ? 'small' : 'medium') : undefined,
    };
  }
  const heightMm = Math.max(40, y + BOTTOM, freeBottom + BOTTOM);
  const hpWidth = Math.ceil(widthMm / MM_PER_HP);

  const type: ModuleType = {
    id: `__front__:${front.id}`, categoryId: 'utility', variant: front.name, internal: true,
    ports, controls,
  };
  const module: ModuleInstance = {
    id: `front:${front.id}`, typeId: type.id, internal: true, name: front.name,
    visual: { hpWidth, heightMm, texture: 'aluminum', decorations, texts, controlPlacements, portPlacements },
  };
  return { module, type, map, binds, widthMm: hpWidth * MM_PER_HP, heightMm };
}

/** De waarden van het virtuele paneel: uit de patch, met de live waarden van
 *  de engine of de Teensy eroverheen. */
export function frontControlState(
  fm: FrontModule, patch: Patch, live?: Record<string, Record<string, ControlValue>>,
): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (const c of fm.type.controls) {
    const t = fm.map[c.id];
    if (!t || t.kind !== 'control' || c.kind === 'display' || c.kind === 'led') continue;
    const v = live?.[t.moduleId]?.[t.controlId] ?? patch.controlState[t.moduleId]?.[t.controlId];
    out[c.id] = v ?? defaultValueOf(c);
  }
  // Waar de displays en LED's naar kijken (ook lopende waarden van de engine,
  // zoals de stap van een sequencer).
  for (const [key, b] of Object.entries(fm.binds)) {
    const v = live?.[b.moduleId]?.[b.controlId] ?? patch.controlState[b.moduleId]?.[b.controlId] ?? b.def;
    if (v !== undefined) out[key] = v;
  }
  return out;
}

// ── Automatisch front ───────────────────────────────────────────────────

const PLAY_MODULES = new Set(['tp_mmb_pads', 'tp_mmb_faders', 'tp_mmb_knobs']);
const PLAYABLE = new Set<Control['kind']>(['knob', 'slider', 'switch', 'toggle', 'button', 'joystick']);

/** Modules van de patch in signaalvolgorde: bronnen eerst (Kahn over de
 *  kabels), daarna wat niet bekabeld is in rackvolgorde. Poly-followers
 *  (groepslid > 0) blijven weg: de master spreekt voor de groep. */
export function patchModulesInSignalOrder(patch: Patch, project: ModularProject): ModuleInstance[] {
  const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
  const followers = new Set<string>();
  for (const r of racks) for (const g of r.polyGroups ?? []) {
    g.members.slice(1).forEach((m) => { if (m.kind === 'module') followers.add(m.moduleId); });
  }
  const order: string[] = [];
  for (const r of racks) for (const s of r.slots) if (!followers.has(s.moduleId) && !order.includes(s.moduleId)) order.push(s.moduleId);
  for (const c of patch.connections) for (const id of [c.from.moduleId, c.to.moduleId])
    if (!followers.has(id) && !order.includes(id)) order.push(id);
  const ids = new Set(order);
  const indeg = new Map(order.map((id) => [id, 0]));
  const out = new Map<string, string[]>(order.map((id) => [id, []]));
  for (const c of patch.connections) {
    const a = c.from.moduleId, b = c.to.moduleId;
    if (!ids.has(a) || !ids.has(b) || a === b) continue;
    out.get(a)!.push(b);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const result: string[] = [];
  const ready = order.filter((id) => indeg.get(id) === 0);
  const seen = new Set<string>();
  while (ready.length) {
    const id = ready.shift()!;
    if (seen.has(id)) continue;
    seen.add(id); result.push(id);
    for (const b of out.get(id) ?? []) {
      indeg.set(b, indeg.get(b)! - 1);
      if (indeg.get(b) === 0) ready.push(b);
    }
  }
  for (const id of order) if (!seen.has(id)) result.push(id);   // kringen
  return result.flatMap((id) => { const m = project.modules.find((x) => x.id === id); return m ? [m] : []; });
}

/** De modules van de patch in signaalvolgorde, met een naam die ze uit
 *  elkaar houdt: twee AHDSR's krijgen het label van hun poly-groep (envFlt,
 *  envAmp) of anders een volgnummer. */
export function frontAddModules(patch: Patch, project: ModularProject): { id: string; label: string }[] {
  const mods = patchModulesInSignalOrder(patch, project);
  const groupLabel = (id: string): string | undefined => {
    for (const r of project.racks) for (const g of r.polyGroups ?? [])
      if (g.members.some((m) => m.kind === 'module' && m.moduleId === id)) return g.label;
    return undefined;
  };
  const count = new Map<string, number>();
  for (const m of mods) count.set(m.name, (count.get(m.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return mods.map((m) => {
    if ((count.get(m.name) ?? 0) < 2) return { id: m.id, label: m.name };
    const n = (seen.get(m.name) ?? 0) + 1;
    seen.set(m.name, n);
    const g = groupLabel(m.id);
    return { id: m.id, label: `${m.name} · ${g && g !== m.name ? g : n}` };
  });
}

/** De controls van een module in volgorde van vermoedelijk belang voor een
 *  speler. Eerst de lijst van het type (`FRONT_CONTROLS`), in die volgorde.
 *  Dan de rest van de knoppen, schuiven en karakterschakelaars: wat van zijn
 *  standaardwaarde afwijkt (bewust gezet), dan de schakelaars, dan de
 *  paneelvolgorde; stemming en volume achteraan. */
export function rankKnobs(m: ModuleInstance, patch: Patch, project: ModularProject): Control[] {
  const all = resolveControls(m, project.moduleTypes);
  const listed = (FRONT_CONTROLS[m.typeId] ?? []).flatMap((id) => {
    const c = all.find((x) => x.id === id);
    return c && PLAYABLE.has(c.kind) ? [c] : [];
  });
  // Draaiknoppen en schuiven, plus de schakelaars die het karakter kiezen
  // (type, mode, stack, model, engine, wave); andere schakelaars alleen via
  // de lijst van het type.
  const rest = all.filter((c) => !listed.includes(c)
    && (c.kind === 'knob' || c.kind === 'slider' || ((c.kind === 'switch' || c.kind === 'toggle') && CHARACTER_SWITCHES.has(c.id))));
  const state = patch.controlState[m.id] ?? {};
  const deviates = (c: Control) => state[c.id] !== undefined && JSON.stringify(state[c.id]) !== JSON.stringify(defaultValueOf(c));
  const rank = (c: Control) => (DULL_CONTROL.test(c.id) ? 2000 : 0)
    + (deviates(c) ? 0 : c.kind === 'switch' || c.kind === 'toggle' ? 500 : 1000);
  return [...listed, ...rest.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c)];
}
const CHARACTER_SWITCHES = new Set(['type', 'mode', 'stack', 'model', 'engine', 'wave', 'algo', 'algorithm']);

/** Waar het automatische front uit kiest: de lijst van het type als die er
 *  is (leidend, ook als hij leeg is), anders de vuistregels van `rankKnobs`. */
function autoPicks(m: ModuleInstance, patch: Patch, project: ModularProject): { picks: Control[]; listed: boolean } {
  const list = FRONT_CONTROLS[m.typeId];
  const ranked = rankKnobs(m, patch, project);
  return list ? { picks: ranked.filter((c) => list.includes(c.id)), listed: true } : { picks: ranked, listed: false };
}

/** Het front voor een patch zonder front (§5): gelabelde controls, gebonden
 *  controls, de speelmodules, aangevuld tot `max` knoppen in signaalvolgorde;
 *  naamdisplays bij hun knop; jacks: de uitgangen van een AUDIO IN en de
 *  audio-ingangen van modules die nog geen audio krijgen. Niet opgeslagen;
 *  de aanroeper bewaart het pas als iemand het bewerkt. */
export function autoFront(patch: Patch, project: ModularProject, max = 8): PatchFront {
  const mods = patchModulesInSignalOrder(patch, project);
  const items: FrontItem[] = [];
  const have = new Set<string>();
  const add = (moduleId: string, controlId: string, extra: Partial<Extract<FrontItem, { kind: 'control' }>> = {}) => {
    const key = `${moduleId}/${controlId}`;
    if (have.has(key)) return;
    have.add(key);
    items.push({ kind: 'control', moduleId, controlId, ...extra });
  };
  const playable = (m: ModuleInstance) => resolveControls(m, project.moduleTypes).filter((c) => PLAYABLE.has(c.kind));

  // 1. Gelabelde controls, in signaalvolgorde.
  for (const m of mods) for (const c of playable(m)) if (patch.controlLabels?.[m.id]?.[c.id]) add(m.id, c.id, { size: 'large' });
  // 2. Controls met een surface-binding.
  for (const b of project.midiMap?.bindings ?? []) {
    const m = mods.find((x) => x.id === b.mod);
    if (m && playable(m).some((c) => c.id === b.ctrl)) add(m.id, b.ctrl);
  }
  // 3. De speelmodules (PADS, FADERS, KNOBS): de pads en schuiven zelf.
  for (const m of mods) if (PLAY_MODULES.has(m.typeId)) {
    const list = FRONT_CONTROLS[m.typeId];
    for (const c of playable(m)) if (!list || list.includes(c.id)) add(m.id, c.id);
  }
  // 4. Aanvullen in signaalvolgorde: per module een kopje met zijn naam en
  //    zijn belangrijkste knoppen, tot `max`. Twee rondes: eerst krijgt
  //    elke module zijn deel (de bron drie, de rest twee), daarna vullen we
  //    de plekken die over zijn met de volgende knoppen uit de lijst van
  //    het type, bij de eigen module. Zo krijgt een E-piano met alleen een
  //    OUT erachter zijn tremolo en drive erbij in plaats van vier lege
  //    plekken.
  const count = () => items.filter((it) => it.kind === 'control').length;
  //    Welke modules eerst: die op het audiopad (bron, filter, effect, VCA,
  //    uit), dan envelopes, dan LFO's en de rest (mixers, CV-rekenwerk);
  //    binnen een laag de signaalvolgorde. Anders kwamen in een receptpatch
  //    de LFO en de envelopes vóór de VCO en het filter.
  //    Welke knoppen: de lijst van het moduletype (`FRONT_CONTROLS`); een
  //    type zonder lijst volgt de vuistregels van `rankKnobs`.
  const roleOf = (m: ModuleInstance) => project.moduleTypes.find((t) => t.id === m.typeId)?.role;
  const layer = (m: ModuleInstance): number => {
    const t = project.moduleTypes.find((x) => x.id === m.typeId);
    const k: ModuleKindTag = t ? kindOf(t) : 'util';
    return k === 'source' || k === 'filter' || k === 'fx' || k === 'vca' || k === 'drum' || k === 'noise' ? 0
      : k === 'out' ? 1 : k === 'env' ? 2 : k === 'lfo' || k === 'seq' ? 3 : 4;
  };
  const ordered = mods.map((m, i) => ({ m, i })).sort((a, b) => layer(a.m) - layer(b.m) || a.i - b.i).map((x) => x.m);
  // Een stereopaar (dezelfde mono-module op L en R) staat één keer op het
  // front; de knop schrijft naar allebei (setPatchControl met twins).
  const twinned = new Set<string>();
  const isSource = (m: ModuleInstance): boolean => {
    const t = project.moduleTypes.find((x) => x.id === m.typeId);
    return !!t && kindOf(t) === 'source';
  };
  const left = (m: ModuleInstance) => autoPicks(m, patch, project).picks.filter((c) => !have.has(`${m.id}/${c.id}`));
  const shown: ModuleInstance[] = [];   // modules met een eigen kopje, in volgorde
  for (const m of ordered) {
    if (count() >= max) break;
    if (roleOf(m) === 'event-source') continue;   // MIDI-IN: kanaal en bendbereik zijn geen speelknoppen
    if (twinned.has(m.id)) continue;
    const tw = findTwin(project, patch, m);
    if (tw) twinned.add(tw[0].id === m.id ? tw[1].id : tw[0].id);
    // De klankbron krijgt drie knoppen (daar zit het karakter), de rest twee.
    const next = left(m).slice(0, isSource(m) ? 3 : 2);
    if (!next.length) continue;
    items.push({ kind: 'group', text: m.name });
    for (const c of next) { if (count() >= max) break; add(m.id, c.id); }
    shown.push(m);
  }
  // Tweede ronde: om de beurt één knop erbij (de bron twee), alleen uit de
  // lijst van het type, direct achter de knoppen die de module al heeft.
  for (let grew = true; grew && count() < max;) {
    grew = false;
    for (const m of shown) {
      if (!autoPicks(m, patch, project).listed) continue;
      for (const c of left(m).slice(0, isSource(m) ? 2 : 1)) {
        if (count() >= max) break;
        let last = -1;
        items.forEach((it, i) => { if (it.kind === 'control' && it.moduleId === m.id) last = i; });
        have.add(`${m.id}/${c.id}`);
        items.splice(last + 1, 0, { kind: 'control', moduleId: m.id, controlId: c.id });
        grew = true;
      }
    }
  }

  // Jacks: AUDIO IN-uitgangen, dan de audio-ingangen van modules die nog
  //  helemaal geen audio krijgen (hoogstens 6), in dezelfde laagvolgorde.
  //  Een vrije ingang van een module die al audio krijgt (de R van een
  //  mono gevoede Rotary, een extra mixerkanaal) is geen aansluiting van
  //  de black box en blijft weg; de EXT-ingang van een klankbron ook.
  const connectedIn = new Set(patch.connections.map((c) => `${c.to.moduleId}/${c.to.portId}`));
  const fedModules = new Set<string>();
  for (const m of ordered) for (const p of resolvePorts(m, project.moduleTypes))
    if (p.direction === 'in' && p.signalType === 'audio' && connectedIn.has(`${m.id}/${p.id}`)) fedModules.add(m.id);
  const ports: FrontItem[] = [];
  for (const m of ordered) {
    for (const p of resolvePorts(m, project.moduleTypes)) {
      if (ports.length >= 6) break;
      const isAudioInSrc = m.typeId === 'tp_mmb_audioin' && p.direction === 'out';
      const openAudioIn = p.direction === 'in' && p.signalType === 'audio' && !fedModules.has(m.id) && !isSource(m);
      if (isAudioInSrc || openAudioIn) ports.push({ kind: 'port', moduleId: m.id, portId: p.id, label: `${m.name} ${p.name}` });
    }
  }
  if (ports.length) items.push({ kind: 'group', text: 'Aansluitingen' }, ...ports);

  return { id: 'front_auto', name: 'Auto', description: patch.description, columns: DEFAULT_COLUMNS, items: withNameDisplays(items, project) };
}

/** Een naamdisplay (met `lookup`: de voicenaam van de DX7, de lettergreep
 *  van FOF, het ritme) hoort bij zijn knop: staat Bank of Program op het
 *  front, dan komt de naam ervóór te staan, groot. Cijferdisplays herhalen
 *  alleen de knop en komen niet vanzelf mee; die zet je er met de hand op. */
export function withNameDisplays(items: FrontItem[], project: ModularProject): FrontItem[] {
  const out = [...items];
  const moduleIds = [...new Set(items.flatMap((it) => (it.kind === 'control' ? [it.moduleId] : [])))];
  for (const id of moduleIds) {
    const m = project.modules.find((x) => x.id === id);
    if (!m) continue;
    for (const d of resolveControls(m, project.moduleTypes)) {
      if (d.kind !== 'display' || !d.lookup) continue;
      if (out.some((it) => it.kind === 'control' && it.moduleId === id && it.controlId === d.id)) continue;
      const at = out.findIndex((it) => it.kind === 'control' && it.moduleId === id && (it.controlId === d.bindTo || it.controlId === d.bindTo2));
      if (at >= 0) out.splice(at, 0, { kind: 'control', moduleId: id, controlId: d.id, size: 'large' });
    }
  }
  return out;
}
