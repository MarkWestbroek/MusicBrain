// Welke controls van een moduletype op een speelfront horen, in volgorde van
// belang (doc/plans/patch-front.md §5). Het automatische front kiest hieruit;
// het AI-front krijgt dezelfde volgorde als rangorde.
//
// De maatstaf is "waar draait een speler aan", niet "wat stelt een bouwer
// in". Daarom geen stemming (coarse, fine, tune) en geen volume per module:
// het volume van het geheel is OUT `level`. Wel de keuzeknoppen (bank,
// program, engine, model) en de schakelaars die het karakter bepalen (Rotary
// `speed`, Tube `stack`).
//
// De lijst is leidend: van een type dat hier staat komt niets anders vanzelf
// op het front, ook niet als de lijst leeg is. Een type dat hier níét staat
// valt terug op de vuistregels van `rankKnobs`. Klankbronnen, filters,
// effecten en drums moeten hier staan; `frontControls.test.ts` bewaakt dat,
// en dat elk id bestaat. Nieuwe module: zet hem erbij.
//
// Dit is iets anders dan `playable` in de receptcatalogus: dat zijn de
// startwaarden waarmee een recept een module hoorbaar maakt.

const T = (id: string): string => `tp_mmb_${id}`;

export const FRONT_CONTROLS: Record<string, string[]> = {
  // ── Klankbronnen ──────────────────────────────────────────────────────
  [T('acid')]: ['cutoff', 'res', 'envmod', 'decay', 'accent', 'wave'],
  [T('audioin')]: ['level'],
  [T('complex')]: ['timbre', 'fm', 'symmetry', 'ratio', 'tmod', 'am'],
  [T('draw_vco')]: [],
  [T('dx7')]: ['bank', 'program'],
  [T('elements')]: ['bow', 'blow', 'strike', 'geometry', 'brightness', 'damping', 'position', 'space'],
  [T('epiano')]: ['type', 'timbre', 'bell', 'tremolo', 'drive', 'decay', 'trem_rate'],
  [T('excitable')]: ['excite', 'refract', 'thresh', 'pickup', 'detune'],
  [T('fm_vco')]: ['fm_amt', 'wave'],
  [T('fof')]: ['vowel', 'voice', 'tone', 'breath', 'vibrato', 'syl'],
  [T('gendyn')]: ['points', 'amp_step', 'dur_step', 'dist', 'smooth'],
  [T('material_bridge')]: ['coupling', 'decay', 'memory', 'fatigue', 'spread', 'pickup'],
  [T('morph_wt')]: ['morph', 'wslot', 'bank'],
  [T('octa_vco')]: ['wave', 'detune'],
  [T('organ')]: ['d16', 'd513', 'd8', 'd4', 'd223', 'd2', 'd135', 'd113', 'd1', 'perc', 'vib', 'click'],
  [T('plaits')]: ['engine', 'harmonics', 'timbre', 'morph', 'decay', 'lpg'],
  [T('quad_vco_shared')]: ['wave'],
  [T('rings')]: ['model', 'structure', 'brightness', 'damping', 'position', 'polyphony'],
  [T('rungler')]: ['freq_a', 'freq_b', 'cross_a', 'cross_b', 'cutoff', 'res', 'sweep'],
  [T('sampler')]: ['bank', 'cutoff', 'q', 'attack', 'env_rel', 'start'],
  [T('scanned')]: ['tension', 'damping', 'speed', 'position', 'width', 'restore'],
  [T('sid')]: ['cutoff', 'res', 'pw', 'attack', 'decay', 'release'],
  [T('sid3')]: ['stack', 'cutoff', 'res', 'combo'],
  [T('stk_sound')]: ['sound', 'timbre', 'modulation', 'strength'],
  [T('string')]: ['pluck'],
  [T('synthex')]: ['freq', 'res', 'env_amt', 'aa', 'ar', 'o2_detune', 'chorus', 'pw', 'glide', 'lfo_vcf'],
  [T('tapestrip')]: ['bank', 'contact', 'wow', 'flutter', 'wear', 'motor'],
  [T('vco')]: ['wave', 'fm_amt'],
  [T('wt_vco')]: ['bank'],
  [T('zang')]: ['bank', 'syl', 'mode', 'formant', 'speed'],
  [T('noise')]: ['color'],

  // ── Drums ─────────────────────────────────────────────────────────────
  [T('cr78')]: ['drum', 'tone', 'decay'],
  [T('peaks')]: ['drum', 'tone', 'decay', 'snap'],
  [T('percuter')]: ['bank', 'tune', 'filter'],
  [T('rhythm')]: ['rhythm', 'variation', 'tempo', 'run', 'accent'],

  // ── Filters ───────────────────────────────────────────────────────────
  [T('ladder')]: ['cutoff', 'q', 'drive'],
  [T('ms20')]: ['cutoff', 'q', 'drive', 'type'],
  [T('octa_vcf')]: ['cutoff', 'q', 'type'],
  [T('sem')]: ['cutoff', 'res', 'mode', 'drive'],
  [T('vcf')]: ['cutoff', 'q', 'type'],

  // ── Effecten ──────────────────────────────────────────────────────────
  [T('bbd_chorus')]: ['rate', 'depth', 'mix', 'feedback'],
  [T('bus_comp')]: ['threshold', 'makeup', 'mix'],
  [T('clouds')]: ['position', 'size', 'density', 'texture', 'pitch', 'mix', 'reverb', 'feedback', 'freeze'],
  [T('comb')]: ['coarse', 'feedback', 'mix'],   // coarse is hier de stemming van de kam: dat ís de klank
  [T('comp')]: ['threshold', 'ratio', 'makeup'],
  [T('console_eq')]: ['low_gain', 'mid_gain', 'high_gain', 'color'],
  [T('digital_echo')]: ['time', 'feedback', 'mix', 'mod_depth'],
  [T('diode_comp')]: ['threshold', 'makeup', 'color', 'mix'],
  [T('drive')]: ['drive', 'tone', 'mode', 'mix'],
  [T('echo')]: ['time', 'feedback', 'mix'],
  [T('elements_reverb')]: ['amount', 'time', 'lp'],
  [T('ensemble')]: ['depth', 'mix', 'tone'],
  [T('fet_comp')]: ['input', 'output', 'ratio', 'mix'],
  [T('folder')]: ['fold', 'symmetry', 'type', 'mix'],
  [T('freqshift')]: ['shift', 'fbk', 'mix', 'range'],
  [T('harmonizer')]: ['semi_a', 'semi_b', 'mix', 'feedback'],
  [T('octaver')]: ['oct1', 'oct2', 'up', 'dry'],
  [T('opto_comp')]: ['peak', 'gain', 'mix'],
  [T('para_eq')]: ['lf_gain', 'lmf_gain', 'hmf_gain', 'hf_gain'],
  [T('phaser')]: ['rate', 'depth', 'feedback', 'mix'],
  [T('program_eq')]: ['low_boost', 'high_boost', 'low_atten', 'high_atten'],
  [T('resonator')]: ['structure', 'decay', 'damping', 'mix', 'root'],
  [T('reverb')]: ['size', 'mix', 'damp', 'mode'],
  [T('ringmod')]: ['freq', 'mix', 'wave'],
  [T('rotary')]: ['speed', 'drive', 'balance', 'fast_rate', 'slow_rate'],
  [T('shimmer')]: ['shimmer', 'size', 'mix', 'interval'],
  [T('stereo_phaser')]: ['rate', 'depth', 'feedback', 'mix'],
  [T('stereo_tape_echo')]: ['time', 'feedback', 'mix', 'wow', 'drive'],
  [T('stereo_vca')]: ['vol', 'pan'],
  [T('tape_echo')]: ['time', 'feedback', 'mix', 'wow', 'drive'],
  [T('tremolo')]: ['rate', 'depth', 'wave'],
  [T('tube')]: ['drive', 'stack', 'bass', 'mid', 'treble', 'presence', 'mix'],
  [T('varimu_comp')]: ['input', 'threshold', 'output', 'mix'],
  [T('vibe')]: ['speed', 'intensity', 'mode'],
  [T('wah')]: ['pedal', 'mode', 'q', 'mix'],
  [T('warps')]: ['algo', 'timbre', 'drive1', 'drive2'],

  // ── VCA, envelopes, LFO's, sequencers ─────────────────────────────────
  [T('lpg')]: ['offset', 'decay', 'mode', 'res'],
  [T('vca')]: ['gain'],
  [T('octa_vca')]: ['level'],
  [T('out')]: ['level'],
  [T('ahdsr')]: ['attack', 'release', 'decay', 'sustain'],
  [T('slope')]: ['rise', 'fall', 'shape'],
  [T('env_follower')]: ['sens', 'attack', 'release'],
  [T('env_follower_mono')]: ['sens', 'attack', 'release'],
  [T('lfo')]: ['rate', 'depth', 'wave'],
  [T('chaos')]: ['rate', 'depth', 'model'],
  [T('lfo8')]: ['rate', 'depth', 'spread'],
  [T('tides')]: ['rate', 'shape', 'slope', 'smooth'],
  [T('clock')]: ['tempo', 'swing', 'run'],
  [T('euclid')]: ['tempo', 'fill_1', 'fill_2', 'fill_3'],
  [T('grids')]: ['x', 'y', 'chaos', 'tempo', 'bd', 'sd', 'hh'],
  [T('marbles')]: ['tempo', 'bias', 'spread', 'jitter', 'dejavu', 'steps'],
  [T('seq8')]: ['rate', 'gate', 'length', 'run', 'root'],
  [T('turing')]: ['change', 'length', 'tempo', 'range'],
  [T('chord')]: ['chord', 'inv', 'spread'],
  [T('quant')]: ['scale', 'root'],

  // ── Speelmodules: de pads, schuiven en knoppen zelf, niet hun instelling
  //    (latch, bereik, slew) ─────────────────────────────────────────────
  [T('pads')]: ['b1', 'b2', 'b3', 'b4'],
  [T('faders')]: ['v1', 'v2', 'v3', 'v4'],
  [T('knobs')]: ['v1', 'v2', 'v3', 'v4'],

  // ── Mixers: in een poly-patch zijn de kanalen de stemmen; volume en pan
  //    per stem zijn geen speelknoppen. Wie een mixer als mengpaneel
  //    gebruikt zet de kanalen er zelf op. ───────────────────────────────
  [T('mixer')]: [],
  [T('mixer8')]: [],
  [T('mixer16')]: [],
  [T('quad_mixer_shared')]: [],
};

/** Namen die bijna nooit een speelknop zijn: stemming en volume per module.
 *  Alleen voor de terugval (types zonder lijst): daar komen ze achteraan. */
export const DULL_CONTROL = /^(level|volume|vol|gain|coarse|fine|tune|output)(_?\d+)?$/;
