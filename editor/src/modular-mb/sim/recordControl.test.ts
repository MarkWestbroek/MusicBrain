import { describe, expect, it, vi } from 'vitest';

import { bindRecordHandlers, publishRecordState, recordAvailable, toggleRecording } from './recordControl';

describe('recordControl', () => {
  it('start als er niets loopt, stopt als de opname loopt, en doet niets zonder paneel', () => {
    const idle = { recording: false, secs: 0, done: null, error: null };
    publishRecordState(idle);
    toggleRecording();   // nog geen paneel aangemeld: geen fout
    expect(recordAvailable()).toBe(false);

    const start = vi.fn(async () => {}), stop = vi.fn(async () => {});
    const unbind = bindRecordHandlers({ start, stop });
    expect(recordAvailable()).toBe(true);
    toggleRecording();
    expect(start).toHaveBeenCalledTimes(1);
    publishRecordState({ ...idle, recording: true, secs: 1.5 });
    toggleRecording();
    expect(stop).toHaveBeenCalledTimes(1);

    unbind();
    publishRecordState(idle);
    toggleRecording();
    expect(start).toHaveBeenCalledTimes(1);
  });
});
