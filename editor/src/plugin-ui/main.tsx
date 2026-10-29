// Bediening van een MMB-plugin: hetzelfde paneel als in de editor
// (ModulePanel), in de webview van JUCE. Waarden lopen via juceBridge.ts
// naar de parameters van de plugin en terug (automation, presets).
// Welke module: `?type=tp_mmb_hall` in de URL, standaard HALL.
// Patch-plugins (`?type=patch_…`, src/modular-mb/patchPlugins.ts): de fronts
// van de patch als tabs; parameter "p<k>" is de k-de knop van pluginParams().

import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../tokens.css';
import { ModulePanel } from '../modular-mb/ModulePanel';
import { buildFrontModule, frontControlState } from '../modular-mb/frontLayout';
import { controlHelp } from '../modular-mb/moduleHelp';
import { PATCH_CATALOG } from '../modular-mb/patchCatalog';
import { PATCH_PLUGINS, TAB_BAR_MM, patchPluginTypeId, pluginFronts, pluginPanelSize, pluginParams } from '../modular-mb/patchPlugins';
import { seedInternals } from '../modular-mb/seedModules';
import { emptyModularProject, type Control, type ControlValue } from '../modular-mb/types';
import { attach, chooseBank, clearBank, inPlugin, log, resizeTo, watchBank, type BankInfo, type Handle, type Kind } from './juceBridge';

// Het venster is vergrootbaar met vaste verhouding (MmbPluginBase.h); de
// schaal volgt de hoogte, want elk paneel is 128,5 mm hoog.
const PANEL_HEIGHT_MM = 128.5;
const pxPerMmNow = () => Math.max(1, window.innerHeight / PANEL_HEIGHT_MM);

/** Waarde zoals een speler hem leest: keuze op naam, getal met eenheid. */
function formatValue(c: Control, v: ControlValue): string {
  if (c.kind === 'switch') return c.positions[Number(v)] ?? String(v);
  if (c.kind === 'toggle') return v ? (c.onLabel ?? 'aan') : (c.offLabel ?? 'uit');
  if (typeof v !== 'number') return String(v);
  const a = Math.abs(v);
  const digits = 'step' in c && c.step !== undefined && Number.isInteger(c.step) ? 0 : a >= 100 ? 0 : a >= 10 ? 1 : 2;
  const num = v.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return 'unit' in c && c.unit ? `${num} ${c.unit}` : num;
}

/** Hoek rechtsonder: slepen vraagt de plugin om een andere vensterhoogte. */
function ResizeGrip({ size }: { size: number }) {
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      title="Slepen om te vergroten"
      style={{ position: 'fixed', right: 0, bottom: 0, width: size, height: size, cursor: 'nwse-resize', touchAction: 'none',
        background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.35) 58%, transparent 58%, transparent 70%, rgba(255,255,255,0.35) 70%, rgba(255,255,255,0.35) 78%, transparent 78%)' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.screenY, h: window.innerHeight }; }}
      onPointerMove={(e) => { if (start.current) resizeTo(start.current.h + (e.screenY - start.current.y)); }}
      onPointerUp={() => { start.current = null; }}
      onPointerCancel={() => { start.current = null; }}
    />
  );
}

/** Bankbalk (sampler, TAPE STRIP): welke bank klinkt, eigen bank kiezen of
 *  terug naar de Bank-knop. Een eigen bank gaat mee in het project. */
