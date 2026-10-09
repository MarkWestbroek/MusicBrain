// ♩ TAP in de werkbalk van het toetsenbord (doc/plans/tempo.md): tikken =
// tap tempo; ▾ opent een klein menu met het tempo als getal, "MIDI-clock
// volgen", en per tempomodule "volgt / eigen tempo". Is de song of de
// MIDI-clock de baas, dan staat dat erbij en doet tikken niets.

import { useRef, useState } from 'react';

import { nlen, useLang } from '../i18n';
import { TOOLBAR_BTN } from './sim/ScreenKeys';
import { useModularProject } from './store';
import { MAX_BPM, MIN_BPM, TapTempo, tempoModules } from './tempo';
import { followsMidiClock, setFollowMidiClock, setPatchTempo, setTempoOwn, useTempoNow } from './useTempoSync';

const NAMES: Record<string, string> = {
  tp_mmb_arp: 'ARP', tp_mmb_clock: 'CLOCK', tp_mmb_euclid: 'EUCLID', tp_mmb_grids: 'GRIDS',
  tp_mmb_marbles: 'MARBLES', tp_mmb_rhythm: 'RITMEBOX', tp_mmb_turing: 'TURING',
};

export function TempoTap(): JSX.Element {
  useLang();
  const project = useModularProject();
  const patch = project.patches.find((x) => x.id === project.activePatchId);
  const { bpm, source } = useTempoNow();
  const tapper = useRef(new TapTempo());
  const [open, setOpen] = useState(false);
  // Het menu vast boven de knop, horizontaal in beeld (op een telefoon staat
  // de knop midden in de werkbalk; uitgelijnd op de knop viel het eraf).
  const [bottom, setBottom] = useState(0);
  const anchor = useRef<HTMLSpanElement>(null);
  const [flash, setFlash] = useState(false);
  const locked = source !== 'patch';
  const mods = patch ? tempoModules(project, patch) : [];

  function tap(): void {
    setFlash(true); window.setTimeout(() => setFlash(false), 90);
    if (locked) return;
    const v = tapper.current.tap(performance.now());
    if (v !== null) setPatchTempo(v);
  }
  const who = source === 'midi' ? 'MIDI' : source === 'song' ? nlen('song', 'song') : '';

  return (
    <span ref={anchor} data-tour="keys-tempo" style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onPointerDown={(e) => { e.preventDefault(); tap(); }}
        title={locked
          ? nlen(`Tempo ${bpm} — de ${who} is de baas`, `Tempo ${bpm} — the ${who} is in charge`)
          : nlen('Tap tempo: tik in de maat (twee tikken of meer); alle tempoknoppen van de patch volgen', 'Tap tempo: tap in time (two taps or more); every tempo knob in the patch follows')}
        aria-label={nlen('Tap tempo', 'Tap tempo')}
        style={{ ...TOOLBAR_BTN, padding: '0 8px', fontVariantNumeric: 'tabular-nums', background: flash ? '#fde68a' : undefined, touchAction: 'manipulation' }}>
        ♩ {bpm % 1 ? bpm.toFixed(1) : bpm}{who ? <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>{who}</span> : null}
      </button>
      <button type="button" onClick={() => {
          const r = anchor.current?.getBoundingClientRect();
          if (r) setBottom(window.innerHeight - r.top + 6);
          setOpen(!open);
        }} aria-label={nlen('Tempo-menu', 'Tempo menu')}
        style={{ ...TOOLBAR_BTN, padding: '0 4px', fontWeight: open ? 700 : 400 }}>▾</button>
      {open && (
        <div role="dialog" aria-label={nlen('Tempo', 'Tempo')} style={{ position: 'fixed', bottom, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          width: 'min(300px, calc(100vw - 24px))', boxSizing: 'border-box',
          background: '#fff', border: '1px solid #cbd2d9', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.18)', padding: 10, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {nlen('Tempo', 'Tempo')}
            <input type="number" min={MIN_BPM} max={MAX_BPM} step={0.1} value={bpm} disabled={locked}
              onChange={(e) => { const v = Number(e.target.value); if (v >= MIN_BPM && v <= MAX_BPM) setPatchTempo(v); }}
              style={{ width: 70, fontSize: 12 }} /> bpm
          </label>
          {locked && <span style={{ color: '#64748b' }}>{source === 'midi'
            ? nlen('De MIDI-clock is de baas.', 'The MIDI clock is in charge.')
            : nlen('De song (sporen) is de baas; leeg de sporen om het tempo te veranderen.', 'The song (tracks) is in charge; clear the tracks to change the tempo.')}</span>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={nlen('Volg de MIDI-clock van een DAW of drumcomputer (vraagt toestemming voor MIDI)', 'Follow the MIDI clock of a DAW or drum machine (asks for MIDI permission)')}>
            <input type="checkbox" checked={followsMidiClock()} onChange={(e) => setFollowMidiClock(e.target.checked)} />
            {nlen('MIDI-clock volgen', 'Follow MIDI clock')}
          </label>
          {mods.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
              {mods.map((m) => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: m.why === 'extclock' ? '#94a3b8' : undefined }}
                  title={m.why === 'extclock' ? nlen('Loopt op een externe klok (ExtClk): de kabel beslist', 'Runs on an external clock (ExtClk): the cable decides') : undefined}>
                  <input type="checkbox" checked={m.follows} disabled={m.why === 'extclock'} onChange={(e) => setTempoOwn(m.id, !e.target.checked)} />
                  {NAMES[m.typeId] ?? m.typeId}
                  <span style={{ marginLeft: 'auto', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                    {m.why === 'extclock' ? 'ExtClk' : m.why === 'own' ? `${m.bpm} (${nlen('eigen', 'own')})` : nlen('volgt', 'follows')}
                  </span>
                </label>
              ))}
            </div>
          )}
          {mods.length === 0 && <span style={{ color: '#64748b' }}>{nlen('Deze patch heeft geen module met een tempoknop.', 'This patch has no module with a tempo knob.')}</span>}
        </div>
      )}
    </span>
  );
}
