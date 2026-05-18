import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Simulation tab — placeholder for v0.1.
// In v0.2 this will hook into the same scope-bridge that the Poly-synth
// scope already uses, but plotting a selected port / envelope / LFO from
// the active patch instead of a fixed firmware trace.
export function SimulationPanel() {
    return (_jsxs("div", { style: { color: '#6b7280', fontSize: 13 }, children: [_jsx("p", { style: { marginTop: 0 }, children: "Simulatie komt in v0.2. Het idee: kies een poort of envelope/LFO uit de actieve patch en plot het signaal in een scope-view, identiek aan de Poly-synth (scope) tab." }), _jsxs("ul", { children: [_jsx("li", { children: "Envelope-preview (offline rendering van AHDSR/multiphase)" }), _jsx("li", { children: "LFO-preview (\u00E9\u00E9n cyclus uitgetekend)" }), _jsxs("li", { children: ["Live trace via ", _jsx("code", { children: "scope-bridge" }), " als de brain draait"] })] })] }));
}
