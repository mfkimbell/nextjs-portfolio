# Professional Bear Animation Stability Plan

## Deterministic Bear Dialogue Handoff

### Objective

Smokey and Maple must alternate as two unambiguous characters even though ConversationRelay mixes both into one remote audio stream and both currently use the same ElevenLabs voice. The bear animated as speaking must always match the line Twilio has actually begun playing, not merely the latest line queued by the agent.

### Root Cause Before The Fix

The agent previously published `bear.speech.started` inside `sendTalkCycle`, immediately before sending text to ConversationRelay. That event meant "queued," but the browser interpreted it as "audible now." During a preemptive handoff, network and TTS latency could therefore select Maple before Maple was audible. More importantly, the browser subscribes to SSE after the call connects; if it missed the initial events, its audio analyzer defaulted to Smokey and could animate Smokey throughout Maple's correction.

The greeting has two additional sequencing hazards:

- timeout recovery advances to the next bear without proof that the target phrase played;
- a second Smokey line is sent immediately after Smokey's correction response, creating an unnecessary adjacent same-speaker cycle.

### Required State Machine

Each session owns exactly one active talk cycle:

```text
idle
  -> queued(bear, text)
     publish bear.speech.queued before sending the Twilio text token
  -> audible(bear, playedText)       on first non-empty tokensPlayed
  -> interrupted                    only after confirmed interrupt target
  -> queued(otherBear, text)
  -> audible(otherBear, playedText) on first non-empty tokensPlayed
  -> ended                          only after confirmed full-line playback
```

Rules:

1. Sending text sets the queued line, clears its playback accumulator, and publishes `bear.speech.queued` before the Twilio text token. The frontend switches animation ownership at this prospective boundary but does not claim that audio has started.
2. The first non-empty `tokensPlayed` chunk publishes `bear.speech.started` exactly once for that talk cycle.
3. A normal handoff occurs only after normalized `tokensPlayed` contains the complete current line.
4. An interruption occurs only after normalized `tokensPlayed` contains the validated interruption target.
5. A timeout logs and aborts the remaining exchange. It must never guess that playback completed and send the other bear over uncertain audio.
6. An SSE client that connects late receives an immediate `bear.speech.started` snapshot when a line is already confirmed audible.
7. Caller interruption invalidates the generation and clears the active audible cycle.
8. Speaker prompts and sanitization remain defense in depth; they do not determine runtime speaker identity.
9. When Maple interrupts, a third Smokey cycle follows Maple's confirmed full line. It must explicitly acknowledge the substance of the correction before returning to the visitor's question, so the exchange reads as one conversation rather than independent answers.
10. Contextual uptake is enforced by construction, not trusted to prompting. Maple supplies a compact `handoffContext`; the application prepends `Right, <handoffContext>.` to Smokey's generated continuation. If structured context is missing, the application derives it from Maple's spoken line.
11. `tokensPlayed` is retrospective: Twilio describes it as what was just played. It confirms `bear.speech.started`, but it is too late to assign the first audible chunk. Prospective ownership therefore comes from `bear.speech.queued`, emitted only after the prior line or interruption target is confirmed.
12. Every queued line receives an immutable `speechId`. The same ID is carried through queued, started, interrupted, and ended events. The frontend ignores terminal events whose ID does not match the currently assigned line, so stale events cannot transfer or clear another bear's speech ownership.

### Greeting Contract

The opening must be exactly three talk cycles:

```text
Smokey: Oh, hey there, partner. We weren't expecting company. We were just
        talking about our favorite senior engineer, Mitchell Kimbell. Earlier he...
Maple:  Actually, Smokey, Mitchell is a staff engineer.
Smokey: Right, staff engineer. So what would you like to know about Mitchell?
```

Maple may preempt only after `tokensPlayed` confirms `Mitchell Kimbell`, immediately after Smokey gives the incorrect title. Smokey's response starts only after Maple's entire correction is confirmed played. There is no fourth greeting line.

For generated interruptions, the corresponding contract is:

```text
Smokey lead -> Maple factual correction -> Smokey acknowledgement of that correction
```

For example, after a correction from senior engineer to staff engineer, the application emits `Right, staff engineer` before Smokey's continuation. This phrase is deterministic, not optional LLM wording. Maple follow-ups that do not interrupt remain two turns.

### Conversation Repair Rationale

The exchange follows a repair sequence rather than three independent completions:

```text
trouble source -> correction -> uptake -> continuation
```

The uptake is the evidence that Smokey heard Maple. A generic transition such as `So what would you like to know?` is not valid uptake because it contains no reference to the correction. Google Conversation Design similarly recommends context-specific recovery instead of repeating a generic prompt, and Twilio recommends sending a complete normalized non-streaming utterance with `last: true`. The implementation therefore builds one complete Smokey utterance whose first clause is deterministic contextual uptake and whose second clause is LLM-generated continuation.

### Verification

- Unit-test first-token start detection and one-start-per-cycle behavior.
- Unit-test normalized full-line and interruption-target confirmation.
- Test that timeouts do not call the next send operation.
- Test late-subscriber snapshot behavior.
- Run agent tests, agent typecheck/build, Next.js typecheck/build, and `git diff --check`.
- Perform one live call and verify the active bear changes only as the corresponding words become audible.

## Objective

Eliminate Smokey's intermittent chest/torso vibration during speech and establish a professional animation architecture for both talking bears.

The finished result must preserve:

- the authored `sit_log` base animation;
- current mouth, lip, blink, and facial work;
- a believable jaw hinge, lip seal, muzzle volume, and mouth interior;
- Smokey's banjo pose and prop alignment;
- Maple's fish-stick pose and hand placement;
- conversational gaze and listener behavior;
- audio-driven mouth shapes, pitch response, and accents;
- independent skeletons for every bear instance.

The fix must not merely hide the symptom by reducing all motion. It must give each transform one clear owner and make animation behavior deterministic across frame rates, clip phases, and speech patterns.

## Current Implementation Status

### Completed

- Dialogue is serialized through confirmed `tokensPlayed` playback rather than queue time.
- Speaker-start events are emitted once, on the first audible chunk, and late SSE subscribers receive the active speaker snapshot.
- Interruptions require a validated phrase that has actually played; failed playback no longer advances to the next bear.
- Interruptions produce a three-turn exchange: Smokey lead, Maple correction, and Smokey acknowledgement that references the correction.
- Accidental speaker labels and multi-character output are removed before TTS.
- Smokey's and Maple's authored hand/prop poses remain separate from facial and gaze layers.
- Maple occasionally looks down toward the live fish-on-stick target with a deliberately lowered gaze target.
- Quiet voice bears have restrained idle head variation; authored torso, hands, and props remain untouched.
- Banjo picking uses the audio clock with zero-default experimental finger and wrist controls.

