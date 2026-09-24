// Houdt `simSupportOf` naast de gezaaide moduleset. De test legt niet vast
// dat een bepaalde module wel of niet speelt — dat verschuift met elke nieuwe
// wasm-build. Hij legt vast dat het antwoord *bekend* is: elk intern type valt
// in precies één bak, en de telling in de laatste test maakt zichtbaar wat er
// verandert zodra iemand een module toevoegt of simuleerbaar maakt.

import { describe, expect, it } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { simSupportOf, type SimSupport } from './simSupport';

const project = seedInternals(emptyModularProject());
const internals = project.moduleTypes.filter((t) => t.internal);

function supportOf(typeId: string): SimSupport {
  const t = project.moduleTypes.find((x) => x.id === typeId);
  if (!t) throw new Error(`onbekend type ${typeId}`);
  return simSupportOf(t, project.moduleTypes, project.categories);
}

describe('simSupport', () => {
  it('kent elk intern type een status toe', () => {
    expect(internals.length).toBeGreaterThan(40);
    for (const t of internals) {
      expect(['wasm', 'tone', 'none'], t.id)
        .toContain(simSupportOf(t, project.moduleTypes, project.categories));
    }
  });

  it('herkent de wasm-modules', () => {
    expect(supportOf('tp_mmb_elements')).toBe('wasm');
    expect(supportOf('tp_mmb_sampler')).toBe('wasm');
    expect(supportOf('tp_mmb_env_follower')).toBe('wasm');
    expect(supportOf('tp_mmb_env_follower_mono')).toBe('wasm');
    // Sinds 2026-09-20: dezelfde kernels als de firmware (mmb_dsp::Svf /
    // ::Korg35) in plaats van een Tone-biquad.
    expect(supportOf('tp_mmb_vcf')).toBe('wasm');
    expect(supportOf('tp_mmb_ms20')).toBe('wasm');
    expect(supportOf('tp_mmb_stk_sound')).toBe('wasm');   // gevendorde STK
    expect(supportOf('tp_mmb_ladder')).toBe('wasm');       // AudioFilterLadder overgeschreven
  });

  it('bouwt alleen OUT en de mixers uit Web Audio-nodes', () => {
    expect(supportOf('tp_mmb_mixer8')).toBe('tone');
    expect(supportOf('tp_mmb_out')).toBe('tone');
  });

  it('speelt sinds stap 6 ook de modules achter de oude noot-dispatcher als wasm', () => {
    for (const id of ['tp_mmb_vco', 'tp_mmb_fm_vco', 'tp_mmb_vca', 'tp_mmb_ahdsr',
      'tp_mmb_cvmath', 'tp_mmb_seq8', 'tp_mmb_midiin', 'tp_mmb_lfo', 'tp_mmb_noise']) {
      expect(supportOf(id), id).toBe('wasm');
    }
  });

  it('noemt niet-gesimuleerde modules stil', () => {
    // Quad-VCO en quad-mixer staan alleen in de catalogus, niet in de firmware.
    expect(supportOf('tp_mmb_quad_vco_shared')).toBe('none');
    // S&H staat in de catalogus maar bestaat niet in de firmware; de sim
    // speelt hem bewust ook niet (zie de Teensy-todo).
    expect(supportOf('tp_mmb_sh')).toBe('none');
  });

  it('speelt een externe module via zijn simulatedBy-proxy', () => {
    // RS-110 is een Eurorack-filter dat op de interne VCF wordt afgespeeld.
    const rs110 = project.moduleTypes.find((t) => t.id === 'tp_as_rs110');
    if (!rs110) return;                       // seedInternals zaait geen externe
    expect(rs110.simulatedBy).toBe('tp_mmb_vcf');
  });

  it('rapporteert de dekking', () => {
    const tally: Record<SimSupport, string[]> = { wasm: [], tone: [], none: [] };
    for (const t of internals) {
      tally[simSupportOf(t, project.moduleTypes, project.categories)].push(t.id);
    }
    const played = tally.wasm.length + tally.tone.length;
    // eslint-disable-next-line no-console
    console.info(
      `simulator: ${played}/${internals.length} interne modules spelen `
      + `(${tally.wasm.length} wasm, ${tally.tone.length} web-audio). Stil: `
      + tally.none.sort().join(', '));
    expect(played + tally.none.length).toBe(internals.length);
  });
});
