# Native Two-Bear Voice Plan

## Decision

Build a native speech-to-speech mode with two persistent OpenAI Realtime sessions:

- Smokey and Maple each have their own session, instructions, voice, and conversation state.
- The visitor's audio is sent to both sessions, but the server explicitly decides which bear may respond.
- While Smokey speaks, his original generated audio is also streamed into Maple's input buffer.
- Maple evaluates short committed audio checkpoints and silently chooses `WAIT` or `INTERRUPT`.
- If Maple interrupts, the server stops Smokey, clears queued Twilio audio, and starts Maple only when Maple's first audio is ready.
- ConversationRelay remains available behind a transport setting until native mode passes the real-call matrix.

This produces a genuine native-audio experience. There is no external TTS in the native path. Text is used only for instructions, transcripts, structured decisions, and tool results.

The first implementation uses the realtime model's native prosody without audio effects. Do not decode, pitch-shift, time-stretch, amplify, or otherwise post-process generated bear audio before it reaches Twilio.

## Product Goal

The bears should feel like two characters sharing a campfire rather than two sequential assistants.

The defining interaction is:

```text
Smokey: "I think you're being dramatic becau-"
Maple:  "Me? Dramatic?"
```

The interruption must satisfy all of these conditions:

1. Maple has heard the portion of Smokey's audio that motivated the response.
2. Maple's opening directly reacts to the last meaningful phrase the visitor heard.
3. Smokey's unheard suffix is removed from playback and conversational state.
4. Maple uses native generated audio with her own voice and expressive delivery.
5. The frontend changes speaker and animation ownership at the same playback boundary.
6. Visitor barge-in takes priority over bear-on-bear interruption.

## Research Conclusions

### What Works

OpenAI Realtime supports the required primitives:

- Native speech input and native speech output.
- Separate persistent WebSocket sessions.
- `audio/pcmu`, which matches Twilio's G.711 mu-law telephony audio without transcoding.
- Manual input buffering with `input_audio_buffer.append` and `input_audio_buffer.commit`.
- Explicit `response.create` calls with automatic responses disabled.
- Text-only out-of-band responses for silent interruption decisions.
- Function calling and structured tool results.
- Streaming output audio and output-audio transcript events.
- Response cancellation and conversation-item truncation.

Twilio bidirectional Media Streams supports the corresponding telephony controls:

- Incoming caller audio as base64 mu-law media.
- Outgoing model audio as base64 mu-law media.
- `mark` events for playback accounting.
- `clear` for removing buffered, unplayed audio.

### Important Correction

Maple cannot reason continuously over an open, uncommitted audio buffer.

The workable loop is:

```text
append Smokey audio to Maple
  -> commit a short segment
  -> request a silent decision
  -> WAIT or INTERRUPT
  -> immediately resume buffering the next segment
```

`input_audio_buffer.commit` creates an input item and clears that buffer. Each checkpoint is therefore a micro-turn in Maple's session. Disabling automatic response creation does not create continuous background cognition by itself.

### What Is Not Guaranteed

- The model will not always find the funniest interruption point.
- Output transcripts are not sample-accurate audio alignments.
- Twilio does not expose a sample-accurate playback cursor.
- Cancelling OpenAI does not clear Twilio playback.
- Clearing Twilio does not cancel OpenAI generation.
- A transcript can contain generated words that the visitor never heard.
- Two autonomous sessions will not remain synchronized without server orchestration.

The application must treat contextual interruption as a supervised realtime behavior, not as an automatic property of voice-to-voice models.

## Current State

The repository currently uses:

```text
Browser Twilio Voice SDK
  -> TwiML Application
  -> ConversationRelay
  -> agent/src/index.ts
  -> separate Smokey and Maple Chat Completions
  -> ConversationRelay ElevenLabs speech
  -> one mixed browser audio stream
```

Useful existing behavior:

- Distinct Smokey and Maple voices.
- Separate persona prompts and bounded histories.
- An authored greeting that waits for ConversationRelay `tokensPlayed` before Maple preempts Smokey.
- Backend speaker events consumed by the browser.
- Audio-driven mouth movement from the mixed Twilio stream.
- Speaker/listener head and social animation.
- Existing call, mute, end, and scene integration.

