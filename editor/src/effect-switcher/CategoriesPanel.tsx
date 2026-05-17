import { useState } from 'react';
import { addCategory, removeCategory, renameCategory } from './actions';
import { useProject } from './store';

export function CategoriesPanel(): JSX.Element {
  const project = useProject();
  const [draft, setDraft] = useState('');

  function commitAdd(): void {
    if (!draft.trim()) return;
    addCategory(draft);
    setDraft('');
  }

  return (
    <section>
      <p style={{ color: '#4b5563', fontSize: 13 }}>
        Categorieën worden gebruikt om effectapparaten te groeperen. Een categorie
        kan alleen verwijderd worden als geen enkel apparaat hem nog gebruikt.
      </p>
      <div className="es-toolbar">
        <input
          type="text"
          placeholder="Nieuwe categorie…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); }}
          style={{ minWidth: 220 }}
        />
        <button className="primary" onClick={commitAdd}>Toevoegen</button>
      </div>
      <div className="es-cat-list">
        {project.categories.map((c) => {
          const inUse = project.devices.some((d) => d.categoryId === c.id);
          return (
            <div key={c.id} className="es-cat-item">
              <input
                value={c.label}
                onChange={(e) => renameCategory(c.id, e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {inUse ? '(in gebruik)' : ''}
              </span>
              <button
                className="danger"
                disabled={inUse}
                onClick={() => removeCategory(c.id)}
                title={inUse ? 'In gebruik door één of meer apparaten' : 'Verwijderen'}
                style={{ padding: '2px 8px', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
