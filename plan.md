# Two-Bear Conversation Quality Plan

## Status

- Scope: quality-of-life pass for the two visible bears in scene 1.
- Characters:
  - Smokey: `back_left_log`.
  - Maple: `back_right_log`.
- Voice transport: Twilio Programmable Voice and ConversationRelay.
- Language model: OpenAI.
- Speech provider: Twilio ConversationRelay native ElevenLabs provider.
- Local backend: `agent/`, exposed through `mkimbell.ngrok.dev`.
- Production backend: the deployed WebSocket-capable agent service.
- This plan replaces the previous bootstrap/deployment plan. The basic browser call and ConversationRelay path now work.

## 1. Goals

The finished interaction should feel like two characters sharing a campfire, not one voice assistant attached to two models.

Required behavior:

1. Both bears respond during every completed visitor turn.
2. Smokey and Maple have distinct ElevenLabs voices.
3. The frontend always knows which bear owns the current speech cycle.
4. Only the audible bear opens its mouth.
5. Mouth opening reacts to actual remote audio amplitude.
6. Mouth movement starts and stops with audible speech, including pauses.
7. The speaking bear faces the visitor and uses subtle conversational head motion.
8. The listening bear looks toward the speaker and reacts naturally.
9. Maple can deliberately interrupt Smokey by preempting his current talk cycle.
10. Smokey visibly stops speaking and reacts when interrupted.
11. The visitor can interrupt either bear; queued stale dialogue must not continue afterward.
12. Both agent personas maintain coherent shared memory without repeating each other.
13. Existing bear poses, banjo arms, fish prop, glasses, tie, and social animation must not regress.

## 2. Canonical Scene

Preserve this opening as the authored acceptance fixture:

```text
Smokey: "Oh, hey there, partner. We weren't expecting company. We were just talking about our favorite senior engineer, Mitchell Kimbell. Earlier he..."

[Smokey has additional speech queued, but Maple cuts him off before it is heard.]

Maple: "Actually, Smokey, Mitch is a staff engineer."

[Smokey closes his mouth, recoils slightly, then looks at Maple.]

Smokey: "My apologies. We were just talking about our favorite staff engineer..."

[Smokey pauses and looks at Maple.]

Smokey: "Mitch. So, what would you like to know?"
```

Stage directions are animation events, never synthesized speech.

The opening remains deterministic. Dynamic OpenAI responses begin after the visitor's first substantive prompt.

## 3. Current State

### 3.1 Current Frontend Voice Behavior

Relevant files:

- `nextjs/src/hooks/useBearVoiceAgent.ts`
- `nextjs/src/lib/bearVoiceState.ts`
- `nextjs/src/components/BearVoiceControls.tsx`
- `nextjs/src/components/CampsiteHome.tsx`
- `nextjs/src/components/scene-lab/CampfireScene.tsx`

The browser currently measures one mixed Twilio remote audio stream with an `AnalyserNode`.

Current speaking detection:

- RMS threshold: approximately `0.012`.
- Speaking hangover: approximately `350 ms`.
- Remote audio level is written into a mutable scene ref.

Current speaker identity is not real:

- Every new audible segment starts as Smokey.
- The browser alternates active bear every two seconds while audio stays audible.
- Maple's actual voice can animate Smokey.
- Long Smokey speech can visibly jump to Maple.
- A pause can reset the next sentence to Smokey.

This fallback must be removed once backend speaker events are wired.

### 3.2 Current Mouth Behavior

The adult bear rig contains exact lowercase bones:

```text
head
  mouth
```

There is no adult `jaw` or `neck` bone.

The current frame callback:

1. Reads mixed remote RMS.
2. Multiplies it by a fixed gain.
3. Adds a fast `19 Hz` oscillator.
4. Replaces the mouth quaternion from a static captured rest pose.

Problems:

- The static rest quaternion is not the mixer-authored mouth pose.
- `sit_log` already writes a different constant mouth rotation.
- The procedural code currently discards approximately nine degrees of the authored mouth pose.
- The fast oscillator causes chatter rather than speech-like articulation.
- A 350 ms speaking hangover can keep the mouth moving after audible speech stops.
- React state is updated at audio-frame frequency even though scene animation uses a ref.

### 3.3 Current Head Behavior

The `sit_log` mixer animates `head` every frame.

After the mixer, the social-glance frame callback modifies `head` again. It can randomly turn a speaking bear away from the visitor or make the listener look at an unrelated third animal.

There is currently no state for:

