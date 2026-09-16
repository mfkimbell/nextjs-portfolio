# Bear sit — findings and fix

## What's actually wrong

The `sit` clip isn't badly *tuned*. It never poses the legs or the head at all.

I parsed `bear.glb` (Wild Poly `Animal_2004_Rig`, 30 joints, 11 clips) and compared
every bone's rotation across every clip. Result:

| Bone | idle | stand | walk | run | **sit** | sit_quadruped | sleep |
|---|---|---|---|---|---|---|---|
| `thigh_L` | 86.7, 7.5, 7.6 | *same* | *same* | *same* | **same** | *same* | *same* |
| `leg_L` | 38.5, −16.8, 10.8 | *same* | *same* | *same* | **same** | *same* | *same* |
| `foot_L` | −80.8, 4.6, −8.3 | *same* | *same* | *same* | **same** | *same* | *same* |
| `head` | 0,0,0 | 0,0,0 | 0,0,0 | 0,0,0 | **0,0,0** | 0,0,0 | 0,0,0 |
| `pelvis` / `spine` / `chest` | identical in all 11 clips | | | | | | |

Every leg bone, the pelvis, the spine, the chest and **the head** carry a 2-key
constant track with byte-identical values in all eleven animations. The only things
that change between clips are `center` (translation + rotation), the two `hand`
rotations, the ears, the mouth, and a few bone *translations*.

So `sit` is produced by taking the standing quadruped and rotating the **single
`center` bone** backward by 64.2° while dropping it 0.82 units. The whole bear tips
over as one rigid object.

Consequences, measured by forward-kinematics on the actual rig:

| Metric | idle | **current `sit`** | natural target |
|---|---|---|---|
| Face pitch vs horizon | −28.4° | **+35.7°** | −12 to −16° |
| Hip fold (torso↔thigh) | 81.3° | **82.0°** | 55–70° |
| Knee flexion | 137.3° | **137.3°** | 70–100° |
| Ankle plantarflexion | 9.8° | **9.8°** | 15–25° |
| Left↔right difference, any joint | 0.0° | **0.0°** | 5–15° |

**+35.7° is the headline number.** Because `head` is a rigid child of `center` and its
rotation is identity in every clip, the face rotates with the torso. The bear ends up
staring 36° up at the sky. That is the thing you were seeing.

The other three: the legs are still in the standing crouch (137° knee) so nothing
folds and nothing dangles; the ankles never plantarflex so the paws read as standing
on an invisible floor; and left/right are perfect mirrors, which animators call
"twinning" and treat as an automatic reject.

There's also a placement bug: the clip is authored for **ground** sitting, so the rump
lands at y≈0.4 above the model origin. You place the bears at `y = 0.55` on the log,
which floats the rump about a third of a bear-height above the bench.

## Why it can't be fixed by editing the clip

The rig hierarchy is flat. `chest`, `head`, `pelvis`, `spine`, both shoulders and
**both thighs** are all direct siblings under `center`:

```
root
└ center
  ├ chest      ├ head → ear/eye/mouth   ├ pelvis → tail
  ├ shoulder_L → upperarm_L → arm_L → hand_L
  ├ shoulder_R → upperarm_R → arm_R → hand_R
  ├ spine
  ├ thigh_L → leg_L → foot_L → toe_L
  └ thigh_R → leg_R → foot_R → toe_R
```

There is no spine chain — head is not under chest, chest is not under spine, thighs
are not under pelvis. So `center` is the only bone that can move the body, and moving
it drags the legs and head along. That's why the AI pass produced a rigid tip-over:
it's the only motion the clip's authored tracks can express.

The good news is the flip side of the same fact. Because `thigh_L` and `head` hang
directly off `center`, you *can* rotate each independently without any cascade. A
correct sit is authorable on this rig — it just requires keying bones the existing
clips never touch.

## What I built

A new clip, **`sit_log`**, appended to `bear.glb`. All 11 original clips are untouched.

I solved the bone rotations numerically against targets from the biomechanics
research rather than eyeballing them (`scipy.optimize.least_squares` over 16 joint
parameters, objective = the target table below).

### Solved local rotations (degrees, bone-local X = flex, Y = twist, Z = side)

| Bone | X | Y | Z | why |
|---|---|---|---|---|
| `center` | −10.4 | — | — | torso to 17° recline, not 27° |
| `head` | **+60.4** | −5.0 | +3.0 | the counter-rotation that levels the face |
| `thigh_L` | +3.9 | +7.3 | 0.1 | hip fold + slight abduction |
| `thigh_R` | +10.8 | +6.5 | 0.3 | deliberately ≠ left |
| `leg_L` | **+50.8** | — | — | unfolds the knee 137° → 89° |
| `leg_R` | **+39.3** | — | — | 99°, 10° off the left |
| `foot_L` | +11.0 | — | +11.0 | plantarflex 21°, slight inversion |
| `foot_R` | +5.5 | — | −5.5 | plantarflex 16° |

Arms (solved as IK to a grip point): right paw holds a prop at lower-sternum height,
elbow 93°; left paw rests in the lap, elbow 71°. 22° elbow difference — the research
calls two-handed symmetric holds the single clearest stiffness tell.

### Verified result, sampled across the loop

```
FACE pitch     −12.6 … −15.7   (target −12 to −16)   ✓
TORSO recline   16.1 … 17.4    (target 12–20)        ✓
knee flexion    L 88.9  R 99.7 (target 70–100)       ✓
ankle plantar   L 20.6  R 16.0 (target 15–25)        ✓
L/R asymmetry   knee 9–11°, ankle 4.6°               ✓
```

### The idle motion layered on top

