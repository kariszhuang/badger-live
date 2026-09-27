"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Compass, Layers, LocateFixed, MapPinned, Navigation, Share2, ShieldAlert, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chicagoDate, eventStatus, formatDay, isValidDate, shiftDate } from "@/lib/chicago-date";
import { availableCategoriesForSearch, groupVenues, type CampusEvent, type FilterCategory } from "@/lib/events";
import { crimeCategories, filterCrimeIncidents, groupCrimeLocations, groupUnmappedCrimeLocations, type CrimeCategory, type OfficialCrimeIncident } from "@/lib/crime-model";
import type { CommunitySafetyReport } from "@/lib/safety";
import { parseCampusBuildings, type CampusBuilding, type CampusBuildings } from "@/lib/campus-buildings";
import { campusEventsAtBuilding, googleMapsDirectionsUrl } from "@/lib/campus-building-events";
import type { EventsResult } from "@/lib/uw-events-api";
import { readClientEventDay, writeClientEventDay, type ClientEventDayCache } from "@/lib/client-event-day-cache";
import { EventCard } from "./event-card";
import { CampusBuildingPhoto } from "./campus-building-photo";
import { SafetyCenter } from "./safety-center";
import { type DiscoveryMode } from "./mode-switcher";
import { DiscoveryToolbar } from "./discovery-toolbar";
import { CrimeReportCard } from "./crime-report-card";

const CampusMap = dynamic(() => import("./campus-map").then((module) => module.CampusMap), { ssr: false, loading: () => <div className="map-loading"><span className="loading-orbit" /> Mapping campus…</div> });
type DayResponse = EventsResult & { date: string };
type CrimeResponse = { incidents: OfficialCrimeIncident[]; fetchedAt: string; windowDays: 14 | 30; windowStart: string; windowEnd: string; latestArticleDate: string | null; partial: boolean; error?: string };
type SheetLevel = "closed" | "half" | "full";
type SafetyStartView = "official" | "community" | "report";

