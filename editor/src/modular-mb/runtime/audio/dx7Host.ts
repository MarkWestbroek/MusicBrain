/// <reference types="vite/client" />
import { WasmModule } from './WasmModule';

/**
 * dx7Host — wat de DX7 náást de generieke wasm-module nodig heeft: zijn
 * factory-ROMs, een USER-bank en de edit-patch van de patcheditor.
 *
 * De DX7 is in de simulator een gewone `WasmModule` (construct A: één stem
 * per instantie, polyfonie via een PolyGroup, precies als Dx7Module.h op de
 * Teensy). Banken en de edit-patch gaan als blobs de wasm in, over dezelfde
 * weg als samples bij de sampler: slots 0..7 = ROM 1A..4B, 8 = USER,
 * 9 = edit-patch (156 bytes uitgepakt). De control `edit` (0/1) zet die
 * edit-patch aan; hij overstemt dan bank+program op álle DX7-instanties —
 * de basis van de patcheditor.
 */
const TYPE_ID = 'tp_mmb_dx7';
const SLOT_USER = 8;
const SLOT_EDIT = 9;
const BANK_BYTES = 4096;

let romsPromise: Promise<Uint8Array> | null = null;
let roms: Uint8Array | null = null;
let editPatch: Uint8Array | null = null;
let lastError: string | null = null;

/** Bytes → Int16Array-kopie (de blob-weg vervoert int16; lengte moet even zijn). */
function asInt16(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(Math.ceil(bytes.length / 2));
  new Uint8Array(out.buffer).set(bytes);
  return out;
}

/** ROMs ophalen en als blobs klaarzetten — één keer, voor alle instanties. */
export function ensureDx7Roms(): Promise<Uint8Array> {
  if (!romsPromise) {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
    romsPromise = (async () => {
      const res = await fetch(`${base}dx7/roms.bin`);
      if (!res.ok) throw new Error('dx7/roms.bin niet gevonden');
      const data = new Uint8Array(await res.arrayBuffer());
      for (let b = 0; b < 8; b++) {
        WasmModule.setBlob(TYPE_ID, b, asInt16(data.subarray(b * BANK_BYTES, (b + 1) * BANK_BYTES)), 44100, `ROM ${b}`, 1);
      }
      roms = data;
      lastError = null;
      return data;
    })();
    romsPromise.catch((err: unknown) => {
      romsPromise = null;
      lastError = err instanceof Error ? err.message : String(err);
    });
  }
  return romsPromise;
}

// Bij de eerste DX7-instantie de ROMs laden; WasmModule kent de DX7 niet.
WasmModule.registerAssets(TYPE_ID, () => { void ensureDx7Roms(); });

export const dx7Host = {
  typeId: TYPE_ID,

  /** USER-bank (4096 bytes packed, bank 8) voor alle instanties. */
  setUserBank(data: Uint8Array | null): void {
    if (data && data.length === BANK_BYTES) WasmModule.setBlob(TYPE_ID, SLOT_USER, asInt16(data), 44100, 'USER', 1);
  },

  /** Live edit-patch (156 bytes uitgepakt); `null` = terug naar bank+program. */
  setEditPatch(patch: Uint8Array | null): void {
    editPatch = patch ? Uint8Array.from(patch.subarray(0, 156)) : null;
    if (editPatch) WasmModule.setBlob(TYPE_ID, SLOT_EDIT, asInt16(editPatch), 44100, 'edit', 1);
    WasmModule.broadcastControl(TYPE_ID, 'edit', editPatch ? 1 : 0);
  },
  getEditPatch(): Uint8Array | null { return editPatch; },

  /** Packed voice (128 bytes) uit een factory-ROM — startpunt voor de editor. */
  async getPackedVoice(bank: number, program: number): Promise<Uint8Array> {
    const data = roms ?? await ensureDx7Roms();
    const b = Math.max(0, Math.min(7, bank)), p = program & 31;
    return data.subarray(b * BANK_BYTES + p * 128, b * BANK_BYTES + (p + 1) * 128);
  },

  /** Aantal DX7-modules in de draaiende patch — 0 betekent: zet er een in het rack. */
  instanceCount(): number { return WasmModule.count(TYPE_ID); },

  /** Statusregel voor de UI. */
  info(): string | null {
    if (lastError) return `DX7: ${lastError}`;
    const n = WasmModule.count(TYPE_ID);
    if (n === 0) return null;
    return `DX7 ×${n}${editPatch ? ' · edit-patch actief' : ''}`;
  },
  get lastError(): string | null { return lastError; },
};
