import "server-only";
import type { CampusPlace } from "./types";
import { parseWalkingDirections, WalkingDirectionsError, type WalkingDirections } from "./walking-route-parser";

export { WalkingDirectionsError };
export type { WalkingDirections };

export async function getWalkingDirections(origin: CampusPlace, destination: CampusPlace): Promise<WalkingDirections> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) throw new WalkingDirectionsError("not-configured");
  let response: Response;
  try {
    response = await fetch("https://api.openrouteservice.org/v2/directions/foot-walking/geojson", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({ coordinates: [origin.coordinates, destination.coordinates], instructions: false }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  } catch {
    throw new WalkingDirectionsError("upstream");
  }
  if (!response.ok) throw new WalkingDirectionsError("upstream");
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new WalkingDirectionsError("invalid-response"); }
  return parseWalkingDirections(data);
}
