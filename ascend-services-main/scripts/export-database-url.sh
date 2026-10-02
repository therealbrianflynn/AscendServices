# Assemble DATABASE_URL when ECS injected DB_* instead of a full URL.
# Source this from a container entrypoint; do not execute it directly.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ascend] building DATABASE_URL from DB_*" >&2
  DATABASE_URL="$(node ./scripts/resolve-database-url.mjs)" || {
    echo "[ascend] could not build DATABASE_URL" >&2
    exit 1
  }
  if [ -z "${DATABASE_URL}" ]; then
    echo "[ascend] DATABASE_URL is empty" >&2
    exit 1
  fi
  export DATABASE_URL
fi
