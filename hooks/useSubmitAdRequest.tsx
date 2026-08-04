"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadAdImage } from "@/lib/ads";

export function useSubmitAdRequest() {
  const [submitting, setSubmitting] = useState(false);

  async function submit(input: {
    title: string;
    link_url: string;
    placement: "jobs_board" | "marketplace" | "feed";
    start_date: string;
    end_date: string;
    file: File;
  }) {
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      return { error: "You must be logged in to submit an ad request." };
    }

    const { error: uploadError, path } = await uploadAdImage(input.file);

    if (uploadError || !path) {
      setSubmitting(false);
      return { error: uploadError || "Image upload failed." };
    }

    const { error } = await supabase.from("sponsored_listings").insert({
      title: input.title,
      image_path: path,
      link_url: input.link_url || null,
      placement: input.placement,
      start_date: input.start_date,
      end_date: input.end_date,
      is_active: false,
      status: "pending",
      submitted_by: user.id,
    });

    setSubmitting(false);

    if (error) return { error: error.message };

    return { error: null };
  }

  return { submit, submitting };
}