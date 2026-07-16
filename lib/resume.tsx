import { supabase } from "@/lib/supabase";

export async function uploadResume(userId: string, file: File) {
  const path = `${userId}/resume.pdf`;

  const { error } = await supabase.storage
    .from("resumes")
    .upload(path, file, { upsert: true, contentType: "application/pdf" });

  if (error) return { error: error.message, path: null };

  return { error: null, path };
}

export async function getResumeSignedUrl(resumePath: string) {
  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(resumePath, 60);

  if (error || !data) return { error: error?.message || "Could not open resume.", url: null };

  return { error: null, url: data.signedUrl };
}