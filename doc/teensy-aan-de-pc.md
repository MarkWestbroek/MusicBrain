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

### Teensy en simulator naast elkaar horen

In de editor, tab **Simulatie** → **⇄ Vergelijk met Teensy**: de Teensy komt in
je linkeroor, de simulator in je rechter. De browser opent de Teensy daarvoor
zelf als ingang (hij vraagt één keer toestemming voor "microfoon" — dat is de
Teensy), dus zet dan *Listen to this device* in Windows **uit**, anders hoor je
hem er nog eens in het midden bij. Een paar tientallen ms verschil tussen
beide kanten is normaal: klank vergelijken gaat prima, fase niet.

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
  (`SD.begin(BUILTIN_SDCARD)`): het metalen sleufje aan de korte kant,
  tegenover de USB-aansluiting. Kaart erin met de gouden contacten naar de
  print. Een SD-socket op een proto board doet niet mee.
- **FAT32 of exFAT, allebei goed.** De SD-bibliotheek van Teensyduino (1.60,
  `SdFs`) leest op de Teensy 4.1 FAT16, FAT32 en exFAT. Een kaart van 64 GB
  of groter komt als exFAT uit de fabriek en hoeft dus niet opnieuw
  geformatteerd.
- **De kaart wordt alleen bij het opstarten gelezen.** Kaart erin, dan de
  Teensy herstarten (USB eruit en erin). De firmware maakt `/mmb/banks` zelf
  aan — staat die map daarna op de kaart, dan heeft de Teensy hem gelezen én
  beschreven. Dat is meteen de controle: de firmware meldt het verder nergens.
- Banken als `/mmb/banks/00.mmbs` t/m `15.mmbs`; de **Bank**-knop kiest het
  nummer. Een `.mmbs` maak je in de editor met 🎹 **Multisample-import**.
- **Geheugen:** zonder PSRAM (de twee vierkante footprints op de onderkant)
  gaat de bank naar de gewone heap, en daar is ~269 kB vrij: zo'n 3 seconden
  mono 44,1 kHz. Met PSRAM 8 of 16 MB.
- Werkt het niet, dan zegt de seriële log precies wat: `niet gevonden`,
  `ongeldige bank`, `data te kort` of `geen geheugen voor N KB`.
- **Bank sturen zonder de kaart eruit te halen (sinds fw 0.5.67):** in
  🎹 Multisample staat naast "⤓ .mmbs opslaan" de knop **⤒ naar Teensy** met
  een bankkeuze; de Teensy-link moet verbonden zijn. Vanaf de commandoregel:
  `.venv/Scripts/python tools/teensy-live/bank_put.py <bestand.mmbs> <bank>`
  (`--list` toont wat er op de kaart staat, `--delete <bank>` haalt er een
  weg). Snelheid ~2–12 MB/s; een bank van 60 MB is er in een paar seconden.
- **Grote banken (sinds fw 0.5.66):** past een bank niet in PSRAM, dan
  **streamt** hij: elk sample houdt een kop (standaard 0,5 s) in PSRAM en de
  rest komt tijdens het spelen van de kaart. De log zegt `streamt` en met
  welke kop. Wil je testen of dat schoon gaat: `{"type":"samplerHead","ms":20,
  "force":true}` dwingt streamen af (ook voor een kleine bank), de status
  toont `smp.under` (frames te laat; hoort 0 te zijn) en `smp.maxUs`
  (traagste leesbeurt). `{"type":"samplerHead","ms":500}` zet het terug. De
  zelftest `{"type":"selfTest","bank":0,"stream":true,"headMs":20}` speelt
  resident en gestreamd en vergelijkt sample-exact (`diffs` hoort 0 te zijn).
  Gemeten: 8 stemmen op +2 octaaf (4× leestempo) zonder underruns.

## 4. Zelf testen zonder handen (noten sturen en opnemen)

`tools/teensy-live/teensy_live.py` speelt de noten uit een Teensy-log van de
editor na (met hun timing), neemt tegelijk de USB-audio van de Teensy op en
meet: piek, breuken in de golfvorm (tikken), gaten van nullen, en de
USB-wachtrij (`usbQ` in het status-bericht, zie hieronder).

```bash
# eenmalig
.venv/Scripts/pip install sounddevice numpy
# config-payload van een seed-patch, precies zoals de editor hem stuurt
cd editor && MMB_DUMP_CONFIG=../cfg.json MMB_SEED=sampler-wah \
  npx vitest run src/modular-mb/dumpConfig.test.ts && cd ..
# pushen, filter op MS-20, noten uit het nieuwste log in Downloads, 14 s
.venv/Scripts/python tools/teensy-live/teensy_live.py --cfg cfg.json \
    --poke filter=2 --poke q=0.55 --secs 14 --wav uit.wav
```

Zonder `--cfg` speelt hij op wat er al op de Teensy staat. De editor-link
moet dicht zijn. MIDI gaat via winmm, dus alleen Windows.

**`usbQ` in de status** (sinds fw 0.5.56, per statusvenster):
`over` = blokken die de core weggooide (een sprong in de golfvorm), `under`
= cycli met een lege wachtrij (de pc kreeg nullen), `fillMin/fillMax` =
vulling vlak vóór een nieuw blok (hoort 52–96 te zijn), `paced`/`free` =
cycli gestart door de USB-wachtrij resp. vrij op 2902 µs (geen opname open).
`over` en `under` horen 0 te zijn.

**Met en zonder vergelijken:** neem twee keer dezelfde noten op (één met
`--poke bypass=1`) en vergelijk ze met `tools/teensy-live/compare_ab.py
bypass.wav effect.wav`: die lijnt ze uit en geeft de helling uit/in (1 = geen
compressie) en hoeveel luide en zachte stukken veranderen. Let op: een
config-push met dezelfde module-id hergebruikt de instantie, dus poke
`bypass=0` expliciet als een eerdere run hem aanzette. En de eerste run na
het flashen laadt de sampler zijn bank nog van de SD: doe eerst een korte
opwarmrun voordat je een referentie opneemt.
