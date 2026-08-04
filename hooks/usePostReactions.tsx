"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ReactionType = "like" | "celebrate" | "support" | "insightful";

export type Reactor = {
  id: string;
  full_name: string | null;
  reaction_type: ReactionType;
};

export type PostReactionSummary = {
  counts: Record<ReactionType, number>;
  total: number;
  userReaction: ReactionType | null;
  reactors: Reactor[];
};

export function usePostReactions(postIds: string[]) {
  const [summaries, setSummaries] = useState<Record<string, PostReactionSummary>>({});
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (postIds.length === 0) {
      setSummaries({});
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUserId(user?.id || null);

    const { data, error } = await supabase
      .from("post_reactions")
      .select("post_id, user_id, reaction_type, profiles(id, full_name)")
      .in("post_id", postIds);

    if (error || !data) {
      setSummaries({});
      return;
    }

    const grouped: Record<string, PostReactionSummary> = {};

    postIds.forEach((id) => {
      grouped[id] = {
        counts: { like: 0, celebrate: 0, support: 0, insightful: 0 },
        total: 0,
        userReaction: null,
        reactors: [],
      };
    });

    data.forEach((reaction: any) => {
      const summary = grouped[reaction.post_id];
      if (!summary) return;

      summary.counts[reaction.reaction_type as ReactionType] += 1;
      summary.total += 1;

      summary.reactors.push({
        id: reaction.profiles?.id || reaction.user_id,
        full_name: reaction.profiles?.full_name || null,
        reaction_type: reaction.reaction_type,
      });

      if (user && reaction.user_id === user.id) {
        summary.userReaction = reaction.reaction_type as ReactionType;
      }
    });

    setSummaries(grouped);
  }, [postIds.join(",")]);

  useEffect(() => {
    load();
  }, [load]);

  async function react(postId: string, reactionType: ReactionType) {
    if (!userId) {
      alert("You must be logged in to react.");
      return;
    }

    const current = summaries[postId]?.userReaction;

    if (current === reactionType) {
      const { error } = await supabase
        .from("post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);

      if (error) {
        alert(error.message);
        return;
      }
    } else if (current) {
      const { error } = await supabase
        .from("post_reactions")
        .update({ reaction_type: reactionType })
        .eq("post_id", postId)
        .eq("user_id", userId);

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("post_reactions").insert({
        post_id: postId,
        user_id: userId,
        reaction_type: reactionType,
      });

      if (error) {
        alert(error.message);
        return;
      }
    }

    await load();
  }

  return { summaries, react };
}