- caller speaking,
- agent thinking,
- speaking bear,
- listening bear,
- interruption reaction,
- directed look-at-user,
- directed look-at-partner.

### 3.4 Current Backend Behavior

Relevant file:

- `agent/src/index.ts`

The current backend is one OpenAI completion pretending to be both bears:

- One OpenAI client.
- One system prompt.
- One shared history.
- One response containing two bear lines.

The current implementation does not contain two independent agent personas.

The canonical interruption uses server timers rather than playback feedback. Dynamic bear lines are sent immediately as consecutive talk cycles rather than waiting for the first line to finish.

The agent does not yet process:

- ConversationRelay `info` events,
- `tokensPlayed`,
- speaker events,
- per-cycle browser speaker events,
- actual audible completion barriers.

## 4. Technical Findings

### 4.1 ConversationRelay ElevenLabs Support

Twilio ConversationRelay supports:

```text
ttsProvider="ElevenLabs"
voice="<ElevenLabs voice ID>"
```

Twilio currently uses ElevenLabs Flash 2.5 by default.

Twilio also supports appending model and voice settings to a voice ID, including:

- model,
- speed from `0.7` to `1.2`,
- stability from `0.0` to `1.0`,
- similarity from `0.0` to `1.0`.

Example documented customization shape:

```text
<voice-id>-1.0_0.7_0.8
```

Exact combined model/settings syntax must be validated in a live spike before hard-coding it.

ElevenLabs is supplied by Twilio in this design. A separate ElevenLabs API key is not required for the first implementation.

### 4.2 Native ElevenLabs Configuration

The product requirement is two distinct `en-US` voices.

ConversationRelay does not expose a `voice` field on individual outbound `text` messages. Its native voice selection is based on preconfigured language profiles, so it cannot safely select two different voices that both use the same `en-US` profile.

Do not misuse `en-GB` merely as a routing key. Both bears must speak U.S. English.

The implementation follows Ramp's native ConversationRelay configuration with two preconfigured language profiles:

```text
Smokey text with lang=en-US
  -> Twilio native ElevenLabs voice 75DchiXtNUXnu3lra8pV

Maple text with lang=en-GB
  -> Twilio native ElevenLabs voice oubi7HGxNVjXMnWLgwBT
```

ConversationRelay continues to own:

- browser microphone transport,
- STT,
- caller barge-in,
- Twilio call audio delivery,
- text-cycle preemption,
- session lifecycle.

Smokey uses the supplied native `en-US` voice ID:

```text
75DchiXtNUXnu3lra8pV
```

Maple uses the supplied voice ID under the `en-GB` ConversationRelay profile:

```text
oubi7HGxNVjXMnWLgwBT
```

ConversationRelay configures one voice per language profile and outbound `text` messages select that profile through `lang`. The `en-GB` profile is intentionally used as the native routing key for Maple's distinct voice.

Acceptance condition: Maple must still sound acceptably U.S. English with the supplied voice ID. If the `en-GB` profile imposes unacceptable British pronunciation, stop and choose a per-utterance transport such as direct ElevenLabs synthesis/BYOTTS/Media Streams.

### 4.4 Playback and Interruption Events

ConversationRelay text messages support:

```json
{
  "type": "text",
  "token": "...",
  "last": true,
  "interruptible": true,
  "preemptible": true
}
```

`interruptible` means the visitor can stop playback.

`preemptible` means a later application `text` or `play` talk cycle can stop it.

The TwiML route must enable:

```text
events="speaker-events tokens-played"
```

The strongest current reference pattern is in `../ramp`:

```ts
{ type: "info", name: "tokensPlayed", value: string }
```

Do not assume event shape from documentation summaries. Capture and commit redacted real payload fixtures before finalizing protocol parsing.

### 4.5 Reference Implementations

Use these files as implementation references:

- `../ramp/packages/ai-core/src/types/websocket.ts`
  - ConversationRelay typed messages.
  - `tokensPlayed` as an `info` event.
  - preemptible `play` and stop-play patterns.
- `../ramp/apps/agent/src/routes/public/conversation-relay/ws/llm-listeners/llm-listeners.ts`
  - playback barriers with timeout fallback.
- `../ramp/apps/agent/src/routes/public/conversation-relay/ws/route.ts`
  - partial-prompt cancellation.
  - interruption tracking.
  - actually played text.
- `../ramp/packages/ai-core/src/utils/controllers/llm/cancel-current-response/cancel-current-response.ts`
  - `AbortController` cancellation.
