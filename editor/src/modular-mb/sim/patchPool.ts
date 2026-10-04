// patchPool — de patch-pool op musicbrain.nl (doc/plans/patch-pool.md).
//
// Contract met Imprint (2026-10-02):
//   POST /api/patches   Bearer (scope patch:propose), JSON:
//     { kind: "proposal"|"question"|"private", title, description, tags[], license,
//       file: "asset:<id>", syx?: "asset:<id>", takes?: group-slug[],
//       requires, derivedFrom?: patch-slug, question?: string }
//     → het item; pool wordt door de regel voorstel/vraag/prive, author uit het token.
//   GET  /api/patches?pool=&tag=&slug=   publiek voor experimenteel/centraal/vraag;
//     pool=prive geeft met token alleen de eigen privé-patches (per account).
//   PATCH /api/patches/<slug>  { kind: "proposal" } | { kind: "question", question }
//     → een eigen privé-patch alsnog voorstellen; alleen prive → voorstel/vraag,
//     één keer (409 als hij niet meer privé is, 404 als hij van een ander is).
// De bestanden gaan eerst via POST /api/media (één group), de id's komen in
// het item als "asset:<id>"; lezen via GET /api/assets/_ref/<id>.

import { LibraryError, uploadTake, type LibrarySettings, type UploadedAsset } from './mediaLibrary';
import type { PatchRequires } from './patchRequires';

export type Pool = 'voorstel' | 'experimenteel' | 'centraal' | 'vraag' | 'prive';
export type License = 'CC-BY-4.0' | 'CC0';

export interface PoolItem {
  slug: string;
  title: string;
  description?: string;
  pool: Pool;
  author?: string;
  tags?: string[];
  license?: License;
  file: string;              // "asset:<id>"
  syx?: string;
  /** Het front als SVG-asset (patch-front §7); de pool geeft ook `frontUrl`. */
  front?: string;
  frontUrl?: string;
  takes?: string[];          // group-slugs
  requires?: PatchRequires;
  derivedFrom?: string;
  question?: string;
  answered?: boolean;
  created?: string;
  updated?: string;
  publishedAt?: string;
  /** Pagina op de site, en absolute download-URL's (Imprint geeft ze mee). */
  url?: string;
  fileUrl?: string;
  syxUrl?: string;
}

export interface Proposal {
  /** private = in je eigen privé-lijst; later alsnog voor te stellen (promotePatch). */
  kind: 'proposal' | 'question' | 'private';
  title: string;
  description: string;
  tags: string[];
  license: License;
  requires: PatchRequires;
  derivedFrom?: string;
  question?: string;
}

/** Basis-URL van de site uit het library-endpoint (…/api/media → …). */
export function siteBase(s: LibrarySettings): string {
  return s.endpoint.replace(/\/api\/media\/?$/, '').replace(/\/$/, '');
}
export function patchesUrl(s: LibrarySettings): string { return `${siteBase(s)}/api/patches`; }
/** Een "asset:<id>"-verwijzing → de URL waar de library het bestand serveert. */
export function assetUrl(ref: string, s: LibrarySettings): string {
  const id = ref.replace(/^asset:/, '');
  return `${siteBase(s)}/api/assets/_ref/${encodeURIComponent(id)}`;
}
export const assetRef = (a: UploadedAsset): string => `asset:${a.slug}`;

/** De JSON voor POST /api/patches, uit de geüploade bestanden en de invoer. */
export function buildProposal(p: Proposal, files: { file: UploadedAsset; syx?: UploadedAsset; front?: UploadedAsset }, takes: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: p.kind, title: p.title.trim(), description: p.description.trim(),
    tags: [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))],
    license: p.license, file: assetRef(files.file), requires: p.requires,
  };
  if (files.syx) out.syx = assetRef(files.syx);
  if (files.front) out.front = assetRef(files.front);
  if (takes.length) out.takes = takes;
  if (p.derivedFrom) out.derivedFrom = p.derivedFrom;
  if (p.kind === 'question') out.question = (p.question ?? '').trim();
  return out;
}

/** De `issues` van een afwijzing (zod-vorm: [{ path, message }], of losse strings) als korte tekst. */
export function describeIssues(issues: unknown): string {
  if (!Array.isArray(issues)) return '';
  return issues.slice(0, 5).map((i) => {
    if (typeof i === 'string') return i;
    const o = i as { path?: unknown; message?: unknown };
    const where = Array.isArray(o.path) ? o.path.join('.') : typeof o.path === 'string' ? o.path : '';
    return [where, typeof o.message === 'string' ? o.message : ''].filter(Boolean).join(': ');
  }).filter(Boolean).join('; ');
}

async function fail(res: Response, what: string): Promise<never> {
  let detail = '';
  try {
    const j = JSON.parse(await res.text()) as { error?: unknown; issues?: unknown };
    if (typeof j.error === 'string') detail = ` ${j.error}`;
    const issues = describeIssues(j.issues);
    if (issues) detail += `: ${issues}`;
  } catch { /* geen json */ }
  const why = res.status === 401 ? 'Token ongeldig, verlopen of ingetrokken.'
    : res.status === 403 ? 'Token mist het recht om patches voor te stellen (scope patch:propose).'
    : res.status === 404 ? 'De patch-pool bestaat nog niet op deze site.'
    : res.status === 413 ? 'Te groot.'
    : res.status === 422 ? 'De pool kent de patch waarvan deze is afgeleid niet (derivedFrom).'
    : res.status === 400 ? 'De pool wees het voorstel af (ongeldige inhoud).'
    : `${what} mislukt: HTTP ${res.status}.`;
  throw new LibraryError(why + detail);
}

/**
 * Een patch voorstellen: bestanden naar de library (één group), dan het item.
 * `takes` zijn group-slugs van bestaande takes (bv. net opgenomen demo).
 */