function BankBar({ pxPerMm }: { pxPerMm: number }) {
  const [info, setInfo] = useState<BankInfo | null>(null);
  useEffect(() => watchBank((b) => { log(`bank: ${JSON.stringify(b)}`); setInfo(b); }), []);
  if (!info?.has) return null;
  const btn = { font: 'inherit', color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: pxPerMm * 0.6, padding: `0 ${pxPerMm}px`, cursor: 'pointer' } as const;
  const text = info.error ? info.error : info.name ? `${info.own ? 'Eigen bank' : `Bank ${info.knob}`}: ${info.name}` : 'Bank laden…';
  return (
    <div style={{ position: 'fixed', left: pxPerMm * 2, right: pxPerMm * 2, bottom: pxPerMm * 1.5, display: 'flex', gap: pxPerMm, alignItems: 'center',
      padding: `${pxPerMm * 0.6}px ${pxPerMm}px`, borderRadius: pxPerMm, background: 'rgba(11,13,18,0.88)', border: '1px solid rgba(255,255,255,0.18)',
      color: info.error ? '#fca5a5' : '#fff', font: `500 ${pxPerMm * 2.4}px/1.3 system-ui, sans-serif` }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={text}>{text}</span>
      <button type="button" style={btn} onClick={chooseBank} title="Een .mmbs kiezen; die gaat mee in het project">Eigen…</button>
      {info.own && <button type="button" style={btn} onClick={clearBank} title="Terug naar de bank van de Bank-knop">Knop</button>}
    </div>
  );
}

// De parameters van de plugin dragen de control-ids van het paneel
// (editor/scripts/pluginParams.ts), dus de relay heet als de knop.

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
  const [pxPerMm, setPxPerMm] = useState(pxPerMmNow);
  // Waardevenster: de knop waaraan gedraaid wordt, met zijn waarde (de editor
  // toont dat in de eigenschappenkolom; de plugin heeft die niet).
  const [readout, setReadout] = useState<{ label: string; text: string } | null>(null);
  const readoutTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onResize = () => setPxPerMm(pxPerMmNow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!type) return;
    let received = false;
    for (const c of type.controls) {
      if (c.kind === 'display') continue;
      const kind: Kind = c.kind === 'switch' ? 'combo' : c.kind === 'toggle' ? 'toggle' : 'slider';
      handles.current[c.id] = attach(c.id, kind, (v) => { received = true; setState((s) => ({ ...s, [c.id]: v })); });
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
    <>
    <ModulePanel
      module={mod}
      types={base.moduleTypes}
      controlState={state}
      pxPerMm={pxPerMm}
      onControlChange={(id, v) => {
        setState((s) => ({ ...s, [id]: v }));
        if (typeof v === 'number' || typeof v === 'boolean') handles.current[id]?.set(v);
        const c = type.controls.find((x) => x.id === id);
        if (c) {
          setReadout({ label: 'label' in c && c.label ? c.label : id, text: formatValue(c, v) });
          window.clearTimeout(readoutTimer.current);
          readoutTimer.current = window.setTimeout(() => setReadout(null), 1200);
        }
      }}
    />
    {readout && (
      <div style={{ position: 'fixed', left: '50%', bottom: pxPerMm * 9, transform: 'translateX(-50%)', pointerEvents: 'none',
        padding: `${pxPerMm * 0.8}px ${pxPerMm * 2}px`, borderRadius: pxPerMm, background: 'rgba(11,13,18,0.88)',
        border: '1px solid rgba(255,255,255,0.18)', color: '#fff', font: `600 ${pxPerMm * 3}px/1.2 system-ui, sans-serif`, whiteSpace: 'nowrap' }}>
        <span style={{ opacity: 0.7, fontWeight: 400 }}>{readout.label}</span>&nbsp; {readout.text}
      </div>
    )}
    <BankBar pxPerMm={pxPerMm} />
    {inPlugin && <ResizeGrip size={Math.max(14, pxPerMm * 4)} />}
    </>
  );
}

/** Waardevenster onderin: de knop waaraan gedraaid wordt, met zijn waarde. */
function useReadout(): [{ label: string; text: string } | null, (label: string, text: string) => void] {
  const [readout, setReadout] = useState<{ label: string; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  return [readout, (label, text) => {
    setReadout({ label, text });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReadout(null), 1200);
  }];
}

function Readout({ readout, pxPerMm, bottom }: { readout: { label: string; text: string } | null; pxPerMm: number; bottom: number }) {
  if (!readout) return null;
  return (
    <div style={{ position: 'fixed', left: '50%', bottom, transform: 'translateX(-50%)', pointerEvents: 'none',
      padding: `${pxPerMm * 0.8}px ${pxPerMm * 2}px`, borderRadius: pxPerMm, background: 'rgba(11,13,18,0.88)',
      border: '1px solid rgba(255,255,255,0.18)', color: '#fff', font: `600 ${pxPerMm * 3}px/1.2 system-ui, sans-serif`, whiteSpace: 'nowrap' }}>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>{readout.label}</span>&nbsp; {readout.text}
    </div>
  );
}

/** Een patch-plugin: de fronts van de patch als tabs. Elke knop is een
 *  parameter van de plugin (de motor zet hem op alle stemmen). */
