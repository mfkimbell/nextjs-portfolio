# Twilio Voice Agent Implementation Notes

_Last updated: 2026-07-27_

This document captures how the current Twilio-based prototype connects a portfolio visitor's browser microphone to an AI voice agent, and how it is intended to support the eventual two-toucan experience. It is intentionally detailed so the implementation can survive context compaction and be compared against the LiveKit experiment.

## Goal

The user goal is:

1. A visitor clicks a button in the `Talk To The Birds` section.
2. The browser asks for microphone permission.
3. The visitor can speak to an AI agent.
4. The agent can speak back about Mitchell Kimbell, his projects, skills, and experience.
5. Initially, call state/transcripts are logged in the browser console.
6. Later, two 3D toucans should appear to take turns talking back to the visitor.

The Twilio implementation is currently a **frontend/browser slice plus token routes**. It assumes a separate ConversationRelay-capable agent backend exists or will be adapted from `~/repositories/twilio-website-agent` / `~/repositories/twilio-agent-create-app`.

## Current files in this portfolio

### Frontend component

```txt
src/components/TalkToTheBirds.tsx
```

Responsibilities:

- Renders the `Talk To The Birds` section.
- Shows the `Talk to the Toucans` button.
- Calls `useToucanVoiceAgent()`.
- Displays connection status, identity, Call SID, errors, and recent transcript entries.
- Keeps `ToucanScene` rendered below the controls.

### Client hook

```txt
src/hooks/useToucanVoiceAgent.ts
```

Responsibilities:

- Generates a browser participant identity like `toucan-web-{uuid}` after mount.
- Fetches a Twilio Voice token from `/api/twilio/voice-token`.
- Lazily imports `@twilio/voice-sdk` in the browser.
- Creates a Twilio `Device`.
- Calls `device.register()`.
- Starts an outbound browser WebRTC call using `device.connect(...)`.
- Passes params into the Twilio call:
  - `To`
  - `prompt`
  - `languageCode`
  - `agentBackendUrl` when configured
  - `ngrokUrl` when configured
- Tracks call lifecycle:
  - `idle`
  - `connecting`
  - `active`
  - `disconnected`
  - `error`
- Handles call events:
  - `accept`
  - `disconnect`
  - `cancel`
  - `reject`
  - `error`
- Implements mute/unmute and hangup.
- Reads the remote Twilio audio stream with Web Audio `AnalyserNode` to estimate whether the agent is speaking.
- Optionally connects to Twilio Sync stream `session-{CallSid}` for transcript/token events.
- Logs diagnostic events with the prefix:

```txt
[ToucanVoice]
```

### Voice token route

```txt
src/app/api/twilio/voice-token/route.ts
```

Responsibilities:

- Runs server-side in Next.js with `runtime = "nodejs"`.
- Uses the `twilio` Node SDK.
- Mints a Twilio Access Token with a `VoiceGrant`.
- Grants permission to place outgoing browser calls through `TWILIO_TWIML_APP_SID`.
- Never exposes Twilio API secrets to the browser.

Required environment variables:

```env
TWILIO_ACCOUNT_SID=
TWILIO_API_KEY=              # or TWILIO_API_KEY_SID
TWILIO_API_KEY_SECRET=       # or TWILIO_API_SECRET
TWILIO_TWIML_APP_SID=
```

Optional:

```env
TWILIO_ACCESS_TOKEN_TTL=3600
```

Response shape:

```json
{
  "identity": "toucan-web-...",
  "token": "JWT..."
}
```

### Sync token route

```txt
src/app/api/twilio/sync-token/route.ts
```

Responsibilities:

- Runs server-side in Next.js.
- Uses the `twilio` Node SDK.
- Mints a Twilio Access Token with a `SyncGrant`.
- Allows the browser to subscribe to a Twilio Sync stream for call/session events.

Required environment variables:

```env
TWILIO_ACCOUNT_SID=
TWILIO_API_KEY=              # or TWILIO_API_KEY_SID
TWILIO_API_KEY_SECRET=       # or TWILIO_API_SECRET
TWILIO_SYNC_SERVICE_SID=
```

Response shape:

```json
{
  "identity": "toucan-web-...-observer",
  "token": "JWT..."
}
```

### Environment template

```txt
.env.example
```

Documents the current local Twilio setup:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000

TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your_api_key_secret
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

TWILIO_SYNC_SERVICE_SID=ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_ACCESS_TOKEN_TTL=3600

