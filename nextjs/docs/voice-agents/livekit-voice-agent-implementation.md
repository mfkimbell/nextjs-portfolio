# LiveKit Voice Agent Implementation Notes

_Last updated: 2026-07-27_

This document captures the planned LiveKit-based implementation for the portfolio voice-agent project. It is the LiveKit counterpart to:

```txt
docs/voice-agents/twilio-voice-agent-implementation.md
```

It should be updated every time we learn more about LiveKit, make an architectural decision, or implement a new milestone.

## Goal

Build a website-native voice interaction in the `Talk To The Birds` section:

1. Visitor clicks a button.
2. Browser asks for microphone permission.
3. Visitor speaks to an AI agent.
4. AI agent speaks back about Mitchell Kimbell.
5. Frontend logs events/transcripts during the first milestone.
6. Later, two toucans visually take turns speaking.
7. Eventually, each toucan may have its own speaking style and possibly its own voice.

## Why LiveKit is being evaluated

Twilio's prototype is phone-call shaped:

```txt
browser Voice SDK call → TwiML App → /call webhook → ConversationRelay WebSocket → AI backend
```

LiveKit is room-shaped:

```txt
browser joins room → AI agent joins same room → participants exchange audio/data/text in realtime
```

For animated website characters, the LiveKit model may fit better because the browser and the AI agent are peers in the same realtime room. The agent can publish audio and also send data/text events to drive the toucan UI.

## Core LiveKit concepts for this project

### Room

A LiveKit room is the realtime session. It is created automatically when the first participant joins and closes when the last non-agent participant leaves.

For this project, each visitor should get a unique room:

```txt
toucan-room-{uuid}
```

### Participants

Participants can be browser users, AI agents, backend processes, or SIP/phone users.

In this project:

```txt
visitor browser participant
AI toucan agent participant
```

Later, we might represent the two toucans as:

1. one agent participant roleplaying two toucans, or
2. two separate agent participants, one per toucan.

The recommended first implementation is still **one agent participant roleplaying two toucans** because it is easier to control turn-taking and cost.

### Tracks

Participants publish audio/video tracks. The visitor publishes a microphone audio track. The agent publishes synthesized speech as audio.

### Data and text streams

LiveKit has realtime data/text mechanisms that can carry:

- transcripts,
- active speaker state,
- toucan speaker labels,
- tool-call/UI events,
- emotion/animation hints.

This may replace the role Twilio Sync plays in the Twilio implementation.

## Likely LiveKit files in this portfolio

Not implemented yet, but expected:

```txt
src/app/api/livekit/token/route.ts
src/hooks/useLiveKitToucanAgent.ts
src/components/TalkToTheBirds.tsx      # either adds a provider toggle or a LiveKit-specific button
```

Possible later structure:

```txt
src/components/TalkToTheBirdsTwilio.tsx
src/components/TalkToTheBirdsLiveKit.tsx
src/hooks/useToucanVoiceAgent.ts       # current Twilio hook
src/hooks/useLiveKitToucanAgent.ts     # future LiveKit hook
```

## Likely packages

Frontend and token route:

```bash
npm install livekit-client livekit-server-sdk
```

Optional React component library:

```bash
npm install @livekit/components-react @livekit/components-styles
```

Agent worker packages, if using Node.js LiveKit Agents:

```bash
npm install @livekit/agents @livekit/agents-plugin-openai @livekit/agents-plugin-deepgram @livekit/agents-plugin-cartesia @livekit/agents-plugin-elevenlabs @livekit/agents-plugin-silero
```

Package versions researched on 2026-07-27:

```txt
livekit-client                  2.21.0
livekit-server-sdk              2.17.0
@livekit/components-react       2.9.23
@livekit/agents                 1.5.5
@livekit/agents-plugin-openai   1.5.5
@livekit/agents-plugin-deepgram 1.5.5
@livekit/agents-plugin-cartesia 1.5.5
@livekit/agents-plugin-elevenlabs 1.5.5
@livekit/agents-plugin-silero   1.5.5
```

