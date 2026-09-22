"use client";

import { getBrandingPublicUrl } from "@/lib/branding";
import { NameMeta } from "@/components/ui/NameMeta";
import { UnionBadge } from "@/components/ui/UnionBadge";

/**
 * The composed block at the top of a profile: photo, name, what they are,
 * where they are, what they do.
 *
 * ONE HEADER, THREE SURFACES — the profile editor, the public profile page and
 * the preview modal. They had three near-identical blocks that had already
 * drifted: different avatar sizes, different heading levels, and a facts line
 * that was "SP-000000 · trade · location" in two of them and absent from the
 * third. A profile should look the same whoever is looking at it, and that is
 * only true if there is one component.
 *
 * WHAT CHANGED FROM THE THREE IT REPLACES. It was a row of labelled fields —
 * an avatar, a name, and a grey interpunct line carrying the profile number
 * first. Now:
 *
 *   - the NAME is the biggest thing, because it is what the page is about
 *   - the account type and verification marker sit with it, via NameMeta, so
 *     the shield reads as part of the identity rather than as decoration
 *   - trade and classification are CHIPS, not grey text in a run-on line: they
 *     are the two facts an employer scans for, and they were competing with a
 *     profile number nobody reads
 *   - the profile number moves last and quiet — it is a reference you quote,
 *     not a thing you read
 *
 * RESTRAINT, DELIBERATELY. No gradient, no cover-image treatment, no second
 * accent. The only colour is the existing accent on the avatar ring and the
 * magenta already used for secondary text; everything else is zinc. A page an
 * employer uses to judge somebody should look considered, not decorated.
 *
 * SIZES. `full` on a page, `compact` in the modal — the modal is 512px wide
 * and a 96px avatar with a 4xl name eats the fold before any content shows.
 */

/** The initial in the avatar when there is no photo. */
function initial(name: string | null | undefined) {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

export function ProfileHeader({
  profileId,
  fullName,
  profileNumber,
  signupType,
  companyLogoPath,
  companyBannerPath,
  trade,
  classification,
  location,
  yearsExperience,
  unionStatus,
  unionVerified,
  bio,
  size = "full",
  actions,
}: {
  profileId: string | null | undefined;
  fullName: string | null;
  profileNumber?: string | null;
  signupType: string | null | undefined;
  companyLogoPath?: string | null;
  /** Only the full size renders a banner; the modal has no room for one. */
  companyBannerPath?: string | null;
  trade?: string | null;
  classification?: string | null;
  location?: string | null;
  yearsExperience?: string | null;
  unionStatus?: string | null;
  unionVerified?: boolean;
  bio?: string | null;
  size?: "full" | "compact";
  /** Buttons that belong with the identity — Message, View resume. */
  actions?: React.ReactNode;
}) {
  const compact = size === "compact";

  const avatarClass = compact ? "w-14 h-14 text-xl" : "w-20 h-20 text-3xl";
  const nameClass = compact
    ? "text-xl font-bold text-white"
    : "text-3xl sm:text-4xl font-bold text-white leading-tight";

  // Trade and classification are the scan targets. Location joins them because
  // it decides whether the rest is worth reading at all.
  const chips = [trade, classification, location].filter(Boolean) as string[];

  return (
    <header>
      {!compact && companyBannerPath && (
        <img
          src={getBrandingPublicUrl(companyBannerPath)}
          alt=""
          className="w-full h-32 sm:h-44 rounded-xl object-cover border border-zinc-800 mb-5"
        />
      )}

      {/* items-start, not items-center: once the name wraps to two lines on a
          phone the avatar would drift to the middle of them. */}
      <div className="flex items-start gap-4">
        {companyLogoPath ? (
          <img
            src={getBrandingPublicUrl(companyLogoPath)}
            alt=""
            className={`${avatarClass} shrink-0 rounded-full object-cover border-2 border-accent/40`}
          />
        ) : (
          // A lettered circle rather than a generic silhouette. Most accounts
          // have no photo, and a page full of identical grey outlines reads as
          // broken where initials read as people.
          <div
            aria-hidden
            className={`${avatarClass} shrink-0 rounded-full border-2 border-zinc-700 bg-zinc-800 text-gray-400 font-bold flex items-center justify-center`}
          >
            {initial(fullName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 className={nameClass}>
            {fullName || "User"}
            <NameMeta
              profileId={profileId}
              signupType={signupType}
              labelClassName={compact ? "text-xs mt-0.5" : "text-sm mt-1"}
            />
          </h1>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="text-xs font-medium text-gray-300 bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {yearsExperience && (
              <span className="text-xs text-gray-400">
                {yearsExperience} experience
              </span>
            )}
            {unionStatus && (
              <UnionBadge
                status={unionStatus}
                verified={unionVerified ?? false}
              />
            )}
          </div>
        </div>
      </div>

      {bio && (
        <p
          className={`text-gray-300 whitespace-pre-wrap mt-4 ${
            compact ? "text-sm" : ""
          }`}
        >
          {bio}
        </p>
      )}

      {actions && <div className="flex flex-wrap gap-2 mt-4">{actions}</div>}

      {profileNumber && (
        // Last and quiet. It is a reference somebody quotes at you, not
        // something anybody reads down the page.
        <p className="text-xs text-gray-500 mt-4 font-mono">{profileNumber}</p>
      )}
    </header>
  );
}
