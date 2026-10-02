# Tube: buizenoverdrive in twee standen (2026-10-02)

**Status:** module `tp_mmb_tube` gebouwd en gemeten in wasm en C++ (vier samplefrequenties); de Teensy-build slaagt. Nog niet beluisterd en niet geflasht.
**Aanleiding:** Marks vraag "hebben we al een buizenoverdrive?"; antwoord "beide" op de keuze tussen een gitaarversterker en een studiobuis.

## Wat een buis anders doet

- **Asymmetrisch.** Boven nul gaat er roosterstroom lopen en rondt de top zacht af; richting cutoff neemt de versterking geleidelijk af. Dat geeft even boventonen naast de oneven.
- **Blocking.** De roosterstroom laadt de koppelcondensator op (~20 ms) en het werkpunt zakt (tot een vast maximum); het lekt in ~80 ms terug. Na een harde aanslag klinkt de volgende noot even anders. Bij een vol vervormde amp hoor je dat vooral als kleur: de tweede trap en de eindtrap drukken het niveauverschil weer dicht.
- **Sag.** In de eindtrap volgt de voeding het niveau en zakt in; het plafond gaat mee omlaag. Harder spelen = eerder clippen en zachter: compressie.

## De twee standen

- **Amp** (gitaarversterker): twee triodetrappen met een kathode-shelf ertussen, de toonstack (Fender ~400 Hz −9 dB / Marshall ~650 Hz −4 dB / Vox ~1 kHz −2 dB met wat extra hoog) met Bass/Mid/Treble, de push-pull-eindtrap met Sag en Presence, en een kastsimulatie (4×12-achtig, uit te zetten).
- **Studio**: één triodetrap met een doorlopend gekromde karakteristiek (vooral de tweede harmonische; de derde komt pas bij verzadiging), nauwelijks roosterstroom, en een uitgangstrafo die het laag iets verzadigt. Het niveau blijft binnen ~4 dB over de hele Drive.

Alle niet-lineaire delen zijn vier keer overbemonsterd. Het droge pad loopt even lang mee (Mix maakt geen kam). Stereo met twee gelijke kanalen; alleen In L speelt op beide kanten.

## Gemeten (220 Hz, 0,3 in)

| | h2 t.o.v. h1 | h3 t.o.v. h1 |
|---|---|---|
| Studio, drive 0 | −32 dB | −51 dB |
| Studio, drive 0,5 | −22 dB | −26 dB |
| Amp, drive 0,5 | −21 dB | −15 dB |

Sag 1 tegen 0 bij volle drive: ~9 dB zachter. Fender heeft het diepste gat rond 400 Hz. Bij ruis van ±4 en alles open blijft de uitgang eindig en binnen ±1.

Demo: **Solo ▾ → 🔥 String + TUBE** (Marshall-stack, drive 0,7).

## Wat ontbreekt

- Luisteren, en vergelijken met een echte versterker of een opname.
- Een eigen kastimpuls (IR) in plaats van de vaste kastsimulatie.
- Flashen.
