import { supabase } from "@/lib/supabase";

/**
 * Finding and opening one-to-one conversations.
 *
 * EXTRACTED FROM useConversations so the dedupe has one definition. The
 * messages page had it as a private function inside that hook; the Message
 * buttons on the applicant and application cards need exactly the same rule,
 * and a second copy is how two surfaces come to disagree about whether a
 * thread already exists — which shows up as duplicate conversations, not as an
 * error.
 */

/**
 * The existing 1-on-1 between these two, or null.
 *
 * ONE THREAD PER PAIR, NOT PER PAIR PER JOB. Two people who talked about one
 * job and later talk about another use the same thread. That is deliberate:
 * splitting by job would leave somebody with four conversations with the same
 * electrician and no way to tell them apart in the list, and the job context
 * is carried by conversations.job_id and the banner rather than by having
 * separate threads.
 *
 * Filters in memory rather than in SQL because the question — "a non-group
 * conversation whose participant set is exactly these two" — is a property of
 * the rows as a set, and PostgREST cannot express it. The candidate list is
 * one user's own conversations, so it is small.
 */
export async function findExistingOneOnOne(
  userId: string,
  otherUserId: string
): Promise<string | null> {
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);

  const myIds = (mine ?? []).map((row) => row.conversation_id);
  if (myIds.length === 0) return null;

  const { data: candidates } = await supabase
    .from("conversations")
    .select("id, is_group, conversation_participants ( user_id )")
    .in("id", myIds)
    .eq("is_group", false);

  for (const conv of candidates ?? []) {
    const participants = (
      (conv.conversation_participants ?? []) as { user_id: string }[]
    ).map((p) => p.user_id);

    const others = participants.filter((id) => id !== userId);

    if (others.length === 1 && others[0] === otherUserId) {
      return conv.id as string;
    }
  }

  return null;
}

/**
 * Open the conversation with this person about this job, creating it if there
 * isn't one, and return its id.
 *
 * WHY job_id IS WRITTEN ON AN EXISTING THREAD TOO, not only a new one. The
 * same employer and electrician can talk about a second job months later; if
 * job_id stayed pointing at the first, the banner at the top of the thread
 * would name a job neither of them is discussing. Re-pointing it makes the
 * header true, which is the whole reason it exists.
 *
 * WHY THE JOB IS NOT SENT AS A FIRST MESSAGE. The "Participants can send
 * messages" policy ends in `NOT is_messaging_blocked(conversation_id)`, and
 * that blocks an unsubscribed worker from sending to an employer. A worker
 * clicking Message on their own application card is precisely that case, so an
 * auto-posted opening message would be refused and the thread would open with
 * no context at all. The banner reads from job_id and works for both sides
 * regardless of the paywall.
 */
export async function openJobConversation(options: {
  userId: string;
  otherUserId: string;
  jobId: string;
}): Promise<{ conversationId: string | null; error: string | null }> {
  const { userId, otherUserId, jobId } = options;

  const existingId = await findExistingOneOnOne(userId, otherUserId);

  if (existingId) {
    // Best effort. A thread that opens with a stale banner is worth far more
    // than one that refuses to open because a header could not be updated, so
    // a failure here is not surfaced.
    await supabase
      .from("conversations")
      .update({ job_id: jobId })
      .eq("id", existingId);

    return { conversationId: existingId, error: null };
  }

  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert([{ created_by: userId, is_group: false, job_id: jobId }])
    .select("id")
    .single();

  if (convError || !conv) {
    return {
      conversationId: null,
      error: convError?.message ?? "Could not start the conversation.",
    };
  }

  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert([
      { conversation_id: conv.id, user_id: userId },
      { conversation_id: conv.id, user_id: otherUserId },
    ]);

  if (participantsError) {
    return { conversationId: null, error: participantsError.message };
  }

  return { conversationId: conv.id as string, error: null };
}
