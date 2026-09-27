"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Check, LocateFixed, MapPin, Navigation, RotateCcw, Search, ShieldAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CampusPlace, DuplicateCandidate, HazardKind, HazardReport, ReportLocation } from "@/lib/report/types";
import { getVisitorId, newSubmissionId, saveUndoCapabilities } from "@/lib/report/visitor-id";

type DuplicateIssue = { itemIndex: number; title: string; candidates: DuplicateCandidate[] };
type DuplicateDecision = { itemIndex: number; choice: "separate" | "same"; reportId?: string };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  pinCoordinates: [number, number] | null;
  onChooseMapPoint: () => void;
  onClearPin: () => void;
  onReportsPosted: (reports: HazardReport[]) => void;
  onViewReport: (report: HazardReport) => void;
};

type PostedResult = { outcome: "posted"; postedCount: number; reports: HazardReport[]; capabilities: Array<{ reportId: string; token: string }>; idempotent: boolean };

const kindLabels: Record<HazardKind, string> = {
  ice: "Ice", snow: "Snow", flooding: "Standing water", blocked_path: "Blocked walkway",
  broken_light: "Broken exterior light", accessibility_barrier: "Physical access barrier",
  construction_obstruction: "Construction obstruction", fallen_branch: "Fallen branch", other_physical: "Physical condition",
};

function errorText(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

function isTimeFollowup(question: string) {
  return /\bwhen did you see|when did you observe|what time\b/i.test(question);
}

function readFileAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not prepare that photo."));
    reader.onerror = () => reject(new Error("Could not prepare that photo."));
    reader.readAsDataURL(blob);
  });
}

async function preparePrivatePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not prepare the photo.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78 - attempt * 0.12));
      if (!blob) throw new Error("This browser could not prepare the photo.");
      if (blob.size <= 1_500_000) return await readFileAsDataUrl(blob);
      scale *= 0.75;
    }
  } finally { bitmap.close(); }
  throw new Error("Choose a smaller image under 1.5 MB after resizing.");
}

function requestCurrentPosition(onResult: (location: ReportLocation | null, message: string) => void) {
  if (!window.isSecureContext) { onResult(null, "GPS needs a secure HTTPS connection. Choose a map point or search for a place."); return () => undefined; }
  if (!navigator.geolocation) { onResult(null, "This browser does not provide GPS. Choose a map point or search for a place."); return () => undefined; }
  let active = true;
  navigator.geolocation.getCurrentPosition((position) => {
    if (!active) return;
    const { longitude, latitude, accuracy } = position.coords;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(accuracy)) {
      onResult(null, "Your location could not be read. Choose a map point or search for a place.");
      return;
    }
    onResult({ method: "gps", longitude, latitude, accuracyM: accuracy, capturedAt: position.timestamp }, accuracy > 80
      ? `GPS is approximate to about ${Math.round(accuracy)} m. Choose a map point for a more precise report.`
      : `Location ready · about ${Math.round(accuracy)} m accuracy`);
  }, (error) => {
    if (!active) return;
    const message = error.code === error.PERMISSION_DENIED
      ? "Location access is off. Choose a point on the map or search for a campus place."
      : "GPS did not respond. Choose a point on the map or search for a campus place.";
    onResult(null, message);
  }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 8_000 });
  return () => { active = false; };
}

