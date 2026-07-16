"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { full_name: string | null; profile_number: string | null } | null;
};

export function useReviews(profileId: string | null) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      setReviews([]);
      setLoading(false);
      return;
    }
    load();
  }, [profileId]);

  async function load() {
    setLoading(true);

    const { data } = await supabase
      .from("reviews")
      .select(
        `
        id,
        rating,
        comment,
        created_at,
        reviewer:profiles!reviews_reviewer_id_fkey ( full_name, profile_number )
      `
      )
      .eq("reviewee_id", profileId)
      .order("created_at", { ascending: false });

    if (data) setReviews(data as unknown as Review[]);
    setLoading(false);
  }

  const averageRating =
    reviews.length > 0
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : null;

  return { reviews, loading, averageRating, count: reviews.length, refresh: load };
}