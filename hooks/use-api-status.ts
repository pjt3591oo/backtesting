import { useCallback, useEffect, useState } from "react";

export function useApiStatus() {
  const [connected, setConnected] = useState(false);
  const [model, setModel] = useState("");
  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/status");
      const data = (await response.json()) as {
        connected: boolean;
        model?: string;
      };
      setConnected(data.connected);
      setModel(data.model ?? "");
    } catch {
      setConnected(false);
      setModel("");
    }
  }, []);

  useEffect(() => {
    const initialCheck = setTimeout(check, 0);
    const timer = setInterval(check, 15000);
    return () => {
      clearTimeout(initialCheck);
      clearInterval(timer);
    };
  }, [check]);

  return { connected, model };
}
