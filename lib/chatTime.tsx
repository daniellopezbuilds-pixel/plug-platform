/**
 * Timestamps for messaging, in the shapes chat apps have taught everyone to
 * read.
 *
 *   inbox row     "3:42 PM" today, "Mon" this week, "12 Sep" this year,
 *                 "12 Sep 2025" before that — always short enough for the
 *                 corner of a row
 *   day divider   "Today", "Yesterday", "Monday 15 September"
 *   bubble        "3:42 PM"
 *
 * Local time throughout: a timestamp in a conversation is read as "when did
 * they say this", which is a question about the reader's clock.
 */

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

const DAY = 24 * 60 * 60 * 1000;

export function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function inboxTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY);

  if (daysAgo <= 0) return messageTime(iso);
  if (daysAgo < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY);

  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Same calendar day, local time. */
export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}
