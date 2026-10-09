import savedCampfire from "@/config/campfireScene.json";
import savedCameraDefaults from "@/config/cameraDefaults.json";

export interface CampfireSceneConfig extends BugSwarmTweaks {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fov: number;
  fogNear: number;
  fogFar: number;
  /** Floor on the fog's far plane, as a multiple of the camera's distance from
   *  the nearest camp. Stops a pulled-back shot (the title card) from sitting
   *  entirely past the fog, which resolves every pixel to flat sky colour.
   *  0 disables it and fogFar is used flat. */
  fogPullbackMul: number;
  /** How fast the far plane eases toward its target, per second. */
  fogPullbackEase: number;
  ambientIntensity: number;
  moonIntensity: number;
  fireIntensity: number;
  /** Kenney campfire laptop screen glow. Screen material's emissive is tinted
   *  by (R,G,B) and scaled by `laptopScreenBrightness`; the pointLight spilling
   *  out of the deck uses the same color at a proportional intensity. */
  laptopScreenColorR: number;
  laptopScreenColorG: number;
  laptopScreenColorB: number;
  laptopScreenBrightness: number;
  /** Multiplier on the night-sky background color. 1.0 = the baked #03040a
   *  near-black; crank to lift the whole horizon toward a pre-dawn navy. Also
   *  drives the fog color so silhouettes keep blending. */
  skyBrightness: number;
  /** drei <Stars> `factor` — per-star size, which reads as brightness. Bigger
   *  = brighter dots against the sky. */
  starBrightness: number;
  /** drei <Stars> `count` — how many stars are sprinkled overhead. */
  starCount: number;

