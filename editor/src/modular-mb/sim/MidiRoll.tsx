// De pianorol in de sim: de gedeelde MidiRoll uit take-player, met het
// editorpalet (de editor heeft geen site-tokens), tempo-bediening, spatie ook
// zonder focus en een verstelbare hoogte.

import { MidiRoll as CoreRoll, type Palette } from '../../take-player/MidiRoll';
import type { MidiFileSource } from './midiFilePlayer';

export { barStep, tapTempo, rulerHit, barEvery, describeRoll } from '../../take-player/MidiRoll';

/** Kleuren van de pianorol in de editor (donker, zoals het simulatiepaneel). */
export const EDITOR_PALETTE: Palette = {
  bg: '#0f172a', surface: '#1e293b', line: '#334155', label: '#94a3b8',
  notes: '#38bdf8', playhead: '#ef4444', region: '#f59e0b',
  mod: '#4ade80', at: '#f472b6', bend: '#a78bfa', cc: '#94a3b8',
};

export function MidiRoll({ source, canPlay = true, onRequestStart, height }: {
  source: MidiFileSource;
  canPlay?: boolean;
  onRequestStart?: () => void;
  height?: number;
}): JSX.Element {
  return (
    <CoreRoll playback={source} canPlay={canPlay} onRequestStart={onRequestStart} height={height}
      gridControls keyScope="window" palette={EDITOR_PALETTE} tokens={false} />
  );
}
