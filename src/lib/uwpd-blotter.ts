import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCampusBuildings } from "@/lib/campus-buildings";
import { chicagoDate, shiftDate } from "@/lib/chicago-date";
import { parseBlotterDocument, parseBlotterFeed } from "@/lib/crime-log";
import type { BlotterBuilding, OfficialCrimeIncident } from "@/lib/crime-model";

const FEED_URL = "https://uwpd.wisc.edu/daily-blotter/feed/";
const MAX_FEED_PAGES = 6;
const ARTICLE_CONCURRENCY = 4;

export type UwpdBlotterResult = {
  incidents: OfficialCrimeIncident[];
  fetchedAt: string;
  windowDays: 14 | 30;
  windowStart: string;
  windowEnd: string;
  latestArticleDate: string | null;
  partial: boolean;
};

type ReaderOptions = {
  now?: Date;
  fetchText?: (url: string) => Promise<string>;
  loadBuildings?: () => Promise<BlotterBuilding[]>;
};

let cachedBuildings: Promise<BlotterBuilding[]> | undefined;

async function readCampusBuildings(): Promise<BlotterBuilding[]> {
  const text = await readFile(join(process.cwd(), "public", "data", "uw-campus-buildings.geojson"), "utf8");
  const collection = parseCampusBuildings(JSON.parse(text));
  return collection.features.map(({ properties }) => ({
    mapObjectId: properties.mapObjectId,
    name: properties.name,
    center: properties.center,
  }));
}

function getCampusBuildings() {
  cachedBuildings ??= readCampusBuildings().catch((error: unknown) => {
    cachedBuildings = undefined;
    throw error;
  });
  return cachedBuildings;
}

async function fetchOfficialText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "uwpd.wisc.edu") throw new Error("Unexpected UWPD host");
  const response = await fetch(url, {
    headers: { Accept: "text/html, application/rss+xml, application/xml", "User-Agent": "BadgerLive/0.1 (+https://github.com/kariszhuang/badger-live)" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`UWPD archive returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|application\/(?:rss\+xml|xml)|text\/xml/i.test(contentType)) throw new Error("Unexpected UWPD content type");
  return response.text();
}

export async function getUwpdBlotter(days: 14 | 30 = 30, options: ReaderOptions = {}): Promise<UwpdBlotterResult> {
  const now = options.now || new Date();
  const today = chicagoDate(now);
  const windowStart = shiftDate(today, -(days - 1));
  const archiveStart = shiftDate(windowStart, -1);
  const archiveEnd = shiftDate(today, 1);
  const fetchText = options.fetchText || fetchOfficialText;
  const loadBuildings = options.loadBuildings || getCampusBuildings;
  const archiveByDate = new Map<string, string>();
  let reachedWindow = false;
  let partial = false;

  for (let page = 1; page <= MAX_FEED_PAGES; page += 1) {
    let xml: string;
    try {
      xml = await fetchText(`${FEED_URL}${page === 1 ? "" : `?paged=${page}`}`);
    } catch {
      if (page === 1) throw new Error("UWPD archive feed is unavailable");
      partial = true;
      break;
    }
    const pageItems = parseBlotterFeed(xml);
    if (page === 1 && pageItems.length === 0) throw new Error("UWPD archive feed format changed");
    for (const item of pageItems) {
      if (item.date >= archiveStart && item.date <= archiveEnd) archiveByDate.set(item.date, item.url);
    }
    const oldest = pageItems.map((item) => item.date).sort()[0];
    if (!oldest || oldest < archiveStart) {
      reachedWindow = true;
      break;
    }
  }
  if (!reachedWindow) partial = true;

  const buildings = await loadBuildings();
  const pages = [...archiveByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const incidents: OfficialCrimeIncident[] = [];
  const failedDates = new Set<string>();
  let malformedRows = false;

  for (let offset = 0; offset < pages.length; offset += ARTICLE_CONCURRENCY) {
    const batch = pages.slice(offset, offset + ARTICLE_CONCURRENCY);
    const results = await Promise.all(batch.map(async ([date, url]) => {
      try {
        const html = await fetchText(url);
        return { date, parsed: parseBlotterDocument(html, url, buildings) };
      } catch {
        failedDates.add(date);
        return null;
      }
    }));
    for (const result of results) {
      if (!result) continue;
      incidents.push(...result.parsed.incidents.filter((incident) => incident.incidentDate >= windowStart && incident.incidentDate <= today));
      if (result.parsed.malformedRows > 0) malformedRows = true;
    }
  }

  const newestArticleDate = pages.map(([date]) => date).sort().at(-1) || null;
  if (failedDates.size > 0 || malformedRows) partial = true;
  if (pages.length > 0 && failedDates.size === pages.length) throw new Error("UWPD archive entries are unavailable");

  const unique = new Map(incidents.map((incident) => [incident.id, incident]));
  return {
    incidents: [...unique.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    fetchedAt: now.toISOString(),
    windowDays: days,
    windowStart,
    windowEnd: today,
    latestArticleDate: newestArticleDate,
    partial,
  };
}

export function isCrimeWindowDays(value: string | null): value is "14" | "30" {
  return value === "14" || value === "30";
}
