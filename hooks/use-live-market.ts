import { useCallback, useEffect, useRef, useState } from "react";
import { getApiHeaders } from "@/lib/api-config";
import type { LiveResult } from "@/lib/live";

const MAX_HISTORY = 50;
const REFRESH_INTERVAL = 30000;

export function useLiveMarket() {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<LiveResult | null>(null);
  const [history, setHistory] = useState<LiveResult[]>([]);
  const [now, setNow] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: getApiHeaders(),
        signal: controller.signal,
      });
      const result = (await response.json()) as LiveResult & {
        error?: string;
      };
      if (!response.ok) throw Error(result.error || "판단을 받지 못했습니다.");
      if (!controller.signal.aborted && mounted.current) {
        setData(result);
        setNow(Date.now());
        setHistory((items) => [result, ...items].slice(0, MAX_HISTORY));
      }
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current) {
        setError(cause instanceof Error ? cause.message : "연결에 실패했습니다.");
      }
    } finally {
      if (abort.current === controller) abort.current = null;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(tick);
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!document.hidden) await refresh();
      if (!disposed) timer = setTimeout(loop, REFRESH_INTERVAL);
    };
    void loop();
    return () => {
      disposed = true;
      clearTimeout(timer);
      abort.current?.abort();
    };
  }, [active, refresh]);

  const stale = !!data && now - data.observedAt > 90000;
  return {
    active,
    setActive,
    busy,
    error,
    data,
    history,
    now,
    refresh,
    stale,
    valid: !!data && !stale && !error,
  };
}
