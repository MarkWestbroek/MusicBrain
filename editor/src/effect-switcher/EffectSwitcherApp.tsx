import { useState } from 'react';
import { CategoriesPanel } from './CategoriesPanel';
import { ChainPanel } from './ChainPanel';
import { PatchesPanel } from './PatchesPanel';
import { SimulationPanel } from './SimulationPanel';
import { resetProject, seedDemo } from './actions';
import { useProject } from './store';
import './styles.css';

type SubTab = 'patches' | 'chain' | 'categories' | 'simulation';

export function EffectSwitcherApp(): JSX.Element {
  const project = useProject();
  const [tab, setTab] = useState<SubTab>('patches');

  return (
    <div className="es-app">
      <div className="es-tabs">
        <button className="es-tab" aria-selected={tab === 'patches'}
                onClick={() => setTab('patches')}>Patches</button>
        <button className="es-tab" aria-selected={tab === 'chain'}
                onClick={() => setTab('chain')}>Effect-chain</button>
        <button className="es-tab" aria-selected={tab === 'categories'}
                onClick={() => setTab('categories')}>Categorieën</button>
        <button className="es-tab" aria-selected={tab === 'simulation'}
                onClick={() => setTab('simulation')}>Simulatie</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>
            {project.devices.length} apparaten · {project.patches.length} patches · {project.relayCount} relais
          </span>
          <button
            onClick={seedDemo}
            style={{ fontSize: 12 }}
            title="Vervang met 5 demo-pedalen en 5 patches"
          >
            Demo laden
          </button>
          <button
            className="es-tab"
            onClick={() => {
              if (confirm('Project wissen?')) resetProject();
            }}
            style={{ fontSize: 12, color: '#b91c1c' }}
          >
            Reset
          </button>
        </div>
      </div>

      {tab === 'patches'    && <PatchesPanel />}
      {tab === 'chain'      && <ChainPanel />}
      {tab === 'categories' && <CategoriesPanel />}
      {tab === 'simulation' && <SimulationPanel />}
    </div>
  );
}
