// Sustainpedaal op de AHDSR en de VC SWITCH (fw 0.5.112, Mark 2026-10-12).
//  * AHDSR: zolang Ped hoog is tellen −H+ en −R+ (ms) op bij Hold en Release;
//    pedaal los tijdens de uitklank = kortere release zonder sprong.
//  * VC SWITCH: Sel kiest A of B (Gate), of mengt (Fade); Glide maakt het traag.

import { describe, expect, it } from 'vitest';

import { expectMatchesCatalog, load } from './wasmTestHost';

/** Hoe lang (ms) de envelope na het loslaten boven 0,01 blijft. */
async function tail(ctl: Record<string, number>, pedal: number): Promise<number> {
  const m = await load('tp_mmb_ahdsr');
  m.setCtl('attack', 5); m.setCtl('decay', 50); m.setCtl('sustain', 0.8); m.setCtl('release', 300);
  for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
  m.setIn('pedal', pedal);
  m.setIn('gate', 1); m.render(0.3);
  m.setIn('gate', 0);
  const env = m.render(3).cv_out!;
  let last = 0;
  for (let i = 0; i < env.length; i++) if (env[i]! > 0.01) last = i;
  return last;   // 1 kHz: index = ms
}

describe('tp_mmb_ahdsr: sustainpedaal', () => {
  it('draagt de namen van de catalogus (met Ped, −H+ en −R+)', async () => {
    const m = await expectMatchesCatalog('tp_mmb_ahdsr');
    expect(m.inputs).toContain('pedal');
  });

  it('pedaal + −R+ 1000 ms verlengt de release; zonder pedaal doet de knop niets', async () => {
    const base = await tail({}, 0);
    expect(await tail({ ped_rel: 1000 }, 0)).toBe(base);
    expect(await tail({ ped_rel: 1000 }, 1)).toBeGreaterThan(base + 800);
    expect(await tail({ ped_rel: -200 }, 1)).toBeLessThan(base - 150);
  });

  it('−H+ verlengt de hold zolang het pedaal hoog is', async () => {
    const m = await load('tp_mmb_ahdsr');
    m.setCtl('attack', 5); m.setCtl('hold', 0); m.setCtl('decay', 100); m.setCtl('sustain', 0.2); m.setCtl('ped_hold', 400);
    m.setIn('pedal', 1); m.setIn('gate', 1);
    const env = m.render(0.6).cv_out!;
    expect(env[300]!).toBeGreaterThan(0.99);   // nog in de hold
    expect(env[550]!).toBeLessThan(0.5);       // daarna de decay
  });

  it('pedaal los tijdens de release: geen sprong, wel sneller omlaag', async () => {
    const m = await load('tp_mmb_ahdsr');
    m.setCtl('attack', 5); m.setCtl('sustain', 0.8); m.setCtl('release', 300); m.setCtl('ped_rel', 3000);
    m.setIn('pedal', 1); m.setIn('gate', 1); m.render(0.2);
    m.setIn('gate', 0);
    const a = m.render(0.5).cv_out!;
    m.setIn('pedal', 0);
    const b = m.render(0.5).cv_out!;
    expect(Math.abs(b[0]! - a[a.length - 1]!)).toBeLessThan(0.01);
    expect(b[400]!).toBeLessThan(0.05);
  });
});

describe('tp_mmb_vcswitch', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_vcswitch'); });

  it('Gate: Sel kiest A of B, voor beide kanalen; Glide 0 = meteen', async () => {
    const m = await load('tp_mmb_vcswitch');
    m.setCtl('glide', 0);
    m.setIn('a1', 0.2); m.setIn('b1', 0.9); m.setIn('a2', -0.5); m.setIn('b2', 0.5);
    m.setIn('sel', 0);
    let o = m.render(0.01);
    expect(o.out1!.at(-1)!).toBeCloseTo(0.2, 5); expect(o.out2!.at(-1)!).toBeCloseTo(-0.5, 5);
    m.setIn('sel', 1);
    o = m.render(0.01);
    expect(o.out1![0]!).toBeCloseTo(0.9, 5); expect(o.out2![0]!).toBeCloseTo(0.5, 5);
  });

  it('Glide 100 ms: halverwege na 50 ms', async () => {
    const m = await load('tp_mmb_vcswitch');
    m.setCtl('glide', 100);
    m.setIn('a1', 0); m.setIn('b1', 1); m.setIn('sel', 0); m.render(0.05);
    m.setIn('sel', 1);
    const o = m.render(0.2).out1!;
    expect(o[50]!).toBeCloseTo(0.5, 1);
    expect(o[150]!).toBeCloseTo(1, 3);
  });

  it('Fade: Sel 0,25 mengt een kwart B', async () => {
    const m = await load('tp_mmb_vcswitch');
    m.setCtl('glide', 0); m.setCtl('mode', 1);
    m.setIn('a1', 0); m.setIn('b1', 1); m.setIn('sel', 0.25);
    expect(m.render(0.01).out1!.at(-1)!).toBeCloseTo(0.25, 5);
  });
});