TOUCAN_AGENT_NGROK_URL=your-static-domain.ngrok-free.app
NEXT_PUBLIC_TOUCAN_AGENT_NGROK_URL=https://your-static-domain.ngrok-free.app
NEXT_PUBLIC_TOUCAN_AGENT_BACKEND_URL=http://localhost:3001

NEXT_PUBLIC_TOUCAN_AGENT_TO=portfolio-toucans
NEXT_PUBLIC_TOUCAN_AGENT_LANGUAGE=en-US
NEXT_PUBLIC_TOUCAN_AGENT_INITIAL_PROMPT="Greet the visitor as two friendly toucans on Mitchell Kimbell's portfolio."
```

Note: only `NEXT_PUBLIC_TOUCAN_AGENT_NGROK_URL` is currently consumed by browser code. `TOUCAN_AGENT_NGROK_URL` was included as a server-side/non-public counterpart for future API routes or backend helpers. The ngrok URL is not secret, but Twilio credentials are secret and must never be prefixed with `NEXT_PUBLIC_`.

## Installed packages

Current Twilio-related package dependencies in `package.json`:

```json
{
  "@twilio/voice-sdk": "^2.18.3",
  "twilio": "^6.0.2",
  "twilio-sync": "^4.0.0"
}
```

Package roles:

- `@twilio/voice-sdk`: browser WebRTC calling SDK.
- `twilio`: server-side token generation in Next.js API routes.
- `twilio-sync`: browser subscription to Twilio Sync streams for transcript/event messages.

## Twilio products and how they are used

### Twilio Voice SDK

Product role:

- Provides browser-based WebRTC calling.
- Handles microphone capture, browser call setup, Twilio signaling, and call lifecycle events.

In this app:

- Used in `useToucanVoiceAgent.ts`.
- Dynamically imported to avoid server-side rendering problems.
- Uses a short-lived Twilio Access Token from `/api/twilio/voice-token`.
- Creates a `Device`:

```ts
const device = new Device(token, { logLevel: 1 });
await device.register();
```

- Starts a call:

```ts
const call = await device.connect({ params: connectParams });
```

The `params` become request parameters available to the TwiML App's voice webhook.

### Twilio Access Tokens and VoiceGrant

Product role:

- Authenticate browser clients without exposing permanent Twilio credentials.
- Scope what a browser can do.

In this app:

- `/api/twilio/voice-token` creates a JWT with `VoiceGrant`.
- The grant includes:

```ts
outgoingApplicationSid: TWILIO_TWIML_APP_SID
incomingAllow: false
```

This means the browser can initiate outgoing calls using that TwiML App, but is not configured to receive inbound Twilio calls.

### TwiML App

Product role:

- A Twilio Console resource that maps a browser Voice SDK call to a webhook URL.
- When `Device.connect()` starts a call, Twilio invokes the TwiML App's Voice Request URL.

In this architecture:

- `TWILIO_TWIML_APP_SID` is embedded in the VoiceGrant.
- The TwiML App Voice Request URL should point to the agent backend:

```txt
https://<ngrok-domain>/call
```

For local testing, ngrok exposes the local backend to Twilio.

### Twilio ConversationRelay

Product role:

- Twilio Voice feature that bridges a live call to an AI agent backend over WebSocket.
- Handles the telephony/browser-call side, STT/TTS provider configuration, and realtime voice prompt events.

Expected backend flow:

1. Twilio invokes backend `/call` via the TwiML App.
2. Backend returns TwiML similar to:

```xml
<Response>
  <Connect>
    <ConversationRelay
      url="wss://<ngrok-domain>/conversation-relay"
      transcriptionProvider="Deepgram"
      ttsProvider="ElevenLabs"
      partialPrompts="true"
      interruptible="true"
    />
  </Connect>
