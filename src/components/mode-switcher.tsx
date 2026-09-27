"use client";

import { CalendarDays, ShieldCheck } from "lucide-react";

export type DiscoveryMode = "events" | "crime";

export function ModeSwitcher({ value, onChange }: { value: DiscoveryMode; onChange: (mode: DiscoveryMode) => void }) {
  return <div className="mode-switcher" role="group" aria-label="Choose discovery layer">
    <button type="button" aria-pressed={value === "events"} onClick={() => onChange("events")}><CalendarDays size={15} />Events</button>
    <button type="button" aria-pressed={value === "crime"} onClick={() => onChange("crime")}><ShieldCheck size={15} />Crime</button>
  </div>;
}
