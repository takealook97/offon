#!/usr/bin/env bash
# Dumps the remote database and restores it into the local Docker Postgres.
# Run it with: pnpm db:local:sync
#
# Assumes:
#   - Docker is running
#   - the postgres service is up, or can be started automatically
#   - .env.local holds the source DATABASE_URL to dump from
#
# The local connection URL, fixed: postgresql://offon:offon@localhost:55432/offon
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "ERROR: no .env.local. It has to carry the DATABASE_URL to dump from." >&2
  exit 1
fi

RDS_URL_RAW=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
if [ -z "${RDS_URL_RAW:-}" ]; then
  echo "ERROR: could not read DATABASE_URL from .env.local." >&2
  exit 1
fi

# Query parameters that only Prisma understands are stripped, since libpq and pg_dump
# reject them. sslmode is kept, because the remote requires TLS.
RDS_URL=$(python3 -c "
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
u = urlsplit(sys.argv[1])
kept = [(k, v) for k, v in parse_qsl(u.query, keep_blank_values=True) if k != 'schema']
print(urlunsplit((u.scheme, u.netloc, u.path, urlencode(kept), u.fragment)))
" "$RDS_URL_RAW")

LOCAL_USER="offon"
LOCAL_DB="offon"
LOCAL_CONTAINER="offon-local-pg"

echo "-> checking and starting the local Postgres container..."
docker compose up -d postgres

echo "-> waiting for Postgres to be ready..."
for i in {1..30}; do
  if docker exec "$LOCAL_CONTAINER" pg_isready -U "$LOCAL_USER" -d "$LOCAL_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

DUMP_PATH="/tmp/offon-rds-dump.pgd"
echo "-> dumping the remote database to $DUMP_PATH..."
docker run --rm --network host postgres:18 \
  pg_dump "$RDS_URL" \
    --clean --if-exists \
    --no-owner --no-privileges \
    --format=custom \
  > "$DUMP_PATH"

echo "-> restoring into the local Postgres..."
docker exec -i "$LOCAL_CONTAINER" pg_restore \
  --clean --if-exists \
  --no-owner --no-privileges \
  -U "$LOCAL_USER" -d "$LOCAL_DB" \
  < "$DUMP_PATH" || echo "pg_restore reported non-fatal warnings, such as failing to drop objects that were not there. Check the result."

echo "Local database synced."
echo "  connect with: postgresql://offon:offon@localhost:55432/offon"
echo "  check it with: docker exec -it $LOCAL_CONTAINER psql -U offon -d offon -c 'SELECT COUNT(*) FROM members;'"
