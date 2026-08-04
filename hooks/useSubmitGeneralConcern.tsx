"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSubmitGeneralConcern() {
  const [submitting, setSubmitting] = useState(false);

  async function submit(input: { subject: string; message: string }) {
    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      return { error: "You must be logged in to submit a request." };
    }

    const { error } = await supabase.from("general_requests").insert({
      submitted_by: user.id,
      subject: input.subject,
      message: input.message,
    });

    setSubmitting(false);

    if (error) return { error: error.message };

    return { error: null };
  }

  return { submit, submitting };
}