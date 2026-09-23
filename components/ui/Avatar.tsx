import { getBrandingPublicUrl } from "@/lib/branding";

/**
 * A person's photo, or their initials when there is none.
 *
 * Initials rather than an empty grey circle: a feed of identical blank discs
 * gives the eye nothing to tell one author from the next, and two letters do.
 * The photo is `company_logo_path` — see CompletionProfile in
 * lib/profileCompletion.tsx for why a person's photo lives in that column.
 */
export function Avatar({
  name,
  photoPath,
  size = "md",
}: {
  name: string | null | undefined;
  photoPath?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";

  if (photoPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public storage URL, same as every other profile image in the app
      <img
        src={getBrandingPublicUrl(photoPath)}
        alt=""
        className={`${box} shrink-0 rounded-full border border-zinc-800 object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} flex shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 font-semibold text-gray-300`}
    >
      {initialsOf(name)}
    </span>
  );
}

function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
