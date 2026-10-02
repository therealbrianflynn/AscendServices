#!/bin/sh
set -e
. ./scripts/export-database-url.sh
echo "[ascend] waiting for database..."
# Invoke the bundled binaries directly: the runtime image must never reach out to
# the npm registry (corepack) to bootstrap a package manager on container start.
# Simple retry loop for migrate deploy
i=0
until ./node_modules/.bin/prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[ascend] prisma migrate deploy failed after retries" >&2
    exit 1
  fi
  echo "[ascend] migrate not ready, retry $i/30..."
  sleep 2
done
echo "[ascend] migrations applied"
exec "$@"
