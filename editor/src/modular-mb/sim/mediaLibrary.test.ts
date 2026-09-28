import { describe, it, expect } from 'vitest';
import { uploadTake, takeForm, parseTags, LibraryError, DEFAULT_LIBRARY, type Take } from './mediaLibrary';

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
    await expect(uploadTake(take, settings, st(401))).rejects.toThrow(/geweigerd/);
    await expect(uploadTake(take, settings, st(413))).rejects.toThrow(/Te groot/);
    const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await expect(uploadTake(take, settings, down)).rejects.toBeInstanceOf(LibraryError);
  });

  it('parseTags', () => {
    expect(parseTags(' a, b ,,a,c ')).toEqual(['a', 'b', 'c']);
  });
});