- `../ramp/packages/ai-core/src/utils/controllers/llm/process-stream/process-stream.ts`
  - stale response-ID suppression.
- `../ramp/packages/ai-core/src/linguistics/voices.ts`
  - ElevenLabs voice IDs and sample URLs.
- `../twilio-website-agent/src/routes/call.ts`
  - ConversationRelay voice/provider configuration.
- `nextjs/src/components/ToucanGLB.tsx`
  - legacy audio-driven character motion reference only; do not reuse toucan runtime naming or state.

## 5. Architecture Decisions

### 5.1 Two Real Agent Personas

Implement two explicit OpenAI agent personas with separate system prompts and separate bounded histories.

Smokey agent:

- warm,
- folksy,
- enthusiastic,
- tells stories,
- occasionally imprecise,
- normally leads the response.

Maple agent:

- concise,
- dry,
- exact,
- notices inaccuracies,
- adds useful details rather than repeating,
- may interrupt Smokey when there is a reason.

Shared session state contains:

```ts
type BearConversationSession = {
  userHistory: UserTurn[];
  smokeyHistory: AgentTurn[];
  mapleHistory: AgentTurn[];
  sharedFacts: PortfolioFact[];
  currentTurnId: string | null;
  generation: number;
  activeCycle: SpeechCycle | null;
  pendingCycles: SpeechCycle[];
};
```

Each agent sees:

- the visitor's current question,
- approved Mitchell facts,
- a compact shared conversation summary,
- the other bear's current draft when needed,
- its own persona history.

### 5.2 Per-Turn Agent Pipeline

Normal turn pipeline:

1. Receive final visitor prompt.
2. Cancel stale generation and clear unsent cycles.
3. Run Smokey agent to create the lead response.
4. Run Maple agent with the visitor prompt and Smokey's lead.
5. Maple decides whether to:
   - follow after Smokey,
   - briefly interject,
   - hard-interrupt at a validated phrase boundary.
6. Validate both outputs.
7. Build a bounded speech-cycle plan.
8. Speak the plan using playback-driven sequencing.

Optional third beat:

- If Maple hard-interrupts, Smokey may get one short recovery beat.
- Generate recovery through a small Smokey follow-up call or a validated authored response pattern.
- Do not generate more than three audible beats per visitor turn in version 1.

### 5.3 Structured Agent Contracts

Smokey output:

```ts
type SmokeyDraft = {
  spokenText: string;
  interruptiblePrefix?: string;
  queuedSuffix?: string;
  keyFactsUsed: string[];
};
```

Maple output:

```ts
type MapleDraft = {
  spokenText: string;
  delivery: "follow" | "interject" | "interrupt";
  targetPhrase?: string;
  reason: "correction" | "detail" | "contrast" | "humor";
};
```

Final runtime plan:

```ts
type BearSpeechPlan = {
  turnId: string;
  beats: Array<{
    beatId: string;
    bearId: "back_left_log" | "back_right_log";
    text: string;
    voiceId?: string;
    preemptible: boolean;
    interruptible: boolean;
    start: "after_previous" | "preempt_previous";
    preemptAfterPlayedText?: string;
    cues: BearCue[];
  }>;
};
```

Validation rules:

- Both bears must have non-empty speech.
- Every line must be under the configured word/character limit.
- Maple's interruption target must be an exact normalized prefix boundary in Smokey's text.
- A hard interruption requires a non-empty queued Smokey suffix after the target.
- No raw stage directions in spoken text.
- Facts must map to approved portfolio data.
- Maximum one hard bear-on-bear interruption per visitor turn.
- Maximum three audible beats per visitor turn.
- Invalid output gets one repair attempt, then a safe authored two-line fallback.

### 5.4 One Speech-Cycle Owner

The backend owns speaker identity. The browser must never infer identity from sentence duration, amplitude, voice frequency, or alternation timers.

Each outbound talk cycle records:

```ts
type SpeechCycle = {
  ordinal: number;
  turnId: string;
  beatId: string;
  bearId: "back_left_log" | "back_right_log";
  expectedText: string;
  playedText: string;
  status: "queued" | "sent" | "playing" | "completed" | "preempted" | "cancelled";
};
```

Only one stable current cycle consumes generic playback events.

During bear-on-bear preemption:

1. Enter `PREEMPTING`.
2. Retain the old cycle as a tombstone.
3. Send the new Maple cycle.
4. Do not allow late Smokey speaker events to complete Maple.
5. Promote Maple only after attributable post-send evidence.
6. If event payloads cannot safely distinguish this, use text accumulation plus a conservative transition barrier.

