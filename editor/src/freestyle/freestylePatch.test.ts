import { describe, expect, it } from 'vitest';

import { checkPatch } from '../modular-mb/patchCheck';
import { resolveControls } from '../modular-mb/types';
import { RIG_TYPES, buildFreestyleRig, stemChanges } from './freestylePatch';
import { ACID_HOP, ACID_HOP_2, STEMS, STYLES, TRAP, euclidHits, type Change } from './style';

describe('freestyle-patch', () => {
  const rig = buildFreestyleRig(TRAP);

  it('bouwt elke stijl en doorstaat de patchcontrole', () => {
    for (const style of STYLES) {
      const r = buildFreestyleRig(style);
      const f = checkPatch(r.patch, r.project).filter((x) => x.kind !== 'signal-mismatch');
      expect(f.map((x) => `${x.kind}: ${x.message}`), style.id).toEqual([]);
      expect(r.project.activePatchId).toBe(r.patch.id);
      expect(r.patch.tempo).toBe(style.bpm);
      expect(r.patch.controlState[r.ids.clock]?.swing).toBe(style.swing);
      // Grids hangt aan de klokuitgang van de stijl (x2 = half-time).
      const cable = r.patch.connections.find((c) => c.to.moduleId === r.ids.grids && c.to.portId === 'clock');
      expect(cable?.from.portId, style.id).toBe(style.gridsClock);
      // De klank van de stijl staat in de patch.
      for (const ch of style.sound) expect(r.patch.controlState[r.ids[ch.module]]?.[ch.control], `${style.id}: ${ch.module}.${ch.control}`).toBe(ch.value);
    }
    expect(STYLES.map((s) => s.id)).toEqual(['trap', 'boombap', 'bounce', 'acidhop', 'acidhop2']);
    // Liedvorm: elke stijl heeft intro (als eerste), vers, hook en break; de acid hops ook een outro.
    for (const style of STYLES) {
      expect(style.sections[0]?.role, style.id).toBe('intro');
      for (const role of ['intro', 'verse', 'hook', 'break'] as const) expect(style.sections.filter((s) => s.role === role), `${style.id}/${role}`).toHaveLength(1);
      expect(style.sections.filter((s) => s.role === 'outro').length, style.id).toBe(style.id.startsWith('acidhop') ? 1 : 0);
    }
  });

  it('acid hop II: akkoorden op stem 1–4, lijn op stem 5, sustain en padgate op Div, pad op gu-flute', () => {
    const r = buildFreestyleRig(ACID_HOP_2);
    const from = (toKey: keyof typeof r.ids, port: string): string[] => r.patch.connections
      .filter((x) => x.to.moduleId === r.ids[toKey] && x.to.portId === port)
      .map((c) => `${String((Object.keys(r.ids) as Array<keyof typeof r.ids>).find((k) => r.ids[k] === c.from.moduleId))}.${c.from.portId}`);
    for (const k of [1, 2, 3, 4]) {
      expect(from('piano', `voct_${k}`), `voct_${k}`).toEqual([`chord.out${k}`]);
      expect(from('piano', `gate_${k}`), `gate_${k}`).toEqual(['keysGate.out_1']);
    }
    expect(from('piano', 'voct_5')).toEqual(['motifSeq.cv']);
    expect(from('piano', 'gate_5')).toEqual(['motifSeq.gate_out']);
    expect(from('piano', 'sustain')).toEqual(['clock.div']);
    expect(from('motifSeq', 'clock')).toEqual(['keysGate.out_2']);
    expect(from('keysGate', 'clock')).toEqual(['clock.x4']);
    expect(from('keysGate', 'reset')).toEqual(['clock.bar']);
    expect(from('pad', 'gate_1')).toEqual(['clock.div']);
    expect(from('pad', 'voct_1')).toEqual(['padSeq.cv']);
    expect(from('padSeq', 'clock')).toEqual(['clock.bar']);
    // De e-piano gaat niet meer rechtstreeks de galm in, maar via de KEYS-mixer.
    expect(from('reverb', 'in_l')).toEqual(['undefined.out_l']);
    expect(r.patch.simBanks).toEqual({ '7': 'gu-flute.mmbs' });
    expect(r.patch.controlState[r.ids.pad]?.bank).toBe(7);
    expect(r.patch.controlState[r.ids.clock]).toMatchObject({ div: 16, width: 0.9 });
    // V1 heeft hier niets van: motief op de accenten, e-piano direct de galm in.
    const v1 = buildFreestyleRig(ACID_HOP);
    expect(v1.patch.connections.some((c) => c.to.moduleId === v1.ids.piano && c.to.portId === 'voct_5')).toBe(false);
    expect(v1.patch.connections.some((c) => c.from.moduleId === v1.ids.piano && c.to.moduleId === v1.ids.reverb)).toBe(true);
    expect(v1.patch.simBanks).toBeUndefined();
  });

  it('acid hop II: slagpatronen van bas en toetsen per sectie', () => {
    const bass: Record<string, number[]> = { INTRO: [0, 3, 6, 9, 12, 14], VERSE: [0, 3, 6, 9, 12, 14], HOOK: [0, 3, 6, 9, 12, 14], BREAK: [0, 6, 12, 14], OUTRO: [0] };
    const chord: Record<string, number[]> = { INTRO: [0], VERSE: [0], HOOK: [], BREAK: [0], OUTRO: [0] };
    const line: Record<string, number[]> = { INTRO: [], VERSE: [6, 14], HOOK: [0, 2, 4, 6, 8, 10, 12, 14], BREAK: [14], OUTRO: [] };
    const v = (s: { changes: Change[] }, module: string, control: string): unknown => s.changes.find((c) => c.module === module && c.control === control)?.value;
    for (const s of ACID_HOP_2.sections) {
      expect(euclidHits(s.changes), `${s.name} bas`).toEqual(bass[s.name]);
      expect(euclidHits(s.changes, 'keysGate', [1]), `${s.name} akkoord`).toEqual(chord[s.name]);
      const hits = euclidHits(s.changes, 'keysGate', [2]);
      expect(hits, `${s.name} lijn`).toEqual(line[s.name]);
      // Lijn en bas: stap 0 kopie van de eerste noot, lengte = slagen + 1.
      if (hits.length) expect(v(s, 'motifSeq', 'length'), s.name).toBe(hits.length + 1);
      expect(v(s, 'motifSeq', 's1'), s.name).toBe(v(s, 'motifSeq', 's2'));
      expect(v(s, 'bassSeq', 'length'), s.name).toBe(euclidHits(s.changes).length + 1);
    }
    // Vraag en antwoord: verse en hook hebben een B-maat; elke B-knop heeft een A-waarde.
    for (const style of STYLES) {
      for (const s of style.sections) {
        for (const ch of s.b ?? []) expect(s.changes.some((c) => c.module === ch.module && c.control === ch.control), `${style.id}/${s.name}: B zonder A voor ${ch.module}.${ch.control}`).toBe(true);
      }
    }
    const chordOf = (f: Change[]): unknown => f.find((c) => c.module === 'chord' && c.control === 'chord')?.value;
    const verseB = ACID_HOP_2.sections[1]!.b!;
    expect(euclidHits(verseB)).toEqual([0, 3, 6, 9, 12]);
    expect([2, 3, 4, 5, 6].map((i) => verseB.find((c) => c.module === 'bassSeq' && c.control === `s${i}`)?.value)).toEqual([0, 3, 0, 3, 0]);
    expect(chordOf(verseB)).toBe(9);                                    // B: de kwint C+G, zoals Marks maat 2 en 4
    const hookB = ACID_HOP_2.sections[2]!.b!;
    expect(euclidHits(hookB)).toEqual([0, 3, 6, 9, 12]);
    expect([2, 3, 4, 5, 6].map((i) => hookB.find((c) => c.module === 'bassSeq' && c.control === `s${i}`)?.value)).toEqual([-5, 0, -5, -4, -5]);
    expect(euclidHits(hookB, 'keysGate', [2])).toEqual([0]);            // B: de landing, één lange C4
    expect(hookB.find((c) => c.module === 'motifSeq' && c.control === 's2')?.value).toBe(-12);
    expect(chordOf(ACID_HOP_2.sections[0]!.b!)).toBe(9);
    expect(chordOf(ACID_HOP_2.sections[3]!.b!)).toBe(1);                // break: A kwint, B het Cm-akkoord
    // De hook: het neergebroken akkoord A♭5 G5 E♭5 D5 C5 G4 E♭4 D4 (t.o.v. C5).
    const hook = ACID_HOP_2.sections[2]!;
    expect([2, 3, 4, 5, 6, 7, 8, 9].map((i) => v(hook, 'motifSeq', `s${i}`))).toEqual([8, 7, 3, 2, 0, -5, -9, -10]);
    // De break: het pad speelt de lage slotmelodie, één noot per maat.
    const brk = ACID_HOP_2.sections[3]!;
    expect([1, 2, 3, 4].map((i) => v(brk, 'padSeq', `s${i}`))).toEqual([-9, -4, -5, -12]);
    expect(v(brk, 'chord', 'chord')).toBe(9);
  });

  it('bekabelt de bas per kick, of uit Euclid op de zestienden', () => {
    const cable = (r: ReturnType<typeof buildFreestyleRig>, toKey: keyof typeof r.ids, port: string): string | undefined => {
      const c = r.patch.connections.find((x) => x.to.moduleId === r.ids[toKey] && x.to.portId === port);
      if (!c) return undefined;
      const fromKey = (Object.keys(r.ids) as Array<keyof typeof r.ids>).find((k) => r.ids[k] === c.from.moduleId);
      return `${String(fromKey)}.${c.from.portId}`;
    };
    expect(cable(rig, 'bass', 'gate')).toBe('grids.bd');
    expect(cable(rig, 'bassSeq', 'clock')).toBe('grids.bd');
    expect(cable(rig, 'bassGate', 'clock')).toBeUndefined();
    const ah = buildFreestyleRig(ACID_HOP);
    expect(cable(ah, 'bassGate', 'clock')).toBe('clock.x4');
    expect(cable(ah, 'bassGate', 'reset')).toBe('clock.bar');
    expect(cable(ah, 'bassSeq', 'clock')).toBe('bassGate.any');
    expect(cable(ah, 'bassSeq', 'reset')).toBe('clock.bar');
    expect(cable(ah, 'bass', 'gate')).toBe('bassSeq.gate_out');
    expect(ah.patch.controlState[ah.ids.bassSeq]?.gate).toBe(0.95);
    expect(ah.patch.controlState[ah.ids.bassGate]?.extclock).toBe(1);
  });

  it('acid hop: de slagpatronen van Euclid passen op de baslijnen (Marks figuur 3-3-3-3-2-2)', () => {
    const expected: Record<string, number[]> = {
      INTRO: [0, 3, 6], VERSE: [0, 3, 6, 9, 12, 14], HOOK: [0, 3, 6, 9, 12, 14], BREAK: [0, 3, 6, 9, 12, 14], OUTRO: [0],
    };
    // De B-maat (vraag en antwoord): landen op de G, of C E♭ C en rust.
    const expectedB: Record<string, number[] | undefined> = { INTRO: undefined, VERSE: [0, 3, 6, 9, 12], HOOK: [0, 3, 6, 9, 12], BREAK: [0, 3, 6] };
    for (const s of ACID_HOP.sections) {
      const hits = euclidHits(s.changes);
      expect(hits, s.name).toEqual(expected[s.name]);
      expect(s.b ? euclidHits(s.b) : undefined, `${s.name} B`).toEqual(expectedB[s.name]);
      if (s.b) expect(s.b.find((c) => c.module === 'bassSeq' && c.control === 'length')?.value, `${s.name} B`).toBe(euclidHits(s.b).length + 1);
      // De sequencer: stap 0 is de kopie van de eerste noot, daarna één stap per slag.
      const length = s.changes.find((c) => c.module === 'bassSeq' && c.control === 'length')?.value;
      expect(length, s.name).toBe(hits.length + 1);
      const s1 = s.changes.find((c) => c.module === 'bassSeq' && c.control === 's1')?.value;
      const s2 = s.changes.find((c) => c.module === 'bassSeq' && c.control === 's2')?.value;
      expect(s1, s.name).toBe(s2);
    }
    // De andere stijlen zetten Euclid niet aan.
    for (const style of STYLES.filter((s) => s.bass === 'kick')) {
      for (const s of style.sections) expect(s.changes.some((c) => c.module === 'bassGate'), `${style.id}/${s.name}`).toBe(false);
    }
  });

  it('heeft voor elke logische module een echte module van het juiste type', () => {
    for (const [key, id] of Object.entries(rig.ids)) {
      const m = rig.project.modules.find((x) => x.id === id);
      expect(m?.typeId, key).toBe(RIG_TYPES[key as keyof typeof RIG_TYPES]);
    }
  });

  it('kan elke sectie- en stemwijziging van elke stijl op een bestaande knop zetten', () => {
    const okay = (ch: Change): boolean => {
      const m = rig.project.modules.find((x) => x.id === rig.ids[ch.module])!;
      const c = resolveControls(m, rig.project.moduleTypes).find((x) => x.id === ch.control);
      if (!c) return false;
      if (typeof ch.value === 'number' && c.min !== undefined && c.max !== undefined) return ch.value >= c.min && ch.value <= c.max;
      return true;
    };
    for (const style of STYLES) {
      expect(style.sections.length).toBeGreaterThanOrEqual(2);
      for (const s of style.sections) {
        for (const ch of s.changes) expect(okay(ch), `${style.id}/${s.name}: ${ch.module}.${ch.control}=${ch.value}`).toBe(true);
        for (const ch of stemChanges(s.stems)) expect(okay(ch), `${style.id}/${s.name}: ${ch.module}.${ch.control}`).toBe(true);
      }
      for (const ch of style.fill) expect(okay(ch), `${style.id}/fill: ${ch.module}.${ch.control}`).toBe(true);
      for (const ch of style.sound) expect(okay(ch), `${style.id}/sound: ${ch.module}.${ch.control}`).toBe(true);
    }
  });

  it('begint met de eerste sectie: intro zonder snare, de rest aan', () => {
    const level = (key: keyof typeof rig.ids): unknown => rig.patch.controlState[rig.ids[key]]?.level;
    expect(level('snare')).toBe(0);
    expect(level('kick')).toBeGreaterThan(0);
    expect(level('bass')).toBeGreaterThan(0);
    expect(level('hat')).toBeGreaterThan(0);
    expect(level('piano')).toBeGreaterThan(0);
    // De klok staat uit tot de pagina hem op het startmoment aanzet.
    expect(rig.patch.controlState[rig.ids.clock]?.run).toBe(0);
  });

  it('muten zet precies de Level-knoppen van die stem op nul', () => {
    const off = stemChanges({ kick: false, snare: true, hats: true, bass: false, motif: true });
    expect(off.filter((c) => c.value === 0).map((c) => c.module).sort()).toEqual(['bass', 'kick']);
    expect(stemChanges({ kick: true, snare: true, hats: true, bass: false, motif: true }).filter((c) => c.value === 0).map((c) => c.module)).toEqual(['bass']);
    expect(STEMS).toEqual(['kick', 'snare', 'hats', 'bass', 'motif']);
  });
});
