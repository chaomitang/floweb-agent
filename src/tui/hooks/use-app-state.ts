import { useState } from "react";

export interface AppState {
  status: "idle" | "running" | "error";
  message: string;
}

export function useAppState() {
  const [state, setState] = useState<AppState>({
    status: "idle",
    message: "Ready",
  });

  return {
    state,
    setState,
    setStatus: (status: AppState["status"], message: string) =>
      setState({ status, message }),
  };
}
