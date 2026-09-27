"use client";

const VISITOR_ID_KEY = "badger-live.visitor-id.v1";
const UNDO_KEY = "badger-live.undo-capabilities.v1";

function randomId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const created = randomId();
    localStorage.setItem(VISITOR_ID_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

type SavedCapability = { token: string; expiresAt: number };

function readCapabilities(): Record<string, SavedCapability> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNDO_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => {
      if (!value || typeof value !== "object") return false;
      const capability = value as Partial<SavedCapability>;
      return typeof capability.token === "string" && typeof capability.expiresAt === "number" && capability.expiresAt > now;
    })) as Record<string, SavedCapability>;
  } catch { return {}; }
}

export function saveUndoCapabilities(capabilities: Array<{ reportId: string; token: string }>) {
  const current = readCapabilities();
  const expiresAt = Date.now() + 30 * 60_000;
  for (const capability of capabilities) current[capability.reportId] = { token: capability.token, expiresAt };
  try { localStorage.setItem(UNDO_KEY, JSON.stringify(current)); } catch { /* Undo is optional when browser storage is unavailable. */ }
}

export function getUndoCapability(reportId: string) {
  const current = readCapabilities();
  const token = current[reportId]?.token;
  try { localStorage.setItem(UNDO_KEY, JSON.stringify(current)); } catch { /* Expired local capabilities are ignored. */ }
  return token || null;
}

export function removeUndoCapability(reportId: string) {
  const current = readCapabilities();
  delete current[reportId];
  try { localStorage.setItem(UNDO_KEY, JSON.stringify(current)); } catch { /* Best effort cleanup. */ }
}

export function newSubmissionId() { return randomId(); }
