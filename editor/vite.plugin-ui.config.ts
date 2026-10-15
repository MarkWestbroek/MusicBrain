// Bouwt de bediening van de plugins (src/plugin-ui) als één pagina met vaste
// bestandsnamen, voor tools/plugin (JUCE neemt ze op als binary data):
//   MMB_JUCE_DIR=<pad naar JUCE> npm run build:plugin-ui
// De JUCE-frontendbibliotheek komt uit die checkout (alias `@juce`).
import * as path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { resolveBuildInfo } from './build-info';

const juceDir = process.env.MMB_JUCE_DIR;
if (!juceDir) throw new Error('Zet MMB_JUCE_DIR op de map van de JUCE-checkout (voor @juce/index.js)');
const info = resolveBuildInfo({ env: process.env, editorDir: __dirname });

export default defineConfig({
  root: path.resolve(__dirname, 'src/plugin-ui'),
  base: './',
  plugins: [react()],
  resolve: { alias: { '@juce': path.join(juceDir, 'modules/juce_gui_extra/native/javascript') } },
  define: {
    __MMB_EDITOR_VERSION__: JSON.stringify(info.editorVersion),
    __MMB_FIRMWARE_CONTRACT__: JSON.stringify(info.firmwareContract),
  },
  build: {
    outDir: path.resolve(__dirname, '../tools/plugin/web'),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      output: { entryFileNames: 'app.js', assetFileNames: 'app.[ext]', inlineDynamicImports: true },
    },
  },
});
