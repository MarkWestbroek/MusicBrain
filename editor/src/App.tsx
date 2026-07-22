import { useState } from 'react';
import { EffectSwitcherApp } from './effect-switcher/EffectSwitcherApp';
import { ModularMbApp } from './modular-mb/ModularMbApp';
import { ScopePanel } from './scope/ScopePanel';

type Project = 'switcher' | 'amp' | 'mmb' | 'scope';

export function App(): JSX.Element {
  const [project, setProject] = useState<Project>('switcher');

  return (
    <main style={{ fontFamily: 'var(--mb-font-sans)', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <BrainMark />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Music<span style={{ color: 'var(--mb-accent)' }}>Brain</span>{' '}
          <span
            style={{
              fontFamily: 'var(--mb-font-mono)',
              fontSize: 11,
              fontWeight: 400,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: '#6b7280',
            }}
          >
            editor
          </span>
        </h1>
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

/** Patch-brain merk — jack-nodes + kabelbogen; amber, matcht de site-header. */
function BrainMark(): JSX.Element {
  return (
    <svg width="40" height="34" viewBox="0 0 70 60" role="img" aria-label="MusicBrain">
      <g fill="none" stroke="var(--mb-accent)" strokeWidth={3} strokeLinecap="round">
        <path d="M14 42 Q 12 18 33 13" />
        <path d="M33 13 Q 58 12 57 33" />
        <path d="M14 42 Q 20 54 38 51" />
        <path d="M38 51 Q 54 48 57 33" />
        <path d="M25 32 Q 35 24 46 33" />
      </g>
      <g fill="#ffffff" stroke="var(--mb-accent)" strokeWidth={3}>
        <circle cx={14} cy={42} r={5.5} />
        <circle cx={33} cy={13} r={5.5} />
        <circle cx={57} cy={33} r={5.5} />
        <circle cx={38} cy={51} r={5.5} />
      </g>
      <circle cx={35.5} cy={31} r={4} fill="var(--mb-accent)" />
    </svg>
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
        border: active ? '1px solid var(--mb-accent-strong)' : '1px solid #cbd2d9',
        background: active ? 'var(--mb-accent)' : '#f5f7fa',
        color: active ? 'var(--mb-on-accent)' : '#1f2933',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
      }}
    >
      {props.children}
    </button>
  );
}