## 6. Frontend Speaker Event Channel

### 6.1 Why It Is Required

The Twilio Voice SDK gives the browser one mixed remote audio stream. It does not expose the current bear's ConversationRelay voice ID or talk-cycle metadata.

Correct animation therefore requires a separate backend-to-browser event channel.

### 6.2 Event Protocol

```ts
type BearRuntimeEvent =
  | {
      type: "session.state";
      sequence: number;
      phase: "listening" | "thinking" | "speaking" | "interrupted" | "ended";
      turnId?: string;
    }
  | {
      type: "bear.speech.queued";
      sequence: number;
      turnId: string;
      beatId: string;
      bearId: BearId;
      text: string;
    }
  | {
      type: "bear.speech.started";
      sequence: number;
      turnId: string;
      beatId: string;
      bearId: BearId;
    }
  | {
      type: "bear.speech.ended";
      sequence: number;
      turnId: string;
      beatId: string;
      bearId: BearId;
      reason: "completed" | "bear_preempted" | "user_interrupted" | "cancelled";
    }
  | {
      type: "bear.cue";
      sequence: number;
      bearId: BearId;
      cue: BearCue;
    }
  | {
      type: "transcript";
      sequence: number;
      role: "user" | BearId;
      text: string;
      isFinal: boolean;
    };
```

### 6.3 Transport

Use an authenticated fetch-stream/SSE-style endpoint on the agent service.

Do not place bearer tokens in query strings.

Flow:

1. Voice token endpoint returns the generated Twilio browser identity.
2. Voice SDK call acceptance exposes Call SID.
3. Browser posts Call SID to a same-origin Next.js session-capability endpoint.
4. Next.js verifies the Call SID belongs to the current browser identity using Twilio REST.
5. Next.js issues a short-lived signed agent capability.
6. Browser opens the agent event stream with `Authorization: Bearer ...`.
7. Agent validates capability, attaches the subscriber, replays missed sequence events, then streams live events.

For the first local animation spike, a development-only unsigned channel may be used behind `APP_ENV=DEV`. Production must use the signed capability.

### 6.4 Frontend Voice State

Replace the current state with:

```ts
type BearVoiceState = {
  phase: "idle" | "listening" | "thinking" | "speaking" | "interrupted";
  activeBearId: BearId | null;
  interruptedBearId: BearId | null;
  remoteAudioLevel: number;
  smoothedAudioLevel: number;
  isRemoteAudioAudible: boolean;
  reactionUntil: number;
  sequence: number;
};
```

Identity comes from backend events.

Amplitude comes from the local remote-audio analyzer.

Mouth motion requires both:

```text
activeBearId matches this bear
AND
remote audio is currently audible
```

Remove the two-second browser alternation timer entirely.

## 7. Mouth Animation Plan

### 7.1 Preserve Mixer Pose

Current code copies a static mouth rest quaternion after the mixer. Replace it with an additive delta applied to the mixer's current frame result.

Correct frame logic:

```ts
const mixerMouth = mouth.quaternion;
openingDelta.setFromAxisAngle(MOUTH_OPEN_AXIS, openingRadians);
mouth.quaternion.multiply(openingDelta);
```

Do not copy `mouthRestQ` every frame.

The animation mixer rewrites the base mouth quaternion at the beginning of the next frame, preventing accumulation.

### 7.2 Audio Envelope

Maintain the high-frequency envelope only in refs.

Recommended initial values:

```text
noise gate:       0.010-0.014, calibrated in browser
attack:           35-55 ms
release:          75-130 ms
maximum opening:  8-14 degrees additive
minimum opening:  0 degrees below gate
```

Envelope algorithm:

1. Subtract the noise gate.
2. Normalize the remaining RMS through a configurable gain.
3. Clamp to `[0, 1]`.
4. Apply attack smoothing when rising.
5. Apply release smoothing when falling.
6. Apply a gentle nonlinear curve such as `sqrt(level)`.
7. Map to maximum opening.

Remove the fixed 19 Hz oscillator as the primary driver.

Optional micro-articulation:

- Add no more than 10-20% variation.
- Use a slower irregular modulation.
- Never move the mouth during true silence.

### 7.3 Audible Start and Stop

Use two thresholds to avoid chatter:

```text
start threshold > stop threshold
```

Example:

```text
start: 0.013
stop:  0.009
```

