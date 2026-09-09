export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-zinc-800/60 text-gray-300 border-zinc-700",
    accepted: "bg-green-950 text-green-400 border-green-800",
    rejected: "bg-rose-950 text-rose-400 border-rose-800",
  };

  const style = styles[status?.toLowerCase()] || styles.pending;

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border capitalize ${style}`}>
      {status || "Pending"}
    </span>
  );
}