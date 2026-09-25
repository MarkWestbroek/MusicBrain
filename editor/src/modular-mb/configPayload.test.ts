// FW-13: de firmware hergebruikt geparkeerde modules van hetzelfde type (en
// modules met dezelfde id bij een patch-wissel). Die houden de knopstanden
// van hun vorige leven — dus moet de config élke control meesturen, ook de
// knoppen die op hun standaardwaarde staan.

import { describe, expect, it } from 'vitest';

import { emptyModularProject } from './types';
import { STEREO_TAPE_SOLO_FX, seedInternals, seedPolyVoicePatch, seedSoloVoicePatch } from './seedModules';
import { buildConfigPayload } from './teensyLink';

interface Cfg { project: { modules: { id: string; typeId: string }[]; patches: { controlState: Record<string, Record<string, unknown>> }[] } }

describe('config-payload: standaardwaarden mee (FW-13)', () => {
  it('elke gepushte module krijgt al zijn knoppen, ook de ongewijzigde', () => {
    const p = seedSoloVoicePatch(seedInternals(emptyModularProject()), 'tp_mmb_vco', 'VCO', 'out', 'out', { level: 0.5 }, STEREO_TAPE_SOLO_FX);
    const cfg = JSON.parse(buildConfigPayload(p).json) as Cfg;
    const cs = cfg.project.patches[0]!.controlState;
    const tape = cfg.project.modules.find((m) => m.typeId === 'tp_mmb_stereo_tape_echo')!;
    const vco = cfg.project.modules.find((m) => m.typeId === 'tp_mmb_vco')!;
    // De seed zet `cross`; de rest komt van de standaardwaarden.
    expect(cs[tape.id]!.cross).toBe(0.6);
    for (const id of ['time', 'ratio', 'feedback', 'mix', 'tone', 'wow', 'flutter', 'drive']) expect(cs[tape.id]).toHaveProperty(id);
    expect(cs[vco.id]!.level).toBe(0.5);                     // eigen stand wint
    expect(cs[vco.id]).toHaveProperty('coarse');              // standaard erbij
  });

  it('geen displays/leds, geen voiceCount-overschrijving, en de payload blijft klein', () => {
    const p = seedPolyVoicePatch(seedInternals(emptyModularProject()), 16);
    const { json } = buildConfigPayload(p);
    const cfg = JSON.parse(json) as Cfg;
    const mi = cfg.project.modules.find((m) => m.typeId === 'tp_mmb_midiin')!;
    const cs = cfg.project.patches[0]!.controlState[mi.id]!;
    expect(cs.voiceCount).toBe(16);                           // uit de seed, niet de standaard 1
    expect(cs).not.toHaveProperty('chDisp');
    expect(json.length).toBeLessThan(40 * 1024);
  });
});