## Likely environment variables

For the portfolio token route:

```env
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_AGENT_NAME=toucan-agent
LIVEKIT_TOKEN_TTL=3600
```

Important:

- `LIVEKIT_API_SECRET` must remain server-side only.
- `NEXT_PUBLIC_LIVEKIT_URL` is okay to expose because it is the public WebSocket URL clients connect to.

For the agent worker:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
ELEVENLABS_API_KEY=
```

Exact provider keys depend on selected STT/LLM/TTS stack.

## Expected LiveKit frontend flow

```txt
Visitor clicks LiveKit Talk button
  ↓
Browser calls /api/livekit/token
  ↓
Next.js server route mints LiveKit JWT
  ↓
Browser creates LiveKit Room
  ↓
Browser connects to NEXT_PUBLIC_LIVEKIT_URL with token
  ↓
Browser publishes microphone audio
  ↓
LiveKit dispatches or connects the toucan agent to the same room
  ↓
Agent listens to browser audio
  ↓
Agent generates a response
  ↓
Agent publishes speech audio to room
  ↓
Browser plays agent audio
  ↓
Agent sends transcript / toucan speaker events through data/text streams
  ↓
Frontend logs events and later animates birds
```

## Expected token route behavior

Future route:

```txt
src/app/api/livekit/token/route.ts
```

Responsibilities:

- Generate a unique room name if none is provided.
- Generate a unique participant identity.
- Mint a LiveKit Access Token using `livekit-server-sdk`.
- Grant room join permissions.
- Grant microphone/data publish permissions.
- Include agent dispatch info if we use automatic dispatch.
- Return the token and public LiveKit URL.

Expected response:

```json
{
  "serverUrl": "wss://your-project.livekit.cloud",
  "roomName": "toucan-room-...",
  "participantIdentity": "toucan-web-...",
  "token": "JWT..."
}
```

## Expected agent worker behavior

The agent worker is likely separate from the Next.js portfolio app.

Responsibilities:

- Register with LiveKit as an agent server.
- Join rooms when dispatched.
- Listen to visitor audio.
- Run either:
  - STT → LLM → TTS pipeline,
  - realtime speech-to-speech model,
  - or a hybrid/half-cascade.
- Publish audio responses into the room.
- Send transcript/speaker events to the frontend.
- Later, handle tools for site navigation/highlighting.

## Voice architecture options

There are three major approaches under consideration.

## Option A: STT → LLM → TTS pipeline

Flow:

```txt
visitor audio
  → speech-to-text
  → user transcript text
  → LLM generates structured toucan lines
  → text-to-speech speaks each line
  → agent audio plays in room
```

Example structured response from the LLM:

```json
[
  {
    "speaker": "left",
    "text": "Mitchell builds cloud and AI systems."
  },
  {
    "speaker": "right",
    "text": "And he likes making playful interfaces like this one."
  }
]
```

Pros:

- Best for deterministic two-toucan control.
- We know which bird says which text before it is spoken.
- Easy to log transcripts.
- Easy to send frontend events.
- Easy to pick different TTS voices per toucan line.
- Easier to audit/debug.
- Easier to use tools that affect the page.

Cons:

- More moving parts.
- Can have slightly higher latency.
- User emotion/prosody may be lost when STT converts speech to text.

Recommended use:

- Best first approach if the primary goal is two toucans that clearly take turns.

## Option B: Speech-to-speech realtime model

Flow:

```txt
visitor audio
  → realtime model
  → model-generated speech audio
