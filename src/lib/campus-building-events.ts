import type { CampusBuilding } from "./campus-buildings";
import type { CampusEvent } from "./events";

function mapObjectId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.hostname !== "map.wisc.edu") return undefined;
    const initObject = url.searchParams.get("initObj");
    return initObject ? initObject.replace(/^0+(?=\d)/, "") : undefined;
  } catch {
    return undefined;
  }
}

function normalizedName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function appearsAsLocation(value: string, location: string) {
  const name = normalizedName(value);
  const label = normalizedName(location);
  return name.length >= 5 && (` ${label} `).includes(` ${name} `);
}

/** Match official map IDs first, then exact venue/location names; coordinates alone never count. */
export function campusEventsAtBuilding(events: CampusEvent[], building: CampusBuilding): CampusEvent[] {
  const buildingId = mapObjectId(building.officialMapUrl);
  return events.filter((event) => {
    const eventId = mapObjectId(event.uwMapUrl);
    if (buildingId && eventId) return buildingId === eventId;
    const buildingName = normalizedName(building.name);
    if (event.venueName && normalizedName(event.venueName) === buildingName) return true;
    return appearsAsLocation(building.name, event.locationLabel);
  });
}

export function googleMapsDirectionsUrl([longitude, latitude]: [number, number]): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${latitude},${longitude}`);
  return url.toString();
}
