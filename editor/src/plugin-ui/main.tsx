// Bediening van een MMB-plugin: hetzelfde paneel als in de editor
// (ModulePanel), in de webview van JUCE. Waarden lopen via juceBridge.ts
// naar de parameters van de plugin en terug (automation, presets).
// Welke module: `?type=tp_mmb_hall` in de URL, standaard HALL.

import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../tokens.css';
import { ModulePanel } from '../modular-mb/ModulePanel';
import { seedInternals } from '../modular-mb/seedModules';
import { emptyModularProject, type ControlValue } from '../modular-mb/types';
import { attach, inPlugin, log, type Handle, type Kind } from './juceBridge';

const PX_PER_MM = 4;

// Paneel-id → parameternaam in de plugin, waar die verschillen.
const PARAM_NAME: Record<string, string> = { freeze_btn: 'freeze' };

function App({ typeId }: { typeId: string }) {
  const base = useMemo(() => seedInternals(emptyModularProject()), []);
  const mod = base.modules.find((m) => m.typeId === typeId);
  const type = base.moduleTypes.find((t) => t.id === typeId);
  const [state, setState] = useState<Record<string, ControlValue>>(() => {
    const init: Record<string, ControlValue> = {};
    for (const c of type?.controls ?? []) if ('defaultValue' in c && c.defaultValue !== undefined) init[c.id] = c.defaultValue as ControlValue;
    return init;
  });
  const handles = useRef<Record<string, Handle>>({});

  useEffect(() => {
    if (!type) return;
    let received = false;
    for (const c of type.controls) {
      if (c.kind === 'display') continue;
      const kind: Kind = c.kind === 'switch' ? 'combo' : c.kind === 'toggle' ? 'toggle' : 'slider';
      handles.current[c.id] = attach(PARAM_NAME[c.id] ?? c.id, kind, (v) => { received = true; setState((s) => ({ ...s, [c.id]: v })); });
    }
    // De JUCE-bibliotheek vraagt bij het aanmaken van een state de beginstand
    // op, maar dat antwoord komt tijdens het laden niet aan (gemeten,
    // doc/plans/plugin.md). Daarom nog eens vragen tot de eerste waarde er is.
    const timers = [150, 500, 1500, 4000].map((ms) => window.setTimeout(() => {
      if (received) return;
      log(`beginstand opvragen (${ms} ms)`);
      for (const h of Object.values(handles.current)) h.refresh();
    }, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [type]);

  if (!mod || !type) return <p style={{ color: '#f87171' }}>Onbekend moduletype: {typeId}</p>;
  return (
    <ModulePanel
      module={mod}
      types={base.moduleTypes}
      controlState={state}
      pxPerMm={PX_PER_MM}
      onControlChange={(id, v) => {
        setState((s) => ({ ...s, [id]: v }));
        if (typeof v === 'number' || typeof v === 'boolean') handles.current[id]?.set(v);
      }}
    />
  );
}

const typeId = new URLSearchParams(window.location.search).get('type') ?? 'tp_mmb_hall';
document.title = inPlugin ? 'MMB' : `MMB ${typeId} (los, geen plugin)`;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App typeId={typeId} />
  </StrictMode>,
);
