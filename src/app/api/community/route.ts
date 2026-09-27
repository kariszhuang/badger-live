import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { isWithinCampusMapBounds } from "@/lib/campus-map-bounds";
import { communityKinds } from "@/lib/community/types";
import { createCommunityUpdate, listCommunityUpdates } from "@/lib/community/store";
import { moderateReportInput, IntakeServiceError } from "@/lib/report/intake";
import { screenReportText } from "@/lib/report/policy";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, reportWritesEnabled, requestHasAllowedOrigin } from "@/lib/report/route-helpers";

export const runtime = "nodejs";

const schema = z.object({
  visitorId: z.string().uuid(), kind: z.enum(communityKinds),
  title: z.string().trim().min(3).max(120), description: z.string().trim().min(3).max(500),
  placeName: z.string().trim().min(2).max(120),
  coordinates: z.tuple([z.number().finite(), z.number().finite()]),
  startsAt: z.iso.datetime({ offset: true }).nullable(), endsAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();

export async function GET() {
  try { return jsonResponse({ updates: await listCommunityUpdates() }); }
  catch { return jsonResponse({ error: "Community updates are unavailable." }, 503); }
}

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  if (!reportWritesEnabled()) return jsonResponse({ error: "Community reporting is temporarily read-only." }, 503);
  let body: unknown;
  try { body = await readBoundedJson(request, 8_192); }
  catch (error) { return jsonResponse({ error: "Use a short report." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Add a category, title, description, campus location, and valid event times." }, 400);
  const input = parsed.data;
  if (!isWithinCampusMapBounds(input.coordinates)) return jsonResponse({ error: "Choose a location on the campus map." }, 400);
  if (input.kind === "event" && (!input.startsAt || !input.endsAt || Date.parse(input.endsAt) <= Date.parse(input.startsAt))) return jsonResponse({ error: "Add the event start and end times." }, 400);
  if (input.kind !== "event" && (input.startsAt || input.endsAt)) return jsonResponse({ error: "Only events can have event times." }, 400);
  const text = `${input.title}\n${input.description}`;
  if (!screenReportText(text).allowed) return jsonResponse({ error: "This report includes private details, an allegation, or an emergency. Please revise it." }, 400);
  try {
    const rate = await checkRequestRateLimits(request, input.visitorId, {
      network: { action: "community_post_net", limit: 12, windowSeconds: 3600 },
      visitor: { action: "community_post_user", limit: 6, windowSeconds: 86400 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You have posted several updates recently. Try again later." }, 429);
    const moderation = await moderateReportInput(text);
    if (!moderation.allowed) return jsonResponse({ error: "This report could not be posted. Please revise it." }, 400);
    const update = await createCommunityUpdate({ ...input, id: randomUUID() });
    return jsonResponse({ update }, 201);
  } catch (error) {
    if (error instanceof IntakeServiceError) return jsonResponse({ error: "Report processing is unavailable. Your draft is still here." }, 503);
    return jsonResponse({ error: "The report could not be saved. Your draft is still here." }, 503);
  }
}
