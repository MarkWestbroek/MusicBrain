import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ModulePanel } from '../ModulePanel';
import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { midiMonitor } from './midiMonitor';
import { portActivity } from './MidiPortLeds';

describe('MIDI-In LEDjes', () => {
  it('rendert een LED met tooltip per uitgang, gate brandt bij een vastgehouden noot', () => {
    const p = seedInternals(emptyModularProject());
    const mi = p.modules.find((m) => m.typeId === 'tp_mmb_midiin')!;
    midiMonitor.push('patch', 'sim', [0x90, 60, 100]);
    midiMonitor.push('patch', 'sim', [0xD0, 93]);
    const html = renderToStaticMarkup(createElement(ModulePanel, { module: mi, types: p.moduleTypes }));
    expect(html).toContain('Gate open: C4');
    expect(html).toContain('Aftertouch (kanaal) = 93');
    expect(html).toContain('Klik: MIDI-monitor');
  });

  it('portActivity voor CC-poorten volgt de CC-knoppen', () => {
    const a = { cc: new Map([[74, { t: 0, value: 12 }]]), held: new Set<number>() };
    expect(portActivity('cv_cc1', a, 74, 71, 100)!.text).toContain('CC1 (CC 74) = 12');
    expect(portActivity('cv_cc2', a, 74, 71, 100)!.text).toContain('nog niets');
  });
});
