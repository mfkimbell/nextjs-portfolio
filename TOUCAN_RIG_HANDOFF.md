# Toucan Animation — Handoff Prompt

Paste everything below into the Blender MCP session.

---

## TASK

Use the asset/rig reality report below as the current state of the model. Please verify it
inside Blender, then do **NOT** try to create the full research-brief animation set unless
the rig actually supports it.

**Primary goal:**

1. Confirm the toucan rig has only `Body`, `Head`, `LowerBeak`, `UpperBeak` and no shape keys.

2. If confirmed, create only animations / procedural setup that the rig can actually support:
   - audio/beak-driven talk using `LowerBeak` and `UpperBeak`
   - idle head saccades
   - listener / look-at head poses
   - small body + head reaction clips

3. Skip or clearly mark as impossible without re-rigging:
   - blinks
   - toe grips
   - wing settles
   - feather ruffles
   - real preening
   - chest/throat pulses
   - eye tracking

4. Report back with:
   - exact bones found
   - shape keys found
   - existing animations found
   - which requested clips were created
   - which were skipped and why
   - any exported GLB path/name

## RESPONSE FORMAT

Please do not brainstorm. Verify the rig inside Blender and respond only with:

1. Confirmed bones / controls
2. Confirmed shape keys
3. Existing actions / NLA / constraints
4. Actions you created or modified
5. Actions you skipped and why
6. Exported file path, if any
7. Any warnings about rest rotations or runtime integration

## HARD CONSTRAINT

**Do not overwrite rest rotations.** The beak and head bones have meaningful rest
quaternions. Compose all animation *relative to the rest pose*, especially around the beak
bones' local Z axis.

Concretely, the working composition for a world-space swing on top of rest is:

```
local = parent⁻¹ · swing · parent · rest
```

Assigning `pose_bone.rotation_euler` directly wipes the rest quaternion and rotates about
the wrong axis — this was already diagnosed and fixed once in this project. A previous
export bug also put every "closed" beak keyframe exactly 1 radian (57.3°) off rest,
caused by keyframing only `rotation_euler[2]` (partial F-curves) with
`export_force_sampling=False`. Key full quaternions, or force sampling on export.

---

# CURRENT RIG REALITY REPORT (already measured in Blender)

## Verdict against the research brief

The brief assumes a full bird rig — neck, eyes, eyelids, wings, tail, legs, toes, tongue,
shape keys. **This rig has four bones and no shape keys.** Roughly 60% of the specified
clips cannot be authored without re-rigging.

## Armature — `ToucanArmature`, 4 bones

| Bone | Parent | Head (local) | Length | Local Z axis |
|---|---|---|---|---|
| `Body` | — | (0, 0.140, 0.140) | 0.205 | (1, 0, 0) |
| `Head` | Body | (0, −0.030, 0.255) | 0.111 | (1, 0, 0) |
| `LowerBeak` | Head | (0, −0.135, 0.292) | 0.111 | (1, 0, 0) |
| `UpperBeak` | Head | (0, −0.135, 0.352) | 0.111 | (1, 0, 0) |

**Critical axis fact:** every bone's **local Z = world X**, so every hinge (beak open, head
pitch) is a rotation about the bone's own local Z. Do not assume X. Bone local X/Y are
tilted along each bone's length and are not useful axes.

Beak hinge axis expressed in the `Head`-local frame = `(0, 0, 1)`.

## Mesh — single object, no shape keys

- Object `Toucan`: 5,323 verts / 1,835 tris, one material (`initialShadingGroup.001`),
  one UV map, one texture (`TocoToucan_Albedo`, 2048²)
- **`shape_keys: null`** — no blink, no `beak_open`, no puff, nothing. All shape-key routes
  in the brief (§5, §17, half of §14) are unavailable.
- Local bounds: x `[-0.091, 0.091]`, y `[-0.344, 0.290]`, z `[-0.009, 0.372]`.
  Model height 0.381 m, scene unit scale 1.0.
- Eyes, tongue, feathers and feet are all part of the single mesh with no bones of their own.
- One ARMATURE modifier, 4 vertex groups matching the 4 bones.

**Vertex group influence** (verts influenced / dominated):
`Body` 3088/3017 · `UpperBeak` 992/992 · `Head` 741/657 · `LowerBeak` 657/657

