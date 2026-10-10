// CMI-bank (doc/plans/fairlight.md §8): bewaren en laden van profiel én
// knoppen, overschrijven, export → import, en projecten zonder bank.

import { describe, expect, it } from 'vitest';

import {
  BANK_SIZE, applyVoice, bankOf, clearVoice, exportBank, importBank, newBank, parseBankFile, storeVoice, voiceFromPatch,
} from './cmiBank';
import { CMI_TYPE, encodeProfile, preset } from './cmiProfile';
import { DEMO_SEEDS, standardProject } from './demoSeeds';
import type { ModularProject } from './types';

function fairlight(): { p: ModularProject; patchId: string; owner: string } {
  const p = DEMO_SEEDS.find((d) => d.label.includes('Fairlight'))!.run(standardProject());
  const patch = p.patches.find((x) => x.id === p.activePatchId)!;
  const owner = Object.keys(patch.moduleData ?? {})[0]!;
  return { p, patchId: patch.id, owner };
}

describe('CMI-bank', () => {
  it('een project zonder bank krijgt de zeven startpunten, de rest leeg', () => {
    const b = bankOf(standardProject());
    expect(b.voices).toHaveLength(BANK_SIZE);
    expect(b.voices.filter(Boolean)).toHaveLength(7);
    expect(b.voices[0]!.name).toBe('koper');
    expect(b.voices[0]!.controls.seg).toBeGreaterThan(0);
    expect(b.voices[7]).toBeNull();
  });

  it('bewaren neemt profiel én knoppen van de stem mee', () => {
    const { p, patchId, owner } = fairlight();
    const v = voiceFromPatch(p, patchId, owner, 'mijn koor')!;
    expect(v.cmi).toBe(p.patches.find((x) => x.id === patchId)!.moduleData![owner]!.cmi);
    expect(v.controls).toEqual({ seg: 60, smooth: 0.5, loop: 20, attack: 30, release: 600, filter: 8 });
    expect(p.modules.find((m) => m.id === owner)!.typeId).toBe(CMI_TYPE);
    const q = storeVoice(p, 9, v);
    expect(q.cmiBank!.voices[9]).toEqual(v);
    expect(q.cmiBank!.voices[0]!.name).toBe('koper');           // de rest blijft
    expect(storeVoice(q, 9, { ...v, name: 'anders' }).cmiBank!.voices[9]!.name).toBe('anders');
    expect(clearVoice(q, 9).cmiBank!.voices[9]).toBeNull();
  });

  it('laden zet het profiel en de knoppen op de stem (Teensy-pokes erbij)', () => {
    const { p, patchId, owner } = fairlight();
    const bell = newBank().voices[6]!;
    const { project, pokes } = applyVoice(p, patchId, owner, bell);
    const patch = project.patches.find((x) => x.id === patchId)!;
    expect(patch.moduleData![owner]!.cmi).toBe(encodeProfile(preset('bell')));
    expect(patch.controlState[owner]!.release).toBe(bell.controls.release);
    expect(patch.controlState[owner]!.seg).toBe(bell.controls.seg);
    expect(pokes.some((x) => x.moduleId === owner && x.controlId === 'seg' && x.value === bell.controls.seg)).toBe(true);
    // een vreemde knop in een ingelezen bestand komt er niet in
    const odd = applyVoice(p, patchId, owner, { ...bell, controls: { ...bell.controls, level: 0 } });
    expect(odd.project.patches.find((x) => x.id === patchId)!.controlState[owner]!.level).not.toBe(0);
  });

  it('export → import: vervangen of lege plekken vullen', () => {
    const { p, patchId, owner } = fairlight();
    const mine = storeVoice(p, 12, voiceFromPatch(p, patchId, owner, 'twaalf')!);
    const file = exportBank(bankOf(mine));
    const back = parseBankFile(file)!;
    expect(back.voices[12]!.name).toBe('twaalf');
    expect(back.voices[12]!.cmi).toBe(bankOf(mine).voices[12]!.cmi);

    const fresh = standardProject();
    const rep = importBank(fresh, back, 'replace');
    expect(rep.project.cmiBank!.voices[12]!.name).toBe('twaalf');
    const fill = importBank(fresh, back, 'fill');
    // de startpunten staan er al en komen er niet dubbel in; alleen twaalf is nieuw
    expect(fill.project.cmiBank!.voices.filter(Boolean)).toHaveLength(8);
    expect(fill.project.cmiBank!.voices[7]!.name).toBe('twaalf');
    expect(fill.skipped).toBe(0);
  });

  it('een bestand dat geen CMI-bank is wordt geweigerd', () => {
    expect(parseBankFile('nee')).toBeNull();
    expect(parseBankFile(JSON.stringify({ voices: [] }))).toBeNull();
    const ok = parseBankFile(JSON.stringify({ format: 'musicbrain-cmibank', name: 'x', voices: [{ name: 'a', cmi: 'AAAA', controls: { seg: 'x', loop: 3 } }] }))!;
    expect(ok.voices[0]!.controls).toEqual({ loop: 3 });
    expect(ok.voices).toHaveLength(BANK_SIZE);
  });
});
