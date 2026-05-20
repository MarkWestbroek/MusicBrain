// Shared AudioEngine instance + React hook for status.
// Allows panels outside SimulationPanel (Rack, Patcher) to read live
// engine state — e.g. SEQ __currentStep for step-LEDs.
import { useEffect, useState } from 'react';
import { AudioEngine } from './AudioEngine';
let _engine = null;
export function getEngine() {
    if (_engine === null)
        _engine = new AudioEngine();
    return _engine;
}
export function useEngineStatus() {
    const engine = getEngine();
    const [status, setStatus] = useState(() => ({
        running: false, voiceFreqHz: 0, level: 0, liveControls: {},
    }));
    useEffect(() => engine.subscribe(setStatus), [engine]);
    return status;
}
