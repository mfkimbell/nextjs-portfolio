"use client";

import { useEffect, useState } from "react";
import {
  getResponsiveBreakpoint,
  RESPONSIVE_SCENE_LAYOUT,
  type ResponsiveBreakpoint,
} from "@/config/responsiveLayout";

export function useResponsiveLayout() {
  const [breakpoint, setBreakpoint] = useState<ResponsiveBreakpoint>("desktop");

  useEffect(() => {
    const update = () => setBreakpoint(getResponsiveBreakpoint(window.innerWidth));

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return {
    breakpoint,
    layout: RESPONSIVE_SCENE_LAYOUT[breakpoint],
  };
}