export async function proposePatch(
  p: Proposal,
  files: { group: string; patchJson: Blob; syx?: Blob | null; front?: Blob | null },
  takes: string[],
  s: LibrarySettings,
  fetchImpl: typeof fetch = fetch,
): Promise<PoolItem> {
  if (!s.token.trim()) throw new LibraryError('Geen API-token ingesteld (⚙ Library in de Simulatie-tab).');
  // Apart uploaden, zodat vaststaat welk asset het patchbestand is en welk de .syx.
  const [file] = await uploadTake({ group: files.group, files: [{ name: `${files.group}.patch.json`, blob: files.patchJson }] }, s, fetchImpl);
  if (!file) throw new LibraryError('De library gaf geen asset terug voor het patchbestand.');
  let syx: UploadedAsset | undefined;
  if (files.syx) {
    try { [syx] = await uploadTake({ group: files.group, files: [{ name: `${files.group}.syx`, blob: files.syx }] }, s, fetchImpl); }
    catch { syx = undefined; }   // zonder .syx verder: het voorstel telt
  }
  // Het front als hoes (patch-front §7); ook optioneel.
  let front: UploadedAsset | undefined;
  if (files.front) {
    try { [front] = await uploadTake({ group: files.group, files: [{ name: `${files.group}.front.svg`, blob: files.front }] }, s, fetchImpl); }
    catch { front = undefined; }
  }
  const body = buildProposal(p, { file, syx, front }, takes);
  let res: Response;
  try {
    res = await fetchImpl(patchesUrl(s), {
      method: 'POST', headers: { Authorization: `Bearer ${s.token.trim()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (err) { throw new LibraryError(`Pool niet bereikbaar (${err instanceof Error ? err.message : String(err)}).`); }
  if (!res.ok) await fail(res, 'Voorstellen');
  return await res.json() as PoolItem;
}

/** Bladeren; zonder token alleen de publieke pools. */
export async function listPool(
  filter: { pool?: Pool; tag?: string; slug?: string }, s: LibrarySettings, fetchImpl: typeof fetch = fetch,
): Promise<PoolItem[]> {
  const q = new URLSearchParams();
  if (filter.pool) q.set('pool', filter.pool);
  if (filter.tag?.trim()) q.set('tag', filter.tag.trim());
  if (filter.slug) q.set('slug', filter.slug);
  const headers: Record<string, string> = {};
  if (s.token.trim()) headers.Authorization = `Bearer ${s.token.trim()}`;
  let res: Response;
  try { res = await fetchImpl(`${patchesUrl(s)}${q.toString() ? `?${q}` : ''}`, { headers }); }
  catch (err) { throw new LibraryError(`Pool niet bereikbaar (${err instanceof Error ? err.message : String(err)}).`); }
  if (!res.ok) await fail(res, 'Lijst ophalen');
  const body = await res.json().catch(() => null) as { items?: unknown; patches?: unknown } | PoolItem[] | null;
  const list = Array.isArray(body) ? body : Array.isArray((body as { items?: unknown })?.items) ? (body as { items: PoolItem[] }).items
    : Array.isArray((body as { patches?: unknown })?.patches) ? (body as { patches: PoolItem[] }).patches : null;
  if (!list) throw new LibraryError('Onverwacht antwoord van de pool.');
  return list;
}

/** Een eigen privé-patch alsnog voorstellen, of er een vraag van maken. */
export async function promotePatch(
  slug: string, to: { kind: 'proposal' } | { kind: 'question'; question: string },
  s: LibrarySettings, fetchImpl: typeof fetch = fetch,
): Promise<{ slug: string; pool: Pool }> {
  if (!s.token.trim()) throw new LibraryError('Geen API-token ingesteld (⚙ Library in de Simulatie-tab).');
  const body = to.kind === 'question' ? { kind: 'question', question: to.question.trim() } : { kind: 'proposal' };
  let res: Response;
  try {
    res = await fetchImpl(`${patchesUrl(s)}/${encodeURIComponent(slug)}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${s.token.trim()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (err) { throw new LibraryError(`Pool niet bereikbaar (${err instanceof Error ? err.message : String(err)}).`); }
  if (res.status === 404) throw new LibraryError('Die patch staat niet (meer) in jouw privé-lijst.');
  if (res.status === 409) throw new LibraryError('Deze patch is al voorgesteld; alleen een privé-patch kun je nog voorstellen.');
  if (!res.ok) await fail(res, 'Voorstellen');
  return await res.json() as { slug: string; pool: Pool };
}

/** Het patchbestand van een item ophalen (JSON-tekst). */
export async function fetchPatchFile(item: PoolItem, s: LibrarySettings, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try { res = await fetchImpl(item.fileUrl || assetUrl(item.file, s)); }
  catch (err) { throw new LibraryError(`Patchbestand niet op te halen (${err instanceof Error ? err.message : String(err)}).`); }
  if (!res.ok) await fail(res, 'Patchbestand ophalen');
  return await res.text();
}

// ── herkomst: welke patch in dit project kwam uit de pool (voor derivedFrom) ──
const ORIGIN_KEY = 'mmb.pool.origin.v1';
export function rememberOrigin(patchId: string, slug: string): void {
  try { const m = JSON.parse(localStorage.getItem(ORIGIN_KEY) ?? '{}') as Record<string, string>; m[patchId] = slug; localStorage.setItem(ORIGIN_KEY, JSON.stringify(m)); } catch { /* geen opslag */ }
}
export function originOf(patchId: string): string | undefined {
  try { return (JSON.parse(localStorage.getItem(ORIGIN_KEY) ?? '{}') as Record<string, string>)[patchId]; } catch { return undefined; }
}
