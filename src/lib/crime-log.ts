import { fromZonedTime } from "date-fns-tz";
import { load } from "cheerio";
import { z } from "zod";
import { CHICAGO, isValidDate, shiftDate } from "@/lib/chicago-date";
import { crimeCategories, type BlotterBuilding, type CrimeCategory, type OfficialCrimeIncident } from "@/lib/crime-model";

const officialCrimeIncidentSchema = z.object({
  id: z.string().min(1),
  incidentDate: z.string().refine(isValidDate),
  occurredAt: z.string().datetime(),
  timeLabel: z.string().min(1),
  incidentType: z.string().min(1),
  category: z.enum(crimeCategories),
  locationLabel: z.string().min(1),
  buildingId: z.string().nullable(),
  buildingName: z.string().nullable(),
  coordinates: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
  summary: z.string().min(1),
  source: z.literal("uwpd-official"),
  sourceUrl: z.string().url().refine((value) => new URL(value).hostname === "uwpd.wisc.edu"),
}).strict();

const typeToCategory: Record<string, CrimeCategory> = {
  "theft larceny": "theft",
  theft: "theft",
  "motor vehicle theft": "theft",
  fraud: "fraud",
  "damage to property": "property-damage",
  "criminal damage": "property-damage",
  graffiti: "property-damage",
  burglary: "burglary",
  robbery: "robbery",
  assault: "assault",
  battery: "assault",
  "weapons violation": "weapons",
  "weapon violation": "weapons",
};

const locationAliases: Record<string, string> = {
  "nick rec": "nicholas recreation center",
  "nick rec center": "nicholas recreation center",
  "nrec": "nicholas recreation center",
  "hc white": "helen c white hall",
  "h c white": "helen c white hall",
};

const hiddenNarrativePatterns = [
  /the person was picking the (?:bike|bicycle) up for another person/i,
  /(?:no|nothing) (?:crime|theft|was stolen)\b/i,
  /(?:not stolen|not a theft|false alarm|unfounded report)\b/i,
  /investigation (?:determined|found).{0,120}\b(?:authorized|no crime|no theft|not stolen|did not steal)\b/i,
  /\b(?:domestic violence|domestic abuse|intimate partner|sexual assault|sex offense|stalking)\b/i,
];

