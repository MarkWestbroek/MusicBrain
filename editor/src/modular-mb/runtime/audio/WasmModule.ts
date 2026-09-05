/// <reference types="vite/client" />
import * as Tone from 'tone';
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { AudioModule } from '../AudioModule';
import { registry } from '../Registry';

/**
 * WasmModule — een Teensy-module die als WebAssembly in de simulator draait
 * (tools/mmb-wasm: dezelfde DSP-kern als de firmware, mmb-wasm ABI).
 *
 * Eén AudioWorkletNode ('mmb-wasm', public/wasm/mmb-worklet.js) per
 * instantie met één mono-ingang per in-poort en één mono-uitgang per
 * uit-poort, in de volgorde van de moduledefinitie. Rond elke poort staat
 * een Tone.Gain zodat de engine ze als gewone Tone-nodes kan bekabelen —
 * audio én cv/gate zijn hier audio-rate signalen.
 *
 * Het klavier (of MIDI-In/sequencer) stuurt `voct`/`gate` als handmatige
 * waarde (`setInput`) op poorten zonder kabel.
 */
export class WasmModule extends AudioModule {
  static readonly typeIds: ReadonlySet<string> = new Set([
    'tp_mmb_elements', 'tp_mmb_rings', 'tp_mmb_marbles', 'tp_mmb_stages',
    'tp_mmb_peaks', 'tp_mmb_morph_wt', 'tp_mmb_clouds',
  ]);
  static supports(typeId: string): boolean { return WasmModule.typeIds.has(typeId); }

  private static worklet: Promise<void> | null = null;
  private static readonly wasm = new Map<string, Promise<Uint8Array>>();
  private static readonly instances = new Set<WasmModule>();
  static lastError: string | null = null;

  static info(): string | null {
    if (WasmModule.lastError) return `wasm: ${WasmModule.lastError}`;
    const n = WasmModule.instances.size;
    if (n === 0) return null;
    let ready = 0;
    for (const m of WasmModule.instances) if (m.node) ready++;
    return `wasm-modules: ${ready}/${n} actief`;
  }

  private static ensureWorklet(): Promise<void> {
    if (!WasmModule.worklet) {
      const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
      WasmModule.worklet = Tone.getContext().addAudioWorkletModule(`${base}wasm/mmb-worklet.js`);
      WasmModule.worklet.catch((err: unknown) => {
        WasmModule.worklet = null;
        WasmModule.lastError = err instanceof Error ? err.message : String(err);
      });
    }
    return WasmModule.worklet;
  }

  private static loadWasm(typeId: string): Promise<Uint8Array> {
    let p = WasmModule.wasm.get(typeId);
    if (!p) {
      const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
      p = fetch(`${base}wasm/${typeId}.wasm`).then(async (r) => {
        if (!r.ok) throw new Error(`${typeId}.wasm niet gevonden`);
        return new Uint8Array(await r.arrayBuffer());
      });
      p.catch(() => WasmModule.wasm.delete(typeId));
      WasmModule.wasm.set(typeId, p);
    }
    return p;
  }

