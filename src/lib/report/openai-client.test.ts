import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callOpenAI, OpenAIServiceError, parseOpenAIStructuredOutput } from "./openai-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function captureError(callback: () => unknown) {
  try { callback(); }
  catch (error) { return error; }
  throw new Error("Expected callback to fail");
}

describe("OpenAI server client", () => {
  it("sends authenticated, non-stored requests to the fixed OpenAI endpoint", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "resp_test", status: "completed" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callOpenAI("responses", { model: "gpt-6-luna", store: false }, 18_000)).resolves.toMatchObject({ status: "completed" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer test-secret", "Content-Type": "application/json" },
      cache: "no-store",
    }));
  });

  it("classifies project access separately from transient HTTP failures without echoing provider text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 401 })));
    await expect(callOpenAI("responses", {}, 1000)).rejects.toMatchObject({ code: "not-configured", diagnostic: "http-401" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 429 })));
    await expect(callOpenAI("responses", {}, 1000)).rejects.toMatchObject({ code: "upstream", diagnostic: "http-429" });
  });

  it("fails closed on network, malformed JSON, refusals, incomplete output, and invalid structured data", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network detail")));
    await expect(callOpenAI("responses", {}, 1000)).rejects.toMatchObject({ code: "upstream", diagnostic: "network" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(callOpenAI("responses", {}, 1000)).rejects.toMatchObject({ code: "invalid-response", diagnostic: "malformed-api-json" });

    const schema = z.object({ answer: z.string() }).strict();
    expect(captureError(() => parseOpenAIStructuredOutput({ status: "completed", output: { text: "malformed" } }, schema)))
      .toMatchObject({ code: "invalid-response", diagnostic: "missing-output-text" });
    expect(captureError(() => parseOpenAIStructuredOutput({ output: [{ content: [{ type: "refusal" }] }] }, schema)))
      .toMatchObject({ code: "invalid-response", diagnostic: "refusal" });
    expect(captureError(() => parseOpenAIStructuredOutput({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }, schema)))
      .toMatchObject({ code: "invalid-response", diagnostic: "incomplete-output-limit" });
    const invalid = captureError(() => parseOpenAIStructuredOutput({ status: "completed", output: [{ content: [{ type: "output_text", text: "{\"answer\":\"private model text\",\"extra\":true}" }] }] }, schema));
    expect(invalid).toMatchObject({ code: "invalid-response", diagnostic: "schema-root" });
    expect(invalid).not.toHaveProperty("message", expect.stringContaining("private model text"));
  });

  it("does not include secrets in errors when configuration is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(callOpenAI("responses", {}, 1000)).rejects.toBeInstanceOf(OpenAIServiceError);
    await expect(callOpenAI("responses", {}, 1000)).rejects.toMatchObject({ code: "not-configured" });
  });
});
