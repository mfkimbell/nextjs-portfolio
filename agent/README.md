# Bear ConversationRelay Agent

Standalone TypeScript service for Twilio ConversationRelay. It loads its configuration from `../nextjs/.env`; it does not load an `agent/.env` file.

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
# Optional native ConversationRelay ElevenLabs voice; this is the default.
SMOKEY_ELEVENLABS_VOICE_ID=75DchiXtNUXnu3lra8pV
# Documented for a future distinct-voice transport; see the limitation below.
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
- `POST /call` returns the ConversationRelay TwiML. Configure this endpoint as the TwiML App voice URL or return it from your calling flow. When `TWILIO_AUTH_TOKEN` is set, Twilio must sign this webhook request.
- `WSS /conversation-relay` is Twilio's ConversationRelay endpoint; do not expose it to browsers.

`POST /call` configures ConversationRelay's native ElevenLabs provider with `ttsProvider="ElevenLabs"`, `ttsLanguage="en-US"`, Smokey's voice, and an `en-US` Language profile. Each bear line is sent as an interruptible ConversationRelay `text` message with `lang: "en-US"` and `last: true`; no audio assets, direct ElevenLabs fetches, or ElevenLabs API key are used. On setup, Smokey's preemptible introduction is followed after bounded 750 ms timers by Maple's correction and Smokey's recovery. Final caller prompts use sequential OpenAI completions: Smokey leads, then Maple receives the caller prompt and Smokey's lead for a concise follow-up or correction. Each bear keeps a separate bounded history. Without `OPENAI_API_KEY`, the service remains available and returns a clear two-bear configuration fallback.

ConversationRelay's native provider selects the bear voice through the configured language profile: Smokey uses `en-US`, Maple uses `en-GB`. Test Maple's resulting pronunciation; if it is unacceptable, direct TTS/BYOTTS is the next transport option.

`GET /events/:callSid` is unauthenticated in `DEV` and permits browser CORS only from `PORTFOLIO_ORIGIN`, which defaults to `http://localhost:3000`. In `PROD`, `BEAR_EVENT_TOKEN` is required and the browser must connect with `/events/:callSid?token=<BEAR_EVENT_TOKEN>`. This shared query secret is a temporary production control; replace it with a short-lived signed capability before exposing the endpoint broadly. ConversationRelay does not provide a playback-complete signal used by this service, so it does not fabricate `bear.speech.ended`; it publishes an interruption only when the relay explicitly reports one.

For Heroku, set these config vars: `APP_ENV`, `PROD_AGENT_BASE_URL`, `SMOKEY_ELEVENLABS_VOICE_ID`, `MAPLE_ELEVENLABS_VOICE_ID`, `TWILIO_AUTH_TOKEN`, `PORTFOLIO_ORIGIN`, and `BEAR_EVENT_TOKEN`. Heroku provides `PORT`; set `OPENAI_API_KEY` and `OPENAI_MODEL` when dynamic answers are required. Do not set `ELEVENLABS_API_KEY` for this native-provider flow.

`PROD` always requires a current `TWILIO_AUTH_TOKEN` and validates both the `/call` webhook and the WebSocket handshake. `DEV` skips signature validation by default for local ngrok setup; set `TWILIO_VALIDATE_SIGNATURES=true` to validate it in DEV as well. Signature URLs are reconstructed from the selected public agent base URL rather than proxy-provided host/protocol headers.
