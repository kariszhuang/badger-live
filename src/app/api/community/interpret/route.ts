import { NextRequest } from "next/server";
import { z } from "zod";
import { interpretCommunityDescription } from "@/lib/community/interpret";
import { getCampusPlaces } from "@/lib/report/store";
import { readBoundedJson, RequestBodyError } from "@/lib/report/body";
import { screenReportText } from "@/lib/report/policy";
import { OpenAIServiceError } from "@/lib/report/openai-client";
import { checkRequestRateLimits, jsonResponse, requestHasAllowedOrigin } from "@/lib/report/route-helpers";

export const runtime = "nodejs";

const schema = z.object({ visitorId: z.string().uuid(), text: z.string().trim().min(12).max(1000) }).strict();

export async function POST(request: NextRequest) {
  if (!requestHasAllowedOrigin(request)) return jsonResponse({ error: "This request did not come from this site." }, 403);
  let body: unknown;
  try { body = await readBoundedJson(request, 4096); }
  catch (error) { return jsonResponse({ error: "Use a short description." }, error instanceof RequestBodyError && error.code === "too_large" ? 413 : 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Describe the update in at least a sentence." }, 400);
  if (!screenReportText(parsed.data.text).allowed) return jsonResponse({ error: "Remove private details, allegations, or emergency requests before continuing." }, 400);
  try {
    const rate = await checkRequestRateLimits(request, parsed.data.visitorId, {
      network: { action: "community_interpret_net", limit: 20, windowSeconds: 3600 },
      visitor: { action: "community_interpret_user", limit: 35, windowSeconds: 86400 },
    });
    if (!rate.allowed) return jsonResponse({ error: "You have tried several descriptions recently. Try again later." }, 429);
    const draft = await interpretCommunityDescription({ text: parsed.data.text, places: await getCampusPlaces() });
    if (!screenReportText(`${draft.title}\n${draft.description}`).allowed) return jsonResponse({ error: "The draft needs safer wording. Please revise your description." }, 400);
    return jsonResponse({ draft });
  } catch (error) {
    if (error instanceof OpenAIServiceError) return jsonResponse({ error: "Description help is unavailable right now. You can fill in the fields yourself." }, 503);
    return jsonResponse({ error: "Description help is unavailable right now. You can fill in the fields yourself." }, 503);
  }
}
