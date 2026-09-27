"use client";

import { useCallback, useEffect, useState } from "react";
import type { HazardReport } from "./types";
import { createPublicRealtimeClient } from "./realtime-client";
import { parseHazardInvalidation } from "./realtime-protocol";

const CAMPUS_BOUNDS = "-89.455,43.045,-89.375,43.095";

export function useHazardUpdates() {
  const [reports, setReports] = useState<HazardReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/map/reports?bbox=${CAMPUS_BOUNDS}`, { cache: "no-store", signal });
      const body = await response.json() as { reports?: HazardReport[] };
      if (!response.ok || !Array.isArray(body.reports)) throw new Error("Community observations are unavailable");
      setReports(body.reports);
      setUnavailable(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setUnavailable(true);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const initialController = new AbortController();
    const initialTimer = window.setTimeout(() => void refresh(initialController.signal), 0);
    let debounceTimer: number | undefined;
    const refreshSoon = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void refresh(), 180);
    };
    const handleVisibility = () => { if (document.visibilityState === "visible") refreshSoon(); };
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 90_000);

    const client = createPublicRealtimeClient();
    const channel = client?.channel("campus:hazards", { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "hazard_changed" }, ({ payload }) => {
        if (!parseHazardInvalidation(payload)) return;
        refreshSoon();
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") refreshSoon(); });

    return () => {
      initialController.abort();
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.clearTimeout(debounceTimer);
      window.removeEventListener("focus", refreshSoon);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [refresh]);

  return { reports, loading, unavailable, refresh };
}
