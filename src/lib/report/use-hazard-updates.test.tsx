import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHazardUpdates } from "./use-hazard-updates";

vi.mock("./realtime-client", () => ({ createPublicRealtimeClient: () => null }));

const cacheKey = "badger-live.community-reports.v1";
const report = {
  id: "00000000-0000-4000-8000-000000000001", kind: "ice", title: "Icy surface",
  coordinates: [-89.407, 43.071], placeId: null, locationMethod: "pin", locationAccuracyM: null,
  reportedSeverity: "unknown", observationLabel: "unverified", lifecycle: "active",
  observationCount: 1, observedAt: new Date().toISOString(), lastObservedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), version: 1,
};

afterEach(() => {
  localStorage.removeItem(cacheKey);
  vi.unstubAllGlobals();
});

describe("useHazardUpdates", () => {
  it("keeps recent public observations visible from the last successful refresh while offline", async () => {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), reports: [report] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 503 })));
    const { result } = renderHook(() => useHazardUpdates());

    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.stale).toBe(true);
  });

  it("discards expired and malformed cached reports", async () => {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), reports: [
      { ...report, expiresAt: new Date(Date.now() - 1000).toISOString() },
      { ...report, id: "invalid", coordinates: [0, 0] },
    ] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ reports: [] }), { status: 200 })));
    const { result } = renderHook(() => useHazardUpdates());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports).toEqual([]);
    expect(result.current.unavailable).toBe(false);
  });

  it("replaces cached observations after a successful refresh", async () => {
    const updated = { ...report, id: "00000000-0000-4000-8000-000000000002" };
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), reports: [report] }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ reports: [updated] }), { status: 200 })));
    const { result } = renderHook(() => useHazardUpdates());

    await waitFor(() => expect(result.current.reports[0]?.id).toBe(updated.id));
    expect(result.current.stale).toBe(false);
    expect(JSON.parse(localStorage.getItem(cacheKey) || "{}").reports[0].id).toBe(updated.id);
  });
});
