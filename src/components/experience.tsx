"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Compass, LocateFixed, MapPinned, Plus, Search, Share2, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { chicagoDate, formatDay, isValidDate, shiftDate } from "@/lib/chicago-date";
import { categories, groupVenues, type CampusEvent, type FilterCategory } from "@/lib/events";
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
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locateError, setLocateError] = useState("");
  const [copied, setCopied] = useState(false);
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
  const mappedCount = filtered.filter((event) => event.coordinates).length;
  const unmapped = filtered.filter((event) => !event.coordinates);
  const selected = events.find((event) => event.id === selectedId || event.officialId === selectedId);
  const activeGroupId = selectedGroupId || groups.find((group) => group.events.some((event) => event.id === selected?.id))?.id || null;
  const selectedGroup = groups.find((group) => group.id === activeGroupId);

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
    if (!navigator.geolocation) { setLocateError("Location is unavailable in this browser."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
      setUserLocation(coordinates);
      setFocus(coordinates);
    }, () => setLocateError("Location permission was declined or unavailable."), { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  };

  const renderCards = (items: CampusEvent[]) => items.map((event) => <EventCard key={event.id} event={event} date={date} expanded={selected?.id === event.id} onSelect={() => selectEvent(event)} onShare={() => share(event)} />);

  return <main className="experience">
    <section className="map-panel" aria-label="Campus map">
      <CampusMap groups={groups} selectedGroupId={activeGroupId} onSelect={selectGroup} focus={focus} userLocation={userLocation} fitSignal={fitSignal} campusSignal={campusSignal} mapKey={mapKey} />
      <div className="map-top-label"><span className="map-top-dot" /> UW–MADISON <span className="map-top-divider">/</span> MADISON, WI</div>
      <div className="map-tools">
        <button aria-label="Locate me" title="Locate me" onClick={locate}><LocateFixed size={19} /></button>
        <button aria-label="Fit today's events" title="Fit events" onClick={() => setFitSignal((n) => n + 1)}><MapPinned size={19} /></button>
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
      </header>

      <div className="events-heading"><div><span className="eyebrow">ON CAMPUS</span><h2>{date === chicagoDate() ? "Today’s discoveries" : formatDay(date)}</h2></div><button className="share-button" onClick={() => share()} aria-label="Share this date">{copied ? <Check size={17} /> : <Share2 size={17} />}</button></div>
      <p className="count-line">{loading ? "Loading official calendar…" : error ? "Calendar unavailable" : `${filtered.length} events · ${mappedCount} on map · ${unmapped.length} without map locations`}</p>
      {data?.fallback && <div className="snapshot-notice" role="status">UW calendar is unavailable. Showing a verified snapshot captured {new Date(data.snapshotCapturedAt || "").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })}.</div>}
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