Known current gaps:

- `sendTwoBearReply()` sends both dynamic lines immediately rather than awaiting playback.
- `activeSpeech` can be overwritten before the first line has completed.
- `bear.speech.ended` is declared but is not meaningfully emitted.
- SSE events do not have sequence, turn, response, or playback identifiers.
- No automated tests cover call orchestration or audio timing.
- Current browser events identify a speaker but cannot disambiguate overlapping audio.

## Target Architecture

```text
                                    +-----------------------+
                                    | Smokey Realtime       |
                                    | native audio session  |
                                    +-----------+-----------+
                                                |
Visitor <-> Twilio Voice <-> Media bridge       | Smokey output audio
                              |                 v
                              |       +---------+----------+
                              +------>| Playback controller|----> Twilio
                              |       +---------+----------+
                              |                 |
                              |                 | copy original audio
                              |                 v
                              |       +---------+----------+
                              +------>| Maple Realtime      |
                                      | listener/session    |
                                      +---------+----------+
                                                |
                                                | WAIT / INTERRUPT
                                                v
                                      +---------+----------+
                                      | Turn orchestrator   |
                                      +--------------------+
```

The browser continues receiving one mixed remote Twilio stream. The backend remains authoritative for speaker identity, playback ownership, and interruption state.

## Session Model

Use one application session per Twilio call and one realtime session per bear.

```ts
type BearCallSession = {
  callSid: string;
  streamSid: string;
  generation: number;
  playbackEpoch: number;
  activeBear: "smokey" | "maple" | null;
  smokey: BearRealtimeSession;
  maple: BearRealtimeSession;
  playback: PlaybackState;
  mapleListener: MapleListenerState;
  pendingUserTurn: UserTurn | null;
};
```

```ts
type BearRealtimeSession = {
  socket: WebSocket;
  responseId: string | null;
  itemId: string | null;
  outputTranscript: string;
  generatedAudioMs: number;
};
```

```ts
type MapleListenerState = {
  bufferedAudioMs: number;
  committedSegments: number;
  decisionInFlight: boolean;
  lastDecisionAt: number;
  interruptionUsedThisTurn: boolean;
};
```

## Realtime Session Configuration

Create two persistent sessions when Twilio sends its `start` event.

Both sessions use:

```json
{
  "type": "realtime",
  "output_modalities": ["audio"],
  "audio": {
    "input": {
      "format": { "type": "audio/pcmu" },
      "turn_detection": null
    },
    "output": {
      "format": { "type": "audio/pcmu" }
    }
  }
}
```

Smokey and Maple must use different sessions because a realtime session's voice cannot be changed after it has emitted audio.

Initial voices:

- Smokey: `cedar`.
- Maple: `marin`.

Validate these choices over the actual Twilio call. Swap them if the character fit is wrong.

Automatic response creation stays disabled. The orchestrator is the only component allowed to issue `response.create` for audible output.

## Persona Instructions

### Smokey

```text
You are Smokey, a warm, enthusiastic, slightly theatrical portfolio bear.
You normally lead responses and occasionally overstate things in a harmless way.
Speak naturally and expressively. Leave room for Maple to react.
Never pretend an external action succeeded unless a tool result confirms it.
```

### Maple

```text
You are Maple, a concise, dry, perceptive portfolio bear.
You listen closely to Smokey's wording, tone, and exaggerations.
Interrupt only when a correction, contrast, or short comedic reaction improves the exchange.
When interrupting, begin with an immediate reaction to the latest audible phrase.
Do not announce that you are interrupting.
Do not interrupt more than once per visitor turn.

For an interruption, begin with a short, incredulous reaction. Use a quick onset,
sharp emphasis, and amused or lightly offended delivery. Settle into normal pacing
after the opening reaction.
```

The server must also insert explicit speaker labels around cross-bear context. Audio forwarded from Smokey appears as input audio to Maple, so a text marker must establish that the next committed audio came from Smokey rather than the visitor.

Do not instruct Maple to "always interrupt." The orchestrator and prompt should favor a useful interruption over a frequent one.

## Call Flow

