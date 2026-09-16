"use client";

import { Component, Suspense, type ReactNode } from "react";

/**
 * Keeps one missing or broken model from taking down the whole canvas.
 *
 * useGLTF throws on a failed fetch, and an uncaught throw inside the R3F tree kills
 * the entire <Canvas> - so a single 404 on a prop blanks the site. Anything wrapped
 * here fails on its own and leaves the rest of the scene standing.
 */
class Boundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Worth seeing in the console - silently rendering nothing is its own kind of bug.
    console.warn(`[scene] "${this.props.label}" failed to load and was skipped:`, error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export default function SafeAsset({
  label,
  children,
}: {
  /** shown in the console warning when this fails */
  label: string;
  children: ReactNode;
}) {
  return (
    <Boundary label={label}>
      <Suspense fallback={null}>{children}</Suspense>
    </Boundary>
  );
}
