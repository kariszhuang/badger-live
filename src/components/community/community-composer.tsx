"use client";

import { useState, type FormEvent } from "react";
import { MapPin, Search, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { searchLocalCampusPlaces } from "@/lib/campus-place-catalog";
import { getVisitorId } from "@/lib/report/visitor-id";
import { communityKinds, communityKindLabels, type CommunityKind, type CommunityUpdate } from "@/lib/community/types";
import type { CampusPlace } from "@/lib/report/types";
import { CommunityIcon } from "./community-icon";

export function CommunityComposer({ open, onOpenChange, pinCoordinates, onChooseMapPoint, onPosted }: {
  open: boolean; onOpenChange: (open: boolean) => void; pinCoordinates: [number, number] | null;
  onChooseMapPoint: () => void; onPosted: (update: CommunityUpdate) => void;
}) {
  const [kind, setKind] = useState<CommunityKind>("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [place, setPlace] = useState<CampusPlace | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const results = placeQuery.trim().length >= 2 ? searchLocalCampusPlaces(placeQuery).slice(0, 5) : [];
  const coordinates = pinCoordinates || place?.coordinates || null;
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!coordinates) throw new Error("Choose a campus place or a map point.");
      const response = await fetch("/api/community", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), kind, title, description,
          placeName: pinCoordinates ? place?.name || "Selected campus point" : place?.name || "Selected campus point",
          coordinates, startsAt: kind === "event" && startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: kind === "event" && endsAt ? new Date(endsAt).toISOString() : null }),
      });
      const result = await response.json() as { update?: CommunityUpdate; error?: string };
      if (!response.ok || !result.update) throw new Error(result.error || "Could not post. Your draft is still here.");
      onPosted(result.update);
      setTitle(""); setDescription(""); setPlaceQuery(""); setPlace(null); setStartsAt(""); setEndsAt("");
      onOpenChange(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not post. Your draft is still here."); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="community-composer-dialog">
    <DialogHeader><span className="report-kicker"><MapPin size={14} /> UNOFFICIAL COMMUNITY POST</span><DialogTitle>Share a campus update</DialogTitle><DialogDescription>Posts appear on everyone&apos;s map after processing. Community ratings can hide inaccurate posts.</DialogDescription></DialogHeader>
    <form className="community-composer-form" onSubmit={(event) => void send(event)}>
      <div className="community-kind-grid" role="group" aria-label="Update type">{communityKinds.map((item) => <button type="button" key={item} className={kind === item ? "is-active" : ""} aria-pressed={kind === item} onClick={() => setKind(item)}><CommunityIcon kind={item} size={17} />{communityKindLabels[item]}</button>)}</div>
      <label>Title<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "event" ? "What is happening?" : "What is the condition?"} /></label>
      <label>Details<textarea required minLength={3} maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Share what people should know. Avoid names and private details." /></label>
      {kind === "event" && <div className="community-date-fields"><label>Starts<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Ends<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>}
      <div className="community-location"><label><Search size={15} />Campus place<input value={placeQuery} onChange={(event) => { setPlaceQuery(event.target.value); setPlace(null); }} placeholder="Search buildings" /></label><button type="button" onClick={onChooseMapPoint}><MapPin size={15} />Pick on map</button></div>
      {results.length > 0 && <div className="community-place-results">{results.map((item) => <button type="button" key={item.sourcePlaceId} onClick={() => { setPlace(item); setPlaceQuery(item.name); }}>{item.name}</button>)}</div>}
      {coordinates && <p className="community-selected-location"><MapPin size={14} />{pinCoordinates ? "Map point selected" : place?.name}</p>}
      {error && <p className="report-error" role="alert">{error}</p>}
      <p className="community-composer-note">Reports are screened before posting. Conditions are unverified; use official channels for emergencies.</p>
      <button type="submit" className="report-primary-button" disabled={busy || !coordinates}>{busy ? "Processing report…" : "Post to everyone’s map"}<Send size={15} /></button>
    </form>
  </DialogContent></Dialog>;
}