### 1. Start The Call

Replace native mode's ConversationRelay TwiML with:

```xml
<Connect>
  <Stream url="wss://AGENT_HOST/media-stream">
    <Parameter name="mode" value="native-bears" />
  </Stream>
</Connect>
```

Keep ConversationRelay available as `BEAR_VOICE_TRANSPORT=conversation-relay` during migration.

### 2. Receive A Visitor Turn

Forward caller media to both bear sessions while no bear is speaking.

At the caller turn boundary:

1. Commit the same visitor audio in both sessions.
2. Update shared call state and approved portfolio context.
3. Authorize Smokey's `response.create`.
4. Keep Maple silent.

For the first implementation, the server should own turn boundaries. Add server or semantic VAD only after the manual flow is stable.

### 3. Stream Smokey

For every Smokey `response.output_audio.delta`:

1. Reject the chunk if its generation or playback epoch is stale.
2. Send the PCMU payload to Twilio.
3. Send a Twilio `mark` after a bounded group of chunks.
4. Append the original PCMU payload to Maple's input buffer.
5. Accumulate Smokey's output-audio transcript for captions and context.
6. Emit backend speaker state for the frontend.

Do not route Twilio's compressed playback back to Maple. Route the original model output payload before the Twilio envelope.

### 4. Evaluate Maple At Checkpoints

Start the first Maple checkpoint after approximately `1,500-2,000 ms` of Smokey audio.

After the first checkpoint, evaluate at approximately `600-900 ms` intervals while Smokey continues. These values are starting points, not acceptance constants.

At each checkpoint:

1. Commit Maple's current Smokey-audio buffer.
2. Immediately resume appending new Smokey audio into the fresh buffer.
3. Run one silent, text-only out-of-band decision.
4. Serialize decisions so only one is active at a time.
5. Tag the decision with call, turn, response, and checkpoint IDs.

Decision contract:

```ts
type InterruptDecision =
  | { action: "wait" }
  | {
      action: "interrupt";
      reason: "correction" | "contrast" | "humor";
      openingIntent: string;
    };
```

Example instruction:

```text
Listen to the committed Smokey audio in context.
Choose WAIT unless an interruption would clearly improve this exchange.
Choose INTERRUPT only when your first words can directly react to the latest meaningful phrase.
Return a structured decision. Do not produce audible speech in this decision.
```

The first version should prefer false negatives over frequent interruptions.

### 5. Prepare Maple Before Cutting Smokey

When Maple returns `INTERRUPT`:

1. Mark interruption intent so no additional decision can start.
2. Request Maple's native audio response with the opening intent and current context.
3. Continue Smokey playback only until Maple's first usable audio delta arrives.
4. Buffer a small initial Maple audio prefix server-side.
5. Execute the interruption transaction immediately.

This avoids stopping Smokey and then waiting through model latency in silence.

There is an unavoidable tradeoff: Smokey may advance beyond the exact phrase Maple evaluated while Maple's response starts generating. Measure that drift and keep the decision interval and first-audio latency visible in logs.

### 6. Execute The Interruption Transaction

Treat interruption as one ordered state transition:

1. Increment the playback epoch.
2. Stop forwarding new Smokey audio deltas.
3. Send `response.cancel` to Smokey.
4. Send Twilio `clear` to discard queued Smokey audio.
5. Determine the conservative heard duration from acknowledged marks.
6. Send `conversation.item.truncate` to Smokey with that duration.
7. Emit `bear.speech.interrupted` for Smokey.
8. Set Maple as the active bear.
9. Send Maple's buffered prefix and subsequent deltas to Twilio.
10. Emit `bear.speech.started` for Maple.
11. Ignore all late Smokey chunks and events from the prior epoch.

Cancellation, clearing, and truncation are all required. None of them replaces the others.

### 7. Complete Maple And Synchronize Context

After Maple's final Twilio mark:

1. Emit `bear.speech.ended` for Maple.
2. Add Maple's final audible transcript to the shared session record.
3. Insert a labeled Maple transcript into Smokey's session.
4. Optionally send Maple's original audio to Smokey if preserving delivery context materially improves the next beat.
5. Allow at most one short Smokey recovery response.
6. Return both sessions to visitor-listening state.

