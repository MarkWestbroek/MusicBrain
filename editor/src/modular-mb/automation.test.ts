import { describe, expect, it } from 'vitest';

import {
  AutomationRecorder, automationCc, buildAutomationFile, keyOf, listenAutomation, movedLabels, parseAutomation, resolveTarget,
  type AutomationEvent, type AutomationSink,
} from './automation';
import { catalogMenu } from './patchCatalog';
import { seedInternals } from './seedModules';
import { setPatchControl } from './setPatchControl';
import { MidiFileSource, parseSmf } from './sim/midiFilePlayer';
import { encodeSmf } from './sim/midiRecorder';
import { addPatchSnapshot } from './sim/takeLibrary';
import { getProject, setProject } from './store';
import { emptyModularProject, resolveControls, type ModularProject, type Patch } from './types';

/** Een patch uit de basisset en een knop (knob) op een van zijn modules. */
function fixture(): { project: ModularProject; patch: Patch; moduleId: string; controlId: string } {
  const base = seedInternals(emptyModularProject());
  for (const e of catalogMenu('basisset')) {
    const project = e.build(base);
    const patch = project.patches.find((x) => x.id === project.activePatchId)!;
    for (const rid of patch.rackIds) for (const s of project.racks.find((r) => r.id === rid)?.slots ?? []) {
      const m = project.modules.find((x) => x.id === s.moduleId);
      const c = m ? resolveControls(m, project.moduleTypes).find((x) => x.kind === 'knob') : undefined;
      if (m && c) return { project, patch, moduleId: m.id, controlId: c.id };
    }
  }
  throw new Error('geen patch met een knop');
}

const write = (patchId: string, moduleId: string, controlId: string, value: number, prev?: number) =>
  ({ patchId, moduleId, controlId, value, prev, twins: false });

describe('AutomationRecorder', () => {
  it('beginstand op t = 0, hoogstens één waarde per 10 ms, laatste waarde wint', () => {
    const rec = new AutomationRecorder();
    rec.start('p', { now: 1000 });
    rec.record(write('p', 'm', 'cut', 0.5, 0.2), 1100);
    rec.record(write('p', 'm', 'cut', 0.6), 1104);   // binnen 10 ms: vervangt
    rec.record(write('p', 'm', 'cut', 0.7), 1112);
    rec.record(write('p', 'm', 'cut', 0.7), 1130);   // zelfde waarde: niets
    rec.record(write('q', 'm', 'cut', 0.9), 1140);   // andere patch: niets
    expect(rec.stop().map((e) => [e.t, e.value])).toEqual([[0, 0.2], [100, 0.6], [112, 0.7]]);
  });

  it('nooit gezette knop: de default als beginstand', () => {
    const rec = new AutomationRecorder();
    rec.start('p', { now: 0, defaultOf: () => 0.25 });
    rec.record(write('p', 'm', 'cut', 0.5), 50);
    expect(rec.stop().map((e) => [e.t, e.value])).toEqual([[0, 0.25], [50, 0.5]]);
  });

  it('hoort setPatchControl', () => {
    const { project, patch, moduleId, controlId } = fixture();
    setProject(project);
    const rec = new AutomationRecorder();
    rec.start(patch.id, { now: performance.now() });
    const off = listenAutomation(rec);
    setPatchControl(patch.id, moduleId, controlId, 0.123);
    off();
    setPatchControl(patch.id, moduleId, controlId, 0.456);   // na afhaken: niet meer
    const ev = rec.stop();
    expect(ev.at(-1)).toMatchObject({ moduleId, controlId, value: 0.123 });
    expect(getProject().patches.find((x) => x.id === patch.id)!.controlState[moduleId]![controlId]).toBe(0.456);
  });
});

describe('automation-bestand', () => {
  it('vindt de knop terug op een kopie van de patch met nieuwe id\'s', () => {
    const { project, patch, moduleId, controlId } = fixture();
    const file = buildAutomationFile(project, patch, [{ t: 5, moduleId, controlId, value: 0.4 }], 1000);
    expect(file.controls[keyOf(moduleId, controlId)]).toMatchObject({ typeId: project.modules.find((m) => m.id === moduleId)!.typeId });
    expect(movedLabels(file)).toHaveLength(1);
    let n = 0;
    const copy = addPatchSnapshot(project, project, 'Take', (p) => `${p}-new${++n}`);
    const newPatch = copy.patches.find((x) => x.id === copy.activePatchId)!;
    const target = resolveTarget(file, copy, newPatch, moduleId);
    expect(target).not.toBeNull();
    expect(target).not.toBe(moduleId);
    expect(copy.modules.find((m) => m.id === target)!.typeId).toBe(project.modules.find((m) => m.id === moduleId)!.typeId);
    expect(resolveTarget(file, project, patch, moduleId)).toBe(moduleId);
  });

  it('gebonden knop als CC in de .mid, op het kanaal van de binding', () => {
    const { project, patch, moduleId, controlId } = fixture();
    const file = buildAutomationFile(project, patch, [
      { t: 0, moduleId, controlId, value: 0 }, { t: 20, moduleId, controlId, value: 1 }, { t: 40, moduleId, controlId, value: 1 },
    ], 100);
    const cc = automationCc(file, [{ ch: 3, cc: 74, mod: moduleId, ctrl: controlId, min: 0, max: 1 }]);
    expect(cc.events).toEqual([{ t: 0, status: 0xB2, d1: 74, d2: 0 }, { t: 20, status: 0xB2, d1: 74, d2: 127 }]);
    expect(cc.lanes).toEqual([{ ch: 3, cc: 74 }]);
    expect(automationCc(file, []).events).toEqual([]);
  });
});

