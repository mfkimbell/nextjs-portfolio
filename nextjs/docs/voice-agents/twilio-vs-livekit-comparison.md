# Twilio vs LiveKit Voice Agent Comparison

_Last updated: 2026-07-27_

This is the running comparison document for the portfolio voice-agent project. It should be updated after every implementation milestone so we can keep comparing Twilio and LiveKit as context compacts.

## Project goal being compared

Build an interactive portfolio section where a visitor can speak to an AI agent and eventually see two toucans talk back about Mitchell Kimbell.

Near-term MVP:

1. Button in the `Talk To The Birds` section.
2. Browser asks for microphone permission.
3. User speaks.
4. AI responds with audio.
5. Console logs connection events and transcripts.

Later target:

1. Two toucan personas.
2. Active speaker state: left toucan vs right toucan.
3. Beak animation driven by audio or speaking state.
4. Portfolio-specific tools/context.

## Current branch

```txt
experiment/livekit-toucans
```

This branch was created to research and prototype the LiveKit version side-by-side with the Twilio implementation.

## Current Twilio status

See the detailed Twilio architecture doc:

```txt
docs/voice-agents/twilio-voice-agent-implementation.md
```

Summary:

- Twilio frontend/token slice exists in this portfolio.
- Twilio backend still needs to be run separately.
- It uses browser WebRTC through Twilio Voice SDK and expects ConversationRelay on the backend.
- Optional frontend transcript logging uses Twilio Sync.

## LiveKit research summary

Research sources used:

- `https://docs.livekit.io/llms.txt`
- `https://docs.livekit.io/llms-full.txt`
- `https://docs.livekit.io/agents/start/voice-ai.md`
- `https://docs.livekit.io/agents/start/frontend.md`
- `https://docs.livekit.io/frontends/start/starter-apps/react.md`
- `https://docs.livekit.io/frontends/build/authentication.md`
- `https://docs.livekit.io/frontends/build/authentication/custom.md`
- `https://docs.livekit.io/home/client/connect.md`
- `https://docs.livekit.io/home/server/generating-tokens.md`
- `https://docs.livekit.io/home/client/data.md`
- `https://docs.livekit.io/transport/data/text-streams.md`
- `https://docs.livekit.io/agents/models.md`
- `https://docs.livekit.io/agents/models/pipelines.md`
- `https://docs.livekit.io/agents/models/realtime.md`
- `https://docs.livekit.io/agents/build/events.md`
- `https://docs.livekit.io/agents/build/text.md`
- `https://docs.livekit.io/agents/build/tools.md`

Package versions researched via npm:

```txt
livekit-client                 2.21.0  JavaScript/TypeScript client SDK
livekit-server-sdk             2.17.0  Server-side SDK for LiveKit
@livekit/components-react      2.9.23  React components/hooks
@livekit/agents                1.5.5   LiveKit Agents - Node.js
@livekit/agents-plugin-openai  1.5.5
@livekit/agents-plugin-deepgram 1.5.5
@livekit/agents-plugin-cartesia 1.5.5
@livekit/agents-plugin-elevenlabs 1.5.5
@livekit/agents-plugin-silero  1.5.5
```

## LiveKit mental model

LiveKit is built around **rooms**.

A room contains participants. Participants can be:

- browser users,
- AI agents,
- phones/SIP participants,
- backend processes,
- other realtime clients.

Each participant can publish:

- audio tracks,
- video tracks,
- text streams,
- data messages,
- metadata/state.

For this project, the natural LiveKit shape is:

```txt
Visitor browser joins room
  ↓
Browser publishes microphone audio
  ↓
LiveKit agent joins the same room as another participant
  ↓
Agent listens to browser audio
  ↓
Agent transcribes/understands/generates/speaks
  ↓
Agent publishes synthesized speech as audio into the room
  ↓
Browser hears agent audio
  ↓
Agent also sends text/data events for transcript + active toucan speaker
```

This differs from Twilio's current architecture, which starts as a browser phone call and then bridges the call to an AI backend through ConversationRelay.

