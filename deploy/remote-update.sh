#!/usr/bin/env bash
# Runs ON the server after `git pull`: rebuild and restart the stack, then wait until the app answers.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

for _ in $(seq 1 30); do
  if docker compose exec -T app python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" 2>/dev/null; then
    echo "app is up"
    exit 0
  fi
  sleep 2
done
echo "app did not become healthy — see: docker compose logs app" >&2
exit 1
