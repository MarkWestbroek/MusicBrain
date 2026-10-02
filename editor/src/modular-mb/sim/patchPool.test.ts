import { describe, it, expect } from 'vitest';
import { buildProposal, siteBase, assetUrl, proposePatch, listPool, fetchPatchFile } from './patchPool';
import { DEFAULT_LIBRARY } from './mediaLibrary';
import { demoScript, demoLengthMs } from './demoTake';

const s = { ...DEFAULT_LIBRARY, token: 'tok' };
const req = { editorVersion: '0.5.48', editorBuild: '', firmwareContract: '0.5.94', moduleTypes: ['tp_mmb_vco'] };

describe('patch-pool client', () => {
  it('urls uit het library-endpoint', () => {
    expect(siteBase(s)).toBe('https://musicbrain.nl');
    expect(siteBase({ ...s, endpoint: 'http://localhost:3000/api/media/' })).toBe('http://localhost:3000');
    expect(assetUrl('asset:ab12', s)).toBe('https://musicbrain.nl/api/assets/_ref/ab12');
  });
  it('buildProposal: contractvorm, tags ontdubbeld, vraag alleen bij question', () => {
    const b = buildProposal({ kind: 'question', title: ' Koper ', description: 'd', tags: ['lead', 'lead', ' '], license: 'CC-BY-4.0', requires: req, question: 'lukt niet' },
      { file: { slug: 'f1', kind: 'data', url: '/f' }, syx: { slug: 's1', kind: 'data', url: '/s' } }, ['g-1']);
    expect(b).toEqual({ kind: 'question', title: 'Koper', description: 'd', tags: ['lead'], license: 'CC-BY-4.0', file: 'asset:f1', syx: 'asset:s1', takes: ['g-1'], requires: req, question: 'lukt niet' });
    const p = buildProposal({ kind: 'proposal', title: 'x', description: '', tags: [], license: 'CC0', requires: req, question: 'weg' }, { file: { slug: 'f', kind: 'data', url: '' } }, []);
    expect(p).not.toHaveProperty('question'); expect(p).not.toHaveProperty('takes'); expect(p).not.toHaveProperty('syx');
  });
  it('proposePatch: eerst de bestanden naar de library, dan POST /api/patches', async () => {
    const calls: { url: string; method: string; body?: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      if (url.endsWith('/api/media')) {
        const names = (init.body as FormData).getAll('file[]').map((f) => (f as File).name);
        calls.push({ url, method, body: names });
        return new Response(JSON.stringify({ assets: names.map((n) => ({ slug: n.replace(/\W/g, '-'), kind: 'data', url: '/' + n })) }), { status: 201 });
      }
      calls.push({ url, method, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ slug: 'koper', title: 'Koper', pool: 'voorstel', file: 'asset:x' }), { status: 201 });
    }) as unknown as typeof fetch;
    const item = await proposePatch({ kind: 'proposal', title: 'Koper', description: '', tags: ['lead'], license: 'CC-BY-4.0', requires: req },
      { group: 'mmb-koper-20261002-100000', patchJson: new Blob(['{}']), syx: new Blob([new Uint8Array([0xF0, 0xF7])]) }, ['mmb-koper-20261002-100000'], s, fake);
    expect(item.pool).toBe('voorstel');
    expect(calls[0]).toMatchObject({ url: 'https://musicbrain.nl/api/media', body: ['mmb-koper-20261002-100000.patch.json'] });
    expect(calls[1]).toMatchObject({ url: 'https://musicbrain.nl/api/media', body: ['mmb-koper-20261002-100000.syx'] });
    expect(calls[2]).toMatchObject({ url: 'https://musicbrain.nl/api/patches', method: 'POST' });
    const body = calls[2]!.body as Record<string, unknown>;
    expect(body.file).toBe('asset:mmb-koper-20261002-100000-patch-json');
    expect(body.syx).toBe('asset:mmb-koper-20261002-100000-syx');
    expect(body.takes).toEqual(['mmb-koper-20261002-100000']);
  });
  it('listPool: filters, zonder token geen Authorization; fouten', async () => {
    const seen: { url: string; auth?: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: (init.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ items: [{ slug: 'a', title: 'A', pool: 'centraal', file: 'asset:1' }] }));
    }) as unknown as typeof fetch;
    const r = await listPool({ pool: 'centraal', tag: 'lead' }, { ...s, token: '' }, fake);
    expect(r[0]!.slug).toBe('a');
    expect(seen[0]).toEqual({ url: 'https://musicbrain.nl/api/patches?pool=centraal&tag=lead', auth: undefined });
    const nf = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(listPool({}, s, nf)).rejects.toThrow(/bestaat nog niet/);
    const ok = (async () => new Response('{"patches":[]}')) as unknown as typeof fetch;
    expect(await fetchPatchFile({ slug: 'x', title: 'x', pool: 'centraal', file: 'asset:q' }, s, ok)).toBe('{"patches":[]}');
  });
  it('demoScript: noten gaan allemaal uit, modwheel en aftertouch eindigen op 0, ~9 s', () => {
    const sc = demoScript();
    const open = new Set<number>();
    for (const st of sc) { if (st.kind === 'on') open.add(st.note!); if (st.kind === 'off') open.delete(st.note!); }
    expect(open.size).toBe(0);
    expect(sc.filter((x) => x.kind === 'cc').at(-1)!.value).toBe(0);
    expect(sc.filter((x) => x.kind === 'at').at(-1)!.value).toBe(0);
    expect(demoLengthMs(sc)).toBeGreaterThan(8000);
    expect(demoLengthMs(sc)).toBeLessThan(13000);
    for (let i = 1; i < sc.length; i++) expect(sc[i]!.t).toBeGreaterThanOrEqual(sc[i - 1]!.t);
  });
});

