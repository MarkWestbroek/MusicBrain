import { Module } from './Module';

/**
 * ExternalModule — Eurorack module that the brain does not synthesise.
 *
 * Carries routing metadata and persisted control values only; has no audio
 * or CV processing code. In the web simulator, an external module is voiced
 * by a proxy internal module (see `ModuleDefinition.simulatedBy`).
 *
 * Concrete and data-driven: one class for all external modules.
 */
export class ExternalModule extends Module {
  dispose(): void {
    // No resources to release.
  }
}