Use labeled text as the durable cross-session record. Use cross-fed audio only where tone and delivery matter.

## User Barge-In

Visitor speech always wins over bear-on-bear behavior.

When caller speech starts while a bear is active:

1. Invalidate the current generation and playback epoch.
2. Cancel both bear responses.
3. Send Twilio `clear`.
4. Truncate the active bear to the conservative heard duration.
5. Clear Maple's uncommitted listener buffer.
6. Cancel any Maple decision response.
7. Emit interruption and caller-listening frontend events.
8. Begin a new visitor turn in both sessions.

Prevent ambient banjo and fire audio from feeding the microphone by retaining browser echo cancellation and ducking ambience during bear speech.

## Playback Accounting

OpenAI `response.done` means generation completed. It does not mean the visitor heard the audio.

Twilio marks are the playback authority.

Use small bounded media groups and attach unique marks:

```ts
type PlaybackMark = {
  epoch: number;
  bear: "smokey" | "maple";
  responseId: string;
  sequence: number;
  cumulativeAudioMs: number;
  state: "queued" | "played" | "cleared";
};
```

After `clear`, Twilio returns marks for discarded buffered media as well. The controller must distinguish marks acknowledged before clear from marks returned because of clear.

Use the last confirmed played mark as the conservative truncation point. Do not claim sample-accurate heard text.

## Frontend Event Contract

Replace loose speaker notifications with versioned, ordered events.

```ts
type BearRuntimeEvent = {
  version: 1;
  sequence: number;
  callSid: string;
  turnId: string;
  playbackEpoch: number;
  type:
    | "session.state"
    | "bear.speech.queued"
    | "bear.speech.started"
    | "bear.speech.ended"
    | "bear.speech.interrupted"
    | "bear.transcript";
  bearId?: "back_left_log" | "back_right_log";
  responseId?: string;
  text?: string;
  reason?: string;
};
```

Frontend rules:

- The backend event identifies the active bear.
- The browser's mixed-audio analyzer controls mouth amplitude and shapes.
- Only the active bear may animate its mouth.
- Playback epochs reject late events after preemption.
- Smokey enters a brief interruption-reaction animation when Maple takes over.
- Simultaneous bear output remains unsupported because the browser receives one mixed stream.

## File And Module Plan

Do not add more transport and state logic to the existing `agent/src/index.ts` monolith.

Create:

```text
agent/src/
  server.ts
  config.ts
  types/
    protocol.types.ts
    session.types.ts
  twilio/
    call-route.ts
    media-stream.ts
    media-stream.types.ts
  realtime/
    realtime-session.ts
    realtime-session.types.ts
  conversation/
    bear-call-session.ts
    turn-orchestrator.ts
    maple-listener.ts
    playback-controller.ts
    runtime-events.ts
```

Update:

- `agent/src/index.ts`: composition root only.
- `agent/package.json`: WebSocket dependency if required, test runner, test scripts.
- `agent/README.md`: native and ConversationRelay modes.
- `nextjs/src/app/call/route.ts`: native Media Stream TwiML or remove duplicate ownership.
- `nextjs/scripts/setup-twilio.mjs`: point DEV and PROD at one canonical `/call` owner.
- `nextjs/src/hooks/useBearVoiceAgent.ts`: consume ordered runtime events.
- `nextjs/src/lib/bearVoiceState.ts`: add listening, thinking, speaking, and interrupted phases.
- `nextjs/src/components/BearVoiceControls.tsx`: display two-bear runtime states.
- `nextjs/src/components/CampsiteHome.tsx`: keep controls available during active calls.
- `nextjs/src/components/scene-lab/CampfireScene.tsx`: interruption reaction and ambience ducking.
- Environment setup scripts: add native transport and model settings without deleting rollback settings.

## Configuration

Add server-only settings:

```env
BEAR_VOICE_TRANSPORT=conversation-relay
OPENAI_REALTIME_MODEL=gpt-realtime
SMOKEY_REALTIME_VOICE=cedar
MAPLE_REALTIME_VOICE=marin
MAPLE_FIRST_CHECKPOINT_MS=1800
MAPLE_CHECKPOINT_INTERVAL_MS=750
MAPLE_MAX_INTERRUPTS_PER_TURN=1
TWILIO_MEDIA_MARK_INTERVAL_MS=100
```

