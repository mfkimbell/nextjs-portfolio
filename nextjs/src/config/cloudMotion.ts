export const CLOUD_MOTION_CONFIG = {
  horizontalDrift: {
    /**
     * Time for the smallest/farthest clouds to cross from off-screen left to
     * off-screen right. Higher = slower.
     */
    smallCloudDurationSec: 1800,

    /**
     * Time for the biggest/front clouds to cross the screen. Keep this a little
     * lower than smallCloudDurationSec so big clouds move slightly faster.
     */
    bigCloudDurationSec: 1320,

    /** Width range used to blend from small-cloud speed to big-cloud speed. */
    smallCloudWidthPx: 60,
    bigCloudWidthPx: 460,

    /** Extra space before/after the viewport so clouds enter and exit cleanly. */
    offscreenPaddingPx: 90,

    /** Staggers each cloud's starting point along the drift path. */
    delaySeedSec: 137,
  },
} as const;
