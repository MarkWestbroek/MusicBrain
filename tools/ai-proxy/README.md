# ai-proxy — jouw AI-key op de server, toegang met een code

De AI-knop in de editor kan met een eigen key werken (DeepSeek, Claude, …) die
in de browser van de gebruiker staat. Voor mensen aan wie je toegang wilt
geven zónder je key weg te geven is er dit kleine proces op de VPS:

```
browser (profiel "MusicBrain-server", toegangscode)
   → https://editor.musicbrain.nl/ai/v1/chat/completions
   → Caddy → 127.0.0.1:8787 (dit proces: code + daglimiet controleren)
   → DeepSeek (met jouw key, die alleen hier staat)
```

Geen afhankelijkheden, Node 18+. Omdat het op hetzelfde domein als de editor
draait, is er geen CORS nodig.

## Codes uitgeven

```bash
node server.mjs add-code "Anna" 200     # 200 verzoeken per dag; print de code
node server.mjs list                    # codes, gebruik vandaag
node server.mjs revoke Anna             # intrekken (naam of code)
```

De gebruiker kiest in de editor bij ⌘ Recept → ⚙ → **+ toevoegen… →
MusicBrain-server** en vult de code in bij **Toegangscode**. Eén AI-vraag is
meestal 2 tot 5 verzoeken (het model haalt zelf catalogus en patch op).

Codes staan in `invites.json`, gebruik in `usage.jsonl` (één regel per
verzoek, met de token-telling van de upstream). Beide naast `server.mjs`, of
in `AI_PROXY_DIR`. Zet ze niet in git.

## Installeren op de VPS

Eenmalig, met een shell op de VPS (de deploy-sleutel van de editor mag dit
bewust niet).

1. **Code neerzetten**, los van de editor-releases:

   ```bash
   sudo mkdir -p /srv/musicbrain-ai && sudo chown $USER /srv/musicbrain-ai
   cp /srv/musicbrain-editor/src/tools/ai-proxy/server.mjs /srv/musicbrain-ai/
   ```

   (De sparse checkout van de editor bevat alleen `editor/`; kopieer het bestand
   anders met `scp` vanaf je eigen machine.)

2. **Geheim** in `/etc/musicbrain-ai.env` (`chmod 600`, eigenaar root):

   ```
   UPSTREAM_KEY=sk-...                 # jouw DeepSeek-key
   UPSTREAM_URL=https://api.deepseek.com/chat/completions
   UPSTREAM_MODEL=deepseek-chat
   AI_PROXY_PORT=8787
   AI_PROXY_DIR=/srv/musicbrain-ai
   ```

3. **systemd** — `/etc/systemd/system/musicbrain-ai.service`:

   ```ini
   [Unit]
   Description=MusicBrain AI-proxy
   After=network-online.target

   [Service]
   EnvironmentFile=/etc/musicbrain-ai.env
   ExecStart=/usr/bin/node /srv/musicbrain-ai/server.mjs
   Restart=on-failure
   User=www-data
   WorkingDirectory=/srv/musicbrain-ai

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo chown -R www-data /srv/musicbrain-ai
   sudo systemctl daemon-reload && sudo systemctl enable --now musicbrain-ai
   curl -s 127.0.0.1:8787/ai/health          # {"ok":true}
   ```

   Codes beheren (heeft de key niet nodig; `invites.json` staat naast het script):

   ```bash
   sudo -u www-data node /srv/musicbrain-ai/server.mjs add-code "Anna" 200
   sudo -u www-data node /srv/musicbrain-ai/server.mjs list
   sudo -u www-data node /srv/musicbrain-ai/server.mjs revoke Anna
   ```

   Intrekken werkt direct: de proxy leest `invites.json` bij elk verzoek.

4. **Caddy** — in het blok `editor.musicbrain.nl` (repo-kopie in het
   Bitemporal-repo, `deploy/vps/Caddyfile`), vóór de `file_server`:

   ```
   handle /ai/* {
       reverse_proxy 127.0.0.1:8787
   }
   ```

   `sudo systemctl reload caddy`, dan in de editor het profiel
   MusicBrain-server proberen.

## Testen zonder VPS

```bash
node smoke.mjs     # nep-upstream + proxy: code, limiet, intrekken, logging
```
