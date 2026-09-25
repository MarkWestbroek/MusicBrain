// Handleiding van de commandotaal (⌘ Recept / Ctrl+K), getoond via de ?-knop
// in het venster. Elk voorbeeld gaat in commandHelp.test.ts door de parser,
// zodat de handleiding niet kan liegen.

export interface HelpExample { text: string; note?: string }
export interface HelpSection { title: string; intro: string; examples: HelpExample[] }

export const COMMAND_HELP: HelpSection[] = [
  {
    title: 'Een nieuwe patch bouwen',
    intro: 'Noem de stemkern en wat je erbij wilt. Aantal stemmen, filter, effecten per stem en effecten op de bus. De volgorde van de woorden maakt niet uit, Nederlands en Engels mag.',
    examples: [
      { text: 'maak een 8x poly patch met een wavetable osc, een simpele vcf en een diode compressor op het eind' },
      { text: '4 stemmige plaits met ladder filter en een phaser per stem', note: 'per stem = effect in elke stem' },
      { text: 'nieuwe mono string zonder filter met een galm achteraan', note: 'achteraan / op het eind / op de bus = na de mixer' },
      { text: 'dx7 poly 8 zonder filter met een vibe op de bus' },
      { text: 'vco met vibrato en een lfo per stem' },
      { text: 'mono vco zonder envelope', note: 'ook: zonder velocity, zonder vibrato' },
    ],
  },
  {
    title: 'Stemmen',
    intro: 'Werkt op de actieve patch. De stemketen wordt gekloond of teruggebracht; de mixer groeit mee.',
    examples: [
      { text: 'maak deze patch 4 stemmig' },
      { text: 'maak er 8 stemmen van' },
      { text: 'naar mono' },
    ],
  },
  {
    title: 'Vervangen',
    intro: 'Vervang een module door een ander type. Rolwoorden (osc, filter, vca) of een modulenaam. Een lid van een poly-groep vervangt de hele groep; een mono L/R-paar kan één stereomodule worden en omgekeerd.',
    examples: [
      { text: 'vervang de osc door een wavetable' },
      { text: 'vervang het filter door een ms-20' },
      { text: 'vervang de tape door een stereo tape', note: 'L/R-paar → één stereomodule' },
    ],
  },
  {
    title: 'Toevoegen',
    intro: 'Een effect op de bus (tussen mixer en OUT), of modulatie op een cv-ingang.',
    examples: [
      { text: 'voeg een tape echo toe op de bus' },
      { text: 'zet een diode compressor op het eind' },
      { text: 'zet een lfo op de cutoff van het filter', note: 'een LFO is voor alle stemmen samen' },
      { text: 'voeg een envelope toe op de vco tune', note: 'een envelope krijgt er één per stem' },
    ],
  },
  {
    title: 'Knoppen',
    intro: 'Een knop op een stand zetten, op naam of label. In een poly-patch krijgen alle stemmen dezelfde stand.',
    examples: [
      { text: 'zet de cutoff van het filter op 1200' },
      { text: 'zet de mode van de vibe op vibrato', note: 'schakelaars mogen op naam' },
      { text: 'pan de stemmen van links naar rechts', note: 'verdeelt de mixerkanalen over het stereobeeld' },
      { text: 'spreid de stemmen over 50% van het stereobeeld' },
    ],
  },
  {
    title: 'Weghalen en verplaatsen',
    intro: 'Weghalen verbindt de audio door en neemt modulatie mee die alleen die module stuurde. Verplaatsen verandert alleen de volgorde in het rack, niet het geluid.',
    examples: [
      { text: 'haal de vca weg' },
      { text: 'wissel de vibe en de out om' },
      { text: 'zet de vibe voor de out' },
      { text: 'verplaats de out naar achter de vibe' },
    ],
  },
  {
    title: 'Uitleg en demonstratie',
    intro: 'Een vraag die met "hoe", "wat is" of "laat zien" begint wordt een demonstratie: de patch bouwt zich stap voor stap op met uitleg.',
    examples: [
      { text: 'hoe maak ik vibrato?' },
      { text: 'laat polyfonie zien' },
      { text: 'wat is een filter-envelope?' },
    ],
  },
];

export const HELP_TIPS: string[] = [
  'Terwijl je typt zie je wat de editor ervan begrijpt; woorden die hij niet kent staan onder "niet begrepen".',
  'Enter voert uit. Ctrl+Z (buiten het invoerveld) of ↶ draait het terug, ook als de AI iets deed.',
  '✨ AI vertaalt vrije zinnen die de editor zelf niet snapt. Je ziet altijd eerst een voorstel; pas Toepassen verandert iets.',
  'Modulenamen: vco, wavetable, morph, fm, dx7, plaits, rings, elements, string, stk, sampler, vcf, ladder/moog, ms20/korg, comb, phaser, tape, echo, galm/dattorro, plaat/veer, chorus, vibe, tremolo, diode/fet/opto/bus/vari-mu compressor, para/console/program eq, …',
];
