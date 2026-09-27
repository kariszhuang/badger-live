import type { NextRequest } from "next/server";

export class RequestBodyError extends Error {
  constructor(readonly code: "invalid" | "too_large") {
    super(code);
  }
}

export async function readBoundedJson(request: NextRequest, maxBytes: number): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new RequestBodyError("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError("invalid");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError("too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("invalid");
  }
  try {
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new RequestBodyError("invalid");
  }
}
