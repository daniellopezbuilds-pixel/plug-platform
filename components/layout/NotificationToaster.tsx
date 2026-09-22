"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/components/ui/Toast";

/**
 * Raises a toast when a notification arrives while you are looking elsewhere.
 *
 * RENDERS NOTHING. It exists to turn the realtime stream useNotifications
 * already subscribes to into a toast, and it lives in the dashboard layout
 * beside the bell so both read the same hook and therefore the same channel —
 * a second subscription for this would double the websocket traffic to say the
 * same thing twice.
 *
 * TITLE ONLY. The notification's `message` is a sentence with the job title
 * and the applicant's name in it; the toast is a glance, not a read. Tapping
 * goes to the link, which is where the detail already is.
 *
 * NOT ON THE PAGE IT POINTS AT, which is the rule that keeps this from being
 * irritating. Somebody sitting on /dashboard/applicants when an application
 * arrives sees the list update; telling them about it in the corner as well is
 * noise about something already in front of them. Matched by prefix, because
 * a link to /dashboard/messages and a pathname of
 * /dashboard/messages?conversation=x are the same place.
 *
 * NOTHING ON FIRST LOAD. The hook fetches the last twenty on mount, and
 * without a baseline every one of them would toast at once on every page load.
 * The first render records what was already there and announces none of it;
 * only ids that appear AFTER that are new.
 */
export function NotificationToaster() {
  const { notifications } = useNotifications();
  const toast = useToast();
  const pathname = usePathname();

  /** Ids already accounted for. Null until the first batch has landed. */
  const seenRef = useRef<Set<string> | null>(null);

  /**
   * Read inside the effect rather than listed as a dependency. The effect must
   * run when NOTIFICATIONS change, not when the user navigates — depending on
   * pathname would re-run it on every route change and re-toast whatever the
   * newest notification happened to be.
   */
  const pathnameRef = useRef(pathname);

  // In an effect, not in the render body: writing a ref during render is what
  // react-hooks/refs forbids, and this one only has to be current by the time
  // the effect below runs — which is after this one, on the same commit.
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (notifications.length === 0) return;

    // First batch: remember it, announce none of it.
    if (seenRef.current === null) {
      seenRef.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const seen = seenRef.current;
    const here = pathnameRef.current;

    // Oldest first, so two arriving together stack in the order they happened.
    const arrived = notifications.filter((n) => !seen.has(n.id)).reverse();

    for (const n of arrived) {
      seen.add(n.id);

      // Already read means it was opened somewhere else — another tab, or the
      // bell — between arriving and this running. Announcing it would be
      // telling somebody about something they have just dealt with.
      if (n.read) continue;

      const target = n.link?.split("?")[0] ?? null;
      const onThatPage =
        !!target && (here === target || here.startsWith(`${target}/`));

      if (onThatPage) continue;

      toast.notify(n.title, n.link);
    }
  }, [notifications, toast]);

  return null;
}
