# Percuter: acht 8-bit drumkanalen naar de Dynacord Percuter (2026-10-02)

**Status:** module `tp_mmb_percuter` gebouwd en getest met zelfgemaakte cartridges; nog geen echte cartridge-dumps, niet beluisterd, niet geflasht.
**Aanleiding:** Mark heeft een echte Percuter en wil het lo-fi-karakter van de digitale samples terug.

## Het apparaat

Dynacord Percuter (1984), "8 track digital drum computer". Uit de handleiding (Bedienungsanleitung, 1984) en de pagina van Ewan Colsell over vervangende cartridges:

- Acht kanalen met elk een cartridge ("Steckmodul"): een EPROM van 8 KB (2764) of 16 KB (27128, of twee 2764's) met **kale 8-bit unsigned PCM, mono, zonder kop**.
- Afgespeeld op **12,5 of 25 kHz** (een soldeerbrug op de cartridge), met een eenvoudig filter (laagdoorlaat en de-emphasis) en een keuze uit drie vervaltijden, ook met bruggen op de cartridge.
- Per kanaal: triggeringang (pad, trigger-mic, sequencer, voetschakelaar) met gevoeligheidsknop, een knop die volume (mono) of panorama (stereo) is, en een eigen uitgang die niet van die knop afhangt.
- Globaal: stemming (in het midden gekalibreerd), pitchpedaal (FR 4), multitrigger in/uit voor een sequencer (Big Brain), stereo-som en koptelefoon.

## De module

Kern `firmware/lib/mmb-dsp/mmb_dsp/percuter.h`. Kanaal k speelt slot k van een gewone samplebank (`.mmbs`), dus dezelfde bankknop, SD-kaart (`/mmb/banks/NN.mmbs`), upload en bankbalk als de SAMPLER. Het karakter zit in het afspelen:

- **geen interpolatie** (zero-order hold) op de samplefrequentie van de cartridge, zodat de spiegeltonen boven de halve samplefrequentie hoorbaar blijven;
- **8 bit**: ook als de bank 16-bit materiaal bevat, valt de onderste byte weg;
- de **toonhoogte is de afspeelklok**: hoger stemmen maakt het geluid ook korter;
- **Filter** aan: een eenpolig laagdoorlaatfilter op ~0,3 maal de afspeelfrequentie (de de-emphasis); uit: rauw.

Per kanaal: Trig, Vel (los = volle aanslag), volume, pan, verval (1 = het hele sample), stemming, en een losse uitgang. Globaal: bank, stemming, pitchpedaal (V/Oct), filter, volume.

## Cartridges omzetten

```powershell
node tools/mmb-wasm/percuter-to-mmbs.mjs --name "Percuter rock" --rate 25000 `
     kick.bin snare.bin hat.bin@12500 -o editor/public/banks/percuter-rock.mmbs
```

Elk `.bin` (een EPROM-dump) wordt een slot, in de volgorde van de opdrachtregel; `@12500` geeft een cartridge zijn eigen samplefrequentie. De lege staart van de EPROM (0xFF/0x00) gaat eraf. De bank speelt ook in de SAMPLER: slot k ligt op MIDI-noot 36 + k.

Bronnen voor dumps: de sample-archieven van kb6.de (na een donatie), of de eigen cartridges uitlezen met een EPROM-lezer. De vervangende cartridges van Ewan Colsell bevatten geen dumps.

## Open

1. Echte cartridges omzetten en luisteren; de samplefrequentie per cartridge vastleggen (de brug op de cartridge).
2. Een demopatch met een echte bank (bijvoorbeeld de RHYTHM of EUCLID op de triggers).
3. Flashen en CPU meten (acht kanalen zijn licht).
4. Op de Teensy deelt de Percuter de bank met de sampler en de tape strip: één bank tegelijk.
