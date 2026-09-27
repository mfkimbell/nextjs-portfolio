# Bear ConversationRelay Agent

Standalone TypeScript service for Twilio ConversationRelay. It loads its configuration from `../nextjs/.env`; it does not load an `agent/.env` file.

## Requirements

- Node.js 20 or later and npm
- A public HTTPS endpoint for the selected environment. Twilio connects to the corresponding WSS endpoint.
- A Twilio account enabled for ConversationRelay and a valid `TWILIO_AUTH_TOKEN` for production webhook and WebSocket signature validation.
- Optional: an OpenAI API key and a model that supports Chat Completions JSON mode for dynamic answers.

Add these values to `nextjs/.env`:

```dotenv
APP_ENV=DEV
DEV_AGENT_BASE_URL=https://your-dev-agent.example.com
PROD_AGENT_BASE_URL=https://your-production-agent.example.com
PORT=3001
# Optional. Without a key, fixed greetings work and final prompts receive a two-bear configuration message.
OPENAI_API_KEY=sk-...
# Optional; defaults to gpt-4.1-mini when OPENAI_API_KEY is set.
OPENAI_MODEL=gpt-4.1-mini
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# Optional voice and session settings; defaults are shown in nextjs/.env.example.
SMOKEY_TTS_LANGUAGE=en-US
SMOKEY_TTS_PROVIDER=Google
SMOKEY_TTS_VOICE=en-US-Journey-D
MAPLE_TTS_LANGUAGE=en-GB
MAPLE_TTS_PROVIDER=Google
MAPLE_TTS_VOICE=en-GB-Neural2-B
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
- `POST /call` returns the ConversationRelay TwiML. Configure this endpoint as the TwiML App voice URL or return it from your calling flow. When `TWILIO_AUTH_TOKEN` is set, Twilio must sign this webhook request.
- `WSS /conversation-relay` is Twilio's ConversationRelay endpoint; do not expose it to browsers.

On setup, Smokey sends the canonical preemptible cycle: the unexpected-company introduction, the senior-engineer reference, `Earlier he`, and the already queued `led several projects that...` suffix. After a bounded 750 ms server timer, Maple interrupts in a separate cycle: "Actually, Smokey, Mitch is a staff engineer." Smokey then sends separate apology and post-pause recovery cycles ending with "Mitch. So, what would you like to know?" Final caller prompts use OpenAI when configured. Without `OPENAI_API_KEY`, the service remains available and returns a clear two-bear configuration fallback. LLM responses are JSON-validated into one line for each bear and sent as two consecutive complete talk cycles.

`PROD` always requires a current `TWILIO_AUTH_TOKEN` and validates both the `/call` webhook and the WebSocket handshake. `DEV` skips signature validation by default for local ngrok setup; set `TWILIO_VALIDATE_SIGNATURES=true` to validate it in DEV as well. Signature URLs are reconstructed from the selected public agent base URL rather than proxy-provided host/protocol headers.
