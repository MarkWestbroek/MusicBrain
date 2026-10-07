// Starttaal: de URL wint (een link voor een vriend), dan de onthouden keuze,
// dan de browsertaal.

import { describe, expect, it } from 'vitest';

import { initialLang } from './i18n';

describe('initialLang', () => {
  it('?lang= in de URL wint', () => {
    expect(initialLang('?lang=en', 'nl', 'nl-NL')).toBe('en');
    expect(initialLang('?patch=x&lang=NL', 'en', 'en-GB')).toBe('nl');
  });
  it('anders de onthouden keuze', () => expect(initialLang('', 'nl', 'en-GB')).toBe('nl'));
  it('anders de browser: Nederlands → nl, de rest → en', () => {
    expect(initialLang('', null, 'nl-BE')).toBe('nl');
    expect(initialLang('', null, 'de-DE')).toBe('en');
    expect(initialLang('?lang=fr', null, undefined)).toBe('en');
  });
});
