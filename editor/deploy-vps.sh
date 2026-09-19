#!/usr/bin/env bash
# deploy-vps.sh — de editor (editor.musicbrain.nl) bijwerken op de VPS.
#
# Draait óp de VPS, vanuit een sparse checkout van dit repo (alleen editor/):
#   /srv/musicbrain-editor/src                 git-checkout (sparse: editor/)
#   /srv/musicbrain-editor/releases/<commit>   gebouwde dist per versie
#   /srv/musicbrain-editor/www                 symlink naar de actieve release
#                                              (Caddy-docroot)
#
# Wordt gestart door de GitHub Action (.github/workflows/deploy-editor.yml),
# via een SSH-sleutel die alleen dít script mag starten. Met de hand:
#   ssh vps1 /srv/musicbrain-editor/src/editor/deploy-vps.sh           # laatste main
#   ssh vps1 /srv/musicbrain-editor/src/editor/deploy-vps.sh <commit>  # terug naar een versie
#
# Stappen: git bijwerken → banken ophalen volgens banks.json (GitHub-release,
# sha256-gecontroleerd) → bouwen in een node-container (op de VPS staat geen
# Node) → symlink omzetten. Faalt een stap, dan blijft de live versie staan.
# Houdt de laatste 3 releases. Zie doc/editor-deploy.md.

# Alles in een functie: bash leest het hele script in vóór het draait, dus een
# `git pull` die dit bestand zelf verandert, kan de lopende run niet raken.
main() {
  set -euo pipefail
  local BASE=/srv/musicbrain-editor
  local SRC="$BASE/src"
  local KEEP=3

  # Eén deploy tegelijk; een tweede wacht (twee snelle pushes → twee runs na elkaar).
  exec 9>"$BASE/.deploy.lock"
  flock 9

  # Via de GitHub Action komt de gevraagde commit binnen als SSH_ORIGINAL_COMMAND.
  local want="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  [[ -z "$want" || "$want" =~ ^[0-9a-f]{7,40}$ ]] || { echo "ongeldige commit: $want" >&2; exit 2; }

  cd "$SRC"
  git fetch -q origin
  if [ -n "$want" ]; then
    git checkout -q --detach "$want"
  else
    git checkout -q main && git merge -q --ff-only origin/main
  fi
  local rev; rev="$(git rev-parse --short=12 HEAD)"
  echo "── editor @ $rev: $(git log -1 --format=%s)"

  if [ -d "$BASE/releases/$rev" ]; then
    echo "── release $rev bestaat al; alleen omzetten"
  else
    # node_modules en public/banks/ blijven in de checkout staan tussen runs:
    # npm ci gebruikt de cache, en banken met de juiste sha256 worden niet
    # opnieuw gedownload.
    docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
      -v "$SRC/editor":/app -w /app node:24-bookworm-slim \
      sh -c 'npm ci --no-audit --no-fund --loglevel=error && npm run -s banks && npm run build'
    mkdir -p "$BASE/releases"
    rm -rf "$BASE/releases/$rev.tmp"
    cp -a "$SRC/editor/dist" "$BASE/releases/$rev.tmp"
    echo "$rev" > "$BASE/releases/$rev.tmp/version.txt"   # de Action controleert hierop
    mv "$BASE/releases/$rev.tmp" "$BASE/releases/$rev"
  fi

  ln -sfn "releases/$rev" "$BASE/www.new" && mv -T "$BASE/www.new" "$BASE/www"
  echo "── live: $rev"

  # Oude releases opruimen; de actieve blijft altijd staan.
  ls -1t "$BASE/releases" | grep -vx "$rev" | tail -n +"$KEEP" | while read -r old; do
    rm -rf "${BASE:?}/releases/$old"
  done
}

main "$@"
exit
