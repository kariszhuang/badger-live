import { hazardKinds, type HazardKind } from "./types";

export type HazardInvalidation = { id: string; version: number; kind: HazardKind };

const reportIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const knownHazardKinds = new Set<string>(hazardKinds);

export function parseHazardInvalidation(value: unknown): HazardInvalidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (keys.length !== 3 || !keys.every((key) => key === "id" || key === "version" || key === "kind")) return null;
  if (typeof payload.id !== "string" || !reportIdPattern.test(payload.id)) return null;
  if (typeof payload.version !== "number" || !Number.isSafeInteger(payload.version) || payload.version < 1) return null;
  if (typeof payload.kind !== "string" || !knownHazardKinds.has(payload.kind)) return null;
  return { id: payload.id, version: payload.version, kind: payload.kind as HazardKind };
}
