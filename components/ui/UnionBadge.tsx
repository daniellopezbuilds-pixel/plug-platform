export function UnionBadge({
  status,
  verified = false,
}: {
  status: string | null;
  verified?: boolean;
}) {
  if (!status) return null;

  const isUnion = status === "union";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${
        isUnion
          ? "bg-transparent text-white border-brand"
          : "bg-zinc-800 text-gray-300 border-zinc-700"
      }`}
    >
      {isUnion ? "Union" : "Non-Union"}
      {!verified && (
        <span className="text-xs opacity-70 font-normal">(unverified)</span>
      )}
    </span>
  );
}