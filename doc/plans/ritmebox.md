# Ritmebox: CR-78-presets en de Elka (2026-10-02)

**Status:** module `tp_mmb_rhythm` gebouwd met 15 van de 22 CR-78-ritmes; niet door een mens beluisterd en niet geflasht. Elka-patronen: niet uit de documentatie te halen (§3).
**Aanleiding:** Marks vraag om een ouderwetse ritmebox (de rhumba van Jarre op de Elka X-705) en de CR-78-presets, met de CR-78 Service Notes en de Elka 707/X-707-documentatie als bron.

## 1. De module

`tp_mmb_rhythm` (kern `firmware/lib/mmb-dsp/mmb_dsp/rhythm_box.h`): elf berekende CR-78-stemmen (dezelfde `mmb_dsp::Cr78` als de CR-78-module), een patroontabel met per ritme een A- en een B-maat, variatie A / B / A+B, tempo, start/stop (knop of puls), externe tel met triolen, accent, vier groepsvolumes, en uitgangen voor stap, maat en accent. Demo: **Solo ▾ → 🥁 Ritmebox (CR-78-presets)**.

Een nieuw ritme toevoegen is een regel in de tabel: per instrument een tekst van `x` en `.`. De C++-controle (`tools/mmb-wasm/bitcheck/rhythm_check.cc`) kijkt na dat elke regel precies zo lang is als de maat.

## 2. De CR-78-patronen

Bron: **Roland CR-78 Service Notes, 20 juni 1979, p. 14 "Rhythm patterns"**, in notenschrift op één balk. De legenda op die pagina zet elk instrument op een vaste plek: basdrum onder de balk, lage conga in de ruimte onder de onderste lijn, lage bongo op lijn 1, hoge bongo tussen 1 en 2, snare op lijn 2, rimshot (kruisje) tussen 2 en 3, claves op lijn 3, koebel tussen 3 en 4, maracas op lijn 4, hihat (driehoekje) tussen 4 en 5, cymbal (kruisje) boven de balk. `(>)` is een accent.

Overgenomen met de hand, met een script dat de balklijnen in de scan zoekt en er hulplijnen per instrument over tekent. Zeker: Rock 1–3, Waltz, Shuffle, Slow rock, Swing, Foxtrot, Tango, Boogie, Enka, Bossa nova. **Onzeker:** Rock 4, Disco 1, Disco 2 (dichte zestienden, een paar noten op de grens tussen twee plekken). **Ontbreken:** Samba, Mambo, Cha-cha, Beguine, Rhumba en de zeven fill-ins. Die staan in de scan zo dicht op elkaar dat ik ze niet betrouwbaar lees; een scherpere scan van p. 14 of een luisterbeurt aan een echte CR-78 lost dat op.

Opvallend in de bron: in veel ritmes (Swing, Foxtrot, Boogie, Bossa nova, Disco) speelt de lijn op lijn 4 en dus de **maracas** waar je een hihat zou verwachten. Dat is zo overgenomen.

Foxtrot en Tango zitten op het origineel samen op één knop (A = Foxtrot, B = Tango), net als Mambo/Cha-cha en Beguine/Rhumba. In de module zijn Foxtrot en Tango elk een eigen ritme met A = B.

Stappen: 16 per maat (zestienden) of 12 (triolen in 4/4, of zestienden in de 3/4 van de wals); de stappen staan per tel gegroepeerd.

## 3. De Elka 707 / X-707 (en X-705)

- De gebruiksaanwijzing (Duits) noemt de 16 ritmes en hun knoppen (p. 18): Tango, Marsch, Walzer, Slow rock, Swing, Rhythm & blues, Jazz rock, Shake, Boogie woogie, Afro, Beguine, Samba, Mambo, Rumba, Cha-cha, Bossa nova, plus 16 variaties met de Break-knop. Geen notatie.
- De service manual van de Artist 707 (67 bladen, rhythm unit vanaf blad 54) laat zien hoe het werkt: de ritmeknoppen maken via een diodematrix een binaire code die twee geheugenchips adresseert (IC 4 en 5 op print 410CST0740, Fairchild 31358/31359). Dat zijn **fabrieksgeprogrammeerde ROM's; de inhoud staat niet in de manual.**

De Elka-patronen komen dus alleen uit een ROM-uitlezing (de twee chips uit een werkend exemplaar) of op het gehoor (een opname waarin het ritme vrij staat). Dezelfde tabel in de module kan ze dan opnemen; voor de klank van de Elka-drums is een eigen stemset nodig.

## 4. Open

1. Samba, Mambo, Cha-cha, Beguine, Rhumba en de fill-ins van de CR-78 (scherpere scan of luisteren).
2. Rock 4 en Disco 1/2 controleren.
3. Elka-ritmes: ROM-uitlezing of op het gehoor, en een Elka-stemset.
4. Luisteren en flashen.

## 5. De overgenomen patronen

Zo staan ze in `rhythm_box.h`, per tel gegroepeerd. BD basdrum, LC lage conga, LB/HB lage/hoge bongo, SD snare, RS rimshot, CL claves, CB koebel, MA maracas, HH hihat, CY cymbal, ACC accent.

