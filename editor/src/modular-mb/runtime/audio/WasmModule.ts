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
    'tp_mmb_material_bridge', 'tp_mmb_scanned', 'tp_mmb_reservoir', 'tp_mmb_gendyn', 'tp_mmb_excitable', 'tp_mmb_tapestrip',
    // Modulatorpakket (2026-10-02).
    'tp_mmb_sh', 'tp_mmb_clock', 'tp_mmb_euclid', 'tp_mmb_turing', 'tp_mmb_branches', 'tp_mmb_chaos', 'tp_mmb_lfo8', 'tp_mmb_slope', 'tp_mmb_logic',
    // West Coast, pedalen en klassiekers (2026-10-02).
    'tp_mmb_folder', 'tp_mmb_lpg', 'tp_mmb_drive', 'tp_mmb_freqshift', 'tp_mmb_acid', 'tp_mmb_mixtur', 'tp_mmb_martenot', 'tp_mmb_diffuseur', 'tp_mmb_arp', 'tp_mmb_rungler', 'tp_mmb_organ',
    'tp_mmb_sem', 'tp_mmb_complex', 'tp_mmb_wah', 'tp_mmb_ensemble', 'tp_mmb_epiano',
    'tp_mmb_pads', 'tp_mmb_faders', 'tp_mmb_knobs',
    'tp_mmb_rhythm', 'tp_mmb_percuter', 'tp_mmb_synthex', 'tp_mmb_tube',
    'tp_mmb_elements', 'tp_mmb_rings', 'tp_mmb_marbles', 'tp_mmb_stages',
    'tp_mmb_peaks', 'tp_mmb_morph_wt', 'tp_mmb_clouds',
    'tp_mmb_plaits', 'tp_mmb_tides', 'tp_mmb_warps', 'tp_mmb_tape_echo', 'tp_mmb_sampler', 'tp_mmb_zang',
    'tp_mmb_dx7', 'tp_mmb_env_follower', 'tp_mmb_env_follower_mono',
    'tp_mmb_vcf', 'tp_mmb_ms20', 'tp_mmb_stk_sound', 'tp_mmb_elements_reverb', 'tp_mmb_octa_vca', 'tp_mmb_stereo_vca', 'tp_mmb_resonator', 'tp_mmb_cr78', 'tp_mmb_comp', 'tp_mmb_comb', 'tp_mmb_quant', 'tp_mmb_chord', 'tp_mmb_grids', 'tp_mmb_lfo', 'tp_mmb_string', 'tp_mmb_echo', 'tp_mmb_phaser', 'tp_mmb_ladder', 'tp_mmb_octa_vcf', 'tp_mmb_octa_vco', 'tp_mmb_wt_vco', 'tp_mmb_draw_vco', 'tp_mmb_noise', 'tp_mmb_fet_comp', 'tp_mmb_opto_comp',
    'tp_mmb_bus_comp', 'tp_mmb_varimu_comp', 'tp_mmb_program_eq', 'tp_mmb_diode_comp', 'tp_mmb_console_eq', 'tp_mmb_para_eq',
    'tp_mmb_stereo_tape_echo', 'tp_mmb_digital_echo', 'tp_mmb_bbd_chorus', 'tp_mmb_ringmod', 'tp_mmb_octaver',
    'tp_mmb_harmonizer', 'tp_mmb_reverb', 'tp_mmb_tremolo', 'tp_mmb_stereo_phaser', 'tp_mmb_vibe', 'tp_mmb_sid', 'tp_mmb_sid3', 'tp_mmb_rotary', 'tp_mmb_shimmer',
    // Stap 6: de modules die vroeger aan de noot-dispatcher hingen.
    'tp_mmb_vco', 'tp_mmb_fm_vco', 'tp_mmb_fof', 'tp_mmb_vca', 'tp_mmb_ahdsr', 'tp_mmb_cvmath', 'tp_mmb_seq8', 'tp_mmb_midiin',
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
  /** Per type: de bytes én de één keer gecompileerde module. De worklet
   *  krijgt de module (structured clone deelt de compilatie); compileren per
   *  instantie op de audiothread was bij een herbouw van een grote patch
   *  tientallen keren hetzelfde werk. Bytes blijven als terugval voor een
   *  browser die een Module niet naar een worklet kan sturen. */
  private static readonly wasm = new Map<string, Promise<{ bytes: Uint8Array; mod: WebAssembly.Module | null }>>();
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
  /** Typen die dezelfde bank krijgen als een ander type: de tape-strip
   *  (Mellotron-mechanica) speelt de bank van de sampler, zoals op de Teensy
   *  beide uit dezelfde PSRAM-bank lezen. Een blob of keymap voor de sampler
   *  gaat dus ook naar deze typen. */
  static readonly bankAliases: Readonly<Record<string, readonly string[]>> = {
    tp_mmb_sampler: ['tp_mmb_tapestrip', 'tp_mmb_percuter'],
  };

  /** Sample naar slot `slot` van alle (huidige en toekomstige) instanties. */
  static setBlob(
    typeId: string, slot: number, data: Int16Array, rate: number,
    name = '', channels = 1,
  ): void {
    let m = WasmModule.blobs.get(typeId);
    if (!m) { m = new Map(); WasmModule.blobs.set(typeId, m); }
    m.set(slot, { data, rate, name, channels });
    for (const inst of WasmModule.instances) if (inst.typeId === typeId) inst.postBlob(slot, data, rate, channels);
    for (const alias of WasmModule.bankAliases[typeId] ?? []) WasmModule.setBlob(alias, slot, data, rate, name, channels);
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
    for (const alias of WasmModule.bankAliases[typeId] ?? []) WasmModule.setZones(alias, zones);
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
    let parked = 0;
    for (const list of WasmModule.pool.values()) parked += list.length;
    return `wasm-modules: ${ready}/${n} actief` + (parked ? ` · ${parked} geparkeerd` : '');
  }

  /**
   * Parkeerpool: nodes van weggegooide modules, per type + poortlijst. Een
   * herbouw van de patch maakte alle worklet-nodes opnieuw, en de wasm-
   * geheugens van de oude ruimde de audiothread niet op; na een paar
   * wisselingen viel elke nieuwe instantie om ("Cannot allocate Wasm memory
   * for new instance"). Nu blijft een node leven en krijgt de volgende module
   * van hetzelfde type hem terug, met het geheugen teruggezet naar de
   * beginstand (zie 'reset' in mmb-worklet.js) — de retire-pool van de
   * firmware, maar dan in de browser. Per sleutel begrensd; wat er niet meer
   * in past gaat alsnog weg.
   */
  private static readonly pool = new Map<string, { node: AudioWorkletNode; ctx: BaseAudioContext }[]>();
  private static readonly kPoolPerKey = 16;
  private static poolKey(typeId: string, inputIds: string[], outputIds: string[]): string {
    return `${typeId}|${inputIds.join(',')}|${outputIds.join(',')}`;
  }
  private static takeParked(key: string): AudioWorkletNode | null {
    const list = WasmModule.pool.get(key);
    if (!list) return null;
    const ctx = Tone.getContext().rawContext as unknown as BaseAudioContext;
    while (list.length) {
      const e = list.pop()!;
      if (e.ctx === ctx) return e.node;
      try { e.node.port.postMessage({ t: 'dispose' }); } catch { /* al weg */ }
    }
    return null;
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

  private static loadWasm(typeId: string): Promise<{ bytes: Uint8Array; mod: WebAssembly.Module | null }> {
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
        const bytes = new Uint8Array(await r.arrayBuffer());
        let mod: WebAssembly.Module | null = null;
        try { mod = await WebAssembly.compile(bytes); } catch { /* dan compileert de worklet zelf */ }
        return { bytes, mod };
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
  /** Herstel na een crash: hoe vaak de node al vervangen is (zie restart()). */
  private restarts = 0;
  private static readonly kMaxRestarts = 3;
  /** False zodra de node een crash meldde: dan niet meer parkeren. */
  private healthy = true;

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
      // Pas hier, ná build(): addFeeder() kan de poortlijst nog uitbreiden.
      const parked = WasmModule.takeParked(WasmModule.poolKey(type.id, this.inputIds, this.outputIds));
      if (parked) this.attach(parked, wasm, true);
      else this.createNode(wasm);
    }).catch((err: unknown) => {
      WasmModule.lastError = `${type.id}: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[wasm] module niet geladen:', type.id, err);
    });
  }

  /** Een nieuwe worklet-node maken en aansluiten. */
  private createNode(wasm: { bytes: Uint8Array; mod: WebAssembly.Module | null }): void {
    const opts = (payload: WebAssembly.Module | Uint8Array): AudioWorkletNodeOptions => ({
      numberOfInputs: Math.max(1, this.inputIds.length),
      numberOfOutputs: Math.max(1, this.outputIds.length),
      outputChannelCount: Array.from({ length: Math.max(1, this.outputIds.length) }, () => 1),
      processorOptions: { wasm: payload, inputs: this.inputIds, outputs: this.outputIds },
    });
    let node: AudioWorkletNode;
    try {
      node = Tone.getContext().createAudioWorkletNode('mmb-wasm', opts(wasm.mod ?? wasm.bytes));
    } catch (err) {
      // Een Module die niet naar de worklet te klonen is: dan de bytes.
      if (!wasm.mod) throw err;
      wasm.mod = null;
      node = Tone.getContext().createAudioWorkletNode('mmb-wasm', opts(wasm.bytes));
    }
    this.attach(node, wasm, false);
  }

  /** Node (nieuw of uit de pool) aan de poort-Gains hangen en de toestand sturen. */
  private attach(node: AudioWorkletNode, wasm: { bytes: Uint8Array; mod: WebAssembly.Module | null }, reused: boolean): void {
    const type = this.type;
    node.port.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.t === 'tele') { this.onTelemetry?.(Number(m.v)); return; }
      if (m?.t === 'ready') {
        this.nativeRate = Number(m.rate);
        if (m.unknownInputs?.length || m.unknownOutputs?.length) {
          console.info(`[wasm ${type.id}] poorten zonder wasm-tegenhanger:`, m.unknownInputs, m.unknownOutputs);
        }
        return;
      }
      if (m?.t === 'crashed') {
        // De worklet heeft een fout in process() opgevangen (zie de kop van
        // mmb-worklet.js). Niet fataal: hij draait al op een verse instantie
        // en wil de toestand terug. Fataal: de hele node vervangen.
        const msg = String(m.message ?? '?');
        console.warn(`[wasm ${type.id}] ${m.fatal ? 'gecrasht' : 'crash hersteld'} (${m.crashes}×):`, msg);
        if (m.fatal) { this.restart(msg, wasm); return; }
        WasmModule.lastError = `${type.id}: crash hersteld — ${msg}`;
        this.syncState();
      }
    };
    node.onprocessorerror = (e: Event) => {
      // De constructor of process() gooide iets vóór onze try/catch (bv.
      // "Cannot allocate Wasm memory" bij het aanmaken). Chrome geeft een
      // ErrorEvent met de tekst; die willen we zien.
      const msg = (e as ErrorEvent).message || 'worklet-processor gecrasht';
      console.error(`[wasm ${type.id}] processorerror:`, msg);
      this.restart(msg, wasm);
    };
    this.inputIds.forEach((id, k) => Tone.connect(this.inGains.get(id)!, node as unknown as AudioNode, 0, k));
    this.outputIds.forEach((id, j) => Tone.connect(node as unknown as AudioNode, this.outGains.get(id)!, j, 0));
    this.node = node;
    this.healthy = true;
    WasmModule.lastError = this.restarts ? `${type.id}: node vervangen na crash (${this.restarts}×)` : null;
    if (reused) node.port.postMessage({ t: 'reset' });   // geheugen naar de beginstand, dan de toestand
    this.syncState();
  }

  /** Node loskoppelen van de poort-Gains (parkeren of vervangen). */
  private detach(node: AudioWorkletNode): void {
    this.inputIds.forEach((id, k) => { try { this.inGains.get(id)!.disconnect(node as unknown as AudioNode, 0, k); } catch { /* al los */ } });
    try { (node as unknown as AudioNode).disconnect(); } catch { /* al los */ }
  }

  /** Beginstand van alle controls, kabelstatus, blobs, keymap, dan de wachtrij. */
  private syncState(): void {
    const type = this.type;
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
  }

  /**
   * Node vervangen na een crash die de worklet zelf niet kon opvangen. De
   * poort-Gains blijven staan, dus de kabels van de engine merken er niets
   * van; alleen de DSP-toestand (galmstaart, lopende noot) is weg. Met een
   * oplopende wachttijd, zodat een tijdelijk tekort (wasm-geheugen dat de
   * GC nog moet vrijgeven) een kans krijgt; na kMaxRestarts geven we op.
   */
  private restart(reason: string, wasm: { bytes: Uint8Array; mod: WebAssembly.Module | null }): void {
    if (this.disposed) return;
    this.healthy = false;
    const old = this.node;
    this.node = null;
    if (old) {
      try { old.port.postMessage({ t: 'dispose' }); } catch { /* al weg */ }
      this.detach(old);
    }
    if (this.restarts >= WasmModule.kMaxRestarts) {
      WasmModule.lastError = `${this.type.id}: worklet-processor gecrasht (${reason}) — herstel ${this.restarts}× mislukt`;
      return;
    }
    this.restarts++;
    WasmModule.lastError = `${this.type.id}: worklet-processor gecrasht (${reason}) — herstart ${this.restarts}/${WasmModule.kMaxRestarts}`;
    setTimeout(() => {
      if (this.disposed) return;
      try { this.createNode(wasm); }
      catch (err) { this.restart(err instanceof Error ? err.message : String(err), wasm); }
    }, 250 * this.restarts);
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

  /**
   * Een extra kabel op cv/gate-ingang `id`: hij krijgt een eigen worklet-
   * ingang (`id@2`, `id@3`, …) zodat de worklet kan doen wat de CvGraph van
   * de Teensy doet — de laatste verandering wint, in plaats van de som die
   * Web Audio van twee kabels op één ingang maakt. Kan alleen zolang de
   * worklet-node nog niet bestaat (tijdens `build()`); daarna telt hij op.
   */
  addFeeder(id: string): Tone.Gain | null {
    if (!this.inGains.has(id)) return null;
    if (this.node) return this.inGains.get(id)!;
    let k = 2;
    while (this.inGains.has(`${id}@${k}`)) k++;
    const fid = `${id}@${k}`;
    const g = new Tone.Gain(1);
    this.inGains.set(fid, g);
    this.inputIds.push(fid);
    return g;
  }

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
      const node = this.node;
      this.node = null;
      this.detach(node);
      const key = WasmModule.poolKey(this.type.id, this.inputIds, this.outputIds);
      let list = WasmModule.pool.get(key);
      if (!list) { list = []; WasmModule.pool.set(key, list); }
      if (this.healthy && list.length < WasmModule.kPoolPerKey) {
        node.port.postMessage({ t: 'park' });
        list.push({ node, ctx: Tone.getContext().rawContext as unknown as BaseAudioContext });
      } else {
        node.port.postMessage({ t: 'dispose' });
      }
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
