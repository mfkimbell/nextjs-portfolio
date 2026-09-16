# Toucan Landing Animation — Research Brief + Blender MCP Handoff

Paste the **Blender MCP prompt** section below into the Blender-capable AI.

This brief is for the current rerigged asset, not the older four-bone toucan report. The current project uses:

- GLB: `nextjs/public/models/toucan_wing_fly_land_v2.glb`
- Working blend likely: `blender/toucan_wing_fly_land_v2_working.blend`
- Runtime component: `nextjs/src/components/ToucanGLB.tsx`
- Runtime config/filter maps: `nextjs/src/config/toucan.ts`

Current runtime arrival sequence:

1. `ACT_fly_loop`
2. `ACT_land_approach`
3. `ACT_land_settle`

The GLB actions are **in-place**. The web app moves a parent group through the world, so the Blender animation must not bake global flight travel into the armature/object/root.

---

## Research summary: how a bird landing should read

A natural bird landing is not simply “flying motion that stops.” It has a clear biomechanics sequence:

1. **Targeting** — the bird visually locks onto the perch/landing point. The head usually feels steadier than the body.
2. **Braking / flare** — wings broaden, angle of attack increases, tail lowers/fans, body pitches up slightly, forward speed bleeds off.
3. **Foot reach** — feet extend forward/down late in the approach; toes/claws prepare to wrap. One foot can lead by a frame or two.
4. **Contact** — feet contact first. Contact should feel crisp, not mushy or floaty.
5. **Compression** — body mass continues downward after foot contact; legs/feet absorb the landing. This is the key missing pose in many stiff bird landings.
6. **Balance recovery** — wings remain open briefly after contact, often with a small stabilizing flap or asymmetrical correction.
7. **Rebound / settle** — body rebounds slightly, tail counter-flicks, wings fold in overlapping stages, then the bird returns to quiet perch idle.

For a toucan-like bird, the landing should feel **arboreal, broad-winged, and a little top-heavy** because of the huge beak silhouette. Avoid hummingbird-like flutter or a smooth airplane glide. Think: strong wingbeats, a visible flare, decisive foot placement, short compression, then wing/tail follow-through.

To remove stiffness, prioritize:

- silhouette-changing key poses: cruise, flare, pre-contact, crouch, rebound, tucked;
- offset timing between wing root/mid/tip;
- slight left/right asymmetry;
- tail counterbalance;
- foot reach before contact;
- body compression after contact;
- no perfectly even/metronomic curves.

---

## Runtime constraints that matter

The app filters exported clips before they reach three.js. If the Blender animation keys tracks that are filtered out, the work will not show in-app.

For arrival clips, current runtime preserves **rotation** on:

- `Body`
- `Chest`
- `Tail`
- `WingRoot_L`, `WingMid_L`, `WingTip_L`
- `WingRoot_R`, `WingMid_R`, `WingTip_R`
- `Foot_L`, `Foot_R`

For arrival clips, current runtime preserves **position** only on:

- `ACT_fly_loop`: `Foot_L.position`, `Foot_R.position`
- `ACT_land_approach`: `Foot_L.position`, `Foot_R.position`
- `ACT_land_settle`: `Body.position`

Current runtime drops:

- scale tracks;
- morph tracks;
- most position tracks;
- `Head` rotation during the arrival clips.

Important implication: natural landing often benefits from head target-fixation, but **Head animation currently will be stripped unless `Head` is added to the arrival `CLIP_BONES` allow-list in `nextjs/src/config/toucan.ts`**. The Blender AI may author subtle Head animation, but it must report that an integration change is required.

Also: wing lift should use the real wing appendage chain:

- `WingRoot_L/R`
- `WingMid_L/R`
- `WingTip_L/R`

Do **not** base the arrival improvement on the older `Wing_L`/`Wing_R` flank deformers. In this project, the real extracted wing motion is on the WingRoot→WingMid→WingTip chain, primarily on the wing roll axis. Verify signs visually in Blender; do not assume pitch.

---

## Blender MCP prompt

