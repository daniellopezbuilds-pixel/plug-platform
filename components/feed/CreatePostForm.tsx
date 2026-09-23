"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { FIELD_CONTROL } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { useDashboardProfile } from "@/components/layout/DashboardProfile";

/**
 * The composer.
 *
 * ONE LINE UNTIL YOU USE IT. It used to be a type toggle, a 96px textarea and
 * a Post button, permanently open — a quarter of the screen spent on a box
 * most visits never type in, pushing the posts people came to read below the
 * fold. Collapsed it is an avatar and a prompt; tapping it opens the full
 * form with focus already in the textarea.
 *
 * IT CLOSES WHEN IT IS EMPTY AND YOU LEAVE IT — a click elsewhere, Escape, or
 * Cancel — and never when there is text in it. Collapsing a half-written post
 * would hide it, and hidden text is text people lose. After a successful post
 * it resets and closes.
 *
 * The "Job" shortcut on the collapsed row opens straight into a job post, so
 * the choice that used to be the first thing on the form is still one tap.
 */
export function CreatePostForm({
  onCreate,
}: {
  onCreate: (input: {
    post_type: "status" | "job";
    content: string;
    job_title?: string;
    job_location?: string;
  }) => Promise<{ error: string | null }>;
}) {
  const toast = useToast();
  const profile = useDashboardProfile();
  const [expanded, setExpanded] = useState(false);
  const [postType, setPostType] = useState<"status" | "job">("status");
  const [content, setContent] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const jobTitleRef = useRef<HTMLInputElement>(null);

  const isEmpty = !content.trim() && !jobTitle.trim() && !jobLocation.trim();

  function reset() {
    setContent("");
    setJobTitle("");
    setJobLocation("");
    setPostType("status");
    setExpanded(false);
  }

  function open(type: "status" | "job") {
    setPostType(type);
    setExpanded(true);
  }

  // Focus follows opening, after the fields exist. A job post starts on its
  // title, since that is the field it cannot be posted without.
  useEffect(() => {
    if (!expanded) return;
    (postType === "job" ? jobTitleRef.current : textareaRef.current)?.focus();
    // Only on open, not on every type switch — switching type with the mouse
    // should not yank focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      if (isEmpty && !submitting) setExpanded(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isEmpty && !submitting) setExpanded(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, isEmpty, submitting]);

  async function handleSubmit() {
    if (!content.trim()) {
      toast.error("Post content is required.");
      return;
    }

    if (postType === "job" && !jobTitle.trim()) {
      toast.error("Job title is required for a job post.");
      return;
    }

    setSubmitting(true);

    const { error } = await onCreate({
      post_type: postType,
      content,
      job_title: jobTitle,
      job_location: jobLocation,
    });

    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    reset();
  }

  const name = profile?.full_name ?? null;

  if (!expanded) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <Avatar name={name} photoPath={profile?.company_logo_path} />
        <button
          type="button"
          onClick={() => open("status")}
          className="min-h-11 min-w-0 flex-1 truncate rounded-full border border-zinc-700 bg-zinc-900 px-4 text-left text-base text-gray-500 transition hover:border-zinc-600 hover:text-gray-400"
        >
          Share an update…
        </button>
        <button
          type="button"
          onClick={() => open("job")}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-gray-300 transition hover:bg-zinc-900 hover:text-white"
        >
          <Icon name="briefcase" className="h-5 w-5 text-accent" />
          <span className="hidden sm:inline">Job</span>
          <span className="sr-only sm:hidden">Post a job opportunity</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={name} photoPath={profile?.company_logo_path} />
        {/* Real radios: one tab stop, arrow keys between them. */}
        <div role="radiogroup" aria-label="Post type" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
          {(
            [
              ["status", "Update"],
              ["job", "Job opportunity"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`inline-flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                postType === value ? "bg-zinc-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <input
                type="radio"
                name="post-type"
                value={value}
                checked={postType === value}
                onChange={() => setPostType(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {postType === "job" && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            ref={jobTitleRef}
            type="text"
            placeholder="Job title"
            aria-label="Job title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className={FIELD_CONTROL}
          />
          <input
            type="text"
            placeholder="Location (optional)"
            aria-label="Location (optional)"
            value={jobLocation}
            onChange={(e) => setJobLocation(e.target.value)}
            className={FIELD_CONTROL}
          />
        </div>
      )}

      <textarea
        ref={textareaRef}
        aria-label={postType === "job" ? "Describe the job opportunity" : "Your update"}
        placeholder={
          postType === "job"
            ? "Describe the job opportunity…"
            : "Share an update with the community…"
        }
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className={`${FIELD_CONTROL} resize-y leading-relaxed`}
      />

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={submitting}
          className="min-h-11 rounded-lg px-4 text-sm font-semibold text-gray-400 transition hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          <ButtonSpinner active={submitting} />
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
