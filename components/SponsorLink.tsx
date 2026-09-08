"use client";

import { SponsorLockup } from "@/components/SponsorLockup";
import { track } from "@/lib/analytics";
import type { Sponsor } from "@/lib/types";

/**
 * A sponsor's lockup, counted when it is tapped.
 *
 * This is the number the whole commercial argument rests on, so it is recorded
 * everywhere a sponsor appears rather than only on the bout cards. The count
 * goes out through sendBeacon because the tap navigates away immediately and a
 * normal fetch would be cancelled — which would lose exactly the taps that
 * matter most.
 */
export function SponsorLink({
  slug,
  sponsor,
  size = "md",
  boutNumber,
  fighterId,
  className,
}: {
  slug: string;
  sponsor: Sponsor;
  size?: "sm" | "md" | "lg";
  boutNumber?: number;
  fighterId?: string;
  className?: string;
}) {
  return (
    <a
      href={sponsor.url ?? "#"}
      target={sponsor.url ? "_blank" : undefined}
      rel={sponsor.url ? "noreferrer" : undefined}
      className={className}
      onClick={() =>
        track({ slug, kind: "sponsor_tap", sponsorId: sponsor.id, boutNumber, fighterId })
      }
    >
      <SponsorLockup sponsor={sponsor} size={size} />
    </a>
  );
}
