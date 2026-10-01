# Bear ConversationRelay Agent

Standalone TypeScript service for Twilio ConversationRelay. It loads configuration from `../nextjs/.env`; it does not load an `agent/.env` file.

## Requirements

- Node.js 20 or later and npm
- A public HTTPS endpoint for the selected environment. Twilio connects to the corresponding WSS endpoint.
- A Twilio account enabled for ConversationRelay and a valid `TWILIO_AUTH_TOKEN` for production webhook and WebSocket signature validation.
- ConversationRelay access with the native ElevenLabs provider enabled. This service does not need an `ELEVENLABS_API_KEY`.
- Optional: an OpenAI API key and a model that supports Chat Completions for dynamic answers.

Add these values to `nextjs/.env`:

```dotenv
APP_ENV=DEV
DEV_AGENT_BASE_URL=https://your-dev-agent.example.com
PROD_AGENT_BASE_URL=https://your-production-agent.example.com
PORT=3001
# Both bears intentionally share Maple's ConversationRelay voice.
SMOKEY_ELEVENLABS_VOICE_ID=oubi7HGxNVjXMnWLgwBT
MAPLE_ELEVENLABS_VOICE_ID=oubi7HGxNVjXMnWLgwBT
# Optional. Without a key, fixed greetings work and final prompts receive a two-bear configuration message.
OPENAI_API_KEY=sk-...
# Optional; defaults to gpt-4.1-mini when OPENAI_API_KEY is set.
OPENAI_MODEL=gpt-4.1-mini
TWILIO_AUTH_TOKEN=your_twilio_auth_token
# Browser origin allowed to read the SSE endpoint.
PORTFOLIO_ORIGIN=http://localhost:3000
# Required only in PROD. The browser supplies it as ?token=... on /events/:callSid.
BEAR_EVENT_TOKEN=replace-with-a-long-random-secret

SESSION_IDLE_TTL_MS=900000
```

`APP_ENV` must be exactly `DEV` or `PROD`. `DEV` selects `DEV_AGENT_BASE_URL`; `PROD` selects `PROD_AGENT_BASE_URL`. The selected URL must use `https://` because `/call` converts it to a `wss://.../conversation-relay` URL for Twilio.

## Run

```sh
cd agent
npm install
npm run dev
```

For a production build:

```sh
cd agent
npm install
npm run build
npm start
```

Endpoints:

- `GET /health` returns service health.
- `GET /events/:callSid` holds a server-sent events connection for an active relay call. It emits `bear.speech.started` just before each text message, with `{ callSid, bear, speaker, text }`; `speaker` is `back_left_log` for `bear1` (Smokey) and `back_right_log` for `bear2` (Maple). It emits `bear.speech.interrupted` when ConversationRelay sends an interrupt for the active line.
- `POST /call` returns ConversationRelay TwiML. Configure this endpoint as the TwiML App voice URL or return it from your calling flow. When `TWILIO_AUTH_TOKEN` is set, Twilio must sign this webhook request.
- `WSS /conversation-relay` is Twilio's ConversationRelay endpoint; do not expose it to browsers.

`POST /call` configures ConversationRelay's native ElevenLabs provider with `ttsProvider="ElevenLabs"`, `ttsLanguage="en-US"`, Smokey's voice, and an `en-US` Language profile. Each bear line is sent as an interruptible ConversationRelay `text` message with `lang: "en-US"` and `last: true`; no audio assets, direct ElevenLabs fetches, or ElevenLabs API key are used. At every confirmed handoff, `bear.speech.queued` assigns frontend animation ownership before the next Twilio text token is sent; the retrospective `tokensPlayed` event then confirms `bear.speech.started`. On setup, Smokey's preemptible introduction waits until `tokensPlayed` confirms `Mitchell Kimbell` before Maple corrects the title. Smokey's next complete utterance begins with the deterministic uptake `Right, staff engineer.` Final caller prompts use sequential OpenAI completions: Smokey leads, Maple receives the caller prompt and Smokey's lead, and every Maple interruption includes a compact handoff context that the application inserts into Smokey's acknowledgement before his generated continuation. Each bear keeps a separate bounded history. Without `OPENAI_API_KEY`, the service remains available and returns a clear two-bear configuration fallback.

Both bear personas use the same ElevenLabs voice and `en-US` language profile. Maple can either follow Smokey or preempt him at an exact phrase selected by the structured reply planner.

`GET /events/:callSid` is unauthenticated in `DEV` and permits browser CORS only from `PORTFOLIO_ORIGIN`, which defaults to `http://localhost:3000`. In `PROD`, `BEAR_EVENT_TOKEN` is required and the browser must connect with `/events/:callSid?token=<BEAR_EVENT_TOKEN>`. This shared query secret is a temporary production control; replace it with a short-lived signed capability before exposing the endpoint broadly. The service uses ConversationRelay `tokensPlayed` events to publish playback-driven bear start, end, and preemption events.

For Heroku, set these config vars: `APP_ENV`, `PROD_AGENT_BASE_URL`, `SMOKEY_ELEVENLABS_VOICE_ID`, `MAPLE_ELEVENLABS_VOICE_ID`, `TWILIO_AUTH_TOKEN`, `PORTFOLIO_ORIGIN`, and `BEAR_EVENT_TOKEN`. Heroku provides `PORT`; set `OPENAI_API_KEY` and `OPENAI_MODEL` when dynamic answers are required. Do not set `ELEVENLABS_API_KEY` for this native-provider flow.

`PROD` always requires a current `TWILIO_AUTH_TOKEN` and validates both the `/call` webhook and the WebSocket handshake. `DEV` skips signature validation by default for local ngrok setup; set `TWILIO_VALIDATE_SIGNATURES=true` to validate it in DEV as well. Signature URLs are reconstructed from the selected public agent base URL rather than proxy-provided host/protocol headers.
