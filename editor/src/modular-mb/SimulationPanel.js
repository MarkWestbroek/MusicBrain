import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Simulation tab — speelt de actieve patch via een minimale Tone.js-engine.
//
// Drie MIDI-bronnen zijn beschikbaar (on-screen toetsenbord, test-sequence,
// echte Web MIDI). De engine bouwt een MVP-voice (VCO → VCF → VCA met
// AHDSR-envelope) op basis van de modules+controls in de patch. Latere
// iteraties kunnen `patch.connections` echt volgen en meerdere stemmen
// ondersteunen — zie roadmap in Requirements.md §v0.3-simulatie.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useModularProject } from './store';
import { AudioEngine } from './sim/AudioEngine';
import { ScreenKeyboardSource, TestSequenceSource, WebMidiSource, } from './sim/MidiSource';
export function SimulationPanel() {
    const project = useModularProject();
    const patch = project.patches.find((p) => p.id === project.activePatchId)
        ?? project.patches[0];
    const engineRef = useRef(null);
    if (engineRef.current === null)
        engineRef.current = new AudioEngine();
    const engine = engineRef.current;
    const sources = useMemo(() => ({
        screen: new ScreenKeyboardSource(),
        sequence: new TestSequenceSource(),
        webmidi: new WebMidiSource(),
    }), []);
    const [sourceId, setSourceId] = useState('screen');
    const source = sources[sourceId];
    const [status, setStatus] = useState({ running: false, voiceFreqHz: 0, level: 0 });
    const [masterVol, setMasterVol] = useState(0.7);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!patch)
            return;
        engine.build(project, patch);
        engine.setMasterVolume(masterVol);
    }, [engine, project, patch, masterVol]);
    useEffect(() => {
        const unsub = source.subscribe((e) => {
            if (e.kind === 'noteOn')
                engine.noteOn(e.note, e.velocity);
            if (e.kind === 'noteOff')
                engine.noteOff(e.note);
        });
        return () => { unsub(); };
    }, [engine, source]);
    useEffect(() => engine.subscribe(setStatus), [engine]);
    useEffect(() => () => {
        Object.values(sources).forEach((s) => s.stop());
        engine.dispose();
    }, [engine, sources]);
    async function startAll() {
        try {
            setError(null);
            await engine.start();
            await source.start();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }
    function stopAll() {
        source.stop();
        engine.stop();
    }
    function switchSource(next) {
        source.stop();
        setSourceId(next);
    }
    if (!patch) {
        return (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "Selecteer eerst een patch in de Patches-tab." }));
    }
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("fieldset", { style: fs, children: [_jsx("legend", { style: lg, children: "Patch & Engine" }), _jsxs("div", { style: row, children: [_jsxs("span", { children: [_jsx("strong", { children: "Patch:" }), " ", patch.name] }), _jsxs("span", { style: { color: '#475569' }, children: ["voice = VCO \u2192 VCF \u2192 VCA \u00B7 ", status.voiceFreqHz > 0
                                        ? `${status.voiceFreqHz.toFixed(1)} Hz`
                                        : '— (geen noot)'] }), _jsx("span", { style: { marginLeft: 'auto', display: 'inline-flex', gap: 6 }, children: !status.running
                                    ? _jsx("button", { onClick: startAll, className: "primary", children: "\u25B6 Start" })
                                    : _jsx("button", { onClick: stopAll, children: "\u25A0 Stop" }) })] }), _jsxs("div", { style: row, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Master volume:", _jsx("input", { type: "range", min: 0, max: 1, step: 0.01, value: masterVol, onChange: (e) => {
                                            const v = Number(e.target.value);
                                            setMasterVol(v);
                                            engine.setMasterVolume(v);
                                        }, style: { width: 160, marginLeft: 8, verticalAlign: 'middle' } }), _jsxs("span", { style: { marginLeft: 6, color: '#475569' }, children: [Math.round(masterVol * 100), "%"] })] }), _jsx(LevelMeter, { level: status.level })] }), error && (_jsxs("p", { style: { color: '#b91c1c', fontSize: 12, margin: '6px 0 0' }, children: ["\u26A0 ", error] }))] }), _jsxs("fieldset", { style: fs, children: [_jsx("legend", { style: lg, children: "MIDI-bron" }), _jsx("div", { style: row, children: ['screen', 'sequence', 'webmidi'].map((id) => (_jsxs("label", { style: { fontSize: 12 }, children: [_jsx("input", { type: "radio", name: "midisrc", checked: sourceId === id, onChange: () => switchSource(id) }), ' ', sources[id].label, id === 'webmidi' && !WebMidiSource.isSupported()
                                    ? _jsx("span", { style: { color: '#b91c1c' }, children: " (niet ondersteund)" })
                                    : null] }, id))) }), _jsx(SourceControls, { source: source, sourceId: sourceId })] }), _jsx(ModuleMatchSummary, { project: project, patch: patch })] }));
}
function SourceControls({ source, sourceId }) {
    if (sourceId === 'screen')
        return _jsx(ScreenKeyboardUi, { source: source });
    if (sourceId === 'sequence')
        return _jsx(SequenceUi, { source: source });
    return _jsx(WebMidiUi, { source: source });
}
function ScreenKeyboardUi({ source }) {
    const [octave, setOctave] = useState(source.getOctave());
    function shift(d) {
        source.setOctave(octave + d);
        setOctave(source.getOctave());
    }
    const startNote = (octave + 1) * 12;
    const keys = [];
    for (let i = 0; i < 24; i++) {
        const midi = startNote + i;
        const note = midi % 12;
        const black = [1, 3, 6, 8, 10].includes(note);
        const labels = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];
        keys.push({ midi, black, label: labels[note] ?? '' });
    }
    const wKeys = keys.filter((k) => !k.black);
    const W = 22, H = 90;
    function press(midi, e) {
        e.target.setPointerCapture(e.pointerId);
        source.pressNote(midi);
    }
    const release = (midi) => source.releaseNote(midi);
    return (_jsxs("div", { style: { marginTop: 6 }, children: [_jsxs("div", { style: row, children: [_jsx("button", { onClick: () => shift(-1), style: btn, children: "\u2212 octaaf" }), _jsxs("span", { style: { fontSize: 12 }, children: ["octaaf ", octave, " (toetsen Z/X)"] }), _jsx("button", { onClick: () => shift(1), style: btn, children: "+ octaaf" }), _jsx("span", { style: { fontSize: 11, color: '#6b7280', marginLeft: 'auto' }, children: "Computertoetsen: A S D F G H J K (witte), W E T Y U (zwarte)" })] }), _jsxs("svg", { width: wKeys.length * W, height: H, style: { display: 'block', marginTop: 8, userSelect: 'none' }, children: [wKeys.map((k, i) => (_jsxs("g", { children: [_jsx("rect", { x: i * W, y: 0, width: W - 1, height: H, fill: "#fafafa", stroke: "#1f2937", onPointerDown: (e) => press(k.midi, e), onPointerUp: () => release(k.midi), onPointerCancel: () => release(k.midi), onPointerLeave: (e) => { if (e.buttons)
                                    release(k.midi); }, style: { cursor: 'pointer' } }), _jsxs("text", { x: i * W + (W - 1) / 2, y: H - 6, fontSize: 9, textAnchor: "middle", fill: "#475569", pointerEvents: "none", children: [k.label, k.label === 'C' ? Math.floor(k.midi / 12) - 1 : ''] })] }, k.midi))), keys.filter((k) => k.black).map((k) => {
                        const whiteIdx = wKeys.findIndex((w) => w.midi === k.midi - 1);
                        const cx = (whiteIdx + 1) * W - (W * 0.35);
                        return (_jsx("rect", { x: cx, y: 0, width: W * 0.7, height: H * 0.6, fill: "#1f2937", stroke: "#000", onPointerDown: (e) => press(k.midi, e), onPointerUp: () => release(k.midi), onPointerCancel: () => release(k.midi), onPointerLeave: (e) => { if (e.buttons)
                                release(k.midi); }, style: { cursor: 'pointer' } }, k.midi));
                    })] })] }));
}
function SequenceUi({ source }) {
    const [bpm, setBpm] = useState(source.getBpm());
    return (_jsxs("div", { style: row, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Tempo:", _jsx("input", { type: "number", min: 30, max: 300, value: bpm, onChange: (e) => {
                            const v = Math.max(30, Math.min(300, Number(e.target.value) || 120));
                            setBpm(v);
                            source.setBpm(v);
                        }, style: { width: 60, marginLeft: 6 } }), _jsx("span", { style: { marginLeft: 4 }, children: "BPM" })] }), _jsx("span", { style: { fontSize: 11, color: '#6b7280' }, children: "Speelt een C\u2013E\u2013G\u2013C\u2013G\u2013E lus zodra je op Start klikt." })] }));
}
function WebMidiUi({ source }) {
    const [, force] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => force((n) => n + 1), 1000);
        return () => window.clearInterval(id);
    }, []);
    if (!WebMidiSource.isSupported()) {
        return (_jsxs("p", { style: { fontSize: 12, color: '#b91c1c', margin: 0 }, children: ["Web MIDI is niet beschikbaar in deze browser. Gebruik Chrome/Edge, recente Firefox of Safari 18+. Op Firefox kan het achter", _jsx("code", { children: " dom.webmidi.enabled " }), " verborgen zitten."] }));
    }
    return (_jsxs("p", { style: { fontSize: 12, margin: 0, color: '#475569' }, children: ["Verbonden apparaten: ", _jsx("strong", { children: source.describe?.() ?? '—' }), ' ', "\u2014 klik op ", _jsx("em", { children: "Start" }), " hierboven om toestemming te vragen en het eerste device te koppelen."] }));
}
function LevelMeter({ level }) {
    return (_jsx("div", { style: { flex: 1, height: 12, marginLeft: 12,
            background: '#0f172a', borderRadius: 3, overflow: 'hidden',
            border: '1px solid #1e293b' }, children: _jsx("div", { style: {
                height: '100%',
                width: `${Math.round(level * 100)}%`,
                background: level > 0.95 ? '#dc2626' : 'linear-gradient(90deg,#10b981,#fbbf24,#dc2626)',
                transition: 'width 60ms linear',
            } }) }));
}
function ModuleMatchSummary({ project, patch }) {
    const racks = project.racks.filter((r) => patch.rackIds.includes(r.id));
    const counts = {};
    for (const r of racks)
        for (const slot of r.slots) {
            const m = project.modules.find((mm) => mm.id === slot.moduleId);
            if (!m)
                continue;
            const t = project.moduleTypes.find((tt) => tt.id === m.typeId);
            const c = project.categories.find((cc) => cc.id === t?.categoryId);
            const k = String(c?.kind ?? 'unknown');
            counts[k] = (counts[k] ?? 0) + 1;
        }
    return (_jsxs("fieldset", { style: fs, children: [_jsx("legend", { style: lg, children: "Engine-mapping" }), _jsxs("p", { style: { fontSize: 12, margin: '0 0 6px', color: '#475569' }, children: ["De MVP-engine pakt de eerste module per categorie. Latere iteraties volgen ", _jsx("code", { children: "patch.connections" }), " echt en bouwen een volledige signal-graph."] }), _jsx("table", { style: { fontSize: 12, borderCollapse: 'collapse' }, children: _jsx("tbody", { children: ['vco', 'vcf', 'vca', 'envelope', 'lfo'].map((k) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: '2px 12px 2px 0', color: '#374151' }, children: k.toUpperCase() }), _jsx("td", { style: { padding: '2px 0', color: counts[k] ? '#065f46' : '#9ca3af' }, children: counts[k]
                                    ? `${counts[k]} module${counts[k] > 1 ? 's' : ''} aanwezig`
                                    : 'niet gevonden — default-waarden' })] }, k))) }) })] }));
}
const fs = {
    border: '1px solid #cbd2d9', borderRadius: 6, padding: 10, background: '#ffffff',
};
const lg = {
    padding: '0 6px', fontSize: 12, color: '#374151',
};
const row = {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
};
const btn = { fontSize: 12 };
