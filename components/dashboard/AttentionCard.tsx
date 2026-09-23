"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useConnections } from "@/hooks/useConnections";
import { useApplicantCounts } from "@/hooks/useApplicantCounts";
import {
  dismissCompletion,
  isCompletionDismissed,
  missingProfileFields,
  shouldPromptCompletion,
} from "@/lib/profileCompletion";
import type { ActiveProfile } from "@/hooks/useActiveRole";

/**
 * "Needs your attention" — the first thing on the dashboard.
 *
 * WHY THIS LEADS. The dashboard used to open on four stat tiles and three
 * buttons: numbers you could not act on and links the sidebar already had.
 * The first screen after logging in should answer "is anything waiting for
 * me?", and every row here is something that is, with a link to where you
 * deal with it. LinkedIn's home page leads with the same kind of action
 * cards for the same reason.
 *
 * LIVE, BECAUSE THE SOURCES ARE. Unread messages, application decisions, new
 * applicants and pending requests are the same realtime counts the sidebar
 * badges show, so the two can never disagree.
 *
 * THE PROFILE ROW KEEPS THE OLD BANNER'S PROMISE: dismiss it once and it is
 * gone for good, via the same stored flag (lib/profileCompletion.tsx). Read in
 * a useState initialiser, which is safe here for the reason the banner gave:
 * this only mounts after the layout's client-side profile fetch, so it never
 * renders on the server.
 *
 * NOTHING WAITING IS ONE QUIET LINE, not an empty box: being caught up is
 * good news and should take up as little room as it deserves.
 */
export function AttentionCard({ profile }: { profile: ActiveProfile }) {
  const unreadMessages = useUnreadMessagesCount();
  const counts = useSidebarCounts();
  // The total, not the loaded page: requests are fetched five at a time.
  const { incomingTotal } = useConnections();
  // Applicants WAITING ON A DECISION — the same number as the New tab on
  // Applicants — rather than unread notifications, which counted applicants
  // already accepted or declined. Only queried in employer mode.
  const applicantCounts = useApplicantCounts("", undefined, profile.active_role === "employer");

  const isBrand = profile.signup_type === "brand";
  const isEmployer = profile.active_role === "employer";
  const [profileDismissed, setProfileDismissed] = useState(() =>
    isCompletionDismissed(profile.id)
  );
  const missing =
    !profileDismissed && shouldPromptCompletion(profile) ? missingProfileFields(profile) : [];

  const items: {
    icon: IconName;
    text: string;
    href: string;
    count?: number;
    strong?: boolean;
    onDismiss?: () => void;
  }[] = [];

  if (unreadMessages > 0) {
    items.push({
      icon: "chat",
      text: `${unreadMessages} unread ${unreadMessages === 1 ? "conversation" : "conversations"}`,
      href: "/dashboard/messages",
      count: unreadMessages,
      strong: true,
    });
  }
  const waiting = applicantCounts?.pending ?? 0;
  if (!isBrand && isEmployer && waiting > 0) {
    items.push({
      icon: "userGroup",
      text: `${waiting} ${waiting === 1 ? "applicant" : "applicants"} waiting on a decision`,
      href: "/dashboard/applicants",
      count: waiting,
      strong: true,
    });
  }
  if (!isBrand && !isEmployer && counts.applications > 0) {
    items.push({
      icon: "briefcase",
      text: `${counts.applications} ${counts.applications === 1 ? "update" : "updates"} on your applications`,
      href: "/dashboard/applications",
      count: counts.applications,
      strong: true,
    });
  }
  if (incomingTotal > 0) {
    items.push({
      icon: "userPlus",
      text: `${incomingTotal} connection ${incomingTotal === 1 ? "request" : "requests"}`,
      href: "/dashboard/marketplace",
      count: incomingTotal,
    });
  }
  if (!isBrand && counts.requests > 0) {
    items.push({
      icon: "inbox",
      text: `${counts.requests} ${counts.requests === 1 ? "request" : "requests"} waiting on review`,
      href: "/dashboard/requests",
    });
  }
  if (missing.length > 0) {
    items.push({
      icon: "pencil",
      text: `Add your ${missing.join(", ").toLowerCase()} so people can see who you are`,
      href: "/dashboard/profile",
      onDismiss: () => {
        dismissCompletion(profile.id);
        setProfileDismissed(true);
      },
    });
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">Needs your attention</h2>
      </header>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400">
          <Icon name="checkCircle" className="h-5 w-5 text-accent" />
          You are all caught up.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {items.map((item) => (
            <li key={item.href + item.text} className="flex items-center">
              <Link
                href={item.href}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition hover:bg-zinc-900"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    item.strong ? "border-accent/50 text-accent" : "border-zinc-800 text-gray-400"
                  }`}
                >
                  <Icon name={item.icon} />
                </span>
                <span className={`min-w-0 flex-1 text-sm ${item.strong ? "font-semibold text-white" : "text-gray-300"}`}>
                  {item.text}
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-600" />
              </Link>
              {item.onDismiss && (
                <button
                  type="button"
                  onClick={item.onDismiss}
                  aria-label="Dismiss"
                  title="Dismiss"
                  className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-zinc-900 hover:text-white"
                >
                  <Icon name="x" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
