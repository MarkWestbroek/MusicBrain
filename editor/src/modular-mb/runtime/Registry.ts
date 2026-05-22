import type { ModuleInstance, ModuleType } from '../types';
import type { Module, ControlValue } from './Module';

export type ModuleFactory = (
  type: ModuleType,
  instance: ModuleInstance,
  initialControlValues?: Record<string, ControlValue>,
) => Module;

/**
 * Registry — typeId → runtime-class factory.
 *
 * Replaces `switch(node.kind)` dispatch in AudioEngine. Each runtime class
 * registers itself once at module-load time; AudioEngine constructs instances
 * via `registry.create(instance, type)`.
 */
export class Registry {
  private factories = new Map<string, ModuleFactory>();

  register(typeId: string, factory: ModuleFactory): void {
    if (this.factories.has(typeId)) {
      throw new Error(`Registry: typeId "${typeId}" already registered`);
    }
    this.factories.set(typeId, factory);
  }

  has(typeId: string): boolean {
    return this.factories.has(typeId);
  }

  create(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues?: Record<string, ControlValue>,
  ): Module {
    // Lookup by *type id*, not instance.typeId, so external modules whose
    // type carries `simulatedBy` resolve to the proxy internal factory
    // (caller is responsible for passing the resolved proxy type).
    const factory = this.factories.get(type.id);
    if (!factory) {
      throw new Error(`Registry: no factory for type "${type.id}"`);
    }
    return factory(type, instance, initialControlValues);
  }

  knownTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}

/** Global registry singleton. Runtime classes register themselves here. */
export const registry = new Registry();
