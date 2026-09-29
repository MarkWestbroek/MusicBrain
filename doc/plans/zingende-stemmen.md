# Zingende stemmen — woorden zingen met PSOLA (2026-09-29)

Aanleiding: de koorbank van de sampler is mooi, maar zingt alleen "aah". We
willen dat de brain **woorden** kan zingen: verstaanbaar, Nederlands, op de
noten die je speelt. Dit stuk zet op een rij wat er al is, waarom we voor
PSOLA kiezen, hoe het formaat en de module eruitzien, en in welke stappen we
het bouwen.

## 1. Wat er al is (sinds fw 0.5.90/0.5.91)

| Wat | Hoe | Oordeel |
|---|---|---|
| Plaits engine 15 (Speech) | LPC-woordbanken uit TI-ROM's, SAM, formantklinkers | "Fitter Happier": Amerikaans, matig verstaanbaar |
| Warps-vocoder + AUDIO IN | je eigen stem als modulator, koor als drager | goed en live, maar iemand moet meezingen |
| Warps-vocoder + Plaits Speech | seed "Koor zingt woorden" | leuk, maar dezelfde Amerikaanse woorden |

Geen van de drie zingt een zelfgekozen Nederlands woord uit zichzelf.

## 2. Waarom PSOLA

Afgewogen (zie ook het gesprek van 2026-09-29):

| Techniek | Verstaanbaar | Eigen stem, NL | Geheugen/s | Teensy |
|---|---|---|---|---|
| Formantsynthese (Klatt) | matig | regels per taal, handwerk | ~0 | ja |
| LPC op eigen opnames | redelijk, robotkleur | ja | 1–2 KB | ja |
| Bandvocoder met opgeslagen envelopes | matig | ja | 1 KB | ja |
| **PSOLA op eigen opnames** | **goed: het ís de opname** | **ja** | 44 KB (22 kHz) | ja, licht |
| WORLD-vocoder | goed | ja | ~8 KB | krap (FFT per frame) |
| Neuraal (Piper e.d.) | zeer goed | ja | audio | nee — alleen als woordfabriek |

**PSOLA** (*Pitch-Synchronous Overlap-Add*, de techniek van Praat en de
vroege zangsynthesizers) knipt de opname in korte, gevensterde stukjes
(*grains*) van twee stemperioden, elk gecentreerd op een **pitch mark** (het
moment dat de stembanden sluiten). Die grains plak je weer achter elkaar:

- op een **andere afstand** → andere toonhoogte, zelfde klinkerkleur (de
  formanten zitten ín de grain en schuiven niet mee);
- **dezelfde grain vaker** → de klinker duurt langer (aanhouden zolang de
  toets ingedrukt is);
- de grain **sneller of trager uitlezen** → formanten omhoog of omlaag
  (kinderstem ↔ reus), los van de toonhoogte.

Stemloze klanken (s, f, t, k) hebben geen periode; die spelen ongewijzigd
door. Bereik: ruwweg een octaaf omhoog en omlaag rond de gesproken
toonhoogte klinkt natuurlijk; daarbuiten wordt het een effect.

Rekenwerk: per stem een handvol overlappende grains, elk één
vermenigvuldiging per sample. Verwaarloosbaar naast Plaits of de SID.

## 3. De keten

```
 tekst ──► Piper (VPS) ─┐
                        ├─► wav ─► analyse (editor) ─► .mmbl ─► ZANG-module
 microfoon (editor) ────┘          pitch marks,                  (wasm + Teensy)
                                   lettergrepen,
                                   klinkerkern
```

- **Opnemen** kan met de microfoon (AUDIO IN staat er al) of door tekst te
  laten inspreken (§6).
- **Analyse** gebeurt één keer, in de editor. De firmware krijgt alleen het
  resultaat en hoeft geen toonhoogte te schatten.
- **Afspelen** doet de module ZANG, met dezelfde kern in wasm en firmware.

## 4. Analyse (editor, TypeScript)

Per opname (mono, omgezet naar 22 050 Hz):

1. **Toonhoogte per frame** (10 ms): genormaliseerde autocorrelatie met
   parabolische verfijning, zoekbereik 70–500 Hz; stemhebbend als de piek
   boven 0,45 komt en het frame genoeg energie heeft. Mediaanfilter over vijf
   frames tegen octaafsprongen.
2. **Pitch marks.** In stemhebbende stukken: begin bij het sterkste
   (negatieve of positieve, de polariteit met de grootste pieken) sample en
   loop beide kanten op in stappen van de lokale periode, telkens bijgestuurd
   naar de sterkste piek binnen ±20 % van de verwachte plek. In stemloze
   stukken: een mark elke 5 ms, met de vlag *stemloos*.
