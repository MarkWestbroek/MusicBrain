import { describe, it, expect } from 'vitest';
import { uploadTake, takeForm, parseTags, LibraryError, DEFAULT_LIBRARY, renameTake, splitTakeName, slugName, type Take } from './mediaLibrary';

const take: Take = {
  group: 'mmb-koper-20260928-120000',
  files: [
    { name: 'mmb-koper-20260928-120000.wav', blob: new Blob([new Uint8Array(8)], { type: 'audio/wav' }) },
    { name: 'mmb-koper-20260928-120000.mid', blob: new Blob([new Uint8Array(4)], { type: 'audio/midi' }) },
  ],
};
const settings = { ...DEFAULT_LIBRARY, token: 'tok123', tags: ['sim-opname', 'koper'] };

describe('mediaLibrary', () => {
  it('formulier volgens het contract: file[], folder, tags[], group, exif', () => {
    const f = takeForm(take, settings);
    expect((f.getAll('file[]') as File[]).map((x) => x.name)).toEqual(take.files.map((x) => x.name));
    expect(f.get('folder')).toBe('opnames/sim');
    expect(f.getAll('tags[]')).toEqual(['sim-opname', 'koper']);
    expect(f.get('group')).toBe(take.group);
    expect(f.get('exif')).toBe('none');
  });

  it('één POST met Bearer-token; assets terug', async () => {
    const calls: [string, RequestInit][] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ assets: [{ slug: 'a', kind: 'audio', url: '/x', group: take.group }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await uploadTake(take, settings, fake);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('https://musicbrain.nl/api/media');
    expect((calls[0]![1].headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    expect(r[0]!.kind).toBe('audio');
  });

  it('heldere fouten: geen token, 401, 413, netwerk', async () => {
    const ok = (async () => new Response('{}')) as unknown as typeof fetch;
    await expect(uploadTake(take, { ...settings, token: '' }, ok)).rejects.toThrow(/token/i);
    const st = (s: number) => (async () => new Response('nee', { status: s })) as unknown as typeof fetch;
    await expect(uploadTake(take, settings, st(401))).rejects.toThrow(/ongeldig/);
    await expect(uploadTake(take, settings, st(403))).rejects.toThrow(/scope/);
    await expect(uploadTake(take, settings, st(415))).rejects.toThrow(/Bestandstype/);
    const withBody = (async () => new Response(JSON.stringify({ error: 'unsupported file type', file: 'x.mid' }), { status: 415 })) as unknown as typeof fetch;
    await expect(uploadTake(take, settings, withBody)).rejects.toThrow('unsupported file type (x.mid) Er is niets opgeslagen.');
    await expect(uploadTake(take, settings, st(413))).rejects.toThrow(/te groot/);
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(uploadTake(take, settings, down)).rejects.toBeInstanceOf(LibraryError);
  });

  it('parseTags', () => {
    expect(parseTags(' a, b ,,a,c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('take hernoemen', () => {
  it('naam wijzigt, tijdstempel en extensies blijven', () => {
    const r = renameTake(take, 'Vangelis Blade Runner!');
    expect(r.group).toBe('mmb-vangelis-blade-runner-20260928-120000');
    expect(r.files.map((f) => f.name)).toEqual(['mmb-vangelis-blade-runner-20260928-120000.wav', 'mmb-vangelis-blade-runner-20260928-120000.mid']);
    expect(renameTake(take, '  ')).toBe(take);
    expect(splitTakeName(take.group)).toEqual({ name: 'koper', stamp: '20260928-120000' });
    expect(slugName('Café Élan')).toBe('cafe-elan');
  });
});

describe('replaceAsset', () => {
  it('PUT naar /api/media/<slug> met één file; heldere fouten', async () => {
    const { replaceAsset } = await import('./mediaLibrary');
    const calls: [string, RequestInit][] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ slug: 'mid-1', kind: 'data', url: '/x', group: 'g' }), { status: 200 });
    }) as unknown as typeof fetch;
    const f = { name: 'x.mid', blob: new Blob([new Uint8Array(4)]) };
    const r = await replaceAsset('mid 1', f, settings, ok);
    expect(r.slug).toBe('mid-1');
    expect(calls[0]![0]).toBe('https://musicbrain.nl/api/media/mid%201');
    expect(calls[0]![1].method).toBe('PUT');
    expect(((calls[0]![1].body as FormData).get('file') as File).name).toBe('x.mid');
    const st = (s: number) => (async () => new Response('{"error":"nee"}', { status: s })) as unknown as typeof fetch;
    await expect(replaceAsset('m', f, settings, st(404))).rejects.toThrow(/bestaat niet/);
    await expect(replaceAsset('m', f, settings, st(415))).rejects.toThrow(/Ander bestandstype/);
    await expect(replaceAsset('m', f, settings, st(405))).rejects.toThrow(/kent vervangen nog niet/);
  });
});

describe('extra bestanden (.syx) los achteraan', () => {
  it('take komt erin, geweigerde extra geeft alleen een melding', async () => {
    const { uploadTakeWithExtras, renameTake } = await import('./mediaLibrary');
    const posts: string[][] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const names = (init.body as FormData).getAll('file[]').map((f) => (f as File).name);
      posts.push(names);
      if (names.some((n) => n.endsWith('.syx'))) return new Response(JSON.stringify({ error: 'Unsupported file type' }), { status: 415 });
      return new Response(JSON.stringify({ assets: names.map((n) => ({ slug: n, kind: 'x', url: '/' + n })) }), { status: 201 });
    }) as unknown as typeof fetch;
    const t = renameTake({ ...take, extras: [{ name: `${take.group}.syx`, blob: new Blob([new Uint8Array([0xF0, 0xF7])]) }] }, 'nieuw');
    expect(t.extras![0]!.name).toBe('mmb-nieuw-20260928-120000.syx');
    const r = await uploadTakeWithExtras(t, settings, fake);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(['mmb-nieuw-20260928-120000.syx']);
    expect(r.assets).toHaveLength(2);
    expect(r.extraErrors[0]).toMatch(/\.syx: .*Bestandstype/);
  });
});
