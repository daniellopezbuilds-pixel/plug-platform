"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SkeletonBlock } from "@/components/ui/Skeleton";

/**
 * The frame for one panel in a side rail: a titled card with an optional
 * "see all" link, so every rail on every page reads as the same kind of
 * thing. See components/layout/RailColumns.tsx for the rails themselves.
 */
export function RailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-semibold text-accent-2-soft transition hover:text-white"
          >
            {action.label}
            <Icon name="chevronRight" className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/** Rows of grey bars while a card's query is in flight. */
export function RailSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="space-y-3 px-4 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1">
            <SkeletonBlock className="mb-1.5 h-3 w-3/4" />
            <SkeletonBlock className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