## Likely LiveKit architecture for this portfolio

Recommended first LiveKit architecture:

```txt
Next.js portfolio
  ├─ /api/livekit/token
  │    └─ server-side token generation using livekit-server-sdk
  │
  └─ TalkToTheBirds LiveKit client hook/component
       ├─ connects to LiveKit Cloud/self-hosted URL
       ├─ joins a unique room
       ├─ publishes microphone audio
       ├─ subscribes to agent audio
       ├─ logs room/participant/transcript events
       └─ receives toucan speaker text/data messages

LiveKit Agent worker
  ├─ registers with LiveKit as an agent server
  ├─ is dispatched to the room
  ├─ joins the room as a participant
  ├─ runs STT → LLM → TTS pipeline or realtime model
  ├─ speaks back through LiveKit audio
  └─ sends frontend events over LiveKit data/text streams
```

## LiveKit token model

LiveKit tokens are JWTs signed with the LiveKit API secret. They must be created server-side.

A frontend token includes:

- room name,
- participant identity,
- permissions such as `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`,
- optional room configuration including agent dispatch.

For this project, the initial Next.js API route would likely be:

```txt
src/app/api/livekit/token/route.ts
```

Expected env vars:

```env
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_LIVEKIT_URL=wss://...
LIVEKIT_AGENT_NAME=toucan-agent
```

Possible response shape:

```json
{
  "serverUrl": "wss://...",
  "roomName": "toucan-room-...",
  "participantIdentity": "toucan-web-...",
  "token": "JWT..."
}
```

LiveKit docs mention two approaches:

1. **Session APIs / TokenSource**: higher-level approach that handles token lifecycle and agent dispatch.
2. **Manual `Room.connect`**: lower-level approach where we generate a token ourselves and connect manually.

For this portfolio, manual `Room.connect` may be easiest for the first prototype because the existing UI is custom and we want to understand each piece.

## LiveKit frontend packages

Likely packages:

```bash
npm install livekit-client livekit-server-sdk @livekit/components-react @livekit/components-styles
```

Minimum first prototype could use only:

```bash
npm install livekit-client livekit-server-sdk
```

Reasons:

- `livekit-client` gives low-level control via `Room`.
- `livekit-server-sdk` generates tokens in Next.js API routes.
- `@livekit/components-react` and styles are useful later if we want prebuilt room/audio/session UI.

LiveKit's React starter app uses Next.js and Agents UI. It includes session management, connect/disconnect controls, text chat, and transcription display. That is highly relevant, but we probably do not want to wholesale replace the portfolio UI with their starter app.

## LiveKit backend/agent packages

Node.js agent packages likely include:

```bash
npm install @livekit/agents @livekit/agents-plugin-openai @livekit/agents-plugin-deepgram @livekit/agents-plugin-cartesia @livekit/agents-plugin-elevenlabs @livekit/agents-plugin-silero
```

But the agent worker should probably live outside the portfolio app initially, because it is a long-running process similar to the Twilio ConversationRelay backend.

LiveKit docs describe the agent lifecycle as:

1. Agent server starts and registers with LiveKit.
2. Agent server waits for dispatch requests.
3. When a room needs the agent, LiveKit starts a job/subprocess.
4. The job joins the room.
5. The agent and frontend communicate through LiveKit WebRTC.

This is cleaner than Twilio for a website-native experience because the AI agent is a participant in the same room rather than a telephony call bridged to a WebSocket.

## LiveKit model choices

LiveKit Agents supports multiple voice architectures. The difference matters because this app is not only a voice assistant; it is also a two-character animation system.

For more detailed LiveKit-specific notes, see:

```txt
docs/voice-agents/livekit-voice-agent-implementation.md
```

### Option A: STT → LLM → TTS pipeline

Audio/text flow:

```txt
user speech → STT → text → LLM → structured toucan text → TTS → agent audio
```

Pros:

