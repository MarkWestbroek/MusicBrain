// Rondleiding door de speelmodus: spotlight en ballon op `data-tour`-ankers
// in de speelmodus (patchkeuze, front, werkbalk en wielen van het
// toetsenbord). Start vanzelf bij het eerste bezoek aan de speelmodus en
// opnieuw via "?" in de bovenbalk. Volgorde naar Marks schets (2026-10-07).
//
// Anders dan de editor-rondleiding (recipe/Tour.tsx) loopt deze door op
// volledig scherm: de browser toont dan alleen het schermvullende element,
// dus de ballon wordt daarin getekend (portal naar document.fullscreenElement).
// Stappen kunnen vanzelf doorgaan (⛶ en 🎹 aangetikt) en overgeslagen worden
// als ze niet van toepassing zijn (✕ bestaat alleen op volledig scherm).

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PlayTourStep {
  /** Waarde van `data-tour`; weglaten of niet gevonden = ballon in het midden. */
  anchor?: string;
  title: string;
  text: string;
  /** Vanzelf door zodra dit waar is. */
  done?: () => boolean;
  /** Overslaan als dit waar is (op het moment dat de stap aan de beurt is). */
  skip?: () => boolean;
}

const fullMode = (): string | undefined =>
  (document.fullscreenElement as HTMLElement | null)?.dataset.fullMode;

export const PLAY_TOUR_STEPS: PlayTourStep[] = [
  { anchor: 'play-patch', title: 'Kies wat je speelt',
    text: 'Hier kies je de patch. Onderaan de lijst staan voorbeelden om erbij te zetten. Draai je aan een knop, dan verschijnt Bewaar; Bewaar als… maakt er een eigen versie van.' },
  { anchor: 'keys-full', title: 'Volledig scherm',
    text: '⛶ zet het front en het toetsenbord op het hele scherm. Tik erop om het te proberen, of ga verder.',
    done: () => !!document.fullscreenElement },
  { anchor: 'play-front', title: 'Het front',
    text: 'De knoppen waar een speler aan draait. Draaien verandert de klank meteen; wat niet op het front staat, staat vast. Binnenkijken laat de hele patch zien.' },
  { anchor: 'keys-pedals', title: 'Sustain en pedaal',
    text: 'Sustain: tik = vast of los, vasthouden = alleen zolang je drukt. De schuif is een expressiepedaal; wat hij doet hangt van de patch af (vaak het filter).' },
  { anchor: 'keys-octave', title: 'Octaaf',
    text: '− en + schuiven het klavier een octaaf omlaag of omhoog. De C-toetsen tonen in welk octaaf je zit.' },
  { anchor: 'keys-slide', title: 'Opzij schuiven',
    text: 'Wat je vinger doet als hij over de toetsen glijdt: wisselen = naar de volgende noot, buigen = de toon buigen. "Over" zegt hoeveel toetsen het volle buigbereik is.' },
  { anchor: 'keys-full-keys', title: 'Alleen het klavier',
    text: '🎹 zet alleen het klavier op het scherm, liggend: meer ruimte voor je vingers. Draai je telefoon. Tik erop om het te proberen, of ga verder.',
    done: () => fullMode() === 'keys' },
  { anchor: 'keys-bend', title: 'Pitch bend',
    text: 'Het linkerwiel buigt de toonhoogte en veert terug naar het midden als je loslaat.' },
  { anchor: 'keys-mod', title: 'Modwiel',
    text: 'Het rechterwiel blijft staan waar je het laat: meestal vibrato of filter, afhankelijk van de patch.' },
  { anchor: 'keys-tall', title: 'Lange toetsen',
    text: '⇕ maakt de toetsen langer: meer ruimte voor aanslag en druk.' },
  { anchor: 'keys-panic', title: 'Alles uit',
    text: 'Het stopbord laat alle noten los, ook een noot die blijft hangen.' },
  { anchor: 'keys-board', title: 'Spelen',
    text: 'Laag op de toets is hard, hoog is zacht. Schuif na de aanslag omhoog voor druk (aftertouch). Meerdere vingers tegelijk zijn akkoorden. De eerste aanslag zet de klank aan.' },
  { anchor: 'keys-record', title: 'Opnemen',
    text: 'Het rode rondje neemt op wat je speelt: geluid (WAV), de noten (MIDI) en de patch. Tik op het rode vierkantje om te stoppen; de bestanden worden gedownload.' },
  { anchor: 'keys-ribbon', title: 'Het lint',
    text: '〰 vervangt de toetsen door een draad, zoals op het Trautonium: de plek is de toonhoogte, traploos; laag op het lint is hard. 🎹 brengt het klavier terug.' },
  { anchor: 'keys-exit', title: 'Volledig scherm uit',
    text: '✕ brengt je terug naar de gewone weergave. Op Android kan het ook door van boven naar beneden te vegen.',
    skip: () => !document.fullscreenElement },
  { title: 'Klaar', text: 'Veel plezier. De rondleiding start opnieuw met ? bovenaan.' },
];

