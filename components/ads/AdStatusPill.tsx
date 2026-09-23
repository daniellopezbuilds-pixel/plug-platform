import type { Ad } from "@/hooks/useAds";

export type AdState = "unpaid" | "in_review" | "live" | "paused" | "rejected" | "other";

/**
 * Where a brand's submission actually stands, in one word.
 *
 * DERIVED, because no single column says it: an abandoned checkout is
 * status 'pending' with payment_status 'unpaid' and must not read as "in
 * review" (no admin will ever see it); an approved listing is live or paused
 * by is_active. The same rules the submissions list has always applied,
 * pulled out so the dashboard and Branding deals cannot disagree.
 */
export function adStateOf(ad: Pick<Ad, "status" | "payment_status" | "is_active">): AdState {
  if (ad.payment_status === "unpaid") return "unpaid";
  if (ad.status === "pending") return "in_review";
  if (ad.status === "approved") return ad.is_active ? "live" : "paused";
  if (ad.status === "rejected") return "rejected";
  return "other";
}

/**
 * THEME COLOURS. Approved was raw green and Unpaid raw amber. Live is now the
 * orange accent (it is the state a brand is paying for); Unpaid is magenta,
 * because it needs the brand to act; Rejected keeps rose, the palette's one
 * error colour; the rest are neutral.
 */
const STYLES: Record<AdState, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "border-accent-2/60 text-accent-2-soft" },
  in_review: { label: "In review", className: "border-zinc-700 text-gray-300" },
  live: { label: "Live", className: "border-accent/60 bg-accent/10 text-accent" },
  paused: { label: "Paused", className: "border-zinc-700 text-gray-400" },
  rejected: { label: "Rejected", className: "border-rose-900 text-rose-400" },
  other: { label: "—", className: "border-zinc-700 text-gray-400" },
};

export function AdStatusPill({ state, fallback }: { state: AdState; fallback?: string }) {
  const style = STYLES[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.className}`}
    >
      {state === "other" && fallback ? fallback : style.label}
    </span>
  );
}