  /* --- shadows -----------------------------------------------------------
   * One WebGL shadow map per casting light. Costs stack per light: point
   * lights render six cubemap faces each frame, directional lights only one.
   * The master enable flips `gl.shadowMap.enabled` at runtime so the user
   * can turn the whole feature off on slow hardware. Everything else here
   * lives on the moon directional or the fire point light and is applied
   * imperatively through refs so sliders retune shadows live. */
  /** Master enable. 0 = shadowMap.enabled=false (no shadow renders at all). */
  shadowsEnabled: number;
  /** Direction of the moon light. This is the sun/moon that casts long soft
   *  shadows across the whole campsite; place it so it flatters the diorama. */
  moonX: number;
  moonY: number;
  moonZ: number;
  /** Whether the moon directional light casts shadows. Cheap - one depth
   *  pass per frame - so leave on unless perf is bad. */
  /** Shadow map resolution as a raw pixel count on one edge (square). Higher
   *  = sharper but quadratic memory + cost. Common values: 512/1024/2048/4096. */
  /** Constant depth offset to eat shadow acne. Typically small negative,
   *  e.g. -0.0005. Too negative causes peter-panning (shadows detach). */
  /** Bias along the surface normal - a nicer fix than shadowBias because it
   *  doesn't cause peter-panning as easily. Typical 0.02-0.05. */
  /** PCF blur radius in texels. 0 = crisp, ~4 = classic soft shadow. Only
   *  affects PCFSoftShadowMap (the r3f `shadows` default). */
  /** How dark the moon's shadow gets. three.js LightShadow.intensity, 0..1:
   *  1 = fully black, 0 = shadow invisible. Global to this light. */
  /** Half-width of the orthographic shadow camera frustum in world units.
   *  Frustum spans [-frustum..+frustum] on both axes. Tight = better shadow
   *  resolution over the scene; too tight = shadows clip. Campsite is ~30u,
   *  so 20 is a good starting point. */
  /** Ortho camera near plane. Small so nearby geometry casts. */
  /** Ortho camera far plane. Must exceed distance from light to the farthest
   *  shadow-casting mesh, but stay tight for depth precision. */
  /** Whether the fire's main point light also casts shadows. EXPENSIVE - six
   *  cubemap renders per frame - so off by default. Turn on for a hero look
   *  where bears throw long shadows across the ring. */
  fireCastShadow: number;
  /** Shadow map resolution for the fire point light. Keep modest (512-1024)
   *  because it's already six times the cost of the directional. */
  fireShadowMapSize: number;
  /** Map size for the campfire's warm SPOT shadow. One depth pass, so a texel
   *  here costs a sixth of a texel on the point light's cube. */
  warmShadowMapSize: number;
  /** Ceiling on devicePixelRatio. Colour-pass cost scales with the SQUARE of
   *  this, so it is the bluntest and most effective frame-rate knob there is. */
  maxPixelRatio: number;
  /** The same ceiling for coarse-pointer (touch) devices, which report the
   *  highest ratios and have the least GPU to spend on them. */
  maxPixelRatioMobile: number;
  /** 1 = request an antialiased drawing buffer. This is a WebGL CONTEXT
   *  attribute, so flipping it remounts the canvas rather than taking effect
   *  in place - see the key on <Canvas>. */
  antialias: number;
  /** The same switch for coarse-pointer (touch) devices, where MSAA is at its
   *  most expensive and, on flat-shaded art in the dark, least visible. */
  antialiasMobile: number;
  fireShadowBias: number;
  fireShadowNormalBias: number;
  /** How dark the fire's cast shadow gets. Same LightShadow.intensity knob,
   *  0..1, so a hot campfire can still cast a softer shadow than a full moon. */
  fireShadowIntensity: number;
  /** Ground disc color, RGB channels 0..1. Default is the original dark
   *  purple (#2a1c31); crank G for a mossier campsite. */
  groundColorR: number;
  groundColorG: number;
  groundColorB: number;
  /** ---------------------------------------------------------------------
   *  1 - Trodden ground patches at the campfire.
   *
   *  Two flat irregular POLYGONS stacked on the ground disc, not a texture.
   *  That is how the desk diorama gets its look: in camping.glb the camp's
   *  dirt is "Object_222", its own 300-triangle mesh in Material.045
   *  (0.227/0.133/0.063) laid over the tan Material.108 terrain
   *  (0.316/0.197/0.076) - raycasting near that camp hits the patch first and
   *  the terrain 3.5 units below. Its outline is 844 straight segments,
   *  median 0.95 units long, across a patch ~27 units wide: hard, angular,
   *  never a fade. Two earlier attempts here painted a canvas gradient and it
   *  read as nothing.
   *
   *  Jag pulls each boundary vertex in by a fraction of the radius. Round
   *  chooses HOW that fraction varies: at 0 it is an independent draw per
   *  vertex, so neighbours are uncorrelated and the edge reads as torn; at 1
   *  it comes from three low harmonics around the circle, which drift across
   *  many vertices and give broad lobes - a rounded outline still built from
   *  straight segments. The harmonics are exactly periodic in the angle, so
   *  the ring always closes cleanly, and they are drawn before the per-vertex
   *  values so Round reshapes an outline instead of reshuffling it. That
   *  holds for every Seed, which is the point: the outer ring stays the
   *  rounded one whatever seed you land on.
   *
   *  Sides is the vertex count - fewer is chunkier. Each patch has its own
   *  PRNG seeded from Seed plus its layer, so changing one patch's Sides
   *  cannot disturb the other's shape.
   *
   *  Radii are WORLD units and must stay SMALL. The ground reads only where
   *  the fire lights it and that light reaches about 8.9 units; the earlier
   *  version authored its edge at 6.6-13.1 and drew most of it in the dark.
   *
   *  The patches centre on the CAMPFIRE camp - location 0 on the ring, world
   *  (0.18, -15.20) - not on the ground disc, which is centred on the ring's
   *  hub 15 units away. The shared Offset X/Z moves BOTH patches from there;
   *  each patch then has its own Offset X/Z on top, so the inner one can sit
   *  off-centre inside the outer instead of the two being concentric.
   *
   *  Opacity under 1 drops the patch into the transparent pass and turns its
   *  depthWrite off with it - otherwise a see-through decal still occludes
   *  what should show through. The two patches carry explicit renderOrder
   *  because they sit millimetres apart and distance sorting between them is
   *  not stable as the camera swings.
   *
   *  Colours are absolute, not tints: these are their own meshes with their
   *  own materials, so groundColorR/G/B still owns the disc underneath and
   *  nothing has two homes.
   *  ------------------------------------------------------------------- */
  groundPatchOn: number;
  groundPatchSeed: number;
  groundPatchOffsetX: number;
  groundPatchOffsetZ: number;
  /** A second copy of the same two-layer dirt clearing, centred on the cabin
   *  (location 2) instead of the campfire. Shares every shape/colour/seed
   *  knob above - Outer/Inner Sides, Radius, Jag, Spin, Round, colour, Y,
   *  Opacity - so both clearings read as the same kind of worn ground; only
   *  where this one sits is its own. Its own on/off, independent of
   *  groundPatchOn above, so either clearing can be hidden without the
   *  other. */
  cabinGroundPatchOn: number;
  cabinGroundPatchOffsetX: number;
  cabinGroundPatchOffsetZ: number;
  groundPatchOuterRadius: number;
  groundPatchOuterOffsetX: number;
  groundPatchOuterOffsetZ: number;
  groundPatchOuterJag: number;
  groundPatchOuterSides: number;
  groundPatchOuterSpin: number;
  groundPatchOuterRound: number;
  groundPatchOuterR: number;
  groundPatchOuterG: number;
  groundPatchOuterB: number;
  groundPatchOuterY: number;
  groundPatchOuterOpacity: number;
  groundPatchInnerRadius: number;
  groundPatchInnerOffsetX: number;
  groundPatchInnerOffsetZ: number;
  groundPatchInnerJag: number;
  groundPatchInnerSides: number;
  groundPatchInnerSpin: number;
  groundPatchInnerRound: number;
  groundPatchInnerR: number;
  groundPatchInnerG: number;
  groundPatchInnerB: number;
  groundPatchInnerY: number;
  groundPatchInnerOpacity: number;
  /** Desk-scene light sources (attached to the two lanterns and the computer
   *  inside ContactSector). Each source has intensity, distance falloff, and
   *  an RGB color 0..1 so the lab can tune warm-vs-cool without hex strings. */
  deskLanternIntensity: number;
  deskLanternDistance: number;
  deskLanternColorR: number;
  deskLanternColorG: number;
  deskLanternColorB: number;
  /** Local offset of the lantern's point-light from the Selectable's origin.
   *  Line this up with the flame so the light appears to come from the wick. */
  deskLanternLightX: number;
  deskLanternLightY: number;
  deskLanternLightZ: number;
  deskComputerIntensity: number;
  deskComputerDistance: number;
  deskComputerColorR: number;
  deskComputerColorG: number;
  deskComputerColorB: number;
  /** Local-frame offset of the computer's screen-glow pointLight from the
   *  computer Selectable's origin. Lets the light be dialed onto the actual
   *  monitor face instead of hovering inside the case. */
  /* --- the computer's SCREEN, as opposed to the light it throws ----------
   * deskComputer* above is the spill onto the room. These are the panel
   * itself: the GLB ships one shared "base" material for the whole machine,
   * so the screen face gets a clone of its own and this is what drives it.
   * Without them the monitor was a dark rectangle in a room lit by a monitor. */
  deskComputerScreenOn: number;
  deskComputerScreenBrightness: number;
  deskComputerScreenR: number;
  deskComputerScreenG: number;
  deskComputerScreenB: number;
  deskComputerLightX: number;
  deskComputerLightY: number;
  deskComputerLightZ: number;
  /** Cabin computer's light on the room: on (1) / off (0). */
  deskComputerLightOn: number;
  /** Width of the screen's light cone, degrees. */
  deskComputerAngle: number;
  /** How soft the cone's edge is, 0 (hard) .. 1 (soft). */
  deskComputerPenumbra: number;
  /** Tip the light's aim up (+) / down (-), units along the screen's facing. */
  /** @deprecated Superseded by deskComputerAimYawDeg/PitchDeg. Kept so older
   *  saved configs still parse; no longer read by the scene. */
  deskComputerAimY: number;
  /** Screen light aim: yaw in degrees. 0 points straight out of the monitor
   *  face (local +Z), positive swings it toward local +X. */
  deskComputerAimYawDeg: number;
  /** Screen light aim: pitch in degrees. 0 is level, negative aims downward. */
  deskComputerAimPitchDeg: number;
  /** Screen light casts shadows (1) / doesn't (0). */
  deskComputerShadow: number;
  /** Brightness of the desktop picture on the glass itself (1 = as drawn). */
  deskComputerGlassBrightness: number;
  /** Warm ambient fill just for the desk scene - a HemisphereLight parented
   *  inside ContactSector, so it only lights the desk without touching the
   *  campfire or arcade. Tunable so the whole desk can read cozier or dim. */
  deskCampGroundMaxY: number;
  /** The river in camping.glb ("Object_119", material "Material.057").
   *
   *  deskWaterHeight is an OFFSET in camp-local units, not an absolute level,
   *  so 0 leaves the water exactly where the model authored it (the slab runs
   *  y -1.63 to 0.56). Positive floods the banks, negative drains the river.
   *  It moves the whole slab, so the surface and the bed rise together.
   *
   *  deskWaterOpacity is 1 = solid. Anything below 1 puts the slab in the
   *  transparent pass and drops depthWrite with it, so the riverbed shows
   *  through and the campfire's glow/sparks are not occluded by water you can
   *  otherwise see through. */
  deskWaterHeight: number;
  deskWaterOpacity: number;
  /** One long skinny RectAreaLight over the camp's string-light run.
   *
   *  Defaults fitted to the 26 bulbs: centroid (1.520, 3.366, -1.171) in camp
   *  space, topping out at y 4.05, principal axis at 44.9 deg -> RotY 0.783.
   *
   *  X/Y/Z and the Rot* are CAMP units - it hangs in the diorama's frame and
   *  follows it. Width/Height are WORLD units: three rebuilds a rect light's
   *  extent through extractRotation, which normalises away the parent scale
   *  (WebGLLights.js:524), so the camp's 0.207 never reaches them. The run is
   *  6.81 camp units long, which is 1.41 world units - hence Width 1.6.
   *
   *  RotX -PI/2 aims it at the ground: a rect light emits along local -Z, so
   *  standing +Z up points the emitting face down. Show draws a proxy bar at
   *  the light's exact size for positioning; turn it off when placed. */
  deskStringLightOn: number;
  deskStringLightShow: number;
  deskStringLightIntensity: number;
  deskStringLightWidth: number;
  deskStringLightHeight: number;
  deskStringLightX: number;
  deskStringLightY: number;
  deskStringLightZ: number;
  deskStringLightRotX: number;
  deskStringLightRotY: number;
  deskStringLightRotZ: number;
  deskStringLightColorR: number;
  deskStringLightColorG: number;
  deskStringLightColorB: number;
  /** How the 26 string BULBS look at the source - their own emissive - as
   *  opposed to deskStringLight*, which is the RectAreaLight above them and
   *  controls what they cast onto the scene.
   *
   *  Brightness is a MULTIPLIER, not an absolute: the file authors a different
   *  emissive strength per bulb (2.06 to 4.25 across its nine bulb materials)
   *  and multiplying keeps that variation instead of flattening the run.
   *
   *  Warmth blends from near-white toward the amber the file authors -
   *  0 white, 1 exactly as authored, 2 pushed further into the amber. */
  deskStringBulbBrightness: number;
  deskStringBulbWarmth: number;
  deskStringBulbOpacity: number;
  /** Bloom on the string bulbs: a soft halo sprite drawn at each one.
   *
   *  NOT post-processing. A real bloom pass would re-render the whole scene
   *  into extra targets and blur it several times over, which costs the same
   *  whether one bulb or the whole camp is glowing - and it would bloom every
   *  bright thing in the frame, not the lights you asked for. This is 26
   *  additive sprites in a single points draw: one call, no depth writes, no
   *  per-frame work on the CPU at all.
   *
   *  0 is off. Up to 1 it fades the halo in; past 1 it overdrives the colour
   *  instead, because a blend factor is clamped at 1 and opacity alone stops
   *  getting brighter. */
  deskStringBulbBloom: number;
  /** How wide each halo is, in world units. This is the knob that reads as
   *  "more bloom" - the sprite is a soft radial falloff, so size carries the
   *  glow much further than strength does.
   *
   *  Offset Y nudges every halo up (+) or down (-) from the bulb it sits on,
   *  in world units - for when the sprite reads as floating above or below
   *  the glass rather than wrapped around it. */
  deskStringBulbBloomSize: number;
  deskStringBulbBloomOffsetY: number;
  /** ---------------------------------------------------------------------
   *  3 - Fish. THREE independent shoals, ids from DESK_FISH_GROUPS.
   *
   *  Camp units. Placement was chosen against a water mask built by
   *  raycasting the scene: a point is swimmable when the river slab is
   *  present AND no terrain sits above the fish's depth - so under the dock
   *  counts as water, the bank does not. Each shoal was then simulated over
   *  four laps and every sample checked.
   *
   *  A - mills under the dock. (11.1, 7.3) r 1.0/1.3, scatter 0.35:
   *      0/1680 samples on land, 27% of them under the deck.
   *  B - one long lap PAST the dock lantern and back out. A plain circle
   *      could not fit: the shore runs diagonally, and round loops of r
   *      2.4-3.0 put 13-62 samples on land. An ellipse turned to 2.64 rad -
   *      along the shoreline - fits: (10.6, 8.0) r 3.2/1.8 scores 0/840 and
   *      passes within 0.26 units of the lantern.
   *  C - spare, off.
   *
   *  Rotate turns a whole shoal; Twist rotates each fish's path individually
   *  (1 for a milling shoal, 0 for a clean shared loop); Scatter offsets each
   *  fish's path centre so they interleave instead of sitting concentric.
   *  ------------------------------------------------------------------- */
  /** Shoal · milling under the dock */
  deskFishAOn: number;
  deskFishACount: number;
  deskFishAX: number;
  deskFishAY: number;
  deskFishAZ: number;
  deskFishARadiusX: number;
  deskFishARadiusZ: number;
  deskFishARotate: number;
  deskFishATwist: number;
  deskFishAScatter: number;
  deskFishASpeed: number;
  deskFishAScale: number;
  deskFishABob: number;
  deskFishAEight: number;
  deskFishAWander: number;
  deskFishADepthSpread: number;
  deskFishABank: number;
  deskFishAYawOffset: number;
  /** Loop · long lap past the lantern */
  deskFishBOn: number;
  deskFishBCount: number;
  deskFishBX: number;
  deskFishBY: number;
  deskFishBZ: number;
  deskFishBRadiusX: number;
  deskFishBRadiusZ: number;
  deskFishBRotate: number;
  deskFishBTwist: number;
  deskFishBScatter: number;
  deskFishBSpeed: number;
  deskFishBScale: number;
  deskFishBBob: number;
  deskFishBEight: number;
  deskFishBWander: number;
  deskFishBDepthSpread: number;
  deskFishBBank: number;
  deskFishBYawOffset: number;
  /** Spare shoal (off by default) */
  deskFishCOn: number;
  deskFishCCount: number;
  deskFishCX: number;
  deskFishCY: number;
  deskFishCZ: number;
  deskFishCRadiusX: number;
  deskFishCRadiusZ: number;
  deskFishCRotate: number;
  deskFishCTwist: number;
  deskFishCScatter: number;
  deskFishCSpeed: number;
  deskFishCScale: number;
  deskFishCBob: number;
  deskFishCEight: number;
  deskFishCWander: number;
  deskFishCDepthSpread: number;
  deskFishCBank: number;
  deskFishCYawOffset: number;
  /** How much the fish bends as it swims, shared by every shoal. 1 is the
   *  swim clip exactly as fish.glb authors it, which is stiffer than it
   *  sounds: the clip animates only Spine3, Tail and the two fins, and moves
   *  Spine3 and Tail in phase, so the fish holds a rigid body and hinges its
   *  back third. Above 1 that motion is stretched about the clip's own mean
   *  pose, and Spine1/Spine2 - which the clip never touches - pick up a bend
   *  running ahead of the tail, turning the hinge into a head-to-tail wave.
   *  0 freezes the body straight.
   *
   *  Measured by running the rig over a full cycle. Lateral sweep at each
   *  joint, as a percentage of the 6.16-unit body, at Wiggle 1.0:
   *
   *    Spine2   5%      Spine3  17%      Tail  36%      tail tip  53%
   *
   *  Spine1 reads 0% and that is correct, not a bug: it is the first joint in
   *  the bending chain, so its rotation moves everything BEHIND it while its
   *  own position never leaves the body's origin.
   *
   *  For contrast, the clip on its own puts 57% at the tip and 0.1% at Spine2
   *  - all of the motion in the last segment, which is what read as a twitch.
   *
   *  Vertical drift stays under 0.3% of the body throughout: the bend axis is
   *  bone-local Z, which displaces the tail almost purely sideways. */
  deskFishWiggle: number;
  /** Tail-beat rate. Multiplies a rate that already tracks each shoal's Speed,
   *  so faster fish beat faster; this is the overall tempo on top. */
  /** How much of a wavelength the body carries at once. 0.25 sweeps almost as
   *  one piece; 0.75 shows a clear S along the fish; past 1 it folds back on
   *  itself and reads as an eel. */
  deskFishWaves: number;
  /** How far the body curves into a turn, in radians at full lock. The
   *  response saturates, so this is a ceiling rather than a gain: about 7 deg
   *  of it shows at a typical turn, 18 at a sharp one. Negative flips which
   *  way the body leans. */
  deskFishTurnBend: number;
  deskFishBeat: number;
  /** How far the whole fish swings side to side, in radians, locked to the
   *  beat. The bones bend the animal; this swings it, which is the part that
   *  still reads at the size these are on screen. */
  deskFishSway: number;
  /** How dark a fish goes when the dock's shadow falls on it. 0 leaves them
   *  lit everywhere; 1 takes them to black, so they vanish against the water.
   *
   *  This is the SAME occlusion the dock lantern's shadow map draws on the
   *  water, solved analytically - see buildDockShade in CampfireScene.tsx. A
   *  shadow map darkens pixels but cannot tell the fish they are in the dark,
   *  and a fish lit as brightly under the deck as out in the open is what gave
   *  the shoal away. Nothing happens while the dock lantern is off: with no
   *  light there is no shadow to be in. */
  /** How much the lantern's distance falloff darkens a fish, on top of the
   *  deck's cast shadow. 0 is occlusion only - a fish beyond the lamp's reach
   *  then swims at full brightness through black water, which is what it used
   *  to do. 1 fades it out completely as it leaves the pool of light. */
  deskFishDark: number;
  deskFishShade: number;
  /** Fades the fish out on top of darkening them, for when black still reads
   *  as a fish-shaped hole. 0 keeps them solid. */
  deskFishShadeFade: number;
  /** How wide the shadow's edge is, in camp units at the fish's own depth. 0
   *  is a hard cut at the deck's outline; larger blurs it. */
  deskFishShadeSoft: number;
  deskCampLampEnabled: number;
  /** Bugs circling a lamp. Per fixture: deskLamp<Id>Bugs turns the swarm on
   *  for that one. The rest are shared shape knobs - one swarm design, worn by
   *  whichever lamps have it switched on.
   *
   *  EVERY knob here is in WORLD units. The swarm hangs on lamps in frames
   *  that differ by 5.6x - the camp diorama runs at 0.173 world units per
   *  unit, the arcade cabin at 0.0307 - so Radius and Height are divided by
   *  the mount frame's scale at each site, and one set of numbers describes
   *  the same real swarm everywhere. Size needs no conversion: three writes
   *  gl_PointSize from the uniform and only then divides by view depth, so no
   *  model matrix ever reaches it (the RectAreaLight width/height trap, for
   *  once working in our favour). */
  /** Reshuffle who is who. Changing it rebuilds the swarm's per-bug constants; every other shape knob reshapes the swarm that already exists. */
  deskBugSeed: number;
  /** Spread of orbit speeds. 0 makes every bug circle in lockstep. */
  deskBugSpeedVary: number;
  /** Chance a bug orbits the other way. 0 or 1 is a carousel; the middle is a cloud. */
  deskBugTwoWay: number;
  /** How far orbit planes tip out of horizontal. 0 flattens the swarm into a disc. */
  deskBugTilt: number;
  /** How often each bug dives at the bulb. */
  deskBugLungeRate: number;
  /** Wing-flicker speed. */
  deskBugFlickerRate: number;
  /** Exponent on the lunge. High holds near zero then spikes; low rounds it into the whole swarm breathing together. */
  deskBugLungeSharp: number;
  /** How far in a lunge carries, as a fraction of the orbit radius. */
  deskBugLungeDepth: number;
  /** Frequency of the erratic wobble, on top of its Jitter amount. */
  deskBugJitterSpeed: number;
  /** How hard they blink. 0 is a steady mote, 1 goes all the way to dark. */
  deskBugFlickerDepth: number;
  /** How much brighter a bug flares on its lunge at the bulb.
   *
   *  The SECOND thing moving a bug's brightness, and it used to be a constant
   *  0.6 buried in the frame loop - so turning Flicker depth down only ever
   *  got you part of the way to a steady swarm, and the remaining pulse had no
   *  knob at all. 0 keeps a lunging bug exactly as bright as a circling one;
   *  0.6 is what it always did. */
  deskBugLungeFlare: number;
  /** Slow vertical wander of the whole swarm, as a fraction of Column height. */
  deskBugDrift: number;
  /** 1 = additive blending, so they glow against the dark. 0 = normal, for bugs seen in daylight. */
  deskBugAdditive: number;
  /** Per-bug size spread, 0..1. 0 = all motes identical. */
  deskBugSizeVary: number;
  /** Exponent on the height / radius scatter. 1 = even (the original). */
  deskBugHeightBias: number;
  deskBugRadiusBias: number;
  /** Orbit Z radius as a fraction of X (1 = circle), and its spin about Y. */
  deskBugOval: number;
  deskBugRotY: number;
  /** Vertical bob, in column heights, faster than deskBugDrift. */
  deskBugWobbleY: number;
  /** Nudge the swarm off the lamp it is anchored to, in world units. */
  deskBugOffsetX: number;
  deskBugOffsetY: number;
  deskBugOffsetZ: number;
  deskBugCount: number;
  deskBugRadius: number;
  deskBugSpread: number;
  deskBugHeight: number;
  deskBugSpeed: number;
  deskBugJitter: number;
  deskBugDive: number;
  deskBugSize: number;
  deskBugOpacity: number;
  deskBugR: number;
  deskBugG: number;
  deskBugB: number;
  /** Shadow quality, shared by whichever desk lamps have Shadow on.
   *
   *  Near/Far are in WORLD units and are what decides whether this works at
   *  all. The camp is scaled to ~0.17, so the distances are tiny: the dock
   *  lantern is 0.24 camp units above the deck = 0.042 world, and 1.02 above
   *  the water = 0.176 world. three's default PointLightShadow near is 0.5 -
   *  both sit inside it, so at the default the dock never enters the shadow
   *  camera and nothing casts. Hence Near 0.01.
   *
   *  Cost: a POINT light's shadow is a cube map, six depth passes a frame; a
   *  SPOT light's is one. Only the dock lantern is on by default. */
  deskShadowMapSize: number;
  deskShadowBias: number;
  deskShadowRadius: number;
  deskShadowNear: number;
  deskShadowFar: number;
  /** ---------------------------------------------------------------------
   *  3 - Desk sector camp lamps, one block PER FIXTURE.
   *
   *  These replace the old shared deskCampLampIntensity/Distance/Decay/
   *  Color* block, which drove all of them off one set of sliders. Ids come
   *  from DESK_CAMP_LAMPS in CampfireScene.tsx and the keys are built from
   *  them, so renaming an id there orphans the values saved here.
   *
   *  deskCampLampEnabled is still the master switch for all five.
   *  The 26 string bulbs are deliberately NOT in this list - they stay
   *  emissive-only, at about 4x the fragment cost if they were not.
   *  ------------------------------------------------------------------- */
  /** Camper van headlights - BOTH bulbs off this one block */
  deskLampVanHeadsOn: number;
  deskLampVanHeadsIntensity: number;
  deskLampVanHeadsReach: number;
  deskLampVanHeadsDecay: number;
  deskLampVanHeadsR: number;
  deskLampVanHeadsG: number;
  deskLampVanHeadsB: number;
  deskLampVanHeadsEmissive: number;
  deskLampVanHeadsShadow: number;
  deskLampVanHeadsBugs: number;
  /** LENS placement - the glowing circle and its housing. The light does NOT
   *  follow it: every fixture has its own Light X/Y/Z for the exact point the
   *  light emits from, so the visible lamp and its light are independent. */
  deskLampVanHeadsOffX: number;
  deskLampVanHeadsOffY: number;
  deskLampVanHeadsOffZ: number;
  /** The headlights throw a beam, not a glow. Beam 0/1 swaps the spot back
   *  to a plain point light; Angle/Penumbra shape the cone. Push moves the
   *  source forward out of the bodywork before it emits - a spot flush in the
   *  lens lights the van's own face at point-blank range and, with decay 2,
   *  blows the surrounds and trim squares to flat white. The frontmost
   *  geometry is about 0.33 ahead of the lens centre, so 0.7 clears it. */
  deskLampVanHeadsBeam: number;
  deskLampVanHeadsBeamAngle: number;
  deskLampVanHeadsBeamPenumbra: number;
  deskLampVanHeadsBeamPush: number;
  deskLampVanHeadsBeamTilt: number;
  deskLampVanHeadsLightX: number;
  deskLampVanHeadsLightY: number;
  deskLampVanHeadsLightZ: number;
  /** Small lamp · near the fire pit */
  deskLampSmallAOn: number;
  deskLampSmallAIntensity: number;
  deskLampSmallAReach: number;
  deskLampSmallADecay: number;
  deskLampSmallAR: number;
  deskLampSmallAG: number;
  deskLampSmallAB: number;
  deskLampSmallAEmissive: number;
  deskLampSmallAShadow: number;
  deskLampSmallABugs: number;
  deskLampSmallALightX: number;
  deskLampSmallALightY: number;
  deskLampSmallALightZ: number;
  /** Nudge the whole small lamp - glass AND housing - in camp units. */
  deskLampSmallAOffX: number;
  deskLampSmallAOffY: number;
  deskLampSmallAOffZ: number;
  /** Small lamp · far side of camp */
  deskLampSmallBOn: number;
  deskLampSmallBIntensity: number;
  deskLampSmallBReach: number;
  deskLampSmallBDecay: number;
  deskLampSmallBR: number;
  deskLampSmallBG: number;
  deskLampSmallBB: number;
  deskLampSmallBEmissive: number;
  deskLampSmallBShadow: number;
  deskLampSmallBBugs: number;
  deskLampSmallBLightX: number;
  deskLampSmallBLightY: number;
  deskLampSmallBLightZ: number;
  /** Nudge the whole lantern - glass AND housing - in camp units. */
  deskLampSmallBOffX: number;
  deskLampSmallBOffY: number;
  deskLampSmallBOffZ: number;
  /** Hooded lantern · on the signpost */
  deskLampHoodOn: number;
  deskLampHoodIntensity: number;
  deskLampHoodReach: number;
  deskLampHoodDecay: number;
  deskLampHoodR: number;
  deskLampHoodG: number;
  deskLampHoodB: number;
  deskLampHoodEmissive: number;
  deskLampHoodShadow: number;
  deskLampHoodBugs: number;
  deskLampHoodLightX: number;
  deskLampHoodLightY: number;
  deskLampHoodLightZ: number;
  /** Nudge the whole hooded lantern - glass AND housing - in camp units. */
  deskLampHoodOffX: number;
  deskLampHoodOffY: number;
  deskLampHoodOffZ: number;
  deskAmbientIntensity: number;
  deskAmbientColorR: number;
  deskAmbientColorG: number;
  deskAmbientColorB: number;
  /** Candle flame inside each lantern - local offset in the lantern's frame
   *  plus a size multiplier. Colors follow deskLanternColor* so warmth tunes
   *  the flame and the point-light together. */
  deskLanternFlameX: number;
  deskLanternFlameY: number;
  deskLanternFlameZ: number;
  deskLanternFlameScale: number;
  /** Multiplier on how fast the flame sways and pulses. 1 = default speed. */
  deskLanternFlameSpeed: number;
  /** How far the flame sways side-to-side (radians of tilt at peak). */
  deskLanternFlameSway: number;
  /** How much the flame pulses in size (0 = no pulse, 1 = ~10% at peak). */
  deskLanternFlamePulse: number;
  /** Extra opacity multiplier so the flame reads bright like the campfire. */
  deskLanternFlameBrightness: number;
  /** Base color of the lantern flame cones (0..1 per channel). Independent
   *  from the lantern point-light color so the flame can read hot-orange
   *  while the wall spill stays a different tint. Mid/tip cones lerp from
   *  this toward warm yellows just like the main campfire palette. */
  deskLanternFlameColorR: number;
  deskLanternFlameColorG: number;
  deskLanternFlameColorB: number;
  /** How brightly the caravan side windows glow (emissiveIntensity on the
   *  cloned `02___Default` window material). 0 = windows dark. */
  deskCaravanWindowIntensity: number;
  /** Window / interior-spill light color 0..1. Shared between the emissive on
   *  the window material and the point-light inside the caravan, so tinting
   *  the pane also warms/cools the ground glow beneath it. */
  deskCaravanWindowColorR: number;
  deskCaravanWindowColorG: number;
  deskCaravanWindowColorB: number;
  /** Local-frame position of the interior point-light. The caravan GLB is
   *  authored at ~80 units long BEFORE its parent group scales it down, so
   *  these values live in that pre-parent-scale space. */
  deskCaravanWindowLightX: number;
  deskCaravanWindowLightY: number;
  deskCaravanWindowLightZ: number;
  /** Interior point-light intensity, distance falloff (in same pre-scale
   *  units as the position), and physical decay exponent. */
  deskCaravanWindowLightIntensity: number;
  deskCaravanWindowLightDistance: number;
  deskCaravanWindowLightDecay: number;
  /** Camping-diorama lamps. The old-bear camping.glb has ~12 emissive lamp
   *  meshes (materials named `Lamp`, `Lamp.001`..`Lamp.012`). On mount we
   *  traverse the loaded GLTF and drop a shared THREE.PointLight beside each
   *  so they actually spill light onto the surroundings the way the campfire,
   *  lantern and computer glow do. Values are single global knobs applied to
   *  every camping lamp (individual per-lamp tuning is intentionally omitted
   *  to keep the config surface small). */
  campingLampIntensity: number;
  campingLampDistance: number;
  campingLampDecay: number;
  campingLampColorR: number;
  campingLampColorG: number;
  campingLampColorB: number;
  /** Placement of the second campfire that lives inside the arcade sector.
   *  Visual look (flame cones, sparks, glow disc, point-light reach) is shared
   *  with the primary campfire so both fires stay in sync when you tune the
   *  main fire; these knobs only move/scale the assembly. */
  arcadeCampfireX: number;
  arcadeCampfireY: number;
  arcadeCampfireZ: number;
  arcadeCampfireRotationY: number;
  arcadeCampfireScale: number;
  /** Local-space offset applied to the "Tailgate" node inside the pickup truck
   *  GLB. The tailgate has its own transform; these values are added to it at
   *  runtime so we can nudge the tailgate up/down/back without editing the GLB
   *  again. Y is the vertical raise (positive = up in the truck's local frame),
   *  RotX rotates it around the hinge (positive = tail rises). */
  truckTailgateX: number;
  truckTailgateY: number;
  truckTailgateZ: number;
  truckTailgateRotX: number;
  truckTailgateRotY: number;
  truckTailgateRotZ: number;
  /** Per-axis scale multipliers applied to the Tailgate node. ScaleX is the
   *  tailgate's width (side to side across the truck), ScaleY is its vertical
   *  thickness, ScaleZ is its depth (how far it extends back from the truck's
   *  rear wall). All 1.0 = authored size. */
  truckTailgateScaleX: number;
  truckTailgateScaleY: number;
  truckTailgateScaleZ: number;
  // Size of the TWLO decal laid over the truck's licence plates. 1 = the
  // baseline quad, which is 84% of the plate slab's width and 78% of its
  // height. Applies to the front and rear plate together so they match.
  truckPlateScaleX: number;
  truckPlateScaleY: number;

