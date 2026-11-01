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
# The live site has no separate scheduler. Check overdue help requests in this
# container unless a deploy already runs `scripts/run-sla.sh` on its own.
if [ "${SLA_MONITOR_EMBEDDED:-true}" != "false" ]; then
  sh ./scripts/run-sla-loop.sh &
fi
exec "$@"