3. **Lettergrepen.** Energie-omhullende (20 ms) → dalen tussen de pieken zijn
   grenzen; stiltes langer dan 120 ms scheiden woorden. De gebruiker kan de
   grenzen in de editor verschuiven.
4. **Klinkerkern** per lettergreep: het langste stemhebbende stuk waar de
   energie boven 50 % van de lettergreeppiek blijft; daarbinnen de middelste
   60 % als aanhoudgebied (`sustainStart`/`sustainEnd`, in marks).
5. **Gesproken toonhoogte** per lettergreep (mediaan), zodat de module weet
   hoever hij van huis is.

## 5. Bestandsformaat `.mmbl` (lyric-bank)

Zelfde familie als `.mmbs` (vierde letter = soort, gelijk aan de vierde
magic-byte). Little-endian, 4-byte uitgelijnd, zonder parser te lezen:

```
char    magic[4]      "MMBL"
uint32  version       1
uint32  numSyllables
uint32  numMarks      totaal, over alle lettergrepen
float   rate          22050
char    name[28]
SylRec  syl[numSyllables]        (40 bytes elk)
uint32  marks[numMarks]          frame-index binnen de lettergreep;
                                 bit 31 = stemloos
int16   data[...]                alle lettergrepen achter elkaar, mono
```

```
struct SylRec {
    uint32 frameOffset, frames;       // in het datablok
    uint32 markOffset, numMarks;      // in de marks-tabel
    uint32 sustainStart, sustainEnd;  // mark-indexen (klinkerkern)
    float  pitchHz;                   // gesproken toonhoogte (mediaan)
    uint8  flags;                     // bit 0 = laatste lettergreep van een woord
    uint8  pad[3];
    char   text[8];                   // "zon", "ne" — voor het display
};
```

Geheugen: 22 kHz mono = 44 KB per seconde; een lettergreep van 0,35 s is
15 KB, tweehonderd lettergrepen 3 MB. Dat past ruim in PSRAM. Marks kosten
4 bytes per periode, ~1 % erbij.

## 6. Spraak maken: Piper

**Piper** is een open neuraal tekst-naar-spraaksysteem, gemaakt voor Home
Assistant. Het werkt in twee stappen: eSpeak-NG zet tekst om in fonemen (met
de uitspraakregels van de taal), en een VITS-model (één ONNX-bestand per
stem, 20–60 MB) maakt daar in één keer audio van, 16 of 22 kHz. Het draait
sneller dan realtime op een Raspberry Pi 4; een GPU is niet nodig.

- **Nederlandse stemmen** bestaan, voor nl_NL en nl_BE, in de kwaliteiten
  *x_low*, *low* en *medium*.
- **Licenties.** De oorspronkelijke `rhasspy/piper` was MIT en is op
  2025-10-06 gearchiveerd; de opvolger `OHF-Voice/piper1-gpl` is GPL-3.0, en
  eSpeak-NG is dat ook. Elke stem heeft een eigen licentie (MODEL_CARD);
  vóór gebruik per stem nakijken.
- **Waar draait het.** Als losse dienst op de VPS, naast de AI-proxy: de
  editor stuurt tekst, krijgt een wav terug. Een apart programma aanroepen
  maakt MusicBrain zelf niet GPL, en de gemaakte audio valt niet onder de
  GPL. In de browser kan het ook (er bestaan wasm-builds met
  onnxruntime-web), maar dan leveren we GPL-code mee met de editor en moet
  de gebruiker tientallen MB's downloaden. Eerst de VPS.
- **Niet realtime, en niet op de Teensy.** Piper is de woordfabriek; zingen
  doet PSOLA.
- **Voor het testen** volstaat de Nederlandse Windows-stem (Frank) of een
  eigen opname; Piper komt in stap 5.

## 7. De module ZANG (`tp_mmb_zang`)

Acht stemmen, zelfde celpatroon als de sampler.

| Dir | poort | soort | betekenis |
|---|---|---|---|
| in | `voct_k`, `gate_k`, `vel_k` | cv/gate | per stem (k = 1..8) |
| in | `syl_cv` | cv | kiest de lettergreep (0..1 over de bank), telt op bij `syl` |
| in | `next` | gate | flank = volgende lettergreep |
| in | `reset` | gate | flank = terug naar `syl` |
| in | `formant_cv` | cv | ± 1 octaaf formantverschuiving |
| out | `out_l`, `out_r` | audio | som van de stemmen |
| out | `syl_out` | cv | huidige lettergreep (0..1), voor displays en sequencers |