### Remaining

- Run a live Twilio call and verify queued, audible, handoff, and ended log order against what is heard.
- Tune interruption frequency and acknowledgement wording from real conversations.
- Complete banjo fret shifts, contact targets, and lab/production parity.
- Decide whether the future `upper_body` rig is justified after the current stable runtime layer is visually reviewed.

## New Gaze Controls

Two production controls are required for conversational eye-line tuning:

- `bearLookUserYOffset`: vertical offset applied to the user's gaze target. Negative values make the bears look lower instead of over the user's head.
- `bearLookPartnerDelay`: delay, in seconds, before a bear turns toward the other bear after that bear begins speaking. This makes Smokey visibly react to Maple's voice instead of snapping at the exact event boundary.

Defaults should be conservative and adjustable in Scene Lab. These controls change only gaze targeting and must not alter paw, banjo, torso, or facial contact poses.

## Executive Diagnosis

### Primary Finding

The deployed GLB and `sit_log` animation are smooth. The strongest cause of Smokey's chest vibration is the runtime speech-body layer in `CampfireScene.tsx`, not a corrupt animation clip.

During speech, the runtime currently:

1. lets `AnimationMixer` animate `center`, `chest`, `head`, shoulders, pelvis, and thighs;
2. applies conversational gaze to `head`;
3. derives a new torso rotation axis from that already-changing head transform;
4. rotates `center` with an underdamped audio-accent spring;
5. inverse-rotates pelvis, thighs, and shoulders to keep props and the seat stationary;
6. independently multiplies `chest.scale` for breathing.

That creates competing transforms across vertices blended between chest and shoulders. It also changes the torso's rotation axis as the head looks around.

Maple has `talkBodyStill: true`, so Maple skips the risky torso and breathing layers. If the glitch is predominantly Smokey-only, that is strong confirmation of this diagnosis.

### Confidence Ranking

1. **Very high:** head-derived torso axis changes every frame.
2. **Very high:** `center` lean plus inverse shoulder/hip compensation creates skinning shear.
3. **High:** the intentionally underdamped torso spring reads as vibration under repeated accents.
4. **Medium:** mixer, talk simulation, gaze, and audio analysis use different time-step policies.
5. **Medium:** native `sit_log` center/chest motion visually beats against unrelated speech motion.
6. **Conditional:** `bearTalkLean` is applied to both impulse and output, amplifying values above `1` nonlinearly.
7. **Conditional:** the 350 ms audio hangover can send a final accent impulse to the wrong speaker during handoff.
8. **Latent risk:** multiplicative chest breathing can accumulate if a future clip stops writing chest scale.

### Facial Finding

The facial rig is mechanically stable but visually under-articulated. The current five-bone mouth behaves more like a hinged jaw plus rigid lip flap than a soft muzzle.

The primary facial limitations are:

1. sparse jaw and muzzle weighting;
2. central lower-lip vertices rigidly following one bone;
3. abrupt rest-seal release;
4. point-like corner translations without volume correctives;
5. only nine upper-lip-controlled vertices;
6. no independent lip compression/closure control;
7. no funnel-versus-pucker distinction;
8. existing sculpted morph correctives disabled whenever the bone rig exists;
9. one bilateral blink rather than independent eyelids;
10. no tongue/teeth hierarchy for readable extreme shapes.

## Evidence

## Blender Inspection

The deployed file inspected in Blender 5.2 LTS was:

```text
nextjs/public/wildpoly/bear_sit_fixed.glb
```

The imported asset contains:

- one armature;
- one primary bear mesh;
- 37 deform bones;
- one `sit_log` action;
- 1,083 mesh vertices;
- normalized vertex weights.

### Actual Hierarchy

```text
Armature
└── root
    └── center
        ├── chest
        ├── spine
        ├── head
        ├── pelvis
        ├── shoulder_L
        ├── shoulder_R
        ├── thigh_L
        └── thigh_R
```

Important implications:

- `chest` and `spine` are leaf bones.
- shoulders and head are siblings of chest, not children of an upper-body chain.
- `center` itself has no directly weighted vertices.
- rotating `center` moves the whole body through inheritance.
- counter-rotating shoulder and hip children moves blended vertices in opposing directions.

### Base Clip Smoothness

Sampling all 288 frames of `sit_log` at 24 fps showed:

```text
center maximum frame rotation change:  ~0.079 degrees
chest maximum frame rotation change:   ~0.056 degrees
head maximum frame rotation change:    ~0.190 degrees
center loop rotation discontinuity:     0 degrees
chest loop rotation discontinuity:      0 degrees
```

These values do not explain a visible vibration by themselves.

### Weight Findings

All vertex weight sums are normalized.

Relevant overlap:

```text
chest + shoulder_L: 65 vertices
chest + shoulder_R: 68 vertices
```

That overlap is not automatically bad. It becomes problematic when `center` rotates the chest inheritance one way while shoulders are explicitly counter-rotated the other way.

### Facial Rig Findings

Current facial hierarchy:

```text
head
├── mouth                 legacy, animated, now zero weighted
├── jaw
│   └── lip_lower
├── lip_upper
├── lip_corner_L
└── lip_corner_R
```

Current mouth pivots in mesh/glTF coordinates:

```text
jaw:          ( 0.000, 0.630, 0.930)
lip_lower:    ( 0.000, 0.612, 1.212)
lip_upper:    ( 0.000, 0.615, 1.300)
lip_corner_L: ( 0.097, 0.616, 1.201)
lip_corner_R: (-0.097, 0.616, 1.201)
```

The jaw pivot is plausibly behind the visible mouth and is not the main flaw. The larger issue is deformation coverage and control separation.

Blender weight inspection:

```text
jaw:           23 vertices, average weight 0.469, maximum 0.95
lip_lower:     31 vertices, average weight 0.833, 14 fully weighted
lip_upper:      9 vertices, average weight 0.700
lip_corner_L:  13 vertices, maximum weight 0.50
lip_corner_R:  19 vertices, maximum weight 0.50
legacy mouth:   0 weighted vertices
```

Current GLB morph targets:

```text
jawOpen
mouthWide
mouthRound
eyeBlink
```

When the complete bone rig is discovered, runtime code forces `jawOpen`, `mouthWide`, and `mouthRound` morph influences to zero. The higher-quality nonlinear sculpting in those shapes therefore contributes nothing to the production mouth.

### Current Runtime Mouth Motion

Runtime mouth code is around `CampfireScene.tsx:8104-8157`.

Default jaw opening reaches approximately 18 degrees. Jaw opening also applies a small forward/down translation.

The quiet seal applies approximately:

```text
jaw:      -0.015 radians
lower lip: -0.100 radians
combined lower-mouth rotation: approximately -0.115 radians
```

The seal reaches zero by approximately one-third of normalized mouth opening:

```text
1 - min(1, open * 3)
```

That can create a visible pop from sealed to unsealed.

Current corner controls translate points for wide and round shapes but do not provide enough nonlinear cheek/muzzle deformation to preserve volume.

### Banjo Performance Findings At Initial Inspection

Smokey's current pose accurately places both paws on the instrument. The initial inspection found no playing animation; the current runtime now adds a clocked finger-performance layer while preserving that pose.

Current behavior:

```text
sit_log mixer
  -> runtime freezes Food at frame 30
  -> runtime hard-replaces both shoulder/arm/hand chains with banjoBearPose.json
  -> no wrist stroke, finger curl, fret shift, or audio phase
```

Confirmed details:

- the right and left arm chains are reset to the same authored quaternion every frame;
- `fingers_L` and `fingers_R` are not part of the banjo override;
- both finger tracks are constant in the source `sit_log` clip;
- the visible `banjo_clean.glb` has no skeleton or animation;
- the `Food` socket is frozen at frame `30 / 24 = 1.25` seconds;
- the running base clip still moves `center`, so paw-to-banjo contact can slide by roughly 2-4 cm at scene scale;
- the banjo audio runs independently from the animation system;
- the background track is stereo, 44.1 kHz, and approximately `127.295` seconds long;
- leaving and returning to the campfire panel resumes the retained audio position rather than restarting at frame zero.

At initial inspection, the bear read as holding the banjo because the only meaningful motion remained in the face and head. The current runtime now adds an audio-clocked finger layer on top of the authored neutral pose; the remaining limitations are discrete fret shifts and contact diagnostics.

## Runtime Inspection

Primary implementation:

```text
nextjs/src/components/scene-lab/CampfireScene.tsx
```

Relevant regions:

- `useAnimations`: around line 7628.
- talk state: around lines 7394-7417.
- audio accent impulses: around lines 7972-7994.
- talk spring integration: around lines 8058-8079.
- conversational gaze: around lines 8200-8291.
- torso lean and counter-rotation: around lines 8293-8325.
- head procedural layer: around lines 8328-8338.
- chest breathing: around lines 8340-8348.

### Current Transform Order

The practical frame order is:

```text
AnimationMixer writes base bone TRS
  -> root placement and prop/arm overrides
  -> speech state and mouth bones
  -> conversational head gaze
  -> center torso lean
  -> inverse shoulder/hip compensation
  -> speech head offsets
  -> chest scale breathing
  -> ear offsets
  -> render
```

The intended mixer-before-procedural order is directionally correct, but it depends on same-priority R3F callback subscription order. The ownership model remains fragile because several procedural systems write related bones in separate callbacks.

## Root Causes To Fix

### 1. Unstable Torso Axis

Current torso motion derives its local rotation axis from the current head world quaternion after the head has already received mixer and gaze changes.

This means a constant lean amount can rotate around a subtly different axis every frame.

Required correction:

- never derive torso orientation from the animated head;
- use a stable axis from the torso bone's local/rest coordinate system;
- construct the delta quaternion from identity every frame;
- normalize the final quaternion.

### 2. Opposing Parent/Child Compensation

Current behavior rotates `center`, then applies the exact inverse to:

```text
pelvis
thigh_L
thigh_R
shoulder_L
shoulder_R
```

This preserves props approximately, but creates deformation conflict across blended chest/shoulder vertices.

Required correction:

- remove runtime inverse counter-rotation;
- either disable below-neck procedural movement on the current rig;
- or introduce a dedicated upper-body control bone that excludes pelvis and thighs.

### 3. Underdamped Accent Spring

Current torso spring:

```text
stiffness: 26
```

Critical damping is approximately:

```text
2 * sqrt(26) ≈ 10.2
```

The current system intentionally oscillates. Accent impulses can occur every 700 ms, so the torso may never settle during expressive speech.

Required correction:

- remove the torso spring during initial stabilization;
- then reintroduce it near critically damped, approximately `10-12` damping;
- reduce impulse magnitude;
- do not apply `bearTalkLean` to both the impulse and final output.

### 4. Mixed Time Bases

Current clocks differ:

```text
AnimationMixer: uncapped R3F delta
talk simulation: delta capped at 0.1 s with substeps
gaze: delta capped at 0.05 s
audio analysis: performance.now() delta capped at 0.1 s
```

After a frame hitch, these layers can temporarily disagree.

Required correction:

- establish one frame owner for base mixer update plus procedural composition;
- use the same bounded delta for body/gaze procedural state;
- reset or snap transient procedural velocities after long suspension rather than simulating a catch-up burst.

### 5. Fragile Chest Scale Breathing

Current breathing multiplies the chest scale after the mixer.

It does not accumulate today because `sit_log` writes a chest scale track each frame. It becomes unsafe if the action is paused, stopped, replaced, or exported without that scale channel.

Required correction:

- cache the post-mixer chest scale each frame;
- write `baseScale * breathingFactor`, never multiply the previous final scale;
- preferably migrate breathing to a low-amplitude chest/body morph or an authored additive clip.

## Target Animation Architecture

Use a deterministic layered pipeline:

```text
1. evaluate base clip and crossfades
2. capture post-mixer local transforms
3. update persistent procedural scalar state
4. construct fresh local delta quaternions
5. apply upper-body/head/ear deltas once
6. apply mouth and facial controls
7. update world matrices
8. render
```

Each transform must have one primary owner:

| Transform | Owner |
|---|---|
| character placement | outer group |
| base skeleton TRS | AnimationMixer |
| talking upper-body offset | one animation controller |
| conversational gaze | same controller, after base pose |
| mouth/lips/blink | face controller |
| banjo/fish prop stabilization | dedicated prop/socket controller |

Do not let independent `useFrame` callbacks write the same bone family without an explicit ordered controller.

