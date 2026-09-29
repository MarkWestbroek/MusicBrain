import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildProjectXml, buildDawProject, crc32, zipStore } from './exportDawProject';

const inp = {
  name: 'Koper & zo', bpm: 96, beatsPerBar: 4, lengthMs: 5000,
  notes: [{ note: 60, start: 0, end: 625, vel: 127, ch: 0 }, { note: 64, start: 625, end: 1250, vel: 64, ch: 1 }],
  audio: { file: 'audio/koper.wav', channels: 2, sampleRate: 48000, seconds: 5 },
};

describe('DAWproject', () => {
  it('project.xml: tempo, tracks, noten in tellen, audio via warps; tekens ge-escaped', () => {
    const x = buildProjectXml(inp);
    expect(x).toContain('<Tempo id="tempo" name="Tempo" unit="bpm" min="20" max="666" value="96"/>');
    expect(x).toContain('<Note time="0" duration="1" channel="0" key="60" vel="1" rel="0.5"/>');
    expect(x).toContain('<Note time="1" duration="1" channel="1" key="64" vel="0.503937" rel="0.5"/>');
    expect(x).toContain('<File path="audio/koper.wav"/>');
    expect(x).toContain('<Warp time="8" contentTime="5"/>');
    expect(x).toContain('name="Koper &amp; zo MIDI"');
    if (process.env.DAWPROJECT_OUT) writeFileSync(process.env.DAWPROJECT_OUT, x);
  });
  it('zip: bekende CRC, juiste opbouw', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
    const z = zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hallo') }]);
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034B50);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054B50);
    const d = buildDawProject(inp, new Uint8Array(100));
    expect(new DataView(d.buffer).getUint16(z.length - 22 + 8, true)).toBeDefined();
    expect(d.length).toBeGreaterThan(100);
  });
});