| control | bereik | betekenis |
|---|---|---|
| `bank` | 0–15 | `/mmb/lyrics/NN.mmbl` |
| `syl` | 0–255 | beginlettergreep |
| `mode` | 0–2 | 0 = vast (altijd `syl`); 1 = volgende per aanslag; 2 = volgende per aanslag, terug naar `syl` na 2 s stilte |
| `speed` | 0,25–4 | tempo van de medeklinkers en overgangen |
| `formant` | −12..+12 | formantverschuiving in halve tonen |
| `attack`, `release` | ms | omhullende per stem |
| `level` | 0–1 | |

Regels:

- **Een akkoord zingt één lettergreep.** Aanslagen binnen 30 ms van elkaar
  delen de lettergreep; pas de volgende aanslag schuift door.
- **Gate open** → begin van de lettergreep, door tot in de klinkerkern, daar
  heen en weer zolang de gate open blijft. **Gate dicht** → de rest van de
  lettergreep (de slotmedeklinker) speelt uit, daarna release.
- Een lettergreep zonder stemhebbend deel ("sst") speelt één keer af.
- Toonhoogte komt uit V/Oct; de gesproken toonhoogte doet er alleen toe voor
  de kwaliteit (dichtbij = natuurlijker).

## 8. Stappen

**Stand 2026-09-30:** stap 1 tot en met 4 zijn klaar. Stap 1–3 zijn op de
hardware gemeten (fw 0.5.92); het venster 🎤 Zang heeft opnemen, wav's,
lettergrepen intypen, een golfvorm met versleepbare grenzen, en tekst laten
inspreken. De microfoon in de browser werkt (door Mark bevestigd). Van stap 5
draait de dienst lokaal (`tools/piper-tts`), met grenzen uit de
foneemtijden; **uitrollen op de VPS moet nog**. Het venster en de
golfvorm-editor zijn getypecheckt en hun rekenwerk is getest, maar nog niet
in een browser bekeken.

1. **Kern en formaat.** `mmb_dsp/psola.h` (stem + lettergreepspeler),
   `mmb_dsp/lyric_bank.h` (formaat), analyse in TypeScript
   (`editor/src/modular-mb/lyric/`), een commandoregelhulpje dat wav's naar
   `.mmbl` omzet, en tests onder node: toonhoogte van de uitvoer klopt met
   wat gevraagd is, klinker houdt aan, formanten blijven staan.
2. **Wasm + simulator.** `tools/mmb-wasm/zang_wasm.cc`, paneel in
   `seedModules.ts`, bank laden in de worklet, seed "Zingende stem".
3. **Firmware.** `ZangModule.h`, bank van SD naar PSRAM (eigen opslag, los
   van de sampler zodat koor en zang samen in één patch kunnen), upload via
   de link.
4. **Editor-UI.** Opnemen via de microfoon, golfvorm met lettergreepgrenzen
   en klinkerkern, tekst per lettergreep, bank bewaren en sturen.
5. **Piper op de VPS.** Container, eindpunt `POST /tts`, knop "Spreek in"
   in de editor.

## 9. Open punten

- **Lettergreepgrenzen bij eigen opnames.** De energie-methode vindt de
  grens niet als er tussen twee klinkers geen dal zit ("zon-ne": o, n en e
  lopen in elkaar over). Bij ingesproken tekst is dat opgelost (grenzen uit
  de foneemtijden van Piper); bij een eigen opname dwingt de analyse het
  getypte aantal af door de langste lettergreep te splitsen, en sleep je de
  grens zo nodig goed. Echt oplossen vraagt uitlijnen op de tekst (forced
  alignment); een goedkope tussenweg is de eigen opname vergelijken met
  dezelfde tekst uit Piper en diens grenzen meerekken (DTW).
- **Wiebel in korte kernen.** Een klinkerkern waarin de klank snel verandert
  (n → sjwa) klinkt bij heen-en-weer lopen minder stil dan een lange klinker:
  de toonhoogte klopt, de kleur beweegt. Mogelijk alleen het stabielste derde
  aanhouden, of de grains in de kern middelen.

- Bereik: hoe klinkt een mannenstem twee octaven omhoog? Waarschijnlijk wil
  je per bank een hoge en een lage opname. Meten in stap 1.
- Tweeklanken (ui, ei, au) hebben geen stilstaande kern; heen en weer lopen
  over een kort stuk kan gaan "jengelen". Mogelijk alleen het laatste derde
  aanhouden.
- Medeklinkers op de tel: bij zingen valt de klinker op de tel, niet de
  beginmedeklinker. Eventueel een `lead`-instelling die de inzet vervroegt.
- Licentie van de gekozen Piper-stem.