</Response>
```

3. Twilio opens a WebSocket to `/conversation-relay`.
4. Twilio sends setup/prompt/interruption/etc. messages to the backend.
5. Backend sends text tokens back to Twilio.
6. Twilio converts the text to speech and plays it into the browser call.

The portfolio itself does not currently implement `/call` or `/conversation-relay`. Those should live in a separate Node/Express backend, using either:

- `~/repositories/twilio-website-agent`, or
- generated backend code from `npx create-twilio-agent`, or
- a custom server using `twilio-agent-connect`.

### Twilio Sync

Product role:

- Realtime data service for browser-visible call/session events.
- Useful because the Voice SDK call does not automatically expose the backend's LLM token stream or transcript stream to the browser UI.

Expected backend pattern from `twilio-website-agent`:

- Backend publishes events to Sync stream:

```txt
session-{CallSid}
```

- Browser subscribes to that stream after the call is accepted and a `CallSid` is known.

Expected event examples:

```json
{
  "type": "transcription",
  "role": "user",
  "text": "Tell me about Mitchell's projects",
  "isFinal": true
}
```

```json
{
  "type": "transcription",
  "role": "assistant",
  "text": "Mitchell has built AI and cloud-native systems...",
  "isFinal": true
}
```

```json
{
  "type": "token",
  "token": "Mitchell",
  "isFinal": false
}
```

The frontend currently logs all Sync messages and displays final transcription entries in the section.

### ngrok

Product role:

- Exposes a local development backend to Twilio.
- Needed because Twilio's cloud must reach `/call` over HTTPS and `/conversation-relay` over WSS.

Local dev shape:

```txt
Portfolio frontend:        http://localhost:3000
Agent backend:             http://localhost:3001
ngrok public backend URL:  https://your-domain.ngrok-free.app
Twilio TwiML App URL:      https://your-domain.ngrok-free.app/call
ConversationRelay WS:      wss://your-domain.ngrok-free.app/conversation-relay
```

## End-to-end Twilio flow

```txt
Visitor clicks Talk to the Toucans
  ↓
Browser calls /api/twilio/voice-token
  ↓
Next.js server route mints Twilio Voice JWT
  ↓
Browser creates @twilio/voice-sdk Device
  ↓
Browser calls Device.connect(params)
  ↓
Twilio uses VoiceGrant outgoingApplicationSid to find TwiML App
  ↓
Twilio invokes TwiML App Voice Request URL: https://<ngrok>/call
  ↓
Agent backend /call returns TwiML with <ConversationRelay>
  ↓
Twilio connects to backend WebSocket: wss://<ngrok>/conversation-relay
  ↓
Twilio sends setup/prompt/interruption events to backend
  ↓
Backend sends user text to LLM
  ↓
LLM streams response text back to backend
  ↓
Backend sends text tokens to Twilio ConversationRelay
  ↓
Twilio TTS speaks tokens into the browser call
  ↓
Optional: backend publishes tokens/transcripts to Twilio Sync stream session-{CallSid}
  ↓
Browser subscribes with twilio-sync and logs/displays transcript events
```

## How the current Twilio implementation supports toucan animation

Currently implemented:

- `useToucanVoiceAgent` measures remote audio RMS from the Twilio call's remote media stream.
- It exposes:

```ts
isAgentSpeaking
agentAudioLevel
```

This can drive future beak animation:

```txt
isAgentSpeaking === true → flap active toucan beak
agentAudioLevel → map audio amplitude to LowerBeak rotation/animation speed
```

Not yet implemented:

- Two separate toucan speaker state.
- Parsing assistant output into left/right speaker lines.
- Sending structured speaker events from backend to frontend.
- Triggering only the left or right toucan's beak.

## Twilio self-hosting note

Twilio does not have a comparable self-hosted media-server option for this project. We can self-host our application pieces:

```txt
agent backend
/call route
/conversation-relay WebSocket route
LLM orchestration
tools/prompts/context
```

But the following remain Twilio-hosted services:

```txt
Twilio Voice SDK signaling/media infrastructure
TwiML App routing
ConversationRelay
Twilio Voice media routing
Twilio Sync
Twilio phone number/SIP platform
```

So the practical Twilio model is:

```txt
browser + our backend ↔ Twilio Cloud ↔ our backend/LLM
```

This differs from LiveKit, where the media/SFU layer can be either LiveKit Cloud or self-hosted.

## Speech-to-speech / hybrid note within Twilio

The current Twilio design is ConversationRelay-oriented: the backend streams text tokens to ConversationRelay and Twilio handles TTS into the call. That is a good fit for a text-first AI pipeline and frontend transcript/Speaker events via Sync.

A more speech-to-speech or per-toucan-voice system would require more custom orchestration outside the basic current flow, such as generating separate TTS audio per toucan and playing it into the call or browser. That is possible in principle, but it is not the simple path with the current Twilio ConversationRelay prototype.

Audio-quality note: speech-to-speech systems often sound better in conversational naturalness because the model can preserve timing, emotion, and interruption flow. However, dedicated TTS can still sound extremely polished and may be better for consistent character voices. For two toucans, stable per-character TTS voices may matter more than pure speech-to-speech expressiveness.

## Two-toucan plan within Twilio

Recommended first design:

- Keep one Twilio call and one backend LLM session.
- Prompt the LLM to roleplay two toucans, e.g. Mango and Kiwi.
- Require structured response tags or JSON internally:

```txt
<left>Mango: Mitchell builds cloud-native AI systems.</left>
<right>Kiwi: And he has a strong portfolio of automation projects.</right>
```

Backend should:

1. Parse speaker-tagged lines.
2. Send clean text to Twilio TTS without literal tags.
3. Publish speaker events to the browser through Twilio Sync:

```json
{
  "type": "toucanLine",
  "speaker": "left",
  "text": "Mitchell builds cloud-native AI systems."
}
```

4. Frontend animates the relevant toucan.

Caveat: with ConversationRelay, the call generally has one active TTS voice configuration. Distinct visual toucans are easy; truly distinct voices per toucan may be harder without a custom multi-TTS playback pipeline.

## Strengths of the Twilio approach

- Excellent if we later want real phone calls, SMS, WhatsApp, RCS, or contact-center handoff.
- Browser voice call is straightforward with `@twilio/voice-sdk`.
- ConversationRelay handles voice-call integration, STT/TTS configuration, and interruption events.
- Existing local reference repos already implement the backend patterns.
- Twilio Sync provides a hosted realtime data channel to the browser.

## Weaknesses of the Twilio approach for this portfolio

- It is phone-call/Twilio-app oriented rather than website-room oriented.
- Requires Twilio Console setup: API key, TwiML App, maybe Sync Service, ConversationRelay backend, provider configuration.
- Local development requires ngrok because Twilio must reach the backend.
- Next.js alone is not enough for the long-lived ConversationRelay WebSocket on many serverless hosts.
- Transcript and UI state require an extra channel such as Twilio Sync.
- Two animated toucans require a custom speaker protocol.
- Distinct voices per toucan are not first-class in the current single ConversationRelay session design.

## Latest comparison decision involving Twilio

As of 2026-07-27, the LiveKit experiment will start with:

```txt
LiveKit Cloud + STT → LLM → TTS + one orchestrating two-toucan agent
```

This does not remove the Twilio prototype. It means the first LiveKit comparison target is a controlled text-first voice pipeline rather than pure speech-to-speech.

Relevant contrast:

```txt
Twilio current path:
  browser Voice SDK → TwiML App → ConversationRelay → self-hosted agent backend

