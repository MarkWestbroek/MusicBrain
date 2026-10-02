import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { modlinkRelay } from './modlink/relay';
import { resolveBuildInfo } from './build-info';

// Bouwconstanten voor `requires` in een gedeelde patch (doc/plans/patch-pool.md).
// Werkt ook in de deploy-container zonder git en zonder firmware/ (build-info.ts).
const info = resolveBuildInfo({ env: process.env, editorDir: __dirname });

export default defineConfig({
  plugins: [react(), modlinkRelay()],
  define: {
    __MMB_EDITOR_VERSION__: JSON.stringify(info.editorVersion),
    __MMB_FIRMWARE_CONTRACT__: JSON.stringify(info.firmwareContract),
  },
  // host: true zet de server ook op het lokale netwerk, zodat een telefoon
  // erbij kan. Zonder dit luistert Vite alleen op localhost.
  server: { port: 5173, host: true },
});
