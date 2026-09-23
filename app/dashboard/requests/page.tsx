"use client";

import { useState } from "react";
import Link from "next/link";
import { useMyRequests } from "@/hooks/useMyRequests";
import { SubmitGeneralConcern } from "@/components/requests/SubmitGeneralConcern";
import { MyRequestsList } from "@/components/requests/MyRequestsList";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { Icon, type IconName } from "@/components/ui/Icon";

type FormType = "general" | null;

/**
 * Requests.
 *
 * PICK A TYPE, FILL IT IN, WITH YOUR HISTORY BESIDE IT. This used to be two
 * tabs — submit, or see what you submitted — so checking whether your last
 * request had been answered meant leaving the form you were filling in. The
 * history is now the right rail (below the form on a phone), and the request
 * types are a row of tiles above the form.
 *
 * Employer and union verification are LINKS to the profile, as before: that
 * is where the document upload and the union status actually live, and a
 * second copy of either form here would drift from the real one.
 *
 * NO ADVERTISEMENT REQUEST. There used to be one: a free form that inserted a
 * pending sponsored_listings row with no price, no payment, no fixed term and
 * no capacity check, for an admin to price by hand. It predated Branding
 * deals, which sells placements with flat pricing, Stripe payment and capacity
 * caps, and it was never removed — so there were two ways to get an ad, one
 * of which skipped all of that. Removed 2026-09-23. Ads are bought on
 * /dashboard/branding-deals. Past ad requests still show in the history rail
 * (useMyRequests reads them) and in the admin All requests queue.
 */
export default function RequestsPage() {
  const [formType, setFormType] = useState<FormType>(null);
  const { requests, loading, reload } = useMyRequests();
  const { withRail } = useRailBreakpoints();

  function handleSubmitted() {
    setFormType(null);
    reload();
  }

  const history = <MyRequestsList requests={requests} loading={loading} />;

  return (
    <RailColumns
      withRail={withRail}
      split={false}
      mainMax={880}
      rightLabel="Your requests"
      right={history}
    >
      <PageHeading
        title="Requests"
        size="compact"
        subtitle="Ask the admin team to verify you, or look into something."
      />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <TypeTile
          icon="shieldCheck"
          title="Employer verification"
          body="Upload your document on your profile"
          href="/dashboard/profile"
        />
        <TypeTile
          icon="userGroup"
          title="Union verification"
          body="Set your union status on your profile"
          href="/dashboard/profile"
        />
        <TypeTile
          icon="chat"
          title="General concern"
          body="Report an issue or ask anything else"
          selected={formType === "general"}
          onClick={() => setFormType(formType === "general" ? null : "general")}
        />
      </div>

      {formType === "general" && <SubmitGeneralConcern onSubmitted={handleSubmitted} />}

      {!withRail && <div className="mt-6">{history}</div>}
    </RailColumns>
  );
}

/** One request type: a link out, or a toggle for the form below. */
function TypeTile({
  icon,
  title,
  body,
  href,
  selected,
  onClick,
}: {
  icon: IconName;
  title: string;
  body: string;
  href?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
          selected ? "border-accent text-accent" : "border-zinc-800 text-gray-400"
        }`}
      >
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-gray-400">{body}</span>
      </span>
      <Icon
        name={href ? "chevronRight" : "chevronDown"}
        className={`h-4 w-4 shrink-0 text-gray-600 transition-transform ${selected ? "rotate-180" : ""}`}
      />
    </>
  );

  const className = `flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
    selected ? "border-accent bg-accent/5" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
  }`;

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-expanded={selected} className={className}>
      {content}
    </button>
  );
}
