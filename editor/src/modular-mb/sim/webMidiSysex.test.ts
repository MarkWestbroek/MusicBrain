import { describe, it, expect } from 'vitest';
import { WebMidiSource, type MidiEvent } from './MidiSource';
import { SysexCollector, SYSEX_CMD, encodePatchSysex } from './patchSysex';

describe('Web MIDI: SysEx komt binnen als eigen event', () => {
  it('F0-berichten worden sysex-events; de verzamelaar maakt er een patch van', async () => {
    const src = new WebMidiSource();
    const got: MidiEvent[] = [];
    src.subscribe((e) => got.push(e));
    const onMessage = (src as unknown as { onMessage: (ev: { data: Uint8Array }) => void }).onMessage;
    const msgs = await encodePatchSysex(SYSEX_CMD.editorPatch, JSON.stringify({ patches: [{ name: 'Via DAW' }] }));
    for (const m of msgs) onMessage({ data: m });
    onMessage({ data: Uint8Array.from([0x90, 60, 100]) });
    expect(got.filter((e) => e.kind === 'sysex')).toHaveLength(msgs.length);
    expect(got.at(-1)).toMatchObject({ kind: 'noteOn', note: 60 });
    const c = new SysexCollector();
    let r = null;
    for (const e of got) if (e.kind === 'sysex') r = await c.feed(e.data);
    expect(JSON.parse(r!.json).patches[0].name).toBe('Via DAW');
  });
});
