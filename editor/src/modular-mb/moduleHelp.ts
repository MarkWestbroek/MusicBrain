// Uitleg per module en per knop, voor de help in de speelmodus (? boven het
// front, lang drukken op een knop) — doc/plans/help-en-instrumenttour.md.
//
// Los van de moduledefinities (seedModules.ts): een project bewaart zijn
// eigen kopie van de moduletypen, dus tekst die daarin stond zou in bestaande
// projecten ontbreken. Hier staat hij één keer, voor iedereen. Nederlands en
// Engels (UK) per regel. De module-uitleg ("notes" in de definitie) blijft de
// lange versie; dit is de korte, voor spelers.
//
// moduleHelp.test.ts eist een regel voor elke knop op de fronts van de
// standaardset.

import { getLang } from '../i18n';

type Text = readonly [nl: string, en: string];
export interface ModuleHelp { about: Text; controls: Readonly<Record<string, Text>> }

export const MODULE_HELP: Readonly<Record<string, ModuleHelp>> = {
  tp_mmb_epiano: {
    about: ['Elektrische piano als model van tine (Rhodes) of tong (Wurlitzer) en pickup, zonder samples. Zacht en hard spelen klinkt echt anders.',
            'An electric piano modelled from tine (Rhodes) or reed (Wurlitzer) and pickup, no samples. Soft and hard playing really sound different.'],
    controls: {
      type: ['Tine = Rhodes-kant, rond en glazig; Reed = Wurlitzer-kant, holler en nasaler.', 'Tine = the Rhodes side, round and glassy; Reed = the Wurlitzer side, hollower and more nasal.'],
      timbre: ['Waar de tine voor de pickup staat: laag = dun en glazig (veel octaaf), hoger = vol en rond.', 'Where the tine sits in front of the pickup: low = thin and glassy (lots of octave), higher = full and round.'],
      bell: ['De tik in de aanslag: een hoge, snel wegstervende boventoon.', 'The ping in the attack: a high overtone that dies away quickly.'],
      tremolo: ['Hoe sterk het geluid tussen links en rechts wiegt.', 'How strongly the sound sways between left and right.'],
      trem_rate: ['Hoe snel de tremolo wiegt.', 'How fast the tremolo sways.'],
      drive: ['Hoe dicht de tine bij de pickup staat: meer = blaffen bij hard spelen.', 'How close the tine is to the pickup: more = barking when you play hard.'],
      decay: ['Hoe lang een noot uitklinkt (hoge noten korter, zoals echt).', 'How long a note rings on (higher notes shorter, as on the real thing).'],
    },
  },
  tp_mmb_out: {
    about: ['De uitgang: wat hier binnenkomt hoor je.', 'The output: whatever arrives here is what you hear.'],
    controls: { level: ['Het eindvolume.', 'The final volume.'] },
  },
  tp_mmb_organ: {
    about: ['Tonewheel-orgel met negen trekstangen: 91 toonwielen draaien altijd, een toets tapt er negen af.', 'A tonewheel organ with nine drawbars: 91 tonewheels always spin, a key taps nine of them.'],
    controls: {
      d16: ['Trekstang 16′: een octaaf onder de noot (de sub).', 'Drawbar 16′: an octave below the note (the sub).'],
      d513: ['Trekstang 5⅓′: een kwint boven de 16′.', 'Drawbar 5⅓′: a fifth above the 16′.'],
      d8: ['Trekstang 8′: de grondtoon.', 'Drawbar 8′: the fundamental.'],
      d4: ['Trekstang 4′: een octaaf hoger.', 'Drawbar 4′: an octave up.'],
      d223: ['Trekstang 2⅔′: octaaf plus kwint.', 'Drawbar 2⅔′: an octave and a fifth up.'],
      d2: ['Trekstang 2′: twee octaven hoger.', 'Drawbar 2′: two octaves up.'],
      d135: ['Trekstang 1⅗′: twee octaven plus een terts.', 'Drawbar 1⅗′: two octaves and a third up.'],
      d113: ['Trekstang 1⅓′: twee octaven plus een kwint.', 'Drawbar 1⅓′: two octaves and a fifth up.'],
      d1: ['Trekstang 1′: drie octaven hoger, het fluitje bovenin.', 'Drawbar 1′: three octaves up, the whistle on top.'],
      perc: ['Percussie: een tik op de 2e of 3e harmonische, alleen op de eerste noot van een legato-reeks.', 'Percussion: a click on the 2nd or 3rd harmonic, only on the first note of a legato run.'],
      vib: ['Scanner-vibrato (V1–V3) of chorus (C1–C3, met het droge geluid erbij).', 'Scanner vibrato (V1–V3) or chorus (C1–C3, mixed with the dry sound).'],
      click: ['De key click: de tik van een toets die midden in de golf sluit.', 'The key click: the tick of a key closing in the middle of the wave.'],
    },
  },
  tp_mmb_rotary: {
    about: ['Draaiende luidspreker (Leslie): hoorn en trommel draaien elk in hun eigen tempo.', 'A rotating speaker (Leslie): horn and drum each spin at their own speed.'],
    controls: {
      speed: ['Langzaam of snel; bij het omschakelen hoor je hoorn en trommel opwinden of uitlopen.', 'Slow or fast; when switching you hear horn and drum speed up or slow down.'],
      drive: ['De buizenvoorversterker: meer = warmer en vuiler.', 'The valve preamp: more = warmer and dirtier.'],
    },
  },
  tp_mmb_dx7: {
    about: ['Yamaha DX7: zes-operator-FM met de fabrieksklanken.', 'Yamaha DX7: six-operator FM with the factory sounds.'],
    controls: {
      bank: ['Kiest een van de fabrieksbanken (1A–4B), of USR voor je eigen .syx.', 'Picks one of the factory banks (1A–4B), or USR for your own .syx.'],
      program: ['De klank in de bank (0–31); het display toont de naam.', 'The sound within the bank (0–31); the display shows its name.'],
    },
  },
  tp_mmb_vibe: {
    about: ['Univibe: vier fasetrappen rond één lampje, een scheve, ademende zweving.', 'Uni-Vibe: four phase stages around one lamp, a lopsided, breathing sweep.'],
    controls: {
      speed: ['Hoe snel het lampje knippert.', 'How fast the lamp pulses.'],
      intensity: ['Hoe diep de zweving gaat.', 'How deep the sweep goes.'],
      mode: ['Chorus = droog + nat (het klassieke geluid), Vibrato = alleen nat, Light = zuivere vibrato.', 'Chorus = dry + wet (the classic sound), Vibrato = wet only, Light = clean vibrato.'],
    },
  },
  tp_mmb_tapestrip: {
    about: ['De mechaniek van een Mellotron: per toets een bandje van acht seconden, met wow, flutter en slijtage.', 'The mechanics of a Mellotron: an eight-second tape per key, with wow, flutter and wear.'],
    controls: {
      bank: ['Welke samplebank er op de bandjes staat (fluit, strijkers …).', 'Which sample bank is on the tapes (flute, strings …).'],
      contact: ['Het drukkussen tegen de kop: de opkomst en het dipje in de toon bij het indrukken.', 'The pressure pad against the head: the rise and the little pitch dip when you press.'],
      wow: ['Langzame schommeling in de toonhoogte.', 'Slow wobble in pitch.'],
      flutter: ['Snelle trilling in de toonhoogte.', 'Fast flutter in pitch.'],
      wear: ['Slijtage: bandruis, minder hoog, wat verzadiging.', 'Wear: tape hiss, less treble, some saturation.'],
      motor: ['Hoe ver de motor zakt als je veel toetsen tegelijk speelt.', 'How much the motor slows when you hold many keys.'],
    },
  },
  tp_mmb_ladder: {
    about: ['Moog-stijl ladderfilter: 24 dB laagdoorlaat.', 'A Moog-style ladder filter: 24 dB low-pass.'],
    controls: {
      cutoff: ['De helderheid: tot waar het hoog doorkomt.', 'The brightness: how much treble gets through.'],
      q: ['Resonantie: een piek op de cutoff; hoog gaat hij zingen.', 'Resonance: a peak at the cutoff; turned up high it sings.'],
      drive: ['Hoe hard het filter wordt aangestuurd: meer = vetter en vervormd.', 'How hard the filter is driven: more = fatter and distorted.'],
    },
  },
  tp_mmb_cvmath: {
    about: ['Rekent met besturingssignalen: optellen en versterken.', 'Does sums with control signals: adding and scaling.'],
    controls: {
      gain_a: ['Hoeveel van ingang A meetelt.', 'How much of input A counts.'],
      gain_c: ['Hoeveel van ingang C meetelt (hier vaak de druk of de LFO).', 'How much of input C counts (here often pressure or the LFO).'],
    },
  },
  tp_mmb_bbd_chorus: {
    about: ['Analoge chorus (emmertjesgeheugen): breder en warmer.', 'Analogue bucket-brigade chorus: wider and warmer.'],
    controls: { mix: ['Hoeveel chorus er bij het droge geluid komt.', 'How much chorus is mixed with the dry sound.'] },
  },
  tp_mmb_elements_reverb: {
    about: ['Plaatgalm (uit Mutable Instruments Elements).', 'Plate reverb (from Mutable Instruments Elements).'],
    controls: { amount: ['Hoeveel galm.', 'How much reverb.'] },
  },
  tp_mmb_synthex: {
    about: ['Naar de Elka Synthex: twee oscillatoren per stem door een vierpolig filter, met chorus.', 'After the Elka Synthex: two oscillators per voice through a four-pole filter, with chorus.'],
    controls: {
      freq: ['Filter: de helderheid.', 'Filter: the brightness.'],
      res: ['Filter: de resonantiepiek.', 'Filter: the resonance peak.'],
      env_amt: ['Hoeveel de filter-envelope het filter opent bij elke noot.', 'How much the filter envelope opens the filter on each note.'],
      aa: ['Aanzet van het volume: hoe snel een noot opkomt.', 'Volume attack: how fast a note comes in.'],
      ar: ['Uitklinken van het volume na loslaten.', 'Volume release after you let go.'],
      o2_detune: ['Oscillator 2 iets verstemd: zweving en breedte.', 'Oscillator 2 slightly detuned: beating and width.'],
      chorus: ['De stereochorus.', 'The stereo chorus.'],
    },
  },
  tp_mmb_vco: {
    about: ['Oscillator: de bron van de toon.', 'Oscillator: the source of the tone.'],
    controls: {
      wave: ['De golfvorm: sinus, driehoek, zaag of blok.', 'The waveform: sine, triangle, saw or square.'],
      fm_amt: ['Hoeveel de FM-ingang de toonhoogte moduleert.', 'How much the FM input modulates the pitch.'],
    },
  },
  tp_mmb_vca: {
    about: ['Versterker: regelt het volume.', 'Amplifier: controls the volume.'],
    controls: { gain: ['Het basisvolume; een envelope telt erbij op.', 'The base volume; an envelope adds on top.'] },
  },
  tp_mmb_para_eq: {
    about: ['Parametrische EQ in mixerstijl.', 'A mixing-desk style parametric EQ.'],
    controls: {
      lf_gain: ['Het laag: harder of zachter.', 'The bass: up or down.'],
      lmf_gain: ['Het laag-midden: harder of zachter.', 'The low mids: up or down.'],
    },
  },
  tp_mmb_digital_echo: {
    about: ['Digitale echo van begin jaren tachtig: herhalingen met wat gruis.', 'An early-eighties digital echo: repeats with a bit of grit.'],
    controls: {
      time: ['De tijd tussen de herhalingen.', 'The time between repeats.'],
      feedback: ['Hoeveel herhalingen: hoger = langer.', 'How many repeats: higher = longer.'],
      mix: ['Hoeveel echo er bij het droge geluid komt.', 'How much echo is mixed with the dry sound.'],
    },
  },
  tp_mmb_sid: {
    about: ['De geluidschip van de Commodore 64: drie stemmen en een filter.', 'The Commodore 64 sound chip: three voices and a filter.'],
    controls: {
      cutoff: ['Filter: de helderheid.', 'Filter: the brightness.'],
      res: ['Filter: de resonantie.', 'Filter: the resonance.'],
      pw: ['Pulsbreedte: van hol (smal) tot vol (vierkant).', 'Pulse width: from hollow (narrow) to full (square).'],
      attack: ['Hoe snel een noot opkomt (registerwaarde 0–15).', 'How fast a note comes in (register value 0–15).'],
      decay: ['Hoe snel hij daarna zakt (0–15).', 'How fast it then falls (0–15).'],
    },
  },
  tp_mmb_lfo: {
    about: ['Langzame oscillator voor beweging (vibrato, wah, zweving).', 'A slow oscillator for movement (vibrato, wah, sweep).'],
    controls: {
      rate: ['Hoe snel.', 'How fast.'],
      depth: ['Hoe diep.', 'How deep.'],
    },
  },
  tp_mmb_string: {
    about: ['Getokkelde snaar (Karplus-Strong).', 'A plucked string (Karplus-Strong).'],
    controls: { pluck: ['De aanslag: laag = dof, hoog = helder.', 'The pluck: low = dull, high = bright.'] },
  },
  tp_mmb_tube: {
    about: ['Buizenversterker: warme, asymmetrische vervorming die meeademt met je spel.', 'A valve amp: warm, asymmetric distortion that breathes with your playing.'],
    controls: {
      drive: ['Hoe hard de buizen worden aangestuurd.', 'How hard the valves are driven.'],
      stack: ['De toonregeling: Fender, Marshall of Vox.', 'The tone stack: Fender, Marshall or Vox.'],
      bass: ['Laag.', 'Bass.'],
      mid: ['Midden.', 'Middle.'],
      treble: ['Hoog.', 'Treble.'],
      presence: ['Presence: het allerhoogste, scherpte.', 'Presence: the very top, the bite.'],
    },
  },
  tp_mmb_rings: {
    about: ['Resonator (Mutable Instruments Rings): snaren, klokken en staven die je aanslaat.', 'A resonator (Mutable Instruments Rings): strings, bells and bars you strike.'],
    controls: {
      model: ['Het soort resonator: modaal (klok, marimba), meetrillende snaren, snaar …', 'The kind of resonator: modal (bell, marimba), sympathetic strings, string …'],
      structure: ['Hoe zuiver of vals de boventonen zijn, of hoe de snaren gekoppeld zijn.', 'How pure or inharmonic the overtones are, or how the strings are coupled.'],
      brightness: ['Helderheid.', 'Brightness.'],
      damping: ['Hoe snel hij uitsterft.', 'How quickly it dies away.'],
      position: ['Waar je hem aanslaat: midden = hol, rand = helder.', 'Where you strike it: middle = hollow, edge = bright.'],
    },
  },
  tp_mmb_shimmer: {
    about: ['Galm met een octaaf omhoog in de lus: een glinsterende wolk.', 'Reverb with an octave up in the loop: a shimmering cloud.'],
    controls: {
      shimmer: ['Hoeveel van het verschoven geluid terug de galm in gaat (0 = gewone galm).', 'How much of the shifted sound goes back into the reverb (0 = plain reverb).'],
      size: ['Hoe groot en lang de galm.', 'How big and long the reverb.'],
    },
  },
  tp_mmb_plaits: {
    about: ['Macro-oscillator (Mutable Instruments Plaits): 24 klankmodellen.', 'A macro oscillator (Mutable Instruments Plaits): 24 sound models.'],
    controls: {
      engine: ['Kiest het klankmodel; het display toont de naam.', 'Picks the sound model; the display shows its name.'],
      harmonics: ['Eerste macroknop: per model anders, vaak de boventonen.', 'First macro: different per model, often the overtones.'],
      timbre: ['Tweede macroknop: vaak de helderheid.', 'Second macro: often the brightness.'],
      morph: ['Derde macroknop: vaak de vorm of de mengverhouding.', 'Third macro: often the shape or the blend.'],
      decay: ['Hoe lang een aangeslagen noot uitklinkt.', 'How long a struck note rings on.'],
    },
  },
  tp_mmb_stereo_phaser: {
    about: ['Stereo phaser: draaiende uitsparingen in het spectrum, links en rechts verschoven.', 'Stereo phaser: sweeping notches, offset between left and right.'],
    controls: {
      rate: ['Hoe snel de phaser draait.', 'How fast the phaser sweeps.'],
      depth: ['Hoe diep.', 'How deep.'],
    },
  },
  tp_mmb_complex: {
    about: ['Complex-oscillator (Buchla 259): boventonen uit FM en vouwen in plaats van een filter.', 'A complex oscillator (Buchla 259): overtones from FM and folding instead of a filter.'],
    controls: {
      timbre: ['Hoe ver de golf gevouwen wordt: 0 = zuivere sinus, verder open = meer boventonen.', 'How far the wave is folded: 0 = pure sine, further = more overtones.'],
      fm: ['Hoeveel de tweede oscillator de toonhoogte moduleert.', 'How much the second oscillator modulates the pitch.'],
      symmetry: ['Voegt even boventonen toe.', 'Adds even overtones.'],
    },
  },
  tp_mmb_lpg: {
    about: ['Low-pass gate: filter en volume samen, met het nagloeien van een vactrol.', 'Low-pass gate: filter and volume together, with the after-glow of a vactrol.'],
    controls: {
      offset: ['Hoe ver de gate openstaat zonder aanslag.', 'How far the gate is open without a hit.'],
      decay: ['Hoe lang de vactrol nagloeit: de staart van elke noot.', 'How long the vactrol glows on: the tail of each note.'],
    },
  },
  tp_mmb_slope: {
    about: ['Functiegenerator: stijgen en dalen, als envelope of LFO.', 'A function generator: rise and fall, as an envelope or LFO.'],
    controls: {
      rise: ['Hoe snel hij stijgt.', 'How fast it rises.'],
      fall: ['Hoe snel hij daalt: de lengte van de noot.', 'How fast it falls: the length of the note.'],
    },
  },
  tp_mmb_mixtur: {
    about: ['Trautonium (Mixtur): ondertonen in plaats van boventonen, door vaste formanten.', 'Trautonium (Mixtur): undertones instead of overtones, through fixed formants.'],
    controls: {
      sub1: ['Volume van ondertoon 1.', 'Level of undertone 1.'],
      sub2: ['Volume van ondertoon 2.', 'Level of undertone 2.'],
      sub3: ['Volume van ondertoon 3.', 'Level of undertone 3.'],
      sub4: ['Volume van ondertoon 4.', 'Level of undertone 4.'],
      div1: ['Welke ondertoon: de toon gedeeld door dit getal (2 = octaaf lager, 3 = kwint daaronder …).', 'Which undertone: the pitch divided by this number (2 = an octave down, 3 = a fifth below that …).'],
    },
  },
  tp_mmb_reverb: {
    about: ['Plaat- of veergalm.', 'Plate or spring reverb.'],
    controls: {
      size: ['Hoe lang de galm natrilt.', 'How long the reverb rings on.'],
      mix: ['Hoeveel galm er bij het droge geluid komt.', 'How much reverb is mixed with the dry sound.'],
    },
  },
  tp_mmb_martenot: {
    about: ['Ondes Martenot: een bijna zuivere toon met klankschakelaars die je kunt combineren.', 'Ondes Martenot: a nearly pure tone with timbre switches you can combine.'],
    controls: {
      onde: ['O (onde): de zuivere golf.', 'O (onde): the pure wave.'],
      creux: ['C (creux): hol, alleen oneven boventonen.', 'C (creux): hollow, odd overtones only.'],
      gambe: ['G (gambe): strijkend en rijk.', 'G (gambe): bowed and rich.'],
      nasillard: ['N (nasillard): neuzig.', 'N (nasillard): nasal.'],
      octaviant: ['8 (octaviant): het octaaf erbij.', '8 (octaviant): adds the octave.'],
    },
  },
  tp_mmb_diffuseur: {
    about: ['De luidsprekers van de Ondes Martenot.', 'The loudspeakers of the Ondes Martenot.'],
    controls: {
      type: ['Principal = gewone kast, Palme = twaalf meetrillende snaren, Métallique = een gong als membraan.', 'Principal = plain cabinet, Palme = twelve sympathetic strings, Métallique = a gong as the speaker cone.'],
      mix: ['Hoeveel van de kast er bij het directe geluid komt.', 'How much of the cabinet is mixed with the direct sound.'],
    },
  },
  tp_mmb_cmi: {
    about: ['Fairlight CMI: 32 golfvormen die na elkaar klinken, getekend op PAGE 4.', 'Fairlight CMI: 32 waveforms played one after another, drawn on PAGE 4.'],
    controls: {
      seg: ['Hoe lang elk van de 32 segmenten duurt (DUR op Page 4 rekt of krimpt dat per segment).', 'How long each of the 32 segments lasts (DUR on Page 4 stretches or shrinks it per segment).'],
      smooth: ['0 = hard van golfvorm wisselen (de CMI), hoger = laten overvloeien.', '0 = switch waveforms hard (the CMI), higher = blend them.'],
      loop: ['Zolang je de toets vasthoudt loopt hij vanaf dit segment rond; 32 = op het laatste blijven.', 'While you hold the key it cycles from this segment; 32 = stay on the last one.'],
      attack: ['Hoe snel een noot opkomt.', 'How fast a note comes in.'],
      release: ['Hoe lang hij uitklinkt na loslaten.', 'How long it rings on after you let go.'],
    },
  },
  tp_mmb_arp: {
    about: ['Arpeggiator: speelt de toetsen die je vasthoudt als een reeks.', 'Arpeggiator: plays the keys you hold as a sequence.'],
    controls: {
      mode: ['Volgorde: omhoog, omlaag, heen en weer, willekeurig, of zoals je aansloeg.', 'Order: up, down, up and down, random, or as played.'],
      octaves: ['Over hoeveel octaven de reeks loopt.', 'How many octaves the sequence spans.'],
      tempo: ['Het tempo (volgt ♩ in de werkbalk).', 'The tempo (follows ♩ in the toolbar).'],
    },
  },
  tp_mmb_rhythm: {
    about: ['Ritmebox met de ritmes van de Roland CR-78.', 'A rhythm box with the Roland CR-78 rhythms.'],
    controls: {
      rhythm: ['Kiest het ritme; het display toont de naam.', 'Picks the rhythm; the display shows its name.'],
      variation: ['Maat A, B, of A en B om en om.', 'Bar A, B, or A and B alternating.'],
      tempo: ['Het tempo (volgt ♩ in de werkbalk).', 'The tempo (follows ♩ in the toolbar).'],
      accent: ['Hoe hard de accenten eruit springen.', 'How much the accents stand out.'],
      bass: ['Volume van de basdrum.', 'Bass drum level.'],
      snare: ['Volume van de snare.', 'Snare level.'],
      metal: ['Volume van hihat, cymbal en maracas.', 'Level of hi-hat, cymbal and maracas.'],
      perc: ['Volume van bongo, conga, claves, koebel en rimshot.', 'Level of bongo, conga, claves, cowbell and rimshot.'],
    },
  },
  tp_mmb_pads: {
    about: ['Drukknoppen.', 'Push buttons.'],
    controls: {
      b1: ['Knop 1: hier start en stopt hij de ritmebox.', 'Button 1: here it starts and stops the rhythm box.'],
      b2: ['Knop 2: hier terug naar de één.', 'Button 2: here back to beat one.'],
    },
  },
  tp_mmb_acid: {
    about: ['303-stijl basstem: draai aan Cutoff, Reso en Env mod terwijl hij speelt.', 'A 303-style bass voice: turn Cutoff, Reso and Env mod while it plays.'],
    controls: {
      cutoff: ['Filter: de helderheid.', 'Filter: the brightness.'],
      res: ['Filter: het piepen.', 'Filter: the squelch.'],
      envmod: ['Hoeveel het filter per noot opengaat.', 'How much the filter opens on each note.'],
      decay: ['Hoe snel het filter weer dichtgaat.', 'How quickly the filter closes again.'],
      accent: ['Hoe hard geaccentueerde noten eruit springen.', 'How much accented notes jump out.'],
      wave: ['Zaag of blok.', 'Saw or square.'],
    },
  },
  tp_mmb_clock: {
    about: ['De klok waar alles in de maat op loopt.', 'The clock everything runs in time to.'],
    controls: {
      tempo: ['Het tempo (volgt ♩ in de werkbalk).', 'The tempo (follows ♩ in the toolbar).'],
      swing: ['Swing: elke tweede zestiende later.', 'Swing: every second sixteenth later.'],
    },
  },
  tp_mmb_folder: {
    about: ['Wavefolder: vouwt de golf terug voor boventonen (West Coast).', 'Wavefolder: folds the wave back for overtones (West Coast).'],
    controls: {
      fold: ['Hoe vaak de golf vouwt: meer = helderder.', 'How often the wave folds: more = brighter.'],
      symmetry: ['Schuift de golf opzij: even boventonen erbij.', 'Shifts the wave sideways: adds even overtones.'],
    },
  },
  tp_mmb_morph_wt: {
    about: ['Wavetable-oscillator die vloeiend tussen acht golfvormen schuift.', 'A wavetable oscillator that glides smoothly between eight waveforms.'],
    controls: {
      morph: ['Waar je tussen de acht golfvormen zit.', 'Where you are between the eight waveforms.'],
      wslot: ['Welk frame een getekende golf vervangt.', 'Which frame a drawn wave replaces.'],
      bank: ['De set golfvormen: analoog, stem, harmonischen, digitaal, eigen.', 'The set of waveforms: analogue, vocal, harmonics, digital, user.'],
    },
  },
  tp_mmb_clouds: {
    about: ['Korrelwolk (Mutable Instruments Clouds).', 'A granular cloud (Mutable Instruments Clouds).'],
    controls: {
      position: ['Waar in het geheugen de korrels vandaan komen.', 'Where in the buffer the grains come from.'],
      size: ['Hoe groot de korrels zijn.', 'How big the grains are.'],
    },
  },
  tp_mmb_stages: {
    about: ['Ketting van segmenten: envelope of LFO (Mutable Instruments Stages).', 'A chain of segments: envelope or LFO (Mutable Instruments Stages).'],
    controls: { t1: ['De tijd van het eerste segment: sneller of trager.', 'The time of the first segment: faster or slower.'] },
  },
  tp_mmb_marbles: {
    about: ['Toevalsgenerator die noten en ritme kiest (Mutable Instruments Marbles).', 'A random generator that picks notes and rhythm (Mutable Instruments Marbles).'],
    controls: {
      tempo: ['Het tempo (volgt ♩ in de werkbalk).', 'The tempo (follows ♩ in the toolbar).'],
      bias: ['Of de noten eerder laag of hoog vallen.', 'Whether the notes tend to land low or high.'],
    },
  },
};

const pick = (t: Text): string => (getLang() === 'nl' ? t[0] : t[1]);

/** De korte uitleg van een module, of null. */
export function moduleAbout(typeId: string): string | null {
  const h = MODULE_HELP[typeId];
  return h ? pick(h.about) : null;
}
/** De regel bij een knop, of null. */
export function controlHelp(typeId: string, controlId: string): string | null {
  const t = MODULE_HELP[typeId]?.controls[controlId];
  return t ? pick(t) : null;
}
