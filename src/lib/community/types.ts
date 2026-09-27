export const communityKinds = ["event", "construction", "ice", "snow", "blocked_path", "flooding", "lighting", "accessibility", "other"] as const;
export type CommunityKind = (typeof communityKinds)[number];

export const communityKindLabels: Record<CommunityKind, string> = {
  event: "Event", construction: "Construction", ice: "Icy surface", snow: "Snow", blocked_path: "Blocked path",
  flooding: "Standing water", lighting: "Lighting", accessibility: "Accessibility", other: "Other update",
};

export type CommunityUpdate = {
  id: string;
  kind: CommunityKind;
  title: string;
  description: string;
  placeName: string;
  coordinates: [number, number];
  startsAt: string | null;
  endsAt: string | null;
  sourceUrl: string | null;
  isDemo: boolean;
  createdAt: string;
  upVotes: number;
  downVotes: number;
};
