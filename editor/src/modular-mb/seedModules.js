// Voorbeeld-modules — handmatig gemodelleerde panel-visuals naar het
// drie-laags v2-model. Geen logo's: alleen tekstlabels (copyright-veilig).
//
// Coördinaten zijn in millimeter, top-left = (0,0); breedte = hpWidth * MM_PER_HP.
// 6 modules zitten in deze seed:
//   1. Hexinverter Mutant Snare        12 HP   PCB-zwart
//   2. Mutable Instruments Elements    34 HP   mi-cream (3 kleurrijen)
//   3. Mutable Instruments Shelves Exp  4 HP   mi-cream (6 jacks)
//   4. AS RS-110 MkII                  10 HP   aluminium
//   5. Erica Synths Fusion VCO         22 HP   PCB-zwart + tube-slot
//   6. Richter Oscillator II           14 HP   PCB-zwart   (best-guess layout
//                                              — interpretatieve seed)
//
// Aanroepen via "Voorbeelden laden" in de project-balk. Voegt types +
// modules toe en plaatst ze in het actieve rack.
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
// ── 1. Hexinverter Mutant Snare ────────────────────────────────────────
function mutantSnare() {
    const w = W(12);
    return assemble({
        typeId: 'tp_mutant_snare',
        categoryId: 'mixer', // percussie-bron → geen eigen cat; mixer komt nog 't dichtst
        variant: 'Snare drum',
        brand: 'Hexinverter',
        model: 'Mutant Snare',
        hp: 12,
        texture: 'pcb-black',
        texts: [
            { x: w / 2, y: 6, text: 'MUTANT SNARE', fontSize: 3, color: '#e5e7eb', align: 'middle' },
            { x: 6, y: 18, text: 'TUNE', fontSize: 2.4, color: '#fb923c' },
            { x: w - 6, y: 18, text: 'SNAP', fontSize: 2.4, color: '#fb923c', align: 'end' },
            { x: 6, y: 46, text: 'DECAY', fontSize: 2.4, color: '#fb923c' },
            { x: w - 6, y: 46, text: 'DRIVE', fontSize: 2.4, color: '#fb923c', align: 'end' },
            { x: w / 2, y: 70, text: 'MIX', fontSize: 2.4, color: '#fb923c', align: 'middle' },
            { x: w / 2, y: 120, text: 'HEXINVERTER', fontSize: 2.2, color: '#94a3b8', align: 'middle' },
        ],
        decorations: [
            { kind: 'rect', x: 3, y: 80, w: w - 6, h: 1, color: '#fb923c' },
        ],
        items: [
            knob('tune', 'Tune', w * 0.25, 26, { color: '#1f2937', size: 'medium' }),
            knob('snap', 'Snap', w * 0.75, 26, { color: '#1f2937', size: 'medium' }),
            knob('decay', 'Decay', w * 0.25, 54, { color: '#1f2937', size: 'medium' }),
            knob('drive', 'Drive', w * 0.75, 54, { color: '#fb923c', size: 'medium' }),
            knob('mix', 'Mix', w * 0.50, 76, { color: '#fb923c', size: 'large' }),
            inPort('trig', 'Trig', 'trigger', w * 0.15, 95),
            inPort('accent', 'Accent', 'cv', w * 0.40, 95),
            inPort('tune_cv', 'Tune CV', 'cv', w * 0.65, 95),
            inPort('snap_cv', 'Snap CV', 'cv', w * 0.90, 95),
            outPort('noise', 'Noise', 'audio', w * 0.20, 110),
            outPort('tone', 'Tone', 'audio', w * 0.50, 110),
            outPort('out', 'Out', 'audio', w * 0.80, 110),
        ],
        notes: 'Analoge snare-drum-generator; tone-oscillator + ruisgenerator + envelope.',
    });
}
// ── 2. MI Elements ─────────────────────────────────────────────────────
function elements() {
    const w = W(34);
    // 3 rijen knoppen, mi-style kleuren: wit = excitation, rood = resonator, cyaan = modulatie
    const yRow1 = 22, yRow2 = 46, yRow3 = 70;
    const cols = [w * 0.10, w * 0.22, w * 0.34, w * 0.46, w * 0.58, w * 0.70, w * 0.82, w * 0.94];
    return assemble({
        typeId: 'tp_mi_elements',
        categoryId: 'vco',
        variant: 'Modal synthesis voice',
        brand: 'Mutable Instruments',
        model: 'Elements',
        hp: 34,
        texture: 'mi-cream',
        baseColor: '#f5ecd6',
        texts: [
            { x: w / 2, y: 6, text: 'ELEMENTS', fontSize: 3.5, color: '#1f2937', align: 'middle' },
            // grote knop in 't midden — Geometry / Brightness pair
            { x: cols[0], y: yRow1 - 7, text: 'BOW', fontSize: 2, color: '#ffffff' },
            { x: cols[1], y: yRow1 - 7, text: 'BLOW', fontSize: 2, color: '#ffffff' },
            { x: cols[2], y: yRow1 - 7, text: 'STRIKE', fontSize: 2, color: '#ffffff' },
            { x: cols[3], y: yRow1 - 7, text: 'FLOW', fontSize: 2, color: '#ffffff' },
            { x: cols[4], y: yRow1 - 7, text: 'MALLET', fontSize: 2, color: '#ffffff' },
            { x: cols[5], y: yRow1 - 7, text: 'GEOM', fontSize: 2, color: '#ef4444' },
            { x: cols[6], y: yRow1 - 7, text: 'BRIGHT', fontSize: 2, color: '#ef4444' },
            { x: cols[7], y: yRow1 - 7, text: 'POSITION', fontSize: 2, color: '#ef4444' },
            { x: cols[0], y: yRow2 - 7, text: 'BOW TIM', fontSize: 2, color: '#ffffff' },
            { x: cols[1], y: yRow2 - 7, text: 'BLOW TIM', fontSize: 2, color: '#ffffff' },
            { x: cols[2], y: yRow2 - 7, text: 'STRIK TIM', fontSize: 2, color: '#ffffff' },
            { x: cols[3], y: yRow2 - 7, text: 'DAMP', fontSize: 2, color: '#ef4444' },
            { x: cols[4], y: yRow2 - 7, text: 'SPACE', fontSize: 2, color: '#67e8f9' },
            { x: cols[5], y: yRow2 - 7, text: 'MODEL', fontSize: 2, color: '#1f2937' },
            { x: w / 2, y: 120, text: 'MUTABLE INSTRUMENTS', fontSize: 2.4, color: '#1f2937', align: 'middle' },
        ],
        decorations: [
            { kind: 'rect', x: 4, y: 12, w: w - 8, h: 0.6, color: '#d1d5db' },
            { kind: 'rect', x: 4, y: yRow3 + 8, w: w - 8, h: 0.6, color: '#d1d5db' },
        ],
        items: [
            // Rij 1 — excitation + resonator basis-knoppen
            knob('bow', 'Bow', cols[0], yRow1, { color: '#ffffff', style: 'mutable-small' }),
            knob('blow', 'Blow', cols[1], yRow1, { color: '#ffffff', style: 'mutable-small' }),
            knob('strike', 'Strike', cols[2], yRow1, { color: '#ffffff', style: 'mutable-small' }),
            knob('flow', 'Flow', cols[3], yRow1, { color: '#ffffff', style: 'mutable-small' }),
            knob('mallet', 'Mallet', cols[4], yRow1, { color: '#ffffff', style: 'mutable-small' }),
            knob('geometry', 'Geometry', cols[5], yRow1, { color: '#ef4444', style: 'mutable-small' }),
            knob('bright', 'Brightness', cols[6], yRow1, { color: '#ef4444', style: 'mutable-small' }),
            knob('position', 'Position', cols[7], yRow1, { color: '#ef4444', style: 'mutable-small' }),
            // Rij 2 — timbre's + damping/space + model-switch
            knob('bow_tim', 'Bow Timbre', cols[0], yRow2, { color: '#ffffff', style: 'mutable-small' }),
            knob('blow_tim', 'Blow Timbre', cols[1], yRow2, { color: '#ffffff', style: 'mutable-small' }),
            knob('strike_tim', 'Strike Timbre', cols[2], yRow2, { color: '#ffffff', style: 'mutable-small' }),
            knob('damping', 'Damping', cols[3], yRow2, { color: '#ef4444', style: 'mutable-small' }),
            knob('space', 'Space', cols[4], yRow2, { color: '#67e8f9', style: 'mutable-small' }),
            sw('model', 'Model', cols[5], yRow2, ['Modal', 'String', 'Drum'], 0),
            knob('coarse', 'Coarse', cols[6], yRow2, { color: '#1f2937', size: 'large', min: -36, max: 36, def: 0, unit: 'semi' }),
            knob('fine', 'Fine', cols[7], yRow2, { color: '#1f2937', size: 'small', min: -50, max: 50, def: 0, unit: 'ct' }),
            // Inputs (onderste deel)
            inPort('vct', 'V/Oct', 'cv', cols[0], yRow3 + 18),
            inPort('gate', 'Gate', 'gate', cols[1], yRow3 + 18),
            inPort('strength', 'Strength', 'cv', cols[2], yRow3 + 18),
            inPort('bow_in', 'Bow In', 'audio', cols[3], yRow3 + 18),
            inPort('blow_in', 'Blow In', 'audio', cols[4], yRow3 + 18),
            inPort('strk_in', 'Strike In', 'audio', cols[5], yRow3 + 18),
            outPort('aux', 'Aux', 'audio', cols[6], yRow3 + 18),
            outPort('out', 'Out', 'audio', cols[7], yRow3 + 18),
        ],
        notes: 'Modal-synthese stem: excitation (bow/blow/strike) → resonator (modal/string/drum). Best-known knoppen.',
    });
}
// ── 3. MI Shelves Expander ─────────────────────────────────────────────
function shelvesExpander() {
    const w = W(4);
    return assemble({
        typeId: 'tp_shelves_exp',
        categoryId: 'vcf',
        variant: 'Expander — per-band outs',
        brand: 'Mutable Instruments',
        model: 'Shelves Exp',
        hp: 4,
        texture: 'mi-cream',
        baseColor: '#f5ecd6',
        texts: [
            { x: w / 2, y: 6, text: 'EXP', fontSize: 2.6, color: '#1f2937', align: 'middle' },
            { x: w / 2, y: 120, text: 'MI', fontSize: 2.2, color: '#1f2937', align: 'middle' },
        ],
        items: [
            outPort('low', 'Low', 'audio', w / 2, 22),
            outPort('lomid', 'Lo-Mid', 'audio', w / 2, 38),
            outPort('mid', 'Mid', 'audio', w / 2, 54),
            outPort('himid', 'Hi-Mid', 'audio', w / 2, 70),
            outPort('hi', 'High', 'audio', w / 2, 86),
            outPort('sum', 'Σ', 'audio', w / 2, 102),
        ],
        notes: 'Expander voor Shelves: aparte uitgang per band.',
    });
}
// ── 4. AS RS-110 MkII ─────────────────────────────────────────────────
function rs110() {
    const w = W(10);
    return assemble({
        typeId: 'tp_as_rs110',
        categoryId: 'vcf',
        variant: 'Multimode VCF',
        brand: 'Analogue Systems',
        model: 'RS-110 MkII',
        hp: 10,
        texture: 'aluminum',
        baseColor: '#d6d3c4',
        texts: [
            { x: w / 2, y: 6, text: 'RS-110', fontSize: 3, color: '#1f2937', align: 'middle' },
            { x: w / 2, y: 11, text: 'MULTIMODE VCF', fontSize: 1.8, color: '#1f2937', align: 'middle' },
            { x: w / 2, y: 120, text: 'ANALOGUE SYSTEMS', fontSize: 1.8, color: '#1f2937', align: 'middle' },
            { x: w * 0.5, y: 30, text: 'FREQ', fontSize: 2, color: '#1f2937', align: 'middle' },
            { x: w * 0.5, y: 55, text: 'RES', fontSize: 2, color: '#1f2937', align: 'middle' },
        ],
        decorations: [
            { kind: 'rect', x: 3, y: 78, w: w - 6, h: 0.5, color: '#1f2937' },
        ],
        items: [
            knob('freq', 'Frequency', w * 0.5, 22, { size: 'large', color: '#111827', min: 20, max: 20000, def: 1000, unit: 'Hz' }),
            knob('res', 'Resonance', w * 0.5, 47, { size: 'medium', color: '#fde047' }),
            knob('lvl1', 'In 1', w * 0.20, 70, { size: 'small', color: '#111827' }),
            knob('lvl2', 'In 2', w * 0.50, 70, { size: 'small', color: '#111827' }),
            knob('lvl3', 'In 3', w * 0.80, 70, { size: 'small', color: '#111827' }),
            inPort('in1', 'In 1', 'audio', w * 0.15, 88),
            inPort('in2', 'In 2', 'audio', w * 0.40, 88),
            inPort('in3', 'In 3', 'audio', w * 0.65, 88),
            inPort('fcv', 'F CV', 'cv', w * 0.90, 88),
            outPort('lp', 'LP', 'audio', w * 0.12, 108),
            outPort('bp', 'BP', 'audio', w * 0.32, 108),
            outPort('hp', 'HP', 'audio', w * 0.52, 108),
            outPort('notch', 'Notch', 'audio', w * 0.72, 108),
            outPort('ap', 'AP', 'audio', w * 0.92, 108),
        ],
        notes: 'Multimode-VCF met 5 gelijktijdige uitgangen (LP/BP/HP/Notch/AP).',
    });
}
// ── 5. Erica Synths Fusion VCO ─────────────────────────────────────────
function fusionVco() {
    const w = W(22);
    return assemble({
        typeId: 'tp_erica_fusion_vco',
        categoryId: 'vco',
        variant: 'Tube-hybrid VCO',
        brand: 'Erica Synths',
        model: 'Fusion VCO',
        hp: 22,
        texture: 'pcb-black',
        texts: [
            { x: w / 2, y: 6, text: 'FUSION VCO', fontSize: 3, color: '#fde047', align: 'middle' },
            { x: w / 2, y: 120, text: 'ERICA SYNTHS', fontSize: 2.2, color: '#fde047', align: 'middle' },
            { x: w * 0.20, y: 38, text: 'OCTAVE', fontSize: 2, color: '#e5e7eb', align: 'middle' },
            { x: w * 0.50, y: 38, text: 'TUNE', fontSize: 2, color: '#e5e7eb', align: 'middle' },
            { x: w * 0.80, y: 38, text: 'TUBE', fontSize: 2, color: '#fde047', align: 'middle' },
            { x: w * 0.20, y: 70, text: 'PWM', fontSize: 2, color: '#e5e7eb', align: 'middle' },
            { x: w * 0.50, y: 70, text: 'SYMM', fontSize: 2, color: '#e5e7eb', align: 'middle' },
            { x: w * 0.80, y: 70, text: 'FM AMT', fontSize: 2, color: '#e5e7eb', align: 'middle' },
        ],
        decorations: [
            // tube slot links
            { kind: 'tubeSlot', x: w * 0.08, y: 14, w: 14, h: 14, color: '#fb7185' },
            { kind: 'rect', x: 3, y: 82, w: w - 6, h: 0.6, color: '#fde047' },
        ],
        items: [
            sw('octave', 'Octave', w * 0.20, 30, ['-2', '-1', '0', '+1', '+2'], 2),
            knob('tune', 'Tune', w * 0.50, 30, { size: 'large', min: -50, max: 50, def: 0, unit: 'ct' }),
            knob('tube', 'Tube', w * 0.80, 30, { size: 'medium', color: '#fde047' }),
            knob('pwm', 'PWM', w * 0.20, 62, { size: 'medium' }),
            knob('symm', 'Symmetry', w * 0.50, 62, { size: 'medium' }),
            knob('fm_amt', 'FM Amt', w * 0.80, 62, { size: 'medium' }),
            toggle('sync_hard', 'Hard Sync', w * 0.35, 78, false),
            inPort('vct', 'V/Oct', 'cv', w * 0.10, 95),
            inPort('fm', 'FM', 'cv', w * 0.25, 95),
            inPort('sync', 'Sync', 'gate', w * 0.40, 95),
            inPort('pwm_cv', 'PWM CV', 'cv', w * 0.55, 95),
            outPort('sine', 'Sin', 'audio', w * 0.10, 112),
            outPort('tri', 'Tri', 'audio', w * 0.25, 112),
            outPort('saw', 'Saw', 'audio', w * 0.40, 112),
            outPort('pulse', 'Pulse', 'audio', w * 0.55, 112),
            outPort('sub', 'Sub', 'audio', w * 0.70, 112),
            outPort('mix', 'Mix', 'audio', w * 0.88, 112),
        ],
        notes: 'Hybride buis-VCO; ruwe oranje gloed van de buis in linkerbovenhoek.',
    });
}
// ── 6. Richter Oscillator II  (best-guess interpretatie) ───────────────
function richterOsc2() {
    const w = W(14);
    return assemble({
        typeId: 'tp_richter_osc2',
        categoryId: 'vco',
        variant: 'Dual analog VCO (interpretatief)',
        brand: 'Richter',
        model: 'Oscillator II',
        hp: 14,
        texture: 'pcb-black',
        texts: [
            { x: w / 2, y: 6, text: 'OSCILLATOR II', fontSize: 2.8, color: '#e5e7eb', align: 'middle' },
            { x: w / 2, y: 120, text: 'RICHTER (best-guess)', fontSize: 2, color: '#94a3b8', align: 'middle' },
            { x: w * 0.5, y: 22, text: 'OSC A', fontSize: 2, color: '#22d3ee', align: 'middle' },
            { x: w * 0.5, y: 64, text: 'OSC B', fontSize: 2, color: '#f472b6', align: 'middle' },
        ],
        decorations: [
            { kind: 'rect', x: 3, y: 58, w: w - 6, h: 0.5, color: '#475569' },
        ],
        items: [
            // Osc A
            knob('a_tune', 'A Tune', w * 0.30, 32, { size: 'medium', min: -50, max: 50, def: 0, unit: 'ct', color: '#22d3ee' }),
            knob('a_pwm', 'A PWM', w * 0.70, 32, { size: 'small', color: '#22d3ee' }),
            sw('a_wave', 'A Wave', w * 0.50, 44, ['Saw', 'Tri', 'Sqr'], 0),
            // Osc B
            knob('b_tune', 'B Tune', w * 0.30, 76, { size: 'medium', min: -50, max: 50, def: 0, unit: 'ct', color: '#f472b6' }),
            knob('b_pwm', 'B PWM', w * 0.70, 76, { size: 'small', color: '#f472b6' }),
            sw('b_wave', 'B Wave', w * 0.50, 88, ['Saw', 'Tri', 'Sqr'], 0),
            inPort('a_vct', 'A V/Oct', 'cv', w * 0.15, 100),
            inPort('a_fm', 'A FM', 'cv', w * 0.40, 100),
            inPort('b_vct', 'B V/Oct', 'cv', w * 0.65, 100),
            inPort('b_fm', 'B FM', 'cv', w * 0.90, 100),
            outPort('a_out', 'A Out', 'audio', w * 0.20, 113),
            outPort('b_out', 'B Out', 'audio', w * 0.50, 113),
            outPort('mix', 'Mix', 'audio', w * 0.80, 113),
        ],
        notes: 'Geen publieke spec gevonden; layout is een redelijk-uitziende dual-analog-VCO als plaatshouder. Pas aan zodra echte foto/spec beschikbaar.',
    });
}
// ── public entry ───────────────────────────────────────────────────────
export function seedExampleModules(project) {
    const all = [mutantSnare(), elements(), shelvesExpander(), rs110(), fusionVco(), richterOsc2()];
    const newTypes = all.map((x) => x.type);
    const newModules = all.map((x) => x.module);
    // Plaats in actief rack: greedy van links naar rechts, wrap bij hpPerRow.
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
            // als geen rij past, sla over (gebruiker kan het rack vergroten)
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
