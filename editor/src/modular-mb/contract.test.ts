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
  seedPolyVoicePatch,
  seedSoloVoicePatch,
  seedTestPatch,
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
  return p;
}

const project = allSeededProject();
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
