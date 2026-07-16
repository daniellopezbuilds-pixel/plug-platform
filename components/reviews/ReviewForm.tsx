"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useSubmitReview } from "@/hooks/useSubmitReview";

export function ReviewForm({
  applicationId,
  revieweeId,
  onSubmitted,
}: {
  applicationId: string;
  revieweeId: string;
  onSubmitted: () => void;
}) {
  const { submitReview, submitting } = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  async function handleSubmit() {
    if (rating === 0) {
      alert("Please select a star rating.");
      return;
    }

    const { error } = await submitReview(applicationId, revieweeId, rating, comment);

    if (error) {
      alert(error);
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
            <span className={(hoverRating || rating) >= star ? "text-yellow-400" : "text-zinc-600"}>
              ★
            </span>
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment..."
        className="w-full p-3 rounded bg-zinc-900 border border-zinc-700 text-white text-sm h-20 mb-3"
      />
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-white text-black px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </Card>
  );
}