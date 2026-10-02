// Labels per patch bij de bedieningen van een module (Patch.controlLabels):
// bij PADS "1 Start/Stop", "2 Restart", bij FADERS "Cutoff". Een
// control-waarde kan geen tekst zijn (ControlValue is getal/aan-uit/joystick),
// dus de tekst staat los in de patch. Het paneel toont hem (display onder een
// grote knop, groene naam bij draaiknop en schuif); bewerken in de
// eigenschappen (ControlLabelFields) of met een dubbelklik op het display.
// Naar de Teensy gaat hij nog niet: zie doc/plans/control-labels.md.

import { updateProject, useModularProject } from './store';
import type { Control } from './types';

/** Zet (of wist, bij lege tekst) het onderschrift van één knop in één patch. */
export function setControlLabel(patchId: string, moduleId: string, controlId: string, text: string): void {
  updateProject((p) => ({
    ...p,
    patches: p.patches.map((px) => {
      if (px.id !== patchId) return px;
      const own = { ...(px.controlLabels?.[moduleId] ?? {}) };
      // Niet trimmen: dit loopt per toetsaanslag, en dan kun je geen spatie
      // tussen twee woorden typen.
      const clean = text.slice(0, 24);
      if (clean.trim()) own[controlId] = clean; else delete own[controlId];
      const all = { ...(px.controlLabels ?? {}), [moduleId]: own };
      if (Object.keys(own).length === 0) delete all[moduleId];
      return { ...px, controlLabels: all };
    }),
  }));
}

/** Invoervelden per knop van `moduleId`, voor de actieve (of gegeven) patch.
 *  Niets als de module geen knoppen heeft of er geen patch actief is. */
export function ControlLabelFields({ moduleId, controls, patchId, dark = false }: {
  moduleId: string; controls: Control[]; patchId?: string; dark?: boolean;
}): JSX.Element | null {
  const project = useModularProject();
  const id = patchId ?? project.activePatchId;
  const patch = project.patches.find((x) => x.id === id);
  // Knoppen, draaiknoppen en schuiven: daar heeft een eigen naam zin (een
  // schakelaar heeft al tekst per stand).
  const buttons = controls.filter((c) => c.kind === 'button' || c.kind === 'knob' || c.kind === 'slider');
  if (!patch || buttons.length === 0) return null;
  const own = patch.controlLabels?.[moduleId] ?? {};
  const input: React.CSSProperties = dark
    ? { fontSize: 12, padding: '2px 6px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 3 }
    : { fontSize: 11, padding: '2px 5px' };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: dark ? '#94a3b8' : '#374151', margin: '6px 0 3px' }}>
        Labels <span style={{ fontWeight: 400 }}>(deze patch)</span>
      </div>
      {buttons.map((c) => (
        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: 11 }}>
          <span style={{ width: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: dark ? '#94a3b8' : '#6b7280' }}>{c.label || c.id}</span>
          <input
            value={own[c.id] ?? ''}
            placeholder="—"
            maxLength={24}
            onChange={(e) => setControlLabel(patch.id, moduleId, c.id, e.target.value)}
            style={{ ...input, flex: 1, minWidth: 0 }}
          />
        </label>
      ))}
    </div>
  );
}