  // --- Arcade truck lamps + lights -----------------------------------------
  // truckHeadLamp* / truckTailLamp* drive the LENS GEOMETRY, which is built at
  // runtime (rounded-rect extrusion) rather than baked into the GLB, so the
  // shape itself is adjustable: Radius 0 = hard rectangle, 1 = full stadium
  // oval. truckHeadLight* / truckTailLight* drive the actual lights.
  // Colours are LINEAR (three's working space), matching arcadeFireLightColor*.
  truckHeadLampW: number;
  truckHeadLampH: number;
  truckHeadLampRadius: number;
  truckHeadLampDepth: number;
  truckHeadLampSpanX: number;
  truckHeadLampY: number;
  truckHeadLampZ: number;
  truckHeadLampRotX: number;
  truckHeadLampRotY: number;
  truckHeadLampRotZ: number;
  truckHeadLampBezelPad: number;
  truckHeadLampBezelDepth: number;
  truckHeadLampProud: number;
  truckHeadLampColorR: number;
  truckHeadLampColorG: number;
  truckHeadLampColorB: number;
  truckHeadLampEmissive: number;
  truckHeadLampHide: number;
  truckTailLampW: number;
  truckTailLampH: number;
  truckTailLampRadius: number;
  truckTailLampDepth: number;
  truckTailLampSpanX: number;
  truckTailLampY: number;
  truckTailLampZ: number;
  truckTailLampRotX: number;
  truckTailLampRotY: number;
  truckTailLampRotZ: number;
  truckTailLampBezelPad: number;
  truckTailLampBezelDepth: number;
  truckTailLampProud: number;
  truckTailLampColorR: number;
  truckTailLampColorG: number;
  truckTailLampColorB: number;
  truckTailLampEmissive: number;
  truckTailLampHide: number;
  truckHeadLightX: number;
  truckHeadLightY: number;
  truckHeadLightZ: number;
  truckHeadLightAimX: number;
  truckHeadLightAimY: number;
  truckHeadLightAimZ: number;
  truckHeadLightIntensity: number;
  truckHeadLightDistance: number;
  truckHeadLightDecay: number;
  truckHeadLightAngle: number;
  truckHeadLightPenumbra: number;
  truckHeadLightColorR: number;
  truckHeadLightColorG: number;
  truckHeadLightColorB: number;
  truckHeadLightFlicker: number;
  truckTailLightX: number;
  truckTailLightY: number;
  truckTailLightZ: number;
  truckTailLightIntensity: number;
  truckTailLightDistance: number;
  truckTailLightDecay: number;
  truckTailLightColorR: number;
  truckTailLightColorG: number;
  truckTailLightColorB: number;
  /** Extra height added to the inside bed walls (left, right, and front cab
   *  wall). 0 = flush with the authored top rail; positive raises a matching
   *  panel above the rail so the bed can hold taller cargo. Measured in truck
   *  local units (~metres). Runtime-added geometry, so no GLB edit needed. */
  truckBedWallHeight: number;
  /** Thickness of the wall extension in the bed's left/right (X) direction.
   *  Default 0.02 = 2 cm; bumping this makes the extension read as a chunky
   *  rail instead of a thin fence. */
  truckBedWallThickness: number;
  /** Hex-like RGB (0-1 floats) for the wall extension material, split into
   *  three fields so it can be tuned via the numeric config pipeline. Default
   *  matches the yellow truck body. */
  truckBedWallColorR: number;
  truckBedWallColorG: number;
  truckBedWallColorB: number;
  /* --- arcade campfire visuals ---------------------------------------------
   * Independent copy of the main campfire's fire/flame/spark/glow knobs so
   * the arcade fire can be tuned differently from the campfire-at-camp fire.
   * Every field mirrors a main-fire field with an "arcade" prefix; ArcadeCampfire
   * reads from these instead of the shared ones. */
  arcadeFireIntensity: number;
  arcadeFireDecay: number;
  arcadeFlickerAmount: number;
  arcadeFireLightX: number;
  arcadeFireLightY: number;
  arcadeFireLightZ: number;
  arcadeFireLightReach: number;
  arcadeFireLightColorR: number;
  arcadeFireLightColorG: number;
  arcadeFireLightColorB: number;
  arcadeFarGlowIntensity: number;
  arcadeFarGlowReach: number;
  arcadeFarGlowDecay: number;
  arcadeFlameX: number;
  arcadeFlameY: number;
  arcadeFlameZ: number;
  arcadeFlameScale: number;
  arcadeFlameOuterScale: number;
  arcadeFlameInnerScale: number;
  arcadeFlameHaloScale: number;
  arcadeGlowOpacity: number;
  arcadeGlowY: number;
  arcadeGlowScale: number;
  arcadeSparkOpacity: number;
  arcadeSparkCount: number;
  arcadeSparkSpread: number;
  arcadeSparkMaxHeight: number;
  arcadeSparkSpeed: number;
  arcadeSparkSway: number;
  arcadeSparkBurstChance: number;
  arcadeSparkSize: number;
  arcadeSparkLifetime: number;
  /** Global multiplier on every arcade CRT's screen glow — brightens or dims
   *  all four TVs at once so their combined spill onto the cubs can be tuned. */
  arcadeCabinLampX: number;
  arcadeCabinLampY: number;
  arcadeCabinLampZ: number;
  arcadeCabinLampIntensity: number;
  arcadeCabinLampDistance: number;
  arcadeCabinLampDecay: number;
  arcadeCabinLampColorR: number;
  arcadeCabinLampColorG: number;
  arcadeCabinLampColorB: number;
  arcadeCabinLampEmissive: number;
  /** Cabin lamp: 0 = omnidirectional point light (original), 1 = aimed spot. */
  arcadeCabinLampDirectional: number;
  /** Cabin lamp aim, degrees. Yaw turns it about the vertical. */
  arcadeCabinLampYawDeg: number;
  /** Cabin lamp aim, degrees. -90 = straight down, 0 = level, +90 = straight up. */
  arcadeCabinLampPitchDeg: number;
  /** Cabin lamp cone HALF-angle in degrees (three's spotLight.angle). */
  arcadeCabinLampConeDeg: number;
  /** Cabin lamp cone edge softness, 0 = hard rim, 1 = fully feathered. */
  arcadeCabinLampPenumbra: number;
  /** Bug swarm around the cabin's lantern. Shape comes from the shared
   *  deskBug* knobs. */
  arcadeCabinLampBugs: number;
  /** The close-up framing when crt_0 is clicked, both measured in SCREEN
   *  HEIGHTS so they hold whatever scale the tube is set to: how far out in
   *  front of the glass the camera stands, and how far above its centre.
   *  1.07 back is exactly full-frame at fov 50. */
  crtFocusBack: number;
  crtFocusHeight: number;
  /** Cabin computer close-up: standoff from the glass, in screen heights. */
  pcFocusBack: number;
  /** Cabin computer close-up: camera raised/lowered, in screen heights. */
  pcFocusHeight: number;
  /** Cabin computer's synthesized hardware sounds (mouse, keys, drive,
   *  monitor), on top of master. */
  pcSoundVolume: number;
  /** OnlyBears reveal shot: how far back from the glass, in screen heights. */
  pcRevealBack: number;
  /** OnlyBears reveal shot: camera height above the screen centre, screen heights. */
  pcRevealHeight: number;
  /** OnlyBears reveal shot: aim point above the screen centre, screen heights. */
  pcRevealAimUp: number;
  /** How grey the old bear's coat is: 0 = his original brown, 1 = fully grey. */
  oldBearGrey: number;
  /** Old bear coat brightness multiplier. */
  oldBearBrightness: number;
  /** How pale the old bear's face / muzzle goes, 0..1. */
  oldBearFaceLight: number;
  /** Old bear coat tint: negative = cool/blue grey, positive = warm/brown grey. */
  oldBearWarmth: number;
  /** Old bear glasses on (1) / off (0). */
  oldBearGlassesShow: number;
  /** Old bear glasses size multiplier. */
  oldBearGlassesScale: number;
  /** Old bear glasses: move up (+) / down (-) the face, model units. */
  oldBearGlassesUp: number;
  /** Old bear glasses: slide out along (+) / back up (-) the snout, model units. */
  oldBearGlassesFwd: number;
  /** Old bear eyebrows on (1) / off (0). */
  oldBearBrowShow: number;
  /** Old bear eyebrow size multiplier. */
  oldBearBrowScale: number;
  /** Old bear beard SHAPE: index into OLD_BEAR_BEARD_STYLES (0-5).
   *  Six deformations of the one beard mesh - see oldBear.ts. */
  oldBearBeardStyle: number;
  /** Old bear beard on (1) / off (0). */
  oldBearBeardShow: number;
  /** Old bear beard overall size. */
  oldBearBeardScale: number;
  /** Old bear beard length (down from the chin). */
  oldBearBeardLength: number;
  /** Old bear beard width. */
  oldBearBeardWidth: number;
  /** Old bear coat colour, sRGB 0..1 (mid-tone fur is recoloured to this). */
  oldBearCoatR: number;
  oldBearCoatG: number;
  oldBearCoatB: number;
  /** Old bear beard + eyebrow colour, sRGB 0..1. */
  oldBearHairR: number;
  oldBearHairG: number;
  oldBearHairB: number;
  /** Old bear glasses: 0 = clear lenses, 1 = milky / fogged. */
  oldBearLensCloud: number;
  /** OnlyBears gag playback speed (0.5 = twice as slow). */
  onlyBearsSpeed: number;
  /** OnlyBears: how big the paw grows on the way over. */
  onlyBearsPawScale: number;
  /** OnlyBears bear size multiplier. */
  onlyBearsScale: number;
  /** OnlyBears bear position nudge, computer units (x right). */
  onlyBearsX: number;
  /** OnlyBears bear position nudge, computer units (y up). */
  onlyBearsY: number;
  /** OnlyBears bear position nudge, computer units (z toward viewer). */
  onlyBearsZ: number;
  /** OnlyBears extra forward lean at the cover pose, degrees. */
  onlyBearsLean: number;
  /** OnlyBears: how far his head turns to look at you, 0..1. */
  onlyBearsLook: number;
  /** OnlyBears: chest breathing while he holds the pose (arms stay put). */
  onlyBearsBreath: number;
  /** OnlyBears gag: cartoon easing strength. 0 = even smoothstep (the old,
   *  polite version), 1 = full pop / wind-up / slam. */
  onlyBearsSnap: number;
  /** OnlyBears gag: wobble after the paw hits the glass. 0 = dead stop. */
  onlyBearsImpact: number;
  /** Rigid offset applied to the whole arcade set inside scene 2 - CRTs,
   *  cubs, consoles, picnic table, snacks and the arcade fire. Moves them as
   *  one unit without disturbing their relative layout. */
  /** Master fade for the arcade fire, 0..1 - scales the point lights AND the
   *  flame, ground glow and sparks together. Those three are unlit additive
   *  material, so before this existed the fire's "intensity" slider could
   *  only turn off the light it cast and the fire itself stayed fully bright
   *  at 0. */
  arcadeFireDim: number;
  arcadeSetX: number;
  arcadeSetY: number;
  arcadeSetZ: number;
  /** The same rigid offset for the bear's study inside scene 3 - table, chair,
   *  computer, books, mug, papers, boxes, TP and the bear himself. */
  cabinSetX: number;
  cabinSetY: number;
  cabinSetZ: number;
  arcadeCrtGlow: number;
  /** Colour of the light every CRT throws forward. Overrides each screen's own
   *  `tint`. Defaults to #79c6f0, the blue crt_0's menu averages to, so nothing
   *  moves until a slider does. */
  arcadeCrtLightR: number;
  arcadeCrtLightG: number;
  arcadeCrtLightB: number;
  /* --- arcade CRT spot-light shape ----------------------------------------
   * Each of the 4 CRTs runs its own THREE.SpotLight aimed OUT the screen face
   * (local +Z). These knobs shape all four together — the previous point
   * light lit up the truck wall BEHIND the TVs too; the spot's cone confines
   * the throw to the front. Every field maps 1:1 to CrtLightConfig. */
  /** Distance in local +Z from the screen face where the light source sits. */
  arcadeCrtLightForwardOffset: number;
  /** Cone half-angle in radians (0..Math.PI/2). Wider = spills more sideways. */
  arcadeCrtLightAngle: number;
  /** Soft edge feathering, 0..1. 0 = hard cone, 1 = fully feathered. */
  arcadeCrtLightPenumbra: number;
  /** Max reach of the throw in world units. */
  arcadeCrtLightDistance: number;
  /** Falloff exponent (physical = 2). */
  arcadeCrtLightDecay: number;
  /** Multiplier on top of the screen glow — 0 kills the spot entirely. */
  arcadeCrtLightIntensity: number;
  /** The live tube throws real shadows: anything standing in its cone - the
   *  lawn chairs in front of it, most of all - gets its silhouette laid out
   *  behind it. Only crt_0 does this, and only while the global shadow toggle
   *  is on; the other three tubes are hidden scenery and a depth pass each
   *  would be paid for nothing. */
  arcadeCrtShadow: number;
  /** Local X/Y nudge of the light source relative to the screen center. */
  arcadeCrtLightOffsetX: number;
  arcadeCrtLightOffsetY: number;
  fireDecay: number;
  flickerAmount: number;
  // --- Fire ground glow (the pool of light on the dirt) ---------------------
  // Colours are LINEAR. Width/Length replace what used to be a hard-coded
  // 9 x 6.3 disc, so the pool can be stretched instead of forced circular.
  glowColorR: number;
  glowColorG: number;
  glowColorB: number;
  glowWidth: number;
  glowLength: number;
  glowRotY: number;
  glowFalloff: number;
  glowFlicker: number;
  glowBreathe: number;
  glowOffsetX: number;
  glowOffsetZ: number;
  arcadeGlowColorR: number;
  arcadeGlowColorG: number;
  arcadeGlowColorB: number;
  arcadeGlowWidth: number;
  arcadeGlowLength: number;
  arcadeGlowRotY: number;
  arcadeGlowFalloff: number;
  arcadeGlowFlicker: number;
  arcadeGlowBreathe: number;
  arcadeGlowOffsetX: number;
  arcadeGlowOffsetZ: number;
  /** ---------------------------------------------------------------------
   *  3 - Desk sector campfire.
   *
   *  camping.glb used to ship its own fire: a 484-vert orange blob
   *  (material "Lamp.004") sitting on a small log pile, ringed by 15 stones.
   *  All of that was deleted from the GLB in Blender, and this is the
   *  replacement - the SAME procedural fire the campfire and arcade sectors
   *  use (FlameCone stack + FireGlowDisc + Sparks + two point lights), with
   *  the rocks-and-logs "bonfire" node cloned out of campfire_scene.glb.
   *
   *  deskCampfireX/Y/Z are in CAMPING.GLB's own space, not the sector's: the
   *  fire hangs off an anchor group in ContactSector that mirrors the camping
   *  Selectable's resolved position/rotation/scale. The defaults are measured
   *  straight off the GLB - the old fire pit sits at (4.25, 1.12, -0.07) - and
   *  they keep pointing at the pit no
   *  matter how the diorama is dragged, spun or resized. (It is currently at
   *  0.207 scale with a -2.71 rad heading, which is why placing this fire in
   *  sector space left it hanging in the air above the camp.)
   *
   *  Sizes therefore mean CAMP units, not world units, with two exceptions
   *  that three.js keeps in world space no matter what scales them:
   *  deskFireLightReach / deskFarGlowReach (a point light's `distance`) and
   *  deskGlowWidth / deskGlowLength (the disc divides the ancestor scale back
   *  out on purpose, so Width really is metres of ground).
   *
   *  Unlike the arcade fire - which reuses the primary campfire's flame and
   *  glow numbers - this one owns every knob, because the diorama is at a
   *  different scale from the two hero campsites and sharing the tuning made
   *  the flame the size of the tent.
   *  ------------------------------------------------------------------- */
  deskCampfireX: number;
  deskCampfireY: number;
  deskCampfireZ: number;
  deskCampfireRotationY: number;
  deskCampfireScale: number;
  /** 1 = draw the cloned rocks-and-logs pile under the flames, 0 = flames
   *  only (use this if you'd rather drop the fire onto something else). */
  deskCampfirePileVisible: number;
  deskFlameX: number;
  deskFlameY: number;
  deskFlameZ: number;
  deskFlameScale: number;
  deskFlameOuterScale: number;
  deskFlameInnerScale: number;
  deskFlameHaloScale: number;
  deskFireIntensity: number;
  deskFireDecay: number;
  deskFlickerAmount: number;
  deskFireLightX: number;
  deskFireLightY: number;
  deskFireLightZ: number;
  deskFireLightReach: number;
  /** LINEAR colour (three's working space), matching arcadeFireLightColor*. */
  deskFireLightColorR: number;
  deskFireLightColorG: number;
  deskFireLightColorB: number;
  deskFarGlowIntensity: number;
  deskFarGlowReach: number;
  deskFarGlowDecay: number;
  deskGlowOpacity: number;
  deskGlowY: number;
  deskGlowScale: number;
  deskGlowColorR: number;
  deskGlowColorG: number;
  deskGlowColorB: number;
  deskGlowWidth: number;
  deskGlowLength: number;
  deskGlowRotY: number;
  deskGlowFalloff: number;
  deskGlowFlicker: number;
  deskGlowBreathe: number;
  deskGlowOffsetX: number;
  deskGlowOffsetZ: number;
  deskSparkOpacity: number;
  deskSparkCount: number;
  deskSparkSpread: number;
  deskSparkMaxHeight: number;
  deskSparkSpeed: number;
  deskSparkSway: number;
  deskSparkBurstChance: number;
  deskSparkSize: number;
  deskSparkLifetime: number;
  glowOpacity: number;
  glowY: number;
  glowScale: number;
  sparkOpacity: number;
  sparkCount: number;
  sparkSpread: number;
  sparkMaxHeight: number;
  sparkSpeed: number;
  sparkSway: number;
  sparkBurstChance: number;
  sparkSize: number;
  sparkLifetime: number;
  /** 1 = clicking the fire kicks embers up out of it. The click still
   *  selects the campfire either way, so the lab can still drag it. */
  fireClickBurstOn: number;
  /** Height above the flame's origin that the embers leave from. */
  fireBurstY: number;
  /** Embers per click. */
  fireBurstCount: number;
  /** Initial ember speed. */
  fireBurstSpeed: number;
  /** Width of the ember cone. 0 is a vertical column. */
  fireBurstSpread: number;
  /** Seconds before the last ember dies and the burst parks itself. */
  fireBurstLifetime: number;
  /** Ember point size. */
  fireBurstSize: number;
  /** Ember brightness (additive, so >1 is meaningful). */
  fireBurstOpacity: number;
  /** Peak of the light flare on the click. */
  fireFlashIntensity: number;
  /** Seconds for the flare to decay. */
  fireFlashDuration: number;
  /** Distance falloff on the flare light. */
  fireFlashReach: number;
  fireLightX: number;
  fireLightY: number;
  fireLightZ: number;
  fireLightReach: number;
  farGlowIntensity: number;
  farGlowReach: number;
  farGlowDecay: number;
  warmLightX: number;
  warmLightY: number;
  warmLightZ: number;
  warmLightReach: number;
  warmLightAngle: number;
  sceneScale: number;
  sceneX: number;
  sceneY: number;
  sceneZ: number;
  sceneRotationY: number;
  flameX: number;
  flameY: number;
  flameZ: number;
  flameScale: number;
  /** Per-layer size multipliers stacked on top of `flameScale`. Outer is the
   *  orange sheath, inner is the pale-yellow tip cone, halo is the hot
   *  spherical core. The mid cone auto-averages outer & inner so it stays
   *  visually tucked between them. */
  flameOuterScale: number;
  flameInnerScale: number;
  flameHaloScale: number;
  benchRadius: number;
  benchScale: number;
  benchAngleOffset: number;
  treeScale: number;
  treeY: number;
  treeSpread: number;
  treeCloseRadius: number;
  /* --- forest & paths ----------------------------------------------------
   * A procedural pine forest ringing the campsite, with clear corridors
   * along each of the three inter-camp paths so a camera at one camp can
   * still see the other two. The path itself can be visualised as a white
   * strip on the ground for placement. Tree height is a single global knob
   * so the whole forest can be dialed up or down as a baseline. */
  /** 0 = no forest trees rendered. */
  forestEnabled: number;
  /** 0 = paths invisible; 1 = white strip drawn between each camp pair. */
  pathVisible: number;
  /** Width of the drawn path strip in world units. Also seeds where flanking
   *  trees sit — a wider strip pushes them further apart. */
  pathWidth: number;
  /** Half-width of the sight-line corridor around each path — trees inside
   *  it are culled so the camera has a clear view down the trail. */
  pathCorridorHalfWidth: number;
  /** Global height multiplier for every forest tree. Acts as the baseline
   *  for the whole forest: bump this before touching individual densities. */
  forestTreeHeight: number;
  /** How many forest trees to try to place. Denser is generally better —
   *  extras that don't fit get skipped rather than piling up. */
  forestTreeCount: number;
  /** Radius around each camp centre kept clear of forest trees. */
  forestClearRadius: number;
  /** Outer radius of the forest ring. Trees are only sprinkled between the
   *  campsite ring and this distance. */
  forestOuterRadius: number;
  /** 1 = pines cast shadows again. Off by default: the campfires' point lights
   *  are cube shadows (6 faces each) and the forest opts out of frustum
   *  culling, so this costs six full forest passes per fire. */
  forestCastShadow: number;
  /** Spacing between flanking trees planted alongside each path. Smaller =
   *  denser lining. */
  pathFlankSpacing: number;
  animalScale: number;
  animalY: number;
  animalX: number;
  animalZ: number;
  animalSpread: number;
  bonfireX: number;
  bonfireY: number;
  bonfireZ: number;
  bonfireRotationY: number;
  bonfireScale: number;
  tentX: number;
  tentY: number;
  tentZ: number;
  tentRotationY: number;
  tentScale: number;
  campItemsScale: number;
  campItemsSpread: number;
  campItemsY: number;
  /* --- flopping fish -----------------------------------------------------
   * A fish laid on its side near the fire, cycling between frantic flopping
   * bursts and moments of stillness. Position, rotation, scale, and the
   * timeScale used during flop bursts are all here so the lab can dial them. */
  fishX: number;
  fishY: number;
  fishZ: number;
  fishRotationX: number;
  fishRotationY: number;
  fishRotationZ: number;
  fishScale: number;
  /** action.timeScale during the flop phase; 0 during rest */
  fishFlopSpeed: number;
  /** 1 = clicking the fish throws it in the fire. 0 keeps the plain
   *  click-to-select behaviour, which is what the lab needs to position it. */
  fishLaunchOn: number;
  /** Seconds from click to landing. */
  fishLaunchDuration: number;
  /** Height of the throw's apex above the straight line between the
   *  fish and the fire. 0 slides it along the ground. */
  fishLaunchArc: number;
  /** Full tumbles during the flight, about the axis across the
   *  direction of travel. */
  fishLaunchSpin: number;
  /** How far ABOVE the flame's origin it lands. Aim for the middle of
   *  the flame, not its base, or the fish vanishes into the logs. */
  fishLaunchTargetY: number;
  /** Multiplier on fishFlopSpeed while airborne - it should be
   *  thrashing harder in the air than it ever did on the dirt. */
  fishLaunchFlail: number;
  /** Seconds until the fish comes back. 0 = gone for the rest of the
   *  visit, which is the point. */
  fishRespawnDelay: number;
  /** 1 = clicking the tent after the fish was thrown flops a new one out of
   *  it, back to the original spot. */
  fishReturnOn: number;
  /** Seconds for the trip from the tent back to the spot. */
  fishReturnDuration: number;
  /** Height of the first flop on the way back (later hops shrink). */
  fishReturnArc: number;
  /** Number of flopping hops on the way back. */
  fishReturnHops: number;
  /** Whole end-over-end turns on the way back. */
  fishReturnSpin: number;
  /** How far in front of the tent's middle (toward the fish spot) it appears. */
  fishReturnOut: number;
  /** How high above the ground it appears out of the tent. */
  fishReturnUp: number;
  /** 1 = show the spare oars around the boat (pick a favourite position). */
  boatOarOptions: number;
  /** Embers in the impact burst. */
  fishBurstCount: number;
  /** Initial ember speed. */
  fishBurstSpeed: number;
  /** Width of the ember cone. 0 is a vertical column. */
  fishBurstSpread: number;
  /** Seconds before the last ember dies and the burst parks itself. */
  fishBurstLifetime: number;
  /** Ember point size. */
  fishBurstSize: number;
  /** Ember brightness (additive, so >1 is meaningful). */
  fishBurstOpacity: number;
  /** Peak of the light flare on impact. */
  fishFlashIntensity: number;
  /** Seconds for the flare to decay. */
  fishFlashDuration: number;
  /** Distance falloff on the flare light. */
  fishFlashReach: number;
  /** 1 = clicking the two bags and the tent sets the animals off. */
  critterActsOn: number;
  /** Ground level in location-0 local space. CampfireGround is a plane at
   *  world y -0.02 and the Location group sits at y 0, so this is where feet
   *  belong. Each animal's root is derived from it, never written directly. */
  critterGroundY: number;

