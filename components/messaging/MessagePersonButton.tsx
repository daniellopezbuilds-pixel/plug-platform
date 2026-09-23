"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { openDirectConversation } from "@/lib/conversations";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

/**
 * Message a person directly — the counterpart of MessageAboutJobButton for
 * places that show a person rather than an application, like a connection's
 * card in My Local Network. Opens (or creates) the one-to-one thread and
 * deep-links into it.
 */
export function MessagePersonButton({
  otherUserId,
  className = "",
  label = "Message",
}: {
  otherUserId: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [opening, setOpening] = useState(false);

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

    const { conversationId, error } = await openDirectConversation({
      userId: user.id,
      otherUserId,
    });

    setOpening(false);

    if (error || !conversationId) {
      toast.error(error ?? "Could not open the conversation.");
      return;
    }

    router.push(`/dashboard/messages?conversation=${conversationId}`);
  }

  return (
    <button type="button" onClick={handleClick} disabled={opening} className={className}>
      {opening ? <ButtonSpinner active /> : <Icon name="chat" />}
      {opening ? "Opening..." : label}
    </button>
  );
}
