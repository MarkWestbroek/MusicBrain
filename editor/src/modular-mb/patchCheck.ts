// Patchcontrole (doc/plans/editor-structuur.md §2): een patch tegen de
// moduletypes zoals ze nú zijn. Elke patch hoort hier langs te komen, waar
// hij ook vandaan komt: seed, project laden, import, SysEx, pool, take. De
// contracttest gebruikt dezelfde functie voor de seeds, zodat er één
// definitie is van "klopt".
//
// Puur: geen store, geen React. `checkPatch` vindt, `repairPatch` past toe
// wat zeker is. Wat niet zeker is (verkeerde richting, signaaltype) blijft
// een bevinding zonder reparatie; daar beslist de gebruiker of later de AI.

import {
  resolveControls, resolvePorts,
  type Control, type ControlValue, type ModularProject, type ModuleInstance, type Patch, type Port,
} from './types';

export type FindingKind =
  | 'unknown-module'      // kabel naar een module die niet in het project staat
  | 'unknown-type'        // module van een type dat de editor niet kent
  | 'missing-port'        // kabel naar een poort die het type niet (meer) heeft
  | 'port-direction'      // uitgang als ingang gebruikt of andersom
  | 'signal-mismatch'     // audio op een gate-ingang en dergelijke
  | 'out-of-range'        // getal buiten min..max, of geen bestaande schakelstand
  | 'bad-value'           // waarde van het verkeerde soort (tekst op een knop)
  | 'unknown-control'     // stand voor een control die het type niet heeft
  | 'front-target';       // front-item zonder module, control of poort

/** fix = deterministisch te herstellen; ask = vraagt een besluit; info = ter kennisgeving. */
export type Severity = 'fix' | 'ask' | 'info';

export interface Finding {
  kind: FindingKind;
  severity: Severity;
  message: string;
  moduleId?: string;
  connectionId?: string;
  controlId?: string;
  /** Voor `out-of-range` en `bad-value`: de waarde na herstel. */
  value?: ControlValue;
  /** Voor `front-target`: welk front en welk item (index). */
  frontId?: string;
  itemIndex?: number;
}

/** Signaalsoorten die elkaar verdragen. CV en gate/trigger mengen mag
 *  (een envelope op een gate-ingang is gangbaar); audio en MIDI horen bij
 *  zichzelf, behalve audio in CV (een audio-rate modulatie). */
function signalsFit(from: Port, to: Port): boolean {
  if (from.signalType === to.signalType) return true;
  const control = new Set(['cv', 'gate', 'trigger']);
  if (control.has(from.signalType) && control.has(to.signalType)) return true;
  if (from.signalType === 'audio' && to.signalType === 'cv') return true;
  return false;
}

/** Wat een control als waarde verdraagt, en de herstelde waarde als het niet klopt. */
function checkValue(c: Control, v: ControlValue): { ok: true } | { ok: false; kind: 'out-of-range' | 'bad-value'; value: ControlValue; why: string } {
  switch (c.kind) {
    case 'exotic':
      if (typeof v === 'number' && Number.isFinite(v)) return { ok: true };
      return { ok: false, kind: 'bad-value', value: c.defaultValue, why: `${JSON.stringify(v)} is geen getal` };
    case 'knob': case 'slider': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, kind: 'bad-value', value: c.defaultValue, why: `${JSON.stringify(v)} is geen getal` };
      if (v < c.min || v > c.max) return { ok: false, kind: 'out-of-range', value: Math.max(c.min, Math.min(c.max, v)), why: `${v} buiten ${c.min}..${c.max}` };
      return { ok: true };
    }
    case 'switch': {
      const n = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN;
      if (!Number.isFinite(n)) return { ok: false, kind: 'bad-value', value: c.defaultIndex, why: `${JSON.stringify(v)} is geen stand` };
      const idx = Math.max(0, Math.min(c.positions.length - 1, Math.round(n)));
      if (idx !== v) return { ok: false, kind: 'out-of-range', value: idx, why: `${JSON.stringify(v)} is geen stand 0..${c.positions.length - 1}` };
      return { ok: true };
    }
    case 'toggle': case 'button':
      // 0/1 komt in seeds en oude patches veel voor en wordt overal begrepen.
      if (typeof v === 'boolean' || v === 0 || v === 1) return { ok: true };
      return { ok: false, kind: 'bad-value', value: typeof v === 'number' ? v > 0 : false, why: `${JSON.stringify(v)} is geen aan/uit` };
    case 'joystick':
      if (typeof v === 'object' && v !== null && typeof v.x === 'number' && typeof v.y === 'number') return { ok: true };
      return { ok: false, kind: 'bad-value', value: c.defaultValue, why: `${JSON.stringify(v)} is geen x/y` };
    default:
      return { ok: true };   // display en led hebben geen eigen stand
  }
}

