# Editor deploy — editor.musicbrain.nl

De patch-editor/simulator (`editor/`) is een zelfstandige **statische**
Vite/React-SPA: geen database en geen server. Hij draait op het subdomein
**editor.musicbrain.nl** en wordt vanuit dít repo gedeployd, op eigen
release-tempo. De publiekssite (musicbrain.nl, Imprint) linkt er alleen naartoe
via zijn `/editor`-pagina; er is geen koppeling tussen de twee.

**Sinds september 2026 draait de editor op de VPS** (vps1, naast musicbrain.nl
en Omnium), gedeployd door een GitHub Action. De Plesk-opzet bij Quickhost staat
onderaan als historie.

## Hoe een wijziging live komt

```mermaid
flowchart LR
    PUSH["git push naar main<br/>(iets onder editor/)"] --> GA["GitHub Action<br/>Deploy editor"]
    GA -- "ssh, deploy-sleutel<br/>(alleen deploy-vps.sh)" --> VPS
    subgraph VPS["VPS — /srv/musicbrain-editor"]
        SRC["src/ (sparse checkout editor/)"] --> BUILD["node-container:<br/>npm ci · banks · vite build"]
        REL["GitHub-release 'banks'<br/>(grote samplebanken)"] -. "volgens banks.json" .-> BUILD
        BUILD --> R["releases/&lt;commit&gt;/"]
        R --> WWW["www → symlink"]
    end
    WWW --> CADDY["Caddy<br/>editor.musicbrain.nl"]
```

1. Je pusht naar `main`, met een wijziging onder `editor/`.
2. De workflow `.github/workflows/deploy-editor.yml` logt in op de VPS met een
   SSH-sleutel die daar **alleen** `editor/deploy-vps.sh` mag starten (forced
   command: geen shell, geen tunnels), en geeft de commit mee.
3. `deploy-vps.sh` haalt die commit op, laat een node-container `npm ci`,
   `npm run banks` en `npm run build` draaien, zet het resultaat in
   `releases/<commit>/` en zet de symlink `www` om. Gaat een stap mis, dan
   blijft de live versie staan en wordt de Action rood.
4. De Action controleert via `version.txt` dat precies die commit live staat.

De voortgang zie je op GitHub onder **Actions → Deploy editor**. Handmatig
starten kan daar ook (**Run workflow**), of vanaf een machine met toegang tot
de VPS:

```bash
ssh vps1 /srv/musicbrain-editor/src/editor/deploy-vps.sh          # laatste main
ssh vps1 /srv/musicbrain-editor/src/editor/deploy-vps.sh 1a2b3c4  # terug naar een eerdere commit
```

De laatste 3 releases blijven bewaard. Terugdraaien naar een van die drie is
direct, want er wordt dan niets opnieuw gebouwd.

## Samplebanken buiten git

Kleine banken staan gewoon in git (`editor/public/banks/`, zie de README daar).
Banken die te groot zijn voor git (GitHub weigert bestanden boven 100 MB) hangen
als bijlage aan de GitHub-release **`banks`**. Welke dat zijn, staat in
**`editor/banks.json`** (naam, bijlagenaam, sha256, grootte), en dat bestand
staat wél in git. Zo bepaalt een commit ook welke banken online staan.

```bash
cd editor
npm run banks                                    # ontbrekende banken ophalen (desktop, laptop, VPS)
npm run banks:publish -- "pad/naar/bank.mmbs"    # bank uploaden + in banks.json zetten (vereist gh)
git add banks.json && git commit -m "banken: …" && git push   # → live
```

`npm run banks` haalt alleen wat ontbreekt of gewijzigd is, en controleert elke
download op zijn sha256. Na een verse clone is het dus: `npm install`,
`npm run banks`, `npm run dev`.

Let op: alles in de release is openbaar (het repo is openbaar), net als alles
op de editor-site. Zet er alleen banken in die herverdeeld mogen worden.

## Inrichting op de VPS (eenmalig; staat er sinds 19 september 2026)

```bash
sudo mkdir -p /srv/musicbrain-editor && sudo chown omnium: /srv/musicbrain-editor
cd /srv/musicbrain-editor
git clone --filter=blob:none --no-checkout https://github.com/MarkWestbroek/MusicBrain.git src
cd src && git sparse-checkout set editor && git checkout main     # ±150 MB i.p.v. het hele repo
```

- **Deploy-sleutel**: in `~omnium/.ssh/authorized_keys` staat
  `command="/srv/musicbrain-editor/src/editor/deploy-vps.sh",restrict ssh-ed25519 … github-actions@MusicBrain deploy-editor`.
  De privésleutel staat alleen in de GitHub-secret `VPS_SSH_KEY`. Vervangen:
  nieuw sleutelpaar maken, de regel in `authorized_keys` vervangen en de secret
  overschrijven.
- **`VPS_KNOWN_HOSTS`**: de host-sleutel van de VPS (ed25519), vastgepind. Met
  de Windows-`ssh-keyscan` lukt het ophalen niet (die kent de sleuteluitwisseling
  van de VPS niet); gebruik die van Git Bash, of neem de regel uit je eigen
  `known_hosts`.
- **Caddy**: blok `editor.musicbrain.nl` in `/etc/caddy/Caddyfile` (repo-kopie
  in het Bitemporal-repo, `deploy/vps/Caddyfile`), `root` op
  `/srv/musicbrain-editor/www`.
- **DNS**: A-record `editor.musicbrain.nl` → `62.129.142.42` (DNS bij Quickhost).

## Build

`vite.config.ts` gebruikt `base: '/'` (de default): correct voor een
subdomein-**root**. Moet de editor ooit onder een subpad komen te staan
(bijvoorbeeld `…/editor/`), zet dan `base: '/editor/'`. Lokaal:

```
cd editor && npm install && npm run banks && npm run build   # → editor/dist
```

## Site-kant (Imprint-repo, apart)

De publiekssite heeft een `/editor`-landingspagina met een verhaal en de knop
"Open the editor" → `https://editor.musicbrain.nl`, en "Editor" in het
hoofdmenu. Die pagina is content in de database van musicbrain.nl en wordt in
de admin bewerkt.

## Historie: Plesk bij Quickhost (juli–september 2026)

Tot september 2026 stond de editor als Plesk-subdomein bij Quickhost: Plesk
pullde bij elke push (webhook), draaide
`npm install && npm run build` met `/opt/plesk/node/21/bin` en serveerde
`editor/dist`. Dat bleef werken nadat Quickhost Node voor apps uitzette, maar
grote banken konden er niet bij (niet in git, geen geautomatiseerde weg), en
het was een tweede, aparte deploy-omgeving naast de VPS. Na de verhuizing:
de Plesk-webhook op GitHub (`655461008`) en de Git-koppeling in Plesk
verwijderen.
