// De parameters van de plugin MMB DX7 (tools/plugin/src/Dx7Plugin.h): elke
// byte van de uitgepakte DX7-stem (dx7Patch.ts) als DAW-parameter, behalve
// de naam en de operator-aan/uit. Zo kan Logic ze automatiseren en kan een
// control surface (Roto-Control via Logic) ze leren.
//
// Volgorde: eerst het algemene deel, dan per operator OP1..OP6 de toon,
// de envelope en de toetsschaal: dezelfde groepen als de Roto-pagina's
// (dx7Roto.ts), zodat ze in de DAW bij elkaar staan.
//
// Waarde in de DAW = byte + bias (algoritme 1..32 zoals op de DX7,
// transpose −24..+24 halve tonen).

import { CURVES, DX7, LFO_WAVES, opOffset } from './dx7Patch';

export interface Dx7PluginParam {
  id: string;
  name: string;
  /** Byte in de uitgepakte stem (156 bytes). */
  offset: number;
  /** Hoogste byte-waarde. */
  max: number;
  /** DAW-waarde = byte + bias. */
  bias: number;
  /** Keuze: naam per stand. */
  steps?: readonly string[];
}

const p = (id: string, name: string, offset: number, max: number, extra: Partial<Dx7PluginParam> = {}): Dx7PluginParam =>
  ({ id, name, offset, max, bias: 0, ...extra });

const OFF_ON = ['uit', 'aan'] as const;

function global(): Dx7PluginParam[] {
  return [
    p('alg', 'Algoritme', DX7.algorithm, 31, { bias: 1 }),
    p('feedback', 'Feedback', DX7.feedback, 7),
    p('transpose', 'Transpose', DX7.transpose, 48, { bias: -24 }),
    p('oscsync', 'Osc Sync', DX7.oscSync, 1, { steps: OFF_ON }),
    p('lfo_wave', 'LFO Golf', DX7.lfoWave, 5, { steps: LFO_WAVES }),
    p('lfo_speed', 'LFO Speed', DX7.lfoSpeed, 99),
    p('lfo_delay', 'LFO Delay', DX7.lfoDelay, 99),
    p('lfo_pmd', 'LFO PMD', DX7.lfoPmd, 99),
    p('lfo_amd', 'LFO AMD', DX7.lfoAmd, 99),
    p('lfo_sync', 'LFO Sync', DX7.lfoSync, 1, { steps: OFF_ON }),
    p('pms', 'Pitch Mod Sens', DX7.pitchModSens, 7),
    ...[0, 1, 2, 3].map((k) => p(`peg_r${k + 1}`, `Pitch EG R${k + 1}`, DX7.pitchRate + k, 99)),
    ...[0, 1, 2, 3].map((k) => p(`peg_l${k + 1}`, `Pitch EG L${k + 1}`, DX7.pitchLevel + k, 99)),
  ];
}

function operator(op: number): Dx7PluginParam[] {
  const o = opOffset(op);
  const n = (s: string) => `OP${op} ${s}`;
  const id = (s: string) => `op${op}_${s}`;
  return [
    // Toon
    p(id('level'), n('Level'), o + DX7.op.outputLevel, 99),
    p(id('mode'), n('Mode'), o + DX7.op.oscMode, 1, { steps: ['ratio', 'vast'] }),
    p(id('coarse'), n('Coarse'), o + DX7.op.freqCoarse, 31),
    p(id('fine'), n('Fine'), o + DX7.op.freqFine, 99),
    p(id('detune'), n('Detune'), o + DX7.op.detune, 14, { bias: -7 }),
    p(id('vel'), n('Velocity'), o + DX7.op.velSens, 7),
    p(id('ratescale'), n('Rate Scale'), o + DX7.op.rateScaling, 7),
    p(id('ams'), n('Amp Mod'), o + DX7.op.ampModSens, 3),
    // Envelope
    ...[0, 1, 2, 3].map((k) => p(id(`r${k + 1}`), n(`R${k + 1}`), o + DX7.op.rate + k, 99)),
    ...[0, 1, 2, 3].map((k) => p(id(`l${k + 1}`), n(`L${k + 1}`), o + DX7.op.level + k, 99)),
    // Toetsschaal
    p(id('break'), n('Break Point'), o + DX7.op.breakPoint, 99),
    p(id('ldepth'), n('L Depth'), o + DX7.op.leftDepth, 99),
    p(id('rdepth'), n('R Depth'), o + DX7.op.rightDepth, 99),
    p(id('lcurve'), n('L Curve'), o + DX7.op.leftCurve, 3, { steps: CURVES }),
    p(id('rcurve'), n('R Curve'), o + DX7.op.rightCurve, 3, { steps: CURVES }),
  ];
}

/** Alle parameters, in de volgorde van de plugin. */
export const DX7_PLUGIN_PARAMS: readonly Dx7PluginParam[] = [...global(), ...[1, 2, 3, 4, 5, 6].flatMap(operator)];

/** Stem (156 bytes) → DAW-waarden per parameter. */
export function dx7ParamValues(voice: Uint8Array): number[] {
  return DX7_PLUGIN_PARAMS.map((x) => Math.min(x.max, voice[x.offset] ?? 0) + x.bias);
}