Do not expose OpenAI credentials or a shared event secret to the browser.

Replace the current public query-token SSE approach with a short-lived capability bound to the Twilio identity and Call SID before production release.

## Implementation Phases

### Phase 0: Capture Baseline

- Record the canonical greeting and one dynamic two-bear call.
- Add fixtures for current speaker events and Twilio call setup.
- Decide whether the agent or Next.js route owns production `/call`.
- Preserve current ConversationRelay behavior as the rollback path.

Exit criterion: the existing demo remains reproducible after module extraction.

### Phase 1: Single-Bear Native Audio Spike

- Add `<Connect><Stream>` native mode.
- Parse Twilio `connected`, `start`, `media`, `mark`, and `stop` events.
- Connect one OpenAI Realtime session using PCMU input and output.
- Forward visitor audio and native Smokey audio.
- Implement mark tracking, cancellation, clear, teardown, and timeout handling.
- Verify that the chosen native voices provide the desired character contrast without audio effects.

Exit criterion: Smokey can hold a stable native voice conversation through the existing browser call.

### Phase 2: Playback And Event Authority

- Add generation IDs and playback epochs.
- Emit queued, started, completed, and interrupted events.
- Update frontend reducer/state handling.
- Keep lip sync driven by actual mixed remote audio.
- Implement visitor barge-in end to end.

Exit criterion: stale audio cannot play or animate after cancellation.

### Phase 3: Two Native Bear Sessions

- Add persistent Maple session with a distinct voice and persona.
- Commit each visitor turn to both sessions.
- Explicitly authorize only one audible response at a time.
- Share labeled completed turns across sessions.
- Implement normal Smokey-then-Maple turn taking before interruption.

Exit criterion: both bears respond coherently without overlap or feedback.

### Phase 4: Maple Listening Checkpoints

- Copy Smokey PCMU output into Maple's listener buffer.
- Add first and recurring checkpoint scheduling.
- Add silent `WAIT`/`INTERRUPT` decisions.
- Serialize decisions and enforce one interruption per visitor turn.
- Log checkpoint audio duration and decision latency.

Exit criterion: Maple can identify a useful interruption opportunity from committed Smokey audio without speaking on `WAIT`.

### Phase 5: Contextual Interruption

- Generate Maple's response before cutting Smokey.
- Execute cancel, clear, truncate, epoch switch, and Maple playback atomically.
- Add Smokey's visual reaction.
- Add a bounded optional recovery beat.
- Reconcile generated, sent, and confirmed-played transcripts.

Exit criterion: the canonical dramatic interruption reads naturally in five consecutive real calls.

### Phase 6: Security, Deployment, And Polish

- Replace shared browser event tokens with scoped capabilities.
- Add reconnect and failure UI.
- Duck ambience during speech.
- Preserve call controls across scene navigation.
- Validate Heroku/Vercel/ngrok setup and Twilio signature handling.
- Make native mode selectable without redeploying code.

Exit criterion: native mode is demo-safe, observable, and reversible.

## Tests

### Agent Unit Tests

- Twilio media-message parsing.
- Realtime event parsing.
- PCMU duration accounting.
- Maple checkpoint scheduling.
- Decision serialization.
- One-interruption-per-turn enforcement.
- Playback epoch invalidation.
- Mark state before and after clear.
- Conservative heard-duration calculation.
- Late Smokey chunk rejection.
- User interruption during Smokey, Maple decision, and Maple playback.
- Cleanup when Twilio or either realtime socket closes.

### Integration Tests

Use fake Twilio and OpenAI sockets with captured fixtures:

- Normal visitor -> Smokey -> Maple sequence.
- Maple repeatedly returns `WAIT`.
- Maple returns `INTERRUPT` after the first checkpoint.
- Maple audio generation fails after deciding to interrupt.
- Smokey finishes before Maple's first audio arrives.
- Twilio clear returns marks for discarded audio.
- Visitor barges in during a pending bear interruption.
- OpenAI sends late deltas after cancellation.

