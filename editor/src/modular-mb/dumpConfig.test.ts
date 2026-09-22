// Geen echte test: schrijft de config-payload van een seed-patch naar een
// bestand, precies zoals de editor hem naar de Teensy stuurt — voor
// tools/teensy-live/teensy_live.py --cfg. Draait alleen met MMB_DUMP_CONFIG:
//
//   MMB_DUMP_CONFIG=cfg.json npx vitest run src/modular-mb/dumpConfig.test.ts
//
// MMB_SEED kiest de patch (standaard sampler-wah).

import { writeFileSync } from 'node:fs';
import { it } from 'vitest';

import { emptyModularProject } from './types';
import { seedInternals, seedSamplerPolyPatch } from './seedModules';
import { buildConfigPayload } from './teensyLink';

const seeds = {
  'sampler':     () => seedSamplerPolyPatch(seedInternals(emptyModularProject()), 8, false),
  'sampler-wah': () => seedSamplerPolyPatch(seedInternals(emptyModularProject()), 8, true),
};

it.skipIf(!process.env.MMB_DUMP_CONFIG)('config-payload naar bestand', () => {
  const seed = (process.env.MMB_SEED ?? 'sampler-wah') as keyof typeof seeds;
  writeFileSync(process.env.MMB_DUMP_CONFIG!, buildConfigPayload(seeds[seed]()).json);
});