```md
You are improving the toucan fly-in and perch landing animation for a Next.js / three.js project.

Source asset/context:

- GLB: `nextjs/public/models/toucan_wing_fly_land_v2.glb`
- Working blend likely: `blender/toucan_wing_fly_land_v2_working.blend`
- The current arrival sequence is:
  1. `ACT_fly_loop`
  2. `ACT_land_approach`
  3. `ACT_land_settle`

The current landing feels stiff. Please improve these three actions so the bird reads as a real toucan-like bird braking onto a perch: flare, feet reach, foot contact, body compression, balance recovery, wing/tail follow-through, final tuck.

## First: verify rig and actions

Before editing, inspect and report:

1. Bone names and hierarchy.
2. Shape keys/morph targets.
3. Existing actions and durations.
4. Whether actions `ACT_fly_loop`, `ACT_land_approach`, and `ACT_land_settle` exist.

This is the current rerigged asset, not the old four-bone toucan. Expected useful controls include:

- `Body`
- `Chest`
- `Tail`
- `WingRoot_L`, `WingMid_L`, `WingTip_L`
- `WingRoot_R`, `WingMid_R`, `WingTip_R`
- `Foot_L`, `Foot_R`
- likely `Head`, `UpperBeak`, `LowerBeak`
- possible morph targets such as `body_puff`, `chest_breath`, `throat_pulse`

## Non-negotiable integration constraints

The web app moves the bird through the world by animating a parent group. Therefore:

- Keep the GLB actions essentially IN-PLACE.
- Do not animate root/object/armature forward through space.
- Do not bake global travel into the GLB.
- Do not animate scale.
- Preserve exact bone names and hierarchy.
- Preserve existing rest rotations/quaternions.
- Do not zero, apply, reorient, or “fix” bones destructively.
- Pose animation must be relative to the current rest pose.
- Do not rely on constraints/drivers unless baked into keyframes.
- Keep action names exactly:
  - `ACT_fly_loop`
  - `ACT_land_approach`
  - `ACT_land_settle`
- Export a GLB with animations included and sampled/baked reliably.
- Do not simplify curves so much that contact timing, wing-tip overlap, or foot reach is lost.

Critical runtime filtering note:

For these arrival clips, the Next.js runtime currently preserves rotation only on:

- `Body`, `Chest`, `Tail`
- `WingRoot_L/R`, `WingMid_L/R`, `WingTip_L/R`
- `Foot_L/R`

It preserves position only on:

- `Foot_L/R` in `ACT_fly_loop` and `ACT_land_approach`
- `Body` in `ACT_land_settle`

It currently drops:

- scale tracks
- morph tracks
- most position tracks
- `Head` rotation in arrival clips

So prioritize visible improvements on the preserved bones. If you add Head animation for natural target fixation, clearly report that the app must add `Head` to the arrival clip allow-list before that work will show.

## Biomechanics target

A realistic perch landing should have these beats:

1. Bird targets the perch.
2. Flight transitions into braking/flare.
3. Wings open broader and produce drag/lift.
4. Tail lowers/fans or tilts as an airbrake/counterbalance.
5. Feet reach forward/down before contact.
6. Feet contact first.
7. Body compresses after contact.
8. Wings remain open briefly for balance.
9. Body rebounds and settles.
10. Wings fold/tuck with overlap; wing tips settle last.

The toucan should feel broad-winged and slightly heavy/top-biased because of the large beak silhouette. Avoid a smooth airplane glide or tiny hummingbird flutter.

## Action-specific direction

### `ACT_fly_loop`

Goal: rhythmic flight that loops cleanly but does not feel robotic.

- Keep first/last frames seamless.
- Use the real wing appendage chain: `WingRoot_* -> WingMid_* -> WingTip_*`.
- WingRoot leads, WingMid follows, WingTip has the most drag/follow-through.
- Add small left/right asymmetry: 1–3 frame offset or a few degrees difference.
- Add subtle Body bob/roll coupled to the wingbeat.
- Add Chest counter-motion so the torso does not look frozen.
- Add Tail counterbalance/flick opposite body bob.
- Keep feet tucked using `Foot_L/R.position` if needed; this position is preserved in runtime for `ACT_fly_loop`.
- Do not add global forward translation.

Desired feel: a toucan/parrot-like flapping glide with strong readable wing poses.

### `ACT_land_approach`

Goal: transition from flight to braking/pre-contact flare.

Suggested timing by percentage:

- 0–20%: match the fly loop seam; still flying.
- 20–45%: begin flare; wings open broader, body starts pitching up, tail lowers/tilts.
- 45–70%: strongest braking; wing roots high/wide, wing tips lag, chest/body resist forward motion.
- 60–85%: feet extend forward/down toward the perch/contact point.
- 85–100%: pre-contact pose; feet ready, wings still partly open, body prepared to compress.

Specific notes:

- Do not end fully perched/folded. End just before or at initial contact.
- Use `Foot_L/R.position` for foot reach/tuck transitions; runtime preserves these positions in `ACT_land_approach`.
- Add a slight asymmetry: one foot reaches/contact-prepares 1–2 frames ahead; one wing can be slightly higher.
- Add small Body yaw/roll correction as if aligning to the perch.
- Tail should participate in braking, not stay rigid.
- If Head is animated, keep it visually steadier than the body and aimed toward the target — but report that runtime integration must allow Head tracks.

### `ACT_land_settle`

Goal: foot contact, compression, balance recovery, final tuck into perch idle.

Suggested timing by percentage:

- 0–10%: initial foot contact / weight transfer begins.
- 10–30%: body compression/crouch; feet feel planted.
- 25–45%: maximum load; wings still open enough for balance.
- 40–70%: rebound and small balance correction; tail counter-flick.
- 60–90%: wings tuck in overlapping stages.
- 90–100%: quiet perched pose compatible with idle.

Specific notes:

- Runtime preserves `Body.position` in `ACT_land_settle`; use it for local crouch/compression only.
- Do not rely on `Foot_L/R.position` in `ACT_land_settle`; it is currently filtered out. Use foot rotations for planted/grip implication.
- Feet should feel planted before the body finishes dropping.
- Body should compress after contact, then rebound slightly.
- Wings should not fold immediately at contact. Hold them out briefly for balance.
- Wing fold should overlap: WingRoot starts, WingMid follows, WingTip settles last.
- Tail should counterbalance the crouch/rebound and not freeze.
- End in a stable but living perch pose, not a dead stop.

## Stiffness reduction checklist

Please intentionally add:

- clear cruise / flare / contact / crouch / rebound / tucked poses;
- overlap between Body, Chest, Tail, WingRoot, WingMid, WingTip;
- slight left/right wing asymmetry;
- slight left/right foot timing asymmetry;
- foot reach before contact;
- crisp contact;
- body compression after contact;
- small balance corrections in Body roll/yaw;
- tail braking and tail counter-flick;
- wing-tip drag and final follow-through.

Avoid:

- perfect mirrored wings for the whole sequence;
- frozen body/chest while wings flap;
- feet snapping into place at the last frame;
- wings folding immediately on contact;
- one smooth Bezier glide into a stop;
- object/root translation through the scene;
- scale animation;
- morph-only improvements, because morph tracks are currently dropped;
- Head-only improvements unless you report the needed runtime allow-list change.

## Curve/timing guidance

- Use smooth curves during flight and flare, but make contact decisive.
- Do not make every channel share identical timing/tangents.
- Downstrokes/braking strokes can be faster and stronger; recovery/folding can be slower with overlap.
- Foot contact should have a sharper timing change than wing folding.
- Wing tips should lag roots by a few frames.
- Tail should lag/counter the body, then settle with a small diminishing follow-through.

## Acceptance checks before export

In Blender:

1. Scrub `ACT_fly_loop`: first/last frames loop cleanly.
2. Scrub `ACT_land_approach`: starts compatible with fly loop and ends in pre-contact/flare, not fully perched.
3. Scrub `ACT_land_settle`: begins at contact/compression and ends in perched idle-compatible pose.
4. Verify no object/root/armature world travel was added.
5. Verify no destructive rest-pose/bone-orientation changes.
6. Verify key visible motion is on runtime-preserved bones.
7. Check the silhouette from a side/front-three-quarter view similar to the app, not just straight front.

Export/report:

1. Exported GLB path.
2. Bones used.
3. Actions edited and durations.
4. Whether bone names/hierarchy/rest rotations were preserved.
5. Whether any Head animation was added and whether runtime must be updated.
6. Whether any morph tracks were added and whether they are expected to be filtered.
7. Whether global/root travel was avoided.
8. Whether fly loop seam is clean.
9. Whether land approach and land settle seam is clean.
10. Any warnings about tracks that the Next.js runtime may strip.

Acceptance target in-app: the toucan should fly along the existing parent path, flare visibly, extend feet before contact, plant feet, compress through the body, use wings/tail for balance, then tuck into a perched pose without sliding, snapping, or double-translating.
```

---

## Optional Next.js integration follow-up

If the Blender pass adds Head animation to arrival clips, update `nextjs/src/config/toucan.ts` so `Head` is included in the arrival `CLIP_BONES` entries for:

- `ACT_fly_loop`
- `ACT_land_approach`
- `ACT_land_settle`

Only do this if the exported Head tracks are intentional and compatible with the procedural head-yield behavior in `ToucanGLB.tsx`.

If the Blender pass adds position tracks besides `Foot_L/R` in fly/approach or `Body` in settle, either remove them before export or update `CLIP_POSITION_BONES` intentionally. Unlisted position tracks will be stripped by the app.
