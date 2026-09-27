import { chicagoDate, isValidDate } from "@/lib/chicago-date";
import { getEventsForDate } from "@/lib/uw-events-api";
import { Experience } from "@/components/experience";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string; event?: string; mode?: string }> }) {
  const query = await searchParams;
  const date = query.date && isValidDate(query.date) ? query.date : chicagoDate();
  const initialMode = query.mode === "crime" ? "crime" : query.mode === "hazards" ? "hazards" : "events";
  let initial;
  try { initial = await getEventsForDate(date); } catch { initial = null; }
  return <Experience initialDate={date} initial={initial} initialEvent={query.event} initialMode={initialMode} mapKey={process.env.NEXT_PUBLIC_MAPTILER_KEY || ""} />;
}
