"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { RailCard, RailSkeleton } from "@/components/layout/RailCard";
import { useDashboardProfile } from "@/components/layout/DashboardProfile";
import { useRecentJobs } from "@/hooks/useRecentJobs";
import { useConnections } from "@/hooks/useConnections";
import { useSuggestedPeople } from "@/hooks/useSuggestedPeople";
import { formatPay } from "@/lib/jobs";
import { timeAgo } from "@/lib/relativeTime";
import {
  missingProfileFields,
  profileCompletionPercentage,
  shouldPromptCompletion,
} from "@/lib/profileCompletion";

/**
 * The cards that sit beside the feed.
 *
 * WHY THE RAIL HAS THESE AND NOT JUST THE AD. The rail used to be the
 * sponsored slot alone — one 80px-tall card at the top of a 320px column that
 * was otherwise empty for the whole height of the page. Either the column
 * earns its width or it goes. These three are the things someone reading the
 * feed is most likely to want next: their own profile (and what it is
 * missing), work that was just posted, and people to connect with.
 *
 * Each is a small, fixed-height summary with one link out to the page that
 * does the full job. None of them is a second copy of that page.
 */

/**
 * Who you are, and what your profile is still missing.
 *
 * The completion nudge lives here rather than as a banner over the feed: it
 * is always visible, never in the way, and does not need a dismiss button
 * because it takes no space from anything.
 */
export function ProfileSummaryCard() {
  const profile = useDashboardProfile();
  if (!profile) return null;

  const isBrand = profile.signup_type === "brand";
  const name = (isBrand ? profile.brand_name : null) || profile.full_name || "Your profile";
  const prompt = shouldPromptCompletion(profile);
  const missing = prompt ? missingProfileFields(profile) : [];
  const percent = prompt ? profileCompletionPercentage(profile) : 100;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} photoPath={profile.company_logo_path} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{name}</p>
          {profile.trade && (
            <p className="truncate text-sm text-gray-400">{profile.trade}</p>
          )}
          {profile.profile_number && (
            <p className="font-technical text-xs text-gray-500">
              {profile.profile_number}
            </p>
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-gray-400">Profile {percent}% complete</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completion"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Missing: {missing.join(", ").toLowerCase()}
          </p>
        </div>
      )}

      <Link
        href="/dashboard/profile"
        className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
          missing.length > 0
            ? "bg-accent text-on-accent hover:bg-accent-hover"
            : "border border-zinc-700 text-white hover:border-zinc-500"
        }`}
      >
        <Icon name={missing.length > 0 ? "pencil" : "user"} />
        {missing.length > 0 ? "Finish your profile" : "View profile"}
      </Link>
    </section>
  );
}

export function RecentJobsCard() {
  const { jobs, loading } = useRecentJobs(4);

  return (
    <RailCard title="New jobs" action={{ href: "/dashboard/jobs", label: "All jobs" }}>
      {loading ? (
        <RailSkeleton rows={3} />
      ) : jobs.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">No open jobs right now.</p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {jobs.map((job) => {
            const pay = formatPay(job);
            const meta = [job.company, job.location].filter(Boolean).join(" · ");
            return (
              <li key={job.id}>
                <Link
                  href={`/dashboard/jobs?job=${job.id}`}
                  className="block px-4 py-2.5 transition hover:bg-zinc-900"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-white">
                      {job.title}
                    </p>
                    <span className="shrink-0 text-xs text-gray-500">
                      {timeAgo(job.created_at)}
                    </span>
                  </div>
                  {meta && <p className="truncate text-xs text-gray-400">{meta}</p>}
                  {pay && <p className="mt-0.5 text-xs font-semibold text-accent">{pay}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}

export function NewMembersCard({
  onViewProfile,
}: {
  onViewProfile: (userId: string) => void;
}) {
  const toast = useToast();
  const profile = useDashboardProfile();
  const { connectionMap, loading: connectionsLoading, actingId, sendRequest } =
    useConnections();
  const { people, loading } = useSuggestedPeople(
    profile?.id ?? null,
    connectionMap,
    !connectionsLoading
  );

  async function connect(id: string) {
    const { error } = await sendRequest(id);
    if (error) toast.error(error);
  }

  // Nothing to suggest is not worth a card saying so.
  if (!loading && people.length === 0) return null;

  return (
    <RailCard
      title="New on Sparx Plug"
      action={{ href: "/dashboard/marketplace", label: "Network" }}
    >
      {loading ? (
        <RailSkeleton rows={4} />
      ) : (
        <ul className="divide-y divide-zinc-800">
          {people.map((person) => {
            const requested = connectionMap.has(person.id);
            const meta = [person.trade, person.location].filter(Boolean).join(" · ");
            const name = person.full_name || "Member";
            return (
              <li key={person.id} className="flex items-center gap-3 px-4 py-2">
                <button
                  type="button"
                  onClick={() => onViewProfile(person.id)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar name={name} photoPath={person.company_logo_path} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white hover:underline">
                      {name}
                    </span>
                    {meta && (
                      <span className="block truncate text-xs text-gray-400">{meta}</span>
                    )}
                  </span>
                </button>
                {requested ? (
                  <span className="shrink-0 text-xs text-gray-500">Requested</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => connect(person.id)}
                    disabled={actingId === person.id}
                    aria-label={`Connect with ${name}`}
                    title="Connect"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-gray-300 transition hover:border-accent hover:text-white disabled:opacity-50"
                  >
                    <Icon name="userPlus" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </RailCard>
  );
}
