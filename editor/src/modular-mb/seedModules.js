// Voorbeeld-modules — handmatig gemodelleerd op basis van foto's van de
// eigenlijke modules. Geen logo's: alleen tekstlabels (copyright-veilig).
// Coördinaten in millimeter, top-left = (0,0).
//
// 6 modules:
//   1. Hexinverter Mutant Snare        12 HP  PCB-zwart + oranje accenten
//   2. Mutable Instruments Elements    34 HP  mi-cream, kleurcode wit/roze/cyaan
//   3. Mutable Instruments Shelves+Exp 16 HP  EQ-filter incl. expander-jacks
//   4. Analogue Systems RS-110 MkII    10 HP  aluminium multimode-filter
//   5. Erica Synths Fusion VCO         22 HP  PCB-zwart met 2 buizen
//   6. Malekko Richter Oscillator II    8 HP  aluminium dual-VCO
//
// Aanroep via "✨ Voorbeelden" in de project-balk.
import { MM_PER_HP, PANEL_HEIGHT_MM, } from './types';
import { uid } from './store';
// ── helpers ────────────────────────────────────────────────────────────
const W = (hp) => hp * MM_PER_HP;
function knob(id, label, x, y, opts = {}) {
    return {
        control: {
            kind: 'knob', id, label,
            min: opts.min ?? 0, max: opts.max ?? 10, defaultValue: opts.def ?? 5,
            size: (opts.size ?? 'medium'),
            color: opts.color, style: opts.style ?? 'generic',
            unit: opts.unit,
        },
        placement: { x, y },
    };
}
function inPort(id, name, signal, x, y) {
    return { port: { id, name, signalType: signal, direction: 'in' }, placement: { x, y, labelPos: 'below' } };
}
function outPort(id, name, signal, x, y) {
    return { port: { id, name, signalType: signal, direction: 'out' }, placement: { x, y, labelPos: 'below' } };
}
function toggle(id, label, x, y, def = false) {
    return { control: { kind: 'toggle', id, label, defaultValue: def }, placement: { x, y } };
}
function sw(id, label, x, y, positions, defaultIndex = 0) {
    return { control: { kind: 'switch', id, label, positions, defaultIndex }, placement: { x, y } };
}
function button(id, label, x, y) {
    return { control: { kind: 'button', id, label, momentary: true }, placement: { x, y } };
}
function assemble(spec) {
    const controls = spec.items.filter((s) => 'control' in s).map((s) => s.control);
    const ports = spec.items.filter((s) => 'port' in s).map((s) => s.port);
    const controlPlacements = {};
    const portPlacements = {};
    for (const s of spec.items) {
        if ('control' in s)
            controlPlacements[s.control.id] = s.placement;
        if ('port' in s)
            portPlacements[s.port.id] = s.placement;
    }
    const type = {
        id: spec.typeId,
        categoryId: spec.categoryId,
        variant: spec.variant,
        ports, controls,
        notes: spec.notes,
    };
    const module = {
        id: uid('mod'),
        typeId: spec.typeId,
        internal: false,
        name: `${spec.brand} ${spec.model}`,
        brand: spec.brand,
        modelNumber: spec.model,
        visual: {
            hpWidth: spec.hp,
            heightMm: PANEL_HEIGHT_MM,
            texture: spec.texture,
            baseColor: spec.baseColor,
            texts: spec.texts,
            decorations: spec.decorations,
            controlPlacements,
            portPlacements,
        },
    };
    return { type, module };
}
// ───────────────────────────────────────────────────────────────────────
// 1. Hexinverter Mutant Snare — 12 HP, PCB-zwart, oranje accenten
// ───────────────────────────────────────────────────────────────────────
function mutantSnare() {
    const w = W(12);
    const cx = w / 2;
    return assemble({
        typeId: 'tp_mutant_snare',
        categoryId: 'drum',
        variant: 'Analog snare-drum voice',
        brand: 'Hexinverter',
        model: 'Mutant Snare',
        hp: 12,
        texture: 'pcb-black',
        baseColor: '#0a0a0a',
        texts: [
            { x: cx, y: 6, text: 'Mutant Snare', fontSize: 3.2, color: '#e5e7eb', align: 'middle' },
            // rij 1
            { x: w * 0.18, y: 32, text: 'SHELL TONE', fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
            { x: cx, y: 32, text: 'DRIVE', fontSize: 1.8, color: '#fff7ed', align: 'middle' },
            { x: w * 0.82, y: 32, text: 'SHELL PITCH', fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
            // rij 2
            { x: w * 0.18, y: 58, text: 'DECAY', fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
            { x: cx, y: 58, text: 'MIX', fontSize: 1.8, color: '#fff7ed', align: 'middle' },
            { x: w * 0.82, y: 58, text: 'CUTOFF', fontSize: 1.8, color: '#e5e7eb', align: 'middle' },
            // rij 3 (cv attenuators + snappy)
            { x: w * 0.18, y: 78, text: 'CV', fontSize: 1.6, color: '#fb923c', align: 'middle' },
            { x: cx, y: 78, text: 'SNAPPY', fontSize: 1.6, color: '#fb923c', align: 'middle' },
            { x: w * 0.82, y: 78, text: 'CV', fontSize: 1.6, color: '#fb923c', align: 'middle' },
            // mode + res
            { x: w * 0.30, y: 92, text: 'MODE', fontSize: 1.6, color: '#fb923c', align: 'middle' },
            { x: w * 0.70, y: 92, text: 'RES', fontSize: 1.6, color: '#e5e7eb', align: 'middle' },
            // jacks
            { x: w * 0.18, y: 112, text: 'TRIG', fontSize: 1.6, color: '#94a3b8', align: 'middle' },
            { x: w * 0.38, y: 112, text: 'ACC', fontSize: 1.6, color: '#94a3b8', align: 'middle' },
            { x: w * 0.62, y: 112, text: 'EXT IN', fontSize: 1.6, color: '#94a3b8', align: 'middle' },
            { x: w * 0.82, y: 112, text: 'OUT', fontSize: 1.6, color: '#fff7ed', align: 'middle' },
            { x: cx, y: 124, text: 'HEXINVERTER', fontSize: 1.8, color: '#94a3b8', align: 'middle' },
        ],
        decorations: [
            // oranje vlek achter Drive en Mix
            { kind: 'rect', x: cx - 6, y: 13, w: 12, h: 50, color: '#ea580c' },
            // dunne lijn onder controls
            { kind: 'rect', x: 3, y: 100, w: w - 6, h: 0.4, color: '#475569' },
        ],
        items: [
            knob('shell_tone', 'Shell Tone', w * 0.18, 22, { size: 'medium' }),
            knob('drive', 'Drive', cx, 22, { size: 'large', color: '#0a0a0a' }),
            knob('shell_pitch', 'Shell Pitch', w * 0.82, 22, { size: 'medium' }),
            knob('decay', 'Decay', w * 0.18, 48, { size: 'medium' }),
            knob('mix', 'Mix', cx, 48, { size: 'large', color: '#0a0a0a' }),
            knob('cutoff', 'Cutoff', w * 0.82, 48, { size: 'medium' }),
            knob('cv1_atten', 'CV Atten', w * 0.18, 72, { size: 'small' }),
            knob('snappy', 'Snappy', cx, 72, { size: 'small' }),
            knob('cv2_atten', 'CV Atten', w * 0.82, 72, { size: 'small' }),
            sw('mode', 'Mode', w * 0.30, 88, ['HP', 'BP'], 0),
            knob('res', 'Resonance', w * 0.70, 88, { size: 'small' }),
            inPort('trig', 'Trig', 'trigger', w * 0.18, 106),
            inPort('accent', 'Accent', 'cv', w * 0.38, 106),
            inPort('ext_in', 'Ext In', 'audio', w * 0.62, 106),
            outPort('out', 'Out', 'audio', w * 0.82, 106),
        ],
        notes: 'Analoge snare-drum-voice met aparte shell- en snappy-secties + EXT-in voor 808/909-cymbal-truc.',
    });
}
// ───────────────────────────────────────────────────────────────────────
// 2. Mutable Instruments Elements — 34 HP
// ───────────────────────────────────────────────────────────────────────
function elements() {
    const w = W(34);
    // 8 kolommen voor de top-rij van kleine knoppen; expliciet getypeerd.
    // [0]=jack-kolom links, [1..6]=knoppen, [7]=aux-out rechts.
    const cols = [w * 0.06, w * 0.18, w * 0.30, w * 0.42, w * 0.55, w * 0.67, w * 0.82, w * 0.94];
    const topY = 22;
    const bigY = 50;
    const lowKnobY = 78;
    const attenY = 92;
    const jackY = 108;
    return assemble({
        typeId: 'tp_mi_elements',
        categoryId: 'vco',
        variant: 'Modal synthesis voice',
        brand: 'Mutable Instruments',
        model: 'Elements',
        hp: 34,
        texture: 'mi-cream',
        baseColor: '#efe8d2',
        texts: [
            { x: w * 0.10, y: 6, text: 'Elements', fontSize: 3, color: '#1f2937' },
            { x: w * 0.95, y: 6, text: 'modal synthesizer', fontSize: 1.8, color: '#6b7280', align: 'end' },
            // top-rij labels
            { x: cols[0], y: topY + 8, text: 'CONTOUR', fontSize: 1.6, color: '#1f2937', align: 'middle' },
            { x: cols[1], y: topY + 8, text: 'BOW', fontSize: 1.6, color: '#1f2937', align: 'middle' },
            { x: cols[2], y: topY + 8, text: 'BLOW', fontSize: 1.6, color: '#e11d48', align: 'middle' },
            { x: cols[3], y: topY + 8, text: 'STRIKE', fontSize: 1.6, color: '#0891b2', align: 'middle' },
            { x: cols[4], y: topY + 8, text: 'COARSE', fontSize: 1.6, color: '#1f2937', align: 'middle' },
            { x: cols[5], y: topY + 8, text: 'FINE', fontSize: 1.6, color: '#1f2937', align: 'middle' },
            { x: cols[6], y: topY + 8, text: 'FM', fontSize: 1.6, color: '#1f2937', align: 'middle' },
            // big-knop labels
            { x: cols[2], y: bigY + 12, text: 'FLOW', fontSize: 1.8, color: '#e11d48', align: 'middle' },
            { x: cols[3], y: bigY + 12, text: 'MALLET', fontSize: 1.8, color: '#0891b2', align: 'middle' },
            { x: cols[5], y: bigY + 12, text: 'GEOMETRY', fontSize: 1.8, color: '#1f2937', align: 'middle' },
            { x: cols[6], y: bigY + 12, text: 'BRIGHT', fontSize: 1.8, color: '#1f2937', align: 'middle' },
            // low row
            { x: cols[1], y: lowKnobY + 8, text: 'TIMBRE', fontSize: 1.5, color: '#1f2937', align: 'middle' },
            { x: cols[2], y: lowKnobY + 8, text: 'TIMBRE', fontSize: 1.5, color: '#e11d48', align: 'middle' },
            { x: cols[3], y: lowKnobY + 8, text: 'TIMBRE', fontSize: 1.5, color: '#0891b2', align: 'middle' },
            { x: cols[4], y: lowKnobY + 8, text: 'DAMPING', fontSize: 1.5, color: '#1f2937', align: 'middle' },
            { x: cols[5], y: lowKnobY + 8, text: 'POSITION', fontSize: 1.5, color: '#1f2937', align: 'middle' },
            { x: cols[6], y: lowKnobY + 8, text: 'SPACE', fontSize: 1.5, color: '#1f2937', align: 'middle' },
            // bottom
            { x: cols[0], y: jackY - 12, text: 'V/OCT', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: cols[0] + 3, y: jackY - 2, text: 'GATE', fontSize: 1.3, color: '#1f2937', align: 'start' },
            { x: cols[0], y: jackY + 10, text: 'EXT IN', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: cols[0], y: jackY + 20, text: 'OUT L/R', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: w / 2, y: 125, text: 'MUTABLE INSTRUMENTS', fontSize: 1.8, color: '#1f2937', align: 'middle' },
        ],
        decorations: [
            // verticale scheidingslijn rond x=w*0.47 (kleine band)
            { kind: 'rect', x: w * 0.47, y: 14, w: 0.4, h: PANEL_HEIGHT_MM - 28, color: '#9ca3af' },
            // licht-grijs vlak voor de output-blokken linksonder
            { kind: 'rect', x: 2, y: jackY + 14, w: 12, h: 10, color: '#cbd5e1' },
        ],
        items: [
            // top-rij kleine knoppen
            knob('contour', 'Contour', cols[0], topY, { size: 'small', color: '#ffffff' }),
            knob('bow', 'Bow', cols[1], topY, { size: 'small', color: '#ffffff' }),
            knob('blow_amt', 'Blow Amt', cols[2], topY, { size: 'small', color: '#e11d48' }),
            knob('strike_amt', 'Strike Amt', cols[3], topY, { size: 'small', color: '#0891b2' }),
            knob('coarse', 'Coarse', cols[4], topY, { size: 'small', min: -36, max: 36, def: 0, unit: 'semi', color: '#ffffff' }),
            knob('fine', 'Fine', cols[5], topY, { size: 'small', min: -50, max: 50, def: 0, unit: 'ct', color: '#ffffff' }),
            knob('fm_amt', 'FM', cols[6], topY, { size: 'small', min: -1, max: 1, def: 0, color: '#ffffff' }),
            // play-button + big knops
            button('play', 'Play', cols[0], bigY),
            knob('flow', 'Flow', cols[2], bigY, { size: 'large', color: '#e11d48' }),
            knob('mallet', 'Mallet', cols[3], bigY, { size: 'large', color: '#0891b2' }),
            knob('geometry', 'Geometry', cols[5], bigY, { size: 'large', color: '#ffffff' }),
            knob('bright', 'Brightness', cols[6], bigY, { size: 'large', color: '#ffffff' }),
            // low knoppen
            knob('bow_tim', 'Bow Timbre', cols[1], lowKnobY, { size: 'small', color: '#ffffff' }),
            knob('blow_tim', 'Blow Timbre', cols[2], lowKnobY, { size: 'small', color: '#e11d48' }),
            knob('strike_tim', 'Strike Timbre', cols[3], lowKnobY, { size: 'small', color: '#0891b2' }),
            knob('damping', 'Damping', cols[4], lowKnobY, { size: 'small', color: '#ffffff' }),
            knob('position', 'Position', cols[5], lowKnobY, { size: 'small', color: '#ffffff' }),
            knob('space', 'Space', cols[6], lowKnobY, { size: 'small', color: '#ffffff' }),
            // attenuverters (heel klein)
            knob('a_bow', 'A Bow', cols[1], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
            knob('a_blow', 'A Blow', cols[2], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
            knob('a_strike', 'A Strike', cols[3], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
            knob('a_damp', 'A Damp', cols[4], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
            knob('a_pos', 'A Position', cols[5], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
            knob('a_space', 'A Space', cols[6], attenY, { size: 'small', min: -1, max: 1, def: 0, color: '#0a0a0a' }),
            // jacks linkerkolom
            inPort('vct', 'V/Oct', 'cv', cols[0] - 2, jackY - 8),
            inPort('fm_in', 'FM', 'cv', cols[0] + 4, jackY - 8),
            inPort('gate', 'Gate', 'gate', cols[0] - 2, jackY),
            inPort('strength', 'Strength', 'cv', cols[0] + 4, jackY),
            inPort('ext_pink', 'Ext Pink', 'audio', cols[0] - 2, jackY + 8),
            inPort('ext_cyan', 'Ext Cyan', 'audio', cols[0] + 4, jackY + 8),
            outPort('out_l', 'Out L', 'audio', cols[0] - 2, jackY + 18),
            outPort('out_r', 'Out R', 'audio', cols[0] + 4, jackY + 18),
            // CV-jacks onder de lage knoppen
            inPort('cv_bow', 'CV Bow', 'cv', cols[1], jackY + 8),
            inPort('cv_blow', 'CV Blow', 'cv', cols[2], jackY + 8),
            inPort('cv_strike', 'CV Strike', 'cv', cols[3], jackY + 8),
            inPort('cv_damp', 'CV Damp', 'cv', cols[4], jackY + 8),
            inPort('cv_pos', 'CV Position', 'cv', cols[5], jackY + 8),
            inPort('cv_space', 'CV Space', 'cv', cols[6], jackY + 8),
            outPort('aux', 'Aux', 'audio', cols[7], jackY + 8),
        ],
        notes: 'Modal-synthese stem (excitation: bow/blow/strike → resonator: modal/string/drum/non-linear string).',
    });
}
// ───────────────────────────────────────────────────────────────────────
// 3. MI Shelves + Expander (gecombineerd) — 16 HP
// ───────────────────────────────────────────────────────────────────────
function shelvesPlusExp() {
    const w = W(16);
    // 4 bands: low-shelf (LS, wit), lo-mid (LM, roze), hi-mid (HM, cyaan), hi-shelf (HS, wit)
    const bands = [
        { id: 'ls', label: 'LS', y: 20, col: '#ffffff' },
        { id: 'lm', label: 'LM', y: 44, col: '#e11d48' },
        { id: 'hm', label: 'HM', y: 68, col: '#0891b2' },
        { id: 'hs', label: 'HS', y: 92, col: '#ffffff' },
    ];
    const items = [];
    const texts = [
        { x: w / 2, y: 6, text: 'Shelves + Exp', fontSize: 2.6, color: '#1f2937', align: 'middle' },
        { x: w / 2, y: 125, text: 'MUTABLE INSTRUMENTS', fontSize: 1.6, color: '#1f2937', align: 'middle' },
    ];
    for (const b of bands) {
        // CV-jacks links
        items.push(inPort(`${b.id}_fcv`, `${b.label} F-CV`, 'cv', w * 0.10, b.y));
        items.push(inPort(`${b.id}_gcv`, `${b.label} G-CV`, 'cv', w * 0.22, b.y));
        // knoppen midden
        items.push(knob(`${b.id}_freq`, `${b.label} Freq`, w * 0.42, b.y, { size: 'medium', color: b.col, min: 20, max: 20000, def: 1000, unit: 'Hz' }));
        items.push(knob(`${b.id}_gain`, `${b.label} Gain`, w * 0.58, b.y, { size: 'medium', color: b.col, min: -15, max: 15, def: 0, unit: 'dB' }));
        // expander-uitgangen rechts (per-band)
        items.push(outPort(`${b.id}_out`, `${b.label} Out`, 'audio', w * 0.78, b.y));
        // labels
        texts.push({ x: w * 0.42, y: b.y + 9, text: `${b.label} FREQ`, fontSize: 1.4, color: b.col === '#ffffff' ? '#1f2937' : b.col, align: 'middle' });
        texts.push({ x: w * 0.58, y: b.y + 9, text: `${b.label} GAIN`, fontSize: 1.4, color: b.col === '#ffffff' ? '#1f2937' : b.col, align: 'middle' });
    }
    // Q-knoppen alleen voor de twee middenbanden (LM, HM)
    items.push(knob('lm_q', 'LM Q', w * 0.30, 44, { size: 'small', color: '#e11d48' }));
    items.push(knob('hm_q', 'HM Q', w * 0.30, 68, { size: 'small', color: '#0891b2' }));
    texts.push({ x: w * 0.30, y: 53, text: 'Q', fontSize: 1.4, color: '#e11d48', align: 'middle' });
    texts.push({ x: w * 0.30, y: 77, text: 'Q', fontSize: 1.4, color: '#0891b2', align: 'middle' });
    // hoofd-IN en hoofd-OUT (Shelves zelf)
    items.push(inPort('in', 'In', 'audio', w * 0.30, 114));
    items.push(outPort('out', 'Out', 'audio', w * 0.55, 114));
    items.push(outPort('exp_hp', 'Exp HP', 'audio', w * 0.72, 114));
    items.push(outPort('exp_bp', 'Exp BP', 'audio', w * 0.85, 114));
    texts.push({ x: w * 0.30, y: 122, text: 'IN', fontSize: 1.4, color: '#1f2937', align: 'middle' });
    texts.push({ x: w * 0.55, y: 122, text: 'OUT', fontSize: 1.4, color: '#1f2937', align: 'middle' });
    return assemble({
        typeId: 'tp_mi_shelves_exp',
        categoryId: 'vcf',
        variant: 'EQ-filter (Shelves) + per-band expander-outs',
        brand: 'Mutable Instruments',
        model: 'Shelves + Exp',
        hp: 16,
        texture: 'mi-cream',
        baseColor: '#efe8d2',
        texts,
        decorations: [
            { kind: 'rect', x: w * 0.07, y: 14, w: 0.4, h: 90, color: '#9ca3af' },
            { kind: 'rect', x: 3, y: 106, w: w - 6, h: 0.4, color: '#9ca3af' },
        ],
        items,
        notes: 'Vier-bands EQ-filter (low-shelf, lo-mid bell, hi-mid bell, hi-shelf). De expander voegt per-band uitgangen toe; standalone is de expander niet bruikbaar, dus hier samengevoegd tot één module.',
    });
}
// ───────────────────────────────────────────────────────────────────────
// 4. Analogue Systems RS-110 MkII — 10 HP, vertical jacks-knob-jacks
// ───────────────────────────────────────────────────────────────────────
function rs110() {
    const w = W(10);
    // 5 rijen, elke rij: jack-links (15%), knob-midden (50%), jack-rechts (85%)
    const rows = [
        { id: 'freq', label: 'Frequency', inId: 'vct', inLabel: '1V/Oct', inSig: 'cv', outId: 'notch', outLabel: 'Notch', color: '#3b82f6' },
        { id: 'depth', label: 'Depth', inId: 'fcv', inLabel: 'CV In', inSig: 'cv', outId: 'bp', outLabel: 'BP', color: '#0a0a0a' },
        { id: 'lvl1', label: 'Level 1', inId: 'in1', inLabel: 'In 1', inSig: 'audio', outId: 'lp', outLabel: 'LP', color: '#0a0a0a' },
        { id: 'lvl2', label: 'Level 2', inId: 'in2', inLabel: 'In 2', inSig: 'audio', outId: 'hp', outLabel: 'HP', color: '#0a0a0a' },
        { id: 'res', label: 'Resonance', inId: 'rin', inLabel: 'Res In', inSig: 'audio', outId: 'rout', outLabel: 'Res Out', color: '#facc15' },
    ];
    const items = [];
    const texts = [
        { x: w / 2, y: 6, text: 'MULTIMODE FILTER', fontSize: 2, color: '#1f2937', align: 'middle' },
        { x: w / 2, y: 11, text: 'RS-110', fontSize: 1.5, color: '#1f2937', align: 'middle' },
        { x: w / 2, y: 125, text: 'AS', fontSize: 1.6, color: '#1f2937', align: 'middle' },
    ];
    rows.forEach((r, i) => {
        const y = 24 + i * 20;
        items.push(inPort(r.inId, r.inLabel, r.inSig, w * 0.15, y));
        items.push(knob(r.id, r.label, w * 0.50, y, { size: 'medium', color: r.color, min: r.id === 'freq' ? 20 : 0, max: r.id === 'freq' ? 20000 : 10, def: r.id === 'freq' ? 1000 : 5 }));
        items.push(outPort(r.outId, r.outLabel, 'audio', w * 0.85, y));
        texts.push({ x: w * 0.15, y: y + 9, text: r.inLabel, fontSize: 1.4, color: '#1f2937', align: 'middle' });
        texts.push({ x: w * 0.50, y: y + 9, text: r.label, fontSize: 1.4, color: '#1f2937', align: 'middle' });
        texts.push({ x: w * 0.85, y: y + 9, text: r.outLabel, fontSize: 1.4, color: '#1f2937', align: 'middle' });
    });
    return assemble({
        typeId: 'tp_as_rs110',
        categoryId: 'vcf',
        variant: 'Multimode VCF (4-pole, simult. LP/BP/HP/Notch)',
        brand: 'Analogue Systems',
        model: 'RS-110 MkII',
        hp: 10,
        texture: 'aluminum',
        baseColor: '#dcd9cc',
        texts,
        decorations: [],
        items,
        notes: 'Multimode-filter met 4 gelijktijdige uitgangen (LP/BP/HP/Notch) + aparte resonance-in/out voor patching.',
    });
}
// ───────────────────────────────────────────────────────────────────────
// 5. Erica Synths Fusion VCO — 22 HP, PCB-zwart + 2 buizen
// ───────────────────────────────────────────────────────────────────────
function fusionVco() {
    const w = W(22);
    const cx = w / 2;
    return assemble({
        typeId: 'tp_erica_fusion_vco',
        categoryId: 'vco',
        variant: 'Tube-hybrid VCO',
        brand: 'Erica Synths',
        model: 'Fusion VCO',
        hp: 22,
        texture: 'pcb-black',
        baseColor: '#0a0a0a',
        texts: [
            { x: cx, y: 6, text: 'FUSION VCO', fontSize: 2.8, color: '#f5f5f5', align: 'middle' },
            { x: cx, y: 33, text: 'FREQUENCY', fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
            { x: w * 0.30, y: 60, text: 'WAVESHAPE', fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
            { x: w * 0.70, y: 60, text: 'FM LEVEL', fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
            { x: cx, y: 84, text: 'DRY/WET', fontSize: 1.6, color: '#f5f5f5', align: 'middle' },
            // bottom knobs labels
            { x: w * 0.10, y: 100, text: 'SUBWAVE1', fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
            { x: w * 0.28, y: 100, text: 'SUB MIX', fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
            { x: w * 0.72, y: 100, text: 'COLOUR', fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
            { x: w * 0.90, y: 100, text: 'SUBWAVE2', fontSize: 1.4, color: '#f5f5f5', align: 'middle' },
            // jacks labels
            { x: w * 0.06, y: 122, text: 'AUDIO', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
            { x: w * 0.20, y: 122, text: 'SUB CV', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
            { x: w * 0.34, y: 122, text: '1V/OCT', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
            { x: w * 0.48, y: 122, text: 'FM IN', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
            { x: w * 0.62, y: 122, text: 'WAVE CV', fontSize: 1.2, color: '#94a3b8', align: 'middle' },
            { x: w * 0.78, y: 122, text: 'VCO OUT', fontSize: 1.2, color: '#fde047', align: 'middle' },
            { x: w * 0.92, y: 122, text: 'MIX OUT', fontSize: 1.2, color: '#fde047', align: 'middle' },
            { x: cx, y: 128, text: 'erica fusion', fontSize: 1.4, color: '#94a3b8', align: 'middle' },
        ],
        decorations: [
            // twee buizen flankeren de frequency-knob
            { kind: 'tubeSlot', x: 5, y: 14, w: 18, h: 38, color: '#fb7185' },
            { kind: 'tubeSlot', x: w - 23, y: 14, w: 18, h: 38, color: '#fb7185' },
        ],
        items: [
            // toggle voor wave selectie (links boven van frequency)
            sw('wave_sel', 'Wave', w * 0.40, 18, ['Saw', 'Tri', 'Sin'], 1),
            // grote frequency
            knob('frequency', 'Frequency', cx, 22, { size: 'large', min: 20, max: 20000, def: 220, unit: 'Hz' }),
            knob('waveshape', 'Waveshape', w * 0.30, 50, { size: 'medium' }),
            knob('fm_level', 'FM Level', w * 0.70, 50, { size: 'medium' }),
            knob('dry_wet', 'Dry/Wet', cx, 74, { size: 'medium', def: 5 }),
            knob('subwave1', 'Subwave 1', w * 0.10, 94, { size: 'medium' }),
            knob('sub_mix', 'Sub Mix', w * 0.28, 94, { size: 'medium' }),
            knob('colour', 'Colour', w * 0.72, 94, { size: 'medium' }),
            knob('subwave2', 'Subwave 2', w * 0.90, 94, { size: 'medium' }),
            inPort('audio_in', 'Audio In', 'audio', w * 0.06, 115),
            inPort('sub_cv', 'Sub CV', 'cv', w * 0.20, 115),
            inPort('vct', 'V/Oct', 'cv', w * 0.34, 115),
            inPort('fm_in', 'FM In', 'cv', w * 0.48, 115),
            inPort('wave_cv', 'Wave CV', 'cv', w * 0.62, 115),
            outPort('vco_out', 'VCO Out', 'audio', w * 0.78, 115),
            outPort('mix_out', 'Mix Out', 'audio', w * 0.92, 115),
        ],
        notes: 'Hybride buis-VCO; twee NOS-buizen voor de saturatie-/colour-trap.',
    });
}
// ───────────────────────────────────────────────────────────────────────
// 6. Malekko Richter Oscillator II — 8 HP, aluminium
// ───────────────────────────────────────────────────────────────────────
function richterOsc2() {
    const w = W(14);
    const cx = w / 2;
    return assemble({
        typeId: 'tp_richter_osc2',
        categoryId: 'vco',
        variant: 'Analog VCO with phase-mod + sub waves',
        brand: 'Malekko',
        model: 'Richter Oscillator II',
        hp: 14,
        texture: 'aluminum',
        baseColor: '#d5d4cc',
        texts: [
            { x: cx, y: 5, text: 'RICHTER', fontSize: 2.4, color: '#1f2937', align: 'middle' },
            { x: cx, y: 10, text: 'OSCILLATOR II', fontSize: 3.2, color: '#1f2937', align: 'middle' },
            { x: cx, y: 38, text: 'FINE', fontSize: 1.6, color: '#1f2937', align: 'middle' },
            { x: w * 0.18, y: 47, text: 'EXT ↑', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: w * 0.82, y: 47, text: 'EXT ↑', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: w * 0.20, y: 70, text: 'EXP', fontSize: 1.4, color: '#1f2937', align: 'middle' },
            { x: cx, y: 62, text: 'LFO', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: w * 0.80, y: 70, text: 'PHASE MOD', fontSize: 1.3, color: '#1f2937', align: 'middle' },
            { x: w * 0.18, y: 92, text: '1V/OCT', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.50, y: 92, text: 'COARSE', fontSize: 1.4, color: '#1f2937', align: 'middle' },
            { x: w * 0.82, y: 92, text: 'PHASE', fontSize: 1.4, color: '#1f2937', align: 'middle' },
            // outputs row 1
            { x: w * 0.18, y: 110, text: 'TRI 2', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.40, y: 110, text: 'SQR 2', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.62, y: 110, text: 'SAW 2', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            // outputs row 2
            { x: w * 0.10, y: 122, text: 'TRI 1', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.28, y: 122, text: 'SQR 1', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.46, y: 122, text: 'SAW 1', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.66, y: 122, text: 'SINE', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: w * 0.86, y: 122, text: 'SYNC', fontSize: 1.2, color: '#1f2937', align: 'middle' },
            { x: cx, y: 128, text: 'MALEKKO', fontSize: 1.4, color: '#1f2937', align: 'middle' },
        ],
        items: [
            knob('fine', 'Fine', cx, 26, { size: 'large', min: -50, max: 50, def: 0, unit: 'ct', color: '#0a0a0a' }),
            inPort('ext_l', 'Ext L', 'cv', w * 0.18, 42),
            inPort('ext_r', 'Ext R', 'cv', w * 0.82, 42),
            knob('exp', 'Exp', w * 0.20, 62, { size: 'medium', color: '#0a0a0a' }),
            button('lfo', 'LFO', cx, 58),
            knob('phase_mod', 'Phase Mod', w * 0.80, 62, { size: 'medium', color: '#0a0a0a' }),
            inPort('vct', '1V/Oct', 'cv', w * 0.18, 84),
            knob('coarse', 'Coarse', w * 0.50, 84, { size: 'medium', min: -36, max: 36, def: 0, unit: 'semi', color: '#0a0a0a' }),
            knob('phase', 'Phase', w * 0.82, 84, { size: 'medium', color: '#0a0a0a' }),
            outPort('tri2', 'Tri 2', 'audio', w * 0.18, 104),
            outPort('sqr2', 'Sqr 2', 'audio', w * 0.40, 104),
            outPort('saw2', 'Saw 2', 'audio', w * 0.62, 104),
            outPort('tri1', 'Tri 1', 'audio', w * 0.10, 116),
            outPort('sqr1', 'Sqr 1', 'audio', w * 0.28, 116),
            outPort('saw1', 'Saw 1', 'audio', w * 0.46, 116),
            outPort('sine', 'Sine', 'audio', w * 0.66, 116),
            outPort('sync', 'Sync', 'gate', w * 0.86, 116),
        ],
        notes: 'Analoge VCO met phase-modulation; aparte 2nd-octave en 1st-octave golfvorm-uitgangen. 14 HP aluminium-front.',
    });
}
// ── public entry ───────────────────────────────────────────────────────
export function seedExampleModules(project) {
    const all = [mutantSnare(), elements(), shelvesPlusExp(), rs110(), fusionVco(), richterOsc2()];
    const newTypes = all.map((x) => x.type);
    const newModules = all.map((x) => x.module);
    const rackId = project.activeRackId ?? project.racks[0]?.id;
    const racks = project.racks.map((r) => {
        if (r.id !== rackId)
            return r;
        const occupancy = Array(r.rows).fill(0).map((_, row) => {
            const used = r.slots.filter((s) => s.row === row);
            return used.reduce((mx, s) => {
                const mod = project.modules.find((m) => m.id === s.moduleId);
                const hp = mod?.visual.hpWidth ?? 0;
                return Math.max(mx, s.hpOffset + hp);
            }, 0);
        });
        const newSlots = [];
        for (const m of newModules) {
            let placed = false;
            for (let row = 0; row < r.rows && !placed; row++) {
                const occ = occupancy[row] ?? 0;
                if (occ + m.visual.hpWidth <= r.hpPerRow) {
                    newSlots.push({ id: uid('slot'), moduleId: m.id, row, hpOffset: occ });
                    occupancy[row] = occ + m.visual.hpWidth;
                    placed = true;
                }
            }
        }
        return { ...r, slots: [...r.slots, ...newSlots] };
    });
    return {
        ...project,
        moduleTypes: [...project.moduleTypes, ...newTypes],
        modules: [...project.modules, ...newModules],
        racks,
    };
}
