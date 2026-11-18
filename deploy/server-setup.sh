#!/usr/bin/env bash
# One-time VPS bootstrap (Ubuntu/Debian): Docker, code in /opt/tquiz, .env with generated secrets, first start.
# Idempotent: safe to run again (keeps an existing .env).
#
# From your laptop:
#   ssh root@<IP> 'DOMAIN=olegquiz.ru bash -s' < deploy/server-setup.sh
# Optional env: ADMIN_PASSWORD (generated if empty), REPO, APP_DIR.
set -euo pipefail

DOMAIN="${DOMAIN:?set DOMAIN, e.g. DOMAIN=olegquiz.ru}"
REPO="${REPO:-https://github.com/genroelgvozo/tquiz.git}"
APP_DIR="${APP_DIR:-/opt/tquiz}"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if ! command -v git >/dev/null; then
  $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git
fi
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | $SUDO sh
fi
if [ -n "$SUDO" ] && ! id -nG | grep -qw docker; then
  $SUDO usermod -aG docker "$(id -un)"
  echo "Added $(id -un) to the docker group — log out and back in, then re-run this script." >&2
  exit 1
fi

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  $SUDO mkdir -p "$APP_DIR"
  $SUDO chown "$(id -un)" "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)}"
  umask 077
  cat > .env <<ENV
DOMAIN=$DOMAIN
PUBLIC_URL=https://$DOMAIN
ADMIN_PASSWORD=$ADMIN_PASSWORD
SECRET_KEY=$(openssl rand -hex 32)
ENV
  echo "Created $APP_DIR/.env — admin password: $ADMIN_PASSWORD"
else
  echo "Keeping existing $APP_DIR/.env"
fi

if command -v ufw >/dev/null && $SUDO ufw status | grep -q "Status: active"; then
  $SUDO ufw allow 80/tcp >/dev/null
  $SUDO ufw allow 443/tcp >/dev/null
fi

bash deploy/remote-update.sh
