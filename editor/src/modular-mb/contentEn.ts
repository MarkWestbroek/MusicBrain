// Engelse teksten (UK English) voor de inhoud van de standaardset: namen,
// uitleg, kopjes en labels die een seed in het project zet. Die tekst staat
// daarna in de patch zelf, dus vertalen gebeurt bij het tonen: de Nederlandse
// tekst is de sleutel. Heeft iemand een uitleg of naam veranderd, dan is er
// geen sleutel meer en blijft zijn eigen tekst staan (wat ook klopt).
//
// contentEn.test.ts eist dat alles uit DEMO_SEEDS hier staat, of in SAME
// (al Engels of een naam). Een gewijzigde seedtekst zonder vertaling valt
// daar op.

import { getLang } from '../i18n';

const EN: Record<string, string> = {
  // ── Keuzelijst: labels en titels ────────────────────────────────────────
  '🪗 Orgel ×12': '🪗 Organ ×12',
  '🎞 Mellotron fluit ×8': '🎞 Mellotron flute ×8',
  '🎻 Mellotron strijkers ×8': '🎻 Mellotron strings ×8',
  '🎺 CS-80 koper ×4': '🎺 CS-80 brass ×4',
  '🧪 Buchla-stem': '🧪 Buchla voice',
  '🥁 Ritmebox (CR-78)': '🥁 Rhythm box (CR-78)',
  'Elektrische piano, twaalf toetsen, tine en pickup; speel zacht en hard.':
    'Electric piano, twelve voices, tine and pickup; play soft and hard.',
  'Tonewheel-orgel met alle negen trekstangen en de rotary.':
    'Tonewheel organ with all nine drawbars and the rotary speaker.',
  'Achtstemmige zesoperator-FM; kies bank en program, het display toont de naam.':
    'Eight-voice six-operator FM; choose a bank and program, the display shows the name.',
  'Zesoperator-FM (één stem) met univibe erachter.': 'Six-operator FM (one voice) through a Uni-Vibe.',
  'De fluit van de Mellotron: bandjes van acht seconden, met wow en flutter.':
    'The Mellotron flute: eight-second tapes, with wow and flutter.',
  'Strijkers op de Mellotron: akkoorden die na acht seconden vallen.':
    'Mellotron strings: chords that run out after eight seconds.',
  'Koper à la Vangelis: druk na de aanslag door (aftertouch) en het filter gaat open. Vier stemmen, licht genoeg voor een telefoon.':
    'Vangelis-style brass: press down after the note (aftertouch) and the filter opens. Four voices, light enough for a phone.',
  'Achtstemmige Elka Synthex.': 'Eight-voice Elka Synthex.',
  'De lead van Axel F: twee zagen in unison door een ladderfilter, met echo.':
    'The Axel F lead: two saws in unison through a ladder filter, with echo.',
  'De chip uit de Commodore 64 als driestemmige synth.': 'The Commodore 64 chip as a three-voice synth.',
  'Snaar door een buizenversterker (Marshall-stack).': 'A plucked string through a valve amp (Marshall stack).',
  'Resonator met shimmer-galm.': 'Resonator with shimmer reverb.',
  'Macro-oscillator met stereo phaser; Engine kiest uit 24 klankmodellen.':
    'Macro oscillator with stereo phaser; Engine picks one of 24 sound models.',
  'West Coast onder het klavier: complex-oscillator door een low-pass gate.':
    'West Coast under the keyboard: complex oscillator through a low-pass gate.',
  'Trautonium-stem (Oskar Sala, The Birds): ondertonen in plaats van boventonen en vaste formanten, met plaatgalm. Probeer het lint (〰) onder het klavier.':
    'Trautonium voice (Oskar Sala, The Birds): undertones instead of overtones and fixed formants, with plate reverb. Try the ribbon (〰) under the keyboard.',
  'Ondes Martenot (Messiaen, Jonny Greenwood) door de Palme-luidspreker: twaalf snaren die meetrillen. Het modwiel geeft meer vibrato; op het lint glijdt hij als de ring aan de draad.':
    'Ondes Martenot (Messiaen, Jonny Greenwood) through the Palme speaker: twelve strings that resonate along. The mod wheel adds vibrato; on the ribbon it glides like the ring on the wire.',
  '🖥 Fairlight CMI': '🖥 Fairlight CMI',
  'De golfvormsynthese van de Fairlight CMI: een koor uit 32 harmonischen dat door de noot heen beweegt. PAGE 4 boven het front tekent de harmonischen, groen op zwart.':
    'The waveform synthesis of the Fairlight CMI: a choir made of 32 harmonics that moves through the note. PAGE 4 above the front panel draws the harmonics, green on black.',
  'Vier ondes Martenot door één Palme, zoals Messiaen voor een ensemble van ondes schreef: akkoorden die nazingen in de snaren. Speel langzaam en legato.':
    'Four ondes Martenot through one Palme, as Messiaen wrote for an ensemble of ondes: chords that sing on in the strings. Play slowly and legato.',
  'Een ensemble van 4 ondes Martenot door één Palme-luidspreker, zoals Messiaen voor zes ondes schreef (het instrument zelf is eenstemmig). Akkoorden zingen na in de twaalf snaren van de Palme; het modwiel geeft meer vibrato, aftertouch zwelt. Speel langzaam en legato.':
    'An ensemble of 4 ondes Martenot through one Palme speaker, as Messiaen wrote for six ondes (the instrument itself is monophonic). Chords sing on in the twelve strings of the Palme; the mod wheel adds vibrato, aftertouch swells. Play slowly and legato.',
  'Arpeggiator: houd een akkoord vast en hij speelt de toetsen op en neer over twee octaven, een geplukte snaar met echo. Latch staat aan: hij speelt door na het loslaten; het stopbord stopt hem.':
    'Arpeggiator: hold a chord and it plays the keys up and down over two octaves, a plucked string with echo. Latch is on: it keeps playing after you let go; the stop sign stops it.',
  'De ritmes van de CR-78; pad 1 start en stopt.': 'The CR-78 rhythms; pad 1 starts and stops.',
  'Zelfspelende acid-lijn met een kick; draai aan Cutoff en Reso.':
    'Self-playing acid line with a kick; turn Cutoff and Reso.',
  'Zelfspelend: een gevouwen sinus door een low-pass gate.': 'Self-playing: a folded sine through a low-pass gate.',
  'Zelfspelend: Stages, Marbles en Clouds.': 'Self-playing: Stages, Marbles and Clouds.',
  'Zelfspelend: Marbles kiest noten voor Plaits en Clouds.': 'Self-playing: Marbles picks notes for Plaits and Clouds.',

  // ── Patchnamen ──────────────────────────────────────────────────────────
  'Mellotron fluit': 'Mellotron flute',
  'Mellotron strijkers': 'Mellotron strings',
  'CS-80 koper (aftertouch)': 'CS-80 brass (aftertouch)',
  'Buchla-stem': 'Buchla voice',
  'Ritmebox (CR-78)': 'Rhythm box (CR-78)',

  // ── Uitleg bij de patches ───────────────────────────────────────────────
  'Elektrische piano met twaalf toetsen: een model van tine en pickup, zonder samples. Speel zacht en hard: de klank verandert met de aanslag, van rond naar blaffend. Timbre is de plek van de tine voor de pickup (0 = dun en glazig, hoger = vol); Bell is de tik in de aanslag; Type Reed geeft de hollere Wurlitzer-kant. Tremolo wiegt tussen links en rechts. Het sustainpedaal (CC64) zit via MIDI-IN CC2 op Sust; Damper is hoe snel losgelaten toetsen stilvallen.':
    'Electric piano with twelve voices: a model of tine and pickup, no samples. Play soft and hard: the sound changes with your touch, from round to barking. Timbre is where the tine sits in front of the pickup (0 = thin and glassy, higher = full); Bell is the click in the attack; Type Reed gives the hollower Wurlitzer side. Tremolo sways between left and right. The sustain pedal (CC64) reaches Sust via MIDI-IN CC2; Damper sets how quickly released keys fall silent.',
  'Tonewheel-orgel met twaalf toetsen door de ROTARY. Registratie 888000000 met percussie op de 3e harmonische en chorus C3: de jazz-stand. Het mod-wiel schakelt de luidspreker tussen langzaam en snel; hoor hoorn en trommel elk in hun eigen tempo opwinden. Speel legato: alleen de eerste noot krijgt de percussietik. Trek 16′ en 5⅓′ dicht en 4′ open voor een lichter geluid, of alles open voor vol orgel.':
    'Twelve-voice tonewheel organ through the ROTARY. Registration 888000000 with percussion on the 3rd harmonic and chorus C3: the jazz setting. The mod wheel switches the speaker between slow and fast; listen to horn and drum each speeding up at their own pace. Play legato: only the first note gets the percussion click. Push in 16′ and 5⅓′ and pull out 4′ for a lighter sound, or pull everything out for full organ.',
  '8-stemmige 6-op FM (msfa/Dexed-kern). Bank kiest een van de acht fabrieksbanken (1A t/m 4B), Program de klank (0–31); het display toont de naam. Bank 8 is je eigen .syx, te laden via de Teensy-modal.':
    'Eight-voice six-operator FM (msfa/Dexed core). Bank picks one of the eight factory banks (1A to 4B), Program the sound (0–31); the display shows the name. Bank 8 is your own .syx, loaded through the Teensy dialogue.',
  'De fluit van de Mellotron M400: elke toets een bandje van acht seconden, dan stopt de klank. Speel legato en laat het bandje terugspoelen; Wow, Flutter en Wear zijn de ouderdom van de machine.':
    'The flute of the Mellotron M400: every key is an eight-second tape, then the sound stops. Play legato and let the tape rewind; Wow, Flutter and Wear are the age of the machine.',
  'Strijkers op de Mellotron: akkoorden van hoogstens acht seconden, met de veer die het bandje terugtrekt als je loslaat. Houd een akkoord vast tot het valt; dat is de machine, geen fout.':
    'Strings on the Mellotron: chords of eight seconds at most, with the spring that pulls the tape back when you let go. Hold a chord until it runs out; that is the machine, not a fault.',
  'CS-80-koper à la Vangelis: 4 stemmen zaagtand → ladder, trage filter-attack. Aftertouch opent het filter (tot vier octaven) en voegt vibrato toe (opgeteld bij het modwheel). BBD-chorus en plaatgalm op de bus. Speel langzaam en druk ná de aanslag door.':
    'CS-80 brass in the style of Vangelis: 4 voices of sawtooth → ladder, slow filter attack. Aftertouch opens the filter (up to four octaves) and adds vibrato (on top of the mod wheel). BBD chorus and plate reverb on the bus. Play slowly and press down after the note.',
  'Acht stemmen naar de Elka Synthex: een zaag en een pulsgolf, iets verstemd, door het vierpolige filter met wat envelope, en de chorus aan. De pitch-wheel is de joystick (X), het mod-wiel opent het filter (Y). Probeer Mode BP of HP, Ring op oscillator 2, of Sync met Transpose +7.':
    'Eight voices after the Elka Synthex: a saw and a pulse wave, slightly detuned, through the four-pole filter with some envelope, and the chorus on. The pitch wheel is the joystick (X), the mod wheel opens the filter (Y). Try Mode BP or HP, Ring on oscillator 2, or Sync with Transpose +7.',
  'Axel F-lead (Faltermeyer) naar het recept van Doctor Mix: twee saws in unison (±6 ct) → ladder die ver openstaat → Para EQ (low-cut, dip bij 450 Hz) → Digital Echo op een punt-achtste bij 117 BPM. Monofoon; speel staccato.':
    'Axel F lead (Faltermeyer) after the Doctor Mix recipe: two saws in unison (±6 ct) → ladder wide open → Para EQ (low cut, dip at 450 Hz) → Digital Echo on a dotted eighth at 117 BPM. Monophonic; play staccato.',
  'De SID uit de Commodore 64 als drie-stemmige synth: pulse met een langzame PWM (LFO op PW+), een korte decay en een hoge sustain, door het filter (lowpass, cutoff 700, res 8). Drie noten tegelijk, zoals op de chip; een vierde steelt een stem. Probeer Saw of Tri+Saw, Ring en Sync, of Noise voor drums.':
    'The Commodore 64 SID as a three-voice synth: pulse with slow PWM (LFO on PW+), a short decay and a high sustain, through the filter (low-pass, cutoff 700, res 8). Three notes at once, as on the chip; a fourth steals a voice. Try Saw or Tri+Saw, Ring and Sync, or Noise for drums.',
  'West Coast-stem onder het klavier: complex-oscillator (259-stijl) door een low-pass gate. De gate van het klavier gaat door SLOPE (snel op, traag terug); die envelope opent de LPG en duwt het timbre open, zodat elke noot helder begint en rond uitsterft. De gate pingt de LPG ook rechtstreeks voor de tik. Draai aan Timbre, FM en Ratio op COMPLEX (hele Ratio = harmonisch, ertussen = klok), en aan Fall op SLOPE voor de lengte.':
    'A West Coast voice under the keyboard: complex oscillator (259 style) through a low-pass gate. The keyboard gate goes through SLOPE (fast up, slow down); that envelope opens the LPG and pushes the timbre open, so every note starts bright and dies away round. The gate also pings the LPG directly for the click. Turn Timbre, FM and Ratio on COMPLEX (whole Ratio = harmonic, in between = bell), and Fall on SLOPE for the length.',
  'De ritmebox met de presets van de CR-78. Draai aan Rhythm voor een ander ritme en zet Variation op A, B of A+B. Pad 1 start en stopt, pad 2 zet terug op de één. Rock 4 en Disco zijn onzeker overgenomen; Samba, Mambo, Cha-cha, Beguine en Rhumba ontbreken nog.':
    'The rhythm box with the CR-78 presets. Turn Rhythm for another rhythm and set Variation to A, B or A+B. Pad 1 starts and stops, pad 2 goes back to the one. Rock 4 and Disco are uncertain transcriptions; Samba, Mambo, Cha-cha, Beguine and Rhumba are still missing.',
  'Zelfspelende acid-lijn. De Clock klokt de sequencer op zestienden; Euclid 1 (5 op 16) zet accenten, Euclid 2 (2 op 7) slides, en omdat 7 niet in 16 past verschuift het patroon elke maat. Chaos drijft de cutoff. Draai aan Cutoff, Reso, Env mod en Accent op ACID; verander Fill en Steps op EUCLID voor een andere lijn; Swing op CLOCK.':
    'Self-playing acid line. The Clock drives the sequencer in sixteenths; Euclid 1 (5 in 16) sets accents, Euclid 2 (2 in 7) slides, and because 7 does not fit into 16 the pattern shifts every bar. Chaos drifts the cutoff. Turn Cutoff, Reso, Env mod and Accent on ACID; change Fill and Steps on EUCLID for another line; Swing on CLOCK.',
  'Zelfspelend, in de Buchla-traditie: een sinus door de wavefolder (stand 259) en een low-pass gate die door de pulsen van Turing aangetikt wordt. De melodie is een schuifregister-lus van acht stappen die af en toe een noot verandert (Change op TURING: 0 = vast, hoger = sneller anders). LFO-8 opent en sluit de folder in een trage golf, Chaos schuift de symmetrie. Draai aan Fold en Type op FOLDER en aan Decay op LPG.':
    'Self-playing, in the Buchla tradition: a sine through the wavefolder (259 setting) and a low-pass gate struck by the pulses from Turing. The melody is an eight-step shift-register loop that now and then changes a note (Change on TURING: 0 = locked, higher = changes sooner). LFO-8 opens and closes the folder in a slow wave, Chaos shifts the symmetry. Turn Fold and Type on FOLDER and Decay on LPG.',
  'Zelfspelend (Buchla-Krell): Stages loopt en triggert via EOC zichzelf + Marbles (nieuwe noot). De envelope stuurt de VCA en Morph-WT’s morph; Clouds maakt de ruimte. Draai aan Stages T2/rate en Marbles Deja vu.':
    'Self-playing (Buchla Krell): Stages cycles and triggers itself and Marbles (a new note) via EOC. The envelope drives the VCA and the Morph-WT morph; Clouds makes the space. Turn Stages T2/rate and Marbles Deja vu.',
  'Zelfspelend: Marbles kiest noten (pentatonisch) en klokt Plaits; Clouds + Tides maken er een drijvende wolk van. Draai aan Déjà vu (~0.5) om de melodie te laten loopen.':
    'Self-playing: Marbles picks notes (pentatonic) and clocks Plaits; Clouds + Tides turn it into a drifting cloud. Turn Déjà vu (~0.5) to make the melody loop.',

  // ── Fronts: naam, kopjes, labels ────────────────────────────────────────
  'Spelen': 'Play',
  'Trekstangen': 'Drawbars',
  'Percussie': 'Percussion',
  'Orgel': 'Organ',
  'Snelheid': 'Speed',
  'Uit': 'Output',
  'Helderheid': 'Brightness',
  'Resonantie': 'Resonance',
  'Druk op filter': 'Pressure to filter',
  'Ruimte': 'Space',
  'Galm': 'Reverb',
  'Ritme': 'Rhythm',
  'Klok': 'Clock',
};

