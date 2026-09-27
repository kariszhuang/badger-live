type TopicRule = { label: string; pattern: RegExp };

// These labels describe a building's documented function or discipline.
// Deliberately classify the human-written use summary only: names, addresses,
// and FP&M identifiers are never promoted to tags.
const topicRules: TopicRule[] = [
  { label: "Microbiology", pattern: /\b(?:microbial|microbiology|bacteriology|virology|pathogens?)\b/ },
  { label: "Animal science", pattern: /\b(?:animal(?: and dairy)? sciences?|animal resources|animal biology|animal research|animal-derived|dairy cattle|livestock|poultry|horse barn)\b/ },
  { label: "Food & dairy science", pattern: /\b(?:food science|food safety|dairy research|dairy sciences?|meat science|meat microbiology|muscle biology|cereal crops?|nutrition science|nutritional sciences)\b/ },
  { label: "Agriculture & crops", pattern: /\b(?:agricultur\w*|agronomy|agroecology|horticulture|soil science|crop research|plant science|forestry|forest products|livestock research|poultry research)\b/ },
  { label: "Veterinary medicine", pattern: /\b(?:veterinary|animal health|veterinary diagnostic|veterinary medicine)\b/ },
  { label: "Biology & life sciences", pattern: /\b(?:biology|biological sciences?|life sciences?|genetics|genomics|biochemistry|biochemical|biomedical|cell and molecular|botany|entomology|primate biology|zoology|plant sciences?)\b/ },
  { label: "Chemistry", pattern: /\b(?:chemistry|chemical|chemistry department)\b/ },
  { label: "Pharmacy & pharmacology", pattern: /\b(?:pharmacy|pharmacology|pharmaceutical)\b/ },
  { label: "Physics & astronomy", pattern: /\b(?:physics|astronomy|astronomical|nuclear science|fusion technology|telescope)\b/ },
  { label: "Math & statistics", pattern: /\b(?:mathematics|math classrooms|statistics|biostatistics)\b/ },
  { label: "Computing & data", pattern: /\b(?:computer science|computing|data science|artificial intelligence|informatics|geographic information systems)\b/ },
  { label: "Engineering", pattern: /\b(?:engineering|engineer|mechanical systems|materials science|nanoscale|biological systems engineering)\b/ },
  { label: "Climate & atmospheric science", pattern: /\b(?:climate|atmospheric|oceanic|space sciences?|meteorology)\b/ },
  { label: "Water & freshwater science", pattern: /\b(?:water science|freshwater|limnology|aquatic science|lake research|water resources)\b/ },
  { label: "Environment & ecology", pattern: /\b(?:environmental research|environmental studies|ecological|ecosystems?|sustainability|wildlife ecology|natural resources|ecology research|ecology and evolution|(?<!human )ecology)\b/ },
  { label: "Environmental health & safety", pattern: /\b(?:environmental health|workplace safety|environmental protection)\b/ },
  { label: "Health & clinical care", pattern: /\b(?:health sciences?|medical education|medical research|medical science|medical clinics?|medicine|hospitals?|clinics?|clinical care|specialty care|cancer research|health research|human development|disability services)\b/ },
  { label: "Public health", pattern: /\b(?:public health|laboratory testing|health testing)\b/ },
  { label: "Nursing & clinical training", pattern: /\b(?:nursing|simulation labs|clinical training)\b/ },
  { label: "Psychology & behavior", pattern: /\b(?:psychology|behavioral science|behavioral research)\b/ },
  { label: "Social sciences", pattern: /\b(?:social sciences?|sociology|anthropology|economics|political science)\b/ },
  { label: "Education & teacher preparation", pattern: /\b(?:teacher preparation|teacher education|teacher development|curriculum|school of education|education research|educational programs?)\b/ },
  { label: "Human ecology", pattern: /\bhuman ecology\b/ },
  { label: "Interdisciplinary studies", pattern: /\b(?:integrated liberal studies|interdisciplinary undergraduate|interdisciplinary studies)\b/ },
  { label: "Classrooms & teaching", pattern: /\b(?:classrooms?|teaching|instruction|learning center|learning programs|teacher preparation)\b/ },
  { label: "Visual arts & museums", pattern: /\b(?:visual arts?|art museum|museum of art|art galleries|design galleries|art history|textile collections)\b/ },
  { label: "Music & performance", pattern: /\b(?:music programs?|school of music|music classrooms?|concerts?|rehearsal rooms|performance spaces|dance studios?|theatre|theater)\b/ },
  { label: "Broadcast & media", pattern: /\b(?:radio|broadcasting|communication studios|media studios?|campus broadcasting)\b/ },
  { label: "Humanities & languages", pattern: /\b(?:humanities|language programs?|area studies|german-american|english and philosophy|literature|history programs?|gender and women.s studies|indigenous student)\b/ },
  { label: "Business & entrepreneurship", pattern: /\b(?:business programs?|entrepreneurship|startups?|agribusiness|executive education|business advising)\b/ },
  { label: "Law & public affairs", pattern: /\b(?:law school|legal research|law library|public affairs|public policy|student conduct)\b/ },
  { label: "Libraries & archives", pattern: /\b(?:libraries|library|archives|special collections|writing center|map library|information commons|study areas)\b/ },
  { label: "Student housing", pattern: /\b(?:residence halls?|residence houses?|student housing|student rooms|student and family apartments|university apartments homes|university apartments residences|apartments for (?:uw[- ]madison )?(?:graduate )?students|graduate student apartments|apartments for students and families|homes for students and families|furnished apartments)\b/ },
  { label: "University housing services", pattern: /\b(?:resident services|housing facilities office|university apartments office)\b/ },
  { label: "Student support", pattern: /\b(?:academic advising|advising|admissions|orientation|transfer support|financial aid|career services?|counseling|disability resource|student affairs|veteran services|student conduct|scholarship programs?|international student and faculty services)\b/ },
  { label: "Student community", pattern: /\b(?:student groups|student center|student gathering|community spaces|community space|cultural programs|multicultural|student union)\b/ },
  { label: "Child care & early learning", pattern: /\b(?:child.?care|child care|preschool|infant care|early childhood)\b/ },
  { label: "Dining", pattern: /\b(?:dining|dairy store|food market|dining market|marketplace|restaurants?)\b/ },
  { label: "Events & meeting spaces", pattern: /\b(?:event spaces?|event venue|concerts?|meeting rooms?|conference rooms?|conference facilities|conference and meeting center|meeting and conference center|gathering spaces?|public programs?)\b/ },
  { label: "Alumni relations & advancement", pattern: /\b(?:alumni association|alumni relations|wisconsin alumni association|advancement|alumni programs?)\b/ },
  { label: "Energy & sustainability", pattern: /\b(?:energy research|bioenergy|clean.energy|renewable energy|cogeneration)\b/ },
  { label: "Horticulture & plant collections", pattern: /\b(?:greenhouses?|conservatory|plant collections|tropical plants?)\b/ },
  { label: "Outdoor shelter", pattern: /\bcovered shelter\b/ },
  { label: "Campus history & heritage", pattern: /\b(?:historic campus building|historic science building|first dedicated home|medical school history)\b/ },
  { label: "Community education & outreach", pattern: /\b(?:extension|community outreach|educational programs serving communities|outreach programs?)\b/ },
  { label: "Athletics administration", pattern: /\b(?:intercollegiate athletics|athletics operations|athletic operations)\b/ },
  { label: "ROTC & military studies", pattern: /\b(?:army rotc|naval rotc|air force rotc|rotc classrooms?|reserve officers.? training corps)\b/ },
  { label: "Campus administration", pattern: /\b(?:central administration|campus leadership|chancellor|provost|human resources|university administration)\b/ },
  { label: "Campus safety & security", pattern: /\b(?:police department|campus police|campus security|security operations)\b/ },
  { label: "Athletics & recreation", pattern: /\b(?:varsity|stadium|fitness|recreation center|recreation facility|field house|softball fields|tennis courts|rowing|hockey|basketball practice|indoor arena|sports facility|athletic training|gymnasium|gym)\b/ },
  { label: "Campus facilities & utilities", pattern: /\b(?:heating and cooling|heating plant|cooling plant|cogeneration|physical plant|vehicle fleet|automotive repair|service operations|facilities support|facilities planning and management|grounds operations)\b/ },
  { label: "Research & laboratories", pattern: /\b(?:research|laborator(?:y|ies)|research center|research institute|research facility|research programs?)\b/ },
];

const MAX_BUILDING_TAGS = 5;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

const buildingTagOverrides: Readonly<Record<string, readonly string[]>> = {
  // This mapped object is a dean's residence, not a teaching/research building;
  // the description mentions its college affiliation, which would otherwise
  // incorrectly surface Agriculture and Life Sciences as topics.
  "336": ["Faculty residence"],
};

export function campusBuildingTags(description: string, mapObjectId?: string): string[] {
  if (mapObjectId && buildingTagOverrides[mapObjectId]) return [...buildingTagOverrides[mapObjectId]];
  const evidence = normalize(description);
  return topicRules
    .filter(({ pattern }) => pattern.test(evidence))
    .map(({ label }) => label)
    .slice(0, MAX_BUILDING_TAGS);
}

export function matchesCampusBuildingSearch(building: { name: string; shortDescription: string; buildingNumber?: string | null; streetAddress?: string | null; tags: string[] }, query: string): boolean {
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
