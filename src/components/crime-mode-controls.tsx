"use client";

import { Search, X } from "lucide-react";
import { crimeCategories, crimeCategoryInfo, type CrimeCategory } from "@/lib/crime-model";

export function CrimeModeControls({
  query,
  category,
  onQueryChange,
  onCategoryChange,
}: {
  query: string;
  category: CrimeCategory | "all";
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: CrimeCategory | "all") => void;
}) {
  return <>
    <label className="search-field crime-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Search police blotter entries</span>
      <input placeholder="Search type or campus place" value={query} onChange={(event) => onQueryChange(event.target.value)} />
      {query && <button type="button" aria-label="Clear crime search" onClick={() => onQueryChange("")}><X size={17} /></button>}
    </label>
    <div className="filter-row crime-filter-row" role="group" aria-label="Filter official blotter entries by type">
      <button type="button" className={`filter-chip crime-filter-all ${category === "all" ? "active" : ""}`} aria-pressed={category === "all"} onClick={() => onCategoryChange("all")}>All reports</button>
      {crimeCategories.map((item) => <button type="button" key={item} className={`filter-chip crime-filter-${item} ${category === item ? "active" : ""}`} aria-pressed={category === item} onClick={() => onCategoryChange(item)}>{crimeCategoryInfo[item].label}</button>)}
    </div>
  </>;
}
