import { config as loadEnv } from "dotenv";
import { cli, defineAgent, type JobContext, ServerOptions, toStream, voice } from "@livekit/agents";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import { type AudioFrame, RoomEvent } from "@livekit/rtc-node";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pitchShiftFrames } from "./livekit-audio/index.js";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(sourceDirectory, "../../nextjs/.env") });

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

required("LIVEKIT_URL");
required("LIVEKIT_API_KEY");
required("LIVEKIT_API_SECRET");
required("OPENAI_API_KEY");
if (!process.env.ELEVEN_API_KEY && process.env.ELEVENLABS_API_KEY) {
  process.env.ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
}
required("ELEVEN_API_KEY");

const bear = process.env.LIVEKIT_BEAR_ID === "maple" ? "maple" : "smokey";
const agentName = process.env.LIVEKIT_AGENT_NAME?.trim() || `${bear}-agent`;

type BearPrepare = { type: "bear.prepare"; bear: "smokey" | "maple"; turnId: string; sequence: number; text: string };
type BearPlay = { type: "bear.play"; bear: "smokey" | "maple"; turnId: string; sequence: number };

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const metadata = JSON.parse(ctx.job.metadata || "{}") as { pitch?: unknown };
    const pitch = typeof metadata.pitch === "number" && metadata.pitch >= 0.6 && metadata.pitch <= 1.8
      ? metadata.pitch
      : bear === "maple" ? 1.12 : 0.9;
    const tts = new elevenlabs.TTS({
      voiceId: bear === "maple"
          ? process.env.LIVEKIT_MAPLE_ELEVENLABS_VOICE_ID?.trim() || "oubi7HGxNVjXMnWLgwBT"
          : process.env.LIVEKIT_SMOKEY_ELEVENLABS_VOICE_ID?.trim() || "oubi7HGxNVjXMnWLgwBT",
      model: "eleven_turbo_v2_5",
      language: "en",
      chunkLengthSchedule: [80, 120, 180],
    });
    const session = new voice.AgentSession({
      userAwayTimeout: null,
      turnHandling: { turnDetection: "manual" },
    });
    const prepared = new Map<string, { text: string; frames: AudioFrame[]; durationMs: number }>();
    const preparing = new Set<string>();
    const played = new Set<string>();
    const keyFor = (turnId: string, sequence: number) => `${turnId}:${sequence}`;
    await session.start({
      room: ctx.room,
       agent: voice.Agent.create({ instructions: bear === "maple"
         ? "You are Maple, Smokey's sassy, sharp, affectionate Southern wife. Tease him like a spouse who has heard his overconfident claims many times."
         : "You are Smokey, Maple's warm, stubborn Southern husband. Sound genuinely exasperated but affectionate when your wife interrupts." }),
      inputOptions: { audioEnabled: false, textEnabled: false },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false, syncTranscription: false },
    });
    await ctx.connect();
    ctx.room.on(RoomEvent.LocalTrackPublished, (publication) => {
      console.log("LiveKit bear audio track published", { bear, trackSid: publication.sid, kind: publication.kind });
    });
    await ctx.room.localParticipant?.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "bear.identity", bear })),
      { reliable: true },
    );

    ctx.room.on(RoomEvent.DataReceived, (payload) => {
      let event: BearPrepare | BearPlay | { type?: unknown; bear?: unknown; turnId?: unknown };
      try {
        event = JSON.parse(new TextDecoder().decode(payload)) as BearPrepare | BearPlay;
      } catch {
        return;
      }
      if (event.type === "bear.cancel" && event.bear === bear) {
        session.interrupt({ force: true });
        if (typeof event.turnId === "string") {
          for (const key of prepared.keys()) if (key.startsWith(`${event.turnId}:`)) prepared.delete(key);
          for (const key of preparing) if (key.startsWith(`${event.turnId}:`)) preparing.delete(key);
          for (const key of played) if (key.startsWith(`${event.turnId}:`)) played.delete(key);
        } else {
          prepared.clear();
          preparing.clear();
          played.clear();
        }
        return;
      }
      if (event.type === "bear.prepare" && event.bear === bear) {
        const command = event as BearPrepare;
        const commandKey = keyFor(command.turnId, command.sequence);
        if (prepared.has(commandKey) || preparing.has(commandKey)) return;
        preparing.add(commandKey);
        console.log("LiveKit bear preparing", { bear, turnId: command.turnId, sequence: command.sequence, characters: command.text.length });
        void (async () => {
          const frames: AudioFrame[] = [];
          const stream = tts.synthesize(command.text);
          for await (const audio of stream) frames.push(audio.frame);
          if (stream.error) throw stream.error;
          const shiftedFrames = pitchShiftFrames(frames, pitch);
          const durationMs = shiftedFrames.reduce((sum, frame) => sum + frame.samplesPerChannel / frame.sampleRate * 1000, 0);
          preparing.delete(commandKey);
          prepared.set(commandKey, { text: command.text, frames: shiftedFrames, durationMs });
          await ctx.room.localParticipant?.publishData(
            new TextEncoder().encode(JSON.stringify({ ...command, type: "bear.ready", durationMs })),
            { reliable: true },
          );
        })().catch((error: unknown) => {
          preparing.delete(commandKey);
          console.error("LiveKit bear preparation failed", { bear, error });
        });
        return;
      }
      if (event.type !== "bear.play" || event.bear !== bear) return;
      const command = event as BearPlay;
      const commandKey = keyFor(command.turnId, command.sequence);
      const audio = prepared.get(commandKey);
      if (!audio || played.has(commandKey)) return;
      played.add(commandKey);
      console.log("LiveKit bear playing", { bear, turnId: command.turnId, sequence: command.sequence, durationMs: audio.durationMs });
      void (async () => {
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify({ ...command, type: "bear.started" })),
          { reliable: true },
        );
        const audioFrames = audio.frames;
        await session.say(audio.text, {
          allowInterruptions: false,
          addToChatCtx: false,
          audio: toStream((async function* () {
            for (const frame of audioFrames) yield frame;
          })()),
        });
        prepared.delete(commandKey);
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(JSON.stringify({ ...command, type: "bear.completed" })),
          { reliable: true },
        );
      })();
    });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName }));
