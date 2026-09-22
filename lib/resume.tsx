import { supabase } from "@/lib/supabase";

/**
 * Resume upload and access.
 *
 * WHO CAN READ ONE is not decided here. It is the "Eligible users can view
 * resumes" policy on storage.objects, which since 20260922190000 allows the
 * owner and an employer who received an application from them — and nobody
 * else. It used to also allow anyone with an accepted connection, which is a
 * directory handshake rather than consent to hand over an address and a work
 * history. createSignedUrl below runs as the caller, so that policy is what
 * actually answers; this file cannot widen it and must not look like it can.
 */

/** PDF and Word. The three MIME types browsers actually send for these. */
const ACCEPTED = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
} as const;

/** For an <input accept="..."> — extensions too, because Windows sends
 *  application/octet-stream for .docx often enough to matter. */
export const RESUME_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * 5MB.
 *
 * ENFORCED HERE BECAUSE THE BUCKET DOES NOT. The `resumes` bucket has
 * file_size_limit null and allowed_mime_types null — it accepts anything, at
 * any size, and bucket config is dashboard state that no migration carries
 * (see supabase/README.md). A check in the client is not a security control,
 * but it is the difference between "that file is too big" and a slow upload
 * that fails on the platform's own limit with an opaque message.
 *
 * Worth setting on the bucket too; this does not replace that.
 */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

export type ResumeKind = (typeof ACCEPTED)[keyof typeof ACCEPTED];

/**
 * The extension we will store this file as, or null if we will not take it.
 *
 * Falls back to the filename when the browser sends no useful type — Windows
 * reports .docx as application/octet-stream often enough that rejecting on
 * MIME alone turns away real resumes.
 */
export function resumeKind(file: File): ResumeKind | null {
  const byMime = ACCEPTED[file.type as keyof typeof ACCEPTED];
  if (byMime) return byMime;

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf" || ext === "doc" || ext === "docx") return ext;

  return null;
}

/** The message to show when resumeKind() returns null or the file is too big. */
export function validateResume(file: File): string | null {
  if (!resumeKind(file)) {
    return "Resumes must be a PDF or a Word document (.pdf, .doc or .docx).";
  }

  if (file.size > RESUME_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That file is ${mb}MB. Resumes must be under 5MB.`;
  }

  return null;
}

/**
 * Upload, replacing whatever was there.
 *
 * REPLACEMENT IS A DELETE, NOT JUST AN UPSERT, and that is the whole reason
 * this is more than three lines. The path carries the extension, so a PDF
 * uploaded over a DOCX lands at a DIFFERENT key — upsert alone would leave the
 * old file sitting in the bucket for ever, readable by anyone the policy
 * allows, with nothing in profiles pointing at it to find it by. The previous
 * version hardcoded `resume.pdf` and so never hit this; accepting Word is what
 * introduces it.
 *
 * The remove runs before the upload rather than after: a failed upload that
 * has already deleted the old resume is recoverable by uploading again, while
 * an orphan nobody can see is not recoverable at all.
 */
export async function uploadResume(userId: string, file: File) {
  const invalid = validateResume(file);
  if (invalid) return { error: invalid, path: null };

  const kind = resumeKind(file)!;
  const path = `${userId}/resume.${kind}`;

  // Every shape the previous or current code could have written. Listing the
  // folder would be one more round trip for a set this small and known.
  const stale = (["pdf", "doc", "docx"] as const)
    .filter((ext) => ext !== kind)
    .map((ext) => `${userId}/resume.${ext}`);

  // Best effort. remove() on a key that is not there is not an error, and a
  // failure to tidy must not stop somebody replacing their resume.
  await supabase.storage.from("resumes").remove(stale);

  const { error } = await supabase.storage
    .from("resumes")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (error) return { error: error.message, path: null };

  return { error: null, path };
}

export async function getResumeSignedUrl(resumePath: string) {
  const { data, error } = await supabase.storage
    .from("resumes")
    .createSignedUrl(resumePath, 60);

  if (error || !data) {
    return {
      error: error?.message || "Could not open resume.",
      url: null,
    };
  }

  return { error: null, url: data.signedUrl };
}
