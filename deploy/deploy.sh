#!/usr/bin/env bash
# Manual deploy from your laptop (the server pulls from GitHub, so push first):
#   TQUIZ_SSH=root@<IP> ./deploy/deploy.sh
set -euo pipefail

TARGET="${TQUIZ_SSH:?set TQUIZ_SSH=user@host}"
URL="${TQUIZ_URL:-https://olegquiz.ru}"

if [ -n "$(git status --porcelain --untracked-files=no)" ] || [ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}' 2>/dev/null)" ]; then
  echo "warning: local changes or unpushed commits — the server deploys what is on GitHub (origin/main)" >&2
fi

ssh "$TARGET" 'cd /opt/tquiz && git pull --ff-only && bash deploy/remote-update.sh'

for _ in $(seq 1 20); do
  if curl -fsS "$URL/api/health" >/dev/null; then
    echo "deployed: $URL"
    exit 0
  fi
  sleep 3
done
echo "public health check failed: $URL/api/health" >&2
exit 1
