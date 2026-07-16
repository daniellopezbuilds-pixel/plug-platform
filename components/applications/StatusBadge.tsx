export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-950 text-yellow-400 border-yellow-800",
    accepted: "bg-green-950 text-green-400 border-green-800",
    rejected: "bg-red-950 text-red-400 border-red-800",
  };

  const style = styles[status?.toLowerCase()] || styles.pending;

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border capitalize ${style}`}>
      {status || "Pending"}
    </span>
  );
}