- Best auditability.
- Interim transcripts are available.
- Easier to drive UI and two-toucan speaker state from exact text.
- Easier to choose exact TTS voices per toucan.
- Easier to log and debug.
- Best fit for deterministic left/right toucan dialogue.

Cons:

- More moving parts.
- Higher total latency than a pure realtime speech-to-speech model.
- User prosody/emotion may be lost when converted to text.

### Option B: realtime speech-to-speech model

Audio flow:

```txt
user speech → realtime model → generated speech
```

Pros:

- Potentially lower latency.
- More expressive audio output.
- Model can hear tone/prosody.
- Natural interruption/barge-in can feel excellent.

Cons for this app:

- Delayed transcripts.
- Less exact control over spoken script.
- Harder to audit/debug.
- Harder to coordinate exact left/right toucan text.
- Harder to guarantee distinct voices or speaker turns.

Can we randomly interrupt/switch birds visually? Yes. We could randomly pick a bird or alternate birds while agent audio is active. That may look fun, but it is puppet-like rather than semantically correct. If the model says “Mango here,” the UI might flap Kiwi unless we add extra speaker tracking.

### Option C: hybrid / half-cascade approaches

There are two useful hybrid patterns:

#### C1: controlled hybrid: STT input + structured LLM output + TTS output

This is essentially a pipeline with explicit two-toucan orchestration:

```txt
user audio → STT → LLM emits [{speaker, text}] → per-line TTS → frontend speaker events
```

This is the recommended first two-toucan implementation because we can send `toucanLine` events before each line is spoken.

#### C2: realtime understanding + separate TTS output

LiveKit docs describe this as a half-cascade style:

```txt
user audio → realtime model understands speech/prosody → text output → separate TTS speaks text
```

This may preserve more natural input understanding while keeping output text/TTS control. It is promising but more complex than a normal pipeline and should probably come after the basic STT→LLM→TTS version works.

Audio-quality clarification: people often like speech-to-speech because it sounds more conversational, not necessarily because the raw voice fidelity is always superior. Speech-to-speech can preserve timing, emotion, and interruption flow. Dedicated TTS from providers such as Cartesia or ElevenLabs can sound equally or more polished, and it is usually more consistent for fixed character voices. For two toucans, separate TTS may actually produce a better character experience because each toucan can have a stable voice.

### Current recommendation for this project

Start with **STT → LLM → TTS / controlled hybrid C1**.

Reason: the two-toucan UI needs reliable text and speaker labels. We need to know what the agent is going to say before or while it says it so the correct bird can animate. A text-first pipeline gives us that control.

Possible initial provider stack:

```txt
STT: Deepgram or LiveKit Inference
LLM: OpenAI or Anthropic-compatible text model
TTS: Cartesia or ElevenLabs
VAD/turn detection: Silero or LiveKit turn handling
```

If the user wants the most natural voice feel first, we can prototype speech-to-speech too, but that should be considered a separate experiment from the controlled two-toucan dialogue path.

## Two-toucan plan with LiveKit

Recommended first design remains **one orchestrating agent, two characters**.

The LiveKit agent prompt can instruct:

```txt
You are Mango and Kiwi, two friendly toucans on Mitchell Kimbell's portfolio.
Answer visitor questions about Mitchell's experience, projects, and skills.
Keep each line short.
Alternate speakers naturally.
Return structured lines with speaker labels.
```

Potential structured output:

```json
[
  { "speaker": "left", "text": "Mitchell builds cloud and AI systems." },
  { "speaker": "right", "text": "He also has a bunch of automation projects worth checking out." }
]
```

Agent behavior:

1. Generate or parse speaker-labeled response.
2. Send a LiveKit text/data event before speaking each line:

```json
{
  "type": "toucanLine",
  "speaker": "left",
  "text": "Mitchell builds cloud and AI systems."
}
```

3. Speak the text using TTS.
4. Frontend activates the corresponding toucan beak while the agent audio is active.

Potential advantage over Twilio: LiveKit's room data/text stream APIs are native to the same room, so we may not need a separate product like Twilio Sync.