function normalizePlace(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function categoryForType(value: string): CrimeCategory | null {
  return typeToCategory[normalizePlace(value)] || null;
}

export function resolveBlotterBuilding(location: string, buildings: BlotterBuilding[]): BlotterBuilding | null {
  const normalized = normalizePlace(location);
  if (!normalized || /^(?:residence hall|residence halls|location redacted|local hospital|unknown|uwpd)$/.test(normalized)) return null;
  const lookup = locationAliases[normalized] || normalized;
  return buildings.find((building) => normalizePlace(building.name) === lookup) || null;
}

function parseTime(timeLabel: string): { hour: number; minute: number } | null {
  const match = timeLabel.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  const twelveHour = Number(match[1]);
  const minute = Number(match[2]);
  if (twelveHour < 1 || twelveHour > 12 || minute > 59) return null;
  const hour = (twelveHour % 12) + (match[3].toLowerCase() === "pm" ? 12 : 0);
  return { hour, minute };
}

function incidentCalendarDate(articleDate: string, timeLabel: string): string | null {
  const time = parseTime(timeLabel);
  if (!time || !isValidDate(articleDate)) return null;
  // UWPD's archive date describes a 6 a.m.–6 a.m. reporting window.
  return time.hour >= 6 ? shiftDate(articleDate, -1) : articleDate;
}

function safeSummary(category: CrimeCategory): string {
  switch (category) {
    case "theft": return "A theft or larceny report was logged. Outcome details remain on the official record.";
    case "fraud": return "A fraud report was logged. Personal and payment details remain on the official record.";
    case "property-damage": return "A property damage report was logged. The original account remains on the official record.";
    case "burglary": return "A burglary report was logged. The original account remains on the official record.";
    case "robbery": return "A robbery report was logged. Personal details are omitted from this map.";
    case "assault": return "An assault or battery report was logged. Personal details are omitted from this map.";
    case "weapons": return "A weapons-related report was logged. Personal details are omitted from this map.";
  }
}

function parseRow(text: string, articleDate: string, rowIndex: number, sourceUrl: string, buildings: BlotterBuilding[]): OfficialCrimeIncident | null {
  const clean = text.replace(/\s+/g, " ").trim();
  const firstComma = clean.indexOf(",");
  const secondComma = firstComma < 0 ? -1 : clean.indexOf(",", firstComma + 1);
  if (firstComma < 0 || secondComma < 0) return null;

  const timeLabel = clean.slice(0, firstComma).trim();
  const incidentType = clean.slice(firstComma + 1, secondComma).trim();
  const category = categoryForType(incidentType);
  const remainder = clean.slice(secondComma + 1).trim();
  const separator = remainder.indexOf(". ");
  if (!category || separator <= 0) return null;

  const locationLabel = remainder.slice(0, separator).trim().replace(/\.$/, "");
  const narrative = remainder.slice(separator + 2).trim();
  if (!locationLabel || hiddenNarrativePatterns.some((pattern) => pattern.test(narrative))) return null;

  const actualDate = incidentCalendarDate(articleDate, timeLabel);
  const time = parseTime(timeLabel);
  if (!actualDate || !time) return null;
  const building = resolveBlotterBuilding(locationLabel, buildings);
  const occurredAt = fromZonedTime(
    `${actualDate} ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}:00`,
    CHICAGO,
  ).toISOString();

  return officialCrimeIncidentSchema.parse({
    id: `${articleDate}:${rowIndex}`,
    incidentDate: actualDate,
    occurredAt,
    timeLabel: timeLabel.toLowerCase(),
    incidentType,
    category,
    locationLabel,
    buildingId: building?.mapObjectId ?? null,
    buildingName: building?.name ?? null,
    coordinates: building?.center ?? null,
    summary: safeSummary(category),
    source: "uwpd-official",
    sourceUrl,
  });
}

export function parseBlotterDocument(html: string, articleUrl: string, buildings: BlotterBuilding[]): { incidents: OfficialCrimeIncident[]; malformedRows: number } {
  const url = new URL(articleUrl);
  if (url.protocol !== "https:" || url.hostname !== "uwpd.wisc.edu") throw new Error("Unexpected UWPD source URL");
  const articleDate = url.pathname.match(/^\/daily-blotter\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
  if (!articleDate || !isValidDate(articleDate)) throw new Error("Unexpected UWPD archive date");

  const $ = load(html);
  const title = $("main article h1").first().text().trim();
  const rows = $("main > ul > li").toArray();
  if (!/^Daily Blotter for\b/i.test(title) || !$("main > ul").length) throw new Error("UWPD archive page structure changed");

  let malformedRows = 0;
  const incidents: OfficialCrimeIncident[] = [];
  rows.forEach((row, index) => {
    const incident = parseRow($(row).text(), articleDate, index, `https://uwpd.wisc.edu/daily-blotter/${articleDate}/`, buildings);
    if (incident) incidents.push(incident);
    else {
      const text = $(row).text().trim();
      if (!/^\d{1,2}:\d{2}\s*(?:am|pm),\s*[^,]+,\s*[^.]+\.\s+/i.test(text)) malformedRows += 1;
    }
  });
  return { incidents, malformedRows };
}

export function parseBlotterFeed(xml: string): Array<{ title: string; url: string; date: string }> {
  const $ = load(xml, { xml: true });
  const items: Array<{ title: string; url: string; date: string }> = [];
  $("item").each((_index, item) => {
    const title = $(item).find("title").first().text().trim();
    const rawUrl = $(item).find("link").first().text().trim();
    try {
      const url = new URL(rawUrl);
      const date = url.pathname.match(/^\/daily-blotter\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1];
      if (url.protocol === "https:" && url.hostname === "uwpd.wisc.edu" && date && isValidDate(date) && /^Daily Blotter for\b/i.test(title)) {
        items.push({ title, url: `https://uwpd.wisc.edu/daily-blotter/${date}/`, date });
      }
    } catch { /* Ignore malformed RSS items and non-blotter links. */ }
  });
  return items;
}
