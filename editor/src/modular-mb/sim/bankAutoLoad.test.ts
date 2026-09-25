import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBank, setUserPick, type BankIndex } from './bankAutoLoad';

const index = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/banks/index.json', import.meta.url)), 'utf8')) as BankIndex;

describe('samplebank kiezen voor de sim', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
    } as Storage;
  });

  it('index: alle nummers 0–15 hebben een bestaand bestand', () => {
    for (let nn = 0; nn < 16; nn++) {
      const f = index.defaults[String(nn)];
      expect(index.files.some((x) => x.file === f)).toBe(true);
    }
  });

  it('volgorde: SD-naam, dan eigen keuze, dan standaard', () => {
    expect(resolveBank(index, 13)).toEqual({ file: index.defaults['13'], source: 'standaard' });
    setUserPick(13, 'gu-choir.mmbs');
    expect(resolveBank(index, 13)).toEqual({ file: 'gu-choir.mmbs', source: 'keuze' });
    const sd: (string | undefined)[] = []; sd[13] = 'Rhodes EP';
    const rhodes = index.files.find((f) => f.file === 'gu-rhodes.mmbs')!;
    sd[13] = rhodes.name;
    expect(resolveBank(index, 13, sd)).toEqual({ file: 'gu-rhodes.mmbs', source: 'teensy' });
    sd[13] = 'Bestaat niet';
    expect(resolveBank(index, 13, sd)).toEqual({ file: 'gu-choir.mmbs', source: 'keuze' });
    setUserPick(13, null);
    expect(resolveBank(index, 13, sd)!.source).toBe('standaard');
  });
});