  /* ---- toppling props ------------------------------------------------
   * All of these were measured off the real meshes in Blender, not tuned by
   * eye: the pivots are where each prop meets the ground, `balance` is the
   * angle at which its centre of mass crosses that pivot, `rest` is the angle
   * at which it settles (the local minimum of centre-of-mass height), and
   * `gravity` is m.g.d / I about the hinge, from interior point-sampling.
   * See TipOver in CritterActs.tsx. */
  /** world heading (atan2(x, z)) the bag's top falls toward */
  bagTipHeading: number;
  /* Angle at which the bag's lurch takes the rod down with it.
   *
   * Note this is a CUE, not a measured collision. It was one while the bag
   * fell toward the rod; now that it falls forward, toward the camera, the two
   * hulls never come closer than the 0.14 they already sit at - the bag moves
   * AWAY from the rod the whole way down. Kept small (~7 degrees, about 30 ms
   * in) so the two go over as one event rather than in sequence. */
  bagTipContact: number;
  rodTipHeading: number;
  hikeBagTipHeading: number;
  /** How hard the bag is shoved, as a MULTIPLE of the least it takes to get
   *  over its own tipping point. 1 balances exactly on it, under 1 it rocks
   *  back upright, 1.2 goes over with a visible hesitation. A multiple rather
   *  than a raw rad/s because the barrier changes with the fall direction. */
  bagTipShove: number;
  hikeBagTipShove: number;
  /** The rod has to be shoved back against its own lean to fall toward the
   *  fire, so it wants a firmer knock than the bags. */
  rodTipShove: number;
  /** Fine trim on where each prop comes to rest, in radians, on top of the
   *  `Fall` multiplier. Positive drives the far end down. This is the levelling
   *  knob: a prop can land visibly nose-up at an angle less than 2 degrees. */
  bagTipTilt: number;
  hikeBagTipTilt: number;
  rodTipTilt: number;
  /** How far each prop is lifted, in world units, by the time it has fallen -
   *  the fix for a shape that cannot land cleanly on rotation alone. The rod
   *  needs 0.045: at the angle that puts its tip on the ground its reel is
   *  5 cm under, with a fifth of the rod buried. */
  bagTipLift: number;
  hikeBagTipLift: number;
  rodTipLift: number;
  /** Judder on the bags. They are compact and soft rather than springy, so
   *  this wants to be smaller and faster than the rod's whip - a thud that
   *  shakes rather than a stick that rings. 0 = rigid. */
  bagRattleAmp: number;
  bagRattleFreq: number;
  bagRattleDamp: number;
  hikeBagRattleAmp: number;
  hikeBagRattleFreq: number;
  hikeBagRattleDamp: number;
  /** How much the rod whips as it goes over and when it lands, in radians.
   *  0.03 swings the tip about 8 cm - a rattle, not a wobble. 0 = rigid. */
  rodRattleAmp: number;
  /** Hz of that whip. */
  rodRattleFreq: number;
  /** How fast it dies away, per second. */
  rodRattleDamp: number;
  /** How far each prop goes over, as a multiple of the angle at which its hull
   *  first touches the ground. 1 = exactly that contact. The rod needs 1.13
   *  because its reel catches first and leaves the tip 0.46 in the air. */
  bagTipFall: number;
  hikeBagTipFall: number;
  rodTipFall: number;
  /** how much of the impact speed survives the bounce, shared by both */
  tipRestitution: number;
  /** Raccoon size. */
  raccoonScale: number;
  /** How far out of the tent the doughnut appears. */
  tentMouthOut: number;
  /** Doughnut height off the ground while it rolls. */
  donutY: number;
  /** How far it rolls before coming to rest. */
  donutRoll: number;
  /** Seconds of the roll. The raccoon waits inside the tent for exactly
   *  this long, so the two stay in step however either is retuned. */
  donutRollDur: number;
  /** Doughnut size on the ground. */
  donutScale: number;
  /** Doughnut radius - sets the spin rate so it rolls instead of skidding. */
  donutRadius: number;
  /** How far short of the doughnut the raccoon stops. */
  raccoonReach: number;
  /** Seconds from the tent to the doughnut. */
  raccoonOutDur: number;
  /** Seconds to lower its head. */
  raccoonReachDur: number;
  /** Signed angle for the raccoon's head, radians. POSITIVE = local X+ = down
   *  on this rig - the opposite sign to the moose. */
  raccoonDip: number;
  /** Seconds to lift the doughnut. */
  raccoonTakeDur: number;
  /** Seconds back into the tent. */
  raccoonBackDur: number;
  /** Doughnut size in the mouth, relative to raccoonScale. */
  donutCarryScale: number;
  /** Doughnut offset down the jaw. */
  donutCarryDrop: number;
  /** glasses: up/down the face, in bear model units */
  glassesHeight: number;
  /** glasses: how far down the muzzle they ride, along the face-forward axis.
   *  Separate from height because the muzzle sticks out and the two are independent. */
  glassesNoseRide: number;
  glassesScale: number;
  /** glasses: pitch, radians. Tips the lenses up or down against the face. */
  glassesTilt: number;

  /* --- locations ------------------------------------------------------------
   * The campsite is three places standing on a ring with an empty middle, and
   * the camera pivots in that middle turning to face one at a time. Location 0
   * is the campfire and is where the fly-in lands; 1 is the arcade, 2 is the
   * writing desk. A step is 360/3 degrees, so three steps come back round. */

  /** how far each location stands from the middle */
  locationRadius: number;
  /** spins the whole ring. The default puts the campfire due north. */
  locationAngleOffset: number;
  /** extra yaw on each location's contents, for turning a scene to face better */
  locationSpin: number;
  /** how far back toward the middle the camera sits from the location it faces */
  locationCameraBack: number;
  locationCameraHeight: number;
  /** height of the point the camera aims at, at the location's centre */
  locationTargetHeight: number;
  /** seconds to settle when stepping between locations */
  locationTurnSpeed: number;

  /* --- title screen fly-in start pose -----------------------------------------
   * How far pulled back the camera sits while the "Meet the Soft-bear Engineers"
   * title is on screen. The intro flight starts from this pose and lands on the
   * campfire, so raising the distance lets the visitor see more of the scene
   * behind the title before it swoops in. */
  /** multiplier of the final campfire distance the title camera sits at */
  titleCameraDistance: number;
  /** extra height (world units) added to that pulled-back pose */
  titleCameraHeight: number;
  /** Seconds the intro camera swoop takes. Higher = slower, more cinematic. */
  titleFlyDuration: number;
  /** Extra FOV in degrees at the very start of the flight, eased away as it
   *  lands. Gives the move a sense of speed. */
  titleFlyFovBoost: number;
  /** Multiplier that pulls the fog IN at the start of the flight — 1 = no
   *  haze, 0 = totally fogged out. Eases back to 1 as it lands. */
  titleFlyFogSquash: number;
  /**
   * ADDITIVE distance (world units) added to the title camera's pull-back
   * pose, along the away-from-campfire direction. Unlike titleCameraDistance
   * (which is a multiplier of the location's own camera distance), this is
   * an absolute nudge — crank it to push the title further from the
   * campfire in world units.
   */
  titleFlyExtraDistance: number;
  /**
   * The ONE camera angle knob. Pitch in degrees above horizontal — held
   * fixed for the entire flight so there is NO tilt during the move.
   *   -20 = looking slightly down toward the campsite
   *     0 = looking dead level toward it
   *   +30 = looking up at the sky
   * Straight-line position + fixed pitch = smooth arrival, no wobble.
   */
  titleFlyCameraPitch: number;

