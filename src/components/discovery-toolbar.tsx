"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, CalendarDays, List, Search, ShieldCheck, X } from "lucide-react";
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

export function DiscoveryToolbar({
  mode,
  onModeChange,
  resultCount,
  listOpen,
  onToggleList,
  events,
  crime,
}: {
  mode: DiscoveryMode;
  onModeChange: (mode: DiscoveryMode) => void;
  resultCount: number;
  listOpen: boolean;
  onToggleList: () => void;
  events: EventsControls;
  crime: CrimeControls;
}) {
  const query = mode === "events" ? events.query : crime.query;
  const onQueryChange = mode === "events" ? events.onQueryChange : crime.onQueryChange;

  return <header className="discovery-header discovery-toolbar">
    <div className="toolbar-brand-line">
      <div className="brand-row">
        <Image className="brand-symbol brand-image" src="/icons/badger-live-192.png" alt="" width={32} height={32} priority />
        <span className="brand-name">BADGER<span>LIVE</span></span>
        <span className="brand-caption">UW–MADISON</span>
      </div>
      <ModeSwitcher value={mode} onChange={onModeChange} />
      <button type="button" className={`toolbar-list-button ${listOpen ? "is-open" : ""}`} onClick={onToggleList} aria-label={listOpen ? `Close ${mode === "crime" ? "report list" : "event list"}` : `Show ${resultCount} ${mode === "crime" ? "reports" : "events"}`} aria-expanded={listOpen}>
        {listOpen ? <X size={18} aria-hidden="true" /> : <List size={17} aria-hidden="true" />}
        <span className="toolbar-list-count" aria-hidden="true">{resultCount}</span>
      </button>
    </div>

    <label className="search-field discovery-search">
      <Search size={18} aria-hidden="true" />
      <span className="sr-only">{mode === "crime" ? "Search blotter reports" : "Search events"}</span>
      <input
        placeholder={mode === "crime" ? "Search reports or places" : "What's happening, Badgers?"}
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
    </> : <>
      <div className="crime-window-row toolbar-crime-window" role="group" aria-label="Blotter date range">
        {[14, 30].map((days) => <button type="button" key={days} aria-pressed={crime.windowDays === days} onClick={() => crime.onWindowChange(days as 14 | 30)}>{days} days</button>)}
        <span>{crime.loading ? "Updating archive…" : crime.latestArticleDate ? `Latest · ${formatDay(crime.latestArticleDate)}` : "Official archive"}</span>
      </div>
      <div className="filter-row crime-filter-row toolbar-filter-row" role="group" aria-label="Filter official blotter entries by type">
        <button type="button" className={`filter-chip crime-filter-all ${crime.category === "all" ? "active" : ""}`} aria-pressed={crime.category === "all"} onClick={() => crime.onCategoryChange("all")}><ShieldCheck size={15} aria-hidden="true" />All reports</button>
        {crimeCategories.filter((item) => crime.availableCategories.includes(item)).map((item) => <button type="button" key={item} className={`filter-chip crime-filter-${item} ${crime.category === item ? "active" : ""}`} aria-pressed={crime.category === item} onClick={() => crime.onCategoryChange(item)}><CrimeCategoryIcon category={item} size={15} />{crimeCategoryInfo[item].label}</button>)}
      </div>
    </>}
  </header>;
}
