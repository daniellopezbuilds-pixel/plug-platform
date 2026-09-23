"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
import type { IncomingRequest } from "@/hooks/useConnections";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/**
 * People who have asked to connect with you.
 *
 * A PANEL BESIDE THE DIRECTORY, not a section above it. As a full-width
 * section it pushed the people you came to browse below the fold for as long
 * as anyone had a request pending. LinkedIn's My Network keeps invitations
 * beside the grid for the same reason.
 *
 * THEME COLOURS. Accept and Reject were solid green and solid red, the only
 * such buttons in the product. Accept is now the orange primary; Decline is a
 * quiet icon button, because turning someone down should not be the loudest
 * thing on the page.
 */
export function ConnectionRequestsPanel({
  requests,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  actingId,
  onRespond,
}: {
  requests: IncomingRequest[];
  /** All pending requests — the header count — which may exceed the page loaded. */
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  actingId: string | null;
  onRespond: (connectionId: string, requesterId: string, status: "accepted" | "rejected") => void;
}) {
  const confirm = useConfirm();

  if (requests.length === 0) return null;

  async function decline(id: string, personId: string, name: string) {
    const ok = await confirm({
      title: `Decline ${name}'s request?`,
      body: "They will not be connected with you. They can send another request later.",
      confirmLabel: "Decline request",
    });
    if (ok) onRespond(id, personId, "rejected");
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">
          Connection requests
          <span className="ml-1.5 text-accent">{total}</span>
        </h2>
      </header>
      <ul className="divide-y divide-zinc-800">
        {requests.map((req) => {
          const person = req.requester;
          if (!person) return null;
          const busy = actingId === req.id;
          const name = person.full_name || "Member";

          return (
            <li key={req.id} className="flex items-center gap-3 px-4 py-2.5">
              <Link
                href={`/dashboard/profile/${person.id}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
              >
                <Avatar name={name} photoPath={person.company_logo_path} size="sm" />
                <span className="min-w-0">
                  <span className="flex items-center truncate text-sm font-semibold text-white">
                    <span className="truncate">{name}</span>
                    <VerifiedMark profileId={person.id} />
                  </span>
                  {person.trade && (
                    <span className="block truncate text-xs text-gray-400">{person.trade}</span>
                  )}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onRespond(req.id, person.id, "accepted")}
                disabled={busy}
                className="min-h-11 shrink-0 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => decline(req.id, person.id, name)}
                disabled={busy}
                aria-label={`Decline ${name}`}
                title="Decline"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-gray-400 transition hover:border-zinc-600 hover:text-white disabled:opacity-40"
              >
                <Icon name="x" />
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <div className="border-t border-zinc-800 px-2 py-1">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="min-h-11 w-full rounded-lg text-sm font-semibold text-accent-2-soft transition hover:bg-zinc-900 hover:text-white disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : `Show more (${total - requests.length})`}
          </button>
        </div>
      )}
    </section>
  );
}
