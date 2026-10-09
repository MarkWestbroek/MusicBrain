// CMI-profiel (Page 4): opslag, COMPUTE naar de tabel van de stem, en de
// analyse van een getekende golf naar harmonischen.

import { describe, expect, it } from 'vitest';

import {
  H, PRESETS, SAMPLES, SEG, TABLE_LENGTH, computeTable, decodeProfile, emptyProfile, encodeProfile, harmonicsOf, preset,
  profileFromHarmonics,
} from './cmiProfile';

describe('CMI-profiel', () => {
  it('overleeft de rondreis door base64, binnen de resolutie van een byte', () => {
    const p = preset('bell');
    const back = decodeProfile(encodeProfile(p))!;
    for (let i = 0; i < H * SEG; i++) expect(Math.abs(back.levels[i]! - p.levels[i]!)).toBeLessThan(1 / 255 + 1e-6);
    for (let s = 0; s < SEG; s++) {
      expect(back.duration[s]! / p.duration[s]!).toBeCloseTo(1, 1);
      expect(Math.abs(back.energy[s]! - p.energy[s]!)).toBeLessThan(1 / 255 + 1e-6);
    }
    expect(encodeProfile(p).length).toBeLessThan(1500);
    expect(decodeProfile('nee')).toBeNull();
    expect(decodeProfile(undefined)).toBeNull();
  });

  it('COMPUTE: één harmonische geeft een sinus op die harmonische; duur en energie komen achteraan mee', () => {
    const p = emptyProfile();
    for (let s = 0; s < SEG; s++) p.levels[2 * SEG + s] = 1;       // alleen de 3e
    p.duration[0] = 2; p.energy[5] = 0.5;
    const t = computeTable(p);
    expect(t.length).toBe(TABLE_LENGTH);
    const seg0 = Array.from(t.subarray(0, SAMPLES));
    expect(Math.max(...seg0)).toBeGreaterThan(31000);
    const harm = harmonicsOf(seg0);
    expect(harm[2]).toBeCloseTo(1, 3);
    expect(harm[0]).toBeLessThan(0.01);
    expect(t[SEG * SAMPLES]).toBe(2000);
    expect(t[SEG * SAMPLES + SEG + 5]).toBe(Math.round(32767 * 0.5));
  });

  it('een gezamenlijke schaal: een segment met minder harmonischen is zachter', () => {
    const p = emptyProfile();
    for (let h = 0; h < 8; h++) p.levels[h * SEG] = 1;              // segment 0: acht harmonischen
    p.levels[1] = 1;                                                  // segment 1: alleen de grondtoon
    const t = computeTable(p);
    const peak = (s: number): number => Math.max(...Array.from(t.subarray(s * SAMPLES, (s + 1) * SAMPLES), Math.abs));
    expect(peak(1)).toBeLessThan(0.5 * peak(0));
  });

  it('Page 6 → Page 4: een getekende zaag geeft 1/k', () => {
    const saw = Array.from({ length: 256 }, (_, i) => 1 - (2 * i) / 256);
    const h = harmonicsOf(saw);
    expect(h[0]).toBeCloseTo(1, 3);
    expect(h[1]).toBeCloseTo(0.5, 1);
    expect(h[3]).toBeCloseTo(0.25, 1);
    const p = profileFromHarmonics(h);
    expect(p.levels[1 * SEG + 17]).toBeCloseTo(h[1]!, 5);
  });

  it('elk startpunt is een geldig, hoorbaar profiel', () => {
    for (const { id } of PRESETS) {
      const t = computeTable(preset(id));
      expect(Math.max(...Array.from(t.subarray(0, SAMPLES), Math.abs)), id).toBeGreaterThan(1000);
    }
  });
});

describe('CMI-profiel in de morph', () => {
  it('mixProfiles: niveaus en energie lineair, duur logaritmisch; de randen zijn A en B', async () => {
    const { mixProfiles } = await import('./cmiProfile');
    const a = preset('organ'), b = preset('square');
    a.duration.fill(1); b.duration.fill(4); a.energy.fill(0.2); b.energy.fill(1);
    const half = mixProfiles(a, b, 0.5);
    expect(half.levels[1 * SEG + 3]).toBeCloseTo((a.levels[1 * SEG + 3]! + b.levels[1 * SEG + 3]!) / 2, 5);
    expect(half.duration[7]).toBeCloseTo(2, 5);
    expect(half.energy[7]).toBeCloseTo(0.6, 5);
    expect(Array.from(mixProfiles(a, b, 0).levels)).toEqual(Array.from(a.levels));
    expect(Array.from(mixProfiles(a, b, 1).levels)).toEqual(Array.from(b.levels));
  });

  it('morphModuleData: het profiel gaat mee; een kant zonder profiel telt als koper', async () => {
    const { morphModuleData } = await import('./recipe/morph');
    const base = { id: 'x', name: 'x', voiceCount: 1, rackIds: [], connections: [], controlState: {}, envelopes: [], lfos: [] };
    const A = { ...base, id: 'a', moduleData: { m1: { cmi: encodeProfile(preset('organ')) } } };
    const B = { ...base, id: 'b', moduleData: { m1: { cmi: encodeProfile(preset('square')) } } };
    expect(morphModuleData(A, B, 0)!.m1!.cmi).toBe(A.moduleData.m1.cmi);
    expect(morphModuleData(A, B, 1)!.m1!.cmi).toBe(B.moduleData.m1.cmi);
    const mid = decodeProfile(morphModuleData(A, B, 0.5)!.m1!.cmi)!;
    // h2 (index 1): orgel 0,8, vierkant 0 → halverwege ~0,4
    expect(mid.levels[1 * SEG + 5]).toBeCloseTo(0.4, 1);
    const noB = { ...base, id: 'b2' };
    // B zonder profiel = koper: op t = 1 geen profiel (de stem speelt koper),
    // halverwege een menging met koper.
    expect(morphModuleData(A, noB, 1)!.m1).toBeUndefined();
    const half = decodeProfile(morphModuleData(A, noB, 0.5)!.m1!.cmi)!;
    expect(half.levels[1 * SEG + 31]).toBeCloseTo((preset('organ').levels[1 * SEG + 31]! + preset('brass').levels[1 * SEG + 31]!) / 2, 1);
    expect(morphModuleData(base, { ...base, id: 'c' }, 0.5)).toBeUndefined();
  });
});
