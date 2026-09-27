import { NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { checkRequestRateLimits, jsonResponse, reportWritesEnabled, requestHasAllowedOrigin } from "@/lib/report/route-helpers";
import { voteCommunityUpdate } from "@/lib/community/store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const schema = z.object({ visitorId: z.string().uuid(), vote: z.union([z.literal(1), z.literal(-1)]) }).strict();

export async function POST(request: NextRequest, context: Context) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  if (!reportWritesEnabled()) return jsonResponse({ error: "Community voting is temporarily read-only." }, 503);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return jsonResponse({ error: "Report not found." }, 404);
  let body: unknown;
  try { body = await readBoundedJson(request, 1_024); }
  catch (error) { return jsonResponse({ error: "Choose thumbs up or down." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Choose thumbs up or down." }, 400);
  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "community_vote_net", limit: 60, windowSeconds: 3600 },
      visitor: { action: "community_vote_user", limit: 30, windowSeconds: 86400 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You have rated several reports recently. Try again later." }, 429);
    const result = await voteCommunityUpdate(id, rate.visitorHmac, parsed.data.vote);
    if (!result?.found) return jsonResponse({ error: "Report not found." }, 404);
    return jsonResponse(result);
  } catch { return jsonResponse({ error: "Your rating could not be saved." }, 503); }
}
