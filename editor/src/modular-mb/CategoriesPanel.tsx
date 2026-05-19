// Categorieën tab — bekijk/edit/voeg toe/verwijder ModuleCategory definitions.

import { useState } from 'react';
import { updateProject, useModularProject, uid } from './store';
import { type ModuleCategory, type CvRange } from './types';

const KIND_OPTIONS = [
  'vco', 'vcf', 'vca',
  'mixer', 'mult', 'attenuator', 'breakout',
  'envelope', 'lfo',
  'midiRouter', 'sequencer',
  'effect', 'drum', 'noise', 'utility',
  'custom',
] as const;

export function CategoriesPanel(): JSX.Element {
  const project = useModularProject();
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState<string>('custom');

  function patchCategory(id: string, fn: (c: ModuleCategory) => ModuleCategory): void {
    updateProject((p) => ({
      ...p,
      categories: p.categories.map((c) => (c.id === id ? fn(c) : c)),
    }));
  }

  function addCategory(): void {
    const label = newLabel.trim();
    if (!label) { alert('Geef de nieuwe categorie een naam.'); return; }
    const id = uid('cat');
    const cat: ModuleCategory = { id, label, kind: newKind };
    updateProject((p) => ({ ...p, categories: [...p.categories, cat] }));
    setNewLabel('');
  }

  function removeCategory(id: string): void {
    const inUse = project.moduleTypes.some((t) => t.categoryId === id);
    if (inUse) {
      alert('Categorie is in gebruik door één of meer ModuleTypes — verplaats die eerst.');
      return;
    }
    if (!confirm('Categorie verwijderen?')) return;
    updateProject((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== id) }));
  }

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
        Categorieën groeperen modules op type. <code>kind</code> bepaalt de
        semantische rol (welke simulator wordt gebruikt, welke default CV-
        range, enz.). <code>label</code> is alleen voor de UI.
      </p>

      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '4px 8px' }}>Id</th>
            <th style={{ padding: '4px 8px' }}>Label</th>
            <th style={{ padding: '4px 8px' }}>Kind</th>
            <th style={{ padding: '4px 8px' }}>CV-range</th>
            <th style={{ padding: '4px 8px' }}>#types</th>
            <th style={{ padding: '4px 8px' }} />
          </tr>
        </thead>
        <tbody>
          {project.categories.map((c) => {
            const usage = project.moduleTypes.filter((t) => t.categoryId === c.id).length;
            const isKnownKind = (KIND_OPTIONS as readonly string[]).includes(String(c.kind));
            return (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#475569' }}>
                  {c.id}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="text" value={c.label}
                    onChange={(e) => patchCategory(c.id, (cc) => ({ ...cc, label: e.target.value }))}
                    style={{ width: '100%', fontSize: 13 }}
                  />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={String(c.kind)}
                    onChange={(e) => patchCategory(c.id, (cc) => ({ ...cc, kind: e.target.value }))}
                    style={{ fontSize: 12 }}
                  >
                    {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                    {!isKnownKind && <option value={String(c.kind)}>{String(c.kind)} (custom)</option>}
                  </select>
                </td>
                <td style={{ padding: '4px 8px', fontSize: 12, color: '#475569' }}>
                  <CvRangeEditor
                    value={c.defaultCvRange}
                    onChange={(rng) => patchCategory(c.id, (cc) => ({
                      ...cc, defaultCvRange: rng,
                    }))}
                  />
                </td>
                <td style={{ padding: '4px 8px', fontSize: 12, color: '#475569', textAlign: 'center' }}>
                  {usage}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <button
                    onClick={() => removeCategory(c.id)}
                    disabled={usage > 0}
                    title={usage > 0 ? `${usage} ModuleType(s) gebruiken deze categorie nog` : 'Verwijder categorie'}
                    style={{ fontSize: 11 }}
                  >
                    Verwijder
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <fieldset style={{
        marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 6, padding: 10,
      }}>
        <legend style={{ fontSize: 12, color: '#374151', padding: '0 6px' }}>
          Nieuwe categorie
        </legend>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <label>Label:
            <input
              type="text" value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="bv. Granular"
              style={{ marginLeft: 4, fontSize: 13 }}
            />
          </label>
          <label>Kind:
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)}
                    style={{ marginLeft: 4, fontSize: 13 }}>
              {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <button onClick={addCategory} style={{ fontSize: 12 }}>+ Toevoegen</button>
        </div>
        <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 0, marginTop: 6 }}>
          Tip: gebruik <code>custom</code> als geen van de ingebouwde kinds past.
          De simulator behandelt onbekende kinds als pass-through.
        </p>
      </fieldset>
    </div>
  );
}

// ── CV-range editor (inline cell) ──────────────────────────────────────

function CvRangeEditor({ value, onChange }: {
  value: CvRange | undefined;
  onChange: (rng: CvRange | undefined) => void;
}): JSX.Element {
  if (!value) {
    return (
      <button
        onClick={() => onChange({ min: -5, max: 5, bipolar: true })}
        style={{ fontSize: 11 }}
        title="Voeg een default CV-range toe voor deze categorie"
      >+ range</button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
      <input type="number" step="0.5" value={value.min}
             onChange={(e) => onChange({ ...value, min: Number(e.target.value) })}
             style={{ width: 48, fontSize: 11 }} />
      <span>…</span>
      <input type="number" step="0.5" value={value.max}
             onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
             style={{ width: 48, fontSize: 11 }} />
      <span>V</span>
      <label title="Bipolair (centreert rond 0)">
        <input type="checkbox" checked={value.bipolar}
               onChange={(e) => onChange({ ...value, bipolar: e.target.checked })} />
        ±
      </label>
      <button onClick={() => onChange(undefined)} style={{ fontSize: 11 }} title="Verwijder range">×</button>
    </span>
  );
}