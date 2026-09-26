export const CHICAGO = "America/Chicago";

export function chicagoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHICAGO, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

export function formatEventTime(iso: string, allDay = false): string {
  if (allDay) return "All day";
  return new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function eventStatus(startsAt: string, endsAt: string | undefined, selectedDate: string, now = new Date()): "upcoming" | "now" | "ended" | null {
  if (selectedDate !== chicagoDate(now)) return null;
  const start = new Date(startsAt).valueOf();
  const end = endsAt ? new Date(endsAt).valueOf() : start + 60 * 60 * 1000;
  if (now.valueOf() < start) return "upcoming";
  return now.valueOf() < end ? "now" : "ended";
}
