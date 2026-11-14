import { createRequire } from "node:module";

/*
 * Every LiveKit worker loads @livekit/local-inference (a native end-of-turn
 * model) in its own extra process, whether or not its session uses it. The
 * bears never listen (their turns are manual), so on a shared 512MB dyno that
 * is wasted memory. This makes @livekit/agents see the binding as missing:
 * it logs one warning and skips the model process. Call before cli.runApp.
 */
export function disableLocalInference(): void {
  try {
    const fromAgents = createRequire(import.meta.resolve("@livekit/agents"));
    const path = fromAgents.resolve("@livekit/local-inference");
    fromAgents.cache[path] = { id: path, filename: path, loaded: true, exports: undefined } as unknown as NodeJS.Module;
  } catch {
    // not installed for this platform - nothing to skip
  }
}
