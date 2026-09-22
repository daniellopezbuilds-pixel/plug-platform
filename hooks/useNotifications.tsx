"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

/**
 * The signed-in user's notifications, shared across every consumer.
 *
 * ONE FETCH AND ONE CHANNEL FOR THE WHOLE PAGE, not one per hook call. This
 * used to hold its state inside the hook, which was fine while the bell was
 * the only caller. NotificationToaster is a second, and a per-call
 * implementation would have opened a second websocket subscription to the same
 * filtered stream and kept a second, independently-drifting copy of the list —
 * so marking something read in the bell would leave the toaster still thinking
 * it was unread.
 *
 * Same module-level pattern as hooks/useProfileBadges.tsx: state outside React,
 * a subscriber set, and a notify() that re-renders everyone. The store is
 * per-page-load, which is the right lifetime — a reload is a fresh session.
 *
 * REALTIME REQUIRES THE TABLE TO BE PUBLISHED. `notifications` was added to
 * supabase_realtime by 20260922200000; before that this subscription succeeded
 * and silently never fired, which is exactly what it looked like — a bell that
 * only updated on a page load.
 */

let notifications: Notification[] = [];
let loading = true;
let userId: string | null = null;
let started = false;

const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function setNotifications(next: Notification[]) {
  notifications = next;
  notify();
}

/** The newest twenty. See the note on the cap in useNotifications() below. */
const FETCH_LIMIT = 20;

async function start() {
  if (started) return;
  started = true;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    loading = false;
    notify();
    return;
  }

  userId = user.id;

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(FETCH_LIMIT);

  notifications = (data as Notification[]) ?? [];
  loading = false;
  notify();

  // Not held in a module variable: nothing ever tears it down (see the
  // cleanup note in useNotifications) so there is no handle anybody needs.
  supabase
    .channel(`notifications-${user.id}-${Date.now()}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        const row = payload.new as Notification;
        // Guarded: a row already held would otherwise duplicate if the same
        // event were ever delivered twice.
        if (notifications.some((n) => n.id === row.id)) return;
        setNotifications([row, ...notifications]);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        // UPDATE is subscribed so reading a notification in ANOTHER TAB clears
        // the badge in this one. Only INSERT was handled before, so the count
        // in a second tab stayed stubbornly high until a reload.
        const row = payload.new as Notification;
        setNotifications(
          notifications.map((n) => (n.id === row.id ? { ...n, ...row } : n))
        );
      }
    )
    .subscribe();
}

export function useNotifications() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const onChange = () => forceRender((n) => n + 1);
    subscribers.add(onChange);

    start();

    return () => {
      subscribers.delete(onChange);

      // The channel is deliberately NOT torn down when the last consumer
      // unmounts. Both consumers live in the dashboard layout and unmount only
      // on a full navigation away, at which point the page is going anyway;
      // closing and reopening the socket on every route change would cost more
      // than it saves and would drop notifications arriving in the gap.
    };
  }, []);

  async function markAsRead(id: string) {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
  }

  return {
    notifications,
    loading,
    /**
     * Unread among the newest twenty — NOT the true total.
     *
     * The cap is the fetch limit, so somebody with twenty-five unread sees
     * twenty. Left as it was rather than quietly changed: fixing it properly
     * means a separate head count, and a dropdown that lists twenty beside a
     * badge saying twenty-five raises a question the dropdown cannot answer.
     * Worth doing with a "see all" screen; not worth doing without one.
     */
    unreadCount: notifications.filter((n) => !n.read).length,
    markAsRead,
    markAllAsRead,
    userId,
  };
}