### Rock 1

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... ..x. x... ....   x... .... x... ....
SD    .... x... .... x...   .... x.x. .... x...
HH    x.x. x.x. x.x. x.x.   x.x. x.x. x.x. x.x.
ACC   x... x... x... x...   x... x... x... x...
```

### Rock 2

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... .... x.x. ....   x.x. ..x. ..x. ....
SD    .... x... .... x...   .... x... .... x...
HH    x.x. x.x. x.x. x.x.   x.x. x.x. x.x. x.x.
ACC   x... x... x... x...   .... x... .... x...
```

### Rock 3

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... .... x.x. ....   x..x ..x. x.x. ...x
SD    .... x..x .... x...   .... x..x .... x...
HH    x.x. x.x. x.x. x.x.   x.x. x.x. x.x. x.x.
ACC   x... x... .... x...   .... x... .... x...
```

### Rock 4 (onzeker)

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... ...x x.x. ....   x.x. ...x x... ...x
SD    .... x... .... x...   .... x..x .... x...
MA    xxxx xxxx xxxx xxxx   xxxx xxxx xxxx xxxx
CY    ..x. .... ..x. ....   ..x. .... ..x. ....
ACC   x... .... x.x. x...   .... x... .... x...
```

### Disco 1 (onzeker)

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... ...x x... ....   x... ...x x... .x..
SD    .... x... .... x...   .... x... .... x...
MA    x.x. x.x. x.x. x.x.   x.x. x.x. x.x. x.x.
CY    ..x. .... .... .x..   ..x. .... .... .x..
ACC   .... x... .... x...   .... x... .... x...
```

### Disco 2 (onzeker)

16 stappen, 4 tellen per maat.

```
      A                     B
BD    .... x... .... x...   .... x... .... x.x.
LC    ..x. ..x. .... ....   ..x. ..x. .... ....
SD    .... x... .... x...   .... x... .... x...
MA    ..x. ..x. ..x. ..x.   ..x. ..x. ..x. ..x.
CY    x... .... .... x...   x... .... .... x...
ACC   .... x... .... x...   .... x... .... x...
```

### Waltz

12 stappen, 3 tellen per maat.

```
      A                     B
BD    x... .... ....        x... .... ....
SD    .... x... x...        .... x... x...
CY    x... .... x...        x... ...x x...
ACC   .... .... x...        .... .... x...
```

### Shuffle

12 stappen, 4 tellen per maat.

```
      A                     B
BD    x.. ..x x.. ...       x.. ... x.. ...
SD    ... x.. ... x..       ..x ..x ..x ..x
CY    x.x x.x x.x x.x       x.x x.x x.x x.x
ACC   x.. x.. x.. x..       x.. x.. x.. x..
```

### Slow rock

12 stappen, 4 tellen per maat.

```
      A                     B
BD    x.. ..x x.. ..x       x.. ..x x.. .xx
SD    ... x.. ... x..       ... x.. ... x..
HH    xxx xxx xxx xxx       xxx xxx xxx xxx
ACC   x.. x.. x.. x..       x.. x.. x.. x..
```

### Swing

12 stappen, 4 tellen per maat.

```
      A                     B
BD    x.. ... x.. ...       x.. ... x.. ...
SD    ... ... ... ...       ... ..x ..x ...
MA    ... x.. ... x..       ... x.. ... x..
CY    x.. ..x x.. ..x       x.. ..x x.. ..x
ACC   x.. x.. x.. x..       x.. ... x.x ...
```

### Foxtrot

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... .... x... ....   x... .... x... ....
SD    .... x... .... x...   .... x... .... x...
MA    x... .... x... ....   x... .... x... ....
CY    .... x... .... x...   .... x... .... x...
ACC   .... .... .... x...   .... .... .... x...
```

### Tango

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... x... x... x.x.   x... x... x... x.x.
SD    x... x... x... x.x.   x... x... x... x.x.
CY    .... .... .... ..x.   .... .... .... ..x.
ACC   .... .... .... ..x.   .... .... .... ..x.
```

### Boogie

12 stappen, 4 tellen per maat.

```
      A                     B
BD    x.. ... x.x ...       x.x ... x.x ...
SD    ... x.. ... x..       ... x.. ... x..
MA    ... ... ..x ...       ..x ..x ..x ..x
CY    x.. x.. x.. x..       x.. x.. x.. x..
ACC   x.. x.. x.. x..       x.. x.. x.. x..
```

### Enka

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x... x... x... x...   x... ..x. x... x...
SD    ..xx ..x. ..xx ..x.   ..xx x... ..x. ..x.
HH    x.x. x.x. x.x. x.x.   x.x. x.x. x.x. x.x.
ACC   x... .... x... ....   .... ..x. x... ....
```

### Bossa nova

16 stappen, 4 tellen per maat.

```
      A                     B
BD    x..x x..x x..x x..x   x..x x..x x..x x..x
RS    x..x ..x. ..x. .x..   x.x. .x.. x.x. .x..
MA    xxxx xxxx xxxx xxxx   xxxx xxxx xxxx xxxx
CY    x... ..x. .... .x..   x... ..x. .... .x..
ACC   .... x... .... x...   .... x... .... x...
```
