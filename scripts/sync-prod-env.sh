#!/usr/bin/env bash
# Copies the keys production is missing from nextjs/.env into Heroku (bear
# agent + LiveKit workers) and Vercel (the site). Values never get printed.
# Run from the repo root on your Mac:  bash scripts/sync-prod-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=nextjs/.env
HEROKU_APP=mitchell-portfolio-bears

val() { # last definition wins, leading/trailing spaces and quotes stripped
  grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -1 | sed -E "s/^[[:space:]]*$1=//; s/[[:space:]]+$//; s/^['\"]//; s/['\"]$//" || true
}
need() { local v; v="$(val "$1")"; [ -n "$v" ] || { echo "missing $1 in $ENV_FILE" >&2; exit 1; }; printf %s "$v"; }

LIVEKIT_URL="$(need LIVEKIT_URL)"
LIVEKIT_API_KEY="$(need LIVEKIT_API_KEY)"
LIVEKIT_API_SECRET="$(need LIVEKIT_API_SECRET)"
OPENAI_API_KEY="$(need OPENAI_API_KEY)"
ELEVEN="$(val ELEVEN_API_KEY)"; [ -n "$ELEVEN" ] || ELEVEN="$(need ELEVENLABS_API_KEY)"

echo "== Heroku ($HEROKU_APP)"
heroku_vars=(
  "LIVEKIT_URL=$LIVEKIT_URL" "LIVEKIT_API_KEY=$LIVEKIT_API_KEY" "LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET"
  "OPENAI_API_KEY=$OPENAI_API_KEY" "ELEVEN_API_KEY=$ELEVEN"
)
for k in LIVEKIT_SMOKEY_ELEVENLABS_VOICE_ID LIVEKIT_MAPLE_ELEVENLABS_VOICE_ID LIVEKIT_MAPLE_OVERLAP_MS; do
  v="$(val "$k")"
  if [ -n "$v" ]; then heroku_vars+=("$k=$v"); fi
done
heroku config:set -a "$HEROKU_APP" "${heroku_vars[@]}" >/dev/null
echo "set: $(printf '%s\n' "${heroku_vars[@]}" | cut -d= -f1 | tr '\n' ' ')"

echo "== Vercel (production)"
cd nextjs
for k in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY; do
  vercel env rm "$k" production -y >/dev/null 2>&1 || true
  printf %s "${!k}" | vercel env add "$k" production >/dev/null
  echo "set: $k"
done
echo "Done. Vercel only picks these up on the next production deploy."
