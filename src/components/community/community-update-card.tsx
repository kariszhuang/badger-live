"use client";

import { useState } from "react";
import { ArrowUpRight, MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { getVisitorId } from "@/lib/report/visitor-id";
import { communityKindLabels, type CommunityUpdate } from "@/lib/community/types";
import { CommunityIcon } from "./community-icon";

export function CommunityUpdateCard({ update, selected = false, onSelect, onVote }: {
  update: CommunityUpdate; selected?: boolean; onSelect?: () => void;
  onVote: (id: string, result: { upVotes: number; downVotes: number; hidden: boolean }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const vote = async (choice: 1 | -1) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/community/${update.id}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), vote: choice }),
      });
      const result = await response.json() as { upVotes?: number; downVotes?: number; hidden?: boolean; error?: string };
      if (!response.ok || typeof result.upVotes !== "number" || typeof result.downVotes !== "number") throw new Error(result.error || "Rating unavailable");
      onVote(update.id, { upVotes: result.upVotes, downVotes: result.downVotes, hidden: result.hidden === true });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Rating unavailable"); }
    finally { setBusy(false); }
  };
  const eventTime = update.kind === "event" && update.startsAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(update.startsAt))
    : null;
  return <article className={`community-update-card kind-${update.kind} ${selected ? "is-selected" : ""}`}>
    <button type="button" className="community-update-main" onClick={onSelect} disabled={!onSelect} aria-label={`Show ${update.title} on map`}>
      <span className="community-update-icon"><CommunityIcon kind={update.kind} size={21} /></span>
      <span className="community-update-copy"><span className="community-update-meta">{communityKindLabels[update.kind]} · {update.isDemo ? "DEMO EXAMPLE" : "UNOFFICIAL"}</span><strong>{update.title}</strong><small><MapPin size={12} />{update.placeName}{eventTime ? ` · ${eventTime}` : ""}</small></span>
    </button>
    <p>{update.description}</p>
    {update.sourceUrl && <a href={update.sourceUrl} target="_blank" rel="noopener noreferrer">Event details <ArrowUpRight size={13} /></a>}
    <div className="community-update-footer"><span>{update.isDemo ? "Illustration only · not a live hazard" : "Community post · not UW verified"}</span><div className="community-votes"><button type="button" disabled={busy} aria-label={`Thumbs up for ${update.title}`} onClick={() => void vote(1)}><ThumbsUp size={15} />{update.upVotes}</button><button type="button" disabled={busy} aria-label={`Thumbs down for ${update.title}`} onClick={() => void vote(-1)}><ThumbsDown size={15} />{update.downVotes}</button></div></div>
    {error && <small className="community-vote-error" role="alert">{error}</small>}
  </article>;
}
