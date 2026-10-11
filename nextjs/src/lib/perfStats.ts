/** Latest renderer numbers, written by CampfireScene's PerfProbe inside the
 *  canvas and read by the page-level PerfOverlay (which sits above the title
 *  screen and everything else). */
export const perfStats = {
  scene: "",
  gfx: "",
  calls: 0, tris: 0, lights: 0, shadowMaps: 0, shadowsThrottled: false,
  progs: 0, geoms: 0, textures: 0,
  w: 0, h: 0, dpr: 1, gpu: "",
  renderFps: 0,
  updatedAt: 0,
};
