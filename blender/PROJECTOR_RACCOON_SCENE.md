# Raccoon Projector Scene — v3 (animated)

## Files
| what | where |
|---|---|
| Runtime asset | `nextjs/public/models/projector_raccoon_scene.glb` — 655 KB |
| Runtime URL | `/models/projector_raccoon_scene.glb` |
| Working file | `blender/projector_raccoon_scene_rigged.blend` |
| Renders | `blender/scene_v3.png`, `blender/scene_v3_3q.png`, `blender/rig_poses.png` |

Scratch renders and the superseded v1 .blend were moved to `blender/_to_delete/`
— delete that folder whenever you like.

## What changed in v3
- The two raccoons holding the screen are **gone**. Three left: the projectionist
  and the two watchers.
- The screen no longer needs holding — it hangs free from the branch on its three
  ropes, and the whole assembly moved **+0.85 back in depth**. Scene depth went
  1.35 → 2.20, so the raccoons now read as clearly in front of it.
- The bottom batten went back to its normal length (it was stretched 1.235× only
  so the holders could grip it clear of the fabric).
- The beam was rebuilt: it now travels back in depth as well as across, from the
  lens at y≈0 to the screen at y≈1.1. That slant is what sells the new spacing.
- **Each raccoon has a looping idle clip.**

## The idle animations
Three clips, one per armature, exported as glTF animations:

| clip | length | motion |
|---|---|---|
| `Idle_Projectionist` | 11.04s | weight shift through the hips, 2-cycle breathing, head turning off to check the screen and back, one paw fiddling with the focus at 3 cycles, tail sway |
| `Idle_Watcher_01` | 9.04s | shallow fast breathing (3 cycles), slow head turn, head tilt at 2 cycles, lazy 2-cycle tail sway |
| `Idle_Watcher_02` | 13.04s | slower 2-cycle breathing, head turn and tilt on different phases, quicker 3-cycle tail |

**The lengths don't divide evenly on purpose.** 11.04 / 9.04 / 13.04 means the
three never fall into step — the group would look mechanical the moment two
raccoons breathed together. Within each clip the same trick is used per bone:
tail segments run on the same cycle count but offset phases, so the tail whips
along its length instead of swinging as a rigid rod.

Every motion is a whole number of cycles per loop, which is what makes the loops
seamless — a fractional cycle would pop at the wrap.

Poses are authored as sine deltas layered on the bind pose, keyed at 24 samples
per loop with bezier interpolation. To retune, open the .blend; the amplitudes
are in degrees and the specs are small dicts of
`{bone: [(world_axis, amplitude, cycles, phase)]}`.

### The bind pose is still the posed pose
Exported with `export_rest_position_armature=False`, so the raccoons look right
the instant the file loads, before a clip plays. If animation is ever disabled
the scene still reads correctly — the clips only layer on top.

## Numbers
- **Bounds** (glTF Y-up): X ±4.07, Y 0 → 4.355, Z ±1.10. Size **8.14 × 4.36 × 2.20**.
- Centered on X/Z, base exactly on **Y = 0**.
- 3,850 triangles / 14 meshes / 3 skins × 20 joints / 78 nodes.
- 3 animation clips, 60 channels each.
- One embedded buffer (568 KB). **No textures, no images, no external .bin,
  no Draco, no extensions, no cameras, no lights.**

## Runtime
`ProjectorRaccoonGLB.tsx`:
- clones with **SkeletonUtils**, not `Object3D.clone` — a plain clone shares the
  skeleton, so two mounts would fight over one set of bones
- drives the clips with drei's `useAnimations`, bound to a wrapper `<group ref>`.
  The mixer binds tracks by node name and SkeletonUtils preserves names, so the
  clips drive *this* clone, not the cached original
- gives each clip a **fixed** start offset (0 / 3.1 / 6.7s) so the first few
  seconds after load aren't a chorus line. Fixed rather than random so a server
  render and a client render agree

No runtime scale or rotation. Everything hangs off `SceneRoot`. `FitCamera` in
`ProjectorRaccoonScene.tsx` picks the camera distance from whichever axis is
tighter, so the branch and projector stay in frame on a phone.

`Screen_Fabric` keeps its planar UV unwrap (U left→right, V bottom→top) for the
architecture diagrams; set `tex.flipY = false`. Aspect 2.511 / 1.545.

`Projection_Beam` is the only transparent object: `alphaMode: BLEND`, alpha 0.18,
`depthWrite=false` so it doesn't occlude the raccoons lying inside it.

## Notes carried forward from v2
`racoon.glb` ships as 8 material-split parts with duplicated vertices along every
seam. Auto-weighting that mesh tore it apart. Welding at 0.004 first collapsed
**1214 verts → 284** and fixed it — that weld is also why three skinned copies
stay cheap. Its 8 Sketchfab materials were merged to 4: `Racoon_Fur`,
`Racoon_Dark`, `Racoon_Cream`, `Racoon_TailRing`.

`projector.glb` had its brown plinth deleted, was rotated 180° (it fired down -X)
and scaled ×4.35 onto the stump. `projector_screen.glb` was rotated to face -Y
and scaled non-uniformly (×2.6 across, ×1.6 tall) because it was authored
**portrait** and every architecture diagram is landscape.

## Attribution
> **Low poly raccoon** by **clydehelder** — **CC-BY-4.0**
> https://sketchfab.com/3d-models/low-poly-raccoon-ad1dba65d5f847c79b653305cc0b7634

Still needs a home somewhere user-visible — CC-BY requires attribution wherever
the asset is distributed, and it's merged into the exported GLB.
