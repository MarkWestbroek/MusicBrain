import { describe, it, expect } from 'vitest';
import { compareVersions, fetchFirmwareReleases, pickFirmwareReleases } from './firmwareRelease';

const rel = (tag: string, assets: string[], extra: Partial<{ draft: boolean }> = {}) => ({
  tag_name: tag, html_url: `https://github.com/x/releases/tag/${tag}`, published_at: '2026-09-25T12:00:00Z',
  draft: false, prerelease: false, ...extra,
  assets: assets.map((n) => ({ name: n, browser_download_url: `https://github.com/x/releases/download/${tag}/${n}`, size: 1_200_000 })),
});

describe('firmware-releases', () => {
  it('versies vergelijken', () => {
    expect(compareVersions('0.5.72', '0.5.78')).toBeLessThan(0);
    expect(compareVersions('0.5.78', '0.5.78')).toBe(0);
    expect(compareVersions('0.6.0', '0.5.99')).toBeGreaterThan(0);
    expect(compareVersions('0.5.100', '0.5.99')).toBeGreaterThan(0);   // numeriek, niet als tekst
    expect(compareVersions(undefined, '0.5.78')).toBeLessThan(0);
  });

  it('alleen fw-tags met een .hex, nieuwste eerst; banks-release en drafts eruit', () => {
    const list = pickFirmwareReleases([
      rel('banks', ['ydp-grand.mmbs']),
      rel('fw-0.5.73', ['mmb-fw-0.5.73.hex']),
      rel('fw-0.5.100', ['mmb-fw-0.5.100.hex']),
      rel('fw-0.5.78', ['mmb-fw-0.5.78.hex']),
      rel('fw-0.5.79', ['mmb-fw-0.5.79.hex'], { draft: true }),
      rel('fw-0.5.77', []),
    ]);
    expect(list.map((r) => r.version)).toEqual(['0.5.100', '0.5.78', '0.5.73']);
    expect(list[0]!.hexUrl).toMatch(/mmb-fw-0\.5\.100\.hex$/);
  });

  it('haalt de lijst bij de GitHub-API op', async () => {
    let url = '';
    const fetchFn = (async (u: string | URL | Request) => { url = String(u); return new Response(JSON.stringify([rel('fw-0.5.78', ['mmb-fw-0.5.78.hex'])]), { status: 200 }); }) as typeof fetch;
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = { getItem: () => null, setItem: () => {} } as unknown as Storage;
    const list = await fetchFirmwareReleases(fetchFn);
    expect(url).toBe('https://api.github.com/repos/MarkWestbroek/MusicBrain/releases?per_page=50');
    expect(list[0]!.version).toBe('0.5.78');
  });
});
