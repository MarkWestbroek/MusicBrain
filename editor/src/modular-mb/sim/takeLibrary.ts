// takeLibrary — sim-opnames (takes) terugvinden in de media library en weer
// gebruiken: de .mid in de MIDI-speler, de .patch.json als nieuwe patch.
//
// Contract (Imprint): GET /api/media?folder=&tag=&group= met Bearer-token
// (scope media:read) → { assets: [{ slug, kind, url, title, folder, tags,
// group, mime, size }] }. Eén record per bestand; `group` = take-id. Geen
// paginering en geen vaste volgorde: sorteren doen we hier. Bestanden lezen
// via fetch(url) op /api/assets (CORS, zonder credentials; takes zijn publiek).

import type { ModularProject } from '../types';
import { LibraryError, type LibrarySettings } from './mediaLibrary';

export interface LibraryAsset {
  slug: string;
  kind: string;
  url: string;
  title?: string;
  folder?: string;
  tags?: string[];
  group?: string;
  mime?: string;
  size?: number;
}

export interface TakeEntry {
  group: string;
  /** Uit de naam (…-YYYYMMDD-HHMMSS), anders null. */
  when: Date | null;
  wav?: LibraryAsset;
  mid?: LibraryAsset;
  patch?: LibraryAsset;
  other: LibraryAsset[];
}

function fileName(a: LibraryAsset): string {
  return (a.title ?? a.url.split('/').pop() ?? '').toLowerCase();
}

function isWav(a: LibraryAsset): boolean { return a.mime === 'audio/wav' || a.mime === 'audio/x-wav' || fileName(a).endsWith('.wav'); }
function isMid(a: LibraryAsset): boolean { return a.mime === 'audio/midi' || a.mime === 'audio/x-midi' || /\.midi?$/.test(fileName(a)); }
function isPatch(a: LibraryAsset): boolean { return a.mime === 'application/json' || fileName(a).endsWith('.json'); }

/** `mmb-koper-20260928-120000` → Date (lokale tijd), of null. */
export function takeTime(group: string): Date | null {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(group);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  return new Date(y!, mo! - 1, d!, h!, mi!, s!);
}

/** Bestanden per take bij elkaar, nieuwste eerst. */
export function groupTakes(assets: readonly LibraryAsset[]): TakeEntry[] {
  const by = new Map<string, TakeEntry>();
  for (const a of assets) {
    const g = a.group || a.slug;
    let t = by.get(g);
    if (!t) { t = { group: g, when: takeTime(g), other: [] }; by.set(g, t); }
    if (isWav(a) && !t.wav) t.wav = a;
    else if (isMid(a) && !t.mid) t.mid = a;
    else if (isPatch(a) && !t.patch) t.patch = a;
    else t.other.push(a);
  }
  return [...by.values()].sort((x, y) =>
    (y.when?.getTime() ?? 0) - (x.when?.getTime() ?? 0) || y.group.localeCompare(x.group));
}