Require two consecutive above-threshold frames before audible start, following the Ramp latency detector precedent.

Use a short release envelope rather than a 350 ms boolean hangover.

The mouth should visibly close within roughly 100-150 ms after speech stops.

### 7.4 React Performance

Do not call React `setState` every animation frame for `remoteAudioLevel`.

- Write raw RMS and smoothed level to `voiceRef` every analyzer frame.
- Update React state only on coarse state transitions.
- If the UI displays a meter, throttle it to approximately 10-15 Hz.

## 8. Head and Body Animation Plan

### 8.1 One Final Pose Compositor

The current mixer, procedural overrides, and social glance all write bones in separate places. Consolidate adult conversational head behavior into one final post-mixer compositor.

Priority order:

1. interruption reaction,
2. speaking direction,
3. caller-listening direction,
4. partner-listening direction,
5. social glance,
6. idle micro-motion.

Lower-priority behaviors must yield rather than fight higher-priority states.

### 8.2 Speaking Bear

While speaking:

- Face generally toward the visitor/camera.
- Retain some mixer-authored motion.
- Add subtle nod/pitch motion at approximately `0.5-1.2 Hz`.
- Keep additive pitch under approximately `2-4 degrees`.
- Add a very small yaw drift so the pose is not robotic.
- Do not move the head at mouth/audio frame frequency.
- Do not use random target switching during a line.

### 8.3 Listening Bear

While the partner speaks:

- Look toward the active bear using the existing head-position registry.
- Clamp yaw/pitch to natural bounds.
- Add occasional small acknowledgement nods.
- Keep mouth closed.
- Do not mirror the speaker's exact rhythm.

While the visitor speaks:

- Both bears face the visitor.
- Maple may hold a more attentive/precise pose.
- Smokey may use a slight curious head tilt.

### 8.4 Interruption Reaction

When Maple preempts Smokey:

Smokey:

- closes mouth immediately,
- pauses speaking nod,
- recoils or tilts back `3-5 degrees`,
- turns briefly toward Maple,
- holds reaction for approximately `250-450 ms`,
- settles into listening pose.

Maple:

- turns toward Smokey at interruption onset,
- begins mouth movement only when Maple audio becomes audible,
- then eases toward the visitor while completing the correction.

Use a `reactionUntil` timestamp in the voice ref; do not create React renders per frame.

### 8.5 Social Glance Cleanup

During an active voice session:

- Disable random social target selection for Smokey and Maple.
- Keep social glance available for non-speaking animals.
- Restore random social behavior after the call ends.
- Remove bear entries from the head registry on unmount.
- Pick one hold duration at phase entry instead of calling the RNG repeatedly in the condition.

## 9. Playback-Driven Conversation Plan

### 9.1 Parse Real ConversationRelay Events

Extend inbound relay types to include generic `info`:

```ts
type RelayInfoMessage = {
  type: "info";
  name: string;
  value?: unknown;
};
```

Log redacted unknown info events in DEV.

Capture real payload fixtures for:

- `tokensPlayed`,
- `agentSpeaking`,
- `clientSpeaking`.

Do not finalize state transitions until fixtures are captured.

### 9.2 Greeting Interruption

Remove the fixed `750 ms` primary trigger.

New flow:

1. Send Smokey's preemptible talk cycle as phrase-sized tokens.
2. Queue a non-empty Smokey suffix after `Earlier he`.
3. Wait until `tokensPlayed` confirms `Earlier he` was heard.
4. Send Maple's new talk cycle with `preemptible` semantics.
5. Mark Smokey ended with `bear_preempted` only after Maple's send succeeds.
6. Wait for Maple completion using playback event plus timeout fallback.
7. Emit Smokey reaction cue.
8. Send Smokey apology.
9. Wait for completion.
10. Emit pause/look cue.
11. Send final Smokey prompt.

Keep a conservative timeout fallback for every playback barrier. Timer fallback is recovery, not the normal scheduler.

### 9.3 Dynamic Back-and-Forth

For normal follow mode:

1. Queue Smokey.
2. Publish `bear.speech.queued`.
3. Send Smokey cycle.
4. Publish `bear.speech.started` when playback evidence or audible state confirms start.
5. Wait for completion.
6. Publish ended.
7. Repeat for Maple.

For interruption mode:

1. Smokey cycle must be preemptible.
2. Maple target phrase must have a queued Smokey suffix.
3. Wait for target played prefix.
4. Send Maple cycle.
5. Publish Smokey preempted and Maple active transitions.
6. Optionally send one Smokey recovery beat after Maple completes.

