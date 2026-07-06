# MusicBrain — Requirements merk/product-website + beheersysteem

> Twee lagen: (A) wat de website moet zijn/bevatten, (B) waar het systeem om
> zo'n site op te zetten en te onderhouden aan moet voldoen — afgeleid uit A,
> per rol. Bedoeld als input voor een aparte bouwsessie. §C is een voorzet
> voor de architectuur.

---

## A. De website zelf

### A1. Sitemap (v1)

```
/                       Home (hero, familie, status, open source, signup)
/products/cortex        Productpagina (+ /reflex, /relay, /synapse)
/editor                 Editor & simulator (link naar live editor, download)
/releases               Release-feed + devlog (nieuws)
/docs → GitHub          (v1: doorlinken; later eigen docs-sectie)
/community              Discord, GitHub, forum-links, contributing
/support                Getting started, FAQ, firmware-downloads, contact
/about                  Wie zijn wij, verhaal, open-source-filosofie
/press                  Press kit: logo-pack, foto's, boilerplate, specs
/dealers                (fase 2) B2B-info + interesse-formulier
/contact                Formulier + e-mail
/legal/privacy          Privacy/cookies (nieuwsbrief ⇒ AVG!)
```

### A2. Functionele eisen

| # | Eis | Prio |
|---|---|---|
| W1 | Nieuwsbrief-signup (double opt-in, AVG-proof) | must |
| W2 | Release-feed automatisch gevoed vanuit GitHub (releases/RELEASE-LOG) | must |
| W3 | Productpagina's met specs-tabel, statusbadge (in development/beta/available), foto/video | must |
| W4 | Beta-/interesse-aanmelding per product (formulier → lijst) | must |
| W5 | Meertaligheid voorbereid (EN nu, NL later) | should |
| W6 | Devlog/blog met RSS | should |
| W7 | Downloads met versienummer + checksum (simulator, firmware) | should |
| W8 | Press kit als downloadbare zip | should |
| W9 | Embedded demo van de editor (of screenshots/video v1) | could |
| W10 | Dealer-portal (prijslijsten, assets) achter login | later |
| W11 | Community-integratie: v1 = links + GitHub Discussions embed; eigen forum pas bij bewezen behoefte | could |
| W12 | Analytics privacy-vriendelijk (Plausible/Umami, geen cookiebanner nodig) | should |
| W13 | SEO-basis: metadata, OG-images per pagina, sitemap.xml; let op onderscheid t.o.v. "MusicBrainz" | must |
| W14 | Performance: statisch/SSG waar kan, < 1 s LCP, werkt op telefoon (muzikanten browsen mobiel) | must |
| W15 | Dark mode — de doelgroep leeft in dark mode; design-brief maakt dark zelfs de default | should |

### A3. Niet-functioneel
- Hosting goedkoop/gratis tot er omzet is (statische host + kleine DB).
- Content bewerkbaar zónder redeploy voor nieuws/releases (zie B).
- Domein: check `musicbrain.*`-beschikbaarheid; vermijd verwarring met
  MusicBrainz (zie positioneringsplan §6.3).

---

## B. Requirements voor het beheersysteem (de "website-motor")

Afgeleid per rol — wie moet wat kunnen, zonder tussenkomst van anderen:

### B1. Per rol

- **Marketingmanager:** pagina's en posts maken/bewerken in een simpele
  editor (markdown/MDX is oké voor deze gebruiker), publiceren/plannen,
  concept vs. gepubliceerd, preview vóór publicatie, OG-image en metadata
  per pagina instellen, nieuwsbrieflijst exporteren/koppelen.
