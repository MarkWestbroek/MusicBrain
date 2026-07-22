# Editor deploy — editor.musicbrain.nl

De patch-editor/simulator (`editor/`) is een zelfstandige **statische**
Vite/React-SPA (geen database, geen server, geen Passenger). Hij draait live op
het subdomein **editor.musicbrain.nl** en wordt vanuit dít repo gedeployd, op
eigen release-tempo. De publiekssite (musicbrain.nl, Imprint) linkt er alleen
naartoe via zijn `/editor`-pagina — geen koppeling tussen de twee.

## Build

```
cd editor && npm ci && npm run build   # → editor/dist (statische bundel)
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
   truc als bij imprint):
   ```
   export PATH="/opt/plesk/node/21/bin:$PATH" && cd editor && npm ci && npm run build
   ```
4. **Document root** van het subdomein op `…/editor/dist` zetten (daar zet
   `vite build` de site).
5. **Webhook**: kopieer de Plesk-webhook-URL van dít subdomein naar GitHub →
   MusicBrain-repo → Settings → Webhooks (push events, content type json).
   Dan deployt elke push naar `main` de editor vanzelf.

## Volgende deploys

`git push` → Plesk pullt, `npm ci && npm run build`, en het subdomein serveert
de nieuwe `dist`. Statisch, dus geen herstart nodig. Controleer op
`https://editor.musicbrain.nl`.

## Site-kant (Imprint-repo, apart)

De publiekssite heeft een `/editor`-landingspagina
(`sites/musicbrain/content/pages/editor.json`) met verhaal + knop "Open the
editor" → `https://editor.musicbrain.nl`. Die staat nog niet in het hoofdmenu;
dat is de "aanzetten"-stap zodra dit subdomein live is (menu-item + seed).
