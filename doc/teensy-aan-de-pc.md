# De Teensy aan de pc — horen, flashen, SD-kaart

> Het spiekbriefje voor de dingen die elke keer weer vergeten worden.
> Windows 11, Teensy 4.1 met de MusicBrain-firmware (`USB_MIDI_AUDIO_SERIAL`).

## 1. De Teensy horen

De firmware heeft maar één audio-uitgang: **USB**. Geen DAC, geen audio
shield, geen jack. Voor Windows is de Teensy daardoor een **microfoon** — hij
staat onder *Recording*, niet onder *Playback* — en een microfoon speelt
Windows nooit vanzelf af.

Zie je in *Recording* het groene VU-metertje bewegen maar hoor je niets, dan
werkt de Teensy prima en ontbreekt alleen de doorluister-route:

1. Rechtsklik op het luidsprekertje → **Sound settings** → **More sound
   settings** (of `mmsys.cpl` via Win+R).
2. Tabblad **Recording** → **Digital Audio Interface** (*Teensy MIDI/Audio*)
   selecteren → **Properties**.
3. Tabblad **Listen** → ✓ **Listen to this device**.
4. **Playback through this device**: je speakers of koptelefoon **expliciet**
   kiezen — niet *Default Playback Device* (zie de valkuil) → **OK**.

### De valkuil: de Teensy als standaard-afspeelapparaat

De Teensy is óók een afspeelapparaat (de pc kan audio naar hem sturen), en
Windows maakt een net ingeplugde USB-geluidskaart graag stilletjes de
standaard. Dan gaat al het geluid van de pc de Teensy in — en de
doorluister-route ook, als die op *Default* staat. Resultaat: je hoort
helemaal niets, nergens.

Controle: tabblad **Playback**. Staat de Teensy daar met het groene vinkje,
kies je speakers/koptelefoon → **Set Default**.

### Om te spelen in plaats van te testen

*Listen to this device* voegt tientallen milliseconden vertraging toe. Om
echt te spelen: een DAW of Audacity met de Teensy als ingang en monitoring
aan. Zet dan *Listen* weer uit, anders hoor je hem dubbel.

## 2. Flashen, en weten dat het gelukt is

```bash
cd firmware/app-modular-brain
../../.venv/Scripts/pio run -t upload
```

- **Bump eerst `FW_VERSION`** in `src/FwVersion.h` en dump het contract
  (`python tools/contract_dump.py`), anders weet je achteraf niet welk beeld
  er draait.
- **De editor mag niet verbonden zijn.** Een open COM-poort blokkeert de
  herstart van de Teensy.
- **SUCCESS betekent niets.** Op deze machine gebruikt PlatformIO de
  teensy-gui-loader, en die meldt SUCCESS zodra hij *opent* — niet zodra het
  beeld erin staat. De enige echte bevestiging is de Teensy zelf vragen welke
  versie hij draait: stuur `{"type":"hello"}` over de COM-poort (115200) en
  kijk naar `"version"` in het antwoord.
- Tag het: `git tag -a fw-X.Y.Z`.

## 3. De SD-kaart (voor de sampler)

Samples gaan **niet** over de kabel — alleen DX7-banken doen dat. Een
samplebank moet op een SD-kaart.

- De firmware gebruikt het **ingebouwde microSD-slot van de Teensy 4.1**
  (`SD.begin(BUILTIN_SDCARD)`), aan de onderkant van de Teensy. Een
  SD-socket op een proto board doet niet mee.
- **FAT32.** Kaart erin, Teensy aan: de firmware maakt `/mmb/banks` zelf aan.
- Banken als `/mmb/banks/00.mmbs` t/m `15.mmbs`; de **Bank**-knop kiest het
  nummer. Een `.mmbs` maak je in de editor met 🎹 **Multisample-import**.
- **Geheugen:** zonder PSRAM (de twee vierkante footprints op de onderkant)
  gaat de bank naar de gewone heap, en daar is ~269 kB vrij: zo'n 3 seconden
  mono 44,1 kHz. Met PSRAM 8 of 16 MB.
- Werkt het niet, dan zegt de seriële log precies wat: `niet gevonden`,
  `ongeldige bank`, `data te kort` of `geen geheugen voor N KB`.
