"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, Compass, ExternalLink, Layers, LocateFixed, MapPin, MapPinned, Plus, Search, Share2, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { chicagoDate, eventStatus, formatDay, isValidDate, shiftDate } from "@/lib/chicago-date";
import { categories, groupVenues, type CampusEvent, type FilterCategory } from "@/lib/events";
import { parseCampusBuildings, type CampusBuilding, type CampusBuildings } from "@/lib/campus-buildings";
import type { EventsResult } from "@/lib/uw-events-api";
import { EventCard } from "./event-card";

const CampusMap = dynamic(() => import("./campus-map").then((module) => module.CampusMap), { ssr: false, loading: () => <div className="map-loading"><span className="loading-orbit" /> Mapping campus…</div> });
type DayResponse = EventsResult & { date: string };
type SheetLevel = "peek" | "half" | "full";

export function Experience({ initialDate, initial, initialEvent, mapKey }: { initialDate: string; initial: EventsResult | null; initialEvent?: string; mapKey: string }) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<EventsResult | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(!initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FilterCategory>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialEvent || null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetLevel>("peek");
  const [fitSignal, setFitSignal] = useState(0);
  const [campusSignal, setCampusSignal] = useState(0);
  const [angledMap, setAngledMap] = useState(false);
  const [minuteTick, setMinuteTick] = useState(0);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locateError, setLocateError] = useState("");
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(false);
  const [copied, setCopied] = useState(false);
  const [buildings, setBuildings] = useState<CampusBuildings | null>(null);
  const [buildingError, setBuildingError] = useState(false);
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<CampusBuilding | null>(null);
  const [buildingQuery, setBuildingQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    if (date === initialDate) return;
    const controller = new AbortController();
    fetch(`/api/events?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Calendar unavailable"); return response.json() as Promise<DayResponse>; })
      .then((result) => { setData(result); setError(false); })
      .catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, initialDate]);

  useEffect(() => {
    const timer = window.setInterval(() => setMinuteTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/uw-campus-buildings.geojson", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Campus map unavailable"); return response.json() as Promise<unknown>; })
      .then((value) => setBuildings(parseCampusBuildings(value)))
      .catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setBuildingError(true); });
    return () => controller.abort();
  }, []);

  const updateUrl = useCallback((nextDate: string, eventId?: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDate);
    if (eventId) url.searchParams.set("event", eventId); else url.searchParams.delete("event");
    window.history.replaceState({}, "", url);
  }, []);

  const chooseDate = (value: string) => { if (!isValidDate(value)) return; setLoading(true); setError(false); setData(null); setSelectedId(null); setSelectedGroupId(null); setDate(value); updateUrl(value, null); };
  const chooseCategory = (value: FilterCategory) => { setCategory(value); setSelectedId(null); setSelectedGroupId(null); updateUrl(date, null); };
  const search = (value: string) => { setQuery(value); setSelectedId(null); setSelectedGroupId(null); updateUrl(date, null); };
  const events = useMemo(() => data?.events || [], [data]);
  const filtered = useMemo(() => events.filter((event) => {
    const categoryMatch = category === "all" || event.categories.includes(category);
    const needle = query.trim().toLocaleLowerCase();
    const searchMatch = !needle || [event.title, event.subtitle, event.venueName, event.locationLabel, event.description, ...event.tags].some((field) => field?.toLocaleLowerCase().includes(needle));
    return categoryMatch && searchMatch;
  }), [events, query, category]);
  const groups = useMemo(() => groupVenues(filtered), [filtered]);
  const statusTime = minuteTick ? new Date(minuteTick) : new Date();
  const liveGroupIds = groups.filter((group) => group.events.some((event) => eventStatus(event.startsAt, event.endsAt, date, statusTime) === "now")).map((group) => group.id);
  const mappedCount = filtered.filter((event) => event.coordinates).length;
  const unmapped = filtered.filter((event) => !event.coordinates);
  const selected = events.find((event) => event.id === selectedId || event.officialId === selectedId);
  const activeGroupId = selectedGroupId || groups.find((group) => group.events.some((event) => event.id === selected?.id))?.id || null;
  const selectedGroup = groups.find((group) => group.id === activeGroupId);
  const filteredBuildings = useMemo(() => {
    const needle = buildingQuery.trim().toLocaleLowerCase();
    return (buildings?.features || []).filter(({ properties: building }) => !needle || [building.name, building.shortDescription, building.buildingNumber, building.streetAddress].some((field) => field?.toLocaleLowerCase().includes(needle))).sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  }, [buildings, buildingQuery]);

  const selectBuilding = (building: CampusBuilding, coordinates = building.center) => {
    setSelectedBuilding(building);
    setBuildingDialogOpen(true);
    setFocus([...coordinates]);
  };

  const selectEvent = (event: CampusEvent) => {
    const next = selectedId === event.id ? null : event.id;
    setSelectedId(next);
    updateUrl(date, next);
    if (event.coordinates) {
      const group = groups.find((item) => item.events.some((itemEvent) => itemEvent.id === event.id));
      setSelectedGroupId(group?.id || null);
      setFocus([...event.coordinates]);
    }
    setSheet(next ? "half" : "peek");
  };

  const selectGroup = (id: string) => {
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    setSelectedGroupId(id);
    setSelectedId(null);
    setSheet("half");
    const card = document.getElementById(`event-${group.events[0].officialId}`);
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const share = async (event?: CampusEvent) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    if (event) url.searchParams.set("event", event.id); else url.searchParams.delete("event");
    try {
      if (navigator.share) await navigator.share({ title: event?.title || "Badger Live", url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }
    } catch { /* Dismissing the system share sheet is harmless. */ }
  };

  const locate = () => {
    setLocateError("");
    if (!window.isSecureContext) {
      setLocateError("Location requires HTTPS from another device on your local network; this page is HTTP. Open a trusted HTTPS URL to enable location access.");
      return;
    }
    const geolocation = navigator.geolocation;
    if (!geolocation) { setLocateError("Location is unavailable in this browser."); return; }
    if (locationRequest.current) return;

    locationRequest.current = true;
    setLocating(true);
    setLocateError("Requesting location permission and a fresh device position…");
    setUserLocation(null);

    const finish = () => {
      locationRequest.current = false;
      setLocating(false);
    };
    const showPosition = (position: GeolocationPosition) => {
      const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
      setUserLocation(coordinates);
      setFocus(coordinates);
      setLocateError("");
      finish();
    };
    const showError = (error: GeolocationPositionError, approximateAttempted = false) => {
      if (!approximateAttempted && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
        setLocateError("A precise location is taking too long; trying an approximate position…");
        try {
          geolocation.getCurrentPosition(showPosition, (fallbackError) => showError(fallbackError, true), {
            enableHighAccuracy: false,
            timeout: 12000,
            maximumAge: 0,
          });
          return;
        } catch { /* Fall through to the actionable location error. */ }
      }

      const message = error.code === error.PERMISSION_DENIED
        ? "Location permission was denied for this site. Enable Location in your browser’s site settings, then tap Locate me again."
        : error.code === error.POSITION_UNAVAILABLE
          ? "Your device couldn’t determine a location. Check device location services and try again."
          : error.code === error.TIMEOUT
            ? "Location took too long. Check GPS or network access, then tap Locate me to retry."
            : "Location is unavailable right now. Check browser and device location settings, then try again.";
      setLocateError(message);
      finish();
    };

    try {
      geolocation.getCurrentPosition(showPosition, showError, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
    } catch {
      setLocateError("Location is unavailable right now. Check browser and device location settings, then try again.");
      finish();
    }
  };

  const renderCards = (items: CampusEvent[]) => items.map((event) => <EventCard key={event.id} event={event} date={date} expanded={selected?.id === event.id} onSelect={() => selectEvent(event)} onShare={() => share(event)} />);

  return <main className="experience">
    <section className="map-panel" aria-label="Campus map">
      <CampusMap groups={groups} selectedGroupId={activeGroupId} liveGroupIds={liveGroupIds} angled={angledMap} onSelect={selectGroup} focus={focus} userLocation={userLocation} fitSignal={fitSignal} campusSignal={campusSignal} mapKey={mapKey} buildings={buildings} selectedBuildingId={selectedBuilding?.mapObjectId || null} onSelectBuilding={selectBuilding} />
      <div className="map-top-label"><span className="map-top-dot" /> UW–MADISON <span className="map-top-divider">/</span> MADISON, WI</div>
      <div className="building-map-legend"><span aria-hidden="true" />Campus buildings <small>· select for details</small></div>
      <div className="map-tools">
        <button aria-label="Locate me" title={locating ? "Requesting your location…" : "Request location (permission is requested on tap)"} aria-busy={locating} disabled={locating} className={locating ? "is-locating" : undefined} onClick={locate}><LocateFixed size={19} /></button>
        <button aria-label="Fit today's events" title="Fit events" onClick={() => setFitSignal((n) => n + 1)}><MapPinned size={19} /></button>
        <button aria-label={angledMap ? "Switch to 2D view" : "Switch to angled 3D view"} title={angledMap ? "2D map" : "Angled 3D map"} aria-pressed={angledMap} onClick={() => setAngledMap((value) => !value)}><Layers size={19} /></button>
        <button aria-label="Back to campus" title="Back to campus" onClick={() => setCampusSignal((n) => n + 1)}><Compass size={19} /></button>
      </div>
      {locateError && <div className="map-notice" role="status">{locateError}<button aria-label="Dismiss notice" onClick={() => setLocateError("")}><X size={14} /></button></div>}
    </section>

    <section className="discovery-panel" aria-label="Event discovery">
      <header className="discovery-header">
        <div className="brand-row"><span className="brand-symbol" aria-hidden="true"><span className="brand-symbol-inner" /></span><span className="brand-name">BADGER<span>LIVE</span></span><span className="brand-caption">THE CAMPUS, IN MOTION</span></div>
        <h1>Find your next<br /><em>campus moment.</em></h1>
        <p className="hero-subtitle">The living map of what’s happening around UW–Madison.</p>
        <label className="search-field"><Search size={19} aria-hidden="true" /><span className="sr-only">Search events</span><input placeholder="What's happening, Badgers?" value={query} onChange={(event) => search(event.target.value)} />{query && <button aria-label="Clear search" onClick={() => search("")}><X size={17} /></button>}</label>
        <div className="date-row">
          <button className="date-arrow" aria-label="Previous day" onClick={() => chooseDate(shiftDate(date, -1))}><ArrowLeft size={18} /></button>
          <label className="date-display"><CalendarDays size={18} /><span>{date === chicagoDate() ? "Today · " : ""}{formatDay(date)}</span><input aria-label="Choose date" type="date" value={date} onChange={(event) => chooseDate(event.target.value)} /></label>
          <button className="date-arrow" aria-label="Next day" onClick={() => chooseDate(shiftDate(date, 1))}><ArrowRight size={18} /></button>
        </div>
        <div className="filter-row" role="group" aria-label="Filter events by interest">{categories.map((item) => <button key={item} className={`filter-chip ${category === item ? "active" : ""}`} aria-pressed={category === item} onClick={() => chooseCategory(item)}>{item === "all" ? "All events" : item === "talks" ? "Talks" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <button className="building-directory-trigger" onClick={() => { setSelectedBuilding(null); setBuildingQuery(""); setBuildingDialogOpen(true); }}><Building2 size={16} /><span>Explore campus buildings</span><span className="building-directory-count">{buildings ? buildings.features.length : "…"}</span><ArrowRight size={15} /></button>
      </header>

      <div className="events-heading"><div><span className="eyebrow">ON CAMPUS</span><h2>{date === chicagoDate() ? "Today’s discoveries" : formatDay(date)}</h2></div><button className="share-button" onClick={() => share()} aria-label="Share this date">{copied ? <Check size={17} /> : <Share2 size={17} />}</button></div>
      <p className="count-line">{loading ? "Loading official calendar…" : error ? "Calendar unavailable" : `${filtered.length} events · ${mappedCount} on map · ${unmapped.length} without map locations`}{data && !error && <span className="cache-note">{data.cacheStatus === "supabase" ? `Saved in local Supabase · synced ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(data.fetchedAt))}${data.stale ? " · stale copy" : ""}` : data.cacheStatus === "snapshot" ? "Verified offline snapshot" : "Live UW calendar"}</span>}</p>
      {data?.fallback && <div className="snapshot-notice" role="status">UW calendar is unavailable. {data.snapshotCapturedAt ? `Showing a verified snapshot captured ${new Date(data.snapshotCapturedAt).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })}.` : `Showing the saved campus calendar last refreshed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(data.fetchedAt))}.`}</div>}
      {error && <div className="error-state" role="alert"><h3>We couldn’t load the UW calendar.</h3><p>Please try another date or check back shortly. No events have been invented.</p></div>}
      {!loading && !error && filtered.length === 0 && <div className="empty-state"><Sparkles size={27} /><h3>No matches this time.</h3><p>Try another interest, search term, or date.</p><button onClick={() => { chooseCategory("all"); search(""); }}>Clear filters</button></div>}
      <div className="events-scroll" ref={listRef}>
        {selectedGroup && <div className="venue-banner"><span className="eyebrow">SELECTED VENUE</span><strong>{selectedGroup.name}</strong><span>{selectedGroup.events.length} separate {selectedGroup.events.length === 1 ? "event" : "events"} here</span></div>}
        {renderCards(filtered.filter((event) => event.coordinates))}
        {unmapped.length > 0 && <section className="unmapped-section"><h3>Locations not mapped</h3><p>These UW events have no verified map coordinates. Their official listings are still available.</p>{renderCards(unmapped)}</section>}
      <p className="source-footer">EVENT DATA FROM <a href="https://today.wisc.edu/" target="_blank" rel="noopener noreferrer">UW TODAY ↗</a><br />Independent student project · Not an official UW service</p>
      </div>
      <Dialog><DialogTrigger asChild><button className="add-button" aria-label="Post an event or report"><Plus size={24} /></button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>More ways to share campus life are coming.</DialogTitle></DialogHeader><p>Student events and temporary campus reports are planned for a future release. For now, every listing here comes from UW’s official public calendar.</p></DialogContent></Dialog>
    </section>

    <Dialog open={buildingDialogOpen} onOpenChange={(open) => { setBuildingDialogOpen(open); if (!open) setSelectedBuilding(null); }}>
      <DialogContent className="building-dialog">
        {selectedBuilding ? <>
          <button className="building-back" onClick={() => setSelectedBuilding(null)}><ArrowLeft size={15} /> All campus buildings</button>
          <div className="building-detail-icon"><Building2 size={23} /></div>
          <DialogHeader><DialogTitle>{selectedBuilding.name}</DialogTitle><DialogDescription>{[selectedBuilding.buildingNumber ? `FP&M #${selectedBuilding.buildingNumber}` : null, selectedBuilding.streetAddress].filter(Boolean).join(" · ") || "On the UW–Madison campus"}</DialogDescription></DialogHeader>
          <p className="building-description">{selectedBuilding.shortDescription}</p>
          {selectedBuilding.hours && <p className="building-hours"><span>Hours</span>{selectedBuilding.hours}</p>}
          <a className="building-official-link" href={selectedBuilding.officialMapUrl} target="_blank" rel="noopener noreferrer">Open on campus map <ExternalLink size={15} /></a>
        </> : <>
          <DialogHeader><DialogTitle>Explore UW–Madison buildings</DialogTitle><DialogDescription>{buildings ? `${buildings.features.length} mapped UW campus buildings and complexes. Select a result to highlight it on the map.` : buildingError ? "The campus building directory could not be loaded." : "Loading the official campus building directory…"}</DialogDescription></DialogHeader>
          {!buildingError && <label className="building-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search campus buildings</span><input autoFocus placeholder="Search buildings, places, or uses" value={buildingQuery} onChange={(event) => setBuildingQuery(event.target.value)} /></label>}
          <ul className="building-directory-list" aria-label="UW campus buildings">
            {filteredBuildings.map(({ properties: building }) => <li key={building.mapObjectId}><button className="building-directory-item" onClick={() => selectBuilding(building)}>
              <span className="building-list-icon"><Building2 size={17} /></span><span className="building-list-copy"><strong>{building.name}</strong><small>{building.shortDescription}</small></span><MapPin size={15} />
            </button></li>)}
            {buildings && filteredBuildings.length === 0 && <li className="building-empty">No buildings match that search.</li>}
          </ul>
        </>}
      </DialogContent>
    </Dialog>

    <section className={`mobile-sheet sheet-${sheet}`} aria-label="Event list" onKeyDown={(event) => { if (event.key === "Escape") { setSheet("peek"); setSelectedId(null); } }}>
      <div className="sheet-handle-zone" onPointerDown={(event) => { dragStart.current = event.clientY; }} onPointerUp={(event) => {
        if (dragStart.current === null) return;
        const delta = event.clientY - dragStart.current;
        if (delta < -45) setSheet(sheet === "peek" ? "half" : "full");
        if (delta > 45) setSheet(sheet === "full" ? "half" : "peek");
        dragStart.current = null;
      }}><button className="sheet-grip" aria-label={sheet === "peek" ? "Expand event list" : "Collapse event list"} onClick={() => setSheet(sheet === "peek" ? "half" : "peek")} /></div>
      <div className="sheet-topline"><div><span className="eyebrow">{selectedGroup ? "AT THIS VENUE" : "UW OFFICIAL CALENDAR"}</span><h2>{selectedGroup?.name || `${filtered.length} things happening`}</h2><p>{data?.fallback ? "Verified snapshot · live UW calendar unavailable" : selectedGroup ? `${selectedGroup.events.length} separate events` : `${mappedCount} on map · ${unmapped.length} without map locations`}</p></div><button aria-label="Close venue selection" onClick={() => { setSelectedGroupId(null); setSelectedId(null); setSheet("peek"); }}><X size={18} /></button></div>
      <div className="sheet-scroll">{error ? <p>UW calendar is temporarily unavailable.</p> : filtered.length === 0 ? <p>No events match your filters.</p> : <>{renderCards(selectedGroup ? selectedGroup.events : filtered.filter((event) => event.coordinates))}{!selectedGroup && unmapped.length > 0 && <div className="unmapped-section"><h3>Locations not mapped</h3>{renderCards(unmapped)}</div>}</>}</div>
    </section>
  </main>;
}
