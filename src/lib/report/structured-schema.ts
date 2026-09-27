import { z } from "zod";
import { hazardKinds } from "./types";

export const intakePlanSchema = z.object({
  intent: z.enum(["report", "out_of_scope", "question"]),
  issues: z.array(z.object({
    kind: z.enum(hazardKinds),
    evidence: z.string().max(240).nullable(),
    place_name: z.string().max(120).nullable(),
    observed_at: z.string().datetime().nullable(),
    observed_at_basis: z.enum(["submission", "explicit_in_text", "unknown"]),
    location_intent: z.enum(["here", "named_place", "relative", "missing"]),
    relative_to_issue_index: z.number().int().min(0).max(7).nullable(),
  }).strict()).max(8),
  missing_critical_field: z.enum(["none", "location", "time", "issue"]),
  followup: z.string().max(180).nullable(),
  acknowledgment: z.string().max(120),
}).strict();

export type IntakePlanOutput = z.infer<typeof intakePlanSchema>;

export const intakePlanJsonSchema = {
  type: "object",
  additionalProperties: false,
    required: ["intent", "issues", "missing_critical_field", "followup", "acknowledgment"],
  properties: {
    intent: { type: "string", enum: ["report", "out_of_scope", "question"] },
    issues: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "evidence", "place_name", "observed_at", "observed_at_basis", "location_intent", "relative_to_issue_index"],
        properties: {
          kind: { type: "string", enum: hazardKinds },
          evidence: { type: ["string", "null"], maxLength: 240 },
          place_name: { type: ["string", "null"], maxLength: 120 },
          observed_at: { type: ["string", "null"] },
          observed_at_basis: { type: "string", enum: ["submission", "explicit_in_text", "unknown"] },
          location_intent: { type: "string", enum: ["here", "named_place", "relative", "missing"] },
          relative_to_issue_index: { type: ["integer", "null"], minimum: 0, maximum: 7 },
        },
      },
    },
    missing_critical_field: { type: "string", enum: ["none", "location", "time", "issue"] },
    followup: { type: ["string", "null"], maxLength: 180 },
    acknowledgment: { type: "string", maxLength: 120 },
  },
} as const;
