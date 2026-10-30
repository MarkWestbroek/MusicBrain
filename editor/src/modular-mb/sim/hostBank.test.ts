// Het bankstrookje op het SAMPLER-paneel in een plugin: daar is geen Teensy en
// geen server, dus de naam komt van de plugin zelf (setHostBank, plugin-ui).
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ModulePanel } from '../ModulePanel';
import { seedInternals } from '../seedModules';
import { emptyModularProject } from '../types';
import { setHostBank } from './bankAutoLoad';

const project = seedInternals(emptyModularProject());
const type = project.moduleTypes.find((t) => t.id === 'tp_mmb_sampler')!;
const module = project.modules.find((m) => m.typeId === type.id)!;
const strip = (bank: number) => renderToStaticMarkup(createElement(ModulePanel, { module, types: [type], controlState: { bank } }));

describe('bankstrookje met de bank van de plugin', () => {
  afterEach(() => setHostBank(null));

  it('toont nummer en naam van de bank die de plugin laadde', () => {
    setHostBank({ name: 'Warm Pad', error: '', own: false, knob: 3 });
    expect(strip(3)).toContain('03 · Warm Pad');
  });
  it('een eigen bank, een fout, en een knop die nog laadt', () => {
    setHostBank({ name: 'Mijn harp', error: '', own: true, knob: 3 });
    expect(strip(3)).toContain('Eigen · Mijn harp');
    setHostBank({ name: '', error: 'geen bank 9 in /banks', own: false, knob: 9 });
    expect(strip(9)).toContain('geen bank 9');
    setHostBank({ name: 'Warm Pad', error: '', own: false, knob: 3 });
    expect(strip(5)).toContain('05 · laden…');
  });
  it('een bank die de plugin nog laadt: naam plus laden…', () => {
    setHostBank({ name: 'Shakuhachi', error: '', own: false, knob: 7, loading: true });
    expect(strip(7)).toContain('07 · Shakuhachi — laden…');
  });
  it('een bewaard bestand dat niet meer op het nummer staat: naam plus melding', () => {
    setHostBank({ name: 'Warm Pad', error: '', own: false, knob: 3, note: 'bewaard bestand gu-warmpad.mmbs; op 03 staat nu gu-harp' });
    const svg = strip(3);
    expect(svg).toContain('03 · Warm Pad');
    expect(svg).toContain('op 03 staat nu gu-harp');
  });
});
