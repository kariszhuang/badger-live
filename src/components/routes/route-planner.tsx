"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Clock3, MapPin, Navigation, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CampusPlace, HazardKind, HazardLifecycle } from "@/lib/report/types";
import { getVisitorId } from "@/lib/report/visitor-id";

export type PlannedWalkingRoute = {
  coordinates: Array<[longitude: number, latitude: number]>;
  distanceM: number;
  durationS: number;
};

type RouteWarning = {
  reportId: string;
  kind: HazardKind;
  title: string;
  lifecycle: HazardLifecycle;
  observationLabel: "unverified";
  observationCount: number;
  lastObservedAt: string;
  distanceM: number;
};

type Result = {
  route: PlannedWalkingRoute;
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  warnings: RouteWarning[];
  disclaimer: string;
};

function PlacePicker({ label, selected, onSelect }: { label: string; selected: CampusPlace | null; onSelect: (place: CampusPlace | null) => void }) {
  const [query, setQuery] = useState(selected?.name || "");
  const [searchResult, setSearchResult] = useState<{ query: string; places: CampusPlace[] } | null>(null);
  const [searchingQuery, setSearchingQuery] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<{ query: string; message: string } | null>(null);
  const normalizedQuery = query.trim();
  const searchPlaces = searchResult?.query === normalizedQuery && !selected ? searchResult.places : [];
  const places = searchPlaces.filter((place): place is CampusPlace & { id: string } => place.id !== null);
  const localOnly = searchPlaces.length > 0 && places.length === 0;
  const searching = searchingQuery === normalizedQuery && !selected;
  const error = searchError?.query === normalizedQuery && !selected ? searchError.message : "";

  useEffect(() => {
    if (selected && query === selected.name) return;
    if (normalizedQuery.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingQuery(normalizedQuery);
      setSearchError(null);
      void fetch(`/api/places/search?q=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as { places?: CampusPlace[]; error?: string };
          if (!response.ok || !Array.isArray(body.places)) throw new Error(body.error || "Campus place search is unavailable.");
          setSearchResult({ query: normalizedQuery, places: body.places });
        })
        .catch((reason) => {
          if (reason instanceof Error && reason.name !== "AbortError") setSearchError({ query: normalizedQuery, message: reason.message });
        })
        .finally(() => { if (!controller.signal.aborted) setSearchingQuery((current) => current === normalizedQuery ? null : current); });
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalizedQuery, query, selected]);

  const changeQuery = (value: string) => {
    setQuery(value);
    if (selected) onSelect(null);
  };

  return <div className="walking-route-place-picker">
    <label className="walking-route-field-label" htmlFor={`route-${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</label>
    <div className="walking-route-search-field">
      <Search size={16} aria-hidden="true" />
      <input
        id={`route-${label.toLowerCase().replaceAll(" ", "-")}`}
        value={query}
        onChange={(event) => changeQuery(event.target.value)}
        placeholder="Search campus buildings"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={places.length > 0}
        aria-controls={`route-${label.toLowerCase().replaceAll(" ", "-")}-results`}
        aria-label={label}
      />
      {query && <button type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => changeQuery("")}><X size={15} /></button>}
    </div>
    {searching && <span className="walking-route-search-status" role="status">Searching campus places…</span>}
    {error && <span className="walking-route-search-error" role="status">{error}</span>}
    {!searching && !error && query.trim().length >= 2 && !selected && places.length === 0 && <span className="walking-route-search-status" role="status">{localOnly ? "Route planning needs a live campus place connection." : "No matching campus places."}</span>}
    {places.length > 0 && !selected && <div id={`route-${label.toLowerCase().replaceAll(" ", "-")}-results`} className="walking-route-place-results" role="listbox" aria-label={`${label} matches`}>
      {places.map((place) => <button type="button" role="option" aria-selected="false" key={place.id} onClick={() => { onSelect(place); setQuery(place.name); }}>
        <MapPin size={15} aria-hidden="true" /><span><strong>{place.name}</strong><small>{place.kind === "entrance" ? "Campus entrance" : place.kind === "campus_area" ? "Campus area" : "Campus building"}</small></span>
      </button>)}
    </div>}
  </div>;
}

function friendlyError(body: unknown) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : "Couldn’t check that walking route. Please try again.";
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function RoutePlanner({ open, onOpenChange, onRouteChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRouteChange: (route: PlannedWalkingRoute | null) => void;
}) {
  const [origin, setOrigin] = useState<CampusPlace | null>(null);
  const [destination, setDestination] = useState<CampusPlace | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const canPlan = Boolean(origin?.id && destination?.id && origin.id !== destination.id && !loading);

  const clearRoute = () => {
    requestId.current += 1;
    setResult(null);
    setError("");
    setLoading(false);
    onRouteChange(null);
  };

  const planRoute = async () => {
    if (!origin?.id || !destination?.id || origin.id === destination.id || loading) return;
    const id = ++requestId.current;
    setResult(null);
    onRouteChange(null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/routes/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: getVisitorId(), originPlaceId: origin.id, destinationPlaceId: destination.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(friendlyError(body));
      if (!body || typeof body !== "object" || !("route" in body) || !("warnings" in body)
        || !Array.isArray(body.warnings) || !("disclaimer" in body) || typeof body.disclaimer !== "string"
        || !body.route || typeof body.route !== "object" || !("coordinates" in body.route) || !Array.isArray(body.route.coordinates)
        || body.route.coordinates.length < 2 || !("distanceM" in body.route) || typeof body.route.distanceM !== "number"
        || !("durationS" in body.route) || typeof body.route.durationS !== "number") {
        throw new Error("The walking directions response was incomplete. Please try again.");
      }
      const next = body as Result;
      if (id !== requestId.current) return;
      setResult(next);
      onRouteChange(next.route);
    } catch (reason) {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : "Couldn’t check that walking route. Please try again.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) {
      requestId.current += 1;
      setLoading(false);
      setError("");
    }
    onOpenChange(next);
  };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="walking-route-dialog" aria-describedby="walking-route-description">
      <DialogHeader className="walking-route-header">
        <span className="walking-route-eyebrow"><Navigation size={14} /> CAMPUS WALKING ROUTE</span>
        <DialogTitle>Check a route</DialogTitle>
        <DialogDescription id="walking-route-description">Choose two campus places to see a suggested walking path and current report intersections.</DialogDescription>
      </DialogHeader>

      <div className="walking-route-form">
        <PlacePicker label="From" selected={origin} onSelect={(place) => { setOrigin(place); setResult(null); setError(""); onRouteChange(null); }} />
        <PlacePicker label="To" selected={destination} onSelect={(place) => { setDestination(place); setResult(null); setError(""); onRouteChange(null); }} />
        <p className="walking-route-privacy">For directions, these two selected campus places are sent securely to OpenRouteService. Your GPS is never sent. Routes are suggestions and are not checked for step-free access or closures.</p>
        <button className="walking-route-submit" type="button" disabled={!canPlan} onClick={() => void planRoute()}>
          {loading ? <><span className="report-spinner" />Finding a walking path…</> : <>Check route <ArrowRight size={16} /></>}
        </button>
      </div>

      {error && <div className="walking-route-error" role="alert">{error}</div>}
      {result && <div className="walking-route-result" aria-live="polite">
        <div className="walking-route-result-summary"><div><span className="walking-route-eyebrow">SUGGESTED WALK</span><strong>{result.origin.name} <ArrowRight size={13} /> {result.destination.name}</strong></div><div className="walking-route-metrics"><span><Navigation size={14} />{formatDistance(result.route.distanceM)}</span><span><Clock3 size={14} />{formatDuration(result.route.durationS)}</span></div></div>
        {result.warnings.length > 0 ? <div className="walking-route-warnings" role="status">
          <h3><AlertTriangle size={16} /> Reported obstruction on this route</h3>
          <p>These are unverified community observations near the suggested path.</p>
          {result.warnings.map((warning) => <div className="walking-route-warning" key={warning.reportId}><strong>{warning.title}</strong><span>{warning.distanceM} m from route · {warning.observationCount} unverified observation{warning.observationCount === 1 ? "" : "s"}</span></div>)}
        </div> : <p className="walking-route-clear">No current community report intersects this path. That does not establish that it is safe, accessible, or unobstructed.</p>}
        <p className="walking-route-disclaimer">{result.disclaimer}</p>
        <div className="walking-route-result-actions"><button type="button" onClick={clearRoute}>Clear route</button><a href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer">Directions by OpenRouteService ↗</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap attribution ↗</a></div>
      </div>}
    </DialogContent>
  </Dialog>;
}