/** Sleutels in `controlState` die bewust geen control zijn: de patcher of de
 *  engine zet ze zelf (MIDI-IN `voiceCount` voedt het stemmendisplay). */
const SYNTHETIC_CONTROLS: Record<string, string[]> = {
  tp_mmb_midiin: ['voiceCount'],
};

/** De modules van een patch: uit de racks en uit de kabels. */
function patchModuleIds(patch: Patch, project: ModularProject): Set<string> {
  const ids = new Set<string>();
  for (const r of project.racks) if (patch.rackIds.includes(r.id)) for (const s of r.slots) ids.add(s.moduleId);
  for (const c of patch.connections) { ids.add(c.from.moduleId); ids.add(c.to.moduleId); }
  return ids;
}

export function checkPatch(patch: Patch, project: ModularProject): Finding[] {
  const out: Finding[] = [];
  const modById = new Map(project.modules.map((m) => [m.id, m]));
  const typeIds = new Set(project.moduleTypes.map((t) => t.id));
  const name = (m: ModuleInstance): string => m.name || m.typeId;

  // Modules zelf.
  for (const id of patchModuleIds(patch, project)) {
    const m = modById.get(id);
    if (m && !typeIds.has(m.typeId)) out.push({ kind: 'unknown-type', severity: 'ask', moduleId: id, message: `${name(m)}: type ${m.typeId} is onbekend in deze editor` });
  }

  // Kabels.
  for (const c of patch.connections) {
    const ends = [[c.from, 'out'], [c.to, 'in']] as const;
    const ports: (Port | undefined)[] = [];
    let drop = false;
    for (const [end, dir] of ends) {
      const m = modById.get(end.moduleId);
      if (!m) {
        out.push({ kind: 'unknown-module', severity: 'fix', connectionId: c.id, moduleId: end.moduleId, message: `kabel naar module ${end.moduleId}, die niet in het project staat` });
        drop = true; break;   // één bevinding per kabel: hij gaat toch weg
      }
      if (!typeIds.has(m.typeId) && !m.portsOverride) { ports.push(undefined); continue; }   // al gemeld als unknown-type
      const p = resolvePorts(m, project.moduleTypes).find((x) => x.id === end.portId);
      if (!p) {
        out.push({ kind: 'missing-port', severity: 'fix', connectionId: c.id, moduleId: m.id, message: `${name(m)}: poort ${end.portId} bestaat niet (meer)` });
        drop = true; break;
      }
      if (p.direction !== dir) out.push({ kind: 'port-direction', severity: 'ask', connectionId: c.id, moduleId: m.id, message: `${name(m)}: ${p.id} is een ${p.direction === 'in' ? 'ingang' : 'uitgang'}, maar gebruikt als ${dir === 'in' ? 'ingang' : 'uitgang'}` });
      ports.push(p);
    }
    if (drop) continue;
    const [a, b] = ports;
    if (a && b && a.direction === 'out' && b.direction === 'in' && !signalsFit(a, b)) {
      out.push({ kind: 'signal-mismatch', severity: 'info', connectionId: c.id, moduleId: c.to.moduleId, message: `${a.signalType} van ${c.from.portId} naar ${b.signalType}-ingang ${c.to.portId}` });
    }
  }

  // Knopstanden.
  for (const [mid, state] of Object.entries(patch.controlState)) {
    const m = modById.get(mid);
    if (!m || (!typeIds.has(m.typeId) && !m.controlsOverride)) continue;
    const controls = resolveControls(m, project.moduleTypes);
    for (const [cid, v] of Object.entries(state ?? {})) {
      const c = controls.find((x) => x.id === cid);
      if (!c) {
        if (SYNTHETIC_CONTROLS[m.typeId]?.includes(cid)) continue;
        // Onschadelijk: de firmware negeert onbekende controls (contract), en
        // sommige sleutels zijn bewust synthetisch (MIDI-IN `voiceCount`).
        out.push({ kind: 'unknown-control', severity: 'info', moduleId: mid, controlId: cid, message: `${name(m)}: stand voor ${cid}, die het type niet heeft` });
        continue;
      }
      const r = checkValue(c, v);
      if (!r.ok) out.push({ kind: r.kind, severity: 'fix', moduleId: mid, controlId: cid, value: r.value, message: `${name(m)}: ${c.label || cid} ${r.why}` });
    }
  }

  // Fronts.
  for (const f of patch.fronts ?? []) {
    f.items.forEach((it, i) => {
      if (it.kind === 'group') return;
      const m = modById.get(it.moduleId);
      const ok = !!m && (it.kind === 'control'
        ? resolveControls(m, project.moduleTypes).some((c) => c.id === it.controlId)
        : resolvePorts(m, project.moduleTypes).some((p) => p.id === it.portId));
      if (!ok) out.push({ kind: 'front-target', severity: 'fix', frontId: f.id, itemIndex: i, moduleId: it.moduleId,
        message: `front "${f.name}": ${it.kind === 'control' ? `knop ${it.controlId}` : `jack ${it.portId}`} van ${m ? name(m) : it.moduleId} bestaat niet (meer)` });
    });
  }
  return out;
}

