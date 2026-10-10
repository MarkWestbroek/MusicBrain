import { describe, expect, it } from 'vitest';

import { weergaveVan } from './weergave';

describe('weergaveVan', () => {
  it('ziet een telefoon staand en liggend als telefoon', () => {
    expect(weergaveVan(412, 915)).toEqual({ soort: 'telefoon', staand: true });     // Pixel 7
    expect(weergaveVan(915, 412)).toEqual({ soort: 'telefoon', staand: false });    // liggend: weinig hoogte
  });
  it('onderscheidt tablet en desktop op de breedte', () => {
    expect(weergaveVan(820, 1180).soort).toBe('tablet');
    expect(weergaveVan(1280, 800).soort).toBe('desktop');
  });
});
