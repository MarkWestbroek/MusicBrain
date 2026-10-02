// Contract-test: editor-ModuleTypes en seed-patches vs het firmware-contract.
//
// Het contract (firmware/app-modular-brain/contract/module-types.json) wordt
// gegenereerd uit de firmware-broncode met `python tools/contract_dump.py` —
// de firmware is leidend. Deze test vangt de twee zwakke naden:
//   1. paneel-poorten/controls die de firmware niet kent (kabel/knop doet stil
//      niets op de Teensy);
//   2. seed-kabels naar jacks die niet op het paneel bestaan (onzichtbare
//      verbinding — de out_l-bug van 5 juli).
// Firmware-capabilities zónder paneel-jack zijn geen fout (alleen onbereikbaar
// goud); die rapporteert de laatste test informatief via console.warn.
//
// Draaien: `npm test` in editor/.

import { DRIVE_SOLO_FX, ENSEMBLE_SOLO_FX, TUBE_SOLO_FX, FOLDER_SOLO_FX, FREQSHIFT_SOLO_FX, WAH_SOLO_FX, seedAcidJamPatch, seedComplexVoicePatch, seedEPianoPolyPatch, seedOrganPolyPatch, seedRunglerPatch, seedRhythmBoxPatch, seedSemSweepPatch, seedSynthexPolyPatch, seedWestCoastPatch } from './seedShowcase';
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emptyModularProject } from './types';
import type { ModularProject, ModuleType } from './types';
import {
  seedCloudsAmbientPatch,
  seedCvBridgePatch,
  seedInternals,
  seedMaterialBridgeDemo,
  seedReservoirDemo,
  seedTapeStripPolyPatch,
  seedPolyVoicePatch,
  seedSamplerPolyPatch,
  seedSoloVoicePatch,
  FET_SOLO_FX,
  OPTO_SOLO_FX,
  BUS_SOLO_FX,
  VARIMU_SOLO_FX,
  EQ_SOLO_FX,
  DIODE_SOLO_FX,
  CONSOLE_EQ_SOLO_FX,
  PARA_EQ_SOLO_FX,
  SAMPLER_MASTER_FX,
  seedTestPatch,
  seedVocoderChoirPatch,
  seedWarpsVocoderPatch,
  seedZangPatch,
} from './seedModules';

// ── Contract laden ────────────────────────────────────────────────────────

interface FwModule {
  typeId: string;
  source: string;
  ports: string[];
  controls: string[];
  controlsIgnored?: string[];
}
interface Contract {
  firmwareVersion: string;
  modules: Record<string, FwModule>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.resolve(
  here, '../../../firmware/app-modular-brain/contract/module-types.json');
const contract: Contract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));

/** Firmware accepteert `id` (letterlijk, of via de naam↔naam_cv-conventie). */
function fwAcceptsPort(fw: FwModule, id: string): boolean {
  const set = new Set(fw.ports);
  if (set.has(id)) return true;
  return id.endsWith('_cv') ? set.has(id.slice(0, -3)) : set.has(id + '_cv');
}

// Bekende, bewust openstaande gaten (paneel belooft iets dat de firmware nog
// niet levert). Nieuw gat? Eerst fixen; alleen met reden hier toevoegen.
const KNOWN_PORT_GAPS: Record<string, string[]> = {
  tp_mmb_ahdsr: ['eoc'],   // end-of-cycle-uitgang nog niet in core Ahdsr
};

// ── Projectopbouw: alle interne types + alle seed-patches ─────────────────