describe('privé-pool', () => {
  it('buildProposal stuurt kind private zonder vraag', () => {
    const b = buildProposal({ kind: 'private', title: 'Synthex ×8', description: '', tags: [], license: 'CC-BY-4.0', requires: req, question: 'weg' },
      { file: { slug: 'f', kind: 'data', url: '' } }, []);
    expect(b.kind).toBe('private');
    expect(b).not.toHaveProperty('question');
  });
  it('promotePatch: PATCH /api/patches/<slug>, en de foutgevallen van het contract', async () => {
    const { promotePatch } = await import('./patchPool');
    const seen: { url: string; method?: string; body: unknown; auth?: string }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ ok: true, slug: 'synthex-8', pool: 'vraag' }));
    }) as unknown as typeof fetch;
    const r = await promotePatch('synthex 8', { kind: 'question', question: ' waarom kraakt hij? ' }, s, ok);
    expect(r.pool).toBe('vraag');
    expect(seen[0]).toEqual({ url: 'https://musicbrain.nl/api/patches/synthex%208', method: 'PATCH', body: { kind: 'question', question: 'waarom kraakt hij?' }, auth: 'Bearer tok' });
    const status = (n: number) => (async () => new Response('{}', { status: n })) as unknown as typeof fetch;
    await expect(promotePatch('x', { kind: 'proposal' }, s, status(404))).rejects.toThrow(/niet \(meer\) in jouw privé-lijst/);
    await expect(promotePatch('x', { kind: 'proposal' }, s, status(409))).rejects.toThrow(/al voorgesteld/);
    await expect(promotePatch('x', { kind: 'proposal' }, s, status(403))).rejects.toThrow(/patch:propose/);
    await expect(promotePatch('x', { kind: 'proposal' }, { ...s, token: '' }, ok)).rejects.toThrow(/Geen API-token/);
  });
});

describe('afwijzing van de pool', () => {
  it('toont welke velden fout zijn', async () => {
    const { describeIssues, listPool } = await import('./patchPool');
    expect(describeIssues([{ path: ['requires', 'editorVersion'], message: 'Invalid semver' }, 'los'])).toBe('requires.editorVersion: Invalid semver; los');
    expect(describeIssues(undefined)).toBe('');
    const bad = (async () => new Response(JSON.stringify({ error: 'Invalid patch', issues: [{ path: ['requires', 'firmwareContract'], message: 'Invalid semver' }] }), { status: 400 })) as unknown as typeof fetch;
    await expect(listPool({}, s, bad)).rejects.toThrow('Invalid patch: requires.firmwareContract: Invalid semver');
  });
});