export function Experience({ initialDate, initial, initialEvent, initialMode = "events", mapKey }: { initialDate: string; initial: EventsResult | null; initialEvent?: string; initialMode?: DiscoveryMode; mapKey: string }) {
  const [date, setDate] = useState(initialDate);
  const [mode, setMode] = useState<DiscoveryMode>(initialMode);
  const [data, setData] = useState<EventsResult | null>(initial);
  const dayCache = useRef<ClientEventDayCache<DayResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(!initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FilterCategory>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialEvent || null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [crimeData, setCrimeData] = useState<CrimeResponse | null>(null);
  const [crimeLoading, setCrimeLoading] = useState(false);
  const [crimeError, setCrimeError] = useState("");
  const [crimeWindow, setCrimeWindow] = useState<14 | 30>(30);
  const [crimeRefresh, setCrimeRefresh] = useState(0);
  const [crimeQuery, setCrimeQuery] = useState("");
  const [crimeCategory, setCrimeCategory] = useState<CrimeCategory | "all">("all");
  const [selectedCrimeGroupId, setSelectedCrimeGroupId] = useState<string | null>(null);
  const [selectedCrimeIncidentId, setSelectedCrimeIncidentId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetLevel>("closed");
  const [fitSignal, setFitSignal] = useState(0);
  const [autoFitSignal, setAutoFitSignal] = useState(0);
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
  const [selectedBuilding, setSelectedBuilding] = useState<CampusBuilding | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyStartView, setSafetyStartView] = useState<SafetyStartView>("official");
  const [safetyReports, setSafetyReports] = useState<CommunitySafetyReport[]>([]);
  const [safetyReportsLoading, setSafetyReportsLoading] = useState(true);
  const [safetyReportsUnavailable, setSafetyReportsUnavailable] = useState(false);
  const [selectedSafetyReportId, setSelectedSafetyReportId] = useState<string | null>(null);
  const [safetyOpenKey, setSafetyOpenKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);

  const refreshSafetyReports = useCallback(async () => {
    try {
      const response = await fetch("/api/safety/reports", { cache: "no-store" });
      const result = await response.json() as { reports?: CommunitySafetyReport[] };
      if (!response.ok || !Array.isArray(result.reports)) throw new Error("Community reports are unavailable");
      setSafetyReports(result.reports);
      setSafetyReportsUnavailable(false);
    } catch {
      setSafetyReports([]);
      setSafetyReportsUnavailable(true);
    } finally {
      setSafetyReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void refreshSafetyReports(), 0);
    const timer = window.setInterval(() => void refreshSafetyReports(), 90_000);
    return () => { window.clearTimeout(initialFetch); window.clearInterval(timer); };
  }, [refreshSafetyReports]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void refreshSafetyReports(), 0);
    const timer = window.setInterval(() => void refreshSafetyReports(), 90_000);
    return () => { window.clearTimeout(initialFetch); window.clearInterval(timer); };
  }, [refreshSafetyReports]);

  useEffect(() => {
    if (initial) writeClientEventDay(dayCache.current, initialDate, { ...initial, date: initialDate });
  }, [initial, initialDate]);

  useEffect(() => {
    const cached = readClientEventDay(dayCache.current, date);
    if (cached) {
      setData(cached);
      setError(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/events?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Calendar unavailable"); return response.json() as Promise<DayResponse>; })
      .then((result) => {
        if (controller.signal.aborted) return;
        writeClientEventDay(dayCache.current, date, result);
        setData(result);
        setError(false);
      })
      .catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date]);

  useEffect(() => {
    if (mode !== "crime") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCrimeLoading(true);
      setCrimeError("");
      void fetch(`/api/safety/crimes?days=${crimeWindow}`, { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as CrimeResponse;
          if (!response.ok || !Array.isArray(result.incidents)) throw new Error(result.error || "UWPD blotter is unavailable");
          return result;
        })
        .then(setCrimeData)
        .catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setCrimeError(reason.message || "UWPD blotter is unavailable"); })
        .finally(() => { if (!controller.signal.aborted) setCrimeLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, crimeWindow, crimeRefresh]);

  useEffect(() => {
    if (mode !== "crime") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCrimeLoading(true);
      setCrimeError("");
      void fetch(`/api/safety/crimes?days=${crimeWindow}`, { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as CrimeResponse;
          if (!response.ok || !Array.isArray(result.incidents)) throw new Error(result.error || "UWPD blotter is unavailable");
          return result;
        })
        .then(setCrimeData)
        .catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setCrimeError(reason.message || "UWPD blotter is unavailable"); })
        .finally(() => { if (!controller.signal.aborted) setCrimeLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, crimeWindow, crimeRefresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setMinuteTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/uw-campus-buildings.geojson", { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Campus map unavailable"); return response.json() as Promise<unknown>; })
      .then((value) => setBuildings(parseCampusBuildings(value)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const updateUrl = useCallback((nextDate: string, eventId?: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDate);
    if (eventId) url.searchParams.set("event", eventId); else url.searchParams.delete("event");
    window.history.replaceState({}, "", url);
  }, []);

  const changeMode = (next: DiscoveryMode) => {
    setMode(next);
    setSelectedCrimeGroupId(null);
    setSelectedCrimeIncidentId(null);
    setSelectedId(null);
    setSelectedGroupId(null);
    setSheet("closed");
    const url = new URL(window.location.href);
    if (next === "crime") url.searchParams.set("mode", "crime"); else url.searchParams.delete("mode");
    url.searchParams.delete("event");
    window.history.replaceState({}, "", url);
  };

  const chooseDate = (value: string) => { if (!isValidDate(value)) return; setLoading(true); setError(false); setData(null); setSelectedId(null); setSelectedGroupId(null); setCategory("all"); setSheet("closed"); setDate(value); setAutoFitSignal((signal) => signal + 1); updateUrl(value, null); };
  const chooseCategory = (value: FilterCategory) => { setCategory(value); setSelectedId(null); setSelectedGroupId(null); setAutoFitSignal((signal) => signal + 1); updateUrl(date, null); };
  const events = useMemo(() => data?.events || [], [data]);
  const availableEventCategories = useMemo(() => availableCategoriesForSearch(events, query), [events, query]);
  const search = (value: string) => {
    setQuery(value);
    if (category !== "all" && !availableCategoriesForSearch(events, value).includes(category)) setCategory("all");
    setSelectedId(null);
    setSelectedGroupId(null);
    setAutoFitSignal((signal) => signal + 1);
    updateUrl(date, null);
  };
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
  const filteredCrimes = useMemo(() => filterCrimeIncidents(crimeData?.windowDays === crimeWindow ? crimeData.incidents : [], crimeCategory, crimeQuery), [crimeData, crimeCategory, crimeQuery, crimeWindow]);
  const availableCrimeCategories = useMemo(() => crimeCategories.filter((item) => crimeData?.windowDays === crimeWindow && crimeData.incidents.some((incident) => incident.category === item)), [crimeData, crimeWindow]);
  const crimeGroups = useMemo(() => groupCrimeLocations(filteredCrimes), [filteredCrimes]);
  const unmappedCrimeGroups = useMemo(() => groupUnmappedCrimeLocations(filteredCrimes), [filteredCrimes]);
  const selectedCrimeGroup = crimeGroups.find((group) => group.id === selectedCrimeGroupId);
  const mappedCrimeCount = filteredCrimes.filter((incident) => incident.coordinates).length;
  const unmappedCrimeCount = filteredCrimes.length - mappedCrimeCount;
  const buildingEvents = useMemo(() => selectedBuilding ? campusEventsAtBuilding(events, selectedBuilding) : [], [events, selectedBuilding]);

  const selectBuilding = (building: CampusBuilding, coordinates = building.center) => {
    setSelectedBuilding(building);
    setFocus([...coordinates]);
  };

  const chooseCrimeWindow = (days: 14 | 30) => {
    setCrimeWindow(days);
    setCrimeData(null);
    setCrimeCategory("all");
    setSelectedCrimeGroupId(null);
    setSelectedCrimeIncidentId(null);
    setSheet("closed");
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
    if (!next) setSelectedGroupId(null);
    setSheet(next ? "half" : "closed");
  };

  const openSafetyReport = (reportId: string) => {
    const report = safetyReports.find((item) => item.id === reportId);
    if (report) setFocus([...report.coordinates]);
    setSelectedSafetyReportId(reportId);
    setSafetyStartView("community");
    setSafetyOpenKey((key) => key + 1);
    setSafetyOpen(true);
  };

  const openSafetyCenter = (view: SafetyStartView = "official") => {
    setSafetyStartView(view);
    setSafetyOpenKey((key) => key + 1);
    setSafetyOpen(true);
  };

  const openSafetyReport = (reportId: string) => {
    const report = safetyReports.find((item) => item.id === reportId);
    if (report) setFocus([...report.coordinates]);
    setSelectedSafetyReportId(reportId);
    setSafetyStartView("community");
    setSafetyOpenKey((key) => key + 1);
    setSafetyOpen(true);
  };

  const openSafetyCenter = (view: SafetyStartView = "official") => {
    setSafetyStartView(view);
    setSafetyOpenKey((key) => key + 1);
    setSafetyOpen(true);
  };

  const selectGroup = (id: string) => {
    const group = groups.find((item) => item.id === id);
    if (!group) return;
    setSelectedGroupId(id);
    setSelectedId(null);
    setSheet("half");
    setFocus([...group.coordinates]);
    const card = document.getElementById(`event-${group.events[0].officialId}`);
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const selectCrimeGroup = (id: string) => {
    const group = crimeGroups.find((item) => item.id === id);
    if (!group) return;
    setSelectedCrimeGroupId(id);
    setSelectedCrimeIncidentId(null);
    setSelectedId(null);
    setSheet("half");
    setFocus([...group.coordinates]);
    document.getElementById(`crime-${group.incidents[0]?.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const selectCrimeIncident = (incident: OfficialCrimeIncident) => {
    setSelectedCrimeIncidentId((current) => current === incident.id ? null : incident.id);
    if (incident.buildingId && incident.coordinates) {
      setSelectedCrimeGroupId(incident.buildingId);
      setFocus([...incident.coordinates]);
    } else setSelectedCrimeGroupId(null);
    setSelectedId(null);
    setSheet("half");
  };

  const toggleResultList = () => {
    if (sheet !== "closed") {
      setSheet("closed");
      setSelectedGroupId(null);
      setSelectedId(null);
      setSelectedCrimeGroupId(null);
      setSelectedCrimeIncidentId(null);
      if (selectedId) updateUrl(date, null);
      return;
    }
    setSelectedGroupId(null);
    setSelectedId(null);
    setSelectedCrimeGroupId(null);
    setSelectedCrimeIncidentId(null);
    setSheet("half");
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
  const renderCrimeCards = (items: OfficialCrimeIncident[]) => items.map((incident) => <CrimeReportCard key={incident.id} incident={incident} selected={selectedCrimeIncidentId === incident.id} onSelect={() => selectCrimeIncident(incident)} />);

  return <main className={`experience ${sheet !== "closed" ? "has-open-sheet" : ""}`}>
    <section className="map-panel" aria-label="Campus map">
      <CampusMap groups={mode === "events" ? groups : []} selectedGroupId={mode === "events" ? activeGroupId : null} liveGroupIds={mode === "events" ? liveGroupIds : []} crimeGroups={mode === "crime" ? crimeGroups : []} selectedCrimeGroupId={mode === "crime" ? selectedCrimeGroupId : null} onSelectCrimeGroup={selectCrimeGroup} safetyReports={mode === "events" ? safetyReports : []} selectedSafetyReportId={selectedSafetyReportId} onSelectSafetyReport={openSafetyReport} angled={angledMap} onSelect={selectGroup} focus={focus} sheetLevel={sheet} userLocation={userLocation} fitSignal={fitSignal} autoFitSignal={autoFitSignal} campusSignal={campusSignal} mapKey={mapKey} buildings={buildings} selectedBuildingId={selectedBuilding?.mapObjectId || null} onSelectBuilding={selectBuilding} />
      <div className="map-tools">
        <button aria-label="Locate me" title={locating ? "Requesting your location…" : "Request location (permission is requested on tap)"} aria-busy={locating} disabled={locating} className={locating ? "is-locating" : undefined} onClick={locate}><LocateFixed size={19} /></button>
        <button aria-label={mode === "crime" ? "Fit mapped police blotter locations" : "Fit today's events"} title={mode === "crime" ? "Fit blotter locations" : "Fit events"} onClick={() => setFitSignal((n) => n + 1)}><MapPinned size={19} /></button>
        <button aria-label={angledMap ? "Switch to 2D view" : "Switch to angled 3D view"} title={angledMap ? "2D map" : "Angled 3D map"} aria-pressed={angledMap} onClick={() => setAngledMap((value) => !value)}><Layers size={19} /></button>
        <button aria-label="Back to campus" title="Back to campus" onClick={() => setCampusSignal((n) => n + 1)}><Compass size={19} /></button>
        <button aria-label="Safety alerts and resources" title="Safety alerts and resources" onClick={() => openSafetyCenter()}><ShieldAlert size={19} /></button>
      </div>
      {locateError && <div className="map-notice" role="status">{locateError}<button aria-label="Dismiss notice" onClick={() => setLocateError("")}><X size={14} /></button></div>}
    </section>

    <section className="discovery-panel" aria-label={mode === "crime" ? "Official police blotter discovery" : "Event discovery"}>
      <DiscoveryToolbar
        mode={mode}
        onModeChange={changeMode}
        resultCount={mode === "crime" ? filteredCrimes.length : filtered.length}
        listOpen={sheet !== "closed"}
        onToggleList={toggleResultList}
        events={{ date, query, category, availableCategories: availableEventCategories, onDateChange: chooseDate, onQueryChange: search, onCategoryChange: chooseCategory, onPrevious: () => chooseDate(shiftDate(date, -1)), onNext: () => chooseDate(shiftDate(date, 1)) }}
        crime={{ query: crimeQuery, category: crimeCategory, windowDays: crimeWindow, latestArticleDate: crimeData?.latestArticleDate || null, loading: crimeLoading, availableCategories: availableCrimeCategories, onQueryChange: (value) => { setCrimeQuery(value); setSelectedCrimeGroupId(null); setSelectedCrimeIncidentId(null); }, onCategoryChange: (value) => { setCrimeCategory(value); setSelectedCrimeGroupId(null); setSelectedCrimeIncidentId(null); }, onWindowChange: chooseCrimeWindow }}
      />

      {mode === "events" ? <>
      <div className="events-heading"><div><span className="eyebrow">ON CAMPUS</span><h2>{date === chicagoDate() ? "Today’s discoveries" : formatDay(date)}</h2></div><button className="share-button" onClick={() => share()} aria-label="Share this date">{copied ? <Check size={17} /> : <Share2 size={17} />}</button></div>
      <p className="count-line">{loading ? "Loading official calendar…" : error ? "Calendar unavailable" : `${filtered.length} events · ${mappedCount} on map · ${unmapped.length} without map locations`}{data && !error && <span className="cache-note">{data.cacheStatus === "supabase" ? `Saved in local Supabase · synced ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(data.fetchedAt))}${data.stale ? " · stale copy" : ""}` : data.cacheStatus === "snapshot" ? "Verified offline snapshot" : "Live UW calendar"}</span>}</p>
      </> : <>
        <div className="events-heading crime-events-heading"><div><span className="eyebrow">UWPD OFFICIAL DAILY BLOTTER</span><h2>Recent reports</h2></div><span className="crime-range-badge">{crimeWindow} days</span></div>
        <p className="count-line">{crimeLoading && !crimeData ? "Loading official police blotter…" : crimeError ? "UWPD archive unavailable" : `${filteredCrimes.length} selected entries · ${mappedCrimeCount} mapped · ${unmappedCrimeCount} without a verified building`}{crimeData && <span className="cache-note">Fetched {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(crimeData.fetchedAt))}{crimeData.partial ? " · archive may be incomplete" : ""}</span>}</p>
        {crimeData?.partial && <div className="crime-partial-notice" role="status">Some UWPD archive pages could not be read. Results may be incomplete; use the official source link for the full record.</div>}
      </>}
      {mode === "events" ? <>
        {data?.fallback && <div className="snapshot-notice" role="status">UW calendar is unavailable. {data.snapshotCapturedAt ? `Showing a verified snapshot captured ${new Date(data.snapshotCapturedAt).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })}.` : `Showing the saved campus calendar last refreshed ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(data.fetchedAt))}.`}</div>}
        {error && <div className="error-state" role="alert"><h3>We couldn’t load the UW calendar.</h3><p>Please try another date or check back shortly. No events have been invented.</p></div>}
        {!loading && !error && filtered.length === 0 && <div className="empty-state"><Sparkles size={27} /><h3>No matches this time.</h3><p>Try another interest, search term, or date.</p><button onClick={() => { chooseCategory("all"); search(""); }}>Clear filters</button></div>}
        <div className="events-scroll" ref={listRef}>
          {selectedGroup && <div className="venue-banner"><span className="eyebrow">SELECTED VENUE</span><strong>{selectedGroup.name}</strong><span>{selectedGroup.events.length} separate {selectedGroup.events.length === 1 ? "event" : "events"} here</span></div>}
          {renderCards(filtered.filter((event) => event.coordinates))}
          {unmapped.length > 0 && <section className="unmapped-section"><h3>Locations not mapped</h3><p>These UW events have no verified map coordinates. Their official listings are still available.</p>{renderCards(unmapped)}</section>}
          <p className="source-footer">EVENT DATA FROM <a href="https://today.wisc.edu/" target="_blank" rel="noopener noreferrer">UW TODAY ↗</a><br />Independent student project · Not an official UW service</p>
        </div>
      </> : <>
        {crimeError && <div className="crime-error-state" role="alert"><strong>{crimeData ? "Could not refresh the UWPD archive." : "UWPD archive unavailable."}</strong><span>{crimeError}</span><button type="button" onClick={() => { setCrimeError(""); setCrimeRefresh((value) => value + 1); }}>Try again</button></div>}
        {crimeLoading && !crimeData && <div className="crime-loading-state" role="status"><span className="loading-orbit" />Reading recent official blotter entries…</div>}
        {crimeData && !crimeError && filteredCrimes.length === 0 && <div className="empty-state"><ShieldAlert size={24} /><h3>{crimeData.incidents.length === 0 ? "No selected entries in this window." : "No reports match these filters."}</h3><p>Only selected official incident types are included; this is not a complete crime or safety dataset.</p><button type="button" onClick={() => { setCrimeCategory("all"); setCrimeQuery(""); }}>Clear filters</button></div>}
        <div className="events-scroll crime-events-scroll" ref={listRef}>
          {selectedCrimeGroup && <div className="venue-banner crime-venue-banner"><span className="eyebrow">SELECTED MAP LOCATION</span><strong>{selectedCrimeGroup.name}</strong><span>{selectedCrimeGroup.incidents.length} separate blotter {selectedCrimeGroup.incidents.length === 1 ? "entry" : "entries"}</span></div>}
          {!crimeError && crimeGroups.map((group) => <section className="crime-location-section" key={group.id}>
            <div className="crime-location-heading"><div><span className="eyebrow">NAMED CAMPUS BUILDING</span><h3>{group.name}</h3></div><span>{group.incidents.length}</span></div>
            {renderCrimeCards(group.incidents)}
          </section>)}
          {!crimeError && unmappedCrimeGroups.length > 0 && <section className="crime-unmapped-section"><div className="crime-unmapped-heading"><div><span className="eyebrow">NOT PINNED</span><h3>Generalized or unverified place names</h3></div><span>{unmappedCrimeCount}</span></div><p>These locations are too broad or were redacted, so they stay in the list and are not assigned an invented map point.</p>
            {unmappedCrimeGroups.map((group) => <div className="crime-unmapped-location" key={group.id}><strong>{group.name}</strong><span>{group.incidents.length} separate {group.incidents.length === 1 ? "entry" : "entries"}</span>{renderCrimeCards(group.incidents)}</div>)}
          </section>}
          <p className="source-footer">SOURCE: <a href="https://uwpd.wisc.edu/daily-blotter/" target="_blank" rel="noopener noreferrer">UWPD DAILY BLOTTER ↗</a><br />Official descriptions are shown as published; entries are not live alerts or findings of guilt.</p>
        </div>
      </>}
    </section>

    <Dialog open={Boolean(selectedBuilding)} onOpenChange={(open) => { if (!open) setSelectedBuilding(null); }}>
      <DialogContent className="building-dialog">
        {selectedBuilding && <>
          <button className="building-back" onClick={() => setSelectedBuilding(null)}><ArrowLeft size={15} /> Back to map</button>
          <div className="building-detail-scroll">
            <CampusBuildingPhoto key={selectedBuilding.mapObjectId} name={selectedBuilding.name} photoUrl={selectedBuilding.photoUrl} />
            <DialogHeader><DialogTitle>{selectedBuilding.name}</DialogTitle><DialogDescription>{selectedBuilding.streetAddress || "On the UW–Madison campus"}</DialogDescription></DialogHeader>
            <div className="building-topic-tags" aria-label="Building topics">{selectedBuilding.tags.map((tag) => <span className="building-topic-tag" key={tag}>{tag}</span>)}</div>
            <p className="building-description">{selectedBuilding.shortDescription}</p>
            {selectedBuilding.hours && <p className="building-hours"><span>Hours</span>{selectedBuilding.hours}</p>}
            <section className="building-events" aria-labelledby="building-events-title">
              <div className="building-events-heading"><div><h3 id="building-events-title">Events on {formatDay(date)}</h3><p>{buildingEvents.length ? `${buildingEvents.length} UW calendar ${buildingEvents.length === 1 ? "event" : "events"} at this building` : "No events listed at this building for this date"}</p></div><CalendarDays size={19} aria-hidden="true" /></div>
              {buildingEvents.length ? <div className="building-event-list">{buildingEvents.map((event) => <EventCard key={event.id} idPrefix="building-event" event={event} date={date} expanded={selected?.id === event.id} onSelect={() => selectEvent(event)} onShare={() => share(event)} />)}</div> : <p className="building-events-empty">Try another day, or check back as the UW calendar changes.</p>}
            </section>
            <a className="building-official-link" href={googleMapsDirectionsUrl(selectedBuilding.center)} target="_blank" rel="noopener noreferrer">Directions in Google Maps <Navigation size={15} /></a>
          </div>
        </>}
      </DialogContent>
    </Dialog>

    <SafetyCenter key={safetyOpenKey} open={safetyOpen} onOpenChange={setSafetyOpen} initialView={safetyStartView} buildings={buildings} reports={safetyReports} reportsLoading={safetyReportsLoading} reportsUnavailable={safetyReportsUnavailable} selectedReportId={selectedSafetyReportId} onSelectReport={(report) => { setSelectedSafetyReportId(report.id); setFocus([...report.coordinates]); }} onReportsChanged={() => { void refreshSafetyReports(); }} />

    <section className={`mobile-sheet sheet-${sheet}`} aria-label={mode === "crime" ? "UWPD blotter list" : "Event list"} aria-hidden={sheet === "closed"} inert={sheet === "closed"} onKeyDown={(event) => { if (event.key === "Escape") { setSheet("closed"); setSelectedId(null); setSelectedGroupId(null); setSelectedCrimeGroupId(null); setSelectedCrimeIncidentId(null); } }}>
      <div className="sheet-handle-zone" onPointerDown={(event) => { dragStart.current = event.clientY; }} onPointerUp={(event) => {
        if (dragStart.current === null) return;
        const delta = event.clientY - dragStart.current;
        if (delta < -45 && sheet === "half") setSheet("full");
        if (delta > 45) setSheet(sheet === "full" ? "half" : "closed");
        dragStart.current = null;
      }}><button className="sheet-grip" aria-label={sheet === "full" ? "Show compact list" : "Close event list"} onClick={() => setSheet(sheet === "full" ? "half" : "closed")} /></div>
      {mode === "events" ? <>
        <div className="sheet-topline"><div><span className="eyebrow">{selectedGroup ? "AT THIS VENUE" : "UW OFFICIAL CALENDAR"}</span><h2>{selectedGroup?.name || `${filtered.length} things happening`}</h2><p>{data?.fallback ? "Verified snapshot · live UW calendar unavailable" : selectedGroup ? `${selectedGroup.events.length} separate events` : `${mappedCount} on map · ${unmapped.length} without map locations`}</p></div>{(selectedGroup || selectedId) && <button aria-label="Close venue selection" onClick={() => { setSelectedGroupId(null); setSelectedId(null); setSheet("closed"); }}><X size={18} /></button>}</div>
        <div className="sheet-scroll">{error ? <p>UW calendar is temporarily unavailable.</p> : filtered.length === 0 ? <p>No events match your filters.</p> : <>{renderCards(selectedGroup ? selectedGroup.events : filtered.filter((event) => event.coordinates))}{!selectedGroup && unmapped.length > 0 && <div className="unmapped-section"><h3>Locations not mapped</h3>{renderCards(unmapped)}</div>}</>}</div>
      </> : <>
        <div className="sheet-topline crime-sheet-topline"><div><span className="eyebrow">{selectedCrimeGroup ? "AT THIS BUILDING" : "UWPD OFFICIAL BLOTTER"}</span><h2>{selectedCrimeGroup?.name || `${filteredCrimes.length} selected reports`}</h2><p>{selectedCrimeGroup ? `${selectedCrimeGroup.incidents.length} separate entries` : `${mappedCrimeCount} mapped · ${unmappedCrimeCount} unpinned`} · not live alerts or findings of guilt</p></div>{(selectedCrimeGroupId || selectedCrimeIncidentId) && <button aria-label="Close selected crime location" onClick={() => { setSelectedCrimeGroupId(null); setSelectedCrimeIncidentId(null); setSheet("closed"); }}><X size={18} /></button>}</div>
        <div className="sheet-scroll crime-sheet-scroll">{crimeError && !crimeData ? <div role="alert"><p>UWPD archive unavailable. {crimeError}</p><button type="button" onClick={() => { setCrimeError(""); setCrimeRefresh((value) => value + 1); }}>Try again</button></div> : crimeLoading && !crimeData ? <p>Loading the official blotter…</p> : <>
          {crimeData?.partial && <p className="crime-sheet-partial" role="status">The archive may be incomplete; check the official source for the full record.</p>}
          {selectedCrimeGroup ? renderCrimeCards(selectedCrimeGroup.incidents) : <>
            {crimeGroups.map((group) => <div className="crime-sheet-location" key={group.id}><strong>{group.name} · {group.incidents.length}</strong>{renderCrimeCards(group.incidents)}</div>)}
            {unmappedCrimeGroups.map((group) => <div className="crime-sheet-location" key={group.id}><strong>{group.name} · {group.incidents.length} unpinned</strong>{renderCrimeCards(group.incidents)}</div>)}
            {!crimeLoading && !crimeError && filteredCrimes.length === 0 && <p>No selected blotter entries match.</p>}
          </>}
          <p className="source-footer crime-sheet-source">UWPD public blotter · descriptions shown as published; entries are not live alerts or findings of guilt.</p>
        </>}</div>
      </>}
    </section>
  </main>;
}
