import { describe, it, expect } from 'vitest';
import { groupTakes, takeTime, listTakes, fetchAsset, addPatchSnapshot, type LibraryAsset } from './takeLibrary';
import { DEFAULT_LIBRARY } from './mediaLibrary';
import { patchSnapshot } from './midiRecorder';
import { emptyModularProject } from '../types';
import { seedInternals, seedPolyVoicePatch } from '../seedModules';
import { expandPatchConnections } from '../polyExpand';

const a = (group: string, name: string, mime: string, kind = 'data'): LibraryAsset =>
  ({ slug: `${group}-${name}`, kind, url: `https://musicbrain.nl/api/assets/library/x/${name}`, title: name, group, mime });

describe('takes groeperen', () => {
  it('per group, wav/mid/patch herkend, nieuwste eerst', () => {
    const g1 = 'mmb-koper-20260928-120000', g2 = 'mmb-koper-20260929-090000';
    const t = groupTakes([
      a(g1, `${g1}.wav`, 'audio/wav', 'audio'), a(g1, `${g1}.mid`, 'audio/midi'), a(g1, `${g1}.patch.json`, 'application/json'),
      a(g2, `${g2}.wav`, 'audio/wav', 'audio'),
    ]);
    expect(t.map((x) => x.group)).toEqual([g2, g1]);
    expect(t[1]!.wav && t[1]!.mid && t[1]!.patch).toBeTruthy();
    expect(t[0]!.mid).toBeUndefined();
    expect(takeTime(g1)!.getHours()).toBe(12);
    expect(takeTime('geen-tijd')).toBeNull();
  });

  it('listTakes stuurt folder/tag en Bearer; 403 = vinkje list media', async () => {
    const calls: string[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push(`${url} ${(init.headers as Record<string, string>).Authorization}`);
      return new Response(JSON.stringify({ assets: [a('g-20260101-000000', 'x.wav', 'audio/wav')] }));
    }) as unknown as typeof fetch;
    const s = { ...DEFAULT_LIBRARY, token: 't' };
    const r = await listTakes(s, { folder: 'opnames/sim', tag: 'koper' }, ok);
    expect(r).toHaveLength(1);
    expect(calls[0]).toBe('https://musicbrain.nl/api/media?folder=opnames%2Fsim&tag=koper Bearer t');
    const no = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    await expect(listTakes(s, {}, no)).rejects.toThrow(/list media/);
  });

  it('fetchAsset: bytes, en 403 = niet publiek', async () => {
    const ok = (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch;
    expect([...await fetchAsset(a('g', 'x.mid', 'audio/midi'), ok)]).toEqual([1, 2, 3]);
    const no = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await expect(fetchAsset(a('g', 'x.mid', 'audio/midi'), no)).rejects.toThrow(/publiek/);
  });
});

describe('addPatchSnapshot', () => {
  it('voegt een take uit hetzelfde project toe met verse ids, zonder te botsen', () => {
    const p = seedPolyVoicePatch(seedInternals(emptyModularProject()), 4, { aftertouch: true });
    const orig = p.patches.find((x) => x.id === p.activePatchId)!;
    const snap = JSON.parse(JSON.stringify(patchSnapshot(p, orig)));
    let n = 0;
    const r = addPatchSnapshot(p, snap, 'Take 1', (pre) => `${pre}_new${++n}`);
    expect(r.patches).toHaveLength(p.patches.length + 1);
    const np = r.patches.find((x) => x.id === r.activePatchId)!;
    expect(np.name).toBe('Take 1');
    expect(np.id).not.toBe(orig.id);
    expect(np.connections).toHaveLength(orig.connections.length);
    // alle kabels wijzen naar bestaande, nieuwe modules; geen dubbele ids
    const ids = r.modules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of np.connections) {
      expect(ids).toContain(c.from.moduleId); expect(ids).toContain(c.to.moduleId);
      expect(orig.connections.some((o) => o.from.moduleId === c.from.moduleId && !r.modules.find((m) => m.id === c.from.moduleId)!.internal)).toBe(false);
    }
    const rack = r.racks.find((x) => x.id === np.rackIds[0])!;
    expect(rack.polyGroups!.every((g) => g.members.every((m) => ids.includes(m.moduleId)))).toBe(true);
    // controlState-sleutels zijn mee verhuisd
    expect(Object.keys(np.controlState).every((k) => ids.includes(k))).toBe(true);
    expandPatchConnections(np, r);
  });
});