```

Pros:

- Very natural conversation.
- Potentially lower latency.
- Better emotional/prosodic understanding.
- User can interrupt naturally.
- Fewer pipeline components.

Cons for the two-toucan UI:

- The primary output is audio, not structured text.
- Transcripts can be delayed or less complete depending on provider/model.
- Harder to know which toucan is speaking before the audio plays.
- Harder to guarantee alternating left/right lines.
- Harder to use separate voices for the two toucans.
- Harder to make the UI exactly match what was spoken.

Could we randomly switch birds?

Yes. A simple demo could do:

```txt
agent audio starts → randomly choose left or right toucan → flap that beak
```

or:

```txt
agent audio starts → alternate toucan every sentence-ish or every few seconds
```

This can look fun, but it is not semantically reliable. If the model says “Mango here,” the UI might randomly flap Kiwi. It also does not provide clean per-line speaker labels.

Recommended use:

- Best if the first priority is natural low-latency voice conversation and the birds are mostly visual puppets.
- Not best if the first priority is believable two-character dialogue.

## Option C: Hybrid / half-cascade approach

There are two useful meanings of “hybrid” for this project.

### Hybrid C1: STT input + structured LLM output + TTS output

This is technically the classic pipeline, but with explicit two-toucan orchestration:

```txt
visitor audio
  → STT transcript
  → LLM produces structured toucan lines
  → frontend receives speaker/text events
  → TTS speaks each line, possibly with per-toucan voice
```

This is the recommended “controlled hybrid” for the first two-toucan build.

Why it is good:

- The UI receives the exact speaker label before or during speech.
- The frontend can animate the correct beak.
- We can assign `leftVoiceId` and `rightVoiceId` in TTS.
- We can preserve a full text trail for logs, transcripts, and debugging.

Potential event sequence:

```txt
LLM emits [{ speaker: left, text: ... }, { speaker: right, text: ... }]
  ↓
Agent sends LiveKit text/data message: toucanLine left
  ↓
Agent speaks left text with left voice
  ↓
Frontend flaps left beak while left line audio plays
  ↓
Agent sends LiveKit text/data message: toucanLine right
  ↓
Agent speaks right text with right voice
  ↓
Frontend flaps right beak while right line audio plays
```

This gives the best illusion that there are two birds.

### Hybrid C2: realtime model for understanding + separate TTS for speech

LiveKit docs describe this as a “half-cascade” style approach.

Flow:

```txt
visitor audio
  → realtime model understands speech/prosody
  → realtime model outputs text only
  → separate TTS speaks the text
```

Why it is interesting:

- It can preserve some benefits of realtime speech understanding.
- The output is still text before speech, so the app can label speakers.
- Separate TTS gives control over voices.

Pros:

- More natural input understanding than pure STT.
- More output control than pure speech-to-speech.
- Potentially good compromise if latency is acceptable.
- Audio quality can still be excellent because the final voice is produced by a dedicated TTS provider such as Cartesia or ElevenLabs.
- Per-toucan voice consistency is usually easier than pure speech-to-speech because each line can select a specific TTS voice.

Audio quality note:

Pure speech-to-speech often sounds “better” in the sense of conversational expressiveness: it can preserve timing, emotion, interruptions, and prosodic context from the user's voice. However, the raw output voice is not automatically better than high-end TTS. A separate TTS model can sound more polished and more consistent, especially when we need stable character voices. The hybrid C2 approach gets some realtime speech-understanding benefits while leaving final voice quality and character voice selection to the TTS layer.

Cons:

- More complex than the normal STT → LLM → TTS pipeline.
- Provider support varies.
- Realtime model text-only behavior must be verified.
- Might still have delayed or imperfect transcripts.
- May be overkill for the first prototype.

Recommended use:

- Consider after a normal STT → LLM → TTS pipeline works.
- Useful if normal STT loses too much nuance or feels too slow.

## Current recommendation and decision

Decision as of 2026-07-27:

```txt
Start the LiveKit experiment with STT → LLM → TTS.
Use LiveKit Cloud for easiest hosting.
Use one orchestrating agent that roleplays two toucans.
Use structured toucan lines so the frontend knows which bird is speaking.
```

Recommended first architecture:

```txt
LiveKit Cloud room
  ├─ visitor browser participant
  └─ hosted LiveKit Cloud agent participant
        ├─ STT
        ├─ LLM creates structured toucan dialogue
        └─ TTS speaks each line
