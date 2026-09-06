/// <reference types="vite/client" />
import * as Tone from 'tone';

/** Eén sample in de gedeelde bank (interleaved, `channels` per frame). */
export interface WasmBlob { data: Int16Array; rate: number; name: string; channels: number }

/** Eén zone in de keymap — spiegelt `mmb_dsp::Zone`. */
export interface WasmZone {
  slot: number;
  lowKey: number; highKey: number;
  lowVel: number; highVel: number;
  root: number; tuneCents: number;
  gain: number; pan: number;
  /** 0 = geen, 1 = one-shot, 2 = continu, 3 = tot note-off. */
  loopMode: number; loopStart: number; loopEnd: number;
  decay: number; release: number;
  /** dB velocity-tracking binnen de zone; 0 = uit (niveau komt uit het sample). */
  velTrack?: number;
}
import type { ModuleInstance, ModuleType, ControlValue } from '../../types';
import { AudioModule } from '../AudioModule';
import { registry } from '../Registry';
import { addWorkletModule } from './workletLoader';

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
    'tp_mmb_plaits', 'tp_mmb_tides', 'tp_mmb_warps', 'tp_mmb_tape_echo', 'tp_mmb_sampler',
  ]);
  static supports(typeId: string): boolean { return WasmModule.typeIds.has(typeId); }

  /**
   * Modules die hun eigen stemmen hebben en dus élke noot los willen krijgen,
   * in plaats van één gate-flank met één V/Oct. De wasm-kant herken je aan de
   * export `mmb_note_on`; de engine moet het al bij het bouwen weten, vandaar
   * deze lijst. Voor de rest blijft de CV-weg gelden — Elements en Rings zijn
   * per instantie één stem, daar is een PolyGroup het antwoord.
   */
  static readonly polyTypeIds: ReadonlySet<string> = new Set(['tp_mmb_sampler']);
  static isPoly(typeId: string): boolean { return WasmModule.polyTypeIds.has(typeId); }

  private static worklet: Promise<void> | null = null;
  private static readonly wasm = new Map<string, Promise<Uint8Array>>();
  private static readonly instances = new Set<WasmModule>();
  static lastError: string | null = null;

  /** Blobs (samples) per typeId en slot — gedeeld door alle instanties van
   *  dat type, zoals de PSRAM-bank op de Teensy. */
  private static readonly blobs = new Map<string, Map<number, WasmBlob>>();
  /** Keymap per typeId — gedeeld door alle instanties, zoals de bank. */
  private static readonly zoneMaps = new Map<string, WasmZone[]>();

  /** Sample naar slot `slot` van alle (huidige en toekomstige) instanties. */
  static setBlob(
    typeId: string, slot: number, data: Int16Array, rate: number,
    name = '', channels = 1,
  ): void {
    let m = WasmModule.blobs.get(typeId);
    if (!m) { m = new Map(); WasmModule.blobs.set(typeId, m); }
    m.set(slot, { data, rate, name, channels });
    for (const inst of WasmModule.instances) if (inst.typeId === typeId) inst.postBlob(slot, data, rate, channels);
  }
  /** Keymap zetten (vervangt de vorige). */
  static setZones(typeId: string, zones: WasmZone[]): void {
    WasmModule.zoneMaps.set(typeId, zones);
    for (const inst of WasmModule.instances) if (inst.typeId === typeId) inst.postZones(zones);
  }
  static getZones(typeId: string): WasmZone[] { return WasmModule.zoneMaps.get(typeId) ?? []; }
  static getBlobs(typeId: string): Map<number, WasmBlob> { return WasmModule.blobs.get(typeId) ?? new Map(); }
  static blobList(typeId: string): { slot: number; name: string; seconds: number; channels: number }[] {
    const m = WasmModule.blobs.get(typeId);
    if (!m) return [];
    return [...m.entries()].map(([slot, b]) => ({
      slot, name: b.name, channels: b.channels,
      seconds: b.data.length / b.channels / b.rate,
    })).sort((a, b) => a.slot - b.slot);
  }

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
      WasmModule.worklet = addWorkletModule(`${base}wasm/mmb-worklet.js`);
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
      const blobs = WasmModule.blobs.get(type.id);
      if (blobs) for (const [slot, b] of blobs) this.postBlob(slot, b.data, b.rate, b.channels);
      const zones = WasmModule.zoneMaps.get(type.id);
      if (zones) this.postZones(zones);
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
  private postBlob(slot: number, data: Int16Array, rate: number, channels: number): void {
    // Kopie per worklet (structured clone); het origineel blijft in de bank.
    if (this.node) this.node.port.postMessage({ t: 'blob', slot, rate, channels, data: data.slice() });
  }
  private postZones(zones: WasmZone[]): void {
    if (this.node) this.node.port.postMessage({ t: 'zones', zones });
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

  /** Noot aanzetten op een polyfone module (zie `isPoly`). */
  noteOn(midi: number, velocity01: number): void {
    const v = Math.max(1, Math.min(127, Math.round((velocity01 > 1 ? velocity01 / 127 : velocity01) * 127) || 1));
    this.post({ t: 'note', on: true, n: midi, v });
  }
  noteOff(midi: number): void { this.post({ t: 'note', on: false, n: midi }); }
  allNotesOff(): void { this.post({ t: 'note', on: false, n: null }); }

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
