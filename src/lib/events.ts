import { z } from "zod";

export const categories = ["all", "music", "arts", "sports", "talks", "outdoors", "community"] as const;
export type FilterCategory = (typeof categories)[number];
export type EventCategory = Exclude<FilterCategory, "all"> | "other";

export type CampusEvent = {
  id: string;
  officialId: string;
  title: string;
  subtitle?: string;
  description: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  venueName?: string;
  locationLabel: string;
  coordinates: [longitude: number, latitude: number] | null;
  tags: string[];
  category: EventCategory;
  categories: EventCategory[];
  priceLabel?: string;
  source: "uw-official";
  sourceUrl: string;
  organizerUrl?: string;
  uwMapUrl?: string;
};

const rawEvent = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().default(""),
  subtitle: z.string().nullish(),
  description: z.string().nullish(),
  startDate: z.string().nullish(),
  startDate8601: z.string().nullish(),
  endDate: z.string().nullish(),
  endDate8601: z.string().nullish(),
  allDayEvent: z.boolean().nullish(),
  latlon: z.string().nullish(),
  location: z.string().nullish(),
  building: z.object({ name: z.string().nullish() }).nullish(),
  tags: z.array(z.string()).nullish(),
  cost: z.string().nullish(),
  url: z.string().nullish(),
  uw_map_link: z.string().nullish(),
}).passthrough();

const tagCategory: Record<string, EventCategory> = {
  music: "music", concert: "music", concerts: "music", jazz: "music", recital: "music",
  art: "arts", arts: "arts", dance: "arts", film: "arts", theatre: "arts", theater: "arts", museum: "arts", exhibition: "arts", visual: "arts",
  athletics: "sports", sports: "sports", recreation: "sports", fitness: "sports",
  lecture: "talks", lectures: "talks", seminar: "talks", research: "talks", science: "talks", academic: "talks", workshop: "talks",
  nature: "outdoors", environment: "outdoors", outdoors: "outdoors", sustainability: "outdoors", gardening: "outdoors", birding: "outdoors",
  community: "community", volunteerism: "community", social: "community", diversity: "community", student: "community", food: "community",
};

export function parseLatLon(input: unknown): [number, number] | null {
  if (typeof input !== "string") return null;
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 42.5 || latitude > 43.7 || longitude < -90.2 || longitude > -88.7) return null;
  return [longitude, latitude];
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'").replace(/\s+/g, " ").trim();
}

function safeUrl(value: string | null | undefined, hosts?: string[]): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (hosts && !hosts.includes(url.hostname))) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function normalizeEvent(input: unknown): CampusEvent | null {
  const parsed = rawEvent.safeParse(input);
  if (!parsed.success) return null;
  const row = parsed.data;
  const title = plainText(row.title);
  const rawStart = row.startDate8601 || row.startDate || "";
  const start = new Date(rawStart);
  if (!title || Number.isNaN(start.valueOf())) return null;
  const rawEnd = row.endDate8601 || row.endDate || "";
  const end = rawEnd ? new Date(rawEnd) : null;
  const tags = (row.tags || []).map(plainText).filter(Boolean);
  const mapped = [...new Set(tags.map((tag) => tagCategory[tag.toLowerCase()]).filter((category): category is EventCategory => Boolean(category)))];
  const categories: EventCategory[] = mapped.length ? mapped : ["other"];
  const officialId = String(row.id);
  const locationLabel = plainText(row.location || "") || "Location not listed";
  const priceLabel = plainText(row.cost || "") || undefined;
  return {
    id: `${officialId}:${start.toISOString()}`,
    officialId,
    title,
    subtitle: plainText(row.subtitle || "") || undefined,
    description: plainText(row.description || ""),
    startsAt: start.toISOString(),
    endsAt: end && !Number.isNaN(end.valueOf()) ? end.toISOString() : undefined,
    allDay: Boolean(row.allDayEvent),
    venueName: plainText(row.building?.name || "") || undefined,
    locationLabel,
    coordinates: parseLatLon(row.latlon),
    tags,
    category: categories[0],
    categories,
    priceLabel,
    source: "uw-official",
    sourceUrl: `https://today.wisc.edu/events/view/${encodeURIComponent(officialId)}`,
    organizerUrl: safeUrl(row.url),
    uwMapUrl: safeUrl(row.uw_map_link, ["map.wisc.edu"]),
  };
}

export function normalizeEvents(input: unknown): CampusEvent[] {
  if (!Array.isArray(input)) throw new Error("UW response was not an event array");
  const unique = new Map<string, CampusEvent>();
  for (const row of input) {
    const event = normalizeEvent(row);
    if (event) unique.set(event.id, event);
  }
  return [...unique.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));
}

export type VenueGroup = { id: string; name: string; coordinates: [number, number]; events: CampusEvent[] };

export function groupVenues(events: CampusEvent[]): VenueGroup[] {
  const groups = new Map<string, VenueGroup>();
  for (const event of events) {
    if (!event.coordinates) continue;
    const name = event.venueName || event.locationLabel;
    const venueKey = event.uwMapUrl || name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Name or official map link agreement is required; coarse position alone never groups events.
    const pointKey = event.coordinates.map((n) => n.toFixed(4)).join(",");
    const id = `${venueKey}:${pointKey}`;
    const existing = groups.get(id);
    if (existing) existing.events.push(event);
    else groups.set(id, { id, name, coordinates: event.coordinates, events: [event] });
  }
  return [...groups.values()];
}
