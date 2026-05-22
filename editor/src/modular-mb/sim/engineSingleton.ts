// Shared AudioEngine instance + React hook for status.
// Allows panels outside SimulationPanel (Rack, Patcher) to read live
// engine state — e.g. SEQ __currentStep for step-LEDs.

import { useEffect, useState } from 'react';
import { AudioEngine, type EngineStatus } from './AudioEngine';

// Side-effect import: populates the global runtime registry with concrete
// module classes (Vcf, …). Step 4 of the ADR-0009 migration will refactor
// AudioEngine to dispatch via this registry; for now the registration just
// proves the class hierarchy is wired correctly end-to-end.
import '../runtime';

let _engine: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (_engine === null) _engine = new AudioEngine();
  return _engine;
}

export function useEngineStatus(): EngineStatus {
  const engine = getEngine();
  const [status, setStatus] = useState<EngineStatus>(() => ({
    running: false, voiceFreqHz: 0, level: 0, liveControls: {},
  }));
  useEffect(() => engine.subscribe(setStatus), [engine]);
  return status;
}