  /* --- title fade timing ---
   * On mount: hold on a pure-black screen for titleBlackHoldDuration seconds,
   * then fade the letters up over titleFadeInDuration. The letters are
   * clickable from mount — clicking triggers the exit (slide up + fade out
   * over titleFadeOutDuration). */
  /** Seconds of pure black at start, before the letters begin fading in. */
  titleBlackHoldDuration: number;
  titleFadeInDuration: number;
  /** DEPRECATED: previously the wait beat before the hint became clickable.
   *  Letters are now clickable from mount so this is unused; kept for config
   *  compatibility. */
  titleHoldDuration: number;
  /**
   * Seconds the letters take to slide up and off the top of the viewport
   * once clicked. Faster = punchier hand-off to the flight; slower = more
   * cinematic drift. This ONLY drives the slide animation — the overlay
   * unmount timing is titleExitUnmountDelay, below.
   */
  titleExitSlideDuration: number;
  /**
   * Extra seconds to hold the overlay mounted after the slide finishes
   * before tearing down the Canvas + letter GLBs. Bump this up if the
   * slide feels cut short; lower it (or zero it) if you want the browser
   * to reclaim the title's render cost the instant the letters are off
   * screen. Total time-to-unmount = titleExitSlideDuration + this.
   */
  titleExitUnmountDelay: number;
  /**
   * Distance in world units the letters travel UP during the exit slide.
   * Raise it if the letters still clip the top of the viewport at the
   * default; lower it if they leave too soon. Reads like a whoosh-past
   * strength.
   */
  titleExitSlideDistance: number;
  /**
   * Signed Z travel during the exit slide, in world units.
   *   > 0 = letters rush FORWARD toward the viewer (zoom past camera)
   *   < 0 = letters recede BACK away from the viewer (shrink into scene)
   *   0   = purely vertical slide, no depth motion (original behaviour)
   * Combined with the upward slide to give the exit real parallax against
   * the flight swooping in behind it.
   */
  titleExitZDistance: number;
  /** Multiplier on the letters' idle bob/sway amplitude. 1.0 is baseline
   *  gentle motion; 2-3 reads clearly as "playful"; above 4 becomes goofy. */
  titleLetterIdleAmount: number;
  /**
   * Phase offset per letter, in radians. Controls how "wave-like" the row
   * of letters reads:
   *   0    = every letter bobs in lockstep (a single unit moving)
   *   ~0.3 = subtle wave rippling down the row (default)
   *   ~0.8 = pronounced sine wave; adjacent letters clearly out of phase
   *   >π   = chaotic (adjacent letters nearly opposite)
   */
  titleLetterWaviness: number;
  bearDialogueOpacity: number;
  bearDialogueBlurPx: number;
  bearDialogueScale: number;
  bearDialogueBottomRem: number;
  bearDialoguePreviewOn: number;
  bearDialogueFont: number;
  bearDialogueMotionOn: number;
  bearDialoguePopStiffness: number;
  bearDialoguePopDamping: number;
  bearDialogueLeftTiltDeg: number;
  bearDialogueRightTiltDeg: number;
  bearDialoguePreviewSide: number;
  bearDialoguePreviewTextLength: number;
  bearDialogueWidthRem: number;
  bearDialogueMinHeightRem: number;
  bearDialogueCloudFlow: number;
  bearDialogueCloudCycleSec: number;
  bearDialogueRoundness: number;
  bearDialogueWaveDirection: number;
  bearDialogueRippleScale: number;
  bearDialogueWaveAmplitude: number;
  bearDialogueWaveSpeed: number;
  bearDialogueWaveSpacing: number;
  bearDialogueTextSizeRem: number;
  bearDialogueTextPaddingXRem: number;
  bearDialogueTextPaddingYRem: number;
  bearDialogueTextColorR: number;
  bearDialogueTextColorG: number;
  bearDialogueTextColorB: number;
  bearDialogueBorderOn: number;
  bearDialogueBorderWidthPx: number;
  bearDialogueBorderColorR: number;
  bearDialogueBorderColorG: number;
  bearDialogueBorderColorB: number;
  bearDialogueNameTagXRem: number;
  bearDialogueNameTagYRem: number;
  bearDialogueNameTagScale: number;
  bearDialogueNameTagAnchor: number;
  bearDialogueNameTagInsetXRem: number;
  bearDialogueNameTagInsetYRem: number;
  bearDialogueNameTagWaveAmplitude: number;
  bearDialogueNameTagWaveSpeed: number;
  bearDialogueNameTagWaveSpacing: number;
  bearDialogueNameTagRoundness: number;
  bearDialogueNameTagOutlineOn: number;
  bearDialogueNameTagOutlineWidthPx: number;
  bearDialogueNameTagOutlineOpacity: number;
  bearDialogueNameTagOutlineColorR: number;
  bearDialogueNameTagOutlineColorG: number;
  bearDialogueNameTagOutlineColorB: number;
  bearDialogueNameTagShadowDarken: number;
  bearDialogueSmokeyTagColorR: number;
  bearDialogueSmokeyTagColorG: number;
  bearDialogueSmokeyTagColorB: number;
  bearDialogueMapleTagColorR: number;
  bearDialogueMapleTagColorG: number;
  bearDialogueMapleTagColorB: number;
  bearDialogueYouTagColorR: number;
  bearDialogueYouTagColorG: number;
  bearDialogueYouTagColorB: number;
  bearDialogueSmokeyNameTiltDeg: number;
  bearDialogueMapleNameTiltDeg: number;
  bearDialogueSmokeyIconSizeRem: number;
  bearDialogueSmokeyIconAnchor: number;
  bearDialogueSmokeyIconInsetXRem: number;
  bearDialogueSmokeyIconInsetYRem: number;
  bearDialogueSmokeyIconKeepInside: number;
  bearDialogueSmokeyIconXRem: number;
  bearDialogueSmokeyIconYRem: number;
  bearDialogueSmokeyIconTiltDeg: number;
  bearDialogueSmokeyIconTextClearanceRem: number;
  bearDialogueSmokeyIconOpacity: number;
  bearDialogueSmokeyIconBorderOn: number;
  bearDialogueSmokeyIconBorderWidthPx: number;
  bearDialogueSmokeyIconBorderColorR: number;
  bearDialogueSmokeyIconBorderColorG: number;
  bearDialogueSmokeyIconBorderColorB: number;
  bearDialogueSmokeyIconBorderOpacity: number;
  bearDialogueSmokeyIconShadowXRem: number;
  bearDialogueSmokeyIconShadowYRem: number;
  bearDialogueSmokeyIconShadowBlurPx: number;
  bearDialogueSmokeyIconShadowLayers: number;
  bearDialogueSmokeyIconShadowOpacity: number;
  bearDialogueSmokeyIconShadowColorR: number;
  bearDialogueSmokeyIconShadowColorG: number;
  bearDialogueSmokeyIconShadowColorB: number;
  bearDialogueSmokeyIconGlowPx: number;
  bearDialogueSmokeyIconGlowPasses: number;
  bearDialogueSmokeyIconGlowOpacity: number;
  bearDialogueSmokeyIconGlowColorR: number;
  bearDialogueSmokeyIconGlowColorG: number;
  bearDialogueSmokeyIconGlowColorB: number;
  bearDialogueSmokeyIconAutoClearanceOn: number;
  bearDialogueTextFloatAmount: number;
  bearDialogueTextFloatCycleSec: number;
  smokeyHatX: number;
  smokeyHatY: number;
  smokeyHatZ: number;
  smokeyHatRotX: number;
  smokeyHatRotY: number;
  smokeyHatRotZ: number;
  smokeyHatScale: number;
  smokeyHatColorR: number;
  smokeyHatColorG: number;
  smokeyHatColorB: number;
  smokeyHatBandColorR: number;
  smokeyHatBandColorG: number;
  smokeyHatBandColorB: number;

  /**
   * Framing for each location, one entry per location.
   *
   * Held in the location's OWN frame, not world space, so a shot stays put when the
   * ring is resized or spun - local +Z points back at the middle, so a camera at
   * (0, 1.6, 6) is 6 units toward the centre and 1.6 up, whatever the ring is doing.
   * The locationCamera* values above are only the baseline these are seeded from.
   */
  locationViews: LocationView[];

  /* --- sounds -------------------------------------------------------------
   * Ambient loops (fire crackling, banjo) and one-shots (swoosh between
   * panels, hover chime, click) share one master multiplier, so a single
   * knob quiets the whole scene. Per-track values still let you rebalance. */
   masterVolume: number;
   /** Incoming Twilio bear speech only. This does not affect campsite ambience. */
   speechVolume: number;
   /** Per-character trim applied after speechVolume. */
   smokeySpeechVolume: number;
   /** Per-character trim applied after speechVolume. */
  mapleSpeechVolume: number;
   fireCracklingVolume: number;
  /** Cabin ambience: the old bear's rocking chair creaking (scene 3). */
  rockingChairVolume: number;
  banjoVolume: number;
  /** Axe flip (click the chopping block, scene 1): how high it goes, world metres. */
  axeFlipHeight: number;
  /** Axe flip: seconds from leaving the block to biting back in. */
  axeFlipDuration: number;
  /** Axe flip: end-over-end turns (whole turns, so it lands in its slot);
   *  negative spins it the other way round. */
  axeFlipSpins: number;
  /** Axe flip: extra turns about the vertical, whole turns (0 = none). */
  axeFlipTwist: number;
  /** Axe flip: fraction of the flight spent RISING. 0.5 is a symmetric lob;
   *  higher hangs it at the top and drops it back faster (0.58 ~= 1.4x). */
  axeFlipApex: number;
  /** Wood pile (click it, scene 1 - one log per click): how far a log rolls
   *  to the RIGHT of the screen before it curves away, world metres. */
  woodRollRight: number;
  /** 1 = if the tent is off to the right, roll straight at it (stopping
   *  woodRollTentGap short) before curving down; 0 = always woodRollRight. */
  woodRollToTent: number;
  /** How close to the tent a log gets before it curves away, metres. */
  woodRollTentGap: number;
  /** How wide the curve from rolling right to rolling down the screen is, metres. */
  woodRollTurnRadius: number;
  /** How far it rolls DOWN the screen after the curve - long enough to leave
   *  the shot, then it is gone. Metres. */
  woodRollAway: number;
  /** Seconds from leaving the pile to rolling out of shot. */
  woodRollTime: number;
  /** Loudness of the knock as each log hits the ground (x click volume). */
  woodRollSoundVolume: number;
  /** Seconds the bears keep looking at the block after the axe lands. */
  axeWatchHold: number;
  /** Seconds (time constant) for the bears' eyes to catch up with the axe. */
  axeWatchFollowTime: number;
  /** How fast the banjo fades with distance: 1 = real-world 1/distance,
   *  0 = same loudness everywhere, 2 = drops off hard. Measured from scene 1's
   *  own shot, where it plays at exactly banjoVolume. */
  banjoDistanceRolloff: number;
  /** Most the banjo can grow when the camera is closer than scene 1's shot,
   *  as a multiple of banjoVolume. */
  banjoMaxBoost: number;
  /* --- banjo prop (held by the back-left log bear) -------------------------
   * Offsets in the "Food" socket frame, applied on top of the prop's baseline
   * position/rotation/scale. Lets us nudge the banjo in the paws at runtime
   * without touching the ANIMALS array. */
  banjoPropX: number;
  banjoPropY: number;
  banjoPropZ: number;
  banjoPropRotX: number;
  banjoPropRotY: number;
  banjoPropRotZ: number;
  banjoPropScale: number;
  /** Tempo for the fingers-only banjo picking layer. */
  banjoPickingBpm: number;
  /** Strength of the fingers-only banjo picking layer. */
  banjoPickingAmount: number;
  /** Right wrist pitch layered over the authored banjo hand pose. */
  banjoPickingWristPitch: number;
  /** Right wrist roll layered over the authored banjo hand pose. */
  banjoPickingWristRoll: number;
  /** Left fingers' fret-pressure curl layered over the authored fretting pose. */
  banjoFretFingerAmount: number;
  /** Additive per-bear offset for the banjo bear's glasses (bearId
   *  "back_left_log"). Stacks on top of the shared glasses config so tuning
   *  the shared fit still moves both, but this quartet lets the banjo bear
   *  wear its glasses higher/lower/tilted without dragging the other bears.
   *  Height/nose/tilt are additive; scale is a multiplier. */
  banjoBearGlassesHeight: number;
  banjoBearGlassesNoseRide: number;
  banjoBearGlassesTilt: number;
  banjoBearGlassesScale: number;
  mapleGlassesHeight: number;
  mapleGlassesNoseRide: number;
  mapleGlassesTilt: number;
  mapleGlassesScale: number;
  swooshVolume: number;
  /** How long to wait, in ms, after the panel actually changes before
   *  playing the swoosh - lets it be pushed later so it doesn't land right
   *  on the click. 0 plays immediately. */
  swooshDelayMs: number;
  /** HTMLMediaElement.playbackRate for the swoosh clone. 1 is the file's
   *  native speed; under 1 stretches it slower without changing its volume. */
  swooshRate: number;
  hoverVolume: number;
  clickVolume: number;

  /* --- bear talking (lip-sync + body language) ------------------------------
   * Driven by the shared analyser in src/lib/bearLipSync.ts. Amount knobs are
   * multipliers (1 = the tuned default, 0 = off); the lab's "Bear talking"
   * group has a mic / audio-file test source so these can be dialled in
   * without a live call. */
  /** Max jaw opening while talking, as a fraction of the Blender jawOpen shape (1 = full roar). */
  bearTalkJawMax: number;
  /** Mouth sensitivity - scales the analysed opening before the max clamps it. */
  bearTalkJawGain: number;
  /** "ee / s" lip stretch amount. */
  bearTalkWide: number;
  /** "oo / w" pucker amount. */
  bearTalkRound: number;
  /** Existing jaw sculpt corrective layered under the primary jaw bone. */
  bearTalkJawCorrective: number;
  /** Existing wide/round sculpt corrective contribution layered over lip bones. */
  bearTalkShapeCorrective: number;
  /** How fast the jaw opens / closes (1/s). Higher = snappier. */
  bearTalkOpenSpeed: number;
  bearTalkCloseSpeed: number;
  /** How fast the lip shape (wide/round) follows (1/s). */
  bearTalkShapeSpeed: number;
  /** Head nod on accented syllables. */
  bearTalkNod: number;
  /** Tiny head bob on every syllable. */
  bearTalkBeat: number;
  /** Head lifts with voice pitch (visual prosody). */
  bearTalkPitchHead: number;
  /** Slow head drift while speaking. */
  bearTalkSway: number;
  /** Ear flick on accents. */
  bearTalkEars: number;
  /** Listening bear's nods / backchannels. */
  bearTalkListener: number;
  /** Blink frequency multiplier (0 = never blink). */
  bearBlinkRate: number;
  /** How much the lip bones (upper/lower lip, corners) move for wide/round/open shapes. */
  bearTalkLips: number;
  /** Rest lip seal: lower lip pressed up to the upper lip when quiet (1 = sealed, 0 = model's raw rest). */
  bearMouthRestSeal: number;
  /** Normalized opening where the authored lip seal starts releasing. */
  bearMouthSealStart: number;
  /** Normalized opening where the authored lip seal is fully released. */
  bearMouthSealEnd: number;
  /** Voice bears' gaze: how fully the head turns to its target (the user, or
   *  the other bear during conversation). 0 = no turning, 1 = full turn. */
  bearLookAmount: number;
  /** Seconds (time constant) for a head turn between targets. */
  bearLookTurnTime: number;
  /** World-space vertical offset for the user's gaze target. Negative looks lower. */
  bearLookUserYOffset: number;
  /** Delay before turning toward the other bear after their speech begins. */
  bearLookPartnerDelay: number;
  /** Maple (back-right bear): how much leg idle she keeps (0 = still, 1 = sit_log's full bounce). */
  bearMapleLegAmount: number;
  /** Maple's leg idle speed (1 = sit_log's own). */
  bearMapleLegSpeed: number;
  /** Smokey (back-left, banjo): speed of his leg bounce (1 = as the clip, 0 = stopped). */
  bearSmokeyLegSpeed: number;
  /** Smokey: size of his leg bounce (1 = as the clip, 0 = still, >1 = bigger). */
  bearSmokeyLegAmount: number;
  bearFishLookTurnTime: number;
  bearFishHeadTurnTime: number;
  bearFishImpactDelay: number;
  bearFishFireLookTime: number;
  bearFishMouthHoldTime: number;
  bearFishReturnTime: number;
  bearFishJawAmount: number;
  /** LEFT back bear (Smokey, back-left log): where he looks while the fish
   *  is in the air, as an offset (world units) from the FISH ITSELF - he
   *  follows it. 0,0,0 = eyes on the fish. The right bear has its own
   *  (bearFishFlightLookR*), since they sit on opposite sides of the fire. */
  bearFishFlightLookX: number;
  bearFishFlightLookY: number;
  bearFishFlightLookZ: number;
  /** LEFT back bear: where he stares after it lands, as an offset from the
   *  spot the fish hit the FIRE. 0,0,0 = right at it. */
  bearFishFireLookX: number;
  bearFishFireLookY: number;
  bearFishFireLookZ: number;
  /** RIGHT back bear (Maple, back-right log): the same two aim offsets. */
  bearFishFlightLookRX: number;
  bearFishFlightLookRY: number;
  bearFishFlightLookRZ: number;
  bearFishFireLookRX: number;
  bearFishFireLookRY: number;
  bearFishFireLookRZ: number;
  /** Seconds (time constant) for their gaze to catch up with the flying fish. */
  bearFishFlightTurnTime: number;
  /** Seconds (time constant) for each later turn: to the fire, to each other,
   *  back to you. */
  bearFishFireTurnTime: number;
  /** Furthest their heads will turn during the fish gag, degrees. */
  bearFishMaxTurn: number;
  bearFishIdleGazeYOffset: number;
  bearFishIdleLookTime: number;
  bearFishIdleInterval: number;
  /** Seconds for Maple's gaze to get to her fish. */
  bearFishIdleTurnTime: number;
  /** Seconds for her slow, eased look back up from the fish. */
  bearFishIdleReturnTime: number;
  /** 1 = Smokey glances down at his fret hand now and then (checking chords). */
  bearFretLookOn: number;
  /** Seconds each fret glance lasts (varied +/-30%). */
  bearFretLookTime: number;
  /** Average seconds between fret glances (varied). */
  bearFretLookInterval: number;
  /** 0..1 chance a glance is followed by a quick second peek. */
  bearFretDoubleChance: number;
  /** Seconds for his gaze to get down to the frets. */
  bearFretTurnTime: number;
  /** Seconds for the slow, eased look back up from the frets. */
  bearFretReturnTime: number;
  /** 0..1 how fully the head aims at the fret hand. */
  bearFretLookAmount: number;
  /** Degrees the neck may turn for a fret glance. */
  bearFretMaxTurn: number;
  /** World nudge of the look point from his fret fingers. */
  bearFretLookX: number;
  bearFretLookY: number;
  bearFretLookZ: number;
  /** Extra downward peer (radians, - = up). */
  bearFretNod: number;
  /** Head cock while looking (radians, - = other way). */
  bearFretTilt: number;

  objectOverrides: Record<string, ObjectOverride>;
  /**
   * Extra instances of scene props (captured GLB nodes) authored in the lab.
   * Keyed by a generated id ("dup:<n>"). Each entry references a `source` name
   * (an existing node in the GLB - tree, campItem, bonfire) and carries its
   * own dx/dy/dz/rotX/rotY/rotZ/scale on top of the source's own base
   * transform. Duplicates render as sibling clones of the source; they are
   * clickable and get edited through the same panel as overrides.
   */
  objectDuplicates: Record<string, ObjectDuplicate>;
  /**
   * Names flagged as locked. A locked object is skipped by the raycaster - all
   * of its descendant meshes get their `raycast` method noop'd - so pointer
   * events pass THROUGH it to whatever is behind. Editors use this to stop
   * accidental clicks on a foreground bear while placing something behind it.
   * Persisted so a "the tent stays locked" preference survives a reload.
   */
  lockedObjects: Record<string, boolean>;
}

export interface ObjectDuplicate {
  source: string;
  dx: number;
  dy: number;
  dz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
  /** 1 = this duplicate stops casting shadows. Same semantics as the noShadow
   *  flag on ObjectOverride; ShadowLayer honours both. Optional so existing
   *  duplicates saved before this field existed still typecheck. */
  noShadow?: number;
}

