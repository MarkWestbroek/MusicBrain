'use client';
// TakePlayer — een take afspelen: de wav als geluid, de pianorol eronder die
// de audio volgt. Kant-en-klaar client component voor een widget-viewer;
// props zijn plain JSON (URL's en getallen), dus server-side door te geven.
//
// Zonder .mid (of als die niet te laden is) blijft alleen de audiospeler over,
// met de standaardbediening van de browser.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AudioPlayback } from './playback';
import { parseSmf } from './smf';
import { MidiRoll } from './MidiRoll';

export interface TakePlayerProps {
  /** URL van de wav (of een ander audioformaat dat de browser kan spelen). */
  audioUrl: string;
  /** URL van de .mid van dezelfde take; weg = alleen audio. */
  midiUrl?: string | null;
  /** Naam voor schermlezers en de samenvatting. */
  title?: string;
  /** Hoogte van de pianorol in px (vast, zodat de pagina niet verspringt). */
  height?: number;
  /** Controller-laag tonen (modwheel, aftertouch, bend, CC). */
  controllers?: boolean;
  /** Uitlegregel onder de rol. */
  hints?: boolean;
}

export function TakePlayer({ audioUrl, midiUrl, title, height = 160, controllers = true, hints = false }: TakePlayerProps): ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pb, setPb] = useState<AudioPlayback | null>(null);
  const [hasMidi, setHasMidi] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    const p = new AudioPlayback(a, null, title ?? null);
    setPb(p);
    let cancelled = false;
    if (midiUrl) {
      fetch(midiUrl)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => { if (!cancelled) { p.setFile(parseSmf(new Uint8Array(b)), title ?? null); setHasMidi(true); } })
        .catch(() => { if (!cancelled) setHasMidi(false); });
    }
    return () => { cancelled = true; p.destroy(); setPb(null); setHasMidi(false); };
  }, [audioUrl, midiUrl, title]);

  return (
    <div>
      {/* Met een pianorol bedient die het transport; zonder is de browserbediening er. */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" controls={!hasMidi} style={hasMidi ? { display: 'none' } : { width: '100%' }} />
      {hasMidi && pb
        ? <MidiRoll playback={pb} height={height} label={title ? `Take: ${title}` : undefined} controllers={controllers} hints={hints} />
        : midiUrl ? <div style={{ minHeight: height }} aria-hidden="true" /> : null}
    </div>
  );
}
