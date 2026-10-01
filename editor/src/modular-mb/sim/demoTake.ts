// demoTake — een demo-opname van de actieve patch, zonder handen: de sim
// speelt een vaste testsequentie (akkoord, loopje, modwheel en aftertouch
// erbij) en de wav + mid worden opgenomen zoals bij ⏺ Opname. Voor een
// voorstel naar de patch-pool als er nog geen take is.

import type { AudioEngine } from './AudioEngine';
import { MasterRecorder, encodeWav, wavFileName } from './wavRecorder';
import { MidiRecorder, encodeSmf, patchSnapshot, siblingName } from './midiRecorder';
import type { Take } from './mediaLibrary';
import type { ModularProject, Patch } from '../types';

/** De sequentie in ms vanaf de start: noten (aan/uit), modwheel-sweep, aftertouch. */
export interface DemoStep { t: number; kind: 'on' | 'off' | 'cc' | 'at' | 'bend'; note?: number; vel?: number; cc?: number; value?: number }

export const DEMO_BPM = 100;

/** ~9 s: C-majeur-loopje, dan een Cmaj7 met modwheel omhoog en aftertouch, dan los. */
export function demoScript(): DemoStep[] {
  const beat = 60_000 / DEMO_BPM;
  const s: DemoStep[] = [];
  const line = [60, 64, 67, 72, 67, 64, 60, 55];
  line.forEach((n, i) => { s.push({ t: i * beat / 2, kind: 'on', note: n, vel: 0.85 }); s.push({ t: i * beat / 2 + beat * 0.38, kind: 'off', note: n }); });
  const t1 = 4 * beat + beat / 2;
  for (const n of [60, 64, 67, 71]) s.push({ t: t1, kind: 'on', note: n, vel: 0.8 });
  for (let i = 0; i <= 16; i++) s.push({ t: t1 + i * (beat / 4), kind: 'cc', cc: 1, value: Math.round(127 * i / 16) });
  for (let i = 0; i <= 16; i++) s.push({ t: t1 + 4 * beat + i * (beat / 4), kind: 'at', value: Math.round(127 * Math.sin(Math.PI * i / 16)) });
  const t2 = t1 + 8 * beat;
  for (const n of [60, 64, 67, 71]) s.push({ t: t2, kind: 'off', note: n });
  s.push({ t: t2 + 10, kind: 'cc', cc: 1, value: 0 }, { t: t2 + 10, kind: 'at', value: 0 });
  return s.sort((a, b) => a.t - b.t);
}

/** Totale lengte inclusief een staart voor release en galm. */
export function demoLengthMs(script = demoScript(), tailMs = 2500): number {
  return (script.at(-1)?.t ?? 0) + tailMs;
}

/**
 * Neem de demo op. De engine moet gebouwd zijn voor `patch` (de Simulatie-tab
 * doet dat voor de actieve patch); start hem zo nodig. Geeft een Take terug
 * zoals ⏺ Opname die maakt (wav, mid, patch.json), met dezelfde naam.
 */
export async function recordDemo(
  engine: AudioEngine, project: ModularProject, patch: Patch, onProgress?: (frac: number) => void,
): Promise<Take> {
  const script = demoScript();
  const total = demoLengthMs(script);
  await engine.start();
  const rec = new MasterRecorder();
  const midi = new MidiRecorder();
  await rec.start(engine.recorderTap());
  midi.start();
  const unsub = engine.onMidi(midi.record);
  const t0 = performance.now();
  let i = 0;
  await new Promise<void>((resolve) => {
    const tick = (): void => {
      const now = performance.now() - t0;
      while (i < script.length && script[i]!.t <= now) {
        const st = script[i++]!;
        if (st.kind === 'on') engine.noteOn(st.note!, st.vel ?? 0.8);
        else if (st.kind === 'off') engine.noteOff(st.note!);
        else if (st.kind === 'cc') engine.controlChange(st.cc!, st.value!);
        else if (st.kind === 'at') engine.pressure(st.value!);
        else engine.pitchBend(st.value!);
      }
      onProgress?.(Math.min(1, now / total));
      if (now >= total) resolve(); else setTimeout(tick, 5);
    };
    tick();
  });
  unsub();
  const r = await rec.stop();
  const events = midi.stop(r.seconds * 1000);
  const name = wavFileName(patch.name);
  const files: Take['files'] = [
    { name, blob: new Blob([encodeWav(r.channels, r.sampleRate, 'i24')], { type: 'audio/wav' }) },
    { name: siblingName(name, '.mid'), blob: new Blob([encodeSmf(events, { lengthMs: r.seconds * 1000, name: patch.name, bpm: DEMO_BPM })], { type: 'audio/midi' }) },
    { name: siblingName(name, '.patch.json'), blob: new Blob([JSON.stringify(patchSnapshot(project, patch), null, 1)], { type: 'application/json' }) },
  ];
  return { group: siblingName(name, ''), files };
}
