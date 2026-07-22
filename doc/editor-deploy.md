# Editor deploy — editor.musicbrain.nl

De patch-editor/simulator (`editor/`) is een zelfstandige **statische**
Vite/React-SPA (geen database, geen server, geen Passenger). Hij draait live op
het subdomein **editor.musicbrain.nl** en wordt vanuit dít repo gedeployd, op
eigen release-tempo. De publiekssite (musicbrain.nl, Imprint) linkt er alleen
naartoe via zijn `/editor`-pagina — geen koppeling tussen de twee.

## Build

```
cd editor && npm install && npm run build   # → editor/dist (statische bundel)
```

`vite.config.ts` gebruikt `base: '/'` (de default): correct voor een
subdomein-**root**. Zou de editor ooit onder een subpad moeten (bijv.
`…/editor/`), dan `base: '/editor/'` zetten.

## Plesk (eenmalig instellen)

1. **Subdomein** `editor.musicbrain.nl` — Websites & Domains → Add Subdomain.
   (Let's Encrypt-cert + "redirect http→https" aanzetten; propagatie kan een
   dag duren.)
2. **Git-repo koppelen** aan het subdomein: `https://github.com/MarkWestbroek/MusicBrain.git`,
   branch `main`, deployment mode Automatic.
3. **Deployment-action** (de deploy-shell heeft npm niet op PATH — zelfde
   truc als bij imprint). Gebruik `npm install`, **niet** `npm ci`: de
   server draait npm 10.5/node 21 en lost de dependency-boom nét anders op
   dan de committede lockfile, waardoor `npm ci` op "Missing esbuild"
   struikelt. `npm install` is daar bestand tegen. De `chmod` maakt de
   gebouwde bestanden web-leesbaar/doorloopbaar:
   ```
   export PATH=/opt/plesk/node/21/bin:$PATH && cd editor && npm install --no-audit --no-fund && npm run build && chmod -R a+rX dist && chmod a+rX . ..
   ```
   (Typ dit met **rechte** aanhalingstekens — geplakte "smart quotes" geven
   `git-helper: unprintable characters`. Het PATH heeft hier geen quotes
   nodig omdat er geen spaties in zitten.)
   De EBADENGINE-waarschuwingen (vite@8/rolldown willen node ≥20.19/≥22) zijn
   onschuldig: dat zijn transitieve deps van `vitest` die niet meedraaien in
   de build — die gebruikt vite 5.4.21, prima op node 21.
4. **Document root** van het subdomein op `…/editor/dist` zetten (daar zet
   `vite build` de site). Let op: na het wijzigen van de docroot kan Plesk
   **traag** zijn met het herbouwen van de Apache-config — een 403
   ("Cannot serve directory … No matching DirectoryIndex", pad = de
   subdomein-root i.p.v. `editor/dist`) betekent dat de nieuwe docroot nog
   niet is toegepast, niet dat de bestanden fout staan. Even geduld / opnieuw
   opslaan; als root lost `plesk repair web <domein> -y` het direct op.
5. **Webhook**: kopieer de Plesk-webhook-URL van dít subdomein naar GitHub →
   MusicBrain-repo → Settings → Webhooks (push events, content type json).
   Dan deployt elke push naar `main` de editor vanzelf.

## Volgende deploys

`git push` → Plesk pullt, `npm install && npm run build`, en het subdomein serveert
de nieuwe `dist`. Statisch, dus geen herstart nodig. Controleer op
`https://editor.musicbrain.nl`.

## Site-kant (Imprint-repo, apart)

De publiekssite heeft een `/editor`-landingspagina
(`sites/musicbrain/content/pages/editor.json`) met verhaal + knop "Open the
editor" → `https://editor.musicbrain.nl`, en "Editor" in het hoofdmenu.
Live zetten op musicbrain.nl = pushen (auto-deploy) + `npm run db:seed --
--only=page,menu` op de server.
