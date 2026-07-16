import { Card } from "@/components/ui/Card";
import type { Review } from "@/hooks/useReviews";

export function ReviewsList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="text-gray-400 text-sm">No reviews yet.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <Card key={review.id}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-white text-sm">
              {review.reviewer?.full_name || "Unknown"}
            </p>
            <span className="text-yellow-400 text-sm">
              {"★".repeat(review.rating)}
              <span className="text-zinc-700">{"★".repeat(5 - review.rating)}</span>
            </span>
          </div>
          {review.comment && <p className="text-zinc-300 text-sm">{review.comment}</p>}
          <p className="text-gray-500 text-xs mt-2">
            {new Date(review.created_at).toLocaleDateString()}
          </p>
        </Card>
      ))}
    </div>
  );
}