## Product-by-product comparison

| Area | Twilio implementation | LiveKit implementation | Current read |
|---|---|---|---|
| Browser mic/audio | `@twilio/voice-sdk` starts a browser WebRTC call | `livekit-client` joins a room and publishes microphone track | Both support browser mic; LiveKit maps more directly to app UI. |
| Primary mental model | Phone call / TwiML App / ConversationRelay | Room with participants, tracks, data, and agent participant | LiveKit likely fits animated website characters better. |
| Server token route | Twilio Access Token with VoiceGrant / SyncGrant | LiveKit AccessToken with room grants and optional agent dispatch | Similar security model: secret server-side token minting. |
| Agent backend | Express/WebSocket backend returns TwiML and handles `/conversation-relay` | LiveKit Agents worker/server joins rooms as participant | Both need a backend/worker. LiveKit worker model is more native for AI rooms. |
| Local dev | Requires ngrok so Twilio can hit `/call` and `/conversation-relay` | If using LiveKit Cloud, browser connects directly to Cloud; local agent connects outbound to Cloud | LiveKit may reduce ngrok need for MVP, depending on agent deployment mode. |
| Self-hosting | Can self-host only your app/agent backend; Twilio Voice/ConversationRelay/Sync stay hosted by Twilio | Can use LiveKit Cloud or self-host the LiveKit server/SFU | LiveKit offers true media-infra self-hosting; Twilio does not for this use case. |
| STT/TTS | ConversationRelay provider configuration | Agent pipeline plugins or LiveKit Inference | LiveKit offers more explicit pipeline control. |
| Speech-to-speech | Possible through provider choices/conversation platform direction, but current design is ConversationRelay text-token-to-TTS shaped | First-class realtime model support through LiveKit Agents plugins | Speech-to-speech is natural, but less controlled for two birds. |
| Hybrid / half-cascade | Possible only with more custom backend/TTS orchestration outside basic ConversationRelay flow | Documented model pattern: realtime understanding with separate TTS, or controlled STT→LLM→TTS | LiveKit is better suited to experimenting with hybrid voice architecture. |
| Realtime events to frontend | Extra Twilio Sync stream or custom channel | Native LiveKit text streams/data/RPC/state | LiveKit likely easier for toucan UI state. |
| Transcripts | Backend publishes to Twilio Sync | Agent/session transcript events or text streams | Need verify exact event hooks during prototype. |
| Two speakers | Custom speaker tags + Sync events | Custom data/text messages in same room | LiveKit cleaner. |
| Distinct voices | Harder in a single ConversationRelay call/session | Easier if agent controls TTS per line/voice | LiveKit likely better for two actual toucan voices. |
| Telephony future | Excellent: phone numbers, SMS, WhatsApp, handoff | Supports SIP/telephony, but Twilio is stronger here | Twilio wins for omnichannel/contact-center roadmap. |
| Website-native UX | Possible but phone-call-shaped | Natural | LiveKit wins for portfolio/characters. |
| Operational complexity | Twilio Console + backend + ngrok + Sync | LiveKit Cloud/self-host + token route + agent worker + AI plugins | Comparable; LiveKit may be cleaner after initial setup. |
| Current repo status | Frontend slice implemented | Not yet implemented | Next milestone is LiveKit token + room join. |

## Difficulty comparison by milestone

| Milestone | Twilio difficulty | LiveKit difficulty | Notes |
|---|---:|---:|---|
| Button appears in portfolio | Low | Low | UI is already custom. |
| Browser mic connects | Medium | Medium | Twilio Voice SDK vs LiveKit room/mic publishing. |
| Server token route | Low/Medium | Low/Medium | Both need server-only secrets and JWT. |
| Local voice AI backend | Medium/High | Medium/High | Twilio needs ConversationRelay backend; LiveKit needs agent worker. |
| Console call logs | Low | Low | Both easy. |
| Console transcripts | Medium | Medium | Twilio uses Sync; LiveKit needs transcript/text stream hooks. |
| Active speaker events | Medium/High | Medium | LiveKit's data model should make this easier. |
| Beak animation from remote audio | Medium | Medium | Both can expose remote audio activity. |
| Two distinct toucan voices | High | Medium | LiveKit likely easier if TTS is directly controlled by agent. |
| Production deployment | Medium/High | Medium/High | Twilio backend vs LiveKit worker/Cloud. |