## Rig Strategy

## Phase 1 Rig Policy: Preserve Existing Skeleton

Do not immediately repaint weights or restructure the deployed skeleton.

First prove the runtime diagnosis by disabling only:

- `center` speech lean;
- inverse shoulder/hip compensation;
- chest scale breathing.

Keep:

- mouth/lip animation;
- head pitch and accent nods;
- subtle head drift;
- gaze;
- ears and blink;
- listener head response.

If the chest vibration disappears, the diagnosis is confirmed without risking the assets.

## Phase 2 Rig Improvement: Add `upper_body`

For professional torso motion, add a non-deforming upper-body control bone in Blender:

```text
root
└── center
    ├── pelvis
    ├── thigh_L
    ├── thigh_R
    └── upper_body     new, no direct weights
        ├── chest
        ├── spine
        ├── head
        ├── shoulder_L
        └── shoulder_R
```

Benefits:

- upper body can lean without moving the seat or legs;
- shoulders naturally follow the torso;
- no inverse child transforms are necessary;
- existing chest/shoulder weight blending no longer receives opposing transforms;
- banjo and fish hand relationships remain within one upper-body branch.

Migration requirements:

1. Insert `upper_body` with identity local transform relative to `center`.
2. Reparent upper-body children while preserving world rest transforms.
3. Update inverse bind matrices.
4. Bake or migrate all `sit_log` channels.
5. Re-run mouth-rig and pose-bake scripts against the updated skeleton.
6. Export a new versioned GLB rather than overwriting the only source asset.
7. Validate in Blender, Three.js, and an independent glTF viewer.

Do not perform a full anatomical hierarchy rewrite in the same change. Rebuilding to `pelvis -> spine -> chest -> neck -> head` would be cleaner long-term but requires full animation retargeting and weight review.

## Target Facial Architecture

Use a hybrid system:

```text
skeletal controls
  -> jaw, teeth, eyes, tongue, gross lip placement

morph targets
  -> lip seal, muzzle volume, visemes, corner shapes, eyelids, brows, correctives
```

Bones should provide rigid or broadly rotational motion. Morphs should provide soft-tissue deformation and combination correction.

Do not choose between bones and morphs. The current problem comes partly from using bones as the complete solution while disabling the morph layer.

### Recommended Facial Skeleton

```text
head
├── jaw
│   ├── teeth_lower      rigid lower teeth, if modeled
│   ├── tongue_root
│   │   ├── tongue_mid
│   │   └── tongue_tip
│   └── lip_lower_ctrl   optional broad lower-lip control
├── teeth_upper          rigid upper teeth, if modeled
├── eye_L
├── eye_R
├── lip_upper_ctrl       optional broad upper-lip control
├── lip_corner_L
└── lip_corner_R
```

Rules:

- Place the jaw axis through the rear mandible joints, not at the chin.
- Weight chin, lower muzzle, lower lip base, and lower mouth interior coherently to the jaw.
- Keep nose pad, upper snout, upper teeth, and nasal bridge on the head.
- Blend cheek/muzzle transition areas, then correct them with morphs.
- Parent lower teeth and tongue root to the jaw.
- Keep eye aim separate from eyelid deformation.

For this low-poly character, the tongue can begin as one jaw-parented mesh with `tongueUp` and `tongueOut` morphs. A three-bone tongue is optional polish.

### Core Corrective Morphs

Preserve and improve the existing morphs, then add:

```text
mouthClose
jawOpenCorrective
mouthWide
mouthFunnel
mouthPucker
mouthPress
upperLipUp
lowerLipDown
mouthCornerUp_L
mouthCornerUp_R
mouthCornerDown_L
mouthCornerDown_R
blink_L
blink_R
```

Recommended expression additions:

```text
cheekRaise_L / cheekRaise_R
squint_L / squint_R
browInnerUp
browOuterUp_L / browOuterUp_R
browDown_L / browDown_R
noseSneer_L / noseSneer_R
```

The first professional pass does not require full ARKit coverage. It requires readable closure, spread, rounding, jaw volume, eyes, and asymmetry.

### Speech Shape Vocabulary

The long-term interchange target should be compatible with the common 15-viseme vocabulary:

```text
sil
PP    p / b / m
FF    f / v
TH    th
DD    t / d
KK    k / g / ng
CH    ch / j / sh
SS    s / z
NN    n / l
RR    r
AA    open vowels
E     medium spread vowels
IH    narrow spread vowels
OH    open rounded vowels
OU    tight rounded vowels / w
```

The current analyser does not produce phoneme timestamps, so do not pretend it provides full viseme recognition.

Use two levels:

1. **Immediate:** map current continuous `open`, `wide`, and `round` signals into improved hybrid controls.
2. **Future:** add a phoneme/viseme timing adapter when a reliable timing source is available.

For the immediate system:

```text
open
  -> jaw bone rotation
  -> jawOpenCorrective morph
  -> lowerLipDown at larger openings

wide
  -> mouthWide morph
  -> controlled corner spread
  -> slight upper-lip lift

round
  -> mouthFunnel + mouthPucker blend
  -> corners inward
  -> muzzle pads inward and forward

silence / closure
  -> mouthClose / mouthPress
  -> smooth lip seal independent of jaw angle
```

### Jaw Behavior

Jaw opening and lip closure must be independent.

Required behavior:

- vowels drive most jaw opening;
- `/p b m/` can close the lips even if the jaw is not completely closed;
- `/f v/` needs upper-teeth/lower-lip contact;
- rounded vowels move the muzzle forward rather than only narrowing the aperture;
- wide vowels spread the lips without pulling the full cheek backward;
- extreme opening activates a corrective that preserves chin and cheek volume.

Replace the current seal equation with a configurable smooth release curve.

Starting concept:

```text
seal = 1 - smoothstep(sealStart, sealEnd, open)
```

Tune in front and profile views. Do not hard-code authored seal values separately in JSON and runtime code.

### Coarticulation

Do not snap between mouth shapes.

- Smooth control coefficients, not final vertex positions.
- Start rounded and bilabial anticipation before the acoustic peak where timing permits.
- Give closure shapes priority over surrounding open vowels.
- Use faster attack for closures and slower release for vowels.
- Prevent incompatible families such as full stretch and full pucker from both reaching weight `1`.
- Keep jaw smoothing separate from lip-shape smoothing.

Starting timing ranges:

