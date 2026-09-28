// mediaLibrary — een sim-opname (wav + mid + patch.json) in de media library
// van musicbrain.nl zetten.
//
// Contract (Imprint, docs/design/beeldbibliotheek.md §10/§12, stap 4):
//   POST /api/media   multipart: file[] (meerdere), folder, tags[], group?, exif?
//                     Authorization: Bearer <persoonlijk token, scope media:upload>
//                     → { assets: [{ slug, kind, url, group? }] }
//   GET  /api/media?folder=&tag=&group=
// CORS via een allowlist zonder credentials: geen cookies, alleen het token.
// Eén opname = één request met alle bestanden en dezelfde `group` (de take-id),
// zodat de library ze als koppel kent.
//
// Zolang die API er nog niet staat, blijft de knop uit tot er een token is.

export interface LibrarySettings {
  /** Volledige URL van POST /api/media. */
  endpoint: string;
  token: string;
  folder: string;
  tags: string[];
}

export const DEFAULT_LIBRARY: LibrarySettings = {
  endpoint: 'https://musicbrain.nl/api/media',
  token: '',
  folder: 'opnames/sim',
  tags: ['sim-opname'],
};

const KEY = 'mmb.library.v1';

export function loadLibrarySettings(): LibrarySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LIBRARY };
    const o = JSON.parse(raw) as Partial<LibrarySettings>;
    return {
      endpoint: typeof o.endpoint === 'string' && o.endpoint ? o.endpoint : DEFAULT_LIBRARY.endpoint,
      token: typeof o.token === 'string' ? o.token : '',
      folder: typeof o.folder === 'string' ? o.folder : DEFAULT_LIBRARY.folder,
      tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : DEFAULT_LIBRARY.tags,
    };
  } catch {
    return { ...DEFAULT_LIBRARY };
  }
}

export function saveLibrarySettings(s: LibrarySettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* geen opslag */ }
}

/** "a, b ,,c" → ["a","b","c"] */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))];
}

export interface TakeFile { name: string; blob: Blob }
export interface Take {
  /** Take-id: de gedeelde bestandsnaam zonder extensie. */
  group: string;
  files: TakeFile[];
}

export interface UploadedAsset { slug: string; kind: string; url: string; group?: string }

export class LibraryError extends Error {}

/** Bouwt het multipart-formulier volgens het contract (los te testen). */
export function takeForm(take: Take, s: LibrarySettings): FormData {
  const form = new FormData();
  for (const f of take.files) form.append('file[]', f.blob, f.name);
  if (s.folder.trim()) form.append('folder', s.folder.trim());
  for (const t of s.tags) form.append('tags[]', t);
  form.append('group', take.group);
  form.append('exif', 'none');
  return form;
}

export async function uploadTake(
  take: Take, s: LibrarySettings, fetchImpl: typeof fetch = fetch,
): Promise<UploadedAsset[]> {
  if (!s.token.trim()) throw new LibraryError('Geen API-token ingesteld. Maak er een aan op musicbrain.nl/admin: account-icoon → API tokens, vinkje upload media.');
  let res: Response;
  try {
    res = await fetchImpl(s.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.token.trim()}` },
      body: takeForm(take, s),
    });
  } catch (err) {
    throw new LibraryError(`Library niet bereikbaar (${err instanceof Error ? err.message : String(err)}). Staat de API al live, en editor.musicbrain.nl in de CORS-allowlist?`);
  }
  if (!res.ok) {
    // Imprint geeft bij elke fout { error, file? }; alles-of-niets, dus bij
    // een fout is er niets opgeslagen.
    let detail = '';
    try {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: unknown; file?: unknown };
        detail = [typeof j.error === 'string' ? j.error : '', typeof j.file === 'string' ? `(${j.file})` : ''].filter(Boolean).join(' ');
      } catch { detail = text.slice(0, 200); }
    } catch { /* geen body */ }
    const why = res.status === 401 ? 'Token ongeldig, verlopen of ingetrokken.'
      : res.status === 403 ? 'Token mist de scope "upload media", of je account mag niet uploaden.'
      : res.status === 413 ? 'Een bestand is te groot (audio max 200 MB, data 20 MB). Neem een kortere take op.'
      : res.status === 415 ? 'Bestandstype niet geaccepteerd door de library.'
      : res.status === 400 ? 'De library weigerde de upload (leeg of kapot).'
      : `Upload mislukt: HTTP ${res.status}.`;
    throw new LibraryError(`${why}${detail ? ` ${detail}` : ''} Er is niets opgeslagen.`);
  }
  const body = await res.json().catch(() => null) as { assets?: unknown } | null;
  if (!body || !Array.isArray(body.assets)) throw new LibraryError('Onverwacht antwoord van de library (geen assets).');
  return body.assets as UploadedAsset[];
}

/** "mmb-cs-80-koper-20260928-120000" → { name: "cs-80-koper", stamp: "20260928-120000" }. */
export function splitTakeName(group: string): { name: string; stamp: string } {
  const m = /^(?:mmb-)?(.*?)-?(\d{8}-\d{6})?$/.exec(group);
  return { name: m?.[1] || group, stamp: m?.[2] ?? '' };
}

/** Bestandsvriendelijke naam: kleine letters, streepjes, geen accenten. */
export function slugName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

/**
 * Een take hernoemen vóór het versturen: nieuwe naam, zelfde tijdstempel,
 * alle bestanden en de group mee. Lege naam = ongewijzigd.
 */
export function renameTake(take: Take, name: string): Take {
  const slug = slugName(name);
  if (!slug) return take;
  const { stamp } = splitTakeName(take.group);
  const group = `mmb-${slug}${stamp ? `-${stamp}` : ''}`;
  if (group === take.group) return take;
  return {
    group,
    files: take.files.map((f) => ({ ...f, name: f.name.startsWith(take.group) ? group + f.name.slice(take.group.length) : f.name })),
  };
}

/**
 * Eén bestand van een bestaande take vervangen (PUT /api/media/<slug>,
 * multipart `file`, scope media:upload). Zelfde soort verplicht (.mid door
 * .mid); de library bewaart de vorige versie in de geschiedenis.
 */
export async function replaceAsset(
  slug: string, file: { name: string; blob: Blob }, s: LibrarySettings, fetchImpl: typeof fetch = fetch,
): Promise<UploadedAsset> {
  if (!s.token.trim()) throw new LibraryError('Geen API-token ingesteld.');
  const form = new FormData();
  form.append('file', file.blob, file.name);
  let res: Response;
  try {
    res = await fetchImpl(`${s.endpoint.replace(/\/$/, '')}/${encodeURIComponent(slug)}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${s.token.trim()}` }, body: form,
    });
  } catch (err) {
    throw new LibraryError(`Library niet bereikbaar (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!res.ok) {
    let detail = '';
    try { const j = JSON.parse(await res.text()) as { error?: unknown }; if (typeof j.error === 'string') detail = ` ${j.error}`; } catch { /* geen json */ }
    const why = res.status === 404 ? 'Dit bestand bestaat niet (meer) in de library.'
      : res.status === 403 ? 'Geen recht om dit bestand te vervangen (vinkje "upload media").'
      : res.status === 401 ? 'Token ongeldig, verlopen of ingetrokken.'
      : res.status === 415 ? 'Ander bestandstype dan het origineel.'
      : res.status === 405 ? 'De library kent vervangen nog niet (PUT /api/media/<slug>).'
      : `Vervangen mislukt: HTTP ${res.status}.`;
    throw new LibraryError(why + detail);
  }
  return await res.json() as UploadedAsset;
}
