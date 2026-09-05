// Bundelt dx7-core.js + dx7-worklet.src.js tot één zelfstandige worklet-
// module (editor/public/dx7/dx7-worklet.js). Nodig omdat Tone/standardized-
// audio-context de module-tekst ophaalt en uit een Blob laadt: relatieve
// `import`s lossen dan niet meer op. Draai na elke wijziging aan een van
// beide bronnen:   node tools/dx7-wasm/bundle-worklet.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const core = readFileSync(join(root, 'editor/public/dx7/dx7-core.js'), 'utf8')
  .replace(/^export (class|function|const|let) /gm, '$1 ');
const src = readFileSync(join(here, 'dx7-worklet.src.js'), 'utf8')
  .replace(/^import .*?;\n/m, '');
const out = `// GEGENEREERD door tools/dx7-wasm/bundle-worklet.mjs — niet met de hand bewerken.
// Bron: editor/public/dx7/dx7-core.js + tools/dx7-wasm/dx7-worklet.src.js
${core}
// ═══════════════════════════════════════════════════════════════════════
${src}`;
writeFileSync(join(root, 'editor/public/dx7/dx7-worklet.js'), out);
console.log('geschreven: editor/public/dx7/dx7-worklet.js', out.length, 'bytes');
