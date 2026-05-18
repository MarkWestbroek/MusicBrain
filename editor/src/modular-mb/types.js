// ─────────────────────────────────────────────────────────────────────────
// Modular Music Brain (MMB) — data model v0.1
//
// Scope of v0.1:
//   • Modules with typed input/output ports (CV, gate, audio, MIDI)
//   • Patches = named sets of connections + module-parameter values
//   • Envelopes (AHDSR only for v0.1; shape is a discriminated union so
//     multiphase/sampled/drawn/hwEmulation can be added later without
//     breaking existing patch JSON)
//   • LFOs (basic waveforms for v0.1; same extensibility pattern)
//
// JSON format rules:
//   • Every persisted shape carries `kind` so the union can be widened.
//   • Times are in milliseconds, frequencies in Hz, voltages in V (CV).
//   • CV ranges are stored explicitly per port; do not assume ±5 V or 0–10 V.
// ─────────────────────────────────────────────────────────────────────────
/** Visual conventions for cables / handles. Kept here next to the type so
 *  Patcher graph view and Matrix view stay in sync. Colours are
 *  intentionally distinct enough to read from a distance. */
export const SIGNAL_COLOUR = {
    cv: '#2563eb', // blue   — continuous voltage
    gate: '#16a34a', // green  — sustained on/off
    trigger: '#eab308', // yellow — momentary pulse
    audio: '#ea580c', // orange — audio-rate signal
    midi: '#9333ea', // purple — MIDI message stream
};
export const SIGNAL_LABEL = {
    cv: 'CV', gate: 'Gate', trigger: 'Trig', audio: 'Audio', midi: 'MIDI',
};
/** Which signal types may legally connect from src → dst. A gate output
 *  can drive a CV input (binary 0/+V). A trigger can stand in for a gate.
 *  Audio and MIDI are strict. */
export const SIGNAL_COMPATIBILITY = {
    cv: ['cv'],
    gate: ['gate', 'cv'],
    trigger: ['trigger', 'gate'],
    audio: ['audio'],
    midi: ['midi'],
};
export function canConnect(src, dst) {
    return SIGNAL_COMPATIBILITY[src].includes(dst);
}
export function emptyModularProject() {
    return {
        version: 1,
        name: 'ModularMB',
        modules: [],
        categories: [
            { id: 'vco', label: 'VCO', kind: 'vco',
                defaultCvRange: { min: -5, max: 5, bipolar: true } },
            { id: 'vcf', label: 'VCF', kind: 'vcf',
                defaultCvRange: { min: -5, max: 5, bipolar: true } },
            { id: 'vca', label: 'VCA', kind: 'vca',
                defaultCvRange: { min: 0, max: 10, bipolar: false } },
            { id: 'mixer', label: 'Mixer', kind: 'mixer' },
            { id: 'breakout', label: 'Breakout', kind: 'breakout' },
            { id: 'envelope', label: 'Envelope', kind: 'envelope',
                defaultCvRange: { min: 0, max: 10, bipolar: false } },
            { id: 'lfo', label: 'LFO', kind: 'lfo',
                defaultCvRange: { min: -5, max: 5, bipolar: true } },
        ],
        patches: [],
    };
}