```text
shape attack:  35-70 ms
shape release: 60-120 ms
jaw release:   slightly slower than closure attack
```

Validate against real generated voice audio instead of treating these values as fixed requirements.

### Asymmetry And Acting

- Keep core speech shapes symmetrical.
- Add low-frequency expression asymmetry through corners, cheeks, eyelids, and brows.
- Never weaken required lip contact for asymmetry.
- Use independent left/right blink controls.
- Keep speech-driven brow and eyelid motion sparse.
- Do not drive brows directly from raw amplitude.

### Mouth Interior

The character needs a stable dark mouth cavity at large openings.

Current vertex darkening is useful but should be validated with:

- full jaw open;
- profile view;
- camera close-up;
- bright fire lighting;
- rounded mouth;
- tongue-up pose.

Add rigid teeth only if they improve the design. Incorrectly placed teeth are worse than a clean stylized mouth bag.

## Facial Asset Pipeline

Make facial assets reproducible from a versioned Blender source.

Current risks:

- the mouth-rig script and rig JSON are untracked;
- runtime seal values duplicate authored JSON values;
- the rig patcher assumes the first skin, first mesh, and first primitive;
- rerunning the rig patcher appends new accessors and grows GLBs;
- the Blender source and generated JSON can drift;
- no CI command validates all shipped bear faces.

Required pipeline:

```text
Blender source
  -> export face basis, bone pivots, weights, and morph deltas
  -> patch one canonical source GLB
  -> bake per-bear poses
  -> validate every GLB
  -> produce a manifest with hierarchy and target names
```

The current validator entry point is:

```text
python3 scripts/validate_bear_assets.py
```

It currently passes for `bear_sit_fixed.glb`, `bear_sit_front_log.glb`, and `bear_sit_back_right_log.glb`.

The patcher must:

- resolve mesh by name;
- validate vertex count and basis positions;
- validate expected skin and hierarchy;
- overwrite compatible accessors instead of appending orphaned data;
- fail on unexpected node/primitive ordering;
- verify no legacy `mouth` weights remain;
- verify normalized maximum-four influences;
- verify identical facial hierarchy across shipped bears.

## Facial Diagnostic Tooling

Extend Scene Lab with:

```text
raw open / wide / round meters
smoothed control meters
manual jaw slider
manual mouth-close slider
manual wide / funnel / pucker sliders
independent corner sliders
corrective-morph toggle
front / three-quarter / profile camera presets
wireframe and weight overlays
freeze-at-frame control
speaker calibration reset
```

Add deterministic reference poses:

```text
rest
sealed lips
25% / 50% / 100% jaw open
wide
funnel
pucker
press
FF contact
PP seal
jaw open + wide
jaw open + round
smile + jaw open
left/right blink
```

Capture front and profile screenshots for every reference pose.

## Target Banjo Performance Architecture

Preserve the current hand placement as the neutral contact pose. Add small reversible deltas rather than reauthoring the shoulders and hands.

Layer order:

```text
sit_log base pose
  -> authored static banjo contact pose
  -> audio-synchronized picking/fretting layer
  -> optional contact correction / IK
  -> finger articulation
  -> face, head, ears, and blink
  -> render
```

The performance must remain independent from speech. Smokey should continue playing while speaking, with face/head acting layered above stable instrument contact.

### Playing Style

Choose the style after listening to and measuring the shipped track.

Recognizable choices:

```text
three-finger roll
  -> small rapid thumb/index/middle plucks
  -> stable wrist and forearm
  -> ring/pinky side visually anchored near the banjo head

clawhammer
  -> relaxed claw paw
  -> wrist-led knocking stroke
  -> brush plus thumb catch/release

broad strum
  -> larger wrist/forearm arc
  -> least specific, easiest to read at distance
```

Do not animate a generic up/down wrist until the track style is identified. A mismatched clawhammer motion over a three-finger track will look less credible than subtle motion.

### Current-Rig Minimum

The current bear has one `fingers_R` and one `fingers_L` bone rather than separate digits.

The minimum convincing performance with this rig is:

```text
right arm / picking hand
  shoulder_R: fixed
  upperarm_R: nearly fixed
  arm_R: very small supporting rotation
  hand_R: primary stroke/pulse
  fingers_R: curl/release synchronized with note attacks

left arm / fretting hand
  shoulder_L: fixed
  upperarm_L: fixed
  arm_L: tiny shift support
  hand_L: two or three discrete fret positions
  fingers_L: press/release around each shift
```

The picking motion should have zero net offset over a cycle and return exactly to the current authored hand pose at every loop boundary.

### Future Picking-Hand Rig

For a clear three-finger roll at close range, add separate controls:

```text
hand_R
├── pick_thumb
├── pick_index
└── pick_middle
```

Optional additional anchor:

```text
pick_anchor
```

This lets the wrist remain stable while thumb, index, and middle alternate. Do not add the extra bones until the current single-finger-bone version proves that the camera can actually reveal the detail.

### Banjo-Local Contact Targets

Create targets in banjo-local space:

```text
pick_hand_anchor
pick_strike_center
fret_low
fret_mid
fret_high
elbow_hint_L
elbow_hint_R
```

The banjo owns these targets. If the instrument moves, contact targets move with it.

Recommended contact strategy:

1. Author appealing FK arm arcs.
2. Apply a final two-bone IK/contact correction to keep paws planted.
3. Keep elbows bent and use pole/hint targets to prevent flips.
4. Use 85-100% IK weight during planted contact.
5. Reduce IK briefly only during intentional fret shifts or picking recovery.

If runtime IK proves too complex for the current flat rig, bake the constrained result into an additive clip in Blender.

### Audio Synchronization

Audio time must be authoritative. Do not advance banjo animation by accumulated render delta.

Expose the banjo loop's playback position from `useCampsiteAudioLoop`:

```text
audioTimeRef.current = audio.currentTime
```

Drive performance phase from that absolute value:

```text
beatPhase = ((audioTime - phraseStart) * beatsPerSecond) mod phraseBeats
```

If the track has stable tempo, store:

```text
bpm
beatOffsetSeconds
beatsPerPhrase
```

If timing drifts or tempo varies, store an authored beat-marker array instead.

Because the audio element pauses and resumes with retained time, sampling absolute `currentTime` makes animation resume in phase automatically after panel navigation or frame drops.

### Picking Motion

For a three-finger roll:

