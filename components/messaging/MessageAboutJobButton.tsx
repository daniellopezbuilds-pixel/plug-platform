"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { openJobConversation } from "@/lib/conversations";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { useToast } from "@/components/ui/Toast";

/**
 * "Message" on an applicant card and on an application card.
 *
 * THE SAME BUTTON ON BOTH SIDES OF THE HIRE, which is why it is a component
 * rather than two handlers. The employer messaging an applicant and the
 * electrician messaging an employer are the same action with the ids swapped,
 * and the rule that matters — reuse the existing thread, do not open a second —
 * has to be identical from both directions or it is not a rule.
 *
 * PERMISSION IS ALREADY THERE, and this relies on it rather than re-checking.
 * `can_message(a, b)` in the baseline returns true when an application links
 * two people:
 *
 *     exists (select 1 from applications join jobs on jobs.id = job_id
 *             where (jobs.user_id = a and applications.worker_id = b) or …)
 *
 * So anyone who can see this button is already allowed to open the thread —
 * the button exists only on cards that ARE an application. No client-side gate
 * is added on top, because a client-side gate is not a gate.
 *
 * WHAT IT DOES NOT DO IS SEND ANYTHING. The unsubscribed-worker paywall
 * (`is_messaging_blocked`) refuses inserts into `messages` from a worker to an
 * employer, so an auto-sent opening message would fail for the electrician
 * exactly when they need it. The job context travels on conversations.job_id
 * and renders as a banner for both parties instead. The thread's existing
 * locked state and SubscribeButton then explain the paywall where it applies.
 */
export function MessageAboutJobButton({
  otherUserId,
  jobId,
  className = "bg-zinc-800 hover:bg-zinc-700 text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold transition inline-flex items-center justify-center gap-2 disabled:opacity-50",
  label = "Message",
}: {
  /** The other party: the applicant, or the employer who posted the job. */
  otherUserId: string | null | undefined;
  jobId: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [opening, setOpening] = useState(false);

  // Both ids come from joined rows that can be null when the other side of the
  // join has been deleted. Rendering nothing is right: there is nobody to
  // message, or no job to message about.
  if (!otherUserId || !jobId) return null;

  async function handleClick() {
    setOpening(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setOpening(false);
      toast.error("You need to be logged in to send a message.");
      return;
    }

    const { conversationId, error } = await openJobConversation({
      userId: user.id,
      otherUserId: otherUserId!,
      jobId: jobId!,
    });

    setOpening(false);

    if (error || !conversationId) {
      toast.error(error ?? "Could not open the conversation.");
      return;
    }

    // Deep link rather than local state, so the messages page opens on this
    // thread from a cold navigation.
    router.push(`/dashboard/messages?conversation=${conversationId}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={opening}
      className={className}
    >
      <ButtonSpinner active={opening} />
      {opening ? "Opening..." : label}
    </button>
  );
}