/** Al Engels, of een naam: hetzelfde in beide talen. */
export const SAME = new Set([
  'Volume', 'Drive', 'Envelope', 'Chorus', 'Aftertouch', 'Filter', 'Rotary', 'Mix', 'Acid',
]);

/** "Monofoon: … X zit tussen Y en OUT." uit seedSoloVoicePatch, met de ARP ervoor. */
const SOLO = /^(Arpeggio: houd een akkoord vast; ARP speelt de toetsen als reeks\. )?Monofoon: speel en draai — alle knoppen gaan live naar de Teensy\. (.+) zit tussen (.+) en OUT\.$/;

/** De Engelse tekst bij een Nederlandse standaardtekst; anders (of in het
 *  Nederlands) de tekst zelf. */
export function contentText(nl: string): string;
export function contentText(nl: string | undefined): string | undefined;
export function contentText(nl: string | undefined): string | undefined {
  if (nl === undefined || getLang() === 'nl') return nl;
  return contentEn(nl) ?? nl;
}

/** Alleen de vertaling, of undefined als er geen is (voor de test). */
export function contentEn(nl: string): string | undefined {
  if (nl in EN) return EN[nl];
  const m = SOLO.exec(nl);
  if (m) return (m[1] ? 'Arpeggio: hold a chord; ARP plays the keys as a sequence. ' : '')
    + `Monophonic: play and turn — every knob goes live to the Teensy. ${m[2]} sits between ${m[3]} and OUT.`;
  // "2e / 3e" (percussie-harmonische)
  if (nl === '2e / 3e') return '2nd / 3rd';
  return undefined;
}

/** Het front zoals het getoond wordt: naam, uitleg, kopjes en labels in de
 *  actieve taal. Alleen voor weergave; bewerken gaat op het origineel
 *  (zelfde items, zelfde volgorde). */
export function frontText<F extends { name: string; description?: string; items: readonly FrontItemText[] }>(front: F): F {
  if (getLang() === 'nl') return front;
  return {
    ...front,
    name: contentText(front.name),
    description: contentText(front.description),
    items: front.items.map((it) => (it.kind === 'group'
      ? { ...it, text: contentText(it.text) }
      : it.label ? { ...it, label: contentText(it.label) } : it)),
  };
}
type FrontItemText = { kind: string; text?: string; label?: string };
