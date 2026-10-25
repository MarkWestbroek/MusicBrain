// Fabriekspresets per module: één bron voor de plugin (pluginParams.ts zet ze
// in generated/<typeId>_params.h, de DAW toont ze als programma's) en later
// de editor. Waarden op control-id zoals het paneel ze kent; een keuzeknop
// met zijn index, een toggle als boolean. Wat ontbreekt staat op de default.
// Een preset uit Logic (.aupreset, "Save As…") is XML met dezelfde ids: zie
// doc/plans/plugin.md §2e.

import type { ControlValue } from './types';

export interface ModulePreset {
  name: string;
  values: Record<string, ControlValue>;
}

export const MODULE_PRESETS: Record<string, ModulePreset[]> = {
  // HALL: algo 0 Hall, 1 Room, 2 Chamber, 3 Random.
  tp_mmb_hall: [
    { name: 'Kleine kamer', values: { algo: 1, size: 0.25, decay: 0.8, predelay: 5, early: 0.7, diffusion: 0.8, mod: 0.2, hidamp: 0.5, lomult: 1.0, width: 0.8, mix: 0.25 } },
    // Mark, Logic 2026-10-25 ("hall.aupreset"): kamer met lange voorvertraging.
    { name: 'Chamber (Mark)', values: { algo: 2, size: 0.2417, decay: 2.5, predelay: 63.75, early: 0.5, diffusion: 0.9083, mod: 0.4, hidamp: 0.725, lomult: 1.2, width: 1, mix: 0.3 } },
    { name: 'Concertzaal', values: { algo: 0, size: 0.75, decay: 2.8, predelay: 25, early: 0.4, diffusion: 0.85, mod: 0.35, hidamp: 0.45, lomult: 1.3, width: 1, mix: 0.3 } },
    { name: 'Kathedraal', values: { algo: 0, size: 1, decay: 7, predelay: 45, early: 0.3, diffusion: 0.9, mod: 0.5, hidamp: 0.55, lomult: 1.6, width: 1, mix: 0.4 } },
    { name: 'Helder plaatje', values: { algo: 2, size: 0.4, decay: 1.8, predelay: 0, early: 0, diffusion: 1, mod: 0.3, hidamp: 0.15, lomult: 0.8, width: 1, mix: 0.3 } },
    { name: 'Wolk', values: { algo: 3, size: 0.8, decay: 4, predelay: 80, early: 0.2, diffusion: 0.7, mod: 0.8, hidamp: 0.5, lomult: 1.2, width: 1, mix: 0.35 } },
    { name: 'Bevroren', values: { algo: 0, size: 1, decay: 12, predelay: 0, early: 0, diffusion: 0.9, mod: 0.6, hidamp: 0.4, lomult: 1.0, width: 1, freeze_btn: true, mix: 0.5 } },
  ],
};
