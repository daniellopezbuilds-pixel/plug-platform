"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Mark the signed-in user's unread notifications of these types as read, once,
 * when the page that shows their subject is opened.
 *
 * WHY. The sidebar's Applicants and Applications badges count UNREAD
 * notifications (new_applicant, status_change), and nothing ever marked them
 * read except clicking each one in the bell. So an employer who had reviewed
 * every applicant still saw "7" on Applicants beside a New tab reading 2, and
 * the dashboard said "7 new applicants to review". Opening the page is reading
 * them — the same rule the Messages badge follows when a thread is opened.
 *
 * The bell and the sidebar both hear this through realtime (both subscribe to
 * UPDATE on their own notifications) and drop their counts without a reload.
 * RLS already lets a user update their own notifications; the bell does.
 */
export function useMarkNotificationsRead(types: readonly string[]) {
  const key = types.join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .in("type", key.split(","));
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);
}
