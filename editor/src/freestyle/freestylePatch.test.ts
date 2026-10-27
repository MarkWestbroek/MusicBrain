import { describe, expect, it } from 'vitest';

import { checkPatch } from '../modular-mb/patchCheck';
import { resolveControls } from '../modular-mb/types';
import { RIG_TYPES, buildFreestyleRig, stemChanges } from './freestylePatch';
import { ACID_HOP, ACID_HOP_2, DARK, STEMS, STYLES, TRAP, euclidHits, slideBassRate, styleIdFromSearch, tempoChanges, type Change } from './style';

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
    expect(STYLES.map((s) => s.id)).toEqual(['trap', 'boombap', 'bounce', 'acidhop', 'acidhop2', 'dark']);
    // De stijl uit de link; onbekend = de eerste.
    expect(styleIdFromSearch('?app=freestyle&style=acidhop2')).toBe('acidhop2');
    expect(styleIdFromSearch('?app=freestyle&style=nope')).toBe('trap');
    expect(styleIdFromSearch('')).toBe('trap');
    // Liedvorm: elke stijl heeft intro (als eerste), vers, hook en break; de acid hops ook een outro.
    for (const style of STYLES) {
      expect(style.sections[0]?.role, style.id).toBe('intro');
      for (const role of ['intro', 'verse', 'hook', 'break'] as const) expect(style.sections.filter((s) => s.role === role), `${style.id}/${role}`).toHaveLength(1);
      expect(style.sections.filter((s) => s.role === 'outro').length, style.id).toBe(style.id.startsWith('acidhop') || style.id === 'dark' ? 1 : 0);
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

  it('dark trap: glijdende 808 via een slide-rij, Synthex-riff, akkoord op de grondtoon van het pad', () => {
    const r = buildFreestyleRig(DARK);
    const seqLineOf = (changes: Change[]): number[] =>
      Array.from({ length: Number(changes.find((c) => c.module === 'motifSeq' && c.control === 'length')?.value ?? 0) - 1 },
        (_, i) => Number(changes.find((c) => c.module === 'motifSeq' && c.control === `s${i + 2}`)?.value));
    const from = (toKey: keyof typeof r.ids, port: string): string | undefined => {
      const c = r.patch.connections.find((x) => x.to.moduleId === r.ids[toKey] && x.to.portId === port);
      if (!c) return undefined;
      const k = (Object.keys(r.ids) as Array<keyof typeof r.ids>).find((key) => r.ids[key] === c.from.moduleId);
      return `${String(k)}.${c.from.portId}`;
    };
    // Bas als bij acid hop (Euclid → bassequencer → ACID), plus de slide-rij op x4
    // met reset per maat, haar CV aan de Slide-ingang.
    expect(from('bassGate', 'clock')).toBe('clock.x4');
    expect(from('bassSeq', 'clock')).toBe('bassGate.out_1');
    expect(from('bass', 'gate')).toBe('bassSeq.gate_out');
    expect(from('slideSeq', 'clock')).toBe('bassGate.out_2');
    expect(from('slideSeq', 'reset')).toBe('clock.bar');
    expect(from('slideGate', 'a')).toBe('slideSeq.cv');
    expect(from('bass', 'slide')).toBe('slideGate.gt');       // één blok ná de gate: aanslag op toon, dan de boog
    // Vuil (Marks luisterbeurt 2026-10-27): de 808 door DRIVE naar de mixer; de
    // SYNTHEX als riff (cel 1 uit de motiefsequencer op kanaal 1 van het
    // toetsen-Euclid) mono door DRIVE → FET COMP → STEREO PHASER, dan stereo
    // de KEYS-mixer in; de e-piano hangt nergens aan; de strijkers spelen het
    // hele akkoord op vier strips.
    expect(from('bassDrive', 'in')).toBe('bass.out');
    expect(r.patch.connections.filter((x) => x.from.moduleId === r.ids.bass && x.from.portId === 'out')).toHaveLength(1);
    expect(from('keysGate', 'clock')).toBe('clock.x4');
    expect(from('keysGate', 'reset')).toBe('clock.bar');
    expect(from('motifSeq', 'clock')).toBe('keysGate.out_1');
    expect(from('synth', 'voct_1')).toBe('motifSeq.cv');
    expect(from('synth', 'gate_1')).toBe('motifSeq.gate_out');
    expect(from('keysDrive', 'in')).toBe('synth.out_l');
    expect(from('keysComp', 'in_l')).toBe('keysDrive.out');
    expect(from('keysPhaser', 'in_l')).toBe('keysComp.out_l');
    expect(r.patch.connections.some((x) => x.from.moduleId === r.ids.piano || x.to.moduleId === r.ids.piano)).toBe(false);
    const phaserOuts = r.patch.connections.filter((x) => x.from.moduleId === r.ids.keysPhaser).map((x) => x.from.portId).sort();
    expect(phaserOuts).toEqual(['out_l', 'out_l', 'out_r', 'out_r']);  // droog (DRY) én zacht naar de galm (KEYS)
    const dry = r.project.modules.find((m) => m.name === 'DRY')!;
    expect(r.patch.connections.filter((x) => x.from.moduleId === r.ids.keysPhaser && x.to.moduleId === dry.id).map((x) => x.to.portId).sort()).toEqual(['in3', 'in4']);
    expect(r.patch.controlState[dry.id]?.vol3).toBe(0.8);
    for (const k of [1, 2, 3, 4]) {
      expect(from('pad', `voct_${k}`)).toBe(`chord.out${k}`);
      expect(from('pad', `gate_${k}`)).toBe('clock.div');
    }
    expect(from('pad', 'voct_5')).toBeUndefined();
    expect(r.patch.controlState[r.ids.motifSeq]?.root).toBe(54);
    // Bij de andere stijlen hangen synth en vuil nergens aan.
    for (const style of [TRAP, ACID_HOP_2]) {
      const o = buildFreestyleRig(style);
      for (const key of ['synth', 'bassDrive', 'keysDrive', 'keysComp', 'keysPhaser'] as const) {
        expect(o.patch.connections.some((x) => x.from.moduleId === o.ids[key] || x.to.moduleId === o.ids[key]), `${style.id}/${key}`).toBe(false);
      }
      expect(o.patch.connections.some((x) => x.from.moduleId === o.ids.bass && x.from.portId === 'out')).toBe(true);
    }
    expect(r.patch.controlState[r.ids.bassSeq]?.gate).toBe(0.95);
    // De gate korter dan een zestiende (107 ms op 140): rate 10,4 → 91 ms.
    expect(slideBassRate(140)).toBe(10.43);
    expect(r.patch.controlState[r.ids.bassSeq]?.rate).toBe(slideBassRate(140));
    expect(950 / slideBassRate(140)).toBeLessThan(15000 / 140);
    expect(950 / slideBassRate(200)).toBeLessThan(15000 / 200);
    // Een tempowissel neemt de rate mee; bij de andere stijlen alleen de klok.
    expect(tempoChanges(DARK, 150)).toEqual([{ module: 'clock', control: 'tempo', value: 150 }, { module: 'bassSeq', control: 'rate', value: slideBassRate(150) }]);
    expect(tempoChanges(TRAP, 150)).toEqual([{ module: 'clock', control: 'tempo', value: 150 }]);
    // CHORD volgt de padsequencer (F♯3), het pad op de Mellotron-strijkers (bank 3).
    expect(from('chord', 'voct')).toBe('padSeq.cv');
    expect(r.patch.controlState[r.ids.padSeq]?.root).toBe(54);
    expect(r.patch.simBanks).toEqual({ '3': 'gu-strings.mmbs' });
    // Acid hop II houdt CHORD los (C4).
    const ah2 = buildFreestyleRig(ACID_HOP_2);
    expect(ah2.patch.connections.some((x) => x.to.moduleId === ah2.ids.chord && x.to.portId === 'voct')).toBe(false);

    // Het slagraster is in elke sectie 3-van-4; de baslijn heeft twaalf noten
    // (plus de kopie op stap 1); de slide-rij is zestien stappen van 0 of 12.
    const grid = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
    const seq = (changes: Change[], module: 'bassSeq' | 'slideSeq'): number[] =>
      Array.from({ length: Number(changes.find((c) => c.module === module && c.control === 'length')?.value ?? 0) },
        (_, i) => Number(changes.find((c) => c.module === module && c.control === `s${i + 1}`)?.value));
    // De rij staat bij zestiende 0 al op stap 1 (reset vóór de eerste puls): s(k+2) = zestiende k, s1 = zestiende 15.
    const releases = (changes: Change[]): number[] => { const r = seq(changes, 'slideSeq'); return [...r.slice(1), r[0]!].flatMap((v, i) => (v === 0 ? [i] : [])); };
    // De B-maat: de standen van A met die van B eroverheen.
    const withB = (s: Section): Change[] => [...s.changes.filter((c) => !s.b!.some((b) => b.module === c.module && b.control === c.control)), ...s.b!];
    const gridB = [1, 4, 7, 9, 12, 15];                     // tresillo een zestiende achter de tel
    for (const s of DARK.sections) {
      expect(euclidHits(s.changes, 'bassGate', [1]), s.name).toEqual(grid);
      expect(euclidHits(s.changes, 'bassGate', [2]), s.name).toEqual(Array.from({ length: 16 }, (_, i) => i));
      expect(euclidHits(s.changes, 'bassGate', [3]), s.name).toEqual([]);
      const bass = seq(s.changes, 'bassSeq');
      expect(bass, s.name).toHaveLength(13);
      expect(bass[0], s.name).toBe(bass[1]);
      expect(seq(s.changes, 'slideSeq'), s.name).toHaveLength(16);
      // Elke nul in de slide-rij op een stille zestiende (3, 7, 11, 15), en
      // vlak vóór elke nieuwe aanslag (een andere noot na een stilte) een nul.
      for (const z of releases(s.changes)) expect(grid.includes(z), `${s.name}: los op ${z}`).toBe(false);
      if (!s.b) continue;
      // B: eigen raster (zes slagen, achter de tel) waar de bas meespeelt; de
      // rij laat los op 0 en 8 (stil) en op 15, zodat A op toon begint.
      const hitsB = euclidHits(withB(s), 'bassGate', [1]);
      if (s.stems.bass) {
        expect(hitsB, `${s.name} B`).toEqual(gridB);
        expect(seq(withB(s), 'bassSeq'), `${s.name} B`).toHaveLength(7);
        expect(releases(withB(s)), `${s.name} B`).toEqual([0, 8, 15]);
      }
      for (const z of releases(s.b).filter((z) => z !== 15)) expect(hitsB.includes(z), `${s.name} B: los op ${z}`).toBe(false);
    }
    const verse = DARK.sections[1]!, hook = DARK.sections[2]!, outro = DARK.sections[4]!;
    expect(seq(verse.changes, 'bassSeq').slice(1)).toEqual([3, 2, 0, 15, 15, 15, 15, 15, 15, 2, 1, 0]);
    expect(releases(verse.changes)).toEqual([3, 11, 15]);
    expect(seq(verse.b!, 'bassSeq').slice(1)).toEqual([3, 2, 0, 15, 15, -5]);
    expect(releases(hook.changes)).toEqual([3, 7, 15]);
    expect(seq(hook.b!, 'bassSeq').slice(1)).toEqual([2, 1, 0, -5, -5, -5]);
    expect(seq(outro.changes, 'bassSeq').slice(1)).toEqual(Array(12).fill(0));
    expect(releases(outro.changes)).toEqual([15]);
    // Elke B-knop bestaat ook in A.
    for (const s of DARK.sections) for (const ch of s.b ?? []) expect(s.changes.some((a) => a.module === ch.module && a.control === ch.control), `${s.name}: ${ch.module}.${ch.control}`).toBe(true);
    // Toetsen: de riff op het dubbele tresillo (0·3·6·8·11·14) in vers en hook,
    // schaars in intro en break (0·6·11), twee per maat in de outro; de
    // motiefsequencer heeft per slag een noot (plus de kopie op stap 1).
    const tresillo = [0, 3, 6, 8, 11, 14];
    expect(euclidHits(verse.changes, 'keysGate', [1])).toEqual(tresillo);
    expect(euclidHits(hook.changes, 'keysGate', [1])).toEqual(tresillo);
    expect(euclidHits(DARK.sections[0]!.changes, 'keysGate', [1])).toEqual([0, 6, 11]);
    expect(euclidHits(DARK.sections[3]!.changes, 'keysGate', [1])).toEqual([0, 6, 11]);
    expect(euclidHits(outro.changes, 'keysGate', [1])).toEqual([0, 8]);
    for (const s of DARK.sections) {
      expect(euclidHits(s.changes, 'keysGate', [2, 3]), s.name).toEqual([]);
      const n = euclidHits(s.changes, 'keysGate', [1]).length;
      expect(s.changes.find((c) => c.module === 'motifSeq' && c.control === 'length')?.value, s.name).toBe(n + 1);
    }
    expect(seqLineOf(verse.changes)).toEqual([0, 0, 3, 0, 5, 3]);
    expect(seqLineOf(hook.changes)).toEqual([7, 7, 8, 7, 3, 0]);
    // B dunner en achter de tel: vier stoten op 1·5·9·13 (intro/break twee op
    // 1·9), dalende lijnen; de outro heeft geen B.
    expect(euclidHits(withB(verse), 'keysGate', [1])).toEqual([1, 5, 9, 13]);
    expect(euclidHits(withB(hook), 'keysGate', [1])).toEqual([1, 5, 9, 13]);
    expect(euclidHits(withB(DARK.sections[0]!), 'keysGate', [1])).toEqual([1, 9]);
    expect(euclidHits(withB(DARK.sections[3]!), 'keysGate', [1])).toEqual([1, 9]);
    expect(seqLineOf(verse.b!)).toEqual([0, -2, -4, -5]);
    expect(seqLineOf(hook.b!)).toEqual([7, 5, 3, 0]);
    expect(outro.b).toBeUndefined();
    for (const s of DARK.sections) {
      if (!s.b) continue;
      const n = euclidHits(withB(s), 'keysGate', [1]).length;
      expect(s.b.find((c) => c.module === 'motifSeq' && c.control === 'length')?.value, `${s.name} B`).toBe(n + 1);
    }
    expect(DARK.sections[0]!.stems.bass).toBe(false);
    expect(DARK.sections[3]!.stems.bass).toBe(false);
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
