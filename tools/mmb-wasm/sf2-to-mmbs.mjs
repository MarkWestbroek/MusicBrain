// sf2-to-mmbs — zet een SoundFont-preset om in een MMB-samplebank.
//
//   node tools/mmb-wasm/sf2-to-mmbs.mjs <bestand.sf2>                 lijst de presets
//   node tools/mmb-wasm/sf2-to-mmbs.mjs <bestand.sf2> <preset> [uit]  converteert er één
//
// <preset> is het nummer uit de lijst, of een stuk van de naam ("piano").
// Zonder [uit] komt de bank naast het bronbestand te staan als <naam>.mmbs.
// Met --vel-track=<dB> stel je de velocity-gevoeligheid in (default 24): een
// SF2 laat de dynamiek over aan een modulator die wij niet nabouwen, dus
// zonder dit klinken alle lagen even hard. --vel-track=0 zet hem uit.
// Met --vel-layers=<n> houd je hoogstens n velocity-lagen over: een
// gesampelde vleugel heeft er vijf en dus vijf keer het geheugen, terwijl de
// Teensy de hele bank in PSRAM leest.
//
// Het zware werk staat in editor/src/modular-mb/sf2.ts, zodat de editor
// dezelfde conversie doet als je daar een .sf2 in de Multisample-import gooit.
// Dit script bundelt die TypeScript met esbuild en draait 'm onder node.
//
// Let op de licentie van de SoundFont die je omzet: de meeste zijn vrij te
// gebruiken maar niet vrij te herdistribueren. De bank die hieruit komt is
// een afgeleide; zet 'm dus niet in deze repo.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flags = new Map(argv.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v = ''] = a.slice(2).split('=');
  return [k, v];
}));
const [sf2Path, presetArg, outArg] = argv.filter((a) => !a.startsWith('--'));
const velTrackDb = flags.has('vel-track') ? Number(flags.get('vel-track')) : 24;
const velLayers = flags.has('vel-layers') ? Number(flags.get('vel-layers')) : undefined;
if (!sf2Path) {
  console.error('gebruik: node tools/mmb-wasm/sf2-to-mmbs.mjs <bestand.sf2> [preset] [uit.mmbs]');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'mmb-sf2-'));
execFileSync(join(root, 'editor/node_modules/.bin/esbuild'), [
  join(root, 'editor/src/modular-mb/sf2.ts'),
  join(root, 'editor/src/modular-mb/sampleBank.ts'),
  '--bundle', '--format=esm', '--platform=neutral', `--outdir=${tmp}`,
], { stdio: 'pipe' });
const S = await import(join(tmp, 'sf2.js'));
const B = await import(join(tmp, 'sampleBank.js'));

const raw = readFileSync(sf2Path);
const sf2 = S.readSf2(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

console.log(`${sf2.name}${sf2.engineer ? ` — ${sf2.engineer}` : ''}`);
if (sf2.copyright) console.log(sf2.copyright.replace(/\s+/g, ' '));
console.log(`${sf2.presets.length} presets, ${sf2.tables.shdr.length - 1} samples, ` +
  `${(sf2.tables.smpl.length * 2 / 1048576).toFixed(1)} MB sampledata\n`);

if (presetArg === undefined) {
  for (const p of sf2.presets) {
    console.log(`  ${String(p.index).padStart(3)}  bank ${String(p.bank).padStart(3)} ` +
      `prog ${String(p.program).padStart(3)}  ${p.name.padEnd(22)} ${p.zones} zones`);
  }
  console.log('\nkies er een: node tools/mmb-wasm/sf2-to-mmbs.mjs <bestand.sf2> <nummer|naam>');
  process.exit(0);
}

// Nummer of naamfragment.
const byIndex = /^\d+$/.test(presetArg) ? sf2.presets.find((p) => p.index === Number(presetArg)) : null;
const match = byIndex ?? sf2.presets.find((p) => p.name.toLowerCase().includes(presetArg.toLowerCase()));
if (!match) {
  console.error(`geen preset gevonden voor "${presetArg}"`);
  process.exit(1);
}

const { name, slots, zones, skipped } = S.sf2ToBank(sf2, match.index, { velTrackDb, velLayers });
if (!slots.length) {
  console.error(`preset "${match.name}" leverde geen samples op`);
  process.exit(1);
}

const keys = zones.reduce((r, z) => [Math.min(r[0], z.lowKey), Math.max(r[1], z.highKey)], [127, 0]);
const layerCount = new Set(zones.map((z) => `${z.lowVel}-${z.highVel}`)).size;
const looped = zones.filter((z) => z.loopMode !== 0).length;
console.log(`preset ${match.index}: "${match.name}"`);
console.log(`  ${B.bankSummary(slots, zones)}`);
console.log(`  toetsen ${keys[0]}–${keys[1]} · ${layerCount} velocity-la${layerCount === 1 ? 'ag' : 'gen'} · ` +
  `${looped}/${zones.length} zones loopen${skipped ? ` · ${skipped} zones overgeslagen` : ''}`);
console.log(`  rates: ${[...new Set(slots.map((s) => s.rate))].sort((a, b) => a - b).join(', ')} Hz` +
  `${velTrackDb ? ` · velocity-tracking ${velTrackDb} dB` : ' · geen velocity-tracking'}`);

// De Teensy leest de hele bank in PSRAM; 8 MB is de kleine variant.
const mb = slots.reduce((n, s) => n + s.data.length * 2, 0) / 1048576;
if (mb > 7) {
  console.log(`  ⚠ ${mb.toFixed(0)} MB — past niet in 8 MB PSRAM op de Teensy. Voor de browser is het geen probleem;`);
  console.log(`    voor hardware: --vel-layers=${velLayers && velLayers > 1 ? velLayers - 1 : 2} scheelt evenredig.`);
}

const out = outArg ?? join(dirname(sf2Path), `${(name || basename(sf2Path)).replace(/[^\w-]+/g, '_')}.mmbs`);
writeFileSync(out, Buffer.from(B.buildBank(name.slice(0, 31), slots, zones)));
console.log(`\ngeschreven: ${out}`);

// Terugleescontrole — dezelfde parser die de editor gebruikt.
const back = readFileSync(out);
const p = B.parseBank(back.buffer.slice(back.byteOffset, back.byteOffset + back.byteLength));
console.log(`teruggelezen: "${p.name}" · ${p.slots.length} slots · ${p.zones.length} zones` +
  `${p.slots.length === slots.length && p.zones.length === zones.length ? ' ✓' : ' ✗'}`);
