import { chicagoDate, isValidDate } from "@/lib/chicago-date";
import { getEventsForDate } from "@/lib/uw-events-api";
import { Experience } from "@/components/experience";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string; event?: string }> }) {
  const query = await searchParams;
  const date = query.date && isValidDate(query.date) ? query.date : chicagoDate();
  let initial;
  try { initial = await getEventsForDate(date); } catch { initial = null; }
  return <Experience initialDate={date} initial={initial} initialEvent={query.event} mapKey={process.env.NEXT_PUBLIC_MAPTILER_KEY || ""} />;
}
