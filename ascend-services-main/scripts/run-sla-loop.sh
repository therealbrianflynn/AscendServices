#!/bin/sh
# Repeats the SLA pass for a container that has no external scheduler.
# Failures are logged and the loop keeps going, so one bad pass cannot
# silence later alerts.
set -u
. ./scripts/export-database-url.sh

interval="${SLA_MONITOR_INTERVAL_MINUTES:-15}"
case "$interval" in
  ''|*[!0-9]*) interval=15 ;;
esac
if [ "$interval" -lt 1 ] || [ "$interval" -gt 1440 ]; then
  interval=15
fi

echo "[ascend] sla monitor every ${interval}m"
# Requests already past the alert should email shortly after a deploy,
# rather than waiting out a full interval.
sleep 20

while true; do
  node ./node_modules/tsx/dist/cli.mjs scripts/run-sla-monitor.ts \
    || echo "[ascend] sla pass failed" >&2
  sleep $((interval * 60))
done
