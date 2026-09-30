// lyric/lyricStore — de lyricbanken van de simulator, bewaard in de browser.
//
// De sampler haalt zijn banken van de server (sim/bankAutoLoad.ts); een
// lyricbank maak je zelf, dus die bewaren we in IndexedDB, per banknummer
// 0–15, en zetten we bij de eerste ZANG-module weer in de wasm. Zo overleeft
// een bank een herlaad van de pagina, en weet het paneel welke naam bij welk
// nummer hoort. De patch zelf bevat alleen het nummer (de Bank-knop); het
// bestand (.mmbl) is wat je bewaart en deelt.

import { WasmModule } from '../runtime';
import { parseLyricBank } from './lyricBank';

export const ZANG_TYPE_ID = 'tp_mmb_zang';
const DB = 'mmb-lyrics';
const STORE = 'banks';

export interface StoredLyricBank { nn: number; name: string; syllables: number; bytes: ArrayBuffer; savedAt: number }

// ── namen voor het paneel ─────────────────────────────────────────────────
const names = new Map<number, { name: string; syllables: number }>();
const listeners = new Set<() => void>();
let version = 0;
function emit(): void { version++; for (const l of listeners) l(); }
export function subscribeLyricBanks(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function lyricBanksVersion(): number { return version; }
/** Naam van de bank die de simulator onder nummer NN heeft (of null). */
export function simLyricBank(nn: number): { name: string; syllables: number } | null { return names.get(nn) ?? null; }
export function simLyricBanks(): { nn: number; name: string; syllables: number }[] {
  return [...names.entries()].map(([nn, v]) => ({ nn, ...v })).sort((a, b) => a.nn - b.nn);
}

// ── IndexedDB ─────────────────────────────────────────────────────────────
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'nn' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
function request<T>(r: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => { r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); });
}

export async function listStoredLyricBanks(): Promise<StoredLyricBank[]> {
  const db = await openDb();
  if (!db) return [];
  const all = await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  db.close();
  return ((all ?? []) as StoredLyricBank[]).sort((a, b) => a.nn - b.nn);
}

async function put(entry: StoredLyricBank): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const ok = (await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry))) !== undefined;
  db.close();
  return ok;
}

/** In de wasm zetten (alle ZANG-instanties, nu en later) en de naam onthouden. */
function toWasm(nn: number, bytes: ArrayBuffer, name: string, syllables: number): void {
  const even = bytes.byteLength & 1 ? bytes.slice(0, bytes.byteLength - 1) : bytes;
  WasmModule.setBlob(ZANG_TYPE_ID, nn, new Int16Array(even), 22050, name, 1);
  names.set(nn, { name, syllables });
  emit();
}

/**
 * Bank NN in de simulator zetten én bewaren. Geeft false als bewaren niet
 * lukte (privévenster, volle opslag): de bank speelt dan wel, tot een herlaad.
 */
export async function setSimLyricBank(nn: number, bytes: ArrayBuffer, name: string, syllables: number): Promise<boolean> {
  nn = Math.max(0, Math.min(15, Math.round(nn)));
  toWasm(nn, bytes, name, syllables);
  return put({ nn, name, syllables, bytes, savedAt: Date.now() });
}

export async function deleteSimLyricBank(nn: number): Promise<void> {
  const db = await openDb();
  if (db) { await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(nn)); db.close(); }
  names.delete(nn);
  // Een leeg blok in de wasm: de bank in dat slot wordt ongeldig en zwijgt.
  WasmModule.setBlob(ZANG_TYPE_ID, nn, new Int16Array(4), 22050, '', 1);
  emit();
}

let restored: Promise<void> | null = null;
/** Alle bewaarde banken in de wasm zetten; één keer, bij de eerste ZANG-module. */
export function restoreSimLyricBanks(): Promise<void> {
  restored ??= (async () => {
    for (const b of await listStoredLyricBanks()) {
      try {
        const parsed = parseLyricBank(b.bytes);
        toWasm(b.nn, b.bytes, b.name || parsed.name, parsed.syllables.length);
      } catch { /* kapotte bank: overslaan */ }
    }
  })();
  return restored;
}

WasmModule.registerAssets(ZANG_TYPE_ID, () => { void restoreSimLyricBanks(); });
