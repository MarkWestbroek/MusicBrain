import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { modlinkRelay } from './modlink/relay';

// Bouwconstanten voor `requires` in een gedeelde patch (doc/plans/patch-pool.md):
// de editorversie uit de laatste cortex-tag en het firmwarecontract waarmee de
// editor is gebouwd. Buiten git (bv. een tarball) blijven ze leeg.
function editorVersion(): string {
  try { return execSync('git describe --tags --always --match "editor/cortex/*"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().replace(/^editor\/cortex\//, ''); }
  catch { return ''; }
}
function firmwareContract(): string {
  try { return String((JSON.parse(readFileSync(resolve(__dirname, '../firmware/app-modular-brain/contract/module-types.json'), 'utf8')) as { firmwareVersion?: string }).firmwareVersion ?? ''); }
  catch { return ''; }
}

export default defineConfig({
  plugins: [react(), modlinkRelay()],
  define: {
    __MMB_EDITOR_VERSION__: JSON.stringify(editorVersion()),
    __MMB_FIRMWARE_CONTRACT__: JSON.stringify(firmwareContract()),
  },
  // host: true zet de server ook op het lokale netwerk, zodat een telefoon
  // erbij kan. Zonder dit luistert Vite alleen op localhost.
  server: { port: 5173, host: true },
});
