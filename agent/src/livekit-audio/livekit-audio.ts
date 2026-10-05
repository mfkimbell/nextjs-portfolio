import { AudioFrame } from "@livekit/rtc-node";

export const pitchShiftFrames = (frames: AudioFrame[], rate: number): AudioFrame[] => {
  if (!frames.length || !Number.isFinite(rate) || Math.abs(rate - 1) < 0.001) return frames;
  const sampleRate = frames[0]!.sampleRate;
  if (frames[0]!.channels !== 1) return frames;
  const input = new Int16Array(frames.reduce((sum, frame) => sum + frame.data.length, 0));
  let offset = 0;
  for (const frame of frames) {
    input.set(frame.data, offset);
    offset += frame.data.length;
  }
  const output = new Int16Array(Math.max(1, Math.floor(input.length / rate)));
  for (let index = 0; index < output.length; index += 1) {
    const source = index * rate;
    const left = Math.floor(source);
    const right = Math.min(input.length - 1, left + 1);
    const mix = source - left;
    output[index] = Math.round(input[left]! * (1 - mix) + input[right]! * mix);
  }
  const chunkSize = Math.max(1, Math.floor(sampleRate / 50));
  const shifted: AudioFrame[] = [];
  for (let start = 0; start < output.length; start += chunkSize) {
    const chunk = output.slice(start, Math.min(output.length, start + chunkSize));
    shifted.push(new AudioFrame(chunk, sampleRate, 1, chunk.length));
  }
  return shifted;
};