## Pros and cons summary

### Twilio pros

- Strong telephony platform.
- Best path if real phone calls, SMS, WhatsApp, RCS, Flex/handoff matter.
- ConversationRelay abstracts much of the voice call bridge.
- Existing reference repos already show working patterns.
- Browser Voice SDK frontend is already prototyped in this repo.

### Twilio cons

- Awkward mental model for website-native animated toucans.
- Requires TwiML App and public webhook URLs.
- Local testing needs ngrok.
- Sync/transcript events are a separate moving part.
- Two-toucan state is fully custom.
- Distinct character voices are not first-class in a single ConversationRelay stream.

### LiveKit pros

- Room/participant model naturally fits browser + AI character(s).
- Agent is a participant in the same realtime session.
- Native data/text streams can carry transcript and active speaker events.
- Better fit for two animated toucans.
- More direct control over STT/LLM/TTS pipeline and TTS voice selection.
- LiveKit Cloud can remove some inbound-webhook/ngrok friction for local browser testing.
- LiveKit Agents has a plugin ecosystem for OpenAI, Deepgram, Cartesia, ElevenLabs, etc.

### LiveKit cons / unknowns

- Need to choose LiveKit Cloud vs self-host.
- Need to choose STT/LLM/TTS providers.
- Agent worker still needs deployment/runtime.
- Need to confirm the best Next.js integration style: low-level `Room.connect` vs Session APIs/TokenSource.
- Need to verify transcript and event hooks in practice.
- New dependencies and new architecture.
- If self-hosting, WebRTC/TURN/SFU operations are more complex than Twilio's hosted voice path.

## LiveKit hosting comparison / easy hosting plan

Decision as of 2026-07-27: start the LiveKit experiment using **LiveKit Cloud** rather than self-hosting.

Why:

- avoids early WebRTC/SFU/TURN/TLS operations,
- browser and agent can both connect outbound to LiveKit Cloud,
- agent can be deployed to LiveKit Cloud with the LiveKit CLI,
- LiveKit Cloud provides logs, metrics, dashboard visibility, and Agent Console debugging,
- secrets can be securely injected into the hosted agent container,
- rolling deploys and scaling are handled by LiveKit Cloud up to plan limits.

Expected LiveKit Cloud deploy flow:

```bash
brew install livekit-cli
lk cloud auth
cd toucan-agent-project
lk agent create
lk agent status
lk agent logs
```

Future updates:

```bash
lk agent deploy
lk agent update-secrets --secrets-file=.env.production
```

How this compares to Twilio hosting:

```txt
Twilio:
  Twilio hosts Voice/TwiML/ConversationRelay/Sync.
  We host the agent backend and web app.
  Local dev normally needs ngrok for Twilio webhooks/WSS.

LiveKit Cloud:
  LiveKit hosts realtime rooms/media and can host the agent worker.
  We host the web app and token route.
  Local dev may not need ngrok for the voice loop because browser and agent connect outbound.
```

LiveKit Agent Builder may be useful for rapid prompt/model exploration, but custom code is still expected for `toucanLine` events, per-line speaker metadata, per-toucan voices, and beak animation timing.

## Recommended LiveKit implementation plan

### Milestone 0: Docs and branch

Status: started.

- Created branch `experiment/livekit-toucans`.
- Created Twilio implementation document.
- Created this comparison document.

### Milestone 1: LiveKit token route only

Add:

```txt
src/app/api/livekit/token/route.ts
```

Install if approved:

```bash
npm install livekit-client livekit-server-sdk
```

Environment:

