// Secure context: AudioWorklet (alle wasm-modules), Web MIDI en de microfoon
// zijn in de browser alleen beschikbaar op https of localhost. Wie de editor
// op een telefoon opent via http://<ip-van-de-pc>:5173 krijgt daardoor geen
// geluid ("AudioWorkletNode is only available in a secure context") en
// "Web MIDI niet ondersteund". Dit bestand maakt daar één duidelijke
// melding van, met de uitweg erbij (zie editor/README.md, "Telefoon").

export interface LocationLike { protocol: string; hostname: string; port: string }

/** Null als de pagina veilig is; anders de melding en, als de dev-server
 *  erbij kan, het https-adres om in plaats daarvan te openen. */
export function secureContextHint(loc: LocationLike, isSecure: boolean): { text: string; httpsUrl: string | null } | null {
  if (isSecure) return null;
  const httpsUrl = loc.protocol === 'http:' ? `https://${loc.hostname}${loc.port ? `:${loc.port}` : ''}/` : null;
  return {
    text: 'Deze pagina is via http op een netwerkadres geopend. Geluid (de wasm-modules) en Web MIDI werken alleen via https of localhost.',
    httpsUrl,
  };
}

/** De melding voor dit venster, of null (ook buiten de browser, in tests). */
export function currentSecureContextHint(): { text: string; httpsUrl: string | null } | null {
  if (typeof window === 'undefined') return null;
  return secureContextHint(window.location, window.isSecureContext !== false);
}
