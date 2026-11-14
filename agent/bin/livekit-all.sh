#!/usr/bin/env bash
# Runs both bears and the coordinator in one dyno. If any of them exits, stop
# the rest and exit too, so Heroku restarts the whole dyno cleanly.
set -u
cd "$(dirname "$0")/.."
LIVEKIT_BEAR_ID=smokey LIVEKIT_AGENT_NAME=smokey-agent node dist/livekit-agent.js start & smokey=$!
LIVEKIT_BEAR_ID=maple LIVEKIT_AGENT_NAME=maple-agent node dist/livekit-agent.js start & maple=$!
node dist/livekit-coordinator.js start & coordinator=$!
stop() { kill "$smokey" "$maple" "$coordinator" 2>/dev/null; wait; }
trap 'stop; exit 0' TERM INT
wait -n
code=$?
echo "a LiveKit worker exited ($code); stopping the others" >&2
stop
exit "$code"
