// FrontPanel — tekent een patch-front als virtueel paneel met `ModulePanel`
// en schrijft knopbewegingen via het ene schrijfpad (setPatchControl) naar
// de patch, met poly-fan-out en live naar de Teensy. De simulator hoort de
// wijziging via de store; de live waarden van engine of Teensy komen hier
// als overlay terug, zoals in de patcher.

import { useEffect, useMemo, useRef, useState } from 'react';

import { ModulePanel } from './ModulePanel';
import { buildFrontModule, frontControlState } from './frontLayout';
import { controlHelp } from './moduleHelp';
import { setPatchControl } from './setPatchControl';
import { useEngineStatus } from './sim/engineSingleton';
import type { ControlValue, ModularProject, Patch, PatchFront, Port } from './types';

export function FrontPanel({ front, patch, project, pxPerMm = 3, onPortClick, onArrange }: {
  front: PatchFront; patch: Patch; project: ModularProject; pxPerMm?: number;
  /** Klik op een jack van de black box; krijgt de echte (module, poort). */
  onPortClick?: (moduleId: string, portId: string, port: Port) => void;
  /** Gezet = schikmodus (stap 4): een laag over het paneel waarin je items
   *  versleept; de knoppen zelf zijn dan niet te draaien. Krijgt de index
   *  van het item in `front.items` en de nieuwe plek in mm. */
  onArrange?: (itemIndex: number, pos: { x: number; y: number }) => void;
}): JSX.Element {
  const fm = useMemo(() => buildFrontModule(front, patch, project), [front, patch.controlLabels, project.modules, project.moduleTypes]);
  const live = useEngineStatus().liveControls;
  // Smal scherm: letters op het front anderhalf keer zo groot, de knoppen niet.
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const sync = (): void => setNarrow(window.innerWidth < 640);
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  const controlState = frontControlState(fm, patch, live);

  // Help: hover geeft de regel als tooltip, lang drukken als ballon (telefoon).
  const helpOf = (vid: string): string | null => {
    const t = fm.map[vid];
    if (!t || t.kind !== 'control') return null;
    const m = project.modules.find((x) => x.id === t.moduleId);
    return m ? controlHelp(m.typeId, t.controlId) : null;
  };
  const [balloon, setBalloon] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!balloon) return;
    const close = (): void => setBalloon(null);
    const t = setTimeout(close, 6000);
    // Volgende tik ergens sluit hem (na deze tik: pas na het loslaten luisteren).
    const arm = setTimeout(() => window.addEventListener('pointerdown', close, { once: true }), 0);
    return () => { clearTimeout(t); clearTimeout(arm); window.removeEventListener('pointerdown', close); };
  }, [balloon]);

  function onControlChange(vid: string, value: ControlValue): void {
    const t = fm.map[vid];
    if (!t || t.kind !== 'control') return;
    setPatchControl(patch.id, t.moduleId, t.controlId, value, { twins: true });
  }

  // Schikmodus: grepen op de plekken van de items, slepen = nieuwe pos.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ vid: string; x: number; y: number } | null>(null);
  const scale = () => (wrapRef.current ? wrapRef.current.getBoundingClientRect().width / fm.widthMm : pxPerMm);
  const indexOf = (vid: string): number => {
    const t = fm.map[vid];
    if (!t) return -1;
    return front.items.findIndex((it) => (t.kind === 'control'
      ? it.kind === 'control' && it.moduleId === t.moduleId && it.controlId === t.controlId
      : it.kind === 'port' && it.moduleId === t.moduleId && it.portId === t.portId));
  };
  const handles = onArrange ? [
    ...Object.entries(fm.module.visual.controlPlacements).map(([vid, p]) => ({ vid, x: p.x, y: p.y, r: 9 })),
    ...Object.entries(fm.module.visual.portPlacements).map(([vid, p]) => ({ vid, x: p.x, y: p.y, r: 4 })),
  ] : [];

  return (
    <div ref={wrapRef} className="mb-front" style={{ width: fm.widthMm * pxPerMm, maxWidth: '100%', position: 'relative' }}>
      <style>{`.mb-front > svg { width: 100%; height: auto; }`}</style>
      {onArrange && (
        <div
          style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: drag ? 'grabbing' : 'default', zIndex: 2 }}
          onPointerMove={(e) => {
            if (!drag) return;
            const r = wrapRef.current!.getBoundingClientRect();
            const s = scale();
            setDrag({ ...drag, x: Math.round((e.clientX - r.left) / s), y: Math.round((e.clientY - r.top) / s) });
          }}
          onPointerUp={(e) => {
            if (!drag) return;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            const i = indexOf(drag.vid);
            if (i >= 0) onArrange(i, { x: Math.max(4, Math.min(fm.widthMm - 4, drag.x)), y: Math.max(12, drag.y) });
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {handles.map((h) => {
            const s = scale();
            const live = drag?.vid === h.vid ? drag : h;
            return (
              <div key={h.vid} title="Sleep om vrij te plaatsen"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag({ vid: h.vid, x: h.x, y: h.y });
                }}
                style={{
                  position: 'absolute', left: (live.x - h.r) * s, top: (live.y - h.r) * s, width: h.r * 2 * s, height: h.r * 2 * s,
                  borderRadius: '50%', border: '2px dashed #f59e0b', background: drag?.vid === h.vid ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.08)',
                  cursor: 'grab', boxSizing: 'border-box',
                }} />
            );
          })}
        </div>
      )}
      <ModulePanel
      module={fm.module}
      types={[fm.type]}
      controlState={controlState}
      onControlChange={onControlChange}
      onPortClick={onPortClick ? (vid, port) => {
        const t = fm.map[vid];
        if (t?.kind === 'port') onPortClick(t.moduleId, t.portId, port);
      } : undefined}
      pxPerMm={pxPerMm}
      textScale={narrow ? 1.5 : 1}
      controlHelp={onArrange ? undefined : helpOf}
      onControlHold={(vid, at) => { const text = helpOf(vid); if (text) setBalloon({ text, ...at }); }}
      />
      {balloon && (
        <div role="tooltip" style={{
          position: 'fixed', zIndex: 50, left: Math.max(8, Math.min(window.innerWidth - 268, balloon.x - 130)), top: Math.max(8, balloon.y - 8),
          transform: 'translateY(-100%)', width: 260, padding: '8px 10px', borderRadius: 8, fontSize: 13, lineHeight: 1.35,
          background: '#1f2937', color: '#f9fafb', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', pointerEvents: 'none',
        }}>{balloon.text}</div>
      )}
    </div>
  );
}
