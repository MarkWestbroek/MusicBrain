// Firmware om te downloaden (ED-FW-DIST-2) — de editor vraagt bij GitHub op
// welke firmware-releases er zijn (tag fw-X.Y.Z, bijlage mmb-fw-X.Y.Z.hex,
// gemaakt door .github/workflows/firmware-release.yml) en biedt de nieuwste
// aan. Flashen gaat met Teensy Loader van PJRC. Zie doc/firmware-distributie.md.
//
// Openbaar repo, dus geen token nodig; de GitHub-API staat CORS toe. Het
// antwoord wordt een uur in sessionStorage bewaard (API-limiet 60/uur per IP).

const REPO = 'MarkWestbroek/MusicBrain';
const CACHE_KEY = 'mmb.fwReleases.v1';
const CACHE_MS = 60 * 60 * 1000;

export interface FirmwareRelease {
  version: string;       // "0.5.78"
  tag: string;           // "fw-0.5.78"
  hexUrl: string;        // directe download van de .hex
  hexSize: number;
  pageUrl: string;       // releasepagina op GitHub (notes)
  published: string;     // ISO-datum
}

/** "0.5.78" → [0,5,78]; negatief/leeg bij rommel. */
export function parseVersion(v: string | undefined): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec((v ?? '').trim().replace(/^v/, ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** <0 als a ouder is dan b, 0 gelijk, >0 nieuwer. Onleesbaar telt als oudst. */
export function compareVersions(a: string | undefined, b: string | undefined): number {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}

interface GhAsset { name: string; browser_download_url: string; size: number }
interface GhRelease { tag_name: string; html_url: string; published_at: string; draft: boolean; prerelease: boolean; assets: GhAsset[] }

/** Uit de ruwe GitHub-lijst de firmware-releases, nieuwste eerst. */
export function pickFirmwareReleases(list: GhRelease[]): FirmwareRelease[] {
  const out: FirmwareRelease[] = [];
  for (const r of list) {
    if (r.draft) continue;
    const m = /^fw-(\d+\.\d+\.\d+)$/.exec(r.tag_name);
    if (!m) continue;
    const hex = r.assets.find((a) => /\.hex$/i.test(a.name));
    if (!hex) continue;
    out.push({ version: m[1]!, tag: r.tag_name, hexUrl: hex.browser_download_url, hexSize: hex.size, pageUrl: r.html_url, published: r.published_at });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

export async function fetchFirmwareReleases(fetchFn: typeof fetch = fetch): Promise<FirmwareRelease[]> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { at: number; list: FirmwareRelease[] };
      if (Date.now() - c.at < CACHE_MS) return c.list;
    }
  } catch { /* geen opslag */ }
  const res = await fetchFn(`https://api.github.com/repos/${REPO}/releases?per_page=50`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub antwoordde ${res.status}`);
  const list = pickFirmwareReleases(await res.json() as GhRelease[]);
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch { /* geen opslag */ }
  return list;
}
