import { describe, expect, it } from 'vitest';

import { KEY_H, KEY_W, keyAt, keyLayout, layoutWidth, velocityAt } from './screenKeysLayout';

describe('schermtoetsenbord: layout en hit-test', () => {
  const keys = keyLayout(60, 2);   // C4..C6

  it('legt twee octaven plus de C erboven: 15 witte, 10 zwarte', () => {
    expect(keys).toHaveLength(25);
    expect(keys.filter((k) => !k.black)).toHaveLength(15);
    expect(layoutWidth(keys)).toBe(15 * KEY_W);
    expect(keys[0]).toMatchObject({ midi: 60, black: false, label: 'C' });
  });

  it('een zwarte toets ligt bovenop: raken boven de naad geeft C#, eronder C of D', () => {
    const cis = keys.find((k) => k.midi === 61)!;
    expect(keyAt(keys, cis.x + cis.w / 2, 10)?.midi).toBe(61);
    expect(keyAt(keys, cis.x + 1, KEY_H - 5)?.midi).toBe(60);      // links onder de zwarte: C
    expect(keyAt(keys, cis.x + cis.w - 1, KEY_H - 5)?.midi).toBe(62);   // rechts: D
  });

  it('buiten het klavier: niets', () => {
    expect(keyAt(keys, -1, 10)).toBeNull();
    expect(keyAt(keys, layoutWidth(keys) + 5, 10)).toBeNull();
    expect(keyAt(keys, 5, KEY_H + 1)).toBeNull();
  });

  it('aanslag: bovenaan zacht, onderaan hard', () => {
    const c = keys[0]!;
    expect(velocityAt(c, 0)).toBe(0.35);
    expect(velocityAt(c, KEY_H)).toBe(1);
    expect(velocityAt(c, KEY_H / 2)).toBe(0.68);
  });
});
