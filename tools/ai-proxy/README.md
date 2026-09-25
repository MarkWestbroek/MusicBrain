# ai-proxy — jouw AI-key op de server, toegang met een code

## Wat is dit, en waarom

De AI-knop in de editor (⌘ Recept → ✨ AI) praat met een taalmodel, standaard
DeepSeek. Daar is een API-key voor nodig, en die kost geld per gebruik.

- **Voor jezelf** is dit proces niet nodig: je zet je eigen key in de editor
  (⚙ in het AI-venster). Die staat alleen in jouw browser.
- **Voor anderen** wil je je key niet weggeven: je kunt hem dan niet meer
  terugnemen zonder hem bij DeepSeek te vervangen, en je ziet niet wie wat
  verbruikt.

Deze proxy lost dat op. Het is een klein tussenprogramma op de VPS:

```
editor van Anna (profiel "MusicBrain-server", toegangscode mb-Xa3k…)
   │  vraag + toegangscode
   ▼
https://editor.musicbrain.nl/ai/v1/chat/completions
   │  Caddy stuurt /ai/* door
   ▼
ai-proxy (container op de VPS, 127.0.0.1:8787)
   │  1. is de code geldig en actief?
   │  2. zit Anna nog onder haar daglimiet?
   │  3. vraag doorsturen mét jouw key (die alleen hier staat)
   ▼
DeepSeek  ──antwoord──▶  terug naar Anna's editor
```

Wat je ermee hebt:

- **Je key blijft geheim.** Hij staat alleen in `/etc/musicbrain-ai.env` op de
  VPS en komt nooit in een browser.
- **Per persoon een code**, met een daglimiet (aantal verzoeken per dag).
  Eén AI-vraag is meestal 2 tot 5 verzoeken, omdat het model zelf de
  modulecatalogus en de patch opvraagt.
- **Intrekken met één opdracht**, per persoon, met directe werking.
- **Gebruik zichtbaar**: elk verzoek komt in `usage.jsonl`, met naam, status
  en token-telling.
- Geen CORS-gedoe: de proxy draait op hetzelfde domein als de editor.

Gebouwd 2026-09-25 (ED-RC-10). Code: `server.mjs`, zonder afhankelijkheden
(Node 18+). Rooktest: `node smoke.mjs`.

## Hoe het op de VPS staat

| Onderdeel | Waar |
|---|---|
| Programma | `/srv/musicbrain-ai/server.mjs` (kopie van dit bestand) |
| Codes en gebruik | `/srv/musicbrain-ai/invites.json`, `/srv/musicbrain-ai/usage.jsonl` |
| Geheim (de DeepSeek-key) | `/etc/musicbrain-ai.env`, alleen leesbaar voor root |
| Draait als | Docker-container `musicbrain-ai` (image `node:24-bookworm-slim`, hetzelfde als de editor-build), `--restart unless-stopped`, gepubliceerd op `127.0.0.1:8787` |
| Webserver | Caddy, blok `editor.musicbrain.nl` in `/etc/caddy/Caddyfile`: `handle /ai/* { reverse_proxy 127.0.0.1:8787 }` (repo-kopie: Bitemporal-repo, `deploy/vps/Caddyfile`) |

Er staat geen Node op de host; daarom een container. Hij hoort niet bij de
editor-deploy: een nieuwe editor-release laat de proxy met rust.

## Codes beheren

Op de VPS (`ssh vps1`; vanaf Windows via PowerShell, de sleutel zit in de
Windows ssh-agent):

```bash
sudo docker exec musicbrain-ai node /data/server.mjs add-code "Anna" 200   # print de code
sudo docker exec musicbrain-ai node /data/server.mjs list                  # codes + gebruik vandaag
sudo docker exec musicbrain-ai node /data/server.mjs revoke Anna           # naam of code
```

