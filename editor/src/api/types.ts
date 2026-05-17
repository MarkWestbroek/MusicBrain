// Mirror of the patch types defined in firmware/core/include/mb/Patch.h.
// Will be code-generated from doc/protocols/schemas/ once those exist
// (ADR 0002, ADR 0005). Hand-maintained for now.

export type PatchKind = 'effect' | 'amp' | 'synth';

export interface PatchBase {
  id: number;
  schemaVersion: number;
  name: string;
  kind: PatchKind;
}

export interface EffectPatch extends PatchBase {
  kind: 'effect';
  body: { loops: number };  // bitmask
}

export interface AmpPatch extends PatchBase {
  kind: 'amp';
  body: {
    preamp: Record<string, string>;     // preampIn -> preampOut
    speaker: Record<string, string>;    // powerAmp -> speaker
    muteMs: number;
  };
}

export interface SynthPatch extends PatchBase {
  kind: 'synth';
  body: Record<string, unknown>;        // to be elaborated; see app-modular-brain/README.md
}

export type Patch = EffectPatch | AmpPatch | SynthPatch;