describe('afspelen in de MIDI-speler', () => {
  /** Een sink die opschrijft wat hij krijgt, op de klok van de test. */
  function spy(clock: () => number): AutomationSink & { got: [number, string, number | boolean][]; restores: number } {
    const s = {
      got: [] as [number, string, number | boolean][], restores: 0,
      apply(e: AutomationEvent) { s.got.push([clock(), keyOf(e.moduleId, e.controlId), e.value]); },
      restore() { s.restores++; },
    };
    return s;
  }

  it('opnemen en terugspelen: dezelfde waarden op dezelfde tijden', () => {
    const { project, patch, moduleId, controlId } = fixture();
    // Opnemen: een draai van 0 naar 1 in 400 ms, elke 3 ms een muisstap.
    const rec = new AutomationRecorder();
    rec.start(patch.id, { now: 0 });
    for (let t = 100; t <= 500; t += 3) rec.record(write(patch.id, moduleId, controlId, (t - 100) / 400, 0.5), t);
    const file = parseAutomation(JSON.stringify(buildAutomationFile(project, patch, rec.stop(), 1000)));
    const expected = file.events.map((e) => [Math.round(e.t), keyOf(e.moduleId, e.controlId), e.value]);

    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    src.setLoop(false);
    src.load(parseSmf(encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 900, status: 0x80, d1: 60, d2: 0 }], { lengthMs: 1000 })), 't.mid');
    const sink = spy(() => now);
    src.setAutomation({ events: file.events, sink });
    src.start();
    for (now = 0; now <= 1000; now++) src.pump();
    expect(sink.got.map(([t, k, v]) => [Math.round(t), k, v])).toEqual(expected);
    expect(sink.restores).toBeGreaterThan(0);   // aan het eind: terug op de patchwaarde
  });

  it('springen geeft de stand van dat moment; de CC-kopie van een gebonden knop speelt niet dubbel', () => {
    let now = 0;
    const src = new MidiFileSource(() => now, 1_000_000);
    const midi: number[][] = [];
    src.subscribe((e) => { if (e.kind === 'cc') midi.push([e.controller, e.value]); });
    src.load(parseSmf(encodeSmf([
      { t: 0, status: 0x90, d1: 60, d2: 100 }, { t: 100, status: 0xB0, d1: 74, d2: 64 }, { t: 150, status: 0xB0, d1: 1, d2: 10 },
      { t: 900, status: 0x80, d1: 60, d2: 0 },
    ], { lengthMs: 1000 })), 't.mid');
    const sink = spy(() => now);
    src.setAutomation({
      events: [{ t: 0, moduleId: 'm', controlId: 'c', value: 0 }, { t: 100, moduleId: 'm', controlId: 'c', value: 0.5 }, { t: 300, moduleId: 'm', controlId: 'c', value: 1 }],
      cc: [{ ch: 1, cc: 74 }], sink,
    });
    src.seek(200);
    src.start();
    expect(sink.got[0]).toEqual([0, 'm/c', 0.5]);
    for (now = 0; now <= 200; now++) src.pump();
    expect(sink.got.at(-1)).toEqual([100, 'm/c', 1]);
    src.seek(150); src.pump();
    // CC 74 nooit (die beweging komt uit de automation), CC 1 wel, ook bij het nazenden.
    expect(midi.length).toBeGreaterThan(0);
    expect(midi.every(([c]) => c === 1)).toBe(true);
    src.stop();
    expect(sink.restores).toBeGreaterThan(0);
  });

  it('een nieuw bestand haalt de automation weg', () => {
    const src = new MidiFileSource(() => 0, 1_000_000);
    const f = parseSmf(encodeSmf([{ t: 0, status: 0x90, d1: 60, d2: 100 }], { lengthMs: 100 }));
    src.load(f, 'a.mid');
    src.setAutomation({ events: [{ t: 0, moduleId: 'm', controlId: 'c', value: 1 }], sink: { apply() {}, restore() {} } });
    expect(src.automationCount()).toBe(1);
    src.load(f, 'a.mid', null, true);
    expect(src.automationCount()).toBe(1);
    src.load(f, 'b.mid');
    expect(src.automationCount()).toBe(0);
  });
});