- represent eight subdivisions per roll pattern;
- alternate finger curls rather than bouncing the whole wrist on every note;
- keep wrist motion small and slower than the digit sequence;
- place contact at subdivision peaks;
- begin anticipation 5-15% before contact;
- recover without crossing the current hand anchor.

For clawhammer:

- use a wrist-led downstroke;
- preserve the claw silhouette;
- add brush and thumb release as distinct phases;
- keep forearm support subtle.

### Fretting Motion

Use two or three discrete chord positions instead of continuous sliding.

Each shift follows:

```text
release
  -> short travel
  -> settle with slight overshoot
  -> press and hold
```

Shift during musically available gaps or immediately before the next phrase accent. Keep the paw locked during sustained notes.

### Secondary Performance

- Head nods belong on beats, half-notes, or phrase accents, not every picked note.
- Keep torso still until the upper-body rig exists.
- Add a tiny instrument reaction only after paw motion is correct.
- Ear/blink timing should not repeat exactly at the performance loop seam.
- Speech head motion and banjo performance must not fight for shoulder/arm ownership.

Optional polish after the primary motion reads:

- subtle string vibration;
- tiny drum-head response;
- pick-hand contact compression;
- occasional fret-hand reposition;
- start-playing and stop-playing transitions.

### Banjo Scene Lab

Update the banjo lab to preview the production stack rather than only a paused pose.

Required controls:

```text
audio file play/pause
audio current time
BPM and beat offset
playing style
stroke amount
wrist amount
finger curl amount
fret shift amount
performance phase scrubber
slow-motion playback
IK/contact toggle
skeleton helper
banjo-local target helpers
```

The lab must stop manually advancing a mixer already owned by `useAnimations`. Use one mixer owner and the same production performance utility.

### Banjo Performance Modules

```text
nextjs/src/components/scene-lab/banjo-animation/
  index.ts
  banjo-animation.types.ts
  banjo-animation.constants.ts
  banjo-performance.ts
  banjo-performance.test.ts
  use-banjo-performance.ts
```

```text
banjo-performance.ts
  pure audio-time-to-pose math
  stroke envelopes
  finger phases
  fret state and transitions

use-banjo-performance.ts
  reads audioTimeRef
  applies additive deltas after static pose
  applies contact correction
  publishes debug state
```

## Authored Additive Motion

After stabilization, move reusable body performance out of ad hoc springs and into small authored additive clips.

Recommended clips:

```text
talk_idle_soft
talk_emphasis
listen_ack
breath_idle
```

Each clip should affect only intended bones. Strip root, pelvis translation, feet, and unrelated scale tracks.

At runtime:

- clone the clip before conversion;
- select a neutral reference frame;
- use `THREE.AnimationUtils.makeClipAdditive`;
- play the additive action continuously;
- drive action weight with smoothed speech/accent state;
- fade weights rather than starting/stopping on every syllable.

Use procedural motion only for low-amplitude variation that benefits from live audio, such as head pitch and emphasis magnitude.

## Motion Design Guidelines

### Speaking Bear

- Mouth and lips carry most high-frequency speech motion.
- Head pitch follows smoothed F0 at low amplitude.
- Accent nods should be occasional, not every syllable.
- Torso gestures should occur on selected strong accents only.
- Torso motion should be one directional beat with critical damping, not a repeating wobble.
- Head drift must be band-limited and deterministic, never per-frame random noise.

### Listening Bear

- Maintain gaze toward the speaker.
- Use delayed acknowledgement nods sparingly.
- Keep torso mostly stable around props.
- Avoid mirroring every speaker accent.

### Breathing

- Keep resting motion subtle.
- Prefer authored additive or morph-based volume change.
- Do not scale a bone recursively from its previous frame.
- Separate idle breathing from phrase-start inhalation.

## Implementation Modules

The current `Animal` component is too large and owns unrelated systems.

Extract the animation work into dedicated modules:

```text
nextjs/src/components/scene-lab/bear-animation/
  index.ts
  bear-animation.types.ts
  bear-animation.constants.ts
  use-bear-animation.ts
  use-bear-animation.test.ts
  bear-talk-springs.ts
  bear-talk-springs.test.ts
  bear-rig.ts
  bear-rig.test.ts
```

Responsibilities:

```text
bear-rig.ts
  discover and validate named bones
  cache rest/post-mixer transforms
  assert hierarchy expectations

bear-talk-springs.ts
  pure frame-rate-independent scalar state
  no Three.js object mutation

use-bear-animation.ts
  evaluate mixer
  compose procedural layers in deterministic order
  publish debug metrics
```

Keep audio feature extraction in:

```text
nextjs/src/lib/bearLipSync.ts
```

Do not mix signal analysis with skeleton mutation.

## Diagnostic Tooling

Add a professional animation debug mode to Scene Lab.

Required toggles:

```text
base clip only
mouth only
head prosody
gaze
torso lean
shoulder/hip compensation
breathing
ears/blink
skeleton helper
weight-risk overlay
```

Required telemetry:

- effective action name, weight, time, and time scale;
- render delta and bounded procedural delta;
- center/chest/head quaternion angular change per frame;
- torso spring value and velocity;
- current speaking/listening identity;
- accent impulse timestamps;
- detected long-frame resets;
- active procedural layer names.

Use quaternion angular distance, not component difference, because `q` and `-q` represent the same orientation.

## Phased Execution

## Phase 0: Reproduce And Record

1. Capture a deterministic audio clip that reliably causes Smokey's chest vibration.
2. Run it through `useBearTalkTest` with Smokey selected.
3. Record current output at 30, 60, and 120 fps where possible.
4. Capture transform telemetry for center, chest, head, and shoulders.
5. Confirm Maple remains stable with identical audio.

Exit criterion:

- the glitch is reproducible without placing a Twilio call;
- a baseline video and metric trace exist.

## Phase 1: Isolate The Layer

Test in this order:

1. Base `sit_log` only.
2. Add mouth and blink.
3. Add head pitch/nods.
4. Add gaze.
5. Add current center lean.
6. Add inverse shoulder/hip compensation.
7. Add chest breathing.

Expected result:

- the first layer that introduces chest shimmer identifies the direct trigger;
- center lean plus compensation is expected to fail first.

Exit criterion:

- root cause is observed, not inferred.

## Phase 2: Immediate Stability Fix

1. Remove head-derived torso axis.
2. Remove center/child inverse compensation from production.
3. Disable chest scale breathing in production.
4. Keep face, head, gaze, ear, and blink layers.
5. Change torso spring to critically damped before any limited reintroduction.
6. Apply the torso amount knob exactly once.
7. Reset talk velocities after long frame suspension.

