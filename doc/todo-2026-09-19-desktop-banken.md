# Todo op de desktop: banken ophalen en de hook aanzetten

> Geschreven 19 september 2026 vanaf de laptop. De grote bestanden staan nu
> online; de desktop moet ze één keer ophalen. Achtergrond en werking:
> [editor-deploy.md](editor-deploy.md). Dit bestand mag weg als het gedaan is.

## Wat er veranderd is

De bestanden die alleen op de laptop stonden, hangen nu als bijlage aan de
GitHub-release **`banks`**: `dx7/roms.bin`, de twee YDP-vleugels en een
Finetales-bank. `editor/banks.json` staat in git en zegt welke er zijn, met
sha256 erbij. De editor draait op editor.musicbrain.nl en werkt bij bij elke
push die `editor/` raakt.

## Doen

```bash
git pull
git config core.hooksPath tools/githooks     # één keer per machine
cd editor && npm run banks
```

- **`git pull`** haalt onder meer `editor/banks.json` en `tools/githooks/`.
- **`core.hooksPath`** zet de hook aan die voortaan zelf `npm run banks` draait
  na een pull die `banks.json` wijzigt. Hooks gaan niet mee in git en deze
  instelling ook niet, dus dit is per machine. Het script zelf staat wél in het
  repo, dus dat blijft vanzelf gelijk met de laptop.
- **`npm run banks`** haalt op wat ontbreekt. Deze keer nog met de hand: tijdens
  de pull hierboven bestond de hook nog niet.

Wat er opgehaald wordt (in het gunstigste geval niets, zie hieronder):

| bestand | grootte |
|---|---|
| `public/dx7/roms.bin` | 32 KB |
| `public/dx7/Finetales 1 (EPs and bells).syx` | 4 KB |
| `public/banks/ydp-grand-2laags.mmbs` | 62 MB |
| `public/banks/ydp-grand.mmbs` | 118 MB |

Staan die vleugels al op de desktop, dan controleert het script hun sha256 en
slaat ze over — dan zie je alleen "al aanwezig" en duurt het een seconde. Wijken
ze af, dan haalt hij ze opnieuw op; dat is dan de versie die ook op de site
staat.

## Controleren

```bash
cd editor && npm run dev
```

Plaats een DX7-module en speel een patch. De melding
`dx7/roms.bin niet gevonden` hoort weg te zijn. Hetzelfde op de site:
<https://editor.musicbrain.nl>.

## Daarna

Dit bestand verwijderen en die verwijdering committen.

## Als iets misgaat

| Melding | Oorzaak / oplossing |
|---|---|
| `sha256 klopt niet` | de download is stuk; opnieuw draaien. Blijft het fout, dan loopt `banks.json` uiteen met de bijlage in de release: meld het op de laptop, daar moet het bestand opnieuw gepubliceerd worden |
| `download faalde (404)` | de bijlage bestaat niet (meer) onder die naam in de release `banks` |
| hook doet niets na een pull | `git config --get core.hooksPath` moet `tools/githooks` teruggeven; anders staat hij nog uit |
| iets met `gh` | alleen nodig voor *publiceren*, niet voor ophalen. Ophalen gaat over gewone HTTPS |
