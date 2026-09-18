"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useSubmitReview } from "@/hooks/useSubmitReview";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { useToast } from "@/components/ui/Toast";

export function ReviewForm({
  applicationId,
  revieweeId,
  onSubmitted,
}: {
  applicationId: string;
  revieweeId: string;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const { submitReview, submitting } = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  async function handleSubmit() {
    if (rating === 0) {
      toast.error("Please select a star rating.");
      return;
    }

    const { error } = await submitReview(applicationId, revieweeId, rating, comment);

    if (error) {
      toast.error(error);
      return;
    }

    onSubmitted();
  }

  return (
    <Card className="mt-3 bg-zinc-800">
      <p className="text-sm font-semibold text-white mb-2">Leave a review</p>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="text-2xl leading-none"
          >
            <span className={(hoverRating || rating) >= star ? "text-white" : "text-gray-400"}>
              ★
            </span>
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment..."
        className="w-full p-3 rounded bg-zinc-900 border border-zinc-700 text-white text-base sm:text-sm h-20 mb-3"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-accent text-on-accent px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <ButtonSpinner active={submitting} />
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </Card>
  );
}