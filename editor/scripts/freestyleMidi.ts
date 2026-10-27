// De song van een freestyle-stijl als MIDI-bestand (type 1, een spoor per
// stem), voor Logic of een andere DAW:  npx tsx scripts/freestyleMidi.ts dark [uit.mid]
// Standaard naar spinoffs/freestyle-machine/midi/<stijl>-<bpm>.mid.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DEFAULT_FORM, encodeSongMidi, songNotes, TRACKS } from '../src/freestyle/songMidi';
import { styleById, STYLES } from '../src/freestyle/style';

const id = process.argv[2] ?? 'dark';
if (!STYLES.some((s) => s.id === id)) { console.error(`onbekende stijl ${id}; kies uit ${STYLES.map((s) => s.id).join(', ')}`); process.exit(1); }
const style = styleById(id);
const out = resolve(process.argv[3] ?? `../spinoffs/freestyle-machine/midi/${style.id}-${style.bpm}.mid`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodeSongMidi(style));
const song = songNotes(style);
const bars = DEFAULT_FORM.reduce((n, p) => n + p.bars, 0);
console.log(`${out}: ${style.name}, ${style.bpm} bpm, ${bars} maten (${Math.round((bars * 4 * 60) / style.bpm)} s)`);
for (const t of TRACKS) console.log(`  ${t.padEnd(6)} ${String(song[t].length).padStart(5)} noten`);
console.log(`  markers: ${song.markers.map((m) => m.text).join(' | ')}`);