export const EMPTY_DUPLICATE: Omit<ObjectDuplicate, "source"> = {
  dx: 0,
  dy: 0,
  dz: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
};

export const DUPLICATE_PREFIX = "dup:";

/** One location's camera, in that location's own frame. */
export interface LocationView {
  cx: number;
  cy: number;
  cz: number;
  tx: number;
  ty: number;
  tz: number;
}

export const LOCATION_VIEW_FIELDS = ["cx", "cy", "cz", "tx", "ty", "tz"] as const;

/**
 * The built-in shot for a location: its own default if it has one, otherwise the
 * shared ring baseline. Per-index, so "Reset this one" gives a location the framing
 * that was actually authored for it rather than a generic distance.
 */
export function defaultLocationView(
  index: number,
  config: {
    locationCameraBack: number;
    locationCameraHeight: number;
    locationTargetHeight: number;
  }
): LocationView {
  const authored = BASE_CAMPFIRE_CONFIG.locationViews[index];
  if (authored) return { ...authored };
  return {
    cx: 0,
    cy: config.locationCameraHeight,
    cz: config.locationCameraBack,
    tx: 0,
    ty: config.locationTargetHeight,
    tz: 0,
  };
}

export interface ObjectOverride {
  dx: number;
  dy: number;
  dz: number;
  /** pitch, radians. Tips an object forward/back - use it to sit things flat on uneven ground. */
  rotX: number;
  rotY: number;
  /** roll, radians. Leans an object left/right. */
  rotZ: number;
  scale: number;
  hide: number;
  /** 1 = descendants of this object stop casting shadows. Handy for the fire,
   *  flame overlays, glow discs, or anything that would otherwise render a
   *  fake dark blob into the shadow map. Optional so existing overrides
   *  saved before this field existed still typecheck; missing = casts. */
  noShadow?: number;
}

export const EMPTY_OVERRIDE: ObjectOverride = {
  dx: 0,
  dy: 0,
  dz: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
  hide: 0,
  noShadow: 0,
};

export interface OceanFloorSceneConfig {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fov: number;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  beamIntensity: number;
  beamOpacity: number;
  particleOpacity: number;
  causticsOpacity: number;
  mainLightX: number;
  mainLightY: number;
  mainLightZ: number;
  mainLightReach: number;
  mainLightAngle: number;
  sideLightX: number;
  sideLightY: number;
  sideLightZ: number;
  sideLightReach: number;
  sideLightAngle: number;
  beamTargetX: number;
  beamTargetY: number;
  beamTargetZ: number;
  beamWidth: number;
  beamLength: number;
}

/**
 * The built-in defaults, written by hand. This is the floor the scene falls back to
 * and what "Reset sliders" returns you to - it is never overwritten by tuning.
 */
/**
 * Per-swarm bug controls.
 *
 * The deskBug* block is ONE swarm design - count, orbit, lunge, flicker, the
 * lot - and every lamp wearing a swarm used to get it verbatim, identical
 * bug for identical bug. That is wrong in two ways at once: a hooded lantern
 * on a signpost and a pair of van headlights are different sizes and want
 * different swarms, and two swarms built from the same seed are literally the
 * same arrangement of insects twice, which reads as a copy-paste the moment
 * both are on screen.
 *
 * So each site gets a block of its own, on top of the shared design rather
 * than instead of it:
 *
 *  - the Mul knobs MULTIPLY the shared value, so 1 is "as designed" and the
 *    global sliders still move every swarm together. That is what keeps one
 *    design language across the camp while letting a fixture deviate.
 *  - Off X/Y/Z are absolute world units, ADDED to the shared offset, because
 *    where a swarm hangs relative to its bulb is a property of the fixture,
 *    not of the design.
 *  - Seed shifts who is who at this site only. Anything non-zero decorrelates
 *    it from the other swarms; it does not change the swarm's shape.
 */
export const BUG_SWARM_SCOPES = [
  "deskLampVanHeads",
  "deskLampSmallA",
  "deskLampSmallB",
  "deskLampHood",
  "arcadeCabinLamp",
] as const;
export type BugSwarmScope = (typeof BUG_SWARM_SCOPES)[number];

export const BUG_SWARM_TWEAK_DEFAULTS = {
  BugCountMul: 1,
  BugRadiusMul: 1,
  BugSpreadMul: 1,
  BugHeightMul: 1,
  BugSizeMul: 1,
  BugSpeedMul: 1,
  BugOpacityMul: 1,
  BugSeedShift: 0,
  BugOffX: 0,
  BugOffY: 0,
  BugOffZ: 0,
} as const;
export type BugSwarmTweak = keyof typeof BUG_SWARM_TWEAK_DEFAULTS;
/** `deskLampHoodBugRadiusMul` and its 54 siblings, spelled out by the compiler
 *  rather than by hand - the whole grid is scope x knob, and writing it out
 *  invites exactly one typo that no test would catch. */
export type BugSwarmTweaks = { [S in BugSwarmScope as `${S}${BugSwarmTweak}`]: number };

const BUG_SWARM_TWEAK_BASE = ((): BugSwarmTweaks => {
  const out: Record<string, number> = {};
  for (const scope of BUG_SWARM_SCOPES) {
    for (const [knob, value] of Object.entries(BUG_SWARM_TWEAK_DEFAULTS)) {
      out[`${scope}${knob}`] = value;
    }
  }
  return out as BugSwarmTweaks;
})();

