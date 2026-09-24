// De simulator-graaf voor álle seed-patches: vindt elke kabel na het
// uitvouwen een poort, aan beide kanten?
//
// Sinds stap 6 hangt alles aan kabels — ook de noten, die van MIDI-In per stem
// als `pitchK`/`gateK` naar de stemmen lopen. Een kabel die na het uitvouwen
// nergens heen wijst, laat de engine stil vallen (`wire()` vindt geen poort):
// een stem die niet speelt, een envelope die niet opent. De engine zelf heeft
// een AudioContext nodig, maar zijn plan (`planSimGraph`) en de poorten van de
// wasm-modules zijn hier gewoon na te lopen.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { emptyModularProject } from '../types';
import type { ModularProject } from '../types';
import {
  seedCloudsAmbientPatch, seedCvBridgePatch, seedInternals, seedPolyVoicePatch,
  seedSamplerPolyPatch, seedSoloVoicePatch, seedTestPatch,
} from '../seedModules';
import { WasmModule } from '../runtime';
import { planSimGraph, MIDIIN_TYPE } from './simGraph';

function seeded(): ModularProject {
  let p = seedInternals(emptyModularProject());
  p = seedTestPatch(p);
  p = seedCvBridgePatch(p);
  p = seedPolyVoicePatch(p, 4, { filterType: 'ladder', perVoiceLfo: true });
  p = seedPolyVoicePatch(p, 2, { voiceSource: 'stk', filterType: 'ms20', perVoiceFx: 'comb' });
  p = seedPolyVoicePatch(p, 8, {});
  p = seedSoloVoicePatch(p, 'tp_mmb_plaits', 'Plaits', 'out', 'aux', {});
  p = seedCloudsAmbientPatch(p);
  p = seedSamplerPolyPatch(p, 8, true, true);
  return p;
}
const project = seeded();

/** Poort-ids van een .wasm (zoals de worklet ze leest). */
const wasmPorts = new Map<string, { ins: Set<string>; outs: Set<string> }>();
function portsOf(typeId: string): { ins: Set<string>; outs: Set<string> } {
  let r = wasmPorts.get(typeId);
  if (r) return r;
  const bytes = readFileSync(fileURLToPath(new URL(`../../../public/wasm/${typeId}.wasm`, import.meta.url)));
  const mod = new WebAssembly.Module(bytes);
  const imports: Record<string, Record<string, () => number>> = {};
  for (const imp of WebAssembly.Module.imports(mod)) { imports[imp.module] ??= {}; imports[imp.module]![imp.name] = () => 0; }
  const ex = new WebAssembly.Instance(mod, imports).exports as any;
  ex.mmb_init();
  const cstr = (p: number): string => {
    const m = new Uint8Array(ex.memory.buffer); let s = '';
    for (let i = p; m[i]; i++) s += String.fromCharCode(m[i]!);
    return s;
  };
  r = { ins: new Set(), outs: new Set() };
  for (let i = 0; i < ex.mmb_num_inputs(); i++) r.ins.add(cstr(ex.mmb_input_id(i)));
  for (let i = 0; i < ex.mmb_num_outputs(); i++) r.outs.add(cstr(ex.mmb_output_id(i)));
  wasmPorts.set(typeId, r);
  return r;
}
/** De aliassen van `resolve()` in mmb-worklet.js. */
function resolves(set: Set<string>, id: string): boolean {
  return set.has(id) || set.has(`${id}_cv`) || set.has(id.replace(/_cv$/, ''))
    || (id === 'in_l' && set.has('in')) || (id === 'in' && set.has('in_l'))
    || (id === 'out_l' && set.has('out')) || (id === 'out' && set.has('out_l'))
    || (id === 'aux' && set.has('out_r'))
    || (id === 'trig' && set.has('gate')) || (id === 'gate' && set.has('trig'));
}

describe('simulator-graaf van de seed-patches', () => {
  for (const patch of project.patches) {
    it(patch.name ?? patch.id, () => {
      const plan = planSimGraph(project, patch);
      const typeOf = new Map(project.modules.map((m) => [m.id, m.typeId]));
      const problems: string[] = [];
      for (const c of plan.conns) {
        if (!plan.inRack.has(c.from.moduleId) || !plan.inRack.has(c.to.moduleId)) continue;
        const st = typeOf.get(c.from.moduleId)!, dt = typeOf.get(c.to.moduleId)!;
        const label = `${st}.${c.from.portId} → ${dt}.${c.to.portId}`;
        // 1. De engine-index: catalogus-poorten, plus MIDI-In's pitchK tot midiOuts.
        const stype = project.moduleTypes.find((t) => t.id === st)!;
        const dtype = project.moduleTypes.find((t) => t.id === dt)!;
        const voice = /^(pitch|gate|vel)(\d+)$/.exec(c.from.portId);
        const srcKnown = stype.ports.some((p) => p.id === c.from.portId)
          || (st === MIDIIN_TYPE && !!voice && Number(voice[2]) <= plan.midiOuts);
        if (!srcKnown) problems.push(`${label}: bron-poort onbekend voor de engine`);
        if (!dtype.ports.some((p) => p.id === c.to.portId)) problems.push(`${label}: doel-poort onbekend voor de engine`);
        // 2. De wasm zelf (OUT en de mixers zijn Web Audio-nodes).
        if (WasmModule.supports(st) && !resolves(portsOf(st).outs, c.from.portId)) problems.push(`${label}: de wasm heeft die uitgang niet`);
        if (WasmModule.supports(dt) && !resolves(portsOf(dt).ins, c.to.portId)) problems.push(`${label}: de wasm heeft die ingang niet`);
      }
      expect(problems).toEqual([]);
    });
  }

  it('een poly-patch geeft elke stem zijn eigen MIDI-In-uitgangen', () => {
    const patch = project.patches.find((p) => planSimGraph(project, p).groups.size > 0
      && p.connections.some((c) => /^(pitch|gate)$/.test(c.from.portId)))!;
    expect(patch).toBeTruthy();
    const plan = planSimGraph(project, patch);
    const pitches = plan.conns.filter((c) => /^pitch\d+$/.test(c.from.portId)).map((c) => c.from.portId);
    expect(new Set(pitches).size).toBeGreaterThan(1);
    expect(plan.midiOuts).toBeGreaterThanOrEqual(new Set(pitches).size);
  });
});
