import { describe, expect, it } from 'vitest';

import { KEY_H, KEY_H_TALL, KEY_W, WHEEL_W, aftertouchFor, bendFor, bendFromY, keyAt, keyLayout, layoutWidth, modFromY, velocityAt, wheelAt } from './screenKeysLayout';

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

  it('schuiven: opzij buigt (één toets = vol bereik), omhoog is aftertouch', () => {
    expect(bendFor(0)).toBe(8192);
    expect(bendFor(KEY_W)).toBe(16383);
    expect(bendFor(-2 * KEY_W)).toBe(1);
    expect(bendFor(KEY_W / 2)).toBe(8192 + 4096);
    // Instelbaar bereik: twee toetsen opzij voor het volle bereik.
    expect(bendFor(KEY_W, 2)).toBe(8192 + 4096);
    expect(bendFor(2 * KEY_W, 2)).toBe(16383);
    expect(aftertouchFor(0)).toBe(0);
    expect(aftertouchFor(20)).toBe(0);                 // omlaag: niets
    expect(aftertouchFor(-0.6 * KEY_H)).toBe(127);
    expect(aftertouchFor(-0.3 * KEY_H)).toBe(64);
  });

  it('wielen: bend links, mod rechts; bend veert om het midden, mod van onder naar boven', () => {
    expect(wheelAt(2 + WHEEL_W / 2, 10)).toBe('bend');
    expect(wheelAt(2 + WHEEL_W + 4 + WHEEL_W / 2, 10)).toBe('mod');
    expect(wheelAt(2 + WHEEL_W + 1, 10)).toBeNull();
    expect(wheelAt(5, KEY_H + 1)).toBeNull();
    expect(bendFromY(KEY_H / 2)).toBe(8192);
    expect(bendFromY(0)).toBe(16383);
    expect(bendFromY(KEY_H)).toBe(1);
    expect(modFromY(KEY_H)).toBe(0);
    expect(modFromY(0)).toBe(127);
  });
});

describe('lange toetsen', () => {
  it('schalen aanslag en aftertouch mee met de hoogte', () => {
    const keys = keyLayout(60, 2, KEY_W, KEY_H_TALL);
    const c = keys[0]!;
    expect(c.h).toBe(KEY_H_TALL);
    expect(keys.find((k) => k.black)!.h).toBe(KEY_H_TALL * 0.6);
    expect(velocityAt(c, KEY_H_TALL / 2)).toBe(0.68);
    expect(aftertouchFor(-0.6 * KEY_H_TALL, KEY_H_TALL)).toBe(127);
    expect(wheelAt(2 + WHEEL_W / 2, KEY_H_TALL - 1, KEY_H_TALL)).toBe('bend');
    expect(wheelAt(2 + WHEEL_W / 2, KEY_H + 1)).toBeNull();
  });
});
