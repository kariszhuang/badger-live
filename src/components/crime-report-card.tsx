"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { crimeCategoryInfo, type OfficialCrimeIncident } from "@/lib/crime-model";

const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });

export function CrimeReportCard({ incident, selected, onSelect }: { incident: OfficialCrimeIncident; selected: boolean; onSelect: () => void }) {
  const category = crimeCategoryInfo[incident.category];
  const occurredAt = new Date(incident.occurredAt);
  return <article id={`crime-${incident.id}`} className={`crime-report-card crime-report-${incident.category} ${selected ? "is-selected" : ""}`}>
    <button type="button" className="crime-report-main" aria-pressed={selected} onClick={onSelect}>
      <span aria-hidden="true" className="crime-category-icon">{category.symbol}</span>
      <span className="crime-report-copy">
        <strong>{incident.incidentType}</strong>
        <time dateTime={incident.occurredAt}>{dateFormatter.format(occurredAt)} · {timeFormatter.format(occurredAt)}</time>
        <span className="crime-report-location">{incident.buildingName || incident.locationLabel}{incident.buildingName && <small> · named campus building</small>}</span>
      </span>
    </button>
    <p className="crime-report-summary">{incident.summary}</p>
    <div className="crime-report-footer"><span><ShieldCheck size={12} /> UWPD public blotter</span><a href={incident.sourceUrl} target="_blank" rel="noopener noreferrer">Read original entry <ArrowUpRight size={13} /></a></div>
  </article>;
}
