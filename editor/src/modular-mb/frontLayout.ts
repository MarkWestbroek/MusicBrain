// Het front als virtueel paneel (doc/plans/patch-front.md §4) en het
// automatische front (§5). Puur: geen React, geen store. (Heet frontLayout
// en niet frontPanel: op Windows botst dat met FrontPanel.tsx.)
//
// Een front wordt een tijdelijke ModuleType + ModuleInstance met de echte
// controldefinities (taper, bereik, schakelstanden) en een rasterlayout in
// `visual`, zodat `ModulePanel` het ongewijzigd tekent. Elke control krijgt
// een virtueel id (`c0`, `c1`, …) dat via `map` terugwijst naar
// (moduleId, controlId); poorten net zo (`p0`, …).

import { CATALOG, kindOf, type ModuleKindTag } from './recipe/catalog';
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
    default: return ROW_KNOB;
  }
}

/** Het label op het front: eigen label, anders het onderschrift van de
 *  patch, anders de gedrukte naam. */
export function frontLabel(item: Extract<FrontItem, { kind: 'control' }>, patch: Patch, c: Control): string {
  return item.label ?? patch.controlLabels?.[item.moduleId]?.[item.controlId] ?? c.label ?? c.id;
}

/** Bouw het virtuele paneel. Items naar onbekende modules of controls worden
 *  overgeslagen (zie `pruneFronts`); displays en LED's tekenen we niet, hun
 *  bindingen wijzen naar controls van de echte module. */
export function buildFrontModule(front: PatchFront, patch: Patch, project: ModularProject): FrontModule {
  const columns = Math.max(1, front.columns ?? DEFAULT_COLUMNS);
  const widthMm = columns * CELL_W + 2 * MARGIN_X;
  const controls: Control[] = [];
  const ports: Port[] = [];
  const map: Record<string, FrontTarget> = {};
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
  type Cell = { c: Control; vid: string; size?: 'small' | 'large'; group?: string };
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  const flush = () => { if (row.length) { rows.push(row); row = []; } };
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
    const real = resolveControls(m, project.moduleTypes).find((c) => c.id === it.controlId);
    if (!real || real.kind === 'display' || real.kind === 'led') continue;
    const vid = `c${n++}`;
    let c: Control = { ...real, id: vid, label: frontLabel(it, patch, real) } as Control;
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
    row.push({ c, vid, size: it.size, group: pendingGroup });
    pendingGroup = undefined;
    if (row.length === columns) flush();
  }
  flush();

  let y = TOP;
  let inGroup = false;   // een groep loopt door over rijen tot het volgende kopje
  for (const r of rows) {
    const withGroup = r.some((cell) => cell.group);
    const top = y + (withGroup ? GROUP_H : 0);
    const h = Math.max(...r.map((cell) => rowHeightFor(cell.c)));
    let segStart: number | null = inGroup ? 0 : null;
    const closeSeg = (from: number, to: number) => {
      if (to < from) return;   // lege reeks (kopje op de eerste cel van een doorlopende groep)
      tile(MARGIN_X + CELL_W * from + 1, MARGIN_X + CELL_W * (to + 1) - 1, y + 0.8, top + h - 1.2);
    };
    r.forEach((cell, i) => {
      controls.push(cell.c);
      const cx = MARGIN_X + CELL_W * (i + 0.5);
      const cy = cell.c.kind === 'slider' && cell.c.orientation === 'v' ? top + 4 : top + h / 2 - 2;
      controlPlacements[cell.vid] = {
        x: cx, y: cy,
        sizeOverride: cell.c.kind === 'knob' ? (cell.size === 'large' ? 'large' : cell.size === 'small' ? 'small' : 'medium') : undefined,
      };
      if (cell.group) {
        if (segStart !== null) closeSeg(segStart, i - 1);
        segStart = i; inGroup = true;
        texts.push({ x: cx - CELL_W / 2 + 2.2, y: y + 3.7, text: cell.group, fontSize: 2.1, align: 'start', color: '#374151' });
      }
    });
    if (segStart !== null) closeSeg(segStart, r.length - 1);
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
  return { module, type, map, widthMm: hpWidth * MM_PER_HP, heightMm };
}

/** De waarden van het virtuele paneel: uit de patch, met de live waarden van
 *  de engine of de Teensy eroverheen. */
