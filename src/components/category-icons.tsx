"use client";

import {
  BadgeDollarSign,
  BookOpen,
  CalendarDays,
  Crosshair,
  DoorOpen,
  Hammer,
  HandCoins,
  Lightbulb,
  Music2,
  Palette,
  ShieldAlert,
  Snowflake,
  Sprout,
  Trophy,
  Utensils,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CrimeCategory } from "@/lib/crime-model";
import type { EventCategory, FilterCategory } from "@/lib/events";
import type { CommunityReportCategory } from "@/lib/safety";

const eventIcons: Record<FilterCategory, LucideIcon> = {
  all: CalendarDays,
  music: Music2,
  food: Utensils,
  arts: Palette,
  sports: Trophy,
  talks: BookOpen,
  outdoors: Sprout,
  community: UsersRound,
};

const crimeIcons: Record<Exclude<CrimeCategory, "theft">, LucideIcon> = {
  fraud: BadgeDollarSign,
  "property-damage": Hammer,
  burglary: DoorOpen,
  robbery: HandCoins,
  assault: ShieldAlert,
  weapons: Crosshair,
};

const safetyIcons: Record<CommunityReportCategory, LucideIcon> = {
  lighting: Lightbulb,
  "blocked-access": DoorOpen,
  "slippery-surface": Snowflake,
  "facility-hazard": Wrench,
};

function Icon({ icon: Glyph, size = 16 }: { icon: LucideIcon; size?: number }) {
  return <Glyph aria-hidden="true" focusable="false" size={size} strokeWidth={2} />;
}

export function EventCategoryIcon({ category, size }: { category: FilterCategory | EventCategory; size?: number }) {
  const icon = category === "other" ? CalendarDays : eventIcons[category];
  return <Icon icon={icon} size={size} />;
}

export function CrimeCategoryIcon({ category, size }: { category: CrimeCategory; size?: number }) {
  if (category === "theft") return <ThiefIcon size={size ?? 16} />;
  return <Icon icon={crimeIcons[category]} size={size} />;
}

export function SafetyCategoryIcon({ category, size }: { category: CommunityReportCategory; size?: number }) {
  return <Icon icon={safetyIcons[category]} size={size} />;
}

function ThiefIcon({ size }: { size: number }) {
  return <svg className="thief-icon" data-icon="theft" aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 512 512" fill="currentColor">
    <path d="M468.584 138.325C461.011 58.752 372.286 0 255.998 0S50.984 58.752 43.41 138.325c-13.312 9.707-22.08 25.301-22.08 43.008 0 25.749 18.347 47.296 42.645 52.245v21.483c61.568-24.661 130.453-24.661 192.021 0 61.547-24.661 130.453-24.661 192 0v-21.483c24.32-4.949 42.667-26.496 42.667-52.245 0-17.706-8.768-33.301-22.08-43.008ZM437.331 192h-10.667H85.31H74.664c-5.867 0-10.667-4.779-10.667-10.667s4.8-10.667 10.667-10.667h362.667c5.867 0 10.667 4.779 10.667 10.667S443.198 192 437.331 192Z" />
    <path d="M283.561 290.55c1.813 5.333 4.928 9.749 9.451 13.483 11.434 9.514 37.973 19.796 99.754 14.634 22.912-1.92 28.288-9.109 29.376-27.52-44.715-16.021-93.781-16.213-138.581-.597Z" />
    <path d="M89.919 291.136c1.259 18.709 6.869 25.664 29.333 27.541 61.652 5.142 88.298-5.12 99.733-14.634 4.523-3.733 7.637-8.149 9.451-13.504-44.779-15.595-93.824-15.424-138.517.597Z" />
    <path d="M397.047 361.146c-12.437 1.045-24.149 1.557-35.136 1.557-45.547 0-78.613-8.96-100.544-27.136-2.048-1.707-3.563-3.691-5.376-5.504-1.792 1.813-3.328 3.797-5.355 5.504-21.931 18.176-54.997 27.136-100.565 27.136-10.965 0-22.656-.512-35.115-1.557-24.256-2.027-40.256-9.387-50.987-19.072v106.069c.021 35.221 28.715 63.851 63.936 63.851h256.171c35.264 0 63.915-28.651 63.915-63.872V342.031c-10.709 9.728-26.688 17.088-50.944 19.115ZM338.039 416.719c-6.293 9.984-19.499 12.949-29.419 6.656-25.707-16.213-50.517-10.496-80.384 18.581-4.16 4.032-9.515 6.037-14.891 6.037-5.547 0-11.093-2.155-15.296-6.443-8.192-8.448-8.021-21.952.427-30.165 55.573-54.123 102.976-43.008 132.907-24.085 9.984 6.293 12.971 19.477 6.656 29.419Z" />
  </svg>;
}
