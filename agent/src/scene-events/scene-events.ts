import { type SceneEvent } from "./scene-events.types.js";

export const sceneEvents: SceneEvent[] = [
  {
    id: "fish.burned",
    observation: "The visitor grabbed the fish Smokey and Maple caught for supper and threw it in the campfire. It burned up. The bears are still a little sore about it.",
    lines: [{ bear: "smokey", text: "You owe us a fish." }],
  },
  {
    id: "tent.finished",
    observation: "There is a man tied up in the A-frame tent. The visitor heard him calling out for help from inside it. The bears are going to eat him, and are not at all shy about it.",
    lines: [{ bear: "smokey", text: "He's wrong ya know, we're gonna eat that fella." }],
  },
];

export const sceneEventById = (id: unknown): SceneEvent | undefined =>
  typeof id === "string" ? sceneEvents.find((event) => event.id === id) : undefined;
