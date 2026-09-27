#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/nextjs/.env"
VERCEL_DIR="${VERCEL_DIR:-$ROOT_DIR/nextjs}"

if ! command -v vercel >/dev/null 2>&1; then
  printf '%s\n' "Vercel CLI is not installed or is not on PATH." >&2
  printf '%s\n' "Install it with: npm install --global vercel" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  printf '%s\n' "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${TWILIO_AUTH_TOKEN:?Missing TWILIO_AUTH_TOKEN in nextjs/.env}"
: "${TWILIO_API_KEY_PROD:?Missing TWILIO_API_KEY_PROD in nextjs/.env}"
: "${TWILIO_API_KEY_SECRET_PROD:?Missing TWILIO_API_KEY_SECRET_PROD in nextjs/.env}"
: "${TWILIO_TWIML_APP_SID_PROD:?Missing TWILIO_TWIML_APP_SID_PROD in nextjs/.env}"
: "${PROD_AGENT_BASE_URL:?Missing PROD_AGENT_BASE_URL in nextjs/.env}"
: "${BEAR_EVENT_TOKEN:?Missing BEAR_EVENT_TOKEN in nextjs/.env}"

cd "$VERCEL_DIR"

set_value() {
  local name="$1"
  local value="$2"
  # Replace the production value if it already exists, then add the new value
  # through stdin so the secret never appears in this script or shell history.
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production >/dev/null
}

printf '%s\n' "Checking Vercel project authentication..."
vercel whoami >/dev/null

set_value APP_ENV PROD
set_value NEXT_PUBLIC_BASE_URL https://mitchellkimbell.com
set_value PROD_AGENT_BASE_URL "$PROD_AGENT_BASE_URL"
set_value NEXT_PUBLIC_BEAR_AGENT_BASE_URL "$PROD_AGENT_BASE_URL"
set_value NEXT_PUBLIC_BEAR_EVENT_TOKEN "$BEAR_EVENT_TOKEN"
set_value PRODUCTION_BASE_URL https://mitchellkimbell.com
set_value TWILIO_ACCOUNT_SID "$TWILIO_ACCOUNT_SID"
set_value TWILIO_AUTH_TOKEN "$TWILIO_AUTH_TOKEN"
set_value TWILIO_API_KEY_PROD "$TWILIO_API_KEY_PROD"
set_value TWILIO_API_KEY_SECRET_PROD "$TWILIO_API_KEY_SECRET_PROD"
set_value TWILIO_TWIML_APP_SID_PROD "$TWILIO_TWIML_APP_SID_PROD"
set_value TWILIO_ACCESS_TOKEN_TTL "900"

printf '%s\n' "Vercel production bear configuration updated."
printf '%s\n' "Redeploy with: vercel --prod"