### 9.4 Visitor Interruption

On first credible partial user prompt:

1. Increment session generation once.
2. Abort both active persona model calls.
3. Stop scheduling unsent speech cycles.
4. Mark current cycle user-interrupted.
5. Publish interruption event to browser.

On ConversationRelay `interrupt`:

1. Reconcile actually played text from `utteranceUntilInterrupt` and playback accumulation.
2. Do not treat the interrupt event as the visitor's final prompt.
3. Do not append unheard generated assistant text to memory.

On final prompt:

1. Add one user turn.
2. Start exactly one new dual-agent pipeline.

Deduplicate partial, interrupt, and final signals belonging to one barge-in.

## 10. ElevenLabs Configuration Plan

### 10.1 Environment

Add native ConversationRelay ElevenLabs configuration:

```env
SMOKEY_ELEVENLABS_VOICE_ID=75DchiXtNUXnu3lra8pV
SMOKEY_TTS_LANGUAGE=en-US
MAPLE_ELEVENLABS_VOICE_ID=oubi7HGxNVjXMnWLgwBT
MAPLE_TTS_LANGUAGE=en-GB
```

Both voice IDs must be `en-US` voices supplied by the user.

No `ELEVENLABS_API_KEY` is required for native Twilio ConversationRelay ElevenLabs voices.

### 10.2 ConversationRelay Configuration

Both DEV agent `/call` and production Next.js `/call` must produce equivalent ConversationRelay configuration:

```xml
<ConversationRelay
  ttsProvider="ElevenLabs"
  ttsLanguage="en-US"
  voice="SMOKEY_ELEVENLABS_VOICE_ID"
  events="speaker-events tokens-played"
  interruptible="speech"
  reportInputDuringAgentSpeech="speech"
  ...
>
  <Language code="en-US" ttsProvider="ElevenLabs" voice="SMOKEY_ELEVENLABS_VOICE_ID" />
  <Language code="en-GB" ttsProvider="ElevenLabs" voice="MAPLE_ELEVENLABS_VOICE_ID" />
</ConversationRelay>
```

Keep visitor STT language explicitly `en-US`. Bear speech uses ConversationRelay `text` TTS.

### 10.3 Audition Procedure

Create a small authored audition fixture with the same content for both bears:

```text
"Mitchell Kimbell is a staff engineer who builds conversational AI and cloud systems."
```

For each provided candidate, score:

- warmth,
- clarity over browser call audio,
- character distinction,
- pronunciation of Mitchell Kimbell,
- pronunciation of Twilio, Kubernetes, ConversationRelay, and Taipei,
- low-latency start,
- behavior during preemption,
- listener fatigue over five minutes.

Test at least two candidates per bear.

### 10.4 Voice Tuning

After the native voice spike, test Twilio-supported ElevenLabs voice/model settings if available in the configured ConversationRelay voice string.

Smokey target:

```text
slightly slower
medium stability
high similarity
```

Maple target:

```text
normal-to-slightly-fast
higher stability
high similarity
```

Change one setting at a time and retain a short recording/sample log.

## 11. Implementation Phases

### Phase 1: ElevenLabs Voice Spike

Files:

- `nextjs/src/app/call/route.ts`
- `agent/src/index.ts`
- `nextjs/.env.example`
- local ignored `nextjs/.env`

Tasks:

1. Configure native ElevenLabs provider and Smokey's supplied U.S. voice ID.
2. Configure matching `en-US` TwiML language profile.
3. Ensure DEV and PROD ConversationRelay configuration is equivalent.
4. Add `events="speaker-events tokens-played"` to both paths.
5. Test canonical greeting locally.
6. Test one intentional text-cycle preemption.
7. Record selected voice ID/settings in this plan.
8. Document Maple's supplied voice ID as blocked by the same-locale native-voice limitation.

Exit criteria:

- No Google or Twilio-default TTS voice is heard for bear dialogue.
- Both bears speak U.S. English through native ElevenLabs TTS.
- Smokey uses the supplied ElevenLabs native voice ID.
- Maple's distinct U.S. voice is not falsely claimed to be active.
- Preemption remains functional.

Stop/go decision:

- Keep native profiles if Maple's `en-GB` routing profile still produces acceptable U.S. speech.
- Move to direct ElevenLabs/BYOTTS/Media Streams only when the profile changes Maple's pronunciation unacceptably.

### Phase 2: Real Backend Speaker Events