Exit criterion:

- no visible chest vibration across the reproduction audio;
- props remain acceptably aligned;
- both bears retain readable speaking/listening behavior.

## Phase 3: Deterministic Controller

1. Consolidate mixer and procedural composition into one animation controller.
2. Remove reliance on same-priority callback subscription order.
3. Capture post-mixer transforms explicitly.
4. Apply fresh delta quaternions from identity.
5. Replace multiplicative carry-over with base-plus-delta writes.
6. Add pure unit-tested spring and damping code.

Exit criterion:

- identical elapsed time and input produce equivalent poses at 30, 60, and 120 fps;
- no transform has multiple uncontrolled writers.

## Phase 4: Rig Upgrade

1. Version the Blender source asset.
2. Insert the non-deform `upper_body` bone.
3. Reparent upper-body children with preserved transforms.
4. migrate/bake `sit_log`.
5. Re-export and validate skinning.
6. Update bone discovery and hierarchy assertions.
7. Compare props, mouth rig, and poses against baseline screenshots.

Exit criterion:

- upper body can lean without inverse shoulder/hip transforms;
- chest/shoulder surface remains stable throughout the clip.

## Phase 5: Facial Rig Upgrade

Current implementation status: the first runtime-only hybrid layer is in place. The jaw bone remains primary, while the existing sculpted `jawOpen`, `mouthWide`, and `mouthRound` targets now contribute controlled corrective weights through Scene Lab settings. The Blender re-rig and new corrective targets below remain future work.

1. Track and version all mouth-rig source files.
2. Make the GLB patch process deterministic and idempotent.
3. Validate the jaw pivot in front and profile views.
4. Repaint jaw, chin, lower muzzle, upper lip, and corner falloffs.
5. Replace the rigid lower-lip flap behavior with broader soft falloff.
6. Add `mouthClose`, `jawOpenCorrective`, funnel, pucker, press, and independent blink morphs.
7. Stop forcing all mouth morphs to zero when facial bones exist.
8. Map `open`, `wide`, and `round` into hybrid bone-plus-morph controls.
9. Replace hard-coded seal release with one authored smooth curve.
10. Add deterministic reference-pose screenshots and GLB structure tests.

Exit criterion:

- the jaw reads as a mandible rotating with chin/muzzle mass, not a lip flap;
- lips can seal independently of jaw angle;
- wide and round shapes preserve muzzle volume;
- combined jaw/morph poses remain stable in front and profile views;
- blinking is independently controllable per eye.

## Phase 6: Banjo Performance

Current implementation status: the banjo loop exposes an absolute `currentTime` ref. The authored contact pose remains unchanged at zero control values. Production and Scene Lab now share the finger phase utility and expose zero-default experimental controls for right-finger curl, right-wrist pitch, right-wrist roll, and left-finger fret pressure. Fretting shifts, IK/contact targets, and lab parity remain future work.

1. Expose banjo audio `currentTime` through a mutable ref. **Complete.**
2. Listen to the shipped track and choose three-finger, clawhammer, or broad-strum motion.
3. Measure/store BPM and beat offset or author beat markers.
4. Preserve `banjoBearPose.json` as the neutral contact pose.
5. Add additive right-wrist and `fingers_R` picking cycles. **Initial clocked layer complete; visual tuning remains.**
6. Add `fingers_L` fret pressure. **Initial pressure layer complete; two or three discrete left-hand shifts remain.**
7. Add banjo-local contact targets and optional IK correction.
8. Make `Food` follow the same body frame as the planted hands without restoring torso jitter.
9. Update Banjo Bear Lab to run the production performance layer and audio clock.
10. Add slow-motion contact and loop-seam diagnostics.

Exit criterion:

- the right paw visibly produces the rhythm;
- the left paw presses and shifts without sliding continuously;
- both paws remain convincingly attached to the instrument;
- animation resumes in phase with retained audio time;
- the performance loop has no visible seam.

## Phase 7: Animation Polish

1. Author additive speaking/listening clips.
2. Drive clip weights from smoothed audio state.
3. Tune motion hierarchy: torso beat, then head accent, then face.
4. Reduce repetitive listener nods.
5. Add deterministic variation by character seed.
6. Validate camera-distance readability and mobile performance.
7. Keep Maple's fish glance below the fish rather than at eye level; tune its hold time and return-to-user transition.
8. Keep idle motion subordinate to speech, gaze, and authored contact poses.

Exit criterion:

- performances look intentional rather than procedurally busy;
- each bear has character without constant motion.

## Testing

### Pure Unit Tests

- spring convergence at 30, 60, and 120 fps;
- no overshoot beyond configured limits;
- long-frame reset behavior;
- one-time application of torso strength;
- talk start/stop fade behavior;
- deterministic seeded variation;
- rig hierarchy validation;
- missing-bone fallback.
- seal release curve monotonicity;
- incompatible facial-shape arbitration;
- separate jaw and lip smoothing;
- per-speaker analyser calibration/reset;

### Runtime Tests

- queued text does not publish a speaker-start event before `tokensPlayed`;
- queued text publishes prospective speaker ownership before its Twilio text token is sent;
- first non-empty `tokensPlayed` chunk publishes exactly one speaker-start event;
- normal handoff waits for the complete current line;
- interruption waits for the validated target and then waits for the correction to finish;
- timeout aborts the exchange without sending the next bear's line;
- late SSE subscription receives the currently audible speaker snapshot;
- interrupted Smokey resumes with an explicit acknowledgement of Maple's correction;
- one bear instance does not modify another;
- base clip remains active at weight `1`;
- mixer advances once per frame;
- procedural layer runs after mixer evaluation;
- disabling all procedural layers matches independent GLB playback;
- paused animation does not accumulate chest scale;
- speaker handoff does not apply a stale accent to the outgoing bear.
- banjo animation samples audio time rather than accumulating frame delta;
- banjo pose returns exactly to neutral at the performance loop boundary;
- paused/resumed audio returns the hand animation to the same musical phase;
- banjo and paw target distance remains within the contact tolerance;
- runtime and lab use one mixer update per frame;

### Asset Tests

