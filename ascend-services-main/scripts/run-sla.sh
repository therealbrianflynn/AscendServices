#!/bin/sh
# One SLA pass. Skips the web entrypoint so this task does not take the migrate lock.
set -e
. ./scripts/export-database-url.sh
exec node ./node_modules/tsx/dist/cli.mjs scripts/run-sla-monitor.ts