Files:

- `agent/src/index.ts` initially.
- Split protocol/session files if `index.ts` becomes difficult to test.

Tasks:

1. Add typed info-event parsing.
2. Capture redacted real payloads.
3. Add speech-cycle ordinals and statuses.
4. Replace greeting timers with playback barriers.
5. Publish per-bear lifecycle events.
6. Add current-cycle/tombstone preemption state.
7. Add timeout fallback and cleanup.

Exit criteria:

- Logs identify exact bear and cycle at every transition.
- Greeting interruption uses played-text timing.
- No late event completes the wrong bear's cycle.

### Phase 3: Browser Event Channel

Files:

- `agent/src/index.ts` or new `agent/src/events.ts`.
- `nextjs/src/app/api/twilio/bear-session/route.ts`.
- `nextjs/src/hooks/useBearVoiceAgent.ts`.
- `nextjs/src/lib/bearVoiceState.ts`.

Tasks:

1. Return identity from voice-token route.
2. Capture Call SID after call acceptance.
3. Add signed session-capability route.
4. Add authenticated agent event stream.
5. Add replay sequence and deduplication.
6. Remove two-second bear alternation.
7. Drive `activeBearId` from backend events.
8. Preserve local RMS for amplitude only.

Exit criteria:

- Smokey audio always animates Smokey.
- Maple audio always animates Maple.
- Identity remains correct across pauses and long lines.

### Phase 4: Mouth Quality

Files:

- `nextjs/src/hooks/useBearVoiceAgent.ts`.
- `nextjs/src/components/scene-lab/CampfireScene.tsx`.

Tasks:

1. Remove audio-rate React updates.
2. Add noise gate and hysteresis.
3. Add attack/release envelope.
4. Preserve mixer mouth pose.
5. Remove dominant 19 Hz oscillator.
6. Tune additive opening range.
7. Add DEV-only debug controls/readout if needed.

Exit criteria:

- Mouth is closed during silence.
- Mouth starts within approximately two animation frames of audible speech.
- Mouth closes within approximately 150 ms.
- No rest-pose snap occurs.
- Existing `sit_log` mouth pose remains intact.

### Phase 5: Head, Listening, and Reaction Motion

Files:

- `nextjs/src/components/scene-lab/CampfireScene.tsx`.
- `nextjs/src/lib/bearVoiceState.ts`.

Tasks:

1. Build one final head-pose compositor.
2. Suspend social glances during directed conversation.
3. Add speaking nod/visitor-facing pose.
4. Add partner-facing listening pose.
5. Add visitor-listening pose.
6. Add interruption reaction.
7. Restore social behavior after call end.
8. Add head registry cleanup.

Exit criteria:

- Speaking bear generally faces the visitor.
- Listener looks at the correct speaker.
- Smokey visibly reacts when Maple interrupts.
- Motion remains subtle and does not distort the rig.

### Phase 6: Two Persona Agents

Files:

- Split `agent/src/index.ts` into focused modules:
  - `agent/src/agents/smokey.ts`.
  - `agent/src/agents/maple.ts`.
  - `agent/src/conversation/orchestrator.ts`.
  - `agent/src/conversation/schema.ts`.
  - `agent/src/conversation/session.ts`.

Tasks:

1. Define separate persona prompts.
2. Add separate bounded histories.
3. Implement sequential Smokey then Maple generation.
4. Add Maple interruption decision contract.
5. Add optional Smokey recovery generation.
6. Add approved Mitchell fact context.
7. Add strict runtime validation and repair.
8. Add abort controllers and stale response IDs for each persona call.

Exit criteria:

- Both personas contribute each turn.
- Maple responds to Smokey rather than repeating the user independently.
- Smokey and Maple maintain stable personalities.
- Unsupported Mitchell claims are not invented.
- User interruption cancels both persona runs.

### Phase 7: UX and Reliability

Tasks:

1. Show states: connecting, listening, thinking, Smokey speaking, Maple speaking, interrupted, error.
2. Change singular “Bear is speaking” to named character status.
3. Keep End/Mute controls available if the visitor leaves scene 1 during an active call.
4. End or confirm before scene navigation hides the agents.
5. Add captions attributed to Smokey/Maple.
6. Mark interrupted text visually.
7. Duck campsite ambience while speech is audible.
8. Add health/reconnect diagnostics.

Exit criteria:

- The visitor can always end an active call.
- Captions match audible speaker identity.
- Fire/banjo audio does not obscure speech or cause false interruptions.

