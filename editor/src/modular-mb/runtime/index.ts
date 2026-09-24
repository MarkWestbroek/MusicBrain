export { Module, type ControlValue } from './Module';
export { CvModule } from './CvModule';
export { AudioModule } from './AudioModule';
export { ExternalModule } from './ExternalModule';
export { Registry, registry, type ModuleFactory } from './Registry';

// Concrete runtime classes — importing this barrel triggers their
// self-registration with the global `registry`. Sinds stap 6 van het
// parity-plan draait elke interne module als wasm (dezelfde code als de
// Teensy); er zijn geen Tone-nabouwsels meer.
export { WasmModule, dx7Host } from './audio';
export type { WasmZone, WasmBlob } from './audio';