export function ReportSheet({ open, onOpenChange, initialText = "", pinCoordinates, onChooseMapPoint, onClearPin, onReportsPosted, onViewReport }: Props) {
  const [text, setText] = useState(initialText);
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [location, setLocation] = useState<ReportLocation>();
  const [locationMessage, setLocationMessage] = useState("Requesting location…");
  const [locating, setLocating] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSearchResult, setPlaceSearchResult] = useState<{ query: string; places: CampusPlace[]; message: string } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<CampusPlace | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [followup, setFollowup] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateIssue[]>([]);
  const [decisions, setDecisions] = useState<DuplicateDecision[]>([]);
  const [receipt, setReceipt] = useState<PostedResult | null>(null);
  const generation = useRef(0);
  const gpsCleanup = useRef<(() => void) | null>(null);
  const requestFingerprint = useRef("");
  const activeSubmissionId = useRef("");
  const effectiveLocation = pinCoordinates
    ? { method: "pin" as const, longitude: pinCoordinates[0], latitude: pinCoordinates[1] }
    : selectedPlace ? { method: "place" as const, placeId: selectedPlace.id } : location;
  const normalizedPlaceQuery = placeQuery.trim();
  const activePlaceSearchResult = placeSearchResult?.query === normalizedPlaceQuery ? placeSearchResult : null;
  const visiblePlaceResults = normalizedPlaceQuery.length >= 2 ? activePlaceSearchResult?.places || [] : [];
  const placeSearchMessage = normalizedPlaceQuery.length < 2 ? "" : activePlaceSearchResult ? activePlaceSearchResult.message : "Searching campus places…";

  const requestGps = useCallback(() => {
    gpsCleanup.current?.();
    const requestNumber = ++generation.current;
    setLocating(true);
    setLocationMessage("Requesting location…");
    gpsCleanup.current = requestCurrentPosition((nextLocation, message) => {
      if (requestNumber !== generation.current) return;
      setLocation(nextLocation || undefined);
      setSelectedPlace(null);
      setLocationMessage(message);
      setLocating(false);
    });
  }, []);

  useEffect(() => {
    if (!open) { gpsCleanup.current?.(); return; }
    if (!pinCoordinates) {
      const timer = window.setTimeout(requestGps, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open, pinCoordinates, requestGps]);

  useEffect(() => {
    if (!open || !pinCoordinates) return;
    ++generation.current;
    gpsCleanup.current?.();
  }, [open, pinCoordinates]);

  useEffect(() => {
    const query = placeQuery.trim();
    if (!open || query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/places/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const result = await response.json() as { places?: CampusPlace[] };
          if (!response.ok) throw new Error("Campus place search is unavailable");
          const places = Array.isArray(result.places) ? result.places : [];
          setPlaceSearchResult({ query, places, message: places.length ? "" : "No campus places match. Choose a point on the map instead." });
        })
        .catch((reason) => {
          if (reason instanceof Error && reason.name !== "AbortError") {
            setPlaceSearchResult({ query, places: [], message: "Campus place search is unavailable. Choose a point on the map instead." });
          }
        });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, placeQuery]);

  const choosePlace = (place: CampusPlace) => {
    ++generation.current;
    gpsCleanup.current?.();
    setLocation({ method: "place", placeId: place.id });
    setSelectedPlace(place);
    setLocationMessage(`Campus place selected · ${place.name}`);
    setLocating(false);
    setPlaceQuery("");
    setFollowupAnswer("");
  };

  const chooseDecision = (decision: DuplicateDecision) => {
    setDecisions((current) => [...current.filter((item) => item.itemIndex !== decision.itemIndex), decision].sort((left, right) => left.itemIndex - right.itemIndex));
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoError("");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try { setPhoto(await preparePrivatePhoto(file)); }
    catch (reason) { setPhoto(null); setPhotoError(reason instanceof Error ? reason.message : "This photo could not be prepared."); }
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setFollowup("");
    setSending(true);
    const timeAnswer = isTimeFollowup(followup) ? followupAnswer.trim() : "";
    const combinedText = [text.trim(), timeAnswer].filter(Boolean).join("\n");
    if (timeAnswer) {
      setText(combinedText);
      setFollowupAnswer("");
    }
    const base = { mode: "report" as const, visitorId: getVisitorId(), text: combinedText, photo: photo || undefined, location: effectiveLocation, duplicateDecisions: decisions.length ? decisions : undefined };
    const fingerprint = JSON.stringify(base);
    if (fingerprint !== requestFingerprint.current) {
      requestFingerprint.current = fingerprint;
      activeSubmissionId.current = newSubmissionId();
    }
    try {
      const response = await fetch("/api/report/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, submissionId: activeSubmissionId.current }),
      });
      const result = await response.json() as Record<string, unknown>;
      if (result.outcome === "posted" && Array.isArray(result.reports) && Array.isArray(result.capabilities)) {
        const posted = result as unknown as PostedResult;
        saveUndoCapabilities(posted.capabilities);
        setReceipt(posted);
        setText("");
        setFollowupAnswer("");
        setPhoto(null);
        setDuplicates([]);
        setDecisions([]);
        setLocation(undefined);
        setSelectedPlace(null);
        requestFingerprint.current = "";
        onReportsPosted(posted.reports);
        return;
      }
      if (result.outcome === "needs_followup" && typeof result.question === "string") {
        setFollowup(result.question);
        setFollowupAnswer("");
        setError("");
        return;
      }
      if (result.outcome === "possible_duplicates" && Array.isArray(result.issues)) {
        setDuplicates(result.issues as DuplicateIssue[]);
        setDecisions([]);
        setFollowup("");
        return;
      }
      if (result.outcome === "not_published" && typeof result.message === "string") throw new Error(result.message);
      if (!response.ok) throw new Error(errorText(result, "The report could not be saved. Your draft is still here."));
      throw new Error("The report service returned an incomplete result. Your draft is still here.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The report could not be saved. Your draft is still here.");
    } finally { setSending(false); }
  };

  const undo = async (reportId: string) => {
    if (!receipt) return;
    const capability = receipt.capabilities.find((item) => item.reportId === reportId)?.token;
    if (!capability) return;
    try {
      const response = await fetch(`/api/report/${reportId}/undo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), capability }),
      });
      const result = await response.json() as { error?: string; undone?: boolean };
      if (!response.ok || !result.undone) throw new Error(result.error || "This report can no longer be undone.");
      setReceipt((current) => current ? { ...current, reports: current.reports.filter((report) => report.id !== reportId), capabilities: current.capabilities.filter((item) => item.reportId !== reportId), postedCount: Math.max(0, current.postedCount - 1) } : current);
      const { removeUndoCapability } = await import("@/lib/report/visitor-id");
      removeUndoCapability(reportId);
      onReportsPosted([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This report can no longer be undone."); }
  };

  const needsTime = isTimeFollowup(followup);
  const unresolvedCount = duplicates.filter((issue) => !decisions.some((decision) => decision.itemIndex === issue.itemIndex)).length;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="report-dialog">
      <DialogHeader className="report-dialog-header">
        <span className="report-kicker"><MapPin size={14} /> UNVERIFIED CAMPUS OBSERVATION</span>
        <DialogTitle>{receipt ? "Report posted" : "Report a campus condition"}</DialogTitle>
        <DialogDescription>{receipt ? "Your report is visible as an unverified community observation." : "Describe a visible physical condition. Your original message and photo are not published or saved."}</DialogDescription>
      </DialogHeader>

      {receipt ? <div className="report-receipt">
        <div className="report-receipt-summary"><span className="report-receipt-check"><Check size={19} /></span><div><strong>{receipt.postedCount} {receipt.postedCount === 1 ? "report" : "reports"} posted</strong><small>Unverified · anonymous browser observations</small></div></div>
        <div className="report-receipt-list">{receipt.reports.map((report) => <article className="report-receipt-card" key={report.id}>
          <div><strong>{report.title}</strong><small>{kindLabels[report.kind]} · Unverified · {report.locationMethod === "gps" ? "Approximate GPS" : report.locationMethod === "pin" ? "Map point" : "Campus place"}</small></div>
          <div className="report-receipt-actions"><button type="button" onClick={() => onViewReport(report)}>View on map</button>{receipt.capabilities.some((item) => item.reportId === report.id) && <button type="button" className="report-undo-button" onClick={() => void undo(report.id)}><RotateCcw size={13} />Undo</button>}</div>
        </article>)}</div>
        <p className="report-privacy-note">Undo is available in this browser for 30 minutes. Keep this tab open if you may need it.</p>
        {error && <p className="report-error" role="alert">{error}</p>}
        <button className="report-primary-button" type="button" onClick={() => { setReceipt(null); setError(""); requestGps(); }}>Report another condition</button>
      </div> : <form className="report-form" onSubmit={send}>
        <div className="report-location-block">
          <div className="report-location-heading"><div><span className="report-section-label">LOCATION</span><strong>{pinCoordinates ? "Map point selected · approximate" : locationMessage}</strong></div>{!pinCoordinates && <button className="report-icon-action" type="button" onClick={requestGps} disabled={locating} aria-label="Try GPS again"><LocateFixed size={17} /></button>}</div>
          {!pinCoordinates && selectedPlace && <div className="report-selected-place"><MapPin size={15} /><span>{selectedPlace.name}</span><button type="button" onClick={() => { setLocation(undefined); setSelectedPlace(null); setLocationMessage("Choose a map point or let a named place in your description resolve the location."); }} aria-label="Clear selected place"><X size={15} /></button></div>}
          {pinCoordinates && <div className="report-selected-place"><MapPin size={15} /><span>Map point · approximate</span><button type="button" onClick={() => { onClearPin(); setLocationMessage("Choose a map point or search for a campus place."); }} aria-label="Clear map point"><X size={15} /></button></div>}
          {!pinCoordinates && location?.method === "gps" && location.accuracyM > 80 && <p className="report-location-warning">GPS is too broad for a precise campus report. Search for a place or choose a point on the map.</p>}
          <div className="report-location-actions"><button className="report-secondary-button" type="button" onClick={onChooseMapPoint}><MapPin size={15} />Choose on map</button><label className="report-place-search"><Search size={15} /><input aria-label="Search a campus place" placeholder="Search campus places" value={placeQuery} onChange={(event) => setPlaceQuery(event.target.value)} /></label></div>
          {visiblePlaceResults.length > 0 && <div className="report-place-results" role="listbox" aria-label="Campus place results">{visiblePlaceResults.map((place) => <button type="button" role="option" aria-selected={false} key={place.id} onClick={() => choosePlace(place)}><span>{place.name}</span><small>{place.kind.replace("_", " ")}</small></button>)}</div>}
          {placeQuery.trim().length >= 2 && placeSearchMessage && <p className="report-place-status" role="status">{placeSearchMessage}</p>}
          {!effectiveLocation && !selectedPlace && <p className="report-location-hint">You can describe a trusted campus place by name instead. GPS is requested only after you open this form.</p>}
        </div>

        {followup && <div className="report-followup" role="status"><ShieldAlert size={17} /><div><strong>One detail is needed</strong><span>{followup}</span></div></div>}
        <label className="report-text-label" htmlFor="report-description"><span className="report-section-label">WHAT DID YOU SEE?</span><textarea id="report-description" rows={4} maxLength={2000} value={text} onChange={(event) => { setText(event.target.value); setDuplicates([]); setDecisions([]); }} placeholder="For example: Very icy near the east Van Vleck ramp" required /><small>{text.length}/2,000 · Physical campus conditions only</small></label>
        {followup && needsTime && <label className="report-time-followup"><span>When did you see it?</span><input value={followupAnswer} onChange={(event) => setFollowupAnswer(event.target.value)} placeholder="For example: about 20 minutes ago" required /></label>}
        <div className="report-photo-row"><label className="report-secondary-button report-photo-button"><Camera size={15} />Add private photo<input type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} /></label>{photo && <span><Check size={13} />Photo resized and private <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo"><X size={14} /></button></span>}</div>
        {photoError && <p className="report-error" role="alert">{photoError}</p>}

        {duplicates.length > 0 && <section className="report-duplicates" aria-label="Possible nearby reports"><div><span className="report-section-label">POSSIBLE NEARBY MATCH</span><p>Anonymous observations can repeat. Choose whether each item is the same condition.</p></div>{duplicates.map((issue) => <article key={issue.itemIndex}>
          <strong>{issue.title}</strong>
          {issue.candidates.map((candidate) => <button key={candidate.id} type="button" className={`report-duplicate-choice ${decisions.some((item) => item.itemIndex === issue.itemIndex && item.reportId === candidate.id && item.choice === "same") ? "is-selected" : ""}`} aria-pressed={decisions.some((item) => item.itemIndex === issue.itemIndex && item.reportId === candidate.id && item.choice === "same")} onClick={() => chooseDecision({ itemIndex: issue.itemIndex, choice: "same", reportId: candidate.id })}><span><b>{candidate.title}</b><small>{candidate.observationCount} anonymous observation{candidate.observationCount === 1 ? "" : "s"} · last seen {new Date(candidate.lastObservedAt).toLocaleString()}</small></span><span>Same issue</span></button>)}
          <button type="button" className={`report-separate-choice ${decisions.some((item) => item.itemIndex === issue.itemIndex && item.choice === "separate") ? "is-selected" : ""}`} aria-pressed={decisions.some((item) => item.itemIndex === issue.itemIndex && item.choice === "separate")} onClick={() => chooseDecision({ itemIndex: issue.itemIndex, choice: "separate" })}>This is a separate issue</button>
        </article>)}</section>}

        {error && <p className="report-error" role="alert">{error}</p>}
        <p className="report-privacy-note">Your text and optional photo are sent to OpenAI for analysis. Badger Live does not save them or show them publicly; only a templated issue, approximate location, and observation time are published. Reports are unverified.</p>
        <div className="report-footer-actions"><button type="button" className="report-cancel-button" onClick={() => onOpenChange(false)}>Cancel</button><button className="report-primary-button" type="submit" disabled={sending || !text.trim() || (duplicates.length > 0 && unresolvedCount > 0) || Boolean(followup && needsTime && !followupAnswer.trim())}>{sending ? <><span className="report-spinner" />Checking and sending…</> : duplicates.length ? "Confirm choices & send" : "Send report"}<Navigation size={15} /></button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
