import type * as THREE from "three";

/**
 * Point an AnimationMixer's cached bindings at whatever model is under `root`
 * NOW.
 *
 * drei's useAnimations(clips, groupRef) keeps one mixer for the life of the
 * component and caches a binding per (root, track) - each binding resolves its
 * bone by name the first time it is used and then holds on to that bone
 * object. If the model under the group is replaced by a fresh clone (React
 * Fast Refresh re-runs `useMemo(() => skeletonClone(...))` on every dev hot
 * reload, and the scene lab hot-reloads ~2.5s after every slider change when
 * it auto-saves campfireScene.json), those cached bindings go on animating the
 * OLD, detached skeleton and the new one sits in its bind pose: the T-pose.
 *
 * Unbinding makes each one look its bone up again by name on its next use,
 * which finds the new model. (Uncaching the root instead crashes three when
 * drei has already uncached the same actions - tried it.) Reproduced and
 * checked in a headless test of exactly that sequence.
 */
export function rebindMixerRoot(mixer: THREE.AnimationMixer, root: THREE.Object3D) {
  const bindings = (mixer as unknown as {
    _bindings?: { binding?: { rootNode?: THREE.Object3D; unbind?: () => void } }[];
  })._bindings;
  if (!bindings) return;
  for (const pm of bindings) {
    if (pm.binding?.rootNode === root) pm.binding.unbind?.();
  }
}
