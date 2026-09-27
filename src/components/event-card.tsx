"use client";

import { ArrowUpRight, MapPin, Navigation, Share2 } from "lucide-react";
import type { CampusEvent } from "@/lib/events";
import { eventStatus, formatEventTime } from "@/lib/chicago-date";
import { EventCategoryIcon } from "./category-icons";

export function EventCard({ event, date, expanded, onSelect, onShare, idPrefix = "event" }: { event: CampusEvent; date: string; expanded: boolean; onSelect: () => void; onShare: () => void; idPrefix?: string }) {
  const status = eventStatus(event.startsAt, event.endsAt, date);
  const directionUrl = event.coordinates ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${event.coordinates[1]},${event.coordinates[0]}`)}` : null;
  return <article className={`event-card ${expanded ? "is-expanded" : ""}`} id={`${idPrefix}-${event.officialId}`}>
    <button className="event-card-main" onClick={onSelect} aria-expanded={expanded}>
      <span className="event-time">{formatEventTime(event.startsAt, event.allDay)}{event.endsAt && !event.allDay ? ` – ${formatEventTime(event.endsAt)}` : ""}</span>
      <span className="event-title">{event.title}</span>
      {event.subtitle && <span className="event-subtitle">{event.subtitle}</span>}
      <span className="event-location"><MapPin size={14} aria-hidden="true" /> {event.venueName || event.locationLabel}</span>
      <span className="event-footer"><span className={`category-badge category-${event.category}`}><EventCategoryIcon category={event.category} size={13} />{event.category === "other" ? "Event" : event.category}</span>{status === "now" && <span className="live-badge">Happening now</span>}{event.priceLabel && <span className="price-label">{event.priceLabel}</span>}</span>
    </button>
    {expanded && <div className="event-detail">
      {event.description && <p>{event.description}</p>}
      <div className="tag-row">{event.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <p className="official-note">Listed by UW official calendar. Badger Live is an independent student project.</p>
      <div className="card-actions">
        <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">Official event <ArrowUpRight size={15} /></a>
        {directionUrl && <a href={directionUrl} target="_blank" rel="noopener noreferrer">Directions <Navigation size={15} /></a>}
        {event.organizerUrl && <a href={event.organizerUrl} target="_blank" rel="noopener noreferrer">Organizer <ArrowUpRight size={15} /></a>}
        <button onClick={onShare} aria-label={`Share ${event.title}`}><Share2 size={15} /> Share</button>
      </div>
    </div>}
  </article>;
}
