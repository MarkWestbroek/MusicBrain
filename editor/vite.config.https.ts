// Dev-server over https, voor de telefoon op het lokale netwerk.
//
// AudioWorklet (de wasm-modules), Web MIDI en de microfoon werken in de
// browser alleen in een "secure context": https of localhost. Op de pc is
// http://localhost:5173 dus prima, maar een telefoon die via
// http://192.168.x.x:5173 binnenkomt krijgt "AudioWorkletNode is only
// available in a secure context" en geen MIDI. Dit profiel zet een
// zelfondertekend certificaat voor de gewone config (`npm run dev:https`);
// de telefoon vraagt eenmalig om het certificaat te accepteren.
import { defineConfig, mergeConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

import base from './vite.config';

export default mergeConfig(base, defineConfig({ plugins: [basicSsl()] }));