export async function listTakes(
  s: LibrarySettings, filter: { folder?: string; tag?: string }, fetchImpl: typeof fetch = fetch,
): Promise<TakeEntry[]> {
  if (!s.token.trim()) throw new LibraryError('Geen API-token ingesteld (vinkje "list media" nodig om te bladeren).');
  const q = new URLSearchParams();
  if (filter.folder?.trim()) q.set('folder', filter.folder.trim());
  if (filter.tag?.trim()) q.set('tag', filter.tag.trim());
  let res: Response;
  try {
    res = await fetchImpl(`${s.endpoint}${q.toString() ? `?${q}` : ''}`, { headers: { Authorization: `Bearer ${s.token.trim()}` } });
  } catch (err) {
    throw new LibraryError(`Library niet bereikbaar (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (res.status === 401) throw new LibraryError('Token ongeldig, verlopen of ingetrokken.');
  if (res.status === 403) throw new LibraryError('Token mist het vinkje "list media" (scope media:read).');
  if (!res.ok) throw new LibraryError(`Lijst ophalen mislukt: HTTP ${res.status}.`);
  const body = await res.json().catch(() => null) as { assets?: unknown } | null;
  if (!body || !Array.isArray(body.assets)) throw new LibraryError('Onverwacht antwoord van de library (geen assets).');
  return groupTakes(body.assets as LibraryAsset[]);
}

export async function fetchAsset(a: LibraryAsset, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  let res: Response;
  try { res = await fetchImpl(a.url); } catch (err) {
    throw new LibraryError(`Bestand niet op te halen (${err instanceof Error ? err.message : String(err)}). Heeft de library CORS op /api/assets?`);
  }
  if (res.status === 403) throw new LibraryError('Dit bestand is niet publiek; de editor kan alleen publieke takes lezen.');
  if (!res.ok) throw new LibraryError(`Bestand ophalen mislukt: HTTP ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Een patch-snapshot (van een opname) toevoegen aan het project als nieuwe
 * patch, naast wat er al is. Alle eigen id's (patch, racks, slots, modules,
 * poly-groepen, kabels) krijgen een vers id, zodat een take uit hetzelfde
 * project niet botst met het origineel. Interne modules (gedeeld) blijven
 * hun id houden en worden alleen toegevoegd als ze ontbreken.
 */
export function addPatchSnapshot(
  project: ModularProject, snapshot: ModularProject, name: string, newId: (prefix: string) => string,
): ModularProject {
  const patch = snapshot.patches.find((x) => x.id === snapshot.activePatchId) ?? snapshot.patches[0];
  if (!patch) throw new LibraryError('Het patch-bestand bevat geen patch.');
  const racks = snapshot.racks.filter((r) => patch.rackIds.includes(r.id));
  const ids = new Map<string, string>();
  const remap = (id: string | undefined, prefix: string): void => { if (id && !ids.has(id)) ids.set(id, newId(prefix)); };
  remap(patch.id, 'patch');
  for (const r of racks) {
    remap(r.id, 'rack');
    for (const s of r.slots) remap(s.id, 'slot');
    for (const g of r.polyGroups ?? []) remap(g.id, 'poly');
  }
  const internal = new Set(snapshot.modules.filter((m) => m.internal).map((m) => m.id));
  const inRacks = new Set(racks.flatMap((r) => r.slots.map((s) => s.moduleId)));
  for (const m of snapshot.modules) if (inRacks.has(m.id) && !internal.has(m.id)) remap(m.id, 'mod');
  for (const c of patch.connections) remap(c.id, 'conn');

  // Id's staan als JSON-string (waarde of sleutel) overal waar ze verwezen
  // worden; ze zijn uniek genoeg om als geheel te vervangen.
  const swap = <T>(v: T): T => JSON.parse(JSON.stringify(v).replace(/"([^"\\]+)"/g, (all, s: string) => {
    const n = ids.get(s);
    return n ? `"${n}"` : all;
  })) as T;

  const have = new Set(project.modules.map((m) => m.id));
  const modules = snapshot.modules
    .filter((m) => inRacks.has(m.id) && !internal.has(m.id))
    .map((m) => swap(m));
  const internals = snapshot.modules.filter((m) => internal.has(m.id) && !have.has(m.id));
  const haveTypes = new Set(project.moduleTypes.map((t) => t.id));
  const types = snapshot.moduleTypes.filter((t) => !haveTypes.has(t.id)
    && [...modules, ...internals].some((m) => m.typeId === t.id));
  const newPatch = { ...swap(patch), name, programNumber: undefined, saved: undefined, showingSaved: undefined };
  const newRacks = racks.map((r) => swap(r));
  return {
    ...project,
    moduleTypes: [...project.moduleTypes, ...types],
    modules: [...project.modules, ...internals, ...modules],
    racks: [...project.racks, ...newRacks],
    patches: [...project.patches, newPatch],
    activePatchId: newPatch.id,
    activeRackId: newRacks[0]?.id ?? project.activeRackId,
  };
}