- **Productmanager:** productdata gestructureerd beheren (naam, tagline,
  status, specs als key-value-lijst, prijzen later, foto's) — géén vrije
  HTML, zodat alle productpagina's consistent blijven; status wijzigen
  (in development → beta → available) zonder tekst te herschrijven.
- **Ontwerper:** huisstijl-tokens (kleuren, typografie, spacing) op één
  plek; componentbibliotheek zodat nieuwe pagina's automatisch in stijl
  zijn; assets (beelden, logo-pack) in een mediabibliotheek met versies.
- **Developer:** content als data via API (headless), schema-gemigreerd
  (geen click-ops-drift), alles in git behalve runtime-content, CI/CD
  deploy, lokaal draaien met één commando, releases automatisch
  gesynchroniseerd vanuit GitHub-webhook.
- **Gebruiker (bezoeker):** snelle site, werkende downloads met juiste
  versies, actuele release-info (nooit verouderd door handwerk), formulier
  dat echt aankomt.
- **Wederverkoper (later):** eigen login, actuele prijslijst en assets
  downloaden, bestelinteresse doorgeven.

### B2. Systeem-eisen (samengevat)

| # | Eis |
|---|---|
| S1 | Headless content-API; presentatie strikt gescheiden van content |
| S2 | Twee contentsoorten: gestructureerd (producten, releases, specs — schema-validated) en vrij (pagina's/posts in markdown/MDX) |
| S3 | Rollen/rechten: admin, editor (marketing), product-editor, viewer; dealer-rol later |
| S4 | Versiegeschiedenis van alle content: wie wijzigde wat wanneer, terugrollen mogelijk |
| S5 | Publicatie-workflow: draft → preview-URL → publish (evt. gepland) |
| S6 | Publicatie op tijdstip X gepland kunnen klaarzetten |
| S7 | GitHub-integratie: webhook op release → release-item in DB → site toont het zonder handwerk |
| S8 | Media-beheer met automatische afbeeldingsvarianten (thumbnail/OG/hero) |
| S9 | i18n op contentniveau: elk item kan per taal een versie hebben; fallback naar EN |
| S10 | Formulieren (nieuwsbrief, beta, contact, dealer) → DB + notificatie-mail; spam-bescherming |
| S11 | Tech: **React** front-end (zelfde stack als MMB-editor: TS, Vite of Next), **PostgreSQL** als database |
| S12 | Alles-in-git behalve runtime-content: schema-migraties, seed, IaC |
| S13 | Eén-commando lokale dev (docker-compose met Postgres of Neon-branch) |

### B3. Fusie met het bitemporal-registerproject

S4/S5/S6 wijzen precies naar wat een bitemporal register kán: dit is een
serieuze kans, geen vergezocht huwelijk.

- **Transaction time** = auditlog/versiegeschiedenis gratis: elke wijziging
  aan pagina, product of release is een nieuwe rij; terugrollen = oude
  versie opnieuw asserteren. Dekt S4.
- **Valid time** = geplande publicatie gratis: "deze pagina is geldig vanaf
  2026-09-01" ⇒ de site rendert op elk moment de dan-geldige content. Dekt
  S5/S6 én geeft preview ("toon de site zoals hij er op datum X uitziet")
  als query-parameter in plaats van aparte infrastructuur.
- **Productlevenscyclus:** status in development → beta → available →
  discontinued is letterlijk een valid-time-historie per product.
- **Risico's / afbakening:** het registerproduct moet dan wél een simpele
  CRUD+query-API en auth hebben; de website mag geen proefkonijn worden dat
  beide projecten vertraagt. Advies: definieer een smalle interface
  (`ContentStore`: get/put/list met as-of-parameters) en bouw v1 desnoods op
  kale Postgres-tabellen met `valid_from/valid_to/tx_from/tx_to`-kolommen —
  dat is bitemporal-light, migreert later naadloos naar het echte register,
  en de website bewijst intussen als eerste referentieklant van het
  register. Win-win zonder harde koppeling.

---

## C. Voorzet architectuur (voor de bouwsessie)

```
┌─ Front-end ─────────────────────────────┐
│ Next.js (React + TS) — SSG/ISR          │  ← of Vite+SSG als je bij
│ Tailwind + design-tokens uit brief      │    de MMB-stack wil blijven;
│ Pagina's renderen uit content-API       │    Next is de pragmatische keus
└──────────────┬──────────────────────────┘    voor SEO/SSG/ISR
               │ REST of tRPC
┌─ Content-service ───────────────────────┐
│ Node/TS API (kan Next API-routes zijn)  │
│ Drizzle ORM + zod-schema's              │
│ Bitemporal-light tabellen (B3)          │
│ Auth: e-mail-magic-link (weinig users)  │
│ GitHub-webhook → releases-tabel         │
└──────────────┬──────────────────────────┘
        PostgreSQL (Neon/Supabase gratis tier)
```

- **Contentmodel v1:** `page` (slug, lang, mdx, meta), `product` (slug,
  naam, tagline, status, specs jsonb, media[]), `release` (version, date,
  channel, highlights, body, bron-URL), `post` (devlog), `subscriber`,
  `form_submission`, `asset`. Alle content-tabellen bitemporal-light.
- **Admin-UI:** zelfde React-app, `/admin`-route achter login. MDX-editor
  met preview; product-formulier gegenereerd uit zod-schema.
- **Deploy:** Vercel/Netlify (front) + Neon (DB); alles gratis tot er
  verkeer is. CI: GitHub Actions, preview-deploys per PR.
- **Fasering:** v0 = statische site met content uit MDX-files in git (geen
  DB, wél zelfde componenten) → v1 = DB + admin erachter schuiven. Zo staat
  er binnen een dag iets online terwijl het systeem netjes groeit.
