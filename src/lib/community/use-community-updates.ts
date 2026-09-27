"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicRealtimeClient } from "@/lib/report/realtime-client";
import type { CommunityUpdate } from "./types";

export function useCommunityUpdates() {
  const [updates, setUpdates] = useState<CommunityUpdate[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/community", { cache: "no-store" });
      const result = await response.json() as { updates?: CommunityUpdate[] };
      if (!response.ok || !Array.isArray(result.updates)) throw new Error("Community feed unavailable");
      setUpdates((current) => JSON.stringify(current) === JSON.stringify(result.updates) ? current : result.updates!);
      setUnavailable(false);
    } catch { setUnavailable(true); }
  }, []);
  const add = useCallback((update: CommunityUpdate) => {
    setUpdates((current) => [update, ...current.filter((item) => item.id !== update.id)]);
    void refresh();
  }, [refresh]);
  const updateVote = useCallback((id: string, result: { upVotes: number; downVotes: number; hidden: boolean }) => {
    setUpdates((current) => result.hidden ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, upVotes: result.upVotes, downVotes: result.downVotes } : item));
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    let debounce: number | undefined;
    const refreshSoon = () => { window.clearTimeout(debounce); debounce = window.setTimeout(() => void refresh(), 150); };
    const onVisible = () => { if (document.visibilityState === "visible") refreshSoon(); };
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(onVisible, 15_000);
    const client = createPublicRealtimeClient();
    const channel = client?.channel("campus:community", { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "community_changed" }, refreshSoon)
      .subscribe((status) => { if (status === "SUBSCRIBED") refreshSoon(); });
    return () => {
      window.clearTimeout(initial); window.clearTimeout(debounce); window.clearInterval(poll);
      window.removeEventListener("focus", refreshSoon); document.removeEventListener("visibilitychange", onVisible);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [refresh]);
  return { updates, unavailable, refresh, add, updateVote };
}