function PatchApp({ typeId }: { typeId: string }) {
  const entry = PATCH_PLUGINS.find((p) => patchPluginTypeId(p.target) === typeId);
  const built = useMemo(() => {
    const seed = entry && PATCH_CATALOG.find((e) => e.label === entry.label);
    if (!seed) return null;
    const project = seed.build(seedInternals(emptyModularProject()));
    const patch = project.patches.find((x) => x.id === project.activePatchId) ?? project.patches[project.patches.length - 1]!;
    return { project, patch, fronts: pluginFronts(project, patch), params: pluginParams(project, patch), size: pluginPanelSize(project, patch) };
  }, [entry]);
  // Stand per (module, knop), zoals patch.controlState.
  const [state, setState] = useState<Record<string, Record<string, ControlValue>>>(() => built?.patch.controlState ?? {});
  const [tab, setTab] = useState(() => Number(new URLSearchParams(window.location.search).get('tab') ?? 0));   // ?tab= voor schermafdrukken
  const handles = useRef<Handle[]>([]);
  const [readout, showReadout] = useReadout();
  const [pxPerMm, setPxPerMm] = useState(1);

  useEffect(() => {
    if (!built) return;
    const fit = () => setPxPerMm(Math.max(0.5, Math.min(window.innerWidth / built.size.widthMm, window.innerHeight / built.size.heightMm)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [built]);

  useEffect(() => {
    if (!built) return;
    let received = false;
    handles.current = built.params.map((p, k) => {
      const kind: Kind = p.control.kind === 'switch' ? 'combo' : p.control.kind === 'toggle' ? 'toggle' : 'slider';
      return attach(`p${k}`, kind, (v) => {
        received = true;
        setState((s) => ({ ...s, [p.moduleId]: { ...s[p.moduleId], [p.controlId]: v } }));
      });
    });
    // Zie App: de beginstand komt tijdens het laden niet altijd aan.
    const timers = [150, 500, 1500, 4000].map((ms) => window.setTimeout(() => {
      if (!received) for (const h of handles.current) h.refresh();
    }, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [built]);

  if (!built) return <p style={{ color: '#f87171' }}>Onbekende patch: {typeId}</p>;
  const { project, fronts, params, size } = built;
  const patch = { ...built.patch, controlState: state };
  const front = fronts[Math.min(tab, fronts.length - 1)];
  if (!front) return <p style={{ color: '#f87171' }}>Deze patch heeft geen front.</p>;
  const fm = buildFrontModule(front, patch, project);
  const tabs = fronts.length > 1;
  const tabH = tabs ? TAB_BAR_MM * pxPerMm : 0;
  const width = size.widthMm * pxPerMm;

  return (
    <div style={{ width, margin: '0 auto', background: '#0b0d12', minHeight: '100vh' }}>
      {tabs && (
        <div role="tablist" style={{ display: 'flex', gap: pxPerMm, height: tabH, alignItems: 'flex-end', padding: `0 ${pxPerMm * 2}px`, boxSizing: 'border-box' }}>
          {fronts.map((f, i) => (
            <button key={f.id} type="button" role="tab" aria-selected={i === tab} onClick={() => setTab(i)}
              style={{ font: `600 ${pxPerMm * 3.2}px/1 system-ui, sans-serif`, padding: `${pxPerMm * 1.4}px ${pxPerMm * 3}px`, cursor: 'pointer',
                color: i === tab ? '#0b0d12' : '#e5e7eb', background: i === tab ? '#d6dade' : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)', borderBottom: 'none', borderRadius: `${pxPerMm}px ${pxPerMm}px 0 0` }}>
              {f.name}
            </button>
          ))}
        </div>
      )}
      <div style={{ width: fm.widthMm * pxPerMm }}>
        <ModulePanel
          module={fm.module}
          types={[fm.type]}
          controlState={frontControlState(fm, patch)}
          pxPerMm={pxPerMm}
          controlHelp={(vid) => {
            const t = fm.map[vid];
            const m = t?.kind === 'control' ? project.modules.find((x) => x.id === t.moduleId) : undefined;
            return t?.kind === 'control' && m ? controlHelp(m.typeId, t.controlId) : null;
          }}
          onControlChange={(vid, v) => {
            const t = fm.map[vid];
            if (!t || t.kind !== 'control') return;
            setState((s) => ({ ...s, [t.moduleId]: { ...s[t.moduleId], [t.controlId]: v } }));
            const k = params.findIndex((p) => p.moduleId === t.moduleId && p.controlId === t.controlId);
            if (k >= 0 && (typeof v === 'number' || typeof v === 'boolean')) handles.current[k]?.set(v);
            const c = fm.type.controls.find((x) => x.id === vid);
            if (c) showReadout('label' in c && c.label ? c.label : vid, formatValue(c, v));
          }}
        />
      </div>
      <Readout readout={readout} pxPerMm={pxPerMm} bottom={pxPerMm * 6} />
      {inPlugin && <ResizeGrip size={Math.max(14, pxPerMm * 4)} />}
    </div>
  );
}

const typeId = new URLSearchParams(window.location.search).get('type') ?? 'tp_mmb_hall';
document.title = inPlugin ? 'MMB' : `MMB ${typeId} (los, geen plugin)`;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {typeId.startsWith('patch_') ? <PatchApp typeId={typeId} /> : <App typeId={typeId} />}
  </StrictMode>,
);
