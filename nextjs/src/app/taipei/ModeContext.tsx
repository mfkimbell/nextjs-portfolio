"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Mode = "real" | "fake";

const ModeContext = createContext<{
  mode: Mode;
  setMode: (m: Mode) => void;
}>({ mode: "fake", setMode: () => {} });

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("fake");

  useEffect(() => {
    fetch("/api/taipei/mode")
      .then((r) => r.json())
      .then((data) => { if (data.mode === "real") setModeState("real"); });
  }, []);

  function setMode(m: Mode) {
    setModeState(m);
    fetch("/api/taipei/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: m }),
    });
  }

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
