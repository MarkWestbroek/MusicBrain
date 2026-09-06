import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { modlinkRelay } from './modlink/relay';

export default defineConfig({
  plugins: [react(), modlinkRelay()],
  // host: true zet de server ook op het lokale netwerk, zodat een telefoon
  // erbij kan. Zonder dit luistert Vite alleen op localhost.
  server: { port: 5173, host: true },
});
