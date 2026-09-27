import placeIndex from "@/data/campus-place-index.json";
import { campusBuildingTags } from "./campus-building-tags";
import type { CampusPlace } from "./report/types";

type LocalCampusPlace = CampusPlace & { keywords: string[] };
type PlaceIndexRow = {
  mapObjectId: string;
  name: string;
  buildingNumber: string | null;
  streetAddress: string | null;
  shortDescription: string;
  center: [number, number];
  officialMapUrl: string;
};

let catalog: LocalCampusPlace[] | null = null;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
    .replace(/\b(?:st|street)\b/g, "street")
    .replace(/\b(?:ave|avenue)\b/g, "avenue")
    .replace(/\b(?:dr|drive)\b/g, "drive")
    .replace(/\b(?:rd|road)\b/g, "road")
    .replace(/\b(?:blvd|boulevard)\b/g, "boulevard")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const searchSynonyms: Record<string, string[]> = {
  dorm: ["residence", "housing", "hall"],
  dorms: ["residence", "housing", "hall"],
  residence: ["housing", "dorm"],
  res: ["residence", "housing"],
  lab: ["laboratory", "research"],
  labs: ["laboratory", "research"],
  library: ["libraries", "study", "archives"],
  cafe: ["dining", "food"],
  cafeteria: ["dining", "food"],
  gym: ["recreation", "athletics", "fitness"],
  classroom: ["teaching", "instruction"],
  classrooms: ["teaching", "instruction"],
};
const ignoredSearchTerms = new Set(["a", "at", "in", "near", "on", "the", "uw", "wisconsin", "campus"]);

function shortName(name: string) {
  return name.replace(/\b(?:Hall|Building|Center|Centre|Memorial|Laboratory)\b/gi, " ").replace(/\s+/g, " ").trim();
}

function getCatalog(): LocalCampusPlace[] {
  if (catalog) return catalog;
  const buildings = placeIndex as PlaceIndexRow[];
  const aliasCounts = new Map<string, number>();
  const aliasesByObjectId = new Map<string, string[]>();
  for (const properties of buildings) {
    const aliases = [properties.buildingNumber, shortName(properties.name), properties.streetAddress]
      .filter((value): value is string => Boolean(value && value.length > 1 && normalize(value) !== normalize(properties.name)));
    aliasesByObjectId.set(properties.mapObjectId, aliases);
    for (const alias of aliases) aliasCounts.set(normalize(alias), (aliasCounts.get(normalize(alias)) || 0) + 1);
  }

  catalog = buildings.map((properties) => {
    const tags = campusBuildingTags(properties.shortDescription, properties.mapObjectId);
    const aliases = (aliasesByObjectId.get(properties.mapObjectId) || [])
      .filter((alias) => aliasCounts.get(normalize(alias)) === 1);
    return {
      id: null,
      sourcePlaceId: properties.mapObjectId,
      name: properties.name,
      aliases,
      keywords: [...new Set([properties.shortDescription, properties.streetAddress || "", ...tags])].filter(Boolean),
      kind: "building" as const,
      coordinates: properties.center,
      officialSourceUrl: properties.officialMapUrl,
    };
  });
  return catalog;
}

export function localCampusPlaceMetadata() {
  return getCatalog();
}

export function localCampusPlaceFallback() {
  return getCatalog().map((place) => ({ ...place }));
}

export function searchLocalCampusPlaces(query: string, limit = 12): CampusPlace[] {
  return rankCampusPlaces(getCatalog(), query, limit);
}

export function rankCampusPlaces(places: CampusPlace[], query: string, limit = 12): CampusPlace[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const queryTokens = normalizedQuery.split(" ").filter((token) => token && !ignoredSearchTerms.has(token));
  if (!queryTokens.length) return [];
  const alternatives = queryTokens.map((token) => [token, ...(searchSynonyms[token] || []).map(normalize)]);
  return places.map((place) => {
    const name = normalize(place.name);
    const aliases = place.aliases.map(normalize);
    const keywords = (place.keywords || []).map(normalize);
    const haystack = [name, ...aliases, ...keywords].join(" ");
    const matchesAllTerms = alternatives.every((group) => group.some((term) => haystack.includes(term)));
    if (!matchesAllTerms) return null;
    const score = (name.startsWith(normalizedQuery) ? 100 : name.includes(normalizedQuery) ? 80 : 0)
      + (aliases.some((alias) => alias === normalizedQuery) ? 65 : aliases.some((alias) => alias.includes(normalizedQuery)) ? 50 : 0)
      + (keywords.some((keyword) => keyword.includes(normalizedQuery)) ? 25 : 0)
      + queryTokens.length * 3;
    return { place, score };
  }).filter((entry): entry is { place: CampusPlace; score: number } => entry !== null)
    .sort((left, right) => right.score - left.score || left.place.name.localeCompare(right.place.name))
    .slice(0, limit).map(({ place }) => ({ ...place }));
}
