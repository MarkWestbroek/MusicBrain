import { describe, expect, it } from 'vitest';

import { clampA4, effectiveA4, tuneVolts } from './tuning';

describe('stemtoon', () => {
  it('A432 is -31,8 cent, A440 is 0', () => {
    expect(tuneVolts(440)).toBe(0);
    expect(tuneVolts(432) * 1200).toBeCloseTo(-31.77, 1);
    expect(tuneVolts(880)).toBe(tuneVolts(500));   // geklemd
  });
  it('persoonlijk gaat over de patch heen; zonder persoonlijk geldt de patch, zonder patch 440', () => {
    expect(effectiveA4(432, 440)).toBe(432);
    expect(effectiveA4(null, 443)).toBe(443);
    expect(effectiveA4(null, undefined)).toBe(440);
    expect(clampA4(100)).toBe(380);
  });
});
