"use client";

import { useProfileBadge } from "@/hooks/useProfileBadges";
import { AccountTypeLabel } from "./AccountTypeLabel";
import { VerifiedCheck } from "./VerifiedCheck";

/**
 * Everything that goes with a name: the check mark, then the account type.
 *
 * THIS IS THE ONE THING CALL SITES USE. Drop it immediately after the name
 * text, inside whatever element already holds the name:
 *
 *     <h3>
 *       {profile.full_name || "Unnamed"}
 *       <NameMeta profileId={profile.id} signupType={profile.signup_type} />
 *     </h3>
 *
 * The check mark is inline, so it sits against the last word of the name. The
 * label is a block, so it drops to its own line underneath — which is the
 * layout in the spec:
 *
 *     Daniel Lopez ✓
 *     Electrician
 *
 * Both halves render nothing when they have nothing to say: no signup_type (an
 * account predating the current signup form) means no label, and no
 * verification badge means no mark. A name with neither looks exactly as it
 * does today.
 *
 * profileId is optional because a few surfaces join a profile without
 * selecting its id — the label still works, and the check mark is simply
 * absent rather than the component refusing to render.
 */
export function NameMeta({
  profileId,
  signupType,
  inline = false,
  labelClassName,
}: {
  profileId?: string | null;
  signupType: string | null | undefined;
  /** Run the label on with the name instead of dropping it to its own line.
   *  For the feed and comments — see AccountTypeLabel. */
  inline?: boolean;
  labelClassName?: string;
}) {
  const { verified } = useProfileBadge(profileId);

  return (
    <>
      <VerifiedCheck verified={verified} />
      <AccountTypeLabel
        signupType={signupType}
        inline={inline}
        className={labelClassName}
      />
    </>
  );
}
