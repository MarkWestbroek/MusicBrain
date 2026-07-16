# Vragen & verzoeken aan Imprint — MusicBrain, juli 2026

Context: op 2026-07-16 is de gen-2-hardwareset gepubliceerd (13 componenten,
release `cortex-v0.2` — had `v0.3` moeten heten, zie vraag 2). Alles via de
ingest-keten uit `docs/mmb-ingest-guide.md`. Daarbij kwamen de volgende
punten boven.

> **Beantwoord door Imprint 2026-07-17** — alle zes geregeld: alias als
> 308 (zie status in `imprint-fr-url-alias.md`), DELETE = bitemporale
> tombstone (gids §6), release-lijst toont project+versie, componentpagina
> toont álle versies (releaseweging = backlog), testcase =
> `npm run testcase:bitemporal` (groen tegen prod incl. oude assets),
> ingest-response heeft `pinned_by` + warning. Punten 1/2/3/6 live na de
> Plesk-pull. cortex-v0.2 → v0.3 lokaal uitgevoerd met
> `publish_release.py --withdraw` (prod volgt na de pull).

## 1. URL-alias per contenttype (feature request)

De borden dragen een silk-opdruk `musicbrain.nl/hw/<naam>`; het echte pad is
`/components/<naam>`. Verzoek: configureerbare alias per contenttype met
301-redirect. **Volledig uitgewerkt in `imprint-fr-url-alias.md`** (gedrag,
acceptatiecriteria).

## 2. Release terugtrekken / corrigeren

Er staat nu een verkeerd genummerde release live: `cortex-v0.2` (2026-07-16)
naast de oudere `modular-mb@v0.2` — het had `cortex-v0.3` moeten zijn.

- **Vraag**: ondersteunt de write-API een DELETE (of tombstone) voor een
  content-item, bv. `DELETE /api/content/release/<slug>`? De store-interface
  kent `deleteItem`, de ingest-gids noemt alleen POSTs.
- Zo nee: **verzoek** — een nette terugtrek-route die past bij het
  bitemporale model (niet wissen maar verbergen/superseden), zodat een
  vergissing niet eeuwig in de publieke lijst staat.
- Tot die tijd: mogen wij `cortex-v0.2` op een andere manier laten
  verdwijnen/hernoemen, of laten staan en gewoon `v0.3` ernaast posten?

## 3. Release-lijst: toon project en kanaal

De release-lijst op de site toont alleen `v0.2 · datum · kanaal`. Met twee
projecten (modular-mb, cortex) die allebei een v0.2 hebben, is niet te zien
welke welke is. **Verzoek**: projectnaam (en evt. product) erbij in de lijst
— dan kan een nummerbotsing nooit meer verwarren.

## 4. Welke versie toont de componentpagina?

**Vraag** (documentatie/bevestiging): volgt de componentpagina de nieuwste
release, de nieuwste *stable*-release, of de laatst gepostte spec? En hoe
wegen de kanalen (dev/beta/stable) daarin mee? Wij namen aan: "de site toont
wat de release vastpint" — klopt die mentale mode, en wint stable van dev
bij gelijke recentheid?

## 5. Testcase: oude releases/versies blijven benaderbaar

Bitemporaal = niets raakt kwijt. **Verzoek**: neem de asserts uit
`imprint-testcase-oude-releases.md` op in de testsuite. Kern: na het posten
van release B blijft release A in de lijst, houdt een component beide
versies, en blijven de content-hashed assets van de óude spec HTTP 200
geven. (Assert 1 en 2 hebben we live al waargenomen; assert 3 — oude
asset-URL's — is nog ongetest.)

## 6. DX-suggestie: waarschuw bij een niet-gepinde spec

Wij postten eerst alleen componenten + board-specs (stap 1+2) en zagen
niets op de site verschijnen; de ontbrekende release (stap 3+4) was de
oorzaak. **Suggestie**: laat `/api/ingest/board-spec` in zijn response
melden of de nieuwe versie door een release gepind wordt (bv.
`"pinned_by": []`) — dan is dit gat in één oogopslag zichtbaar.
