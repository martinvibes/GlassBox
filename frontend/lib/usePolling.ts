"use client";
import { useEffect, useRef, useState } from "react";

export function usePolling<T>(url: string, intervalMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const tick = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as T;
        if (live.current) {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (live.current) setError(String(e));
      } finally {
        if (live.current) setLoading(false);
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      live.current = false;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data, error, loading };
}
