export type BanjoFingerPhase = {
  fretPressure: number;
  pickCurl: number;
};

export const getBanjoFingerPhase = (timeSeconds: number, bpm: number): BanjoFingerPhase => {
  const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
  const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : 96;
  const beat = time * tempo / 60;
  const phase = beat * Math.PI * 2;
  return {
    fretPressure: Math.max(0, Math.sin(phase * 0.5 + Math.PI * 0.25)),
    pickCurl: Math.max(0, Math.sin(phase)),
  };
};
