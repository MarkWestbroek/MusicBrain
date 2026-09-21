import { describe, expect, it } from 'vitest';

import { bankList, bankTitle, fsName, psramSummary, sdSummary } from './teensyStorage';

describe('Teensy-opslag in de statusbalk', () => {
  it('noemt de bestandssystemen zoals SdFat ze telt', () => {
    expect(fsName(64)).toBe('exFAT');
    expect(fsName(32)).toBe('FAT32');
    expect(fsName(0)).toBe('?');
  });

  it('haalt de banknummers uit het masker', () => {
    expect(bankList(0)).toEqual([]);
    expect(bankList(0b1001)).toEqual([0, 3]);
    expect(bankList(1 << 15)).toEqual([15]);
  });

  it('vat de kaart samen', () => {
    // Samsung Pro 64 GB: ~59 600 MiB, exFAT, nog geen banken.
    expect(sdSummary({ sdOk: true, sdFs: 64, sdMB: 61035, sdBanks: 0 })).toBe('exFAT 60 GB · geen banken');
    expect(sdSummary({ sdOk: true, sdFs: 32, sdMB: 30436, sdBanks: 0b1001 })).toBe('FAT32 30 GB · banken 00 03');
    expect(sdSummary({ sdOk: false })).toBe('geen kaart');
  });

  it('meldt PSRAM, en zwijgt bij firmware die het niet kent', () => {
    expect(psramSummary({ psramMB: 8 })).toBe('8 MB');
    expect(psramSummary({ psramMB: 0 })).toBe('geen');
    expect(psramSummary({})).toBeUndefined();
    expect(sdSummary({})).toBeUndefined();
  });
});

describe('Banknaam op het sampler-paneel', () => {
  const kaart = {
    sdOk: true, sdFs: 64, sdMB: 61035, sdBanks: 0b1_0000_0000_0111,
    sdBankNames: ['Tine Electric Piano', 'elements-test', 'Kalimba', '', '', '', '', '', '', '', '', '', '?'],
  };
  it('toont de naam die op de kaart staat', () => {
    expect(bankTitle(0, kaart)).toEqual({ text: '00 · Tine Electric Piano', tone: 'ok' });
    expect(bankTitle(2, kaart).text).toBe('02 · Kalimba');
  });
  it('zegt het als de gekozen bank er niet staat of kapot is', () => {
    expect(bankTitle(5, kaart)).toEqual({ text: '05 · niet op de kaart', tone: 'warn' });
    expect(bankTitle(15, kaart).text).toBe('15 · niet op de kaart');
    expect(bankTitle(12, kaart).text).toBe('12 · geen geldige bank');
    expect(bankTitle(0, { sdOk: false }).text).toBe('00 · geen SD-kaart');
  });
  it('houdt het bij het nummer zonder Teensy', () => {
    expect(bankTitle(3, undefined)).toEqual({ text: 'bank 03', tone: 'dim' });
  });
});
