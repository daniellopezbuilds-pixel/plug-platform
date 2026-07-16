import { supabase } from "@/lib/supabase";

function extensionFromFile(file: File) {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop() : "png";
}

export async function uploadLogo(userId: string, file: File) {
  const path = `${userId}/logo-${Date.now()}.${extensionFromFile(file)}`;

  const { error } = await supabase.storage
    .from("branding")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return { error: error.message, url: null };

  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return { error: null, url: data.publicUrl, path };
}

export async function uploadBanner(userId: string, file: File) {
  const path = `${userId}/banner-${Date.now()}.${extensionFromFile(file)}`;

  const { error } = await supabase.storage
    .from("branding")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) return { error: error.message, url: null };

  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return { error: null, url: data.publicUrl, path };
}

export function getBrandingPublicUrl(path: string) {
  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return data.publicUrl;
}