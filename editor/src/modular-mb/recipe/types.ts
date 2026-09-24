// Patch-recept (ED-RC-1) — zie doc/plans/patch-recept.md.
//
// Een recept is de kleine, declaratieve beschrijving van een patch die van
// buitenaf gevuld kan worden: door een parser, een LLM, een wizard of een
// rechtsklik. De compiler (`compile.ts`) vertaalt een recept naar een lijst
// bewerkingen (`PatchOp[]`) op het project. Nooit een ModularProject van
// buiten: alleen dit recept.

import type {
  ControlValue, PatchConnection, PolyGroup, Rack, Patch,
} from '../types';

/** Verwijzing naar een moduletype: type-id (`tp_mmb_wt_vco`), korte vorm
 *  (`wt_vco`) of een alias uit de catalogus (`wavetable`). Optioneel met
 *  knopstanden die de speelbare startwaarden overschrijven. */
export type RecipeModule =
  | string
  | { type: string; controls?: Record<string, ControlValue> };

export interface PatchRecipe {
  /** Patchnaam; weggelaten = automatisch ("8-stemmige WT-VCO → VCF"). */
  name?: string;
  /** 1 = mono (default), 2..16 = poly. */
  voices?: number;
  /** Stemkern: vco, wt_vco, string, stk, plaits, dx7, … Moet een
   *  audio-uitgang hebben; `voct` en `gate` worden bedraad als ze bestaan. */
  source: RecipeModule;
  /** Filter per stem. Default 'vcf'; `null` = geen filter. */
  filter?: RecipeModule | null;
  /** Extra audio-schakels per stem tussen filter en VCA (mono in/uit). */
  voiceFx?: RecipeModule[];
  /** Bus-effecten na de mixer, vóór OUT. Stereo modules (in_l/in_r) krijgen
   *  één instantie, mono modules (in/out) een L/R-paar. */
  bus?: RecipeModule[];
  /** AHDSR → VCA. Default true. */
  ampEnv?: boolean;
  /** AHDSR → filter-cv. Default true als er een filter is. */
  filterEnv?: boolean;
  /** Velocity × amp-envelope via CV-math → VCA. Default true. */
  velocity?: boolean;
  /** LFO × modwheel (+ pitch-bend) → tune of modulation van de bron.
   *  Default: true als de bron zo'n ingang heeft. */
  vibrato?: boolean;
  /** LFO per stem die samen met de filter-envelope de cutoff moduleert. */
  voiceLfo?: boolean;
}

// ── Ops ─────────────────────────────────────────────────────────────────

interface OpBase {
  /** Korte uitleg in gewone taal voor de demonstratiemodus (ED-RC-4). */
  note?: string;
}

export type PatchOp =
  | (OpBase & { op: 'seedInternals' })
  | (OpBase & { op: 'addRack'; rack: Omit<Rack, 'slots' | 'polyGroups'> })
  | (OpBase & { op: 'addModule'; moduleId: string; slotId: string; typeId: string;
                rackId: string; row: number; hpOffset: number; name?: string })
  | (OpBase & { op: 'addPolyGroup'; rackId: string; group: PolyGroup })
  | (OpBase & { op: 'addPatch'; patch: Omit<Patch, 'connections' | 'controlState' | 'envelopes' | 'lfos'> })
  | (OpBase & { op: 'connect'; patchId: string; connection: PatchConnection })
  | (OpBase & { op: 'setControls'; patchId: string; moduleId: string;
                values: Record<string, ControlValue> })
  | (OpBase & { op: 'activate'; rackId: string; patchId: string });

export interface CompileResult {
  ops: PatchOp[];
  /** Niet-fatale opmerkingen (bijv. "stereo bron: alleen L gebruikt"). */
  warnings: string[];
  /** Samenvatting voor de preview: "8× poly · WT-VCO → VCF → VCA · bus: Diode". */
  summary: string;
  /** Id's van de belangrijkste resultaten, handig voor UI en tests. */
  rackId: string;
  patchId: string;
}

/** Fout in het recept zelf (onbekende module, ontbrekende poort, …). De
 *  boodschap is bedoeld om direct aan de gebruiker te tonen. */
export class RecipeError extends Error {
  constructor(message: string, public readonly suggestions: string[] = []) {
    super(message);
    this.name = 'RecipeError';
  }
}
