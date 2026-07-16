"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSubmitReview() {
  const [submitting, setSubmitting] = useState(false);

  async function submitReview(
    applicationId: string,
    revieweeId: string,
    rating: number,
    comment: string
  ) {
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      return { error: "Not logged in." };
    }

    const { error } = await supabase.from("reviews").insert([
      {
        application_id: applicationId,
        reviewer_id: user.id,
        reviewee_id: revieweeId,
        rating,
        comment: comment.trim() || null,
      },
    ]);

    setSubmitting(false);

    if (error) {
      if (error.code === "23505") return { error: "You already reviewed this." };
      return { error: error.message };
    }

    return { error: null };
  }

  return { submitReview, submitting };
}