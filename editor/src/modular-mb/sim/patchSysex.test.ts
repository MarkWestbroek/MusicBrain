import { describe, it, expect } from 'vitest';
import { pack7, unpack7, encodePatchSysex, decodePatchSysex, splitSysex, joinSysex, SYSEX_CMD, SysexError, CHUNK } from './patchSysex';

describe('7-bit pakken', () => {
  it('heen en terug, elke lengte', () => {
    for (const n of [0, 1, 6, 7, 8, 13, 14, 100]) {
      const raw = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 200) & 0xFF);
      const p = pack7(raw);
      expect([...p].every((b) => b < 0x80)).toBe(true);
      expect([...unpack7(p)]).toEqual([...raw]);
    }
  });
});

describe('patch-SysEx', () => {
  it('JSON heen en terug via .syx, meerdere berichten, alle bytes 7-bit, ≤ 252 bytes', async () => {
    const json = JSON.stringify({ patches: Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, name: `Patch ${i}`, x: Math.sin(i) })) });
    const msgs = await encodePatchSysex(SYSEX_CMD.editorPatch, json);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) {
      expect(m[0]).toBe(0xF0); expect(m[m.length - 1]).toBe(0xF7);
      expect([...m.subarray(1, -1)].every((b) => b < 0x80)).toBe(true);
      expect(m.length).toBeLessThanOrEqual(CHUNK + 12);
    }
    const syx = joinSysex(msgs);
    const back = await decodePatchSysex(splitSysex(syx));
    expect(back.get(SYSEX_CMD.editorPatch)).toBe(json);
  });
  it('twee soorten in één bestand, vreemde SysEx overgeslagen', async () => {
    const a = await encodePatchSysex(SYSEX_CMD.editorPatch, '{"a":1}');
    const b = await encodePatchSysex(SYSEX_CMD.firmwareConfig, '{"b":2}');
    const other = Uint8Array.from([0xF0, 0x41, 0x10, 0x42, 0x12, 0x00, 0xF7]);   // Roland
    const back = await decodePatchSysex(splitSysex(joinSysex([other, ...b, ...a])));
    expect(back.get(SYSEX_CMD.editorPatch)).toBe('{"a":1}');
    expect(back.get(SYSEX_CMD.firmwareConfig)).toBe('{"b":2}');
  });
  it('beschadigd of onvolledig → SysexError', async () => {
    const msgs = await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify({ x: 'y'.repeat(2000) + Math.random() }));
    const bad = msgs.map((m) => m.slice());
    bad[0]![12] = (bad[0]![12]! + 1) & 0x7F;
    await expect(decodePatchSysex(bad)).rejects.toBeInstanceOf(SysexError);
    if (msgs.length > 1) await expect(decodePatchSysex(msgs.slice(1))).rejects.toThrow(/Onvolledig/);
  });
});

describe('SysEx in een .mid', () => {
  it('encodeSmf zet ze op tijd 0, parseSmf leest ze terug, noten blijven', async () => {
    const { encodeSmf } = await import('./midiRecorder');
    const { parseSmf } = await import('../../take-player/smf');
    const msgs = await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify({ hallo: 'patch'.repeat(100) }));
    const f = parseSmf(encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 500, status: 0x80, d1: 60, d2: 0 }], { lengthMs: 1000, sysex: msgs }));
    expect(f.events).toHaveLength(2);
    expect(f.sysex).toHaveLength(msgs.length);
    expect((await decodePatchSysex(f.sysex!)).get(SYSEX_CMD.editorPatch)).toContain('hallo');
  });
});

describe('SysexCollector en describeSysex', () => {
  it('verzamelt een live reeks; vreemde SysEx en gaten geven null', async () => {
    const { SysexCollector, describeSysex } = await import('./patchSysex');
    const msgs = await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify({ n: 'x'.repeat(3000) + Math.random() }));
    const c = new SysexCollector();
    expect(await c.feed(Uint8Array.from([0xF0, 0x43, 0x10, 0xF7]))).toBeNull();
    let got = null;
    for (const m of msgs) got = await c.feed(m);
    expect(got!.cmd).toBe(SYSEX_CMD.editorPatch);
    expect(got!.json).toContain('xxx');
    if (msgs.length > 2) {
      const c2 = new SysexCollector();
      await c2.feed(msgs[0]!);
      expect(await c2.feed(msgs[2]!)).toBeNull();          // gat → opnieuw beginnen
    }
    expect(describeSysex(msgs[0]!)).toMatch(/^MusicBrain editor-patch, deel 1 van \d+$/);
    expect(describeSysex([0xF0, 0x41, 0x10, 0x42, 0xF7])).toBe('Roland, 5 bytes');
    expect(describeSysex([0xF0, 0x00, 0x20, 0x6B, 0x7F, 0xF7])).toBe('Arturia, 6 bytes');
  });
});