Use fake clocks. Do not use real sleeps in timing tests.

### Frontend Tests

- Ordered event reduction.
- Duplicate and stale sequence rejection.
- Playback epoch transitions.
- Active bear ownership.
- Smokey interruption reaction timeout.
- Mouth closure after clear.
- AudioContext, EventSource/fetch stream, Device, and timer cleanup.

### Real Call Matrix

- Chrome and Safari desktop.
- iOS Safari and Android Chrome.
- Headphones and laptop speaker/microphone.
- Quiet room and ordinary room noise.
- Visitor interrupts Smokey.
- Visitor interrupts Maple.
- Maple interrupts short and long Smokey responses.
- Smokey finishes while Maple is evaluating.
- Backend deploy/disconnect during a call.

## Observability

Log transitions keyed by:

```text
Call SID
Stream SID
turn ID
generation
playback epoch
bear
OpenAI response ID
OpenAI item ID
Maple checkpoint ID
Twilio mark sequence
```

Measure:

- Visitor speech end to Smokey first audio.
- Smokey first audio to Maple first checkpoint.
- Checkpoint commit to Maple decision.
- Interrupt decision to Maple first audio ready.
- Last confirmed Smokey mark to Maple first audible audio.
- Generated versus confirmed-played Smokey duration.
- False or aborted interruption count.
- Visitor barge-in to audio clear and mouth closure.
- Realtime and Twilio socket failures.

Do not log raw private audio, credentials, or full private visitor content by default.

## Acceptance Criteria

1. Both bears use native model-generated audio in native mode.
2. Smokey and Maple have stable, distinct voices.
3. Visitor audio reaches both sessions without causing simultaneous automatic responses.
4. Maple can return `WAIT` silently while Smokey continues.
5. Maple can interrupt from the meaning and delivery of committed Smokey audio.
6. Maple's opening directly relates to a phrase the visitor actually heard.
7. No stale Smokey suffix plays after Twilio clear completes.
8. Unheard Smokey output does not remain in durable conversation history as heard speech.
9. Visitor barge-in cancels all pending bear work and takes priority.
10. Only the audible bear animates its mouth.
11. Smokey visibly reacts when Maple interrupts.
12. Normal bear turns never overlap accidentally.
13. ConversationRelay rollback mode still works.
14. Unit, integration, frontend, and real-call tests pass.
15. Maple's interruption delivery is expressive using model-native prosody alone.

## Stop Conditions

Do not present this as fully autonomous semantic interruption if testing shows any of the following:

- Maple usually reacts to audio substantially earlier than the phrase heard at cutover.
- Decision plus first-audio latency creates an unnatural pause or semantic drift.
- Micro-turn commits make Maple lose conversational coherence.
- Phone-quality PCMU removes the expressive benefit over ConversationRelay voices.
- False interruptions occur often enough to damage the conversation.

If those conditions hold, retain native audio generation but switch interruption selection to a deterministic planner using Smokey's output transcript and Twilio playback marks.

## Explicit Non-Goals

- Artificial pitch shifting.
- Time stretching or playback-rate manipulation for character delivery.
- Gain boosts or other post-processing of Maple's interruption audio.

These effects require decoding and re-encoding the PCMU call audio, add latency at the interruption boundary, and risk artifacts, duration drift, playback-accounting errors, and lip-sync mismatch. Revisit them only if native model prompting fails to produce a compelling interruption style.

## References

- OpenAI Realtime conversations: <https://developers.openai.com/api/docs/guides/realtime-conversations>
- OpenAI Realtime VAD: <https://developers.openai.com/api/docs/guides/realtime-vad>
- OpenAI Realtime event reference: <https://developers.openai.com/api/reference/resources/realtime>
- OpenAI Realtime prompting: <https://developers.openai.com/api/docs/guides/realtime-models-prompting>
- Twilio Media Streams overview: <https://www.twilio.com/docs/voice/media-streams>
- Twilio Media Streams WebSocket messages: <https://www.twilio.com/docs/voice/media-streams/websocket-messages>
- Twilio OpenAI Realtime integration: <https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-python>
