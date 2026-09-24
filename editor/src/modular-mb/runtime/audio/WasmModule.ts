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
  /** s opkomst uit de bank; 0 = de inzet zit in het sample. Telt op bij de
   *  `attack`-control van de module. */
  attack?: number;
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
    'tp_mmb_dx7', 'tp_mmb_env_follower', 'tp_mmb_env_follower_mono',
    'tp_mmb_vcf', 'tp_mmb_ms20', 'tp_mmb_stk_sound', 'tp_mmb_elements_reverb', 'tp_mmb_octa_vca', 'tp_mmb_stereo_vca', 'tp_mmb_resonator', 'tp_mmb_cr78', 'tp_mmb_comp', 'tp_mmb_comb', 'tp_mmb_quant', 'tp_mmb_chord', 'tp_mmb_grids', 'tp_mmb_lfo', 'tp_mmb_string', 'tp_mmb_echo', 'tp_mmb_phaser', 'tp_mmb_ladder', 'tp_mmb_octa_vcf', 'tp_mmb_octa_vco', 'tp_mmb_wt_vco', 'tp_mmb_draw_vco', 'tp_mmb_noise', 'tp_mmb_fet_comp', 'tp_mmb_opto_comp',
    'tp_mmb_bus_comp', 'tp_mmb_varimu_comp', 'tp_mmb_program_eq', 'tp_mmb_diode_comp', 'tp_mmb_console_eq', 'tp_mmb_para_eq',
    // Stap 6: de modules die vroeger aan de noot-dispatcher hingen.
    'tp_mmb_vco', 'tp_mmb_fm_vco', 'tp_mmb_vca', 'tp_mmb_ahdsr', 'tp_mmb_cvmath', 'tp_mmb_seq8', 'tp_mmb_midiin',
  ]);
  static supports(typeId: string): boolean { return WasmModule.typeIds.has(typeId); }

  /**
   * Per type een lader voor bijbehorend materiaal (de DX7 haalt zijn ROMs op
   * en zet ze als blobs klaar). Wordt één keer aangeroepen, bij de eerste
   * instantie van dat type — zo blijft dit bestand vrij van module-kennis.
   */
  private static readonly assetLoaders = new Map<string, () => void>();
  private static readonly assetsStarted = new Set<string>();
  static registerAssets(typeId: string, loader: () => void): void { WasmModule.assetLoaders.set(typeId, loader); }

  /** Aantal levende instanties van een type (0 = zet er een in het rack). */
  static count(typeId: string): number {
    let n = 0;
    for (const inst of WasmModule.instances) if (inst.typeId === typeId) ++n;
    return n;
  }

  /**
   * Een control naar álle instanties van een type, ook controls die niet in
   * de catalogus staan (bv. `edit` van de DX7: aan/uit van de edit-patch).
   * Onthouden voor instanties die later komen.
   */
  private static readonly typeControls = new Map<string, Map<string, number>>();
  static broadcastControl(typeId: string, id: string, v: number): void {
    let m = WasmModule.typeControls.get(typeId);
    if (!m) { m = new Map(); WasmModule.typeControls.set(typeId, m); }
    m.set(id, v);
    for (const inst of WasmModule.instances) if (inst.typeId === typeId) inst.post({ t: 'ctl', id, v });
  }

  private static worklet: Promise<void> | null = null;
  private static readonly wasm = new Map<string, Promise<Uint8Array>>();
  private static readonly instances = new Set<WasmModule>();
  static lastError: string | null = null;

  /** Blobs (samples) per typeId en slot — gedeeld door alle instanties van
   *  dat type, zoals de PSRAM-bank op de Teensy. */
  private static readonly blobs = new Map<string, Map<number, WasmBlob>>();
  /** Blobs per module-instantie: de getekende golf van een Draw-VCO. Blijft
   *  staan als de engine herbouwt, zoals de tabel op de Teensy tot een
   *  herstart; hij staat niet in de patch. */
  private static readonly instanceBlobs = new Map<string, Map<number, WasmBlob>>();
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
  /** Blob naar slot `slot` van één module (op id), nu en na een herbouw. */
  static setInstanceBlob(moduleId: string, slot: number, data: Int16Array, rate = 44100): void {
    let m = WasmModule.instanceBlobs.get(moduleId);
    if (!m) { m = new Map(); WasmModule.instanceBlobs.set(moduleId, m); }
    m.set(slot, { data, rate, name: '', channels: 1 });
    for (const inst of WasmModule.instances) if (inst.id === moduleId) inst.postBlob(slot, data, rate, 1);
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
      // `no-cache`: altijd bij de server navragen of het bestand nog klopt
      // (een 304 kost niets). Zonder dit mag de browser een .wasm zonder
      // cache-regels zelf "vers" verklaren — bij een bestand dat dagen niet
      // veranderd was ruim genoeg om een herlaad te overleven. Zo speelde de
      // sim na de DX7-glidefix nog de oude DX7, terwijl de rest wél nieuw was.
      p = fetch(`${base}wasm/${typeId}.wasm`, { cache: 'no-cache' }).then(async (r) => {
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
  /** Meldingen uit de wasm (`mmb_telemetry()`, bv. de stap van de sequencer). */
  onTelemetry: ((v: number) => void) | null = null;

  /**
   * @param opts.voices Stem-uitgangen erbij: voor elke uit-poort met
   *   `eventKind: 'voice'` (MIDI-In `pitch`/`gate`/`vel`) ook `pitch1..pitchN`.
   *   Die gebruikt de poly-uitvouwing, net als polyExpand voor de firmware.
   */
  constructor(
    type: ModuleType,
    instance: ModuleInstance,
    initialControlValues: Record<string, ControlValue> = {},
    opts: { voices?: number } = {},
  ) {
    super(type, instance, initialControlValues);
    this.inputIds = type.ports.filter((p) => p.direction === 'in').map((p) => p.id);
    this.outputIds = type.ports.filter((p) => p.direction === 'out').map((p) => p.id);
    const voicePorts = type.ports.filter((p) => p.direction === 'out' && p.eventKind === 'voice').map((p) => p.id);
    for (let k = 1; k <= (opts.voices ?? 0); k++) for (const id of voicePorts) this.outputIds.push(`${id}${k}`);
    for (const id of this.inputIds) this.inGains.set(id, new Tone.Gain(1));
    for (const id of this.outputIds) this.outGains.set(id, new Tone.Gain(1));
    WasmModule.instances.add(this);
    if (!WasmModule.assetsStarted.has(type.id)) {
      WasmModule.assetsStarted.add(type.id);
      WasmModule.assetLoaders.get(type.id)?.();
    }

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
        if (m?.t === 'tele') { this.onTelemetry?.(Number(m.v)); return; }
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
      const own = WasmModule.instanceBlobs.get(this.id);
      if (own) for (const [slot, b] of own) this.postBlob(slot, b.data, b.rate, b.channels);
      const tc = WasmModule.typeControls.get(type.id);
      if (tc) for (const [id, v] of tc) this.post({ t: 'ctl', id, v });
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

  /** MIDI-bericht naar de module (MIDI-In): status, data1, data2. */
  midi(status: number, d1: number, d2: number): void {
    this.post({ t: 'midi', s: status, d1, d2 });
  }

  /** Engine: er zit een kabel op ingang `id`. */
  markCabled(id: string): void {
    this.cabled.add(id);
    this.post({ t: 'cabled', id, on: true });
  }
  /**
   * Handmatige ingangswaarde (klavier/MIDI-In/sequencer → voct/gate).
   * `slew` > 0 laat de worklet er met die snelheid (eenheden per seconde)
   * naartoe lopen in plaats van te springen — de glide van MIDI-In.
   */
  setInput(id: string, v: number, slew = 0): void {
    if (!this.inGains.has(id)) return;
    this.post(slew > 0 ? { t: 'in', id, v, slew } : { t: 'in', id, v });
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