Note `Body` dominates 57% of the mesh — chest, wings, tail, legs and feet are all rigidly
welded to one bone. There is no chest/throat separable from tail or feet, so a "chest pulse"
would move the whole body including the planted feet.

## Missing vs the brief

Absent entirely: **neck, eyes, eyelids/nictitating, tongue, wings/shoulders, tail,
legs/feet/toes, chest/throat, root separate from body.**

Consequences:

- no blinks (Layer 4 — blinking appears in nearly every clip spec in the brief)
- no toe grips (Layer 5, `ACT_idle_foot_shift`)
- no wing settles or feather ruffle (Layer 6, `ACT_idle_feather_ruffle`)
- no tail counterbalance
- no eye-leads-head layering (§7 — the "eyes lead, head follows, neck lags" chain
  collapses to head-only)
- no throat pulse
- no real preening (approximation only: head rotates toward body, no wing lift, no puff)

## Measured limits

**Beak gape** (tip-to-tip distance; model is 0.381 tall):

| upper° / lower° | tip distance | vertical sep | note |
|---|---|---|---|
| 0 / 0 | 0.039 | 0.033 | closed |
| −4 / 7 | 0.081 | 0.070 | |
| −8 / 12 | 0.116 | 0.100 | current shipped max |
| −12 / 18 | 0.155 | 0.133 | |
| −16 / 25 | 0.183 | 0.152 | good "emphasis" |
| −20 / 32 | 0.203 | 0.159 | |
| −26 / 40 | 0.237 | 0.181 | very wide, still clean |
| −32 / 50 | 0.253 | 0.175 | diminishing, avoid |

No interpenetration anywhere in that range. The brief's §4 suggestion of 25–40° for
emphasis is achievable. Upper beak takes the negative sign, lower the positive.

**Head rotation:** tested to yaw ±70° with pitch +35°, no mesh breakage — the rig tolerates
far more than the ±26° the runtime currently uses. **Pitch sign: positive = looks DOWN.**

## Existing animation (both files)

Single action named `Animation`, frames 1–49, **CUBICSPLINE**, 12 keys, quaternion channels
on `UpperBeak` and `LowerBeak` only. Nothing on `Head` or `Body`. No constraints, no
drivers, no custom properties, no NLA tracks.

- `toucan.glb` — 2.042 s loop; upper `[0,7,0,6,0,8,0,5,0,7,0,0]`, lower `[0,11,0,10,0,12,0,9,0,10,0,0]`
- `toucan2.glb` — 1.792 s loop; upper `[0,5,0,8,0,4,0,7,0,5,0,0]`, lower `[0,8,0,13,0,7,0,11,0,9,0,0]`

Different loop lengths mean the two birds drift out of phase permanently (intentional).
Both fully close (0.00° from rest) between every beat.

Both files: 798 KB, structurally identical, 1 texture, skin joints `[Body, Head, LowerBeak, UpperBeak]`.

## Two things worth flagging

**The beak currently loops unconditionally** — the birds chatter whether or not anyone is
speaking. `useToucanVoiceAgent` already exposes `status` and `isAgentSpeaking`, so gating
this is probably a bigger realism win than any idle work.

**Amplitude-driven beak (brief §14) is fully viable** and needs no rig changes — same two
bones, driven by RMS instead of a baked loop. That plus a look-at layer on `Head` delivers
goals 1 and 2 without touching the model.

## Minimum re-rig, if the rest is wanted

Eyelid bones (or blink shape keys), one tail bone, two wing bones, and toe bones. That
unlocks most of the remaining clip list.

---

# RUNTIME CONTEXT (Next.js side, for reference)

- `nextjs/src/config/toucan.ts` — all tunables, in **degrees**. `toucanConfig` (bird 1 +
  scene-level `CAMERA_Z` / `BRANCH`) and `toucan2Config` (bird 2).
- `nextjs/src/components/ToucanGLB.tsx` — renders one bird; strips `Head`/`Body` tracks from
  the clip so tracking stays free, clones the skeleton via `SkeletonUtils.clone`, reads rest
  from the *pristine cached* `gltf.scene` (reading it from the clone compounds on hot reload).
- `nextjs/src/components/ToucanScene.tsx` — canvas, branch, both birds.
- `IDLE` saccade state machine is implemented. **`BREAKS` config exists but the state
  machine is not yet written** (rouse / wipe / preen / yawn).
- Models live in `nextjs/public/models/`.