export function frontControlState(
  fm: FrontModule, patch: Patch, live?: Record<string, Record<string, ControlValue>>,
): Record<string, ControlValue> {
  const out: Record<string, ControlValue> = {};
  for (const c of fm.type.controls) {
    const t = fm.map[c.id];
    if (!t || t.kind !== 'control') continue;
    const v = live?.[t.moduleId]?.[t.controlId] ?? patch.controlState[t.moduleId]?.[t.controlId];
    out[c.id] = v ?? defaultValueOf(c);
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

/** De knoppen en schuiven van een module in volgorde van vermoedelijk
 *  belang: de `playable`-lijst van de receptcatalogus, dan wat van zijn
 *  standaardwaarde afwijkt (bewust gezet), dan de paneelvolgorde. */
export function rankKnobs(m: ModuleInstance, patch: Patch, project: ModularProject): Control[] {
  // Draaiknoppen en schuiven, plus de schakelaars die het karakter kiezen
  // (type, mode, stack, model, engine, wave): die horen op een speelfront
  // (E-piano: Type tine/reed), andere schakelaars niet.
  const knobs = resolveControls(m, project.moduleTypes).filter((c) =>
    c.kind === 'knob' || c.kind === 'slider' || ((c.kind === 'switch' || c.kind === 'toggle') && CHARACTER_SWITCHES.has(c.id)));
  const playable = Object.keys(CATALOG[m.typeId]?.playable ?? {});
  const state = patch.controlState[m.id] ?? {};
  const deviates = (c: Control) => state[c.id] !== undefined && JSON.stringify(state[c.id]) !== JSON.stringify(defaultValueOf(c));
  // Volgorde: catalogus-playable, dan bewust gezet, dan een karakterschakelaar, dan de rest in paneelvolgorde.
  const rank = (c: Control) => (playable.includes(c.id) ? playable.indexOf(c.id)
    : playable.length + (deviates(c) ? 0 : c.kind === 'switch' || c.kind === 'toggle' ? 500 : 1000));
  return [...knobs].map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
}
const CHARACTER_SWITCHES = new Set(['type', 'mode', 'stack', 'model', 'engine', 'wave', 'algo', 'algorithm']);

/** Het front voor een patch zonder front (§5): gelabelde controls, gebonden
 *  controls, de speelmodules, aangevuld tot `max` knoppen in signaalvolgorde;
 *  jacks: de uitgangen van een AUDIO IN en onverbonden audio-ingangen. Niet
 *  opgeslagen; de aanroeper bewaart het pas als iemand het bewerkt. */
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
  // 3. De speelmodules (PADS, FADERS, KNOBS).
  for (const m of mods) if (PLAY_MODULES.has(m.typeId)) for (const c of playable(m)) add(m.id, c.id);
  // 4. Aanvullen in signaalvolgorde: per module een kopje met zijn naam en
  //    de eerste twee knoppen, tot `max`. (Niet om de beurt: "T1" en "S1"
  //    zeggen zonder modulenaam niets.)
  const count = () => items.filter((it) => it.kind === 'control').length;
  //    Welke modules eerst: die op het audiopad (bron, filter, effect, VCA,
  //    uit), dan envelopes, dan LFO's en de rest (mixers, CV-rekenwerk);
  //    binnen een laag de signaalvolgorde. Anders kwamen in een receptpatch
  //    de LFO en de envelopes vóór de VCO en het filter.
  //    Welke twee knoppen: eerst de klankbepalende controls uit de
  //    receptcatalogus (`playable`), dan controls die de ontwerper van hun
  //    standaardwaarde heeft gezet, dan de paneelvolgorde.
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
  for (const m of ordered) {
    if (count() >= max) break;
    if (roleOf(m) === 'event-source') continue;   // MIDI-IN: kanaal en bendbereik zijn geen speelknoppen
    if (twinned.has(m.id)) continue;
    const tw = findTwin(project, patch, m);
    if (tw) twinned.add(tw[0].id === m.id ? tw[1].id : tw[0].id);
    // De klankbron krijgt drie knoppen (daar zit het karakter), de rest twee.
    const kind = project.moduleTypes.find((t) => t.id === m.typeId);
    const per = kind && kindOf(kind) === 'source' ? 3 : 2;
    const next = rankKnobs(m, patch, project).filter((c) => !have.has(`${m.id}/${c.id}`)).slice(0, per);
    if (!next.length) continue;
    items.push({ kind: 'group', text: m.name });
    for (const c of next) { if (count() >= max) break; add(m.id, c.id); }
  }

  // Jacks: AUDIO IN-uitgangen, dan onverbonden audio-ingangen (hoogstens 6),
  //  in dezelfde laagvolgorde (een open mixeringang komt dus achteraan).
  const connectedIn = new Set(patch.connections.map((c) => `${c.to.moduleId}/${c.to.portId}`));
  const ports: FrontItem[] = [];
  for (const m of ordered) {
    for (const p of resolvePorts(m, project.moduleTypes)) {
      if (ports.length >= 6) break;
      const isAudioInSrc = m.typeId === 'tp_mmb_audioin' && p.direction === 'out';
      const openAudioIn = p.direction === 'in' && p.signalType === 'audio' && !connectedIn.has(`${m.id}/${p.id}`);
      if (isAudioInSrc || openAudioIn) ports.push({ kind: 'port', moduleId: m.id, portId: p.id, label: `${m.name} ${p.name}` });
    }
  }
  if (ports.length) items.push({ kind: 'group', text: 'Aansluitingen' }, ...ports);

  return { id: 'front_auto', name: 'Auto', description: patch.description, columns: DEFAULT_COLUMNS, items };
}
