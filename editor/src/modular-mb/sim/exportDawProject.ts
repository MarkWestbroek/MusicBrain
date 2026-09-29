// exportDawProject — een take als DAWproject (open formaat van Bitwig en
// PreSonus; Bitwig, Studio One, Cubase 14+). Een zip met project.xml,
// metadata.xml en de wav in audio/. Structuur volgens Project.xsd van
// github.com/bitwig/dawproject: een notes-track met één Notes-clip, een
// audio-track met de wav via Warps (seconden → tellen), en een master.
// Controllers gaan (nog) niet mee: DAWproject zet die als automation-Points
// op parameters, dat is een eigen stap.

import type { EditNote } from '../../take-player/noteEdit';

// ── zip (STORE, geen compressie) ──────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xFF]! ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Minimale zip (STORE) met vaste datum; genoeg voor DAWproject. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034B50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, DOS_TIME, true); lv.setUint16(12, DOS_DATE, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014B50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, DOS_TIME, true); cv.setUint16(14, DOS_DATE, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); ch.set(name, 46);
    parts.push(lh, f.data); central.push(ch);
    offset += lh.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054B50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// ── project.xml ───────────────────────────────────────────────────────
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (x: number): string => (Math.round(x * 1e6) / 1e6).toString();

export interface DawProjectInput {
  name: string;
  bpm: number;
  beatsPerBar: number;
  lengthMs: number;
  notes: EditNote[];
  audio?: { file: string; channels: number; sampleRate: number; seconds: number };
}

export function buildProjectXml(inp: DawProjectInput): string {
  const bpm = Math.max(20, Math.min(400, inp.bpm || 120));
  const beats = (ms: number): number => (ms / 60_000) * bpm;
  const lenBeats = beats(inp.lengthMs);
  const L: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project version="1.0">',
    '  <Application name="MusicBrain editor" version="1.0"/>',
    '  <Transport>',
    `    <Tempo id="tempo" name="Tempo" unit="bpm" min="20" max="666" value="${num(bpm)}"/>`,
    `    <TimeSignature id="timesig" numerator="${Math.max(1, Math.round(inp.beatsPerBar || 4))}" denominator="4"/>`,
    '  </Transport>',
    '  <Structure>',
  ];
  const track = (id: string, type: string, name: string): void => {
    L.push(`    <Track id="${id}" name="${esc(name)}" contentType="${type}" loaded="true">`,
      `      <Channel id="${id}-ch" role="regular" audioChannels="2" destination="master-ch">`,
      `        <Volume id="${id}-vol" name="Volume" unit="linear" min="0" max="2" value="1"/>`,
      '      </Channel>', '    </Track>');
  };
  if (inp.notes.length) track('midi', 'notes', `${inp.name} MIDI`);
  if (inp.audio) track('audio', 'audio', `${inp.name} audio`);
  L.push('    <Track id="master" name="Master" contentType="audio notes" loaded="true">',
    '      <Channel id="master-ch" role="master" audioChannels="2">',
    '        <Volume id="master-vol" name="Volume" unit="linear" min="0" max="2" value="1"/>',
    '      </Channel>', '    </Track>', '  </Structure>',
    '  <Arrangement id="arr">', '    <Lanes id="arr-lanes" timeUnit="beats">');
  if (inp.notes.length) {
    L.push('      <Lanes id="midi-lanes" track="midi">', '        <Clips id="midi-clips">',
      `          <Clip time="0" duration="${num(lenBeats)}" playStart="0" name="${esc(inp.name)}">`, '            <Notes id="midi-notes">');
    for (const n of inp.notes) {
      L.push(`              <Note time="${num(beats(n.start))}" duration="${num(Math.max(0.001, beats(n.end - n.start)))}" channel="${n.ch & 15}" key="${n.note & 127}" vel="${num(n.vel / 127)}" rel="0.5"/>`);
    }
    L.push('            </Notes>', '          </Clip>', '        </Clips>', '      </Lanes>');
  }
  if (inp.audio) {
    const a = inp.audio;
    L.push('      <Lanes id="audio-lanes" track="audio">', '        <Clips id="audio-clips">',
      `          <Clip time="0" duration="${num(lenBeats)}" playStart="0" name="${esc(inp.name)}">`,
      '            <Clips id="audio-inner">',
      `              <Clip time="0" duration="${num(lenBeats)}" contentTimeUnit="beats" playStart="0">`,
      '                <Warps id="audio-warps" contentTimeUnit="seconds" timeUnit="beats">',
      `                  <Audio id="audio-file" channels="${a.channels}" sampleRate="${a.sampleRate}" duration="${num(a.seconds)}">`,
      `                    <File path="${esc(a.file)}"/>`, '                  </Audio>',
      '                  <Warp time="0" contentTime="0"/>',
      `                  <Warp time="${num(beats(a.seconds * 1000))}" contentTime="${num(a.seconds)}"/>`,
      '                </Warps>', '              </Clip>', '            </Clips>', '          </Clip>', '        </Clips>', '      </Lanes>');
  }
  L.push('    </Lanes>', '  </Arrangement>', '  <Scenes/>', '</Project>', '');
  return L.join('\n');
}

export function buildMetadataXml(title: string): string {
  return ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', '<MetaData>',
    `  <Title>${esc(title)}</Title>`, '  <Comment>Gemaakt met de MusicBrain-editor</Comment>', '</MetaData>', ''].join('\n');
}

/** Het complete .dawproject-bestand. */
export function buildDawProject(inp: DawProjectInput, wav?: Uint8Array): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const files: { name: string; data: Uint8Array }[] = [
    { name: 'project.xml', data: enc.encode(buildProjectXml(inp)) },
    { name: 'metadata.xml', data: enc.encode(buildMetadataXml(inp.name)) },
  ];
  if (inp.audio && wav) files.push({ name: inp.audio.file, data: wav });
  return zipStore(files);
}
