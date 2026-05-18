// Categorieën tab — bekijk/edit ModuleCategory definitions.
// v0.1: read-only display with inline label rename.

import { updateProject, useModularProject } from './store';

export function CategoriesPanel(): JSX.Element {
  const project = useModularProject();

  function renameCategory(id: string, label: string): void {
    updateProject((p) => ({
      ...p,
      categories: p.categories.map((c) => (c.id === id ? { ...c, label } : c)),
    }));
  }

  return (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
        Categorieën groeperen modules op type. Per categorie kun je standaard
        CV-ranges instellen die nieuwe modules erven.
      </p>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '4px 8px' }}>Id</th>
            <th style={{ padding: '4px 8px' }}>Label</th>
            <th style={{ padding: '4px 8px' }}>Kind</th>
            <th style={{ padding: '4px 8px' }}>Default CV range</th>
          </tr>
        </thead>
        <tbody>
          {project.categories.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                {c.id}
              </td>
              <td style={{ padding: '4px 8px' }}>
                <input
                  type="text"
                  value={c.label}
                  onChange={(e) => renameCategory(c.id, e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </td>
              <td style={{ padding: '4px 8px', fontSize: 11, color: '#475569' }}>{c.kind}</td>
              <td style={{ padding: '4px 8px', fontSize: 12, color: '#475569' }}>
                {c.defaultCvRange
                  ? `${c.defaultCvRange.min}V .. ${c.defaultCvRange.max}V ${c.defaultCvRange.bipolar ? '(±)' : ''}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
