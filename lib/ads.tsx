import { supabase } from "@/lib/supabase";

// ---- Ad image spec ----
export const AD_ASPECT_RATIO = 4; // 4:1 (width ÷ height)
export const AD_ASPECT_TOLERANCE = 0.02; // ±2%
export const AD_MIN_WIDTH = 1200;
export const AD_MIN_HEIGHT = 300;
export const AD_MAX_BYTES = 2 * 1024 * 1024; // 2MB
export const AD_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const AD_SPEC_TEXT =
  "Required: 4:1 ratio (e.g. 1200×300px). PNG, JPG or WebP. Max 2MB.";

function extensionFromFile(file: File) {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop() : "png";
}

function readImageDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

export async function validateAdImage(
  file: File
): Promise<{ error: string | null; width?: number; height?: number }> {
  if (!AD_ALLOWED_TYPES.includes(file.type)) {
    return { error: "Image must be a PNG, JPG or WebP file." };
  }

  if (file.size > AD_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { error: `Image must be under 2MB. Yours is ${mb}MB.` };
  }

  const dims = await readImageDimensions(file);

  if (!dims) {
    return { error: "Could not read that image. Try a different file." };
  }

  const { width, height } = dims;

  if (width < AD_MIN_WIDTH || height < AD_MIN_HEIGHT) {
    return {
      error: `Image is too small (${width}×${height}px). Minimum is ${AD_MIN_WIDTH}×${AD_MIN_HEIGHT}px.`,
      width,
      height,
    };
  }

  const ratio = width / height;
  const minRatio = AD_ASPECT_RATIO * (1 - AD_ASPECT_TOLERANCE);
  const maxRatio = AD_ASPECT_RATIO * (1 + AD_ASPECT_TOLERANCE);

  if (ratio < minRatio || ratio > maxRatio) {
    const suggestedHeight = Math.round(width / AD_ASPECT_RATIO);
    return {
      error: `Image must be 4:1 ratio. Yours is ${width}×${height}px (${ratio.toFixed(
        2
      )}:1). Try ${width}×${suggestedHeight}px.`,
      width,
      height,
    };
  }

  return { error: null, width, height };
}

export async function uploadAdImage(file: File) {
  // Enforced here too, so no off-spec image can reach storage
  // even from a form that hasn't been updated.
  const { error: validationError } = await validateAdImage(file);

  if (validationError) return { error: validationError, path: null };

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