# Firmware beschikbaar stellen

Datum: 2026-09-25. Tickets: **ED-FW-DIST-1** (bouwen en publiceren),
**ED-FW-DIST-2** (downloaden vanuit de editor), **ED-FW-DIST-3** (flashen
vanuit de browser, alleen uitgeschreven).

## Doel

Iemand die een Teensy wil proberen moet de firmware kunnen installeren zonder
het git-project, PlatformIO of een compiler. Eén bestand downloaden, één
programma om het op de Teensy te zetten.

## Hoe het werkt

```
git tag fw-0.5.79 && git push --tags
        │
        ▼
GitHub Action "Firmware release" (.github/workflows/firmware-release.yml)
  1. controleert dat de tag gelijk is aan FW_VERSION in FwVersion.h
  2. bouwt met PlatformIO (env teensy41)
  3. zet mmb-fw-0.5.79.hex als bijlage aan de release "Firmware 0.5.79",
     met het blok "### fw 0.5.79" uit doc/RELEASE-LOG.md als notes
        │
        ▼
editor.musicbrain.nl → Teensy → Firmware
  vraagt de releases op bij de GitHub-API (openbaar repo, geen token),
  toont de nieuwste met een downloadknop, en waarschuwt als de verbonden
  Teensy een oudere versie meldt (het hello-bericht bevat FW_VERSION)
        │
        ▼
Teensy Loader van PJRC: .hex openen, knopje op de Teensy, klaar
```

- **De tag is de knop.** Taggen zoals nu (`fw-X.Y.Z`); de workflow doet de rest.
  Een tag die niet bij `FW_VERSION` past breekt af, zodat er nooit een
  release met een verkeerd versienummer ontstaat.
- **Tags van vóór de workflow** (bijv. `fw-0.5.78`): Actions → *Firmware
  release* → *Run workflow*, met de tag als invoer. Opnieuw draaien vervangt de
  bijlage.
- **Geen VPS nodig.** Het bestand staat op GitHub; de editor linkt er direct
  naartoe. De GitHub-API mag vanuit elke website gelezen worden (CORS `*`),
  maximaal 60 keer per uur per IP; de editor bewaart het antwoord een uur.
- **Wat iemand verder nodig heeft:** een Teensy 4.1 met PSRAM-chip (sampler en
  echo's gebruiken die) en voor de sampler een SD-kaart. Banken kunnen vanuit
  de editor naar de kaart (🎹 Multisample → naar Teensy).

## Bestanden

- `.github/workflows/firmware-release.yml` — bouwen en publiceren.
- `editor/src/modular-mb/firmwareRelease.ts` — releases ophalen, versies vergelijken (+ test).
- `editor/src/modular-mb/FirmwarePanel.tsx` — paneel in het Teensy-venster.

## ED-FW-DIST-3: flashen vanuit de browser (idee, niet gebouwd)

Het kan ook zonder Teensy Loader: één knop "Firmware op de Teensy zetten" in
de editor.

- **Protocol.** De bootloader van de Teensy (HalfKay) is een USB-HID-apparaat
  (vendor 0x16C0, product 0x0478). Flashen is: het .hex-bestand parsen, per
  blok van 1024 bytes een HID-rapport sturen met het adres ervoor, en tot slot
  een reboot-rapport. De open-source `teensy_loader_cli` van PJRC laat precies
  zien hoe (inclusief de Teensy 4.1-blokgrootte en het wissen van het eerste
  blok).
- **In de browser** kan dat met **WebHID** (Chrome en Edge, niet Firefox of
  Safari). De gebruiker kiest het apparaat één keer in een browserdialoog.
- **In de bootloader komen.** Het knopje op de Teensy werkt altijd. Zonder
  knop: de Teensy-firmware kent de "134 baud"-truc (seriële poort op 134 baud
  openen = herstart naar de bootloader). Of Web Serial 134 baud accepteert moet
  getest worden; anders een eigen `{"type":"bootloader"}`-bericht in de
  firmware dat `_reboot_Teensyduino_()` aanroept.
- **Risico's.** Een onderbroken flash laat de Teensy in de bootloader staan;
  dat is onschuldig (opnieuw flashen kan altijd), maar de UI moet het uitleggen.
  De .hex moet de browser zelf kunnen lezen: GitHub-bijlagen hebben geen CORS,
  dus de workflow moet het bestand ook op de editor-server zetten (zoals de
  banken via `banks.json`), of de editor gebruikt een bestand dat de
  gebruiker eerst downloadt en dan kiest.
- **Inschatting.** Ongeveer een dag, plus testen op Windows, macOS en Linux
  (WebHID-rechten verschillen per systeem; op Linux is een udev-regel nodig).
