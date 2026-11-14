import { type JobContext } from "@livekit/agents";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import {
  type AudioFrame, AudioSource, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource,
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import { pitchShiftFrames } from "../livekit-audio/index.js";

/*
 * Smokey and Maple used to be two separate LiveKit agents, each in its own
 * worker and job process - three processes per visitor with the coordinator,
 * too much for a small dyno. Now the coordinator's job brings them into the
 * room itself: each bear is a plain participant (kind "agent") with its own
 * audio track, speaking the same room protocol the separate agents did -
 *   coordinator -> bear.prepare / bear.play / bear.cancel
 *   bear -> bear.identity / bear.ready / bear.started / bear.completed
 * so neither the coordinator's turn logic nor the site had to change.
 */

export type BearName = "smokey" | "maple";
type BearPrepare = { type: "bear.prepare"; bear: BearName; turnId: string; sequence: number; text: string };
type BearPlay = { type: "bear.play"; bear: BearName; turnId: string; sequence: number };

const PERSONA: Record<BearName, { name: string; defaultPitch: number; voiceEnv: string }> = {
  smokey: { name: "Smokey", defaultPitch: 0.9, voiceEnv: "LIVEKIT_SMOKEY_ELEVENLABS_VOICE_ID" },
  maple: { name: "Maple", defaultPitch: 0.97, voiceEnv: "LIVEKIT_MAPLE_ELEVENLABS_VOICE_ID" },
};
const DEFAULT_VOICE_ID = "oubi7HGxNVjXMnWLgwBT";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const validPitch = (value: unknown, fallback: number) =>
  typeof value === "number" && value >= 0.6 && value <= 1.8 ? value : fallback;

async function joinBear(roomName: string, bear: BearName, pitchValue: unknown): Promise<() => Promise<void>> {
  // The ElevenLabs plugin reads ELEVEN_API_KEY; nextjs/.env names it ELEVENLABS_API_KEY.
  // (Done here, not at import: the coordinator loads that .env after its imports.)
  if (!process.env.ELEVEN_API_KEY && process.env.ELEVENLABS_API_KEY) {
    process.env.ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
  }
  const persona = PERSONA[bear];
  const pitch = validPitch(pitchValue, persona.defaultPitch);
  const tts = new elevenlabs.TTS({
    voiceId: process.env[persona.voiceEnv]?.trim() || DEFAULT_VOICE_ID,
    // flash: ElevenLabs' lowest-latency model (turbo took noticeably longer
    // to finish each line, and a line plays only once fully synthesized)
    model: process.env.LIVEKIT_ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5",
    language: "en",
    chunkLengthSchedule: [80, 120, 180],
  });

  const token = new AccessToken(required("LIVEKIT_API_KEY"), required("LIVEKIT_API_SECRET"), {
    identity: `${bear}-bear`,
    name: persona.name,
    ttl: "2h",
  });
  // "agent", so the bears don't count as people keeping the room open
  token.kind = "agent";
  token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canPublishData: true, canSubscribe: true });

  const room = new Room();
  await room.connect(required("LIVEKIT_URL"), await token.toJwt(), { autoSubscribe: false, dynacast: false });
  const source = new AudioSource(tts.sampleRate, tts.numChannels);
  const track = LocalAudioTrack.createAudioTrack(`${bear}-voice`, source);
  const publication = await room.localParticipant!.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
  console.log("LiveKit bear audio track published", { bear, trackSid: publication.sid, kind: publication.kind });

  const send = (event: object) =>
    room.localParticipant!.publishData(new TextEncoder().encode(JSON.stringify(event)), { reliable: true });
  await send({ type: "bear.identity", bear });

  const prepared = new Map<string, { text: string; frames: AudioFrame[]; durationMs: number }>();
  const preparing = new Set<string>();
  const played = new Set<string>();
  const keyFor = (turnId: string, sequence: number) => `${turnId}:${sequence}`;
  // bumped by bear.cancel: a line that is mid-playout stops feeding frames
  let playback = 0;

  room.on(RoomEvent.DataReceived, (payload) => {
    let event: BearPrepare | BearPlay | { type?: unknown; bear?: unknown; turnId?: unknown };
    try {
      event = JSON.parse(new TextDecoder().decode(payload)) as BearPrepare | BearPlay;
    } catch {
      return;
    }
    if (event.bear !== bear) return;
    if (event.type === "bear.cancel") {
      playback += 1;
      source.clearQueue();
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
    if (event.type === "bear.prepare") {
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
        if (!preparing.delete(commandKey)) return; // cancelled while synthesizing
        prepared.set(commandKey, { text: command.text, frames: shiftedFrames, durationMs });
        await send({ ...command, type: "bear.ready", durationMs });
      })().catch((error: unknown) => {
        preparing.delete(commandKey);
        console.error("LiveKit bear preparation failed", { bear, error });
      });
      return;
    }
    if (event.type !== "bear.play") return;
    const command = event as BearPlay;
    const commandKey = keyFor(command.turnId, command.sequence);
    const audio = prepared.get(commandKey);
    if (!audio || played.has(commandKey)) return;
    played.add(commandKey);
    console.log("LiveKit bear playing", { bear, turnId: command.turnId, sequence: command.sequence, durationMs: audio.durationMs });
    const myPlayback = ++playback;
    void (async () => {
      await send({ ...command, type: "bear.started" });
      for (const frame of audio.frames) {
        if (playback !== myPlayback) return; // cancelled: no bear.completed
        await source.captureFrame(frame);
      }
      await source.waitForPlayout();
      if (playback !== myPlayback) return;
      prepared.delete(commandKey);
      await send({ ...command, type: "bear.completed" });
    })().catch((error: unknown) => console.error("LiveKit bear playback failed", { bear, error }));
  });

  return async () => {
    playback += 1;
    await room.disconnect().catch(() => {});
    await source.close().catch(() => {});
  };
}

/**
 * Bring Smokey and Maple into the coordinator's room. Resolves once both are
 * connected, have published their audio tracks and are listening, so the
 * greeting's bear.prepare messages can't arrive before they do. They leave
 * when the job shuts down.
 */
export async function joinBears(ctx: JobContext, pitch: { smokey?: unknown; maple?: unknown }): Promise<void> {
  const roomName = ctx.room.name;
  if (!roomName) throw new Error("joinBears: the job's room has no name yet (call after ctx.connect())");
  const leave = await Promise.all([joinBear(roomName, "smokey", pitch.smokey), joinBear(roomName, "maple", pitch.maple)]);
  ctx.addShutdownCallback(async () => { await Promise.all(leave.map((fn) => fn())); });
}