"Anna" is alleen een naam voor jezelf; de code die de opdracht print geef je
aan Anna. Zij kiest in de editor ⌘ Recept → ⚙ → **+ toevoegen… →
MusicBrain-server** en vult de code in bij **Toegangscode**. Intrekken werkt
direct: de proxy leest `invites.json` bij elk verzoek.

## Onderhoud

```bash
sudo docker logs --tail 50 musicbrain-ai          # draait hij?
curl -s 127.0.0.1:8787/ai/health                   # {"ok":true}
```

**De key vervangen.** Twee valkuilen, allebei op 25 september tegengekomen:

1. **Niet met nano vanuit de VS Code-terminal plakken.** Daar vielen
   regeleinden weg: de drie regels raakten aan elkaar en er bleef een losse
   `n` achter de key hangen (DeepSeek: `Authentication Fails … ****cean`).
   Zet de key daarom zo, vanaf Windows in PowerShell; hij gaat via ssh
   rechtstreeks het bestand in, niet via een opdrachtregel op de server:

   ```powershell
   $k = Read-Host "DeepSeek-key"; $k.Trim() | ssh vps1 'read -r k; printf "UPSTREAM_KEY=%s\nUPSTREAM_URL=https://api.deepseek.com/chat/completions\nUPSTREAM_MODEL=deepseek-chat\n" "$k" | sudo tee /etc/musicbrain-ai.env >/dev/null; sudo chmod 600 /etc/musicbrain-ai.env; echo opgeslagen'
   ```

2. **Daarna de container opnieuw aanmaken, niet alleen herstarten.** Docker
   leest `--env-file` alleen bij het aanmaken; `docker restart` houdt de oude
   key. Dus de `docker rm -f` plus `docker run` uit "Opnieuw opzetten"
   hieronder.

Controleren of DeepSeek de key accepteert, zonder hem te tonen:

```bash
key=$(sudo grep '^UPSTREAM_KEY=' /etc/musicbrain-ai.env | cut -c14-)
curl -s -o /dev/null -w '%{http_code}\n' https://api.deepseek.com/models -H "Authorization: Bearer $key"   # 200 = goed
```

Een DeepSeek-key is `sk-` plus 32 tekens (0–9, a–f), samen 35.

Nieuwe versie van `server.mjs`: kopiëren naar `/srv/musicbrain-ai/` en
`sudo docker restart musicbrain-ai` (herstarten volstaat hier: het script
wordt bij het starten opnieuw gelezen).

Opdrachten met `{{…}}` (bijv. `docker inspect -f`) vanaf Windows niet direct
in `ssh vps1 '…'` zetten: PowerShell verknipt de aanhalingstekens. Log in
met `ssh vps1` en typ ze daar, of zet ze in een scriptje.

**Opgezet op 25 september 2026:** container draait, Caddy-regel staat erin,
eerste code (Mark, 500/dag) aangemaakt en end-to-end getest via
`https://editor.musicbrain.nl/ai/` (antwoord van DeepSeek).

## Opnieuw opzetten (bijv. na een nieuwe VPS)

```bash
sudo mkdir -p /srv/musicbrain-ai
sudo cp server.mjs /srv/musicbrain-ai/
sudo install -m 600 -o root /dev/null /etc/musicbrain-ai.env
sudo nano /etc/musicbrain-ai.env
#   UPSTREAM_KEY=sk-...
#   UPSTREAM_URL=https://api.deepseek.com/chat/completions
#   UPSTREAM_MODEL=deepseek-chat
sudo docker run -d --name musicbrain-ai --restart unless-stopped \
  --env-file /etc/musicbrain-ai.env \
  -e AI_PROXY_HOST=0.0.0.0 -e AI_PROXY_DIR=/data \
  -v /srv/musicbrain-ai:/data -p 127.0.0.1:8787:8787 \
  node:24-bookworm-slim node /data/server.mjs
# Caddy: in het blok editor.musicbrain.nl, vóór file_server:
#   handle /ai/* {
#       reverse_proxy 127.0.0.1:8787
#   }
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
