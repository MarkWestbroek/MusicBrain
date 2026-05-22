import type { ModuleInstance, ModuleType, Port, Control } from '../types';

export type ControlValue = number | boolean | string | number[];

export abstract class Module {
  readonly id: string;
  readonly typeId: string;
  protected readonly type: ModuleType;
  protected readonly instance: ModuleInstance;
  protected controlValues: Record<string, ControlValue> = {};

  constructor(type: ModuleType, instance: ModuleInstance) {
    this.type = type;
    this.instance = instance;
    this.id = instance.id;
    this.typeId = instance.typeId;
  }

  get ports(): Port[] {
    return this.instance.portsOverride ?? this.type.ports;
  }

  get controls(): Control[] {
    return this.instance.controlsOverride ?? this.type.controls;
  }

  setControl(id: string, value: ControlValue): void {
    this.controlValues[id] = value;
    this.onControlChanged(id, value);
  }

  getControl(id: string): ControlValue | undefined {
    return this.controlValues[id];
  }

  protected onControlChanged(_id: string, _value: ControlValue): void {
    // Subclasses override to react to live parameter changes.
  }

  abstract dispose(): void;
}