  readonly inputIds: string[];
  readonly outputIds: string[];
  private readonly inGains = new Map<string, Tone.Gain>();
  private readonly outGains = new Map<string, Tone.Gain>();
  private node: AudioWorkletNode | null = null;
  private disposed = false;
  private pending: unknown[] = [];
  /** Poorten waar een kabel op zit (door de engine gezet). */
  readonly cabled = new Set<string>();
  /** Hulpnodes van de engine (lus-delays) — mee disposen. */
  readonly extra: Tone.ToneAudioNode[] = [];
  nativeRate = 0;

  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
  ) {
    super(type, instance, initialControlValues);
    this.inputIds = type.ports.filter((p) => p.direction === 'in').map((p) => p.id);
    this.outputIds = type.ports.filter((p) => p.direction === 'out').map((p) => p.id);
    for (const id of this.inputIds) this.inGains.set(id, new Tone.Gain(1));
    for (const id of this.outputIds) this.outGains.set(id, new Tone.Gain(1));
    WasmModule.instances.add(this);

    Promise.all([WasmModule.ensureWorklet(), WasmModule.loadWasm(type.id)]).then(([, wasm]) => {
      if (this.disposed) return;
      const node = Tone.getContext().createAudioWorkletNode('mmb-wasm', {
        numberOfInputs: Math.max(1, this.inputIds.length),
        numberOfOutputs: Math.max(1, this.outputIds.length),
        outputChannelCount: Array.from({ length: Math.max(1, this.outputIds.length) }, () => 1),
        processorOptions: { wasm, inputs: this.inputIds, outputs: this.outputIds },
      });
      node.port.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m?.t === 'ready') {
          this.nativeRate = Number(m.rate);
          if (m.unknownInputs?.length || m.unknownOutputs?.length) {
            console.info(`[wasm ${type.id}] poorten zonder wasm-tegenhanger:`, m.unknownInputs, m.unknownOutputs);
          }
        }
      };
      node.onprocessorerror = () => { WasmModule.lastError = `${type.id}: worklet-processor gecrasht`; };
      this.inputIds.forEach((id, k) => Tone.connect(this.inGains.get(id)!, node as unknown as AudioNode, 0, k));
      this.outputIds.forEach((id, j) => Tone.connect(node as unknown as AudioNode, this.outGains.get(id)!, j, 0));
      this.node = node;
      WasmModule.lastError = null;
      // Beginstand van alle controls, kabelstatus, dan de wachtrij.
      for (const [id, v] of Object.entries(this.controlValues)) {
        if (typeof v === 'number' || typeof v === 'boolean') this.post({ t: 'ctl', id, v: Number(v) });
      }
      for (const id of this.cabled) this.post({ t: 'cabled', id, on: true });
      for (const m of this.pending) this.post(m);
      this.pending = [];
    }).catch((err: unknown) => {
      WasmModule.lastError = `${type.id}: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[wasm] module niet geladen:', type.id, err);
    });
  }

  get input(): Tone.ToneAudioNode { return this.inGains.values().next().value ?? this.outGains.values().next().value!; }
  get output(): Tone.ToneAudioNode { return this.outGains.values().next().value!; }

  private post(m: unknown): void {
    if (this.node) this.node.port.postMessage(m);
    else this.pending.push(m);
  }

  /** Tone-ingang voor poort `id` (audio/cv/gate — allemaal signaal). */
  inGain(id: string): Tone.Gain | null { return this.inGains.get(id) ?? null; }
  outGain(id: string): Tone.Gain | null { return this.outGains.get(id) ?? null; }
  hasInput(id: string): boolean { return this.inGains.has(id); }
  hasOutput(id: string): boolean { return this.outGains.has(id); }

  /** Engine: er zit een kabel op ingang `id`. */
  markCabled(id: string): void {
    this.cabled.add(id);
    this.post({ t: 'cabled', id, on: true });
  }
  /** Handmatige ingangswaarde (klavier/MIDI-In/sequencer → voct/gate). */
  setInput(id: string, v: number): void {
    if (!this.inGains.has(id)) return;
    this.post({ t: 'in', id, v });
  }

  protected override onControlChanged(id: string, value: ControlValue): void {
    const n = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
    if (Number.isFinite(n)) this.post({ t: 'ctl', id, v: n });
  }

  update(): void { /* worklet rendert zelf */ }

  dispose(): void {
    this.disposed = true;
    WasmModule.instances.delete(this);
    if (this.node) {
      this.node.port.postMessage({ t: 'dispose' });
      try { (this.node as unknown as AudioNode).disconnect(); } catch { /* al los */ }
      this.node = null;
    }
    for (const g of this.inGains.values()) g.dispose();
    for (const g of this.outGains.values()) g.dispose();
    for (const n of this.extra) n.dispose();
    this.extra.length = 0;
  }
}

for (const id of WasmModule.typeIds) {
  registry.register(id, (type, instance, initialControlValues) => new WasmModule(type, instance, initialControlValues));
}
