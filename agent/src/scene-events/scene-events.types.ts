export type SceneEvent = {
  /** What the site sends: {type:"scene.event", event: id} (see SceneEventId in nextjs/src/lib/bearVoiceState.ts). */
  id: string;
  /** Injected into the bears' prompt for the rest of the visit, so later answers know it happened. */
  observation: string;
  /** Said straight away (after any answer in progress), in order. */
  lines: Array<{ bear: "smokey" | "maple"; text: string }>;
};
