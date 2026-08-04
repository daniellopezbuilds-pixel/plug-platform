import { supabase } from "@/lib/supabase";

function extensionFromFile(file: File) {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop() : "png";
}

export async function uploadAdImage(file: File) {
  const path = `ad-${Date.now()}.${extensionFromFile(file)}`;

  const { error } = await supabase.storage
    .from("sponsored-listings")
    .upload(path, file, { contentType: file.type });

  if (error) return { error: error.message, path: null };

  return { error: null, path };
}

export function getAdPublicUrl(path: string) {
  const { data } = supabase.storage.from("sponsored-listings").getPublicUrl(path);
  return data.publicUrl;
}