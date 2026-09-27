"use client";

import Image from "next/image";
import { Building2 } from "lucide-react";
import { useState } from "react";

export function CampusBuildingPhoto({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!photoUrl || failed) {
    return (
      <div className="building-photo-placeholder" role="img" aria-label={`No photo available for ${name}`}>
        <Building2 size={30} aria-hidden="true" />
        <span>No photo available</span>
      </div>
    );
  }

  return (
    <div className="building-photo">
      <Image
        src={photoUrl}
        alt={`Exterior photo of ${name}`}
        fill
        sizes="(max-width: 650px) calc(100vw - 54px), 560px"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
