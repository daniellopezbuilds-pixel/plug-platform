import { signupTypeLabel } from "@/lib/signupRoles";

/**
 * The account type shown beside a name — "Electrician", "C-10 Contractor".
 *
 * ONE COMPONENT, EVERY SURFACE. Feed posts, comments, applicant cards,
 * connections, the marketplace, the admin panel and both profile views all
 * render this rather than formatting the value themselves, so the wording can
 * only change in one place.
 *
 * Reads profiles.signup_type, which is a server-held column guarded by
 * profiles_guard_signup_type(). It is deliberately NOT the signup_type in
 * raw_user_meta_data: that is client-writable, so a label sourced from it would
 * let anyone display "C-10 Contractor" beside their own name, and it is
 * readable only for the signed-in user, so it cannot reach anyone else's name
 * at all. See 20260916130000_badges.sql section 1.
 *
 * Renders nothing for an unrecognised or missing value. Accounts created before
 * the current signup form have no signup_type, and no label is the correct
 * answer for them — the same thing /dashboard/profile already does with its
 * signup details section.
 *
 * TWO SHAPES, SAME WORDS. Cards and profiles stack the label under the name,
 * which is the layout in the spec. Feed posts and comments run the name inline
 * with other metadata ("Daniel Lopez · Commercial"), and a block label there
 * would shove the post body onto a new line — so those pass `inline` and get
 * "· Electrician" in the same run of text. The wording is identical either way;
 * only the box changes.
 */
export function AccountTypeLabel({
  signupType,
  inline = false,
  className = "",
}: {
  signupType: string | null | undefined;
  inline?: boolean;
  className?: string;
}) {
  const label = signupTypeLabel(signupType);

  if (!label) return null;

  if (inline) {
    return (
      <span className={`text-gray-400 font-normal text-sm ${className}`}>
        {" · "}
        {label}
      </span>
    );
  }

  return (
    <span
      className={`block text-xs font-normal text-gray-400 leading-tight ${className}`}
    >
      {label}
    </span>
  );
}
