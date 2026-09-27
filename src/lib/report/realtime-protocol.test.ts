import { describe, expect, it } from "vitest";
import { parseHazardInvalidation } from "./realtime-protocol";

describe("public hazard invalidation payload", () => {
  it("accepts only the minimal canonical identifier, version, and known kind", () => {
    expect(parseHazardInvalidation({ id: "123e4567-e89b-42d3-a456-426614174000", version: 2, kind: "ice" }))
      .toEqual({ id: "123e4567-e89b-42d3-a456-426614174000", version: 2, kind: "ice" });
    expect(parseHazardInvalidation({ id: "123e4567-e89b-42d3-a456-426614174000", version: 2, kind: "ice", title: "private payload" })).toBeNull();
  });

  it.each([
    { id: "not-a-uuid", version: 1, kind: "ice" },
    { id: "123e4567-e89b-42d3-a456-426614174000", version: 0, kind: "ice" },
    { id: "123e4567-e89b-42d3-a456-426614174000", version: 1.5, kind: "ice" },
    { id: "123e4567-e89b-42d3-a456-426614174000", version: 1, kind: "crime" },
  ])("rejects malformed or unsupported event fields", (payload) => {
    expect(parseHazardInvalidation(payload)).toBeNull();
  });
});
