import { describe, it, expect } from 'vitest';
import { emptyModularProject } from '../types';
import { seedInternals } from '../seedModules';
import { parseCommand } from './parse';
import { findExplainTopic } from './demo';
import { COMMAND_HELP } from './commandHelp';

const types = seedInternals(emptyModularProject()).moduleTypes;

describe('handleiding: elk voorbeeld wordt begrepen', () => {
  for (const sec of COMMAND_HELP) {
    for (const ex of sec.examples) {
      it(`${sec.title}: ${ex.text}`, () => {
        if (sec.title.startsWith('Uitleg')) { expect(findExplainTopic(ex.text)).not.toBeNull(); return; }
        const r = parseCommand(ex.text, types, true);
        expect(r.unknown).toEqual([]);
        const want = sec.title.startsWith('Een nieuwe') ? 'build' : sec.title === 'Stemmen' ? 'voices'
          : sec.title === 'Vervangen' ? 'replace' : sec.title === 'Toevoegen' ? /addBus|addModulation/ : /remove|move/;
        if (typeof want === 'string') expect(r.command.kind).toBe(want);
        else expect(r.command.kind).toMatch(want);
      });
    }
  }
});
