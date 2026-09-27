export const crimeCategories = ["theft", "fraud", "property-damage", "burglary", "robbery", "assault", "weapons"] as const;
export type CrimeCategory = (typeof crimeCategories)[number];

export const crimeCategoryInfo: Record<CrimeCategory, { label: string; symbol: string }> = {
  theft: { label: "Theft / larceny", symbol: "T" },
  fraud: { label: "Fraud", symbol: "F" },
  "property-damage": { label: "Property damage", symbol: "D" },
  burglary: { label: "Burglary", symbol: "B" },
  robbery: { label: "Robbery", symbol: "R" },
  assault: { label: "Assault / battery", symbol: "A" },
  weapons: { label: "Weapons", symbol: "W" },
};

export type BlotterBuilding = {
  mapObjectId: string;
  name: string;
  center: [longitude: number, latitude: number];
};

export type OfficialCrimeIncident = {
  id: string;
  incidentDate: string;
  occurredAt: string;
  timeLabel: string;
  incidentType: string;
  category: CrimeCategory;
  locationLabel: string;
  buildingId: string | null;
  buildingName: string | null;
  coordinates: [longitude: number, latitude: number] | null;
  summary: string;
  source: "uwpd-official";
  sourceUrl: string;
};

export type CrimeVenueGroup = {
  id: string;
  name: string;
  coordinates: [longitude: number, latitude: number];
  incidents: OfficialCrimeIncident[];
};

export type UnmappedCrimeLocationGroup = {
  id: string;
  name: string;
  incidents: OfficialCrimeIncident[];
};

export function groupCrimeLocations(incidents: OfficialCrimeIncident[]): CrimeVenueGroup[] {
  const groups = new Map<string, CrimeVenueGroup>();
  for (const incident of incidents) {
    if (!incident.coordinates || !incident.buildingId || !incident.buildingName) continue;
    const group = groups.get(incident.buildingId);
    if (group) group.incidents.push(incident);
    else groups.set(incident.buildingId, {
      id: incident.buildingId,
      name: incident.buildingName,
      coordinates: incident.coordinates,
      incidents: [incident],
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    incidents: [...group.incidents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  })).sort((a, b) => (b.incidents[0]?.occurredAt || "").localeCompare(a.incidents[0]?.occurredAt || ""));
}

export function groupUnmappedCrimeLocations(incidents: OfficialCrimeIncident[]): UnmappedCrimeLocationGroup[] {
  const groups = new Map<string, UnmappedCrimeLocationGroup>();
  for (const incident of incidents) {
    if (incident.coordinates) continue;
    const id = incident.locationLabel.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const group = groups.get(id);
    if (group) group.incidents.push(incident);
    else groups.set(id, { id, name: incident.locationLabel, incidents: [incident] });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    incidents: [...group.incidents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  })).sort((a, b) => (b.incidents[0]?.occurredAt || "").localeCompare(a.incidents[0]?.occurredAt || ""));
}

export function filterCrimeIncidents(incidents: OfficialCrimeIncident[], category: CrimeCategory | "all", query: string): OfficialCrimeIncident[] {
  const needle = query.trim().toLocaleLowerCase();
  return incidents.filter((incident) => (category === "all" || incident.category === category)
    && (!needle || [incident.incidentType, incident.locationLabel, incident.buildingName, incident.incidentDate]
      .some((value) => value?.toLocaleLowerCase().includes(needle))));
}