export const BASE_CAMPFIRE_CONFIG: CampfireSceneConfig = {
  ...BUG_SWARM_TWEAK_BASE,
  // Free-look camera for the lab. Now that the middle is empty, this opens on the
  // campfire - location 0, out at -Z - with the same framing the panelled site
  // gives it, rather than staring at the hole in the centre.
  cameraX: 0,
  cameraY: 1.6,
  cameraZ: -3,
  targetX: 0,
  targetY: 0.9,
  targetZ: -9,
  fov: 50,
  fogNear: 8,
  fogFar: 40,
  fogPullbackMul: 4,
  fogPullbackEase: 2.5,
  ambientIntensity: 0.085,
  moonIntensity: 0.35,
  fireIntensity: 3.1,
  skyBrightness: 1.0,
  starBrightness: 3.2,
  starCount: 650,
  // Cool blue-white to read as a lit LCD by default. Brightness 1 = subtle
  // (screen visible but not glare); crank to make the laptop pop.
  laptopScreenColorR: 0.49,
  laptopScreenColorG: 0.78,
  laptopScreenColorB: 1.0,
  laptopScreenBrightness: 1.0,
  // Shadows default: moon casts a soft directional shadow tuned for the
  // campsite ring (~30u across). Fire point-light shadows are OFF by default
  // because six cubemap renders per frame is a real perf hit.
  // Shadows: FIRE is the primary caster. It's the diegetic light source (bears
  // sit around it, tossing shadows outward onto benches and the ground), so
  // that reads better than a moon casting the whole scene down. Moon shadows
  // OFF by default; flip via the Shadows panel if you want them.
  shadowsEnabled: 1,
  moonX: -4,
  moonY: 7,
  moonZ: -6,
  fireCastShadow: 1,
  fireShadowMapSize: 1024,
  warmShadowMapSize: 2048,
  maxPixelRatio: 2,
  maxPixelRatioMobile: 1.5,
  antialias: 1,
  antialiasMobile: 0,
  fireShadowBias: -0.003,
  fireShadowNormalBias: 0.04,
  fireShadowIntensity: 1,
  // Mossy campsite green - the original #2a1c31 dark-purple is now a "green"
  // preset the user asked to try. Tune per-channel in the lab.
  groundColorR: 0.13,
  groundColorG: 0.24,
  groundColorB: 0.13,
  // --- 1 - trodden ground patches (polygons, like camping.glb's Object_222)
  groundPatchOn: 1,
  groundPatchSeed: 7,
  groundPatchOffsetX: 0,
  groundPatchOffsetZ: 0,
  cabinGroundPatchOn: 1,
  cabinGroundPatchOffsetX: 0,
  cabinGroundPatchOffsetZ: 0,
  groundPatchOuterRadius: 6.4,
  groundPatchOuterOffsetX: 0,
  groundPatchOuterOffsetZ: 0,
  groundPatchOuterJag: 0.34,
  groundPatchOuterSides: 22,
  groundPatchOuterSpin: 0.4,
  groundPatchOuterRound: 0.85,
  groundPatchOuterR: 0.135,
  groundPatchOuterG: 0.118,
  groundPatchOuterB: 0.088,
  groundPatchOuterY: 0.006,
  groundPatchOuterOpacity: 1,
  groundPatchInnerRadius: 3.3,
  groundPatchInnerOffsetX: 0,
  groundPatchInnerOffsetZ: 0,
  groundPatchInnerJag: 0.38,
  groundPatchInnerSides: 11,
  groundPatchInnerSpin: 1.1,
  groundPatchInnerRound: 0.15,
  groundPatchInnerR: 0.235,
  groundPatchInnerG: 0.196,
  groundPatchInnerB: 0.138,
  groundPatchInnerY: 0.012,
  groundPatchInnerOpacity: 1,
  deskLanternIntensity: 2.4,
  deskLanternDistance: 4,
  deskLanternColorR: 1.0,
  deskLanternColorG: 0.7,
  deskLanternColorB: 0.35,
  deskLanternLightX: 0,
  deskLanternLightY: 0.25,
  deskLanternLightZ: 0,
  deskComputerIntensity: 0.9,
  deskComputerDistance: 2.2,
  deskComputerColorR: 0.55,
  deskComputerColorG: 0.75,
  deskComputerColorB: 1.0,
  // Screen-face offset: computer is rotated 180 deg around Y (baseRotationY =
  // Math.PI), so a positive local Z ends up on world -Z. Dial these until the
  // glow spills off the monitor face and onto the desk in front of the bear.
  deskComputerScreenOn: 1,
  deskComputerScreenBrightness: 1.6,
  deskComputerScreenR: 0.55,
  deskComputerScreenG: 0.75,
  deskComputerScreenB: 1,
  deskComputerLightX: 0,
  deskComputerLightY: 0.35,
  deskComputerLightZ: 0.2,
  deskComputerLightOn: 1,
  deskComputerAngle: 77,
  deskComputerPenumbra: 0.7,
  deskComputerAimY: 0,
  deskComputerAimYawDeg: 0,
  deskComputerAimPitchDeg: 0,
  deskComputerShadow: 0,
  deskComputerGlassBrightness: 1,
  // Warm desk fill - hemisphere sky/ground tint, kept low so the lanterns and
  // computer still carry most of the light. Slightly amber sky, cool ground.
  deskCampGroundMaxY: 4.0,
  deskWaterHeight: 0,
  deskWaterOpacity: 0.72,
  // --- 3 - the bar light over the string-light run (see the interface
  // block for why Width/Height are world units and X/Y/Z are camp units).
  deskStringLightOn: 1,
  deskStringLightShow: 1,
  deskStringLightIntensity: 3,
  deskStringLightWidth: 1.6,
  deskStringLightHeight: 0.12,
  deskStringLightX: 1.52,
  deskStringLightY: 4.4,
  deskStringLightZ: -1.17,
  deskStringLightRotX: -1.5708,
  deskStringLightRotY: 0.783,
  deskStringLightRotZ: 0,
  deskStringLightColorR: 1,
  deskStringLightColorG: 0.86,
  deskStringLightColorB: 0.66,
  // --- 3 - the string bulbs' own look (the bar above is what they cast)
  deskStringBulbBrightness: 1,
  deskStringBulbWarmth: 1,
  deskStringBulbOpacity: 1,
  deskStringBulbBloom: 0.85,
  deskStringBulbBloomSize: 0.09,
  deskStringBulbBloomOffsetY: 0,
  // Shoal · milling under the dock
  deskFishAOn: 1,
  deskFishACount: 12,
  deskFishAX: 11.1,
  deskFishAY: 0.38,
  deskFishAZ: 7.3,
  deskFishARadiusX: 1.0,
  deskFishARadiusZ: 1.3,
  deskFishARotate: 0,
  deskFishATwist: 1,
  deskFishAScatter: 0.35,
  deskFishASpeed: 0.5,
  deskFishAScale: 0.09,
  deskFishABob: 0.04,
  deskFishAEight: 1,
  deskFishAWander: 0.7,
  deskFishADepthSpread: 0.18,
  deskFishABank: 0.5,
  deskFishAYawOffset: 0,
  // Loop · long lap past the lantern
  deskFishBOn: 1,
  deskFishBCount: 6,
  deskFishBX: 10.6,
  deskFishBY: 0.34,
  deskFishBZ: 8.0,
  deskFishBRadiusX: 3.2,
  deskFishBRadiusZ: 1.8,
  deskFishBRotate: 2.64,
  deskFishBTwist: 0,
  deskFishBScatter: 0,
  deskFishBSpeed: 0.32,
  deskFishBScale: 0.11,
  deskFishBBob: 0.03,
  deskFishBEight: 0,
  deskFishBWander: 0.2,
  deskFishBDepthSpread: 0.12,
  deskFishBBank: 0.7,
  deskFishBYawOffset: 0,
  // Spare shoal (off by default)
  deskFishCOn: 0,
  deskFishCCount: 0,
  deskFishCX: 11.1,
  deskFishCY: 0.38,
  deskFishCZ: 7.3,
  deskFishCRadiusX: 1.0,
  deskFishCRadiusZ: 1.3,
  deskFishCRotate: 0,
  deskFishCTwist: 1,
  deskFishCScatter: 0.35,
  deskFishCSpeed: 0.5,
  deskFishCScale: 0.09,
  deskFishCBob: 0.04,
  deskFishCEight: 1,
  deskFishCWander: 0.7,
  deskFishCDepthSpread: 0.18,
  deskFishCBank: 0.5,
  deskFishCYawOffset: 0,
  deskFishWiggle: 1,
  deskFishWaves: 0.75,
  deskFishTurnBend: 0.35,
  deskFishBeat: 1.2,
  deskFishSway: 0.08,
  deskFishDark: 0.8,
  deskFishShade: 0.85,
  deskFishShadeFade: 0.35,
  deskFishShadeSoft: 0.35,
  deskCampLampEnabled: 1,
  deskBugSeed: 45253,
  deskBugSpeedVary: 0.9,
  deskBugTwoWay: 0.5,
  deskBugTilt: 0.7,
  deskBugLungeRate: 0.43,
  deskBugFlickerRate: 16,
  deskBugLungeSharp: 8,
  deskBugLungeDepth: 0.8,
  deskBugJitterSpeed: 1,
  // Flat by default now - both were the source of the swarm's brightness
  // pulsing; dial either back up if the flicker/flare look is wanted again.
  deskBugFlickerDepth: 0,
  deskBugLungeFlare: 0,
  deskBugDrift: 0,
  deskBugAdditive: 1,
  deskBugSizeVary: 0,
  deskBugHeightBias: 1,
  deskBugRadiusBias: 1,
  deskBugOval: 1,
  deskBugRotY: 0,
  deskBugWobbleY: 0,
  deskBugOffsetX: 0,
  deskBugOffsetY: 0,
  deskBugOffsetZ: 0,
  deskBugCount: 26,
  deskBugRadius: 0.073,
  deskBugSpread: 0.65,
  deskBugHeight: 0.052,
  deskBugSpeed: 1,
  deskBugJitter: 0.35,
  deskBugDive: 0.55,
  deskBugSize: 0.006,
  deskBugOpacity: 0.9,
  deskBugR: 1,
  deskBugG: 0.88,
  deskBugB: 0.6,
  deskShadowMapSize: 512,
  deskShadowBias: -0.0015,
  deskShadowRadius: 3,
  deskShadowNear: 0.01,
  deskShadowFar: 2,
  // --- 3 - Desk camp lamps, per fixture. Seeded from the single shared
  // block these replaced (0.2 / 4.5 / 2 / warm white), so nothing changes
  // on load except the two bollard posts, which the old material-based
  // filter could not see and which were dark until now.
  // Camper van headlights (one block drives both bulbs)
  deskLampVanHeadsOn: 1,
  deskLampVanHeadsIntensity: 6.5,
  deskLampVanHeadsReach: 9,
  deskLampVanHeadsDecay: 2,
  deskLampVanHeadsR: 1,
  deskLampVanHeadsG: 0.72,
  deskLampVanHeadsB: 0.35,
  deskLampVanHeadsEmissive: 4.01,
  deskLampVanHeadsShadow: 0,
  deskLampVanHeadsBugs: 0,
  deskLampVanHeadsOffX: 0,
  deskLampVanHeadsOffY: 0,
  deskLampVanHeadsOffZ: 0,
  deskLampVanHeadsBeam: 1,
  deskLampVanHeadsBeamAngle: 0.22,
  deskLampVanHeadsBeamPenumbra: 0.4,
  deskLampVanHeadsBeamPush: 0.7,
  deskLampVanHeadsBeamTilt: -0.28,
  deskLampVanHeadsLightX: 0,
  deskLampVanHeadsLightY: 0,
  deskLampVanHeadsLightZ: 0,
  // Small lamp · near the fire pit
  deskLampSmallAOn: 1,
  deskLampSmallAIntensity: 0.2,
  deskLampSmallAReach: 4.5,
  deskLampSmallADecay: 2,
  deskLampSmallAR: 1,
  deskLampSmallAG: 0.72,
  deskLampSmallAB: 0.35,
  deskLampSmallAEmissive: 3.8,
  deskLampSmallAShadow: 0,
  deskLampSmallABugs: 0,
  deskLampSmallALightX: 0,
  deskLampSmallALightY: 0,
  deskLampSmallALightZ: 0,
  deskLampSmallAOffX: 0,
  deskLampSmallAOffY: 0,
  deskLampSmallAOffZ: 0,
  // Small lamp · far side of camp
  deskLampSmallBOn: 1,
  deskLampSmallBIntensity: 1.4,
  deskLampSmallBReach: 5.0,
  deskLampSmallBDecay: 2,
  deskLampSmallBR: 1,
  deskLampSmallBG: 0.72,
  deskLampSmallBB: 0.35,
  deskLampSmallBEmissive: 3.8,
  deskLampSmallBShadow: 1,
  deskLampSmallBBugs: 0,
  deskLampSmallBLightX: 0,
  deskLampSmallBLightY: 0,
  deskLampSmallBLightZ: 0,
  deskLampSmallBOffX: -1.34,
  deskLampSmallBOffY: 0,
  deskLampSmallBOffZ: 0,
  // Hooded lantern · on the signpost
  deskLampHoodOn: 0,
  deskLampHoodIntensity: 2.5,
  deskLampHoodReach: 3,
  deskLampHoodDecay: 2,
  deskLampHoodR: 1,
  deskLampHoodG: 0.72,
  deskLampHoodB: 0.35,
  deskLampHoodEmissive: 4.0,
  deskLampHoodShadow: 0,
  deskLampHoodBugs: 1,
  deskLampHoodLightX: 0,
  deskLampHoodLightY: 0,
  deskLampHoodLightZ: 0,
  deskLampHoodOffX: 0,
  deskLampHoodOffY: 0,
  deskLampHoodOffZ: 0,
  deskAmbientIntensity: 0.4,
  deskAmbientColorR: 1.0,
  deskAmbientColorG: 0.55,
  deskAmbientColorB: 0.25,
  // Candle flame default placement: mid-lantern height, no X/Z offset,
  // slightly larger than the raw CandleFlame default so it reads from a bit
  // further away.
  deskLanternFlameX: 0,
  deskLanternFlameY: 0.25,
  deskLanternFlameZ: 0,
  deskLanternFlameScale: 1.2,
  deskLanternFlameSpeed: 1.0,
  deskLanternFlameSway: 0.06,
  deskLanternFlamePulse: 1.0,
  deskLanternFlameBrightness: 1.6,
  // Campfire base orange (#ff6b1a) as a starting flame tint. Independent
  // from the lantern R/G/B so the pane color and the actual flame stay
  // separately tunable.
  deskLanternFlameColorR: 1.0,
  deskLanternFlameColorG: 0.42,
  deskLanternFlameColorB: 0.1,
  deskCaravanWindowIntensity: 3.2,
  // Default warm-amber pane, same hex the previous hard-coded emissive used
  // (#ffb752) so tuned scenes read the same after this expansion.
  deskCaravanWindowColorR: 1.0,
  deskCaravanWindowColorG: 0.72,
  deskCaravanWindowColorB: 0.32,
  deskCaravanWindowLightX: 0,
  deskCaravanWindowLightY: 20,
  deskCaravanWindowLightZ: 0,
  deskCaravanWindowLightIntensity: 12,
  deskCaravanWindowLightDistance: 90,
  deskCaravanWindowLightDecay: 1.6,
  campingLampIntensity: 6,
  campingLampDistance: 12,
  campingLampDecay: 1.8,
  campingLampColorR: 1.0,
  campingLampColorG: 0.55,
  campingLampColorB: 0.2,
  arcadeCampfireX: -2.6,
  arcadeCampfireY: 0,
  arcadeCampfireZ: 1.6,
  arcadeCampfireRotationY: 0,
  arcadeCampfireScale: 1,
  truckTailgateX: 0,
  truckTailgateY: 0,
  truckTailgateZ: 0,
  truckTailgateRotX: 0,
  truckTailgateRotY: 0,
  truckTailgateRotZ: 0,
  truckTailgateScaleX: 1,
  truckTailgateScaleY: 1,
  truckTailgateScaleZ: 1,
  truckPlateScaleX: 1,
  truckPlateScaleY: 1,
  truckHeadLampW: 0.325,
  truckHeadLampH: 0.13,
  truckHeadLampRadius: 0.35,
  truckHeadLampDepth: 0.05,
  truckHeadLampSpanX: 0.7,
  truckHeadLampY: 0.645,
  truckHeadLampZ: 2.288,
  truckHeadLampRotX: 0.0,
  truckHeadLampRotY: 0.0,
  truckHeadLampRotZ: 0.0,
  truckHeadLampBezelPad: 0.022,
  truckHeadLampBezelDepth: 0.05,
  truckHeadLampProud: 0.016,
  truckHeadLampColorR: 1.0,
  truckHeadLampColorG: 0.9,
  truckHeadLampColorB: 0.62,
  truckHeadLampEmissive: 4.0,
  truckHeadLampHide: 0,
  truckTailLampW: 0.115,
  truckTailLampH: 0.21,
  truckTailLampRadius: 1.0,
  truckTailLampDepth: 0.05,
  truckTailLampSpanX: 0.755,
  truckTailLampY: 1.01,
  truckTailLampZ: -2.381,
  truckTailLampRotX: 0.0,
  truckTailLampRotY: 0.0,
  truckTailLampRotZ: 0.0,
  truckTailLampBezelPad: 0.022,
  truckTailLampBezelDepth: 0.05,
  truckTailLampProud: 0.016,
  truckTailLampColorR: 0.9,
  truckTailLampColorG: 0.02,
  truckTailLampColorB: 0.01,
  truckTailLampEmissive: 3.6,
  truckTailLampHide: 0,
  truckHeadLightX: 0.62,
  truckHeadLightY: 0.96,
  truckHeadLightZ: 2.6,
  truckHeadLightAimX: 0.0,
  truckHeadLightAimY: 0.0,
  truckHeadLightAimZ: 7.4,
  truckHeadLightIntensity: 5.2,
  truckHeadLightDistance: 12.0,
  truckHeadLightDecay: 1.6,
  truckHeadLightAngle: 0.6,
  truckHeadLightPenumbra: 0.55,
  truckHeadLightColorR: 1.0,
  truckHeadLightColorG: 0.92,
  truckHeadLightColorB: 0.64,
  truckHeadLightFlicker: 1.0,
  truckTailLightX: 0.0,
  truckTailLightY: 1.0,
  truckTailLightZ: -2.55,
  truckTailLightIntensity: 2.8,
  truckTailLightDistance: 4.2,
  truckTailLightDecay: 1.8,
  truckTailLightColorR: 1.0,
  truckTailLightColorG: 0.023,
  truckTailLightColorB: 0.012,
  // Non-zero default so walls appear the moment the editor opens without the
  // user having to hunt for the on/off switch. Set to 0 in campfireScene.json
  // to hide the extension in the arcade scene.
  truckBedWallHeight: 0.35,
  truckBedWallThickness: 0.04,
  // Matches the yellow truck body (~ #D9994A).
  truckBedWallColorR: 0.85,
  truckBedWallColorG: 0.6,
  truckBedWallColorB: 0.29,
  arcadeFireIntensity: 3.1,
  arcadeFireDecay: 2,
  arcadeFlickerAmount: 1,
  arcadeFireLightX: 0,
  arcadeFireLightY: 0.35,
  arcadeFireLightZ: 0,
  arcadeFireLightReach: 8,
  arcadeFireLightColorR: 1.0,
  arcadeFireLightColorG: 0.47,
  arcadeFireLightColorB: 0.12,
  arcadeFarGlowIntensity: 1.2,
  arcadeFarGlowReach: 22,
  arcadeFarGlowDecay: 1.2,
  arcadeFlameX: 0,
  arcadeFlameY: 0.2,
  arcadeFlameZ: 0,
  arcadeFlameScale: 1,
  arcadeFlameOuterScale: 1,
  arcadeFlameInnerScale: 1,
  arcadeFlameHaloScale: 1,
  arcadeGlowOpacity: 0.24,
  arcadeGlowY: 0.035,
  arcadeGlowScale: 1,
  arcadeSparkOpacity: 0.75,
  arcadeSparkCount: 160,
  arcadeSparkSpread: 0.5,
  arcadeSparkMaxHeight: 2,
  arcadeSparkSpeed: 1.5,
  arcadeSparkSway: 0.35,
  arcadeSparkBurstChance: 0.12,
  arcadeSparkSize: 0.045,
  arcadeSparkLifetime: 1.6,
  arcadeCabinLampX: 16.05,
  arcadeCabinLampY: 33.04,
  arcadeCabinLampZ: 47.62,
  arcadeCabinLampIntensity: 2.4,
  arcadeCabinLampDistance: 2.6,
  arcadeCabinLampDecay: 1.8,
  arcadeCabinLampColorR: 1.0,
  arcadeCabinLampColorG: 0.87,
  arcadeCabinLampColorB: 0.55,
  arcadeCabinLampEmissive: 3.5,
  // Off by default, so the cabin looks exactly as it did until you turn it on.
  arcadeCabinLampDirectional: 0,
  arcadeCabinLampYawDeg: 0,
  arcadeCabinLampPitchDeg: -90,
  arcadeCabinLampConeDeg: 45,
  arcadeCabinLampPenumbra: 0.5,
  arcadeCabinLampBugs: 1,
  cabinSetX: -7.21,
  cabinSetY: 0,
  cabinSetZ: -10.15,
  arcadeFireDim: 1,
  arcadeSetX: 0.55,
  arcadeSetY: 0.37,
  arcadeSetZ: 2.6,
  crtFocusBack: 1.35,
  crtFocusHeight: 0,
  pcFocusBack: 1.43,
  pcFocusHeight: 0,
  pcSoundVolume: 0.8,
  pcRevealBack: 8,
  pcRevealHeight: 1.7,
  pcRevealAimUp: 0.9,
  oldBearGrey: 0.55,
  oldBearBrightness: 0.85,
  oldBearFaceLight: 0.35,
  oldBearWarmth: 0.25,
  oldBearGlassesShow: 1,
  oldBearGlassesScale: 1,
  oldBearGlassesUp: 0,
  oldBearGlassesFwd: 0,
  oldBearBrowShow: 1,
  oldBearBrowScale: 1,
  oldBearBeardStyle: 0,
  oldBearBeardShow: 1,
  oldBearBeardScale: 1,
  oldBearBeardLength: 1,
  oldBearBeardWidth: 1,
  oldBearCoatR: 0.711,
  oldBearCoatG: 0.701,
  oldBearCoatB: 0.689,
  oldBearHairR: 0.906,
  oldBearHairG: 0.901,
  oldBearHairB: 0.886,
  oldBearLensCloud: 0,
  onlyBearsSpeed: 1,
  onlyBearsPawScale: 1,
  onlyBearsScale: 1,
  onlyBearsX: 0,
  onlyBearsY: 0,
  onlyBearsZ: 0,
  onlyBearsLean: 0,
  onlyBearsLook: 0.85,
  onlyBearsBreath: 0.3,
  onlyBearsSnap: 0,
  onlyBearsImpact: 0,
  arcadeCrtGlow: 1,
  arcadeCrtLightR: 0.475,
  arcadeCrtLightG: 0.776,
  arcadeCrtLightB: 0.941,
  arcadeCrtLightForwardOffset: 0.35,
  arcadeCrtLightAngle: Math.PI / 3,
  arcadeCrtLightPenumbra: 0.5,
  arcadeCrtLightDistance: 3.4,
  arcadeCrtLightDecay: 2,
  arcadeCrtLightIntensity: 1,
  arcadeCrtShadow: 1,
  arcadeCrtLightOffsetX: 0,
  arcadeCrtLightOffsetY: 0,
  fireDecay: 2,
  flickerAmount: 1,
  glowColorR: 1.0,
  glowColorG: 0.194,
  glowColorB: 0.014,
  glowWidth: 9.0,
  glowLength: 6.3,
  glowRotY: 0.0,
  glowFalloff: 1.4,
  glowFlicker: 1.0,
  glowBreathe: 1.0,
  glowOffsetX: 0.0,
  glowOffsetZ: 0.0,
  arcadeGlowColorR: 1.0,
  arcadeGlowColorG: 0.194,
  arcadeGlowColorB: 0.014,
  arcadeGlowWidth: 9.0,
  arcadeGlowLength: 6.3,
  arcadeGlowRotY: 0.0,
  arcadeGlowFalloff: 1.4,
  arcadeGlowFlicker: 1.0,
  arcadeGlowBreathe: 1.0,
  arcadeGlowOffsetX: 0.0,
  arcadeGlowOffsetZ: 0.0,
  // --- 3 - Desk sector campfire (replaces the blob baked into camping.glb).
  // Camp-local placement, straight off the GLB: the pit is at x 4.25, z -0.07.
  // Y is 1.12 because that is where the ground actually is - raycast straight
  // down onto the diorama's surface meshes, which hit "Object_222" (the dirt
  // layer) at 1.117. The 1.41 the terrain bounding pass reported was a raised
  // vertex just off to the side, and trusting it floated the whole fire.
  // Scale 0.85 because the diorama's stone ring measured ~1.6 across and the
  // bonfire pile out of campfire_scene.glb is ~1.85.
  deskCampfireX: 4.25,
  deskCampfireY: 1.12,
  deskCampfireZ: -0.07,
  deskCampfireRotationY: 0,
  deskCampfireScale: 0.85,
  deskCampfirePileVisible: 1,
  deskFlameX: 0,
  deskFlameY: 0.2,
  deskFlameZ: 0,
  deskFlameScale: 1,
  deskFlameOuterScale: 1,
  deskFlameInnerScale: 1,
  deskFlameHaloScale: 1,
  deskFireIntensity: 3.1,
  deskFireDecay: 2,
  deskFlickerAmount: 1,
  deskFireLightX: 0,
  deskFireLightY: 0.35,
  deskFireLightZ: 0,
  deskFireLightReach: 3,
  deskFireLightColorR: 1.0,
  deskFireLightColorG: 0.47,
  deskFireLightColorB: 0.12,
  deskFarGlowIntensity: 1.2,
  deskFarGlowReach: 7,
  deskFarGlowDecay: 1.2,
  deskGlowOpacity: 0.24,
  deskGlowY: 0.15,
  deskGlowScale: 1,
  deskGlowColorR: 1.0,
  deskGlowColorG: 0.194,
  deskGlowColorB: 0.014,
  deskGlowWidth: 2.2,
  deskGlowLength: 1.8,
  deskGlowRotY: 0.0,
  deskGlowFalloff: 1.4,
  deskGlowFlicker: 1.0,
  deskGlowBreathe: 1.0,
  deskGlowOffsetX: 0.0,
  deskGlowOffsetZ: 0.0,
  deskSparkOpacity: 0.75,
  deskSparkCount: 160,
  deskSparkSpread: 0.5,
  deskSparkMaxHeight: 2,
  deskSparkSpeed: 1.5,
  deskSparkSway: 0.35,
  deskSparkBurstChance: 0.12,
  deskSparkSize: 0.045,
  deskSparkLifetime: 1.6,
  glowOpacity: 0.24,
  glowY: 0.035,
  glowScale: 1,
  sparkOpacity: 0.75,
  sparkCount: 160,
  sparkSpread: 0.5,
  sparkMaxHeight: 2,
  sparkSpeed: 1.5,
  sparkSway: 0.35,
  sparkBurstChance: 0.12,
  sparkSize: 0.045,
  sparkLifetime: 1.6,
  fireClickBurstOn: 1,
  fireBurstY: 0.35,
  fireBurstCount: 150,
  fireBurstSpeed: 2.0,
  fireBurstSpread: 0.75,
  fireBurstLifetime: 1.5,
  fireBurstSize: 0.026,
  fireBurstOpacity: 2.4,
  fireFlashIntensity: 2.4,
  fireFlashDuration: 0.45,
  fireFlashReach: 4.5,
  fireLightX: 0,
  fireLightY: 0.35,
  fireLightZ: 0,
  fireLightReach: 8,
  farGlowIntensity: 1.2,
  farGlowReach: 22,
  farGlowDecay: 1.2,
  warmLightX: 1.6,
  warmLightY: 2.7,
  warmLightZ: 2.1,
  warmLightReach: 7.5,
  warmLightAngle: 0.9,
  sceneScale: 1,
  sceneX: 0,
  sceneY: 0,
  sceneZ: 0,
  sceneRotationY: 0,
  flameX: 0,
  flameY: 0.2,
  flameZ: 0,
  flameScale: 1,
  flameOuterScale: 1,
  flameInnerScale: 1,
  flameHaloScale: 1,
  benchRadius: 2.4,
  benchScale: 1,
  benchAngleOffset: Math.PI / 2,
  treeScale: 1,
  treeY: 0,
  treeSpread: 1,
  treeCloseRadius: 4.2,
  forestEnabled: 1,
  pathVisible: 1,
  pathWidth: 0.6,
  pathCorridorHalfWidth: 2.2,
  forestTreeHeight: 1.6,
  forestTreeCount: 320,
  forestClearRadius: 6,
  forestOuterRadius: 55,
  forestCastShadow: 0,
  pathFlankSpacing: 2.5,
  animalScale: 1,
  animalY: 0,
  animalX: 0,
  animalZ: 0,
  animalSpread: 1,
  bonfireX: 0,
  bonfireY: 0,
  bonfireZ: 0,
  bonfireRotationY: 0,
  bonfireScale: 1,
  tentX: 0,
  tentY: 0,
  tentZ: 0,
  tentRotationY: 0,
  tentScale: 1,
  campItemsScale: 1,
  campItemsSpread: 1,
  campItemsY: 0,
  fishX: 1.2,
  fishY: 0.02,
  fishZ: 1.4,
  fishRotationX: 0,
  // Rotate around the model's forward axis to tip it onto its side.
  fishRotationY: 0,
  fishRotationZ: Math.PI / 2,
  fishScale: 0.09,
  fishFlopSpeed: 5.5,
  fishLaunchOn: 1,
  fishLaunchDuration: 0.85,
  fishLaunchArc: 0.9,
  fishLaunchSpin: 2.5,
  fishLaunchTargetY: 0.5,
  fishLaunchFlail: 2.2,
  fishRespawnDelay: 0,
  fishReturnOn: 1,
  fishReturnDuration: 1.5,
  fishReturnArc: 0.45,
  fishReturnHops: 3,
  fishReturnSpin: 1,
  fishReturnOut: 0.7,
  fishReturnUp: 0.35,
  boatOarOptions: 1,
  fishBurstCount: 110,
  fishBurstSpeed: 2.3,
  fishBurstSpread: 0.85,
  fishBurstLifetime: 1.3,
  fishBurstSize: 0.03,
  fishBurstOpacity: 2.4,
  fishFlashIntensity: 3.2,
  fishFlashDuration: 0.5,
  fishFlashReach: 4.5,
  critterActsOn: 1,
  critterGroundY: -0.02,
  bagTipHeading: 3.1416,
  bagTipContact: 0.12,
  rodTipHeading: 2.0123,
  hikeBagTipHeading: 3.1416,
  bagTipShove: 1.22,
  hikeBagTipShove: 1.18,
  rodTipShove: 2.12,
  bagTipTilt: 0.0,
  hikeBagTipTilt: 0.0,
  rodTipTilt: 0.063,
  bagTipLift: 0.0,
  hikeBagTipLift: 0.0,
  rodTipLift: 0.04,
  bagRattleAmp: 0.022,
  bagRattleFreq: 9.0,
  bagRattleDamp: 7.0,
  hikeBagRattleAmp: 0.022,
  hikeBagRattleFreq: 9.0,
  hikeBagRattleDamp: 7.0,
  rodRattleAmp: 0.03,
  rodRattleFreq: 7.0,
  rodRattleDamp: 4.0,
  bagTipFall: 1.0,
  hikeBagTipFall: 1.0,
  rodTipFall: 1.143,
  tipRestitution: 0.22,
  raccoonScale: 0.35,
  tentMouthOut: 0.45,
  donutY: 0.09,
  donutRoll: 0.85,
  donutRollDur: 1.0,
  donutScale: 0.41,
  donutRadius: 0.176,
  raccoonReach: 0.35,
  raccoonOutDur: 2.8,
  raccoonReachDur: 0.55,
  raccoonDip: 0.7,
  raccoonTakeDur: 0.5,
  raccoonBackDur: 3.0,
  donutCarryScale: 1.17,
  donutCarryDrop: -0.02,
  glassesHeight: 0,
  glassesNoseRide: 0,
  glassesScale: 1,
  glassesTilt: 0,

  // 9 keeps the three clusters clear of each other: the campfire alone spans
  // about 5 units once the camper and tent are counted.
  locationRadius: 9,
  // PI puts location 0 on -Z, which is the top of a top-down view - the campfire
  // sits north, the arcade south-west, the desk south-east.
  locationAngleOffset: Math.PI,
  locationSpin: 0,
  // 6 back from a location centre leaves the camera at radius 3, out in the
  // empty middle, and still outside the 2.4 bench ring at the campfire.
  locationCameraBack: 6,
  locationCameraHeight: 1.6,
  locationTargetHeight: 0.9,
  locationTurnSpeed: 0.45,

  // Pulled 3.4x back and 15 units up puts the camera high enough to read the
  // whole camp as a diorama behind the title without the campfire disappearing.
  titleCameraDistance: 3.4,
  titleCameraHeight: 15,
  titleFlyDuration: 3.8,
  titleFlyFovBoost: 18,
  titleFlyFogSquash: 0.4,
  titleFlyExtraDistance: 0,
  // Slightly down-tilted — camera flies in straight, framing the campsite.
  titleFlyCameraPitch: -15,

  // Sit in pure black for 1s before the letters start fading in, then take
  // 2.8s to fade them fully up. Letters are clickable from mount — clicking
  // slides the title up and fades over titleFadeOutDuration.
  titleBlackHoldDuration: 1.0,
  titleFadeInDuration: 2.8,
  titleHoldDuration: 0,
  titleExitSlideDuration: 0.9,
  titleExitUnmountDelay: 0.05,
  titleExitSlideDistance: 14,
  titleExitZDistance: 0,
  titleLetterIdleAmount: 2.2,
  titleLetterWaviness: 0.32,
  bearDialogueOpacity: 0.98,
  bearDialogueBlurPx: 6,
  bearDialogueScale: 1,
  bearDialogueBottomRem: 1.25,
  bearDialoguePreviewOn: 1,
  bearDialogueFont: 0,
  bearDialogueMotionOn: 1,
  bearDialoguePopStiffness: 340,
  bearDialoguePopDamping: 22,
  bearDialogueLeftTiltDeg: -1.5,
  bearDialogueRightTiltDeg: 1.5,
  bearDialoguePreviewSide: 0,
  bearDialoguePreviewTextLength: 2,
  bearDialogueWidthRem: 34,
  bearDialogueMinHeightRem: 14,
  bearDialogueCloudFlow: 0.4,
  bearDialogueCloudCycleSec: 8.5,
  bearDialogueRoundness: 0.65,
  bearDialogueWaveDirection: 0,
  bearDialogueRippleScale: 0.015,
  bearDialogueWaveAmplitude: 2.5,
  bearDialogueWaveSpeed: 0.12,
  bearDialogueWaveSpacing: 3,
  bearDialogueTextSizeRem: 1.5,
  bearDialogueTextPaddingXRem: 2.5,
  bearDialogueTextPaddingYRem: 2.5,
  bearDialogueTextColorR: 0.43,
  bearDialogueTextColorG: 0.42,
  bearDialogueTextColorB: 0.36,
  bearDialogueBorderOn: 1,
  bearDialogueBorderWidthPx: 5,
  bearDialogueBorderColorR: 0.32,
  bearDialogueBorderColorG: 0.29,
  bearDialogueBorderColorB: 0.23,
  bearDialogueNameTagXRem: 0,
  bearDialogueNameTagYRem: 0,
  bearDialogueNameTagScale: 1,
  bearDialogueNameTagAnchor: 1,
  bearDialogueNameTagInsetXRem: 1.75,
  bearDialogueNameTagInsetYRem: -0.25,
  bearDialogueNameTagWaveAmplitude: 1.6,
  bearDialogueNameTagWaveSpeed: 0.21,
  bearDialogueNameTagWaveSpacing: 3,
  bearDialogueNameTagRoundness: 0.8,
  bearDialogueNameTagOutlineOn: 1,
  bearDialogueNameTagOutlineWidthPx: 2,
  bearDialogueNameTagOutlineOpacity: 1,
  bearDialogueNameTagOutlineColorR: 0.32,
  bearDialogueNameTagOutlineColorG: 0.29,
  bearDialogueNameTagOutlineColorB: 0.23,
  bearDialogueNameTagShadowDarken: 0.65,
  bearDialogueSmokeyTagColorR: 0.851,
  bearDialogueSmokeyTagColorG: 0.561,
  bearDialogueSmokeyTagColorB: 0.278,
  bearDialogueMapleTagColorR: 0.486,
  bearDialogueMapleTagColorG: 0.655,
  bearDialogueMapleTagColorB: 0.933,
  bearDialogueYouTagColorR: 0.533,
  bearDialogueYouTagColorG: 0.71,
  bearDialogueYouTagColorB: 0.42,
  bearDialogueSmokeyNameTiltDeg: -3,
  bearDialogueMapleNameTiltDeg: 3,
  bearDialogueSmokeyIconSizeRem: 1.75,
  bearDialogueSmokeyIconAnchor: 1,
  bearDialogueSmokeyIconInsetXRem: 5.3,
  bearDialogueSmokeyIconInsetYRem: 5.3,
  bearDialogueSmokeyIconKeepInside: 1,
  bearDialogueSmokeyIconXRem: 0,
  bearDialogueSmokeyIconYRem: 0,
  bearDialogueSmokeyIconTiltDeg: 0,
  bearDialogueSmokeyIconTextClearanceRem: 0.4,
  bearDialogueSmokeyIconOpacity: 1,
  bearDialogueSmokeyIconBorderOn: 1,
  bearDialogueSmokeyIconBorderWidthPx: 1,
  bearDialogueSmokeyIconBorderColorR: 0.32,
  bearDialogueSmokeyIconBorderColorG: 0.29,
  bearDialogueSmokeyIconBorderColorB: 0.23,
  bearDialogueSmokeyIconBorderOpacity: 1,
  bearDialogueSmokeyIconShadowXRem: 0,
  bearDialogueSmokeyIconShadowYRem: 0.15,
  bearDialogueSmokeyIconShadowBlurPx: 10,
  bearDialogueSmokeyIconShadowLayers: 1,
  bearDialogueSmokeyIconShadowOpacity: 0.35,
  bearDialogueSmokeyIconShadowColorR: 0.12,
  bearDialogueSmokeyIconShadowColorG: 0.09,
  bearDialogueSmokeyIconShadowColorB: 0.06,
  bearDialogueSmokeyIconGlowPx: 0,
  bearDialogueSmokeyIconGlowPasses: 2,
  bearDialogueSmokeyIconGlowOpacity: 0.6,
  bearDialogueSmokeyIconGlowColorR: 0.95,
  bearDialogueSmokeyIconGlowColorG: 0.72,
  bearDialogueSmokeyIconGlowColorB: 0.35,
  bearDialogueSmokeyIconAutoClearanceOn: 1,
  bearDialogueTextFloatAmount: 1,
  bearDialogueTextFloatCycleSec: 7,
  smokeyHatX: 0,
  smokeyHatY: 0.72673,
  smokeyHatZ: 0,
  smokeyHatRotX: 0,
  smokeyHatRotY: 0,
  smokeyHatRotZ: 0,
  smokeyHatScale: 0.22,
  smokeyHatColorR: 1,
  smokeyHatColorG: 1,
  smokeyHatColorB: 1,
  smokeyHatBandColorR: 0.12,
  smokeyHatBandColorG: 0.12,
  smokeyHatBandColorB: 0.12,

  /**
   * A standing shot of each location, not a map of it - eye heights of 1.4-1.7 put the
   * camera on the ground among the bears rather than looking down on them.
   *
   * cz is how far back toward the middle the camera stands, so it has to stay under
   * locationRadius or the camera crosses the centre and looks at the scene backwards.
   * The campfire gets the most room because its cluster is the widest, once the camper
   * and tent are counted; the desk is a single bear at a table and needs the least.
   */
  locationViews: [
    { cx: 0, cy: 1.7, cz: 7.0, tx: 0, ty: 0.9, tz: 0 }, // campfire
    { cx: 0, cy: 1.4, cz: 4.5, tx: 0, ty: 0.7, tz: 0 }, // desk
    { cx: 0, cy: 1.5, cz: 5.5, tx: 0, ty: 0.8, tz: 0 }, // arcade
  ],

  masterVolume: 0.7,
  speechVolume: 1,
  smokeySpeechVolume: 1,
  mapleSpeechVolume: 1,
  fireCracklingVolume: 0.55,
  rockingChairVolume: 0.3,
  banjoVolume: 0.32,
  axeFlipHeight: 1.2,
  axeFlipDuration: 1.4,
  axeFlipSpins: 2,
  axeFlipTwist: 0,
  axeFlipApex: 0.58,
  axeWatchHold: 0.6,
  woodRollRight: 3.5,
  woodRollTurnRadius: 0.8,
  woodRollToTent: 1,
  woodRollTentGap: 1.0,
  woodRollAway: 9,
  woodRollTime: 3.6,
  woodRollSoundVolume: 0.5,
  axeWatchFollowTime: 0.08,
  banjoDistanceRolloff: 1,
  banjoMaxBoost: 1.8,
  banjoPropX: 0,
  banjoPropY: 0,
  banjoPropZ: 0,
  banjoPropRotX: 0,
  banjoPropRotY: 0,
  banjoPropRotZ: 0,
  banjoPropScale: 1,
  banjoPickingBpm: 96,
  banjoPickingAmount: 0,
  banjoPickingWristPitch: 0,
  banjoPickingWristRoll: 0,
  banjoFretFingerAmount: 0,
  banjoBearGlassesHeight: 0,
  banjoBearGlassesNoseRide: 0,
  banjoBearGlassesTilt: 0,
  banjoBearGlassesScale: 1,
  mapleGlassesHeight: 0,
  mapleGlassesNoseRide: 0,
  mapleGlassesTilt: 0,
  mapleGlassesScale: 1,
  swooshVolume: 0.6,
  swooshDelayMs: 120,
  swooshRate: 0.8,
  hoverVolume: 0.35,
  clickVolume: 0.6,

  bearTalkJawMax: 0.9,
  bearTalkJawGain: 1,
  bearTalkWide: 1,
  bearTalkRound: 1,
  bearTalkJawCorrective: 0.2,
  bearTalkShapeCorrective: 0.35,
  bearTalkOpenSpeed: 32,
  bearTalkCloseSpeed: 15,
  bearTalkShapeSpeed: 12,
  bearTalkNod: 1,
  bearTalkBeat: 1,
  bearTalkPitchHead: 1,
  bearTalkSway: 1,
  bearTalkEars: 1,
  bearTalkListener: 1,
  bearBlinkRate: 1,
  bearTalkLips: 1,
  bearMouthRestSeal: 1,
  bearMouthSealStart: 0.04,
  bearMouthSealEnd: 0.48,
  bearLookAmount: 0.85,
  bearLookTurnTime: 0.65,
  bearLookUserYOffset: -0.2,
  bearLookPartnerDelay: 0.08,
  bearMapleLegAmount: 0.25,
  bearMapleLegSpeed: 0.6,
  bearSmokeyLegSpeed: 1,
  bearSmokeyLegAmount: 1,
  bearFishLookTurnTime: 0.65,
  bearFishHeadTurnTime: 0.8,
  bearFishImpactDelay: 0.3,
  bearFishFireLookTime: 0.65,
  bearFishMouthHoldTime: 2,
  bearFishReturnTime: 0.7,
  bearFishJawAmount: 1,
  bearFishFlightLookX: 0,
  bearFishFlightLookY: 0,
  bearFishFlightLookZ: 0,
  bearFishFireLookX: 0,
  bearFishFireLookY: -0.2,
  bearFishFireLookZ: 0,
  bearFishFlightLookRX: 0,
  bearFishFlightLookRY: 0,
  bearFishFlightLookRZ: 0,
  bearFishFireLookRX: 0,
  bearFishFireLookRY: -0.2,
  bearFishFireLookRZ: 0,
  bearFishFlightTurnTime: 0.12,
  bearFishFireTurnTime: 0.3,
  bearFishMaxTurn: 80,
  bearFishIdleGazeYOffset: -1.2,
  bearFishIdleLookTime: 3.5,
  bearFishIdleInterval: 6,
  bearFishIdleTurnTime: 0.4,
  bearFishIdleReturnTime: 1.2,
  bearFretLookOn: 1,
  bearFretLookTime: 3,
  bearFretLookInterval: 7,
  bearFretDoubleChance: 0.35,
  bearFretTurnTime: 0.25,
  bearFretReturnTime: 1.2,
  bearFretLookAmount: 1,
  bearFretMaxTurn: 75,
  bearFretLookX: 0,
  bearFretLookY: 0,
  bearFretLookZ: 0,
  bearFretNod: 0.12,
  bearFretTilt: 0.12,

  objectOverrides: {},
  objectDuplicates: {},
  lockedObjects: {},
};

