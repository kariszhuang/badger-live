"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, CalendarDays, List, MapPin, Search, ShieldCheck, X } from "lucide-react";
import { categories, type FilterCategory } from "@/lib/events";
import { crimeCategories, crimeCategoryInfo, type CrimeCategory } from "@/lib/crime-model";
import { chicagoDate, formatDay } from "@/lib/chicago-date";
import { CrimeCategoryIcon, EventCategoryIcon } from "./category-icons";
import { ModeSwitcher, type DiscoveryMode } from "./mode-switcher";

type EventsControls = {
  date: string;
  query: string;
  category: FilterCategory;
  availableCategories: FilterCategory[];
  onDateChange: (date: string) => void;
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: FilterCategory) => void;
  onPrevious: () => void;
  onNext: () => void;
};

type CrimeControls = {
  query: string;
  category: CrimeCategory | "all";
  windowDays: 14 | 30;
  latestArticleDate: string | null;
  loading: boolean;
  availableCategories: CrimeCategory[];
  onQueryChange: (query: string) => void;
  onCategoryChange: (category: CrimeCategory | "all") => void;
  onWindowChange: (days: 14 | 30) => void;
};

type HazardControls = { query: string; onQueryChange: (query: string) => void };

export function DiscoveryToolbar({
  mode,
  onModeChange,
  resultCount,
  listOpen,
  onToggleList,
  communityVisible,
  communityCount,
  communityStatus,
  onCommunityChange,
  events,
  hazards,
  crime,
}: {
  mode: DiscoveryMode;
  onModeChange: (mode: DiscoveryMode) => void;
  resultCount: number;
  listOpen: boolean;
  onToggleList: () => void;
  communityVisible: boolean;
  communityCount: number;
  communityStatus: string | null;
  onCommunityChange: (visible: boolean) => void;
  events: EventsControls;
  hazards: HazardControls;
  crime: CrimeControls;
}) {
  const query = mode === "events" ? events.query : mode === "hazards" ? hazards.query : crime.query;
  const onQueryChange = mode === "events" ? events.onQueryChange : mode === "hazards" ? hazards.onQueryChange : crime.onQueryChange;
  const listNoun = mode === "events" ? "event" : mode === "hazards" ? "hazard" : "report";

  return <header className="discovery-header discovery-toolbar">
    <div className="toolbar-brand-line">
      <div className="brand-row">
        <Image className="brand-symbol brand-image" src="/icons/badger-live-192.png" alt="" width={32} height={32} priority />
        <span className="brand-name">BADGER<span>LIVE</span></span>
        <span className="brand-caption">CAMPUS MAP</span>
      </div>
      <ModeSwitcher value={mode} onChange={onModeChange} />
      <button type="button" className={`toolbar-list-button ${listOpen ? "is-open" : ""}`} onClick={onToggleList} aria-label={listOpen ? `Hide ${listNoun} list panel` : `Show ${resultCount} ${listNoun}${resultCount === 1 ? "" : "s"}`} aria-expanded={listOpen}>
        {listOpen ? <X size={18} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
        <span className="toolbar-list-count" aria-hidden="true">{resultCount}</span>
      </button>
    </div>

    <label className="search-field discovery-search">
      <Search size={18} aria-hidden="true" />
      <span className="sr-only">{mode === "crime" ? "Search blotter reports" : mode === "hazards" ? "Search hazards" : "Search events"}</span>
      <input
        placeholder={mode === "crime" ? "Search reports or places" : mode === "hazards" ? "Search hazards or places" : "What's happening, Badgers?"}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {query && <button type="button" aria-label="Clear search" onClick={() => onQueryChange("")}><X size={16} /></button>}
    </label>

    {mode === "events" ? <>
      <div className="date-row toolbar-date-row">
        <button className="date-arrow" aria-label="Previous day" onClick={events.onPrevious}><ArrowLeft size={17} /></button>
        <label className="date-display"><CalendarDays size={16} /><span>{events.date === chicagoDate() ? "Today · " : ""}{formatDay(events.date)}</span><input aria-label="Choose date" type="date" value={events.date} onChange={(event) => events.onDateChange(event.target.value)} /></label>
        <button className="date-arrow" aria-label="Next day" onClick={events.onNext}><ArrowRight size={17} /></button>
      </div>
      <div className="filter-row toolbar-filter-row" role="group" aria-label="Filter events by interest">
        {categories.filter((item) => item === "all" || events.availableCategories.includes(item)).map((item) => <button type="button" key={item} className={`filter-chip category-filter-${item} ${events.category === item ? "active" : ""}`} aria-pressed={events.category === item} onClick={() => events.onCategoryChange(item)}><EventCategoryIcon category={item} size={15} />{item === "all" ? "All" : item === "talks" ? "Talks" : item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
    </> : mode === "hazards" ? <>
      <div className="filter-row toolbar-filter-row" role="group" aria-label="Hazard map controls">
        <button type="button" className={`filter-chip community-layer-chip ${communityVisible ? "active" : ""}`} aria-pressed={communityVisible} title={communityStatus || "Show hazard markers"} onClick={() => onCommunityChange(!communityVisible)}><MapPin size={15} />Map pins · {communityCount}</button>
        {communityStatus && <span className="community-layer-status" role="status">{communityStatus}</span>}
      </div>
    </> : <>
      <div className="crime-window-row toolbar-crime-window" role="group" aria-label="Blotter date range">
        {[14, 30].map((days) => <button type="button" key={days} aria-pressed={crime.windowDays === days} onClick={() => crime.onWindowChange(days as 14 | 30)}>{days} days</button>)}
        <span>{crime.loading ? "Updating archive…" : crime.latestArticleDate ? `Latest · ${formatDay(crime.latestArticleDate)}` : "Official archive"}</span>
      </div>
      <div className="filter-row crime-filter-row toolbar-filter-row" role="group" aria-label="Filter Crime reports by type">
        <button type="button" className={`filter-chip crime-filter-all ${crime.category === "all" ? "active" : ""}`} aria-pressed={crime.category === "all"} onClick={() => crime.onCategoryChange("all")}><ShieldCheck size={15} aria-hidden="true" />All reports</button>
        {crimeCategories.filter((item) => crime.availableCategories.includes(item)).map((item) => <button type="button" key={item} className={`filter-chip crime-filter-${item} ${crime.category === item ? "active" : ""}`} aria-pressed={crime.category === item} onClick={() => crime.onCategoryChange(item)}><CrimeCategoryIcon category={item} size={15} />{crimeCategoryInfo[item].label}</button>)}
      </div>
    </>}
  </header>;
}
