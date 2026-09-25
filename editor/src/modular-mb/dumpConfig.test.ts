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
import { OCTAVER_SOLO_FX, RINGMOD_SOLO_FX, SAMPLER_MASTER_FX, STEREO_TAPE_SOLO_FX, seedInternals, seedPolyVoicePatch, seedSamplerPolyPatch, seedSoloVoicePatch } from './seedModules';
import { buildConfigPayload } from './teensyLink';

const stk = { sound: 0, level: 0.8 };
const seeds = {
  'sampler':     () => seedSamplerPolyPatch(seedInternals(emptyModularProject()), 8, false),
  'solo-tape':   () => seedSoloVoicePatch(seedInternals(emptyModularProject()), 'tp_mmb_stk_sound', 'STK', 'out', 'out', stk, STEREO_TAPE_SOLO_FX),
  // Kale VCO (klinkt zonder gate, licht op de heap): meetbron voor ringmod/octaver.
  'solo-ring':   () => seedSoloVoicePatch(seedInternals(emptyModularProject()), 'tp_mmb_vco', 'VCO', 'out', 'out', { level: 0.5 }, RINGMOD_SOLO_FX),
  'solo-oct':    () => seedSoloVoicePatch(seedInternals(emptyModularProject()), 'tp_mmb_vco', 'VCO', 'out', 'out', { level: 0.5 }, OCTAVER_SOLO_FX),
  'poly-aftertouch': () => seedPolyVoicePatch(seedInternals(emptyModularProject()), 4, { aftertouch: true }),
  'sampler-wah': () => seedSamplerPolyPatch(seedInternals(emptyModularProject()), 8, true),
  'sampler-wah-fet': () => seedSamplerPolyPatch(seedInternals(emptyModularProject()), 8, true, true),
  'sampler-master': () => seedSamplerPolyPatch(seedInternals(emptyModularProject()), 8, false, SAMPLER_MASTER_FX),
};

it.skipIf(!process.env.MMB_DUMP_CONFIG)('config-payload naar bestand', () => {
  const seed = (process.env.MMB_SEED ?? 'sampler-wah') as keyof typeof seeds;
  writeFileSync(process.env.MMB_DUMP_CONFIG!, buildConfigPayload(seeds[seed]()).json);
});
