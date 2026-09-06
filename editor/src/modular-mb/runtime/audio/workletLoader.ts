import * as Tone from 'tone';

/**
 * addWorkletModule — registreer een AudioWorklet-module per URL.
 *
 * Tone 15.1.22 bewaart in `Context.addAudioWorkletModule` één enkele
 * `_workletPromise` per context en negeert de URL:
 *
 *     if (!this._workletPromise) {
 *         this._workletPromise = this.rawContext.audioWorklet.addModule(url);
 *     }
 *     await this._workletPromise;
 *
 * Wie het eerst komt wint dus; voor elke volgende, andere URL wordt
 * `addModule` nooit aangeroepen terwijl de `await` wél slaagt. Toen we er
 * twee hadden (`wasm/mmb-worklet.js` en een aparte DX7-worklet) faalde de
 * tweede `createAudioWorkletNode` op een onbekende processor — afhankelijk van
 * welke patch je die sessie het eerst had gespeeld. Sinds de DX7 een gewone
 * wasm-module is, is er nog één URL, maar de val blijft dichtgetimmerd.
 *
 * Daarom gaan we hier rechtstreeks naar `rawContext.audioWorklet`, met een
 * eigen cache per (context, url). Valt terug op Tone's methode als de context
 * geen `audioWorklet` heeft, zodat de foutmelding daarvandaan blijft komen.
 */
type RawContext = BaseAudioContext & { audioWorklet?: { addModule(url: string): Promise<void> } };

const perContext = new WeakMap<RawContext, Map<string, Promise<void>>>();

export function addWorkletModule(url: string): Promise<void> {
  const ctx = Tone.getContext();
  const raw = ctx.rawContext as unknown as RawContext;
  let byUrl = perContext.get(raw);
  if (!byUrl) { byUrl = new Map(); perContext.set(raw, byUrl); }
  const cached = byUrl.get(url);
  if (cached) return cached;
  const p = raw.audioWorklet
    ? raw.audioWorklet.addModule(url)
    : ctx.addAudioWorkletModule(url);
  byUrl.set(url, p);
  // Mislukt hij, dan mag een volgende poging het opnieuw proberen.
  p.catch(() => { byUrl.delete(url); });
  return p;
}