LiveKit experiment path:
  browser joins LiveKit Cloud room → hosted LiveKit Cloud agent joins room → STT/LLM/TTS pipeline
```

Hosting contrast:

- Twilio hosts Voice, TwiML App routing, ConversationRelay, and Sync.
- We host the Twilio agent backend.
- LiveKit Cloud can host both the realtime room/media layer and the agent deployment.
- For local development, LiveKit Cloud may avoid ngrok for the core voice loop because the browser and agent connect outbound to LiveKit Cloud.

## Documentation maintenance rule

Whenever we learn new context or make a decision, update this document and the comparison document:

```txt
docs/voice-agents/twilio-vs-livekit-comparison.md
```

The LiveKit counterpart document is:

```txt
docs/voice-agents/livekit-voice-agent-implementation.md
```

## Current implementation status

- Frontend voice button: implemented.
- Voice token route: implemented.
- Sync token route: implemented.
- Console call logging: implemented.
- Sync transcript logging: implemented when backend publishes expected stream events.
- Agent backend: not implemented in this repo.
- Twilio Console/ngrok setup: required externally.
- Two-toucan speaker events: not implemented.
- Beak animation wired to audio state: not implemented.

## Reference repos used

```txt
~/repositories/cr-web-demo
~/repositories/twilio-website-agent
~/repositories/twilio-agent-create-app
~/repositories/ramp
```

Most relevant Twilio files inspected:

```txt
cr-web-demo/apps/cr/app/hooks/use-webrtc-connection.ts
cr-web-demo/apps/cr/app/api/token/route.ts
cr-web-demo/apps/cr/app/hooks/use-sync.ts
cr-web-demo/apps/cr/app/components/VoiceAgentDemo.tsx

twilio-website-agent/src/app.ts
twilio-website-agent/src/routes/call.ts
twilio-website-agent/src/routes/conversationRelay.ts
twilio-website-agent/src/routes/syncToken.ts
twilio-website-agent/src/routes/sessionMessage.ts
twilio-website-agent/src/lib/sync.ts
twilio-website-agent/src/llm.ts

twilio-agent-create-app/generators/core.js
twilio-agent-create-app/generators/routes.js
twilio-agent-create-app/generators/tools.js

ramp/packages/browser-comms/src/use-browser-voice.ts
```