```

Reason:

The project’s unique challenge is not simply “voice assistant speaks.” It is “two toucans convincingly talk back.” Text-first orchestration gives us the strongest control over speaker assignment, captions, voice selection, and beak animation.

After that works, we can experiment with:

- pure speech-to-speech for naturalness,
- half-cascade realtime-understanding + TTS,
- two separate agent participants,
- per-toucan voices.

## Easy hosting plan through LiveKit Cloud

LiveKit has two major hosting modes:

```txt
LiveKit Cloud                 hosted by LiveKit
Self-hosted LiveKit server    hosted/operated by us
```

For this experiment, use **LiveKit Cloud**. This gives us:

- hosted realtime media rooms,
- hosted agent deployment,
- automatic scaling/load balancing up to plan limits,
- LiveKit dashboard visibility,
- Agent Console debugging,
- logs and session inspection,
- secrets management for provider API keys,
- CLI-based deploys.

This should be easier than self-hosting because we avoid early WebRTC/SFU/TURN/TLS operations.

### LiveKit Cloud agent deployment flow

Official docs describe this path:

```bash
brew install livekit-cli
lk cloud auth
cd your-agent-project
lk agent create
```

What `lk agent create` does:

1. Authenticates/links the CLI to a LiveKit Cloud project.
2. Registers the agent deployment.
3. Creates or updates `livekit.toml`.
4. Creates a Dockerfile if the project does not have one.
5. Uploads the agent code to LiveKit Cloud's build service.
6. Builds a container image.
7. Deploys it to LiveKit Cloud.

Future updates use:

```bash
lk agent deploy
```

Useful operations:

```bash
lk agent status
lk agent logs
lk agent rollback   # paid plans support instant rollback
lk agent update-secrets --secrets-file=.env.production
```

### LiveKit Cloud secrets

LiveKit Cloud injects these automatically into hosted agents:

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

Provider secrets are managed separately:

```env
OPENAI_API_KEY=
DEEPGRAM_API_KEY=
CARTESIA_API_KEY=
ELEVENLABS_API_KEY=
ANTHROPIC_API_KEY=
```

Secrets can be uploaded from an env file:

```bash
lk agent create --secrets-file=.env.production
lk agent update-secrets --secrets-file=.env.production
```

The LiveKit docs note that `.env*` files are excluded from build context and should not be committed.

### Agent Console

LiveKit Agent Console can debug agents running in LiveKit Cloud, locally, or self-hosted. It shows:

- room/session state,
- participants,
- audio waveforms,
- user/agent state transitions,
- transcription updates,
- tool calls,
- timing/performance metrics,
- errors,
- usage.

This is valuable for our first STT→LLM→TTS prototype because we can see where latency or transcript issues occur.

### LiveKit Agent Builder option

LiveKit also has Agent Builder, a browser-based no-code/prototype tool that can deploy simple agents to LiveKit Cloud and produce Python code.

Potential use:

```txt
prototype the toucan prompt + STT/LLM/TTS model stack quickly in browser
then export/convert to code for full two-toucan event control
```

Caveat: Agent Builder is useful for fast proof-of-concept, but code is likely needed for custom frontend events like `toucanLine`, per-line speaker labels, per-toucan TTS voice selection, and beak animation timing.

## Two-toucan protocol idea

LiveKit agent sends data/text messages like:

```json
{
  "type": "toucanLine",
  "speaker": "left",
  "speakerName": "Mango",
  "text": "Mitchell builds cloud and AI systems.",
  "emotion": "excited",
  "voiceId": "leftVoice"
}
```

and:

```json
{
  "type": "toucanState",
  "speaker": "left",
  "state": "speaking"
}
```

Frontend behavior:

```txt
toucanLine left → show caption/log line
toucanState left speaking → flap left beak
toucanState left idle → stop left beak
```

If exact state events are hard, the frontend can also use remote agent audio level as a fallback:

```txt
activeSpeaker = last toucanLine speaker
agentAudioLevel > threshold → flap activeSpeaker beak
```

## Distinct voices

With LiveKit STT → LLM → TTS, distinct toucan voices should be achievable because the agent can choose a TTS voice for each line.

Example:

```txt
left toucan → warm/playful voice
right toucan → brighter/faster voice
```

This is likely easier in LiveKit than in the current Twilio ConversationRelay design, where a single call usually has one active TTS voice configuration.

## Local development model

If using LiveKit Cloud:

```txt
Browser on localhost → connects outbound to LiveKit Cloud
Local agent worker → connects outbound to LiveKit Cloud
```

This may reduce or eliminate ngrok for the main browser/agent loop because both local processes connect outbound to LiveKit Cloud.

If using self-hosted LiveKit:

```txt
Browser → your LiveKit server/SFU
Agent worker → your LiveKit server/SFU
```

Self-hosting requires more infrastructure work: TLS, TURN/STUN, scaling, network reliability, monitoring, etc.

## Twilio self-hosting comparison note

Twilio does not have a comparable “self-host Twilio Voice/ConversationRelay” mode for this project. You can self-host the Twilio agent backend, but the Twilio Voice SDK infrastructure, TwiML App, ConversationRelay service, media routing, and Sync are hosted Twilio services.

LiveKit can be either:

```txt
LiveKit Cloud
self-hosted LiveKit server
```

Recommended for experimentation: **LiveKit Cloud**.

## Open questions

1. LiveKit Cloud or self-host?
   - Recommendation: LiveKit Cloud first.

2. Node.js or Python agent worker?
   - Node keeps TypeScript continuity.
   - Python may have more mature LiveKit agent examples.

3. First model stack?
   - Recommendation for controlled two-toucan prototype: STT → LLM → TTS.
   - Candidate stack: Deepgram STT + OpenAI/Anthropic LLM + Cartesia/ElevenLabs TTS.

4. Do we need two distinct voices immediately?
   - If yes, prioritize TTS provider selection early.
   - If no, one voice + visual speaker switching is enough for MVP.

5. Should Twilio and LiveKit coexist during testing?
   - Recommendation: yes, side-by-side until a winner is clear.

## Implementation milestones

### Milestone 1: Token route

Add:

```txt
src/app/api/livekit/token/route.ts
```

Acceptance:

- Missing env returns helpful error.
- Valid env returns token, room name, identity, and server URL.
- API secret is never exposed.

### Milestone 2: Browser room join

Add:

```txt
src/hooks/useLiveKitToucanAgent.ts
```

Acceptance:

- Button joins room.
- Browser publishes microphone.
- Console logs room events.
- Disconnect cleans up.

### Milestone 3: Agent worker

Acceptance:

- Agent joins room.
- Agent hears user.
- Agent speaks back.

### Milestone 4: Transcript and toucan events

Acceptance:

- Browser receives user/assistant transcript.
- Browser receives `toucanLine` events.
- Browser tracks active toucan.

### Milestone 5: Beak animation

Acceptance:

- Active toucan beak animates while its line is being spoken.

## Decision log

- 2026-07-27: Created LiveKit experiment branch `experiment/livekit-toucans`.
- 2026-07-27: Initial LiveKit research completed from official docs and npm package metadata.
- 2026-07-27: Documented three voice architecture options: STT→LLM→TTS, speech-to-speech, and hybrid/half-cascade.
- 2026-07-27: Current recommendation is LiveKit Cloud + controlled STT→LLM→TTS first, then experiment with speech-to-speech or half-cascade if needed.
- 2026-07-27: Clarified audio-quality tradeoff: speech-to-speech often sounds more naturally conversational, but dedicated TTS can sound more polished/consistent and is likely better for two stable toucan voices.
- 2026-07-27: Decision made to start the LiveKit implementation with STT→LLM→TTS.
- 2026-07-27: Decision made to discuss/target LiveKit Cloud as the easy hosting path before considering self-hosted LiveKit.
- 2026-07-27: Added LiveKit Cloud hosting notes: `lk cloud auth`, `lk agent create`, `lk agent deploy`, secrets management, logs/status, Agent Console, and Agent Builder as a possible prompt/model prototyping path.
