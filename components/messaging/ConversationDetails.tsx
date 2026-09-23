"use client";

import Link from "next/link";
import type { ParticipantInfo } from "@/hooks/useConversationParticipants";
import { StatusBadge } from "@/components/applications/StatusBadge";
import { Avatar } from "@/components/ui/Avatar";
import { EmployerVerifiedBadge } from "@/components/ui/EmployerVerifiedBadge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
import { formatPay } from "@/lib/jobs";
import { signupTypeLabel } from "@/lib/signupRoles";
import { timeAgo } from "@/lib/relativeTime";

/**
 * Who you are talking to and what it is about — the right-hand panel on a
 * wide screen, and a sheet behind the header's info button everywhere else.
 *
 * THE QUESTIONS YOU HAVE BEFORE YOU REPLY. Are they who they say (the shield,
 * verified employer, union status), are they the right trade and
 * classification, where are they — and, for a thread that came from an
 * application, which job and where that application stands. Upwork and
 * LinkedIn keep the same panel beside a conversation for the same reason:
 * a reply is written about a person and a job, not in a vacuum.
 *
 * Nothing here is new data. It is the profile and application the viewer
 * could already open elsewhere, brought to where the decision is made.
 */
export function ConversationDetails({
  info,
  title,
  viewerId,
  onDeleteConversation,
}: {
  info: ParticipantInfo | null;
  title: string;
  viewerId: string | null;
  onDeleteConversation: () => void;
}) {
  if (!info) {
    return (
      <div className="space-y-3 p-4" aria-hidden="true">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-zinc-800" />
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mx-auto h-3 w-24 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  const other = !info.is_group ? info.participants[0] ?? null : null;
  const job = info.job;
  const isEmployerSide = !!job && job.user_id === viewerId;

  return (
    <div className="divide-y divide-zinc-800">
      {other ? (
        <section className="p-4 text-center">
          <div className="flex justify-center">
            <Avatar name={title} photoPath={other.company_logo_path} size="lg" />
          </div>
          <p className="mt-3 flex items-center justify-center font-semibold text-white">
            {title}
            <VerifiedMark profileId={other.id} />
          </p>
          {signupTypeLabel(other.signup_type) && (
            <p className="text-sm text-gray-400">{signupTypeLabel(other.signup_type)}</p>
          )}

          {(other.employer_verified || other.union_status) && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <EmployerVerifiedBadge verified={!!other.employer_verified} />
              <UnionBadge status={other.union_status} verified={!!other.union_verified} />
            </div>
          )}

          <dl className="mt-4 space-y-2 text-left text-sm">
            <Fact icon="bolt" label="Trade" value={other.trade} />
            <Fact icon="academic" label="Classification" value={other.classification} />
            <Fact icon="clock" label="Experience" value={other.years_experience} />
            <Fact icon="mapPin" label="Location" value={other.location} />
          </dl>

          <Link
            href={`/dashboard/profile/${other.id}`}
            className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 text-sm font-semibold text-white transition hover:border-zinc-500"
          >
            <Icon name="user" />
            View full profile
          </Link>
        </section>
      ) : (
        <section className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {info.participants.length + 1} people
          </h3>
          <ul className="space-y-1">
            {info.participants.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/profile/${p.id}`}
                  className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 transition hover:bg-zinc-900"
                >
                  <Avatar name={p.full_name} photoPath={p.company_logo_path} size="sm" />
                  <span className="min-w-0">
                    <span className="flex items-center truncate text-sm font-semibold text-white">
                      {p.full_name || "Member"}
                      <VerifiedMark profileId={p.id} />
                    </span>
                    {p.trade && <span className="block truncate text-xs text-gray-400">{p.trade}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {job && (
        <section className="p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            About this job
          </h3>
          <p className="font-semibold text-white">{job.title}</p>
          {(job.company || job.location) && (
            <p className="text-sm text-gray-400">
              {[job.company, job.location].filter(Boolean).join(" · ")}
            </p>
          )}
          {formatPay(job) && (
            <p className="mt-1 text-sm font-semibold text-accent">{formatPay(job)}</p>
          )}

          {info.application && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <span className="text-xs text-gray-400">
                Applied {timeAgo(info.application.created_at)}
              </span>
              <StatusBadge status={info.application.status} />
            </div>
          )}

          <Link
            href={isEmployerSide ? "/dashboard/applicants" : "/dashboard/applications"}
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-2-soft transition hover:text-white"
          >
            {isEmployerSide ? "Review applicants" : "Your applications"}
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </section>
      )}

      <section className="p-4">
        <button
          type="button"
          onClick={onDeleteConversation}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-gray-400 transition hover:bg-zinc-900 hover:text-rose-400"
        >
          <Icon name="trash" />
          Delete conversation
        </button>
        <p className="mt-1 text-center text-xs text-gray-500">
          Removes it from your inbox. It comes back if they message you again.
        </p>
      </section>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <dt className="mt-0.5 shrink-0 text-gray-500">
        <Icon name={icon} />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 break-words text-gray-300">{value}</dd>
    </div>
  );
}
