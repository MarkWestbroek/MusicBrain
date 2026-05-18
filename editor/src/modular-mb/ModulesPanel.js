import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Modules tab — list, add, edit, remove module definitions.
// v0.1: minimal CRUD; full port editor follows in v0.2.
import { updateProject, useModularProject } from './store';
const ALL_KINDS = [
    'vco', 'vcf', 'vca', 'mixer', 'mult', 'attenuator', 'breakout',
    'envelope', 'lfo', 'midiRouter', 'sequencer', 'custom',
];
function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
/** Generate a sensible default port set + params for a given kind. */
function defaultPortsFor(kind) {
    const cvRange = { min: -5, max: 5, bipolar: true };
    const unipolar = { min: 0, max: 10, bipolar: false };
    switch (kind) {
        case 'vco':
            return {
                inputs: [
                    { id: 'voct', name: '1V/oct', signalType: 'cv', range: cvRange },
                    { id: 'fm', name: 'FM', signalType: 'cv', range: cvRange },
                ],
                outputs: [
                    { id: 'saw', name: 'Saw', signalType: 'audio' },
                    { id: 'sqr', name: 'Sqr', signalType: 'audio' },
                    { id: 'sine', name: 'Sine', signalType: 'audio' },
                ],
                params: [
                    { id: 'tune', name: 'Tune', min: -12, max: 12, defaultValue: 0, unit: 'st', preferredView: 'knob' },
                    { id: 'fine', name: 'Fine', min: -1, max: 1, defaultValue: 0, preferredView: 'knob' },
                    { id: 'pwm', name: 'PWM', min: 0, max: 1, defaultValue: 0.5, preferredView: 'knob' },
                ],
            };
        case 'vcf':
            return {
                inputs: [
                    { id: 'in', name: 'In', signalType: 'audio' },
                    { id: 'cutoff', name: 'Cutoff', signalType: 'cv', range: cvRange },
                    { id: 'reso', name: 'Reso', signalType: 'cv', range: unipolar },
                ],
                outputs: [
                    { id: 'lp', name: 'LP', signalType: 'audio' },
                    { id: 'hp', name: 'HP', signalType: 'audio' },
                ],
                params: [
                    { id: 'cutoff', name: 'Cutoff', min: 0, max: 1, defaultValue: 0.5, preferredView: 'knob' },
                    { id: 'reso', name: 'Reso', min: 0, max: 1, defaultValue: 0.1, preferredView: 'knob' },
                ],
            };
        case 'vca':
            return {
                inputs: [
                    { id: 'in', name: 'In', signalType: 'audio' },
                    { id: 'cv', name: 'CV', signalType: 'cv', range: unipolar },
                ],
                outputs: [{ id: 'out', name: 'Out', signalType: 'audio' }],
                params: [
                    { id: 'gain', name: 'Gain', min: 0, max: 2, defaultValue: 1, preferredView: 'knob' },
                ],
            };
        case 'envelope':
            return {
                inputs: [{ id: 'gate', name: 'Gate', signalType: 'gate' }],
                outputs: [{ id: 'cv', name: 'CV', signalType: 'cv', range: unipolar }],
                params: [
                    { id: 'a', name: 'A', min: 0, max: 5000, defaultValue: 10, unit: 'ms', preferredView: 'slider' },
                    { id: 'h', name: 'H', min: 0, max: 5000, defaultValue: 0, unit: 'ms', preferredView: 'slider' },
                    { id: 'd', name: 'D', min: 0, max: 5000, defaultValue: 200, unit: 'ms', preferredView: 'slider' },
                    { id: 's', name: 'S', min: 0, max: 1, defaultValue: 0.7, preferredView: 'slider' },
                    { id: 'r', name: 'R', min: 0, max: 5000, defaultValue: 300, unit: 'ms', preferredView: 'slider' },
                ],
            };
        case 'lfo':
            return {
                inputs: [
                    { id: 'reset', name: 'Reset', signalType: 'trigger' },
                ],
                outputs: [
                    { id: 'cv', name: 'CV', signalType: 'cv', range: cvRange },
                    { id: 'sqr', name: 'Sqr', signalType: 'gate' },
                ],
                params: [
                    { id: 'freq', name: 'Freq', min: 0.01, max: 50, defaultValue: 1, unit: 'Hz', preferredView: 'knob' },
                    { id: 'amp', name: 'Amp', min: 0, max: 1, defaultValue: 1, preferredView: 'knob' },
                ],
            };
        case 'breakout':
            return {
                inputs: [{ id: 'dcv', name: 'dCV', signalType: 'cv', range: cvRange }],
                outputs: [{ id: 'acv', name: 'aCV', signalType: 'cv', range: cvRange }],
                params: [
                    { id: 'attenuation', name: 'Atten', min: 0, max: 1, defaultValue: 1, preferredView: 'slider' },
                    { id: 'invert', name: 'Inv', min: 0, max: 1, defaultValue: 0, preferredView: 'toggle' },
                ],
            };
        case 'mixer':
            return {
                inputs: [
                    { id: 'in1', name: 'In1', signalType: 'audio' },
                    { id: 'in2', name: 'In2', signalType: 'audio' },
                    { id: 'in3', name: 'In3', signalType: 'audio' },
                ],
                outputs: [{ id: 'out', name: 'Out', signalType: 'audio' }],
                params: [
                    { id: 'l1', name: 'L1', min: 0, max: 1, defaultValue: 0.7, preferredView: 'slider' },
                    { id: 'l2', name: 'L2', min: 0, max: 1, defaultValue: 0.7, preferredView: 'slider' },
                    { id: 'l3', name: 'L3', min: 0, max: 1, defaultValue: 0.7, preferredView: 'slider' },
                ],
            };
        default:
            return { inputs: [], outputs: [], params: [] };
    }
}
export function ModulesPanel() {
    const project = useModularProject();
    function addModule(kind) {
        const ports = defaultPortsFor(kind);
        const m = {
            id: uid('m'),
            kind,
            label: `${kind.toUpperCase()} ${project.modules.filter((x) => x.kind === kind).length + 1}`,
            inputs: ports.inputs,
            outputs: ports.outputs,
            params: ports.params,
            externallyControlled: kind === 'vco' || kind === 'vcf' || kind === 'vca' || kind === 'mixer',
        };
        updateProject((p) => ({ ...p, modules: [...p.modules, m] }));
    }
    function removeModule(id) {
        updateProject((p) => ({ ...p, modules: p.modules.filter((m) => m.id !== id) }));
    }
    function renameModule(id, label) {
        updateProject((p) => ({
            ...p,
            modules: p.modules.map((m) => (m.id === id ? { ...m, label } : m)),
        }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }, children: [_jsx("span", { style: { fontSize: 12, alignSelf: 'center', color: '#6b7280' }, children: "+ Module:" }), ALL_KINDS.map((k) => (_jsx("button", { onClick: () => addModule(k), style: { fontSize: 12 }, children: k }, k)))] }), project.modules.length === 0 && (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Nog geen modules. Voeg er een toe via de knoppen hierboven." })), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("th", { style: { padding: '4px 8px' }, children: "Kind" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Label" }), _jsx("th", { style: { padding: '4px 8px' }, children: "In" }), _jsx("th", { style: { padding: '4px 8px' }, children: "Out" }), _jsx("th", {})] }) }), _jsx("tbody", { children: project.modules.map((m) => (_jsxs("tr", { style: { borderBottom: '1px solid #f3f4f6' }, children: [_jsx("td", { style: { padding: '4px 8px', fontFamily: 'ui-monospace, monospace', fontSize: 11 }, children: m.kind }), _jsx("td", { style: { padding: '4px 8px' }, children: _jsx("input", { type: "text", value: m.label, onChange: (e) => renameModule(m.id, e.target.value), style: { width: '100%', fontSize: 13 } }) }), _jsx("td", { style: { padding: '4px 8px', color: '#475569' }, children: m.inputs.map((p) => p.name).join(', ') || '—' }), _jsx("td", { style: { padding: '4px 8px', color: '#475569' }, children: m.outputs.map((p) => p.name).join(', ') || '—' }), _jsx("td", { style: { padding: '4px 8px', textAlign: 'right' }, children: _jsx("button", { onClick: () => removeModule(m.id), style: { fontSize: 11 }, children: "\u00D7" }) })] }, m.id))) })] })] }));
}