/** Pas de zekere reparaties toe (severity `fix`). Geeft dezelfde patch terug
 *  als er niets te doen was, zodat aanroepers op identiteit kunnen vergelijken. */
export function repairPatch(patch: Patch, findings: Finding[]): Patch {
  const fixes = findings.filter((f) => f.severity === 'fix');
  if (!fixes.length) return patch;
  const dropCables = new Set(fixes.filter((f) => f.kind === 'unknown-module' || f.kind === 'missing-port').map((f) => f.connectionId!));
  const values = fixes.filter((f) => f.kind === 'out-of-range' || f.kind === 'bad-value');
  const frontDrops = new Map<string, Set<number>>();
  for (const f of fixes) if (f.kind === 'front-target') {
    const s = frontDrops.get(f.frontId!) ?? new Set<number>();
    s.add(f.itemIndex!); frontDrops.set(f.frontId!, s);
  }

  let next: Patch = patch;
  if (dropCables.size) next = { ...next, connections: next.connections.filter((c) => !dropCables.has(c.id)) };
  if (values.length) {
    const cs = { ...next.controlState };
    for (const f of values) cs[f.moduleId!] = { ...cs[f.moduleId!], [f.controlId!]: f.value! };
    next = { ...next, controlState: cs };
  }
  if (frontDrops.size && next.fronts) {
    next = { ...next, fronts: next.fronts.map((fr) => {
      const drop = frontDrops.get(fr.id);
      return drop ? { ...fr, items: fr.items.filter((_, i) => !drop.has(i)) } : fr;
    }) };
  }
  return next;
}

/** Korte samenvatting voor een melding: "3 hersteld, 1 vraagt je oordeel". */
export function summarizeFindings(findings: Finding[]): { fix: number; ask: number; info: number } {
  return {
    fix: findings.filter((f) => f.severity === 'fix').length,
    ask: findings.filter((f) => f.severity === 'ask').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
}
