import type { CampusBuilding } from "./campus-buildings";

type TopicRule = { label: string; pattern: RegExp };

// Ordered from specific disciplines to broader campus functions so every
// building gets useful search terms without a pile of generic tags.
const topicRules: TopicRule[] = [
  { label: "Microbiology", pattern: /microb|bacteri|virolog|pathogen/ },
  { label: "Food science", pattern: /food science|food safety|culinary|nutrition|dairy|meat science|cereal crop/ },
  { label: "Agriculture", pattern: /agricultur|agronom|horticultur|crop|soil science|animal science|livestock|poultry|forestry|forest product/ },
  { label: "Veterinary medicine", pattern: /veterinar|animal health|animal hospital/ },
  { label: "Biology & life sciences", pattern: /biology|biolog|genetic|biochem|biomedical|life science|cell and molecular|primate|zoolog|botan|entomolog/ },
  { label: "Chemistry", pattern: /chemistry|chemical|pharmac|molecular science/ },
  { label: "Physics & astronomy", pattern: /physics|astronom|space science|nuclear science|fusion/ },
  { label: "Math & statistics", pattern: /mathemat|statistics|statistical|biostatistic/ },
  { label: "Computing & data", pattern: /computer science|computing|data science|artificial intelligence|\bai\b|information technology|informatics/ },
  { label: "Engineering", pattern: /engineering|engineer|mechanical|electrical|materials science|nanoscale|biological systems/ },
  { label: "Environment & water", pattern: /environment|ecolog|climate|atmospher|ocean|water science|limnolog|sustainab|natural resource|wildlife/ },
  { label: "Health & medicine", pattern: /health|medical|medicine|hospital|clinic|nursing|pharmacy|cancer|disability|wellbeing|wellness/ },
  { label: "Education & teaching", pattern: /education|teacher|teaching|curriculum|learning|children|child.?care|school of/ },
  { label: "Arts & performance", pattern: /music|concert|dance|theatre|theater|art museum|art history|gallery|film|performance|media studio/ },
  { label: "Humanities & languages", pattern: /humanit|language|history|english|philosoph|literature|cultur|gender|indigenous/ },
  { label: "Business & entrepreneurship", pattern: /business|entrepreneur|startup|agribusiness|economics|cooperative/ },
  { label: "Law & public affairs", pattern: /law school|legal|public affairs|political science|government|policy|student conduct/ },
  { label: "Libraries & study", pattern: /librar|archives|study area|writing center|information commons/ },
  { label: "Student housing", pattern: /residence hall|residence house|student housing|apartments|student rooms/ },
  { label: "Student services", pattern: /student support|advising|admissions|orientation|financial aid|career service|veteran|counseling|student center|student affairs/ },
  { label: "Dining & events", pattern: /dining|restaurant|market|food|meeting room|conference|event venue|union|guest accommodation/ },
  { label: "Athletics & recreation", pattern: /athletic|stadium|recreation|fitness|hockey|basketball|softball|tennis|rowing|field house|arena|gymnasium|sports/ },
  { label: "Campus operations", pattern: /facilities|heating|cooling|fleet|garage|physical plant|maintenance|police|security|administration|chancellor|provost/ },
  { label: "Research", pattern: /research|laborator|laboratory|institute|science/ },
];

const ignoredNameWords = new Set([
  "and", "at", "building", "center", "centre", "complex", "hall", "house", "of", "the", "university", "uw", "wisconsin",
  "laboratory", "laboratories", "lab", "unit", "facility", "facilities", "office", "offices", "residence", "apartments",
]);

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function campusBuildingTags(building: Pick<CampusBuilding, "name" | "shortDescription" | "streetAddress">): string[] {
  const searchable = normalize(`${building.name} ${building.shortDescription}`);
  const topics = topicRules.filter(({ pattern }) => pattern.test(searchable)).map(({ label }) => label);
  const nameKeywords = building.name
    .replace(/[()&,.'’–-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !ignoredNameWords.has(normalize(word)))
    .map((word) => word[0].toLocaleUpperCase() + word.slice(1));
  const tags = [...new Set([...nameKeywords, ...topics])].filter((tag) => !/^\d+$/.test(tag));
  return (tags.length ? tags : ["Campus"]).slice(0, 7);
}

export function matchesCampusBuildingSearch(building: CampusBuilding, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = normalize([
    building.name,
    building.shortDescription,
    building.buildingNumber,
    building.streetAddress,
    ...building.tags,
  ].filter(Boolean).join(" "));
  return haystack.includes(needle);
}
