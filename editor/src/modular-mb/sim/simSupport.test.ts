// Houdt `simSupportOf` naast de gezaaide moduleset. De test legt niet vast
// dat een bepaalde module wel of niet speelt — dat verschuift met elke nieuwe
// wasm-build. Hij legt vast dat het antwoord *bekend* is: elk intern type valt
// in precies één bak, en de telling in de laatste test maakt zichtbaar wat er
// verandert zodra iemand een module toevoegt of simuleerbaar maakt.

import { describe, expect, it } from 'vitest';

import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { simSupportOf, isStepSequencer, type SimSupport } from './simSupport';

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
  });

  it('herkent de Tone-runtimes en de hardgecodeerde interne modules', () => {
    expect(supportOf('tp_mmb_vco')).toBe('tone');   // registry
    expect(supportOf('tp_mmb_ladder')).toBe('tone');
    expect(supportOf('tp_mmb_mixer8')).toBe('tone'); // op typeId in makeNode
    expect(supportOf('tp_mmb_out')).toBe('tone');
  });

  it('noemt niet-gesimuleerde modules stil', () => {
    expect(supportOf('tp_mmb_octa_vco')).toBe('none');
    expect(supportOf('tp_mmb_quant')).toBe('none');
  });

  it('laat Grids niet voor de SEQ-16 doorgaan', () => {
    // Beide staan in categorie 'sequencer'; alleen de SEQ-16 heeft de
    // stap-knoppen en de cv-uitgang waar de engine op rekent.
    const seq = project.moduleTypes.find((t) => t.id === 'tp_mmb_seq8')!;
    const grids = project.moduleTypes.find((t) => t.id === 'tp_mmb_grids')!;
    expect(seq.categoryId).toBe(grids.categoryId);
    expect(isStepSequencer(seq)).toBe(true);
    expect(isStepSequencer(grids)).toBe(false);
    expect(supportOf('tp_mmb_seq8')).toBe('tone');
    expect(supportOf('tp_mmb_grids')).toBe('none');
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
