import { describe, it, expect } from 'vitest';
import { panelTextFit } from './ModulePanel';

describe('panelTextFit', () => {
  it('ondertitels in de kop worden ~40% groter, andere teksten niet', () => {
    expect(panelTextFit({ x: 20, y: 13, text: 'lamp · 4 × LDR', fontSize: 1.1 }, 40).fontSize).toBe(1.54);
    expect(panelTextFit({ x: 20, y: 14, text: 'x', fontSize: 1.0 }, 40).fontSize).toBe(1.4);
    expect(panelTextFit({ x: 20, y: 8, text: 'VIBE', fontSize: 2.2 }, 40).fontSize).toBe(2.2);   // titel
    expect(panelTextFit({ x: 20, y: 97, text: 'ctl', fontSize: 1.0 }, 40).fontSize).toBe(1.0);   // bij een knop
  });
  it('te lange ondertitel krimpt in de breedte, past hij wel dan niet', () => {
    const long = panelTextFit({ x: 10, y: 13, text: '6581 · 3 stemmen · filter 8580 · C64', fontSize: 1.0 }, 20);
    expect(long.textLength).toBe(17);
    expect(panelTextFit({ x: 40, y: 13, text: 'kort', fontSize: 1.0 }, 80).textLength).toBeUndefined();
  });
});
