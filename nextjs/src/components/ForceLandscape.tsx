"use client";

import { useEffect } from "react";

/**
 * Keeps the site in a landscape-shaped box however the phone is held.
 *
 * A web page cannot turn a device's orientation on iOS: `screen.orientation
 * .lock()` is Android-and-fullscreen only and is simply absent in iOS Safari,
 * and the manifest's `orientation` field applies to installed PWAs, which
 * Safari also ignores. So the page rotates instead of the device - the layout
 * is always the landscape one and the visitor turns the phone to read it.
 *
 * The box is sized entirely in CSS (see .force-landscape in globals.css), NOT
 * measured in JS. An earlier version read window.innerWidth/innerHeight once
 * and wrote pixels: on iOS the first layout happens with Safari's chrome
 * expanded, so it captured a short height, and when the bars collapsed the box
 * kept the stale number - which after rotation showed up as a black band along
 * the bottom of the screen. `dvh`/`dvw` track that collapse natively, so the
 * box follows the viewport with no listeners and nothing to go stale.
 */
export default function ForceLandscape({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Where a real lock IS available (Android, installed or fullscreen), take
    // it - then the CSS rotation never has to engage.
    void (async () => {
      try {
        const o = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        await o?.lock?.("landscape");
      } catch {
        // iOS, or Android outside fullscreen. Expected; the rotation covers it.
      }
    })();
  }, []);

  return <div className="force-landscape">{children}</div>;
}
