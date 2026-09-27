import { CalendarDays, Construction, Droplets, LightbulbOff, RouteOff, Snowflake, Accessibility, CircleAlert, type LucideIcon } from "lucide-react";
import type { CommunityKind } from "@/lib/community/types";

const icons: Record<CommunityKind, LucideIcon> = {
  event: CalendarDays, construction: Construction, ice: Snowflake, snow: Snowflake,
  blocked_path: RouteOff, flooding: Droplets, lighting: LightbulbOff,
  accessibility: Accessibility, other: CircleAlert,
};

export function CommunityIcon({ kind, size = 18 }: { kind: CommunityKind; size?: number }) {
  const Icon = icons[kind];
  return <Icon size={size} strokeWidth={2.2} aria-hidden="true" />;
}
