#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local" >&2
  exit 1
fi

set -a
source .env.local
set +a

backup=$(mktemp)
mv .env.local "$backup"
restore_env() { mv "$backup" .env.local; }
trap restore_env EXIT

bunx --yes vercel deploy --temporary --yes --build-env "NEXT_PUBLIC_MAPTILER_KEY=$NEXT_PUBLIC_MAPTILER_KEY" --logs