```env
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_LIVEKIT_URL=wss://...
LIVEKIT_AGENT_NAME=toucan-agent
```

Acceptance:

- Route returns a token for a unique room and identity.
- No secrets exposed.
- Missing env returns helpful error.

### Milestone 2: Browser joins room

Add:

```txt
src/hooks/useLiveKitToucanAgent.ts
```

Initial behavior:

- Button joins a LiveKit room.
- Logs room events.
- Publishes microphone audio.
- Disconnect cleans up.

Acceptance:

- Browser joins room.
- Mic permission prompt appears.
- Console shows participant and track events.

### Milestone 3: Agent worker

Create or adapt a separate LiveKit agent worker.

Decisions needed:

- Node.js agent or Python agent?
- LiveKit Cloud Agents or local/custom deployment?
- Provider stack: OpenAI-only, Deepgram/OpenAI/Cartesia, Deepgram/Anthropic/ElevenLabs, etc.?

Acceptance:

- Agent joins the room.
- Agent hears user.
- User hears agent.

### Milestone 4: Transcripts and toucan state

Implement structured events:

```json
{
  "type": "toucanLine",
  "speaker": "left",
  "text": "..."
}
```

Acceptance:

- Browser logs user transcript.
- Browser logs assistant/toucan lines.
- Browser knows which toucan is active.

### Milestone 5: Beak animation

Wire:

```txt
active speaker + agent audio activity → beak animation
```

Acceptance:

- Left/right toucan beak animates only when that toucan is speaking.

## Open questions for Mitchell

1. **LiveKit Cloud or self-hosted LiveKit?**
   - Recommended for speed: LiveKit Cloud.
   - Self-hosting is possible but adds SFU/TURN/devops complexity.

2. **Node.js or Python for the LiveKit agent worker?**
   - Node.js keeps the stack TypeScript-heavy.
   - Python may have more mature examples/docs in the LiveKit Agents ecosystem.

3. **Which AI provider should power the first LiveKit agent?**
   - Simplest might be OpenAI plugin.
   - Better voice pipeline might be Deepgram STT + OpenAI/Anthropic LLM + Cartesia/ElevenLabs TTS.

4. **Do the toucans need two distinct actual voices immediately?**
   - If no: one TTS voice + visual speaker switching is easiest.
   - If yes: LiveKit pipeline with per-line TTS voice selection becomes more important.

5. **Should Twilio and LiveKit coexist in the UI during testing?**
   - Recommended: yes, keep side-by-side behind clear labels until a winner is chosen.

6. **Is console-only still the first LiveKit acceptance target?**
   - Recommended: yes. First prove room/mic/agent/audio before making the toucans fancy.

## Decision log

- 2026-07-27: Twilio frontend/token implementation exists in portfolio.
- 2026-07-27: Created branch `experiment/livekit-toucans` for LiveKit experiment.
- 2026-07-27: Researched LiveKit docs and npm packages.
- 2026-07-27: Initial recommendation: LiveKit Cloud + STT/LLM/TTS pipeline + one orchestrating two-character agent.
- 2026-07-27: Clarified speech-to-speech tradeoff: it can work for a puppet-like random/alternating toucan demo, but text-first or hybrid output is better for believable two-character control.
- 2026-07-27: Clarified self-hosting distinction: Twilio lets us self-host the agent backend only, while LiveKit can be Cloud-hosted or self-host the media/SFU layer.
- 2026-07-27: Clarified audio-quality distinction: speech-to-speech often wins on conversational naturalness/prosody, while dedicated TTS can win on polish, consistency, and two-character voice control.
- 2026-07-27: Decision made to start LiveKit implementation with STT→LLM→TTS rather than pure speech-to-speech.
- 2026-07-27: Decision made to target LiveKit Cloud for easy hosting first; self-hosted LiveKit remains a later option if needed.
- 2026-07-27: Added LiveKit Cloud deployment notes: `lk cloud auth`, `lk agent create`, `lk agent deploy`, secrets management, logs/status, Agent Console, and Agent Builder.
