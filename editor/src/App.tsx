import { useState } from 'react';
import { EffectSwitcherApp } from './effect-switcher/EffectSwitcherApp';
import { ModularMbApp } from './modular-mb/ModularMbApp';
import { ScopePanel } from './scope/ScopePanel';

type Project = 'switcher' | 'amp' | 'mmb' | 'scope';

export function App(): JSX.Element {
  const [project, setProject] = useState<Project>('switcher');

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>MusicBrain editor</h1>
        <nav style={{ display: 'flex', gap: 4 }}>
          <ProjectButton current={project} value="switcher" set={setProject}>
            Effect-switcher
          </ProjectButton>
          <ProjectButton current={project} value="amp" set={setProject}>
            Amp-switcher
          </ProjectButton>
          <ProjectButton current={project} value="mmb" set={setProject}>
            Modular MB
          </ProjectButton>
          <ProjectButton current={project} value="scope" set={setProject}>
            Scope
          </ProjectButton>
        </nav>
      </header>

      {project === 'switcher' && <EffectSwitcherApp />}

      {project === 'amp' && (
        <section>
          <p style={{ color: '#6b7280' }}>
            Amp-switcher editor: nog niet geïmplementeerd. Dit project routeert
            preamp-out → poweramp-in en poweramp-out → speakers, met mute-tijd.
          </p>
        </section>
      )}

      {project === 'mmb' && <ModularMbApp />}

      {project === 'scope' && (
        <section>
          <p style={{ marginTop: 0 }}>
            Live CV-vs-time trace van <code>mb_simulator</code> via{' '}
            <code>tools/scope-bridge</code> (ws://localhost:8765).
          </p>
          <ScopePanel />
        </section>
      )}
    </main>
  );
}

function ProjectButton(props: {
  current: Project;
  value: Project;
  set: (p: Project) => void;
  children: React.ReactNode;
}): JSX.Element {
  const active = props.current === props.value;
  return (
    <button
      onClick={() => props.set(props.value)}
      style={{
        padding: '4px 12px',
        borderRadius: 4,
        border: '1px solid #cbd2d9',
        background: active ? '#2563eb' : '#f5f7fa',
        color: active ? 'white' : '#1f2933',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
      }}
    >
      {props.children}
    </button>
  );
}
