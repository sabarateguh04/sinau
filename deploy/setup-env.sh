#!/usr/bin/env bash
# Pasang backend/.env di server dari deploy/env.server.
#   bash deploy/setup-env.sh <DB_PASSWORD>
# JWT secret dibangkitkan otomatis (openssl). Aman diulang: .env yang sudah ada tidak ditimpa
# kecuali dipanggil dengan --force.
set -euo pipefail
cd "$(dirname "$0")/.."
PW="${1:-}"; FORCE="${2:-}"
[ -z "$PW" ] && { echo "pakai: bash deploy/setup-env.sh <DB_PASSWORD> [--force]"; exit 1; }
if [ -f backend/.env ] && [ "$FORCE" != "--force" ]; then echo "backend/.env sudah ada — tidak ditimpa (pakai --force untuk menimpa)"; exit 0; fi
A=$(openssl rand -hex 32); R=$(openssl rand -hex 32)
sed -e "s|__DB_PASSWORD__|$PW|" -e "s|__JWT_ACCESS_SECRET__|$A|" -e "s|__JWT_REFRESH_SECRET__|$R|" deploy/env.server > backend/.env
chmod 600 backend/.env
mkdir -p backend/uploads logs
echo "backend/.env dibuat (DB_USER=db_sinau, PORT=4008, JWT secret baru)."
