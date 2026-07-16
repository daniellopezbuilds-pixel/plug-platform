export function ReviewSummary({
  averageRating,
  count,
}: {
  averageRating: number | null;
  count: number;
}) {
  if (count === 0) {
    return <span className="text-gray-500 text-sm">No reviews yet</span>;
  }

  return (
    <span className="flex items-center gap-1 text-sm">
      <span className="text-yellow-400">★</span>
      <span className="text-white font-semibold">{averageRating}</span>
      <span className="text-gray-400">({count})</span>
    </span>
  );
}