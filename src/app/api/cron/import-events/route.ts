import { NextRequest } from "next/server";
import { chicagoDate, shiftDate } from "@/lib/chicago-date";
import { fetchOfficialEvents } from "@/lib/uw-events-api";
import { beginImportRun, finishImportRun, ReportStoreError } from "@/lib/report/store";
import { writeCachedEventDay } from "@/lib/event-cache";
import { jsonResponse } from "@/lib/report/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && Buffer.byteLength(secret) >= 32 && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function run(request: NextRequest) {
  if (!authorized(request)) return jsonResponse({ error: "Not authorized." }, 401);
  let runId: number | null = null;
  try {
    runId = await beginImportRun("uw-today");
    const today = chicagoDate();
    const dates = Array.from({ length: 8 }, (_, index) => shiftDate(today, index));
    let importedEvents = 0;
    let importedDays = 0;
    const fetchedAt = new Date();
    for (let index = 0; index < dates.length; index += 2) {
      const chunk = dates.slice(index, index + 2);
      const results = await Promise.all(chunk.map(async (date) => {
        const events = await fetchOfficialEvents(date);
        const saved = await writeCachedEventDay(date, events, fetchedAt);
        if (!saved) throw new Error("database-write-failed");
        return events.length;
      }));
      importedEvents += results.reduce((total, count) => total + count, 0);
      importedDays += results.length;
    }
    await finishImportRun(runId, "succeeded", `${importedDays} event days; ${importedEvents} events`);
    return jsonResponse({ importedDays, importedEvents, fetchedAt: fetchedAt.toISOString() }, 200);
  } catch (error) {
    if (runId !== null) await finishImportRun(runId, "failed", error instanceof Error ? error.message : "Unknown import failure").catch(() => undefined);
    if (error instanceof ReportStoreError) return jsonResponse({ error: "The official calendar importer is not configured." }, 503);
    return jsonResponse({ error: "The official calendar could not be refreshed; previous cached data remains available." }, 503);
  }
}

export const GET = run;
export const POST = run;
