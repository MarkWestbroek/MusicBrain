// Modular Music Brain (MMB) — top-level editor with 5 sub-tabs.
// Wired into the global App tab-bar by App.tsx.

import { useState } from 'react';
import { useModularProject } from './store';
import { PatchesPanel } from './PatchesPanel';
import { ModulesPanel } from './ModulesPanel';
import { CategoriesPanel } from './CategoriesPanel';
import { PatcherPanel } from './PatcherPanel';
import { SimulationPanel } from './SimulationPanel';

type Tab = 'patches' | 'modules' | 'categories' | 'patcher' | 'simulation';

const TABS: { id: Tab; label: string }[] = [
  { id: 'patches',    label: 'Patches' },
  { id: 'modules',    label: 'Modules' },
  { id: 'categories', label: 'Categorieën' },
  { id: 'patcher',    label: 'Patcher' },
  { id: 'simulation', label: 'Simulatie' },
];

export function ModularMbApp(): JSX.Element {
  const project = useModularProject();
  const [tab, setTab] = useState<Tab>('patcher');

  return (
    <section style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 12,
        padding: '4px 0 8px', borderBottom: '1px solid #e2e8f0', marginBottom: 12,
      }}>
        <strong style={{ fontSize: 14 }}>{project.name}</strong>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {project.modules.length} modules · {project.patches.length} patches
        </span>
      </div>

      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid #cbd2d9', marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-selected={tab === t.id}
            style={{
              padding: '6px 14px',
              borderRadius: '6px 6px 0 0',
              border: '1px solid #cbd2d9',
              borderBottom: 'none',
              background: tab === t.id ? '#ffffff' : '#f5f7fa',
              fontWeight: tab === t.id ? 600 : 400,
              cursor: 'pointer',
              fontSize: 13,
              position: 'relative',
              top: tab === t.id ? 1 : 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'patches'    && <PatchesPanel />}
      {tab === 'modules'    && <ModulesPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'patcher'    && <PatcherPanel />}
      {tab === 'simulation' && <SimulationPanel />}
    </section>
  );
}
