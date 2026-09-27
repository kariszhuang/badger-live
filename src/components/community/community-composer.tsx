"use client";

import { useState, type FormEvent } from "react";
import { Check, Crosshair, LocateFixed, Search, Send, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";
import { searchLocalCampusPlaces } from "@/lib/campus-place-catalog";
import { getVisitorId } from "@/lib/report/visitor-id";
import { communityKinds, communityKindLabels, type CommunityKind, type CommunityUpdate } from "@/lib/community/types";
import type { CampusPlace } from "@/lib/report/types";
import { CommunityIcon } from "./community-icon";

type Mode = "describe" | "fields";
type ParsedDraft = {
  kind: CommunityKind; title: string; description: string;
  place: { sourcePlaceId: string; name: string; coordinates: [number, number] } | null;
  startsAt: string | null; endsAt: string | null; needsMoreDetail: boolean;
};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function CommunityComposer({ open, onOpenChange, pinCoordinates, onChooseMapPoint, onClearPin, onPosted, describePoint }: {
  open: boolean; onOpenChange: (open: boolean) => void; pinCoordinates: [number, number] | null;
  onChooseMapPoint: () => void; onClearPin: () => void; onPosted: (update: CommunityUpdate) => void;
  describePoint: (coordinates: [number, number]) => string;
}) {
  const [mode, setMode] = useState<Mode>("describe");
  const [rawText, setRawText] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [kind, setKind] = useState<CommunityKind>("other");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [place, setPlace] = useState<CampusPlace | null>(null);
  const [gpsCoordinates, setGpsCoordinates] = useState<[number, number] | null>(null);
  const [locationChoice, setLocationChoice] = useState<"place" | "pin" | "gps" | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  const activeLocationChoice = pinCoordinates ? "pin" : locationChoice;
  const results = placeQuery.trim().length >= 2 && !place ? searchLocalCampusPlaces(placeQuery).slice(0, 5) : [];
  const coordinates = activeLocationChoice === "pin" ? pinCoordinates : activeLocationChoice === "gps" ? gpsCoordinates : place?.coordinates || null;
  const locationLabel = activeLocationChoice === "place" ? place?.name : coordinates ? describePoint(coordinates) : null;

  const useMyLocation = () => {
    setError("");
    if (!window.isSecureContext || !navigator.geolocation) { setError("Location needs HTTPS and browser location access."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setLocating(false);
      const point: [number, number] = [position.coords.longitude, position.coords.latitude];
      if (!isWithinCampusMapBounds(point)) { setError("You're outside the campus map. Search for a place or pick on the map."); return; }
      // Round public points to roughly 100 meters so a post never exposes a precise GPS fix.
      setGpsCoordinates([Number(point[0].toFixed(3)), Number(point[1].toFixed(3))]);
      setLocationChoice("gps");
      setPlace(null); setPlaceQuery(""); onClearPin();
    }, (reason) => {
      setLocating(false);
      setError(reason.code === 1 ? "Location access is off. Check browser settings or choose a place." : "Couldn't find your location. Search for a place or pick on the map.");
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15_000 });
  };

  const interpret = async () => {
    if (rawText.trim().length < 12) { setError("Describe what is happening in at least a sentence."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/community/interpret", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), text: rawText.trim() }),
      });
      const result = await response.json() as { draft?: ParsedDraft; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error || "Could not prepare the draft.");
      const draft = result.draft;
      setKind(draft.kind); setTitle(draft.title); setDescription(draft.description);
      setStartsAt(localDateTime(draft.startsAt)); setEndsAt(localDateTime(draft.endsAt));
      if (draft.place && !coordinates) {
        const match = searchLocalCampusPlaces(draft.place.name).find((item) => item.sourcePlaceId === draft.place?.sourcePlaceId);
        if (match) { setPlace(match); setPlaceQuery(match.name); setLocationChoice("place"); }
      }
      setDraftReady(true);
      if (draft.needsMoreDetail) setError("Add the missing details before posting. The draft is editable below.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not prepare the draft. Try Fill in fields."); }
    finally { setBusy(false); }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!coordinates || !locationLabel) { setError("Choose a campus place, use your location, or pick a point on the map."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/community", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), kind, title, description,
          placeName: locationLabel, coordinates,
          startsAt: kind === "event" && startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: kind === "event" && endsAt ? new Date(endsAt).toISOString() : null }),
      });
      const result = await response.json() as { update?: CommunityUpdate; error?: string };
      if (!response.ok || !result.update) throw new Error(result.error || "Could not post. Your draft is still here.");
      onPosted(result.update);
      setRawText(""); setDraftReady(false); setTitle(""); setDescription("");
      setPlaceQuery(""); setPlace(null); setGpsCoordinates(null); setLocationChoice(null); onClearPin();
      setStartsAt(""); setEndsAt(""); onOpenChange(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not post. Your draft is still here."); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="community-composer-dialog">
    <DialogHeader><span className="report-kicker"><Sparkles size={14} /> COMMUNITY UPDATE</span><DialogTitle>Share what’s happening</DialogTitle><DialogDescription>Review the details before your update appears on the campus map.</DialogDescription></DialogHeader>
    <div className="community-entry-modes" role="group" aria-label="How to create your update">
      <button type="button" aria-pressed={mode === "describe"} onClick={() => { setMode("describe"); setError(""); }}><Sparkles size={16} />Describe it</button>
      <button type="button" aria-pressed={mode === "fields"} onClick={() => { setMode("fields"); setError(""); }}><Check size={16} />Fill in fields</button>
    </div>
    <form className="community-composer-form" onSubmit={(event) => void send(event)}>
      {mode === "describe" && <div className="community-description-step">
        <label htmlFor="community-description">What should people know?</label>
        <textarea id="community-description" maxLength={1000} rows={4} value={rawText} onChange={(event) => { setRawText(event.target.value); setDraftReady(false); }} placeholder="Example: The walkway beside Science Hall is blocked by construction this afternoon." />
        {!draftReady && <button type="button" className="community-interpret-button" disabled={busy} onClick={() => void interpret()}><Sparkles size={17} />{busy ? "Preparing draft…" : "Review AI draft"}</button>}
      </div>}
      {(mode === "fields" || draftReady) && <>
        {mode === "describe" && <p className="community-review-cue"><Check size={15} />Review and edit anything the assistant filled in.</p>}
        <div className="community-kind-grid" role="group" aria-label="Update type">{communityKinds.map((item) => <button type="button" key={item} className={kind === item ? "is-active" : ""} aria-pressed={kind === item} onClick={() => setKind(item)}><CommunityIcon kind={item} size={17} />{communityKindLabels[item]}</button>)}</div>
        <label>Title<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short, specific title" /></label>
        <label>Details<textarea required minLength={3} maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should people know?" /></label>
        {kind === "event" && <div className="community-date-fields"><label>Starts<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Ends<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>}
      </>}
      <div className="community-location-picker">
        <div className="community-location-heading"><strong>Where is it?</strong><span>Choose one</span></div>
        <div className="community-location-options">
          <button type="button" className={locationChoice === "gps" ? "is-active" : ""} disabled={locating} onClick={useMyLocation}><LocateFixed size={17} />{locating ? "Locating…" : "My location"}</button>
          <button type="button" className={activeLocationChoice === "pin" ? "is-active" : ""} onClick={onChooseMapPoint}><Crosshair size={17} />Pick on map</button>
        </div>
        <label className="community-place-search"><Search size={17} /><span className="sr-only">Search campus places</span><input value={placeQuery} onChange={(event) => { setPlaceQuery(event.target.value); setPlace(null); setLocationChoice(null); if (pinCoordinates) onClearPin(); }} placeholder="Or search a campus place" /></label>
        {results.length > 0 && <div className="community-place-results">{results.map((item) => <button type="button" key={item.sourcePlaceId} onClick={() => { setPlace(item); setPlaceQuery(item.name); setLocationChoice("place"); setGpsCoordinates(null); if (pinCoordinates) onClearPin(); }}>{item.name}</button>)}</div>}
        {coordinates && locationLabel && <p className="community-selected-location"><span><Check size={15} /></span><span>{activeLocationChoice === "gps" ? "Approximate location" : activeLocationChoice === "pin" ? "Map point" : "Campus place"}<strong>{locationLabel}</strong></span></p>}
      </div>
      {error && <p className="report-error" role="alert">{error}</p>}
      {(mode === "fields" || draftReady) && <button type="submit" className="report-primary-button" disabled={busy || !coordinates}>{busy ? "Processing…" : "Post to campus map"}<Send size={17} /></button>}
    </form>
  </DialogContent></Dialog>;
}
