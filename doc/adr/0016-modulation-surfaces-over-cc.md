# ADR 0016 – Modulatievlakken praten CC, ook als het geen MIDI is

## Status
Proposed (2026-09-06)

## Context

We wilden tijdens het spelen kunnen moduleren zonder eerst hardware te
bouwen. Onderzocht is wat er al op tafel ligt.

Een trackpad levert geen ruwe multitouch: de browser ziet een muisaanwijzer,
en losse vingers komen er niet uit. Wat wel bruikbaar is, is twee-vinger
scroll en pinch, en dat werkt zonder te klikken terwijl de andere hand
speelt. Een Wacom geeft in penstand druk, kanteling en absolute positie, maar
een pen vasthouden tijdens het spelen is onhandig; in aanraakstand gedraagt
het tablet zich als een grote trackpad. Een telefoon is het enige apparaat
dat zonder omwegen meerdere vingers tegelijk doorgeeft.

Een telefoon heeft wel een verbinding nodig. De opties waren een eigen app,
of een webpagina met een doorgeefluik. De eerste kost een
ontwikkelaarsaccount, een installatieronde per wijziging en twee codebases.

Daarnaast speelt dat de snaarbank een proeflab is. Wat hier werkt moet
uiteindelijk landen als modulator-tab in de MusicBrain-editor, die
bewegingen van telefoon of Wacom omzet in CC op uitgaande poorten.

## Decision

- **Bedieningsvlakken zijn webpagina's, geen apps.** Geen installatie, één
  codebase, en ze draaien op iOS en Android.
- **Over de verbinding gaan MIDI-CC-vormige berichten**: een nummer en een
  waarde van 0 tot 1, ook al is de drager een websocket.
- **Het vlak blijft dom.** Het stuurt genummerde assen. De routering van as
  naar parameter staat bij de host, op het grote scherm.
- **De host stuurt de gekozen bestemmingsnamen terug**, zodat het vlak op
  zijn eigen scherm kan tonen wat elke as doet en waar hij staat.
- **Elk vlak krijgt bij aanmelden een eigen CC-bereik**, vanaf CC 40, zes
  nummers per vlak. De Elements-firmware gebruikt niets boven CC 32.
- **Het doorgeefluik zit in de Vite-dev-server** als plugin, en de client is
  één bestand zonder afhankelijkheden.

## Consequences

- De drager kan later een echte virtuele MIDI-poort op de Mac worden zonder
  dat de pagina's veranderen. De ontvangende kant leest dan dezelfde nummers
  binnen via Web MIDI, en andere programma's kunnen meeluisteren.
- Een modulator-tab in de editor hergebruikt `editor/public/modlink.js`
  ongewijzigd. Wat daar nog bij komt is een keuze van uitgaande poort per
  bestemming.
- Meerdere vlakken tegelijk volgt vanzelf uit de nummering, zonder dat een
  toestel hoeft te weten dat er anderen zijn.
- Waardes zijn 0 tot 1 in plaats van 7-bits. Dat is fijner voor een
  aanraakvlak, maar bij de overgang naar echte MIDI verliezen we resolutie.
  Wie dat erg vindt moet dan naar 14-bits CC of een ander bericht.
- Zolang het doorgeefluik in de dev-server zit, werken vlakken op afstand
  alleen als die draait. Een gebouwde site heeft ze niet.
- Kanteling van het toestel blijft voorlopig buiten beeld: die vraagt een
  beveiligde verbinding op iOS.

## Zie ook

- [`editor/modlink/README.md`](../../editor/modlink/README.md) — het protocol
- [`doc/snaarbank-testlab.md`](../snaarbank-testlab.md) — het proeflab