## 12. Testing Plan

### 12.1 Agent Unit Tests

Cover:

- Smokey schema validation.
- Maple schema validation.
- exact interruption target validation.
- both bears required.
- maximum beat count.
- invalid fact rejection/fallback.
- normal sequencing.
- hard preemption.
- timeout fallback.
- partial-prompt cancellation.
- duplicate interrupt deduplication.
- stale model response suppression.
- played text versus generated text history.
- late info-event rejection.

### 12.2 Protocol Integration Tests

Use captured fixtures for:

- setup,
- final prompt,
- partial prompt,
- interrupt,
- info/tokensPlayed,
- info/speaker events,
- error,
- close.

Use fake clocks. Do not rely on real sleeps in tests.

### 12.3 Frontend Unit Tests

Cover:

- event sequence deduplication.
- stale turn rejection.
- active bear transitions.
- interruption reaction timing.
- audio gate hysteresis.
- attack/release envelope.
- no React state update per analyzer frame.
- cleanup of AudioContext, event stream, timers, and Device.

### 12.4 Visual Tests

Verify:

- silent mouth equals mixer-authored pose.
- Smokey only during Smokey audio.
- Maple only during Maple audio.
- head motion remains additive and bounded.
- listener tracks speaker.
- interruption reaction reads clearly.
- banjo arm pose remains correct.
- fish, tie, glasses, and baked poses remain correct.
- scene 2 and scene 3 remain unaffected.

### 12.5 Real Call Matrix

Test:

- Chrome desktop.
- Safari desktop.
- iOS Safari.
- Android Chrome.
- laptop speaker/mic.
- headphones.
- Bluetooth headset.
- quiet room.
- ordinary room noise.
- visitor interrupts Smokey.
- visitor interrupts Maple.
- Maple interrupts Smokey.
- long Smokey line.
- short Maple interjection.
- navigation away during active call.
- backend reconnect/deploy during call.

## 13. Observability

Add structured logs keyed by:

```text
Call SID
ConversationRelay session ID
turn ID
cycle ordinal
beat ID
bear ID
generation ID
```

Log transitions, not secrets or full private user content by default.

Measure:

- final user prompt to first model response.
- first Twilio token sent.
- first remote audio onset.
- per-bear talk-cycle duration.
- interruption target to Maple audio onset.
- mouth animation onset relative to audio onset.
- user interruption to bear mouth closure.
- invalid model output/fallback count.
- ConversationRelay errors.

Use Twilio Voice Insights to confirm `Preempted`, start/end agent speech, and interruption events.

## 14. Acceptance Criteria

The quality pass is complete when:

1. ElevenLabs is the configured TTS provider in DEV and PROD.
2. Smokey and Maple have clearly distinct approved voices.
3. No Google voice is heard.
4. Both agent personas speak during every normal user turn.
5. Maple can interrupt Smokey at an intentional phrase boundary.
6. Smokey's queued suffix is not heard after preemption.
7. The correct bear animates for every audible talk cycle.
8. Mouth opening follows actual audio amplitude.
9. Mouth remains still during silence and closes promptly.
10. Mixer-authored mouth pose is preserved.
11. Speaking bear faces the visitor with subtle head movement.
12. Listening bear looks toward the active speaker.
13. Smokey visibly reacts to Maple's interruption.
14. Visitor barge-in cancels queued stale dialogue.
15. Social glances resume when the call ends.
16. Existing scene poses and props do not regress.
17. Desktop and mobile real-call tests pass.

## 15. Deferred Work

Defer until the above works:

- phoneme/viseme lip sync,
- facial blendshapes,
- blinking rig additions,
- simultaneous overlapping bear audio,
- a third bear agent,
- persistent cross-session memory,
- direct ElevenLabs cloned/private voices,
- migration to raw Media Streams,
- multilingual visitor support.

The first target is believable timing and character ownership, not perfect cinematic lip sync.

## 16. Documentation References

- Twilio ConversationRelay voice configuration: <https://www.twilio.com/docs/voice/conversationrelay/voice-configuration>
- ConversationRelay TwiML reference: <https://www.twilio.com/docs/voice/twiml/connect/conversationrelay>
- ConversationRelay WebSocket messages: <https://www.twilio.com/docs/voice/conversationrelay/websocket-messages>
- ConversationRelay Voice Insights summary: <https://www.twilio.com/docs/voice/voice-insights/conversation-relay-summary>
- Rendered code references are listed in sections 3 and 4.