function allSeededProject(): ModularProject {
  let p = seedInternals(emptyModularProject());
  p = seedTestPatch(p);
  p = seedCvBridgePatch(p);
  p = seedPolyVoicePatch(p, 4, { filterType: 'ladder', perVoiceLfo: true });
  p = seedPolyVoicePatch(p, 2, { voiceSource: 'stk', filterType: 'ms20', perVoiceFx: 'comb' });
  p = seedSoloVoicePatch(p, 'tp_mmb_plaits', 'Plaits', 'out', 'aux', {});
  p = seedCloudsAmbientPatch(p);
  p = seedSamplerPolyPatch(p, 8, true, true);
  p = seedSoloVoicePatch(p, 'tp_mmb_dx7', 'DX7', 'out', 'out', {}, FET_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_rings', 'Rings', 'out_l', 'out_r', {}, OPTO_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_plaits', 'Plaits', 'out', 'aux', {}, BUS_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_elements', 'Elements', 'out_l', 'out_r', {}, VARIMU_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_stk_sound', 'STK', 'out', 'out', {}, EQ_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_material_bridge', 'Material Bridge', 'out_l', 'out_r', {});
  p = seedSoloVoicePatch(p, 'tp_mmb_scanned', 'Scanned', 'out', 'out', {});
  p = seedSoloVoicePatch(p, 'tp_mmb_gendyn', 'GENDYN', 'out', 'out', {});
  p = seedSoloVoicePatch(p, 'tp_mmb_excitable', 'Excitable', 'out_l', 'out_r', {});
  p = seedSoloVoicePatch(p, 'tp_mmb_fof', 'FOF Stem', 'out', 'out', { vowel: 0, tone: 0.5, breath: 0.08, vibrato: 0.12, level: 0.8, voice: 0.35 });
  p = seedSoloVoicePatch(p, 'tp_mmb_dx7', 'DX7', 'out', 'out', {}, DIODE_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_rings', 'Rings', 'out_l', 'out_r', {}, CONSOLE_EQ_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_plaits', 'Plaits', 'out', 'aux', {}, PARA_EQ_SOLO_FX);
  p = seedSamplerPolyPatch(p, 8, false, SAMPLER_MASTER_FX);
  p = seedWarpsVocoderPatch(p);
  p = seedVocoderChoirPatch(p, 'plaits');
  p = seedVocoderChoirPatch(p, 'mic');
  p = seedVocoderChoirPatch(p, 'zang');
  p = seedZangPatch(p);
  p = seedMaterialBridgeDemo(p);
  p = seedReservoirDemo(p);
  p = seedTapeStripPolyPatch(p, 8);
  // Modulatorpakket en klassiekers (2026-10-02).
  p = seedAcidJamPatch(p);
  p = seedWestCoastPatch(p);
  p = seedOrganPolyPatch(p);
  p = seedSoloVoicePatch(p, 'tp_mmb_acid', 'ACID', 'out', 'out', {});
  p = seedRunglerPatch(p);
  p = seedSoloVoicePatch(p, 'tp_mmb_stk_sound', 'STK', 'out', 'out', {}, FOLDER_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_string', 'String', 'out', 'out', {}, DRIVE_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_string', 'String', 'out', 'out', {}, TUBE_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_rings', 'Rings', 'out_l', 'out_r', {}, FREQSHIFT_SOLO_FX);
  p = seedComplexVoicePatch(p);
  p = seedSemSweepPatch(p);
  p = seedEPianoPolyPatch(p);
  p = seedRhythmBoxPatch(p);
  p = seedSynthexPolyPatch(p);
  p = seedSoloVoicePatch(p, 'tp_mmb_stk_sound', 'STK', 'out', 'out', {}, ENSEMBLE_SOLO_FX);
  p = seedSoloVoicePatch(p, 'tp_mmb_string', 'String', 'out', 'out', {}, WAH_SOLO_FX);
  return p;
}

const project = allSeededProject();
it('Tape strip ×8 is een PolyGroup over de cellen met aftertouch op Press en bend op Bend', () => {
  const patch = project.patches.find((item) => item.name === 'Tape strip ×8')!;
  expect(patch.connections.map((connection) => [connection.from.portId, connection.to.portId])).toEqual([
    ['pitch', 'voct_1'], ['gate', 'gate_1'], ['vel', 'vel_1'], ['press', 'press'], ['cv_bend', 'bend'], ['out_l', 'l'], ['out_r', 'r'],
  ]);
  const rack = project.racks.find((item) => item.id === patch.rackIds[0])!;
  expect(rack.polyGroups?.[0]?.members).toHaveLength(8);
  expect(rack.polyGroups?.[0]?.members.every((member) => member.kind === 'cell' && member.cellGroupId === 'voice')).toBe(true);
});

it('Reservoir demo stuurt beide envelopes door het reservoir, met alleen Drain als A/B-verschil', () => {
  const demo = seedReservoirDemo(emptyModularProject());
  const [shared, independent] = demo.patches.slice(-2);
  expect(shared!.rackIds).toEqual(independent!.rackIds);
  expect(shared!.connections.map(({ from, to }) => ({ from, to })))
    .toEqual(independent!.connections.map(({ from, to }) => ({ from, to })));
  const reservoirId = shared!.connections.find((connection) => connection.to.portId === 'in_a')!.to.moduleId;
  expect(shared!.controlState[reservoirId]!.drain).toBe(0.8);
  expect(independent!.controlState).toEqual({
    ...shared!.controlState, [reservoirId]: { ...shared!.controlState[reservoirId], drain: 0 },
  });
  // Beide envelopes gaan het reservoir in en de geschaalde uitgang gaat naar de VCA-CV.
  const into = shared!.connections.filter((connection) => connection.to.moduleId === reservoirId).map((connection) => connection.to.portId).sort();
  expect(into).toEqual(['in_a', 'in_b']);
  const outOf = shared!.connections.filter((connection) => connection.from.moduleId === reservoirId);
  expect(outOf.map((connection) => connection.from.portId).sort()).toEqual(['out_a', 'out_b']);
  for (const connection of outOf) {
    expect(connection.to.portId).toBe('cv');
    expect(demo.modules.find((module) => module.id === connection.to.moduleId)!.typeId).toBe('tp_mmb_vca');
  }
});

it('Material Bridge demo deelt twee ritmes en velocity, met alleen Memory en Fatigue als A/B-verschil', () => {
  const demo = seedMaterialBridgeDemo(emptyModularProject());
  const [off, bridgeOnly, full] = demo.patches.slice(-3);
  for (const patch of [bridgeOnly, full]) {
    expect(patch!.rackIds).toEqual(off!.rackIds);
    expect(patch!.connections.map(({ from, to }) => ({ from, to })))
      .toEqual(off!.connections.map(({ from, to }) => ({ from, to })));
  }
  const materialId = off!.connections.find((connection) => connection.to.portId === 'gate')!.to.moduleId;
  expect(off!.controlState[materialId]).toMatchObject({ memory: 0, fatigue: 0 });
  expect(bridgeOnly!.controlState).toEqual({
    ...off!.controlState, [materialId]: { ...off!.controlState[materialId], memory: 0.85, fatigue: 0 },
  });
  expect(full!.controlState).toEqual({
    ...off!.controlState, [materialId]: { ...off!.controlState[materialId], memory: 0.85, fatigue: 0.85 },
  });
  expect(off!.connections.filter((connection) => connection.to.moduleId === materialId)
    .map((connection) => connection.to.portId).sort()).toEqual(['gate', 'gate_b', 'vel']);
  const clocks = demo.modules.filter((module) => off!.controlState[module.id]?.rate !== undefined);
  expect(clocks.map((module) => off!.controlState[module.id]!.rate)).toEqual([2, 0.5]);
  // Frase: zacht (onder de hersteldrempel), een harde aanslag, zacht, rust.
  const phrase = clocks[0]!;
  const velocities = Array.from({ length: 16 }, (_, index) => off!.controlState[phrase.id]![`s${index + 1}`]! / 12);
  expect(velocities.filter((velocity) => velocity === 1)).toHaveLength(1);
  expect(velocities.every((velocity) => velocity === 0 || velocity === 1 || velocity < 0.5)).toBe(true);
});

it.each([['vel'], ['pressure'], ['voice'], ['syl_cv'], ['next']])('FOF solo vernieuwt een oud poortcontract zonder %s zonder bestaande patches te wijzigen', (missingPort) => {
  const original = seedSoloVoicePatch(emptyModularProject(), 'tp_mmb_fof', 'Oude FOF', 'out', 'out', { voice: 0.8 });
  const legacy = {
    ...original,
    moduleTypes: original.moduleTypes.map((type) => type.id === 'tp_mmb_fof'
      ? { ...type, ports: type.ports.filter((port) => port.id !== missingPort) } : type),
  };
  const upgraded = seedSoloVoicePatch(legacy, 'tp_mmb_fof', 'Nieuwe FOF', 'out', 'out');
  const ports = upgraded.moduleTypes.find((type) => type.id === 'tp_mmb_fof')!.ports.map((port) => port.id);
  expect(ports).toEqual(expect.arrayContaining(['vel', 'pressure', 'vibrato', 'voice', 'syl_cv', 'next', 'reset']));
  expect(upgraded.patches.slice(0, -1)).toEqual(original.patches);
});

it('FOF solo laat Press ongepatcht (MidiIn Press is 0 zonder aftertouch)', () => {
  const patch = project.patches.find((item) => item.name === 'FOF Stem solo')!;
  expect(patch.connections.some((connection) => connection.to.portId === 'pressure')).toBe(false);
  const fof = project.moduleTypes.find((type) => type.id === 'tp_mmb_fof')!;
  expect(fof.ports.find((port) => port.id === 'pressure')).toMatchObject({ direction: 'in', signalType: 'cv' });
});

it('FOF heeft voor elke CV-ingang een attenuator die standaard op 1 staat', () => {
  const fof = project.moduleTypes.find((type) => type.id === 'tp_mmb_fof')!;
  const knobs = fof.controls.filter((item) => item.kind === 'knob');
  for (const [port, control] of [['vowel', 'vowel_amt'], ['breath', 'breath_amt'], ['vibrato', 'vibrato_amt'],
    ['voice', 'voice_amt'], ['vel', 'vel_amt'], ['pressure', 'press_amt'], ['syl_cv', 'syl_amt']] as const) {
    expect(fof.ports.find((item) => item.id === port)).toMatchObject({ direction: 'in', signalType: 'cv' });
    expect(knobs.find((knob) => knob.id === control)?.defaultValue).toBe(1);
  }
  const syl = fof.controls.find((item) => item.id === 'syl');
  expect(syl).toMatchObject({ kind: 'knob', min: 0, max: 45, step: 1, defaultValue: 0 });
  const disp = fof.controls.find((item) => item.id === 'sylDisp');
  expect(disp).toMatchObject({ kind: 'display', bindTo: 'syl' });
  expect((disp as { lookup?: string[][] }).lookup?.[0]).toHaveLength(46);
  expect((disp as { lookup?: string[][] }).lookup?.[0]?.[1]).toBe('doo');
  expect((disp as { lookup?: string[][] }).lookup?.[0]?.[20]).toBe('na');
  expect((disp as { lookup?: string[][] }).lookup?.[0]?.[45]).toBe('spijt');
  for (const port of ['next', 'reset']) expect(fof.ports.find((item) => item.id === port)).toMatchObject({ direction: 'in', signalType: 'gate' });
});

it('FOF solo verbindt pitch, gate, velocity en mono naar beide uitgangen', () => {
  const patch = project.patches.find((item) => item.name === 'FOF Stem solo')!;
  expect(patch.connections.map((connection) => [connection.from.portId, connection.to.portId])).toEqual([
    ['pitch', 'voct'], ['gate', 'gate'], ['vel', 'vel'], ['out', 'l'], ['out', 'r'],
  ]);
});

it('Scanned solo verbindt pitch, gate, velocity en aftertouch als druk', () => {
  const patch = project.patches.find((item) => item.name === 'Scanned solo')!;
  expect(patch.connections.map((connection) => [connection.from.portId, connection.to.portId])).toEqual([
    ['pitch', 'voct'], ['gate', 'gate'], ['vel', 'vel'], ['press', 'press'], ['out', 'l'], ['out', 'r'],
  ]);
});

it('Material Bridge solo verbindt pitch, gate, velocity en beide pickups', () => {
  const patch = project.patches.find((item) => item.name === 'Material Bridge solo')!;
  expect(patch.connections.map((connection) => [connection.from.portId, connection.to.portId])).toEqual([
    ['pitch', 'voct'], ['gate', 'gate'], ['vel', 'vel'], ['out_l', 'l'], ['out_r', 'r'],
  ]);
});

const internalTypes = project.moduleTypes.filter(
  (t) => t.id.startsWith('tp_mmb_') && contract.modules[t.id]);

// ── 1. Paneel/ModuleType ↔ firmware ───────────────────────────────────────

describe('ModuleType-poorten bestaan in de firmware', () => {
  for (const t of internalTypes) {
    it(t.id, () => {
      const fw = contract.modules[t.id];
      const gaps = new Set(KNOWN_PORT_GAPS[t.id] ?? []);
      const missing = t.ports
        .map((p) => p.id)
        .filter((id) => !fwAcceptsPort(fw, id) && !gaps.has(id));
      expect(missing, `${t.id}: paneel-poorten onbekend in ${fw.source}`)
        .toEqual([]);
    });
  }
});

describe('ModuleType-controls bestaan in de firmware', () => {
  for (const t of internalTypes) {
    it(t.id, () => {
      const fw = contract.modules[t.id];
      const known = new Set([...(fw.controls ?? []), ...(fw.controlsIgnored ?? [])]);
      const missing = t.controls
        .filter((c) => c.kind !== 'display' && c.kind !== 'led')
        .map((c) => c.id)
        .filter((id) => !known.has(id));
      expect(missing, `${t.id}: paneel-controls onbekend in ${fw.source}`)
        .toEqual([]);
    });
  }
});

// ── 2. Seed-kabels wijzen naar echte paneel-jacks ─────────────────────────

describe('seed-patchkabels matchen paneel-jacks (de out_l-klasse)', () => {
  const typeById = new Map<string, ModuleType>(
    project.moduleTypes.map((t) => [t.id, t]));
  const moduleType = new Map<string, ModuleType>();
  for (const m of project.modules) {
    const t = typeById.get(m.typeId);
    if (t) moduleType.set(m.id, t);
  }

  for (const patch of project.patches) {
    it(`patch "${patch.name}"`, () => {
      const bad: string[] = [];
      for (const c of patch.connections) {
        for (const [end, dir] of [[c.from, 'out'], [c.to, 'in']] as const) {
          const t = moduleType.get(end.moduleId);
          if (!t) { bad.push(`onbekende module ${end.moduleId}`); continue; }
          const port = t.ports.find((p) => p.id === end.portId);
          if (!port) {
            bad.push(`${t.id}.${end.portId}: geen jack op het paneel`);
          } else if (port.direction !== dir) {
            bad.push(`${t.id}.${end.portId}: ${port.direction} gebruikt als ${dir}`);
          }
        }
      }
      expect(bad).toEqual([]);
    });
  }
});

// ── 3. Informatief: firmware-capabilities zonder paneel-jack ──────────────

it('rapporteer firmware-poorten zonder paneel-jack (geen fout)', () => {
  const lines: string[] = [];
  for (const t of internalTypes) {
    const fw = contract.modules[t.id];
    const panel = new Set(t.ports.map((p) => p.id));
    const panelAccepts = (id: string): boolean => {
      if (panel.has(id)) return true;
      const base = id.endsWith('_cv') ? id.slice(0, -3) : id + '_cv';
      if (panel.has(base)) return true;
      // firmware-aliassen: out≡out_l, aux≡out_r, in≡in_l
      const alias: Record<string, string> = {
        out: 'out_l', out_l: 'out', aux: 'out_r', out_r: 'aux',
        in: 'in_l', in_l: 'in',
      };
      return alias[id] !== undefined && panel.has(alias[id]);
    };
    const unreachable = fw.ports.filter((id) => !panelAccepts(id));
    if (unreachable.length > 0) lines.push(`${t.id}: ${unreachable.join(', ')}`);
  }
  if (lines.length > 0) {
    console.warn('firmware-poorten zonder jack:\n  ' + lines.join('\n  '));
  }
  expect(true).toBe(true);
});
