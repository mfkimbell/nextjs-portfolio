import type { ReactNode } from "react";

export type DialoguePlaqueProps = {
  opacity: number;
  scale: number;
  borderOn: number;
  borderWidthPx: number;
  borderColor: string;
  blurPx: number;
  motionOn: number;
  waveAmplitude: number;
  waveSpeed: number;
  waveSpacing: number;
  roundness: number;
  minHeight: string;
  children: ReactNode;
};
