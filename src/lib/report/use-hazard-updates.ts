"use client";

import { useCallback, useEffect, useState } from "react";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";
import { hazardKinds, type HazardReport } from "./types";
import { createPublicRealtimeClient } from "./realtime-client";
import { parseHazardInvalidation } from "./realtime-protocol";

const CAMPUS_BOUNDS = "-89.455,43.045,-89.375,43.095";
const CACHE_KEY = "badger-live.community-reports.v1";
const MAX_CACHE_AGE_MS = 24 * 60 * 60_000;

type CachedHazards = { savedAt: number; reports: HazardReport[] };

function readCachedHazards(): CachedHazards | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { savedAt?: unknown; reports?: unknown };
    if (typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)
      || Date.now() - value.savedAt > MAX_CACHE_AGE_MS || !Array.isArray(value.reports)) return null;
    const reports = value.reports.filter(isPublicHazard);
    return { savedAt: value.savedAt, reports };
  } catch { return null; }
}

function isPublicHazard(value: unknown): value is HazardReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Partial<HazardReport>;
  const [longitude, latitude] = Array.isArray(report.coordinates) ? report.coordinates : [];
  const expiresAt = typeof report.expiresAt === "string" ? Date.parse(report.expiresAt) : NaN;
  const observedAt = typeof report.observedAt === "string" ? Date.parse(report.observedAt) : NaN;
  const lastObservedAt = typeof report.lastObservedAt === "string" ? Date.parse(report.lastObservedAt) : NaN;
  return typeof report.id === "string" && report.id.length > 0
    && hazardKinds.includes(report.kind as typeof hazardKinds[number])
    && typeof report.title === "string" && report.observationLabel === "unverified"
    && typeof longitude === "number" && typeof latitude === "number"
    && isWithinCampusMapBounds([longitude, latitude])
    && typeof report.version === "number" && typeof report.observationCount === "number"
    && typeof report.lifecycle === "string" && ["active", "stale", "possibly_cleared"].includes(report.lifecycle)
    && Number.isFinite(expiresAt) && expiresAt > Date.now()
    && Number.isFinite(observedAt) && Number.isFinite(lastObservedAt);
}

function saveCachedHazards(reports: HazardReport[]) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), reports } satisfies CachedHazards)); }
  catch { /* Map data remains available for this session when browser storage is full or blocked. */ }
}

export function useHazardUpdates() {
  const [reports, setReports] = useState<HazardReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [stale, setStale] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/map/reports?bbox=${CAMPUS_BOUNDS}`, { cache: "no-store", signal });
      const body = await response.json() as { reports?: HazardReport[] };
      if (!response.ok || !Array.isArray(body.reports)) throw new Error("Community observations are unavailable");
      setReports(body.reports);
      saveCachedHazards(body.reports);
      setUnavailable(false);
      setStale(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const cached = readCachedHazards();
      if (cached) {
        setReports(cached.reports);
        setStale(true);
      }
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

  return { reports, loading, unavailable, stale, refresh };
}