/**
 * What the scene actually starts from: the built-in defaults with whatever has been
 * saved into src/config/campfireScene.json layered on top.
 *
 * That file is committed and bundled at build time, so it is the tuning that actually
 * ships. localStorage still wins over it inside the lab - that is the working draft -
 * but a visitor, or a fresh browser, gets exactly what is in the file.
 */
/**
 * Camera views are stored SEPARATELY from the rest of the config: regular Save
 * writes campfireScene.json but skips locationViews, so a fiddled-with camera
 * doesn't overwrite the pinned "default" per location. Only the Save Default
 * Camera button in SceneLabClient (or a hand edit of cameraDefaults.json)
 * changes what a fresh browser sees for a location.
 *
 * cameraDefaults.json is keyed by location index as a string ("0" / "1" / "2")
 * so partial writes work - overlay each present entry over whatever came from
 * campfireScene.json (which itself falls back to the hardcoded authored views).
 */
function overlayCameraDefaults(base: LocationView[]): LocationView[] {
  const defaults = savedCameraDefaults as Record<string, Partial<LocationView>>;
  return base.map((view, i) => {
    const d = defaults[String(i)];
    if (!d || typeof d !== "object") return view;
    return {
      cx: typeof d.cx === "number" ? d.cx : view.cx,
      cy: typeof d.cy === "number" ? d.cy : view.cy,
      cz: typeof d.cz === "number" ? d.cz : view.cz,
      tx: typeof d.tx === "number" ? d.tx : view.tx,
      ty: typeof d.ty === "number" ? d.ty : view.ty,
      tz: typeof d.tz === "number" ? d.tz : view.tz,
    };
  });
}

const mergedCampfire = {
  ...BASE_CAMPFIRE_CONFIG,
  ...(savedCampfire as Partial<CampfireSceneConfig>),
};

export const DEFAULT_CAMPFIRE_CONFIG: CampfireSceneConfig = {
  ...mergedCampfire,
  locationViews: overlayCameraDefaults(
    mergedCampfire.locationViews ?? BASE_CAMPFIRE_CONFIG.locationViews,
  ),
};

export const DEFAULT_OCEAN_CONFIG: OceanFloorSceneConfig = {
  cameraX: 0,
  cameraY: 0.78,
  cameraZ: 2.75,
  targetX: 0,
  targetY: 0.18,
  targetZ: 1.55,
  fov: 56,
  fogNear: 2.4,
  fogFar: 10.5,
  ambientIntensity: 0.04,
  beamIntensity: 1,
  beamOpacity: 1,
  particleOpacity: 0.46,
  causticsOpacity: 1,
  mainLightX: 0.45,
  mainLightY: 3.35,
  mainLightZ: 3.15,
  mainLightReach: 6.8,
  mainLightAngle: 0.5,
  sideLightX: -2.15,
  sideLightY: 3.05,
  sideLightZ: 3,
  sideLightReach: 6.2,
  sideLightAngle: 0.42,
  beamTargetX: 0.05,
  beamTargetY: 0.06,
  beamTargetZ: 1.7,
  beamWidth: 1,
  beamLength: 1,
};
