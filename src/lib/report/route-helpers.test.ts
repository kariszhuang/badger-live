import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("./visitor-fingerprint", () => ({ createRequestFingerprints: vi.fn() }));
vi.mock("./store", () => ({ consumeRateLimit: vi.fn() }));

import { requestHasAllowedOrigin } from "./route-helpers";

describe("same-site origin guard", () => {
  it("accepts a same-site origin when the dev server's internal host differs", () => {
    const request = new NextRequest("http://0.0.0.0:3004/api/report/publish", {
      headers: { host: "localhost:3004", origin: "http://localhost:3004" },
    });
    expect(requestHasAllowedOrigin(request)).toBe(true);
  });

  it("rejects a different origin and malformed origin", () => {
    const external = new NextRequest("https://badgerlive.example/api/report/publish", {
      headers: { host: "badgerlive.example", origin: "https://attacker.example" },
    });
    const malformed = new NextRequest("https://badgerlive.example/api/report/publish", {
      headers: { host: "badgerlive.example", origin: "not an origin" },
    });
    expect(requestHasAllowedOrigin(external)).toBe(false);
    expect(requestHasAllowedOrigin(malformed)).toBe(false);
  });

  it("keeps requests without an Origin header compatible with non-browser clients", () => {
    const request = new NextRequest("https://badgerlive.example/api/report/publish", {
      headers: { host: "badgerlive.example" },
    });
    expect(requestHasAllowedOrigin(request)).toBe(true);
  });
});
