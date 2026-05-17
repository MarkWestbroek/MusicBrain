import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { EffectSwitcherApp } from './effect-switcher/EffectSwitcherApp';
import { ScopePanel } from './scope/ScopePanel';
export function App() {
    const [project, setProject] = useState('switcher');
    return (_jsxs("main", { style: { fontFamily: 'system-ui, sans-serif', padding: 16 }, children: [_jsxs("header", { style: { display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }, children: [_jsx("h1", { style: { margin: 0 }, children: "MusicBrain editor" }), _jsxs("nav", { style: { display: 'flex', gap: 4 }, children: [_jsx(ProjectButton, { current: project, value: "switcher", set: setProject, children: "Effect-switcher" }), _jsx(ProjectButton, { current: project, value: "amp", set: setProject, children: "Amp-switcher" }), _jsx(ProjectButton, { current: project, value: "synth", set: setProject, children: "Poly-synth (scope)" })] })] }), project === 'switcher' && _jsx(EffectSwitcherApp, {}), project === 'amp' && (_jsx("section", { children: _jsx("p", { style: { color: '#6b7280' }, children: "Amp-switcher editor: nog niet ge\u00EFmplementeerd. Dit project routeert preamp-out \u2192 poweramp-in en poweramp-out \u2192 speakers, met mute-tijd." }) })), project === 'synth' && (_jsxs("section", { children: [_jsxs("p", { style: { marginTop: 0 }, children: ["Live CV-vs-time trace van ", _jsx("code", { children: "mb_simulator" }), " via", ' ', _jsx("code", { children: "tools/scope-bridge" }), " (ws://localhost:8765)."] }), _jsx(ScopePanel, {})] }))] }));
}
function ProjectButton(props) {
    const active = props.current === props.value;
    return (_jsx("button", { onClick: () => props.set(props.value), style: {
            padding: '4px 12px',
            borderRadius: 4,
            border: '1px solid #cbd2d9',
            background: active ? '#2563eb' : '#f5f7fa',
            color: active ? 'white' : '#1f2933',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: active ? 600 : 400,
        }, children: props.children }));
}