6.0 s, 30 fps, loops exactly. Deliberately no two curves are flat on the same frame —
that's the "moving hold" principle, and it's what stops a held pose reading as a
paused frame.

- **Breathing** at 12 breaths/min (5.0 s cycle), 40:60 inhale:exhale, ~0.9° on `center`
  and 0.7° + 1 cm on `chest`. Head lags the chest by 4 frames.
- **Leg swing** on the left leg only: 1.5 s period. The human leg's measured natural
  pendulum frequency is 0.64 Hz — anything faster reads as effortful rather than idle.
  4.2° at the hip, shin lagging 3 frames, foot lagging 5.
- **Right leg** at 1.3°, different period, out of phase.
- **Head** drifts on three mutually prime periods (7 s / 11 s / 9 s) so it never
  visibly repeats.
- **Ear flicks**: left at 2.35 s, right at 4.85 s, 0.2 s each, one ear at a time.
- **Tail**, forearms: sub-degree drift so nothing in the silhouette is ever dead.

### Seat alignment

Root is offset so the rump bottom sits at **y = −0.03** — three centimetres *into* the
log top. Contact compression is what communicates weight; a pose resting exactly on
the plane reads as hovering.

So the bears should now be placed at **exactly the log's top y**, not 0.55 by guess.

### Prop socket

The rig has a `Food` bone — a prop socket the pack ships for its eat animations. In
`sit_log` I key it every frame to the right paw's grip point, so anything parented to
`Food` lands in the paw and follows the breathing and drift automatically.

---

## Code changes — `src/components/scene-lab/CampfireScene.tsx`

### 1. Each bear needs its own skeleton (this is a real bug today)

`<Clone object={gltf.scene} deep="materialsOnly" />` shares the skeleton across all
three bear instances. Three `useAnimations` mixers then fight over one set of bones.
Skinned meshes must be cloned with `SkeletonUtils`:

```tsx
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";

// inside Animal(), replacing <Clone .../>
const model = useMemo(() => skeletonClone(gltf.scene), [gltf.scene]);
// ...
<primitive object={model} />
```

### 2. Desync the three bears

Three identical bears playing one clip in lockstep is the loudest "this is generated"
signal in the scene — louder than any single pose problem.

```tsx
interface AnimalPlacement {
  // ...existing fields
  animation?: string;
  animationOffset?: number;   // seconds into the clip
  animationSpeed?: number;    // playback rate
  prop?: { url: string; scale: number; rotation?: [number, number, number] };
}
```

```tsx
const LOG_TOP_Y = 0.55; // measure this off wood_log.glb rather than guessing

const ANIMALS: AnimalPlacement[] = [
  // ...
  { url: BEAR_URL, position: [0.4, LOG_TOP_Y, 2.4], rotationY: Math.PI,
    scale: 0.5, label: "bear on front log",
    animation: "sit_log", animationOffset: 0.0, animationSpeed: 1.00,
    prop: { url: "/models/mug.glb", scale: 0.9 } },

  { url: BEAR_URL, position: [-2.078, LOG_TOP_Y, -1.2], rotationY: Math.PI / 3,
    scale: 0.5, label: "bear on back-left log",
    animation: "sit_log", animationOffset: 2.1, animationSpeed: 0.94 },

  { url: BEAR_URL, position: [2.078, LOG_TOP_Y, -1.2], rotationY: -Math.PI / 3,
    scale: 0.5, label: "bear on back-right log",
    animation: "sit_log", animationOffset: 4.3, animationSpeed: 1.07 },
];
```

```tsx
// in the existing animation useEffect, after action.reset().fadeIn(0.3).play():
action.time = placement.animationOffset ?? 0;
action.timeScale = placement.animationSpeed ?? 1;
```

Non-integer speed ratios (1.00 / 0.94 / 1.07) mean the three never re-sync — with
equal speeds a phase offset alone still leaves them locked in step forever.

### 3. Prop in the paw

```tsx
function useSocketProp(
  root: React.RefObject<THREE.Group>,
  prop: AnimalPlacement["prop"],
  ready: unknown
) {
  const gltf = useGLTF(prop?.url ?? "/models/mug.glb");
  useEffect(() => {
    if (!prop || !root.current) return;
    let socket: THREE.Object3D | null = null;
    root.current.traverse((o) => { if (o.name === "Food") socket = o; });
    if (!socket) return;
    const obj = gltf.scene.clone(true);
    obj.scale.setScalar(prop.scale);
    // the Food bone carries the rig's 90° X; undo it so the prop stands upright
    obj.rotation.set(-Math.PI / 2, 0, 0);
    if (prop.rotation) obj.rotation.set(...prop.rotation);
    socket.add(obj);
    return () => { socket?.remove(obj); };
  }, [prop, gltf.scene, root, ready]);
}
```

Call it inside `Animal` with `useSocketProp(groupRef, placement.prop, gltf.scene)`.

Give the two back bears different props (or none) — three bears holding the same mug
undoes the desync work.

---

## What I did not do

- **Did not touch the raccoon.** `raccoon.glb` is `Animal_2007` from the same pack and
  almost certainly has the identical flat rig and the identical dead-leg clips. Worth
  checking before it ships next to the fixed bears.
- **Did not re-parent the rig.** Building a real spine chain (`spine → chest → head`,
  `pelvis → thigh_L/R`) in Blender would let you author lumbar curve, shoulder
  counter-rotation and a proper C-curve line of action — none of which this flat rig
  can express. It's the right long-term move if the bears carry the site. It's also a
  bind-pose-sensitive operation and not something to do blind.
- **Did not verify in-browser.** Everything here is verified by forward kinematics and
  software skinning on the real mesh, but it hasn't been through three.js yet.