const SEEN_KEY = 'mb.playtour.v1';
export function playTourSeen(): boolean { try { return localStorage.getItem(SEEN_KEY) === 'seen'; } catch { return true; } }
function markSeen(): void { try { localStorage.setItem(SEEN_KEY, 'seen'); } catch { /* geen opslag */ } }

function anchorRect(anchor?: string): DOMRect | null {
  if (!anchor) return null;
  const el = document.querySelector(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

export function PlayTour({ open, onClose, steps = PLAY_TOUR_STEPS }: {
  open: boolean; onClose: () => void; steps?: PlayTourStep[];
}): JSX.Element | null {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const step = steps[i];

  useEffect(() => { if (open) setI(0); }, [open]);
  // Volledig scherm aan of uit: de ballon verhuist mee.
  useEffect(() => {
    const sync = (): void => setHost(document.fullscreenElement ?? document.body);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  // Overslaan wat niet van toepassing is (vooruit; terug slaat ook over).
  useEffect(() => {
    if (open && step?.skip?.()) setI((n) => (n + 1 < steps.length ? n + 1 : n));
  }, [open, step, steps.length]);
  // Een anker buiten beeld (op een telefoon staat het klavier onder het
  // front) eerst in beeld schuiven, één keer per stap.
  useEffect(() => {
    if (!open || !step?.anchor) return;
    const el = document.querySelector(`[data-tour="${step.anchor}"]`);
    const r = el?.getBoundingClientRect();
    if (el && r && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open, step]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = (): void => {
      setRect(anchorRect(step?.anchor));
      if (step?.done?.()) setI((n) => (steps[n] === step && n + 1 < steps.length ? n + 1 : n));
    };
    update();
    const t = setInterval(update, 300);
    window.addEventListener('resize', update);
    return () => { clearInterval(t); window.removeEventListener('resize', update); };
  }, [open, step, steps]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!open || !step || !host) return null;
  const last = i === steps.length - 1;
  function close(): void { markSeen(); onClose(); }
  function next(): void { if (last) close(); else setI(i + 1); }
  function back(): void {
    let n = i - 1;
    while (n > 0 && steps[n]?.skip?.()) n--;
    setI(Math.max(0, n));
  }

  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 6;
  const spot: React.CSSProperties | null = rect ? {
    position: 'fixed', left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad,
    borderRadius: 8, boxShadow: '0 0 0 9999px rgba(15,23,42,0.55), 0 0 0 3px var(--mb-accent)',
    pointerEvents: 'none', zIndex: 1000, transition: 'all 200ms',
  } : null;
  const bubbleW = Math.min(360, vw - 16);
  // Onder het element als daar plek is, anders erboven; in het midden zonder anker.
  const below = rect ? rect.bottom + 14 : 0;
  const bubble: React.CSSProperties = rect ? {
    position: 'fixed', zIndex: 1001, width: bubbleW,
    left: Math.max(8, Math.min(rect.left, vw - bubbleW - 8)),
    ...(below + 190 < vh ? { top: below } : { bottom: Math.max(8, vh - rect.top + 14) }),
  } : {
    position: 'fixed', zIndex: 1001, width: bubbleW, left: (vw - bubbleW) / 2, top: '30%',
  };

  return createPortal(
    <>
      {spot ? <div style={spot} /> : <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, pointerEvents: 'none' }} />}
      {/* key per stap: een nieuwe ballon in plaats van bijgewerkte tekst. Chrome
          Vertalen vervangt tekstknopen; werkt React die oude knopen bij, dan blijft
          de vertaling van de vorige stap staan. */}
      <div key={i} role="dialog" aria-label="Rondleiding" style={{ ...bubble, background: '#fff', color: '#0f172a', borderRadius: 10, padding: '12px 14px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)', fontSize: 14, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>stap {i + 1} van {steps.length}</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{step.title}</div>
        <div style={{ lineHeight: 1.45 }}>{step.text}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button type="button" onClick={close} style={b}>Sluiten</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button type="button" onClick={back} style={b}>‹ Terug</button>}
          <button type="button" onClick={next} style={{ ...b, fontWeight: 600 }}>{last ? 'Klaar' : 'Volgende ›'}</button>
        </div>
      </div>
    </>,
    host,
  );
}

const b: React.CSSProperties = {
  background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd2d9', borderRadius: 6,
  padding: '6px 12px', cursor: 'pointer', fontSize: 13,
};