- Khronos glTF Validator passes;
- animation loops without center/chest discontinuity;
- all weights remain normalized;
- no unexpected vertex influence truncation;
- mouth bones retain expected hierarchy and weights;
- inverse bind matrices match the exported rest pose;
- independent glTF viewer matches Blender playback.
- facial mesh name and vertex order match authored basis;
- jaw/lip/corner pivots match the manifest;
- legacy `mouth` bone has zero skin weight;
- facial controls use no more than four weights per vertex;
- all shipped bears expose identical facial target names;
- rig patching is idempotent and does not grow the GLB on a no-op rerun;

### Visual Regression Matrix

- Smokey speaking with banjo.
- Maple speaking with fish stick.
- Smokey listening to Maple.
- Maple listening to Smokey.
- bear-on-bear interruption.
- visitor barge-in.
- silence and phrase start.
- long expressive speech.
- low-volume and noisy speech.
- Chrome, Safari, iOS, Android.
- 30, 60, and 120 fps simulation.
- every facial reference pose in front and profile view;
- rapid open-to-close phrase;
- sustained wide vowel;
- sustained rounded vowel;
- bilabial closure sequence;
- jaw-open plus smile and jaw-open plus round combinations;
- banjo picking at normal speed and 0.25x speed;
- picking-hand contact at every subdivision;
- fretting-hand release, travel, settle, and hold;
- banjo loop seam;
- panel navigation away/back while audio retains position;
- Smokey talking while continuing to play;
- Maple's idle fish glance and return to the conversation;
- Smokey's correction acknowledgement after Maple's interruption;

## Acceptance Criteria

1. Smokey's chest never vibrates or shimmers during the deterministic reproduction clip.
2. Base `sit_log` playback remains smooth and loop-safe.
3. No runtime inverse shoulder/hip counter-rotation is required.
4. Torso axes are stable and independent of animated head orientation.
5. Every procedural transform is recomputed from post-mixer pose plus a fresh delta.
6. Motion remains materially equivalent across 30, 60, and 120 fps.
7. Banjo, fish stick, hands, and seated contact remain visually stable.
8. Mouth, lips, blink, and facial animation do not regress.
9. Speaker/listener gaze remains natural during handoffs and interruptions.
10. Skeleton instances remain independent.
11. Asset and runtime tests pass.
12. Independent Blender, Three.js, and glTF viewer playback agree.
13. Jaw opening moves chin and lower-muzzle volume coherently.
14. Lip seal is independent from jaw closure and does not pop around one-third opening.
15. Existing corrective morphs remain active alongside facial bones.
16. Wide, funnel, pucker, and press shapes are visually distinct.
17. Mouth corners do not pinch or collapse the cheeks.
18. Left and right blinks can be controlled independently.
19. Mouth interior remains convincing at maximum opening and under fire lighting.
20. Facial assets can be regenerated and validated from tracked sources with one command.
21. Smokey visibly picks/strums rather than holding a static pose.
22. Right-hand motion matches the musical style and beat grid.
23. Left-hand shifts are discrete and musically timed, with no continuous neck sliding.
24. Both paws remain planted within the contact tolerance.
25. Banjo performance stays synchronized after frame drops and panel pause/resume.
26. Banjo Bear Lab reproduces the production performance layer exactly.
27. Maple visibly looks down at the fish during an idle glance without moving the fish stick or authored hands.
28. Interrupted exchanges contain a clear correction acknowledgement from Smokey before the conversation continues.
29. No bear is assigned another bear's line by queue-time or stale speaker state.

## Non-Goals

- Full anatomical re-rig in the first fix.
- Motion capture.
- Physics-driven secondary motion.
- Per-frame random body noise.
- Fixing the symptom with blanket model scaling or camera changes.
- Repainting all weights before runtime transform conflicts are removed.
- Full ARKit 52-shape coverage in the first facial pass.
- Complex tongue rig before jaw, seal, corners, and muzzle volume are correct.
- Detailed individual picking fingers before the current camera proves they are visible.

## Sources

- Google Conversation Design, context-specific error handling: <https://developers.google.com/assistant/conversation-design/errors>
- Twilio ConversationRelay best practices, complete non-streaming utterances and TTS normalization: <https://www.twilio.com/docs/voice/conversationrelay/best-practices>
- Three.js `AnimationMixer`: <https://threejs.org/docs/#api/en/animation/AnimationMixer>
- Three.js `AnimationAction`: <https://threejs.org/docs/#api/en/animation/AnimationAction>
- Three.js `AnimationUtils.makeClipAdditive`: <https://threejs.org/docs/#api/en/animation/AnimationUtils>
- Three.js additive blending example: <https://threejs.org/examples/webgl_animation_skinning_additive_blending.html>
- Three.js `SkeletonUtils.clone`: <https://github.com/mrdoob/three.js/blob/dev/examples/jsm/utils/SkeletonUtils.js>
- React Three Fiber `useFrame`: <https://r3f.docs.pmnd.rs/api/hooks#useframe>
- Drei `useAnimations`: <https://drei.docs.pmnd.rs/abstractions/use-animations>
- Khronos glTF animation specification: <https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations>
- Khronos glTF skins tutorial: <https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_020_Skins.html>
- Blender glTF exporter: <https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html>
- Blender armature skinning: <https://docs.blender.org/manual/en/latest/animation/armatures/skinning/introduction.html>
- Blender shape keys: <https://docs.blender.org/manual/en/latest/animation/shape_keys/introduction.html>
- Apple ARKit blendshape locations: <https://developer.apple.com/documentation/arkit/arfaceanchor/blendshapelocation>
- Meta/Oculus viseme reference: <https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/>
- Microsoft viseme and phoneme mapping: <https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme>
- NVIDIA Audio2Face-3D SDK: <https://github.com/NVIDIA/Audio2Face-3D-SDK/tree/main/docs>
- Pixar animation principles: <https://graphics.pixar.com/library/PrinciplesTradAnim/>
- Deering three-finger banjo rolls: <https://blog.deeringbanjos.com/the-four-essential-5-string-banjo-rolls>
- Deering clawhammer overview: <https://blog.deeringbanjos.com/what-is-clawhammer-banjo>
- Brainjo clawhammer mechanics: <https://clawhammerbanjo.net/8steps/8-essential-steps-to-clawhammer-banjo-lesson-1/>
- Three.js `AnimationMixer.setTime`: <https://threejs.org/docs/#api/en/animation/AnimationMixer.setTime>
- Three.js `CCDIKSolver`: <https://threejs.org/docs/#examples/en/animations/CCDIKSolver>
- Web Audio clock: <https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime>
- Web Audio loop timing: <https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop>
- Frame-rate-independent damping: <https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/>
