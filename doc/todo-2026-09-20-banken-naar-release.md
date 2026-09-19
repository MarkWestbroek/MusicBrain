# Todo op de laptop: grote bestanden naar de release

> Geschreven 19 september 2026. Doel: de bestanden die alleen op de laptop
> staan (DX7-ROM's, YDP-vleugel, …) online krijgen op editor.musicbrain.nl.
> Achtergrond en werking: [editor-deploy.md](editor-deploy.md). Dit bestand
> mag weg als alles is afgevinkt.

## Wat er al klaarstaat

- De editor draait sinds 19 september op de VPS (editor.musicbrain.nl). Elke
  push naar `main` met een wijziging onder `editor/` start de GitHub Action
  **Deploy editor**, en die bouwt en zet live.
- Grote bestanden onder `editor/public/` die niet in git kunnen, gaan naar de
  GitHub-release **`banks`**. `editor/banks.json` (in git) zegt welke.
- **`dx7/roms.bin` staat nog nooit online**: `*.bin` staat in `.gitignore`,
  dus de DX7-module geeft op de site een fout. Dat is de belangrijkste.

## Stappen

### 1. Repo bijwerken

```bash
cd ~/…/MusicBrain          # waar het repo op de laptop staat
git pull
ls editor/scripts/banks.mjs editor/banks.json   # moeten bestaan
```

Bestaan ze niet, dan is er nog niet gepusht vanaf de desktop. Push daar eerst.

### 2. `gh` controleren

```bash
gh auth status
```

Niet ingelogd: `gh auth login` (GitHub.com, HTTPS, via de browser).
Geen `gh`: `brew install gh`.

### 3. Zoeken welke bestanden er ontbreken

```bash
cd editor
git status --ignored --short public/ | grep '^!!'
```

Dat toont alles onder `public/` dat op de laptop staat maar door git genegeerd
wordt. Verwacht in elk geval:

- `public/dx7/roms.bin`
- `public/banks/ydp-grand-2laags.mmbs` (of zoals de vleugel precies heet)
- eventueel andere banken

Alleen publiceren wat **herverdeeld mag worden**: alles in de release en op de
site is openbaar.

### 4. Publiceren

Per bestand, vanuit `editor/`:

```bash
npm run banks:publish -- "public/dx7/roms.bin"
npm run banks:publish -- "public/banks/ydp-grand-2laags.mmbs"
```

- Staat een bestand niet onder `public/`, geef dan de doelmap mee:
  `npm run banks:publish -- ~/Downloads/iets.mmbs --to banks`
- De eerste keer maakt het script de release `banks` aan.
- Elke keer uploadt het het bestand en schrijft pad, sha256 en grootte in
  `banks.json`. Grote bestanden (de vleugel is 118 MB) duren even.
- Opnieuw publiceren met dezelfde naam vervangt de oude versie.

Controle: `cat banks.json`. Die moet nu een regel per bestand hebben onder
`"files"`.

### 5. Live zetten

```bash
git add banks.json
git commit -m "banken: DX7-ROM's en YDP-vleugel via de release"
git push
```

Kijk op GitHub → **Actions → Deploy editor**. Groen betekent dat de VPS de
bestanden heeft opgehaald, gecontroleerd en de editor opnieuw gebouwd.

### 6. Controleren

```bash
curl -sI https://editor.musicbrain.nl/dx7/roms.bin | head -1                  # HTTP/2 200
curl -sI https://editor.musicbrain.nl/banks/ydp-grand-2laags.mmbs | head -1   # HTTP/2 200
```

En in de browser: een DX7-module plaatsen en een patch spelen. De foutmelding
"dx7/roms.bin niet gevonden" hoort weg te zijn.

### 7. Op de desktop (later)

```bash
git pull && cd editor && npm run banks
```

Dat haalt dezelfde bestanden uit de release. Zo heeft elke machine ze, zonder
dat je ze met de hand hoeft te kopiëren.

### 8. Laten opruimen (tegen Claude zeggen)

- De Plesk-webhook op GitHub verwijderen (`655461008`, MusicBrain-repo).
- In Plesk (Quickhost) bij `editor.musicbrain.nl` de Git-koppeling weghalen;
  dat moet je zelf doen in het panel. Het subdomein zelf mag blijven staan, de
  DNS wijst al naar de VPS.
- Dit bestand verwijderen.

## Als iets misgaat

| Melding | Oorzaak / oplossing |
|---|---|
| `gh: command not found` / `not logged in` | stap 2 |
| `… staat niet onder editor/public/` | `--to <map>` meegeven (stap 4) |
| Action rood bij "Deploy op de VPS" | de log van de Action vertelt welke stap faalde; de live editor blijft dan gewoon de vorige versie |
| `sha256 klopt niet` in de Action | de bijlage in de release en `banks.json` lopen uiteen: het bestand opnieuw publiceren en `banks.json` opnieuw committen |
| Action rood bij "Controleren" | de VPS draait een andere commit dan verwacht, bijvoorbeeld omdat een eerdere run nog bezig was. Opnieuw starten: Actions → Deploy editor → Run workflow |
