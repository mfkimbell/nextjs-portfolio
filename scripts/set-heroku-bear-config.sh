#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/nextjs/.env"
HEROKU_APP="${HEROKU_APP:-mitchell-portfolio-bears}"
HEROKU_URL="${HEROKU_URL:-https://mitchell-portfolio-bears-fdbe68699790.herokuapp.com}"

if ! command -v heroku >/dev/null 2>&1; then
  printf '%s\n' "Heroku CLI is not installed or is not on PATH." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  printf '%s\n' "Missing $ENV_FILE" >&2
  exit 1
fi

# Load the ignored local env file without printing its contents.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${TWILIO_ACCOUNT_SID:?Missing TWILIO_ACCOUNT_SID in nextjs/.env}"
: "${TWILIO_AUTH_TOKEN:?Missing TWILIO_AUTH_TOKEN in nextjs/.env}"
: "${OPENAI_API_KEY:?Missing OPENAI_API_KEY in nextjs/.env}"
: "${BEAR_EVENT_TOKEN:?Missing BEAR_EVENT_TOKEN in nextjs/.env}"

OPENAI_MODEL="${OPENAI_MODEL:-gpt-4.1-mini}"
MAPLE_ELEVENLABS_VOICE_ID="${MAPLE_ELEVENLABS_VOICE_ID:-oubi7HGxNVjXMnWLgwBT}"
SMOKEY_ELEVENLABS_VOICE_ID="$MAPLE_ELEVENLABS_VOICE_ID"
SMOKEY_TTS_LANGUAGE="${SMOKEY_TTS_LANGUAGE:-en-US}"
MAPLE_TTS_LANGUAGE="$SMOKEY_TTS_LANGUAGE"

heroku config:set \
  "APP_ENV=PROD" \
  "PROD_AGENT_BASE_URL=$HEROKU_URL" \
  "TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID" \
  "TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN" \
  "OPENAI_API_KEY=$OPENAI_API_KEY" \
  "OPENAI_MODEL=$OPENAI_MODEL" \
  "SMOKEY_ELEVENLABS_VOICE_ID=$SMOKEY_ELEVENLABS_VOICE_ID" \
  "MAPLE_ELEVENLABS_VOICE_ID=$MAPLE_ELEVENLABS_VOICE_ID" \
  "SMOKEY_TTS_LANGUAGE=$SMOKEY_TTS_LANGUAGE" \
  "MAPLE_TTS_LANGUAGE=$MAPLE_TTS_LANGUAGE" \
  "PORTFOLIO_ORIGIN=https://mitchellkimbell.com" \
  "BEAR_EVENT_TOKEN=$BEAR_EVENT_TOKEN" \
  --app "$HEROKU_APP"

printf 'Configured Heroku app: %s\n' "$HEROKU_APP"
printf 'Agent URL: %s\n' "$HEROKU_URL"
