# Animal Crossing-Style Dialogue Bubble Plan

## Goal

Rebuild the Smokey/Maple dialogue plaque so it resembles the current Animal Crossing: New Horizons dialogue UI:

- Warm cream, wide speech plaque.
- Smooth inflated silhouette with a gently bowed bottom.
- Large, soft contour lobes rather than obvious scallops.
- Subtle continuous edge breathing that is visible in Scene Lab but never distracts from text.
- Stable text and name badge while only the background contour moves.
- Exact visual and motion parity between Scene Lab preview and production.

This plan only covers dialogue plaque shape, edge motion, controls, preview parity, and verification. It does not change conversation state, audio, or bear animation.

## Research

### Observed ACNH visual language

Public New Horizons references show a wide cream plaque that behaves more like a softly inflated blob than a rounded rectangle.

- Top edge is broadly domed.
- Lower sidewalls pinch inward slightly.
- Bottom remains almost flat with a shallow organic bow.
- Corners are formed by long continuous curves, not many small cloud scallops.
- Edge motion is slow and low amplitude. Large contour sections breathe together.
- Text remains stable and does not warp with the plaque.
- Name badge is a separate colored pill overlapping the upper-left edge.
- Shadow is broad and subdued rather than a sharp card shadow.

### References

- Game UI Database, ACNH captures: https://www.gameuidatabase.com/gameData.php?id=606
- Dialogue screenshot: https://www.gameuidatabase.com/uploads/Animal-Crossing-New-Horizons07052021-112447-13403.jpg
- Dialogue motion footage: https://www.gameuidatabase.com/uploads/video/Animal-Crossing-New-Horizons05042024-042914-4361.mp4
- Fonts In Use, ACNH typography: https://fontsinuse.com/uses/51354/animal-crossing-new-horizons
- ACNH bubble recreation: https://codepen.io/andymerskin/pen/NWqQydM
- Motion SVG animation: https://motion.dev/docs/react-svg-animation
- Motion reduced-motion hook: https://motion.dev/docs/react-use-reduced-motion
- SVG turbulence reference: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence
- SVG displacement reference: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap

## Technique Decision

Use compatible SVG path morphing through the already-installed `framer-motion` package.

Do not add a dependency.

Do not use SVG turbulence/displacement as the primary animation. It produces small noisy ripples that read as water or paper, not ACNH's broad breathing contour, and it has higher rendering/filter cost.

Do not use generic animated `border-radius`; it cannot reproduce the lower side pinches and bowed base accurately.

Author 3 compatible cubic-Bezier paths with identical command counts and move only selected control points. Interpolate their `d` values with Framer Motion.

## Current Problems

### Preview and production are duplicated

- Production: `nextjs/src/components/bear-dialogue/bear-dialogue.tsx`
- Preview: `nextjs/src/components/scene-lab/SceneLabClient.tsx`

They define separate SVG paths and separate motion wrappers. This caused the preview in the user's screenshot to remain visually static even when production code changed.

### Current flow is nearly imperceptible

Persisted defaults:

- `bearDialogueCloudFlow = 0.55`
- `bearDialogueCloudCycleSec = 11`

Current scale movement is only `0.55 * 0.012 = 0.66%`, and contour points differ by only a few units in a `1000 x 300` viewBox. On the configured bubble this is roughly 1-3 pixels over 11 seconds.

### Flow amount barely controls edge motion

The slider changes whole-SVG scale but does not increase the actual distance between morph paths. Raising the setting therefore does not make contour flow meaningfully more visible.

### Preview animation restarts during tuning

Scene Lab remounts the preview for several dialogue settings, and disk autosave can trigger a Next reload. A long 11-second cycle frequently restarts before the motion becomes perceptible.

### Shape moved too far from the original

The recent scalloped-cloud paths use too many pronounced lobes. The user asked to retain the earlier shape and make its edges flow, not replace it with a cartoon cloud bank.

## Target Architecture

Create one shared presentational component used by production and Scene Lab:

```text
nextjs/src/components/bear-dialogue/
  dialogue-plaque.tsx
  dialogue-plaque.constants.ts
  dialogue-plaque.types.ts
```

`DialoguePlaque` owns:

- SVG viewBox and compatible path variants.
- Fill, border, and shadow.
- Contour morph animation.
- Optional slow whole-shape breathing.
- Reduced-motion behavior.
- Stable content slot.
- Name badge slot.

`BearDialogue` remains responsible for conversation state and content only.

`SceneLabClient` renders `DialoguePlaque` directly instead of duplicating its SVG.

## Visual Shape

Start from the earlier restrained plaque silhouette, not the newly scalloped shape.

Author three compatible paths:

1. Neutral shape.
2. Slight left-side expansion and right-side relaxation.
3. Slight top/bottom expansion with side pinches shifted vertically.

Movement limits at maximum default intensity:

- Top/bottom points: approximately 2-4 viewBox units.
- Side pinches: approximately 4-8 viewBox units.
- Bottom bow: approximately 2-3 viewBox units.
- No sharp cusps.
- No more than 3 visually meaningful lobes per side.

Keep `viewBox="0 0 1000 300"` and `preserveAspectRatio="none"` initially to minimize layout change, but test all allowed width/height combinations for unacceptable distortion.

## Motion

### Idle contour flow

Recommended defaults:

