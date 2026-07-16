import { supabase } from "@/lib/supabase";

function extensionFromFile(file: File) {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop() : "pdf";
}

export async function uploadEmployerDocument(userId: string, file: File) {
  const path = `${userId}/document-${Date.now()}.${extensionFromFile(file)}`;

  const { error: uploadError } = await supabase.storage
    .from("employer-documents")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message, path: null };

  const { error: dbError } = await supabase.from("employer_documents").insert({
    user_id: userId,
    label: file.name,
    file_path: path,
  });

  if (dbError) return { error: dbError.message, path: null };

  return { error: null, path };
}

export async function getEmployerDocumentSignedUrl(path: string) {
  const { data, error } = await supabase.storage
    .from("employer-documents")
    .createSignedUrl(path, 60 * 5);

  if (error || !data) return { error: error?.message || "Could not generate link.", url: null };

  return { error: null, url: data.signedUrl };
}