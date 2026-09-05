export { Module, type ControlValue } from './Module';
export { CvModule } from './CvModule';
export { AudioModule } from './AudioModule';
export { ExternalModule } from './ExternalModule';
export { Registry, registry, type ModuleFactory } from './Registry';

// Concrete runtime classes — importing this barrel triggers their
// self-registration with the global `registry`.
export { Filter, Vcf, Ladder, Ms20, Vco, FmVco, Vca, Dx7 } from './audio';
export { Ahdsr, Lfo } from './cv';
