import { Icon } from "./Icon";

/**
 * "Verified employer", for an account whose employer documents an admin has
 * approved.
 *
 * Magenta, the secondary accent that app/globals.css reserves for badges. It
 * was raw green — the only green anywhere in the product.
 */
export function EmployerVerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent-2/60 px-2.5 py-0.5 text-xs font-semibold text-accent-2-soft">
      <Icon name="checkCircle" className="h-3.5 w-3.5" />
      Verified employer
    </span>
  );
}
