import { Card } from "@/components/ui/Card";
import { NameMeta } from "@/components/ui/NameMeta";
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
              <NameMeta
                profileId={review.reviewer?.id}
                signupType={review.reviewer?.signup_type}
              />
            </p>
            <span className="text-white text-sm">
              {"★".repeat(review.rating)}
              <span className="text-gray-700">{"★".repeat(5 - review.rating)}</span>
            </span>
          </div>
          {review.comment && <p className="text-gray-300 text-sm">{review.comment}</p>}
          <p className="text-gray-400 text-xs mt-2">
            {new Date(review.created_at).toLocaleDateString()}
          </p>
        </Card>
      ))}
    </div>
  );
}