- Cycle: `6.5s` rather than `11s`.
- Ease: `easeInOut`.
- Repeat: infinite.
- Repeat type: mirror or reverse.
- Default intensity: visible at normal laptop size but restrained.

Animate only the background path and shadow path. Do not animate text or the name badge with the contour.

### Whole-shape breathing

Optional secondary motion:

- Scale X: approximately `0.995 -> 1.004`.
- Scale Y: approximately `1.004 -> 0.996`.
- Use a different phase/duration than path morphing.
- Disable or reduce it at low flow settings.

### Reduced motion

When `useReducedMotion()` is true:

- Use the neutral path.
- Disable path morph, drift, and breathing.
- Keep entrance/exit opacity behavior minimal.

## Configuration

Replace the current ambiguous two-control model with explicit persisted fields:

```ts
bearDialogueEdgeFlow: number;       // 0..1, actual path displacement multiplier
bearDialogueEdgeCycleSec: number;   // 3..16
bearDialogueBreathAmount: number;   // 0..1
bearDialogueBreathCycleSec: number; // 3..16
```

Migration:

- Map existing `bearDialogueCloudFlow` to `bearDialogueEdgeFlow`.
- Map existing `bearDialogueCloudCycleSec` to `bearDialogueEdgeCycleSec`.
- Keep compatibility only in config normalization while migrating the checked-in JSON once; do not maintain two runtime systems.

Scene Lab labels:

- `Edge flow amount`
- `Edge flow cycle`
- `Breathing amount`
- `Breathing cycle`

Add a `Pause idle motion` toggle for examining shape and typography. This preview-only control does not need to persist to production config.

## Implementation Tasks

### 1. Shared constants

Create `dialogue-plaque.constants.ts`:

- Neutral path.
- Two compatible variants.
- Default motion values.
- Fill, stroke, and shadow colors.

Ensure every path has identical command structure and point count. Add a small test/helper assertion that command signatures match.

### 2. Shared plaque component

Create `dialogue-plaque.tsx`:

- Accept dimensions, opacity, flow amount/cycle, breathing amount/cycle, and motion enabled.
- Render a broad shadow path and cream body path.
- Morph both paths using the same `d` sequence.
- Keep children in a separate stable HTML wrapper above the SVG.
- Respect reduced motion.

### 3. Production migration

Update `bear-dialogue.tsx`:

- Remove local `bubblePathVariants` and duplicated SVG blocks.
- Render `DialoguePlaque` for speaker, typing, and `Your turn` variants.
- Keep existing state, controls, name tag, and copy.
- Preserve current responsive sizing and viewport-based typography.

### 4. Scene Lab migration

Update `SceneLabClient.tsx`:

- Delete the manually duplicated preview SVG and `dialogueCloudPaths`.
- Render `DialoguePlaque` with preview text and badge.
- Ensure cloud controls update without changing a `key` that remounts the preview.
- Keep preview visible while tuning motion.

### 5. Config migration

Update:

- `nextjs/src/components/scene-lab/sceneConfig.ts`
- `nextjs/src/config/campfireScene.json`
- `nextjs/src/components/CampsiteHome.tsx`
- Dialogue prop types

Set researched defaults:

```json
{
  "bearDialogueEdgeFlow": 0.45,
  "bearDialogueEdgeCycleSec": 6.5,
  "bearDialogueBreathAmount": 0.35,
  "bearDialogueBreathCycleSec": 8
}
```

### 6. Preview reliability

- Remove cloud-motion fields from any preview remount key.
- Avoid remounting when sliders change.
- Pause Scene Lab autosave-triggered preview resets if necessary, or ensure module writes do not reconstruct the preview component.
- Display the current cycle progress or a small `motion active` indicator so an enabled but subtle animation is not mistaken for failure.

## Verification

### Automated

- Production build: `npm run build`.
- Type check/lint as part of Next build.
- Test path command compatibility.
- Test reduced-motion returns the neutral path/no repeat transition.
- Test Scene Lab and production both import the shared plaque component.

### Visual matrix

Capture screenshots/video at:

- Desktop `1440 x 900`.
- Laptop `1280 x 720`.
- Mobile landscape.
- Width minimum and maximum.
- Height minimum and maximum.
- Smokey left placement.
- Maple right placement.
- Centered `Your turn` state.
- Flow `0`, default, and `1`.
- Reduced motion enabled.

Acceptance criteria:

- Motion is clearly visible in Scene Lab within two seconds at default settings.
- Edges drift smoothly with no jumps or point-crossing artifacts.
- Shape remains close to the restrained pre-cloud silhouette.
- Text, buttons, and name badge do not wobble or scale with edge motion.
- Production and preview are pixel-identical for the same config.
- Default motion reads as subtle ACNH-like breathing, not water, slime, or a scalloped cartoon cloud.

## Rollout Order

1. Build shared plaque and compatible paths.
2. Replace Scene Lab preview first and tune against references.
3. Capture a short preview recording for approval.
4. Replace production SVG with the approved shared component.
5. Migrate config fields and checked-in JSON.
6. Run the visual matrix and production build.

## Non-Goals

- Do not add turbulence filters as the primary motion.
- Do not install Flubber unless compatible-path morphing demonstrably fails.
- Do not distort text with SVG filters or transforms.
- Do not modify voice state, bear timing, or audio behavior in this task.
- Do not copy Nintendo artwork or exact assets; reproduce only the observed motion/design principles.
